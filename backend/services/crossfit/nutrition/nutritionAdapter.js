import { resolveDayNutritionTargets } from "../../nutritionPeriodizationService.js";
import { classifyDayType, validateTrainingLoad } from "../../trainingLoad/trainingLoadContract.js";
import { assertCrossfitContract, validateCrossfitNutrition } from "../contracts/index.js";
import { CROSSFIT_LEVELS, CROSSFIT_VERSIONS, normalizeCrossfitLevel } from "../versions.js";

const GOAL_ALIASES = Object.freeze({
  performance: "performance",
  rendimiento: "performance",
  mant: "performance",
  maintenance: "performance",
  recomposition: "recomposition",
  recomposicion: "recomposition",
  fat_loss: "fat_loss",
  cut: "fat_loss",
  perder_peso: "fat_loss",
  mass_gain: "mass_gain",
  bulk: "mass_gain",
  ganar_musculo: "mass_gain"
});

const CARB_GKG_BY_LEVEL = Object.freeze({
  beginner: Object.freeze({ D0: [2, 3], D1: [3, 4], D2: [4, 5] }),
  intermediate: Object.freeze({ D0: [2.5, 3.5], D1: [3.5, 5], D2: [5, 7] }),
  advanced: Object.freeze({ D0: [3, 4], D1: [4, 6], D2: [5.5, 8] })
});

const BASE_PROTEIN_GKG = Object.freeze({
  beginner: [1.6, 1.8],
  intermediate: [1.6, 2],
  advanced: [1.8, 2.2]
});

const ENERGY_RULE_BY_GOAL = Object.freeze({
  performance: { relative_range: [0, 0.05], review_weeks: [1, 2] },
  recomposition: { relative_range: [-0.05, 0.05], review_weeks: [2, 3] },
  fat_loss: { relative_range: [-0.2, -0.1], weekly_weight_rate: [-0.0075, -0.0025] },
  mass_gain: { relative_range: [0.05, 0.1], weekly_weight_rate: [0.001, 0.003] }
});

function normalizeKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function normalizeCrossfitNutritionGoal(value) {
  return GOAL_ALIASES[normalizeKey(value)] ?? null;
}

export function getCrossfitNutritionRulePack({ level, goal } = {}) {
  const normalizedLevel = normalizeCrossfitLevel(level);
  const normalizedGoal = normalizeCrossfitNutritionGoal(goal);
  if (!CROSSFIT_LEVELS.includes(normalizedLevel) || !normalizedGoal) return null;

  let proteinRange = BASE_PROTEIN_GKG[normalizedLevel];
  if (normalizedGoal === "recomposition") proteinRange = [1.8, 2.2];
  if (normalizedGoal === "fat_loss") {
    proteinRange = normalizedLevel === "advanced" ? [2, 2.4] : [1.8, 2.4];
  }

  return Object.freeze({
    version: CROSSFIT_VERSIONS.nutrition,
    level: normalizedLevel,
    goal: normalizedGoal,
    protein_gkg: Object.freeze([...proteinRange]),
    carb_gkg_by_day: CARB_GKG_BY_LEVEL[normalizedLevel],
    fat_floor_gkg: 0.8,
    fat_floor_percentage: 0.2,
    energy_rule: ENERGY_RULE_BY_GOAL[normalizedGoal],
    reason_code: "NUTR_CF_D1",
    constraint_reason_code: "NUTR_CF_MACRO_CONSTRAINT"
  });
}

function hasAnyTrue(source, keys) {
  return keys.some((key) => source?.[key] === true);
}

