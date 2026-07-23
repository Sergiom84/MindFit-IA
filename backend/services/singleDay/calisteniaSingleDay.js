/**
 * Generación de entrenamiento de "día único" para Calistenia.
 *
 * Equivalente al flujo single-day de HipertrofiaV2 (extraWorkoutService) pero
 * con la selección y los datos propios de calistenia (app.ejercicios con
 * disciplina='calistenia'). Reutiliza la persistencia genérica
 * persistSingleDaySession para que el reproductor y el guardado de progreso
 * funcionen igual que en HipertrofiaV2.
 */

import { persistSingleDaySession } from './persistSingleDaySession.js';
import { logger } from '../hipertrofia/logger.js';
import { getUserFullProfile } from '../routineGeneration/database/userRepository.js';
import {
  extractInjuryText,
  activeInjuryRules,
  isContraindicated
} from '../routineGeneration/injuryContraindications.js';
import {
  assessCalistenia,
  isCalisthenicsAssessmentEnabled
} from '../routineGeneration/methodologies/calisteniaAssessment.js';
import { normalizeMethodologyLevel } from '../routineGeneration/methodologies/methodologyRegistry.js';

// Categorías reales en app.ejercicios para disciplina='calistenia'.
const FULLBODY_CATEGORIES = ['Empuje', 'Tracción', 'Piernas', 'Core'];

// Cuántos ejercicios por categoría en un Full Body (objetivo ~7 ejercicios).
const FULLBODY_PLAN = [
  { categoria: 'Empuje', count: 2 },
  { categoria: 'Tracción', count: 2 },
  { categoria: 'Piernas', count: 2 },
  { categoria: 'Core', count: 1 }
];

// Jerarquía de niveles para selección acumulativa (incluye niveles inferiores).
const LEVEL_HIERARCHY = ['Principiante', 'Intermedio', 'Avanzado'];

// Descanso por defecto (muchas filas de calistenia tienen descanso_seg = null).
const DEFAULT_REST_SECONDS = 75;

// RIR objetivo por defecto para calistenia (repeticiones en reserva).
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
  return LEVEL_HIERARCHY.slice(Math.max(0, idx - 1), idx + 1); // ventana deslizante: nivel + 1 por debajo (no acumula desde principiante)
}

