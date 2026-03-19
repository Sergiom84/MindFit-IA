/**
 * BRIDGE COORDINATOR SERVICE
 * Servicio de coordinacion bidireccional entre Entrenamiento y Nutricion
 * Implementa la logica del documento "Puente entre Modulos"
 */

import { pool } from '../db.js';
import {
  calculateBMR,
  calculateTDEE,
  adjustCaloriesForGoal,
  calculateMacros
} from './nutritionCalculator.js';
import { logNutritionChange } from './nutritionAuditLogger.js';

// ============================================================================
// CONSTANTES Y CONFIGURACION
// ============================================================================

// Flags coordinados disponibles
export const COORDINATED_FLAGS = {
  // Flags de riesgo
  MUSCLE_LOSS_RISK: 'muscle_loss_risk',
  INJURY_PREVENTION: 'injury_prevention',
  INJURY_ACTIVE: 'injury_active',
  ENERGY_WARNING: 'energy_warning',
  OVERTRAINING_RISK: 'overtraining_risk',

  // Flags de estado
  DELOAD_ACTIVE: 'deload_active',
  DIET_BREAK_ACTIVE: 'diet_break_active',
  REFEED_DAY: 'refeed_day',

  // Flags de ajuste
  DEFICIT_EXTENDED: 'deficit_extended',
  SURPLUS_EXTENDED: 'surplus_extended',
  FATIGUE_ACCUMULATED: 'fatigue_accumulated',
  PERFORMANCE_DECLINING: 'performance_declining'
};

// Umbrales por defecto
const DEFAULT_THRESHOLDS = {
  performanceDropPercent: 0.15,      // 15% caida de rendimiento
  weightChangePercent: 0.02,         // 2% cambio de peso
  maxDeficitDays: 90,                // 12-13 semanas max en deficit
  maxSurplusDays: 120,               // 16-17 semanas max en surplus
  fatigueAccumulationDays: 14,       // Dias para considerar fatiga acumulada
  minProteinGKg: 1.6,                // Minimo proteina en g/kg
  minFatGKg: 0.6,                    // Minimo grasa en g/kg
  minFatPercent: 0.20                // Minimo grasa 20% del total
};

// Matriz de fatiga (segun documento)
const FATIGUE_MATRIX = {
  // [fase][nivel_fatiga] = accion
  cut: {
    low: { action: 'continue', adjustment: null },
    medium: { action: 'monitor', adjustment: { kcal: 100, note: 'Considerar +100 kcal si persiste' } },
    high: { action: 'intervene', adjustment: { kcal: 200, dietBreak: true, note: 'Diet break 7-14 dias o +200 kcal' } }
  },
  mant: {
    low: { action: 'continue', adjustment: null },
    medium: { action: 'monitor', adjustment: { carbsD2: 0.10, note: '+10% carbos en D2' } },
    high: { action: 'intervene', adjustment: { kcal: 150, deload: true, note: 'Deload + revisar carga' } }
  },
  bulk: {
    low: { action: 'continue', adjustment: null },
    medium: { action: 'continue', adjustment: null },
    high: { action: 'intervene', adjustment: { deload: true, note: 'Deload obligatorio, mantener surplus' } }
  }
};

// ============================================================================
// FLUJO A: ENTRENAMIENTO -> NUTRICION
// ============================================================================

/**
 * Procesa inputs del entrenamiento y genera ajustes nutricionales
 */
