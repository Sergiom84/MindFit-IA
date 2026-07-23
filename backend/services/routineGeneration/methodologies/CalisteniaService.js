/**
 * Servicio especializado de Calistenia
 * @module routineGeneration/methodologies/CalisteniaService
 */

import { pool } from '../../../db.js';
import { countByDiscipline, getRandomByLevel } from '../../exerciseRepository.js';
import { AI_MODULES } from '../../../config/aiConfigs.js';
import { getModuleOpenAI } from '../../../lib/openaiClient.js';
import { logger } from '../logger.js';
import { parseAIResponse } from '../ai/aiResponseParser.js';
import { getUserFullProfile } from '../database/userRepository.js';
import { normalizeUserProfile } from '../validators.js';
import { extractInjuryText, activeInjuryRules, isContraindicated } from '../injuryContraindications.js';
import {
  getProfileTrainingGoal,
  resolveTrainingFrequency,
  normalizeTrainingEnvironment,
  normalizeEquipmentSafetyConfirmed
} from '../../userProfileContract.js';
import { normalizeMethodologyLevel } from './methodologyRegistry.js';
import { assessCalistenia, isCalisthenicsAssessmentEnabled } from './calisteniaAssessment.js';
import {
  logSeparator,
  logAPICall,
  logUserProfile,
  logAIPayload,
  logAIResponse,
  logTokens,
  logError
} from '../../../utils/aiLogger.js';

/**
 * Unifica el input de evaluación/generación entre el contrato nuevo (`{ assessmentInput }`) y el
 * legacy plano (`planData.selectedLevel/demonstratedLevel/painStatus/context`), para que
 * evaluación, generación multi-semana y single-day compartan una única fuente de verdad
 * (PR-CAL-01, corrección de Sergio: "no mantener dos contratos").
 * @param {object} [planData]
 * @returns {{selfReportedLevel:*, demonstratedLevel:*, painStatus:*, context:*}}
 */
export function resolveAssessmentInput(planData = {}) {
  return planData.assessmentInput ?? {
    selfReportedLevel: planData.selectedLevel,
    demonstratedLevel: planData.demonstratedLevel,
    painStatus: planData.painStatus,
    context: planData.context
  };
}

/**
 * Construye el error tipado 422 de derivación profesional (`CALISTHENICS_ASSESSMENT_REFER`),
 * con el body público exacto que espera el frontend (nunca `error.message` crudo).
 */
function buildAssessmentReferError(assessment) {
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
  return err;
}

/**
 * Evaluar perfil de usuario para determinar nivel de calistenia (PR-CAL-01).
 *
 * El assessment determinista (`assessCalistenia`) SIEMPRE decide primero; la IA solo EXPLICA un
 * resultado ya cerrado (nunca propone un nivel distinto — cualquier "recommended_level" que
 * sugiera se ignora). 'refer' lanza un 422 tipado (derivar, no prescribir); 'insufficient_data'
 * devuelve el envelope con `recommended_level: null` sin invocar a la IA (no se inventa nivel); si
 * la IA falla en 'ok', se devuelve el assessment sin prosa en vez de un 500.
 *
 * @param {string} userId - ID del usuario
 * @param {object} [assessmentInput] - { selfReportedLevel, demonstratedLevel, painStatus, context }
 * @returns {Promise<object>} Envelope { success, evaluation: { decision, recommended_level, ... } }
 */
