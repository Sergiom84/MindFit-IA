/**
 * Rutas para el sistema de nutrición V2 (Determinista + Normalizado)
 * Sistema híbrido que coexiste con nutrition.js (JSON-based)
 */

import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  calculateBMR,
  calculateTDEE,
  adjustCaloriesForGoal,
  calculateMacros,
  generateNutritionPlan,
  validateMacros
} from '../services/nutritionCalculator.js';
import { nutritionMenuGeneratorPrompt } from '../prompts/nutrition-menu-generator.js';
import { getOpenAIClient } from '../lib/openaiClient.js';
import { ensureWeeklySnapshot, logNutritionChange } from '../services/nutritionAuditLogger.js';
import { ensureWorkoutScheduleV3 } from '../utils/ensureScheduleV3.js';
import {
  getDailyNutritionLogV2,
  isNutritionDayRegistered,
  upsertDailyNutritionLogV2
} from '../services/nutritionDailyLogV2.js';
import { getNutritionReview } from '../services/nutritionReviewService.js';
import {
  applyNutritionKcalAdjustment
} from '../services/nutritionAdjustmentService.js';
import { undoLastNutritionKcalAdjustment } from '../services/nutritionAdjustmentService.js';
import {
  generateHybridMenuForMeal,
  HybridMenuGenerationError
} from '../services/nutritionHybridOrchestrator.js';
import {
  evaluateRecipeHardRules,
  computePairingPenaltyForRecipe,
  isProcessedFood
} from '../services/menuHardRulesEngine.js';
import {
  METABOLIC_QUESTIONS,
  calculatePendingProfileState,
  processMetabolicEvaluation
} from '../services/metabolicProfileCalculator.js';

const router = express.Router();

const VALID_ESTADOS_PESADO = ['crudo', 'cocido', 'escurrido', 'seco', 'tal_cual'];
const VALID_DIET_FILTERS = ['omnivoro', 'vegetariano', 'vegano'];
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
const SLOT_ROLE_FALLBACKS = {
  PROTEINA_ANIMAL: ['PROTEINA_ANIMAL_MAGRA', 'PROTEINA_ANIMAL_GRASA', 'PROTEINA_VEGETAL'],
  PROTEINA_ANIMAL_MAGRA: ['PROTEINA_ANIMAL', 'PROTEINA_VEGETAL'],
  PROTEINA_VEGETAL: ['LEGUMBRE', 'SUPLEMENTO_PROTEINA'],
  CARBO_BASE: ['CARBO_COCIDO', 'CARBO_PAN', 'CARBO_AVENA'],
  GRASA_BASE: ['GRASA_ACEITE', 'GRASA_FRUTOS_SECOS', 'GRASA_CREMAS', 'GRASA_SEMILLAS'],
  LACTEO_PROTEICO_MAGRO: ['LACTEO_BASE', 'PROTEINA_VEGETAL', 'SUPLEMENTO_PROTEINA'],
  HUEVO: ['PROTEINA_ANIMAL_MAGRA', 'PROTEINA_VEGETAL'],
  LEGUMBRE: ['PROTEINA_VEGETAL', 'CARBO_BASE'],
  SUPLEMENTO_PROTEINA: ['PROTEINA_VEGETAL']
};

function parseJsonObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return [...new Set(
      value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )];
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return normalizeStringArray(parsed);
      }
    } catch {
      // fallback a CSV cuando no es JSON.
    }

    return [...new Set(
      trimmed
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )];
  }

  return [];
}

function normalizeDietFilter(value) {
  if (!value) return null;

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (VALID_DIET_FILTERS.includes(normalized)) {
    return normalized;
  }

  return null;
}

function normalizeEstadoPesado(value) {
  if (!value) return null;

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  const aliases = {
    talcual: 'tal_cual'
  };

  const resolved = aliases[normalized] || normalized;
  return VALID_ESTADOS_PESADO.includes(resolved) ? resolved : null;
}

function normalizePositiveInt(value, defaultValue, maxValue = null) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return defaultValue;
  }

  if (maxValue && parsed > maxValue) {
    return maxValue;
  }

  return parsed;
}

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

