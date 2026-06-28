import { parseJsonObject } from './nutritionUtils.js';
function parseNumeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(",", ".").replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}



function percentError(actual, target) {
  const safeTarget = parseNumeric(target);
  if (safeTarget <= 0) {
    return 0;
  }
  return Number((((Math.abs(actual - safeTarget)) / safeTarget) * 100).toFixed(2));
}

export function validateHybridSelection({ selectedFoods, availableFoods, minItems = 3 }) {
  const issues = [];

  if (!Array.isArray(selectedFoods) || selectedFoods.length === 0) {
    return {
      valid: false,
      issues: ["Selection vacía"],
      selectedFoods: []
    };
  }

  const allowedIds = new Set((Array.isArray(availableFoods) ? availableFoods : []).map((food) => String(food.id)));
  const uniqueIds = new Set();
  const normalized = [];

  for (const food of selectedFoods) {
    if (!food?.id) {
      issues.push("Item sin id en selección");
      continue;
    }

    const foodId = String(food.id);
    if (!allowedIds.has(foodId)) {
      issues.push(`Food no permitido por catálogo: ${foodId}`);
      continue;
    }

    if (uniqueIds.has(foodId)) {
      issues.push(`Food duplicado en selección: ${foodId}`);
      continue;
    }

    uniqueIds.add(foodId);
    normalized.push(food);
  }

  if (normalized.length < minItems) {
    issues.push(`Selección insuficiente: ${normalized.length}/${minItems}`);
  }

  return {
    valid: issues.length === 0,
    issues,
    selectedFoods: normalized
  };
}

export function summarizeMenuValidation({ menu, meal }) {
  const mealMacros = parseJsonObject(meal?.macros, {});
  const targetKcal = parseNumeric(meal?.kcal);
  const targetProtein = parseNumeric(mealMacros.protein_g);
  const targetCarbs = parseNumeric(mealMacros.carbs_g);
  const targetFat = parseNumeric(mealMacros.fat_g);

  const totals = (Array.isArray(menu?.items) ? menu.items : []).reduce((acc, item) => {
    const itemMacros = parseJsonObject(item?.macros, {});
    acc.kcal += parseNumeric(item?.kcal);
    acc.protein_g += parseNumeric(itemMacros.protein_g);
    acc.carbs_g += parseNumeric(itemMacros.carbs_g);
    acc.fat_g += parseNumeric(itemMacros.fat_g);
    return acc;
  }, { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });

  const errors = {
    kcal: percentError(totals.kcal, targetKcal),
    protein: percentError(totals.protein_g, targetProtein),
    carbs: percentError(totals.carbs_g, targetCarbs),
    fat: percentError(totals.fat_g, targetFat)
  };

  const maxError = Math.max(errors.kcal, errors.protein, errors.carbs, errors.fat);

  return {
    totals: {
      kcal: Number(totals.kcal.toFixed(2)),
      protein_g: Number(totals.protein_g.toFixed(2)),
      carbs_g: Number(totals.carbs_g.toFixed(2)),
      fat_g: Number(totals.fat_g.toFixed(2))
    },
    errors,
    max_error: maxError
  };
}

export function validateHybridSolvedMenu({ menu, meal, maxAllowedErrorPercent = 18 }) {
  const summary = summarizeMenuValidation({ menu, meal });
  const issues = [];

  if (!Array.isArray(menu?.items) || menu.items.length === 0) {
    issues.push("Menú sin items");
  }

  if (summary.max_error > maxAllowedErrorPercent) {
    issues.push(`Error máximo alto: ${summary.max_error}% > ${maxAllowedErrorPercent}%`);
  }

  return {
    valid: issues.length === 0,
    issues,
    summary
  };
}