export async function evaluateCalisteniaLevel(userId, assessmentInput = {}) {
  logSeparator('CALISTENIA PROFILE EVALUATION');
  logAPICall('/specialist/calistenia/evaluate', 'POST', userId);

  let userProfile = null;
  try {
    userProfile = await getUserFullProfile(userId);
  } catch (profileError) {
    logger.warn(`⚠️ [CALISTENIA] No se pudo leer el perfil completo: ${profileError.message}`);
  }
  const normalizedProfile = userProfile ? normalizeUserProfile(userProfile) : null;
  if (normalizedProfile) logUserProfile(normalizedProfile, userId);

  const assessment = assessCalistenia({
    selfReportedLevel: assessmentInput.selfReportedLevel ?? userProfile?.nivel_entrenamiento,
    demonstratedLevel: assessmentInput.demonstratedLevel,
    experienceYears: userProfile?.anos_experiencia,
    injuryText: extractInjuryText(userProfile || {}),
    painStatus: assessmentInput.painStatus
  });

  if (assessment.decision === 'refer') {
    throw buildAssessmentReferError(assessment);
  }

  if (assessment.decision === 'insufficient_data') {
    return {
      success: true,
      evaluation: {
        decision: 'insufficient_data',
        recommended_level: null,
        confidence: assessment.confidence,
        reasons: assessment.reasons,
        limiting_patterns: assessment.limiting_patterns,
        reasoning: null
      }
    };
  }

  // decision === 'ok': el nivel YA está cerrado (assessment.level). La IA solo explica.
  let reasoning = null;
  let key_indicators = [];
  let suggested_focus_areas = [];
  let safety_considerations = [];
  let contraindicated_movements = [];
  let progression_timeline = 'No especificado';
  const config = AI_MODULES.CALISTENIA_SPECIALIST;

  try {
    const recentExercisesResult = await pool.query(`
      SELECT DISTINCT exercise_name, used_at
      FROM app.exercise_history
      WHERE user_id = $1
      ORDER BY used_at DESC
      LIMIT 20
    `, [userId]);

    const recentExercises = recentExercisesResult.rows.map(row => row.exercise_name);

    const aiPayload = {
      task: 'explain_calistenia_level',
      closed_level: assessment.level,
      close_reasons: assessment.reasons,
      limiting_patterns: assessment.limiting_patterns,
      user_profile: {
        ...(normalizedProfile || {}),
        recent_exercises: recentExercises
      }
    };
    logAIPayload('CALISTENIA_EVALUATION', aiPayload);

    const client = getModuleOpenAI(AI_MODULES.CALISTENIA_SPECIALIST);
    const completion = await client.chat.completions.create({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: `Eres un especialista en calistenia. El NIVEL YA FUE DECIDIDO por un sistema determinista ("${assessment.level}"); tu ÚNICA tarea es EXPLICARLO con lenguaje humano, NUNCA proponer un nivel distinto (cualquier nivel que sugieras se ignora).

INSTRUCCIONES (OBLIGATORIAS):
- Explica "closed_level" y "close_reasons" con lenguaje claro para el usuario, basándote SOLO en los datos reales del perfil. NO inventes ni asumas capacidades no evidenciadas.
- Si hay "limiting_patterns" (lesión), menciónalo explícitamente en "reasoning" y añade en "safety_considerations"/"contraindicated_movements" los movimientos a evitar/escalar (muñeca → planchas/pino/fondos/flexiones en apoyo de manos; codo → dominadas/dips/muscle-up; hombro → pino/pike/HSPU/dips; lumbar → front lever/hollow/L-sit/elevaciones de piernas; rodilla → pistols/saltos/zancadas).
- RESPONDE SOLO EN JSON PURO, SIN MARKDOWN. NO incluyas ningún campo de nivel ("recommended_level", "level", etc.) — se ignorará si lo incluyes.

FORMATO DE RESPUESTA:
{
  "reasoning": "Explicación del nivel ya cerrado, basada SOLO en datos reales; menciona cualquier lesión/limitación",
  "key_indicators": ["Factor 1", "Factor 2"],
  "suggested_focus_areas": ["Área 1", "Área 2"],
  "safety_considerations": ["Advertencia por lesión/limitación 1"],
  "contraindicated_movements": ["Movimiento a evitar/escalar por lesión"],
  "progression_timeline": "Tiempo estimado"
}`
        },
        {
          role: 'user',
          content: JSON.stringify(aiPayload)
        }
      ],
      temperature: 0.3,
      max_tokens: 800
    });

    const aiResponse = completion.choices[0].message.content;
    logAIResponse(aiResponse);
    logTokens(completion.usage);

    const evaluation = JSON.parse(parseAIResponse(aiResponse));
    reasoning = evaluation.reasoning || null;
    key_indicators = evaluation.key_indicators || [];
    suggested_focus_areas = evaluation.suggested_focus_areas || [];
    safety_considerations = evaluation.safety_considerations || [];
    contraindicated_movements = evaluation.contraindicated_movements || [];
    progression_timeline = evaluation.progression_timeline || 'No especificado';
  } catch (aiError) {
    // La IA solo explica; si falla, se devuelve el assessment cerrado sin prosa (nunca 500).
    logger.warn(`⚠️ [CALISTENIA] IA no disponible para explicar el nivel, se devuelve sin prosa: ${aiError.message}`);
    logError('CALISTENIA_SPECIALIST', aiError);
  }

  return {
    success: true,
    evaluation: {
      decision: 'ok',
      recommended_level: assessment.level,
      confidence: assessment.confidence,
      reasons: assessment.reasons,
      limiting_patterns: assessment.limiting_patterns,
      reasoning,
      key_indicators,
      suggested_focus_areas,
      safety_considerations,
      contraindicated_movements,
      progression_timeline
    },
    metadata: {
      model_used: config.model,
      evaluation_timestamp: new Date().toISOString()
    }
  };
}

