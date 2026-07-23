import { pool } from "../db.js";
import { ensureWorkoutScheduleV3 } from "../utils/ensureScheduleV3.js";
import { logNutritionChange } from "./nutritionAuditLogger.js";
import { generateNutritionPlanWithKcalOverride } from "./nutritionCalculator.js";
import { isIsoDate, formatLocalDate } from './nutritionUtils.js';
import { isHipertrofiaMethodology } from './hipertrofia/identity.js';

const MODES = new Set(["quincenal", "seguridad"]);
const SOURCES = new Set(["auto", "manual"]);





function mapMethodologyToTrainingType(value) {
  if (!value) return null;
  if (isHipertrofiaMethodology(value)) return "hipertrofia";
  const normalized = String(value).toLowerCase();
  if (normalized.includes("fuerza") || normalized.includes("power") || normalized.includes("heavy")) return "fuerza";
  if (normalized.includes("resistencia") || normalized.includes("cardio") || normalized.includes("oposicion")) {
    return "resistencia";
  }
  return "general";
}

function clampDelta(delta, maxAbs) {
  if (!Number.isFinite(delta) || !Number.isFinite(maxAbs) || maxAbs <= 0) return delta;
  if (delta > maxAbs) return maxAbs;
  if (delta < -maxAbs) return -maxAbs;
  return delta;
}

async function resolveTrainingContext(userId, duracionDias) {
  const requestedDuration = Math.max(3, Math.min(Number(duracionDias) || 7, 28));

  const activePlanResult = await pool.query(
    `
      SELECT
        id as methodology_plan_id,
        methodology_type,
        plan_data,
        plan_start_date,
        confirmed_at,
        created_at,
        status
      FROM app.methodology_plans
      WHERE user_id = $1
        AND status IN ('active', 'confirmed')
        AND cancelled_at IS NULL
      ORDER BY is_current DESC NULLS LAST, confirmed_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `,
    [userId]
  );

  if (activePlanResult.rowCount === 0) {
    return { training_type: null, training_schedule: [] };
  }

  const activePlan = activePlanResult.rows[0];
  const methodologyPlanId = activePlan.methodology_plan_id;

  const resolvedTrainingType = mapMethodologyToTrainingType(activePlan.methodology_type) || "general";

  // Asegurar programación real si falta
  const hasScheduleResult = await pool.query(
    `
      SELECT 1
      FROM app.workout_schedule
      WHERE methodology_plan_id = $1 AND user_id = $2
      LIMIT 1
    `,
    [methodologyPlanId, userId]
  );

  if (hasScheduleResult.rowCount === 0) {
    const startConfigQuery = await pool.query(
      `SELECT * FROM app.plan_start_config WHERE methodology_plan_id = $1`,
      [methodologyPlanId]
    );
    const startConfig = startConfigQuery.rowCount > 0 ? startConfigQuery.rows[0] : null;
    const startDateFromPlan =
      activePlan.plan_start_date || activePlan.confirmed_at || activePlan.created_at || new Date();

    const scheduleClient = await pool.connect();
    try {
      await ensureWorkoutScheduleV3(
        scheduleClient,
        userId,
        methodologyPlanId,
        activePlan.plan_data,
        startDateFromPlan,
        startConfig
      );
    } finally {
      scheduleClient.release();
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + (requestedDuration - 1));

  const scheduleRangeResult = await pool.query(
    `
      SELECT scheduled_date
      FROM app.workout_schedule
      WHERE methodology_plan_id = $1
        AND user_id = $2
        AND scheduled_date BETWEEN $3 AND $4
      ORDER BY scheduled_date ASC
    `,
    [methodologyPlanId, userId, formatLocalDate(today), formatLocalDate(endDate)]
  );

  const scheduledDates = new Set(
    scheduleRangeResult.rows
      .map(row => formatLocalDate(row.scheduled_date))
      .filter(Boolean)
  );

  const trainingSchedule = Array.from({ length: requestedDuration }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    const key = formatLocalDate(date);
    return scheduledDates.has(key);
  });

  return { training_type: resolvedTrainingType, training_schedule: trainingSchedule };
}