export function evaluateCrossfitNutritionSafety(safetyContext = {}) {
  const rapidLoss = Number(safetyContext.rapid_weight_loss_percent_week);
  const lowEnergyRisk = hasAnyTrue(safetyContext, [
    "suspected_low_energy_availability",
    "eating_disorder_risk",
    "amenorrhea_reported",
    "stress_injury",
    "persistent_cold_hunger_fatigue"
  ]) || (Number.isFinite(rapidLoss) && rapidLoss > 1);
  const pregnancyBlock = hasAnyTrue(safetyContext, ["pregnant", "postpartum"]);
  const cardiovascularBlock = safetyContext.symptomatic_cardiovascular === true;
  const hydrationPersonalization = cardiovascularBlock || hasAnyTrue(safetyContext, [
    "renal_disease",
    "cardiovascular_disease",
    "uncontrolled_hypertension",
    "electrolyte_affecting_medication"
  ]);
  const reasonCodes = [];
  if (lowEnergyRisk) reasonCodes.push("NUTR_CF_REDS_RISK");
  if (pregnancyBlock || cardiovascularBlock) reasonCodes.push("SAFETY_CLEARANCE_REQUIRED");
  if (hydrationPersonalization) reasonCodes.push("NUTR_CF_HYDRATION_PERSONALIZE");

  return {
    authoritative_allowed: !(lowEnergyRisk || pregnancyBlock || cardiovascularBlock),
    deficit_allowed: !(lowEnergyRisk || pregnancyBlock),
    electrolyte_dose_allowed: !hydrationPersonalization,
    professional_referral: lowEnergyRisk || pregnancyBlock || cardiovascularBlock,
    reason_codes: reasonCodes,
    limits: {
      diagnostic_claims: false,
      pregnancy_postpartum_contract_available: false,
      symptomatic_cardiovascular_contract_available: false
    }
  };
}

function timingFor({ dayType, durationMinutes, hoursToNextSession, sessionTime, weightKg }) {
  const early = String(sessionTime ?? "").toLowerCase() === "early";
  const late = String(sessionTime ?? "").toLowerCase() === "late";
  const duration = Number(durationMinutes);
  const next = Number(hoursToNextSession);
  const pre = dayType === "D2"
    ? { window_hours: [1, 4], carbs_gkg: [1, 2], protein_gkg: [0.25, 0.35] }
    : dayType === "D1"
      ? { window_hours: [1, 3], carbs_gkg: [0.5, 1], protein_gkg: [0.25, 0.35] }
      : { rule: "normal_meal" };
  if (early && dayType !== "D0") pre.early_option_carbs_gkg = [0.3, 0.6];
  if (late && dayType !== "D0") pre.digestibility = "lighter_pre_and_digestible_post";

  let intra = { rule: "water_to_thirst", carbs_g_per_hour: [0, 0] };
  if (dayType === "D2" && Number.isFinite(duration) && duration >= 60 && duration <= 90) {
    intra = { rule: "conditional_if_tolerated", carbs_g_per_hour: [20, 40] };
  } else if (dayType === "D2" && Number.isFinite(duration) && duration > 90) {
    intra = { rule: "professional_review", carbs_g_per_hour: [30, 60] };
  }

  const post = {
    protein_gkg: [0.25, 0.4],
    complete_daily_intake: true,
    rapid_recovery_carbs_gkg: Number.isFinite(next) && next < 8 ? [0.8, 1.2] : null
  };
  return { pre, intra, post, weight_basis_kg: Number(weightKg) || null };
}

