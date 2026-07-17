// Variedad y palatabilidad de nutrición V2 (ARCH-002).
// Gestiona el contexto de variedad (alimentos/recetas/familias usados el mismo día y
// en días recientes), penalizaciones de repetición y estimación de palatabilidad por
// familia culinaria. La única dependencia de BD es loadRecentFoodUsageMap (usa pool);
// el resto son funciones puras. Se extraen del monolito nutritionV2Engine.js.

import { pool } from '../../db.js';
import { parseNumeric } from './baseUtils.js';
import { clampNumber, normalizeFoodName } from '../nutritionUtils.js';
import { isProcessedFood } from '../menuHardRulesEngine.js';

// Ventana por defecto (días) para el mapa de uso reciente de alimentos. Los llamadores
// reales pasan lookbackDays explícitamente (DETERMINISTIC_RECENT_FOOD_WINDOW_DAYS del
// engine); este literal solo actúa como salvaguarda si se omite el parámetro.
const DEFAULT_RECENT_FOOD_WINDOW_DAYS = 7;

export function createVarietyContext() {
  return {
    sameDayUsedFoodIds: new Set(),
    recentFoodUsage: new Map(),
    sameDayUsedRecipeCodes: new Set(),
    sameDayProcessedFoodIds: new Set(),
    sameDayMainFamilyUsage: new Map()
  };
}

export function registerSelectedRecipeInVarietyContext(varietyContext, metadata) {
  if (!varietyContext || !metadata) return;
  const recipeCode = String(metadata.recipe_code || '').trim();
  if (!recipeCode) return;
  varietyContext.sameDayUsedRecipeCodes.add(recipeCode);
}

export async function loadRecentFoodUsageMap({
  planId,
  currentDayIndex,
  lookbackDays = DEFAULT_RECENT_FOOD_WINDOW_DAYS
}) {
  const usage = new Map();
  if (!planId || !Number.isFinite(currentDayIndex)) {
    return usage;
  }

  const fromIndex = Math.max(0, currentDayIndex - lookbackDays);
  const usageResult = await pool.query(
    `
      SELECT
        COALESCE(mi.food_id, mi.alimento_id) AS food_id,
        COUNT(*)::int AS uses
      FROM app.nutrition_plan_days d
      JOIN app.nutrition_meals m ON m.plan_day_id = d.id
      JOIN app.nutrition_meal_items mi ON mi.meal_id = m.id
      WHERE d.plan_id = $1
        AND d.day_index >= $2
        AND d.day_index < $3
        AND COALESCE(mi.food_id, mi.alimento_id) IS NOT NULL
      GROUP BY COALESCE(mi.food_id, mi.alimento_id);
    `,
    [planId, fromIndex, currentDayIndex]
  );

  usageResult.rows.forEach((row) => {
    const foodId = row.food_id ? String(row.food_id) : null;
    if (!foodId) return;
    usage.set(foodId, Number.parseInt(row.uses, 10) || 0);
  });

  return usage;
}

export function getFoodVarietyPenalty(food, varietyContext) {
  if (!food || !food.id || !varietyContext) return 0;
  const foodId = String(food.id);
  const sameDayPenalty = varietyContext.sameDayUsedFoodIds?.has(foodId) ? 8 : 0;
  const recentUses = varietyContext.recentFoodUsage?.get(foodId) || 0;
  const recentPenalty = recentUses * 0.45;
  return Number((sameDayPenalty + recentPenalty).toFixed(6));
}

export function normalizeFamilyValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function isMainRecipeRole(roleValue) {
  const role = String(roleValue || '').toUpperCase();
  if (!role) return false;
  if (
    role.includes('GRASA')
    || role === 'VERDURA'
    || role === 'FRUTA'
    || role === 'BEBIDA'
    || role.includes('CONDIMENTO')
    || role.includes('SALSA')
  ) {
    return false;
  }
  return true;
}

