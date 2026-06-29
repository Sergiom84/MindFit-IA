/**
 * Generación de entrenamiento de "día único" para Entrenamiento Funcional.
 *
 * Calco de calisteniaSingleDay.js: misma estructura series×reps×descanso×RIR,
 * pero seleccionando sobre app.ejercicios con disciplina='funcional' y por
 * patrón de movimiento (Empuje / Tracción / Piernas / Core / Movilidad).
 *
 * La selección por categoría usa coincidencia ILIKE (no igualdad exacta) para
 * ser robusta a las variantes del catálogo, alineada con la clasificación de
 * GymRoutineService.functionalBucket (empuje, tracci, pierna|carga, core,
 * movilidad). Reutiliza la persistencia genérica persistSingleDaySession para
 * que el reproductor (RoutineSessionModal) y el guardado de progreso con RIR
 * funcionen igual que en HipertrofiaV2 / Calistenia.
 */

import { persistSingleDaySession } from './persistSingleDaySession.js';
import { logger } from '../hipertrofiaV2/logger.js';

// Categorías de patrón para disciplina='funcional', con su patrón ILIKE.
// Alineadas con functionalBucket (GymRoutineService): empuje, tracci,
// pierna|carga, core, movilidad.
const CATEGORY_PATTERNS = {
  Empuje: ['%empuje%'],
  Tracción: ['%tracci%'],
  Piernas: ['%pierna%', '%carga%'],
  Core: ['%core%', '%abdom%'],
  Movilidad: ['%movilidad%']
};

// Composición de un Full Body funcional (~7 ejercicios), igual que Calistenia.
const FULLBODY_PLAN = [
  { categoria: 'Empuje', count: 2 },
  { categoria: 'Tracción', count: 2 },
  { categoria: 'Piernas', count: 2 },
  { categoria: 'Core', count: 1 }
];

// Orden de relleno del fallback (incluye Movilidad para completar el mínimo).
const FALLBACK_CATEGORIES = ['Empuje', 'Tracción', 'Piernas', 'Core', 'Movilidad'];

// Jerarquía de niveles para selección acumulativa (incluye niveles inferiores).
const LEVEL_HIERARCHY = ['Principiante', 'Intermedio', 'Avanzado'];

// Descanso por defecto (muchas filas funcionales tienen descanso_seg = null).
const DEFAULT_REST_SECONDS = 75;

// RIR objetivo por defecto para funcional (repeticiones en reserva).
const DEFAULT_RIR_TARGET = '2-3';

/**
 * Normaliza el nivel recibido a una de las claves de LEVEL_HIERARCHY.
 */
