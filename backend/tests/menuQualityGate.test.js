import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateMealQuality,
  evaluateDayQuality,
  resolveMealTarget,
  maxRelativeError
} from "../services/nutritionV2/menuQualityGate.js";
import { MENU_QUALITY_THRESHOLDS } from "../services/nutritionV2/menuGenerationConfig.js";

// Comida objetivo: 500 kcal, P40/C50/F15 (macros JSON como en nutrition_meals).
const mealTarget = {
  id: 1,
  kcal: 500,
  macros: { protein_g: 40, carbs_g: 50, fat_g: 15 }
};

// Menú achieved: helper para construir la validacion como los generadores.
const menuWith = (kcal, p, c, f) => ({
  validacion: {
    kcal_total: kcal,
    macros_totales: { protein_g: p, carbs_g: c, fat_g: f }
  }
});

test("A-04: menú dentro de tolerancia → quality ok, sin reasons", () => {
  const menu = menuWith(505, 41, 50, 15); // errores ~1-2%
  const q = evaluateMealQuality({ meal: mealTarget, menu, metadata: { target_within_tolerance: true } });
  assert.equal(q.status, "ok");
  assert.deepEqual(q.reasons, []);
  assert.equal(q.threshold_pct, MENU_QUALITY_THRESHOLDS.meal_max_error_pct);
});

test("A-04: comida con error alto (85%) → degraded con motivo", () => {
  const menu = menuWith(500, 40, 92.5, 15); // carbs 50→92.5 = 85% error
  const q = evaluateMealQuality({ meal: mealTarget, menu });
  assert.equal(q.status, "degraded");
  assert.ok(q.max_error_pct >= 80);
  assert.ok(q.reasons.includes("meal_error_exceeds_threshold"));
});

test("A-04: emergency_balance_override marca degraded aunque el error sea bajo", () => {
  const menu = menuWith(500, 40, 50, 15); // error 0
  const q = evaluateMealQuality({ meal: mealTarget, menu, metadata: { emergency_balance_override: true } });
  assert.equal(q.status, "degraded");
  assert.ok(q.reasons.includes("emergency_balance_override"));
});

test("A-04: fallback_used marca degraded", () => {
  const menu = menuWith(500, 40, 50, 15);
  const q = evaluateMealQuality({ meal: mealTarget, menu, metadata: { fallback_used: true } });
  assert.equal(q.status, "degraded");
  assert.ok(q.reasons.includes("fallback_used"));
});

test("A-04: día con todas las comidas OK → quality ok", () => {
  const meals = [
    { meal_id: 1, meal: mealTarget, menu: menuWith(500, 40, 50, 15), metadata: {} },
    { meal_id: 2, meal: mealTarget, menu: menuWith(498, 40, 51, 15), metadata: {} }
  ];
  const q = evaluateDayQuality(meals);
  assert.equal(q.status, "ok");
  assert.equal(q.degraded_meals.length, 0);
  assert.equal(q.failed_meals.length, 0);
});

test("A-04: día degradado si una comida supera el umbral", () => {
  const meals = [
    { meal_id: 1, meal: mealTarget, menu: menuWith(500, 40, 50, 15), metadata: {} },
    { meal_id: 2, meal: mealTarget, menu: menuWith(500, 40, 92.5, 15), metadata: {} }
  ];
  const q = evaluateDayQuality(meals);
  assert.equal(q.status, "degraded");
  assert.equal(q.degraded_meals.length, 1);
  assert.equal(q.degraded_meals[0].meal_id, 2);
  assert.ok(q.reasons.includes("meal_below_quality"));
});

test("A-04: día degradado si una comida falló al generarse", () => {
  const meals = [
    { meal_id: 1, meal: mealTarget, menu: menuWith(500, 40, 50, 15), metadata: {} },
    { meal_id: 2, error: "No se pudo construir menú determinista" }
  ];
  const q = evaluateDayQuality(meals);
  assert.equal(q.status, "degraded");
  assert.equal(q.failed_meals.length, 1);
  assert.ok(q.reasons.includes("meal_generation_failed"));
});

test("A-04: error agregado del día supera umbral aunque cada comida esté justo bajo el suyo", () => {
  // Cada comida sesga carbs en la MISMA dirección un ~12% (< 15% comida) pero el día
  // agregado también queda ~12% (> 10% día) → degradado por day_error_exceeds_threshold.
  const skewed = menuWith(500, 40, 56, 15); // carbs 50→56 = 12%
  const meals = [
    { meal_id: 1, meal: mealTarget, menu: skewed, metadata: {} },
    { meal_id: 2, meal: mealTarget, menu: skewed, metadata: {} }
  ];
  const q = evaluateDayQuality(meals);
  assert.equal(q.status, "degraded");
  assert.equal(q.degraded_meals.length, 0, "ninguna comida individual supera su umbral");
  assert.ok(q.day_max_error_pct > MENU_QUALITY_THRESHOLDS.day_max_error_pct);
  assert.ok(q.reasons.includes("day_error_exceeds_threshold"));
});

test("A-04: resolveMealTarget deriva kcal de macros si falta", () => {
  const t = resolveMealTarget({ macros: { protein_g: 40, carbs_g: 50, fat_g: 15 } });
  assert.equal(t.kcal, 40 * 4 + 50 * 4 + 15 * 9); // 495
  const e = maxRelativeError({ kcal: 100, protein_g: 10, carbs_g: 10, fat_g: 10 }, { kcal: 110, protein_g: 10, carbs_g: 10, fat_g: 10 });
  assert.equal(e.max, 10);
});