export async function processTrainingToNutrition(userId, trainingInputs) {
  const {
    methodology,
    calendar = [],
    weekly_cls = 50,
    performance = 'mantiene',
    session_data = null,
    flags = {}
  } = trainingInputs;

  // Obtener estado actual del bridge
  const stateResult = await pool.query(
    'SELECT * FROM app.get_bridge_state($1)',
    [userId]
  );
  const currentState = stateResult.rows[0] || {};

  // Obtener perfil nutricional
  const profileResult = await pool.query(
    'SELECT * FROM app.nutrition_profiles WHERE user_id = $1',
    [userId]
  );
  if (profileResult.rows.length === 0) {
    throw new Error('Perfil nutricional no encontrado');
  }
  const profile = profileResult.rows[0];

  // Obtener perfil metabolico si existe
  const metabolicResult = await pool.query(
    'SELECT * FROM app.get_current_metabolic_profile($1)',
    [userId]
  );
  const metabolicProfile = metabolicResult.rows[0] || null;

  // Calcular kcal base
  const bmr = calculateBMR(profile);
  const tdee = calculateTDEE(bmr, profile.actividad, profile.training_days || 4, profile.steps_per_day);
  let effectiveTdee = tdee;
  const objetivo = profile.objetivo || 'mant';
  let kcalBase = adjustCaloriesForGoal(effectiveTdee, objetivo, profile);
  const auditEntries = [];

  const resolvedMetabolicType = metabolicProfile?.metabolic_profile || profile.metabolic_type;
  const resolvedMetabolicConfidence = metabolicProfile?.confidence_level || profile.metabolic_confidence || 'media';
  const resolvedLevel = profile.level || profile.nivel_entrenamiento || 'intermedio';

  // Calcular macros base desde la fuente canónica perfil + fase
  let macrosBase = calculateMacros(
    kcalBase,
    profile.peso_kg,
    profile.training_type || 'hipertrofia',
    objetivo,
    resolvedMetabolicType,
    resolvedMetabolicConfidence,
    resolvedLevel
  );

  // Evaluar flags y generar ajustes
  const evaluation = evaluateTrainingFlags({
    performance,
    weekly_cls,
    flags,
    objetivo,
    daysInDeficit: currentState.days_in_deficit || 0,
    daysInSurplus: currentState.days_in_surplus || 0,
    fatigueScore: currentState.fatigue_score || 0,
    activeFlags: currentState.active_flags || []
  });

  const calendarTrainingDays = Array.isArray(calendar)
    ? calendar.filter(day => day?.type !== 'rest' && day?.type !== 'descanso').length
    : null;
  const baselineTrainingDays = profile.training_days || calendarTrainingDays || 0;
  const reducedSessions = baselineTrainingDays && calendarTrainingDays
    ? Math.max(0, baselineTrainingDays - calendarTrainingDays)
    : 0;

  const injuryFlag = (currentState.active_flags || []).find(f => f.flag === COORDINATED_FLAGS.INJURY_ACTIVE);
  const injuryActivatedAt = injuryFlag?.activated_at ? new Date(injuryFlag.activated_at) : (flags.lesion ? new Date() : null);
  const injuryActiveDays = injuryActivatedAt
    ? Math.floor((new Date() - injuryActivatedAt) / (1000 * 60 * 60 * 24))
    : null;

  // Regla lesión: no recalcular GCT el mismo día, esperar 7 días
  if (injuryActiveDays !== null && injuryActiveDays < 7) {
    evaluation.adjustments.kcal = 0;
    evaluation.recommendations.push('Lesión activa: mantener kcal, no recalcular GCT durante 7 días.');
  }

  // Regla lesión: si reduce >=2 sesiones por semana durante 14 días, bajar factor actividad 0.05-0.10
  if (injuryActiveDays !== null && injuryActiveDays >= 14 && reducedSessions >= 2) {
    const reduction = reducedSessions >= 3 ? 0.10 : 0.05;
    const adjustedTdee = Math.round(tdee * (1 - reduction));
    const kcalBeforeInjury = kcalBase;
    effectiveTdee = adjustedTdee;
    kcalBase = adjustCaloriesForGoal(effectiveTdee, objetivo, profile);
    evaluation.recommendations.push(`Lesión 14 días: ajustar actividad -${Math.round(reduction * 100)}%.`);

    if (kcalBase !== kcalBeforeInjury) {
      auditEntries.push({
        userId,
        changeType: 'activity_factor_adjust',
        delta: { kcal: kcalBase - kcalBeforeInjury, activity_factor_delta: -reduction },
        ruleId: 'NUTR-BRIDGE-040',
        reason: 'Lesión 14 días con reducción de sesiones',
        metrics: {
          injury_active_days: injuryActiveDays,
          reduced_sessions: reducedSessions,
          tdee_before: tdee,
          tdee_after: adjustedTdee
        },
        previousValues: { kcal_objetivo: kcalBeforeInjury, tdee },
        newValues: { kcal_objetivo: kcalBase, tdee: adjustedTdee },
        source: 'bridge'
      });
    }
  }

  // Regla deload: ajustar superávit a la mitad en volumen
  if (flags.deload && objetivo === 'bulk') {
    const kcalBeforeDeload = kcalBase;
    const surplus = kcalBase - effectiveTdee;
    kcalBase = Math.round(effectiveTdee + surplus / 2);
    evaluation.recommendations.push('Deload en volumen: reducir superávit a la mitad esta semana.');

    if (kcalBase !== kcalBeforeDeload) {
      auditEntries.push({
        userId,
        changeType: 'kcal_adjust',
        delta: { kcal: kcalBase - kcalBeforeDeload },
        ruleId: 'NUTR-BRIDGE-020',
        reason: 'Deload en volumen: reducir superávit a la mitad',
        metrics: { tdee: effectiveTdee },
        previousValues: { kcal_objetivo: kcalBeforeDeload },
        newValues: { kcal_objetivo: kcalBase },
        source: 'bridge'
      });
    }
  }

  // Aplicar ajustes si los hay
  let adjustedKcal = kcalBase;
  let adjustedMacros = { ...macrosBase };

  if (evaluation.adjustments.kcal) {
    auditEntries.push({
      userId,
      changeType: 'kcal_adjust',
      delta: { kcal: evaluation.adjustments.kcal },
      ruleId: 'NUTR-BRIDGE-030',
      reason: evaluation.reason,
      metrics: { weekly_cls, performance, decision_type: evaluation.decisionType },
      previousValues: { kcal_objetivo: adjustedKcal },
      newValues: { kcal_objetivo: adjustedKcal + evaluation.adjustments.kcal },
      source: 'bridge'
    });

    adjustedKcal += evaluation.adjustments.kcal;
    // Recalcular macros con nuevas kcal manteniendo perfil + confianza
    adjustedMacros = calculateMacros(
      adjustedKcal,
      profile.peso_kg,
      profile.training_type || 'hipertrofia',
      objetivo,
      resolvedMetabolicType,
      resolvedMetabolicConfidence,
      resolvedLevel
    );
  }

  if (evaluation.adjustments.carbsD2) {
    auditEntries.push({
      userId,
      changeType: 'carb_cycle_adjust',
      delta: { carbsD2: evaluation.adjustments.carbsD2 },
      ruleId: 'NUTR-BRIDGE-010',
      reason: evaluation.reason,
      metrics: { weekly_cls, performance, decision_type: evaluation.decisionType },
      source: 'bridge'
    });
  }

  // Generar distribucion por tipo de dia (carb cycling)
  const perDayMacros = buildCarbCyclingDistribution(adjustedMacros, profile.peso_kg, weekly_cls, objetivo);

  if (Array.isArray(calendar) && calendar.length > 0) {
    auditEntries.push({
      userId,
      changeType: 'carb_cycle_adjust',
      delta: { per_day: perDayMacros },
      ruleId: 'NUTR-BRIDGE-010',
      reason: 'Carb cycling según CLS y calendario',
      metrics: { weekly_cls, calendar_days: calendarTrainingDays },
      source: 'bridge'
    });
  }

  // Mapear calendario a macros
  const calendarWithMacros = calendar.map(day => ({
    ...day,
    macros: perDayMacros[mapDayType(day.type)]
  }));

  // Registrar decision en log
  const decisionDetails = {
    adjustments: evaluation.adjustments,
    flags_activated: evaluation.newFlags,
    recommendations: evaluation.recommendations,
    reason: evaluation.reason
  };

  await logBridgeDecision(userId, 'training', 'session_completed', {
    methodology,
    weekly_cls,
    performance,
    flags,
    session_data
  }, null, evaluation.decisionType, decisionDetails, {
    kcal: adjustedKcal,
    macros: adjustedMacros,
    per_day: perDayMacros
  }, null);

  // Actualizar estado del bridge
  await updateBridgeState(userId, {
    current_kcal: adjustedKcal,
    current_macros: adjustedMacros,
    current_methodology: methodology,
    weekly_cls_score: weekly_cls,
    sessions_since_last_recalc: 0,
    last_session_date: new Date().toISOString().split('T')[0],
    last_recalculation: new Date().toISOString()
  });

  // Activar nuevos flags si los hay
  for (const flag of evaluation.newFlags) {
    await activateBridgeFlag(userId, flag.name, flag.severity, flag.duration);
  }

  for (const entry of auditEntries) {
    try {
      await logNutritionChange(entry);
    } catch (error) {
      console.error('Error registrando log nutricional del bridge:', error);
    }
  }

  return {
    success: true,
    nutrition: {
      kcal_objetivo: adjustedKcal,
      macros_base: adjustedMacros,
      per_day: perDayMacros,
      calendar_macros: calendarWithMacros
    },
    evaluation: {
      decision_type: evaluation.decisionType,
      adjustments: evaluation.adjustments,
      new_flags: evaluation.newFlags,
      recommendations: evaluation.recommendations
    },
    metabolic_profile: metabolicProfile ? {
      type: metabolicProfile.metabolic_profile,
      confidence: metabolicProfile.confidence_level
    } : null
  };
}

