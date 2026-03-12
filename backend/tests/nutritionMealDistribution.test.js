import test from "node:test";
import assert from "node:assert/strict";

import { distributeMacrosAcrossMeals } from "../services/nutritionCalculator.js";

test("meal distribution: soporta 1 comida al dia", () => {
  const meals = distributeMacrosAcrossMeals(
    { protein_g: 180, carbs_g: 220, fat_g: 90, kcal: 2410 },
    1,
    false
  );

  assert.equal(meals.length, 1);
  assert.equal(meals[0].nombre, "Comida");
  assert.equal(meals[0].meal_type, "COMIDA");
  assert.equal(meals[0].kcal, 2410);
  assert.equal(meals[0].macros.protein_g, 180);
  assert.equal(meals[0].macros.carbs_g, 220);
  assert.equal(meals[0].macros.fat_g, 90);
});

test("meal distribution: soporta 2 comidas al dia", () => {
  const meals = distributeMacrosAcrossMeals(
    { protein_g: 200, carbs_g: 250, fat_g: 100, kcal: 2700 },
    2,
    true
  );

  assert.equal(meals.length, 2);
  assert.deepEqual(meals.map((meal) => meal.nombre), ["Comida", "Cena"]);
  assert.deepEqual(meals.map((meal) => meal.meal_type), ["COMIDA", "CENA"]);
  assert.equal(meals[1].timing_note, "Post-entreno");
  assert.equal(meals.reduce((sum, meal) => sum + meal.kcal, 0), 2700);
});
