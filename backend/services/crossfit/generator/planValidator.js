import { validateTrainingLoad } from "../../trainingLoad/trainingLoadContract.js";
import { validateCrossfitPlan } from "../contracts/schemas.js";
import { getCrossfitD2Max, getCrossfitProgramRules } from "../programming/programRules.js";
import { evaluateCrossfitSafety } from "../safety/safetyEvaluator.js";
import { CROSSFIT_VERSIONS } from "../versions.js";
import { getCrossfitWodFormatRule } from "./formatRules.js";
import { crossfitEquipmentAvailable, crossfitMovementSkillTier } from "./wodComposer.js";

export const CROSSFIT_INVARIANT_DEFINITIONS = Object.freeze([
  ["CF-EX-001", "exercise", "ERROR", "reject", "CATALOG_INACTIVE"],
  ["CF-EX-002", "exercise", "ERROR", "reject", "EQUIPMENT_UNAVAILABLE"],
  ["CF-EX-003", "exercise", "ERROR", "reject", "SKILL_LOCKED"],
  ["CF-EX-004", "exercise", "ERROR", "reject", "SAFETY_CONTRAINDICATED"],
  ["CF-EX-005", "exercise", "ERROR", "reject", "DOSE_OUT_OF_RANGE"],
  ["CF-EX-006", "exercise", "ERROR", "reject", "CATALOG_INSTRUCTIONS_MISSING"],
  ["CF-EX-007", "exercise", "WARN", "prefer_text_or_other", "MEDIA_UNVERIFIED"],
  ["CF-WOD-001", "wod", "ERROR", "reject", "WOD_FORMAT_NOT_ALLOWED"],
  ["CF-WOD-002", "wod", "ERROR", "reject", "WOD_CAP_INVALID"],
  ["CF-WOD-003", "wod", "ERROR", "rescale", "WOD_STIMULUS_MISS"],
  ["CF-WOD-004", "wod", "ERROR", "rescale", "WOD_SET_TOO_LARGE"],
  ["CF-WOD-005", "wod", "ERROR", "reject", "WOD_OLY_VOLUME"],
  ["CF-WOD-006", "wod", "ERROR", "reject", "WOD_HIGH_SKILL_COLLISION"],
  ["CF-WOD-007", "wod", "ERROR", "backtrack", "WOD_PAIRING_PROHIBITED"],
  ["CF-WOD-008", "wod", "ERROR", "rescale", "WOD_SCALE_STIMULUS_LOSS"],
  ["CF-WOD-009", "wod", "ERROR", "reject", "WOD_SCORE_TYPE_INVALID"],
  ["CF-SES-001", "session", "ERROR", "regenerate", "SESSION_WARMUP_GAP"],
  ["CF-SES-002", "session", "ERROR", "regenerate", "SESSION_INTERFERENCE"],
  ["CF-SES-003", "session", "ERROR", "regenerate", "SESSION_JOINT_LOAD"],
  ["CF-SES-004", "session", "ERROR", "trim_optional", "SESSION_TIME_EXCEEDED"],
  ["CF-SES-005", "session", "ERROR", "reject", "SESSION_STOP_RULES_MISSING"],
  ["CF-SES-006", "session", "ERROR", "reject", "TRAINING_LOAD_INVALID"],
  ["CF-SES-007", "session", "ERROR", "reject", "TRACE_MISSING"],
  ["CF-WEEK-001", "week", "ERROR", "regenerate", "WEEK_D2_SEQUENCE"],
  ["CF-WEEK-002", "week", "ERROR", "regenerate", "WEEK_D2_SEQUENCE"],
  ["CF-WEEK-003", "week", "ERROR", "regenerate", "WEEK_HINGE_COLLISION"],
  ["CF-WEEK-004", "week", "ERROR", "regenerate", "WEEK_IMPACT_QUOTA"],
  ["CF-WEEK-005", "week", "ERROR", "regenerate", "WEEK_TISSUE_QUOTA"],
  ["CF-WEEK-006", "week", "WARN", "trace_or_regenerate", "WEEK_DOMAIN_GAP"],
  ["CF-WEEK-007", "week", "ERROR", "regenerate", "BENCHMARK_TOO_FREQUENT"],
  ["CF-WEEK-008", "week", "ERROR", "regenerate", "MOVEMENT_REPEATED_TOO_SOON"],
  ["CF-BLOCK-001", "block", "ERROR", "regenerate", "BLOCK_DELOAD_MISSING"],
  ["CF-BLOCK-002", "block", "ERROR", "regenerate", "BLOCK_MULTI_PROGRESS"],
  ["CF-BLOCK-003", "block", "ERROR", "regenerate", "BLOCK_SKILL_IN_DELOAD"],
  ["CF-BLOCK-004", "block", "ERROR", "regenerate", "BENCHMARK_TOO_FREQUENT"],
  ["CF-USER-001", "user", "ERROR", "block", "SAFETY_RED_FLAG"],
  ["CF-USER-002", "user", "ERROR", "block", "SAFETY_PAIN_BLOCK"],
  ["CF-USER-003", "user", "ERROR", "lower_level", "LEVEL_CONFIDENCE_LOW"],
  ["CF-USER-004", "user", "ERROR", "regenerate", "RETURN_PROTOCOL_REQUIRED"],
  ["CF-USER-005", "user", "ERROR", "offer_minimum", "FREQUENCY_UNSUPPORTED"],
  ["CF-SYS-001", "system", "ERROR", "fail_generation", "IDEMPOTENCY_BROKEN"],
  ["CF-SYS-002", "system", "ERROR", "abort_regeneration", "HISTORY_IMMUTABLE"],
  ["CF-SYS-003", "system", "WARN", "use_fallback", "GEN_SEARCH_BUDGET_EXCEEDED"],
  ["CF-SYS-004", "system", "ERROR", "discard_AI", "AI_VALIDATION_FAILED"]
].map(([id, scope, severity, action, reasonCode]) => Object.freeze({
  id, scope, severity, action, reason_code: reasonCode
})));

