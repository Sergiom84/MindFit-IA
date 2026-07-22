import { assertCrossfitContract, validateCrossfitResult } from "../contracts/schemas.js";
import { stableCrossfitId } from "../generator/deterministic.js";
import { buildCrossfitActualTrainingLoad } from "../trainingLoadAdapter.js";
import { CROSSFIT_VERSIONS } from "../versions.js";

function resultReasonCode({ pain, technique }) {
  if (pain?.red_flag === true || pain?.acute_injury === true) return "SAFETY_RED_FLAG";
  if (Number(pain?.score) >= 5) return "SAFETY_PAIN_BLOCK";
  if (technique === 0) return "SAFETY_TECHNIQUE_STOP";
  if (Number(pain?.score) >= 3 || Number(pain?.delta) >= 2) return "SAFETY_PAIN_MODIFY";
  return "AUTOREG_HOLD";
}

export function buildCrossfitResultV2({
  request_id: requestId,
  session_id: sessionId,
  plan_id: planId,
  day_id: dayId,
  user_id: userId,
  status,
  completion,
  score = { type: "none" },
  scales = [],
  rpe = null,
  technique,
  pain = {},
  readiness = {},
  recorded_at: recordedAt,
  idempotency_key: idempotencyKey,
  planned_training_load: plannedTrainingLoad,
  duration_seconds: durationSeconds,
  exercise_rows: exerciseRows = [],
  level,
  provenance = {}
} = {}) {
  const actual = buildCrossfitActualTrainingLoad({
    plannedLoad: plannedTrainingLoad,
    level,
    durationSeconds,
    exerciseRows,
    rpe
  });
  if (!actual.valid) {
    const error = new Error(`Carga real CrossFit inválida: ${actual.errors.join("; ")}`);
    error.code = "CROSSFIT_TRAINING_LOAD_INVALID";
    throw error;
  }
  const resultId = stableCrossfitId("cfr", [sessionId, idempotencyKey]);
  const reasonCode = resultReasonCode({ pain, technique });
  const result = {
    schema_version: CROSSFIT_VERSIONS.result,
    ruleset_version: CROSSFIT_VERSIONS.ruleset,
    catalog_version: CROSSFIT_VERSIONS.catalog,
    request_id: requestId,
    result_id: resultId,
    session_id: sessionId,
    plan_id: planId,
    day_id: dayId,
    user_id: userId,
    status,
    completion,
    score,
    scales,
    rpe,
    technique,
    pain,
    readiness,
    actual_training_load: actual.load,
    recorded_at: new Date(recordedAt).toISOString(),
    idempotency_key: idempotencyKey,
    reason_codes: [reasonCode],
    decision_trace: [{
      rule_id: "CF-RESULT-BUILD",
      reason_code: reasonCode,
      scope: "result",
      action: "actual_load_and_result_validated",
      details: { source: "crossfit_v2_effort" }
    }],
    provenance: {
      source: "crossfit_v2_result_builder",
      ...provenance
    }
  };
  return assertCrossfitContract(validateCrossfitResult, result);
}
