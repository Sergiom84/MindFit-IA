/**
 * ICG/IPG DETECTOR SERVICE
 *
 * Detección automática de necesidad de reevaluación de fase basado en:
 * - ICG (Índice Cintura/Kilo) para volumen
 * - IPG (Índice Pérdida de Grasa) para definición
 * - IEC (Índice Estabilidad Corporal) para mantenimiento
 *
 * VALOR PARA EL USUARIO:
 * - Alertas automáticas cuando el volumen se descontrola (ICG >= 1.0)
 * - Detección de pérdida muscular en definición (IPG bajo + cintura estable)
 * - Identificación de estancamiento en mantenimiento
 * - Recomendaciones accionables personalizadas
 */

import { pool } from '../db.js';

/**
 * Estados de ICG para volumen
 */
export const ICG_STATUS = {
  GREEN_PLUS: 'green_plus',    // < 0.8 - Volumen limpio óptimo
  GREEN: 'green',              // 0.8-0.99 - Volumen limpio aceptable
  YELLOW: 'yellow',            // 1.0-1.49 - Volumen descontrolado, revisar
  RED: 'red'                   // >= 1.5 - Exceso de grasa, ajuste urgente
};

/**
 * Estados de IPG para definición
 */
export const IPG_STATUS = {
  GREEN_PLUS: 'green_plus',    // >= 1.0 - Pérdida de grasa óptima
  GREEN: 'green',              // 0.7-0.99 - Pérdida adecuada
  YELLOW: 'yellow',            // 0.5-0.69 - Pérdida lenta, revisar déficit
  RED: 'red'                   // < 0.5 - Posible pérdida muscular
};

/**
 * Umbral para cambios en mantenimiento
 */
const IEC_THRESHOLDS = {
  WEIGHT_STABLE: 0.5,          // ±0.5kg se considera estable
  WAIST_STABLE: 1.0,           // ±1.0cm se considera estable
  MAX_WEEKS_STABLE: 4          // Máximo 4 semanas sin cambio
};

/**
 * Calcula el ICG entre dos mediciones
 * ICG = (cintura_nueva - cintura_vieja) / (peso_nuevo - peso_viejo)
 *
 * @param {Object} current - Medición actual
 * @param {Object} previous - Medición previa
 * @returns {number|null} - ICG calculado o null si no aplica
 */
function calculateICG(current, previous) {
  const weightGain = current.weight_kg - previous.weight_kg;

  // Solo calcular ICG si hay ganancia de peso significativa (>0.2kg)
  if (weightGain <= 0.2) {
    return null;
  }

  const waistChange = current.waist_cm - previous.waist_cm;
  return waistChange / weightGain;
}

/**
 * Calcula el IPG entre dos mediciones
 * IPG = (cintura_vieja - cintura_nueva) / (peso_viejo - peso_nuevo)
 *
 * @param {Object} current - Medición actual
 * @param {Object} previous - Medición previa
 * @returns {number|null} - IPG calculado o null si no aplica
 */
function calculateIPG(current, previous) {
  const weightLoss = previous.weight_kg - current.weight_kg;

  // Solo calcular IPG si hay pérdida de peso significativa (>0.2kg)
  if (weightLoss <= 0.2) {
    return null;
  }

  const waistReduction = previous.waist_cm - current.waist_cm;
  return waistReduction / weightLoss;
}

/**
 * Determina el estado del ICG y genera recomendación
 *
 * @param {number} icg - Valor del ICG
 * @returns {Object} - { status, severity, message, action }
 */