const BY_ID = new Map(CROSSFIT_INVARIANT_DEFINITIONS.map((item) => [item.id, item]));

function violation(id, details = {}) {
  return { ...BY_ID.get(id), details };
}

function hasTag(movement, expression) {
  return (movement.pairing_tags ?? []).some((tag) => expression.test(tag));
}

function validateWod(wod, session, movementById, findings, context) {
  const level = session.level;
  const rule = getCrossfitWodFormatRule(level, wod.format);
  if (!rule) {
    findings.push(violation("CF-WOD-001", { format: wod.format, level }));
    return;
  }
  if (wod.movements.length < rule.movements_min || wod.movements.length > rule.movements_max) {
    findings.push(violation("CF-WOD-001", { movement_count: wod.movements.length }));
  }
  const capMinutes = wod.time_cap_seconds / 60;
  if (!wod.format.endsWith("_only") && (capMinutes < wod.target_minutes || capMinutes > rule.cap_max)) {
    findings.push(violation("CF-WOD-002", { cap_minutes: capMinutes, rule_cap: rule.cap_max }));
  }
  if (!wod.format.endsWith("_only")) {
    const completionRatio = capMinutes > 0 ? wod.target_minutes / capMinutes : 0;
    if (completionRatio < 0.7 || completionRatio > 0.95) {
      findings.push(violation("CF-WOD-003", { completion_ratio: completionRatio }));
    }
  }
  if (wod.score_type !== rule.score_type) findings.push(violation("CF-WOD-009"));
  if (wod.stop_rules.length === 0) findings.push(violation("CF-SES-005"));
  if (wod.decision_trace.length === 0) findings.push(violation("CF-SES-007"));

  const fullMovements = wod.movements.map((movement) => movementById.get(movement.canonical_movement_id)).filter(Boolean);
  for (const prescribed of wod.movements) {
    const movement = movementById.get(prescribed.canonical_movement_id);
    if (!movement?.active || movement?.catalog_version !== CROSSFIT_VERSIONS.catalog) {
      findings.push(violation("CF-EX-001", { movement_id: prescribed.canonical_movement_id }));
      continue;
    }
    const available = context.profile?.available_equipment ?? context.profile?.equipment_available ?? [];
    if (!crossfitEquipmentAvailable(movement.equipment, available)) {
      findings.push(violation("CF-EX-002", { movement_id: movement.canonical_id }));
    }
    const requiredTier = crossfitMovementSkillTier(movement);
    const permissionDenied = (movement.skill_prerequisites ?? []).some((key) => context.skill_permissions?.[key] === false);
    const highSkillUnverified = requiredTier >= 3
      && !(movement.skill_prerequisites ?? []).every((key) => context.skill_permissions?.[key] === true);
    if (prescribed.skill_tier !== requiredTier || permissionDenied || highSkillUnverified) {
      findings.push(violation("CF-EX-003", { movement_id: movement.canonical_id }));
    }
    const safety = evaluateCrossfitSafety({ profile: context.profile, movement, checkIn: context.check_in });
    if (safety.blocked || !safety.movement_allowed) {
      findings.push(violation("CF-EX-004", { movement_id: movement.canonical_id, reasons: safety.reason_codes }));
    }
    const reps = Number(prescribed.dose?.reps ?? 0);
    const freshCapacity = Number(context.fresh_capacity_by_movement?.[movement.canonical_id]);
    const absoluteRepCap = session.level === "beginner" ? 15 : session.level === "intermediate" ? 20 : 25;
    if (reps < 0 || reps > absoluteRepCap
      || Number.isFinite(freshCapacity) && freshCapacity > 0 && reps > freshCapacity * 0.6) {
      findings.push(violation("CF-EX-005", { movement_id: movement.canonical_id, reps, fresh_capacity: freshCapacity || null }));
    }
    if (!movement.instruction_text?.trim()) findings.push(violation("CF-EX-006", { movement_id: movement.canonical_id }));
    if (context.include_warnings && !String(movement.media_status).startsWith("verified_")) {
      findings.push(violation("CF-EX-007", { movement_id: movement.canonical_id }));
    }
  }
  const highSkills = wod.movements.filter((movement) => movement.skill_tier >= 3);
  if (highSkills.length > 1 || level === "beginner" && highSkills.length > 0) {
    findings.push(violation("CF-WOD-006", { high_skill_count: highSkills.length }));
  }
  const olympicReps = wod.movements.reduce((sum, movement) => {
    const source = movementById.get(movement.canonical_movement_id);
    return source?.domain === "weightlifting" && /olympic|clean|snatch|jerk/.test(`${source.category} ${source.pattern} ${source.canonical_id}`)
      ? sum + Number(movement.dose.reps ?? 0)
      : sum;
  }, 0);
  const olympicMax = { beginner: 12, intermediate: 24, advanced: 36 }[level];
  if (olympicReps > olympicMax) findings.push(violation("CF-WOD-005", { olympic_reps: olympicReps }));
  for (let left = 0; left < fullMovements.length; left += 1) {
    for (let right = left + 1; right < fullMovements.length; right += 1) {
      const a = fullMovements[left];
      const b = fullMovements[right];
      if ((a.avoid_pairing ?? []).some((tag) => (b.pairing_tags ?? []).includes(tag))
        || (b.avoid_pairing ?? []).some((tag) => (a.pairing_tags ?? []).includes(tag))) {
        findings.push(violation("CF-WOD-007", { movement_ids: [a.canonical_id, b.canonical_id] }));
      }
    }
  }
  if (wod.scales.some((scale) => Math.abs(Number(scale.stimulus_delta ?? 1)) > 0.15)) {
    findings.push(violation("CF-WOD-008"));
  }
}

