import { validateTrainingLoad } from "../../trainingLoad/trainingLoadContract.js";
import { CROSSFIT_LEVELS, CROSSFIT_VERSIONS } from "../versions.js";
import {
  contractResult,
  isPlainObject,
  rejectUnknownKeys,
  requireArray,
  requireEnum,
  requireFiniteNumber,
  requireId,
  requireInteger,
  requireIsoDate,
  requireIsoTimestamp,
  requireKeys,
  requireString,
  validateDecisionTrace,
  validateReasonCodes
} from "./validation.js";

const SESSION_TYPES = ["mixed", "strength", "skill", "mono", "recovery", "test"];
const SESSION_STATUSES = ["planned", "started", "paused", "completed", "partial", "abandoned", "cancelled"];
const WOD_FORMATS = ["amrap", "emom", "e2mom", "e3mom", "for_time", "rft", "chipper", "intervals", "strength_only", "skill_only"];
const TIME_DOMAINS = ["short", "medium", "long", "extended", "not_applicable"];
const SCORE_TYPES = ["rounds_reps", "time", "reps", "calories", "load", "distance", "quality", "none"];
const RESULT_STATUSES = ["completed", "partial", "abandoned", "cancelled", "capped"];
const AUTOREG_STATES = ["baseline", "hold", "progress_capacity", "progress_skill", "regress", "deload", "blocked"];
const NUTRITION_GOALS = ["performance", "recomposition", "fat_loss", "mass_gain"];

export const CROSSFIT_CONTRACT_ENUMS = Object.freeze({
  sessionTypes: Object.freeze(SESSION_TYPES),
  sessionStatuses: Object.freeze(SESSION_STATUSES),
  wodFormats: Object.freeze(WOD_FORMATS),
  timeDomains: Object.freeze(TIME_DOMAINS),
  scoreTypes: Object.freeze(SCORE_TYPES),
  resultStatuses: Object.freeze(RESULT_STATUSES),
  autoregStates: Object.freeze(AUTOREG_STATES),
  nutritionGoals: Object.freeze(NUTRITION_GOALS)
});

function validateVersion(value, expected, path, errors) {
  if (value !== expected) errors.push(`${path} debe ser ${expected}`);
}

function validateEnvelope(value, schemaVersion, path, errors) {
  validateVersion(value.schema_version, schemaVersion, `${path}.schema_version`, errors);
  validateVersion(value.ruleset_version, CROSSFIT_VERSIONS.ruleset, `${path}.ruleset_version`, errors);
  validateVersion(value.catalog_version, CROSSFIT_VERSIONS.catalog, `${path}.catalog_version`, errors);
  requireString(value.request_id, `${path}.request_id`, errors);
}

function validateDose(value, path, errors) {
  const allowed = ["type", "reps", "calories", "distance_m", "duration_seconds", "load", "load_unit", "rounds", "tempo"];
  if (!rejectUnknownKeys(value, allowed, path, errors)) return;
  requireKeys(value, ["type"], path, errors);
  requireEnum(value.type, ["reps", "calories", "distance", "duration", "load", "quality"], `${path}.type`, errors);
  for (const key of ["reps", "calories", "distance_m", "duration_seconds", "load", "rounds"]) {
    if (value[key] !== undefined) requireFiniteNumber(value[key], `${path}.${key}`, errors, { min: 0 });
  }
  if (value.load_unit !== undefined) requireEnum(value.load_unit, ["kg", "percent_1rm", "bodyweight", "none"], `${path}.load_unit`, errors);
  if (value.tempo !== undefined) requireString(value.tempo, `${path}.tempo`, errors);
}

