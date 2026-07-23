import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { reduceCrossfitAutoreg } from "../services/crossfit/autoreg/stateMachine.js";
import { parseCsv } from "../services/crossfit/catalog/csv.js";
import {
  CROSSFIT_CLASSIFICATION_DIMENSIONS,
  classifyCrossfitLevel
} from "../services/crossfit/classification/levelModel.js";
import { generateCrossfitPlanV2 } from "../services/crossfit/generator/planGenerator.js";
import {
  evaluateCrossfitNutritionSafety,
  getCrossfitNutritionRulePack,
  resolveCrossfitNutritionDay
} from "../services/crossfit/nutrition/nutritionAdapter.js";
import { buildCrossfitProgramBlock } from "../services/crossfit/programming/blockBuilder.js";
import { getCrossfitProgramRules } from "../services/crossfit/programming/programRules.js";
import { evaluateCrossfitSafety } from "../services/crossfit/safety/safetyEvaluator.js";
import { buildCrossfitPlannedTrainingLoad } from "../services/crossfit/trainingLoadAdapter.js";
import {
  buildFoodFiltersFromUserPreferences,
  matchesFoodFilters
} from "../services/nutritionV2/mealSelectionHelpers.js";
import {
  allCrossfitEquipment,
  allCrossfitSkillPermissions,
  loadCrossfitCatalogFixture
} from "./helpers/crossfitCatalogFixture.js";

const profiles = parseCsv(fs.readFileSync(
  new URL("../../docs/crossfit/data/qa_synthetic_profiles.csv", import.meta.url),
  "utf8"
));
const catalog = loadCrossfitCatalogFixture();
const catalogById = new Map(catalog.map((movement) => [movement.canonical_id, movement]));
const fullEquipment = allCrossfitEquipment(catalog);
const fullSkillPermissions = allCrossfitSkillPermissions(catalog);
const noSkillPermissions = Object.fromEntries(
  Object.keys(fullSkillPermissions).map((key) => [key, false])
);
const gymnasticsLockedPermissions = Object.fromEntries(
  Object.entries(fullSkillPermissions).map(([key, value]) => [
    key,
    /pull|kip|handstand|hspu|muscle|rope|toes|ring|dip/.test(key) ? false : value
  ])
);
const now = new Date("2026-07-22T10:00:00.000Z");

const EQUIPMENT = Object.freeze({
  bodyweight: [],
  full_box: fullEquipment,
  dumbbell_band: ["dumbbell", "dumbbells", "band", "resistance_band"],
  home_dumbbell_band: ["dumbbell", "dumbbells", "band", "resistance_band"],
  rower_dumbbells: ["rower", "dumbbell", "dumbbells"]
});

function numeric(value) {
  return Number.parseInt(value, 10);
}

function nutritionGoal(goal) {
  return goal === "health" ? "performance" : goal;
}

function evidenceFor(confidence) {
  const dimensions = Object.fromEntries(CROSSFIT_CLASSIFICATION_DIMENSIONS.map((dimension) => [
    dimension,
    { observed_at: "2026-07-15T10:00:00.000Z" }
  ]));
  if (confidence === "low") {
    return { dimensions, comparable_sessions: 0, technique_verified: false };
  }
  if (confidence === "medium") {
    return { dimensions, comparable_sessions: 3, technique_verified: false };
  }
  return {
    dimensions,
    comparable_sessions: 6,
    comparable_exposures_per_dimension: 3,
    technique_verified: true,
    weeks_in_level: 12
  };
}

function scoresFor(row) {
  const base = row.expected_level === "advanced" ? 3 : row.expected_level === "intermediate" ? 2 : 1;
  const scores = Object.fromEntries(CROSSFIT_CLASSIFICATION_DIMENSIONS.map((dimension) => [dimension, base]));
  if (row.profile_id === "QA-X01") {
    scores.strength = 1;
    scores.aerobic = 3;
    scores.gymnastics = 3;
  }
  if (row.profile_id === "QA-X02") {
    for (const dimension of CROSSFIT_CLASSIFICATION_DIMENSIONS) scores[dimension] = 3;
  }
  return scores;
}