function validateSession(session, movementById, findings, context) {
  const primaryPatterns = new Set(session.wod.movements.map((movement) =>
    movementById.get(movement.canonical_movement_id)?.pattern).filter(Boolean));
  const covered = new Set(session.warmup.flatMap((item) => item.patterns ?? []));
  if ([...primaryPatterns].some((pattern) => !covered.has(pattern))) {
    findings.push(violation("CF-SES-001", { missing: [...primaryPatterns].filter((pattern) => !covered.has(pattern)) }));
  }
  if (!validateTrainingLoad(session.training_load, { mode: "strict" }).valid) {
    findings.push(violation("CF-SES-006"));
  }
  if (session.decision_trace.length === 0) findings.push(violation("CF-SES-007"));
  const blockMinutes = session.blocks.reduce((sum, block) => sum + Number(block.duration_minutes ?? 0), 0);
  const warmupMinutes = session.warmup.reduce((sum, block) => sum + Number(block.duration_minutes ?? 0), 0);
  const cooldownMinutes = session.cooldown.reduce((sum, block) => sum + Number(block.duration_minutes ?? 0), 0);
  const totalMinutes = warmupMinutes + blockMinutes + session.wod.target_minutes + cooldownMinutes;
  if (totalMinutes > Number(session.training_load.duration?.planned_min ?? 0)) {
    findings.push(violation("CF-SES-004", { total_minutes: totalMinutes }));
  }
  const block = session.blocks.find((item) => item.primary_pattern);
  const wodPatterns = new Set(session.wod.movements.map((movement) =>
    movementById.get(movement.canonical_movement_id)?.pattern));
  if (block && Number(block.target_rpe?.[1] ?? 0) > 8 && wodPatterns.has(block.primary_pattern)) {
    findings.push(violation("CF-SES-002", { pattern: block.primary_pattern }));
  }
  const sessionMovements = session.wod.movements
    .map((movement) => movementById.get(movement.canonical_movement_id)).filter(Boolean);
  for (const [tissue, expression] of [["shoulder", /overhead/], ["impact", /impact/], ["grip", /grip/], ["lumbar", /hinge|ghd/]]) {
    const count = sessionMovements.filter((movement) => hasTag(movement, expression)).length;
    if (count > 2) findings.push(violation("CF-SES-003", { tissue, movement_count: count }));
  }
  validateWod(session.wod, session, movementById, findings, context);
}

