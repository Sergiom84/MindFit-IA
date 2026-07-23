import { activateMethodologyPlan } from "../../methodologyPlansService.js";
import { ensureWorkoutScheduleV3 } from "../../../utils/ensureScheduleV3.js";
import { validateCrossfitPlan } from "../contracts/schemas.js";
import { CROSSFIT_VERSIONS } from "../versions.js";

function serviceError(code, message, status = 409, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}

function expectedScheduleShape(planData) {
  const canonical = planData?.crossfit_v2;
  const validation = validateCrossfitPlan(canonical);
  if (!validation.valid) {
    throw serviceError(
      "CROSSFIT_MATERIALIZATION_CONTRACT_INVALID",
      "El plan CrossFit v2 no cumple el contrato de materialización",
      422,
      { errors: validation.errors }
    );
  }
  return {
    canonical,
    totalDays: canonical.block.week_count * 7,
    totalSessions: canonical.weeks.flatMap((week) => week.sessions).length
  };
}

export function crossfitCanonicalStartDate(planData = {}) {
  const date = planData?.crossfit_v2?.weeks?.[0]?.sessions?.[0]?.date;
  return /^\d{4}-\d{2}-\d{2}$/.test(String(date ?? "")) ? date : null;
}

async function readMaterializedShape(client, userId, planId) {
  const result = await client.query(
    `SELECT
       (SELECT COUNT(*)::int
          FROM app.methodology_plan_days
         WHERE plan_id = $1) AS total_days,
       (SELECT COUNT(*)::int
          FROM app.workout_schedule
         WHERE methodology_plan_id = $1 AND user_id = $2) AS total_sessions`,
    [planId, userId]
  );
  return {
    totalDays: Number(result.rows[0]?.total_days ?? 0),
    totalSessions: Number(result.rows[0]?.total_sessions ?? 0)
  };
}

export async function confirmCrossfitPlanV2({
  client,
  userId,
  planId,
  startDate,
  startConfig = null,
  activatePlan = activateMethodologyPlan,
  materializeSchedule = ensureWorkoutScheduleV3
} = {}) {
  if (!client?.query || !userId || !planId || !startDate) {
    throw new TypeError("confirmCrossfitPlanV2 requiere client, userId, planId y startDate");
  }

  await client.query("BEGIN");
  try {
    const locked = await client.query(
      `SELECT id, status, plan_data
         FROM app.methodology_plans
        WHERE id = $1 AND user_id = $2
        FOR UPDATE`,
      [planId, userId]
    );
    if (!locked.rowCount) {
      throw serviceError("CROSSFIT_PLAN_NOT_FOUND", "Plan no encontrado", 404);
    }

    const row = locked.rows[0];
    const expected = expectedScheduleShape(row.plan_data);
    if (row.plan_data?.schema_version !== CROSSFIT_VERSIONS.plan) {
      throw serviceError("CROSSFIT_MATERIALIZATION_CONTRACT_INVALID", "Versión de plan CrossFit no soportada", 422);
    }

    if (row.status === "active") {
      const current = await readMaterializedShape(client, userId, planId);
      if (current.totalDays !== expected.totalDays || current.totalSessions !== expected.totalSessions) {
        throw serviceError(
          "CROSSFIT_SCHEDULE_INCOMPLETE",
          "El plan activo tiene un calendario incompleto y no puede reconstruirse automáticamente",
          409,
          { expected, current }
        );
      }
      await client.query("COMMIT");
      return { idempotentReplay: true, ...current };
    }

    if (row.status !== "draft") {
      throw serviceError(
        "HISTORY_IMMUTABLE",
        "Solo un draft CrossFit v2 puede confirmarse",
        409,
        { current_status: row.status }
      );
    }

    await activatePlan(userId, planId, client);
    await client.query(
      `UPDATE app.methodology_plans
          SET plan_start_date = $1::date, updated_at = NOW()
        WHERE id = $2 AND user_id = $3`,
      [startDate, planId, userId]
    );

    const materialized = await materializeSchedule(
      client,
      userId,
      planId,
      row.plan_data,
      startDate,
      startConfig
    );
    if (
      materialized?.adapter !== "crossfit-v2"
      || Number(materialized.total_days) !== expected.totalDays
      || Number(materialized.total_sessions) !== expected.totalSessions
    ) {
      throw serviceError(
        "CROSSFIT_SCHEDULE_INCOMPLETE",
        "La materialización CrossFit no produjo el calendario completo",
        409,
        { expected, materialized: materialized ?? null }
      );
    }

    const persisted = await readMaterializedShape(client, userId, planId);
    if (persisted.totalDays !== expected.totalDays || persisted.totalSessions !== expected.totalSessions) {
      throw serviceError(
        "CROSSFIT_SCHEDULE_INCOMPLETE",
        "El calendario CrossFit persistido no coincide con el contrato",
        409,
        { expected, persisted }
      );
    }

    await client.query("COMMIT");
    return { idempotentReplay: false, ...persisted };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
