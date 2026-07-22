import crypto from "node:crypto";

import { CROSSFIT_VERSIONS, normalizeCrossfitLevel } from "../versions.js";

export const CROSSFIT_CLASSIFICATION_DIMENSIONS = Object.freeze([
  "technique",
  "strength",
  "aerobic",
  "gymnastics",
  "weightlifting",
  "pacing",
  "volume",
  "recovery"
]);

const CRITICAL_DIMENSIONS = Object.freeze(["technique", "strength", "gymnastics", "weightlifting"]);
const LEVEL_SCORE = Object.freeze({ beginner: 1, intermediate: 2, advanced: 3 });

function score(value) {
  return Number.isInteger(value) && value >= 0 && value <= 3 ? value : 0;
}

function evidenceAgeDays(observedAt, now) {
  const date = observedAt ? new Date(observedAt) : null;
  if (!date || !Number.isFinite(date.getTime())) return Infinity;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86400000));
}

export function resolveCrossfitClassificationConfidence({
  dimensionScores = {},
  evidence = {},
  now = new Date()
} = {}) {
  const complete = CROSSFIT_CLASSIFICATION_DIMENSIONS.every((dimension) => score(dimensionScores[dimension]) > 0);
  const ages = CROSSFIT_CLASSIFICATION_DIMENSIONS.map((dimension) =>
    evidenceAgeDays(evidence?.dimensions?.[dimension]?.observed_at, now));
  const comparableSessions = Number(evidence.comparable_sessions ?? 0);
  const techniqueVerified = evidence.technique_verified === true;
  if (!complete || ages.some((age) => age > 56) || comparableSessions < 3) return "low";
  if (ages.every((age) => age <= 28) && comparableSessions >= 6 && techniqueVerified) return "high";
  if (ages.every((age) => age <= 28) && comparableSessions >= 3) return "medium";
  return "low";
}

