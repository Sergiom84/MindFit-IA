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
import {
  evaluateWeightLossRate,
  evaluateSkinfold,
  evaluateMuscleCircumferences,
  validateSkinfoldChange
} from './nutritionControlSupplements.js';

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
 * Documentación: ROJO < 0.6, AMARILLO 0.6-0.8, VERDE 0.8-1.2, VERDE+ 1.2-1.5
 */
export const IPG_STATUS = {
  GREEN_PLUS: 'green_plus',    // 1.2-1.5 - Pérdida de grasa óptima
  GREEN: 'green',              // 0.8-1.19 - Definición eficiente
  YELLOW: 'yellow',            // 0.6-0.79 - Déficit agresivo
  RED: 'red'                   // < 0.6 - Riesgo pérdida muscular
};

/**
 * Umbrales para IEC (Índice de Estabilidad Corporal)
 * Documentación: ROJO +1kg y +1cm, AMARILLO ±0.5kg, VERDE ±0.3kg, VERDE+ estable + ↑ perímetros
 */
const IEC_THRESHOLDS = {
  WEIGHT_STABLE_OPTIMAL: 0.3,  // ±0.3kg = VERDE
  WEIGHT_STABLE_NORMAL: 0.5,   // ±0.5kg = AMARILLO
  WAIST_STABLE: 1.0,           // ±1.0cm se considera estable
  SURPLUS_THRESHOLD: 1.0,      // +1kg y +1cm = ROJO
  MAX_WEEKS_STABLE: 4          // Máximo 4 semanas sin cambio
};

/**
 * Estados de IEC para mantenimiento
 */
export const IEC_STATUS = {
  GREEN_PLUS: 'green_plus',    // Peso estable + perímetros aumentan (recomp)
  GREEN: 'green',              // ±0.3 kg y cintura estable
  YELLOW: 'yellow',            // ±0.5 kg (oscilación normal)
  RED: 'red'                   // +1 kg y +1 cm (superávit no deseado)
};

function normalizePhaseFromNutrition(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return null;

  // Meta típica de planes v2 / perfiles
  if (v === 'cut') return 'definicion';
  if (v === 'bulk') return 'volumen';
  if (v === 'mant' || v === 'maintenance' || v === 'mantenimiento') return 'normocalorica';

  // Valores ya normalizados
  if (v === 'definicion' || v === 'volumen' || v === 'normocalorica') return v;

  return null;
}