// ============================================================================
// FLUJO B: NUTRICION -> ENTRENAMIENTO
// ============================================================================

/**
 * Procesa inputs de nutricion y genera recomendaciones de entrenamiento
 */
export async function processNutritionToTraining(userId, nutritionInputs) {
  const {
    actual_intake = null,      // Ingesta real vs planificada
    weight_trend = 'stable',   // losing, stable, gaining
    energy_level = 'normal',   // low, normal, high
    recovery_quality = 'good', // poor, fair, good, excellent
    adherence_percent = 100    // % de adherencia al plan
  } = nutritionInputs;

  // Obtener estado actual
  const stateResult = await pool.query(
    'SELECT * FROM app.get_bridge_state($1)',
    [userId]
  );
  const currentState = stateResult.rows[0] || {};

  // Obtener perfil
  const profileResult = await pool.query(
    'SELECT * FROM app.nutrition_profiles WHERE user_id = $1',
    [userId]
  );
  const profile = profileResult.rows[0];
  const objetivo = profile?.objetivo || 'mant';

  // Evaluar estado nutricional y generar recomendaciones de entrenamiento
  const evaluation = evaluateNutritionState({
    weightTrend: weight_trend,
    energyLevel: energy_level,
    recoveryQuality: recovery_quality,
    adherencePercent: adherence_percent,
    objetivo,
    daysInDeficit: currentState.days_in_deficit || 0,
    daysInSurplus: currentState.days_in_surplus || 0,
    currentKcal: currentState.current_kcal || 0,
    activeFlags: currentState.active_flags || []
  });

  // Registrar decision
  await logBridgeDecision(userId, 'nutrition', 'nutrition_review', null, {
    actual_intake,
    weight_trend,
    energy_level,
    recovery_quality,
    adherence_percent
  }, evaluation.decisionType, {
    recommendations: evaluation.trainingRecommendations,
    flags: evaluation.newFlags,
    reason: evaluation.reason
  }, null, evaluation.trainingAdjustments);

  // Activar flags si los hay
  for (const flag of evaluation.newFlags) {
    await activateBridgeFlag(userId, flag.name, flag.severity, flag.duration);
  }

  return {
    success: true,
    training_guidance: {
      recommendations: evaluation.trainingRecommendations,
      volume_adjustment: evaluation.trainingAdjustments.volume,
      intensity_adjustment: evaluation.trainingAdjustments.intensity,
      frequency_adjustment: evaluation.trainingAdjustments.frequency,
      deload_recommended: evaluation.trainingAdjustments.deload,
      focus_areas: evaluation.trainingAdjustments.focus
    },
    new_flags: evaluation.newFlags,
    alerts: evaluation.alerts
  };
}

