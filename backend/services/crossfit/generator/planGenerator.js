import { buildCrossfitPlannedTrainingLoad } from "../trainingLoadAdapter.js";
import { getCrossfitFeatureFlags } from "../featureFlags.js";
import { buildCrossfitProgramBlock } from "../programming/blockBuilder.js";
import { getCrossfitProgramRules } from "../programming/programRules.js";
import { CROSSFIT_VERSIONS } from "../versions.js";
import { crossfitHash, stableCrossfitId } from "./deterministic.js";
import { validateGeneratedCrossfitPlan } from "./planValidator.js";
import { composeCrossfitWod } from "./wodComposer.js";

function isoTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

function trace(ruleId, scope, action, details = {}) {
  return { rule_id: ruleId, reason_code: "AUTOREG_HOLD", scope, action, details };
}

function loadTier(dayType) {
  return dayType === "D2" ? "high" : "moderate";
}

function nextSessionHours(sessions, index) {
  if (!sessions[index + 1]) return null;
  return Math.round((Date.parse(`${sessions[index + 1].scheduled_date}T12:00:00Z`)
    - Date.parse(`${sessions[index].scheduled_date}T12:00:00Z`)) / 3600000);
}

const LEVEL_ORDER = Object.freeze(["beginner", "intermediate", "advanced"]);

function dimensionLevel(globalLevel, score) {
  const globalIndex = Math.max(0, LEVEL_ORDER.indexOf(globalLevel));
  if (!Number.isFinite(Number(score))) return LEVEL_ORDER[globalIndex];
  const scoreIndex = Math.max(0, Math.min(2, Number(score ?? 1) - 1));
  return LEVEL_ORDER[Math.min(globalIndex, scoreIndex)];
}

function strengthBlockDose(globalLevel, dimensionScores, blueprint, week) {
  const capacityLevel = dimensionLevel(globalLevel, dimensionScores?.strength);
  const skillDimension = blueprint.secondary_domain === "gymnastics"
    ? "gymnastics"
    : blueprint.secondary_domain === "weightlifting"
      ? "weightlifting"
      : "technique";
  const skillLevel = dimensionLevel(globalLevel, dimensionScores?.[skillDimension]);
  const capacityRules = getCrossfitProgramRules(capacityLevel);
  const maxRpe = capacityRules.strength.rpe[1];
  return {
    capacity_level: capacityLevel,
    skill_level: skillLevel,
    strength_sets: [...capacityRules.strength.sets],
    strength_reps: [...capacityRules.strength.reps],
    target_rpe: [
      Math.min(blueprint.target_rpe[0], maxRpe),
      Math.min(blueprint.target_rpe[1], maxRpe)
    ],
    new_skill_allowed: blueprint.new_skill_allowed
      && skillLevel === globalLevel
      && !week.is_deload
  };
}

