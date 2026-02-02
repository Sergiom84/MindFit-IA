/**
 * Complementos de Control Nutricional
 * 
 * Funciones adicionales de validación y monitoreo según documentación:
 * - Ritmo de pérdida semanal por nivel de déficit
 * - Validación de pliegue abdominal
 * - Validación de perímetros musculares
 * - Complementos para ICG/IPG/IEC
 */

import pool from '../db.js';

// ============================================
// RITMO DE PÉRDIDA SEMANAL POR NIVEL DE DÉFICIT
// ============================================

/**
 * Umbrales de ritmo de pérdida según nivel de entrenamiento y déficit
 * Basado en documentación: apartado control de ritmo de pérdida
 */
export const EXPECTED_WEIGHT_LOSS_RATES = {
  beginner: {
    mild: { min: 0.3, max: 0.5, kcal_deficit: 300 },      // 0.3-0.5% peso/semana
    moderate: { min: 0.5, max: 0.7, kcal_deficit: 500 },  // 0.5-0.7% peso/semana
    aggressive: { min: 0.7, max: 1.0, kcal_deficit: 750 } // 0.7-1.0% peso/semana
  },
  intermediate: {
    mild: { min: 0.3, max: 0.5, kcal_deficit: 300 },
    moderate: { min: 0.5, max: 0.7, kcal_deficit: 500 },
    aggressive: { min: 0.7, max: 0.9, kcal_deficit: 700 }
  },
  advanced: {
    mild: { min: 0.2, max: 0.4, kcal_deficit: 250 },      // Más conservador
    moderate: { min: 0.4, max: 0.6, kcal_deficit: 400 },
    aggressive: { min: 0.6, max: 0.8, kcal_deficit: 600 } // Máximo recomendado
  }
};

/**
 * Evalúa si el ritmo de pérdida de peso es adecuado para el nivel de déficit
 * 
 * @param {number} userId - ID del usuario
 * @param {number} weeklyWeightLoss - Pérdida de peso en kg en la última semana
 * @param {number} currentWeight - Peso actual en kg
 * @returns {Promise<Object>} Evaluación del ritmo de pérdida
 */