function evaluateICG(icg) {
  if (icg === null || icg === undefined) {
    return {
      status: 'neutral',
      severity: 'none',
      message: 'Sin ganancia de peso significativa para evaluar ICG',
      action: null
    };
  }

  if (icg >= 1.5) {
    return {
      status: ICG_STATUS.RED,
      severity: 'high',
      message: 'ICG >= 1.5 - Ganancia de grasa excesiva detectada',
      action: 'REDUCIR calorías inmediatamente. Por cada kilo ganado, más de 1.5cm de cintura indica acumulación de grasa excesiva. Considera reducir 200-300 kcal/día o aumentar el gasto calórico.'
    };
  } else if (icg >= 1.0) {
    return {
      status: ICG_STATUS.YELLOW,
      severity: 'medium',
      message: 'ICG 1.0-1.4 - Volumen descontrolado',
      action: 'REVISAR macros y calorías. El ratio cintura/peso indica que estás ganando más grasa de lo ideal. Considera reducir 150-250 kcal/día o ajustar distribución de macros (menos carbos/grasas).'
    };
  } else if (icg >= 0.8) {
    return {
      status: ICG_STATUS.GREEN,
      severity: 'none',
      message: 'ICG 0.8-0.9 - Volumen limpio aceptable',
      action: 'Continúa con tu plan actual. Estás ganando masa con un ratio aceptable de grasa.'
    };
  } else {
    return {
      status: ICG_STATUS.GREEN_PLUS,
      severity: 'none',
      message: 'ICG < 0.8 (óptimo 0.5-0.7) - Volumen limpio óptimo',
      action: 'Excelente ratio de ganancia. Mantén tu plan nutricional y de entrenamiento actual.'
    };
  }
}

/**
 * Determina el estado del IPG y genera recomendación
 *
 * @param {number} ipg - Valor del IPG
 * @returns {Object} - { status, severity, message, action }
 */
function evaluateIPG(ipg) {
  if (ipg === null || ipg === undefined) {
    return {
      status: 'neutral',
      severity: 'none',
      message: 'Sin pérdida de peso significativa para evaluar IPG',
      action: null
    };
  }

  if (ipg < 0.6) {
    return {
      status: IPG_STATUS.RED,
      severity: 'high',
      message: 'IPG < 0.6 - Riesgo de pérdida muscular',
      action: 'AUMENTAR calorías o reducir déficit. Por cada kilo perdido, deberías perder al menos 0.6cm de cintura. Un IPG bajo indica que estás perdiendo músculo junto con grasa. Considera aumentar 150-250 kcal/día, revisar proteína y/o reducir cardio.'
    };
  } else if (ipg < 0.8) {
    return {
      status: IPG_STATUS.YELLOW,
      severity: 'medium',
      message: 'IPG 0.6-0.8 - Déficit agresivo o pérdida lenta',
      action: 'REVISAR estrategia. Ajusta déficit o actividad tras 7-14 días de confirmación. Considera reducir 100-150 kcal/día si el peso no baja o hay fatiga.'
    };
  } else if (ipg < 1.2) {
    return {
      status: IPG_STATUS.GREEN,
      severity: 'none',
      message: 'IPG 0.8-1.2 - Pérdida de grasa adecuada',
      action: 'Continúa con tu plan actual. Estás perdiendo grasa a un ritmo saludable.'
    };
  } else {
    return {
      status: IPG_STATUS.GREEN_PLUS,
      severity: 'none',
      message: 'IPG 1.2-1.5 - Pérdida de grasa óptima',
      action: 'Excelente progreso. Mantienes la masa muscular mientras pierdes grasa de forma eficiente.'
    };
  }
}

/**
 * Evalúa estabilidad en mantenimiento (IEC)
 *
 * @param {Array} measurements - Últimas 4 semanas de mediciones
 * @returns {Object} - { stable, weeks_stable, recommendation }
 */
function evaluateIEC(measurements) {
  if (measurements.length < 4) {
    return {
      stable: null,
      weeks_stable: measurements.length,
      message: 'Necesitas al menos 4 semanas de mediciones para evaluar estabilidad',
      action: 'Continúa registrando tus mediciones semanales'
    };
  }

  const first = measurements[0];
  const last = measurements[measurements.length - 1];

  const weightChange = Math.abs(last.weight_kg - first.weight_kg);
  const waistChange = Math.abs(last.waist_cm - first.waist_cm);

  const isWeightStable = weightChange <= IEC_THRESHOLDS.WEIGHT_STABLE;
  const isWaistStable = waistChange <= IEC_THRESHOLDS.WAIST_STABLE;

  if (isWeightStable && isWaistStable) {
    return {
      stable: true,
      weeks_stable: measurements.length,
      message: `Mantenimiento estable durante ${measurements.length} semanas`,
      action: measurements.length >= IEC_THRESHOLDS.MAX_WEEKS_STABLE
        ? 'Has mantenido estabilidad por 4+ semanas. Si deseas progresar, considera entrar en volumen o definición según tus objetivos.'
        : 'Mantienes tu composición corporal de forma estable. Continúa con tu plan actual.'
    };
  } else {
    const trend = last.weight_kg > first.weight_kg ? 'ganando' : 'perdiendo';
    return {
      stable: false,
      weeks_stable: 0,
      message: `No estás en mantenimiento estable - Estás ${trend} peso`,
      action: trend === 'ganando'
        ? 'Estás ganando peso en fase de mantenimiento. Reduce 50-100 kcal/día o aumenta actividad.'
        : 'Estás perdiendo peso en fase de mantenimiento. Aumenta 50-100 kcal/día para estabilizar.'
    };
  }
}

