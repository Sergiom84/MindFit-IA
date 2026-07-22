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
import { extractInjuryText, activeInjuryRules, isContraindicated } from '../injuryContraindications.js';
import {
  getProfileTrainingGoal,
  resolveTrainingFrequency
} from '../../userProfileContract.js';
import { getCrossfitFeatureFlags } from '../../crossfit/featureFlags.js';
import { generateCrossfitProductPlan } from '../../crossfit/integration/productPlanService.js';
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

REGLAS DE EVALUACIÓN (OBLIGATORIAS):
1. Básate SOLO en los datos reales del perfil (experiencia declarada, objetivos, nivel indicado). NO inventes ni asumas capacidades no evidenciadas: no afirmes que el usuario "completa WODs RX", "hace muscle-ups" o "domina HSPU" salvo que el perfil lo indique explícitamente.
2. Ante ambigüedad o falta de datos, sé CONSERVADOR y baja un nivel (la seguridad prima sobre el rendimiento).
3. Los descriptores de nivel son PERFILES TÍPICOS de referencia, NO afirmaciones sobre este usuario.
4. LESIONES/LIMITACIONES: revisa "limitaciones_fisicas" del perfil. Si hay lesión (p.ej. hombro, lumbar, rodilla), NO subas el nivel por rendimiento; añade en "safety_considerations" y "contraindicated_movements" los patrones a evitar/escalar (hombro → overhead/press/kipping/muscle-up/HSPU; lumbar → peso muerto/swing/box jump; rodilla → saltos/pistols/zancadas). El campo "reasoning" debe mencionar explícitamente la limitación.

Perfiles típicos de referencia (NO asumir que el usuario los cumple):
- Principiante (Scaled): típico de 0-12 meses, aprendiendo movimientos base, requiere scaling
- Intermedio (RX): típico de 1-3 años, suele manejar pull-ups/double-unders y cargas estándar (95/65 thrusters)
- Avanzado (RX+): típico de 3-5 años, suele tener muscle-ups/HSPU y cargas pesadas
- Elite: típico de 5+ años competitivo (Open/Quarterfinals)