function pauseDays(row) {
  if (row.safety_state === "return_21d") return 21;
  if (row.safety_state === "return_60d") return 60;
  return 0;
}

function classifyProfile(row) {
  return classifyCrossfitLevel({
    dimension_scores: scoresFor(row),
    evidence: evidenceFor(row.confidence),
    adherence_rate: 0.9,
    pause_days: pauseDays(row),
    years_training: row.profile_id === "QA-X02" ? 8 : null,
    skill_permissions: fullSkillPermissions,
    now
  });
}

function safetyScenario(row) {
  const profile = { available_equipment: EQUIPMENT[row.equipment] ?? [] };
  const checkIn = {};
  switch (row.safety_state) {
    case "lower_limb_pain2":
      checkIn.pain = { score: 2, locations: ["knee"], delta: 0, quality: "stable" };
      break;
    case "return_21d":
      profile.pause_days = 21;
      break;
    case "return_60d":
      profile.pause_days = 60;
      break;
    case "obesity_modifier":
      profile.obesity_declared = true;
      break;
    case "red_flag_chest_pain":
      checkIn.red_flags = ["dolor torácico"];
      break;
    case "shoulder_pain3":
      checkIn.pain = { score: 3, locations: ["shoulder"], delta: 0, quality: "stable" };
      break;
    case "hypertension_known_no_symptoms":
      profile.known_conditions = ["hypertension"];
      profile.safety_screening = { clearance_status: "cleared" };
      break;
    case "pain1_stable":
      checkIn.pain = { score: 1, locations: ["knee"], delta: 0, quality: "stable" };
      break;
    case "pregnant_unknown_contract":
      profile.pregnancy_status = "pregnant";
      break;
    case "postpartum_cleared_text_only":
      profile.postpartum_status = "postpartum";
      break;
    case "acute_calf_swelling":
      checkIn.red_flag = true;
      checkIn.red_flags = ["acute calf swelling"];
      break;
    default:
      break;
  }
  return { profile, checkIn };
}

function nutritionSafetyContext(row) {
  if (row.safety_state === "pregnant_unknown_contract") return { pregnant: true };
  if (row.safety_state === "postpartum_cleared_text_only") return { postpartum: true };
  if (row.safety_state === "REDS_signals") return { suspected_low_energy_availability: true };
  if (row.safety_state === "hypertension_known_no_symptoms") return { cardiovascular_disease: true };
  return {};
}

function expectedSafetyDecision(row) {
  if ([
    "red_flag_chest_pain",
    "pregnant_unknown_contract",
    "postpartum_cleared_text_only",
    "acute_calf_swelling"
  ].includes(row.safety_state)) return "block";
  if ([
    "return_21d",
    "return_60d",
    "obesity_modifier",
    "shoulder_pain3"
  ].includes(row.safety_state)) return "modify";
  return "allow";
}

function profilePlan(row, {
  skillPermissions = fullSkillPermissions,
  dimensionScores = scoresFor(row)
} = {}) {
  const classification = classifyProfile(row);
  const { profile, checkIn } = safetyScenario(row);
  return generateCrossfitPlanV2({
    request_id: `req_${row.profile_id}`,
    idempotency_key: `idem_${row.profile_id}`,
    user_id: `usr_${row.profile_id}`,
    classification_id: classification.classification_id,
    seed: `seed_${row.profile_id}`,
    generated_at: now.toISOString(),
    start_date: "2026-07-27",
    level: row.expected_level,
    frequency: numeric(row.days),
    available_minutes: numeric(row.time_min),
    catalog,
    profile,
    check_in: checkIn,
    skill_permissions: skillPermissions,
    dimension_scores: dimensionScores,
    return_protocol: classification.return_protocol
  });
}

function selectedCatalogMovements(plan) {
  return plan.weeks.flatMap((week) => week.sessions)
    .flatMap((session) => session.wod.movements)
    .map((movement) => catalogById.get(movement.canonical_movement_id));
}

