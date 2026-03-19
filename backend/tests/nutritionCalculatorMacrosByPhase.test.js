import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateMacros,
  generateNutritionPlan,
  generateNutritionPlanWithKcalOverride
} from "../services/nutritionCalculator.js";
import { MACRO_RULESET_VERSION } from "../services/macroProfilePhaseResolver.js";

const BASE_PROFILE = {
  sexo: "hombre",
  edad: 32,
  altura_cm: 178,
  peso_kg: 80,
  objetivo: "mant",
  actividad: "activo",
  comidas_dia: 4,
  training_type: "hipertrofia",
  metabolic_type: "tolerante",
  metabolic_confidence: "alta",
  level: "intermedio",
  steps_per_day: 9000,
  training_days: 4
};

test("nutritionCalculator: generateNutritionPlan cambia macros entre cut, mant y bulk", () => {
  const cutPlan = generateNutritionPlan({ ...BASE_PROFILE, objetivo: "cut" }, 3, [true, false, true]);
  const mantPlan = generateNutritionPlan({ ...BASE_PROFILE, objetivo: "mant" }, 3, [true, false, true]);
  const bulkPlan = generateNutritionPlan({ ...BASE_PROFILE, objetivo: "bulk" }, 3, [true, false, true]);

  assert.deepEqual(cutPlan.macros_objetivo.template_pct, { protein_pct: 28, carbs_pct: 47, fat_pct: 25 });
  assert.deepEqual(mantPlan.macros_objetivo.template_pct, { protein_pct: 25, carbs_pct: 55, fat_pct: 20 });
  assert.deepEqual(bulkPlan.macros_objetivo.template_pct, { protein_pct: 23, carbs_pct: 57, fat_pct: 20 });

  assert.notDeepEqual(cutPlan.macros_objetivo.final_pct, mantPlan.macros_objetivo.final_pct);
  assert.notDeepEqual(mantPlan.macros_objetivo.final_pct, bulkPlan.macros_objetivo.final_pct);
});

test("nutritionCalculator: override de kcal conserva perfil metabólico y ruleset", () => {
  const overridePlan = generateNutritionPlanWithKcalOverride(
    {
      ...BASE_PROFILE,
      objetivo: "bulk",
      metabolic_type: "intolerante",
      metabolic_confidence: "alta"
    },
    2,
    [true, false],
    2400
  );

  assert.equal(overridePlan.version_reglas, MACRO_RULESET_VERSION);
  assert.equal(overridePlan.macros_objetivo.applied_profile, "intolerante");
  assert.equal(overridePlan.macros_objetivo.applied_phase, "bulk");
  assert.deepEqual(overridePlan.macros_objetivo.template_pct, {
    protein_pct: 25,
    carbs_pct: 35,
    fat_pct: 40
  });
});

test("nutritionCalculator: añade audit trail de macros y versionado v2", () => {
  const plan = generateNutritionPlan({ ...BASE_PROFILE, objetivo: "mant" }, 2, [true, false]);
  const directMacros = calculateMacros(2400, 80, "hipertrofia", "cut", "mixto", "media", "intermedio");

  assert.equal(plan.version_reglas, MACRO_RULESET_VERSION);
  assert.ok(plan.calculation_audit?.macros);
  assert.equal(plan.calculation_audit.macros.ruleset, MACRO_RULESET_VERSION);
  assert.equal(plan.calculation_audit.macros.applied_profile, "tolerante");
  assert.equal(plan.calculation_audit.macros.applied_phase, "mant");

  assert.equal(directMacros.ruleset, MACRO_RULESET_VERSION);
  assert.deepEqual(directMacros.template_pct, { protein_pct: 28, carbs_pct: 32, fat_pct: 40 });
});
