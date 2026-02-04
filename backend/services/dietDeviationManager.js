/**
 * DIET DEVIATION MANAGER SERVICE
 * Servicio para gestionar saltos de dieta y compensacion semanal
 *
 * Implementa el documento: "Gestion de saltos de dieta (todas las fases)"
 */

import { pool } from '../db.js';
import { ensureWeeklySnapshot, logNutritionChange } from './nutritionAuditLogger.js';

// ============================================================================
// CONSTANTES Y CONFIGURACION
// ============================================================================

// Franjas horarias permitidas
export const MEAL_SLOTS = ['desayuno', 'comida', 'cena', 'extra', 'snack'];

// Niveles de confianza
export const CONFIDENCE_LEVELS = {
  BAJO: 'bajo',
  MEDIO: 'medio',
  ALTO: 'alto'
};

// Prioridades de compensacion por fase
export const PHASE_PRIORITIES = {
  bulk: 'carbs_first',   // Volumen: recortar carbos primero, luego grasas
  cut: 'carbs_only',     // Definicion: mantener proteina y grasas minimas, recortar solo carbos
  mant: 'balanced'       // Mantenimiento: reparto equilibrado
};

// Configuracion por defecto
const DEFAULT_CONFIG = {
  maxCompensationPerDayPct: 0.20,  // Max 20% reduccion diaria
  minProteinGKg: 2.0,              // Proteina minima 2g/kg
  conservativeMode: false           // Modo conservador desactivado
};

// ============================================================================
// FUNCIONES PRINCIPALES
// ============================================================================

/**
 * Registra un salto de dieta y genera plan de compensacion
 * @param {number} userId - ID del usuario
 * @param {Object} deviationData - Datos del salto
 * @returns {Object} Resultado con plan de compensacion
 */