function normalizeFoodName(value) {
  if (!value) return '';
  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function parseNumeric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value
      .trim()
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');
    if (!normalized) return null;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function buildConversionKey(grupoFactor, estadoBase, estadoObjetivo) {
  return `${String(grupoFactor || '').toLowerCase()}|${String(estadoBase || '').toLowerCase()}|${String(estadoObjetivo || '').toLowerCase()}`;
}

function buildConversionMapFromRows(rows = []) {
  const conversionMap = new Map();
  rows.forEach((row) => {
    const groupFactor = String(row?.grupo_factor || '').toLowerCase();
    const estadoBase = normalizeEstadoPesado(row?.estado_base);
    const estadoObjetivo = normalizeEstadoPesado(row?.estado_objetivo);
    const factor = parseNumeric(row?.factor_base_objetivo);
    if (!groupFactor || !estadoBase || !estadoObjetivo || !(factor > 0)) {
      return;
    }
    conversionMap.set(buildConversionKey(groupFactor, estadoBase, estadoObjetivo), factor);
  });
  return conversionMap;
}

function resolveShownStateConversion({
  grupoFactor,
  estadoBase,
  estadoMostrado,
  conversionMap
}) {
  const base = normalizeEstadoPesado(estadoBase) || 'tal_cual';
  const shownRequested = normalizeEstadoPesado(estadoMostrado) || base;

  if (shownRequested === base) {
    return {
      estadoMostradoFinal: base,
      factor: 1,
      blockedReason: null
    };
  }

  if (base === 'tal_cual') {
    return {
      estadoMostradoFinal: base,
      factor: 1,
      blockedReason: 'tal_cual_no_convertible'
    };
  }

  const normalizedGroup = String(grupoFactor || '').trim().toLowerCase();
  if (!normalizedGroup) {
    return {
      estadoMostradoFinal: base,
      factor: 1,
      blockedReason: 'missing_group_factor'
    };
  }

  const factor = conversionMap.get(buildConversionKey(normalizedGroup, base, shownRequested));
  if (!(factor > 0)) {
    return {
      estadoMostradoFinal: base,
      factor: 1,
      blockedReason: 'missing_conversion_factor'
    };
  }

  return {
    estadoMostradoFinal: shownRequested,
    factor,
    blockedReason: null
  };
}

function hashString(input) {
  const value = String(input || '');
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickDeterministic(items, seed) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  const safeSeed = Number.isFinite(seed) ? Math.abs(seed) : hashString(seed);
  return items[safeSeed % items.length];
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
  const mealName = String(meal?.nombre || '').trim().toLowerCase();
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

function getRoleMacroWeights(roleValue) {
  const role = String(roleValue || '').toUpperCase();
  if (role.includes('PROTEINA') || role === 'HUEVO' || role === 'CLARAS' || role.includes('LACTEO_PROTEICO') || role.includes('SUPLEMENTO_PROTEINA')) {
    return { protein: 1, carbs: 0.2, fat: 0.25, kcal: 0.35 };
  }
  if (role.includes('CARBO') || role === 'FRUTA' || role === 'LEGUMBRE') {
    return { protein: 0.2, carbs: 1, fat: 0.15, kcal: 0.35 };
  }
  if (role.includes('GRASA') || role.includes('QUESO')) {
    return { protein: 0.05, carbs: 0.05, fat: 1, kcal: 0.2 };
  }
  if (role === 'VERDURA') {
    // VERDURA debe actuar como complemento/fibra, no como base para cuadrar macros.
    return { protein: 0.03, carbs: 0.03, fat: 0.01, kcal: 0.05 };
  }
  if (role === 'BEBIDA') {
    return { protein: 0.05, carbs: 0.2, fat: 0.05, kcal: 0.05 };
  }
  return { protein: 0.25, carbs: 0.25, fat: 0.25, kcal: 0.1 };
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function calculateMacroTotals(items) {
  return items.reduce((acc, item) => {
    acc.kcal += parseNumeric(item.kcal) ?? 0;
    acc.protein_g += parseNumeric(item.macros?.protein_g) ?? 0;
    acc.carbs_g += parseNumeric(item.macros?.carbs_g) ?? 0;
    acc.fat_g += parseNumeric(item.macros?.fat_g) ?? 0;
    return acc;
  }, { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
}

function percentError(actual, target) {
  const safeTarget = parseNumeric(target) ?? 0;
  if (safeTarget <= 0) return 0;
  return Number((((Math.abs(actual - safeTarget)) / safeTarget) * 100).toFixed(2));
}

function getPrimaryRoleFromRoles(roles = [], fallbackMacros = null) {
  const normalized = roles
    .map((role) => String(role || '').trim().toUpperCase())
    .filter(Boolean);

  if (normalized.length > 0) {
    const preferredOrder = [
      'PROTEINA_ANIMAL_MAGRA',
      'PROTEINA_ANIMAL_GRASA',
      'PROTEINA_ANIMAL',
      'PROTEINA_VEGETAL',
      'HUEVO',
      'LACTEO_PROTEICO_MAGRO',
      'SUPLEMENTO_PROTEINA',
      'CARBO_BASE',
      'CARBO_COCIDO',
      'CARBO_PAN',
      'CARBO_AVENA',
      'CARBO_RAPIDO',
      'LEGUMBRE',
      'FRUTA',
      'VERDURA',
      'GRASA_BASE',
      'GRASA_ACEITE',
      'GRASA_FRUTOS_SECOS',
      'GRASA_CREMAS',
      'GRASA_SEMILLAS',
      'LACTEO_BASE'
    ];

    for (const wanted of preferredOrder) {
      if (normalized.includes(wanted)) {
        return wanted;
      }
    }

    return normalized[0];
  }

  if (fallbackMacros) {
    const p = parseNumeric(fallbackMacros.protein_g) ?? 0;
    const c = parseNumeric(fallbackMacros.carbs_g) ?? 0;
    const f = parseNumeric(fallbackMacros.fat_g) ?? 0;
    if (p >= c && p >= f) return 'PROTEINA_ANIMAL_MAGRA';
    if (c >= p && c >= f) return 'CARBO_BASE';
    if (f >= p && f >= c) return 'GRASA_BASE';
  }

  return 'CARBO_BASE';
}

function areRoleSetsCompatible(oldRoles = [], newRoles = []) {
  if (!Array.isArray(oldRoles) || oldRoles.length === 0) return true;
  if (!Array.isArray(newRoles) || newRoles.length === 0) return true;

  const oldSet = new Set(oldRoles.map((role) => String(role || '').trim().toUpperCase()).filter(Boolean));
  const newSet = new Set(newRoles.map((role) => String(role || '').trim().toUpperCase()).filter(Boolean));

  for (const role of oldSet) {
    if (newSet.has(role)) return true;
  }

  for (const oldRole of oldSet) {
    const oldFallbacks = SLOT_ROLE_FALLBACKS[oldRole] || [];
    for (const fallbackRole of oldFallbacks) {
      if (newSet.has(fallbackRole)) return true;
    }
  }

  for (const newRole of newSet) {
    const newFallbacks = SLOT_ROLE_FALLBACKS[newRole] || [];
    for (const fallbackRole of newFallbacks) {
      if (oldSet.has(fallbackRole)) return true;
    }
  }

  return false;
}

function computeMacrosAndKcalFromFood(food, gramsBase) {
  const macros100 = parseJsonObject(food?.macros_100g, {});
  const protein100 = Math.max(0, parseNumeric(macros100.protein_g) ?? 0);
  const carbs100 = Math.max(0, parseNumeric(macros100.carbs_g) ?? 0);
  const fat100 = Math.max(0, parseNumeric(macros100.fat_g) ?? 0);

  const protein = Number(((protein100 * gramsBase) / 100).toFixed(2));
  const carbs = Number(((carbs100 * gramsBase) / 100).toFixed(2));
  const fat = Number(((fat100 * gramsBase) / 100).toFixed(2));
  const kcal = Math.round((protein * 4) + (carbs * 4) + (fat * 9));

  return {
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    kcal
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

function daysBetween(a, b) {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.abs(Math.round((b.getTime() - a.getTime()) / MS_PER_DAY));
}

function formatLocalDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function getRoleGramBounds(roleValue, porcionTipica) {
  const role = String(roleValue || '').toUpperCase();
  let base;
  if (role.includes('GRASA') || role.includes('ACEITE')) {
    base = { min: 3, max: 45 };
  } else if (role.includes('SUPLEMENTO_PROTEINA')) {
    base = { min: 20, max: 100 };
  } else if (role === 'VERDURA') {
    // Evitar porciones absurdas de vegetales (p.ej. 300-500g por slot).
    base = { min: 50, max: 220 };
  } else if (role === 'FRUTA') {
    base = { min: 80, max: 450 };
  } else if (role.includes('CARBO') || role === 'LEGUMBRE') {
    base = { min: 40, max: 380 };
  } else if (role.includes('PROTEINA') || role === 'HUEVO' || role === 'CLARAS' || role.includes('LACTEO')) {
    base = { min: 40, max: 320 };
  } else {
    base = { min: 25, max: 420 };
  }

  const pt = parseNumeric(porcionTipica);
  if (pt && pt > 0) {
    if (role === 'VERDURA') {
      const min = Math.max(base.min, Math.round(pt * 0.35));
      const max = Math.min(base.max, Math.round(pt * 1.0));
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
    const bounds = getRoleGramBounds(entry.role, entry.food.porcion_tipica_g);
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
      const score = Number(((maxError * 0.75) + (avgMacroError * 0.25)).toFixed(6));

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
          evaluated_combinations: combinations.length
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

function evaluateVolume(base, latest) {
  const weightGain = latest.weight - base.weight;
  const waistGain = latest.waist - base.waist;
  if (weightGain <= 0 || !isFinite(weightGain)) {
    return { status: 'observacion', indicator: null, interpretation: 'Sin ganancia de peso en la ventana', action: 'Registrar otra medición y reevaluar', needsConfirmation: true };
  }
  const icg = waistGain / weightGain;
  if (icg >= 1.5) {
    return { status: 'rojo', indicator: icg, interpretation: 'Ganancia de grasa excesiva', action: 'Pasar a normocalórica o definición 2-4 semanas', needsConfirmation: true };
  }
  if (icg >= 1.0) {
    return { status: 'amarillo', indicator: icg, interpretation: 'Volumen descontrolado', action: 'Reducir superávit 150-250 kcal/día', needsConfirmation: true };
  }
  if (icg >= 0.8) {
    return { status: 'verde', indicator: icg, interpretation: 'Volumen correcto', action: 'Mantener estrategia', needsConfirmation: false };
  }
  return { status: 'verde_plus', indicator: icg, interpretation: 'Volumen muy eficiente', action: 'Mantener o subir carga de entreno', needsConfirmation: false };
}

function evaluateDefinition(base, latest) {
  const weightLoss = base.weight - latest.weight;
  const waistLoss = base.waist - latest.waist;
  if (weightLoss <= 0 || !isFinite(weightLoss)) {
    return { status: 'observacion', indicator: null, interpretation: 'Sin pérdida de peso en la ventana', action: 'Registrar otra medición y reevaluar', needsConfirmation: true };
  }
  const ipg = waistLoss / weightLoss;
  if (ipg < 0.6) {
    return { status: 'rojo', indicator: ipg, interpretation: 'Riesgo de pérdida muscular', action: 'Subir kcal +150-250 o diet break', needsConfirmation: true };
  }
  if (ipg < 0.8) {
    return { status: 'amarillo', indicator: ipg, interpretation: 'Déficit agresivo', action: 'Mantener 7-14 días y reevaluar', needsConfirmation: true };
  }
  if (ipg < 1.2) {
    return { status: 'verde', indicator: ipg, interpretation: 'Definición eficiente', action: 'Mantener', needsConfirmation: false };
  }
  return { status: 'verde_plus', indicator: ipg, interpretation: 'Muy buena pérdida de grasa', action: 'Mantener o microajuste', needsConfirmation: false };
}

function evaluateMaintenance(base, latest) {
  const weightDiff = latest.weight - base.weight;
  const waistDiff = latest.waist - base.waist;
  const absW = Math.abs(weightDiff);
  const absC = Math.abs(waistDiff);

  // IEC según documento
  if (weightDiff >= 1 && waistDiff >= 1) {
    return { status: 'rojo', indicator: weightDiff, interpretation: 'Superávit no deseado', action: 'Reducir kcal 150/día', needsConfirmation: true };
  }
  if (absW <= 0.5) {
    return { status: 'amarillo', indicator: weightDiff, interpretation: 'Oscilación normal', action: 'Mantener y observar (confirmación 2.1)', needsConfirmation: true };
  }
  if (absW <= 0.3 && waistDiff < 0) {
    return { status: 'verde', indicator: weightDiff, interpretation: 'Recomp positiva', action: 'Mantener', needsConfirmation: false };
  }
  if (absW <= 0.2 && waistDiff <= -0.2) {
    return { status: 'verde_plus', indicator: weightDiff, interpretation: 'Recomp ideal', action: 'Mantener o micro superávit', needsConfirmation: false };
  }
  return { status: 'amarillo', indicator: weightDiff, interpretation: 'Variación leve', action: 'Observar y repetir medición', needsConfirmation: true };
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

function normalizeSexo(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();

  if (['hombre', 'masculino', 'male', 'm'].includes(normalized)) return 'hombre';
  if (['mujer', 'femenino', 'female', 'f'].includes(normalized)) return 'mujer';

  return null;
}

function normalizeActividad(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();

  const mapping = {
    sedentario: 'sedentario',
    ligeramente_activo: 'ligeramente_activo',
    'ligeramente activo': 'ligeramente_activo',
    ligero: 'ligero',
    moderado: 'moderado',
    activo: 'activo',
    muy_activo: 'muy_activo',
    alto: 'alto',
    muy_alto: 'muy_alto'
  };

  return mapping[normalized] || null;
}

function normalizeNivelEntrenamiento(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();

  const mapping = {
    beginner: 'principiante',
    intermediate: 'intermedio',
    advanced: 'avanzado',
    principiante: 'principiante',
    intermedio: 'intermedio',
    avanzado: 'avanzado',
    'intermedio+': 'intermedio'
  };

  return mapping[normalized] || normalized;
}

// ================================================
// PERFIL NUTRICIONAL
// ================================================

/**
 * GET /api/nutrition-v2/profile
 * Obtener perfil nutricional del usuario
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT * FROM app.nutrition_profiles WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil nutricional no encontrado' });
    }

    const profile = result.rows[0];
    // Garantizar campo de sincronización con default false
    profile.nutrition_overrides_profile = profile.nutrition_overrides_profile || false;
    res.json(profile);
  } catch (error) {
    console.error('Error al obtener perfil nutricional:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

/**
 * POST /api/nutrition-v2/profile
 * Crear o actualizar perfil nutricional
 */
router.post('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const payload = req.body || {};
    const hasField = (field) => Object.prototype.hasOwnProperty.call(payload, field);

    const existingProfileResult = await pool.query(
      'SELECT * FROM app.nutrition_profiles WHERE user_id = $1',
      [userId]
    );
    const existingProfile = existingProfileResult.rows[0] || null;

    let userFallback = null;
    const getUserFallback = async () => {
      if (userFallback) return userFallback;

      const userResult = await pool.query(
        `
          SELECT
            sexo,
            edad,
            altura,
            peso,
            nivel_actividad,
            comidas_por_dia,
            frecuencia_semanal,
            cintura,
            grasa_corporal,
            nivel_entrenamiento
          FROM app.users
          WHERE id = $1
        `,
        [userId]
      );

      userFallback = userResult.rows[0] || null;
      return userFallback;
    };

    // Base requerido: permite omitirlos si ya existen en nutrition_profiles o en app.users
    let sexo = hasField('sexo') ? normalizeSexo(payload.sexo) : normalizeSexo(existingProfile?.sexo);
    let edad = hasField('edad') ? payload.edad : existingProfile?.edad;
    let altura_cm = hasField('altura_cm') ? payload.altura_cm : existingProfile?.altura_cm;
    let peso_kg = hasField('peso_kg') ? payload.peso_kg : existingProfile?.peso_kg;
    let objetivo = hasField('objetivo') ? payload.objetivo : existingProfile?.objetivo;
    let actividad = hasField('actividad') ? normalizeActividad(payload.actividad) : normalizeActividad(existingProfile?.actividad);

    // Otros campos (preservan valores existentes si no se envían)
    let comidas_dia = hasField('comidas_dia') ? payload.comidas_dia : existingProfile?.comidas_dia;
    let preferencias = hasField('preferencias') ? payload.preferencias : existingProfile?.preferencias;
    let alergias = hasField('alergias') ? payload.alergias : existingProfile?.alergias;

    let metabolic_type = hasField('metabolic_type') ? payload.metabolic_type : existingProfile?.metabolic_type;
    let formula_preferida = hasField('formula_preferida') ? payload.formula_preferida : existingProfile?.formula_preferida;
    let training_days = hasField('training_days') ? payload.training_days : existingProfile?.training_days;
    let waist_cm = hasField('waist_cm') ? payload.waist_cm : existingProfile?.waist_cm;
    let bodyfat_percent = hasField('bodyfat_percent') ? payload.bodyfat_percent : existingProfile?.bodyfat_percent;
    let steps_per_day = hasField('steps_per_day') ? payload.steps_per_day : existingProfile?.steps_per_day;
    let level = hasField('level') ? payload.level : existingProfile?.level;

    let metabolic_score = hasField('metabolic_score') ? payload.metabolic_score : existingProfile?.metabolic_score;
    let metabolic_confidence = hasField('metabolic_confidence') ? payload.metabolic_confidence : existingProfile?.metabolic_confidence;
    let metabolic_pending_type = hasField('metabolic_pending_type') ? payload.metabolic_pending_type : existingProfile?.metabolic_pending_type;
    let metabolic_pending_count = hasField('metabolic_pending_count')
      ? payload.metabolic_pending_count
      : (existingProfile?.metabolic_pending_count ?? 0);

    let nutrition_overrides_profile = hasField('nutrition_overrides_profile')
      ? payload.nutrition_overrides_profile
      : (existingProfile?.nutrition_overrides_profile ?? false);

    if (!sexo || !edad || !altura_cm || !peso_kg || !objetivo || !actividad) {
      const userData = await getUserFallback();
      if (userData) {
        sexo = sexo || normalizeSexo(userData.sexo);
        edad = edad ?? userData.edad;
        altura_cm = altura_cm ?? userData.altura;
        peso_kg = peso_kg ?? userData.peso;
        actividad = actividad || normalizeActividad(userData.nivel_actividad);

        if (comidas_dia == null) comidas_dia = userData.comidas_por_dia;
        if (training_days == null) training_days = userData.frecuencia_semanal;
        if (waist_cm == null) waist_cm = userData.cintura;
        if (bodyfat_percent == null) bodyfat_percent = userData.grasa_corporal;
        if (level == null) level = userData.nivel_entrenamiento;
      }
    }

    // Validar campos requeridos (tras fallbacks)
    if (!sexo || !edad || !altura_cm || !peso_kg || !objetivo || !actividad) {
      return res.status(400).json({
        error: 'Faltan campos requeridos (sexo/edad/altura_cm/peso_kg/objetivo/actividad). Completa tu perfil o envía estos campos.'
      });
    }

    const edadValue = Number.parseInt(edad, 10);
    const alturaValue = Number.parseInt(altura_cm, 10);
    const pesoValue = Number.parseFloat(peso_kg);
    const comidasValue = comidas_dia == null ? 4 : Number.parseInt(comidas_dia, 10);

    const trainingDaysValue = training_days == null ? null : Number.parseInt(training_days, 10);
    const stepsValue = steps_per_day == null ? null : Number.parseInt(steps_per_day, 10);
    const waistValue = waist_cm == null ? null : Number.parseFloat(waist_cm);
    const bodyfatValue = bodyfat_percent == null ? null : Number.parseFloat(bodyfat_percent);

    const levelValue = level == null ? null : normalizeNivelEntrenamiento(level);
    const preferenciasValue = preferencias && typeof preferencias === 'object' ? preferencias : {};
    const alergiasValue = Array.isArray(alergias) ? alergias : [];

    if (!Number.isFinite(edadValue) || !Number.isFinite(alturaValue) || !Number.isFinite(pesoValue)) {
      return res.status(400).json({ error: 'Datos inválidos: edad/altura_cm/peso_kg deben ser numéricos' });
    }

    if (edadValue < 14 || edadValue > 80 || alturaValue < 120 || alturaValue > 220 || pesoValue < 30 || pesoValue > 250) {
      return res.status(400).json({ error: 'Datos fuera de rango: edad 14-80, altura 120-220 cm, peso 30-250 kg' });
    }

    // Insertar o actualizar perfil
    const query = `
      INSERT INTO app.nutrition_profiles (
        user_id, sexo, edad, altura_cm, peso_kg, objetivo, actividad, comidas_dia, preferencias, alergias,
        metabolic_type, formula_preferida, training_days, waist_cm, bodyfat_percent, steps_per_day, level,
        metabolic_score, metabolic_confidence, metabolic_pending_type, metabolic_pending_count, nutrition_overrides_profile
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      ON CONFLICT (user_id)
      DO UPDATE SET
        sexo = EXCLUDED.sexo,
        edad = EXCLUDED.edad,
        altura_cm = EXCLUDED.altura_cm,
        peso_kg = EXCLUDED.peso_kg,
        objetivo = EXCLUDED.objetivo,
        actividad = EXCLUDED.actividad,
        comidas_dia = EXCLUDED.comidas_dia,
        preferencias = EXCLUDED.preferencias,
        alergias = EXCLUDED.alergias,
        metabolic_type = EXCLUDED.metabolic_type,
        formula_preferida = EXCLUDED.formula_preferida,
        training_days = EXCLUDED.training_days,
        waist_cm = EXCLUDED.waist_cm,
        bodyfat_percent = EXCLUDED.bodyfat_percent,
        steps_per_day = EXCLUDED.steps_per_day,
        level = EXCLUDED.level,
        metabolic_score = EXCLUDED.metabolic_score,
        metabolic_confidence = EXCLUDED.metabolic_confidence,
        metabolic_pending_type = EXCLUDED.metabolic_pending_type,
        metabolic_pending_count = EXCLUDED.metabolic_pending_count,
        nutrition_overrides_profile = EXCLUDED.nutrition_overrides_profile,
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await pool.query(query, [
      userId,
      sexo,
      edadValue,
      alturaValue,
      pesoValue,
      objetivo,
      actividad,
      comidasValue,
      JSON.stringify(preferenciasValue),
      JSON.stringify(alergiasValue),
      metabolic_type,
      formula_preferida,
      trainingDaysValue,
      waistValue,
      bodyfatValue,
      stepsValue,
      levelValue,
      metabolic_score,
      metabolic_confidence,
      metabolic_pending_type,
      metabolic_pending_count,
      nutrition_overrides_profile
    ]);

    // Calcular estimaciones
    const profile = result.rows[0];
    const bmr = calculateBMR(profile);
    const tdee = calculateTDEE(bmr, actividad, training_days || undefined, steps_per_day || undefined);
    const kcalObjetivo = adjustCaloriesForGoal(tdee, objetivo, profile);

    res.json({
      profile: profile,
      estimaciones: {
        bmr,
        tdee,
        kcal_objetivo: kcalObjetivo
      }
    });
  } catch (error) {
    console.error('Error al guardar perfil nutricional:', error);
    res.status(500).json({ error: 'Error al guardar perfil' });
  }
});

// ================================================
// GENERACIÓN DE PLANES DETERMINISTAS
// ================================================

/**
 * POST /api/nutrition-v2/generate-plan
 * Generar plan nutricional usando cálculo determinista
 */
router.post('/generate-plan', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      duracion_dias = 7,
      training_type = 'general',
      training_schedule = [] // Array de booleanos: [true, false, true, ...]
    } = req.body;

    // Validar duración
    if (duracion_dias < 3 || duracion_dias > 28) {
      return res.status(400).json({ error: 'La duración debe estar entre 3 y 28 días' });
    }

    const requestedTrainingType = training_type;
    const requestedTrainingSchedule = Array.isArray(training_schedule) ? training_schedule : [];

    let resolvedTrainingType = requestedTrainingType;
    let resolvedTrainingSchedule = requestedTrainingSchedule;

    // Si existe plan de entrenamiento activo, Nutrición debe enlazarse siempre al plan (spec: puente Entrenamiento<->Nutrición).
    const activePlanResult = await pool.query(
      `
        SELECT
          id as methodology_plan_id,
          methodology_type,
          plan_data,
          plan_start_date,
          confirmed_at,
          created_at,
          status
        FROM app.methodology_plans
        WHERE user_id = $1
          AND status IN ('active', 'confirmed')
          AND cancelled_at IS NULL
        ORDER BY is_current DESC NULLS LAST, confirmed_at DESC NULLS LAST, created_at DESC
        LIMIT 1
      `,
      [userId]
    );

    if (activePlanResult.rowCount > 0) {
      const activePlan = activePlanResult.rows[0];
      const methodologyPlanId = activePlan.methodology_plan_id;

      resolvedTrainingType = mapMethodologyToTrainingType(activePlan.methodology_type) || 'general';

      // Asegurar que exista programación real en workout_schedule (on-demand).
      const hasScheduleResult = await pool.query(
        `
          SELECT 1
          FROM app.workout_schedule
          WHERE methodology_plan_id = $1 AND user_id = $2
          LIMIT 1
        `,
        [methodologyPlanId, userId]
      );

      if (hasScheduleResult.rowCount === 0) {
        const startConfigQuery = await pool.query(
          `SELECT * FROM app.plan_start_config WHERE methodology_plan_id = $1`,
          [methodologyPlanId]
        );
        const startConfig = startConfigQuery.rowCount > 0 ? startConfigQuery.rows[0] : null;
        const startDateFromPlan =
          activePlan.plan_start_date || activePlan.confirmed_at || activePlan.created_at || new Date();

        const scheduleClient = await pool.connect();
        try {
          await ensureWorkoutScheduleV3(
            scheduleClient,
            userId,
            methodologyPlanId,
            activePlan.plan_data,
            startDateFromPlan,
            startConfig
          );
        } finally {
          scheduleClient.release();
        }
      }

      // Construir calendario diario para los próximos N días desde hoy (local) usando scheduled_date.
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endDate = new Date(today);
      endDate.setDate(today.getDate() + (duracion_dias - 1));

      const scheduleRangeResult = await pool.query(
        `
          SELECT scheduled_date
          FROM app.workout_schedule
          WHERE methodology_plan_id = $1
            AND user_id = $2
            AND scheduled_date BETWEEN $3 AND $4
          ORDER BY scheduled_date ASC
        `,
        [methodologyPlanId, userId, formatLocalDate(today), formatLocalDate(endDate)]
      );

      const scheduledDates = new Set(
        scheduleRangeResult.rows
          .map((row) => formatLocalDate(row.scheduled_date))
          .filter(Boolean)
      );

      resolvedTrainingSchedule = Array.from({ length: duracion_dias }, (_, index) => {
        const date = new Date(today);
        date.setDate(today.getDate() + index);
        const key = formatLocalDate(date);
        return scheduledDates.has(key);
      });
    }

    // Obtener perfil del usuario
    const profileResult = await pool.query(
      'SELECT * FROM app.nutrition_profiles WHERE user_id = $1',
      [userId]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Debes crear un perfil nutricional primero',
        hint: 'POST /api/nutrition-v2/profile'
      });
    }

    const profile = profileResult.rows[0];

    // Generar plan usando cálculo determinista
    const planData = generateNutritionPlan(
      {
        ...profile,
        training_type: resolvedTrainingType,
        training_days: profile.training_days || (resolvedTrainingSchedule.length > 0 ? resolvedTrainingSchedule.filter(Boolean).length : undefined),
        metabolic_type: profile.metabolic_type,
        metabolic_confidence: profile.metabolic_confidence,
        steps_per_day: profile.steps_per_day
      },
      duracion_dias,
      resolvedTrainingSchedule
    );

    console.log('✅ Plan determinista generado:', {
      bmr: planData.bmr,
      tdee: planData.tdee,
      kcal_objetivo: planData.kcal_objetivo,
      metabolic_type: profile.metabolic_type || 'mixto',
      metabolic_confidence: profile.metabolic_confidence || 'media',
      macros_objetivo: planData.macros_objetivo,
      dias: planData.days.length
    });

    // Guardar plan en la base de datos
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Mantener un único plan activo: archivar planes previos del usuario
      await client.query(
        `
        UPDATE app.nutrition_plans_v2
        SET tipo = 'archivado'
        WHERE user_id = $1 AND tipo = 'activo';
        `,
        [userId]
      );

      // 1. Crear plan maestro
      const planQuery = `
        INSERT INTO app.nutrition_plans_v2 (
          user_id, plan_name, tipo, bmr, tdee, kcal_objetivo, macros_objetivo,
          meta, duracion_dias, training_type, comidas_por_dia, fuente, version_reglas
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id;
      `;

      const planResult = await client.query(planQuery, [
        userId,
        `Plan ${profile.objetivo} - ${duracion_dias} días`,
        'activo',
        planData.bmr,
        planData.tdee,
        planData.kcal_objetivo,
        JSON.stringify(planData.macros_objetivo),
        planData.meta,
        planData.duracion_dias,
        planData.training_type,
        planData.comidas_por_dia,
        planData.fuente,
        planData.version_reglas
      ]);

      const planId = planResult.rows[0].id;

      // 2. Crear días del plan
      for (const day of planData.days) {
        const dayQuery = `
          INSERT INTO app.nutrition_plan_days (
            plan_id, day_index, tipo_dia, kcal, macros
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING id;
        `;

        const dayResult = await client.query(dayQuery, [
          planId,
          day.day_index,
          day.tipo_dia,
          day.kcal,
          JSON.stringify(day.macros)
        ]);

        const dayId = dayResult.rows[0].id;

        // 3. Crear comidas del día
        for (const meal of day.meals) {
          const mealQuery = `
            INSERT INTO app.nutrition_meals (
              plan_day_id, orden, nombre, kcal, macros, timing_note
            ) VALUES ($1, $2, $3, $4, $5, $6);
          `;

          await client.query(mealQuery, [
            dayId,
            meal.orden,
            meal.nombre,
            meal.kcal,
            JSON.stringify(meal.macros),
            meal.timing_note
          ]);
        }
      }

      // Una vez generado el plan, la fuente pasa a ser nutrición -> perfil
      await client.query(
        'UPDATE app.nutrition_profiles SET nutrition_overrides_profile = TRUE, updated_at = NOW() WHERE user_id = $1',
        [userId]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Plan nutricional generado exitosamente',
        plan_id: planId,
        plan: {
          bmr: planData.bmr,
          tdee: planData.tdee,
          kcal_objetivo: planData.kcal_objetivo,
          macros_objetivo: planData.macros_objetivo,
          duracion_dias: planData.duracion_dias,
          comidas_por_dia: planData.comidas_por_dia
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error al generar plan determinista:', error);
    res.status(500).json({ error: 'Error al generar plan nutricional' });
  }
});

/**
 * GET /api/nutrition-v2/active-plan
 * Obtener plan nutricional activo del usuario
 */
router.get('/active-plan', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const query = `
      SELECT
        p.*,
        (
          SELECT json_agg(
            json_build_object(
              'day_index', d.day_index,
              'tipo_dia', d.tipo_dia,
              'kcal', d.kcal,
              'macros', d.macros,
              'day_id', d.id,
              'meals', (
                SELECT json_agg(
                  json_build_object(
                    'id', m.id,
                    'orden', m.orden,
                    'nombre', m.nombre,
                    'kcal', m.kcal,
                    'macros', m.macros,
                    'timing_note', m.timing_note,
                    'items', COALESCE((
                      SELECT json_agg(
                        json_build_object(
                          'id', mi.id,
                          'orden', mi.orden,
                          'food_id', COALESCE(mi.food_id, mi.alimento_id),
                          'food_slug', f.slug,
                          'food_nombre', f.nombre,
                          'food_categoria', f.categoria,
                          'food_grupo_factor', f.grupo_factor,
                          'descripcion', mi.descripcion,
                          'cantidad_g', mi.cantidad_g,
                          'cantidad_g_base', mi.cantidad_g_base,
                          'cantidad_g_mostrada', mi.cantidad_g_mostrada,
                          'estado_pesado_base', mi.estado_pesado_base,
                          'estado_pesado_mostrado', mi.estado_pesado_mostrado,
                          'kcal', mi.kcal,
                          'macros', mi.macros,
                          'tags', mi.tags
                        ) ORDER BY mi.orden
                      )
                      FROM app.nutrition_meal_items mi
                      LEFT JOIN app.foods f ON f.id = COALESCE(mi.food_id, mi.alimento_id)
                      WHERE mi.meal_id = m.id
                    ), '[]'::json)
                  ) ORDER BY m.orden
                )
                FROM app.nutrition_meals m
                WHERE m.plan_day_id = d.id
              )
            ) ORDER BY d.day_index
          )
          FROM app.nutrition_plan_days d
          WHERE d.plan_id = p.id
        ) as days
      FROM app.nutrition_plans_v2 p
      WHERE p.user_id = $1 AND p.tipo = 'activo'
      ORDER BY p.created_at DESC
      LIMIT 1;
    `;

    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No tienes un plan activo' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error al obtener plan activo:', error);
    res.status(500).json({ error: 'Error al obtener plan' });
  }
});

/**
 * GET /api/nutrition-v2/audit
 * Resumen de auditoría (logs de cambios + snapshots)
 */
router.get('/audit', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Number.parseInt(req.query.limit || '20', 10);
    const snapshotLimit = Number.parseInt(req.query.snapshot_limit || '8', 10);

    const [logsResult, snapshotsResult] = await Promise.all([
      pool.query(
        `SELECT * FROM app.nutrition_change_log
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit]
      ),
      pool.query(
        `SELECT * FROM app.nutrition_weekly_snapshots
         WHERE user_id = $1
         ORDER BY snapshot_date DESC
         LIMIT $2`,
        [userId, snapshotLimit]
      )
    ]);

    res.json({
      success: true,
      change_log: logsResult.rows,
      snapshots: snapshotsResult.rows
    });
  } catch (error) {
    console.error('Error obteniendo auditoría nutricional:', error);
    res.status(500).json({ error: 'Error al obtener auditoría nutricional' });
  }
});

// ================================================
// CATÁLOGO DE ALIMENTOS
// ================================================

/**
 * GET /api/nutrition-v2/foods
 * Buscar alimentos en el catálogo
 */
router.get('/foods', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : null;
    const categoria = typeof req.query.categoria === 'string' ? req.query.categoria.trim() : null;
    const categoriaDetalle = typeof req.query.categoria_detalle === 'string'
      ? req.query.categoria_detalle.trim()
      : null;
    const compatibleWithItemId = typeof req.query.compatible_with_item_id === 'string'
      ? req.query.compatible_with_item_id.trim()
      : null;
    const grupoFactorRaw = req.query.grupo_factor ?? req.query.group_factor;
    const grupoFactor = typeof grupoFactorRaw === 'string' ? grupoFactorRaw.trim() : null;

    const dietRaw = req.query.diet;
    const diet = normalizeDietFilter(dietRaw);
    if (dietRaw && !diet) {
      return res.status(400).json({
        error: 'Parámetro diet inválido',
        allowed: VALID_DIET_FILTERS
      });
    }

    const estadoBaseRaw = req.query.estado_base ?? req.query.estado_pesado_base;
    const estadoBase = normalizeEstadoPesado(estadoBaseRaw);
    if (estadoBaseRaw && !estadoBase) {
      return res.status(400).json({
        error: 'Parámetro estado_base inválido',
        allowed: VALID_ESTADOS_PESADO
      });
    }

    const allergensExcludeRaw = req.query.allergens_exclude ?? req.query.alergias_exclude;
    const allergensExclude = normalizeStringArray(allergensExcludeRaw);
    const onlyVerified = req.query.only_verified !== 'false';
    let compatibilityContext = null;

    if (compatibleWithItemId) {
      const itemContextResult = await pool.query(
        `
          SELECT COALESCE(mi.food_id, mi.alimento_id) AS current_food_id
          FROM app.nutrition_meal_items mi
          JOIN app.nutrition_meals m ON m.id = mi.meal_id
          JOIN app.nutrition_plan_days d ON d.id = m.plan_day_id
          JOIN app.nutrition_plans_v2 p ON p.id = d.plan_id
          WHERE mi.id::text = $1
            AND p.user_id = $2
          LIMIT 1;
        `,
        [compatibleWithItemId, userId]
      );

      if (itemContextResult.rowCount === 0) {
        return res.status(404).json({ error: 'Ítem de comida no encontrado para filtrar compatibilidad' });
      }

      const currentFoodId = itemContextResult.rows[0]?.current_food_id || null;
      const currentRolesResult = currentFoodId
        ? await pool.query(
          `SELECT role FROM app.food_roles WHERE food_id = $1`,
          [currentFoodId]
        )
        : { rows: [] };

      compatibilityContext = {
        currentFoodId: currentFoodId ? String(currentFoodId) : null,
        currentRoles: currentRolesResult.rows
          .map((row) => String(row.role || '').trim().toUpperCase())
          .filter(Boolean)
      };
    }

    const page = normalizePositiveInt(req.query.page, 1);
    const pageSize = normalizePositiveInt(req.query.page_size ?? req.query.limit, 50, 200);
    const offset = (page - 1) * pageSize;

    const { whereSql, params, normalizedAllergens } = buildFoodCatalogFilters({
      search,
      categoria,
      categoriaDetalle,
      diet,
      allergensExclude,
      estadoBase,
      grupoFactor,
      onlyVerified
    });

    const countQuery = `SELECT COUNT(*)::int AS total FROM app.foods WHERE ${whereSql};`;
    const countResult = await pool.query(countQuery, params);
    const total = countResult.rows[0]?.total || 0;
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

    const dataQuery = `
      SELECT
        id,
        slug,
        nombre,
        categoria,
        categoria_detalle,
        macros_100g,
        fibra_100g,
        porcion_tipica_g,
        estado_pesado_base,
        estado_pesado_mostrado_default,
        metodo_preparacion,
        grupo_factor,
        meal_suitability,
        processing_level,
        culinary_family,
        is_snack_only,
        is_main_dish_allowed,
        palatability_score,
        medida_casera,
        tipo_dieta,
        is_vegetarian,
        is_vegan,
        tags,
        equivalencias,
        is_verified,
        source,
        created_at,
        updated_at
      FROM app.foods
      WHERE ${whereSql}
      ORDER BY nombre
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2};
    `;
    const dataResult = await pool.query(dataQuery, [...params, pageSize, offset]);
    let foods = dataResult.rows;

    if (compatibilityContext) {
      const candidateIds = foods
        .map((food) => String(food.id || '').trim())
        .filter(Boolean);

      let rolesByFoodId = new Map();
      if (candidateIds.length > 0) {
        const rolesResult = await pool.query(
          `
            SELECT food_id, role
            FROM app.food_roles
            WHERE food_id::text = ANY($1::text[]);
          `,
          [candidateIds]
        );

        rolesByFoodId = rolesResult.rows.reduce((map, row) => {
          const key = String(row.food_id || '').trim();
          if (!key) return map;
          if (!map.has(key)) {
            map.set(key, []);
          }
          map.get(key).push(String(row.role || '').trim().toUpperCase());
          return map;
        }, new Map());
      }

      foods = foods.filter((food) => {
        const foodId = String(food.id || '').trim();
        if (!foodId) return false;
        if (compatibilityContext.currentFoodId && foodId === compatibilityContext.currentFoodId) {
          return false;
        }

        const newRoles = rolesByFoodId.get(foodId) || [];
        if (compatibilityContext.currentRoles.length > 0 && newRoles.length === 0) {
          return false;
        }

        return areRoleSetsCompatible(compatibilityContext.currentRoles, newRoles);
      });
    }

    res.json({
      foods,
      pagination: {
        page,
        page_size: pageSize,
        total: compatibilityContext ? foods.length : total,
        total_pages: compatibilityContext ? (foods.length > 0 ? 1 : 0) : totalPages,
        has_next: compatibilityContext ? false : (totalPages > 0 && page < totalPages),
        has_prev: page > 1
      },
      filters: {
        search,
        categoria,
        categoria_detalle: categoriaDetalle,
        diet,
        allergens_exclude: normalizedAllergens,
        estado_base: estadoBase,
        grupo_factor: grupoFactor,
        only_verified: onlyVerified,
        compatible_with_item_id: compatibleWithItemId || null
      }
    });
  } catch (error) {
    console.error('Error al buscar alimentos:', error);
    res.status(500).json({ error: 'Error al buscar alimentos' });
  }
});

/**
 * GET /api/nutrition-v2/foods/categories
 * Obtener categorías de alimentos disponibles
 */
router.get('/foods/categories', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT categoria, COUNT(*) as count
      FROM app.foods
      GROUP BY categoria
      ORDER BY categoria;
    `;

    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
});

/**
 * GET /api/nutrition-v2/food-conversion-factors
 * Obtener factores de conversión de estados de pesado.
 */
router.get('/food-conversion-factors', authenticateToken, async (req, res) => {
  try {
    const groupFactorRaw = req.query.grupo_factor ?? req.query.group_factor;
    const groupFactor = typeof groupFactorRaw === 'string' ? groupFactorRaw.trim() : null;

    const estadoBaseRaw = req.query.estado_base;
    const estadoBase = normalizeEstadoPesado(estadoBaseRaw);
    if (estadoBaseRaw && !estadoBase) {
      return res.status(400).json({
        error: 'Parámetro estado_base inválido',
        allowed: VALID_ESTADOS_PESADO
      });
    }

    const estadoObjetivoRaw = req.query.estado_objetivo;
    const estadoObjetivo = normalizeEstadoPesado(estadoObjetivoRaw);
    if (estadoObjetivoRaw && !estadoObjetivo) {
      return res.status(400).json({
        error: 'Parámetro estado_objetivo inválido',
        allowed: VALID_ESTADOS_PESADO
      });
    }

    let query = `
      SELECT
        id,
        grupo_factor,
        estado_base,
        estado_objetivo,
        factor_base_objetivo,
        nota
      FROM app.food_conversion_factors
      WHERE 1=1
    `;
    const params = [];

    if (groupFactor) {
      query += ` AND LOWER(grupo_factor) = LOWER($${params.length + 1})`;
      params.push(groupFactor);
    }

    if (estadoBase) {
      query += ` AND estado_base = $${params.length + 1}`;
      params.push(estadoBase);
    }

    if (estadoObjetivo) {
      query += ` AND estado_objetivo = $${params.length + 1}`;
      params.push(estadoObjetivo);
    }

    query += ' ORDER BY grupo_factor, estado_base, estado_objetivo';
    const result = await pool.query(query, params);

    res.json({
      factors: result.rows,
      filters: {
        grupo_factor: groupFactor,
        estado_base: estadoBase,
        estado_objetivo: estadoObjetivo
      }
    });
  } catch (error) {
    console.error('Error al obtener factores de conversión:', error);
    res.status(500).json({ error: 'Error al obtener factores de conversión' });
  }
});

// ================================================
// GENERACIÓN DE MENÚS CON IA
// ================================================

/**
 * POST /api/nutrition-v2/generate-menu
 * Generar menú específico para una comida usando IA
 */
router.post('/generate-menu', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { meal, dayInfo, persist = true } = req.body;
    const modeRaw = String(req.body.mode || 'deterministic').toLowerCase();
    if (!VALID_MENU_GENERATION_MODES.includes(modeRaw)) {
      return res.status(400).json({
        error: 'Modo de generación inválido',
        allowed: VALID_MENU_GENERATION_MODES
      });
    }
    if (modeRaw === 'hybrid_ai' && !isHybridAiEnabled()) {
      return res.status(400).json({
        error: 'Modo hybrid_ai deshabilitado',
        hint: 'Activa NUTRITION_HYBRID_ENABLED=true para habilitarlo'
      });
    }

    // Validar datos requeridos
    if (!meal || !dayInfo) {
      return res.status(400).json({ error: 'Faltan datos de comida o día' });
    }

    let varietyContext = null;
    if (modeRaw === 'deterministic' || modeRaw === 'hybrid_ai' || modeRaw === 'recipe_examples') {
      const dayIndex = Number.parseInt(dayInfo?.day_index, 10);
      const planId = dayInfo?.plan_id || dayInfo?.planId || null;
      varietyContext = createVarietyContext();
      varietyContext.recentFoodUsage = await loadRecentFoodUsageMap({
        planId,
        currentDayIndex: dayIndex,
        lookbackDays: DETERMINISTIC_RECENT_FOOD_WINDOW_DAYS
      });
    }

    const generationContext = modeRaw === 'hybrid_ai'
      ? await getUserMenuGenerationContext({ userId, foodsLimit: 120 })
      : null;
    const conversionFactors = modeRaw === 'hybrid_ai'
      ? await getMenuConversionFactors()
      : null;

    console.log(`🧠 Generando menú (${modeRaw}) para:`, meal.nombre);
    const result = await generateMenuForMeal({
      userId,
      meal,
      dayInfo,
      mode: modeRaw,
      varietyContext,
      generationContext,
      conversionFactors
    });
    let persistedItems = null;

    if (persist && meal?.id) {
      persistedItems = await persistGeneratedMenuItemsForMeal({
        mealId: meal.id,
        menuData: result.menu,
        availableFoods: result.availableFoods
      });
    }

    res.json({
      success: true,
      mode: modeRaw,
      menu: result.menu,
      metadata: result.metadata,
      persistence: persistedItems
    });
  } catch (error) {
    console.error('Error generando menú:', error);
    res.status(500).json({
      error: 'Error al generar menú',
      details: error.message
    });
  }
});

/**
 * POST /api/nutrition-v2/meals/:mealId/items/:itemId/swap-food
 * Sustituir un alimento de una comida y recalcular macros/kcal de toda la comida.
 */
router.post('/meals/:mealId/items/:itemId/swap-food', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const { mealId, itemId } = req.params;
    const {
      replacement_food_id: replacementFoodIdRaw,
      replacement_food_slug: replacementFoodSlugRaw,
      estado_pesado_mostrado: estadoPesadoMostradoRaw
    } = req.body || {};

    const replacementFoodId = replacementFoodIdRaw ? String(replacementFoodIdRaw).trim() : null;
    const replacementFoodSlug = replacementFoodSlugRaw ? String(replacementFoodSlugRaw).trim() : null;

    if (!mealId || !itemId) {
      return res.status(400).json({ success: false, error: 'mealId y itemId son requeridos' });
    }
    if (!replacementFoodId && !replacementFoodSlug) {
      return res.status(400).json({
        success: false,
        error: 'Debes enviar replacement_food_id o replacement_food_slug'
      });
    }

    const itemResult = await client.query(
      `
        SELECT
          mi.*,
          m.nombre AS meal_name,
          m.kcal AS meal_kcal,
          m.macros AS meal_macros,
          d.id AS day_id,
          d.plan_id,
          d.day_index,
          d.tipo_dia,
          COALESCE(mi.food_id, mi.alimento_id) AS current_food_id
        FROM app.nutrition_meal_items mi
        JOIN app.nutrition_meals m ON m.id = mi.meal_id
        JOIN app.nutrition_plan_days d ON d.id = m.plan_day_id
        JOIN app.nutrition_plans_v2 p ON p.id = d.plan_id
        WHERE mi.id = $1
          AND mi.meal_id = $2
          AND p.user_id = $3
        LIMIT 1;
      `,
      [itemId, mealId, userId]
    );

    if (itemResult.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Ítem de comida no encontrado' });
    }
    const currentItem = itemResult.rows[0];

    const replacementFoodResult = await client.query(
      `
        SELECT
          id,
          slug,
          nombre,
          macros_100g,
          tags,
          estado_pesado_base,
          estado_pesado_mostrado_default,
          grupo_factor,
          is_verified
        FROM app.foods
        WHERE is_verified = TRUE
          AND (
            ($1::uuid IS NOT NULL AND id = $1::uuid)
            OR ($2::text IS NOT NULL AND LOWER(slug) = LOWER($2))
          )
        LIMIT 1;
      `,
      [replacementFoodId || null, replacementFoodSlug || null]
    );

    if (replacementFoodResult.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Alimento de reemplazo no encontrado o no verificado' });
    }
    const replacementFood = replacementFoodResult.rows[0];

    const mealItemsResult = await client.query(
      `
        SELECT
          mi.id,
          mi.meal_id,
          mi.orden,
          mi.descripcion,
          mi.kcal AS item_kcal,
          mi.macros AS item_macros,
          mi.tags AS item_tags,
          mi.cantidad_g,
          mi.cantidad_g_base,
          mi.cantidad_g_mostrada,
          mi.estado_pesado_base,
          mi.estado_pesado_mostrado,
          COALESCE(mi.food_id, mi.alimento_id) AS current_food_id,
          f.id AS db_food_id,
          f.slug AS db_food_slug,
          f.nombre AS db_food_nombre,
          f.macros_100g AS db_food_macros_100g,
          f.tags AS db_food_tags,
          f.estado_pesado_base AS db_food_estado_base,
          f.estado_pesado_mostrado_default AS db_food_estado_mostrado_default,
          f.grupo_factor AS db_food_grupo_factor,
          f.is_verified AS db_food_verified
        FROM app.nutrition_meal_items mi
        LEFT JOIN app.foods f ON f.id = COALESCE(mi.food_id, mi.alimento_id)
        WHERE mi.meal_id = $1
        ORDER BY mi.orden, mi.id;
      `,
      [mealId]
    );

    if (mealItemsResult.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'No hay items en la comida para recalcular' });
    }

    const targetMealItem = mealItemsResult.rows.find((row) => String(row.id) === String(itemId));
    if (!targetMealItem) {
      return res.status(404).json({ success: false, error: 'Ítem objetivo no encontrado en la comida' });
    }

    const foodIdsForRoleLookup = [
      ...new Set(
        mealItemsResult.rows
          .map((row) => row.current_food_id)
          .concat([replacementFood.id, currentItem.current_food_id])
          .filter(Boolean)
      )
    ];

    let rolesByFoodId = new Map();
    if (foodIdsForRoleLookup.length > 0) {
      const rolesResult = await client.query(
        `
          SELECT food_id, role
          FROM app.food_roles
          WHERE food_id = ANY($1::uuid[]);
        `,
        [foodIdsForRoleLookup]
      );
      rolesByFoodId = rolesResult.rows.reduce((acc, row) => {
        const key = String(row.food_id || '');
        if (!key) return acc;
        if (!acc.has(key)) acc.set(key, []);
        acc.get(key).push(String(row.role || '').toUpperCase());
        return acc;
      }, new Map());
    }

    const currentRoles = rolesByFoodId.get(String(currentItem.current_food_id || '')) || [];
    const replacementRoles = rolesByFoodId.get(String(replacementFood.id || '')) || [];

    if (!areRoleSetsCompatible(currentRoles, replacementRoles)) {
      return res.status(400).json({
        success: false,
        error: 'El alimento de reemplazo no es compatible con el rol del ítem actual',
        current_roles: currentRoles,
        replacement_roles: replacementRoles
      });
    }

    const foodGroupFactors = [
      ...new Set(
        mealItemsResult.rows
          .map((row) => String(
            String(row.id) === String(itemId)
              ? replacementFood.grupo_factor
              : row.db_food_grupo_factor
          ).trim().toLowerCase())
          .filter(Boolean)
      )
    ];
    const conversionRows = foodGroupFactors.length > 0
      ? (
        await client.query(
          `
            SELECT grupo_factor, estado_base, estado_objetivo, factor_base_objetivo
            FROM app.food_conversion_factors
            WHERE LOWER(grupo_factor) = ANY($1);
          `,
          [foodGroupFactors]
        )
      ).rows
      : [];
    const conversionMap = buildConversionMapFromRows(conversionRows);

    let mealMacrosTarget = parseMealMacros({
      macros: currentItem.meal_macros
    });
    let mealKcalTarget = parseNumeric(currentItem.meal_kcal) ?? 0;
    if (!(mealMacrosTarget.protein_g > 0) && !(mealMacrosTarget.carbs_g > 0) && !(mealMacrosTarget.fat_g > 0)) {
      mealMacrosTarget = mealItemsResult.rows.reduce((acc, row) => {
        const macros = parseJsonObject(row.item_macros, {});
        acc.protein_g += parseNumeric(macros.protein_g) ?? 0;
        acc.carbs_g += parseNumeric(macros.carbs_g) ?? 0;
        acc.fat_g += parseNumeric(macros.fat_g) ?? 0;
        return acc;
      }, { protein_g: 0, carbs_g: 0, fat_g: 0 });
    }
    if (!(mealKcalTarget > 0)) {
      mealKcalTarget = Math.round(
        (mealMacrosTarget.protein_g * 4)
        + (mealMacrosTarget.carbs_g * 4)
        + (mealMacrosTarget.fat_g * 9)
      );
    }

    const draftEntries = mealItemsResult.rows.map((row) => {
      const isTarget = String(row.id) === String(itemId);
      const selectedFood = isTarget
        ? replacementFood
        : {
          id: row.db_food_id,
          slug: row.db_food_slug,
          nombre: row.db_food_nombre,
          macros_100g: row.db_food_macros_100g,
          tags: row.db_food_tags,
          estado_pesado_base: row.db_food_estado_base,
          estado_pesado_mostrado_default: row.db_food_estado_mostrado_default,
          grupo_factor: row.db_food_grupo_factor
        };

      if (!selectedFood?.id || !selectedFood?.macros_100g) {
        throw new Error(`No se encontraron datos nutricionales válidos para el item ${row.id}`);
      }

      const itemMacros = parseJsonObject(row.item_macros, {});
      const roleSet = isTarget
        ? currentRoles
        : (rolesByFoodId.get(String(selectedFood.id)) || []);
      const role = getPrimaryRoleFromRoles(roleSet, itemMacros);
      const bounds = getRoleGramBounds(role);
      const macros100 = parseJsonObject(selectedFood.macros_100g, {});
      const proteinPerG = (parseNumeric(macros100.protein_g) ?? 0) / 100;
      const carbsPerG = (parseNumeric(macros100.carbs_g) ?? 0) / 100;
      const fatPerG = (parseNumeric(macros100.fat_g) ?? 0) / 100;
      const kcalPerG = (parseNumeric(macros100.kcal) ?? ((proteinPerG * 4) + (carbsPerG * 4) + (fatPerG * 9)) * 100) / 100;

      if (!(proteinPerG > 0) && !(carbsPerG > 0) && !(fatPerG > 0)) {
        throw new Error(`El alimento ${selectedFood.nombre} no tiene macros válidos`);
      }

      let initialBase = isTarget
        ? computeSwapBaseGrams({
          oldItemMacros: itemMacros,
          oldItemKcal: parseNumeric(row.item_kcal),
          newFood: selectedFood,
          primaryRole: role
        })
        : resolveBaseGramsFromMealItem(
          {
            ...row,
            grupo_factor: selectedFood.grupo_factor
          },
          conversionMap
        );
      if (!(initialBase > 0)) {
        initialBase = computeSwapBaseGrams({
          oldItemMacros: itemMacros,
          oldItemKcal: parseNumeric(row.item_kcal),
          newFood: selectedFood,
          primaryRole: role
        });
      }

      const requestedShownState = isTarget
        ? (
          normalizeEstadoPesado(estadoPesadoMostradoRaw)
          || normalizeEstadoPesado(row.estado_pesado_mostrado)
          || normalizeEstadoPesado(selectedFood.estado_pesado_mostrado_default)
          || normalizeEstadoPesado(selectedFood.estado_pesado_base)
          || 'tal_cual'
        )
        : (
          normalizeEstadoPesado(row.estado_pesado_mostrado)
          || normalizeEstadoPesado(selectedFood.estado_pesado_mostrado_default)
          || normalizeEstadoPesado(selectedFood.estado_pesado_base)
          || 'tal_cual'
        );

      return {
        row,
        isTarget,
        role,
        selectedFood,
        bounds,
        macros100,
        proteinPerG,
        carbsPerG,
        fatPerG,
        kcalPerG,
        requestedShownState,
        initialBase: clampNumber(initialBase, bounds.min, bounds.max)
      };
    });

    const optimizedBaseGrams = optimizeDraftItemGrams({
      draftItems: draftEntries.map((entry) => ({
        role: entry.role,
        food: entry.selectedFood,
        macros100: entry.macros100,
        proteinPerG: entry.proteinPerG,
        carbsPerG: entry.carbsPerG,
        fatPerG: entry.fatPerG,
        kcalPerG: entry.kcalPerG,
        bounds: entry.bounds,
        gramosBase: entry.initialBase
      })),
      mealMacros: mealMacrosTarget,
      mealKcalTarget
    });

    const recalculatedItems = draftEntries.map((entry, index) => {
      const cantidadBase = Number(optimizedBaseGrams[index].toFixed(1));
      const conversionState = resolveShownStateWithFallback({
        grupoFactor: entry.selectedFood.grupo_factor,
        estadoBase: normalizeEstadoPesado(entry.selectedFood.estado_pesado_base) || 'tal_cual',
        estadoMostrado: entry.requestedShownState,
        conversionMap
      });
      const cantidadMostrada = Number((cantidadBase * conversionState.factor).toFixed(1));
      const computed = computeMacrosAndKcalFromFood(entry.selectedFood, cantidadBase);
      const tags = Array.isArray(entry.selectedFood.tags)
        ? entry.selectedFood.tags
        : normalizeStringArray(entry.selectedFood.tags);

      return {
        itemId: entry.row.id,
        orden: entry.row.orden,
        isTarget: entry.isTarget,
        role: entry.role,
        food: entry.selectedFood,
        estado_pesado_base: conversionState.estadoBase,
        estado_pesado_mostrado: conversionState.estadoMostradoFinal,
        estado_fallback_aplicado: conversionState.fallbackApplied,
        estado_fallback_motivo: conversionState.blockedReason,
        estado_fallback_mensaje: conversionState.fallbackMessage,
        cantidad_g_base: cantidadBase,
        cantidad_g_mostrada: cantidadMostrada,
        cantidad_g: cantidadMostrada,
        kcal: computed.kcal,
        macros: {
          protein_g: computed.protein_g,
          carbs_g: computed.carbs_g,
          fat_g: computed.fat_g
        },
        tags
      };
    });

    const totals = calculateMacroTotals(recalculatedItems);
    const mealValidation = {
      kcal_total: Math.round(totals.kcal),
      macros_totales: {
        protein_g: Number(totals.protein_g.toFixed(2)),
        carbs_g: Number(totals.carbs_g.toFixed(2)),
        fat_g: Number(totals.fat_g.toFixed(2))
      },
      error_kcal_porcentaje: percentError(totals.kcal, mealKcalTarget),
      error_protein_porcentaje: percentError(totals.protein_g, mealMacrosTarget.protein_g),
      error_carbs_porcentaje: percentError(totals.carbs_g, mealMacrosTarget.carbs_g),
      error_fat_porcentaje: percentError(totals.fat_g, mealMacrosTarget.fat_g)
    };
    const mealMaxError = Math.max(
      mealValidation.error_kcal_porcentaje,
      mealValidation.error_protein_porcentaje,
      mealValidation.error_carbs_porcentaje,
      mealValidation.error_fat_porcentaje
    );

    if (mealMaxError > SWAP_MEAL_RECALC_MAX_ERROR) {
      return res.status(409).json({
        success: false,
        code: 'swap_not_feasible',
        error: 'No hemos podido ajustar esta comida de forma coherente con ese cambio. Prueba otro alimento.',
        validation: mealValidation,
        max_error: mealMaxError
      });
    }

    await client.query('BEGIN');
    for (const item of recalculatedItems) {
      await client.query(
        `
          UPDATE app.nutrition_meal_items
          SET
            alimento_id = $1,
            food_id = $1,
            descripcion = $2,
            cantidad_g = $3,
            kcal = $4,
            macros = $5::jsonb,
            tags = $6::jsonb,
            estado_pesado_base = $7,
            estado_pesado_mostrado = $8,
            cantidad_g_base = $9,
            cantidad_g_mostrada = $10
          WHERE id = $11
            AND meal_id = $12;
        `,
        [
          item.food.id,
          item.food.nombre,
          item.cantidad_g,
          item.kcal,
          JSON.stringify(item.macros),
          JSON.stringify(item.tags),
          item.estado_pesado_base,
          item.estado_pesado_mostrado,
          item.cantidad_g_base,
          item.cantidad_g_mostrada,
          item.itemId,
          mealId
        ]
      );
    }

    await client.query(
      `
        UPDATE app.nutrition_meals
        SET
          kcal = $1,
          macros = $2::jsonb
        WHERE id = $3;
      `,
      [
        mealValidation.kcal_total,
        JSON.stringify(mealValidation.macros_totales),
        mealId
      ]
    );
    await client.query('COMMIT');

    const updatedTargetItem = recalculatedItems.find((item) => item.isTarget);
    const stateWarnings = recalculatedItems
      .filter((item) => item.estado_fallback_aplicado && item.estado_fallback_mensaje)
      .map((item) => ({
        item_id: item.itemId,
        food_id: item.food.id,
        food_name: item.food.nombre,
        reason_code: item.estado_fallback_motivo,
        message: item.estado_fallback_mensaje
      }));

    res.json({
      success: true,
      meal_id: mealId,
      item_id: itemId,
      previous_item: {
        food_id: currentItem.current_food_id,
        descripcion: currentItem.descripcion,
        cantidad_g_base: currentItem.cantidad_g_base ?? currentItem.cantidad_g ?? null,
        cantidad_g_mostrada: currentItem.cantidad_g_mostrada ?? currentItem.cantidad_g ?? null,
        kcal: currentItem.kcal,
        macros: parseJsonObject(currentItem.macros, {})
      },
      updated_item: {
        food_id: updatedTargetItem.food.id,
        food_slug: updatedTargetItem.food.slug,
        descripcion: updatedTargetItem.food.nombre,
        primary_role: updatedTargetItem.role,
        roles: replacementRoles,
        cantidad_g_base: updatedTargetItem.cantidad_g_base,
        cantidad_g_mostrada: updatedTargetItem.cantidad_g_mostrada,
        estado_pesado_base: updatedTargetItem.estado_pesado_base,
        estado_pesado_mostrado: updatedTargetItem.estado_pesado_mostrado,
        kcal: updatedTargetItem.kcal,
        macros: updatedTargetItem.macros,
        state_adjustment: {
          applied: Boolean(updatedTargetItem.estado_fallback_aplicado),
          reason_code: updatedTargetItem.estado_fallback_motivo,
          message: updatedTargetItem.estado_fallback_mensaje
        }
      },
      meal_summary: {
        items_recalculated: recalculatedItems.length,
        kcal: mealValidation.kcal_total,
        macros: mealValidation.macros_totales,
        validation: mealValidation,
        max_error: mealMaxError
      },
      swap_warnings: stateWarnings
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    console.error('Error en swap de alimento:', error);
    res.status(500).json({ success: false, error: 'Error al sustituir alimento', details: error.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/nutrition-v2/generate-full-day-menus
 * Generar todos los menús de un día completo
 */
router.post('/generate-full-day-menus', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { dayId, persist = true } = req.body;
    const modeRaw = String(req.body.mode || 'deterministic').toLowerCase();
    if (!VALID_MENU_GENERATION_MODES.includes(modeRaw)) {
      return res.status(400).json({
        error: 'Modo de generación inválido',
        allowed: VALID_MENU_GENERATION_MODES
      });
    }
    if (modeRaw === 'hybrid_ai' && !isHybridAiEnabled()) {
      return res.status(400).json({
        error: 'Modo hybrid_ai deshabilitado',
        hint: 'Activa NUTRITION_HYBRID_ENABLED=true para habilitarlo'
      });
    }

    if (!dayId) {
      return res.status(400).json({ error: 'Falta ID del día' });
    }

    // Obtener día completo con comidas
    const dayQuery = `
      SELECT
        d.*,
        (
          SELECT json_agg(m ORDER BY m.orden)
          FROM app.nutrition_meals m
          WHERE m.plan_day_id = d.id
        ) as meals
      FROM app.nutrition_plan_days d
      JOIN app.nutrition_plans_v2 p ON p.id = d.plan_id
      WHERE d.id = $1 AND p.user_id = $2;
    `;

    const dayResult = await pool.query(dayQuery, [dayId, userId]);

    if (dayResult.rows.length === 0) {
      return res.status(404).json({ error: 'Día no encontrado' });
    }

    const day = dayResult.rows[0];
    const generatedMenus = [];
    const needsVarietyContext = modeRaw === 'deterministic' || modeRaw === 'hybrid_ai' || modeRaw === 'recipe_examples';
    const varietyContext = needsVarietyContext ? createVarietyContext() : null;
    if (varietyContext) {
      varietyContext.recentFoodUsage = await loadRecentFoodUsageMap({
        planId: day.plan_id,
        currentDayIndex: Number.parseInt(day.day_index, 10),
        lookbackDays: DETERMINISTIC_RECENT_FOOD_WINDOW_DAYS
      });
    }
    const generationContext = modeRaw === 'hybrid_ai'
      ? await getUserMenuGenerationContext({ userId, foodsLimit: 120 })
      : null;
    const conversionFactors = modeRaw === 'hybrid_ai'
      ? await getMenuConversionFactors()
      : null;

    for (const meal of day.meals) {
      try {
        const menuResponse = await generateMenuForMeal({
          userId,
          meal,
          dayInfo: {
            plan_id: day.plan_id,
            day_id: day.id,
            tipo_dia: day.tipo_dia,
            day_index: day.day_index
          },
          mode: modeRaw,
          varietyContext,
          generationContext,
          conversionFactors
        });

        generatedMenus.push({
          meal_id: meal.id,
          menu: menuResponse.menu,
          metadata: menuResponse.metadata
        });

        if (persist) {
          const persistence = await persistGeneratedMenuItemsForMeal({
            mealId: meal.id,
            menuData: menuResponse.menu,
            availableFoods: menuResponse.availableFoods
          });

          generatedMenus[generatedMenus.length - 1].persistence = persistence;
        }

        if (varietyContext) {
          registerMenuFoodsInVarietyContext(varietyContext, menuResponse.menu, menuResponse.availableFoods);
        }

        await new Promise(resolve => setTimeout(resolve, 600));
      } catch (error) {
        console.error(`Error generando menú para ${meal.nombre}:`, error);
        generatedMenus.push({
          meal_id: meal.id,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      mode: modeRaw,
      day_id: dayId,
      menus_generated: generatedMenus.filter(m => !m.error).length,
      total_meals: day.meals.length,
      items_persisted: generatedMenus.reduce((acc, menu) => acc + (menu.persistence?.inserted_items || 0), 0),
      fallback_count: generatedMenus.reduce(
        (acc, menu) => acc + (menu?.metadata?.fallback_used ? 1 : 0),
        0
      ),
      menus: generatedMenus
    });
  } catch (error) {
    console.error('Error generando menús del día:', error);
    res.status(500).json({ error: 'Error al generar menús del día' });
  }
});

// ================================================
// MEDICIONES Y REEVALUACIÓN (14 DÍAS)
// ================================================

router.post('/measurements', authenticateToken, async (req, res) => {
  return res.status(410).json({
    error: 'Ruta deprecada. Usa /api/body-measurements',
    replaced_by: '/api/body-measurements'
  });
});

router.post('/evaluate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date();

    const profileResult = await pool.query(
      'SELECT * FROM app.nutrition_profiles WHERE user_id = $1',
      [userId]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil nutricional no encontrado' });
    }

    const profile = profileResult.rows[0];
    const phase =
      profile.current_phase ||
      (profile.objetivo === 'bulk' ? 'volumen' : profile.objetivo === 'cut' ? 'definicion' : 'normocalorica');

    const measurementsResult = await pool.query(
      `
        SELECT * FROM app.body_measurements
        WHERE user_id = $1
        AND is_validated = TRUE
        ORDER BY measurement_date ASC
      `,
      [userId]
    );

    if (measurementsResult.rows.length < 2) {
      return res.status(400).json({ error: 'Se requieren al menos dos mediciones para evaluar' });
    }

    const measurements = measurementsResult.rows;
    const latest = measurements[measurements.length - 1];
    let base = measurements[0];
    let has14DayWindow = false;

    for (let i = measurements.length - 2; i >= 0; i--) {
      const candidate = measurements[i];
      const diff = daysBetween(new Date(candidate.measurement_date), new Date(latest.measurement_date));
      if (diff >= 14) {
        base = candidate;
        has14DayWindow = true;
        break;
      }
    }

    const daysDiff = daysBetween(new Date(base.measurement_date), new Date(latest.measurement_date));
    const evalInput = { weight: Number(base.weight_kg), waist: Number(base.waist_cm) };
    const evalLatest = { weight: Number(latest.weight_kg), waist: Number(latest.waist_cm) };

    let evaluation;
    if (phase === 'volumen') {
      evaluation = evaluateVolume(evalInput, evalLatest);
    } else if (phase === 'definicion') {
      evaluation = evaluateDefinition(evalInput, evalLatest);
    } else {
      evaluation = evaluateMaintenance(evalInput, evalLatest);
    }

    const ratePerWeek =
      ((evalLatest.weight - evalInput.weight) / evalInput.weight) / (daysDiff / 7);

    // Ajustes adicionales por fase siguiendo documento MindFeed
    let adjustmentNote = null;
    if (phase === 'definicion') {
      if (ratePerWeek > -0.003) { // pérdida <0.3%/sem
        adjustmentNote = 'Pérdida lenta: bajar 150-250 kcal/día';
      } else if (ratePerWeek < -0.01) { // pérdida >1%/sem
        adjustmentNote = 'Pérdida rápida: subir 150-250 kcal/día o considerar diet break';
      }
    } else if (phase === 'volumen') {
      if (ratePerWeek < 0.0015) { // ganancia <0.15%/sem
        adjustmentNote = 'Ganancia lenta: subir 150-250 kcal/día';
      } else if (ratePerWeek > 0.0035) { // ganancia >0.35%/sem
        adjustmentNote = 'Ganancia rápida: bajar 150-250 kcal/día';
      }
    } else if (phase === 'normocalorica') {
      if (Math.abs(ratePerWeek) > 0.005) {
        adjustmentNote = 'Peso se mueve >0.5%/14d: ajustar ±150 kcal/día';
      }
    }

    const suspicious =
      Math.abs(evalLatest.waist - evalInput.waist) > 2.5 && Math.abs(evalLatest.weight - evalInput.weight) < 0.5;
    const weightRapidChange = daysDiff <= 7
      ? Math.abs(evalLatest.weight - evalInput.weight) / Math.max(evalInput.weight, 1) > 0.02
      : false;

    let confirmationMeta = null;
    if (has14DayWindow) {
      const indicatorType =
        phase === 'volumen' ? 'icg' : phase === 'definicion' ? 'ipg' : 'iec';
      const confirmationResult = await pool.query(
        `SELECT * FROM app.register_icg_ipg_state($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          userId,
          latest.measurement_date,
          indicatorType,
          evalLatest.weight,
          evalLatest.waist,
          evalLatest.weight - evalInput.weight,
          evalLatest.waist - evalInput.waist,
          evaluation.indicator,
          evaluation.status
        ]
      );
      confirmationMeta = confirmationResult.rows[0] || null;
    }

    const needsConfirmation =
      evaluation.needsConfirmation ||
      !has14DayWindow ||
      suspicious ||
      weightRapidChange ||
      (confirmationMeta && !confirmationMeta.should_apply_change);

    const insertEval = `
      INSERT INTO app.nutrition_evaluations
        (user_id, evaluation_date, phase, indicator_type, indicator_value, status, interpretation, action_recommended, alerts, needs_confirmation, measurement_data)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *;
    `;

    const indicatorType =
      phase === 'volumen' ? 'icg' : phase === 'definicion' ? 'ipg' : 'iec';

    const measurementData = {
      base_id: base.id,
      latest_id: latest.id,
      weight_change: evalLatest.weight - evalInput.weight,
      waist_change: evalLatest.waist - evalInput.waist,
      days: daysDiff
    };

    const evalResult = await pool.query(insertEval, [
      userId,
      today.toISOString().slice(0, 10),
      phase,
      indicatorType,
      evaluation.indicator,
      evaluation.status,
      evaluation.interpretation,
      evaluation.action,
      JSON.stringify({ confirmation: confirmationMeta }),
      needsConfirmation,
      JSON.stringify(measurementData)
    ]);

    if (evaluation.status === 'rojo') {
      await pool.query(
        `
          INSERT INTO app.nutrition_phase_history (user_id, phase, reason, evaluation_data)
          VALUES ($1, $2, $3, $4)
        `,
        [
          userId,
          phase,
          'Recomendación por semáforo rojo',
          JSON.stringify({ evaluation_id: evalResult.rows[0].id, indicator: evaluation.indicator })
        ]
      );

      try {
        const ruleId =
          phase === 'volumen'
            ? 'NUTR-CTRL-VOL-010'
            : phase === 'definicion'
              ? 'NUTR-CTRL-DEF-010'
              : 'NUTR-CTRL-NORM-010';

        await logNutritionChange({
          userId,
          changeType: 'phase_change',
          delta: { from: phase, recommendation: evaluation.action },
          ruleId,
          reason: evaluation.interpretation,
          metrics: {
            indicator_type: indicatorType,
            indicator_value: evaluation.indicator,
            status: evaluation.status
          },
          previousValues: { phase },
          newValues: { recommended_action: evaluation.action },
          source: 'evaluation'
        });
      } catch (error) {
        console.error('Error registrando log de cambio de fase:', error);
      }
    }

    try {
      await ensureWeeklySnapshot(userId, { source: 'nutrition_v2_evaluate' });
    } catch (error) {
      console.error('Error guardando snapshot semanal en reevaluación:', error);
    }

    res.json({
      success: true,
      evaluation: evalResult.rows[0],
      needs_confirmation: needsConfirmation,
      recommendation: adjustmentNote || evaluation.action,
      adjustment_hint: adjustmentNote
    });
  } catch (error) {
    console.error('Error en reevaluación:', error);
    res.status(500).json({ error: 'Error al reevaluar' });
  }
});

// Diet breaks (saltos de dieta)
router.post('/diet-breaks', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      break_date,
      slot,
      description,
      estimated_kcal,
      estimated_macros = {},
      confidence = 'medio'
    } = req.body;

    if (!break_date || !slot || !estimated_kcal) {
      return res.status(400).json({ error: 'Faltan campos requeridos (fecha, franja, calorías)' });
    }

    const insertQuery = `
      INSERT INTO app.diet_breaks
        (user_id, break_date, slot, description, estimated_kcal, estimated_macros, confidence)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;

    const result = await pool.query(insertQuery, [
      userId,
      break_date,
      slot,
      description || '',
      estimated_kcal,
      JSON.stringify(estimated_macros),
      confidence
    ]);

    res.json({ success: true, diet_break: result.rows[0] });
  } catch (error) {
    console.error('Error guardando diet break:', error);
    res.status(500).json({ error: 'Error al guardar diet break' });
  }
});

router.get('/diet-breaks/week', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 6);

    const breaksQuery = `
      SELECT * FROM app.diet_breaks
      WHERE user_id = $1 AND break_date BETWEEN $2 AND $3
      ORDER BY break_date;
    `;
    const breaksResult = await pool.query(breaksQuery, [userId, weekAgo.toISOString().slice(0, 10), today.toISOString().slice(0, 10)]);

    // Obtener kcal objetivo semanal
    const profileResult = await pool.query('SELECT * FROM app.nutrition_profiles WHERE user_id = $1', [userId]);
    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil nutricional no encontrado' });
    }
    const profile = profileResult.rows[0];

    // Intentar recuperar plan activo para kcal objetivo
    let weeklyTarget = null;
    const planResult = await pool.query(
      `SELECT kcal_objetivo FROM app.nutrition_plans_v2 WHERE user_id = $1 AND tipo = 'activo' ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (planResult.rows.length > 0) {
      weeklyTarget = planResult.rows[0].kcal_objetivo * 7;
    }

    const totalBreakKcal = breaksResult.rows.reduce((sum, b) => sum + Number(b.estimated_kcal || 0), 0);

    let suggestion = null;
    if (weeklyTarget) {
      const deviation = totalBreakKcal; // asumimos objetivo ya incluye kcal planificadas
      if (deviation > 0) {
        const correctionPerDay = Math.round(deviation / 2); // repartir en 2 días
        suggestion = `Exceso semanal ≈ ${Math.round(deviation)} kcal. Sugiere recortar ~${correctionPerDay} kcal los próximos 2 días, manteniendo proteína ≥2 g/kg.`;
      } else {
        suggestion = 'Sin exceso registrado; mantener ingesta planificada.';
      }
    }

    res.json({
      success: true,
      breaks: breaksResult.rows,
      weekly_target_kcal: weeklyTarget,
      total_break_kcal: totalBreakKcal,
      suggestion
    });
  } catch (error) {
    console.error('Error obteniendo diet breaks:', error);
    res.status(500).json({ error: 'Error al obtener diet breaks' });
  }
});

