/**
 * Generación de entrenamiento de "día único" para Halterofilia.
 *
 * Calco de calisteniaSingleDay.js / funcionalSingleDay.js, pero seleccionando
 * sobre app.ejercicios con disciplina='halterofilia' y por categoría olímpica
 * (Snatch / Clean & Jerk / Técnica / Fuerza Base / Accesorios).
 *
 * Matiz de disciplina de FUERZA (no RIR a fallo): el peso es central (barra),
 * las reps son bajas y la carga se expresa como %1RM en `series_reps_objetivo`
 * (p.ej. "5 x 2 @ 85%"). Por eso el parser extrae además la intensidad para
 * mostrarla en el reproductor, y el RIR objetivo es bajo en los lifts
 * principales (cercano a un RPE alto) y algo mayor en accesorios.
 *
 * Reutiliza la persistencia genérica persistSingleDaySession para que el
 * reproductor (RoutineSessionModal) y el guardado de progreso con peso+reps
 * funcionen igual que en HipertrofiaV2 / Calistenia.
 */

import { persistSingleDaySession } from './persistSingleDaySession.js';
import { logger } from '../hipertrofiaV2/logger.js';

// Categorías reales en app.ejercicios para disciplina='halterofilia', con su
// patrón ILIKE (robusto a variantes del catálogo). El id del foco del frontend
// coincide con estas claves.
const CATEGORY_PATTERNS = {
  Snatch: ['%snatch%'],
  'Clean & Jerk': ['%clean%', '%jerk%'],
  Técnica: ['%técnica%', '%tecnica%'],
  'Fuerza Base': ['%fuerza%'],
  Accesorios: ['%accesor%']
};

// Composición de una sesión completa de halterofilia (~5 ejercicios, bajo
// volumen / alta intensidad relativa): un lift olímpico de cada modalidad,
// trabajo técnico, fuerza base y un accesorio.
const FULLBODY_PLAN = [
  { categoria: 'Snatch', count: 1 },
  { categoria: 'Clean & Jerk', count: 1 },
  { categoria: 'Técnica', count: 1 },
  { categoria: 'Fuerza Base', count: 1 },
  { categoria: 'Accesorios', count: 1 }
];

// Orden de relleno del fallback para garantizar el mínimo de ejercicios.
const FALLBACK_CATEGORIES = ['Fuerza Base', 'Técnica', 'Accesorios', 'Snatch', 'Clean & Jerk'];

// Categorías consideradas "lift principal" (RIR/RPE más exigente que accesorios).
const MAIN_LIFT_CATEGORIES = ['Snatch', 'Clean & Jerk'];

// Jerarquía de niveles para selección acumulativa (incluye niveles inferiores).
const LEVEL_HIERARCHY = ['Principiante', 'Intermedio', 'Avanzado'];

// Descanso por defecto en fuerza (más largo que en hipertrofia/calistenia).
const DEFAULT_REST_SECONDS = 150;

// RIR objetivo: en los lifts principales la intensidad la marca el %1RM, así que
// se trabaja lejos del fallo (RIR alto / pocas reps); en accesorios sí cabe RIR
// de hipertrofia.
const RIR_TARGET_MAIN = '3-4';
const RIR_TARGET_ACCESSORY = '2-3';

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
  return LEVEL_HIERARCHY.slice(Math.max(0, idx - 1), idx + 1); // ventana deslizante: nivel + 1 por debajo (no acumula desde principiante)
}

/**
 * Parsea "5 x 2 @ 85%" → { series: 5, reps_objetivo: '2', intensidad: '85%',
 * series_reps_objetivo }. Maneja también "4 x 5" (sin intensidad) y
 * "3 x 10 pasos/pierna" (reps con texto).
 */
function parseSeriesReps(raw) {
  const value = String(raw || '').trim();
  const fallback = {
    series: 3,
    reps_objetivo: '3-5',
    intensidad: null,
    series_reps_objetivo: value || '3x3-5'
  };
  if (!value) return fallback;

  const idx = value.toLowerCase().indexOf('x');
  const seriesPart = idx === -1 ? '3' : value.slice(0, idx).trim();
  let repsPart = idx === -1 ? value : value.slice(idx + 1).trim();

  // Extraer la intensidad (lo que va tras "@", típicamente "85%" o "50-60%").
  let intensidad = null;
  const atIdx = repsPart.indexOf('@');
  if (atIdx !== -1) {
    intensidad = repsPart.slice(atIdx + 1).trim() || null;
    repsPart = repsPart.slice(0, atIdx).trim();
  }

  const seriesNum = parseInt(seriesPart, 10);
  return {
    series: Number.isFinite(seriesNum) && seriesNum > 0 ? seriesNum : 3,
    reps_objetivo: repsPart || '3-5',
    intensidad,
    series_reps_objetivo: value
  };
}