export async function evaluateWeightLossRate(userId, weeklyWeightLoss, currentWeight) {
  try {
    // Obtener nivel de entrenamiento y déficit calórico actual
    const userDataResult = await pool.query(
      `SELECT 
        np.nivel_entrenamiento,
        bcs.current_kcal,
        np.gct_kcal
       FROM app.nutrition_profiles np
       LEFT JOIN app.bridge_current_state bcs ON bcs.user_id = np.user_id
       WHERE np.user_id = $1`,
      [userId]
    );

    if (userDataResult.rows.length === 0) {
      return {
        success: false,
        message: 'No se encontró perfil nutricional del usuario'
      };
    }

    const userData = userDataResult.rows[0];
    const trainingLevel = userData.nivel_entrenamiento || 'intermediate';
    const currentKcal = userData.current_kcal || userData.gct_kcal;
    const kcalDeficit = userData.gct_kcal - currentKcal;

    // Determinar nivel de déficit
    let deficitLevel = 'mild';
    if (kcalDeficit >= 600) {
      deficitLevel = 'aggressive';
    } else if (kcalDeficit >= 400) {
      deficitLevel = 'moderate';
    }

    // Obtener umbrales esperados
    const expectedRates = EXPECTED_WEIGHT_LOSS_RATES[trainingLevel]?.[deficitLevel] || 
                          EXPECTED_WEIGHT_LOSS_RATES.intermediate.moderate;

    // Calcular pérdida semanal como % del peso corporal
    const weeklyLossPercentage = (Math.abs(weeklyWeightLoss) / currentWeight) * 100;

    // Evaluar si está dentro del rango esperado
    const isWithinRange = 
      weeklyLossPercentage >= expectedRates.min && 
      weeklyLossPercentage <= expectedRates.max;

    let status, severity, message, action;

    if (weeklyLossPercentage < expectedRates.min) {
      // Pérdida muy lenta
      status = 'TOO_SLOW';
      severity = 'medium';
      message = `Pérdida de peso demasiado lenta: ${weeklyLossPercentage.toFixed(2)}%/sem (esperado: ${expectedRates.min}-${expectedRates.max}%)`;
      action = `Considera aumentar déficit en 100-150 kcal o verificar adherencia al plan`;
    } else if (weeklyLossPercentage > expectedRates.max) {
      // Pérdida muy rápida
      status = 'TOO_FAST';
      severity = 'high';
      message = `Pérdida de peso demasiado rápida: ${weeklyLossPercentage.toFixed(2)}%/sem (esperado: ${expectedRates.min}-${expectedRates.max}%)`;
      action = `URGENTE: Aumenta calorías en 150-250 kcal/día para evitar pérdida muscular`;
    } else {
      // Dentro del rango óptimo
      status = 'OPTIMAL';
      severity = 'none';
      message = `Ritmo de pérdida óptimo: ${weeklyLossPercentage.toFixed(2)}%/sem`;
      action = 'Continúa con el plan actual';
    }

    return {
      success: true,
      status,
      severity,
      message,
      action,
      data: {
        weekly_loss_kg: weeklyWeightLoss,
        weekly_loss_percentage: weeklyLossPercentage,
        expected_min: expectedRates.min,
        expected_max: expectedRates.max,
        training_level: trainingLevel,
        deficit_level: deficitLevel,
        kcal_deficit: kcalDeficit
      }
    };

  } catch (error) {
    console.error('[evaluateWeightLossRate] Error:', error);
    throw error;
  }
}

// ============================================
// VALIDACIÓN DE PLIEGUE ABDOMINAL
// ============================================

/**
 * Umbrales de pliegue abdominal según fase
 * Basado en documentación: control de volumen (ICG)
 */
export const SKINFOLD_THRESHOLDS = {
  volumen: {
    warning: 20,  // mm - Alerta amarilla
    critical: 25  // mm - Alerta roja, detener volumen
  },
  definicion: {
    target_male: 10,   // mm - Objetivo hombres
    target_female: 15  // mm - Objetivo mujeres
  },
  maintenance: {
    range_male: { min: 8, max: 12 },
    range_female: { min: 12, max: 18 }
  }
};

/**
 * Evalúa el pliegue abdominal según fase y género
 * 
 * @param {number} userId - ID del usuario
 * @param {number} currentSkinfold - Pliegue abdominal actual en mm
 * @param {string} phase - Fase actual (volumen, definicion, maintenance)
 * @returns {Promise<Object>} Evaluación del pliegue
 */