// ================================================
// PERFIL METABÓLICO (score cuantificado)
// ================================================

function normalizeLegacyMetabolicEvaluateAnswers(rawAnswers = []) {
  if (!Array.isArray(rawAnswers)) {
    return rawAnswers;
  }

  const answerObject = {};

  rawAnswers.forEach((item, index) => {
    const questionByIndex = METABOLIC_QUESTIONS[index];
    const questionId = item?.id || questionByIndex?.id;
    if (!questionId) {
      return;
    }

    if (item?.unknown === true) {
      answerObject[questionId] = 'no_se';
      return;
    }

    const value = item && typeof item === 'object' && 'value' in item
      ? item.value
      : item;

    if (value === null || value === undefined) {
      answerObject[questionId] = 'no_se';
      return;
    }

    if (value === true || String(value).toLowerCase() === 'si') {
      answerObject[questionId] = 'si';
      return;
    }

    if (value === false || String(value).toLowerCase() === 'no') {
      answerObject[questionId] = 'no';
      return;
    }

    const numericValue = Number(value);
    const questionScore = Number(questionByIndex?.score);
    if (Number.isFinite(numericValue) && Number.isFinite(questionScore)) {
      answerObject[questionId] = numericValue === questionScore ? 'si' : 'no';
      return;
    }

    answerObject[questionId] = String(value).toLowerCase() === 'no_se' ? 'no_se' : 'no';
  });

  return answerObject;
}

