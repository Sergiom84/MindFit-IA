/**
 * Generación de entrenamiento de "día único" para Entrenamiento en Casa.
 *
 * Equivalente al flujo single-day de HipertrofiaV2 / Calistenia, pero sobre
 * `app.ejercicios` con disciplina='casa'. La diferencia propia de "casa" es el
 * EQUIPAMIENTO: el catálogo se filtra por el material disponible (peso corporal
 * y enseres domésticos siempre disponibles; mancuernas/kettlebell/banda/barra
 * solo si el usuario los declara). Reutiliza la persistencia genérica
 * persistSingleDaySession para que el reproductor (RoutineSessionModal) y el
 * guardado de progreso funcionen igual que en el resto de metodologías.
 */

import { persistSingleDaySession } from './persistSingleDaySession.js';
import { buildAllowedMaterials } from './casaEquipment.js';
import { logger } from '../hipertrofiaV2/logger.js';

// Buckets de casa → categorías reales en app.ejercicios (disciplina='casa').
// Las categorías reales son: Fuerza, Funcional, Cardio, HIIT, Movilidad.
const BUCKET_CATEGORIES = {
  FUERZA: ['Fuerza'],
  FUNCIONAL: ['Funcional'],
  CARDIO: ['Cardio', 'HIIT'],
  MOVILIDAD: ['Movilidad']
};

// Distribución de un Full Body en casa (objetivo ~7 ejercicios).
const FULLBODY_PLAN = [
  { bucket: 'FUERZA', count: 2 },
  { bucket: 'FUNCIONAL', count: 2 },
  { bucket: 'CARDIO', count: 2 },
  { bucket: 'MOVILIDAD', count: 1 }
];

// Jerarquía de niveles para selección acumulativa (incluye niveles inferiores).
const LEVEL_HIERARCHY = ['Principiante', 'Intermedio', 'Avanzado'];

const NIVEL_NORMALIZED = {
  Principiante: 'basico',
  Intermedio: 'intermedio',
  Avanzado: 'avanzado'
};

// Descanso por defecto si la fila no lo trae.
const DEFAULT_REST_SECONDS = 45;

// RIR objetivo por defecto (repeticiones en reserva), igual que en Calistenia.
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

/**
 * Niveles acumulativos: para 'Intermedio' devuelve ['Principiante','Intermedio'].
 */
function getAccumulativeLevels(nivel) {
  const idx = LEVEL_HIERARCHY.indexOf(nivel);
  return LEVEL_HIERARCHY.slice(0, idx + 1);
}

/**
 * Normaliza un grupo focal de casa al bucket correspondiente.
 * Acepta 'Fuerza' | 'Funcional' | 'Cardio' | 'Movilidad' (o sus buckets).
 */
