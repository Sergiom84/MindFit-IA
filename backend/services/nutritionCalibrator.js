/**
 * Servicio de Calibración Nutricional Automática
 * Sistema para ajustar dinámicamente el GCT basado en datos reales del usuario
 * 
 * Implementa reglas anti-ruido y ajustes graduales (150-250 kcal por iteración)
 */

import pool from '../db.js';

/**
 * Calcula la media de peso de los últimos N días
 * @param {number} userId 
 * @param {number} days - Número de días a promediar (default: 14, según documentación)
 * @param {number} minMeasurements - Mínimo de mediciones requeridas (default: 5)
 * @returns {Object|null} { mediaPeso, numMeasurements, isValid }
 */
export async function calculateWeightAverage(userId, days = 14, minMeasurements = 5) {
  try {
    const result = await pool.query(
      `SELECT * FROM app.calculate_weight_average($1, $2, $3)`,
      [userId, days, minMeasurements]
    );

    if (result.rows.length === 0 || !result.rows[0].is_valid) {
      return null;
    }

    return {
      mediaPeso: parseFloat(result.rows[0].media_peso),
      numMeasurements: result.rows[0].num_measurements,
      isValid: result.rows[0].is_valid
    };
  } catch (error) {
    console.error('Error calculando media de peso:', error);
    throw error;
  }
}

/**
 * Valida si una medición de cintura es sospechosa
 * @param {number} userId
 * @param {number} newWaist_cm
 * @param {number} newWeight_kg
 * @returns {Object} Resultado de validación
 */
export async function validateWaistMeasurement(userId, newWaist_cm, newWeight_kg) {
  try {
    const result = await pool.query(
      `SELECT * FROM app.validate_waist_measurement($1, $2, $3)`,
      [userId, newWaist_cm, newWeight_kg]
    );

    if (result.rows.length === 0) {
      return { isSuspicious: false, shouldRepeat: false };
    }

    const row = result.rows[0];
    return {
      isSuspicious: row.is_suspicious,
      reason: row.reason,
      shouldRepeat: row.should_repeat,
      previousValue: row.previous_value ? parseFloat(row.previous_value) : null,
      waistChange: row.waist_change ? parseFloat(row.waist_change) : null,
      weightChange: row.weight_change ? parseFloat(row.weight_change) : null
    };
  } catch (error) {
    console.error('Error validando medición de cintura:', error);
    throw error;
  }
}

/**
 * Valida si un cambio de peso es sospechoso (> 3 kg en 7 días)
 * @param {number} userId
 * @param {number} newWeight_kg
 * @param {number} newWaist_cm - Opcional
 * @returns {Object} Resultado de validación
 */
export async function validateWeightChange(userId, newWeight_kg, newWaist_cm = null) {
  try {
    const result = await pool.query(
      `SELECT * FROM app.validate_weight_change($1, $2, $3)`,
      [userId, newWeight_kg, newWaist_cm]
    );

    if (result.rows.length === 0) {
      return { isSuspicious: false, shouldRepeat: false };
    }

    const row = result.rows[0];
    return {
      isSuspicious: row.is_suspicious,
      reason: row.reason,
      shouldRepeat: row.should_repeat,
      previousWeight: row.previous_weight ? parseFloat(row.previous_weight) : null,
      weightChange: row.weight_change_kg ? parseFloat(row.weight_change_kg) : null,
      daysDiff: row.days_diff
    };
  } catch (error) {
    console.error('Error validando cambio de peso:', error);
    throw error;
  }
}

/**
 * Guarda una medición corporal con validación automática
 * @param {number} userId
 * @param {Object} measurement - Datos de medición
 * @returns {Object} Resultado con ID de medición y validación
 */