export async function applyNutritionKcalAdjustment(userId, payload = {}) {
  const mode = String(payload.mode || "quincenal").trim().toLowerCase();
  const source = String(payload.source || "auto").trim().toLowerCase();
  const reason = payload.reason ? String(payload.reason).slice(0, 400) : null;
  const metrics = payload.metrics ?? null;

  if (!MODES.has(mode)) throw new Error("mode inválido (quincenal|seguridad)");
  if (!SOURCES.has(source)) throw new Error("source inválido (auto|manual)");

  const rawDelta = Number(payload.delta_kcal);
  if (!Number.isFinite(rawDelta) || rawDelta === 0) throw new Error("delta_kcal inválido");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const currentPlanResult = await client.query(
      `
        SELECT *
        FROM app.nutrition_plans_v2
        WHERE user_id = $1 AND tipo = 'activo'
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE;
      `,
      [userId]
    );

    if (currentPlanResult.rowCount === 0) {
      throw new Error("No tienes un plan nutricional activo");
    }

    const currentPlan = currentPlanResult.rows[0];
    const previousPlanId = currentPlan.id;
    const previousKcal = Number(currentPlan.kcal_objetivo);

    const modeMax = mode === "seguridad" ? 150 : 250;
    const pctMax = Math.max(1, Math.round(previousKcal * 0.1));
    const maxAbsDelta = Math.min(modeMax, pctMax);

    const clampedDelta = clampDelta(Math.round(rawDelta), maxAbsDelta);
    const newKcal = Math.round(previousKcal + clampedDelta);

    // Obtener perfil para regenerar plan
    const profileResult = await client.query(
      "SELECT * FROM app.nutrition_profiles WHERE user_id = $1 LIMIT 1",
      [userId]
    );
    if (profileResult.rowCount === 0) {
      throw new Error("Perfil nutricional no encontrado");
    }
    const profile = profileResult.rows[0];

    const duracionDias = Math.min(Number(currentPlan.duracion_dias) || 7, 28);

    // Resolver training context (si hay plan de entrenamiento activo) para mantener consistencia con el puente.
    const trainingContext = await resolveTrainingContext(userId, duracionDias);
    const resolvedTrainingType = trainingContext.training_type || currentPlan.training_type || "general";
    const resolvedTrainingSchedule = trainingContext.training_schedule || [];

    const planData = generateNutritionPlanWithKcalOverride(
      {
        ...profile,
        training_type: resolvedTrainingType,
        training_days:
          profile.training_days ||
          (resolvedTrainingSchedule.length > 0 ? resolvedTrainingSchedule.filter(Boolean).length : undefined),
        metabolic_type: profile.metabolic_type,
        steps_per_day: profile.steps_per_day,
      },
      duracionDias,
      resolvedTrainingSchedule,
      newKcal
    );

    // Archivar plan activo previo (y cualquier otro por seguridad)
    await client.query(
      `
        UPDATE app.nutrition_plans_v2
        SET tipo = 'archivado', updated_at = NOW()
        WHERE user_id = $1 AND tipo = 'activo';
      `,
      [userId]
    );

    const newPlanResult = await client.query(
      `
        INSERT INTO app.nutrition_plans_v2 (
          user_id, plan_name, tipo, bmr, tdee, kcal_objetivo, macros_objetivo,
          meta, duracion_dias, training_type, comidas_por_dia, fuente, version_reglas
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id;
      `,
      [
        userId,
        `Plan ajustado (${mode}) - ${duracionDias} días`,
        "activo",
        planData.bmr,
        planData.tdee,
        planData.kcal_objetivo,
        JSON.stringify(planData.macros_objetivo),
        planData.meta,
        planData.duracion_dias,
        planData.training_type,
        planData.comidas_por_dia,
        planData.fuente,
        planData.version_reglas,
      ]
    );

    const newPlanId = newPlanResult.rows[0].id;

    for (const day of planData.days) {
      const dayResult = await client.query(
        `
          INSERT INTO app.nutrition_plan_days (plan_id, day_index, tipo_dia, kcal, macros)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id;
        `,
        [newPlanId, day.day_index, day.tipo_dia, day.kcal, JSON.stringify(day.macros)]
      );
      const dayId = dayResult.rows[0].id;

      for (const meal of day.meals) {
        await client.query(
          `
            INSERT INTO app.nutrition_meals (plan_day_id, orden, nombre, kcal, macros, timing_note)
            VALUES ($1, $2, $3, $4, $5, $6);
          `,
          [dayId, meal.orden, meal.nombre, meal.kcal, JSON.stringify(meal.macros), meal.timing_note]
        );
      }
    }

    const actionResult = await client.query(
      `
        INSERT INTO app.nutrition_adjustment_actions (
          user_id, mode, source,
          previous_plan_id, new_plan_id,
          previous_kcal, new_kcal, delta_kcal,
          reason, metrics,
          undo_expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW() + INTERVAL '24 hours')
        RETURNING id, undo_expires_at;
      `,
      [
        userId,
        mode,
        source,
        previousPlanId,
        newPlanId,
        previousKcal,
        newKcal,
        clampedDelta,
        reason,
        metrics ? JSON.stringify(metrics) : null,
      ]
    );

    await logNutritionChange(
      {
        userId,
        changeType: "kcal_adjust",
        delta: { kcal: clampedDelta },
        ruleId: mode === "seguridad" ? "NUTR-CAL-SAFETY-001" : "NUTR-CAL-RECAL-010",
        reason: reason || `Ajuste ${mode}: ${clampedDelta > 0 ? "+" : ""}${clampedDelta} kcal`,
        metrics: metrics || null,
        previousValues: { plan_id: previousPlanId, kcal_objetivo: previousKcal },
        newValues: { plan_id: newPlanId, kcal_objetivo: newKcal },
        source,
      },
      client
    );

    await client.query("COMMIT");

    return {
      success: true,
      action_id: actionResult.rows[0].id,
      undo_expires_at: actionResult.rows[0].undo_expires_at,
      previous_plan_id: previousPlanId,
      new_plan_id: newPlanId,
      previous_kcal: previousKcal,
      new_kcal: newKcal,
      delta_kcal: clampedDelta,
      max_abs_delta_kcal: maxAbsDelta,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function undoLastNutritionKcalAdjustment(userId, options = {}) {
  const nowIso = options.now || null;
  if (nowIso && !isIsoDate(nowIso)) throw new Error("now inválido");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const actionResult = await client.query(
      `
        SELECT *
        FROM app.nutrition_adjustment_actions
        WHERE user_id = $1
          AND reverted_at IS NULL
        ORDER BY applied_at DESC
        LIMIT 1
        FOR UPDATE;
      `,
      [userId]
    );

    if (actionResult.rowCount === 0) {
      throw new Error("No hay ajustes recientes para deshacer");
    }

    const action = actionResult.rows[0];
    const now = nowIso ? new Date(`${nowIso}T00:00:00Z`) : new Date();

    if (now > new Date(action.undo_expires_at)) {
      throw new Error("Ventana de deshacer expirada (24h)");
    }

    // Archivar plan actual activo y restaurar el anterior.
    await client.query(
      `
        UPDATE app.nutrition_plans_v2
        SET tipo = 'archivado', updated_at = NOW()
        WHERE user_id = $1 AND tipo = 'activo';
      `,
      [userId]
    );

    await client.query(
      `
        UPDATE app.nutrition_plans_v2
        SET tipo = 'activo', updated_at = NOW()
        WHERE id = $1 AND user_id = $2;
      `,
      [action.previous_plan_id, userId]
    );

    await client.query(
      `
        UPDATE app.nutrition_adjustment_actions
        SET reverted_at = NOW()
        WHERE id = $1;
      `,
      [action.id]
    );

    await logNutritionChange(
      {
        userId,
        changeType: "kcal_adjust",
        delta: { kcal: -Number(action.delta_kcal) },
        ruleId: "NUTR-CAL-UNDO-001",
        reason: "Deshacer último ajuste (24h)",
        metrics: { action_id: action.id },
        previousValues: { plan_id: action.new_plan_id, kcal_objetivo: action.new_kcal },
        newValues: { plan_id: action.previous_plan_id, kcal_objetivo: action.previous_kcal },
        source: "manual",
      },
      client
    );

    await client.query("COMMIT");

    return {
      success: true,
      action_id: action.id,
      restored_plan_id: action.previous_plan_id,
      restored_kcal: action.previous_kcal,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
