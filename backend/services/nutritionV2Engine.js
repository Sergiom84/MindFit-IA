/**
 * Motor de Nutricion V2 - helpers y constantes extraidos de routes/nutritionV2.js
 * (generacion de menus, normalizacion, conversiones y evaluaciones).
 * Las rutas viven en routes/nutritionV2.js y consumen este modulo.
 */

import {
  pool
} from '../db.js';
import {
  nutritionMenuGeneratorPrompt
} from '../prompts/nutrition-menu-generator.js';
import {
  getOpenAIClient
} from '../lib/openaiClient.js';
import {
  generateHybridMenuForMeal,
  HybridMenuGenerationError
} from '../services/nutritionHybridOrchestrator.js';
import {
  evaluateRecipeHardRules,
  computePairingPenaltyForRecipe,
  evaluateMealNutrientBalance,
  isProcessedFood
} from '../services/menuHardRulesEngine.js';
import { clampNumber, parseJsonObject, formatLocalDate, normalizeFoodName } from './nutritionUtils.js';
// Normalizadores de perfil de usuario extraídos (ARCH-002). Se re-exportan más abajo
// para no romper el contrato con los consumidores de nutritionV2Engine.
import {
  USER_OBJECTIVE_TO_NUTRITION_GOAL,
  normalizeSexo,
  normalizeActividad,
  mapUserObjectiveToNutritionGoal,
  resolveNutritionObjectiveMismatch,
  normalizeNivelEntrenamiento
} from './nutritionV2/userProfileNormalizers.js';
// Normalizadores de texto/dieta extraídos (ARCH-002). Re-exportados más abajo.
import {
  VALID_ESTADOS_PESADO,
  VALID_DIET_FILTERS,
  normalizeStringArray,
  normalizeDietFilter,
  normalizeEstadoPesado,
  normalizeComparableText,
  resolveVegetablePortionProfile,
  normalizePositiveInt
} from './nutritionV2/dietNormalizers.js';
// Utils base compartidos (ARCH-002). Re-exportados más abajo.
import {
  parseNumeric,
  hashString,
  pickDeterministic,
  percentError,
  daysBetween
} from './nutritionV2/baseUtils.js';
// Macro-math extraída (ARCH-002). Re-exportada más abajo.
import {
  getRoleMacroWeights,
  calculateMacroTotals,
  getPrimaryRoleFromRoles,
  computeMacrosAndKcalFromFood,
  areRoleSetsCompatible
} from './nutritionV2/macroMath.js';
// Constantes de rol extraídas (ARCH-002); usadas por el generador y re-exportadas.
import { SLOT_ROLE_FALLBACKS } from './nutritionV2/roleConstants.js';
// Conversiones de estado de pesado extraídas (ARCH-002). Re-exportadas más abajo.
import {
  buildConversionKey,
  buildConversionMapFromRows,
  resolveShownStateConversion
} from './nutritionV2/conversions.js';

const VALID_MENU_GENERATION_MODES = ['deterministic', 'ai', 'hybrid_ai', 'recipe_examples'];
const DETERMINISTIC_MAX_TEMPLATE_TRIES = 12;
const DETERMINISTIC_MAX_RECIPE_TRIES = 40;
const DETERMINISTIC_COORDINATE_ITERATIONS = 120;
const DETERMINISTIC_MAX_SLOT_OPTIONS = 8;
const DETERMINISTIC_MAX_SLOT_COMBINATIONS = 400;
const DETERMINISTIC_RECENT_FOOD_WINDOW_DAYS = 7;
const SWAP_MEAL_RECALC_MAX_ERROR = 35;
const HYBRID_FALLBACK_MODE = 'deterministic';
const DEFAULT_HYBRID_MODEL = process.env.NUTRITION_HYBRID_MODEL || 'gpt-5.2';


function buildFoodCatalogFilters({
  search,
  categoria,
  categoriaDetalle,
  diet,
  allergensExclude,
  estadoBase,
  grupoFactor,
  onlyVerified = true
}) {
  const whereClauses = ['1=1'];
  const params = [];

  if (onlyVerified) {
    whereClauses.push('is_verified = TRUE');
  }

  if (search) {
    whereClauses.push(`LOWER(nombre) LIKE LOWER($${params.length + 1})`);
    params.push(`%${search}%`);
  }

  if (categoria) {
    whereClauses.push(`LOWER(categoria) = LOWER($${params.length + 1})`);
    params.push(categoria);
  }

  if (categoriaDetalle) {
    whereClauses.push(`LOWER(categoria_detalle) = LOWER($${params.length + 1})`);
    params.push(categoriaDetalle);
  }

  if (estadoBase) {
    whereClauses.push(`estado_pesado_base = $${params.length + 1}`);
    params.push(estadoBase);
  }

  if (grupoFactor) {
    whereClauses.push(`LOWER(grupo_factor) = LOWER($${params.length + 1})`);
    params.push(grupoFactor);
  }

  if (diet === 'vegetariano') {
    whereClauses.push('COALESCE(is_vegetarian, FALSE) = TRUE');
  } else if (diet === 'vegano') {
    whereClauses.push('COALESCE(is_vegan, FALSE) = TRUE');
  }

  const allergens = normalizeStringArray(allergensExclude).map((allergen) => allergen.toLowerCase());
  for (const allergen of allergens) {
    whereClauses.push(`LOWER(COALESCE(tags::text, '')) NOT LIKE $${params.length + 1}`);
    params.push(`%${allergen}%`);
  }

  return {
    whereSql: whereClauses.join(' AND '),
    params,
    normalizedAllergens: [...new Set(allergens)]
  };
}

function buildFoodFiltersFromUserPreferences(userPreferences = {}) {
  const preferencias = parseJsonObject(userPreferences.preferencias, {});
  const alergias = normalizeStringArray(userPreferences.alergias);

  const allergensExclude = [...alergias];
  if (preferencias.sin_gluten) {
    allergensExclude.push('gluten');
  }
  if (preferencias.sin_lactosa) {
    allergensExclude.push('lactosa', 'lacteo', 'lacteos', 'lácteo', 'lácteos');
  }

  const diet = preferencias.vegano ? 'vegano' : (preferencias.vegetariano ? 'vegetariano' : 'omnivoro');

  return {
    diet,
    allergensExclude: [...new Set(allergensExclude.map((item) => String(item).trim()).filter(Boolean))],
    preferencias,
    alergias
  };
}




function parseMealMacros(meal) {
  const rawMacros = parseJsonObject(meal?.macros, {});
  return {
    protein_g: parseNumeric(rawMacros.protein_g) ?? 0,
    carbs_g: parseNumeric(rawMacros.carbs_g) ?? 0,
    fat_g: parseNumeric(rawMacros.fat_g) ?? 0
  };
}

function normalizeTemplateContext(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return 'AMBOS';
  if (raw === 'MANTENIMIENTO') return 'NORMO';
  return raw;
}

function resolvePhaseContext(profile) {
  const phaseRaw = String(profile?.current_phase || profile?.objetivo || '').trim().toLowerCase();
  if (phaseRaw.includes('defin') || phaseRaw === 'cut') return 'DEFINICION';
  if (phaseRaw.includes('volum') || phaseRaw === 'bulk') return 'VOLUMEN';
  if (phaseRaw.includes('normo') || phaseRaw.includes('maint')) return 'NORMO';
  return null;
}

function resolveMealType(meal) {
  const explicitMealType = String(meal?.meal_type || '').trim().toUpperCase();
  if (['DESAYUNO', 'SNACK', 'COMIDA', 'CENA'].includes(explicitMealType)) {
    return explicitMealType;
  }

  const mealName = String(meal?.nombre || '').trim().toLowerCase();
  if (mealName === 'primera comida') return 'COMIDA';
  if (mealName === 'segunda comida') return 'CENA';
  if (mealName.includes('desay')) return 'DESAYUNO';
  if (mealName.includes('cena')) return 'CENA';
  if (mealName.includes('almuerzo')) return 'SNACK';
  if (mealName.includes('comida')) return 'COMIDA';
  if (mealName.includes('snack') || mealName.includes('merienda')) return 'SNACK';

  switch (Number.parseInt(meal?.orden, 10)) {
    case 1: return 'DESAYUNO';
    case 2: return 'SNACK';
    case 3: return 'COMIDA';
    case 4: return 'SNACK';
    case 5: return 'CENA';
    default: return 'SNACK';
  }
}

function resolveSnackSlotTag(meal) {
  const mealName = String(meal?.nombre || '').trim().toLowerCase();
  if (mealName.includes('almuerzo')) return 'slot:almuerzo';
  if (mealName.includes('merienda')) return 'slot:merienda';

  const order = Number.parseInt(meal?.orden, 10);
  if (order === 2) return 'slot:almuerzo';
  if (order === 4) return 'slot:merienda';
  if (order >= 5) return 'slot:merienda';
  return null;
}

function buildMealSelectionSeedSuffix(meal) {
  const mealName = normalizeFoodName(meal?.nombre || '');
  const mealOrder = Number.parseInt(meal?.orden, 10);
  return `${Number.isFinite(mealOrder) ? mealOrder : 0}|${mealName || 'meal'}`;
}

function extractFoodTagsSet(food) {
  const tags = Array.isArray(food?.tags) ? food.tags : normalizeStringArray(food?.tags);
  return new Set(tags.map((tag) => String(tag || '').trim().toLowerCase()).filter(Boolean));
}

function matchesFoodFilters(food, userFoodFilters) {
  if (!food) return false;
  const diet = userFoodFilters?.diet || 'omnivoro';
  if (diet === 'vegano' && !food.is_vegan) return false;
  if (diet === 'vegetariano' && !food.is_vegetarian) return false;

  const allergens = normalizeStringArray(userFoodFilters?.allergensExclude).map((value) => value.toLowerCase());
  if (allergens.length === 0) return true;

  const tagSet = extractFoodTagsSet(food);
  for (const allergen of allergens) {
    if (!allergen) continue;
    for (const tag of tagSet) {
      if (tag.includes(allergen) || allergen.includes(tag)) {
        return false;
      }
    }
  }

  return true;
}




function evaluateCandidateMealBalance(items, mealMacros, mealKcalTarget) {
  const balanceEval = evaluateMealNutrientBalance(items, {
    protein_g: mealMacros?.protein_g,
    carbs_g: mealMacros?.carbs_g,
    fat_g: mealMacros?.fat_g,
    kcal: mealKcalTarget
  });

  const blockingCodes = new Set([
    'low_protein_from_protein_roles',
    'low_carbs_from_carbo_roles',
    'low_fat_from_grasa_roles',
    'high_kcal_from_verduras',
    'vegetal_grams_too_high'
  ]);
  const blockingWarnings = balanceEval.warnings.filter((warning) => blockingCodes.has(warning.code));
  const nonBlockingWarnings = balanceEval.warnings.filter((warning) => !blockingCodes.has(warning.code));

  return {
    ...balanceEval,
    blockingWarnings,
    nonBlockingWarnings,
    blocksCandidate: blockingWarnings.length > 0,
    penaltyScore: Number(((blockingWarnings.length * 10) + (nonBlockingWarnings.length * 2.5)).toFixed(4))
  };
}




