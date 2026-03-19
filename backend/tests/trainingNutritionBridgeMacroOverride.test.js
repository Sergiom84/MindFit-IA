import test from "node:test";
import assert from "node:assert/strict";

import { getMacroDistributionCatalog, MACRO_RULESET_VERSION } from "../services/macroProfilePhaseResolver.js";
import { calculateBridgeOverrideMacros } from "../services/trainingNutritionBridgeHelpers.js";

test("trainingNutritionBridge: override_kcal mantiene el perfil metabólico del usuario", () => {
  const profile = {
    peso_kg: 80,
    training_type: "hipertrofia",
    objetivo: "bulk",
    metabolic_type: "intolerante",
    metabolic_confidence: "alta",
    level: "intermedio"
  };

  const macros = calculateBridgeOverrideMacros(2400, profile, null);

  assert.equal(macros.applied_profile, "intolerante");
  assert.equal(macros.applied_phase, "bulk");
  assert.deepEqual(macros.template_pct, {
    protein_pct: 25,
    carbs_pct: 35,
    fat_pct: 40
  });
});

test("trainingNutritionBridge: override_kcal respeta la confianza baja y /distributions tiene compat temporal", () => {
  const lowConfidenceProfile = {
    peso_kg: 80,
    training_type: "hipertrofia",
    objetivo: "cut",
    metabolic_type: "intolerante",
    metabolic_confidence: "baja",
    level: "intermedio"
  };

  const macros = calculateBridgeOverrideMacros(2200, lowConfidenceProfile, "cut");
  const catalog = getMacroDistributionCatalog();

  assert.equal(macros.applied_profile, "mixto");
  assert.equal(catalog.ruleset, MACRO_RULESET_VERSION);
  assert.deepEqual(catalog.phase_table.intolerante.mant, {
    protein_pct: 27,
    carbs_pct: 28,
    fat_pct: 45
  });
  assert.deepEqual(catalog.legacy_ranges.tolerante.carbs, {
    min: 50,
    max: 60,
    mid: 55
  });
});