router.post('/metabolic-evaluate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { answers = [], signals = {} } = req.body;

    const profileResult = await pool.query(
      `SELECT
        user_id,
        peso_kg,
        objetivo,
        training_type,
        kcal_objetivo,
        tdee,
        level,
        nivel_entrenamiento,
        metabolic_type,
        metabolic_pending_type,
        metabolic_pending_count,
        metabolic_confidence
      FROM app.nutrition_profiles
      WHERE user_id = $1`,
      [userId]
    );
    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil nutricional no encontrado' });
    }
    const profile = profileResult.rows[0];

    const userProfile = {
      peso_kg: profile.peso_kg || 70,
      objetivo: profile.objetivo || 'mant',
      training_type: profile.training_type || 'general',
      kcal_objetivo: profile.kcal_objetivo,
      tdee: profile.tdee,
      level: profile.level || profile.nivel_entrenamiento
    };

    const currentEvaluation = {
      metabolic_profile: profile.metabolic_type || 'mixto',
      pending_profile_change: profile.metabolic_pending_type || null,
      consecutive_change_count: profile.metabolic_pending_count || 0
    };

    const normalizedAnswers = normalizeLegacyMetabolicEvaluateAnswers(answers);
    const objectiveData = {
      objetivo: userProfile.objetivo,
      waistIncreasing: signals.icgFlag === 'high',
      performanceLoss: Boolean(signals.performanceLossCut),
      frequentNightHunger: Boolean(signals.performanceLossCut),
      stableEnergyWithCarbs: Boolean(signals.stableEnergyWithCarbs),
      waistMaintained: Boolean(signals.waistStableOrDown)
    };

    const evaluationResult = processMetabolicEvaluation(
      normalizedAnswers,
      userProfile,
      currentEvaluation,
      objectiveData
    );
    const { pendingType, pendingCount } = calculatePendingProfileState(currentEvaluation, evaluationResult);

    const updateQuery = `
      UPDATE app.nutrition_profiles
      SET metabolic_score = $1,
          metabolic_confidence = $2,
          metabolic_type = $3,
          metabolic_pending_type = $4,
          metabolic_pending_count = $5,
          metabolic_last_evaluated_at = NOW(),
          updated_at = NOW()
      WHERE user_id = $6
      RETURNING *;
    `;

    await pool.query(updateQuery, [
      evaluationResult.adjustedScore,
      evaluationResult.confidence,
      evaluationResult.appliedProfile,
      pendingType,
      pendingCount,
      userId
    ]);

    res.json({
      success: true,
      score: evaluationResult.adjustedScore,
      raw_score: evaluationResult.rawScore,
      confidence: evaluationResult.confidence,
      applied_type: evaluationResult.appliedProfile,
      calculated_type: evaluationResult.calculatedProfile,
      pending_type: pendingType,
      pending_count: pendingCount,
      macros: evaluationResult.macros
    });
  } catch (error) {
    console.error('Error en evaluación metabólica:', error);
    res.status(500).json({ error: 'Error al evaluar perfil metabólico' });
  }
});