export async function saveMeasurement(userId, measurement) {
  const {
    peso_kg,
    cintura_cm,
    cuello_cm,
    cadera_cm,
    pecho_cm,
    brazo_cm,
    pierna_cm,
    bodyfat_percent,
    muscle_mass_kg,
    measurement_date,
    source = 'manual',
    notes
  } = measurement;

  try {
    // Validar cintura y peso si se proporcionan
    let waistValidation = { isSuspicious: false, shouldRepeat: false };
    let weightValidation = { isSuspicious: false, shouldRepeat: false };
    
    if (cintura_cm) {
      waistValidation = await validateWaistMeasurement(userId, cintura_cm, peso_kg);
    }
    
    // Validar peso > 3 kg en 7 días (documentación exacta)
    weightValidation = await validateWeightChange(userId, peso_kg, cintura_cm);
    
    // Combinar validaciones
    const isSuspicious = waistValidation.isSuspicious || weightValidation.isSuspicious;
    const suspicionReasons = [];
    if (waistValidation.isSuspicious) suspicionReasons.push(waistValidation.reason);
    if (weightValidation.isSuspicious) suspicionReasons.push(weightValidation.reason);
    const combinedReason = suspicionReasons.join(' | ');

    // Insertar medición
    const result = await pool.query(
      `INSERT INTO app.user_body_measurements (
        user_id, peso_kg, cintura_cm, cuello_cm, cadera_cm, pecho_cm, 
        brazo_cm, pierna_cm, bodyfat_percent, muscle_mass_kg,
        measurement_date, source, flagged_suspicious, suspension_reason,
        validated, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id, flagged_suspicious, validated`,
      [
        userId, peso_kg, cintura_cm, cuello_cm, cadera_cm, pecho_cm,
        brazo_cm, pierna_cm, bodyfat_percent, muscle_mass_kg,
        measurement_date || new Date().toISOString().split('T')[0],
        source,
        isSuspicious,
        isSuspicious ? combinedReason : null,
        !isSuspicious, // validated = true si no es sospechosa
        notes || null
      ]
    );

    return {
      success: true,
      measurementId: result.rows[0].id,
      flagged: result.rows[0].flagged_suspicious,
      validated: result.rows[0].validated,
      waistValidation,
      weightValidation
    };
  } catch (error) {
    console.error('Error guardando medición:', error);
    throw error;
  }
}

/**
 * Evalúa si se requiere calibración nutricional
 * @param {number} userId
 * @param {string} objetivo - 'cut' | 'mant' | 'bulk'
 * @returns {Object} Resultado de la evaluación
 */