function normalizeFocus(focusGroup) {
  const f = String(focusGroup || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (f.includes('fuerza')) return 'FUERZA';
  if (f.includes('funcional')) return 'FUNCIONAL';
  if (f.includes('cardio') || f.includes('hiit')) return 'CARDIO';
  if (f.includes('movilidad')) return 'MOVILIDAD';
  return null;
}

/**
 * Parsea series_reps_objetivo de casa (p.ej. "3 x 12-15", "4 x 20s/40s") en
 * { series (número), reps_objetivo, series_reps_objetivo }.
 */
function parseSeriesReps(raw) {
  const value = String(raw || '').trim();
  const fallback = { series: 3, reps_objetivo: '10-12', series_reps_objetivo: value || '3 x 10-12' };
  if (!value) return fallback;
  const idx = value.toLowerCase().indexOf('x');
  const seriesPart = idx === -1 ? '3' : value.slice(0, idx).trim();
  const repsPart = idx === -1 ? value : value.slice(idx + 1).trim();
  const seriesNum = parseInt(seriesPart, 10);
  return {
    series: Number.isFinite(seriesNum) && seriesNum > 0 ? seriesNum : 3,
    reps_objetivo: repsPart || '10-12',
    series_reps_objetivo: value
  };
}

/**
 * Selecciona N ejercicios de un bucket para el nivel (acumulativo), filtrando
 * por el material disponible y evitando nombres ya elegidos. Orden aleatorio.
 */
async function selectByBucket(dbClient, { niveles, bucket, cantidad, allowedMaterials, excludeNames = [] }) {
  const categorias = BUCKET_CATEGORIES[bucket] || [];
  if (categorias.length === 0 || cantidad <= 0) return [];

  const params = [categorias, niveles, allowedMaterials];
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
      array_to_string(equipamiento, ', ') AS equipamiento,
      series_reps_objetivo,
      descanso_seg,
      tempo,
      criterio_de_progreso,
      como_hacerlo,
      consejos,
      gif_url
    FROM app.ejercicios
    WHERE disciplina = 'casa'
      AND categoria = ANY($1::text[])
      AND nivel = ANY($2::text[])
      AND equipamiento <@ $3::text[]
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
    tipo_ejercicio: 'casa',
    patron: row.patron || null,
    patron_movimiento: row.patron_movimiento || row.patron || null,
    equipamiento: row.equipamiento || null,
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
 * Genera un entrenamiento de día único de casa y lo persiste.
 *
 * @param {object} dbClient
 * @param {number} userId
 * @param {string} rawNivel
 * @param {boolean} isWeekendExtra
 * @param {object} options - { selectionMode: 'full_body'|'focus', focusGroup, equipment }
 * @returns {Promise<{sessionId:number, workout:object}>}
 */
export async function generateCasaSingleDay(dbClient, userId, rawNivel, isWeekendExtra = true, options = {}) {
  const { selectionMode = 'full_body', focusGroup = null, equipment = null } = options || {};
  const nivel = normalizeLevel(rawNivel);
  const niveles = getAccumulativeLevels(nivel);
  const allowedMaterials = buildAllowedMaterials(equipment);

  logger.info('🏠 [CASA-SINGLE-DAY] Generando para usuario:', userId, 'Nivel:', nivel, 'Modo:', selectionMode, 'Foco:', focusGroup, 'Material:', allowedMaterials.length);

  const chosen = [];
  const usedNames = [];

  const focusBucket = normalizeFocus(focusGroup);
  const isFocus = selectionMode === 'focus' && !!focusBucket;

  if (isFocus) {
    const focusCount = nivel === 'Avanzado' ? 5 : 4;
    const rows = await selectByBucket(dbClient, {
      niveles,
      bucket: focusBucket,
      cantidad: focusCount,
      allowedMaterials,
      excludeNames: usedNames
    });
    chosen.push(...rows);
    usedNames.push(...rows.map((r) => r.nombre));
  } else {
    for (const { bucket, count } of FULLBODY_PLAN) {
      const rows = await selectByBucket(dbClient, {
        niveles,
        bucket,
        cantidad: count,
        allowedMaterials,
        excludeNames: usedNames
      });
      chosen.push(...rows);
      usedNames.push(...rows.map((r) => r.nombre));
    }
  }

  // Fallback: garantizar un mínimo de ejercicios completando con cualquier bucket
  // (respetando siempre el material disponible).
  const MIN_EXERCISES = isFocus ? 3 : 6;
  if (chosen.length < MIN_EXERCISES) {
    logger.warn(`⚠️ [CASA-SINGLE-DAY] Solo ${chosen.length} ejercicios; aplicando fallback.`);
    for (const bucket of Object.keys(BUCKET_CATEGORIES)) {
      if (chosen.length >= MIN_EXERCISES) break;
      const needed = MIN_EXERCISES - chosen.length;
      const rows = await selectByBucket(dbClient, {
        niveles,
        bucket,
        cantidad: needed,
        allowedMaterials,
        excludeNames: usedNames
      });
      chosen.push(...rows);
      usedNames.push(...rows.map((r) => r.nombre));
    }
  }

  if (chosen.length === 0) {
    throw new Error('No se encontraron ejercicios de casa para el nivel y material seleccionados');
  }

  const exercises = chosen.map((row, idx) => toPlanExercise(row, idx + 1));

  const focusLabel = isFocus ? focusGroup : null;
  const sessionLabel = isFocus
    ? `${focusLabel} - Sesión en Casa`
    : 'Full Body en Casa - Sesión de Hoy';
  const planLabel = isFocus
    ? `Sesión de ${focusLabel} - Entrenamiento en Casa`
    : 'Entrenamiento en Casa - Hoy';

  const { sessionId } = await persistSingleDaySession(dbClient, {
    userId,
    nivel,
    nivelNormalized: NIVEL_NORMALIZED[nivel] || 'basico',
    methodologyType: 'casa',
    exercises,
    selectionMode,
    focusGroup: isFocus ? focusGroup : null,
    sessionLabel,
    planLabel,
    isWeekendExtra,
    extraSessionMetadata: { equipment: allowedMaterials }
  });

  logger.info('✅ [CASA-SINGLE-DAY] Sesión generada:', sessionId, 'Ejercicios:', exercises.length);

  return {
    sessionId,
    workout: {
      id: sessionId,
      type: isFocus ? 'casa-focus-single' : 'casa-fullbody-single',
      nivel,
      discipline: 'casa',
      exercises_count: exercises.length,
      exercises
    }
  };
}