function computeSwapBaseGrams({
  oldItemMacros,
  oldItemKcal,
  newFood,
  primaryRole
}) {
  const role = String(primaryRole || '').toUpperCase();
  const targetProtein = Math.max(0, parseNumeric(oldItemMacros?.protein_g) ?? 0);
  const targetCarbs = Math.max(0, parseNumeric(oldItemMacros?.carbs_g) ?? 0);
  const targetFat = Math.max(0, parseNumeric(oldItemMacros?.fat_g) ?? 0);
  const targetKcal = Math.max(
    0,
    parseNumeric(oldItemKcal) ?? Math.round((targetProtein * 4) + (targetCarbs * 4) + (targetFat * 9))
  );

  const macros100 = parseJsonObject(newFood?.macros_100g, {});
  const protein100 = Math.max(0, parseNumeric(macros100.protein_g) ?? 0);
  const carbs100 = Math.max(0, parseNumeric(macros100.carbs_g) ?? 0);
  const fat100 = Math.max(0, parseNumeric(macros100.fat_g) ?? 0);
  const kcal100 = Math.max(0, parseNumeric(macros100.kcal) ?? Math.round((protein100 * 4) + (carbs100 * 4) + (fat100 * 9)));

  const byMacro = (target, per100) => {
    if (!(target > 0) || !(per100 > 0)) return null;
    return (target * 100) / per100;
  };
  const byKcal = () => {
    if (!(targetKcal > 0) || !(kcal100 > 0)) return null;
    return (targetKcal * 100) / kcal100;
  };

  let grams = null;
  if (role.includes('PROTEINA') || role === 'HUEVO' || role.includes('LACTEO')) {
    grams = byMacro(targetProtein, protein100);
  } else if (role.includes('CARBO') || role === 'LEGUMBRE' || role === 'FRUTA') {
    grams = byMacro(targetCarbs, carbs100);
  } else if (role.includes('GRASA')) {
    grams = byMacro(targetFat, fat100);
  }

  if (!(grams > 0)) {
    grams = byKcal();
  }

  if (!(grams > 0)) {
    grams = 100;
  }

  return Number(clampNumber(grams, 5, 1200).toFixed(1));
}

function getConversionBlockedReasonMessage(code) {
  const normalized = String(code || '').trim().toLowerCase();
  if (normalized === 'tal_cual_no_convertible') {
    return 'Este alimento se mide tal como se consume.';
  }
  if (normalized === 'missing_group_factor') {
    return 'Este alimento no tiene regla de conversión configurada.';
  }
  if (normalized === 'missing_conversion_factor') {
    return 'No existe conversión para ese estado de pesado.';
  }
  return 'No se pudo aplicar ese estado de pesado.';
}

function resolveShownStateWithFallback({
  grupoFactor,
  estadoBase,
  estadoMostrado,
  conversionMap
}) {
  const base = normalizeEstadoPesado(estadoBase) || 'tal_cual';
  const requested = normalizeEstadoPesado(estadoMostrado) || base;
  const conversionState = resolveShownStateConversion({
    grupoFactor,
    estadoBase: base,
    estadoMostrado: requested,
    conversionMap
  });

  if (!conversionState.blockedReason) {
    return {
      estadoBase: base,
      estadoMostradoFinal: conversionState.estadoMostradoFinal,
      factor: conversionState.factor,
      blockedReason: null,
      requestedEstado: requested,
      fallbackApplied: false,
      fallbackMessage: null
    };
  }

  return {
    estadoBase: base,
    estadoMostradoFinal: base,
    factor: 1,
    blockedReason: conversionState.blockedReason,
    requestedEstado: requested,
    fallbackApplied: requested !== base,
    fallbackMessage: getConversionBlockedReasonMessage(conversionState.blockedReason)
  };
}

function resolveBaseGramsFromMealItem(item, conversionMap) {
  const cantidadBase = parseNumeric(item?.cantidad_g_base);
  if (cantidadBase && cantidadBase > 0) {
    return cantidadBase;
  }

  const cantidadMostrada = parseNumeric(item?.cantidad_g_mostrada ?? item?.cantidad_g);
  if (!(cantidadMostrada > 0)) {
    return null;
  }

  const estadoBase = normalizeEstadoPesado(item?.estado_pesado_base) || 'tal_cual';
  const estadoMostrado = normalizeEstadoPesado(item?.estado_pesado_mostrado) || estadoBase;
  const conversionState = resolveShownStateConversion({
    grupoFactor: item?.grupo_factor,
    estadoBase,
    estadoMostrado,
    conversionMap
  });
  const factor = conversionState.factor > 0 ? conversionState.factor : 1;
  return Number((cantidadMostrada / factor).toFixed(2));
}

function createVarietyContext() {
  return {
    sameDayUsedFoodIds: new Set(),
    recentFoodUsage: new Map(),
    sameDayUsedRecipeCodes: new Set(),
    sameDayProcessedFoodIds: new Set(),
    sameDayMainFamilyUsage: new Map()
  };
}

function registerSelectedRecipeInVarietyContext(varietyContext, metadata) {
  if (!varietyContext || !metadata) return;
  const recipeCode = String(metadata.recipe_code || '').trim();
  if (!recipeCode) return;
  varietyContext.sameDayUsedRecipeCodes.add(recipeCode);
}

