import test from "node:test";
import assert from "node:assert/strict";
import { buildCrossfitNutritionGuidance } from "../../src/components/nutrition/crossfitNutritionPresentation.js";

function contract(mode = "active") {
  return {
    schema_version: "crossfit-nutrition/2.0.0",
    mode,
    day_type: "D2",
    targets: {
      ranges_gkg: {
        carbohydrate: [5, 7],
        protein: [1.6, 2]
      }
    },
    timing: {
      pre: { window_hours: [1, 4], carbs_gkg: [1, 2], protein_gkg: [0.25, 0.35] },
      intra: { rule: "conditional_if_tolerated", carbs_g_per_hour: [20, 40] },
      post: { protein_gkg: [0.25, 0.4] }
    },
    hydration: {
      daily_ml_range: [2100, 2450],
      sodium_mg_per_hour: [300, 600],
      dosing_status: "educational_conditional"
    }
  };
}

test("presentación nutricional solo expone un contrato active y autoritativo", () => {
  assert.equal(buildCrossfitNutritionGuidance({
    periodization_context: { authoritative: false, crossfit_nutrition: contract("shadow") }
  }), null);
  assert.equal(buildCrossfitNutritionGuidance({
    periodization_context: { authoritative: false, crossfit_nutrition: contract() }
  }), null);

  const guidance = buildCrossfitNutritionGuidance({
    periodization_context: { authoritative: true, crossfit_nutrition: contract() }
  });
  assert.equal(guidance.dayType, "D2");
  assert.equal(guidance.loadLabel, "Carga alta D2");
  assert.equal(guidance.carbohydrateRange, "5-7 g/kg");
  assert.equal(guidance.hydration, "2100-2450 ml/día");
  assert.match(guidance.intra, /20-40 g HC\/h/);
});

test("presentación respeta el bloqueo profesional de electrolitos", () => {
  const blocked = contract();
  blocked.hydration.sodium_mg_per_hour = null;
  blocked.hydration.dosing_status = "blocked_professional_review";
  const guidance = buildCrossfitNutritionGuidance({
    periodization_context: JSON.stringify({ authoritative: true, crossfit_nutrition: blocked })
  });
  assert.equal(guidance.sodium, "Electrolitos: individualizar con profesional");
});

test("presentación falla cerrada con versión o tipo de día desconocidos", () => {
  const invalid = contract();
  invalid.schema_version = "crossfit-nutrition/999";
  assert.equal(buildCrossfitNutritionGuidance({
    periodization_context: { authoritative: true, crossfit_nutrition: invalid }
  }), null);
});
