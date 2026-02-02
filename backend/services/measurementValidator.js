/**
 * MEASUREMENT VALIDATOR SERVICE
 * Sistema de validación de mediciones corporales para detectar datos sospechosos
 *
 * VALOR PARA EL USUARIO:
 * - Evita decisiones erróneas por datos incorrectos
 * - Alerta cuando las mediciones parecen inconsistentes
 * - Protege contra errores de entrada accidentales
 * - Mantiene la integridad del sistema de decisión
 */

import { pool } from '../db.js';

// ============================================================================
// UMBRALES DE VALIDACIÓN (basados en fisiología realista)
// ============================================================================

const VALIDATION_THRESHOLDS = {
  // Cambios máximos esperables en 7 días
  weight: {
    max_change_pct: 2.0,           // ±2% peso en 7 días (ej: 70kg → ±1.4kg)
    max_gain_g_per_day: 200,       // Max ganancia realista: ~200g/día = 1.4kg/semana
    max_loss_g_per_day: 300        // Max pérdida realista: ~300g/día = 2.1kg/semana
  },

  waist: {
    max_change_cm: 2.5,            // ±2.5cm cintura en 7 días
    max_gain_cm_per_week: 3.0,     // Max ganancia: 3cm/semana (alerta volumen sucio)
    max_loss_cm_per_week: 3.0      // Max pérdida: 3cm/semana (alerta déficit extremo)
  },

  skinfold: {
    max_change_pct: 20,            // ±20% pliegue en 7 días
    max_change_mm: 5               // ±5mm en medición directa
  },

  // Perímetros musculares (cambio más lento que cintura)
  muscle_girth: {
    biceps: { max_gain_cm_week: 0.5, max_loss_cm_week: 0.7 },
    chest: { max_gain_cm_week: 1.0, max_loss_cm_week: 1.2 },
    calf: { max_gain_cm_week: 0.3, max_loss_cm_week: 0.5 }
  },

  // Rangos absolutos razonables (detección de errores de entrada)
  absolute_ranges: {
    weight: { min: 30, max: 250 },        // kg
    height: { min: 120, max: 230 },       // cm
    waist: { min: 50, max: 200 },         // cm
    biceps: { min: 15, max: 60 },         // cm
    chest: { min: 60, max: 180 },         // cm
    calf: { min: 20, max: 60 },           // cm
    skinfold_abdominal: { min: 3, max: 80 } // mm
  }
};

// ============================================================================
// FUNCIONES DE VALIDACIÓN
// ============================================================================

/**
 * Valida una medición individual contra rangos absolutos
 * Detecta errores obvios de entrada (ej: peso = 700 kg)
 */
export function validateAbsoluteRange(measurement, type) {
  const ranges = VALIDATION_THRESHOLDS.absolute_ranges[type];

  if (!ranges) {
    return { valid: true, warnings: [] };
  }

  const warnings = [];

  if (measurement < ranges.min) {
    warnings.push({
      severity: 'high',
      code: 'BELOW_MINIMUM',
      message: `${type} está por debajo del mínimo esperado (${ranges.min}). ¿Verificaste la medición?`,
      suggestion: 'Revisa que hayas ingresado el valor correcto y en las unidades correctas.'
    });
  }

  if (measurement > ranges.max) {
    warnings.push({
      severity: 'high',
      code: 'ABOVE_MAXIMUM',
      message: `${type} está por encima del máximo esperado (${ranges.max}). ¿Verificaste la medición?`,
      suggestion: 'Revisa que hayas ingresado el valor correcto y en las unidades correctas.'
    });
  }

  return {
    valid: warnings.length === 0,
    warnings
  };
}

/**
 * Valida cambio de peso entre dos mediciones
 * Detecta cambios fisiológicamente improbables
 */