/**
 * Detección completa de ICG/IPG/IEC con recomendaciones automáticas
 *
 * VALOR: Este es el corazón del sistema de control nutricional.
 * Analiza automáticamente las mediciones y alerta al usuario ANTES
 * de que los problemas se agraven.
 *
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object>} - Análisis completo con recomendaciones
 */
export async function detectProgressionIssues(userId) {
  try {
    // 1. Obtener las últimas 4 mediciones validadas (aprox. 4 semanas si son semanales)
    const measurementsResult = await pool.query(
      `SELECT
        measurement_date,
        weight_kg,
        waist_cm,
        biceps_cm,
        chest_cm,
        calf_cm
       FROM app.body_measurements
       WHERE user_id = $1
         AND is_validated = TRUE
       ORDER BY measurement_date DESC
       LIMIT 4`,
      [userId]
    );

    if (measurementsResult.rows.length < 2) {
      return {
        success: true,
        has_data: false,
        message: 'Necesitas al menos 2 mediciones validadas para evaluar progresión',
        recommendation: 'Registra tus mediciones semanalmente para que el sistema pueda monitorearte'
      };
    }

    const measurements = measurementsResult.rows;
    const current = measurements[0];
    const previous = measurements[1];
    const twoWeeksAgo = measurements[2] || null;

    // 2. Calcular días entre mediciones
    const daysBetween = Math.floor(
      (new Date(current.measurement_date) - new Date(previous.measurement_date)) / (1000 * 60 * 60 * 24)
    );

    // 3. Obtener fase actual del usuario
    const phaseResult = await pool.query(
      `SELECT current_phase
       FROM app.bridge_current_state
       WHERE user_id = $1`,
      [userId]
    );

    const currentPhase = phaseResult.rows[0]?.current_phase || 'unknown';

    // 4. Calcular ICG, IPG según la fase
    const weightChange = current.weight_kg - previous.weight_kg;
    const waistChange = current.waist_cm - previous.waist_cm;

    let analysis = {
      user_id: userId,
      current_phase: currentPhase,
      measurement_date: current.measurement_date,
      days_between: daysBetween,
      weight_change_kg: weightChange,
      waist_change_cm: waistChange,
      indicators: {},
      alerts: [],
      recommendations: []
    };

    // 5. Análisis según fase
    if (currentPhase === 'volumen' || weightChange > 0.2) {
      // FASE DE VOLUMEN: Calcular ICG
      const icg = calculateICG(current, previous);
      const icgEval = evaluateICG(icg);

      analysis.indicators.icg = {
        value: icg,
        status: icgEval.status,
        message: icgEval.message
      };

      if (icgEval.severity !== 'none') {
        analysis.alerts.push({
          type: 'ICG',
          severity: icgEval.severity,
          message: icgEval.message,
          triggered_at: new Date().toISOString()
        });
        analysis.recommendations.push(icgEval.action);
      }

    } else if (currentPhase === 'definicion' || weightChange < -0.2) {
      // FASE DE DEFINICIÓN: Calcular IPG
      const ipg = calculateIPG(current, previous);
      const ipgEval = evaluateIPG(ipg);

      analysis.indicators.ipg = {
        value: ipg,
        status: ipgEval.status,
        message: ipgEval.message
      };

      if (ipgEval.severity !== 'none') {
        analysis.alerts.push({
          type: 'IPG',
          severity: ipgEval.severity,
          message: ipgEval.message,
          triggered_at: new Date().toISOString()
        });
        analysis.recommendations.push(ipgEval.action);
      }

      // Detección adicional: pérdida de peso sin pérdida de cintura (CRÍTICO)
      if (weightChange < -0.5 && Math.abs(waistChange) < 0.5) {
        analysis.alerts.push({
          type: 'MUSCLE_LOSS_WARNING',
          severity: 'high',
          message: 'Perdiendo peso sin reducir cintura - Posible pérdida muscular',
          triggered_at: new Date().toISOString()
        });
        analysis.recommendations.push(
          'ALERTA: Estás perdiendo peso pero tu cintura NO baja. Esto sugiere pérdida de masa muscular. ' +
          'ACCIÓN: Aumenta calorías 100-200/día, asegura proteína alta (2.2g/kg+), y reduce cardio si es excesivo.'
        );
      }

    } else {
      // FASE DE MANTENIMIENTO: Evaluar estabilidad (IEC)
      const iecEval = evaluateIEC(measurements);

      analysis.indicators.iec = {
        stable: iecEval.stable,
        weeks_stable: iecEval.weeks_stable,
        message: iecEval.message
      };

      if (iecEval.stable === false) {
        analysis.alerts.push({
          type: 'IEC',
          severity: 'medium',
          message: iecEval.message,
          triggered_at: new Date().toISOString()
        });
        analysis.recommendations.push(iecEval.action);
      }
    }

    // 6. Análisis de perímetros musculares (si están disponibles)
    if (current.biceps_cm && previous.biceps_cm) {
      const bicepsChange = current.biceps_cm - previous.biceps_cm;

      if (currentPhase === 'definicion' && bicepsChange < -0.5) {
        analysis.alerts.push({
          type: 'MUSCLE_LOSS',
          severity: 'high',
          message: `Bíceps redujo ${Math.abs(bicepsChange).toFixed(1)}cm - Posible catabolismo`,
          triggered_at: new Date().toISOString()
        });
        analysis.recommendations.push(
          'Tus perímetros musculares están bajando en definición. Aumenta proteína y considera reducir el déficit calórico.'
        );
      }
    }

    // 7. Determinar si requiere reevaluación
    const requiresReevaluation = analysis.alerts.some(a => a.severity === 'high' || a.severity === 'medium');

    analysis.requires_reevaluation = requiresReevaluation;
    analysis.summary = requiresReevaluation
      ? `⚠️ Se detectaron ${analysis.alerts.length} alertas que requieren ajuste de tu plan`
      : '✅ Tu progresión está dentro de los parámetros saludables';

    return {
      success: true,
      has_data: true,
      analysis
    };

  } catch (error) {
    console.error('Error en detectProgressionIssues:', error);
    throw new Error(`Error detectando progresión: ${error.message}`);
  }
}