export async function registerDeviation(userId, deviationData) {
  const {
    date,
    mealSlot,
    excessKcal,
    description = null,
    foodsConsumed = null,
    confidenceLevel = 'medio',
    excessProtein = 0,
    excessCarbs = 0,
    excessFat = 0
  } = deviationData;

  // Validaciones
  if (!MEAL_SLOTS.includes(mealSlot)) {
    throw new Error(`Franja horaria invalida. Use: ${MEAL_SLOTS.join(', ')}`);
  }

  if (!Object.values(CONFIDENCE_LEVELS).includes(confidenceLevel)) {
    throw new Error(`Nivel de confianza invalido. Use: bajo, medio, alto`);
  }

  if (excessKcal <= 0) {
    throw new Error('Las calorias de exceso deben ser positivas');
  }

  // Obtener configuracion del usuario
  const config = await getUserConfig(userId);

  // Obtener perfil nutricional
  const profile = await getNutritionProfile(userId);

  // Registrar el salto
  const deviationResult = await pool.query(
    `INSERT INTO app.diet_deviations (
      user_id, deviation_date, meal_slot, excess_kcal,
      description, foods_consumed, confidence_level,
      excess_protein_g, excess_carbs_g, excess_fat_g
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      userId, date, mealSlot, excessKcal,
      description, foodsConsumed, confidenceLevel,
      excessProtein, excessCarbs, excessFat
    ]
  );

  const deviation = deviationResult.rows[0];

  // Resumen semanal para decidir si se compensa
  const weekStartResult = await pool.query(
    `SELECT app.get_week_start($1::date) AS week_start`,
    [date]
  );
  const weekStart = weekStartResult.rows[0]?.week_start || null;

  const weeklySummaryResult = await pool.query(
    `SELECT * FROM app.get_weekly_deviation_summary($1, $2)`,
    [userId, weekStart]
  );
  const weeklySummary = weeklySummaryResult.rows[0] || null;
  const netDeviation = weeklySummary?.net_deviation ?? excessKcal;

  // Si la desviación semanal no supera el objetivo, no compensar
  if (netDeviation <= 0) {
    try {
      await ensureWeeklySnapshot(userId, { source: 'diet_deviation' });
    } catch (error) {
      console.error('Error guardando snapshot semanal (sin compensación):', error);
    }

    return {
      deviation,
      compensationPlan: {
        days: [],
        totalCompensation: 0,
        effectiveExcess: 0,
        originalExcess: excessKcal,
        isConservative: false,
        perDayReduction: 0,
        remainingUncompensated: 0,
        message: 'Sin compensación: la carga calórica semanal no supera el objetivo'
      },
      weeklySummary,
      message: 'Salto registrado sin compensación (semana dentro de objetivo)'
    };
  }

  // Calcular plan de compensacion sobre la desviación semanal neta
  const compensationPlan = calculateCompensationPlan({
    excessKcal: netDeviation,
    deviationDate: new Date(date),
    confidenceLevel,
    dailyTargetKcal: weeklySummary?.daily_target || profile.daily_target_kcal || profile.tdee || 2000,
    weightKg: profile.peso_kg,
    objetivo: profile.objetivo || 'mant',
    config
  });

  // Guardar plan de compensacion
  for (const day of compensationPlan.days) {
    await pool.query(
      `INSERT INTO app.daily_compensation_plan (
        user_id, deviation_id, compensation_date,
        kcal_adjustment, protein_g_target, carbs_g_adjustment, fat_g_adjustment
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id, compensation_date, deviation_id) DO UPDATE SET
        kcal_adjustment = EXCLUDED.kcal_adjustment,
        protein_g_target = EXCLUDED.protein_g_target,
        carbs_g_adjustment = EXCLUDED.carbs_g_adjustment,
        fat_g_adjustment = EXCLUDED.fat_g_adjustment`,
      [
        userId, deviation.id, day.date,
        day.kcalAdjustment, day.proteinTarget,
        day.carbsAdjustment, day.fatAdjustment
      ]
    );
  }

  try {
    await logNutritionChange({
      userId,
      changeType: 'kcal_adjust',
      delta: {
        weekly_excess_kcal: netDeviation,
        per_day_reduction: compensationPlan.perDayReduction,
        days: compensationPlan.days.length
      },
      ruleId: 'NUTR-JUMP-010',
      reason: compensationPlan.message,
      metrics: {
        confidence: confidenceLevel,
        weekly_target: weeklySummary?.weekly_target,
        daily_target: weeklySummary?.daily_target,
        total_excess_kcal: weeklySummary?.total_excess_kcal
      },
      previousValues: {
        daily_target_kcal: weeklySummary?.daily_target,
        weekly_target_kcal: weeklySummary?.weekly_target
      },
      newValues: {
        compensation_plan: {
          total_compensation: compensationPlan.totalCompensation,
          remaining_uncompensated: compensationPlan.remainingUncompensated
        }
      },
      source: 'diet_deviation'
    });
  } catch (error) {
    console.error('Error registrando log de compensación semanal:', error);
  }

  try {
    await ensureWeeklySnapshot(userId, { source: 'diet_deviation' });
  } catch (error) {
    console.error('Error guardando snapshot semanal (compensación):', error);
  }

  return {
    deviation,
    compensationPlan,
    weeklySummary,
    message: compensationPlan.isConservative
      ? 'Confianza baja: aplicando compensacion conservadora (50%)'
      : 'Plan de compensacion generado'
  };
}

/**
 * Calcula el plan de compensacion para un salto
 */
function calculateCompensationPlan(params) {
  const {
    excessKcal,
    deviationDate,
    confidenceLevel,
    dailyTargetKcal,
    weightKg,
    objetivo,
    config
  } = params;

  // Calcular dias restantes en la semana
  const dayOfWeek = deviationDate.getDay(); // 0 = domingo
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;

  // Si no quedan dias, retornar vacio
  if (daysUntilSunday === 0) {
    return {
      days: [],
      totalCompensation: 0,
      isConservative: false,
      message: 'Salto registrado el domingo - se reevaluara al cierre semanal',
      cannotCompensate: true
    };
  }

  // Aplicar regla anti-ruido: confianza baja = compensar solo la mitad
  const isConservative = confidenceLevel === 'bajo' || config.conservativeMode;
  const effectiveExcess = isConservative ? Math.round(excessKcal / 2) : excessKcal;

  // Calcular reduccion por dia
  let perDayReduction = Math.round(effectiveExcess / daysUntilSunday);

  // Aplicar limite maximo (20% del objetivo diario por defecto)
  const maxReduction = Math.round(dailyTargetKcal * config.maxCompensationPerDayPct);
  if (perDayReduction > maxReduction) {
    perDayReduction = maxReduction;
  }

  // Calcular proteina minima a mantener
  const minProtein = Math.round(weightKg * config.minProteinGKg);

  // Calcular como distribuir la reduccion segun fase
  const macroAdjustments = calculateMacroAdjustments(perDayReduction, objetivo);

  // Generar plan para cada dia
  const days = [];
  let totalCompensation = 0;

  for (let i = 1; i <= daysUntilSunday; i++) {
    const compensationDate = new Date(deviationDate);
    compensationDate.setDate(compensationDate.getDate() + i);

    days.push({
      date: compensationDate.toISOString().split('T')[0],
      dayNumber: i,
      kcalAdjustment: -perDayReduction,
      proteinTarget: minProtein,
      carbsAdjustment: macroAdjustments.carbs,
      fatAdjustment: macroAdjustments.fat
    });

    totalCompensation += perDayReduction;
  }

  return {
    days,
    totalCompensation,
    effectiveExcess,
    originalExcess: excessKcal,
    isConservative,
    perDayReduction,
    remainingUncompensated: effectiveExcess - totalCompensation,
    message: generateCompensationMessage(perDayReduction, daysUntilSunday, minProtein)
  };
}

/**
 * Calcula ajustes de macros segun fase
 */
function calculateMacroAdjustments(kcalReduction, objetivo) {
  const priority = PHASE_PRIORITIES[objetivo] || PHASE_PRIORITIES.mant;

  switch (priority) {
    case 'carbs_first':
      // Volumen: recortar carbos primero (70%), luego grasas (30%)
      return {
        carbs: -Math.round((kcalReduction * 0.70) / 4),  // 70% de carbos
        fat: -Math.round((kcalReduction * 0.30) / 9)     // 30% de grasas
      };

    case 'carbs_only':
      // Definicion: todo de carbohidratos para mantener grasas minimas
      return {
        carbs: -Math.round(kcalReduction / 4),
        fat: 0
      };

    case 'balanced':
    default:
      // Mantenimiento: reparto equilibrado
      return {
        carbs: -Math.round((kcalReduction * 0.50) / 4),
        fat: -Math.round((kcalReduction * 0.50) / 9)
      };
  }
}

/**
 * Genera mensaje de compensacion
 */
function generateCompensationMessage(perDayReduction, days, minProtein) {
  return `Reducir ${perDayReduction} kcal/dia durante ${days} dias. Mantener proteina >= ${minProtein}g.`;
}

/**
 * Obtiene la configuracion del usuario
 */
async function getUserConfig(userId) {
  const result = await pool.query(
    'SELECT * FROM app.diet_deviation_config WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    // Crear configuracion por defecto
    await pool.query(
      'INSERT INTO app.diet_deviation_config (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [userId]
    );
    return {
      maxCompensationPerDayPct: DEFAULT_CONFIG.maxCompensationPerDayPct,
      minProteinGKg: DEFAULT_CONFIG.minProteinGKg,
      conservativeMode: DEFAULT_CONFIG.conservativeMode
    };
  }

  const config = result.rows[0];
  return {
    maxCompensationPerDayPct: config.max_compensation_per_day_pct || DEFAULT_CONFIG.maxCompensationPerDayPct,
    minProteinGKg: config.min_protein_g_kg || DEFAULT_CONFIG.minProteinGKg,
    conservativeMode: config.conservative_mode || DEFAULT_CONFIG.conservativeMode,
    phasePriority: config.phase_priority
  };
}

/**
 * Obtiene el perfil nutricional del usuario
 */
async function getNutritionProfile(userId) {
  const result = await pool.query(
    'SELECT * FROM app.nutrition_profiles WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    throw new Error('Perfil nutricional no encontrado. Cree uno primero.');
  }

  return result.rows[0];
}

// ============================================================================
// FUNCIONES DE CONSULTA
// ============================================================================

/**
 * Obtiene el resumen semanal de desviaciones
 */
export async function getWeeklySummary(userId, weekStartDate = null) {
  // Si no se especifica fecha, usar la semana actual
  const weekStart = weekStartDate || getWeekStart(new Date());

  const result = await pool.query(
    'SELECT * FROM app.get_weekly_deviation_summary($1, $2)',
    [userId, weekStart]
  );

  if (result.rows.length === 0) {
    // Retornar resumen vacio
    const profile = await getNutritionProfile(userId);
    return {
      weekStart,
      dailyTarget: profile.daily_target_kcal || 2000,
      weeklyTarget: (profile.daily_target_kcal || 2000) * 7,
      totalExcessKcal: 0,
      totalCompensated: 0,
      netDeviation: 0,
      deviationCount: 0,
      compensationStatus: 'none'
    };
  }

  const row = result.rows[0];
  return {
    weekStart: row.week_start,
    dailyTarget: row.daily_target,
    weeklyTarget: row.weekly_target,
    totalExcessKcal: row.total_excess_kcal,
    totalCompensated: row.total_compensated,
    netDeviation: row.net_deviation,
    deviationCount: row.deviation_count,
    compensationStatus: row.compensation_status
  };
}

/**
 * Obtiene los saltos de dieta de una semana
 */
export async function getDeviationsForWeek(userId, weekStartDate = null) {
  const weekStart = weekStartDate || getWeekStart(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const result = await pool.query(
    `SELECT * FROM app.diet_deviations
     WHERE user_id = $1
       AND deviation_date >= $2
       AND deviation_date < $3
     ORDER BY deviation_date DESC, created_at DESC`,
    [userId, weekStart, weekEnd.toISOString().split('T')[0]]
  );

  return result.rows;
}

/**
 * Obtiene el plan de compensacion para una fecha
 */
export async function getCompensationForDate(userId, date) {
  const result = await pool.query(
    `SELECT dcp.*, dd.excess_kcal, dd.deviation_date, dd.description
     FROM app.daily_compensation_plan dcp
     JOIN app.diet_deviations dd ON dd.id = dcp.deviation_id
     WHERE dcp.user_id = $1 AND dcp.compensation_date = $2
     ORDER BY dcp.created_at`,
    [userId, date]
  );

  if (result.rows.length === 0) {
    return {
      date,
      hasCompensation: false,
      totalAdjustment: 0,
      items: []
    };
  }

  const totalAdjustment = result.rows.reduce((sum, row) => sum + row.kcal_adjustment, 0);

  return {
    date,
    hasCompensation: true,
    totalAdjustment,
    items: result.rows.map(row => ({
      deviationId: row.deviation_id,
      deviationDate: row.deviation_date,
      deviationDescription: row.description,
      kcalAdjustment: row.kcal_adjustment,
      proteinTarget: row.protein_g_target,
      isApplied: row.is_applied
    }))
  };
}

/**
 * Obtiene el objetivo diario ajustado (con compensaciones)
 */
export async function getAdjustedDailyTarget(userId, date) {
  const profile = await getNutritionProfile(userId);
  const baseTarget = profile.daily_target_kcal || profile.tdee || 2000;

  const compensation = await getCompensationForDate(userId, date);

  return {
    date,
    baseTarget,
    adjustment: compensation.totalAdjustment,
    adjustedTarget: baseTarget + compensation.totalAdjustment,
    hasCompensation: compensation.hasCompensation,
    compensationDetails: compensation.items
  };
}

/**
 * Marca una compensacion como aplicada
 */
export async function markCompensationApplied(userId, date, actualKcalConsumed = null) {
  const result = await pool.query(
    `UPDATE app.daily_compensation_plan
     SET is_applied = TRUE, actual_kcal_consumed = $3
     WHERE user_id = $1 AND compensation_date = $2
     RETURNING *`,
    [userId, date, actualKcalConsumed]
  );

  // Actualizar estado del salto original si todas las compensaciones estan aplicadas
  for (const row of result.rows) {
    await updateDeviationStatus(row.deviation_id);
  }

  return {
    updated: result.rows.length,
    message: `Compensacion marcada como aplicada para ${date}`
  };
}

/**
 * Actualiza el estado de un salto basado en sus compensaciones
 */
async function updateDeviationStatus(deviationId) {
  const result = await pool.query(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE is_applied = TRUE) as applied
     FROM app.daily_compensation_plan
     WHERE deviation_id = $1`,
    [deviationId]
  );

  const { total, applied } = result.rows[0];
  let status = 'pending';

  if (applied === total && total > 0) {
    status = 'completed';
  } else if (applied > 0) {
    status = 'partial';
  }

  await pool.query(
    `UPDATE app.diet_deviations
     SET compensation_status = $2
     WHERE id = $1`,
    [deviationId, status]
  );
}