function validateMovement(value, path, errors) {
  const allowed = [
    "canonical_movement_id", "catalog_version", "name", "dose", "skill_tier",
    "equipment", "stimulus_tags", "substitutions", "scale_id"
  ];
  if (!rejectUnknownKeys(value, allowed, path, errors)) return;
  requireKeys(value, ["canonical_movement_id", "catalog_version", "dose", "skill_tier", "equipment", "substitutions"], path, errors);
  requireString(value.canonical_movement_id, `${path}.canonical_movement_id`, errors);
  validateVersion(value.catalog_version, CROSSFIT_VERSIONS.catalog, `${path}.catalog_version`, errors);
  validateDose(value.dose, `${path}.dose`, errors);
  requireInteger(value.skill_tier, `${path}.skill_tier`, errors, { min: 0, max: 5 });
  if (requireArray(value.equipment, `${path}.equipment`, errors)) {
    value.equipment.forEach((item, index) => requireString(item, `${path}.equipment[${index}]`, errors));
  }
  if (value.stimulus_tags !== undefined && requireArray(value.stimulus_tags, `${path}.stimulus_tags`, errors)) {
    value.stimulus_tags.forEach((item, index) => requireString(item, `${path}.stimulus_tags[${index}]`, errors));
  }
  if (requireArray(value.substitutions, `${path}.substitutions`, errors)) {
    value.substitutions.forEach((item, index) => requireString(item, `${path}.substitutions[${index}]`, errors));
  }
  if (value.name !== undefined) requireString(value.name, `${path}.name`, errors);
  if (value.scale_id !== undefined) requireString(value.scale_id, `${path}.scale_id`, errors);
}

function validateWodShape(value, path, errors, { standalone = false } = {}) {
  const envelope = standalone ? ["schema_version", "ruleset_version", "catalog_version", "request_id"] : [];
  const allowed = [
    ...envelope, "wod_id", "format", "time_domain", "target_minutes", "time_cap_seconds",
    "stimulus", "score_type", "movements", "scales", "stop_rules", "decision_trace"
  ];
  if (!rejectUnknownKeys(value, allowed, path, errors)) return;
  const required = ["wod_id", "format", "time_domain", "target_minutes", "time_cap_seconds", "stimulus", "score_type", "movements", "scales", "stop_rules", "decision_trace"];
  if (standalone) required.push(...envelope);
  requireKeys(value, required, path, errors);
  if (standalone) validateEnvelope(value, CROSSFIT_VERSIONS.wod, path, errors);
  requireId(value.wod_id, `${path}.wod_id`, errors);
  requireEnum(value.format, WOD_FORMATS, `${path}.format`, errors);
  requireEnum(value.time_domain, TIME_DOMAINS, `${path}.time_domain`, errors);
  requireFiniteNumber(value.target_minutes, `${path}.target_minutes`, errors, { min: 0, max: 120 });
  requireInteger(value.time_cap_seconds, `${path}.time_cap_seconds`, errors, { min: 0, max: 10800 });
  requireString(value.stimulus, `${path}.stimulus`, errors);
  requireEnum(value.score_type, SCORE_TYPES, `${path}.score_type`, errors);
  if (requireArray(value.movements, `${path}.movements`, errors, { min: 1 })) {
    value.movements.forEach((movement, index) => validateMovement(movement, `${path}.movements[${index}]`, errors));
  }
  if (requireArray(value.scales, `${path}.scales`, errors, { min: 1 })) {
    value.scales.forEach((scale, index) => {
      if (!isPlainObject(scale)) errors.push(`${path}.scales[${index}] debe ser objeto`);
    });
  }
  if (requireArray(value.stop_rules, `${path}.stop_rules`, errors, { min: 1 })) {
    value.stop_rules.forEach((rule, index) => requireString(rule, `${path}.stop_rules[${index}]`, errors));
  }
  validateDecisionTrace(value.decision_trace, `${path}.decision_trace`, errors);
}

function validateSessionShape(value, path, errors, { standalone = false } = {}) {
  const envelope = standalone ? ["schema_version", "ruleset_version", "catalog_version", "request_id"] : [];
  const allowed = [
    ...envelope, "session_id", "plan_id", "day_id", "user_id", "level", "status", "date",
    "session_type", "training_load", "warmup", "blocks", "wod", "cooldown", "decision_trace"
  ];
  if (!rejectUnknownKeys(value, allowed, path, errors)) return;
  const required = ["session_id", "plan_id", "day_id", "user_id", "level", "status", "date", "session_type", "training_load", "warmup", "blocks", "wod", "cooldown", "decision_trace"];
  if (standalone) required.push(...envelope);
  requireKeys(value, required, path, errors);
  if (standalone) validateEnvelope(value, CROSSFIT_VERSIONS.session, path, errors);
  for (const key of ["session_id", "plan_id", "day_id", "user_id"]) requireId(value[key], `${path}.${key}`, errors);
  requireEnum(value.level, CROSSFIT_LEVELS, `${path}.level`, errors);
  requireEnum(value.status, SESSION_STATUSES, `${path}.status`, errors);
  requireIsoDate(value.date, `${path}.date`, errors);
  requireEnum(value.session_type, SESSION_TYPES, `${path}.session_type`, errors);
  const load = validateTrainingLoad(value.training_load, { mode: "strict" });
  if (!load.valid) errors.push(...load.errors.map((error) => `${path}.training_load: ${error}`));
  for (const key of ["warmup", "blocks", "cooldown"]) {
    if (requireArray(value[key], `${path}.${key}`, errors)) {
      value[key].forEach((item, index) => {
        if (!isPlainObject(item)) errors.push(`${path}.${key}[${index}] debe ser objeto`);
      });
    }
  }
  validateWodShape(value.wod, `${path}.wod`, errors);
  validateDecisionTrace(value.decision_trace, `${path}.decision_trace`, errors);
}