// Columnas que necesita el motor de calistenia desde app.ejercicios.
const CALISTENIA_COLUMNS = `
  source_exercise_id AS exercise_id,
  nombre,
  nivel,
  categoria,
  patron,
  series_reps_objetivo,
  descanso_seg,
  tempo,
  criterio_de_progreso,
  progresion_hacia,
  como_hacerlo,
  consejos,
  gif_url
`;

// Descanso por defecto cuando la BD no lo especifica (muchas filas de calistenia
// tienen descanso_seg = null, p. ej. holds estáticos).
const DEFAULT_REST_SECONDS = 75;

// Etiquetas de día por defecto según frecuencia semanal.
const DEFAULT_DAY_LABELS = {
  3: ['Lunes', 'Miércoles', 'Viernes'],
  4: ['Lunes', 'Martes', 'Jueves', 'Viernes'],
  5: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
};

// Plantillas de sesión por frecuencia. Cada entrada `[categoria, n]` indica
// cuántos ejercicios de esa categoría componen la sesión (split Push/Pull/Legs/Core).
const SESSION_TEMPLATES = {
  3: [
    { nombre: 'Empuje + Core', plan: [['Empuje', 3], ['Core', 1]] },
    { nombre: 'Tracción + Piernas', plan: [['Tracción', 2], ['Piernas', 2]] },
    { nombre: 'Cuerpo completo', plan: [['Empuje', 1], ['Tracción', 1], ['Piernas', 1], ['Core', 1]] }
  ],
  4: [
    { nombre: 'Empuje', plan: [['Empuje', 3], ['Core', 1]] },
    { nombre: 'Tracción', plan: [['Tracción', 3], ['Core', 1]] },
    { nombre: 'Piernas', plan: [['Piernas', 3], ['Equilibrio/Soporte', 1]] },
    { nombre: 'Cuerpo completo', plan: [['Empuje', 1], ['Tracción', 1], ['Piernas', 1], ['Core', 1]] }
  ],
  5: [
    { nombre: 'Empuje', plan: [['Empuje', 3], ['Core', 1]] },
    { nombre: 'Tracción', plan: [['Tracción', 3], ['Core', 1]] },
    { nombre: 'Piernas', plan: [['Piernas', 3], ['Equilibrio/Soporte', 1]] },
    { nombre: 'Core & Skills', plan: [['Core', 2], ['Equilibrio/Soporte', 1], ['Empuje', 1]] },
    { nombre: 'Cuerpo completo', plan: [['Empuje', 1], ['Tracción', 1], ['Piernas', 1], ['Core', 1]] }
  ]
};

/**
 * Resuelve la clave de nivel de calistenia (PR-CAL-01, defecto G1/G2). Fuente ÚNICA: el
 * normalizador canónico del registry. Sustituye al fuzzy legacy que hacía pasar cualquier
 * valor por 'principiante' (default silencioso).
 *
 * Precedencia: `selectedLevel` (frontend) → `aiLevel` (evaluación IA) → `profileLevel`.
 *  - nivel AUSENTE (ninguno de los tres) → 'principiante' (default seguro, el más conservador);
 *  - nivel PROVISTO pero no reconocido por el registry (incl. 'elite', que es de crossfit) →
 *    error 422 tipado (`code: CALISTHENICS_LEVEL_UNRECOGNIZED`), NUNCA principiante silencioso.
 *
 * Función pura (sin BD): testeable directamente.
 * @param {{selectedLevel?:*, aiLevel?:*, profileLevel?:*}} sources
 * @returns {'principiante'|'intermedio'|'avanzado'}
 */
export function resolveCalisteniaLevelKey({ selectedLevel = null, aiLevel = null, profileLevel = null } = {}) {
  // Fuentes EXPLÍCITAS (petición del usuario o recomendación de IA): un valor provisto pero no
  // reconocido → 422 (no principiante silencioso).
  for (const explicit of [selectedLevel, aiLevel]) {
    if (explicit != null && String(explicit).trim() !== '') {
      const level = normalizeMethodologyLevel('calistenia', explicit);
      if (level === null) {
        const err = new Error(`Nivel de calistenia no reconocido: '${explicit}'`);
        err.statusCode = 422;
        err.code = 'CALISTHENICS_LEVEL_UNRECOGNIZED';
        throw err;
      }
      return level;
    }
  }
  // Fuente AMBIENTAL (nivel_entrenamiento del perfil): un valor legacy/sucio NO debe abortar la
  // generación (regresión H-C1). Si es canónico se respeta; si no, se ignora y cae al default
  // seguro 'principiante'. Nunca lanza por dato de perfil.
  return normalizeMethodologyLevel('calistenia', profileLevel) || 'principiante';
}

/**
 * Parsea "5-8x20-30s" → { series: '5-8', reps_objetivo: '20-30s' }.
 * Tolera ausencia de 'x' (usa reps completo) y null.
 */