FORMATO EXACTO:
{
  "recommended_level": "principiante|intermedio|avanzado|elite",
  "confidence": 0.75,
  "reasoning": "Explicación basada SOLO en datos reales del perfil; menciona cualquier lesión/limitación",
  "key_indicators": ["Factor 1", "Factor 2"],
  "suggested_focus_areas": ["Gymnastic", "Weightlifting", "Monostructural"],
  "safety_considerations": ["Advertencia por lesión/limitación 1"],
  "contraindicated_movements": ["Movimiento a evitar/escalar por lesión"],
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
        contraindicated_movements: evaluation.contraindicated_movements || [],
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

// Niveles de CrossFit (la tabla tiene Principiante/Intermedio/Avanzado/Elite).
// VENTANA DESLIZANTE: cada nivel incluye el suyo y como mucho uno por debajo
// (no arrastra desde principiante) para no meter WODs triviales en niveles altos.
const CROSSFIT_LEVEL_ORDER = ['Principiante', 'Intermedio', 'Avanzado', 'Elite'];

function allowedCrossFitLevels(levelKey) {
  const idx = { principiante: 0, intermedio: 1, avanzado: 2, elite: 3 }[levelKey] ?? 0;
  return CROSSFIT_LEVEL_ORDER.slice(Math.max(0, idx - 1), idx + 1);
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
  // Isometrías (planchas, holds, L-sit…): el objetivo es tiempo, no reps.
  if (ex.duracion_seg) return `Mantén la posición ${ex.duracion_seg}s`;
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
    notas: ex.notas || '',
    gif_url: ex.gif_url || null
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

  if (getCrossfitFeatureFlags().generation) {
    const generated = await generateCrossfitProductPlan({
      userId,
      planData,
      db: pool,
      profileLoader: getUserFullProfile
    });
    return buildPlanResult({
      plan: generated.plan,
      planId: generated.planId,
      methodology: 'crossfit',
      startedAt,
      extraMeta: {
        level: generated.classification.global_level,
        classification_confidence: generated.classification.confidence,
        idempotent_replay: generated.idempotentReplay,
        schema_version: generated.plan.schema_version,
        ruleset_version: generated.plan.ruleset_version,
        catalog_version: generated.plan.catalog_version
      }
    });
  }

  let userProfile = null;
  try {
    userProfile = await getUserFullProfile(userId);
  } catch (profileError) {
    logger.warn(`⚠️ [CROSSFIT] No se pudo leer el perfil completo: ${profileError.message}`);
  }

  const levelKey = normalizeCrossFitLevel(
    planData.selectedLevel || planData.level || planData.aiEvaluation?.recommended_level || userProfile?.nivel_entrenamiento || 'principiante'
  );
  const levels = getCrossFitLevels();
  const levelConfig = levels[levelKey] || levels.principiante;
  const nivelLabel = levelConfig.name;
  const frecuencia = resolveTrainingFrequency(
    planData.frecuencia_semanal ?? userProfile?.frecuencia_semanal,
    levelConfig.sessions_per_week,
    Array.from({ length: CROSSFIT_SESSION_TEMPLATES.length }, (_, index) => index + 1).filter(value => value >= 3)
  );
  const totalWeeks = levelConfig.duration_weeks;
  const trainingGoal = getProfileTrainingGoal(userProfile, planData.goals);

  logger.info(`🏋️ [CROSSFIT] Nivel: ${nivelLabel}, ${frecuencia} días/sem, ${totalWeeks} semanas`);

  // Cargar ejercicios de los niveles permitidos (tabla viva con columnas acentuadas).
  const { rows: exercises } = await pool.query(`
    SELECT exercise_id, nombre, nivel, dominio, categoria, equipamiento,
           tipo_wod, intensidad, duracion_seg, descanso_seg,
           escalamiento, notas, rx_carga_sugerida,
           "Cómo_hacerlo" AS como_hacerlo, gif_url
      FROM "Ejercicios_CrossFit"
     WHERE nivel = ANY($1::text[])
     ORDER BY RANDOM()
  `, [allowedCrossFitLevels(levelKey)]);

  if (!exercises || exercises.length === 0) {
    throw new Error('No se encontraron ejercicios de CrossFit para el nivel seleccionado');
  }

  // 🩹 SEGURIDAD POR LESIÓN: leer limitaciones físicas del perfil y excluir del
  // pool los movimientos contraindicados (p.ej. hombro → overhead/press/kipping;
  // lumbar → peso muerto/swing/box jump). El motor es determinista, así que este
  // filtro es la única barrera real: sin él, el plan incluía cargas agresivas
  // (Thrusters/Deadlift/muscle-ups) pese a la lesión declarada.
  const injuryText = extractInjuryText(userProfile);
  const injuryRules = activeInjuryRules(injuryText);
  const injuryZones = injuryRules.map(r => r.zona);

  const poolByDomain = {};
  const excludedByInjury = [];
  for (const ex of exercises) {
    if (isContraindicated(ex, injuryRules)) {
      excludedByInjury.push(ex.nombre);
      continue;
    }
    (poolByDomain[ex.dominio] ||= []).push(ex);
  }

  // Pool SEGURO (solo no contraindicados). NUNCA reintroducimos los excluidos:
  // si una lesión vacía un dominio, la sesión se completa con movimientos seguros
  // de otros dominios (fallbackPool de buildTemplates), no con los peligrosos.
  const safePool = Object.values(poolByDomain).flat();
  if (safePool.length === 0) {
    throw new Error('No hay ejercicios de CrossFit seguros para las limitaciones indicadas');
  }
  if (injuryRules.length) {
    logger.info(`🩹 [CROSSFIT] Filtro de lesiones activo (${injuryZones.join(', ') || 'ninguna'}). Excluidos: ${excludedByInjury.length} movimientos`);
  }

  // Reglas (descanso, deload, escalas) cargadas desde app.mindfeed_rulesets (scope crossfit_v1).
  const ruleset = await loadCrossFitRuleset(pool);

  const pick = buildExercisePicker(poolByDomain);
  const templateSpecs = CROSSFIT_SESSION_TEMPLATES.slice(0, frecuencia);
  const templates = buildTemplates(templateSpecs, pick, safePool);

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
    objetivo: trainingGoal,
    benchmark_targets: levelConfig.benchmark_targets || {},
    restricciones_lesion: {
      zonas: injuryZones,
      limitaciones_texto: injuryText || null,
      movimientos_excluidos: excludedByInjury
    },
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