export function validateWeightChange(currentWeight, previousWeight, daysBetween) {
  const warnings = [];
  const changePct = Math.abs((currentWeight - previousWeight) / previousWeight) * 100;
  const changeKg = currentWeight - previousWeight;
  const changePerDay = changeKg / daysBetween;

  // Validación 1: Cambio porcentual excesivo
  if (daysBetween <= 7 && changePct > VALIDATION_THRESHOLDS.weight.max_change_pct) {
    warnings.push({
      severity: 'medium',
      code: 'WEIGHT_CHANGE_EXCESSIVE',
      message: `Cambio de peso de ${changePct.toFixed(1)}% en ${daysBetween} días es muy alto (máx esperado: ${VALIDATION_THRESHOLDS.weight.max_change_pct}%).`,
      suggestion: 'Verifica que te hayas pesado en las mismas condiciones (hora, ropa, hidratación).',
      data: {
        change_kg: changeKg.toFixed(1),
        change_pct: changePct.toFixed(1),
        days: daysBetween
      }
    });
  }

  // Validación 2: Ganancia demasiado rápida
  if (changePerDay > VALIDATION_THRESHOLDS.weight.max_gain_g_per_day / 1000) {
    const weeklyGain = changePerDay * 7;
    warnings.push({
      severity: 'medium',
      code: 'WEIGHT_GAIN_TOO_FAST',
      message: `Ganancia de ${weeklyGain.toFixed(2)} kg/semana es extremadamente alta (máx realista: ~1.4 kg/semana).`,
      suggestion: 'Si es correcta, considera revisar tu superávit calórico. Si es un error, vuelve a medirte.',
      data: {
        weekly_gain_kg: weeklyGain.toFixed(2),
        daily_gain_g: (changePerDay * 1000).toFixed(0)
      }
    });
  }

  // Validación 3: Pérdida demasiado rápida
  if (changePerDay < -VALIDATION_THRESHOLDS.weight.max_loss_g_per_day / 1000) {
    const weeklyLoss = Math.abs(changePerDay * 7);
    warnings.push({
      severity: 'high',
      code: 'WEIGHT_LOSS_TOO_FAST',
      message: `Pérdida de ${weeklyLoss.toFixed(2)} kg/semana es extremadamente alta (máx seguro: ~2.1 kg/semana).`,
      suggestion: 'Pérdida muy rápida aumenta riesgo de pérdida muscular. Revisa tu déficit calórico o vuelve a medirte.',
      data: {
        weekly_loss_kg: weeklyLoss.toFixed(2),
        daily_loss_g: Math.abs(changePerDay * 1000).toFixed(0)
      }
    });
  }

  return {
    suspicious: warnings.length > 0,
    warnings,
    change_kg: changeKg,
    change_pct: changePct,
    days_between: daysBetween
  };
}

/**
 * Valida cambio de cintura entre dos mediciones
 * Crítico para ICG/IPG - detecta mediciones en punto anatómico diferente
 */
export function validateWaistChange(currentWaist, previousWaist, daysBetween, weightChange = null) {
  const warnings = [];
  const changeCm = currentWaist - previousWaist;
  const absChangeCm = Math.abs(changeCm);

  // Validación 1: Cambio absoluto excesivo
  if (daysBetween <= 7 && absChangeCm > VALIDATION_THRESHOLDS.waist.max_change_cm) {
    warnings.push({
      severity: 'high',
      code: 'WAIST_CHANGE_EXCESSIVE',
      message: `Cambio de cintura de ${absChangeCm.toFixed(1)} cm en ${daysBetween} días es muy alto (máx esperado: ${VALIDATION_THRESHOLDS.waist.max_change_cm} cm).`,
      suggestion: 'Verifica que hayas medido en el MISMO punto anatómico (mitad entre última costilla y cresta ilíaca) y con la misma tensión de cinta.',
      data: {
        change_cm: changeCm.toFixed(1),
        days: daysBetween,
        likely_cause: 'Punto de medición diferente o tensión de cinta inconsistente'
      }
    });
  }

  // Validación 2: Cambio de cintura sin cambio de peso coherente
  // (indica medición incorrecta o retención de líquidos extrema)
  if (weightChange !== null && Math.abs(weightChange) < 0.5 && absChangeCm > 2.0) {
    warnings.push({
      severity: 'medium',
      code: 'WAIST_WEIGHT_MISMATCH',
      message: `Cambio de cintura significativo (${absChangeCm.toFixed(1)} cm) sin cambio de peso coherente (${weightChange.toFixed(1)} kg).`,
      suggestion: 'Esto puede indicar: (1) punto de medición diferente, (2) retención extrema de líquidos, o (3) error de medición.',
      data: {
        waist_change_cm: changeCm.toFixed(1),
        weight_change_kg: weightChange.toFixed(1)
      }
    });
  }

  return {
    suspicious: warnings.length > 0,
    warnings,
    change_cm: changeCm,
    days_between: daysBetween
  };
}

/**
 * Valida cambio de pliegue cutáneo
 * Los pliegues son más variables que perímetros, pero cambios >20% son sospechosos
 */
