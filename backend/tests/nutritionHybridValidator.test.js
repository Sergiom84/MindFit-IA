import test from "node:test";
import assert from "node:assert/strict";

import {
  validateHybridSelection,
  validateHybridSolvedMenu
} from "../services/nutritionHybridValidator.js";

const availableFoods = [
  { id: "a1", nombre: "Pollo" },
  { id: "b2", nombre: "Arroz" },
  { id: "c3", nombre: "Brócoli" }
];

test("hybrid validator: valida selección correcta", () => {
  const result = validateHybridSelection({
    selectedFoods: [availableFoods[0], availableFoods[1], availableFoods[2]],
    availableFoods,
    minItems: 3
  });

  assert.equal(result.valid, true);
  assert.equal(result.issues.length, 0);
});

test("hybrid validator: detecta item fuera de catálogo", () => {
  const result = validateHybridSelection({
    selectedFoods: [availableFoods[0], { id: "x9", nombre: "No existe" }],
    availableFoods,
    minItems: 2
  });

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.includes("no permitido")));
});

test("hybrid validator: valida menú resuelto por tolerancia", () => {
  const meal = {
    kcal: 600,
    macros: { protein_g: 40, carbs_g: 70, fat_g: 15 }
  };

  const menu = {
    items: [
      { kcal: 310, macros: { protein_g: 35, carbs_g: 0, fat_g: 8 } },
      { kcal: 240, macros: { protein_g: 4, carbs_g: 55, fat_g: 2 } },
      { kcal: 50, macros: { protein_g: 2, carbs_g: 12, fat_g: 0.5 } }
    ]
  };

  const validation = validateHybridSolvedMenu({
    menu,
    meal,
    maxAllowedErrorPercent: 30
  });

  assert.equal(validation.valid, true);
  assert.ok(validation.summary.max_error <= 30);
});
