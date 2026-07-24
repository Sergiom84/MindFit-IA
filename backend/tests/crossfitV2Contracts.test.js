import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  CROSSFIT_CONTRACT_ENUMS,
  readCrossfitPlan,
  validateCrossfitAutoreg,
  validateCrossfitNutrition,
  validateCrossfitPlan,
  validateCrossfitResult,
  validateCrossfitSession,
  validateCrossfitWod
} from "../services/crossfit/contracts/index.js";
import {
  CROSSFIT_FEATURE_FLAGS,
  getCrossfitFeatureFlags,
  getCrossfitFeatureFlagsForUser,
  getCrossfitRolloutQaUsers,
  isCrossfitFeatureEnabled,
  isCrossfitRolloutUser
} from "../services/crossfit/featureFlags.js";
import { CROSSFIT_REASON_CODES, isCrossfitReasonCode } from "../services/crossfit/reasonCodes.js";
import {
  buildCrossfitActualTrainingLoad,
  buildCrossfitPlannedTrainingLoad,
  resolveCrossfitPlannedTrainingLoad
} from "../services/crossfit/trainingLoadAdapter.js";
import { CROSSFIT_VERSIONS } from "../services/crossfit/versions.js";

const trace = (reasonCode = "AUTOREG_HOLD") => [{
  rule_id: "CF-TEST-001",
  reason_code: reasonCode,
  scope: "test",
  action: "validate",
  details: {}
}];

const plannedLoad = (status = "planned") => ({
  contract_version: "training-load/v1",
  methodology_id: "crossfit",
  methodology_level: "principiante",
  session_type: "mixed",
  status,
  day_type: "D1",
  load_tier: "moderate",
  duration: { planned_min: 55, actual_min: status === "completed" ? 53 : null },
  effort: { rpe_target: 7, rpe_actual: status === "completed" ? 7.5 : null },
  work: { sets_total: null, hard_sets: null, reps_total: 60, volume_kg: null, work_interval_min: 12, distance_m: null },
  demand: { glycolytic: 0.5, neuromuscular: 0.3, aerobic: 0.4, skill: 0.2 },
  recovery: { hours_to_next_session: 48, hours_to_next_hard_session: 72, double_session_day: false },
  environment: { heat: false, humidity_high: false, protective_gear: false, altitude: false },
  context: { deload: false, taper: false, test: false, competition: false, injury_modified: false },
  provenance: { source: "crossfit_v2_test", confidence: "high", rule_ids: ["CF-SES-006"] }
});

const movement = () => ({
  canonical_movement_id: "air-squat",
  catalog_version: CROSSFIT_VERSIONS.catalog,
  name: "Air Squat",
  dose: { type: "reps", reps: 15 },
  skill_tier: 1,
  equipment: [],
  stimulus_tags: ["squat"],
  substitutions: ["box-squat"],
  scale_id: "scaled"
});

const embeddedWod = () => ({
  wod_id: "wod-1",
  format: "amrap",
  time_domain: "medium",
  target_minutes: 12,
  time_cap_seconds: 720,
  stimulus: "continuous_sustainable",
  score_type: "rounds_reps",
  movements: [movement()],
  scales: [{ id: "scaled", stimulus_delta: 0 }],
  stop_rules: ["stop_on_sharp_or_rising_pain"],
  decision_trace: trace("WOD_STIMULUS_MISS")
});

const standaloneWod = () => ({
  schema_version: CROSSFIT_VERSIONS.wod,
  ruleset_version: CROSSFIT_VERSIONS.ruleset,
  catalog_version: CROSSFIT_VERSIONS.catalog,
  request_id: "req-1",
  ...embeddedWod()
});

const embeddedSession = () => ({
  session_id: "session-1",
  plan_id: "plan-1",
  day_id: "day-1",
  user_id: 10,
  level: "beginner",
  status: "planned",
  date: "2026-08-03",
  session_type: "mixed",
  training_load: plannedLoad(),
  warmup: [{ type: "general", minutes: 6 }],
  blocks: [{ type: "skill", minutes: 12 }],
  wod: embeddedWod(),
  cooldown: [{ type: "downregulation", minutes: 5 }],
  decision_trace: trace()
});

const standaloneSession = () => ({
  schema_version: CROSSFIT_VERSIONS.session,
  ruleset_version: CROSSFIT_VERSIONS.ruleset,
  catalog_version: CROSSFIT_VERSIONS.catalog,
  request_id: "req-1",
  ...embeddedSession()
});

const validPlan = () => ({
  schema_version: CROSSFIT_VERSIONS.plan,
  ruleset_version: CROSSFIT_VERSIONS.ruleset,
  catalog_version: CROSSFIT_VERSIONS.catalog,
  request_id: "req-1",
  plan_id: "plan-1",
  user_id: 10,
  level: "beginner",
  classification_id: "classification-1",
  generation: {
    seed_hash: "a".repeat(64),
    revision: 0,
    idempotency_key: "b".repeat(64),
    generated_at: "2026-07-22T12:00:00.000Z",
    supersedes: null
  },
  block: {
    block_id: "block-1",
    week_count: 8,
    phase_by_week: ["baseline", "build", "build", "deload", "build", "build", "taper", "reevaluation"],
    quotas: {}
  },
  weeks: [{ week_number: 1, target_load: { day_type: "D1" }, sessions: [embeddedSession()] }],
  decision_trace: trace()
});

