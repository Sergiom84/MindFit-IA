import crypto from "node:crypto";

import { normalizeCrossfitLevel } from "../versions.js";
import { getCrossfitD2Max, getCrossfitProgramRules } from "./programRules.js";

const LOAD_PATTERNS = Object.freeze({
  beginner: Object.freeze({ 2: ["D1", "D1"], 3: ["D1", "D1", "D2"] }),
  intermediate: Object.freeze({ 3: ["D2", "D1", "D2"], 4: ["D2", "D1", "D2", "D1"] }),
  advanced: Object.freeze({ 4: ["D2", "D1", "D2", "D1"], 5: ["D2", "D1", "D2", "D1", "D2"] })
});

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(value) {
  const date = new Date(`${value}T12:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || !Number.isFinite(date.getTime())) {
    throw new TypeError("start_date debe usar YYYY-MM-DD");
  }
  return date;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

function stableId(prefix, payload) {
  return `${prefix}_${crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24)}`;
}

function sessionFocus(index, frequency) {
  const focus = [
    ["squat", "gymnastics", "short"],
    ["upper_push_pull", "monostructural", "long"],
    ["hinge", "weightlifting", "medium"],
    ["carry_lunge", "gymnastics", "interval"],
    ["mixed", "weightlifting", "variable"]
  ];
  return focus[index % Math.min(frequency, focus.length)];
}

function effectiveQuotas(rules, frequency) {
  const factor = frequency / rules.recommended_frequency;
  const scaledRange = (range) => [
    Math.max(1, Math.floor(range[0] * factor)),
    Math.max(1, Math.ceil(range[1] * factor))
  ];
  return {
    strength: scaledRange(rules.quotas.strength),
    weightlifting: scaledRange(rules.quotas.weightlifting),
    gymnastics: scaledRange(rules.quotas.gymnastics),
    monostructural: scaledRange(rules.quotas.monostructural),
    metcon: scaledRange(rules.quotas.metcon),
    high_impact_max: Math.min(frequency, rules.quotas.high_impact_max),
    heavy_hinge_max: Math.min(frequency, rules.quotas.heavy_hinge_max),
    dense_overhead_max: Math.min(frequency, rules.quotas.dense_overhead_max),
    high_grip_max: Math.min(frequency, rules.quotas.high_grip_max),
    high_skill_max: rules.quotas.high_skill_max,
    quota_window_days: frequency === rules.recommended_frequency ? 7 : 14
  };
}

function resolveQuotas(level, rules, frequency) {
  return { ...effectiveQuotas(rules, frequency), d2_max: getCrossfitD2Max(level, frequency) };
}

export function buildCrossfitProgramBlock({
  level: rawLevel,
  frequency,
  start_date: startDate,
  available_minutes: availableMinutes,
  return_protocol: returnProtocol = null,
  seed = "crossfit-v2"
} = {}) {
  const level = normalizeCrossfitLevel(rawLevel);
  const rules = getCrossfitProgramRules(level);
  if (!rules) {
    return {
      ok: false,
      reason_codes: ["LEVEL_CONFIDENCE_LOW"],
      errors: [{ field: "level", message: "Nivel CrossFit no soportado" }]
    };
  }
  if (!Number.isInteger(frequency) || !rules.frequencies.includes(frequency)) {
    return {
      ok: false,
      reason_codes: ["FREQUENCY_UNSUPPORTED"],
      supported_frequencies: [...rules.frequencies],
      errors: [{ field: "frequency", message: "Frecuencia no soportada para el nivel" }]
    };
  }
  const start = parseDate(startDate);
  const requestedMinutes = Number(availableMinutes ?? rules.session_minutes.max);
  if (!Number.isFinite(requestedMinutes) || requestedMinutes < rules.session_minutes.min) {
    return {
      ok: false,
      reason_codes: ["SESSION_TIME_EXCEEDED"],
      errors: [{ field: "available_minutes", message: `Se requieren al menos ${rules.session_minutes.min} minutos` }]
    };
  }
  const sessionMinutes = Math.min(requestedMinutes, rules.session_minutes.max);
  const dayOffsets = rules.default_day_offsets[frequency];
  const loadPattern = LOAD_PATTERNS[level][frequency];
  const quotas = resolveQuotas(level, rules, frequency);
  const blockKey = { level, frequency, startDate, seed, ruleset: rules.ruleset_version };
  const blockId = stableId("cfb", blockKey);
  const weeks = rules.week_profiles.map(([phase, baseVolume, rpeMin, rpeMax, newSkillsMax], weekIndex) => {
    const returnActive = returnProtocol && weekIndex < Number(returnProtocol.duration_weeks ?? 0);
    const volumeMultiplier = returnActive
      ? Number((baseVolume * (1 - Number(returnProtocol.volume_reduction ?? 0))).toFixed(3))
      : baseVolume;
    const isDeload = phase === "deload" || phase === "reassessment";
    const sessions = dayOffsets.map((offset, sessionIndex) => {
      const [primaryPattern, secondaryDomain, timeDomain] = sessionFocus(sessionIndex + weekIndex, frequency);
      let trainingLoad = isDeload ? "D1" : loadPattern[sessionIndex];
      if (returnActive && trainingLoad === "D2") trainingLoad = "D1";
      const scheduledDate = isoDate(addDays(start, weekIndex * 7 + offset));
      return {
        session_id: stableId("cfs", [blockId, weekIndex + 1, sessionIndex + 1]),
        week_number: weekIndex + 1,
        day_index: sessionIndex + 1,
        scheduled_date: scheduledDate,
        training_load_class: trainingLoad,
        primary_pattern: primaryPattern,
        secondary_domain: secondaryDomain,
        time_domain: timeDomain,
        duration_minutes: sessionMinutes,
        target_rpe: [rpeMin, isDeload ? Math.min(rpeMax, 7) : rpeMax],
        progress_variable: isDeload || returnActive ? "none" : ["load", "reps", "duration", "rest"][weekIndex % 4],
        new_skill_allowed: !isDeload && !returnActive && newSkillsMax > 0,
        stop_rules_required: true
      };
    });
    return {
      week_number: weekIndex + 1,
      phase,
      volume_multiplier: volumeMultiplier,
      target_rpe: [rpeMin, isDeload ? Math.min(rpeMax, 7) : rpeMax],
      new_skills_max: isDeload || returnActive ? 0 : newSkillsMax,
      is_deload: isDeload,
      is_reassessment: phase === "reassessment",
      quotas,
      sessions
    };
  });

  return {
    ok: true,
    schema_version: "crossfit-program-block/v2",
    ruleset_version: rules.ruleset_version,
    block_id: blockId,
    level,
    frequency,
    start_date: startDate,
    block_weeks: rules.block_weeks,
    session_minutes: sessionMinutes,
    quotas,
    progression_policy: "one_variable_per_session",
    doubles_allowed: false,
    elite_in_scope: false,
    return_protocol_applied: returnProtocol ?? null,
    reason_codes: returnProtocol ? ["RETURN_PROTOCOL_REQUIRED"] : [],
    weeks
  };
}