export function validateCrossfitWod(value) {
  const errors = [];
  validateWodShape(value, "wod", errors, { standalone: true });
  return contractResult(value, errors);
}

export function validateCrossfitSession(value) {
  const errors = [];
  validateSessionShape(value, "session", errors, { standalone: true });
  return contractResult(value, errors);
}

export function validateCrossfitPlan(value) {
  const errors = [];
  const allowed = [
    "schema_version", "ruleset_version", "catalog_version", "request_id", "plan_id", "user_id",
    "level", "classification_id", "generation", "block", "weeks", "decision_trace"
  ];
  if (!rejectUnknownKeys(value, allowed, "plan", errors)) return contractResult(value, errors);
  requireKeys(value, allowed, "plan", errors);
  validateEnvelope(value, CROSSFIT_VERSIONS.plan, "plan", errors);
  requireId(value.plan_id, "plan.plan_id", errors);
  requireId(value.user_id, "plan.user_id", errors);
  requireEnum(value.level, CROSSFIT_LEVELS, "plan.level", errors);
  requireId(value.classification_id, "plan.classification_id", errors);

  const generationKeys = ["seed_hash", "revision", "idempotency_key", "generated_at", "supersedes"];
  if (rejectUnknownKeys(value.generation, generationKeys, "plan.generation", errors)) {
    requireKeys(value.generation, generationKeys, "plan.generation", errors);
    requireString(value.generation.seed_hash, "plan.generation.seed_hash", errors);
    requireInteger(value.generation.revision, "plan.generation.revision", errors, { min: 0 });
    requireString(value.generation.idempotency_key, "plan.generation.idempotency_key", errors);
    requireIsoTimestamp(value.generation.generated_at, "plan.generation.generated_at", errors);
    requireId(value.generation.supersedes, "plan.generation.supersedes", errors, { nullable: true });
  }

  const blockKeys = ["block_id", "week_count", "phase_by_week", "quotas"];
  if (rejectUnknownKeys(value.block, blockKeys, "plan.block", errors)) {
    requireKeys(value.block, blockKeys, "plan.block", errors);
    requireId(value.block.block_id, "plan.block.block_id", errors);
    requireInteger(value.block.week_count, "plan.block.week_count", errors, { min: 1, max: 12 });
    if (requireArray(value.block.phase_by_week, "plan.block.phase_by_week", errors, { min: 1 })) {
      value.block.phase_by_week.forEach((phase, index) => requireString(phase, `plan.block.phase_by_week[${index}]`, errors));
    }
    if (!isPlainObject(value.block.quotas)) errors.push("plan.block.quotas debe ser objeto");
  }

  if (requireArray(value.weeks, "plan.weeks", errors, { min: 1 })) {
    value.weeks.forEach((week, index) => {
      const path = `plan.weeks[${index}]`;
      const keys = ["week_number", "target_load", "sessions"];
      if (!rejectUnknownKeys(week, keys, path, errors)) return;
      requireKeys(week, keys, path, errors);
      requireInteger(week.week_number, `${path}.week_number`, errors, { min: 1, max: 12 });
      if (!isPlainObject(week.target_load)) errors.push(`${path}.target_load debe ser objeto`);
      if (requireArray(week.sessions, `${path}.sessions`, errors, { min: 1 })) {
        week.sessions.forEach((session, sessionIndex) => validateSessionShape(session, `${path}.sessions[${sessionIndex}]`, errors));
      }
    });
  }
  validateDecisionTrace(value.decision_trace, "plan.decision_trace", errors);
  return contractResult(value, errors);
}