export async function evaluateCalibration(userId, objetivo) {
  try {
    // 1. Verificar si hay suficientes mediciones actuales (últimos 14 días, media móvil)
    const currentWeightAvg = await calculateWeightAverage(userId, 14, 5);
    
    if (!currentWeightAvg) {
      return {
        canCalibrate: false,
        reason: 'Insuficientes mediciones de peso en los últimos 14 días (requiere al menos 5 mediciones para media móvil)'
      };
    }

    // 2. Obtener peso medio hace 14 días (periodo de 14-28 días atrás para comparación)
    const previousWeightResult = await pool.query(
      `SELECT AVG(peso_kg) as media_peso, COUNT(*) as num_measurements
       FROM app.user_body_measurements
       WHERE user_id = $1
       AND measurement_date BETWEEN CURRENT_DATE - INTERVAL '28 days' AND CURRENT_DATE - INTERVAL '14 days'
       AND validated = TRUE
       AND flagged_suspicious = FALSE`,
      [userId]
    );

    if (previousWeightResult.rows.length === 0 || 
        previousWeightResult.rows[0].num_measurements < 3) {
      return {
        canCalibrate: false,
        reason: 'Insuficientes datos históricos (requiere al menos 3 mediciones hace 14-28 días)'
      };
    }

    const previousWeightAvg = parseFloat(previousWeightResult.rows[0].media_peso);

    // 3. Calcular cambio de peso
    const weightChange_kg = currentWeightAvg.mediaPeso - previousWeightAvg;
    const weightChange_pct = (weightChange_kg / previousWeightAvg) * 100;
    const weeklyChange_pct = weightChange_pct / 2; // Cambio por semana

    // 4. Obtener perfil nutricional actual
    const nutritionProfile = await pool.query(
      `SELECT kcal_objetivo, tdee, objetivo, peso_kg
       FROM app.nutrition_profiles
       WHERE user_id = $1`,
      [userId]
    );

    if (nutritionProfile.rows.length === 0) {
      return { 
        canCalibrate: false, 
        reason: 'No existe perfil nutricional configurado' 
      };
    }

    const { kcal_objetivo, tdee } = nutritionProfile.rows[0];

    // 5. Aplicar reglas de ajuste según fase
    let adjustmentKcal = 0;
    let reason = '';
    let shouldAdjust = false;
    let ruleApplied = '';
    
    // Variables auxiliares para cálculos
    const absDeltaWeekly = Math.abs(weeklyChange_pct);

    switch (objetivo) {
      case 'mant': // Normocalórica
        // Si el peso medio cambia > 0.5% en 14 días, ajustar +/- 150 kcal/día
        if (Math.abs(weightChange_pct) > 0.5) {
          adjustmentKcal = weightChange_pct > 0 ? -150 : 150;
          shouldAdjust = true;
          ruleApplied = 'Normocalórica: peso cambió >0.5% en 14 días';
          reason = `Peso cambió ${weightChange_pct.toFixed(2)}% en 14 días (${weightChange_kg > 0 ? '+' : ''}${weightChange_kg.toFixed(2)} kg). ` +
                   `Ajuste: ${adjustmentKcal > 0 ? '+' : ''}${adjustmentKcal} kcal para volver a mantenimiento.`;
        } else {
          ruleApplied = 'Normocalórica: peso estable';
          reason = `Peso estable (${weightChange_pct.toFixed(2)}% en 14 días). No requiere ajuste.`;
        }
        break;

      case 'cut': // Déficit
        
        // Pérdida < 0.3%/semana durante 2 semanas: bajar 150-250 kcal
        if (absDeltaWeekly < 0.3) {
          adjustmentKcal = -200; // Promedio entre -150 y -250
          shouldAdjust = true;
          ruleApplied = 'Déficit: pérdida <0.3%/semana';
          reason = `Pérdida de peso lenta (${weeklyChange_pct.toFixed(2)}%/semana < 0.3%). ` +
                   `Reducir ${Math.abs(adjustmentKcal)} kcal para acelerar déficit.`;
        }
        // Pérdida > 1%/semana: subir 150-250 kcal o diet break
        else if (absDeltaWeekly > 1.0) {
          adjustmentKcal = 200;
          shouldAdjust = true;
          ruleApplied = 'Déficit: pérdida >1%/semana';
          reason = `Pérdida de peso rápida (${weeklyChange_pct.toFixed(2)}%/semana > 1%). ` +
                   `Aumentar ${adjustmentKcal} kcal. Considerar diet break si hay fatiga o pérdida de rendimiento.`;
        } else {
          ruleApplied = 'Déficit: ritmo adecuado';
          reason = `Ritmo de pérdida adecuado (${weeklyChange_pct.toFixed(2)}%/semana entre 0.3% y 1%). No requiere ajuste.`;
        }
        break;

      case 'bulk': // Superávit
        // Ganancia < 0.15%/semana: subir 150 kcal
        if (weeklyChange_pct < 0.15 && weeklyChange_pct >= 0) {
          adjustmentKcal = 150;
          shouldAdjust = true;
          ruleApplied = 'Superávit: ganancia <0.15%/semana';
          reason = `Ganancia de peso lenta (${weeklyChange_pct.toFixed(2)}%/semana < 0.15%). ` +
                   `Aumentar ${adjustmentKcal} kcal para mejorar ganancia muscular.`;
        }
        // Ganancia > 0.35%/semana: bajar 150-250 kcal
        else if (weeklyChange_pct > 0.35) {
          adjustmentKcal = -200;
          shouldAdjust = true;
          ruleApplied = 'Superávit: ganancia >0.35%/semana';
          reason = `Ganancia de peso rápida (${weeklyChange_pct.toFixed(2)}%/semana > 0.35%). ` +
                   `Reducir ${Math.abs(adjustmentKcal)} kcal para minimizar ganancia de grasa. ` +
                   `Monitorear cintura en próximas mediciones.`;
        }
        // Pérdida de peso en volumen
        else if (weeklyChange_pct < 0) {
          adjustmentKcal = 250;
          shouldAdjust = true;
          ruleApplied = 'Superávit: pérdida de peso';
          reason = `Perdiendo peso (${weeklyChange_pct.toFixed(2)}%/semana) en fase de volumen. ` +
                   `Aumentar ${adjustmentKcal} kcal urgentemente.`;
        } else {
          ruleApplied = 'Superávit: ritmo adecuado';
          reason = `Ritmo de ganancia adecuado (${weeklyChange_pct.toFixed(2)}%/semana entre 0.15% y 0.35%). No requiere ajuste.`;
        }
        break;

      default:
        return {
          canCalibrate: false,
          reason: 'Objetivo no reconocido. Debe ser cut, mant o bulk.'
        };
    }

    // 6. Calcular nuevo objetivo calórico
    const newKcalObjetivo = shouldAdjust ? kcal_objetivo + adjustmentKcal : kcal_objetivo;

    // 7. Retornar resultado
    return {
      canCalibrate: true,
      shouldAdjust,
      currentWeightAvg: currentWeightAvg.mediaPeso,
      previousWeightAvg,
      weightChange_kg,
      weightChange_pct,
      weeklyChange_pct,
      currentKcal: kcal_objetivo,
      currentTDEE: tdee,
      adjustmentKcal,
      newKcalObjetivo,
      reason,
      ruleApplied,
      evaluationDate: new Date().toISOString(),
      numMeasurementsCurrent: currentWeightAvg.numMeasurements,
      numMeasurementsPrevious: previousWeightResult.rows[0].num_measurements
    };
  } catch (error) {
    console.error('Error evaluando calibración:', error);
    throw error;
  }
}