// ================================================
// REGISTRO DIARIO (V2) — kcal + day_type + noise_flags
// ================================================

router.get('/daily/:date', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.params;

    const result = await getDailyNutritionLogV2(userId, date);

    res.json({
      success: true,
      exists: result.exists,
      daily: result.daily,
      registered: isNutritionDayRegistered(result.daily)
    });
  } catch (error) {
    const msg = error?.message || 'Error al obtener registro diario';
    if (msg.includes('Fecha inválida')) {
      return res.status(400).json({ success: false, error: msg });
    }
    console.error('Error obteniendo registro diario v2:', error);
    res.status(500).json({ success: false, error: 'Error al obtener registro diario' });
  }
});

router.post('/daily', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const saved = await upsertDailyNutritionLogV2(userId, req.body || {});

    res.json({
      success: true,
      daily: saved,
      registered: isNutritionDayRegistered(saved)
    });
  } catch (error) {
    const msg = error?.message || 'Error al guardar registro diario';
    if (
      msg.includes('Fecha inválida') ||
      msg.includes('day_type inválido') ||
      msg.includes('no puede ser negativo')
    ) {
      return res.status(400).json({ success: false, error: msg });
    }
    console.error('Error guardando registro diario v2:', error);
    res.status(500).json({ success: false, error: 'Error al guardar registro diario' });
  }
});

