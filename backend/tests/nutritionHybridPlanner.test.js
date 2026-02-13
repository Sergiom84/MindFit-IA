import test from "node:test";
import assert from "node:assert/strict";

import {
  parsePlannerJsonResponse,
  normalizePlannerSelection,
  planHybridMenuSelection
} from "../services/nutritionHybridPlanner.js";

function sampleFoods() {
  return [
    { id: "a1", slug: "pollo", nombre: "Pollo", macros_100g: { protein_g: 31, carbs_g: 0, fat_g: 3.5, kcal: 165 } },
    { id: "b2", slug: "arroz", nombre: "Arroz cocido", macros_100g: { protein_g: 2.7, carbs_g: 28, fat_g: 0.3, kcal: 130 } },
    { id: "c3", slug: "brocoli", nombre: "Brócoli", macros_100g: { protein_g: 2.8, carbs_g: 7, fat_g: 0.4, kcal: 34 } },
    { id: "d4", slug: "aceite-oliva", nombre: "Aceite oliva", macros_100g: { protein_g: 0, carbs_g: 0, fat_g: 100, kcal: 900 } }
  ];
}

test("hybrid planner: parsea JSON simple", () => {
  const parsed = parsePlannerJsonResponse('{"selection":[{"food_id":"a1"}],"notes":"ok"}');
  assert.equal(Array.isArray(parsed.selection), true);
  assert.equal(parsed.selection[0].food_id, "a1");
});

test("hybrid planner: normaliza selección y completa con fallback", () => {
  const availableFoods = sampleFoods();
  const rankedFoods = [...availableFoods];

  const normalized = normalizePlannerSelection({
    parsedPlannerResponse: {
      selection: [{ food_id: "a1" }, { food_id: "b2" }],
      notes: "test"
    },
    availableFoods,
    rankedFoods,
    desiredItemsCount: 4
  });

  assert.equal(normalized.length, 4);
  assert.deepEqual(normalized.map((entry) => entry.food.id), ["a1", "b2", "c3", "d4"]);
});

test("hybrid planner: parsea status infeasible", () => {
  const parsed = parsePlannerJsonResponse('{"status":"infeasible","selection":[],"infeasible_reason":"sin base proteica viable"}');
  assert.equal(parsed.status, "infeasible");
  assert.equal(parsed.infeasible_reason, "sin base proteica viable");
});

test("hybrid planner: devuelve infeasible por pool no viable sin llamar a OpenAI", async () => {
  const availableFoods = [
    { id: "x1", slug: "pepino", nombre: "Pepino", macros_100g: { protein_g: 0.7, carbs_g: 3.6, fat_g: 0.1, kcal: 16 } },
    { id: "x2", slug: "lechuga", nombre: "Lechuga", macros_100g: { protein_g: 1.4, carbs_g: 2.9, fat_g: 0.2, kcal: 15 } }
  ];

  const result = await planHybridMenuSelection({
    meal: {
      nombre: "Comida",
      kcal: 700,
      macros: { protein_g: 50, carbs_g: 70, fat_g: 20 }
    },
    dayInfo: { tipo_dia: "entreno" },
    availableFoods,
    model: "fake-model"
  });

  assert.equal(result.planner.status, "infeasible");
  assert.match(result.planner.infeasible_reason, /Pool no viable/);
  assert.equal(Array.isArray(result.selectedFoods), true);
  assert.equal(result.selectedFoods.length, 0);
});