export async function evaluateSkinfold(userId, currentSkinfold, phase) {
  try {
    // Obtener género del usuario
    const userResult = await pool.query(
      `SELECT gender FROM app.users WHERE id = $1`,
      [userId]
    );

    const gender = userResult.rows[0]?.gender || 'male';

    let status, severity, message, action;

    if (phase === 'volumen') {
      // En volumen: controlar que no suba demasiado el pliegue
      if (currentSkinfold >= SKINFOLD_THRESHOLDS.volumen.critical) {
        status = 'CRITICAL_HIGH';
        severity = 'high';
        message = `Pliegue abdominal muy alto: ${currentSkinfold}mm (crítico: ≥${SKINFOLD_THRESHOLDS.volumen.critical}mm)`;
        action = 'DETENER VOLUMEN: Finaliza la fase de volumen y transiciona a mantenimiento o definición';
      } else if (currentSkinfold >= SKINFOLD_THRESHOLDS.volumen.warning) {
        status = 'WARNING_HIGH';
        severity = 'medium';
        message = `Pliegue abdominal alto: ${currentSkinfold}mm (alerta: ≥${SKINFOLD_THRESHOLDS.volumen.warning}mm)`;
        action = 'Considera reducir superávit calórico en 100-150 kcal o prepararte para finalizar volumen pronto';
      } else {
        status = 'ACCEPTABLE';
        severity = 'none';
        message = `Pliegue abdominal aceptable en volumen: ${currentSkinfold}mm`;
        action = 'Continúa con el volumen monitoreando el pliegue';
      }

    } else if (phase === 'definicion') {
      // En definición: monitorear progreso hacia objetivo
      const target = gender === 'male' 
        ? SKINFOLD_THRESHOLDS.definicion.target_male 
        : SKINFOLD_THRESHOLDS.definicion.target_female;

      if (currentSkinfold <= target) {
        status = 'TARGET_REACHED';
        severity = 'none';
        message = `Objetivo de pliegue alcanzado: ${currentSkinfold}mm (objetivo: ≤${target}mm)`;
        action = 'Considera transicionar a mantenimiento o finalizar definición';
      } else if (currentSkinfold <= target * 1.5) {
        status = 'NEAR_TARGET';
        severity = 'none';
        message = `Cerca del objetivo de pliegue: ${currentSkinfold}mm (objetivo: ${target}mm)`;
        action = 'Continúa con el déficit actual';
      } else {
        status = 'IN_PROGRESS';
        severity = 'none';
        message = `Pliegue en progreso: ${currentSkinfold}mm (objetivo: ${target}mm)`;
        action = 'Mantén el déficit y monitorea progreso semanal';
      }

    } else {
      // Mantenimiento: mantener dentro del rango
      const range = gender === 'male' 
        ? SKINFOLD_THRESHOLDS.maintenance.range_male 
        : SKINFOLD_THRESHOLDS.maintenance.range_female;

      if (currentSkinfold >= range.min && currentSkinfold <= range.max) {
        status = 'OPTIMAL_RANGE';
        severity = 'none';
        message = `Pliegue en rango óptimo: ${currentSkinfold}mm (rango: ${range.min}-${range.max}mm)`;
        action = 'Mantén calorías actuales';
      } else if (currentSkinfold < range.min) {
        status = 'TOO_LOW';
        severity = 'medium';
        message = `Pliegue muy bajo: ${currentSkinfold}mm (rango: ${range.min}-${range.max}mm)`;
        action = 'Considera aumentar calorías ligeramente (+100-150 kcal)';
      } else {
        status = 'TOO_HIGH';
        severity = 'medium';
        message = `Pliegue alto: ${currentSkinfold}mm (rango: ${range.min}-${range.max}mm)`;
        action = 'Considera reducir calorías ligeramente (-100-150 kcal)';
      }
    }

    return {
      success: true,
      status,
      severity,
      message,
      action,
      data: {
        current_skinfold_mm: currentSkinfold,
        phase,
        gender
      }
    };

  } catch (error) {
    console.error('[evaluateSkinfold] Error:', error);
    throw error;
  }
}

// ============================================
// VALIDACIÓN DE PERÍMETROS MUSCULARES
// ============================================

/**
 * Umbrales de cambio de perímetros musculares (cm/semana)
 * Basado en documentación: control de volumen (complementos)
 */
export const MUSCLE_CIRCUMFERENCE_THRESHOLDS = {
  volumen: {
    biceps: { min: 0.2, optimal: 0.3 },      // cm/semana
    chest: { min: 0.3, optimal: 0.5 },       // cm/semana
    minimum_required: 0.3  // Al menos uno debe crecer ≥0.3 cm/sem
  },
  definicion: {
    biceps: { max_loss: -0.3 },   // Pérdida máxima aceptable cm/semana
    chest: { max_loss: -0.5 },    // Pérdida máxima aceptable cm/semana
    warning_threshold: -0.2       // Cualquier pérdida > 0.2 cm genera alerta
  }
};

