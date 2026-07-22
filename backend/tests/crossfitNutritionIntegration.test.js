import test from "node:test";
import assert from "node:assert/strict";
import {
  methodologyEmitsTrainingLoad,
  resolveMethodologyNutritionPeriodizationMode
} from "../services/routineGeneration/methodologies/methodologyRegistry.js";
import {
  evaluateCrossfitNutritionSafety,
  getCrossfitNutritionRulePack,
  normalizeCrossfitNutritionGoal,
  resolveCrossfitNutritionDay
} from "../services/crossfit/nutrition/nutritionAdapter.js";
import {
  CROSSFIT_NUTRITION_PLAN_DAYS_SQL,
  loadCrossfitNutritionPlanDays,
  resolveCrossfitNutritionPlanDay
} from "../services/crossfit/nutrition/planDayRepository.js";
import {
  CROSSFIT_NUTRITION_SAFETY_CONTEXT_SQL,
  deriveCrossfitNutritionSafetyContext,
  loadCrossfitNutritionSafetyContext
} from "../services/crossfit/nutrition/safetyContextRepository.js";
import { buildCrossfitPlannedTrainingLoad } from "../services/crossfit/trainingLoadAdapter.js";
import { validateCrossfitNutrition } from "../services/crossfit/contracts/index.js";
import {
  buildSessionCompletedEvent
} from "../services/bridgeEventOutboxService.js";
import { handleSessionCompletedEvent } from "../jobs/processBridgeEventOutbox.js";

const LEVELS = ["beginner", "intermediate", "advanced"];
const GOALS = ["performance", "recomposition", "fat_loss", "mass_gain"];
const DAY_TYPES = ["D0", "D1", "D2"];

function trainingLoad(level, dayType) {
  const result = buildCrossfitPlannedTrainingLoad({
    level,
    sessionType: dayType === "D0" ? "recovery" : "mixed",
    dayType,
    loadTier: dayType === "D0" ? "rest" : dayType === "D2" ? "high" : "moderate",
    durationMin: dayType === "D0" ? 0 : dayType === "D2" ? 75 : 45,
    rpeTarget: dayType === "D0" ? null : dayType === "D2" ? 8.5 : 7,
    recovery: { hours_to_next_session: 24 },
    environment: {},
    context: {},
    ruleIds: ["test"]
  });
  assert.equal(result.valid, true, result.errors?.join("; "));
  return result.load;
}

function energy(macros) {
  return macros.protein_g * 4 + macros.carbs_g * 4 + macros.fat_g * 9;
}

test("flags CrossFit: default seguro y secuencia legacy -> shadow -> active", () => {
  assert.equal(methodologyEmitsTrainingLoad("crossfit", {}), false);
  assert.equal(resolveMethodologyNutritionPeriodizationMode("crossfit", "active", {}), "legacy");

  const loadShadow = { CROSSFIT_EMITS_TRAINING_LOAD: "true" };
  assert.equal(methodologyEmitsTrainingLoad("crossfit", loadShadow), true);
  assert.equal(resolveMethodologyNutritionPeriodizationMode("crossfit", "shadow", loadShadow), "shadow");
  assert.equal(resolveMethodologyNutritionPeriodizationMode("crossfit", "active", loadShadow), "shadow");

  const active = { ...loadShadow, CROSSFIT_NUTRITION_LOAD: "true" };
  assert.equal(resolveMethodologyNutritionPeriodizationMode("crossfit", "active", active), "active");
  assert.equal(resolveMethodologyNutritionPeriodizationMode("desconocida", "active", active), "legacy");
  assert.equal(methodologyEmitsTrainingLoad("calistenia", active), false);
});

