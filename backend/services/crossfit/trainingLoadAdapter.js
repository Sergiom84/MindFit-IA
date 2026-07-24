import { buildActualSessionLoad } from "../trainingLoad/actualLoadBuilder.js";
import { TRAINING_LOAD_CONTRACT_VERSION, validateTrainingLoad } from "../trainingLoad/trainingLoadContract.js";
import { getCrossfitFeatureFlags } from "./featureFlags.js";
import { normalizeCrossfitLevel } from "./versions.js";

const LEVEL_TO_SHARED = Object.freeze({
  beginner: "principiante",
  intermediate: "intermedio",
  advanced: "avanzado"
});

function nullableNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildCrossfitPlannedTrainingLoad({
  level,
  sessionType,
  dayType,
  loadTier,
  durationMin = null,
  rpeTarget = null,
  work = {},
  demand = {},
  recovery = {},
  environment = {},
  context = {},
  ruleIds = []
} = {}) {
  const normalizedLevel = normalizeCrossfitLevel(level);
  const load = {
    contract_version: TRAINING_LOAD_CONTRACT_VERSION,
    methodology_id: "crossfit",
    methodology_level: LEVEL_TO_SHARED[normalizedLevel] ?? null,
    session_type: sessionType,
    status: "planned",
    day_type: dayType,
    load_tier: loadTier,
    duration: { planned_min: nullableNumber(durationMin), actual_min: null },
    effort: { rpe_target: nullableNumber(rpeTarget), rpe_actual: null },
    work: {
      sets_total: nullableNumber(work.sets_total),
      hard_sets: nullableNumber(work.hard_sets),
      reps_total: nullableNumber(work.reps_total),
      volume_kg: nullableNumber(work.volume_kg),
      work_interval_min: nullableNumber(work.work_interval_min),
      distance_m: nullableNumber(work.distance_m)
    },
    demand: {
      glycolytic: nullableNumber(demand.glycolytic),
      neuromuscular: nullableNumber(demand.neuromuscular),
      aerobic: nullableNumber(demand.aerobic),
      skill: nullableNumber(demand.skill)
    },
    recovery: {
      hours_to_next_session: nullableNumber(recovery.hours_to_next_session),
      hours_to_next_hard_session: nullableNumber(recovery.hours_to_next_hard_session),
      double_session_day: recovery.double_session_day === true
    },
    environment: {
      heat: environment.heat === true,
      humidity_high: environment.humidity_high === true,
      protective_gear: environment.protective_gear === true,
      altitude: environment.altitude === true
    },
    context: {
      deload: context.deload === true,
      taper: context.taper === true,
      test: context.test === true,
      competition: false,
      injury_modified: context.injury_modified === true
    },
    provenance: {
      source: "crossfit_v2_adapter",
      confidence: "high",
      rule_ids: Array.isArray(ruleIds) ? [...ruleIds] : []
    }
  };
  const validation = validateTrainingLoad(load, { mode: "strict" });
  return validation.valid
    ? { valid: true, load, errors: [], reason_codes: [] }
    : { valid: false, load: null, errors: validation.errors, reason_codes: ["TRAINING_LOAD_INVALID"] };
}

export function resolveCrossfitPlannedTrainingLoad(input, env = process.env) {
  if (!getCrossfitFeatureFlags(env).emitsTrainingLoad) {
    return { emitted: false, load: null, errors: [], reason_codes: [] };
  }
  const built = buildCrossfitPlannedTrainingLoad(input);
  return { emitted: built.valid, ...built };
}

export function buildCrossfitActualTrainingLoad(input = {}) {
  let load = buildActualSessionLoad({
    plannedLoad: input.plannedLoad,
    methodologyId: "crossfit",
    methodologyLevel: LEVEL_TO_SHARED[normalizeCrossfitLevel(input.level)] ?? null,
    durationSeconds: input.durationSeconds,
    exerciseRows: input.exerciseRows
  });
  if (typeof input.rpe === "number" && Number.isFinite(input.rpe)) {
    load.effort.rpe_actual = input.rpe;
  }
  if (input.status === "cancelled" && input.completion === 0) {
    load = {
      ...load,
      day_type: "D0",
      load_tier: "rest",
      duration: { ...load.duration, actual_min: 0 },
      effort: { ...load.effort, rpe_actual: null },
      work: {
        sets_total: 0,
        hard_sets: 0,
        reps_total: 0,
        volume_kg: 0,
        work_interval_min: 0,
        distance_m: 0
      },
      demand: { glycolytic: 0, neuromuscular: 0, aerobic: 0, skill: 0 },
      provenance: {
        source: "crossfit_cancelled_session",
        confidence: "high",
        rule_ids: [...new Set([...(load.provenance?.rule_ids ?? []), "CF-RESULT-CANCELLED-D0"])]
      }
    };
  }
  const validation = validateTrainingLoad(load, { mode: "strict" });
  return validation.valid
    ? { valid: true, load, errors: [], reason_codes: [] }
    : { valid: false, load: null, errors: validation.errors, reason_codes: ["TRAINING_LOAD_INVALID"] };
}