// ================================================
// REVISIÓN (V2) — semanal (feedback) + quincenal (recomendación)
// ================================================

router.get('/review', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = req.query.today || null; // opcional: YYYY-MM-DD (tests)

    const review = await getNutritionReview(userId, today ? { today } : {});
    if (!review.success) {
      return res.status(404).json(review);
    }

    res.json(review);
  } catch (error) {
    const msg = error?.message || 'Error al obtener revisión nutricional';
    if (msg.includes('today inválido')) {
      return res.status(400).json({ success: false, error: msg });
    }
    console.error('Error obteniendo revisión nutricional:', error);
    res.status(500).json({ success: false, error: 'Error al obtener revisión nutricional' });
  }
});

// ================================================
// AJUSTES (V2) — aplicar / deshacer
// ================================================

router.post('/adjustments/apply', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await applyNutritionKcalAdjustment(userId, req.body || {});
    res.json(result);
  } catch (error) {
    const msg = error?.message || 'Error al aplicar ajuste';
    if (
      msg.includes('mode inválido') ||
      msg.includes('source inválido') ||
      msg.includes('delta_kcal inválido') ||
      msg.includes('Perfil nutricional no encontrado')
    ) {
      return res.status(400).json({ success: false, error: msg });
    }
    if (msg.includes('No tienes un plan nutricional activo')) {
      return res.status(404).json({ success: false, error: msg });
    }
    console.error('Error aplicando ajuste nutricional:', error);
    res.status(500).json({ success: false, error: 'Error al aplicar ajuste nutricional' });
  }
});

router.post('/adjustments/undo-last', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await undoLastNutritionKcalAdjustment(userId, {});
    res.json(result);
  } catch (error) {
    const msg = error?.message || 'Error al deshacer ajuste';
    if (
      msg.includes('No hay ajustes recientes') ||
      msg.includes('Ventana de deshacer expirada')
    ) {
      return res.status(400).json({ success: false, error: msg });
    }
    console.error('Error deshaciendo ajuste nutricional:', error);
    res.status(500).json({ success: false, error: 'Error al deshacer ajuste nutricional' });
  }
});

export default router;
