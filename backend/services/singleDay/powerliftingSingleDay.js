/**
 * Generación de entrenamiento de "día único" para Powerlifting.
 *
 * Calco de halterofiliaSingleDay.js (su gemela de FUERZA), pero seleccionando
 * sobre app.ejercicios con disciplina='powerlifting' y por categoría de los 3
 * básicos + asistencia (Sentadilla / Press Banca / Peso Muerto / Asistencia
 * inferior / Asistencia superior).
 *
 * Matiz de disciplina de FUERZA MÁXIMA (no RIR a fallo): el peso es central
 * (barra), las reps son BAJAS (1-5 en los básicos) y la carga se expresa como
 * %1RM en `series_reps_objetivo` (p.ej. "5 x 3 @ 80%"). Por eso el parser extrae
 * además la intensidad para mostrarla en el reproductor, y el RIR objetivo en los
 * básicos es bajo (cercano a un RPE alto) frente a la asistencia.
 *
 * Reutiliza la persistencia genérica persistSingleDaySession para que el
 * reproductor (RoutineSessionModal) y el guardado de progreso con peso+reps
 * funcionen igual que en HipertrofiaV2 / Calistenia / Halterofilia.
 */

import { persistSingleDaySession } from './persistSingleDaySession.js';
import { logger } from '../hipertrofiaV2/logger.js';

// Categorías reales en app.ejercicios para disciplina='powerlifting', con su
// patrón ILIKE (robusto a variantes del catálogo). El id del foco del frontend
// coincide con estas claves. Mismos buckets que powerliftingBucket en
// GymRoutineService (sentadilla / banca|press / peso muerto / inferior / superior).
const CATEGORY_PATTERNS = {
  Sentadilla: ['%sentadilla%'],
  'Press Banca': ['%banca%', '%press%'],
  'Peso Muerto': ['%peso muerto%'],
  'Asistencia inferior': ['%inferior%'],
  'Asistencia superior': ['%superior%']
};

// Composición de una sesión completa de powerlifting (~5 ejercicios, bajo
// volumen / alta intensidad relativa): los 3 básicos de competición + una
// asistencia inferior y otra superior.
const FULLBODY_PLAN = [
  { categoria: 'Sentadilla', count: 1 },
  { categoria: 'Press Banca', count: 1 },
  { categoria: 'Peso Muerto', count: 1 },
  { categoria: 'Asistencia inferior', count: 1 },
  { categoria: 'Asistencia superior', count: 1 }
];

// Orden de relleno del fallback para garantizar el mínimo de ejercicios.
const FALLBACK_CATEGORIES = ['Asistencia superior', 'Asistencia inferior', 'Sentadilla', 'Press Banca', 'Peso Muerto'];

// Categorías consideradas "básico de competición" (RIR/RPE más exigente que la
// asistencia; la intensidad la marca el %1RM).
const MAIN_LIFT_CATEGORIES = ['Sentadilla', 'Press Banca', 'Peso Muerto'];

// Jerarquía de niveles para selección acumulativa (incluye niveles inferiores).
const LEVEL_HIERARCHY = ['Principiante', 'Intermedio', 'Avanzado'];

// Descanso por defecto en fuerza máxima (más largo que en hipertrofia/halterofilia:
// los básicos pesados requieren recuperación amplia entre series).
const DEFAULT_REST_SECONDS = 180;

// RIR objetivo: en los básicos la intensidad la marca el %1RM, así que se trabaja
// dejando margen (RIR bajo / pocas reps, sin llegar al fallo); en accesorios cabe
// algo más de cercanía al fallo.
const RIR_TARGET_MAIN = '2-3';
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
  return LEVEL_HIERARCHY.slice(0, idx + 1);
}

/**
 * Parsea "5 x 3 @ 80%" → { series: 5, reps_objetivo: '3', intensidad: '80%',
 * series_reps_objetivo }. Maneja también "5 x 5" (sin intensidad) y reps con texto.
 */
function parseSeriesReps(raw) {
  const value = String(raw || '').trim();
  const fallback = {
    series: 4,
    reps_objetivo: '3-5',
    intensidad: null,
    series_reps_objetivo: value || '4x3-5'
  };
  if (!value) return fallback;

  const idx = value.toLowerCase().indexOf('x');
  const seriesPart = idx === -1 ? '4' : value.slice(0, idx).trim();
  let repsPart = idx === -1 ? value : value.slice(idx + 1).trim();

  // Extraer la intensidad (lo que va tras "@", típicamente "80%" o "75-85%").
  let intensidad = null;
  const atIdx = repsPart.indexOf('@');
  if (atIdx !== -1) {
    intensidad = repsPart.slice(atIdx + 1).trim() || null;
    repsPart = repsPart.slice(0, atIdx).trim();
  }

  const seriesNum = parseInt(seriesPart, 10);
  return {
    series: Number.isFinite(seriesNum) && seriesNum > 0 ? seriesNum : 4,
    reps_objetivo: repsPart || '3-5',
    intensidad,
    series_reps_objetivo: value
  };
}