function autoregEvent(index, overrides = {}) {
  return {
    result_id: `cfr_profile_${index}`,
    recorded_at: `2026-07-0${index + 1}T10:00:00.000Z`,
    status: "completed",
    completion: 1,
    rpe: 7,
    technique: 3,
    pain: { score: 0, locations: [], delta: 0, red_flag: false, acute_injury: false },
    readiness: { sleep: 4, fatigue: 2, recovery: 4, stress: 2 },
    provenance: { adherence_rate: 0.9, domain: "mixed" },
    ...overrides
  };
}

function reduceProfileEvents(events) {
  return reduceCrossfitAutoreg({
    events,
    user_id: "usr_profiles",
    plan_id: "cfp_profiles",
    source_event_id: events.at(-1).result_id,
    request_id: "req_profiles",
    processed_at: "2026-07-05T10:00:00.000Z"
  });
}

function trainingLoad(level, dayType, { hoursToNext = 24, duration = null } = {}) {
  const result = buildCrossfitPlannedTrainingLoad({
    level,
    sessionType: dayType === "D0" ? "recovery" : "mixed",
    dayType,
    loadTier: dayType === "D0" ? "rest" : dayType === "D2" ? "high" : "moderate",
    durationMin: duration ?? (dayType === "D0" ? 0 : dayType === "D2" ? 75 : 50),
    rpeTarget: dayType === "D0" ? null : dayType === "D2" ? 8.5 : 7,
    recovery: { hours_to_next_session: hoursToNext },
    environment: {},
    context: {},
    ruleIds: ["QA-SYNTHETIC-PROFILE"]
  });
  assert.equal(result.valid, true, result.errors?.join("; "));
  return result.load;
}

function nutritionDay(row, {
  dayType = "D1",
  hoursToNext = 24,
  duration = null,
  mode = "shadow",
  sessionTime = null
} = {}) {
  return resolveCrossfitNutritionDay({
    userId: 7,
    planId: 11,
    dayId: 13,
    requestId: `nutrition_${row.profile_id}`,
    level: row.expected_level,
    goal: nutritionGoal(row.goal),
    baseMacros: { protein_g: 150, carbs_g: 350, fat_g: 70 },
    kcalTarget: 2630,
    weightKg: 75,
    metabolicProfile: "mixto",
    trainingLoad: trainingLoad(row.expected_level, dayType, { hoursToNext, duration }),
    mode,
    safetyContext: nutritionSafetyContext(row),
    sessionTime
  });
}

test("la matriz documental contiene exactamente 32 perfiles únicos y balanceados", () => {
  assert.equal(profiles.length, 32);
  assert.equal(new Set(profiles.map((row) => row.profile_id)).size, 32);
  assert.deepEqual(
    Object.fromEntries(["beginner", "intermediate", "advanced"].map((level) => [
      level,
      profiles.filter((row) => row.expected_level === level).length
    ])),
    { beginner: 10, intermediate: 13, advanced: 9 }
  );
});