export function resolveFoodFamilyForScoring(food = {}) {
  const explicit = normalizeFamilyValue(food.culinary_family);
  if (explicit) return explicit;

  const categoria = normalizeFamilyValue(food.categoria);
  const detalle = normalizeFamilyValue(food.categoria_detalle);
  const nombre = normalizeFamilyValue(food.nombre);

  if (detalle.includes('proteina vegetal')) return 'proteina_vegetal';
  if (detalle.includes('proteina animal')) return 'proteina_animal';
  if (detalle.includes('huevo')) return 'huevo';
  if (detalle.includes('legumbre')) return 'legumbre';
  if (detalle.includes('lacteo') || detalle.includes('lacteo')) return 'lacteo';

  if (categoria === 'proteina') {
    if (food.is_vegan === true || detalle.includes('vegetal')) return 'proteina_vegetal';
    return 'proteina_animal';
  }
  if (categoria === 'lacteo') return 'lacteo';
  if (categoria === 'fruta') return 'fruta';
  if (categoria === 'vegetal') return 'verdura';
  if (categoria === 'grasa') return 'aceite';

  if (nombre.includes('pan') || nombre.includes('bagel')) return 'pan';
  if (nombre.includes('arroz') || nombre.includes('pasta') || nombre.includes('avena')) return 'cereal';
  if (nombre.includes('margarina') || nombre.includes('untable')) return 'untable_industrial';
  if (nombre.includes('galleta') || nombre.includes('barrita')) return 'snack_dulce';

  return 'general';
}

export function estimateFoodPalatability(food = {}) {
  const explicit = parseNumeric(food.palatability_score);
  if (Number.isFinite(explicit)) {
    return clampNumber(explicit, 0, 100);
  }

  const family = resolveFoodFamilyForScoring(food);
  const processing = String(food.processing_level || '').trim().toLowerCase();
  const baseByFamily = {
    proteina_animal: 70,
    proteina_vegetal: 62,
    huevo: 76,
    lacteo: 78,
    cereal: 74,
    pan: 74,
    legumbre: 68,
    fruta: 82,
    verdura: 66,
    aceite: 60,
    snack_dulce: 58,
    untable_industrial: 52,
    general: 64
  };

  let score = baseByFamily[family] ?? 64;
  if (processing === 'procesado') score -= 2;
  if (processing === 'ultraprocesado') score -= 4;
  return clampNumber(score, 0, 100);
}