export function validateCrossfitResult(value) {
  const errors = [];
  const allowed = [
    "schema_version", "ruleset_version", "catalog_version", "request_id", "result_id", "session_id",
    "plan_id", "day_id", "user_id", "status", "completion", "score", "scales", "rpe", "technique",
    "pain", "readiness", "actual_training_load", "recorded_at", "idempotency_key", "reason_codes",
    "decision_trace", "provenance"
  ];
  if (!rejectUnknownKeys(value, allowed, "result", errors)) return contractResult(value, errors);
  requireKeys(value, allowed, "result", errors);
  validateEnvelope(value, CROSSFIT_VERSIONS.result, "result", errors);
  for (const key of ["result_id", "session_id", "plan_id", "day_id", "user_id"]) requireId(value[key], `result.${key}`, errors);
  requireEnum(value.status, RESULT_STATUSES, "result.status", errors);
  requireFiniteNumber(value.completion, "result.completion", errors, { min: 0, max: 1 });
  if (rejectUnknownKeys(
    value.score,
    ["type", "elapsed_seconds", "rounds", "reps", "calories", "load", "distance_m", "quality"],
    "result.score",
    errors
  )) {
    requireKeys(value.score, ["type"], "result.score", errors);
    requireEnum(value.score.type, SCORE_TYPES, "result.score.type", errors);
    for (const key of ["elapsed_seconds", "rounds", "reps", "calories", "load", "distance_m"]) {
      if (value.score[key] !== undefined) requireFiniteNumber(value.score[key], `result.score.${key}`, errors, { min: 0 });
    }
    if (value.score.quality !== undefined) requireString(value.score.quality, "result.score.quality", errors);
    const requiredMetric = {
      time: "elapsed_seconds", reps: "reps", calories: "calories",
      load: "load", distance: "distance_m", quality: "quality"
    }[value.score.type];
    if (requiredMetric && value.score[requiredMetric] === undefined) {
      errors.push(`result.score.${requiredMetric} es requerido para ${value.score.type}`);
    }
    if (value.score.type === "rounds_reps" && (value.score.rounds === undefined || value.score.reps === undefined)) {
      errors.push("result.score.rounds y result.score.reps son requeridos para rounds_reps");
    }
  }
  if (requireArray(value.scales, "result.scales", errors)) {
    value.scales.forEach((scale, index) => {
      const path = `result.scales[${index}]`;
      if (!rejectUnknownKeys(scale, ["movement_id", "scale_id"], path, errors)) return;
      requireKeys(scale, ["movement_id", "scale_id"], path, errors);
      requireString(scale.movement_id, `${path}.movement_id`, errors);
      requireString(scale.scale_id, `${path}.scale_id`, errors);
    });
  }
  requireFiniteNumber(value.rpe, "result.rpe", errors, { min: 1, max: 10, nullable: true });
  requireInteger(value.technique, "result.technique", errors, { min: 0, max: 3 });
  if (rejectUnknownKeys(
    value.pain,
    ["score", "locations", "quality", "delta", "red_flag", "acute_injury"],
    "result.pain",
    errors
  )) {
    requireKeys(value.pain, ["score", "locations", "delta", "red_flag", "acute_injury"], "result.pain", errors);
    requireFiniteNumber(value.pain.score, "result.pain.score", errors, { min: 0, max: 10 });
    requireFiniteNumber(value.pain.delta, "result.pain.delta", errors, { min: -10, max: 10 });
    if (requireArray(value.pain.locations, "result.pain.locations", errors)) {
      value.pain.locations.forEach((location, index) => requireString(location, `result.pain.locations[${index}]`, errors));
    }
    if (value.pain.quality !== null && value.pain.quality !== undefined) {
      requireString(value.pain.quality, "result.pain.quality", errors);
    }
    for (const key of ["red_flag", "acute_injury"]) {
      if (typeof value.pain[key] !== "boolean") errors.push(`result.pain.${key} debe ser boolean`);
    }
  }
  if (rejectUnknownKeys(value.readiness, ["sleep", "fatigue", "recovery", "stress"], "result.readiness", errors)) {
    requireKeys(value.readiness, ["sleep", "fatigue", "recovery", "stress"], "result.readiness", errors);
    for (const key of ["sleep", "fatigue", "recovery", "stress"]) {
      requireInteger(value.readiness[key], `result.readiness.${key}`, errors, { min: 1, max: 5 });
    }
  }
  const load = validateTrainingLoad(value.actual_training_load, { mode: "strict" });
  if (!load.valid) errors.push(...load.errors.map((error) => `result.actual_training_load: ${error}`));
  requireIsoTimestamp(value.recorded_at, "result.recorded_at", errors);
  requireString(value.idempotency_key, "result.idempotency_key", errors);
  validateReasonCodes(value.reason_codes, "result.reason_codes", errors);
  validateDecisionTrace(value.decision_trace, "result.decision_trace", errors);
  if (rejectUnknownKeys(value.provenance, [
    "source", "confidence", "adherence_rate", "domain", "performance_delta",
    "skill_candidate", "skill_prerequisites_met", "skill_id", "dangerous_misses",
    "capacity_progressed_microcycle", "skill_progressed_microcycle",
    "equipment_signature_changed", "readiness_cut", "srpe_ratio_7_28", "is_test"
  ], "result.provenance", errors)) {
    requireKeys(value.provenance, ["source"], "result.provenance", errors);
    requireString(value.provenance.source, "result.provenance.source", errors);
  }
  return contractResult(value, errors);
}