/**
 * Aplica una calibración nutricional
 * @param {number} userId
 * @param {Object} calibrationData - Datos de la calibración
 * @returns {Object} Resultado de la aplicación
 */
export async function applyCalibration(userId, calibrationData) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // 1. Guardar registro de calibración
    const calibrationResult = await client.query(
      `INSERT INTO app.nutrition_calibrations (
        user_id, peso_inicial_kg, peso_final_kg, peso_medio_7dias_kg,
        peso_change_kg, peso_change_pct, weekly_change_pct,
        current_kcal_objetivo, previous_tdee, objetivo,
        adjustment_kcal, adjustment_reason, should_adjust,
        new_kcal_objetivo, applied
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id`,
      [
        userId,
        calibrationData.previousWeightAvg,
        calibrationData.currentWeightAvg,
        calibrationData.currentWeightAvg,
        calibrationData.weightChange_kg,
        calibrationData.weightChange_pct,
        calibrationData.weeklyChange_pct,
        calibrationData.currentKcal,
        calibrationData.currentTDEE,
        calibrationData.objetivo,
        calibrationData.adjustmentKcal,
        calibrationData.reason,
        calibrationData.shouldAdjust,
        calibrationData.newKcalObjetivo,
        calibrationData.shouldAdjust // applied = true si se debe ajustar
      ]
    );

    const calibrationId = calibrationResult.rows[0].id;

    // 2. Si se debe ajustar, actualizar nutrition_profiles
    if (calibrationData.shouldAdjust) {
      await client.query(
        `UPDATE app.nutrition_profiles
         SET kcal_objetivo = $1, updated_at = NOW()
         WHERE user_id = $2`,
        [calibrationData.newKcalObjetivo, userId]
      );

      // Marcar calibración como aplicada con timestamp
      await client.query(
        `UPDATE app.nutrition_calibrations
         SET applied_at = NOW()
         WHERE id = $1`,
        [calibrationId]
      );
    }

    await client.query('COMMIT');

    return {
      success: true,
      calibrationId,
      applied: calibrationData.shouldAdjust,
      newKcalObjetivo: calibrationData.newKcalObjetivo
    };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error aplicando calibración:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Verifica si un usuario necesita calibración
 * @param {number} userId
 * @returns {Object} Información sobre necesidad de calibración
 */