for (const row of profiles) {
  test(`${row.profile_id}: ejecuta clasificación, programación, seguridad, nutrición y oráculo`, () => {
    const classification = classifyProfile(row);
    assert.equal(classification.global_level, row.expected_level);
    assert.equal(classification.confidence, row.confidence);
    assert.equal(classification.elite_eligible, false);
    assert.equal(classification.scale_policy, "per_movement_not_global_level");

    const { profile, checkIn } = safetyScenario(row);
    const safety = evaluateCrossfitSafety({ profile, checkIn, now });
    assert.equal(safety.decision, expectedSafetyDecision(row));
    assert.equal(safety.disclaimer, "screening_only_not_diagnosis_or_treatment");

    const nutritionRules = getCrossfitNutritionRulePack({
      level: row.expected_level,
      goal: nutritionGoal(row.goal)
    });
    assert.ok(nutritionRules);
    assert.equal(nutritionRules.level, row.expected_level);
    const nutritionSafety = evaluateCrossfitNutritionSafety(nutritionSafetyContext(row));

    const block = buildCrossfitProgramBlock({
      level: row.expected_level,
      frequency: numeric(row.days),
      start_date: "2026-07-27",
      available_minutes: numeric(row.time_min),
      return_protocol: classification.return_protocol,
      seed: row.profile_id
    });
    if (row.profile_id === "QA-X02") {
      assert.equal(block.ok, false);
      assert.deepEqual(block.reason_codes, ["FREQUENCY_UNSUPPORTED"]);
    } else if (row.profile_id === "QA-X04") {
      assert.equal(block.ok, false);
      assert.deepEqual(block.reason_codes, ["SESSION_TIME_EXCEEDED"]);
    } else {
      assert.equal(block.ok, true);
      assert.equal(block.level, row.expected_level);
      assert.equal(block.frequency, numeric(row.days));
      assert.equal(block.doubles_allowed, false);
      assert.equal(block.elite_in_scope, false);
      assert.ok(block.session_minutes <= numeric(row.time_min));
      assert.ok(block.weeks.every((week) =>
        week.sessions.filter((session) => session.training_load_class === "D2").length <= block.quotas.d2_max
      ));
    }

    switch (row.primary_oracle) {
      case "cap_beginner_no_high_skill": {
        assert.equal(classification.global_level, "beginner");
        assert.ok(classification.reason_codes.includes("LEVEL_CONFIDENCE_LOW"));
        if (block.ok) assert.equal(block.quotas.high_skill_max, 0);
        break;
      }
      case "valid_8week_plan":
        assert.equal(block.block_weeks, 8);
        assert.equal(block.weeks.length, 8);
        break;
      case "no_locked_gymnastics": {
        const generated = profilePlan(row, { skillPermissions: gymnasticsLockedPermissions });
        assert.equal(generated.ok, true, JSON.stringify(generated.reason_codes ?? generated.validation));
        assert.ok(selectedCatalogMovements(generated.plan).every((movement) =>
          movement.skill_prerequisites.every((key) => gymnasticsLockedPermissions[key] !== false)
        ));
        break;
      }
      case "no_impact": {
        const generated = profilePlan(row);
        assert.equal(generated.ok, true, JSON.stringify(generated.reason_codes ?? generated.validation));
        assert.ok(selectedCatalogMovements(generated.plan)
          .every((movement) => !movement.pairing_tags.some((tag) => tag.includes("impact"))));
        break;
      }
      case "volume_minus20":
        assert.equal(classification.return_protocol.volume_reduction, 0.2);
        assert.equal(block.weeks[0].volume_multiplier, 0.56);
        assert.ok(block.weeks[0].sessions.every((session) => session.training_load_class !== "D2"));
        break;
      case "volume_minus50_reclassify":
        assert.equal(classification.return_protocol.volume_reduction, 0.5);
        assert.equal(classification.return_protocol.requires_reassessment, true);
        assert.equal(block.weeks[0].volume_multiplier, 0.35);
        break;
      case "low_impact_not_blocked":
        assert.equal(safety.blocked, false);
        assert.equal(safety.decision, "modify");
        break;
      case "blocked_no_session":
      case "red_flag_block":
        assert.equal(safety.blocked, true);
        assert.ok(safety.reason_codes.includes("SAFETY_RED_FLAG"));
        break;
      case "three_day_quota_14d":
        assert.equal(block.quotas.quota_window_days, 14);
        assert.equal(block.frequency, 3);
        break;
      case "skill_cap_preserved":
        assert.equal(block.quotas.high_skill_max, 1);
        assert.ok(block.weeks.every((week) => week.new_skills_max <= 1));
        break;
      case "no_barbell_or_rings": {
        const generated = profilePlan(row);
        assert.equal(generated.ok, true, JSON.stringify(generated.reason_codes ?? generated.validation));
        assert.ok(selectedCatalogMovements(generated.plan).every((movement) =>
          movement.equipment.every((required) => {
            const alternatives = required.split("_or_");
            return required === "none"
              || required.endsWith("_optional")
              || alternatives.some((item) => safetyScenario(row).profile.available_equipment.includes(item));
          })
        ));
        break;
      }
      case "no_overhead_kipping": {
        const generated = profilePlan(row);
        assert.equal(generated.ok, true, JSON.stringify(generated.reason_codes ?? generated.validation));
        const contraindicated = new Set(["SHOULDER_WRIST", "WRIST_SHOULDER", "UPPER_LIMB"]);
        assert.ok(selectedCatalogMovements(generated.plan)
          .every((movement) => !movement.contraindication_keys.some((key) => contraindicated.has(key))));
        break;
      }
      case "deload_and_review_energy": {
        const events = [0, 1, 2].map((index) => autoregEvent(index, {
          rpe: index < 2 ? 9 : 8,
          readiness: { sleep: 3, fatigue: 4, recovery: 3, stress: 3 },
          provenance: { adherence_rate: 0.9, domain: "mixed", readiness_cut: index > 0 }
        }));
        const autoreg = reduceProfileEvents(events);
        assert.equal(autoreg.state, "deload");
        assert.deepEqual(nutritionRules.energy_rule.relative_range, [-0.2, -0.1]);
        break;
      }
      case "energy_and_carb_D1_D2":
        assert.deepEqual(nutritionRules.energy_rule.relative_range, [0.05, 0.1]);
        assert.ok(nutritionRules.carb_gkg_by_day.D2[0] > nutritionRules.carb_gkg_by_day.D1[0]);
        break;
      case "hold_comparability": {
        const autoreg = reduceProfileEvents([
          autoregEvent(0, {
            provenance: { adherence_rate: 0.9, domain: "mixed", equipment_signature_changed: true }
          })
        ]);
        assert.equal(autoreg.state, "hold");
        assert.ok(autoreg.reason_codes.includes("AUTOREG_EQUIPMENT_CHANGE"));
        break;
      }
      case "clearance_rule_no_sodium_dose":
        assert.equal(safety.blocked, false);
        assert.equal(nutritionSafety.electrolyte_dose_allowed, false);
        assert.ok(nutritionSafety.reason_codes.includes("NUTR_CF_HYDRATION_PERSONALIZE"));
        break;
      case "advanced_four_day_not_elite":
        assert.equal(block.level, "advanced");
        assert.equal(block.frequency, 4);
        assert.equal(block.elite_in_scope, false);
        break;
      case "max_three_D2":
        assert.equal(block.quotas.d2_max, 3);
        assert.ok(block.weeks.every((week) =>
          week.sessions.filter((session) => session.training_load_class === "D2").length <= 3
        ));
        break;
      case "high_skill_only_permissions": {
        const generated = profilePlan(row, { skillPermissions: noSkillPermissions });
        assert.equal(generated.ok, true, JSON.stringify(generated.reason_codes ?? generated.validation));
        assert.ok(selectedCatalogMovements(generated.plan)
          .every((movement) => movement.skill_prerequisites.length === 0));
        break;
      }
      case "no_progress_pain_pattern": {
        const events = [0, 1, 2].map((index) => autoregEvent(index, {
          pain: {
            score: 1,
            locations: ["knee"],
            delta: 0,
            quality: "stable",
            red_flag: false,
            acute_injury: false
          }
        }));
        const autoreg = reduceProfileEvents(events);
        assert.notEqual(autoreg.state, "progress_capacity");
        assert.notEqual(autoreg.state, "progress_skill");
        break;
      }
      case "deload_if_second_signal": {
        const sleepEvents = [0, 1, 2].map((index) => autoregEvent(index, {
          readiness: { sleep: 2, fatigue: 3, recovery: 4, stress: 3 }
        }));
        assert.equal(reduceProfileEvents(sleepEvents).state, "hold");
        sleepEvents[2].provenance.srpe_ratio_7_28 = 1.3;
        assert.equal(reduceProfileEvents(sleepEvents).state, "deload");
        break;
      }
      case "one_D1_plus_one_session_6h": {
        const day = nutritionDay(row, { dayType: "D2", hoursToNext: 6, duration: 75 });
        assert.deepEqual(day.contract.timing.post.rapid_recovery_carbs_gkg, [0.8, 1.2]);
        assert.equal(block.doubles_allowed, false);
        break;
      }
      case "blocked_clinical_contract":
      case "blocked_until_structured_contract":
        assert.equal(safety.blocked, true);
        assert.ok(safety.reason_codes.includes("SAFETY_CLEARANCE_REQUIRED"));
        assert.equal(nutritionSafety.authoritative_allowed, false);
        break;
      case "global_intermediate_strength_dose_beginner": {
        assert.equal(classification.global_level, "intermediate");
        assert.equal(classification.dimension_scores.strength, 1);
        assert.ok(classification.reason_codes.includes("LEVEL_ASYMMETRIC"));
        const generated = profilePlan(row);
        assert.equal(generated.ok, true, JSON.stringify(generated.reason_codes ?? generated.validation));
        const blocks = generated.plan.weeks.flatMap((week) => week.sessions)
          .flatMap((session) => session.blocks);
        assert.ok(blocks.every((sessionBlock) => sessionBlock.capacity_level === "beginner"));
        assert.ok(blocks.every((sessionBlock) => sessionBlock.target_rpe[1] <= 7));
        break;
      }
      case "confidence_caps_beginner":
        assert.equal(classification.global_level, "beginner");
        assert.equal(classification.confidence, "low");
        assert.equal(classification.elite_eligible, false);
        break;
      case "frequency_or_time_unsupported_safe_offer":
        assert.equal(block.ok, false);
        assert.deepEqual(block.reason_codes, ["SESSION_TIME_EXCEEDED"]);
        assert.deepEqual(getCrossfitProgramRules("beginner").frequencies, [2, 3]);
        break;
      case "stop_deficit_refer": {
        const day = nutritionDay(row, { dayType: "D2", mode: "active" });
        assert.equal(day.contract.mode, "shadow");
        assert.equal(day.safety.deficit_allowed, false);
        assert.equal(day.safety.professional_referral, true);
        assert.ok(day.contract.reason_codes.includes("NUTR_CF_REDS_RISK"));
        break;
      }
      case "allergy_hard_filter_menu_sync": {
        const filters = buildFoodFiltersFromUserPreferences({
          alergias: ["soja", "gluten"],
          preferencias: {}
        });
        assert.equal(matchesFoodFilters({
          nombre: "Tofu",
          tags: ["proteina"],
          is_vegan: true,
          is_vegetarian: true
        }, filters), false);
        assert.equal(matchesFoodFilters({
          nombre: "Arroz",
          tags: ["sin gluten"],
          is_vegan: true,
          is_vegetarian: true
        }, filters), true);
        break;
      }
      case "protein_range_food_constraints": {
        const filters = buildFoodFiltersFromUserPreferences({
          alergias: [],
          preferencias: { vegano: true }
        });
        assert.equal(filters.diet, "vegano");
        assert.equal(matchesFoodFilters({
          nombre: "Pollo",
          tags: ["proteina"],
          is_vegan: false,
          is_vegetarian: false
        }, filters), false);
        assert.equal(matchesFoodFilters({
          nombre: "Tempeh",
          tags: ["proteina"],
          is_vegan: true,
          is_vegetarian: true
        }, filters), true);
        assert.ok(nutritionRules.protein_gkg[0] >= 1.6);
        break;
      }
      case "timing_without_sleep_disruption": {
        const day = nutritionDay(row, { dayType: "D1", sessionTime: "late" });
        assert.equal(day.contract.timing.pre.digestibility, "lighter_pre_and_digestible_post");
        break;
      }
      default:
        assert.fail(`Oráculo sintético sin ejecución: ${row.primary_oracle}`);
    }
  });
}
