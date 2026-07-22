import { evaluateCrossfitSafety } from "../safety/safetyEvaluator.js";
import { CROSSFIT_VERSIONS } from "../versions.js";
import { crossfitHash, deterministicIndex, deterministicRank, stableCrossfitId } from "./deterministic.js";
import { CROSSFIT_WOD_FORMATS, getCrossfitWodFormatRule, timeDomainForMinutes } from "./formatRules.js";

const LEVEL_TIER = Object.freeze({ beginner: 1, intermediate: 2, advanced: 3 });
const FORMAT_PREFERENCES = Object.freeze({
  short: Object.freeze(["for_time", "rft", "amrap", "intervals", "emom"]),
  medium: Object.freeze(["amrap", "emom", "rft", "for_time", "intervals", "chipper"]),
  long: Object.freeze(["intervals", "chipper", "amrap", "e2mom", "e3mom"]),
  extended: Object.freeze(["intervals", "skill_only", "strength_only"]),
  interval: Object.freeze(["intervals", "emom", "e2mom", "e3mom"]),
  variable: Object.freeze(CROSSFIT_WOD_FORMATS.filter((format) => !format.endsWith("_only")))
});

function normalizeEquipment(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function crossfitEquipmentAvailable(required = [], available = []) {
  const owned = new Set(available.map(normalizeEquipment));
  return required.every((raw) => {
    const value = normalizeEquipment(raw);
    if (!value || value === "none" || value.endsWith("_optional")) return true;
    if (value.startsWith("none_or_")) return true;
    if (value.includes("_or_")) return value.split("_or_").some((item) => owned.has(item));
    if (value.includes("_and_")) return value.split("_and_").every((item) => owned.has(item));
    return owned.has(value);
  });
}

export function crossfitMovementSkillTier(movement) {
  const base = LEVEL_TIER[movement.min_level] ?? 5;
  const highSkill = [...(movement.skill_prerequisites ?? []), ...(movement.pairing_tags ?? [])]
    .some((tag) => /muscle_up|handstand|hspu|rope_climb|kipping|double_under|high_skill/.test(tag));
  return highSkill ? Math.max(3, base) : base;
}

export function crossfitSkillAllowed(movement, level, permissions = {}) {
  const tier = crossfitMovementSkillTier(movement);
  if (tier > LEVEL_TIER[level]) return false;
  if ((movement.skill_prerequisites ?? []).some((key) => permissions[key] === false)) return false;
  if (tier >= 3) return (movement.skill_prerequisites ?? []).every((key) => permissions[key] === true);
  return true;
}

function pairingConflict(left, right) {
  const leftAvoid = new Set(left.avoid_pairing ?? []);
  const rightAvoid = new Set(right.avoid_pairing ?? []);
  return (right.pairing_tags ?? []).some((tag) => leftAvoid.has(tag))
    || (left.pairing_tags ?? []).some((tag) => rightAvoid.has(tag));
}

function scoreMovement(movement, context) {
  let score = 0;
  if (movement.pattern === context.primary_pattern || movement.category === context.primary_pattern) score += 40;
  if (movement.domain === context.secondary_domain) score += 25;
  if (!context.history_ids.has(movement.canonical_id)) score += 15;
  if (context.preferences.has(movement.canonical_id) || context.preferences.has(movement.category)) score += 10;
  if (String(movement.media_status).startsWith("verified_")) score += 5;
  if (movement.avoid_pairing?.length) score -= 5;
  return score;
}

function chooseFormat(level, targetDomain, candidateCount, seed, maxWodMinutes = Infinity) {
  const preferences = FORMAT_PREFERENCES[targetDomain] ?? FORMAT_PREFERENCES.medium;
  const allowed = preferences.filter((format) => {
    const rule = getCrossfitWodFormatRule(level, format);
    return rule && candidateCount >= rule.movements_min && rule.target_min <= maxWodMinutes;
  });
  return allowed[deterministicIndex([seed, "format"], allowed.length)] ?? null;
}

function targetMinutes(rule, seed) {
  const safeMaximum = rule.cap_max === 0
    ? rule.target_max
    : Math.min(rule.target_max, Math.floor(rule.cap_max * 0.9));
  const span = Math.max(0, Math.floor(safeMaximum - rule.target_min));
  return rule.target_min + deterministicIndex([seed, "minutes"], span + 1);
}

function capSeconds(format, target, rule) {
  if (format.endsWith("_only")) return 0;
  const capMinutes = Math.min(rule.cap_max, Math.ceil(target / 0.8 * 2) / 2);
  return Math.round(capMinutes * 60);
}

function movementDose(movement, level, format) {
  const tier = LEVEL_TIER[level];
  if (movement.domain === "monostructural") {
    return { type: "duration", duration_seconds: format === "intervals" ? 60 : 90 };
  }
  if (format === "strength_only") {
    return { type: "load", reps: Math.max(2, 6 - tier), load: 60, load_unit: "percent_1rm" };
  }
  if (format === "skill_only") return { type: "quality", duration_seconds: 45 };
  const reps = level === "beginner" ? 8 : level === "intermediate" ? 10 : 12;
  return { type: "reps", reps };
}

function movementContract(movement, level, format) {
  return {
    canonical_movement_id: movement.canonical_id,
    catalog_version: CROSSFIT_VERSIONS.catalog,
    name: movement.name,
    dose: movementDose(movement, level, format),
    skill_tier: crossfitMovementSkillTier(movement),
    equipment: [...(movement.equipment ?? [])],
    stimulus_tags: [...(movement.stimulus ?? [])],
    substitutions: [...(movement.substitutions ?? [])],
    scale_id: "base"
  };
}

function selectCompatibleMovements(ranked, wanted = Infinity) {
  const selected = [];
  let selectedHighSkill = 0;
  let selectedOlympic = 0;
  let searchNodes = 0;
  for (const movement of ranked) {
    searchNodes += 1;
    if (searchNodes > 500) break;
    const skillTier = crossfitMovementSkillTier(movement);
    if (skillTier >= 3 && selectedHighSkill >= 1) continue;
    const isOlympic = movement.domain === "weightlifting"
      && /olympic|clean|snatch|jerk/.test(`${movement.category} ${movement.pattern} ${movement.canonical_id}`);
    if (isOlympic && selectedOlympic >= 1) continue;
    const tissueExpressions = [/overhead/, /impact/, /grip/, /hinge|ghd/];
    if (tissueExpressions.some((expression) =>
      (movement.pairing_tags ?? []).some((tag) => expression.test(tag))
      && selected.filter((item) => (item.pairing_tags ?? []).some((tag) => expression.test(tag))).length >= 2)) continue;
    if (selected.some((item) => item.pattern === movement.pattern || pairingConflict(item, movement))) continue;
    selected.push(movement);
    if (skillTier >= 3) selectedHighSkill += 1;
    if (isOlympic) selectedOlympic += 1;
    if (selected.length >= wanted) break;
  }
  return { selected, searchNodes };
}

export function composeCrossfitWod({
  level,
  catalog = [],
  profile = {},
  check_in: checkIn = {},
  skill_permissions: skillPermissions = {},
  history_ids: historyIds = [],
  preferences = [],
  primary_pattern: primaryPattern,
  secondary_domain: secondaryDomain,
  target_domain: targetDomain = "medium",
  weekly_exposures: weeklyExposures = {},
  weekly_caps: weeklyCaps = {},
  forbidden_movement_ids: forbiddenMovementIds = [],
  forbidden_patterns: forbiddenPatterns = [],
  forbidden_tags: forbiddenTags = [],
  max_wod_minutes: maxWodMinutes = Infinity,
  seed,
  request_id: requestId
} = {}) {
  const availableEquipment = profile.available_equipment ?? profile.equipment_available ?? [];
  const filterCounts = { input: catalog.length, active: 0, skill: 0, equipment: 0, safety: 0 };
  const candidates = [];
  const forbiddenIds = new Set(forbiddenMovementIds);
  const blockedPatterns = new Set(forbiddenPatterns);
  const blockedTags = new Set(forbiddenTags);
  let blockedSafety = null;
  for (const movement of catalog) {
    if (!movement.active || movement.catalog_version !== CROSSFIT_VERSIONS.catalog) continue;
    filterCounts.active += 1;
    if (forbiddenIds.has(movement.canonical_id) || blockedPatterns.has(movement.pattern)) continue;
    if ((movement.pairing_tags ?? []).some((tag) => blockedTags.has(tag))) continue;
    if (!crossfitSkillAllowed(movement, level, skillPermissions)) continue;
    filterCounts.skill += 1;
    if (!crossfitEquipmentAvailable(movement.equipment, availableEquipment)) continue;
    filterCounts.equipment += 1;
    const tags = movement.pairing_tags ?? [];
    if (tags.some((tag) => /impact/.test(tag))
      && Number(weeklyExposures.high_impact ?? 0) >= Number(weeklyCaps.high_impact_max ?? Infinity)) continue;
    if (tags.some((tag) => /grip/.test(tag))
      && Number(weeklyExposures.high_grip ?? 0) >= Number(weeklyCaps.high_grip_max ?? Infinity)) continue;
    if (tags.includes("overhead")
      && Number(weeklyExposures.dense_overhead ?? 0) >= Number(weeklyCaps.dense_overhead_max ?? Infinity)) continue;
    if (tags.some((tag) => tag === "hinge" || tag === "ghd")
      && Number(weeklyExposures.heavy_hinge ?? 0) >= Number(weeklyCaps.heavy_hinge_max ?? Infinity)) continue;
    const safety = evaluateCrossfitSafety({ profile, movement, checkIn });
    if (safety.blocked) {
      blockedSafety = safety;
      break;
    }
    if (!safety.movement_allowed) continue;
    filterCounts.safety += 1;
    candidates.push(movement);
  }
  if (blockedSafety) {
    return { ok: false, reason_codes: blockedSafety.reason_codes, filter_counts: filterCounts, blocked: true };
  }
  const context = {
    primary_pattern: primaryPattern,
    secondary_domain: secondaryDomain,
    history_ids: new Set(historyIds),
    preferences: new Set(preferences)
  };
  const ranked = deterministicRank(candidates, seed, (movement) => scoreMovement(movement, context));
  const compatible = selectCompatibleMovements(ranked);
  const format = chooseFormat(level, targetDomain, compatible.selected.length, seed, maxWodMinutes);
  if (!format) {
    return {
      ok: false,
      reason_codes: [candidates.length === 0 ? "EQUIPMENT_UNAVAILABLE" : "WOD_FORMAT_NOT_ALLOWED"],
      filter_counts: filterCounts,
      blocked: true
    };
  }
  const rule = getCrossfitWodFormatRule(level, format);
  const wanted = rule.movements_min + deterministicIndex([seed, "movement_count"], rule.movements_max - rule.movements_min + 1);
  const selected = compatible.selected.slice(0, wanted);
  const searchNodes = compatible.searchNodes;
  if (selected.length < rule.movements_min) {
    return {
      ok: false,
      reason_codes: [searchNodes > 500 ? "GEN_SEARCH_BUDGET_EXCEEDED" : "WOD_PAIRING_PROHIBITED"],
      filter_counts: filterCounts,
      search_nodes: searchNodes,
      blocked: true
    };
  }
  const target = Math.min(targetMinutes(rule, seed), maxWodMinutes);
  const cap = capSeconds(format, target, rule);
  const actualTimeDomain = timeDomainForMinutes(target);
  const trace = [{
    rule_id: "CF-GEN-COMPOSE",
    reason_code: "AUTOREG_HOLD",
    scope: "wod",
    action: "deterministic_selection",
    details: {
      filter_order: ["active", "skill", "equipment", "safety", "format", "pairing", "score"],
      filter_counts: filterCounts,
      search_nodes: searchNodes,
      candidate_hash: crossfitHash(ranked.map((movement) => movement.canonical_id))
    }
  }];
  return {
    ok: true,
    wod: {
      wod_id: stableCrossfitId("cfw", [seed, format, selected.map((movement) => movement.canonical_id)]),
      format,
      time_domain: actualTimeDomain,
      target_minutes: target,
      time_cap_seconds: cap,
      stimulus: `${targetDomain}:${secondaryDomain}:${primaryPattern}`,
      score_type: rule.score_type,
      movements: selected.map((movement) => movementContract(movement, level, format)),
      scales: [{ scale_id: "base", expected_completion_ratio: 0.8, stimulus_delta: 0 }],
      stop_rules: [
        "stop_red_flag_or_sharp_rising_pain",
        "stop_movement_if_technique_zero",
        "scale_after_two_intervals_over_work_limit"
      ],
      decision_trace: trace
    },
    selected_movements: selected,
    search_nodes: searchNodes,
    filter_counts: filterCounts
  };
}
