/**
 * Modo "extra" por preferencias: genera un entrenamiento de día único con los
 * ejercicios que el usuario marcó como "me gusta" (modo 'liked') o con los que
 * marcó "no me gusta"/"difícil" (modo 'disliked' — para trabajar lo que evita).
 *
 * Fuente: último feedback por ejercicio en app.methodology_exercise_feedback
 * (el pulgar del reproductor), cruzado con el catálogo app.ejercicios para
 * recuperar prescripción, GIF y consejos. Persiste con la misma
 * persistSingleDaySession que el resto de single-day.
 */

import { persistSingleDaySession } from './persistSingleDaySession.js';
import { logger } from '../hipertrofiaV2/logger.js';

const LEVEL_HIERARCHY = ['Principiante', 'Intermedio', 'Avanzado'];
const NIVEL_NORMALIZED = { Principiante: 'basico', Intermedio: 'intermedio', Avanzado: 'avanzado' };
const DEFAULT_REST_SECONDS = 75;
const MAX_EXERCISES = 7;
const MIN_EXERCISES = 3;

function normalizeLevel(rawLevel) {
  const lvl = String(rawLevel || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (lvl.includes('avanz')) return 'Avanzado';
  if (lvl.includes('inter')) return 'Intermedio';
  return 'Principiante';
}

function parseSeriesReps(raw) {
  const value = String(raw || '').trim();
  const fallback = { series: 3, reps_objetivo: '8-12', series_reps_objetivo: value || '3x8-12' };
  if (!value) return fallback;
  const idx = value.toLowerCase().indexOf('x');
  const seriesPart = idx === -1 ? '3' : value.slice(0, idx).trim();
  const repsPart = idx === -1 ? value : value.slice(idx + 1).trim();
  const seriesNum = parseInt(seriesPart, 10);
  return {
    series: Number.isFinite(seriesNum) && seriesNum > 0 ? seriesNum : 3,
    reps_objetivo: repsPart || '8-12',
    series_reps_objetivo: value
  };
}

function toPlanExercise(row, orden, sentiment) {
  const { series, reps_objetivo, series_reps_objetivo } = parseSeriesReps(row.series_reps_objetivo);
  const tag = sentiment === 'like' ? '💚 Te gusta' : sentiment === 'hard' ? '🔥 Te cuesta' : '🎯 A dominar';
  return {
    orden,
    id: row.exercise_id,
    exercise_id: row.exercise_id,
    nombre: row.nombre,
    categoria: row.categoria,
    tipo_ejercicio: row.disciplina || 'preferencia',
    patron: row.patron || null,
    patron_movimiento: row.patron_movimiento || row.patron || null,
    series,
    reps_objetivo,
    series_reps_objetivo,
    rir_target: '2-3',
    descanso_seg: row.descanso_seg ?? DEFAULT_REST_SECONDS,
    tempo: row.tempo || null,
    criterio_de_progreso: row.criterio_de_progreso || null,
    como_hacerlo: row.como_hacerlo || null,
    consejos: row.consejos || null,
    gif_url: row.gif_url || null,
    notas: [tag, row.consejos].filter(Boolean).join(' · ')
  };
}

/**
 * @param {'liked'|'disliked'} mode
 * @param {string|null} methodology - disciplina preferida para desempatar catálogo
 */
export async function generatePreferenceSingleDay(dbClient, userId, rawNivel, mode = 'liked', methodology = null, isWeekendExtra = true) {
  const nivel = normalizeLevel(rawNivel);
  const sentiments = mode === 'disliked' ? ['dislike', 'hard'] : ['like'];

  logger.info(`💚 [PREFERENCE-SINGLE-DAY] Generando (${mode}) para usuario ${userId}, nivel ${nivel}`);

  // Último feedback por ejercicio del usuario, filtrado por sentimiento
  const prefQ = await dbClient.query(
    `SELECT exercise_name, sentiment FROM (
       SELECT DISTINCT ON (exercise_name)
         exercise_name, sentiment
       FROM app.methodology_exercise_feedback
       WHERE user_id = $1 AND exercise_name IS NOT NULL
       ORDER BY exercise_name, COALESCE(updated_at, created_at) DESC
     ) latest
     WHERE sentiment = ANY($2)
     ORDER BY RANDOM()
     LIMIT ${MAX_EXERCISES * 2}`,
    [userId, sentiments]
  );

  if (prefQ.rowCount < MIN_EXERCISES) {
    const label = mode === 'disliked' ? 'que no te gustan o te cuestan' : 'que te gustan';
    const err = new Error(`Aún no has valorado suficientes ejercicios ${label} (mínimo ${MIN_EXERCISES}). Usa el pulgar del reproductor para valorar ejercicios.`);
    err.code = 'INSUFFICIENT_PREFERENCES';
    throw err;
  }

  const sentimentByName = Object.fromEntries(prefQ.rows.map(r => [r.exercise_name, r.sentiment]));
  const names = prefQ.rows.map(r => r.exercise_name);

  // Cruce con catálogo: prioriza la disciplina de la metodología activa si se indica
  const catQ = await dbClient.query(
    `SELECT DISTINCT ON (nombre)
       source_exercise_id AS exercise_id, nombre, nivel, categoria, disciplina,
       patron, patron_movimiento, series_reps_objetivo, descanso_seg, tempo,
       criterio_de_progreso, como_hacerlo, consejos, gif_url
     FROM app.ejercicios
     WHERE nombre = ANY($1)
     ORDER BY nombre, (disciplina = $2) DESC`,
    [names, String(methodology || '').toLowerCase()]
  );

  // Los ejercicios valorados que no estén en catálogo se sirven "a pelo"
  const catalogByName = Object.fromEntries(catQ.rows.map(r => [r.nombre, r]));
  const chosen = names.slice(0, MAX_EXERCISES).map((nombre, idx) => {
    const row = catalogByName[nombre] || { nombre, exercise_id: null };
    return toPlanExercise(row, idx + 1, sentimentByName[nombre]);
  });

  const sessionLabel = mode === 'disliked'
    ? 'Los que te cuestan - Sesión Extra'
    : 'Tus favoritos - Sesión Extra';

  const { sessionId } = await persistSingleDaySession(dbClient, {
    userId,
    nivel,
    nivelNormalized: NIVEL_NORMALIZED[nivel] || 'basico',
    methodologyType: methodology ? String(methodology).toLowerCase() : 'preferencia',
    exercises: chosen,
    selectionMode: mode,
    sessionLabel,
    planLabel: `${sessionLabel} (por tus valoraciones)`,
    isWeekendExtra
  });

  logger.info(`✅ [PREFERENCE-SINGLE-DAY] Sesión ${sessionId} con ${chosen.length} ejercicios (${mode})`);

  return {
    sessionId,
    workout: {
      id: sessionId,
      type: `preference-${mode}-single`,
      nivel,
      exercises_count: chosen.length,
      exercises: chosen
    }
  };
}