// ============================================================================
// FUNCIONES DE EVALUACION
// ============================================================================

/**
 * Evalua flags de entrenamiento y genera ajustes
 */
function evaluateTrainingFlags(params) {
  const {
    performance,
    weekly_cls,
    flags,
    objetivo,
    daysInDeficit,
    daysInSurplus,
    fatigueScore,
    activeFlags
  } = params;

  const adjustments = { kcal: 0, carbsD2: 0 };
  const newFlags = [];
  const recommendations = [];
  let decisionType = 'no_change';
  let reason = 'Estado estable';

  // Evaluar performance
  if (performance === 'baja') {
    const fatigueLevel = fatigueScore > 70 ? 'high' : fatigueScore > 40 ? 'medium' : 'low';
    const matrixAction = FATIGUE_MATRIX[objetivo]?.[fatigueLevel] || FATIGUE_MATRIX.mant.low;

    if (matrixAction.adjustment) {
      if (matrixAction.adjustment.kcal) {
        adjustments.kcal = matrixAction.adjustment.kcal;
      }
      if (matrixAction.adjustment.carbsD2) {
        adjustments.carbsD2 = matrixAction.adjustment.carbsD2;
      }
      if (matrixAction.adjustment.dietBreak) {
        newFlags.push({
          name: COORDINATED_FLAGS.DIET_BREAK_ACTIVE,
          severity: 'high',
          duration: 14
        });
      }
      if (matrixAction.adjustment.deload) {
        newFlags.push({
          name: COORDINATED_FLAGS.DELOAD_ACTIVE,
          severity: 'medium',
          duration: 7
        });
      }
      recommendations.push(matrixAction.adjustment.note);
      decisionType = matrixAction.action;
      reason = `Performance baja con fatiga ${fatigueLevel}`;
    }

    // Flag de rendimiento decreciente
    newFlags.push({
      name: COORDINATED_FLAGS.PERFORMANCE_DECLINING,
      severity: 'medium',
      duration: 7
    });
  }

  // Evaluar deficit extendido
  if (objetivo === 'cut' && daysInDeficit > DEFAULT_THRESHOLDS.maxDeficitDays) {
    newFlags.push({
      name: COORDINATED_FLAGS.DEFICIT_EXTENDED,
      severity: 'high',
      duration: null
    });
    newFlags.push({
      name: COORDINATED_FLAGS.MUSCLE_LOSS_RISK,
      severity: 'medium',
      duration: null
    });
    recommendations.push('Considerar diet break o transicion a mantenimiento');
    decisionType = 'intervene';
    reason = `Deficit extendido: ${daysInDeficit} dias`;
  }

  // Evaluar surplus extendido
  if (objetivo === 'bulk' && daysInSurplus > DEFAULT_THRESHOLDS.maxSurplusDays) {
    newFlags.push({
      name: COORDINATED_FLAGS.SURPLUS_EXTENDED,
      severity: 'medium',
      duration: null
    });
    recommendations.push('Considerar mini-cut o transicion a mantenimiento');
    reason = `Surplus extendido: ${daysInSurplus} dias`;
  }

  // Evaluar flags manuales
  if (flags.deload) {
    newFlags.push({
      name: COORDINATED_FLAGS.DELOAD_ACTIVE,
      severity: 'low',
      duration: 7
    });
    recommendations.push('Deload activo: mantener proteina, reducir volumen 20-30%');
    decisionType = 'deload';
  }

  if (flags.fatiga_alta) {
    newFlags.push({
      name: COORDINATED_FLAGS.FATIGUE_ACCUMULATED,
      severity: 'high',
      duration: 14
    });
    if (objetivo === 'cut') {
      adjustments.kcal = 150;
      recommendations.push('Fatiga alta en deficit: +150 kcal temporalmente');
      decisionType = 'intervene';
    }
  }

  // Flag de energia baja
  if (flags.energia_baja) {
    newFlags.push({
      name: COORDINATED_FLAGS.ENERGY_WARNING,
      severity: 'medium',
      duration: 7
    });
    recommendations.push('Energia baja: revisar descanso, estres y distribucion de carbos');
  }

  // Flag de prevencion de lesiones
  if (flags.sobrecarga_articular || weekly_cls > 85) {
    newFlags.push({
      name: COORDINATED_FLAGS.INJURY_PREVENTION,
      severity: weekly_cls > 90 ? 'high' : 'medium',
      duration: 7
    });
    recommendations.push('Riesgo de sobrecarga: reducir intensidad en ejercicios de alto impacto');
  }

  if (flags.lesion) {
    newFlags.push({
      name: COORDINATED_FLAGS.INJURY_ACTIVE,
      severity: 'high',
      duration: 14
    });
    recommendations.push('Lesión activa: priorizar recuperación, evitar cambios bruscos de kcal.');
    decisionType = 'injury';
  }

  return {
    adjustments,
    newFlags,
    recommendations,
    decisionType,
    reason
  };
}