async function resolvePhaseFallbackFromNutrition(userId) {
  // Queremos coherencia visual con Nutrición v2 aunque el bridge no tenga fase.
  // Fuente preferida: plan activo (tipo=activo). Fallback: nutrition_profiles.

  try {
    const planResult = await pool.query(
      `SELECT meta
       FROM app.nutrition_plans_v2
       WHERE user_id = $1 AND tipo = 'activo'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    const meta = planResult.rows[0]?.meta;
    const mapped = normalizePhaseFromNutrition(meta);
    if (mapped) return mapped;
  } catch {
    // No bloquea progression-check si nutrición no está disponible.
  }

  try {
    const profileResult = await pool.query(
      `SELECT current_phase, objetivo
       FROM app.nutrition_profiles
       WHERE user_id = $1
       LIMIT 1`,
      [userId]
    );

    const profile = profileResult.rows[0] || null;
    const mapped =
      normalizePhaseFromNutrition(profile?.current_phase) ||
      normalizePhaseFromNutrition(profile?.objetivo);
    if (mapped) return mapped;
  } catch {
    // No bloquea progression-check.
  }

  return null;
}

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
 * Según documentación: Evaluación a 14 días (2 semanas, media móvil)
 * ROJO (+1kg y +1cm), AMARILLO (±0.5kg), VERDE (±0.3kg), VERDE+ (estable + ↑ perímetros)
 *
 * @param {Array} measurements - Últimas mediciones (al menos 2 para evaluar 14 días)
 * @returns {Object} - { status, severity, message, action, stable, weeks_stable }
 */
function evaluateIEC(measurements) {
  // Documentación: evaluar a 14 días, necesitamos al menos 2 mediciones semanales
  if (measurements.length < 2) {
    return {
      status: 'neutral',
      severity: 'none',
      stable: null,
      weeks_stable: measurements.length,
      message: 'Necesitas al menos 2 mediciones (14 días) para evaluar estabilidad (IEC)',
      action: 'Continúa registrando tus mediciones semanales'
    };
  }

  // Evaluar 14 días: comparar última medición con la de hace 2 semanas
  const last = measurements[0];              // Más reciente
  const twoWeeksAgo = measurements[1];       // Hace ~14 días

  const weightChange = last.weight_kg - twoWeeksAgo.weight_kg;
  const waistChange = last.waist_cm - twoWeeksAgo.waist_cm;

  const absWeightChange = Math.abs(weightChange);
  const absWaistChange = Math.abs(waistChange);

  // Detectar recomposición: peso estable pero perímetros musculares aumentan
  let hasRecomp = false;
  if (absWeightChange <= IEC_THRESHOLDS.WEIGHT_STABLE_OPTIMAL) {
    // Verificar si hay aumento de perímetros musculares
    if (last.biceps_cm && twoWeeksAgo.biceps_cm) {
      const bicepsGain = last.biceps_cm - twoWeeksAgo.biceps_cm;
      const chestGain = last.chest_cm - twoWeeksAgo.chest_cm;
      if (bicepsGain >= 0.3 || chestGain >= 0.5) {
        hasRecomp = true;
      }
    }
  }

  // Estados según documentación (evaluación a 14 días)
  if (weightChange >= 1.0 && waistChange >= 1.0) {
    // ROJO: Superávit no deseado
    return {
      status: IEC_STATUS.RED,
      severity: 'high',
      stable: false,
      weeks_stable: 0,
      message: 'IEC ROJO: +1 kg y +1 cm en 14 días - Superávit no deseado',
      action: 'REDUCIR calorías 150 kcal/día. Estás ganando peso y grasa en fase de mantenimiento.'
    };
  } else if (hasRecomp) {
    // VERDE+: Recomposición corporal ideal
    return {
      status: IEC_STATUS.GREEN_PLUS,
      severity: 'none',
      stable: true,
      weeks_stable: 2,
      message: 'IEC VERDE+ (ÓPTIMO): Recomposición corporal - Peso estable con aumento de perímetros',
      action: 'Excelente. Estás ganando músculo sin subir grasa. Mantén tu plan actual o considera un micro superávit (+100 kcal/día).'
    };
  } else if (absWeightChange <= IEC_THRESHOLDS.WEIGHT_STABLE_OPTIMAL && absWaistChange <= IEC_THRESHOLDS.WAIST_STABLE) {
    // VERDE: Estabilidad óptima
    return {
      status: IEC_STATUS.GREEN,
      severity: 'none',
      stable: true,
      weeks_stable: 2,
      message: 'IEC VERDE: Mantenimiento estable (±0.3 kg) en 14 días',
      action: 'Mantienes tu composición corporal de forma estable. Continúa con tu plan actual.'
    };
  } else if (absWeightChange <= IEC_THRESHOLDS.WEIGHT_STABLE_NORMAL) {
    // AMARILLO: Oscilación normal
    return {
      status: IEC_STATUS.YELLOW,
      severity: 'none',
      stable: true,
      weeks_stable: 2,
      message: 'IEC AMARILLO: Oscilación normal (±0.5 kg) en 14 días',
      action: 'Variación normal de peso. Mantén tu plan y sigue monitoreando.'
    };
  } else {
    // No estable: ajuste necesario
    const trend = weightChange > 0 ? 'ganando' : 'perdiendo';
    return {
      status: 'unstable',
      severity: 'medium',
      stable: false,
      weeks_stable: 0,
      message: `No estás en mantenimiento estable - Estás ${trend} peso (${absWeightChange.toFixed(1)} kg en 14 días)`,
      action: trend === 'ganando'
        ? 'Estás ganando peso en fase de mantenimiento. Reduce 150 kcal/día o aumenta actividad.'
        : 'Estás perdiendo peso en fase de mantenimiento. Aumenta 150 kcal/día para estabilizar.'
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
        calf_cm,
        skinfold_abdominal_mm
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

    let currentPhase = phaseResult.rows[0]?.current_phase || null;
    if (!currentPhase) {
      currentPhase = await resolvePhaseFallbackFromNutrition(userId);
    }
    if (!currentPhase) currentPhase = 'unknown';

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

      // Registrar estado y validar confirmación
      const validation = await registerAndValidateState(
        userId,
        'icg',
        { ...current, weight_change: weightChange, waist_change: waistChange },
        icg,
        icgEval.status
      );

      analysis.indicators.icg = {
        value: icg,
        status: icgEval.status,
        message: icgEval.message,
        confirmation: validation
      };

      // Solo generar alertas si el cambio debe aplicarse
      if (validation && !validation.shouldApplyChange) {
        analysis.alerts.push({
          type: 'ICG_PENDING_CONFIRMATION',
          severity: 'info',
          message: `ICG ${icgEval.status.toUpperCase()} detectado - ${validation.confirmationReason}`,
          triggered_at: new Date().toISOString(),
          consecutive_count: validation.consecutiveCount
        });
        analysis.recommendations.push(
          `Estado ${icgEval.status.toUpperCase()} requiere confirmación. Continúa monitoreando.`
        );
      } else if (icgEval.severity !== 'none') {
        analysis.alerts.push({
          type: 'ICG',
          severity: icgEval.severity,
          message: icgEval.message,
          triggered_at: new Date().toISOString(),
          confirmed: validation?.statusConfirmed || false
        });
        analysis.recommendations.push(icgEval.action);
      }

    } else if (currentPhase === 'definicion' || weightChange < -0.2) {
      // FASE DE DEFINICIÓN: Calcular IPG
      const ipg = calculateIPG(current, previous);
      const ipgEval = evaluateIPG(ipg);

      // Registrar estado y validar confirmación
      const validation = await registerAndValidateState(
        userId,
        'ipg',
        { ...current, weight_change: weightChange, waist_change: waistChange },
        ipg,
        ipgEval.status
      );

      analysis.indicators.ipg = {
        value: ipg,
        status: ipgEval.status,
        message: ipgEval.message,
        confirmation: validation
      };

      // Solo generar alertas si el cambio debe aplicarse
      if (validation && !validation.shouldApplyChange) {
        analysis.alerts.push({
          type: 'IPG_PENDING_CONFIRMATION',
          severity: 'info',
          message: `IPG ${ipgEval.status.toUpperCase()} detectado - ${validation.confirmationReason}`,
          triggered_at: new Date().toISOString(),
          consecutive_count: validation.consecutiveCount
        });
        analysis.recommendations.push(
          `Estado ${ipgEval.status.toUpperCase()} requiere confirmación. Continúa monitoreando.`
        );
      } else if (ipgEval.severity !== 'none') {
        analysis.alerts.push({
          type: 'IPG',
          severity: ipgEval.severity,
          message: ipgEval.message,
          triggered_at: new Date().toISOString(),
          confirmed: validation?.statusConfirmed || false
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

      // Verificar bajada de rendimiento 2 semanas consecutivas (documentación)
      const performanceCheck = await checkPerformanceDrop(userId);
      if (performanceCheck && performanceCheck.hasPerformanceDrop) {
        analysis.alerts.push({
          type: 'PERFORMANCE_DROP',
          severity: 'high',
          message: `Rendimiento bajando ${performanceCheck.consecutiveWeeks} semanas consecutivas`,
          triggered_at: new Date().toISOString(),
          consecutive_weeks: performanceCheck.consecutiveWeeks
        });
        analysis.recommendations.push(
          'ALERTA RENDIMIENTO: Tu rendimiento ha bajado 2+ semanas consecutivas. ' +
          'ACCIÓN: Considera hacer un diet break (2-4 semanas en normocalórica) o aumentar calorías 100-200/día para recuperar.'
        );
      }

    } else {
      // FASE DE MANTENIMIENTO: Evaluar estabilidad (IEC)
      const iecEval = evaluateIEC(measurements);

      analysis.indicators.iec = {
        status: iecEval.status,
        stable: iecEval.stable,
        weeks_stable: iecEval.weeks_stable,
        message: iecEval.message
      };

      if (iecEval.severity !== 'none') {
        analysis.alerts.push({
          type: 'IEC',
          severity: iecEval.severity,
          message: iecEval.message,
          triggered_at: new Date().toISOString()
        });
        analysis.recommendations.push(iecEval.action);
      }
    }

    // 6. COMPLEMENTOS DE CONTROL - Ritmo de pérdida, pliegues, perímetros
    
    // 6.1 Ritmo de pérdida semanal (solo en definición)
    if (currentPhase === 'definicion' && Math.abs(weightChange) > 0.1) {
      try {
        const weightLossRateEval = await evaluateWeightLossRate(
          userId, 
          weightChange, 
          current.weight_kg
        );
        
        if (weightLossRateEval.success) {
          analysis.indicators.weight_loss_rate = weightLossRateEval.data;
          
          if (weightLossRateEval.severity !== 'none') {
            analysis.alerts.push({
              type: 'WEIGHT_LOSS_RATE',
              severity: weightLossRateEval.severity,
              message: weightLossRateEval.message,
              triggered_at: new Date().toISOString(),
              data: weightLossRateEval.data
            });
            analysis.recommendations.push(weightLossRateEval.action);
          }
        }
      } catch (error) {
        console.error('[Complemento] Error evaluando ritmo de pérdida:', error);
      }
    }

    // 6.2 Validación de pliegue abdominal (si está disponible)
    if (current.skinfold_abdominal_mm) {
      try {
        const skinfoldEval = await evaluateSkinfold(
          userId,
          current.skinfold_abdominal_mm,
          currentPhase
        );

        if (skinfoldEval.success) {
          analysis.indicators.skinfold = {
            current_mm: current.skinfold_abdominal_mm,
            status: skinfoldEval.status,
            message: skinfoldEval.message
          };

          if (skinfoldEval.severity !== 'none') {
            analysis.alerts.push({
              type: 'SKINFOLD',
              severity: skinfoldEval.severity,
              message: skinfoldEval.message,
              triggered_at: new Date().toISOString()
            });
            analysis.recommendations.push(skinfoldEval.action);
          }
        }

        // Validar cambio brusco de pliegue (±20% en 1 semana)
        if (previous.skinfold_abdominal_mm) {
          const skinfoldChange = validateSkinfoldChange(
            current.skinfold_abdominal_mm,
            previous.skinfold_abdominal_mm
          );

          if (skinfoldChange.is_suspicious) {
            analysis.alerts.push({
              type: 'SUSPICIOUS_SKINFOLD_CHANGE',
              severity: 'medium',
              message: skinfoldChange.reason,
              triggered_at: new Date().toISOString(),
              change_percent: skinfoldChange.change_percent
            });
            analysis.recommendations.push(
              'Cambio brusco de pliegue detectado. Repite la medición para confirmar.'
            );
          }
        }
      } catch (error) {
        console.error('[Complemento] Error evaluando pliegue:', error);
      }
    }

    // 6.3 Análisis de perímetros musculares (MEJORADO con umbrales específicos)
    if (current.biceps_cm && previous.biceps_cm && current.chest_cm && previous.chest_cm) {
      try {
        const circumferenceEval = evaluateMuscleCircumferences(
          current,
          previous,
          currentPhase
        );

        if (circumferenceEval.success) {
          analysis.indicators.muscle_circumferences = {
            biceps_change: circumferenceEval.biceps_change_cm,
            chest_change: circumferenceEval.chest_change_cm,
            phase: currentPhase
          };

          // Agregar alertas de perímetros
          circumferenceEval.alerts.forEach(alert => {
            if (alert.severity !== 'none') {
              analysis.alerts.push({
                ...alert,
                triggered_at: new Date().toISOString()
              });
            }
          });

          // Agregar recomendaciones de perímetros
          circumferenceEval.recommendations.forEach(rec => {
            analysis.recommendations.push(rec);
          });
        }
      } catch (error) {
        console.error('[Complemento] Error evaluando perímetros:', error);
      }
    } else if (current.biceps_cm && previous.biceps_cm) {
      // Fallback: análisis básico si no hay pecho
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
 * Verifica si hay bajada de rendimiento 2 semanas consecutivas
 * 
 * @param {number} userId - ID del usuario
 * @returns {Promise<Object>} Resultado de verificación
 */
async function checkPerformanceDrop(userId) {
  try {
    const result = await pool.query(
      `SELECT * FROM app.check_performance_drop($1)`,
      [userId]
    );

    if (result.rows.length > 0) {
      const check = result.rows[0];
      return {
        hasPerformanceDrop: check.has_performance_drop,
        consecutiveWeeks: check.consecutive_weeks,
        lastMeasurementDate: check.last_measurement_date,
        shouldSuggestDietBreak: check.should_suggest_diet_break,
        reason: check.reason
      };
    }

    return null;
  } catch (error) {
    console.error('Error verificando rendimiento:', error);
    return null;
  }
}

/**
 * Registra el estado ICG/IPG/IEC en el historial y valida confirmación
 * 
 * @param {number} userId - ID del usuario
 * @param {string} indicatorType - 'icg' | 'ipg' | 'iec'
 * @param {Object} measurement - Datos de medición
 * @param {number} indicatorValue - Valor calculado del indicador
 * @param {string} status - Estado detectado
 * @returns {Promise<Object>} Resultado de validación
 */
async function registerAndValidateState(userId, indicatorType, measurement, indicatorValue, status) {
  try {
    const result = await pool.query(
      `SELECT * FROM app.register_icg_ipg_state($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        userId,
        measurement.measurement_date,
        indicatorType,
        measurement.weight_kg,
        measurement.waist_cm,
        measurement.weight_change || 0,
        measurement.waist_change || 0,
        indicatorValue,
        status
      ]
    );

    if (result.rows.length > 0) {
      const validation = result.rows[0];
      return {
        stateId: validation.state_id,
        consecutiveCount: validation.consecutive_count,
        statusConfirmed: validation.status_confirmed,
        previousStatus: validation.previous_status,
        shouldApplyChange: validation.should_apply_change,
        confirmationReason: validation.confirmation_reason
      };
    }

    return null;
  } catch (error) {
    console.error('Error registrando estado:', error);
    return null;
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
  IPG_STATUS,
  IEC_STATUS
};