const LEVEL_DISPLAY = { principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado' };

/**
 * Resuelve el nivel efectivo de single-day usando el MISMO assessment determinista que el flujo
 * multi-semana (PR-CAL-01, corrección de Sergio: "single-day debe compartir el assessment, no
 * duplicar la normalización de nivel"). Con el flag OFF, cae al `normalizeLevel` fuzzy legacy
 * (paridad exacta con el comportamiento previo). Con el flag ON:
 *  - 'refer' → 422 tipado (derivar, no prescribir), igual que el flujo multi-semana;
 *  - 'insufficient_data' → solo admite fallback provisional si `rawNivel` es un nivel explícito
 *    VÁLIDO del selector manual (reconocido por `normalizeMethodologyLevel`) o el frontend confirmó
 *    continuar (`assessmentInput.acceptProvisionalLevel`); si no hay nivel ni confirmación, 422
 *    `CALISTHENICS_LEVEL_REQUIRED`; si `rawNivel` viene con un valor explícito pero NO reconocido
 *    (typo, nivel no soportado), 422 `CALISTHENICS_LEVEL_INVALID` (nunca cae a 'Principiante' en
 *    silencio vía el normalizador fuzzy);
 *  - 'ok' → autoridad del assessment.
 * Recibe `userProfile` ya cargado (una sola lectura de perfil, compartida con el filtro de
 * lesiones de más abajo — evita duplicar la llamada a `profileLoader`).
 * @returns {{levelDisplay:string, assessment:object|null, levelSource:string}}
 */
function resolveEffectiveLevel(rawNivel, assessmentInput = {}, userProfile = null) {
  if (!isCalisthenicsAssessmentEnabled()) {
    return { levelDisplay: normalizeLevel(rawNivel), assessment: null, levelSource: 'legacy_resolution' };
  }

  const assessment = assessCalistenia({
    selfReportedLevel: assessmentInput.selfReportedLevel ?? rawNivel ?? userProfile?.nivel_entrenamiento,
    demonstratedLevel: assessmentInput.demonstratedLevel,
    experienceYears: userProfile?.anos_experiencia,
    injuryText: extractInjuryText(userProfile || {}),
    painStatus: assessmentInput.painStatus
  });

  if (assessment.decision === 'refer') {
    const err = new Error('Necesitas una valoración profesional antes de generar el entrenamiento.');
    err.statusCode = 422;
    err.code = 'CALISTHENICS_ASSESSMENT_REFER';
    err.publicEvaluation = {
      decision: 'refer',
      recommended_level: null,
      confidence: assessment.confidence,
      reasons: assessment.reasons,
      limiting_patterns: assessment.limiting_patterns,
      reasoning: null
    };
    throw err;
  }

  if (assessment.decision === 'insufficient_data') {
    const rawProvided = rawNivel != null && String(rawNivel).trim() !== '';
    // Nivel explícito → validar contra el registry canónico. Un valor presente pero no reconocido
    // NO debe caer en silencio a 'Principiante' vía el normalizador fuzzy: es un error del cliente.
    const canonicalLevel = rawProvided ? normalizeMethodologyLevel('calistenia', rawNivel) : null;
    const explicitValidSelected = canonicalLevel != null;
    const confirmedProvisional = assessmentInput.acceptProvisionalLevel === true;

    if (rawProvided && !explicitValidSelected) {
      const err = new Error('El nivel indicado no es un nivel válido de calistenia.');
      err.statusCode = 422;
      err.code = 'CALISTHENICS_LEVEL_INVALID';
      throw err;
    }
    if (!rawProvided && !confirmedProvisional) {
      const err = new Error(
        'Selecciona un nivel o confirma continuar con un nivel provisional antes de generar el entrenamiento.'
      );
      err.statusCode = 422;
      err.code = 'CALISTHENICS_LEVEL_REQUIRED';
      throw err;
    }
    return {
      levelDisplay: explicitValidSelected ? LEVEL_DISPLAY[canonicalLevel] : 'Principiante',
      assessment,
      levelSource: explicitValidSelected ? 'user_selected' : 'provisional_safe_fallback'
    };
  }

  return { levelDisplay: LEVEL_DISPLAY[assessment.level] || 'Principiante', assessment, levelSource: 'assessment' };
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
 * Selecciona N ejercicios de una categoría para el nivel (acumulativo),
 * evitando nombres ya elegidos. Orden aleatorio.
 */
async function selectByCategory(dbClient, { niveles, categoria, cantidad, excludeNames = [] }) {
  const params = [categoria, niveles];
  let exclude = '';
  if (excludeNames.length > 0) {
    params.push(excludeNames);
    exclude = `AND nombre <> ALL($3)`;
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
    WHERE disciplina = 'calistenia'
      AND categoria = $1
      AND nivel = ANY($2)
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
    tipo_ejercicio: 'calistenia',
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
 * Genera un entrenamiento de día único de calistenia y lo persiste.
 *
 * @param {object} dbClient
 * @param {number} userId
 * @param {string} rawNivel
 * @param {boolean} isWeekendExtra
 * @param {object} options - { selectionMode: 'full_body'|'focus', focusGroup, assessmentInput }
 * @returns {Promise<{sessionId:number, workout:object}>}
 */
export async function generateCalisteniaSingleDay(dbClient, userId, rawNivel, isWeekendExtra = true, options = {}) {
  const {
    selectionMode = 'full_body',
    focusGroup = null,
    assessmentInput = {},
    profileLoader = getUserFullProfile
  } = options || {};

  // Una sola lectura de perfil, compartida por el assessment de nivel y el filtro de lesiones (antes
  // se leía dos veces). Si falla, ambos se degradan a su comportamiento sin perfil (nunca bloquea).
  let userProfile = null;
  try {
    userProfile = await profileLoader(userId);
  } catch (profileError) {
    logger.warn(`⚠️ [CALISTENIA-SINGLE-DAY] No se pudo leer el perfil completo: ${profileError.message}`);
  }

  const { levelDisplay: nivel, assessment, levelSource } = resolveEffectiveLevel(rawNivel, assessmentInput, userProfile);
  const niveles = getAccumulativeLevels(nivel);

  logger.info('🤸 [CALISTENIA-SINGLE-DAY] Generando para usuario:', userId, 'Nivel:', nivel, `(${levelSource})`, 'Modo:', selectionMode, 'Foco:', focusGroup);

  // 🩹 SEGURIDAD POR LESIÓN (G8): single-day carecía de filtro de lesiones (la
  // generación multi-semana sí lo tiene, ver CalisteniaService.js). Un usuario con
  // muñeca lesionada recibía flexiones/apoyos de manos. Excluimos del pool los
  // movimientos contraindicados con el MISMO filtro compartido que las demás metodologías.
  const injuryRules = activeInjuryRules(extractInjuryText(userProfile || {}));
  const filterSafe = (rows) => (injuryRules.length ? rows.filter((r) => !isContraindicated(r, injuryRules)) : rows);

  const chosen = [];
  const usedNames = [];

  const isFocus = selectionMode === 'focus' && !!focusGroup;

  if (isFocus) {
    const focusCount = nivel === 'Avanzado' ? 5 : 4;
    const rows = filterSafe(await selectByCategory(dbClient, {
      niveles,
      categoria: focusGroup,
      cantidad: focusCount,
      excludeNames: usedNames
    }));
    chosen.push(...rows);
    usedNames.push(...rows.map((r) => r.nombre));
  } else {
    for (const { categoria, count } of FULLBODY_PLAN) {
      const rows = filterSafe(await selectByCategory(dbClient, {
        niveles,
        categoria,
        cantidad: count,
        excludeNames: usedNames
      }));
      chosen.push(...rows);
      usedNames.push(...rows.map((r) => r.nombre));
    }
  }

  // Fallback: garantizar un mínimo de ejercicios completando con cualquier categoría.
  const MIN_EXERCISES = isFocus ? 3 : 6;
  if (chosen.length < MIN_EXERCISES) {
    logger.warn(`⚠️ [CALISTENIA-SINGLE-DAY] Solo ${chosen.length} ejercicios; aplicando fallback.`);
    for (const categoria of FULLBODY_CATEGORIES) {
      if (chosen.length >= MIN_EXERCISES) break;
      const needed = MIN_EXERCISES - chosen.length;
      const rows = filterSafe(await selectByCategory(dbClient, {
        niveles,
        categoria,
        cantidad: needed,
        excludeNames: usedNames
      }));
      chosen.push(...rows);
      usedNames.push(...rows.map((r) => r.nombre));
    }
  }

  if (chosen.length === 0) {
    throw new Error('No se encontraron ejercicios de calistenia para el nivel seleccionado');
  }

  const exercises = chosen.map((row, idx) => toPlanExercise(row, idx + 1));

  const sessionLabel = isFocus
    ? `${focusGroup} - Sesión Especial`
    : 'Full Body Calistenia - Sesión de Hoy';
  const planLabel = isFocus
    ? `Sesión de ${focusGroup} - Calistenia`
    : 'Entrenamiento de Calistenia - Hoy';

  const { sessionId } = await persistSingleDaySession(dbClient, {
    userId,
    nivel,
    nivelNormalized: NIVEL_NORMALIZED[nivel] || 'basico',
    methodologyType: 'calistenia',
    exercises,
    selectionMode,
    focusGroup: isFocus ? focusGroup : null,
    sessionLabel,
    planLabel,
    isWeekendExtra
  });

  logger.info('✅ [CALISTENIA-SINGLE-DAY] Sesión generada:', sessionId, 'Ejercicios:', exercises.length);

  return {
    sessionId,
    workout: {
      id: sessionId,
      type: isFocus ? 'calistenia-focus-single' : 'calistenia-fullbody-single',
      nivel,
      level_source: levelSource,
      assessment: assessment || null,
      exercises_count: exercises.length,
      exercises
    }
  };
}