export function generateCrossfitPlanV2(input = {}) {
  const generatedAt = isoTimestamp(input.generated_at);
  if (!generatedAt) {
    return { ok: false, reason_codes: ["IDEMPOTENCY_BROKEN"], errors: ["generated_at ISO explícito es requerido"] };
  }
  for (const field of ["request_id", "idempotency_key", "user_id", "classification_id", "seed"]) {
    if (typeof input[field] !== "string" || !input[field].trim()) {
      return { ok: false, reason_codes: ["IDEMPOTENCY_BROKEN"], errors: [`${field} es requerido`] };
    }
  }
  const block = buildCrossfitProgramBlock({
    level: input.level,
    frequency: input.frequency,
    start_date: input.start_date,
    available_minutes: input.available_minutes,
    return_protocol: input.return_protocol,
    seed: input.seed
  });
  if (!block.ok) return block;
  const planId = stableCrossfitId("cfp", [input.user_id, input.idempotency_key, input.seed, input.revision ?? 0]);
  const generatedWeeks = [];
  const rollingHistory = [...(input.history_ids ?? [])];

  for (const week of block.weeks) {
    const sessions = [];
    const weeklyExposures = { high_impact: 0, high_grip: 0, dense_overhead: 0, heavy_hinge: 0 };
    const lastExposureDate = {};
    for (const [sessionIndex, blueprint] of week.sessions.entries()) {
      const sessionSeed = [input.seed, block.block_id, week.week_number, blueprint.day_index];
      const forbiddenTags = [];
      for (const [tag, lastDate] of Object.entries(lastExposureDate)) {
        const elapsedHours = (Date.parse(`${blueprint.scheduled_date}T12:00:00Z`)
          - Date.parse(`${lastDate}T12:00:00Z`)) / 3600000;
        if (elapsedHours < (["hinge", "ghd", "grip"].includes(tag) ? 48 : 36)) forbiddenTags.push(tag);
      }
      const previousD2Sessions = generatedWeeks.flatMap((previousWeek) => previousWeek.sessions)
        .concat(sessions)
        .filter((previous) => previous.training_load.day_type === "D2"
          && (Date.parse(`${blueprint.scheduled_date}T12:00:00Z`)
            - Date.parse(`${previous.date}T12:00:00Z`)) / 3600000 < 72);
      const composed = composeCrossfitWod({
        level: block.level,
        catalog: input.catalog,
        profile: input.profile,
        check_in: input.check_in,
        skill_permissions: input.skill_permissions,
        history_ids: rollingHistory.slice(-14),
        preferences: input.preferences,
        primary_pattern: blueprint.primary_pattern,
        secondary_domain: blueprint.secondary_domain,
        target_domain: blueprint.time_domain,
        weekly_exposures: weeklyExposures,
        weekly_caps: week.quotas,
        forbidden_movement_ids: blueprint.training_load_class === "D2"
          ? previousD2Sessions.flatMap((previous) => previous.wod.movements
            .map((movement) => movement.canonical_movement_id))
          : [],
        forbidden_patterns: blueprint.target_rpe[1] > 8 ? [blueprint.primary_pattern] : [],
        forbidden_tags: forbiddenTags,
        max_wod_minutes: Math.max(6, blueprint.duration_minutes - 30),
        seed: sessionSeed,
        request_id: input.request_id
      });
      if (!composed.ok) {
        return {
          ...composed,
          errors: [`No se pudo componer semana ${week.week_number}, sesión ${blueprint.day_index}`]
        };
      }
      const movementPatterns = [...new Set(composed.selected_movements.map((movement) => movement.pattern))];
      const hoursToNext = nextSessionHours(week.sessions, sessionIndex);
      const plannedLoad = buildCrossfitPlannedTrainingLoad({
        level: block.level,
        sessionType: "mixed",
        dayType: blueprint.training_load_class,
        loadTier: loadTier(blueprint.training_load_class),
        durationMin: blueprint.duration_minutes,
        rpeTarget: blueprint.target_rpe[1],
        demand: {
          glycolytic: blueprint.training_load_class === "D2" ? 0.8 : 0.5,
          neuromuscular: composed.selected_movements.some((movement) => movement.domain === "weightlifting") ? 0.7 : 0.4,
          aerobic: composed.selected_movements.some((movement) => movement.domain === "monostructural") ? 0.8 : 0.5,
          skill: Math.max(...composed.wod.movements.map((movement) => movement.skill_tier)) / 3
        },
        recovery: { hours_to_next_session: hoursToNext, hours_to_next_hard_session: hoursToNext },
        context: { deload: week.is_deload, injury_modified: input.check_in?.pain_score > 0 },
        ruleIds: [block.ruleset_version, "wod-composition/2.0.0"]
      });
      if (!plannedLoad.valid) return { ok: false, ...plannedLoad };
      const dayId = stableCrossfitId("cfd", [planId, blueprint.scheduled_date]);
      const blockDose = strengthBlockDose(block.level, input.dimension_scores, blueprint, week);
      const sessionTrace = [trace("CF-GEN-SESSION", "session", "compose_validated", {
        week_number: week.week_number,
        day_index: blueprint.day_index,
        progress_variable: blueprint.progress_variable,
        capacity_level: blockDose.capacity_level,
        skill_level: blockDose.skill_level
      })];
      sessions.push({
        session_id: blueprint.session_id,
        plan_id: planId,
        day_id: dayId,
        user_id: input.user_id,
        level: block.level,
        status: "planned",
        date: blueprint.scheduled_date,
        session_type: "mixed",
        training_load: plannedLoad.load,
        warmup: [{ type: "pattern_preparation", patterns: movementPatterns, duration_minutes: 10 }],
        blocks: [{
          type: week.is_deload ? "technique" : "strength_or_skill",
          primary_pattern: blueprint.primary_pattern,
          duration_minutes: 15,
          capacity_level: blockDose.capacity_level,
          skill_level: blockDose.skill_level,
          strength_sets: blockDose.strength_sets,
          strength_reps: blockDose.strength_reps,
          target_rpe: blockDose.target_rpe,
          progress_variable: blueprint.progress_variable,
          new_skill_allowed: blockDose.new_skill_allowed
        }],
        wod: composed.wod,
        cooldown: [{ type: "downregulation", duration_minutes: 5 }],
        decision_trace: sessionTrace
      });
      if (composed.selected_movements.some((movement) =>
        movement.pairing_tags?.some((tag) => /impact/.test(tag)))) weeklyExposures.high_impact += 1;
      if (composed.selected_movements.some((movement) =>
        movement.pairing_tags?.some((tag) => /grip/.test(tag)))) weeklyExposures.high_grip += 1;
      if (composed.selected_movements.some((movement) => movement.pairing_tags?.includes("overhead"))) {
        weeklyExposures.dense_overhead += 1;
        lastExposureDate.overhead = blueprint.scheduled_date;
      }
      if (composed.selected_movements.some((movement) =>
        movement.pairing_tags?.some((tag) => tag === "hinge" || tag === "ghd"))) {
        weeklyExposures.heavy_hinge += 1;
        lastExposureDate.hinge = blueprint.scheduled_date;
        lastExposureDate.ghd = blueprint.scheduled_date;
      }
      if (composed.selected_movements.some((movement) => movement.pairing_tags?.includes("grip"))) {
        lastExposureDate.grip = blueprint.scheduled_date;
      }
      rollingHistory.push(...composed.wod.movements.map((movement) => movement.canonical_movement_id));
    }
    generatedWeeks.push({
      week_number: week.week_number,
      target_load: {
        phase: week.phase,
        volume_multiplier: week.volume_multiplier,
        rpe: week.target_rpe,
        is_deload: week.is_deload
      },
      sessions
    });
  }
  const plan = {
    schema_version: CROSSFIT_VERSIONS.plan,
    ruleset_version: CROSSFIT_VERSIONS.ruleset,
    catalog_version: CROSSFIT_VERSIONS.catalog,
    request_id: input.request_id,
    plan_id: planId,
    user_id: input.user_id,
    level: block.level,
    classification_id: input.classification_id,
    generation: {
      seed_hash: crossfitHash(input.seed),
      revision: Number.isInteger(input.revision) ? input.revision : 0,
      idempotency_key: input.idempotency_key,
      generated_at: generatedAt,
      supersedes: input.supersedes ?? null
    },
    block: {
      block_id: block.block_id,
      week_count: block.block_weeks,
      phase_by_week: block.weeks.map((week) => week.phase),
      quotas: block.quotas
    },
    weeks: generatedWeeks,
    decision_trace: [trace("CF-GEN-PLAN", "plan", "deterministic_plan_generated", {
      input_hash: crossfitHash({
        level: input.level,
        frequency: input.frequency,
        start_date: input.start_date,
        seed: input.seed,
        catalog_version: CROSSFIT_VERSIONS.catalog
      })
    })]
  };
  const validation = validateGeneratedCrossfitPlan(plan, {
    catalog: input.catalog,
    frequency: input.frequency,
    profile: input.profile,
    check_in: input.check_in,
    skill_permissions: input.skill_permissions,
    fresh_capacity_by_movement: input.fresh_capacity_by_movement,
    include_warnings: input.include_validation_warnings !== false
  });
  return validation.valid
    ? { ok: true, plan, validation }
    : { ok: false, plan: null, validation, reason_codes: validation.hard_violations.map((item) => item.reason_code) };
}

export function resolveCrossfitPlanGeneration(input, env = process.env) {
  if (!getCrossfitFeatureFlags(env).generation) {
    return { enabled: false, generated: false, plan: null, reason_codes: [] };
  }
  const result = generateCrossfitPlanV2(input);
  return { enabled: true, generated: result.ok, ...result };
}
