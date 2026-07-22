const DEFINITIONS = [
  ["SAFETY_RED_FLAG", "safety", "critical", "block_and_refer"],
  ["SAFETY_PAIN_BLOCK", "safety", "critical", "stop_block"],
  ["SAFETY_PAIN_MODIFY", "safety", "high", "stop_pattern_and_substitute"],
  ["SAFETY_TECHNIQUE_STOP", "safety", "high", "stop_movement"],
  ["SAFETY_CONTRAINDICATED", "safety", "critical", "reject"],
  ["SAFETY_CLEARANCE_REQUIRED", "safety", "critical", "block_vigorous"],
  ["SAFETY_DISCOMFORT_MONITOR", "safety", "info", "monitor_or_reduce_dose"],
  ["LEVEL_CONFIDENCE_LOW", "classification", "medium", "cap_beginner"],
  ["LEVEL_ASYMMETRIC", "classification", "info", "use_skill_cap"],
  ["SKILL_LOCKED", "skill", "high", "reject_or_regress"],
  ["SKILL_PROGRESS", "skill", "info", "advance_one_rung"],
  ["SKILL_REGRESS", "skill", "medium", "lower_one_rung"],
  ["EQUIPMENT_UNAVAILABLE", "equipment", "high", "substitute_same_stimulus"],
  ["FREQUENCY_UNSUPPORTED", "program", "medium", "offer_valid_frequency"],
  ["DOSE_OUT_OF_RANGE", "generator", "high", "rescale"],
  ["WOD_STIMULUS_MISS", "generator", "high", "rescale"],
  ["WOD_PAIRING_PROHIBITED", "generator", "high", "backtrack"],
  ["WOD_SCALE_STIMULUS_LOSS", "generator", "high", "choose_other_scale"],
  ["SESSION_INTERFERENCE", "generator", "high", "regenerate"],
  ["WEEK_D2_SEQUENCE", "generator", "high", "move_or_lower_session"],
  ["WEEK_IMPACT_QUOTA", "generator", "high", "replace_nonimpact"],
  ["WEEK_HINGE_COLLISION", "generator", "high", "move_or_replace"],
  ["WEEK_TISSUE_QUOTA", "generator", "high", "replace"],
  ["BENCHMARK_TOO_FREQUENT", "generator", "high", "replace"],
  ["MOVEMENT_REPEATED_TOO_SOON", "generator", "high", "replace"],
  ["GEN_SEARCH_BUDGET_EXCEEDED", "generator", "medium", "use_fallback"],
  ["TRACE_MISSING", "system", "high", "reject"],
  ["IDEMPOTENCY_BROKEN", "system", "critical", "fail"],
  ["AI_VALIDATION_FAILED", "system", "high", "use_deterministic_copy"],
  ["AUTOREG_BUILD", "autoreg", "info", "progress_one_variable"],
  ["AUTOREG_HOLD", "autoreg", "info", "maintain_or_calibrate"],
  ["AUTOREG_RECOVERY", "autoreg", "medium", "D0_D1_24_72h"],
  ["AUTOREG_DELOAD", "autoreg", "medium", "deload_5_7d"],
  ["AUTOREG_RETURN", "autoreg", "medium", "apply_return_reduction"],
  ["AUTOREG_EQUIPMENT_CHANGE", "autoreg", "info", "hold"],
  ["NUTR_CF_D0", "nutrition", "info", "rest_day_distribution"],
  ["NUTR_CF_D1", "nutrition", "info", "moderate_carbohydrate"],
  ["NUTR_CF_D2", "nutrition", "info", "high_day_carbohydrate"],
  ["NUTR_CF_LOW_ADHERENCE", "nutrition", "medium", "simplify_no_energy_change"],
  ["NUTR_CF_PERFORMANCE_DROP", "nutrition", "medium", "review_energy_or_training"],
  ["NUTR_CF_REDS_RISK", "nutrition", "critical", "stop_deficit_and_refer"],
  ["NUTR_CF_HYDRATION_PERSONALIZE", "nutrition", "info", "use_sweat_rate"],
  ["RETURN_PROTOCOL_REQUIRED", "program", "high", "reduce_volume_and_skill"],
  ["HISTORY_IMMUTABLE", "system", "critical", "abort"],
  ["TRAINING_LOAD_INVALID", "phase0", "critical", "do_not_emit_or_activate"],
  ["PHASE0_GATE_CLOSED", "phase0", "critical", "keep_feature_off"],
  ["CATALOG_INACTIVE", "catalog", "high", "reject"],
  ["CATALOG_INSTRUCTIONS_MISSING", "catalog", "high", "reject"],
  ["MEDIA_UNVERIFIED", "catalog", "medium", "use_text_or_verified_resource"],
  ["WOD_FORMAT_NOT_ALLOWED", "generator", "high", "reject"],
  ["WOD_CAP_INVALID", "generator", "high", "reject"],
  ["WOD_SET_TOO_LARGE", "generator", "high", "rescale"],
  ["WOD_OLY_VOLUME", "generator", "high", "reject"],
  ["WOD_HIGH_SKILL_COLLISION", "generator", "high", "reject"],
  ["WOD_SCORE_TYPE_INVALID", "generator", "high", "reject"],
  ["SESSION_WARMUP_GAP", "generator", "high", "regenerate"],
  ["SESSION_JOINT_LOAD", "generator", "high", "regenerate"],
  ["SESSION_TIME_EXCEEDED", "generator", "high", "trim_optional_or_regenerate"],
  ["SESSION_STOP_RULES_MISSING", "generator", "high", "reject"],
  ["WEEK_DOMAIN_GAP", "generator", "medium", "trace_or_regenerate"],
  ["BLOCK_DELOAD_MISSING", "generator", "high", "regenerate"],
  ["BLOCK_MULTI_PROGRESS", "generator", "high", "regenerate"],
  ["BLOCK_SKILL_IN_DELOAD", "generator", "high", "regenerate"],
  ["NUTR_CF_MACRO_CONSTRAINT", "nutrition", "high", "review_energy_or_targets"]
];

export const CROSSFIT_REASON_CODE_DEFINITIONS = Object.freeze(
  Object.fromEntries(
    DEFINITIONS.map(([code, domain, severity, defaultAction]) => [
      code,
      Object.freeze({ code, domain, severity, default_action: defaultAction })
    ])
  )
);

export const CROSSFIT_REASON_CODES = Object.freeze(
  Object.keys(CROSSFIT_REASON_CODE_DEFINITIONS)
);

export function isCrossfitReasonCode(value) {
  return typeof value === "string" && Object.hasOwn(CROSSFIT_REASON_CODE_DEFINITIONS, value);
}

export function getCrossfitReasonCodeDefinition(value) {
  return isCrossfitReasonCode(value) ? CROSSFIT_REASON_CODE_DEFINITIONS[value] : null;
}
