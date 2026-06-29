/**
 * Generación de entrenamiento de "día único" para Heavy Duty (HIT / Mentzer).
 *
 * Calco de halterofiliaSingleDay.js / calisteniaSingleDay.js, pero seleccionando
 * sobre app.ejercicios con disciplina='heavy_duty' y agrupando las categorías por
 * grupo muscular (el catálogo guarda categorías finas: Pecho, Espalda, Hombro,
 * Bíceps, Tríceps, Piernas (cuádriceps), Glúteo, Gemelos, Isquios, Core, además de
 * combinadas como Pecho/Tríceps o Espalda/Bíceps), por eso se agrupa con ILIKE.
 *
 * Matiz de disciplina de ALTA INTENSIDAD (HIT): el peso es central (gimnasio/barra/
 * máquina) y NO es opcional en el reproductor; se entrena 1-2 series al FALLO
 * muscular absoluto (RIR objetivo ≈ 0, lo opuesto al RIR 2-3 de hipertrofia);
 * baja frecuencia y mucha recuperación entre sesiones. El catálogo ya viene con
 * 1 serie efectiva (`1x{reps}`) y descansos largos, coherente con Mentzer.
 *
 * Reutiliza la persistencia genérica persistSingleDaySession para que el
 * reproductor (RoutineSessionModal) y el guardado de progreso con peso+reps
 * funcionen igual que en HipertrofiaV2 / Calistenia / Halterofilia.
 */

import { persistSingleDaySession } from './persistSingleDaySession.js';
import { logger } from '../hipertrofiaV2/logger.js';

// Agrupación por grupo muscular de las categorías reales del catálogo
// (disciplina='heavy_duty') mediante patrones ILIKE robustos a variantes. La
// clave coincide con el id del foco enviado por el frontend.
const CATEGORY_PATTERNS = {
  Pecho: ['%pecho%'],
  Espalda: ['%espalda%'],
  Hombros: ['%hombro%'],
  Brazos: ['%bíceps%', '%biceps%', '%tríceps%', '%triceps%'],
  Piernas: ['%pierna%', '%glúteo%', '%gluteo%', '%isquio%', '%gemelo%', '%cuád%', '%cuad%'],
  Core: ['%core%']
};

// Composición de una sesión Full Body HIT (bajo volumen / alta intensidad):
// un ejercicio por grupo muscular principal, 1 serie al fallo cada uno.
const FULLBODY_PLAN = [
  { categoria: 'Pecho', count: 1 },
  { categoria: 'Espalda', count: 1 },
  { categoria: 'Piernas', count: 1 },
  { categoria: 'Hombros', count: 1 },
  { categoria: 'Brazos', count: 1 },
  { categoria: 'Core', count: 1 }
];

// Orden de relleno del fallback para garantizar el mínimo de ejercicios.
const FALLBACK_CATEGORIES = ['Pecho', 'Espalda', 'Piernas', 'Hombros', 'Brazos', 'Core'];

// Jerarquía de niveles para selección acumulativa (incluye niveles inferiores).
const LEVEL_HIERARCHY = ['Principiante', 'Intermedio', 'Avanzado'];

// Descanso por defecto en HIT (amplio; el catálogo ya trae 240-360s).
const DEFAULT_REST_SECONDS = 180;

// RIR objetivo en Heavy Duty: al FALLO muscular absoluto.
const RIR_TARGET_FAILURE = '0';

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
 * Parsea "1x8-12" → { series: 1, reps_objetivo: '8-12', series_reps_objetivo }.
 * series se devuelve numérico (primer valor) porque el reproductor usa
 * Number(series) para el total de series. Heavy Duty trabaja a 1-2 series al fallo.
 */
function parseSeriesReps(raw) {
  const value = String(raw || '').trim();
  const fallback = { series: 1, reps_objetivo: '6-10', series_reps_objetivo: value || '1x6-10' };
  if (!value) return fallback;
  const idx = value.toLowerCase().indexOf('x');
  const seriesPart = idx === -1 ? '1' : value.slice(0, idx).trim();
  const repsPart = idx === -1 ? value : value.slice(idx + 1).trim();
  const seriesNum = parseInt(seriesPart, 10);
  return {
    series: Number.isFinite(seriesNum) && seriesNum > 0 ? seriesNum : 1,
    reps_objetivo: repsPart || '6-10',
    series_reps_objetivo: value
  };
}

/**
 * Selecciona N ejercicios de heavy_duty cuya categoría coincide (ILIKE) con
 * alguno de los patrones del grupo `categoria`, para los niveles dados
 * (acumulativo), evitando nombres ya elegidos. Orden aleatorio.
 */