export function validateSkinfoldChange(currentSkinfold, previousSkinfold, daysBetween) {
  const warnings = [];
  const changeMm = currentSkinfold - previousSkinfold;
  const changePct = Math.abs((changeMm / previousSkinfold) * 100);

  // Validación 1: Cambio porcentual excesivo
  if (daysBetween <= 7 && changePct > VALIDATION_THRESHOLDS.skinfold.max_change_pct) {
    warnings.push({
      severity: 'medium',
      code: 'SKINFOLD_CHANGE_EXCESSIVE',
      message: `Cambio de pliegue de ${changePct.toFixed(0)}% en ${daysBetween} días es muy alto (máx esperado: ${VALIDATION_THRESHOLDS.skinfold.max_change_pct}%).`,
      suggestion: 'Los pliegues son variables según hidratación, hora del día y técnica. Repite la medición.',
      data: {
        change_mm: changeMm.toFixed(1),
        change_pct: changePct.toFixed(1)
      }
    });
  }

  // Validación 2: Cambio absoluto sospechoso
  if (Math.abs(changeMm) > VALIDATION_THRESHOLDS.skinfold.max_change_mm && daysBetween <= 7) {
    warnings.push({
      severity: 'low',
      code: 'SKINFOLD_CHANGE_LARGE',
      message: `Cambio de ${Math.abs(changeMm).toFixed(1)} mm en pliegue puede indicar medición inconsistente.`,
      suggestion: 'Asegúrate de medir en el mismo punto, con la misma técnica y a la misma hora del día.',
      data: {
        change_mm: changeMm.toFixed(1)
      }
    });
  }

  return {
    suspicious: warnings.length > 0,
    warnings,
    change_mm: changeMm,
    change_pct: changePct
  };
}

/**
 * Valida perímetro muscular (bíceps, pecho, gemelo)
 * Cambios lentos - alerta si cambia demasiado rápido
 */
export function validateMuscleGirthChange(currentGirth, previousGirth, muscleType, daysBetween) {
  const warnings = [];
  const changeCm = currentGirth - previousGirth;
  const thresholds = VALIDATION_THRESHOLDS.muscle_girth[muscleType];

  if (!thresholds) {
    return { suspicious: false, warnings: [] };
  }

  const weeklyChange = (changeCm / daysBetween) * 7;

  // Ganancia muscular demasiado rápida (fisiológicamente improbable)
  if (weeklyChange > thresholds.max_gain_cm_week) {
    warnings.push({
      severity: 'medium',
      code: 'MUSCLE_GAIN_TOO_FAST',
      message: `Ganancia de ${weeklyChange.toFixed(2)} cm/semana en ${muscleType} es extremadamente alta (máx realista: ${thresholds.max_gain_cm_week} cm/semana).`,
      suggestion: 'Verifica el punto de medición. Si es correcta, ¡felicitaciones! Pero es poco común.',
      data: {
        weekly_change_cm: weeklyChange.toFixed(2),
        muscle: muscleType
      }
    });
  }

  // Pérdida muscular demasiado rápida (posible error o déficit extremo)
  if (weeklyChange < -thresholds.max_loss_cm_week) {
    warnings.push({
      severity: 'high',
      code: 'MUSCLE_LOSS_TOO_FAST',
      message: `Pérdida de ${Math.abs(weeklyChange).toFixed(2)} cm/semana en ${muscleType} es muy alta (máx esperado: ${thresholds.max_loss_cm_week} cm/semana).`,
      suggestion: 'Revisa tu déficit calórico, proteína y volumen de entrenamiento. Si la medición es correcta, considera aumentar calorías.',
      data: {
        weekly_loss_cm: Math.abs(weeklyChange).toFixed(2),
        muscle: muscleType
      }
    });
  }

  return {
    suspicious: warnings.length > 0,
    warnings,
    change_cm: changeCm,
    weekly_change_cm: weeklyChange
  };
}

/**
 * Valida condiciones de medición declaradas por el usuario
 * Alerta si las condiciones son diferentes a la medición previa
 */
export function validateMeasurementConditions(currentConditions, previousConditions) {
  const warnings = [];
  const differences = [];

  // Comparar hora del día
  if (currentConditions.time_of_day !== previousConditions.time_of_day) {
    differences.push('hora del día');
  }

  // Comparar estado de ayuno
  if (currentConditions.fasted !== previousConditions.fasted) {
    differences.push('estado de ayuno');
  }

  // Comparar post-entreno
  if (currentConditions.post_workout !== previousConditions.post_workout) {
    differences.push('momento respecto al entreno');
  }

  if (differences.length > 0) {
    warnings.push({
      severity: 'medium',
      code: 'CONDITIONS_CHANGED',
      message: `Las condiciones de medición cambiaron: ${differences.join(', ')}.`,
      suggestion: 'Para comparaciones precisas, mide siempre en las mismas condiciones (misma hora, ayuno/no ayuno, pre/post-entreno).',
      data: {
        differences,
        current: currentConditions,
        previous: previousConditions
      }
    });
  }

  return {
    conditions_changed: differences.length > 0,
    warnings,
    differences
  };
}