/**
 * Selecciona N ejercicios de powerlifting cuya categoría coincide (ILIKE) con
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
    WHERE disciplina = 'powerlifting'
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
 * ¿La categoría corresponde a un básico de competición (Sentadilla / Press Banca
 * / Peso Muerto)?
 */
function isMainLift(categoria) {
  const c = String(categoria || '').toLowerCase();
  if (c.includes('sentadilla')) return true;
  if (c.includes('peso muerto')) return true;
  // "Press Banca": básico; la asistencia superior puede contener "press" pero no "banca".
  if (c.includes('banca')) return true;
  return false;
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
    tipo_ejercicio: 'powerlifting',
    disciplina: 'powerlifting',
    patron: row.patron || null,
    patron_movimiento: row.patron_movimiento || row.patron || null,
    series,
    reps_objetivo,
    intensidad,
    series_reps_objetivo,
    // El peso es central en powerlifting: no es opcional en el reproductor.
    peso_requerido: true,
    rir_target: main ? RIR_TARGET_MAIN : RIR_TARGET_ACCESSORY,
    descanso_seg: row.descanso_seg ?? DEFAULT_REST_SECONDS,
    tempo: row.tempo || null,
    criterio_de_progreso: row.criterio_de_progreso || null,
    como_hacerlo: row.como_hacerlo || null,
    consejos: row.consejos || null,
    gif_url: row.gif_url || null,
    coachTip: main
      ? 'Prioriza la técnica de competición sobre la carga. La intensidad la marca el %1RM, no el fallo.'
      : null,
    notas: row.consejos || ''
  };
}

/**
 * Genera un entrenamiento de día único de powerlifting y lo persiste.
 *
 * @param {object} dbClient
 * @param {number} userId
 * @param {string} rawNivel
 * @param {boolean} isWeekendExtra
 * @param {object} options - { selectionMode: 'full_body'|'focus', focusGroup }
 * @returns {Promise<{sessionId:number, workout:object}>}
 */
export async function generatePowerliftingSingleDay(dbClient, userId, rawNivel, isWeekendExtra = true, options = {}) {
  const { selectionMode = 'full_body', focusGroup = null } = options || {};
  const nivel = normalizeLevel(rawNivel);
  const niveles = getAccumulativeLevels(nivel);

  logger.info('🏋️ [POWERLIFTING-SINGLE-DAY] Generando para usuario:', userId, 'Nivel:', nivel, 'Modo:', selectionMode, 'Foco:', focusGroup);

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
    logger.warn(`⚠️ [POWERLIFTING-SINGLE-DAY] Solo ${chosen.length} ejercicios; aplicando fallback.`);
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
    throw new Error('No se encontraron ejercicios de powerlifting para el nivel seleccionado');
  }

  const exercises = chosen.map((row, idx) => toPlanExercise(row, idx + 1));

  const sessionLabel = isFocus
    ? `${focusGroup} - Sesión Especial`
    : 'Sesión de Powerlifting - Hoy';
  const planLabel = isFocus
    ? `Sesión de ${focusGroup} - Powerlifting`
    : 'Entrenamiento de Powerlifting - Hoy';

  const { sessionId } = await persistSingleDaySession(dbClient, {
    userId,
    nivel,
    nivelNormalized: NIVEL_NORMALIZED[nivel] || 'basico',
    methodologyType: 'powerlifting',
    exercises,
    selectionMode,
    focusGroup: isFocus ? focusGroup : null,
    sessionLabel,
    planLabel,
    isWeekendExtra
  });

  logger.info('✅ [POWERLIFTING-SINGLE-DAY] Sesión generada:', sessionId, 'Ejercicios:', exercises.length);

  return {
    sessionId,
    workout: {
      id: sessionId,
      type: isFocus ? 'powerlifting-focus-single' : 'powerlifting-fullbody-single',
      nivel,
      discipline: 'powerlifting',
      exercises_count: exercises.length,
      exercises
    }
  };
}