function lowerLevel(level) {
  if (level === "advanced") return "intermediate";
  return "beginner";
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function stableClassificationId(input) {
  const payload = JSON.stringify(canonicalize(input));
  return `cfc_${crypto.createHash("sha256").update(payload).digest("hex").slice(0, 24)}`;
}

export function classifyCrossfitLevel(input = {}) {
  const now = input.now instanceof Date ? input.now : new Date(input.now ?? Date.now());
  const dimensionScores = Object.fromEntries(
    CROSSFIT_CLASSIFICATION_DIMENSIONS.map((dimension) => [dimension, score(input.dimension_scores?.[dimension])])
  );
  const confidence = resolveCrossfitClassificationConfidence({
    dimensionScores,
    evidence: input.evidence,
    now
  });
  const reasonCodes = [];
  const trace = [];
  const add = (ruleId, reasonCode, action, details = {}) => {
    reasonCodes.push(reasonCode);
    trace.push({ rule_id: ruleId, reason_code: reasonCode, scope: "classification", action, details });
  };

  const pain = Number(input.safety?.pain_score ?? 0);
  const blocked = input.safety?.blocked === true
    || input.safety?.red_flag === true
    || input.safety?.acute_injury === true
    || pain >= 5;
  if (blocked) {
    add("CF-LEVEL-SAFETY", pain >= 5 ? "SAFETY_PAIN_BLOCK" : "SAFETY_RED_FLAG", "block_classification");
    return {
      schema_version: CROSSFIT_VERSIONS.levelModel,
      classification_id: stableClassificationId({ dimensionScores, blocked: true, at: now.toISOString() }),
      status: "blocked",
      global_level: null,
      confidence,
      dimension_scores: dimensionScores,
      skill_permissions: { ...(input.skill_permissions ?? {}) },
      scale_policy: "per_movement_not_global_level",
      elite_eligible: false,
      return_protocol: null,
      reason_codes: [...new Set(reasonCodes)],
      decision_trace: trace
    };
  }

  let globalLevel = "beginner";
  const values = Object.values(dimensionScores);
  const adherence = Number(input.adherence_rate ?? 0);
  const allAtLeastTwo = values.every((value) => value >= 2);
  const sixAdvanced = values.filter((value) => value === 3).length >= 6;
  const allCriticalAtLeastOne = CRITICAL_DIMENSIONS.every((dimension) => dimensionScores[dimension] >= 1);
  const sixCompetent = values.filter((value) => value >= 2).length >= 6;

  if (confidence === "high" && allAtLeastTwo && sixAdvanced && adherence >= 0.8 && input.evidence?.technique_verified === true) {
    globalLevel = "advanced";
  } else if (confidence !== "low" && allCriticalAtLeastOne && sixCompetent && adherence >= 0.7) {
    globalLevel = "intermediate";
  } else if (confidence === "low") {
    add("CF-LEVEL-CONFIDENCE", "LEVEL_CONFIDENCE_LOW", "cap_beginner");
  }

  const minScore = Math.min(...values);
  const maxScore = Math.max(...values);
  if (maxScore - minScore >= 2 || values.some((value) => value < LEVEL_SCORE[globalLevel])) {
    add("CF-LEVEL-ASYMMETRY", "LEVEL_ASYMMETRIC", "cap_skills_by_dimension", {
      lowest_dimensions: CROSSFIT_CLASSIFICATION_DIMENSIONS.filter((dimension) =>
        dimensionScores[dimension] === minScore)
    });
  }

  const pauseDays = Math.max(0, Number(input.pause_days ?? 0));
  let returnProtocol = null;
  if (pauseDays >= 14) {
    const volumeReduction = pauseDays >= 56 ? 0.5 : pauseDays >= 28 ? 0.35 : 0.2;
    const durationWeeks = pauseDays >= 56 ? 3 : pauseDays >= 28 ? 2 : 1;
    if (pauseDays >= 56) globalLevel = lowerLevel(globalLevel);
    returnProtocol = {
      pause_days: pauseDays,
      volume_reduction: volumeReduction,
      duration_weeks: durationWeeks,
      skill_tier_reduction: pauseDays >= 28 ? 1 : 0,
      requires_reassessment: pauseDays >= 56
    };
    add("CF-LEVEL-RETURN", "RETURN_PROTOCOL_REQUIRED", "apply_return_protocol", returnProtocol);
  }

  const currentLevel = normalizeCrossfitLevel(input.current_level);
  const comparableExposures = Number(input.evidence?.comparable_exposures_per_dimension ?? 0);
  const blockWeeks = Number(input.evidence?.weeks_in_level ?? 0);
  const promotionWindow = comparableExposures >= 3
    && ((currentLevel === "beginner" && blockWeeks >= 6) || (currentLevel === "intermediate" && blockWeeks >= 8));
  let decision = "enter";
  if (currentLevel) {
    if (LEVEL_SCORE[globalLevel] > LEVEL_SCORE[currentLevel] && promotionWindow) decision = "promote";
    else if (LEVEL_SCORE[globalLevel] < LEVEL_SCORE[currentLevel]) decision = "temporary_regress";
    else decision = "stay";
  }
  if (currentLevel && LEVEL_SCORE[globalLevel] > LEVEL_SCORE[currentLevel] && !promotionWindow) {
    globalLevel = currentLevel;
    decision = "stay";
    add("CF-LEVEL-PROMOTION-WINDOW", "AUTOREG_HOLD", "wait_for_three_comparable_exposures");
  }

  const classificationBasis = {
    dimensionScores,
    confidence,
    adherence,
    pauseDays,
    currentLevel,
    comparableExposures,
    blockWeeks,
    evidence_version: input.evidence?.version ?? null,
    skill_permissions: input.skill_permissions ?? {}
  };
  return {
    schema_version: CROSSFIT_VERSIONS.levelModel,
    classification_id: stableClassificationId(classificationBasis),
    status: confidence === "low" ? "provisional" : "classified",
    decision,
    global_level: globalLevel,
    confidence,
    dimension_scores: dimensionScores,
    skill_permissions: { ...(input.skill_permissions ?? {}) },
    scale_policy: "per_movement_not_global_level",
    elite_eligible: false,
    return_protocol: returnProtocol,
    years_training: Number.isFinite(Number(input.years_training)) ? Number(input.years_training) : null,
    reason_codes: [...new Set(reasonCodes)],
    decision_trace: trace.length ? trace : [{
      rule_id: "CF-LEVEL-BASELINE",
      reason_code: "AUTOREG_HOLD",
      scope: "classification",
      action: "classification_stable",
      details: {}
    }]
  };
}