test("matriz CrossFit: 3 niveles x 4 objetivos x D0/D1/D2 produce contratos estrictos", () => {
  const baseMacros = { protein_g: 150, carbs_g: 400, fat_g: 60 };
  const baseEnergy = energy(baseMacros);
  let cases = 0;
  for (const level of LEVELS) {
    for (const goal of GOALS) {
      for (const dayType of DAY_TYPES) {
        const output = resolveCrossfitNutritionDay({
          userId: 7,
          planId: 11,
          dayId: cases + 1,
          requestId: `nutrition-case-${cases}`,
          level,
          goal,
          baseMacros,
          kcalTarget: baseEnergy,
          weightKg: 75,
          metabolicProfile: "mixto",
          trainingLoad: trainingLoad(level, dayType),
          mode: "shadow"
        });
        assert.equal(validateCrossfitNutrition(output.contract).valid, true);
        assert.equal(output.contract.level, level);
        assert.equal(output.contract.goal, goal);
        assert.equal(output.contract.day_type, dayType);
        assert.equal(output.resolved.macros.protein_g, baseMacros.protein_g);
        assert.ok(
          Math.abs(output.resolved.macros.kcal - baseEnergy) / baseEnergy <= 0.01,
          `${level}/${goal}/${dayType} deriva más de 1%`
        );
        assert.ok(output.contract.reason_codes.includes(`NUTR_CF_${dayType}`));
        cases += 1;
      }
    }
  }
  assert.equal(cases, 36);
});

test("nivel no fija calorías y los aliases de objetivo se normalizan", () => {
  assert.equal(normalizeCrossfitNutritionGoal("cut"), "fat_loss");
  assert.equal(normalizeCrossfitNutritionGoal("bulk"), "mass_gain");
  assert.equal(normalizeCrossfitNutritionGoal("mant"), "performance");
  assert.equal(normalizeCrossfitNutritionGoal("desconocido"), null);
  const baseMacros = { protein_g: 150, carbs_g: 400, fat_g: 60 };
  const expectedEnergy = energy(baseMacros);
  const energies = LEVELS.map((level, index) => resolveCrossfitNutritionDay({
    userId: 1,
    planId: 2,
    dayId: index + 1,
    requestId: `same-energy-${level}`,
    level,
    goal: "mant",
    baseMacros,
    kcalTarget: expectedEnergy,
    weightKg: 75,
    trainingLoad: trainingLoad(level, "D1"),
    mode: "shadow"
  }).resolved.macros.kcal);
  assert.ok(energies.every((value) => Math.abs(value - expectedEnergy) / expectedEnergy <= 0.01));
});

test("seguridad nutricional: RED-S, embarazo y cardiovascular prevalecen sobre active", () => {
  const safety = evaluateCrossfitNutritionSafety({
    pregnant: true,
    suspected_low_energy_availability: true,
    renal_disease: true
  });
  assert.equal(safety.authoritative_allowed, false);
  assert.equal(safety.deficit_allowed, false);
  assert.equal(safety.electrolyte_dose_allowed, false);

  const output = resolveCrossfitNutritionDay({
    userId: 1,
    planId: 2,
    dayId: 3,
    requestId: "safety-case",
    level: "intermediate",
    goal: "cut",
    baseMacros: { protein_g: 150, carbs_g: 350, fat_g: 70 },
    kcalTarget: 2630,
    weightKg: 75,
    trainingLoad: trainingLoad("intermediate", "D2"),
    mode: "active",
    safetyContext: {
      pregnant: true,
      suspected_low_energy_availability: true,
      renal_disease: true
    }
  });
  assert.equal(output.contract.mode, "shadow");
  assert.equal(output.authoritative_allowed, false);
  assert.ok(output.contract.reason_codes.includes("NUTR_CF_REDS_RISK"));
  assert.ok(output.contract.reason_codes.includes("NUTR_CF_HYDRATION_PERSONALIZE"));
  assert.equal(output.contract.hydration.sodium_mg_per_hour, null);
});

test("seguridad nutricional reutiliza perfil canónico y flags sin leer documentos clínicos", async () => {
  const row = {
    historial_medico: "Hipertensión no controlada y mareos. Enfermedad renal.",
    limitaciones_fisicas: ["Posparto"],
    medicamentos: ["Diurético"],
    nutrition_flags: [{ flag: "energy_warning" }, { name: "fatigue_accumulated" }]
  };
  const context = deriveCrossfitNutritionSafetyContext(row);
  assert.equal(context.postpartum, true);
  assert.equal(context.suspected_low_energy_availability, true);
  assert.equal(context.renal_disease, true);
  assert.equal(context.uncontrolled_hypertension, true);
  assert.equal(context.symptomatic_cardiovascular, true);
  assert.equal(context.electrolyte_affecting_medication, true);

  const db = {
    async query(sql, params) {
      assert.equal(sql, CROSSFIT_NUTRITION_SAFETY_CONTEXT_SQL);
      assert.deepEqual(params, [7]);
      return { rows: [row] };
    }
  };
  assert.deepEqual(await loadCrossfitNutritionSafetyContext(db, 7), context);
  assert.doesNotMatch(CROSSFIT_NUTRITION_SAFETY_CONTEXT_SQL, /historial_medico_docs|medical_docs/);

  const isolatedSignal = deriveCrossfitNutritionSafetyContext({
    historial_medico: "No embarazada. Sin enfermedad cardiovascular.",
    nutrition_flags: [{ flag: "energy_warning" }]
  });
  assert.equal(isolatedSignal.pregnant, false);
  assert.equal(isolatedSignal.cardiovascular_disease, false);
  assert.equal(isolatedSignal.suspected_low_energy_availability, false);
});