export function computeMealPalatabilityPenalty({ mealType, recipeItems = [], varietyContext = null }) {
  if (!Array.isArray(recipeItems) || recipeItems.length === 0) {
    return {
      totalPenalty: 0,
      avgMainPalatability: null,
      avgAllPalatability: null,
      basePenalty: 0,
      contextualPenalty: 0,
      repeatFamilyPenalty: 0,
      repeatedMainFamilies: []
    };
  }

  const enriched = recipeItems
    .map((entry) => {
      const food = entry?.food || null;
      if (!food) return null;
      return {
        role: entry?.role || '',
        family: resolveFoodFamilyForScoring(food),
        palatability: estimateFoodPalatability(food),
        isMainRole: isMainRecipeRole(entry?.role || '')
      };
    })
    .filter(Boolean);

  if (enriched.length === 0) {
    return {
      totalPenalty: 0,
      avgMainPalatability: null,
      avgAllPalatability: null,
      basePenalty: 0,
      contextualPenalty: 0,
      repeatFamilyPenalty: 0,
      repeatedMainFamilies: []
    };
  }

  const mainItems = enriched.filter((item) => item.isMainRole);
  const mainForAverage = mainItems.length > 0 ? mainItems : enriched;
  const avgMainPalatability = mainForAverage.reduce((acc, item) => acc + item.palatability, 0) / mainForAverage.length;
  const avgAllPalatability = enriched.reduce((acc, item) => acc + item.palatability, 0) / enriched.length;

  const basePenalty = Math.max(0, 72 - avgMainPalatability) / 20;
  let contextualPenalty = 0;

  if (mealType === 'DESAYUNO' || mealType === 'SNACK') {
    const hasAnimalMain = mainItems.some((item) => item.family === 'proteina_animal');
    const hasBreakfastFriendlyProtein = enriched.some((item) => item.family === 'huevo' || item.family === 'lacteo');
    if (hasAnimalMain && !hasBreakfastFriendlyProtein) {
      contextualPenalty += 1.2;
    }
  }

  if (mealType === 'COMIDA' || mealType === 'CENA') {
    const hasSnackMain = mainItems.some(
      (item) => item.family === 'snack_dulce' || item.family === 'untable_industrial'
    );
    if (hasSnackMain) {
      contextualPenalty += 1.2;
    }
  }

  let repeatFamilyPenalty = 0;
  const repeatedMainFamilies = [];
  if (varietyContext?.sameDayMainFamilyUsage instanceof Map && mainItems.length > 0) {
    const uniqueMainFamilies = [...new Set(mainItems.map((item) => item.family).filter(Boolean))];
    for (const family of uniqueMainFamilies) {
      const previousUses = varietyContext.sameDayMainFamilyUsage.get(family) || 0;
      if (previousUses > 0) {
        repeatedMainFamilies.push(family);
        repeatFamilyPenalty += Math.min(previousUses * 0.45, 1.35);
      }
    }
  }

  const totalPenalty = Number((basePenalty + contextualPenalty + repeatFamilyPenalty).toFixed(6));
  return {
    totalPenalty,
    avgMainPalatability: Number(avgMainPalatability.toFixed(2)),
    avgAllPalatability: Number(avgAllPalatability.toFixed(2)),
    basePenalty: Number(basePenalty.toFixed(6)),
    contextualPenalty: Number(contextualPenalty.toFixed(6)),
    repeatFamilyPenalty: Number(repeatFamilyPenalty.toFixed(6)),
    repeatedMainFamilies
  };
}

export function registerMenuFoodsInVarietyContext(varietyContext, menu, availableFoods = []) {
  if (!varietyContext || !Array.isArray(menu?.items) || menu.items.length === 0) {
    return;
  }

  const bySlug = new Map();
  const byName = new Map();
  const byId = new Map();
  for (const food of availableFoods) {
    if (!food?.id) continue;
    const foodId = String(food.id);
    const slug = String(food.slug || '').trim();
    const normalizedName = normalizeFoodName(food.nombre);
    byId.set(foodId, food);
    if (slug && !bySlug.has(slug)) bySlug.set(slug, foodId);
    if (normalizedName && !byName.has(normalizedName)) byName.set(normalizedName, foodId);
  }

  for (const rawItem of menu.items) {
    const itemSlug = String(rawItem?.food_slug || rawItem?.slug || '').trim();
    const itemName = normalizeFoodName(
      rawItem?.alimento_nombre
      || rawItem?.nombre
      || rawItem?.food_name
      || rawItem?.name
      || ''
    );
    const foodId = bySlug.get(itemSlug) || byName.get(itemName) || null;
    if (!foodId) continue;

    varietyContext.sameDayUsedFoodIds.add(foodId);
    const previous = varietyContext.recentFoodUsage.get(foodId) || 0;
    varietyContext.recentFoodUsage.set(foodId, previous + 1);

    const selectedFood = byId.get(foodId);
    if (selectedFood && isProcessedFood(selectedFood)) {
      varietyContext.sameDayProcessedFoodIds.add(foodId);
    }

    if (selectedFood && isMainRecipeRole(rawItem?.role || '')) {
      const family = resolveFoodFamilyForScoring(selectedFood);
      if (family) {
        const previous = varietyContext.sameDayMainFamilyUsage.get(family) || 0;
        varietyContext.sameDayMainFamilyUsage.set(family, previous + 1);
      }
    }
  }
}