/**
 * Evalua estado nutricional para recomendaciones de entrenamiento
 */
function evaluateNutritionState(params) {
  const {
    weightTrend,
    energyLevel,
    recoveryQuality,
    adherencePercent,
    objetivo,
    daysInDeficit,
    daysInSurplus,
    activeFlags
  } = params;

  const trainingRecommendations = [];
  const trainingAdjustments = {
    volume: 0,      // -20, -10, 0, +10, +20
    intensity: 0,   // -10, 0, +10
    frequency: 0,   // -1, 0, +1 dias
    deload: false,
    focus: []
  };
  const newFlags = [];
  const alerts = [];
  let decisionType = 'no_change';
  let reason = 'Estado nutricional estable';

  // Evaluar nivel de energia
  if (energyLevel === 'low') {
    trainingAdjustments.volume = -10;
    trainingAdjustments.intensity = -10;
    trainingRecommendations.push('Reducir volumen e intensidad por energia baja');
    newFlags.push({
      name: COORDINATED_FLAGS.ENERGY_WARNING,
      severity: 'medium',
      duration: 7
    });
    decisionType = 'adjust';
    reason = 'Energia baja detectada';
  }

  // Evaluar calidad de recuperacion
  if (recoveryQuality === 'poor') {
    trainingAdjustments.volume = Math.min(trainingAdjustments.volume, -20);
    trainingAdjustments.frequency = -1;
    trainingRecommendations.push('Reducir frecuencia por mala recuperacion');
    alerts.push('Recuperacion pobre: revisar sueno, estres y nutricion');
    decisionType = 'intervene';
    reason = 'Recuperacion pobre';
  } else if (recoveryQuality === 'fair') {
    trainingAdjustments.volume = Math.min(trainingAdjustments.volume, -10);
    trainingRecommendations.push('Monitorear recuperacion, posible reduccion de volumen');
  }

  // Evaluar tendencia de peso vs objetivo
  if (objetivo === 'cut' && weightTrend === 'gaining') {
    alerts.push('Ganando peso en fase de definicion: revisar adherencia');
    trainingRecommendations.push('Aumentar NEAT y considerar mas cardio de baja intensidad');
  } else if (objetivo === 'bulk' && weightTrend === 'losing') {
    alerts.push('Perdiendo peso en fase de volumen: aumentar ingesta');
    trainingAdjustments.volume = -10;
    trainingRecommendations.push('Reducir volumen hasta estabilizar peso');
  }

  // Evaluar adherencia
  if (adherencePercent < 70) {
    alerts.push(`Adherencia baja (${adherencePercent}%): simplificar plan nutricional`);
    trainingRecommendations.push('Mantener entrenamiento constante, priorizar adherencia nutricional');
  }

  // Deficit extendido -> cuidado con volumen
  if (objetivo === 'cut' && daysInDeficit > 60) {
    trainingAdjustments.volume = Math.min(trainingAdjustments.volume, -10);
    trainingRecommendations.push('Deficit prolongado: mantener intensidad, reducir volumen');
    trainingAdjustments.focus.push('mantener_fuerza');
  }

  // Flags activos que afectan entrenamiento
  const hasMuscleRisk = activeFlags.some(f => f.flag === COORDINATED_FLAGS.MUSCLE_LOSS_RISK);
  if (hasMuscleRisk) {
    trainingAdjustments.intensity = Math.max(trainingAdjustments.intensity, 0); // No reducir intensidad
    trainingAdjustments.focus.push('preservar_masa_muscular');
    trainingRecommendations.push('Riesgo de perdida muscular: mantener intensidad alta, proteina maxima');
  }

  const hasDeload = activeFlags.some(f => f.flag === COORDINATED_FLAGS.DELOAD_ACTIVE);
  if (hasDeload) {
    trainingAdjustments.deload = true;
    trainingAdjustments.volume = -30;
    trainingRecommendations.push('Deload activo: -30% volumen, mantener frecuencia');
  }

  return {
    trainingRecommendations,
    trainingAdjustments,
    newFlags,
    alerts,
    decisionType,
    reason
  };
}

