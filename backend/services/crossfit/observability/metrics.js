import { validateCrossfitNutrition } from "../contracts/index.js";
import { validateTrainingLoad } from "../../trainingLoad/trainingLoadContract.js";

export const CROSSFIT_LOAD_SAMPLE_SQL = `
SELECT mpd.metadata->'session_load' AS session_load
FROM app.methodology_plan_days mpd
JOIN app.methodology_plans mp ON mp.id = mpd.plan_id
WHERE LOWER(mp.methodology_type) = 'crossfit'
  AND mpd.is_rest = FALSE`;

export const CROSSFIT_NUTRITION_SAMPLE_SQL = `
SELECT periodization_context
FROM app.nutrition_plan_days
WHERE periodization_context ? 'crossfit_nutrition'`;

export const CROSSFIT_OUTBOX_HEALTH_SQL = `
WITH crossfit_events AS (
  SELECT event_key, status, attempts, created_at
  FROM app.bridge_event_outbox
  WHERE payload->>'methodology_id' = 'crossfit'
), decision_counts AS (
  SELECT e.event_key, COUNT(l.id)::int AS decision_count
  FROM crossfit_events e
  LEFT JOIN app.bridge_decision_logs l ON l.source_event_id = e.event_key
  GROUP BY e.event_key
)
SELECT
  (SELECT COUNT(*) FROM crossfit_events)::int AS events_total,
  (SELECT COUNT(*) FROM crossfit_events
    WHERE status = 'pending' AND created_at < NOW() - INTERVAL '10 minutes')::int AS pending_over_10min,
  (SELECT COUNT(*) FROM crossfit_events WHERE status = 'failed' AND attempts >= 5)::int AS failed_terminal,
  COALESCE((SELECT SUM(decision_count - 1) FROM decision_counts WHERE decision_count > 1), 0)::int
    AS duplicate_decisions`;

export const CROSSFIT_ASSESSMENT_HEALTH_SQL = `
WITH latest_professional AS (
  SELECT DISTINCT ON (user_id) user_id, verification_status, observed_at
  FROM app.crossfit_v2_assessments
  WHERE source = 'professional_review'
  ORDER BY user_id, event_sequence DESC
)
SELECT
  (SELECT COUNT(*) FROM app.crossfit_v2_assessments)::int AS total,
  (SELECT COUNT(*) FROM app.crossfit_v2_assessments WHERE source = 'self_report')::int AS self_report,
  (SELECT COUNT(*) FROM app.crossfit_v2_assessments WHERE source = 'professional_review')::int AS professional_events,
  (SELECT COUNT(*) FROM latest_professional WHERE verification_status = 'verified')::int AS active_verified,
  (SELECT COUNT(*) FROM latest_professional WHERE verification_status = 'revoked')::int AS active_revoked,
  (SELECT COUNT(*) FROM latest_professional
    WHERE verification_status = 'verified' AND observed_at < NOW() - INTERVAL '28 days')::int AS verified_stale`;

function percentage(numerator, denominator) {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.round(numerator / denominator * 10000) / 100;
}

function macroEnergy(macros) {
  const protein = Number(macros?.protein_g);
  const carbs = Number(macros?.carbs_g);
  const fat = Number(macros?.fat_g);
  if (![protein, carbs, fat].every(Number.isFinite)) return null;
  return protein * 4 + carbs * 4 + fat * 9;
}

export async function collectCrossfitV2Metrics(db) {
  const [loadResult, nutritionResult, outboxResult, assessmentResult] = await Promise.all([
    db.query(CROSSFIT_LOAD_SAMPLE_SQL),
    db.query(CROSSFIT_NUTRITION_SAMPLE_SQL),
    db.query(CROSSFIT_OUTBOX_HEALTH_SQL),
    db.query(CROSSFIT_ASSESSMENT_HEALTH_SQL)
  ]);

  let validLoads = 0;
  let degradedLoads = 0;
  for (const row of loadResult.rows) {
    const validation = validateTrainingLoad(row.session_load, { mode: "strict" });
    if (validation.valid) validLoads += 1;
    else degradedLoads += 1;
  }

  let validNutrition = 0;
  let invalidNutrition = 0;
  let shadowDays = 0;
  let activeDays = 0;
  let authoritativeDays = 0;
  let energyDriftOver1Pct = 0;
  for (const row of nutritionResult.rows) {
    const context = row.periodization_context ?? {};
    const contract = context.crossfit_nutrition;
    if (validateCrossfitNutrition(contract).valid) validNutrition += 1;
    else invalidNutrition += 1;
    if (contract?.mode === "shadow") shadowDays += 1;
    if (contract?.mode === "active") activeDays += 1;
    if (context.authoritative === true) authoritativeDays += 1;
    const baseEnergy = macroEnergy(context.base_macros);
    const resolvedEnergy = macroEnergy(context.resolved_macros);
    if (baseEnergy && resolvedEnergy !== null && Math.abs(resolvedEnergy - baseEnergy) / baseEnergy > 0.01) {
      energyDriftOver1Pct += 1;
    }
  }

  const outbox = outboxResult.rows[0] ?? {};
  const assessments = assessmentResult.rows[0] ?? {};
  const totalLoads = loadResult.rows.length;
  const validLoadPct = percentage(validLoads, totalLoads);
  const degradedLoadPct = percentage(degradedLoads, totalLoads);
  const duplicateDecisions = Number(outbox.duplicate_decisions ?? 0);
  return {
    generated_at: new Date().toISOString(),
    methodology: "crossfit",
    versions: {
      training_load: "training-load/v1",
      nutrition: "crossfit-nutrition/2.0.0",
      level_model: "level-model/2.0.0"
    },
    training_load: {
      total: totalLoads,
      valid: validLoads,
      degraded: degradedLoads,
      valid_pct: validLoadPct,
      degraded_pct: degradedLoadPct
    },
    nutrition: {
      total: nutritionResult.rows.length,
      valid_contracts: validNutrition,
      invalid_contracts: invalidNutrition,
      shadow_days: shadowDays,
      active_days: activeDays,
      authoritative_days: authoritativeDays,
      energy_drift_over_1pct: energyDriftOver1Pct
    },
    outbox: {
      events_total: Number(outbox.events_total ?? 0),
      pending_over_10min: Number(outbox.pending_over_10min ?? 0),
      failed_terminal: Number(outbox.failed_terminal ?? 0),
      duplicate_decisions: duplicateDecisions
    },
    assessments: {
      total: Number(assessments.total ?? 0),
      self_report: Number(assessments.self_report ?? 0),
      professional_events: Number(assessments.professional_events ?? 0),
      active_verified: Number(assessments.active_verified ?? 0),
      active_revoked: Number(assessments.active_revoked ?? 0),
      verified_stale: Number(assessments.verified_stale ?? 0)
    },
    gates: {
      sample_available: totalLoads > 0,
      valid_load_at_least_99pct: validLoadPct !== null && validLoadPct >= 99,
      degraded_load_below_1pct: degradedLoadPct !== null && degradedLoadPct < 1,
      zero_duplicate_decisions: duplicateDecisions === 0,
      zero_energy_drift_over_1pct: energyDriftOver1Pct === 0,
      zero_invalid_nutrition_contracts: invalidNutrition === 0,
      zero_stale_verified_assessments: Number(assessments.verified_stale ?? 0) === 0
    }
  };
}