/**
 * Evalúa los cambios en perímetros musculares según fase
 * 
 * @param {Object} currentMeasurements - Mediciones actuales
 * @param {Object} previousMeasurements - Mediciones anteriores (1 semana antes)
 * @param {string} phase - Fase actual
 * @returns {Object} Evaluación de perímetros
 */
export function evaluateMuscleCircumferences(currentMeasurements, previousMeasurements, phase) {
  const bicepsChange = (currentMeasurements.biceps_cm || 0) - (previousMeasurements.biceps_cm || 0);
  const chestChange = (currentMeasurements.chest_cm || 0) - (previousMeasurements.chest_cm || 0);

  const alerts = [];
  const recommendations = [];

  if (phase === 'volumen') {
    // En volumen: esperamos crecimiento de perímetros
    const thresholds = MUSCLE_CIRCUMFERENCE_THRESHOLDS.volumen;

    let anyOptimalGrowth = false;
    let anyMinimalGrowth = false;

    // Evaluar bíceps
    if (bicepsChange >= thresholds.biceps.optimal) {
      anyOptimalGrowth = true;
    } else if (bicepsChange >= thresholds.biceps.min) {
      anyMinimalGrowth = true;
    } else if (bicepsChange < 0) {
      alerts.push({
        type: 'BICEPS_SHRINKING_IN_BULK',
        severity: 'high',
        message: `Bíceps disminuyendo en volumen: ${bicepsChange.toFixed(1)} cm/semana`,
        circumference: 'biceps',
        change: bicepsChange
      });
      recommendations.push(
        'ALERTA: Bíceps disminuyendo en volumen. Verifica volumen de entrenamiento de brazos y superávit calórico.'
      );
    }

    // Evaluar pecho
    if (chestChange >= thresholds.chest.optimal) {
      anyOptimalGrowth = true;
    } else if (chestChange >= thresholds.chest.min) {
      anyMinimalGrowth = true;
    } else if (chestChange < 0) {
      alerts.push({
        type: 'CHEST_SHRINKING_IN_BULK',
        severity: 'high',
        message: `Pecho disminuyendo en volumen: ${chestChange.toFixed(1)} cm/semana`,
        circumference: 'chest',
        change: chestChange
      });
      recommendations.push(
        'ALERTA: Pecho disminuyendo en volumen. Verifica volumen de entrenamiento de pecho y superávit calórico.'
      );
    }

    // Evaluación global del volumen
    if (!anyOptimalGrowth && !anyMinimalGrowth) {
      alerts.push({
        type: 'INSUFFICIENT_MUSCLE_GROWTH',
        severity: 'medium',
        message: 'Crecimiento muscular insuficiente en volumen',
        biceps_change: bicepsChange,
        chest_change: chestChange
      });
      recommendations.push(
        `Los perímetros no crecen lo esperado. Considera: aumentar superávit +100-150 kcal, verificar proteína ≥2g/kg, revisar volumen de entrenamiento.`
      );
    } else if (anyOptimalGrowth) {
      alerts.push({
        type: 'OPTIMAL_MUSCLE_GROWTH',
        severity: 'none',
        message: 'Crecimiento muscular óptimo en volumen',
        biceps_change: bicepsChange,
        chest_change: chestChange
      });
    }

  } else if (phase === 'definicion') {
    // En definición: monitorear pérdida excesiva de músculo
    const thresholds = MUSCLE_CIRCUMFERENCE_THRESHOLDS.definicion;

    // Evaluar bíceps
    if (bicepsChange <= thresholds.biceps.max_loss) {
      alerts.push({
        type: 'EXCESSIVE_BICEPS_LOSS',
        severity: 'high',
        message: `Pérdida excesiva de bíceps: ${bicepsChange.toFixed(1)} cm/semana (máx: ${thresholds.biceps.max_loss})`,
        circumference: 'biceps',
        change: bicepsChange
      });
      recommendations.push(
        'ALERTA: Pérdida muscular excesiva en bíceps. ACCIÓN: Aumenta calorías 150-250 kcal, proteína a 2.2g/kg+, reduce déficit.'
      );
    } else if (bicepsChange < thresholds.warning_threshold) {
      alerts.push({
        type: 'BICEPS_LOSS_WARNING',
        severity: 'medium',
        message: `Pérdida de bíceps detectada: ${bicepsChange.toFixed(1)} cm/semana`,
        circumference: 'biceps',
        change: bicepsChange
      });
      recommendations.push(
        'Monitorear bíceps. Si continúa bajando, considera aumentar calorías 100-150 kcal.'
      );
    }

    // Evaluar pecho
    if (chestChange <= thresholds.chest.max_loss) {
      alerts.push({
        type: 'EXCESSIVE_CHEST_LOSS',
        severity: 'high',
        message: `Pérdida excesiva de pecho: ${chestChange.toFixed(1)} cm/semana (máx: ${thresholds.chest.max_loss})`,
        circumference: 'chest',
        change: chestChange
      });
      recommendations.push(
        'ALERTA: Pérdida muscular excesiva en pecho. ACCIÓN: Aumenta calorías 150-250 kcal, proteína a 2.2g/kg+, reduce déficit.'
      );
    } else if (chestChange < thresholds.warning_threshold) {
      alerts.push({
        type: 'CHEST_LOSS_WARNING',
        severity: 'medium',
        message: `Pérdida de pecho detectada: ${chestChange.toFixed(1)} cm/semana`,
        circumference: 'chest',
        change: chestChange
      });
      recommendations.push(
        'Monitorear pecho. Si continúa bajando, considera aumentar calorías 100-150 kcal.'
      );
    }

    // Si no hay pérdidas preocupantes
    if (alerts.length === 0) {
      alerts.push({
        type: 'MUSCLE_PRESERVATION_OK',
        severity: 'none',
        message: 'Perímetros musculares manteniéndose bien en definición',
        biceps_change: bicepsChange,
        chest_change: chestChange
      });
    }
  }

  return {
    success: true,
    biceps_change_cm: bicepsChange,
    chest_change_cm: chestChange,
    phase,
    alerts,
    recommendations
  };
}

