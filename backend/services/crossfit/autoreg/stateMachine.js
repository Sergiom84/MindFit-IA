import { CROSSFIT_VERSIONS } from "../versions.js";
import { stableCrossfitId } from "../generator/deterministic.js";

const DAY_MS = 86400000;

function timestamp(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function painScore(event) {
  return Number(event?.pain?.score ?? 0);
}

function readinessAverage(event) {
  const values = [event?.readiness?.sleep, event?.readiness?.recovery]
    .filter((value) => value !== null && value !== undefined)
    .map(Number).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function positiveCapacity(event) {
  const readiness = readinessAverage(event);
  return event.status === "completed"
    && event.completion >= 0.9
    && event.rpe >= 6 && event.rpe <= 8
    && event.technique >= 2
    && painScore(event) <= 1
    && (readiness === null || readiness >= 3)
    && event.provenance?.adherence_rate >= 0.8;
}

function positiveSkill(event) {
  return positiveCapacity(event)
    && event.technique === 3
    && event.provenance?.skill_candidate === true
    && event.provenance?.skill_prerequisites_met === true
    && event.provenance?.dangerous_misses !== true;
}

function hasSharpRisingPain(event) {
  const quality = String(event?.pain?.quality ?? "").toLowerCase();
  return event?.pain?.red_flag === true
    || event?.pain?.acute_injury === true
    || /sharp|punzante|rising|creciente/.test(quality);
}

function fatigueSignals(events) {
  const recentThree = events.slice(-3);
  const signals = [];
  if (recentThree.filter((event) => event.rpe >= 9 && event.provenance?.is_test !== true).length >= 2) {
    signals.push("high_rpe");
  }
  if (recentThree.filter((event) => Number(event.provenance?.performance_delta) <= -0.1).length >= 2) {
    signals.push("performance_drop");
  }
  if (recentThree.length >= 3 && recentThree.every((event) => Number(event.readiness?.fatigue) >= 4)) {
    signals.push("fatigue_three_days");
  }
  if (recentThree.length >= 3 && recentThree.every((event) =>
    event.readiness?.sleep !== null
    && event.readiness?.sleep !== undefined
    && Number(event.readiness.sleep) <= 2)) {
    signals.push("sleep_three_days");
  }
  if (events.some((event) => Number(event.provenance?.srpe_ratio_7_28) > 1.2)) signals.push("srpe_above_baseline");
  if (recentThree.filter((event) => event.provenance?.readiness_cut === true).length >= 2) {
    signals.push("readiness_cuts");
  }
  if (recentThree.length >= 3 && recentThree.every((event) => painScore(event) === 2)) {
    signals.push("persistent_discomfort");
  }
  return signals;
}

function hasRecoveryExitEvidence(events) {
  const candidates = events.slice(-4).filter((event) =>
    readinessAverage(event) >= 3 && painScore(event) <= 1 && event.technique >= 2);
  if (candidates.length < 2) return false;
  return timestamp(candidates.at(-1).recorded_at) - timestamp(candidates.at(-2).recorded_at) >= DAY_MS;
}

function actionForState(state, latest, details = {}) {
  if (state === "progress_capacity") {
    const domain = latest?.provenance?.domain ?? "mixed";
    const variable = domain === "monostructural" ? "work" : domain === "weightlifting" ? "load" : "reps";
    return { capacity: { variable, increment: variable === "load" ? 0.025 : 0.05 }, skill: null, scale: "hold" };
  }
  if (state === "progress_skill") {
    return { capacity: null, skill: { action: "advance_one_rung", skill_id: latest?.provenance?.skill_id ?? null }, scale: "hold" };
  }
  if (state === "regress") {
    return { capacity: { volume_multiplier: details.return_protocol ? 0.65 : 0.8 }, skill: { action: "regress_one_rung" }, scale: "lower_if_needed" };
  }
  if (state === "deload") {
    return { capacity: { volume_multiplier: 0.65, duration_days: 7 }, skill: { action: "no_new_skill" }, scale: "hold" };
  }
  if (state === "blocked") return { capacity: null, skill: null, scale: "blocked", referral_required: true };
  return { capacity: null, skill: null, scale: "hold" };
}

export function reduceCrossfitAutoreg({
  previous_snapshot: previousSnapshot = null,
  events = [],
  user_id: userId,
  plan_id: planId,
  source_event_id: sourceEventId,
  request_id: requestId,
  processed_at: processedAt,
  pause_days: pauseDays = 0,
  clearance_resolved: clearanceResolved = false
} = {}) {
  const processedAtMs = timestamp(processedAt);
  if (!processedAtMs) throw new TypeError("processed_at ISO es requerido");
  const ordered = [...new Map(events.map((event) => [event.result_id, event])).values()]
    .sort((left, right) => timestamp(left.recorded_at) - timestamp(right.recorded_at));
  const windowStart = processedAtMs - 42 * DAY_MS;
  const window = ordered.filter((event) => timestamp(event.recorded_at) >= windowStart && timestamp(event.recorded_at) <= processedAtMs);
  const latest = window.at(-1) ?? null;
  const previousState = previousSnapshot?.state ?? "baseline";
  const previousProcessedAt = timestamp(previousSnapshot?.processed_at);
  const trace = [];
  const reasonCodes = [];
  const decide = (ruleId, reasonCode, state, details = {}) => {
    trace.push({ rule_id: ruleId, reason_code: reasonCode, scope: "autoreg", action: state, details });
    reasonCodes.push(reasonCode);
    return state;
  };

  let state;
  let stateDetails = {};
  if (previousState === "blocked" && !clearanceResolved) {
    state = decide("CF-AUTOREG-BLOCK-HYST", "SAFETY_CLEARANCE_REQUIRED", "blocked", { requires_explicit_resolution: true });
  } else if (latest && (painScore(latest) >= 5 || hasSharpRisingPain(latest))) {
    state = decide("CF-AUTOREG-SAFETY", painScore(latest) >= 5 ? "SAFETY_PAIN_BLOCK" : "SAFETY_RED_FLAG", "blocked");
  } else if (latest && (painScore(latest) >= 3 || Number(latest.pain?.delta) >= 2 || latest.technique === 0)) {
    const reason = latest.technique === 0 ? "SAFETY_TECHNIQUE_STOP" : "SAFETY_PAIN_MODIFY";
    state = decide("CF-AUTOREG-REGRESS-SAFETY", reason, "regress");
  } else if (latest?.status === "cancelled") {
    state = decide("CF-AUTOREG-CANCELLED", "SESSION_CANCELLED", "hold", { no_training_exposure: true });
  } else if (pauseDays >= 14) {
    stateDetails = { return_protocol: true, pause_days: pauseDays };
    state = decide("CF-AUTOREG-RETURN", "AUTOREG_RETURN", "regress", stateDetails);
  } else {
    const fatigue = fatigueSignals(window);
    const readiness = latest ? readinessAverage(latest) : null;
    const inDeloadMinimum = previousState === "deload" && processedAtMs - previousProcessedAt < 5 * DAY_MS;
    if (inDeloadMinimum) {
      state = decide("CF-AUTOREG-DELOAD-HYST", "AUTOREG_DELOAD", "deload", { minimum_days: 5 });
    } else if (fatigue.length >= 2) {
      state = decide("CF-AUTOREG-DELOAD", "AUTOREG_DELOAD", "deload", { independent_signals: fatigue });
    } else if (previousState === "deload" && !hasRecoveryExitEvidence(window)) {
      state = decide("CF-AUTOREG-DELOAD-EXIT", "AUTOREG_HOLD", "hold", { recovery_evidence_required: true });
    } else if (readiness !== null && readiness < 3) {
      state = decide("CF-AUTOREG-READINESS", "AUTOREG_RECOVERY", "regress", { readiness_average: readiness });
    } else if (previousState === "regress" && !hasRecoveryExitEvidence(window)) {
      state = decide("CF-AUTOREG-REGRESS-HYST", "AUTOREG_HOLD", "regress", { two_checkins_required: true });
    } else if (latest?.provenance?.equipment_signature_changed === true) {
      state = decide("CF-AUTOREG-EQUIPMENT", "AUTOREG_EQUIPMENT_CHANGE", "hold");
    } else {
      const last21Days = window.filter((event) => timestamp(event.recorded_at) >= processedAtMs - 21 * DAY_MS);
      const capacityEvidence = last21Days.filter(positiveCapacity);
      const skillEvidence = last21Days.filter(positiveSkill);
      if (skillEvidence.length >= 3 && latest?.provenance?.capacity_progressed_microcycle !== true) {
        state = decide("CF-AUTOREG-SKILL", "SKILL_PROGRESS", "progress_skill", { evidence_count: skillEvidence.length });
      } else if (capacityEvidence.length >= 3 && latest?.provenance?.skill_progressed_microcycle !== true) {
        state = decide("CF-AUTOREG-CAPACITY", "AUTOREG_BUILD", "progress_capacity", { evidence_count: capacityEvidence.length });
      } else if (fatigue.length === 1 || window.length < 3) {
        state = decide("CF-AUTOREG-HOLD", "AUTOREG_HOLD", "hold", { signal_count: fatigue.length, event_count: window.length });
      } else {
        state = decide("CF-AUTOREG-BASELINE", "AUTOREG_HOLD", "baseline");
      }
    }
  }

  const features = {
    event_count_42d: window.length,
    positive_capacity_21d: window.filter((event) =>
      timestamp(event.recorded_at) >= processedAtMs - 21 * DAY_MS && positiveCapacity(event)).length,
    positive_skill_21d: window.filter((event) =>
      timestamp(event.recorded_at) >= processedAtMs - 21 * DAY_MS && positiveSkill(event)).length,
    fatigue_signals: fatigueSignals(window),
    latest_result_id: latest?.result_id ?? null,
    latest_readiness_average: latest ? readinessAverage(latest) : null
  };
  return {
    schema_version: CROSSFIT_VERSIONS.autoreg,
    ruleset_version: CROSSFIT_VERSIONS.ruleset,
    catalog_version: CROSSFIT_VERSIONS.catalog,
    request_id: requestId,
    snapshot_id: stableCrossfitId("cfa", [userId, planId, latest?.result_id ?? null, state, features]),
    user_id: userId,
    plan_id: planId,
    source_event_id: sourceEventId,
    previous_state: previousState,
    state,
    window: { days: 42, from: new Date(windowStart).toISOString(), to: new Date(processedAtMs).toISOString() },
    features,
    actions: actionForState(state, latest, stateDetails),
    reason_codes: [...new Set(reasonCodes)],
    processed_at: new Date(processedAtMs).toISOString(),
    idempotency_key: `crossfit-autoreg-v2:${sourceEventId}`,
    decision_trace: trace
  };
}