function validateWeek(week, level, frequency, movementById, findings, context) {
  const sessions = [...week.sessions].sort((a, b) => a.date.localeCompare(b.date));
  const d2Count = sessions.filter((session) => session.training_load.day_type === "D2").length;
  if (d2Count > getCrossfitD2Max(level, frequency)) findings.push(violation("CF-WEEK-001", { d2_count: d2Count }));
  let demandingRun = 0;
  for (const session of sessions) {
    if (session.training_load.day_type === "D2") demandingRun += 1;
    else demandingRun = 0;
    if (demandingRun > (level === "advanced" ? 2 : 1)) findings.push(violation("CF-WEEK-002"));
  }
  const impact = sessions.filter((session) => session.wod.movements
    .map((item) => movementById.get(item.canonical_movement_id))
    .some((movement) => movement && hasTag(movement, /impact/))).length;
  const impactMax = getCrossfitProgramRules(level).quotas.high_impact_max;
  if (impact > impactMax) findings.push(violation("CF-WEEK-004", { impact, impact_max: impactMax }));
  const tissueLimits = [
    ["grip", /grip/],
    ["overhead", /overhead/],
    ["lumbar", /hinge|ghd/]
  ];
  for (const [name, expression] of tissueLimits) {
    const count = sessions.filter((session) => session.wod.movements
      .map((item) => movementById.get(item.canonical_movement_id))
      .some((movement) => movement && hasTag(movement, expression))).length;
    if (count > 2) findings.push(violation("CF-WEEK-005", { tissue: name, count }));
  }
  const hingeDates = sessions.filter((session) => session.wod.movements
    .map((item) => movementById.get(item.canonical_movement_id))
    .some((movement) => movement && hasTag(movement, /hinge/))).map((session) => session.date);
  for (let index = 1; index < hingeDates.length; index += 1) {
    const hours = (Date.parse(`${hingeDates[index]}T12:00:00Z`) - Date.parse(`${hingeDates[index - 1]}T12:00:00Z`)) / 3600000;
    if (hours < 48) findings.push(violation("CF-WEEK-003", { spacing_hours: hours }));
  }
  const representedDomains = new Set(sessions.flatMap((session) => session.wod.movements)
    .map((item) => movementById.get(item.canonical_movement_id)?.domain).filter(Boolean));
  if (context.include_warnings
    && !["gymnastics", "weightlifting", "monostructural"].every((domain) => representedDomains.has(domain))) {
    findings.push(violation("CF-WEEK-006", { represented_domains: [...representedDomains] }));
  }
  for (const session of sessions) validateSession(session, movementById, findings, context);
}