test("ruleset nutricional conserva rangos por nivel y objetivo", () => {
  const advancedCut = getCrossfitNutritionRulePack({ level: "advanced", goal: "fat_loss" });
  assert.deepEqual(advancedCut.protein_gkg, [2, 2.4]);
  assert.deepEqual(advancedCut.carb_gkg_by_day.D2, [5.5, 8]);
  assert.equal(advancedCut.fat_floor_gkg, 0.8);
  assert.equal(advancedCut.fat_floor_percentage, 0.2);
});

test("repositorio de días incluye descansos, identidad y fallback D1 conservador", async () => {
  assert.match(CROSSFIT_NUTRITION_PLAN_DAYS_SQL, /methodology_plan_days/);
  assert.match(CROSSFIT_NUTRITION_PLAN_DAYS_SQL, /LOWER\(mp\.methodology_type\) = 'crossfit'/);
  const rest = resolveCrossfitNutritionPlanDay({
    plan_id: 8,
    day_id: 1,
    date_local: "2026-07-22",
    is_rest: true
  }, { level: "beginner" });
  assert.equal(rest.usable, true);
  assert.equal(rest.training_load.day_type, "D0");

  const fallback = resolveCrossfitNutritionPlanDay({
    plan_id: 8,
    day_id: 2,
    date_local: "2026-07-23",
    is_rest: false,
    metadata: {}
  }, { level: "beginner" });
  assert.equal(fallback.degraded, true);
  assert.equal(fallback.training_load.day_type, "D1");
  assert.equal(fallback.training_load.provenance.confidence, "low");

  const db = {
    async query(sql, params) {
      assert.equal(sql, CROSSFIT_NUTRITION_PLAN_DAYS_SQL);
      assert.deepEqual(params, [8, 4, "2026-07-22", "2026-07-23"]);
      return { rows: [
        { plan_id: 8, day_id: 1, date_local: "2026-07-22", is_rest: true },
        { plan_id: 8, day_id: 2, date_local: "2026-07-23", is_rest: false, metadata: {} }
      ] };
    }
  };
  const days = await loadCrossfitNutritionPlanDays(db, {
    planId: 8,
    userId: 4,
    startDate: "2026-07-22",
    endDate: "2026-07-23",
    level: "beginner"
  });
  assert.equal(days.size, 2);
  assert.equal(days.get("2026-07-23").day_id, 2);
});

test("outbox CrossFit transporta day_id y aplica rollout en shadow", async () => {
  const event = buildSessionCompletedEvent({
    sessionId: 90,
    userId: 7,
    methodologyPlanId: 11,
    dayId: 3,
    methodologyId: "crossfit",
    methodologyLevel: "intermedio",
    actualSessionLoad: trainingLoad("intermediate", "D2")
  });
  assert.equal(event.payload.day_id, 3);
  let decision = null;
  const result = await handleSessionCompletedEvent({}, event, {
    env: {
      CROSSFIT_EMITS_TRAINING_LOAD: "true",
      NUTRITION_LOAD_PERIODIZATION_MODE: "active"
    },
    hasNutritionProfile: async () => true,
    logBridgeDecision: async (_client, input) => {
      decision = input;
      return 91;
    }
  });
  assert.equal(result.status, "completed");
  assert.equal(decision.trainingInputs.day_id, 3);
  assert.equal(decision.decisionDetails.crossfit_nutrition_mode, "shadow");
  assert.deepEqual(decision.decisionDetails.reason_codes, ["NUTR_CF_D2"]);

  const disabled = await handleSessionCompletedEvent({}, event, {
    env: {},
    hasNutritionProfile: async () => true
  });
  assert.deepEqual(disabled, {
    status: "skipped",
    reason: "CROSSFIT_EMITS_TRAINING_LOAD_DISABLED"
  });
});
