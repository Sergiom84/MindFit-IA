import test from "node:test";
import assert from "node:assert/strict";
import {
  collectCrossfitV2Metrics,
  CROSSFIT_ASSESSMENT_HEALTH_SQL,
  CROSSFIT_LOAD_SAMPLE_SQL,
  CROSSFIT_NUTRITION_SAMPLE_SQL,
  CROSSFIT_OUTBOX_HEALTH_SQL
} from "../services/crossfit/observability/metrics.js";
import { buildCrossfitPlannedTrainingLoad } from "../services/crossfit/trainingLoadAdapter.js";
import { resolveCrossfitNutritionDay } from "../services/crossfit/nutrition/nutritionAdapter.js";

function load() {
  return buildCrossfitPlannedTrainingLoad({
    level: "beginner",
    sessionType: "mixed",
    dayType: "D1",
    loadTier: "moderate",
    durationMin: 45,
    rpeTarget: 7,
    ruleIds: ["test"]
  }).load;
}

test("métricas CrossFit exponen gates >=99%, <1%, duplicados y drift sin PII", async () => {
  assert.match(
    CROSSFIT_NUTRITION_SAMPLE_SQL,
    /crossfit_nutrition' <> 'null'::jsonb/
  );
  const trainingLoad = load();
  const nutrition = resolveCrossfitNutritionDay({
    userId: 1,
    planId: 2,
    dayId: 3,
    requestId: "metrics-case",
    level: "beginner",
    goal: "performance",
    baseMacros: { protein_g: 140, carbs_g: 300, fat_g: 70 },
    kcalTarget: 2390,
    weightKg: 70,
    trainingLoad,
    mode: "shadow"
  });
  const db = {
    async query(sql) {
      if (sql === CROSSFIT_LOAD_SAMPLE_SQL) {
        return { rows: [
          { load_source: "planned", session_load: trainingLoad },
          { load_source: "actual", session_load: { ...trainingLoad, status: "completed" } }
        ] };
      }
      if (sql === CROSSFIT_NUTRITION_SAMPLE_SQL) {
        return { rows: [{
          periodization_context: {
            base_macros: { protein_g: 140, carbs_g: 300, fat_g: 70 },
            resolved_macros: {
              protein_g: nutrition.resolved.macros.protein_g,
              carbs_g: nutrition.resolved.macros.carbs_g,
              fat_g: nutrition.resolved.macros.fat_g
            },
            authoritative: false,
            crossfit_nutrition: nutrition.contract
          }
        }] };
      }
      if (sql === CROSSFIT_ASSESSMENT_HEALTH_SQL) {
        return { rows: [{
          total: 3,
          self_report: 2,
          professional_events: 1,
          active_verified: 1,
          active_revoked: 0,
          verified_stale: 0
        }] };
      }
      assert.equal(sql, CROSSFIT_OUTBOX_HEALTH_SQL);
      return { rows: [{ events_total: 1, pending_over_10min: 0, failed_terminal: 0, duplicate_decisions: 0 }] };
    }
  };
  const metrics = await collectCrossfitV2Metrics(db);
  assert.equal(metrics.training_load.valid_pct, 100);
  assert.equal(metrics.training_load.degraded_pct, 0);
  assert.equal(metrics.training_load.planned_total, 1);
  assert.equal(metrics.training_load.actual_total, 1);
  assert.equal(metrics.nutrition.valid_contracts, 1);
  assert.equal(metrics.assessments.active_verified, 1);
  assert.equal(metrics.gates.valid_load_at_least_99pct, true);
  assert.equal(metrics.gates.degraded_load_below_1pct, true);
  assert.equal(metrics.gates.zero_duplicate_decisions, true);
  assert.equal(metrics.gates.zero_energy_drift_over_1pct, true);
  assert.equal(metrics.gates.zero_stale_verified_assessments, true);
  assert.equal(JSON.stringify(metrics).includes("user_id"), false);
});