export function validateGeneratedCrossfitPlan(plan, {
  catalog = [],
  frequency,
  profile = {},
  check_in: checkIn = {},
  skill_permissions: skillPermissions = {},
  fresh_capacity_by_movement: freshCapacityByMovement = {},
  include_warnings: includeWarnings = true
} = {}) {
  const findings = [];
  const contract = validateCrossfitPlan(plan);
  if (!contract.valid) {
    findings.push({
      id: "CONTRACT",
      scope: "system",
      severity: "ERROR",
      action: "reject",
      reason_code: "TRACE_MISSING",
      details: { errors: contract.errors }
    });
  }
  const movementById = new Map(catalog.map((movement) => [movement.canonical_id, movement]));
  const context = {
    profile,
    check_in: checkIn,
    skill_permissions: skillPermissions,
    fresh_capacity_by_movement: freshCapacityByMovement,
    include_warnings: includeWarnings
  };
  for (const week of plan.weeks ?? []) validateWeek(week, plan.level, frequency, movementById, findings, context);
  const rules = getCrossfitProgramRules(plan.level);
  const phases = plan.block?.phase_by_week ?? [];
  const expectedDeloads = rules?.week_profiles
    .map((profile, index) => [profile[0], index + 1])
    .filter(([phase]) => phase === "deload" || phase === "reassessment")
    .map(([, week]) => week) ?? [];
  if (expectedDeloads.some((week) => !["deload", "reassessment"].includes(phases[week - 1]))) {
    findings.push(violation("CF-BLOCK-001"));
  }
  if (plan.catalog_version !== CROSSFIT_VERSIONS.catalog) findings.push(violation("CF-EX-001"));
  const d2ByMovement = new Map();
  for (const session of (plan.weeks ?? []).flatMap((week) => week.sessions)
    .filter((item) => item.training_load.day_type === "D2")
    .sort((left, right) => left.date.localeCompare(right.date))) {
    for (const movement of session.wod.movements) {
      const previous = d2ByMovement.get(movement.canonical_movement_id);
      if (previous) {
        const hours = (Date.parse(`${session.date}T12:00:00Z`) - Date.parse(`${previous}T12:00:00Z`)) / 3600000;
        if (hours < 72) findings.push(violation("CF-WEEK-008", {
          movement_id: movement.canonical_movement_id,
          spacing_hours: hours
        }));
      }
      d2ByMovement.set(movement.canonical_movement_id, session.date);
    }
  }
  return {
    valid: findings.every((finding) => finding.severity !== "ERROR"),
    hard_violations: findings.filter((finding) => finding.severity === "ERROR"),
    warnings: findings.filter((finding) => finding.severity === "WARN"),
    findings
  };
}