function parseSeriesReps(raw) {
  const value = String(raw || '').trim();
  if (!value) return { series: '3', reps_objetivo: '8-12' };
  const idx = value.toLowerCase().indexOf('x');
  if (idx === -1) return { series: '3', reps_objetivo: value };
  return {
    series: value.slice(0, idx).trim() || '3',
    reps_objetivo: value.slice(idx + 1).trim() || '8-12'
  };
}

// ── Progresión MindFeed para Calistenia (Fase 3a, a nivel de plan_data) ──
// Cada microciclo (semana de entrenamiento) sube el objetivo de reps/tiempo
// dentro del rango del ejercicio; al alcanzar el tope se sugiere la variante
// (progresion_hacia). Cada DELOAD_EVERY semanas se aplica descarga (volumen).
const DELOAD_EVERY = 6;
const DELOAD_VOLUME_FACTOR = 0.5;

// Primer número de un rango "3-5" → 3 (mínimo de series).
function parseSeriesCount(seriesStr) {
  const m = String(seriesStr || '').match(/\d+/);
  const n = m ? parseInt(m[0], 10) : 3;
  return Number.isFinite(n) && n > 0 ? n : 3;
}

// Parsea "6-12", "20-30s", "8-12/lado" → { min, max, suffix, raw }.
function parseRepRange(repsStr) {
  const raw = String(repsStr || '').trim();
  const suffixMatch = raw.match(/(s)?(\/lado)?$/i);
  const suffix = suffixMatch ? suffixMatch[0] : '';
  const m = raw.match(/(\d+)\s*-\s*(\d+)/);
  if (!m) {
    const single = raw.match(/(\d+)/);
    const v = single ? parseInt(single[1], 10) : null;
    return { min: v, max: v, suffix, raw };
  }
  return { min: parseInt(m[1], 10), max: parseInt(m[2], 10), suffix, raw };
}

// Objetivo de reps progresivo para la semana de entrenamiento microIndex (1..totalMicro).
function progressedReps(range, microIndex, totalMicro) {
  if (range.min == null) return range.raw;
  if (range.min === range.max || totalMicro <= 1) return `${range.max}${range.suffix}`;
  const frac = Math.min(1, Math.max(0, (microIndex - 1) / (totalMicro - 1)));
  const value = Math.round(range.min + (range.max - range.min) * frac);
  return `${value}${range.suffix}`;
}

// Carga el ruleset MindFeed de calistenia desde app.mindfeed_rulesets (BD),
// con fallback a las constantes locales si no está disponible. Esto generaliza
// el motor de reglas por metodología (mismo mecanismo que HipertrofiaV2).
async function loadCalisteniaRuleset(dbClient) {
  const fallback = {
    deloadEvery: DELOAD_EVERY,
    volumeFactor: DELOAD_VOLUME_FACTOR,
    restDefault: DEFAULT_REST_SECONDS
  };
  try {
    // G7: se lee también la `version` REAL de la fila activa (antes se descartaba) para poder
    // persistirla en el plan. La función get_active_mindfeed_ruleset solo devuelve el JSON de
    // reglas, así que la versión se toma de la fila de app.mindfeed_rulesets.
    const result = await dbClient.query(
      `SELECT r.version, app.get_active_mindfeed_ruleset($1) AS rules
         FROM app.mindfeed_rulesets r
        WHERE r.scope = $1 AND r.is_active = true
        ORDER BY r.version DESC NULLS LAST
        LIMIT 1`,
      ['calistenia_v2']
    );
    const row = result.rows[0] || {};
    const rules = row.rules || {};
    return {
      deloadEvery: Number(rules?.deloadRules?.deloadEvery) || fallback.deloadEvery,
      volumeFactor: Number(rules?.deloadRules?.volumeFactor) || fallback.volumeFactor,
      restDefault: Number(rules?.restSecondsDefault) || fallback.restDefault,
      version: row.version ?? rules?.meta?.spec ?? null,
      scope: 'calistenia_v2'
    };
  } catch (error) {
    logger.warn(`⚠️ [CALISTENIA] No se pudo cargar ruleset calistenia_v2, usando fallback: ${error.message}`);
    return { ...fallback, version: null, scope: 'calistenia_v2' };
  }
}

/**
 * Selector con baraja + cursor por categoría: entrega ejercicios sin repetir
 * dentro de una misma sesión; entre sesiones puede reciclar si el pool es pequeño.
 */