async function loadRecentFoodUsageMap({
  planId,
  currentDayIndex,
  lookbackDays = DETERMINISTIC_RECENT_FOOD_WINDOW_DAYS
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

function getFoodVarietyPenalty(food, varietyContext) {
  if (!food || !food.id || !varietyContext) return 0;
  const foodId = String(food.id);
  const sameDayPenalty = varietyContext.sameDayUsedFoodIds?.has(foodId) ? 8 : 0;
  const recentUses = varietyContext.recentFoodUsage?.get(foodId) || 0;
  const recentPenalty = recentUses * 0.45;
  return Number((sameDayPenalty + recentPenalty).toFixed(6));
}

function normalizeFamilyValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isMainRecipeRole(roleValue) {
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

function resolveFoodFamilyForScoring(food = {}) {
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

function estimateFoodPalatability(food = {}) {
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

function computeMealPalatabilityPenalty({ mealType, recipeItems = [], varietyContext = null }) {
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

function registerMenuFoodsInVarietyContext(varietyContext, menu, availableFoods = []) {
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

function extractMenuItemsForPersistence(menuData) {
  if (!menuData || !Array.isArray(menuData.items)) {
    return [];
  }

  return menuData.items
    .map((rawItem, index) => {
      const alimentoNombre = String(
        rawItem.alimento_nombre
          || rawItem.nombre
          || rawItem.name
          || rawItem.food_name
          || ''
      ).trim();

      if (!alimentoNombre) {
        return null;
      }

      const foodSlug = String(rawItem.food_slug || rawItem.slug || '').trim() || null;
      const estadoBaseInput = normalizeEstadoPesado(rawItem.estado_pesado_base);
      const estadoMostradoInput = normalizeEstadoPesado(rawItem.estado_pesado_mostrado);

      const cantidadBase = parseNumeric(
        rawItem.cantidad_g_base ?? rawItem.cantidad_base_g ?? rawItem.cantidad_g ?? rawItem.gramos
      );
      const cantidadMostrada = parseNumeric(
        rawItem.cantidad_g_mostrada ?? rawItem.cantidad_mostrada_g ?? rawItem.cantidad_g ?? rawItem.gramos ?? rawItem.porcion_g ?? rawItem.portion_g
      );
      const finalCantidadMostrada = cantidadMostrada ?? cantidadBase;
      if (finalCantidadMostrada == null || finalCantidadMostrada <= 0) {
        return null;
      }

      const rawMacros = parseJsonObject(rawItem.macros, {});
      const protein = parseNumeric(rawMacros.protein_g) ?? 0;
      const carbs = parseNumeric(rawMacros.carbs_g) ?? 0;
      const fat = parseNumeric(rawMacros.fat_g) ?? 0;
      const kcalFromMacros = Math.round((protein * 4) + (carbs * 4) + (fat * 9));
      const kcal = Math.round(parseNumeric(rawItem.kcal) ?? kcalFromMacros ?? 0);

      return {
        orden: index + 1,
        alimentoNombre,
        foodSlug,
        normalizedName: normalizeFoodName(alimentoNombre),
        cantidadBase,
        cantidadMostrada: finalCantidadMostrada,
        estadoBase: estadoBaseInput,
        estadoMostrado: estadoMostradoInput || estadoBaseInput,
        role: String(rawItem.role || '').trim() || null,
        kcal,
        macros: {
          protein_g: Number(protein.toFixed(2)),
          carbs_g: Number(carbs.toFixed(2)),
          fat_g: Number(fat.toFixed(2))
        }
      };
    })
    .filter(Boolean);
}

async function persistGeneratedMenuItemsForMeal({ mealId, menuData, availableFoods = [] }) {
  if (!mealId) {
    return { inserted_items: 0, unmatched_items: [], skipped: true };
  }

  const itemsToPersist = extractMenuItemsForPersistence(menuData);
  const availableFoodsMap = new Map();
  const availableFoodsBySlug = new Map();
  for (const food of availableFoods) {
    const normalized = normalizeFoodName(food.nombre);
    if (normalized && !availableFoodsMap.has(normalized)) {
      availableFoodsMap.set(normalized, food);
    }
    const slug = String(food.slug || '').trim();
    if (slug && !availableFoodsBySlug.has(slug)) {
      availableFoodsBySlug.set(slug, food);
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM app.nutrition_meal_items WHERE meal_id = $1', [mealId]);

    const groupFactorsInContext = [...new Set(
      availableFoods
        .map((food) => String(food?.grupo_factor || '').trim().toLowerCase())
        .filter(Boolean)
    )];
    const conversionRows = groupFactorsInContext.length > 0
      ? (await client.query(
          `
            SELECT grupo_factor, estado_base, estado_objetivo, factor_base_objetivo
            FROM app.food_conversion_factors
            WHERE grupo_factor = ANY($1);
          `,
          [groupFactorsInContext]
        )).rows
      : [];
    const conversionMap = buildConversionMapFromRows(conversionRows);

    let inserted = 0;
    const unmatchedItems = [];

    for (const item of itemsToPersist) {
      const matchedFood = availableFoodsBySlug.get(item.foodSlug) || availableFoodsMap.get(item.normalizedName) || null;
      const estadoBase = normalizeEstadoPesado(item.estadoBase || matchedFood?.estado_pesado_base) || 'tal_cual';
      const estadoMostradoRequested = normalizeEstadoPesado(
        item.estadoMostrado || matchedFood?.estado_pesado_mostrado_default || estadoBase
      ) || estadoBase;
      const conversionState = resolveShownStateConversion({
        grupoFactor: matchedFood?.grupo_factor,
        estadoBase,
        estadoMostrado: estadoMostradoRequested,
        conversionMap
      });
      const estadoMostrado = conversionState.estadoMostradoFinal;
      const requestedDifferentState = estadoMostradoRequested !== estadoBase;

      let cantidadBase = parseNumeric(item.cantidadBase);
      let cantidadMostrada = parseNumeric(item.cantidadMostrada);
      if (cantidadMostrada == null && cantidadBase == null) {
        throw new Error(`Item sin gramos válidos: ${item.alimentoNombre}`);
      }
      if (cantidadBase == null && cantidadMostrada != null) {
        if (requestedDifferentState && conversionState.blockedReason) {
          throw new Error(`Conversión bloqueada (${conversionState.blockedReason}) para ${item.alimentoNombre}`);
        }
        cantidadBase = cantidadMostrada / conversionState.factor;
      }
      if (cantidadMostrada == null && cantidadBase != null) {
        cantidadMostrada = cantidadBase * conversionState.factor;
      }

      const roundedCantidadBase = Number(cantidadBase.toFixed(1));
      const roundedCantidadMostrada = Number(cantidadMostrada.toFixed(1));
      const tags = Array.isArray(matchedFood?.tags)
        ? matchedFood.tags
        : normalizeStringArray(matchedFood?.tags);

      const matchedMacros100 = parseJsonObject(matchedFood?.macros_100g, {});
      const hasMatchedMacros = matchedFood
        && (parseNumeric(matchedMacros100.protein_g) != null
          || parseNumeric(matchedMacros100.carbs_g) != null
          || parseNumeric(matchedMacros100.fat_g) != null);

      const computedProtein = hasMatchedMacros
        ? Number((((parseNumeric(matchedMacros100.protein_g) ?? 0) * roundedCantidadBase) / 100).toFixed(2))
        : item.macros.protein_g;
      const computedCarbs = hasMatchedMacros
        ? Number((((parseNumeric(matchedMacros100.carbs_g) ?? 0) * roundedCantidadBase) / 100).toFixed(2))
        : item.macros.carbs_g;
      const computedFat = hasMatchedMacros
        ? Number((((parseNumeric(matchedMacros100.fat_g) ?? 0) * roundedCantidadBase) / 100).toFixed(2))
        : item.macros.fat_g;
      const computedKcal = hasMatchedMacros
        ? Math.round((computedProtein * 4) + (computedCarbs * 4) + (computedFat * 9))
        : item.kcal;

      await client.query(
        `
          INSERT INTO app.nutrition_meal_items (
            meal_id,
            alimento_id,
            descripcion,
            cantidad_g,
            kcal,
            macros,
            tags,
            orden,
            food_id,
            estado_pesado_base,
            estado_pesado_mostrado,
            cantidad_g_base,
            cantidad_g_mostrada
          ) VALUES (
            $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12, $13
          );
        `,
        [
          mealId,
          matchedFood?.id || null,
          item.alimentoNombre,
          roundedCantidadMostrada,
          computedKcal,
          JSON.stringify({
            protein_g: computedProtein,
            carbs_g: computedCarbs,
            fat_g: computedFat
          }),
          JSON.stringify(tags || []),
          item.orden,
          matchedFood?.id || null,
          estadoBase,
          estadoMostrado,
          roundedCantidadBase,
          roundedCantidadMostrada
        ]
      );

      inserted += 1;
      if (!matchedFood) {
        unmatchedItems.push(item.alimentoNombre);
      }
    }

    await client.query('COMMIT');
    return {
      inserted_items: inserted,
      unmatched_items: [...new Set(unmatchedItems)],
      skipped: false
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}


function mapMethodologyToTrainingType(value) {
  if (!value) return null;
  const normalized = String(value).toLowerCase();
  if (normalized.includes('hipertrofia')) return 'hipertrofia';
  if (normalized.includes('fuerza') || normalized.includes('power') || normalized.includes('heavy')) return 'fuerza';
  if (normalized.includes('resistencia') || normalized.includes('cardio') || normalized.includes('oposicion')) {
    return 'resistencia';
  }
  return 'general';
}

async function getDeterministicTemplateCandidates({ userId, mealType, dayInfo, profile, userFoodFilters }) {
  const phaseContext = resolvePhaseContext(profile);
  const dayTypeContext = String(dayInfo?.tipo_dia || '').toLowerCase() === 'entreno' ? 'ENTRENO' : null;
  const contexts = [
    normalizeTemplateContext(phaseContext),
    normalizeTemplateContext(dayTypeContext),
    'AMBOS'
  ].filter((value, index, self) => value && self.indexOf(value) === index);

  const diet = userFoodFilters?.diet || 'omnivoro';
  const templateDietList = diet === 'omnivoro' ? ['AMBOS', 'VEG'] : ['VEG'];

  const candidatesQuery = `
    SELECT *
    FROM app.meal_templates
    WHERE is_active = TRUE
      AND meal_type = $1
      AND diet_allowed = ANY($2)
      AND day_context = ANY($3)
    ORDER BY template_code;
  `;
  let candidates = (await pool.query(candidatesQuery, [mealType, templateDietList, contexts])).rows;

  if (candidates.length === 0) {
    const fallbackQuery = `
      SELECT *
      FROM app.meal_templates
      WHERE is_active = TRUE
        AND meal_type = $1
        AND diet_allowed = ANY($2)
      ORDER BY template_code;
    `;
    candidates = (await pool.query(fallbackQuery, [mealType, templateDietList])).rows;
  }

  if (candidates.length === 0) {
    throw new Error(`No hay plantillas disponibles para meal_type=${mealType}`);
  }

  const seed = hashString(`${userId}|${dayInfo?.day_index || 0}|${mealType}|${profile?.current_phase || profile?.objetivo || 'none'}`);
  const startIndex = seed % candidates.length;
  return [
    ...candidates.slice(startIndex),
    ...candidates.slice(0, startIndex)
  ];
}

async function getRecipeExampleCandidates({ userId, mealType, meal, dayInfo, profile, userFoodFilters, varietyContext = null }) {
  const phaseContext = resolvePhaseContext(profile);
  const dayTypeContext = String(dayInfo?.tipo_dia || '').toLowerCase() === 'entreno' ? 'ENTRENO' : null;
  const contexts = [
    normalizeTemplateContext(phaseContext),
    normalizeTemplateContext(dayTypeContext),
    'AMBOS'
  ].filter((value, index, self) => value && self.indexOf(value) === index);

  const diet = userFoodFilters?.diet || 'omnivoro';
  const recipeDietList = diet === 'omnivoro' ? ['AMBOS', 'VEG'] : ['VEG'];
  const snackSlotTag = mealType === 'SNACK' ? resolveSnackSlotTag(meal) : null;
  const mealSeedSuffix = buildMealSelectionSeedSuffix(meal);

  const orderCandidates = (rows, seedSuffix = '') => {
    const usedRecipeCodes = varietyContext?.sameDayUsedRecipeCodes || null;
    const filtered = usedRecipeCodes && usedRecipeCodes.size > 0
      ? rows.filter((row) => !usedRecipeCodes.has(String(row.recipe_code || '').trim()))
      : rows;
    const candidates = filtered.length > 0 ? filtered : rows;
    const seed = hashString(
      `${userId}|${dayInfo?.day_index || 0}|${mealType}|${profile?.current_phase || profile?.objetivo || 'none'}|recipe_examples|${mealSeedSuffix}|${seedSuffix}`
    );
    const startIndex = seed % candidates.length;
    return [
      ...candidates.slice(startIndex),
      ...candidates.slice(0, startIndex)
    ];
  };

  if (mealType === 'SNACK' && snackSlotTag) {
    const snackCandidatesQuery = `
      SELECT
        r.id,
        r.recipe_code,
        COALESCE(r.name_normalized, r.name) AS name,
        r.meal_type,
        r.diet_allowed,
        r.day_context
      FROM app.recipes r
      JOIN app.recipe_tags rt
        ON rt.recipe_id = r.id
      WHERE r.is_active = TRUE
        AND r.meal_type = $1
        AND r.diet_allowed = ANY($2)
        AND r.day_context = ANY($3)
        AND rt.tag = $4
      ORDER BY r.recipe_code;
    `;
    const snackCandidates = (
      await pool.query(snackCandidatesQuery, [mealType, recipeDietList, contexts, snackSlotTag])
    ).rows;

    if (snackCandidates.length > 0) {
      return orderCandidates(snackCandidates, snackSlotTag);
    }
  }

  const candidatesQuery = `
    SELECT
      id,
      recipe_code,
      COALESCE(name_normalized, name) AS name,
      meal_type,
      diet_allowed,
      day_context
    FROM app.recipes
    WHERE is_active = TRUE
      AND meal_type = $1
      AND diet_allowed = ANY($2)
      AND day_context = ANY($3)
    ORDER BY recipe_code;
  `;
  let candidates = (await pool.query(candidatesQuery, [mealType, recipeDietList, contexts])).rows;

  if (candidates.length === 0) {
    const fallbackQuery = `
      SELECT
        id,
        recipe_code,
        COALESCE(name_normalized, name) AS name,
        meal_type,
        diet_allowed,
        day_context
      FROM app.recipes
      WHERE is_active = TRUE
        AND meal_type = $1
        AND diet_allowed = ANY($2)
      ORDER BY recipe_code;
    `;
    candidates = (await pool.query(fallbackQuery, [mealType, recipeDietList])).rows;
  }

  if (candidates.length === 0) {
    throw new Error(`No hay recetas disponibles para meal_type=${mealType}`);
  }

  return orderCandidates(candidates);
}

function resolveRulesDietType(userFoodFilters) {
  const diet = String(userFoodFilters?.diet || 'omnivoro').toLowerCase();
  return diet === 'omnivoro' ? 'AMBOS' : 'VEG';
}

async function loadMealAcceptabilityRule({ mealType, dietType }) {
  try {
    const result = await pool.query(
      `
        SELECT
          id,
          meal_type,
          diet_type,
          max_processed_items,
          forbidden_families,
          required_families,
          notes
        FROM app.meal_acceptability_rules
        WHERE is_active = TRUE
          AND meal_type = $1
          AND diet_type IN ($2, 'AMBOS')
        ORDER BY CASE WHEN diet_type = $2 THEN 0 ELSE 1 END, updated_at DESC
        LIMIT 1;
      `,
      [mealType, dietType]
    );

    return result.rows[0] || null;
  } catch (error) {
    if (error?.code === '42P01') {
      return null;
    }
    throw error;
  }
}

async function loadPairingRules({ mealType, candidateSlugs = [] }) {
  const normalizedSlugs = [...new Set(
    candidateSlugs
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
  )];

  if (normalizedSlugs.length === 0) {
    return [];
  }

  try {
    const result = await pool.query(
      `
        SELECT
          id,
          food_slug_a,
          food_slug_b,
          rule_type,
          penalty,
          contexts,
          reason
        FROM app.food_pairing_rules
        WHERE is_active = TRUE
          AND rule_type IN ('forbidden', 'penalty')
          AND ($1 = ANY(contexts))
          AND (
            LOWER(food_slug_a) = ANY($2)
            OR LOWER(food_slug_b) = ANY($2)
          );
      `,
      [mealType, normalizedSlugs]
    );

    return result.rows;
  } catch (error) {
    if (error?.code === '42P01') {
      return [];
    }
    throw error;
  }
}

function getRoleGramBounds(roleValue, porcionTipica, food = null) {
  const role = String(roleValue || '').toUpperCase();
  let base;
  if (role.includes('GRASA') || role.includes('ACEITE')) {
    base = { min: 4, max: 35 };
  } else if (role.includes('SUPLEMENTO_PROTEINA')) {
    base = { min: 20, max: 60 };
  } else if (role === 'VERDURA') {
    base = resolveVegetablePortionProfile(food);
  } else if (role === 'FRUTA') {
    base = { min: 80, max: 320 };
  } else if (role.includes('CARBO') || role === 'LEGUMBRE') {
    base = { min: 45, max: 220 };
  } else if (role.includes('PROTEINA') || role === 'HUEVO' || role === 'CLARAS' || role.includes('LACTEO')) {
    base = { min: 70, max: 260 };
  } else {
    base = { min: 25, max: 320 };
  }

  const pt = parseNumeric(porcionTipica);
  if (pt && pt > 0) {
    if (role === 'VERDURA') {
      const minMultiplier = base.type === 'leafy' ? 0.6 : 0.75;
      const maxMultiplier = base.type === 'leafy' ? 1.1 : 1.2;
      const min = Math.max(base.min, Math.round(pt * minMultiplier));
      const max = Math.min(base.max, Math.round(pt * maxMultiplier));
      return { min, max: Math.max(max, min) };
    }

    if (role.includes('PROTEINA') || role === 'HUEVO' || role === 'CLARAS' || role.includes('LACTEO')) {
      const min = Math.max(base.min, Math.round(pt * 0.75));
      const max = Math.min(base.max, Math.max(Math.round(pt * 2.4), min));
      return { min, max: Math.max(max, min) };
    }

    if (role.includes('CARBO') || role === 'LEGUMBRE') {
      const min = Math.max(base.min, Math.round(pt * 0.7));
      const max = Math.min(base.max, Math.max(Math.round(pt * 2.2), min));
      return { min, max: Math.max(max, min) };
    }

    if (role.includes('GRASA') || role.includes('ACEITE')) {
      const min = Math.max(base.min, Math.round(pt * 0.6));
      const max = Math.min(base.max, Math.max(Math.round(pt * 1.8), min));
      return { min, max: Math.max(max, min) };
    }

    return {
      min: Math.max(base.min, Math.round(pt * 0.5)),
      max: Math.min(base.max, Math.round(pt * 1.5))
    };
  }

  return base;
}

function scoreFoodForRole(food, role, varietyContext = null) {
  const weights = getRoleMacroWeights(role);
  const desiredTotal = weights.protein + weights.carbs + weights.fat;
  const desired = {
    protein: desiredTotal > 0 ? weights.protein / desiredTotal : 0.33,
    carbs: desiredTotal > 0 ? weights.carbs / desiredTotal : 0.33,
    fat: desiredTotal > 0 ? weights.fat / desiredTotal : 0.33
  };

  const macros = parseJsonObject(food.macros_100g, {});
  const protein = Math.max(0, parseNumeric(macros.protein_g) ?? 0);
  const carbs = Math.max(0, parseNumeric(macros.carbs_g) ?? 0);
  const fat = Math.max(0, parseNumeric(macros.fat_g) ?? 0);
  const total = protein + carbs + fat;

  if (total <= 0) {
    return 999;
  }

  const actual = {
    protein: protein / total,
    carbs: carbs / total,
    fat: fat / total
  };

  let score = (
    Math.abs(actual.protein - desired.protein) * 1.4
    + Math.abs(actual.carbs - desired.carbs) * 1.2
    + Math.abs(actual.fat - desired.fat) * 1.2
  );

  if (desired.protein >= 0.45 && protein < 12) {
    score += (12 - protein) / 8;
  }
  if (desired.carbs >= 0.45 && carbs < 12) {
    score += (12 - carbs) / 8;
  }
  if (desired.fat >= 0.45 && fat < 6) {
    score += (6 - fat) / 6;
  }

  if (String(role || '').toUpperCase() === 'VERDURA') {
    // Penaliza verduras excesivamente densas en carbo/kcal para que no "sustituyan" al rol CARBO.
    const kcal = Math.max(0, parseNumeric(macros.kcal) ?? ((protein * 4) + (carbs * 4) + (fat * 9)));
    if (carbs > 12) {
      score += (carbs - 12) / 6;
    }
    if (kcal > 70) {
      score += (kcal - 70) / 35;
    }
  }

  score += getFoodVarietyPenalty(food, varietyContext);

  return Number(score.toFixed(6));
}

function orderSlotCandidates({ candidates, role, userId, dayInfo, meal, slotOrder, varietyContext = null }) {
  const seedBase = `${userId}|${dayInfo?.day_index || 0}|${meal?.orden || 0}|${slotOrder}|${role}`;
  return [...candidates].sort((left, right) => {
    const leftScore = scoreFoodForRole(left, role, varietyContext);
    const rightScore = scoreFoodForRole(right, role, varietyContext);
    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }

    const leftSeed = hashString(`${seedBase}|${left.id}`) % 10000;
    const rightSeed = hashString(`${seedBase}|${right.id}`) % 10000;
    if (leftSeed !== rightSeed) {
      return leftSeed - rightSeed;
    }

    return String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es');
  });
}

function buildSlotOptionsForTemplate({
  template,
  slots,
  roleFoodsMap,
  userId,
  dayInfo,
  meal,
  varietyContext = null
}) {
  return slots.map((slot) => {
    const role = String(slot.slot_role || '').toUpperCase();
    const roleFallbacks = [role, ...(SLOT_ROLE_FALLBACKS[role] || [])];
    let orderedCandidates = [];

    for (const roleCandidate of roleFallbacks) {
      const roleCandidates = roleFoodsMap.get(roleCandidate) || [];
      if (roleCandidates.length === 0) {
        continue;
      }

      orderedCandidates = orderSlotCandidates({
        candidates: roleCandidates,
        role,
        userId,
        dayInfo,
        meal,
        slotOrder: slot.slot_order,
        varietyContext
      }).slice(0, DETERMINISTIC_MAX_SLOT_OPTIONS);

      if (orderedCandidates.length > 0) {
        break;
      }
    }

    if (varietyContext?.sameDayUsedFoodIds?.size) {
      const nonRepeated = orderedCandidates.filter(
        (candidate) => !varietyContext.sameDayUsedFoodIds.has(String(candidate.id))
      );
      if (nonRepeated.length > 0) {
        orderedCandidates = nonRepeated;
      }
    }

    if (orderedCandidates.length === 0) {
      throw new Error(`No hay alimentos para slot_role=${role} en plantilla ${template.template_code}`);
    }

    return {
      slot,
      role,
      candidates: orderedCandidates
    };
  });
}

function buildSlotCombinations(slotOptions) {
  const combinations = [];
  const current = [];
  const usedIds = new Set();

  function backtrack(index) {
    if (combinations.length >= DETERMINISTIC_MAX_SLOT_COMBINATIONS) {
      return;
    }

    if (index >= slotOptions.length) {
      combinations.push([...current]);
      return;
    }

    const slotOption = slotOptions[index];
    const preferred = slotOption.candidates.filter((candidate) => !usedIds.has(candidate.id));
    const listToUse = preferred.length > 0 ? preferred : slotOption.candidates;

    for (const candidate of listToUse) {
      const wasUsed = usedIds.has(candidate.id);
      current.push({
        slot: slotOption.slot,
        role: slotOption.role,
        food: candidate
      });

      if (!wasUsed) {
        usedIds.add(candidate.id);
      }

      backtrack(index + 1);

      if (!wasUsed) {
        usedIds.delete(candidate.id);
      }
      current.pop();

      if (combinations.length >= DETERMINISTIC_MAX_SLOT_COMBINATIONS) {
        break;
      }
    }
  }

  backtrack(0);
  return combinations;
}

function buildDraftItemsForTemplate({ selectedItems, mealMacros, mealKcalTarget }) {
  return selectedItems.map((entry) => {
    const roleWeights = getRoleMacroWeights(entry.role);
    const bounds = getRoleGramBounds(entry.role, entry.food.porcion_tipica_g, entry.food);
    const macros100 = parseJsonObject(entry.food.macros_100g, {});
    const proteinPerG = (parseNumeric(macros100.protein_g) ?? 0) / 100;
    const carbsPerG = (parseNumeric(macros100.carbs_g) ?? 0) / 100;
    const fatPerG = (parseNumeric(macros100.fat_g) ?? 0) / 100;
    const kcalPerG = (parseNumeric(macros100.kcal) ?? ((proteinPerG * 4) + (carbsPerG * 4) + (fatPerG * 9)) * 100) / 100;

    const estimations = [];
    if (proteinPerG > 0 && roleWeights.protein > 0) {
      estimations.push((mealMacros.protein_g * roleWeights.protein) / proteinPerG);
    }
    if (carbsPerG > 0 && roleWeights.carbs > 0) {
      estimations.push((mealMacros.carbs_g * roleWeights.carbs) / carbsPerG);
    }
    if (fatPerG > 0 && roleWeights.fat > 0) {
      estimations.push((mealMacros.fat_g * roleWeights.fat) / fatPerG);
    }

    let gramosBase = null;
    if (estimations.length > 0) {
      const estimationAverage = estimations.reduce((acc, value) => acc + value, 0) / estimations.length;
      gramosBase = clampNumber(estimationAverage, bounds.min, bounds.max);
    } else if (kcalPerG > 0) {
      gramosBase = clampNumber((mealKcalTarget * roleWeights.kcal) / kcalPerG, bounds.min, bounds.max);
    } else {
      gramosBase = clampNumber(30, bounds.min, bounds.max);
    }

    return {
      role: entry.role,
      food: entry.food,
      macros100,
      proteinPerG,
      carbsPerG,
      fatPerG,
      kcalPerG,
      bounds,
      gramosBase
    };
  });
}

function optimizeDraftItemGrams({ draftItems, mealMacros, mealKcalTarget }) {
  const goals = [];
  if (mealMacros.protein_g > 0) {
    goals.push({ key: 'protein', target: mealMacros.protein_g, weight: 2.3, scale: Math.max(15, mealMacros.protein_g) });
  }
  if (mealMacros.carbs_g > 0) {
    goals.push({ key: 'carbs', target: mealMacros.carbs_g, weight: 1.9, scale: Math.max(20, mealMacros.carbs_g) });
  }
  if (mealMacros.fat_g > 0) {
    goals.push({ key: 'fat', target: mealMacros.fat_g, weight: 1.7, scale: Math.max(8, mealMacros.fat_g) });
  }
  if (mealKcalTarget > 0) {
    goals.push({ key: 'kcal', target: mealKcalTarget, weight: 0.35, scale: Math.max(120, mealKcalTarget) });
  }

  if (goals.length === 0) {
    return draftItems.map((item) => Number(item.gramosBase.toFixed(2)));
  }

  const grams = draftItems.map((item) => clampNumber(item.gramosBase, item.bounds.min, item.bounds.max));
  const totals = { protein: 0, carbs: 0, fat: 0, kcal: 0 };
  draftItems.forEach((item, index) => {
    const value = grams[index];
    totals.protein += item.proteinPerG * value;
    totals.carbs += item.carbsPerG * value;
    totals.fat += item.fatPerG * value;
    totals.kcal += item.kcalPerG * value;
  });

  for (let iteration = 0; iteration < DETERMINISTIC_COORDINATE_ITERATIONS; iteration += 1) {
    let changed = false;

    for (let index = 0; index < draftItems.length; index += 1) {
      const item = draftItems[index];
      const oldValue = grams[index];
      const without = {
        protein: totals.protein - (item.proteinPerG * oldValue),
        carbs: totals.carbs - (item.carbsPerG * oldValue),
        fat: totals.fat - (item.fatPerG * oldValue),
        kcal: totals.kcal - (item.kcalPerG * oldValue)
      };

      let alpha = 0;
      let beta = 0;

      for (const goal of goals) {
        const a = goal.key === 'protein'
          ? item.proteinPerG
          : goal.key === 'carbs'
            ? item.carbsPerG
            : goal.key === 'fat'
              ? item.fatPerG
              : item.kcalPerG;

        if (!Number.isFinite(a) || a === 0) {
          continue;
        }

        const coeff = goal.weight / (goal.scale * goal.scale);
        const delta = without[goal.key] - goal.target;
        alpha += coeff * a * a;
        beta += 2 * coeff * a * delta;
      }

      let optimized = oldValue;
      if (alpha > 0) {
        optimized = -beta / (2 * alpha);
      }

      optimized = clampNumber(optimized, item.bounds.min, item.bounds.max);
      if (!Number.isFinite(optimized)) {
        optimized = oldValue;
      }

      if (Math.abs(optimized - oldValue) > 0.01) {
        changed = true;
      }

      grams[index] = optimized;
      totals.protein = without.protein + (item.proteinPerG * optimized);
      totals.carbs = without.carbs + (item.carbsPerG * optimized);
      totals.fat = without.fat + (item.fatPerG * optimized);
      totals.kcal = without.kcal + (item.kcalPerG * optimized);
    }

    if (!changed) {
      break;
    }
  }

  return grams.map((value, index) => {
    const bounds = draftItems[index].bounds;
    return Number(clampNumber(value, bounds.min, bounds.max).toFixed(2));
  });
}

function buildDeterministicMenuItems({ draftItems, optimizedGrams, conversionMap }) {
  return draftItems.map((item, index) => {
    const gramosBase = optimizedGrams[index];
    const estadoBase = normalizeEstadoPesado(item.food.estado_pesado_base) || 'tal_cual';
    const estadoMostradoRequested = normalizeEstadoPesado(item.food.estado_pesado_mostrado_default) || estadoBase;
    const grupoFactor = item.food.grupo_factor ? String(item.food.grupo_factor).toLowerCase() : null;
    const conversionState = resolveShownStateConversion({
      grupoFactor,
      estadoBase,
      estadoMostrado: estadoMostradoRequested,
      conversionMap
    });
    const estadoMostrado = conversionState.estadoMostradoFinal;
    const gramosMostrados = gramosBase * conversionState.factor;

    const protein = Number((item.proteinPerG * gramosBase).toFixed(2));
    const carbs = Number((item.carbsPerG * gramosBase).toFixed(2));
    const fat = Number((item.fatPerG * gramosBase).toFixed(2));
    const kcal = Math.round((protein * 4) + (carbs * 4) + (fat * 9));

    return {
      alimento_nombre: item.food.nombre,
      food_slug: item.food.slug,
      role: item.role,
      cantidad_g: Number(gramosMostrados.toFixed(1)),
      cantidad_g_base: Number(gramosBase.toFixed(1)),
      cantidad_g_mostrada: Number(gramosMostrados.toFixed(1)),
      estado_pesado_base: estadoBase,
      estado_pesado_mostrado: estadoMostrado,
      conversion_blocked_reason: conversionState.blockedReason,
      kcal,
      macros: {
        protein_g: protein,
        carbs_g: carbs,
        fat_g: fat
      }
    };
  });
}

async function generateDeterministicMenuForMeal({
  userId,
  meal,
  dayInfo,
  varietyContext = null
}) {
  const profileResult = await pool.query(
    `
      SELECT preferencias, alergias, objetivo, current_phase
      FROM app.nutrition_profiles
      WHERE user_id = $1;
    `,
    [userId]
  );

  const userProfile = profileResult.rows[0] || {
    preferencias: {},
    alergias: [],
    objetivo: null,
    current_phase: null
  };
  const userFoodFilters = buildFoodFiltersFromUserPreferences(userProfile);
  const mealType = resolveMealType(meal);
  const templateCandidates = await getDeterministicTemplateCandidates({
    userId,
    mealType,
    dayInfo,
    profile: userProfile,
    userFoodFilters
  });
  const templatesToEvaluate = templateCandidates.slice(0, DETERMINISTIC_MAX_TEMPLATE_TRIES);

  const slotsResult = await pool.query(
    `
      SELECT *
      FROM app.meal_template_slots
      WHERE template_id = ANY($1)
      ORDER BY template_id, slot_order;
    `,
    [templatesToEvaluate.map((template) => template.id)]
  );
  const slotsByTemplateId = new Map();
  for (const slot of slotsResult.rows) {
    if (!slotsByTemplateId.has(slot.template_id)) {
      slotsByTemplateId.set(slot.template_id, []);
    }
    slotsByTemplateId.get(slot.template_id).push(slot);
  }

  const allRoles = [...new Set(
    slotsResult.rows
      .map((slot) => String(slot.slot_role || '').toUpperCase())
      .filter(Boolean)
  )];
  if (allRoles.length === 0) {
    throw new Error(`No hay slots configurados para meal_type=${mealType}`);
  }

  const foodsByRoleResult = await pool.query(
    `
      SELECT
        fr.role,
        f.id,
        f.slug,
        f.nombre,
        f.categoria,
        f.categoria_detalle,
        f.macros_100g,
        f.tags,
        f.estado_pesado_base,
        f.estado_pesado_mostrado_default,
        f.grupo_factor,
        f.porcion_tipica_g,
        f.is_vegetarian,
        f.is_vegan,
        f.meal_suitability,
        f.processing_level,
        f.culinary_family,
        f.is_snack_only,
        f.is_main_dish_allowed,
        f.palatability_score
      FROM app.food_roles fr
      JOIN app.foods f ON f.id = fr.food_id
      WHERE fr.role = ANY($1::text[])
        AND f.is_verified = TRUE
      ORDER BY fr.role, f.nombre;
    `,
    [allRoles]
  );

  const roleFoodsMap = new Map();
  for (const row of foodsByRoleResult.rows) {
    const role = String(row.role || '').toUpperCase();
    if (!matchesFoodFilters(row, userFoodFilters)) {
      continue;
    }
    if (!roleFoodsMap.has(role)) {
      roleFoodsMap.set(role, []);
    }
    roleFoodsMap.get(role).push(row);
  }

  const mealMacros = parseMealMacros(meal);
  const mealKcalTarget = parseNumeric(meal?.kcal) ?? Math.round(
    (mealMacros.protein_g * 4) + (mealMacros.carbs_g * 4) + (mealMacros.fat_g * 9)
  );
  const fallbackMealKcalTarget = mealKcalTarget > 0
    ? mealKcalTarget
    : Math.round((mealMacros.protein_g * 4) + (mealMacros.carbs_g * 4) + (mealMacros.fat_g * 9));

  const allAvailableFoods = [...roleFoodsMap.values()].flat();
  const groupFactors = [...new Set(
    allAvailableFoods
      .map((food) => food.grupo_factor)
      .filter(Boolean)
      .map((value) => String(value).toLowerCase())
  )];
  let conversionRows = [];
  if (groupFactors.length > 0) {
    const conversionResult = await pool.query(
      `
        SELECT grupo_factor, estado_base, estado_objetivo, factor_base_objetivo
        FROM app.food_conversion_factors
        WHERE grupo_factor = ANY($1);
      `,
      [groupFactors]
    );
    conversionRows = conversionResult.rows;
  }

  const conversionMap = new Map();
  conversionRows.forEach((row) => {
    const key = `${String(row.grupo_factor).toLowerCase()}|${normalizeEstadoPesado(row.estado_base)}|${normalizeEstadoPesado(row.estado_objetivo)}`;
    conversionMap.set(key, parseNumeric(row.factor_base_objetivo) ?? 0);
  });

  let bestResult = null;
  let bestBlockedResult = null;
  let balanceBlockedCount = 0;
  let balanceBlockedExample = null;

  for (let index = 0; index < templatesToEvaluate.length; index += 1) {
    const template = templatesToEvaluate[index];
    const slots = slotsByTemplateId.get(template.id) || [];
    if (slots.length === 0) {
      continue;
    }

    let slotOptions;
    try {
      slotOptions = buildSlotOptionsForTemplate({
        template,
        slots,
        roleFoodsMap,
        userId,
        dayInfo,
        meal,
        varietyContext
      });
    } catch {
      continue;
    }

    if (!slotOptions || slotOptions.length === 0) {
      continue;
    }

    const combinations = buildSlotCombinations(slotOptions);
    let bestTemplateResult = null;

    for (const selectedItems of combinations) {
      const draftItems = buildDraftItemsForTemplate({
        selectedItems,
        mealMacros,
        mealKcalTarget: fallbackMealKcalTarget
      });
      const optimizedGrams = optimizeDraftItemGrams({
        draftItems,
        mealMacros,
        mealKcalTarget: fallbackMealKcalTarget
      });
      const menuItems = buildDeterministicMenuItems({
        draftItems,
        optimizedGrams,
        conversionMap
      });

      const totals = calculateMacroTotals(menuItems);
      const validation = {
        kcal_total: Math.round(totals.kcal),
        macros_totales: {
          protein_g: Number(totals.protein_g.toFixed(2)),
          carbs_g: Number(totals.carbs_g.toFixed(2)),
          fat_g: Number(totals.fat_g.toFixed(2))
        },
        error_kcal_porcentaje: percentError(totals.kcal, fallbackMealKcalTarget),
        error_protein_porcentaje: percentError(totals.protein_g, mealMacros.protein_g),
        error_carbs_porcentaje: percentError(totals.carbs_g, mealMacros.carbs_g),
        error_fat_porcentaje: percentError(totals.fat_g, mealMacros.fat_g)
      };
      const maxError = Math.max(
        validation.error_kcal_porcentaje,
        validation.error_protein_porcentaje,
        validation.error_carbs_porcentaje,
        validation.error_fat_porcentaje
      );
      const avgMacroError = (
        validation.error_protein_porcentaje
        + validation.error_carbs_porcentaje
        + validation.error_fat_porcentaje
      ) / 3;
      const balanceEval = evaluateCandidateMealBalance(menuItems, mealMacros, fallbackMealKcalTarget);
      const emergencyScore = Number(((maxError * 0.75) + (avgMacroError * 0.25) + balanceEval.penaltyScore + 50).toFixed(6));
      const blockedCandidateResult = {
        menu: {
          items: menuItems,
          instrucciones: `Menú determinista de rescate generado con plantilla ${template.template_name}.`,
          notas: `Plantilla ${template.template_code} (${template.day_context}/${template.diet_allowed}) usada como fallback de balance.`,
          validacion: validation
        },
        metadata: {
          mode: 'deterministic',
          template_code: template.template_code,
          template_name: template.template_name,
          total_slots: slots.length,
          max_error: maxError,
          target_within_tolerance: false,
          evaluated_templates: templatesToEvaluate.length,
          selected_template_rank: index + 1,
          evaluated_combinations: combinations.length,
          nutrient_balance_warnings: balanceEval.nonBlockingWarnings,
          nutrient_balance_blocked_candidates: balanceBlockedCount,
          emergency_balance_override: true,
          emergency_reason: 'all_candidates_blocked_by_balance'
        },
        availableFoods: draftItems.map((item) => item.food),
        score: emergencyScore
      };
      if (balanceEval.blocksCandidate) {
        balanceBlockedCount += 1;
        if (!balanceBlockedExample) {
          balanceBlockedExample = {
            template_code: template.template_code,
            warnings: balanceEval.blockingWarnings.slice(0, 3)
          };
        }
        if (!bestBlockedResult || blockedCandidateResult.score < bestBlockedResult.score) {
          bestBlockedResult = blockedCandidateResult;
        }
        continue;
      }

      const score = Number(((maxError * 0.75) + (avgMacroError * 0.25) + balanceEval.penaltyScore).toFixed(6));

      const candidateResult = {
        menu: {
          items: menuItems,
          instrucciones: `Menú determinista generado con plantilla ${template.template_name}.`,
          notas: `Plantilla ${template.template_code} (${template.day_context}/${template.diet_allowed}).`,
          validacion: validation
        },
        metadata: {
          mode: 'deterministic',
          template_code: template.template_code,
          template_name: template.template_name,
          total_slots: slots.length,
          max_error: maxError,
          target_within_tolerance: maxError <= 2,
          evaluated_templates: templatesToEvaluate.length,
          selected_template_rank: index + 1,
          evaluated_combinations: combinations.length,
          nutrient_balance_warnings: balanceEval.nonBlockingWarnings.length > 0 ? balanceEval.nonBlockingWarnings : null,
          nutrient_balance_blocked_candidates: balanceBlockedCount
        },
        availableFoods: draftItems.map((item) => item.food),
        score
      };

      if (!bestTemplateResult || candidateResult.score < bestTemplateResult.score) {
        bestTemplateResult = candidateResult;
      }
      if (maxError <= 2) {
        break;
      }
    }

    if (!bestTemplateResult) {
      continue;
    }

    if (!bestResult || bestTemplateResult.score < bestResult.score) {
      bestResult = bestTemplateResult;
    }

    if (bestTemplateResult.metadata.max_error <= 2) {
      break;
    }
  }

  if (!bestResult) {
    if (bestBlockedResult) {
      console.warn(`⚠️ Deterministic emergency fallback for meal_type=${mealType}: all candidates blocked by balance, returning least-bad candidate.`);
      return {
        menu: bestBlockedResult.menu,
        metadata: bestBlockedResult.metadata,
        availableFoods: bestBlockedResult.availableFoods
      };
    }
    if (balanceBlockedCount > 0) {
      const exampleCode = balanceBlockedExample?.template_code || 'N/A';
      const exampleWarningCodes = (balanceBlockedExample?.warnings || [])
        .map((warning) => warning?.code)
        .filter(Boolean)
        .join(',');
      throw new Error(
        `No se pudo construir menú determinista para meal_type=${mealType}: balance nutricional bloqueó ${balanceBlockedCount} combinaciones (ejemplo: ${exampleCode}${exampleWarningCodes ? `; warnings=${exampleWarningCodes}` : ''})`
      );
    }
    throw new Error(`No se pudo construir menú determinista para meal_type=${mealType}`);
  }

  return {
    menu: bestResult.menu,
    metadata: bestResult.metadata,
    availableFoods: bestResult.availableFoods
  };
}

async function generateRecipeExamplesMenuForMeal({
  userId,
  meal,
  dayInfo,
  varietyContext = null
}) {
  const profileResult = await pool.query(
    `
      SELECT preferencias, alergias, objetivo, current_phase
      FROM app.nutrition_profiles
      WHERE user_id = $1;
    `,
    [userId]
  );

  const userProfile = profileResult.rows[0] || {
    preferencias: {},
    alergias: [],
    objetivo: null,
    current_phase: null
  };
  const userFoodFilters = buildFoodFiltersFromUserPreferences(userProfile);
  const mealType = resolveMealType(meal);
  const recipeCandidates = await getRecipeExampleCandidates({
    userId,
    mealType,
    meal,
    dayInfo,
    profile: userProfile,
    userFoodFilters,
    varietyContext
  });
  const recipesToEvaluate = recipeCandidates.slice(0, DETERMINISTIC_MAX_RECIPE_TRIES);

  const recipeItemsResult = await pool.query(
    `
      SELECT
        ri.recipe_id,
        ri.slot_order,
        ri.role,
        r.recipe_code,
        COALESCE(r.name_normalized, r.name) AS recipe_name,
        r.day_context,
        r.diet_allowed,
        f.id,
        f.slug,
        f.nombre,
        f.categoria,
        f.categoria_detalle,
        f.macros_100g,
        f.tags,
        f.estado_pesado_base,
        f.estado_pesado_mostrado_default,
        f.grupo_factor,
        f.is_vegetarian,
        f.is_vegan,
        f.meal_suitability,
        f.processing_level,
        f.culinary_family,
        f.is_snack_only,
        f.is_main_dish_allowed,
        f.palatability_score
      FROM app.recipe_items ri
      JOIN app.recipes r ON r.id = ri.recipe_id
      JOIN app.foods f ON f.id = ri.food_id
      WHERE ri.recipe_id = ANY($1)
        AND f.is_verified = TRUE
      ORDER BY ri.recipe_id, ri.slot_order;
    `,
    [recipesToEvaluate.map((recipe) => recipe.id)]
  );

  const recipeItemsMap = new Map();
  for (const row of recipeItemsResult.rows) {
    if (!recipeItemsMap.has(row.recipe_id)) {
      recipeItemsMap.set(row.recipe_id, []);
    }
    recipeItemsMap.get(row.recipe_id).push({
      slot_order: row.slot_order,
      role: String(row.role || '').toUpperCase() || 'CARBO_BASE',
      food: {
        id: row.id,
        slug: row.slug,
        nombre: row.nombre,
        categoria: row.categoria,
        categoria_detalle: row.categoria_detalle,
        macros_100g: row.macros_100g,
        tags: row.tags,
        estado_pesado_base: row.estado_pesado_base,
        estado_pesado_mostrado_default: row.estado_pesado_mostrado_default,
        grupo_factor: row.grupo_factor,
        is_vegetarian: row.is_vegetarian,
        is_vegan: row.is_vegan,
        meal_suitability: row.meal_suitability,
        processing_level: row.processing_level,
        culinary_family: row.culinary_family,
        is_snack_only: row.is_snack_only,
        is_main_dish_allowed: row.is_main_dish_allowed,
        palatability_score: row.palatability_score
      }
    });
  }

  const allRecipeFoods = [...recipeItemsMap.values()].flat().map((entry) => entry.food);
  const groupFactors = [...new Set(
    allRecipeFoods
      .map((food) => food.grupo_factor)
      .filter(Boolean)
      .map((value) => String(value).toLowerCase())
  )];
  let conversionRows = [];
  if (groupFactors.length > 0) {
    const conversionResult = await pool.query(
      `
        SELECT grupo_factor, estado_base, estado_objetivo, factor_base_objetivo
        FROM app.food_conversion_factors
        WHERE grupo_factor = ANY($1);
      `,
      [groupFactors]
    );
    conversionRows = conversionResult.rows;
  }
  const conversionMap = buildConversionMapFromRows(conversionRows);

  const mealMacros = parseMealMacros(meal);
  const mealKcalTarget = parseNumeric(meal?.kcal) ?? Math.round(
    (mealMacros.protein_g * 4) + (mealMacros.carbs_g * 4) + (mealMacros.fat_g * 9)
  );
  const fallbackMealKcalTarget = mealKcalTarget > 0
    ? mealKcalTarget
    : Math.round((mealMacros.protein_g * 4) + (mealMacros.carbs_g * 4) + (mealMacros.fat_g * 9));
  const rulesDietType = resolveRulesDietType(userFoodFilters);
  const mealAcceptabilityRule = await loadMealAcceptabilityRule({
    mealType,
    dietType: rulesDietType
  });
  const pairingRules = await loadPairingRules({
    mealType,
    candidateSlugs: allRecipeFoods.map((food) => food.slug)
  });

  let bestResult = null;
  let hardRuleBlockedCount = 0;
  let hardRuleBlockedExample = null;
  let balanceBlockedCount = 0;
  let balanceBlockedExample = null;

  for (let index = 0; index < recipesToEvaluate.length; index += 1) {
    const recipe = recipesToEvaluate[index];
    const recipeItems = recipeItemsMap.get(recipe.id) || [];
    if (recipeItems.length === 0) {
      continue;
    }

    const hardRuleResult = evaluateRecipeHardRules({
      mealType,
      recipeCode: recipe.recipe_code,
      recipeItems,
      // En recipe_examples evitamos bloquear por acumulado diario de procesados
      // para no quedarnos sin candidatas; el límite se evalúa por receta.
      varietyContext: null,
      maxProcessedItemsPerDay: 1,
      mealAcceptabilityRule,
      pairingRules
    });

    if (!hardRuleResult.isAllowed) {
      hardRuleBlockedCount += 1;
      if (!hardRuleBlockedExample) {
        hardRuleBlockedExample = {
          recipe_code: recipe.recipe_code,
          blocked_rules: hardRuleResult.blockedRules.slice(0, 3)
        };
      }
      continue;
    }

    const selectedItems = [];
    let invalidRecipe = false;
    let varietyPenalty = 0;

    for (const entry of recipeItems) {
      if (!matchesFoodFilters(entry.food, userFoodFilters)) {
        invalidRecipe = true;
        break;
      }
      varietyPenalty += getFoodVarietyPenalty(entry.food, varietyContext);
      selectedItems.push({
        role: entry.role,
        food: entry.food,
        slot: {
          slot_order: entry.slot_order,
          slot_role: entry.role
        }
      });
    }

    if (invalidRecipe || selectedItems.length === 0) {
      continue;
    }

    const draftItems = buildDraftItemsForTemplate({
      selectedItems,
      mealMacros,
      mealKcalTarget: fallbackMealKcalTarget
    });
    const optimizedGrams = optimizeDraftItemGrams({
      draftItems,
      mealMacros,
      mealKcalTarget: fallbackMealKcalTarget
    });
    const menuItems = buildDeterministicMenuItems({
      draftItems,
      optimizedGrams,
      conversionMap
    });

    const totals = calculateMacroTotals(menuItems);
    const validation = {
      kcal_total: Math.round(totals.kcal),
      macros_totales: {
        protein_g: Number(totals.protein_g.toFixed(2)),
        carbs_g: Number(totals.carbs_g.toFixed(2)),
        fat_g: Number(totals.fat_g.toFixed(2))
      },
      error_kcal_porcentaje: percentError(totals.kcal, fallbackMealKcalTarget),
      error_protein_porcentaje: percentError(totals.protein_g, mealMacros.protein_g),
      error_carbs_porcentaje: percentError(totals.carbs_g, mealMacros.carbs_g),
      error_fat_porcentaje: percentError(totals.fat_g, mealMacros.fat_g)
    };
    const maxError = Math.max(
      validation.error_kcal_porcentaje,
      validation.error_protein_porcentaje,
      validation.error_carbs_porcentaje,
      validation.error_fat_porcentaje
    );
    const avgMacroError = (
      validation.error_protein_porcentaje
      + validation.error_carbs_porcentaje
      + validation.error_fat_porcentaje
    ) / 3;
    const balanceEval = evaluateCandidateMealBalance(menuItems, mealMacros, fallbackMealKcalTarget);
    if (balanceEval.blocksCandidate) {
      balanceBlockedCount += 1;
      if (!balanceBlockedExample) {
        balanceBlockedExample = {
          recipe_code: recipe.recipe_code,
          warnings: balanceEval.blockingWarnings.slice(0, 3)
        };
      }
      continue;
    }
    const pairingPenaltyResult = computePairingPenaltyForRecipe({
      mealType,
      recipeItems: selectedItems,
      pairingRules
    });
    const palatabilityPenaltyResult = computeMealPalatabilityPenalty({
      mealType,
      recipeItems: selectedItems,
      varietyContext
    });
    const pairingPenaltyTotal = pairingPenaltyResult.totalPenalty;
    const pairingPenaltyScore = pairingPenaltyTotal * 0.05;
    const palatabilityPenaltyTotal = palatabilityPenaltyResult.totalPenalty;
    const palatabilityPenaltyScore = palatabilityPenaltyTotal * 0.7;
    const score = Number((
      (maxError * 0.75)
      + (avgMacroError * 0.25)
      + (varietyPenalty * 0.05)
      + pairingPenaltyScore
      + palatabilityPenaltyScore
      + balanceEval.penaltyScore
    ).toFixed(6));

    const candidateResult = {
      menu: {
        items: menuItems,
        instrucciones: `Menú recipe_examples generado con receta ${recipe.name}.`,
        notas: `Receta ${recipe.recipe_code} (${recipe.day_context}/${recipe.diet_allowed}).`,
        validacion: validation
      },
      metadata: {
        mode: 'recipe_examples',
        recipe_code: recipe.recipe_code,
        recipe_name: recipe.name,
        max_error: maxError,
        target_within_tolerance: maxError <= 2,
        evaluated_recipes: recipesToEvaluate.length,
        selected_recipe_rank: index + 1,
        recipe_items: selectedItems.length,
        nutrient_balance_warnings: balanceEval.nonBlockingWarnings.length > 0 ? balanceEval.nonBlockingWarnings : null,
        nutrient_balance_blocked_candidates: balanceBlockedCount,
        pairing_penalty: {
          total: pairingPenaltyTotal,
          matched_rules: pairingPenaltyResult.appliedPenaltyRules.length
        },
        palatability: {
          total_penalty: palatabilityPenaltyTotal,
          avg_main: palatabilityPenaltyResult.avgMainPalatability,
          avg_all: palatabilityPenaltyResult.avgAllPalatability,
          base_penalty: palatabilityPenaltyResult.basePenalty,
          contextual_penalty: palatabilityPenaltyResult.contextualPenalty,
          repeat_family_penalty: palatabilityPenaltyResult.repeatFamilyPenalty,
          repeated_main_families: palatabilityPenaltyResult.repeatedMainFamilies
        },
        hard_rules: {
          blocked_candidates: hardRuleBlockedCount,
          processed_items_in_selected_recipe: hardRuleResult.processedItemsInRecipe,
          applied_rule_source: mealAcceptabilityRule ? 'db' : 'default',
          meal_acceptability_rule_id: mealAcceptabilityRule?.id || null,
          forbidden_pairing_rules_loaded: pairingRules.filter((rule) => String(rule.rule_type).toLowerCase() === 'forbidden').length,
          penalty_pairing_rules_loaded: pairingRules.filter((rule) => String(rule.rule_type).toLowerCase() === 'penalty').length
        }
      },
      availableFoods: selectedItems.map((item) => item.food),
      score
    };

    if (!bestResult || candidateResult.score < bestResult.score) {
      bestResult = candidateResult;
    }

    if (maxError <= 2) {
      break;
    }
  }

  if (!bestResult) {
    if (balanceBlockedCount > 0) {
      const exampleCode = balanceBlockedExample?.recipe_code || 'N/A';
      const exampleWarningCodes = (balanceBlockedExample?.warnings || [])
        .map((warning) => warning?.code)
        .filter(Boolean)
        .join(',');
      throw new Error(
        `No se pudo construir menú recipe_examples para meal_type=${mealType}: balance nutricional bloqueó ${balanceBlockedCount} recetas (ejemplo: ${exampleCode}${exampleWarningCodes ? `; warnings=${exampleWarningCodes}` : ''})`
      );
    }
    if (hardRuleBlockedCount > 0) {
      const exampleCode = hardRuleBlockedExample?.recipe_code || 'N/A';
      const exampleRuleCodes = (hardRuleBlockedExample?.blocked_rules || [])
        .map((rule) => rule?.code)
        .filter(Boolean)
        .join(',');
      throw new Error(
        `No se pudo construir menú recipe_examples para meal_type=${mealType}: reglas hard bloquearon ${hardRuleBlockedCount} recetas (ejemplo: ${exampleCode}${exampleRuleCodes ? `; rules=${exampleRuleCodes}` : ''})`
      );
    }
    throw new Error(`No se pudo construir menú recipe_examples para meal_type=${mealType}`);
  }

  return {
    menu: bestResult.menu,
    metadata: bestResult.metadata,
    availableFoods: bestResult.availableFoods
  };
}

async function getUserMenuGenerationContext({ userId, foodsLimit = 100 }) {
  const profileResult = await pool.query(
    'SELECT preferencias, alergias FROM app.nutrition_profiles WHERE user_id = $1',
    [userId]
  );

  const userPreferencesRaw = profileResult.rows[0] || {
    preferencias: {},
    alergias: []
  };
  const userFoodFilters = buildFoodFiltersFromUserPreferences(userPreferencesRaw);
  const userPreferences = {
    preferencias: userFoodFilters.preferencias,
    alergias: userFoodFilters.alergias
  };

  const { whereSql, params } = buildFoodCatalogFilters({
    diet: userFoodFilters.diet,
    allergensExclude: userFoodFilters.allergensExclude,
    onlyVerified: true
  });

  const foodsQuery = `
      SELECT
        id,
        slug,
        nombre,
        categoria,
        categoria_detalle,
        macros_100g,
        tags,
      estado_pesado_base,
      estado_pesado_mostrado_default,
      grupo_factor,
      porcion_tipica_g
      FROM app.foods
      WHERE ${whereSql}
      ORDER BY nombre
      LIMIT $${params.length + 1};
    `;
  const foodsResult = await pool.query(foodsQuery, [...params, foodsLimit]);
  const availableFoods = foodsResult.rows;

  if (availableFoods.length === 0) {
    throw new Error('No hay alimentos disponibles para las preferencias/alergias del perfil');
  }

  return {
    userPreferences,
    userFoodFilters,
    availableFoods
  };
}

async function getMenuConversionFactors() {
  const factorsResult = await pool.query(
    `
      SELECT
        grupo_factor,
        estado_base,
        estado_objetivo,
        factor_base_objetivo
      FROM app.food_conversion_factors
      ORDER BY grupo_factor, estado_base, estado_objetivo;
    `
  );
  return factorsResult.rows;
}

async function safeLogMenuGeneration(logPayload) {
  try {
    await pool.query(
      `
        INSERT INTO app.nutrition_menu_generation_logs (
          user_id,
          plan_id,
          day_id,
          meal_id,
          mode_requested,
          mode_used,
          model_used,
          fallback_used,
          fallback_reason,
          tokens_used,
          latency_ms,
          request_payload,
          result_summary
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb
        );
      `,
      [
        logPayload.userId,
        logPayload.planId || null,
        logPayload.dayId || null,
        logPayload.mealId || null,
        logPayload.modeRequested || null,
        logPayload.modeUsed || null,
        logPayload.modelUsed || null,
        Boolean(logPayload.fallbackUsed),
        logPayload.fallbackReason || null,
        Number.isFinite(logPayload.tokensUsed) ? logPayload.tokensUsed : null,
        Number.isFinite(logPayload.latencyMs) ? logPayload.latencyMs : null,
        JSON.stringify(logPayload.requestPayload || {}),
        JSON.stringify(logPayload.resultSummary || {})
      ]
    );
  } catch (error) {
    if (String(error?.message || '').includes('nutrition_menu_generation_logs')) {
      console.warn('⚠️ Tabla app.nutrition_menu_generation_logs no disponible, se omite auditoría.');
      return;
    }
    console.warn('⚠️ No se pudo registrar auditoría de menú:', error.message);
  }
}

async function generateAiMenuForMeal({
  userId,
  meal,
  dayInfo,
  generationContext = null
}) {
  const context = generationContext || await getUserMenuGenerationContext({ userId, foodsLimit: 90 });

  const prompt = nutritionMenuGeneratorPrompt({
    meal,
    dayInfo,
    userPreferences: context.userPreferences,
    availableFoods: context.availableFoods
  });

  const aiClient = getOpenAIClient('nutrition');
  const model = process.env.NUTRITION_AI_MODEL || 'gpt-4o-mini';
  const completion = await aiClient.chat.completions.create({
    model,
    messages: [
      {
        role: 'system',
        content: 'Eres un nutricionista deportivo experto especializado en generar menús precisos que cumplan objetivos de macronutrientes. Respondes SOLO con JSON válido.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.7,
    max_tokens: 2000
  });

  const responseText = completion.choices[0].message.content.trim();
  let menuData;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    menuData = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
  } catch {
    console.error('Error parseando respuesta de IA:', responseText);
    throw new Error('La IA no generó un JSON válido');
  }

  const validation = parseJsonObject(menuData.validacion, {});
  const maxError = Math.max(
    parseNumeric(validation.error_kcal_porcentaje) ?? 0,
    parseNumeric(validation.error_protein_porcentaje) ?? 0,
    parseNumeric(validation.error_carbs_porcentaje) ?? 0,
    parseNumeric(validation.error_fat_porcentaje) ?? 0
  );

  return {
    menu: menuData,
    metadata: {
      model: completion.model,
      mode: 'ai',
      tokens_used: completion.usage?.total_tokens || null,
      max_error: maxError
    },
    availableFoods: context.availableFoods
  };
}

async function generateMenuForMeal({
  userId,
  meal,
  dayInfo,
  mode = 'deterministic',
  varietyContext = null,
  generationContext = null,
  conversionFactors = null
}) {
  const modeNormalized = String(mode || 'deterministic').toLowerCase();
  const startTime = Date.now();
  const planId = dayInfo?.plan_id || dayInfo?.planId || null;
  const dayId = dayInfo?.day_id || dayInfo?.dayId || null;
  const mealId = meal?.id || null;

  if (modeNormalized === 'ai') {
    const aiResult = await generateAiMenuForMeal({
      userId,
      meal,
      dayInfo,
      generationContext
    });

    await safeLogMenuGeneration({
      userId,
      planId,
      dayId,
      mealId,
      modeRequested: 'ai',
      modeUsed: 'ai',
      modelUsed: aiResult.metadata?.model || null,
      fallbackUsed: false,
      fallbackReason: null,
      tokensUsed: aiResult.metadata?.tokens_used || null,
      latencyMs: Date.now() - startTime,
      requestPayload: { meal_name: meal?.nombre || null, day_type: dayInfo?.tipo_dia || null },
      resultSummary: { max_error: aiResult.metadata?.max_error ?? null, items: aiResult.menu?.items?.length || 0 }
    });

    return aiResult;
  }

  if (modeNormalized === 'hybrid_ai') {
    if (!isHybridAiEnabled()) {
      throw new Error('Modo hybrid_ai deshabilitado por configuración');
    }

    const context = generationContext || await getUserMenuGenerationContext({ userId, foodsLimit: 120 });
    const factors = Array.isArray(conversionFactors) ? conversionFactors : await getMenuConversionFactors();

    try {
      const hybridResult = await generateHybridMenuForMeal({
        meal,
        dayInfo,
        availableFoods: context.availableFoods,
        varietyContext,
        conversionFactors: factors,
        model: getHybridModelName()
      });

      await safeLogMenuGeneration({
        userId,
        planId,
        dayId,
        mealId,
        modeRequested: 'hybrid_ai',
        modeUsed: 'hybrid_ai',
        modelUsed: hybridResult.metadata?.model_used || null,
        fallbackUsed: false,
        fallbackReason: null,
        tokensUsed: hybridResult.metadata?.tokens_used || null,
        latencyMs: Date.now() - startTime,
        requestPayload: { meal_name: meal?.nombre || null, day_type: dayInfo?.tipo_dia || null },
        resultSummary: { max_error: hybridResult.metadata?.max_error ?? null, items: hybridResult.menu?.items?.length || 0 }
      });

      return hybridResult;
    } catch (error) {
      const fallbackReason = error instanceof HybridMenuGenerationError
        ? `${error.code}: ${error.message}`
        : `hybrid_error: ${error.message}`;
      console.warn(`⚠️ Fallback hybrid_ai -> ${HYBRID_FALLBACK_MODE}:`, fallbackReason);

      const fallbackResult = await generateDeterministicMenuForMeal({ userId, meal, dayInfo, varietyContext });
      fallbackResult.metadata = {
        ...fallbackResult.metadata,
        requested_mode: 'hybrid_ai',
        fallback_used: true,
        fallback_reason: fallbackReason
      };

      await safeLogMenuGeneration({
        userId,
        planId,
        dayId,
        mealId,
        modeRequested: 'hybrid_ai',
        modeUsed: HYBRID_FALLBACK_MODE,
        modelUsed: getHybridModelName(),
        fallbackUsed: true,
        fallbackReason,
        tokensUsed: null,
        latencyMs: Date.now() - startTime,
        requestPayload: { meal_name: meal?.nombre || null, day_type: dayInfo?.tipo_dia || null },
        resultSummary: { max_error: fallbackResult.metadata?.max_error ?? null, items: fallbackResult.menu?.items?.length || 0 }
      });

      return fallbackResult;
    }
  }

  if (modeNormalized === 'recipe_examples') {
    try {
      const recipeResult = await generateRecipeExamplesMenuForMeal({ userId, meal, dayInfo, varietyContext });
      registerSelectedRecipeInVarietyContext(varietyContext, recipeResult.metadata);
      await safeLogMenuGeneration({
        userId,
        planId,
        dayId,
        mealId,
        modeRequested: 'recipe_examples',
        modeUsed: 'recipe_examples',
        modelUsed: null,
        fallbackUsed: false,
        fallbackReason: null,
        tokensUsed: null,
        latencyMs: Date.now() - startTime,
        requestPayload: { meal_name: meal?.nombre || null, day_type: dayInfo?.tipo_dia || null },
        resultSummary: {
          max_error: recipeResult.metadata?.max_error ?? null,
          items: recipeResult.menu?.items?.length || 0,
          recipe_code: recipeResult.metadata?.recipe_code || null
        }
      });
      return recipeResult;
    } catch (error) {
      const fallbackReason = `recipe_examples_error: ${error.message}`;
      console.warn(`⚠️ Fallback recipe_examples -> deterministic:`, fallbackReason);

      const fallbackResult = await generateDeterministicMenuForMeal({ userId, meal, dayInfo, varietyContext });
      fallbackResult.metadata = {
        ...fallbackResult.metadata,
        requested_mode: 'recipe_examples',
        fallback_used: true,
        fallback_reason: fallbackReason,
        pairing_penalty: fallbackResult.metadata?.pairing_penalty || {
          total: 0,
          matched_rules: 0
        },
        hard_rules: fallbackResult.metadata?.hard_rules || {
          blocked_candidates: null,
          processed_items_in_selected_recipe: null,
          applied_rule_source: 'fallback_deterministic',
          meal_acceptability_rule_id: null,
          forbidden_pairing_rules_loaded: null,
          penalty_pairing_rules_loaded: null
        }
      };

      await safeLogMenuGeneration({
        userId,
        planId,
        dayId,
        mealId,
        modeRequested: 'recipe_examples',
        modeUsed: 'deterministic',
        modelUsed: null,
        fallbackUsed: true,
        fallbackReason,
        tokensUsed: null,
        latencyMs: Date.now() - startTime,
        requestPayload: { meal_name: meal?.nombre || null, day_type: dayInfo?.tipo_dia || null },
        resultSummary: {
          max_error: fallbackResult.metadata?.max_error ?? null,
          items: fallbackResult.menu?.items?.length || 0,
          template_code: fallbackResult.metadata?.template_code || null
        }
      });

      return fallbackResult;
    }
  }

  if (modeNormalized === 'deterministic') {
    const deterministicResult = await generateDeterministicMenuForMeal({ userId, meal, dayInfo, varietyContext });
    await safeLogMenuGeneration({
      userId,
      planId,
      dayId,
      mealId,
      modeRequested: 'deterministic',
      modeUsed: 'deterministic',
      modelUsed: null,
      fallbackUsed: false,
      fallbackReason: null,
      tokensUsed: null,
      latencyMs: Date.now() - startTime,
      requestPayload: { meal_name: meal?.nombre || null, day_type: dayInfo?.tipo_dia || null },
      resultSummary: { max_error: deterministicResult.metadata?.max_error ?? null, items: deterministicResult.menu?.items?.length || 0 }
    });
    return deterministicResult;
  }

  throw new Error(`Modo de generación no soportado: ${modeNormalized}`);
}

function parseBooleanEnv(value, defaultValue = false) {
  if (value == null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function isHybridAiEnabled() {
  return parseBooleanEnv(process.env.NUTRITION_HYBRID_ENABLED, true);
}

function getHybridModelName() {
  return String(process.env.NUTRITION_HYBRID_MODEL || DEFAULT_HYBRID_MODEL).trim();
}


export {
  VALID_ESTADOS_PESADO,
  VALID_DIET_FILTERS,
  VALID_MENU_GENERATION_MODES,
  DETERMINISTIC_MAX_TEMPLATE_TRIES,
  DETERMINISTIC_MAX_RECIPE_TRIES,
  DETERMINISTIC_COORDINATE_ITERATIONS,
  DETERMINISTIC_MAX_SLOT_OPTIONS,
  DETERMINISTIC_MAX_SLOT_COMBINATIONS,
  DETERMINISTIC_RECENT_FOOD_WINDOW_DAYS,
  SWAP_MEAL_RECALC_MAX_ERROR,
  HYBRID_FALLBACK_MODE,
  DEFAULT_HYBRID_MODEL,
  SLOT_ROLE_FALLBACKS,
  USER_OBJECTIVE_TO_NUTRITION_GOAL,
  parseJsonObject,
  normalizeStringArray,
  normalizeDietFilter,
  normalizeEstadoPesado,
  normalizeComparableText,
  resolveVegetablePortionProfile,
  normalizePositiveInt,
  buildFoodCatalogFilters,
  buildFoodFiltersFromUserPreferences,
  normalizeFoodName,
  parseNumeric,
  buildConversionKey,
  buildConversionMapFromRows,
  resolveShownStateConversion,
  hashString,
  pickDeterministic,
  parseMealMacros,
  normalizeTemplateContext,
  resolvePhaseContext,
  resolveMealType,
  resolveSnackSlotTag,
  buildMealSelectionSeedSuffix,
  extractFoodTagsSet,
  matchesFoodFilters,
  getRoleMacroWeights,
  clampNumber,
  calculateMacroTotals,
  percentError,
  evaluateCandidateMealBalance,
  getPrimaryRoleFromRoles,
  areRoleSetsCompatible,
  computeMacrosAndKcalFromFood,
  computeSwapBaseGrams,
  getConversionBlockedReasonMessage,
  resolveShownStateWithFallback,
  resolveBaseGramsFromMealItem,
  createVarietyContext,
  registerSelectedRecipeInVarietyContext,
  loadRecentFoodUsageMap,
  getFoodVarietyPenalty,
  normalizeFamilyValue,
  isMainRecipeRole,
  resolveFoodFamilyForScoring,
  estimateFoodPalatability,
  computeMealPalatabilityPenalty,
  registerMenuFoodsInVarietyContext,
  extractMenuItemsForPersistence,
  persistGeneratedMenuItemsForMeal,
  daysBetween,
  formatLocalDate,
  mapMethodologyToTrainingType,
  getDeterministicTemplateCandidates,
  getRecipeExampleCandidates,
  resolveRulesDietType,
  loadMealAcceptabilityRule,
  loadPairingRules,
  getRoleGramBounds,
  scoreFoodForRole,
  orderSlotCandidates,
  buildSlotOptionsForTemplate,
  buildSlotCombinations,
  buildDraftItemsForTemplate,
  optimizeDraftItemGrams,
  buildDeterministicMenuItems,
  generateDeterministicMenuForMeal,
  generateRecipeExamplesMenuForMeal,
  getUserMenuGenerationContext,
  getMenuConversionFactors,
  safeLogMenuGeneration,
  generateAiMenuForMeal,
  generateMenuForMeal,
  parseBooleanEnv,
  isHybridAiEnabled,
  getHybridModelName,
  normalizeSexo,
  normalizeActividad,
  mapUserObjectiveToNutritionGoal,
  resolveNutritionObjectiveMismatch,
  normalizeNivelEntrenamiento
};