/**
 * Función principal: valida un conjunto completo de mediciones
 * Retorna todas las advertencias encontradas
 */
export async function validateMeasurement(userId, newMeasurement) {
  const allWarnings = [];

  // 1. Validar rangos absolutos
  for (const [key, value] of Object.entries(newMeasurement)) {
    if (typeof value === 'number' && VALIDATION_THRESHOLDS.absolute_ranges[key]) {
      const validation = validateAbsoluteRange(value, key);
      if (!validation.valid) {
        allWarnings.push(...validation.warnings);
      }
    }
  }

  // 2. Obtener última medición para comparar cambios
  const previousMeasurement = await getLastMeasurement(userId);

  if (!previousMeasurement) {
    // Primera medición - solo validar rangos absolutos
    return {
      valid: allWarnings.length === 0,
      warnings: allWarnings,
      is_first_measurement: true,
      requires_confirmation: allWarnings.some(w => w.severity === 'high')
    };
  }

  const daysBetween = Math.floor(
    (new Date(newMeasurement.date) - new Date(previousMeasurement.date)) / (1000 * 60 * 60 * 24)
  );

  // 3. Validar cambio de peso
  if (newMeasurement.weight && previousMeasurement.weight) {
    const weightValidation = validateWeightChange(
      newMeasurement.weight,
      previousMeasurement.weight,
      daysBetween
    );
    if (weightValidation.suspicious) {
      allWarnings.push(...weightValidation.warnings);
    }
  }

  // 4. Validar cambio de cintura
  if (newMeasurement.waist && previousMeasurement.waist) {
    const waistValidation = validateWaistChange(
      newMeasurement.waist,
      previousMeasurement.waist,
      daysBetween,
      newMeasurement.weight - previousMeasurement.weight
    );
    if (waistValidation.suspicious) {
      allWarnings.push(...waistValidation.warnings);
    }
  }

  // 5. Validar pliegue abdominal
  if (newMeasurement.skinfold_abdominal && previousMeasurement.skinfold_abdominal) {
    const skinfoldValidation = validateSkinfoldChange(
      newMeasurement.skinfold_abdominal,
      previousMeasurement.skinfold_abdominal,
      daysBetween
    );
    if (skinfoldValidation.suspicious) {
      allWarnings.push(...skinfoldValidation.warnings);
    }
  }

  // 6. Validar perímetros musculares
  const muscleTypes = ['biceps', 'chest', 'calf'];
  for (const muscle of muscleTypes) {
    if (newMeasurement[muscle] && previousMeasurement[muscle]) {
      const girthValidation = validateMuscleGirthChange(
        newMeasurement[muscle],
        previousMeasurement[muscle],
        muscle,
        daysBetween
      );
      if (girthValidation.suspicious) {
        allWarnings.push(...girthValidation.warnings);
      }
    }
  }

  // 7. Validar condiciones de medición (si están disponibles)
  if (newMeasurement.conditions && previousMeasurement.conditions) {
    const conditionsValidation = validateMeasurementConditions(
      newMeasurement.conditions,
      previousMeasurement.conditions
    );
    if (conditionsValidation.conditions_changed) {
      allWarnings.push(...conditionsValidation.warnings);
    }
  }

  // Determinar si requiere confirmación del usuario antes de guardar
  const hasHighSeverity = allWarnings.some(w => w.severity === 'high');
  const hasMediumSeverity = allWarnings.some(w => w.severity === 'medium');

  return {
    valid: allWarnings.length === 0,
    warnings: allWarnings,
    requires_confirmation: hasHighSeverity || (hasMediumSeverity && allWarnings.length >= 2),
    severity_summary: {
      high: allWarnings.filter(w => w.severity === 'high').length,
      medium: allWarnings.filter(w => w.severity === 'medium').length,
      low: allWarnings.filter(w => w.severity === 'low').length
    },
    recommendation: hasHighSeverity
      ? 'Se detectaron problemas serios. Recomendamos repetir la medición.'
      : hasMediumSeverity
      ? 'Se detectaron inconsistencias. Verifica las condiciones de medición.'
      : 'Mediciones dentro de rangos esperados.'
  };
}

/**
 * Obtiene la última medición del usuario
 */
async function getLastMeasurement(userId) {
  const result = await pool.query(
    `SELECT * FROM app.body_measurements
     WHERE user_id = $1
     ORDER BY measurement_date DESC
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
}

export default {
  validateAbsoluteRange,
  validateWeightChange,
  validateWaistChange,
  validateSkinfoldChange,
  validateMuscleGirthChange,
  validateMeasurementConditions,
  validateMeasurement,
  VALIDATION_THRESHOLDS
};