test("CrossFit v2: los cuatro flags son independientes y false por defecto", () => {
  assert.deepEqual(getCrossfitFeatureFlags({}), {
    generation: false,
    results: false,
    emitsTrainingLoad: false,
    nutritionLoad: false
  });
  for (const envName of Object.values(CROSSFIT_FEATURE_FLAGS)) {
    const state = getCrossfitFeatureFlags({ [envName]: "true" });
    assert.equal(Object.values(state).filter(Boolean).length, 1);
  }
  assert.equal(isCrossfitFeatureEnabled("unknown", { CROSSFIT_V2_GENERATION: "true" }), false);
});

test("CrossFit v2: el rollout exige flag y usuario incluido en la cohorte QA", () => {
  const env = {
    CROSSFIT_V2_GENERATION: "true",
    CROSSFIT_V2_RESULTS: "true",
    CROSSFIT_V2_QA_USERS: " 17,23,17 "
  };
  assert.deepEqual(getCrossfitRolloutQaUsers(env), ["17", "23"]);
  assert.equal(isCrossfitRolloutUser(17, env), true);
  assert.equal(isCrossfitRolloutUser(99, env), false);
  assert.equal(getCrossfitFeatureFlagsForUser(99, env).generation, false);
  assert.deepEqual(getCrossfitFeatureFlagsForUser(17, env), {
    generation: true,
    results: true,
    emitsTrainingLoad: false,
    nutritionLoad: false
  });
  assert.equal(isCrossfitRolloutUser(17, { ...env, CROSSFIT_V2_QA_USERS: "" }), false);
  assert.equal(isCrossfitRolloutUser(17, { ...env, CROSSFIT_V2_QA_USERS: "*" }), false);
  assert.equal(isCrossfitRolloutUser(17, { ...env, NODE_ENV: "test", CROSSFIT_V2_QA_USERS: "*" }), true);
});

test("CrossFit v2: catálogo de reason codes coincide con CSV y cubre invariantes", () => {
  const reasonRows = fs.readFileSync(new URL("../../docs/crossfit/data/reason_codes.csv", import.meta.url), "utf8").trim().split(/\r?\n/).slice(1);
  const csvCodes = reasonRows.map((row) => row.split(",")[0]);
  assert.equal(csvCodes.length, 70);
  assert.deepEqual([...CROSSFIT_REASON_CODES].sort(), [...csvCodes].sort());
  const invariantRows = fs.readFileSync(new URL("../../docs/crossfit/data/generator_invariants.csv", import.meta.url), "utf8").trim().split(/\r?\n/).slice(1);
  const invariantCodes = invariantRows.map((row) => row.split(",")[5]);
  for (const code of invariantCodes) assert.equal(isCrossfitReasonCode(code), true, code);
  assert.equal(isCrossfitReasonCode("NUTR_CF_MACRO_CONSTRAINT"), true);
});

test("CrossFit v2: plan, sesión y WOD válidos pasan contratos estrictos", () => {
  assert.equal(validateCrossfitWod(standaloneWod()).valid, true);
  assert.equal(validateCrossfitSession(standaloneSession()).valid, true);
  assert.equal(validateCrossfitPlan(validPlan()).valid, true);
});

test("CrossFit v2: escritores rechazan unknown, versión antigua y reason code desconocido", () => {
  const unknown = { ...validPlan(), unexpected: true };
  assert.equal(validateCrossfitPlan(unknown).valid, false);
  const old = { ...validPlan(), schema_version: "crossfit-plan/v1" };
  assert.equal(validateCrossfitPlan(old).valid, false);
  const badReason = validPlan();
  badReason.decision_trace = trace("NOT_A_REASON");
  assert.equal(validateCrossfitPlan(badReason).valid, false);
});