function hydrationFor({ weightKg, trainingLoad, safety }) {
  const weight = Number(weightKg);
  const duration = Number(trainingLoad?.duration?.planned_min);
  const hot = trainingLoad?.environment?.heat === true || trainingLoad?.environment?.humidity_high === true;
  const prolonged = Number.isFinite(duration) && duration >= 60;
  return {
    daily_ml_range: Number.isFinite(weight) && weight > 0
      ? [Math.round(weight * 30), Math.round(weight * 35)]
      : null,
    session_rule: "individual_sweat_rate_avoid_weight_gain",
    sodium_mg_per_hour: safety.electrolyte_dose_allowed && (prolonged || hot) ? [300, 600] : null,
    dosing_status: safety.electrolyte_dose_allowed ? "educational_conditional" : "blocked_professional_review"
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function resolveCrossfitNutritionDay({
  userId,
  planId,
  dayId,
  requestId,
  level,
  goal,
  baseMacros,
  kcalTarget,
  weightKg,
  metabolicProfile,
  trainingLoad,
  mode,
  safetyContext = {},
  sessionTime = null
} = {}) {
  const rulePack = getCrossfitNutritionRulePack({ level, goal });
  if (!rulePack) throw new TypeError("Nivel u objetivo nutricional CrossFit no soportado");
  const loadValidation = validateTrainingLoad(trainingLoad, { mode: "strict" });
  if (!loadValidation.valid) {
    const error = new Error(`Carga CrossFit no válida para Nutrición: ${loadValidation.errors.join("; ")}`);
    error.code = "CROSSFIT_NUTRITION_LOAD_INVALID";
    throw error;
  }
  const dayType = classifyDayType(trainingLoad);
  const dayReason = `NUTR_CF_${dayType}`;
  const effectivePack = { ...rulePack, reason_code: dayReason };
  const safety = evaluateCrossfitNutritionSafety(safetyContext);
  const requestedMode = mode === "active" ? "active" : "shadow";
  const effectiveMode = requestedMode === "active" && safety.authoritative_allowed ? "active" : "shadow";
  const resolved = resolveDayNutritionTargets({
    baseMacros,
    kcalTarget,
    weightKg,
    objective: rulePack.goal,
    metabolicProfile,
    sessionLoad: trainingLoad,
    mode: effectiveMode,
    methodologyEmitsLoad: true,
    professionalRulePack: effectivePack
  });
  const reasonCodes = unique([
    dayReason,
    ...(resolved.audit.reason_codes ?? []).filter((code) => code.startsWith("NUTR_CF_")),
    ...safety.reason_codes
  ]);
  const timing = timingFor({
    dayType,
    durationMinutes: trainingLoad.duration?.planned_min,
    hoursToNextSession: trainingLoad.recovery?.hours_to_next_session,
    sessionTime,
    weightKg
  });
  const contract = {
    schema_version: CROSSFIT_VERSIONS.nutrition,
    ruleset_version: CROSSFIT_VERSIONS.ruleset,
    catalog_version: CROSSFIT_VERSIONS.catalog,
    request_id: String(requestId),
    user_id: userId,
    plan_id: planId,
    day_id: dayId,
    level: rulePack.level,
    goal: rulePack.goal,
    day_type: dayType,
    training_load: trainingLoad,
    targets: {
      energy_kcal: resolved.macros.kcal,
      energy_rule: rulePack.energy_rule,
      macros_g: {
        protein: resolved.macros.protein_g,
        carbohydrate: resolved.macros.carbs_g,
        fat: resolved.macros.fat_g
      },
      ranges_gkg: {
        protein: rulePack.protein_gkg,
        carbohydrate: rulePack.carb_gkg_by_day[dayType]
      },
      fat_floor: { gkg: rulePack.fat_floor_gkg, energy_fraction: rulePack.fat_floor_percentage },
      fiber_g: [25, Math.max(25, Math.min(40, Math.round(resolved.macros.kcal / 1000 * 14)))]
    },
    timing,
    hydration: hydrationFor({ weightKg, trainingLoad, safety }),
    mode: effectiveMode,
    reason_codes: reasonCodes,
    decision_trace: [{
      rule_id: `CF-NUTR-${dayType}`,
      reason_code: dayReason,
      scope: "nutrition_day",
      action: effectiveMode === "active" ? "periodize_authoritative" : "periodize_shadow",
      details: {
        requested_mode: requestedMode,
        safety_authoritative_allowed: safety.authoritative_allowed,
        preserves_canonical_energy: true,
        preserves_canonical_protein: true
      }
    }]
  };
  assertCrossfitContract(validateCrossfitNutrition, contract);
  return {
    resolved,
    contract,
    safety,
    authoritative_allowed: effectiveMode === "active" && safety.authoritative_allowed
  };
}