function buildExercisePicker(exercisesByCategory) {
  const cursors = {};
  return function pick(categoria, n) {
    const pool = exercisesByCategory[categoria] || [];
    const out = [];
    if (pool.length === 0) return out;
    let cursor = cursors[categoria] || 0;
    const seenInSession = new Set();
    let guard = 0;
    while (out.length < n && guard < pool.length * 2) {
      const ex = pool[cursor % pool.length];
      cursor += 1;
      guard += 1;
      if (!seenInSession.has(ex.exercise_id)) {
        seenInSession.add(ex.exercise_id);
        out.push(ex);
      }
    }
    cursors[categoria] = cursor;
    return out;
  };
}

/**
 * Construye un ejercicio del plan a partir de una fila de app.ejercicios,
 * aplicando la progresión MindFeed del microciclo (Fase 3a).
 *
 * @param {object} progression - { weekNumber, microIndex, totalMicro, isDeload }
 */
function toPlanExercise(ex, orden, sessionId, progression = null, ruleset = null) {
  const volumeFactor = ruleset?.volumeFactor ?? DELOAD_VOLUME_FACTOR;
  const restDefault = ruleset?.restDefault ?? DEFAULT_REST_SECONDS;
  const { series: seriesRaw, reps_objetivo: repsRaw } = parseSeriesReps(ex.series_reps_objetivo);
  const range = parseRepRange(repsRaw);
  const baseSeries = parseSeriesCount(seriesRaw);

  let series = baseSeries;
  let repsObjetivo = repsRaw;
  let esDeload = false;
  let listoParaProgresar = false;
  let notas = '';

  if (progression) {
    const { microIndex, totalMicro, isDeload } = progression;
    if (isDeload) {
      // Descarga: menos volumen (series), reps al extremo bajo del rango.
      esDeload = true;
      series = Math.max(1, Math.round(baseSeries * volumeFactor));
      repsObjetivo = range.min != null ? `${range.min}${range.suffix}` : repsRaw;
      notas = 'Semana de descarga: reduce el volumen y prioriza técnica.';
    } else {
      // Progresión de reps/tiempo dentro del rango.
      repsObjetivo = progressedReps(range, microIndex, totalMicro);
      // Al alcanzar el tope del rango, sugerir la variante más difícil.
      const reached = range.max != null && String(repsObjetivo).startsWith(String(range.max));
      if (reached && ex.progresion_hacia) {
        listoParaProgresar = true;
        notas = `Objetivo alcanzado: cuando completes ${range.max}${range.suffix} con técnica perfecta, progresa a "${ex.progresion_hacia}".`;
      }
    }
  }

  return {
    id: `${sessionId}-E${orden}`,
    orden,
    exercise_id: ex.exercise_id,
    nombre: ex.nombre,
    categoria: ex.categoria,
    patron: ex.patron,
    patron_movimiento: ex.patron,
    tipo_ejercicio: 'calistenia',
    series,
    reps_objetivo: repsObjetivo,
    series_reps_objetivo: ex.series_reps_objetivo || null,
    rep_range: range.min != null ? { min: range.min, max: range.max, suffix: range.suffix } : null,
    descanso_seg: ex.descanso_seg ?? restDefault,
    tempo: ex.tempo || null,
    como_hacerlo: ex.como_hacerlo || null,
    criterio_de_progreso: ex.criterio_de_progreso || null,
    progresion_hacia: ex.progresion_hacia || null,
    variante_sugerida: listoParaProgresar ? ex.progresion_hacia : null,
    es_deload: esDeload,
    listo_para_progresar: listoParaProgresar,
    notas
  };
}

/**
 * Generar plan de entrenamiento de calistenia (motor determinista v1).
 *
 * Replica el patrón estructural de HipertrofiaV2 (generateD1D5Plan): selecciona
 * ejercicios de app.ejercicios (disciplina='calistenia') por nivel acumulativo,
 * construye plantillas de sesión (split Push/Pull/Legs/Core) y las repite a lo
 * largo de las semanas. Persiste como draft en app.methodology_plans y devuelve
 * el contrato que espera el frontend ({ success, plan, planId, metadata }).
 *
 * @param {string} userId - ID del usuario
 * @param {object} planData - { selectedLevel, aiEvaluation, goals, ... }
 * @returns {Promise<object>} Plan generado
 */