test("CrossFit v2: resultado, autorregulación y nutrición validan sus versiones", () => {
  const result = {
    schema_version: CROSSFIT_VERSIONS.result,
    ruleset_version: CROSSFIT_VERSIONS.ruleset,
    catalog_version: CROSSFIT_VERSIONS.catalog,
    request_id: "req-result",
    result_id: "result-1",
    session_id: "session-1",
    plan_id: "plan-1",
    day_id: "day-1",
    user_id: 10,
    status: "completed",
    completion: 1,
    score: { type: "rounds_reps", rounds: 7, reps: 5 },
    scales: [{ movement_id: "air-squat", scale_id: "scaled" }],
    rpe: 7.5,
    technique: 3,
    pain: { score: 0, locations: [], quality: null, delta: 0, red_flag: false, acute_injury: false },
    readiness: { sleep: 4, fatigue: 2, recovery: 4, stress: 2 },
    actual_training_load: plannedLoad("completed"),
    recorded_at: "2026-08-03T10:00:00.000Z",
    idempotency_key: "result-key",
    reason_codes: ["AUTOREG_HOLD"],
    decision_trace: trace(),
    provenance: { source: "wod_player", confidence: "high" }
  };
  assert.equal(validateCrossfitResult(result).valid, true);
  assert.equal(validateCrossfitResult({ ...result, readiness: { ...result.readiness, unknown: 1 } }).valid, false);
  assert.equal(validateCrossfitResult({ ...result, score: { type: "time" } }).valid, false);

  const autoreg = {
    schema_version: CROSSFIT_VERSIONS.autoreg,
    ruleset_version: CROSSFIT_VERSIONS.ruleset,
    catalog_version: CROSSFIT_VERSIONS.catalog,
    request_id: "req-autoreg",
    snapshot_id: "snapshot-1",
    user_id: 10,
    plan_id: "plan-1",
    source_event_id: "event-1",
    previous_state: "baseline",
    state: "hold",
    window: { days: 21, comparable_exposures: 1 },
    features: { pain: 0, rpe: 7.5 },
    actions: { capacity: "hold", skill: "hold", scale: "hold" },
    reason_codes: ["AUTOREG_HOLD"],
    processed_at: "2026-08-03T10:01:00.000Z",
    idempotency_key: "event-1",
    decision_trace: trace()
  };
  assert.equal(validateCrossfitAutoreg(autoreg).valid, true);
  assert.deepEqual(CROSSFIT_CONTRACT_ENUMS.autoregStates, [
    "baseline", "hold", "progress_capacity", "progress_skill", "regress", "deload", "blocked"
  ]);

  const nutrition = {
    schema_version: CROSSFIT_VERSIONS.nutrition,
    ruleset_version: CROSSFIT_VERSIONS.ruleset,
    catalog_version: CROSSFIT_VERSIONS.catalog,
    request_id: "req-nutrition",
    user_id: 10,
    plan_id: "plan-1",
    day_id: "day-1",
    level: "beginner",
    goal: "performance",
    day_type: "D1",
    training_load: plannedLoad(),
    targets: { kcal: 2500, protein_g: 140, carbs_g: 330, fat_g: 69 },
    timing: { pre: "0.5-1gkg_carb", intra: "water_if_lt60m", post: "daily_targets" },
    hydration: { mode: "base", personalized: false },
    mode: "shadow",
    reason_codes: ["NUTR_CF_D1"],
    decision_trace: trace("NUTR_CF_D1")
  };
  assert.equal(validateCrossfitNutrition(nutrition).valid, true);
});

test("CrossFit v2: lector legacy adapta en baja confianza sin inventar resultado", () => {
  const legacy = {
    version: "crossfit_v1",
    nivel: "principiante",
    fecha_inicio: "2026-08-03T00:00:00.000Z",
    semanas: [{
      numero_semana: 1,
      sesiones: [{ id: 7, fecha: "2026-08-03", status: "planned", wod: { legacy: true } }]
    }]
  };
  const read = readCrossfitPlan(legacy, { userId: 10, planId: "plan-legacy" });
  assert.equal(read.valid, true);
  assert.equal(read.adapted, true);
  assert.equal(read.value.provenance.confidence, "low");
  assert.equal(read.value.classification_id, null);
  assert.equal(Object.hasOwn(read.value.weeks[0].sessions[0], "result"), false);
});

test("CrossFit v2: adaptador training-load no emite con flag off y valida con flag on", () => {
  const input = {
    level: "beginner",
    sessionType: "mixed",
    dayType: "D1",
    loadTier: "moderate",
    durationMin: 55,
    rpeTarget: 7,
    demand: { glycolytic: 0.5, aerobic: 0.4 },
    ruleIds: ["CF-SES-006"]
  };
  assert.equal(buildCrossfitPlannedTrainingLoad(input).valid, true);
  assert.deepEqual(resolveCrossfitPlannedTrainingLoad(input, {}).load, null);
  const enabled = resolveCrossfitPlannedTrainingLoad(input, { CROSSFIT_EMITS_TRAINING_LOAD: "true" });
  assert.equal(enabled.emitted, true);
  assert.equal(enabled.load.methodology_id, "crossfit");
  assert.equal(buildCrossfitPlannedTrainingLoad({ ...input, dayType: "D2", loadTier: "low" }).valid, false);
});

test("CrossFit v2: carga actual usa RPE, duración y estado completed sin RIR", () => {
  const result = buildCrossfitActualTrainingLoad({
    plannedLoad: plannedLoad(),
    level: "beginner",
    durationSeconds: 3180,
    rpe: 8,
    exerciseRows: [{ series_completed: 4 }, { series_completed: 3 }]
  });
  assert.equal(result.valid, true);
  assert.equal(result.load.status, "completed");
  assert.equal(result.load.duration.actual_min, 53);
  assert.equal(result.load.effort.rpe_actual, 8);
  assert.equal(Object.hasOwn(result.load.effort, "rir_actual"), false);
});