// ============================================================================
// FUNCIONES DE CONFIGURACION
// ============================================================================

/**
 * Actualiza la configuracion del usuario
 */
export async function updateUserConfig(userId, configData) {
  const {
    autoCompensate,
    maxCompensationPerDayPct,
    minProteinGKg,
    conservativeMode,
    phasePriority,
    notifyOnDeviation,
    notifyCompensationReminder
  } = configData;

  const updates = [];
  const values = [userId];
  let paramIndex = 2;

  const addUpdate = (field, value) => {
    if (value !== undefined) {
      updates.push(`${field} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  };

  addUpdate('auto_compensate', autoCompensate);
  addUpdate('max_compensation_per_day_pct', maxCompensationPerDayPct);
  addUpdate('min_protein_g_kg', minProteinGKg);
  addUpdate('conservative_mode', conservativeMode);
  addUpdate('phase_priority', phasePriority ? JSON.stringify(phasePriority) : undefined);
  addUpdate('notify_on_deviation', notifyOnDeviation);
  addUpdate('notify_compensation_reminder', notifyCompensationReminder);

  if (updates.length === 0) {
    throw new Error('No hay campos para actualizar');
  }

  await pool.query(
    `INSERT INTO app.diet_deviation_config (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO UPDATE SET ${updates.join(', ')}, updated_at = NOW()`,
    values
  );

  return getUserConfig(userId);
}

/**
 * Elimina un salto de dieta y sus compensaciones
 */
export async function deleteDeviation(userId, deviationId) {
  // Verificar que el salto pertenece al usuario
  const check = await pool.query(
    'SELECT id FROM app.diet_deviations WHERE id = $1 AND user_id = $2',
    [deviationId, userId]
  );

  if (check.rows.length === 0) {
    throw new Error('Salto no encontrado');
  }

  // Eliminar compensaciones asociadas
  await pool.query(
    'DELETE FROM app.daily_compensation_plan WHERE deviation_id = $1',
    [deviationId]
  );

  // Eliminar el salto
  await pool.query(
    'DELETE FROM app.diet_deviations WHERE id = $1',
    [deviationId]
  );

  return { deleted: true, deviationId };
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Obtiene el lunes de una semana
 */
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Ajustar si es domingo
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

/**
 * Verifica si la carga semanal supera el objetivo
 */
export async function checkWeeklyStatus(userId) {
  const summary = await getWeeklySummary(userId);

  const currentDay = new Date().getDay(); // 0 = domingo
  const daysElapsed = currentDay === 0 ? 7 : currentDay;
  const proportionalTarget = Math.round((summary.dailyTarget * daysElapsed));

  // Obtener calorias acumuladas (esto requeriria integracion con tracking de comidas)
  // Por ahora, retornamos solo la info de desviaciones

  return {
    ...summary,
    daysElapsed,
    proportionalTarget,
    recommendation: summary.netDeviation > 0
      ? `Exceso acumulado de ${summary.netDeviation} kcal. Compensacion en curso.`
      : 'Dentro del objetivo semanal.'
  };
}

export default {
  registerDeviation,
  getWeeklySummary,
  getDeviationsForWeek,
  getCompensationForDate,
  getAdjustedDailyTarget,
  markCompensationApplied,
  updateUserConfig,
  deleteDeviation,
  checkWeeklyStatus,
  MEAL_SLOTS,
  CONFIDENCE_LEVELS
};