export function validateCrossfitAutoreg(value) {
  const errors = [];
  const allowed = [
    "schema_version", "ruleset_version", "catalog_version", "request_id", "snapshot_id", "user_id",
    "plan_id", "source_event_id", "previous_state", "state", "window", "features", "actions",
    "reason_codes", "processed_at", "idempotency_key", "decision_trace"
  ];
  if (!rejectUnknownKeys(value, allowed, "autoreg", errors)) return contractResult(value, errors);
  requireKeys(value, allowed, "autoreg", errors);
  validateEnvelope(value, CROSSFIT_VERSIONS.autoreg, "autoreg", errors);
  for (const key of ["snapshot_id", "user_id", "plan_id", "source_event_id"]) requireId(value[key], `autoreg.${key}`, errors);
  requireEnum(value.previous_state, AUTOREG_STATES, "autoreg.previous_state", errors);
  requireEnum(value.state, AUTOREG_STATES, "autoreg.state", errors);
  for (const key of ["window", "features", "actions"]) {
    if (!isPlainObject(value[key])) errors.push(`autoreg.${key} debe ser objeto`);
  }
  validateReasonCodes(value.reason_codes, "autoreg.reason_codes", errors, { min: 1 });
  requireIsoTimestamp(value.processed_at, "autoreg.processed_at", errors);
  requireString(value.idempotency_key, "autoreg.idempotency_key", errors);
  validateDecisionTrace(value.decision_trace, "autoreg.decision_trace", errors);
  return contractResult(value, errors);
}

export function validateCrossfitNutrition(value) {
  const errors = [];
  const allowed = [
    "schema_version", "ruleset_version", "catalog_version", "request_id", "user_id", "plan_id", "day_id",
    "level", "goal", "day_type", "training_load", "targets", "timing", "hydration", "mode",
    "reason_codes", "decision_trace"
  ];
  if (!rejectUnknownKeys(value, allowed, "nutrition", errors)) return contractResult(value, errors);
  requireKeys(value, allowed, "nutrition", errors);
  validateEnvelope(value, CROSSFIT_VERSIONS.nutrition, "nutrition", errors);
  for (const key of ["user_id", "plan_id", "day_id"]) requireId(value[key], `nutrition.${key}`, errors);
  requireEnum(value.level, CROSSFIT_LEVELS, "nutrition.level", errors);
  requireEnum(value.goal, NUTRITION_GOALS, "nutrition.goal", errors);
  requireEnum(value.day_type, ["D0", "D1", "D2"], "nutrition.day_type", errors);
  const load = validateTrainingLoad(value.training_load, { mode: "strict" });
  if (!load.valid) errors.push(...load.errors.map((error) => `nutrition.training_load: ${error}`));
  for (const key of ["targets", "timing", "hydration"]) {
    if (!isPlainObject(value[key])) errors.push(`nutrition.${key} debe ser objeto`);
  }
  requireEnum(value.mode, ["shadow", "active"], "nutrition.mode", errors);
  validateReasonCodes(value.reason_codes, "nutrition.reason_codes", errors, { min: 1 });
  validateDecisionTrace(value.decision_trace, "nutrition.decision_trace", errors);
  return contractResult(value, errors);
}

export function assertCrossfitContract(validator, value) {
  const result = validator(value);
  if (!result.valid) {
    const error = new Error(`Contrato CrossFit inválido: ${result.errors.join("; ")}`);
    error.code = "CROSSFIT_CONTRACT_INVALID";
    error.validation_errors = result.errors;
    throw error;
  }
  return result.value;
}