/**
 * Registra una alerta de ICG/IPG en el bridge para coordinar ajustes
 *
 * @param {number} userId - ID del usuario
 * @param {Object} alert - Alerta detectada
 * @param {Object} analysis - Análisis completo
 */
export async function logProgressionAlert(userId, alert, analysis) {
  try {
    await pool.query(
      `INSERT INTO app.bridge_decision_logs (
        user_id,
        trigger_source,
        trigger_event,
        nutrition_inputs,
        decision_type,
        decision_details,
        was_applied
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        'nutrition',
        `${alert.type}_DETECTED`,
        JSON.stringify({
          weight_change: analysis.weight_change_kg,
          waist_change: analysis.waist_change_cm,
          days_between: analysis.days_between,
          indicator: analysis.indicators
        }),
        'progression_alert',
        JSON.stringify({
          alert_type: alert.type,
          severity: alert.severity,
          message: alert.message,
          recommendations: analysis.recommendations
        }),
        false
      ]
    );

    console.log(`📊 Alerta de progresión registrada: ${alert.type} (${alert.severity}) para usuario ${userId}`);

  } catch (error) {
    console.error('Error registrando alerta de progresión:', error);
    // No lanzar error, solo log - esto no debe bloquear el flujo principal
  }
}

export default {
  detectProgressionIssues,
  logProgressionAlert,
  ICG_STATUS,
  IPG_STATUS
};