function normalizeLevel(rawLevel) {
  const lvl = String(rawLevel || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (lvl.includes('avanz')) return 'Avanzado';
  if (lvl.includes('inter')) return 'Intermedio';
  return 'Principiante';
}

const NIVEL_NORMALIZED = {
  Principiante: 'basico',
  Intermedio: 'intermedio',
  Avanzado: 'avanzado'
};

/**
 * Niveles acumulativos: para 'Intermedio' devuelve ['Principiante','Intermedio'].
 */
function getAccumulativeLevels(nivel) {
  const idx = LEVEL_HIERARCHY.indexOf(nivel);
  return LEVEL_HIERARCHY.slice(0, idx + 1);
}

/**
 * Parsea "3-5x6-12" → { series: 3, reps_objetivo: '6-12', series_reps_objetivo }.
 * series se devuelve numérico (primer valor del rango) porque el reproductor
 * usa Number(series) para el total de series.
 */
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

/**
 * Selecciona N ejercicios funcionales cuya categoría coincide (ILIKE) con
 * alguno de los patrones de `categoria`, para los niveles dados (acumulativo),
 * evitando nombres ya elegidos. Orden aleatorio.
 */
async function selectByCategory(dbClient, { niveles, categoria, cantidad, excludeNames = [] }) {
  const patterns = CATEGORY_PATTERNS[categoria] || [`%${String(categoria).toLowerCase()}%`];

  const params = [niveles];
  // Cláusula OR de patrones ILIKE sobre categoria.
  const patternClauses = patterns.map((p) => {
    params.push(p);
    return `categoria ILIKE $${params.length}`;
  });
  let exclude = '';
  if (excludeNames.length > 0) {
    params.push(excludeNames);
    exclude = `AND nombre <> ALL($${params.length})`;
  }
  params.push(cantidad);
  const limitPlaceholder = `$${params.length}`;

  const query = `
    SELECT
      source_exercise_id AS exercise_id,
      nombre,
      nivel,
      categoria,
      patron,
      patron_movimiento,
      series_reps_objetivo,
      descanso_seg,
      tempo,
      criterio_de_progreso,
      como_hacerlo,
      consejos,
      gif_url
    FROM app.ejercicios
    WHERE disciplina = 'funcional'
      AND (${patternClauses.join(' OR ')})
      AND nivel = ANY($1)
      ${exclude}
    ORDER BY RANDOM()
    LIMIT ${limitPlaceholder}
  `;
  const result = await dbClient.query(query, params);
  return result.rows;
}

/**
 * Mapea una fila de BD al formato de ejercicio del reproductor.
 */
function toPlanExercise(row, orden) {
  const { series, reps_objetivo, series_reps_objetivo } = parseSeriesReps(row.series_reps_objetivo);
  return {
    orden,
    id: row.exercise_id,
    exercise_id: row.exercise_id,
    nombre: row.nombre,
    categoria: row.categoria,
    tipo_ejercicio: 'funcional',
    patron: row.patron || null,
    patron_movimiento: row.patron_movimiento || row.patron || null,
    series,
    reps_objetivo,
    series_reps_objetivo,
    rir_target: DEFAULT_RIR_TARGET,
    descanso_seg: row.descanso_seg ?? DEFAULT_REST_SECONDS,
    tempo: row.tempo || null,
    criterio_de_progreso: row.criterio_de_progreso || null,
    como_hacerlo: row.como_hacerlo || null,
    consejos: row.consejos || null,
    gif_url: row.gif_url || null,
    notas: row.consejos || ''
  };
}

/**
 * Genera un entrenamiento de día único de funcional y lo persiste.
 *
 * @param {object} dbClient
 * @param {number} userId
 * @param {string} rawNivel
 * @param {boolean} isWeekendExtra
 * @param {object} options - { selectionMode: 'full_body'|'focus', focusGroup }
 * @returns {Promise<{sessionId:number, workout:object}>}
 */
export async function generateFuncionalSingleDay(dbClient, userId, rawNivel, isWeekendExtra = true, options = {}) {
  const { selectionMode = 'full_body', focusGroup = null } = options || {};
  const nivel = normalizeLevel(rawNivel);
  const niveles = getAccumulativeLevels(nivel);

  logger.info('🏋️‍♀️ [FUNCIONAL-SINGLE-DAY] Generando para usuario:', userId, 'Nivel:', nivel, 'Modo:', selectionMode, 'Foco:', focusGroup);

  const chosen = [];
  const usedNames = [];

  const isFocus = selectionMode === 'focus' && !!focusGroup;

  if (isFocus) {
    const focusCount = nivel === 'Avanzado' ? 5 : 4;
    const rows = await selectByCategory(dbClient, {
      niveles,
      categoria: focusGroup,
      cantidad: focusCount,
      excludeNames: usedNames
    });
    chosen.push(...rows);
    usedNames.push(...rows.map((r) => r.nombre));
  } else {
    for (const { categoria, count } of FULLBODY_PLAN) {
      const rows = await selectByCategory(dbClient, {
        niveles,
        categoria,
        cantidad: count,
        excludeNames: usedNames
      });
      chosen.push(...rows);
      usedNames.push(...rows.map((r) => r.nombre));
    }
  }

  // Fallback: garantizar un mínimo de ejercicios completando con cualquier categoría.
  const MIN_EXERCISES = isFocus ? 3 : 6;
  if (chosen.length < MIN_EXERCISES) {
    logger.warn(`⚠️ [FUNCIONAL-SINGLE-DAY] Solo ${chosen.length} ejercicios; aplicando fallback.`);
    for (const categoria of FALLBACK_CATEGORIES) {
      if (chosen.length >= MIN_EXERCISES) break;
      const needed = MIN_EXERCISES - chosen.length;
      const rows = await selectByCategory(dbClient, {
        niveles,
        categoria,
        cantidad: needed,
        excludeNames: usedNames
      });
      chosen.push(...rows);
      usedNames.push(...rows.map((r) => r.nombre));
    }
  }

  if (chosen.length === 0) {
    throw new Error('No se encontraron ejercicios de funcional para el nivel seleccionado');
  }

  const exercises = chosen.map((row, idx) => toPlanExercise(row, idx + 1));

  const sessionLabel = isFocus
    ? `${focusGroup} - Sesión Especial`
    : 'Full Body Funcional - Sesión de Hoy';
  const planLabel = isFocus
    ? `Sesión de ${focusGroup} - Funcional`
    : 'Entrenamiento Funcional - Hoy';

  const { sessionId } = await persistSingleDaySession(dbClient, {
    userId,
    nivel,
    nivelNormalized: NIVEL_NORMALIZED[nivel] || 'basico',
    methodologyType: 'funcional',
    exercises,
    selectionMode,
    focusGroup: isFocus ? focusGroup : null,
    sessionLabel,
    planLabel,
    isWeekendExtra
  });

  logger.info('✅ [FUNCIONAL-SINGLE-DAY] Sesión generada:', sessionId, 'Ejercicios:', exercises.length);

  return {
    sessionId,
    workout: {
      id: sessionId,
      type: isFocus ? 'funcional-focus-single' : 'funcional-fullbody-single',
      nivel,
      discipline: 'funcional',
      exercises_count: exercises.length,
      exercises
    }
  };
}