export async function shouldTriggerCalibration(userId) {
  try {
    const result = await pool.query(
      `SELECT * FROM app.should_trigger_nutrition_calibration($1)`,
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        shouldCalibrate: false,
        reason: 'No se pudo determinar'
      };
    }

    const row = result.rows[0];
    return {
      shouldCalibrate: row.should_calibrate,
      daysSinceLast: row.days_since_last,
      lastCalibrationDate: row.last_calibration_date,
      nextCalibrationDate: row.next_calibration_date,
      reason: row.reason
    };
  } catch (error) {
    console.error('Error verificando necesidad de calibración:', error);
    throw error;
  }
}

/**
 * Obtiene el historial de calibraciones de un usuario
 * @param {number} userId
 * @param {number} limit - Número máximo de registros
 * @returns {Array} Historial de calibraciones
 */
export async function getCalibrationHistory(userId, limit = 10) {
  try {
    const result = await pool.query(
      `SELECT 
        id, calibration_date, evaluation_period_days,
        peso_inicial_kg, peso_final_kg, peso_change_kg, peso_change_pct,
        weekly_change_pct, objetivo,
        current_kcal_objetivo, adjustment_kcal, new_kcal_objetivo,
        adjustment_reason, should_adjust, applied, applied_at,
        user_feedback, created_at
       FROM app.nutrition_calibrations
       WHERE user_id = $1
       ORDER BY calibration_date DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows;
  } catch (error) {
    console.error('Error obteniendo historial de calibraciones:', error);
    throw error;
  }
}

/**
 * Obtiene usuarios que necesitan calibración automática
 * @returns {Array} Lista de usuarios pendientes de calibración
 */
export async function getPendingCalibrations() {
  try {
    const result = await pool.query(
      `SELECT * FROM app.v_pending_calibrations
       WHERE measurements_last_7days >= 5
       ORDER BY days_since_last DESC`
    );

    return result.rows;
  } catch (error) {
    console.error('Error obteniendo calibraciones pendientes:', error);
    throw error;
  }
}

/**
 * Ejecuta calibración automática para un usuario
 * @param {number} userId
 * @returns {Object} Resultado de la calibración
 */
export async function runAutoCalibration(userId) {
  try {
    // 1. Verificar si debe calibrar
    const shouldCalibrate = await shouldTriggerCalibration(userId);
    
    if (!shouldCalibrate.shouldCalibrate) {
      return {
        success: false,
        executed: false,
        reason: shouldCalibrate.reason
      };
    }

    // 2. Obtener objetivo del usuario
    const profileResult = await pool.query(
      `SELECT objetivo FROM app.nutrition_profiles WHERE user_id = $1`,
      [userId]
    );

    if (profileResult.rows.length === 0) {
      return {
        success: false,
        executed: false,
        reason: 'No existe perfil nutricional'
      };
    }

    const { objetivo } = profileResult.rows[0];

    // 3. Evaluar calibración
    const calibration = await evaluateCalibration(userId, objetivo);

    if (!calibration.canCalibrate) {
      return {
        success: false,
        executed: false,
        reason: calibration.reason
      };
    }

    // 4. Aplicar calibración
    calibration.objetivo = objetivo;
    const result = await applyCalibration(userId, calibration);

    return {
      success: true,
      executed: true,
      calibration: {
        ...calibration,
        calibrationId: result.calibrationId
      }
    };
  } catch (error) {
    console.error('Error en calibración automática:', error);
    return {
      success: false,
      executed: false,
      error: error.message
    };
  }
}