export async function generateCalisteniaPlan(userId, planData = {}) {
  const startedAt = Date.now();
  logSeparator('CALISTENIA PLAN GENERATION');
  logAPICall('/specialist/calistenia/generate', 'POST', userId);

  let userProfile = null;
  try {
    userProfile = await getUserFullProfile(userId);
  } catch (profileError) {
    logger.warn(`⚠️ [CALISTENIA] No se pudo leer el perfil completo: ${profileError.message}`);
  }

  // 1) Nivel. Con el flag OFF = LECTURA LEGACY: prioriza selectedLevel → evaluación IA → perfil
  //    (nivel provisto no reconocido → 422; ausente → default seguro 'principiante').
  //    Con el flag ON (default, PR-CAL-01), el assessment determinista es la AUTORIDAD: la IA
  //    solo explica. 'refer' → 422 (derivar, no prescribir). 'insufficient_data' NUNCA cae a
  //    'principiante' en silencio: solo admite un fallback provisional si el usuario ya
  //    seleccionó un nivel explícito o confirmó continuar así; si no, 422
  //    `CALISTHENICS_LEVEL_REQUIRED`. `levelSource` viaja siempre en el plan para que nunca quede
  //    oculto que el nivel usado era provisional (corrección de Sergio).
  const assessmentInput = resolveAssessmentInput(planData);
  let assessment = null;
  let levelKey;
  let levelSource;
  if (isCalisthenicsAssessmentEnabled()) {
    assessment = assessCalistenia({
      selfReportedLevel: assessmentInput.selfReportedLevel ?? userProfile?.nivel_entrenamiento,
      demonstratedLevel: assessmentInput.demonstratedLevel,
      experienceYears: userProfile?.anos_experiencia,
      injuryText: extractInjuryText(userProfile || {}),
      painStatus: assessmentInput.painStatus
    });

    if (assessment.decision === 'refer') {
      throw buildAssessmentReferError(assessment);
    }

    if (assessment.decision === 'insufficient_data') {
      const explicitSelected = planData.selectedLevel != null && String(planData.selectedLevel).trim() !== '';
      const confirmedProvisional = planData.acceptProvisionalLevel === true;
      if (!explicitSelected && !confirmedProvisional) {
        const err = new Error(
          'Selecciona un nivel o confirma continuar con un nivel provisional antes de generar el entrenamiento.'
        );
        err.statusCode = 422;
        err.code = 'CALISTHENICS_LEVEL_REQUIRED';
        throw err;
      }
      levelKey = explicitSelected
        ? resolveCalisteniaLevelKey({ selectedLevel: planData.selectedLevel, aiLevel: null, profileLevel: null })
        : 'principiante';
      levelSource = explicitSelected ? 'user_selected' : 'provisional_safe_fallback';
    } else {
      levelKey = assessment.level;
      levelSource = 'assessment';
    }
  } else {
    levelKey = resolveCalisteniaLevelKey({
      selectedLevel: planData.selectedLevel,
      aiLevel: planData.aiEvaluation?.recommended_level,
      profileLevel: userProfile?.nivel_entrenamiento
    });
    levelSource = 'legacy_resolution';
  }

  const levels = getCalisteniaLevels();
  const levelConfig = levels[levelKey] || levels.principiante;
  const nivelLabel = levelConfig.name; // 'Principiante' | 'Intermedio' | 'Avanzado'
  const frecuencia = resolveTrainingFrequency(
    planData.frecuencia_semanal ?? userProfile?.frecuencia_semanal,
    levelConfig.sessions_per_week,
    Object.keys(SESSION_TEMPLATES)
  );
  const totalWeeks = levelConfig.duration_weeks;
  const trainingGoal = getProfileTrainingGoal(userProfile, planData.goals);

  logger.info(`🤸 [CALISTENIA] Nivel: ${nivelLabel}, ${frecuencia} días/sem, ${totalWeeks} semanas`);

  // 2) Cargar pool de ejercicios (nivel acumulativo) y agrupar por categoría.
  const exercises = await getRandomByLevel(pool, {
    disciplina: 'calistenia',
    level: levelKey,
    limit: 500,
    columns: CALISTENIA_COLUMNS
  });

  if (!exercises || exercises.length === 0) {
    throw new Error('No se encontraron ejercicios de calistenia para el nivel seleccionado');
  }

  // 🩹 SEGURIDAD POR LESIÓN: leer limitaciones físicas del perfil y excluir del
  // pool los movimientos contraindicados (p.ej. muñeca → planchas/pino/fondos;
  // codo → dominadas/dips/muscle-up; hombro → pino/pike/HSPU). El motor es
  // determinista, así que este filtro es la única barrera real.
  const injuryText = extractInjuryText(userProfile);
  const injuryRules = activeInjuryRules(injuryText);
  const injuryZones = injuryRules.map((r) => r.zona);

  const exercisesByCategory = {};
  const excludedByInjury = [];
  for (const ex of exercises) {
    if (isContraindicated(ex, injuryRules)) {
      excludedByInjury.push(ex.nombre);
      continue;
    }
    (exercisesByCategory[ex.categoria] ||= []).push(ex);
  }

  // Pool SEGURO (solo ejercicios no contraindicados). NUNCA reintroducimos los
  // excluidos: si una lesión vacía toda una categoría (p.ej. muñeca elimina todo
  // "Empuje" por apoyo de manos), esa categoría se cubre luego con ejercicios
  // seguros de otras categorías (ver relleno en la construcción de plantillas).
  const allExercises = Object.values(exercisesByCategory).flat();
  if (allExercises.length === 0) {
    throw new Error('No hay ejercicios de calistenia seguros para las limitaciones indicadas');
  }
  if (injuryRules.length) {
    logger.info(`🩹 [CALISTENIA] Filtro de lesiones activo (${injuryZones.join(', ') || 'ninguna'}). Excluidos: ${excludedByInjury.length} movimientos`);
  }
  const pick = buildExercisePicker(exercisesByCategory);

  // 3) Construir plantillas de sesión (selección única, reutilizada por semana).
  const templates = (SESSION_TEMPLATES[frecuencia] || SESSION_TEMPLATES[3]).map((tpl, idx) => {
    const sessionId = `T-D${idx + 1}`;
    const chosen = [];
    const grupos = new Set();
    const chosenIds = new Set();
    const expected = tpl.plan.reduce((sum, [, n]) => sum + n, 0);
    for (const [categoria, n] of tpl.plan) {
      for (const ex of pick(categoria, n)) {
        if (chosenIds.has(ex.exercise_id)) continue;
        chosen.push(ex);
        chosenIds.add(ex.exercise_id);
        grupos.add(ex.categoria);
      }
    }
    // 🩹 Relleno con ejercicios SEGUROS de otras categorías: si una lesión vació
    // la categoría objetivo (p.ej. "Empuje" con lesión de muñeca), la sesión se
    // completa con movimientos permitidos en vez de quedarse corta o reintroducir
    // los contraindicados. Mantiene el número de ejercicios de la sesión.
    if (chosen.length < expected) {
      for (const ex of allExercises) {
        if (chosen.length >= expected) break;
        if (chosenIds.has(ex.exercise_id)) continue;
        chosen.push(ex);
        chosenIds.add(ex.exercise_id);
        grupos.add(ex.categoria);
      }
    }
    // Garantía anti-vacío final.
    if (chosen.length === 0 && allExercises.length > 0) {
      chosen.push(allExercises[idx % allExercises.length]);
      grupos.add(chosen[0].categoria);
    }
    return {
      nombre: tpl.nombre,
      grupos_musculares: Array.from(grupos),
      ejercicios: chosen
    };
  });

  // 4) Expandir plantillas a semanas/sesiones aplicando progresión MindFeed.
  // Reglas (deload, descanso) cargadas desde app.mindfeed_rulesets (scope calistenia_v2).
  const ruleset = await loadCalisteniaRuleset(pool);
  const dayLabels = DEFAULT_DAY_LABELS[frecuencia] || DEFAULT_DAY_LABELS[3];
  const semanas = [];
  // Semanas de descarga (cada deloadEvery) y total de microciclos de entrenamiento.
  const isDeloadWeek = (w) => w % ruleset.deloadEvery === 0;
  const totalMicro = Array.from({ length: totalWeeks }, (_, i) => i + 1).filter((w) => !isDeloadWeek(w)).length;
  let microIndex = 0;

  for (let w = 1; w <= totalWeeks; w++) {
    const deload = isDeloadWeek(w);
    if (!deload) microIndex += 1;
    const progression = { weekNumber: w, microIndex, totalMicro, isDeload: deload };

    const sesiones = templates.map((tpl, dIdx) => {
      const sessionId = `W${w}-D${dIdx + 1}`;
      return {
        id: sessionId,
        dia: dayLabels[dIdx] || `Día ${dIdx + 1}`,
        fecha: null,
        orden: dIdx + 1,
        nombre: tpl.nombre,
        descripcion: `Sesión de ${tpl.nombre.toLowerCase()}`,
        coach_tip: deload
          ? 'Semana de descarga: baja el volumen, mantén la técnica y recupera.'
          : 'Prioriza la técnica y el control del movimiento; sube reps según el objetivo de la semana.',
        grupos_musculares: tpl.grupos_musculares,
        es_deload: deload,
        ejercicios: tpl.ejercicios.map((ex, eIdx) => toPlanExercise(ex, eIdx + 1, sessionId, progression, ruleset))
      };
    });

    semanas.push({
      numero: w,
      tipo: deload ? 'deload' : 'entrenamiento',
      es_deload: deload,
      objetivo: deload
        ? 'Semana de descarga (deload): recuperación y consolidación técnica.'
        : `Microciclo ${microIndex}/${totalMicro}: progresión de repeticiones. ${levelConfig.description}`,
      sesiones
    });
  }

  // Contexto de entorno/equipo (PR-CAL-01 Subfase B/D, G7). El equipamiento se LEE de la fuente
  // canónica app.user_equipment (no se duplica). Es INFORMATIVO: el filtro por equipo se difiere a
  // CAL-02A (vocabulario de app.ejercicios.equipamiento sucio/compuesto). training_environment y
  // equipment_safety_confirmed salen del perfil (o del passthrough del Card); ausente → null.
  let availableEquipment = null;
  try {
    const eqRes = await pool.query(
      `SELECT equipment_type FROM app.user_equipment
        WHERE user_id = $1 AND has_equipment = true
        ORDER BY equipment_type`,
      [userId]
    );
    availableEquipment = eqRes.rows.map((r) => r.equipment_type);
  } catch (eqErr) {
    logger.warn(`⚠️ [CALISTENIA] No se pudo leer user_equipment: ${eqErr.message}`);
  }
  const planContext = {
    training_environment: normalizeTrainingEnvironment(
      planData.context?.training_environment ?? userProfile?.training_environment
    ),
    equipment_safety_confirmed: normalizeEquipmentSafetyConfirmed(
      planData.context?.equipment_safety_confirmed ?? userProfile?.equipment_safety_confirmed
    ),
    available_equipment: availableEquipment,
    equipment_filter_applied: false // diferido a CAL-02A (catálogo de equipamiento por sanear)
  };

  // 5) Estructura del plan.
  const fechaInicio = new Date().toISOString();
  const plan = {
    metodologia: 'Calistenia',
    version: 'calistenia_v2',
    nivel: nivelLabel,
    total_weeks: totalWeeks,
    duracion_total_semanas: totalWeeks,
    frecuencia_semanal: frecuencia,
    fecha_inicio: fechaInicio,
    sessions_per_week: frecuencia,
    objetivo: trainingGoal,
    restricciones_lesion: {
      zonas: injuryZones,
      limitaciones_texto: injuryText || null,
      movimientos_excluidos: excludedByInjury
    },
    configuracion: {
      progression_type: 'microcycle_reps',
      progression_model: 'reps_to_variant',
      deload_every_weeks: ruleset.deloadEvery,
      deload_volume_factor: ruleset.volumeFactor,
      sessions_per_week: frecuencia,
      duration_weeks: totalWeeks,
      rest_default_seconds: ruleset.restDefault,
      ruleset_scope: 'calistenia_v2',
      source: 'calistenia_v2_progressive'
    },
    // G7: versión REAL del ruleset de BD (antes se descartaba) + contexto de entorno/equipo +
    // assessment determinista (null en modo legacy con el flag off).
    ruleset_version: ruleset.version ?? null,
    context: planContext,
    assessment: assessment || null,
    resolved_level: levelKey,
    level_source: levelSource,
    semanas
  };

  // 6) Persistir como draft (la activación/fecha de inicio la fija el frontend al confirmar).
  const planResult = await pool.query(`
    INSERT INTO app.methodology_plans (
      user_id, methodology_type, plan_data, generation_mode, status, created_at
    )
    VALUES ($1, $2, $3, $4, $5, NOW())
    RETURNING id
  `, [userId, 'Calistenia', JSON.stringify(plan), 'manual', 'draft']);

  const methodologyPlanId = planResult.rows[0].id;
  plan.methodologyPlanId = methodologyPlanId;

  const processingTime = Math.round((Date.now() - startedAt) / 100) / 10;
  logger.info(`✅ [CALISTENIA] Plan generado con ID: ${methodologyPlanId} (${processingTime}s)`);

  return {
    success: true,
    plan,
    planId: methodologyPlanId,
    methodologyPlanId,
    methodology: 'calistenia',
    metadata: {
      plan_start_date: fechaInicio.split('T')[0],
      processing_time_seconds: processingTime,
      generatedAt: fechaInicio,
      level: nivelLabel,
      total_exercises_pool: allExercises.length
    }
  };
}

/**
 * Obtener niveles disponibles de calistenia
 * @returns {object} Niveles con descripciones
 */
export function getCalisteniaLevels() {
  return {
    principiante: {
      name: 'Principiante',
      description: '0-1 años de experiencia. Enfoque en técnica básica y fundamentos.',
      duration_weeks: 8,
      sessions_per_week: 3
    },
    intermedio: {
      name: 'Intermedio',
      description: '1-3 años de experiencia. Domina movimientos básicos, progresiones avanzadas.',
      duration_weeks: 10,
      sessions_per_week: 4
    },
    avanzado: {
      name: 'Avanzado',
      description: '+3 años de experiencia. Ejecuta ejercicios complejos, skills avanzados.',
      duration_weeks: 12,
      sessions_per_week: 5
    }
  };
}
