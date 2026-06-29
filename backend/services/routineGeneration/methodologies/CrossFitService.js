/**
 * Servicio especializado de CrossFit
 * @module routineGeneration/methodologies/CrossFitService
 */

import { pool } from '../../../db.js';
import { AI_MODULES } from '../../../config/aiConfigs.js';
import { getModuleOpenAI } from '../../../lib/openaiClient.js';
import { logger } from '../logger.js';
import { parseAIResponse } from '../ai/aiResponseParser.js';
import { getUserFullProfile } from '../database/userRepository.js';
import { normalizeUserProfile } from '../validators.js';
import {
  buildExercisePicker,
  buildTemplates,
  buildSemanas,
  persistPlanDraft,
  buildPlanResult
} from './planEngine.js';
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
 * Evaluar perfil de usuario para determinar nivel de CrossFit
 * @param {string} userId - ID del usuario
 * @returns {Promise<object>} Evaluación con nivel recomendado
 */
export async function evaluateCrossFitLevel(userId) {
  try {
    logSeparator('CROSSFIT PROFILE EVALUATION');
    logAPICall('/specialist/crossfit/evaluate', 'POST', userId);

    const userProfile = await getUserFullProfile(userId);
    const normalizedProfile = normalizeUserProfile(userProfile);

    logUserProfile(normalizedProfile, userId);

    // Llamar a IA con prompt especializado
    const client = getModuleOpenAI(AI_MODULES.CROSSFIT_SPECIALIST);
    const config = AI_MODULES.CROSSFIT_SPECIALIST;

    const aiPayload = {
      user_profile: normalizedProfile,
      evaluation_type: 'crossfit_level',
      task: 'Determinar nivel de CrossFit (principiante/intermedio/avanzado/elite) basado en las 10 habilidades físicas generales y experiencia en los 3 dominios metabólicos'
    };

    logAIPayload('CROSSFIT_EVALUATION', aiPayload);

    const completion = await client.chat.completions.create({
      model: config.model,
      messages: [
        {
          role: 'system',
          content: `Eres un evaluador especializado en CrossFit Level-2. Analiza el perfil del usuario y determina su nivel de CrossFit.

RESPONDE SOLO EN JSON PURO, SIN MARKDOWN.

Niveles válidos: principiante, intermedio, avanzado, elite

Criterios basados en las 10 habilidades físicas y experiencia:
- Principiante (Scaled): 0-12 meses de CrossFit, aprendiendo movimientos base, necesita scaling
- Intermedio (RX): 1-3 años, completa WODs RX, pull-ups, double-unders, cargas estándar (95/65 thrusters)
- Avanzado (RX+): 3-5 años, muscle-ups, HSPUs, cargas pesadas, tiempos competitivos
- Elite: 5+ años competitivo, Open/Quarterfinals, domina movimientos avanzados, levantamientos élite

FORMATO EXACTO:
{
  "recommended_level": "principiante|intermedio|avanzado|elite",
  "confidence": 0.75,
  "reasoning": "Explicación detallada basada en las 10 habilidades",
  "key_indicators": ["Factor 1", "Factor 2"],
  "suggested_focus_areas": ["Gymnastic", "Weightlifting", "Monostructural"],
  "safety_considerations": ["Advertencia 1", "Advertencia 2"],
  "benchmark_targets": {
    "fran": "Sub-8 min",
    "helen": "Sub-12 min",
    "back_squat": "1.5x BW"
  }
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

    // Parsear respuesta
    let evaluation;
    try {
      evaluation = JSON.parse(parseAIResponse(aiResponse));
    } catch (parseError) {
      logger.error('Error parseando respuesta IA:', parseError);
      throw new Error('Respuesta de IA inválida');
    }

    // Validar respuesta
    const normalizedLevel = evaluation.recommended_level.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    return {
      success: true,
      evaluation: {
        recommended_level: normalizedLevel,
        confidence: evaluation.confidence,
        reasoning: evaluation.reasoning,
        key_indicators: evaluation.key_indicators || [],
        suggested_focus_areas: evaluation.suggested_focus_areas || [],
        safety_considerations: evaluation.safety_considerations || [],
        benchmark_targets: evaluation.benchmark_targets || {}
      },
      metadata: {
        model_used: config.model,
        evaluation_timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    logger.error('Error en evaluación de CrossFit:', error);
    logError('CROSSFIT_SPECIALIST', error);
    throw error;
  }
}

// Niveles acumulativos de CrossFit (la tabla tiene Principiante/Intermedio/Avanzado/Elite).
const CROSSFIT_LEVEL_ORDER = ['Principiante', 'Intermedio', 'Avanzado', 'Elite'];

function allowedCrossFitLevels(levelKey) {
  const idx = { principiante: 0, intermedio: 1, avanzado: 2, elite: 3 }[levelKey] ?? 0;
  return CROSSFIT_LEVEL_ORDER.slice(0, idx + 1);
}

function normalizeCrossFitLevel(raw) {
  const lvl = String(raw || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (lvl.includes('elite')) return 'elite';
  if (lvl.includes('avanz')) return 'avanzado';
  if (lvl.includes('inter')) return 'intermedio';
  return 'principiante';
}

// Plantillas de sesión tipo WOD; cada `[dominio, n]` toma n movimientos de ese dominio.
const CROSSFIT_SESSION_TEMPLATES = [
  { nombre: 'WOD Fuerza + Metcon', plan: [['Weightlifting', 1], ['Gymnastic', 1], ['Monostructural', 1], ['Accesorios', 1]] },
  { nombre: 'WOD Gymnastic', plan: [['Gymnastic', 2], ['Monostructural', 1], ['Accesorios', 1]] },
  { nombre: 'WOD Weightlifting', plan: [['Weightlifting', 2], ['Monostructural', 1], ['Gymnastic', 1]] },
  { nombre: 'WOD Mixto (Chipper)', plan: [['Weightlifting', 1], ['Gymnastic', 1], ['Monostructural', 2]] },
  { nombre: 'WOD AMRAP', plan: [['Gymnastic', 1], ['Weightlifting', 1], ['Monostructural', 1], ['Accesorios', 1]] },
  { nombre: 'WOD EMOM', plan: [['Weightlifting', 1], ['Gymnastic', 1], ['Monostructural', 1], ['Accesorios', 1]] }
];

function repsObjetivoFromWod(ex) {
  switch (String(ex.tipo_wod || '').toLowerCase()) {
    case 'amrap': return 'Máximas reps en el tiempo';
    case 'emom': return 'Reps fijas por minuto';
    case 'for time': return 'Completar reps lo antes posible';
    case 'for distance': return 'Máxima distancia';
    case 'strength': return ex.rx_carga_sugerida || 'Carga progresiva';
    default: return ex.intensidad || 'Según WOD';
  }
}

// Carga el ruleset MindFeed de CrossFit desde app.mindfeed_rulesets (BD), con
// fallback a valores locales si no está disponible. Generaliza el motor de
// reglas por metodología (mismo mecanismo que HipertrofiaV2 / calistenia_v2).
async function loadCrossFitRuleset(client = pool) {
  const fallback = {
    restDefault: 60,
    deloadEvery: 4,
    volumeFactor: 0.6,
    scales: ['scaled', 'rx', 'rxplus']
  };
  try {
    const result = await client.query(
      'SELECT app.get_active_mindfeed_ruleset($1) AS rules',
      ['crossfit_v1']
    );
    const rules = result.rows[0]?.rules || {};
    return {
      restDefault: Number(rules?.restSecondsDefault) || fallback.restDefault,
      deloadEvery: Number(rules?.deloadRules?.deloadEvery) || fallback.deloadEvery,
      volumeFactor: Number(rules?.deloadRules?.volumeFactor) || fallback.volumeFactor,
      scales: Array.isArray(rules?.progression?.scales) ? rules.progression.scales : fallback.scales
    };
  } catch (error) {
    logger.warn(`⚠️ [CROSSFIT] No se pudo cargar ruleset crossfit_v1, usando fallback: ${error.message}`);
    return fallback;
  }
}

/**
 * Mapea una fila de Ejercicios_CrossFit a un ejercicio del plan.
 */
function toCrossFitExercise(ex, orden, sessionId, restDefault = 60) {
  return {
    id: `${sessionId}-E${orden}`,
    orden,
    exercise_id: ex.exercise_id,
    nombre: ex.nombre,
    categoria: ex.categoria,
    dominio: ex.dominio,
    equipamiento: ex.equipamiento || null,
    tipo_ejercicio: 'crossfit',
    tipo_wod: ex.tipo_wod || null,
    intensidad: ex.intensidad || null,
    series: '1',
    reps_objetivo: repsObjetivoFromWod(ex),
    duracion_seg: ex.duracion_seg ?? null,
    descanso_seg: ex.descanso_seg ?? restDefault,
    rx_carga_sugerida: ex.rx_carga_sugerida || null,
    escalamiento: ex.escalamiento || null,
    como_hacerlo: ex.como_hacerlo || null,
    notas: ex.notas || ''
  };
}

/**
 * Generar plan de entrenamiento de CrossFit (motor determinista v1).
 * Fuente: tabla viva "Ejercicios_CrossFit". Estructura: WODs que mezclan dominios.
 */
export async function generateCrossFitPlan(userId, planData = {}) {
  const startedAt = Date.now();
  logSeparator('CROSSFIT PLAN GENERATION');
  logAPICall('/specialist/crossfit/generate', 'POST', userId);

  const levelKey = normalizeCrossFitLevel(
    planData.selectedLevel || planData.level || planData.aiEvaluation?.recommended_level || 'principiante'
  );
  const levels = getCrossFitLevels();
  const levelConfig = levels[levelKey] || levels.principiante;
  const nivelLabel = levelConfig.name;
  const frecuencia = levelConfig.sessions_per_week;
  const totalWeeks = levelConfig.duration_weeks;

  logger.info(`🏋️ [CROSSFIT] Nivel: ${nivelLabel}, ${frecuencia} días/sem, ${totalWeeks} semanas`);

  // Cargar ejercicios de los niveles permitidos (tabla viva con columnas acentuadas).
  const { rows: exercises } = await pool.query(`
    SELECT exercise_id, nombre, nivel, dominio, categoria, equipamiento,
           tipo_wod, intensidad, duracion_seg, descanso_seg,
           escalamiento, notas, rx_carga_sugerida,
           "Cómo_hacerlo" AS como_hacerlo
      FROM "Ejercicios_CrossFit"
     WHERE nivel = ANY($1::text[])
     ORDER BY RANDOM()
  `, [allowedCrossFitLevels(levelKey)]);

  if (!exercises || exercises.length === 0) {
    throw new Error('No se encontraron ejercicios de CrossFit para el nivel seleccionado');
  }

  const poolByDomain = {};
  for (const ex of exercises) (poolByDomain[ex.dominio] ||= []).push(ex);

  // Reglas (descanso, deload, escalas) cargadas desde app.mindfeed_rulesets (scope crossfit_v1).
  const ruleset = await loadCrossFitRuleset(pool);

  const pick = buildExercisePicker(poolByDomain);
  const templateSpecs = CROSSFIT_SESSION_TEMPLATES.slice(0, frecuencia);
  const templates = buildTemplates(templateSpecs, pick, exercises);

  const semanas = buildSemanas({
    templates,
    totalWeeks,
    frecuencia,
    objetivo: levelConfig.description,
    coachTip: 'Calienta bien, escala el WOD a tu nivel y prioriza la mecánica antes que la intensidad.',
    toExercise: (ex, orden, sid) => toCrossFitExercise(ex, orden, sid, ruleset.restDefault)
  });

  const plan = {
    metodologia: 'CrossFit',
    version: 'crossfit_v1',
    nivel: nivelLabel,
    total_weeks: totalWeeks,
    duracion_total_semanas: totalWeeks,
    frecuencia_semanal: frecuencia,
    fecha_inicio: new Date().toISOString(),
    objetivo: planData.goals || levelConfig.description,
    benchmark_targets: levelConfig.benchmark_targets || {},
    configuracion: {
      progression_type: 'scale_progression',
      sessions_per_week: frecuencia,
      duration_weeks: totalWeeks,
      source: 'crossfit_v1_deterministic',
      ruleset: 'crossfit_v1',
      rest_default: ruleset.restDefault,
      deload_every: ruleset.deloadEvery,
      volume_factor: ruleset.volumeFactor,
      scales: ruleset.scales
    },
    semanas
  };

  const planId = await persistPlanDraft(userId, 'CrossFit', plan);
  logger.info(`✅ [CROSSFIT] Plan generado con ID: ${planId}`);

  return buildPlanResult({
    plan, planId, methodology: 'crossfit', startedAt,
    extraMeta: { level: nivelLabel, total_exercises_pool: exercises.length }
  });
}

/**
 * Obtener niveles disponibles de CrossFit
 * @returns {object} Niveles con descripciones
 */
export function getCrossFitLevels() {
  return {
    principiante: {
      name: 'Principiante (Scaled)',
      description: '0-12 meses de CrossFit. Aprendiendo movimientos base, necesita scaling.',
      duration_weeks: 8,
      sessions_per_week: 3,
      benchmark_targets: {
        fran: 'Scaled',
        helen: 'Scaled',
        back_squat: '1x BW'
      }
    },
    intermedio: {
      name: 'Intermedio (RX)',
      description: '1-3 años. Completa WODs RX, pull-ups, double-unders, cargas estándar.',
      duration_weeks: 10,
      sessions_per_week: 4,
      benchmark_targets: {
        fran: 'Sub-8 min',
        helen: 'Sub-12 min',
        back_squat: '1.5x BW'
      }
    },
    avanzado: {
      name: 'Avanzado (RX+)',
      description: '3-5 años. Muscle-ups, HSPUs, cargas pesadas, tiempos competitivos.',
      duration_weeks: 12,
      sessions_per_week: 5,
      benchmark_targets: {
        fran: 'Sub-5 min',
        helen: 'Sub-9 min',
        back_squat: '2x BW'
      }
    },
    elite: {
      name: 'Elite',
      description: '5+ años competitivo. Open/Quarterfinals, movimientos avanzados.',
      duration_weeks: 12,
      sessions_per_week: 6,
      benchmark_targets: {
        fran: 'Sub-3 min',
        helen: 'Sub-7 min',
        back_squat: '2.5x BW'
      }
    }
  };
}