// ============================================================================
// FUNCIONES DE CARB CYCLING
// ============================================================================

/**
 * Calcula delta de carbohidratos segun CLS
 */
function carbDeltaFromCLS(clsScore = 50) {
  if (clsScore >= 70) return { high: 1.20, low: 0.80 };  // +/-20%
  if (clsScore >= 40) return { high: 1.15, low: 0.85 };  // +/-15%
  return { high: 1.10, low: 0.90 };                       // +/-10%
}

/**
 * Redistribuye macros manteniendo proteina fija
 */
function redistributeMacros(baseMacros, weightKg, carbFactor) {
  const protein_g = baseMacros.protein_g;
  const baseKcal = baseMacros.protein_g * 4 + baseMacros.fat_g * 9 + baseMacros.carbs_g * 4;

  // Calcular nuevos carbos
  const targetCarbs = Math.round(baseMacros.carbs_g * carbFactor);
  const carbKcal = targetCarbs * 4;

  // Calcular grasa minima
  const fatMin = Math.max(
    Math.round(DEFAULT_THRESHOLDS.minFatGKg * weightKg),
    Math.round((baseKcal * DEFAULT_THRESHOLDS.minFatPercent) / 9)
  );

  // Calcular grasa restante
  let remainingKcal = baseKcal - (protein_g * 4) - carbKcal;
  let fat_g = Math.max(fatMin, Math.round(remainingKcal / 9));

  // Si las kcal se van a negativo, recortar carbos
  if (remainingKcal < fatMin * 9) {
    const maxCarbKcal = baseKcal - (protein_g * 4) - (fatMin * 9);
    const adjustedCarbs = Math.max(0, Math.floor(maxCarbKcal / 4));
    fat_g = fatMin;
    return {
      protein_g,
      fat_g,
      carbs_g: adjustedCarbs,
      kcal: protein_g * 4 + fat_g * 9 + adjustedCarbs * 4
    };
  }

  return {
    protein_g,
    fat_g,
    carbs_g: targetCarbs,
    kcal: protein_g * 4 + fat_g * 9 + targetCarbs * 4
  };
}

