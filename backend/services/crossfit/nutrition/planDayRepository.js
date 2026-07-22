import { buildCrossfitPlannedTrainingLoad } from "../trainingLoadAdapter.js";
import { normalizeCrossfitLevel } from "../versions.js";
import { validateTrainingLoad } from "../../trainingLoad/trainingLoadContract.js";

export const CROSSFIT_NUTRITION_PLAN_DAYS_SQL = `
SELECT
  mpd.plan_id,
  mpd.day_id,
  mpd.date_local,
  mpd.is_rest,
  mpd.metadata,
  mpd.metadata->'session_load' AS session_load
FROM app.methodology_plan_days mpd
JOIN app.methodology_plans mp
  ON mp.id = mpd.plan_id
WHERE mpd.plan_id = $1
  AND mp.user_id = $2
  AND LOWER(mp.methodology_type) = 'crossfit'
  AND mpd.date_local BETWEEN $3 AND $4
ORDER BY mpd.date_local, mpd.day_id`;

function buildSafeLoad({ level, dayType, confidence, source }) {
  const built = buildCrossfitPlannedTrainingLoad({
    level,
    sessionType: dayType === "D0" ? "recovery" : "mixed",
    dayType,
    loadTier: dayType === "D0" ? "rest" : "moderate",
    durationMin: dayType === "D0" ? 0 : null,
    context: {},
    ruleIds: [source]
  });
  if (!built.valid) return null;
  return {
    ...built.load,
    provenance: { ...built.load.provenance, source, confidence }
  };
}

export function resolveCrossfitNutritionPlanDay(row, { level } = {}) {
  const normalizedLevel = normalizeCrossfitLevel(level);
  if (!row || !row.plan_id || row.day_id === null || row.day_id === undefined || !normalizedLevel) {
    return { usable: false, reason: "CROSSFIT_PLAN_DAY_IDENTITY_MISSING" };
  }
  if (row.is_rest === true) {
    return {
      usable: true,
      plan_id: row.plan_id,
      day_id: row.day_id,
      date: row.date_local,
      metadata: row.metadata ?? {},
      source: "crossfit_plan_day_rest",
      training_load: buildSafeLoad({
        level: normalizedLevel,
        dayType: "D0",
        confidence: "high",
        source: "crossfit_plan_day_rest"
      })
    };
  }

  const candidate = row.session_load ?? row.metadata?.session_load ?? null;
  const validation = candidate ? validateTrainingLoad(candidate, { mode: "strict" }) : { valid: false };
  if (validation.valid) {
    return {
      usable: true,
      plan_id: row.plan_id,
      day_id: row.day_id,
      date: row.date_local,
      metadata: row.metadata ?? {},
      source: "crossfit_planned_session_load",
      training_load: candidate
    };
  }
  return {
    usable: true,
    plan_id: row.plan_id,
    day_id: row.day_id,
    date: row.date_local,
    metadata: row.metadata ?? {},
    source: "crossfit_conservative_d1",
    degraded: true,
    training_load: buildSafeLoad({
      level: normalizedLevel,
      dayType: "D1",
      confidence: "low",
      source: "crossfit_conservative_d1"
    })
  };
}

export async function loadCrossfitNutritionPlanDays(client, {
  planId,
  userId,
  startDate,
  endDate,
  level
} = {}) {
  const result = await client.query(CROSSFIT_NUTRITION_PLAN_DAYS_SQL, [
    planId,
    userId,
    startDate,
    endDate
  ]);
  const byDate = new Map();
  for (const row of result.rows) {
    const resolved = resolveCrossfitNutritionPlanDay(row, { level });
    if (!resolved.usable || !resolved.training_load) continue;
    const date = resolved.date instanceof Date
      ? resolved.date.toISOString().slice(0, 10)
      : String(resolved.date).slice(0, 10);
    byDate.set(date, resolved);
  }
  return byDate;
}