async function selectByCategory(dbClient, { niveles, categoria, cantidad, excludeNames = [] }) {
  const patterns = CATEGORY_PATTERNS[categoria] || [`%${String(categoria).toLowerCase()}%`];

  const params = [niveles];
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

  // DISTINCT ON (nombre): el catálogo de heavy_duty repite el mismo ejercicio en
  // varios niveles (p.ej. "Pec-deck" en Principiante e Intermedio); con niveles
  // acumulativos eso provocaría ejercicios duplicados en la misma sesión. Se elige
  // una variante aleatoria por nombre y luego se baraja el resultado.
  const query = `
    SELECT * FROM (
      SELECT DISTINCT ON (nombre)
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
      WHERE disciplina = 'heavy_duty'
        AND (${patternClauses.join(' OR ')})
        AND nivel = ANY($1)
        ${exclude}
      ORDER BY nombre, RANDOM()
    ) sub
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
    tipo_ejercicio: 'heavy_duty',
    disciplina: 'heavy_duty',
    patron: row.patron || null,
    patron_movimiento: row.patron_movimiento || row.patron || null,
    series,
    reps_objetivo,
    series_reps_objetivo,
    // El peso es central en Heavy Duty: no es opcional en el reproductor.
    peso_requerido: true,
    // RIR objetivo ≈ 0: la serie se lleva al fallo muscular absoluto.
    rir_target: RIR_TARGET_FAILURE,
    descanso_seg: row.descanso_seg ?? DEFAULT_REST_SECONDS,
    tempo: row.tempo || null,
    criterio_de_progreso: row.criterio_de_progreso || null,
    como_hacerlo: row.como_hacerlo || null,
    consejos: row.consejos || null,
    gif_url: row.gif_url || null,
    coachTip:
      'Lleva la serie al fallo muscular controlado y con técnica impecable. ' +
      'Si la carga es alta o el ejercicio es de riesgo, usa máquina o asistencia/seguridad. ' +
      'Cuando alcances el tope de reps con buena forma, sube carga la próxima sesión.',
    notas: row.consejos || 'Al fallo muscular absoluto (RIR 0). 1-2 series efectivas.'
  };
}

/**
 * Genera un entrenamiento de día único de Heavy Duty y lo persiste.
 *
 * @param {object} dbClient
 * @param {number} userId
 * @param {string} rawNivel
 * @param {boolean} isWeekendExtra
 * @param {object} options - { selectionMode: 'full_body'|'focus', focusGroup }
 * @returns {Promise<{sessionId:number, workout:object}>}
 */
export async function generateHeavyDutySingleDay(dbClient, userId, rawNivel, isWeekendExtra = true, options = {}) {
  const { selectionMode = 'full_body', focusGroup = null } = options || {};
  const nivel = normalizeLevel(rawNivel);
  const niveles = getAccumulativeLevels(nivel);

  logger.info('🏋️‍♂️ [HEAVY-DUTY-SINGLE-DAY] Generando para usuario:', userId, 'Nivel:', nivel, 'Modo:', selectionMode, 'Foco:', focusGroup);

  const chosen = [];
  const usedNames = [];

  const isFocus = selectionMode === 'focus' && !!focusGroup;

  if (isFocus) {
    // Heavy Duty es bajo volumen: incluso en foco, pocas series efectivas.
    const focusCount = nivel === 'Avanzado' ? 4 : 3;
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

  // Fallback: garantizar un mínimo de ejercicios completando con cualquier grupo.
  const MIN_EXERCISES = isFocus ? 3 : 5;
  if (chosen.length < MIN_EXERCISES) {
    logger.warn(`⚠️ [HEAVY-DUTY-SINGLE-DAY] Solo ${chosen.length} ejercicios; aplicando fallback.`);
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
    throw new Error('No se encontraron ejercicios de Heavy Duty para el nivel seleccionado');
  }

  const exercises = chosen.map((row, idx) => toPlanExercise(row, idx + 1));

  const sessionLabel = isFocus
    ? `${focusGroup} - Sesión Heavy Duty`
    : 'Sesión Heavy Duty - Hoy';
  const planLabel = isFocus
    ? `Sesión de ${focusGroup} - Heavy Duty`
    : 'Entrenamiento Heavy Duty - Hoy';

  const { sessionId } = await persistSingleDaySession(dbClient, {
    userId,
    nivel,
    nivelNormalized: NIVEL_NORMALIZED[nivel] || 'basico',
    methodologyType: 'heavy_duty',
    exercises,
    selectionMode,
    focusGroup: isFocus ? focusGroup : null,
    sessionLabel,
    planLabel,
    isWeekendExtra
  });

  logger.info('✅ [HEAVY-DUTY-SINGLE-DAY] Sesión generada:', sessionId, 'Ejercicios:', exercises.length);

  return {
    sessionId,
    workout: {
      id: sessionId,
      type: isFocus ? 'heavy-duty-focus-single' : 'heavy-duty-fullbody-single',
      nivel,
      discipline: 'heavy_duty',
      exercises_count: exercises.length,
      exercises
    }
  };
}