/**
 * Detecta cambio brusco de pliegue (±20% en 1 semana)
 * Según validación de mediciones (punto 2.2 de documentación)
 * 
 * @param {number} currentSkinfold - Pliegue actual en mm
 * @param {number} previousSkinfold - Pliegue anterior en mm
 * @returns {Object} Resultado de validación
 */
export function validateSkinfoldChange(currentSkinfold, previousSkinfold) {
  if (!previousSkinfold || previousSkinfold === 0) {
    return {
      is_suspicious: false,
      reason: 'No hay medición previa para comparar'
    };
  }

  const changePercent = Math.abs((currentSkinfold - previousSkinfold) / previousSkinfold) * 100;
  const isSuspicious = changePercent >= 20;

  return {
    is_suspicious: isSuspicious,
    change_percent: changePercent,
    change_absolute: currentSkinfold - previousSkinfold,
    reason: isSuspicious 
      ? `Cambio brusco de pliegue: ${changePercent.toFixed(1)}% en una semana (umbral: ±20%)`
      : 'Cambio de pliegue dentro de rango normal',
    should_repeat: isSuspicious,
    previous_value: previousSkinfold,
    current_value: currentSkinfold
  };
}

// ============================================
// EXPORTACIONES
// ============================================

export default {
  evaluateWeightLossRate,
  evaluateSkinfold,
  evaluateMuscleCircumferences,
  validateSkinfoldChange,
  EXPECTED_WEIGHT_LOSS_RATES,
  SKINFOLD_THRESHOLDS,
  MUSCLE_CIRCUMFERENCE_THRESHOLDS
};