/**
 * Construye distribucion de macros por tipo de dia
 */
function buildCarbCyclingDistribution(baseMacros, weightKg, clsScore, objetivo) {
  const deltas = objetivo === 'cut'
    ? { high: 1.10, low: 0.90 } // En déficit, limitar +/-10%
    : carbDeltaFromCLS(clsScore);
  const baseKcal = baseMacros.protein_g * 4 + baseMacros.fat_g * 9 + baseMacros.carbs_g * 4;

  return {
    D0: redistributeMacros(baseMacros, weightKg, deltas.low),  // Descanso
    D1: { ...baseMacros, kcal: baseKcal },                      // Normal
    D2: redistributeMacros(baseMacros, weightKg, deltas.high)  // Dia duro
  };
}

/**
 * Mapea tipo de dia a codigo D0/D1/D2
 */
function mapDayType(type) {
  switch (type) {
    case 'rest':
    case 'descanso':
      return 'D0';
    case 'hard':
    case 'duro':
    case 'high':
      return 'D2';
    default:
      return 'D1';
  }
}

// ============================================================================
// FUNCIONES DE PERSISTENCIA
// ============================================================================

/**
 * Registra una decision del bridge
 */
async function logBridgeDecision(
  userId,
  triggerSource,
  triggerEvent,
  trainingInputs,
  nutritionInputs,
  decisionType,
  decisionDetails,
  appliedNutrition,
  appliedTraining
) {
  try {
    await pool.query(
      `SELECT app.log_bridge_decision($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        userId,
        triggerSource,
        triggerEvent,
        trainingInputs ? JSON.stringify(trainingInputs) : null,
        nutritionInputs ? JSON.stringify(nutritionInputs) : null,
        decisionType,
        JSON.stringify(decisionDetails),
        appliedNutrition ? JSON.stringify(appliedNutrition) : null,
        appliedTraining ? JSON.stringify(appliedTraining) : null
      ]
    );
  } catch (error) {
    console.error('Error logging bridge decision:', error);
    // No lanzar error, el log es secundario
  }
}

/**
 * Actualiza el estado del bridge
 */
async function updateBridgeState(userId, updates) {
  const fields = [];
  const values = [userId];
  let paramIndex = 2;

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(typeof value === 'object' ? JSON.stringify(value) : value);
      paramIndex++;
    }
  }

  if (fields.length === 0) return;

  try {
    await pool.query(
      `INSERT INTO app.bridge_current_state (user_id, ${Object.keys(updates).join(', ')}, updated_at)
       VALUES ($1, ${values.slice(1).map((_, i) => `$${i + 2}`).join(', ')}, NOW())
       ON CONFLICT (user_id) DO UPDATE SET ${fields.join(', ')}, updated_at = NOW()`,
      values
    );
  } catch (error) {
    console.error('Error updating bridge state:', error);
  }
}

/**
 * Activa un flag en el bridge
 */
async function activateBridgeFlag(userId, flagName, severity = 'medium', durationDays = null) {
  try {
    await pool.query(
      'SELECT app.activate_bridge_flag($1, $2, $3, $4)',
      [userId, flagName, severity, durationDays]
    );
  } catch (error) {
    console.error('Error activating bridge flag:', error);
  }
}

// ============================================================================
// FUNCIONES DE VERIFICACION Y TRIGGERS
// ============================================================================

/**
 * Verifica si se necesita recalculo
 */
export async function checkRecalculationNeeded(userId) {
  const result = await pool.query(
    'SELECT * FROM app.get_bridge_state($1)',
    [userId]
  );

  const state = result.rows[0];
  if (!state) {
    return { needed: true, reason: 'Estado no inicializado' };
  }

  return {
    needed: state.needs_recalculation,
    reason: state.recalc_reason,
    state: {
      currentKcal: state.current_kcal,
      metabolicProfile: state.metabolic_profile,
      daysInDeficit: state.days_in_deficit,
      daysInSurplus: state.days_in_surplus,
      activeFlags: state.active_flags
    }
  };
}

/**
 * Obtiene el estado completo del bridge
 */
export async function getBridgeState(userId) {
  const stateResult = await pool.query(
    'SELECT * FROM app.get_bridge_state($1)',
    [userId]
  );

  const configResult = await pool.query(
    'SELECT * FROM app.bridge_recalculation_config WHERE user_id = $1',
    [userId]
  );

  const recentLogsResult = await pool.query(
    `SELECT * FROM app.bridge_decision_logs
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 5`,
    [userId]
  );

  return {
    state: stateResult.rows[0] || null,
    config: configResult.rows[0] || null,
    recentDecisions: recentLogsResult.rows
  };
}

/**
 * Obtiene el historial de ajustes
 */
export async function getAdjustmentHistory(userId, limit = 10) {
  const result = await pool.query(
    `SELECT * FROM app.bridge_adjustment_history
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  return result.rows;
}

export default {
  processTrainingToNutrition,
  processNutritionToTraining,
  checkRecalculationNeeded,
  getBridgeState,
  getAdjustmentHistory,
  COORDINATED_FLAGS
};