/**
 * Selecciona N ejercicios de halterofilia cuya categoría coincide (ILIKE) con
 * alguno de los patrones de `categoria`, para los niveles dados (acumulativo),
 * evitando nombres ya elegidos. Orden aleatorio.
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
    WHERE disciplina = 'halterofilia'
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
 * ¿La categoría corresponde a un lift principal (Snatch / Clean & Jerk)?
 */
function isMainLift(categoria) {
  const c = String(categoria || '').toLowerCase();
  return MAIN_LIFT_CATEGORIES.some((m) => c.includes(m.split(' ')[0].toLowerCase()));
}

/**
 * Mapea una fila de BD al formato de ejercicio del reproductor.
 */
function toPlanExercise(row, orden) {
  const { series, reps_objetivo, intensidad, series_reps_objetivo } = parseSeriesReps(row.series_reps_objetivo);
  const main = isMainLift(row.categoria);
  return {
    orden,
    id: row.exercise_id,
    exercise_id: row.exercise_id,
    nombre: row.nombre,
    categoria: row.categoria,
    tipo_ejercicio: 'halterofilia',
    disciplina: 'halterofilia',
    patron: row.patron || null,
    patron_movimiento: row.patron_movimiento || row.patron || null,
    series,
    reps_objetivo,
    intensidad,
    series_reps_objetivo,
    // El peso es central en halterofilia: no es opcional en el reproductor.
    peso_requerido: true,
    rir_target: main ? RIR_TARGET_MAIN : RIR_TARGET_ACCESSORY,
    descanso_seg: row.descanso_seg ?? DEFAULT_REST_SECONDS,
    tempo: row.tempo || null,
    criterio_de_progreso: row.criterio_de_progreso || null,
    como_hacerlo: row.como_hacerlo || null,
    consejos: row.consejos || null,
    gif_url: row.gif_url || null,
    coachTip: main
      ? 'Prioriza la técnica sobre la carga. La intensidad la marca el %1RM, no el fallo.'
      : null,
    notas: row.consejos || ''
  };
}

/**
 * Genera un entrenamiento de día único de halterofilia y lo persiste.
 *
 * @param {object} dbClient
 * @param {number} userId
 * @param {string} rawNivel
 * @param {boolean} isWeekendExtra
 * @param {object} options - { selectionMode: 'full_body'|'focus', focusGroup }
 * @returns {Promise<{sessionId:number, workout:object}>}
 */
export async function generateHalterofiliaSingleDay(dbClient, userId, rawNivel, isWeekendExtra = true, options = {}) {
  const { selectionMode = 'full_body', focusGroup = null } = options || {};
  const nivel = normalizeLevel(rawNivel);
  const niveles = getAccumulativeLevels(nivel);

  logger.info('🏋️ [HALTEROFILIA-SINGLE-DAY] Generando para usuario:', userId, 'Nivel:', nivel, 'Modo:', selectionMode, 'Foco:', focusGroup);

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
  const MIN_EXERCISES = isFocus ? 3 : 5;
  if (chosen.length < MIN_EXERCISES) {
    logger.warn(`⚠️ [HALTEROFILIA-SINGLE-DAY] Solo ${chosen.length} ejercicios; aplicando fallback.`);
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
    throw new Error('No se encontraron ejercicios de halterofilia para el nivel seleccionado');
  }

  const exercises = chosen.map((row, idx) => toPlanExercise(row, idx + 1));

  const sessionLabel = isFocus
    ? `${focusGroup} - Sesión Especial`
    : 'Sesión de Halterofilia - Hoy';
  const planLabel = isFocus
    ? `Sesión de ${focusGroup} - Halterofilia`
    : 'Entrenamiento de Halterofilia - Hoy';

  const { sessionId } = await persistSingleDaySession(dbClient, {
    userId,
    nivel,
    nivelNormalized: NIVEL_NORMALIZED[nivel] || 'basico',
    methodologyType: 'halterofilia',
    exercises,
    selectionMode,
    focusGroup: isFocus ? focusGroup : null,
    sessionLabel,
    planLabel,
    isWeekendExtra
  });

  logger.info('✅ [HALTEROFILIA-SINGLE-DAY] Sesión generada:', sessionId, 'Ejercicios:', exercises.length);

  return {
    sessionId,
    workout: {
      id: sessionId,
      type: isFocus ? 'halterofilia-focus-single' : 'halterofilia-fullbody-single',
      nivel,
      discipline: 'halterofilia',
      exercises_count: exercises.length,
      exercises
    }
  };
}
