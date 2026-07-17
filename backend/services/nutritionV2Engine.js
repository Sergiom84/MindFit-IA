/**
 * Motor de Nutricion V2 - helpers y constantes extraidos de routes/nutritionV2.js
 * (generacion de menus, normalizacion, conversiones y evaluaciones).
 * Las rutas viven en routes/nutritionV2.js y consumen este modulo.
 */

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
  resolveShownStateConversion,
  computeSwapBaseGrams,
  getConversionBlockedReasonMessage,
  resolveShownStateWithFallback,
  resolveBaseGramsFromMealItem
} from './nutritionV2/conversions.js';
// Variedad y palatabilidad extraídas (ARCH-002). Re-exportadas más abajo.
import {
  createVarietyContext,
  registerSelectedRecipeInVarietyContext,
  loadRecentFoodUsageMap,
  getFoodVarietyPenalty,
  normalizeFamilyValue,
  isMainRecipeRole,
  resolveFoodFamilyForScoring,
  estimateFoodPalatability,
  computeMealPalatabilityPenalty,
  registerMenuFoodsInVarietyContext
} from './nutritionV2/varietyPalatability.js';
// Helpers de selección de comida extraídos (ARCH-002). Re-exportados más abajo.
import {
  buildFoodCatalogFilters,
  buildFoodFiltersFromUserPreferences,
  parseMealMacros,
  normalizeTemplateContext,
  resolvePhaseContext,
  resolveMealType,
  resolveSnackSlotTag,
  buildMealSelectionSeedSuffix,
  extractFoodTagsSet,
  matchesFoodFilters,
  evaluateCandidateMealBalance
} from './nutritionV2/mealSelectionHelpers.js';
// Config de generación de menús extraída (ARCH-002). Re-exportada más abajo.
import {
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
  parseBooleanEnv,
  isHybridAiEnabled,
  getHybridModelName
} from './nutritionV2/menuGenerationConfig.js';
// Scoring de roles y construcción de slots extraídos (ARCH-002). Re-exportados más abajo.
import {
  getRoleGramBounds,
  scoreFoodForRole,
  orderSlotCandidates,
  buildSlotOptionsForTemplate,
  buildSlotCombinations
} from './nutritionV2/roleScoring.js';
// Optimizador de gramajes del generador determinista extraído (ARCH-002). Re-exportado más abajo.
import {
  buildDraftItemsForTemplate,
  optimizeDraftItemGrams,
  buildDeterministicMenuItems
} from './nutritionV2/deterministicOptimizer.js';
// Capa de acceso a datos de generación de menús extraída (ARCH-002). Re-exportada más abajo.
import {
  extractMenuItemsForPersistence,
  persistGeneratedMenuItemsForMeal,
  mapMethodologyToTrainingType,
  getDeterministicTemplateCandidates,
  getRecipeExampleCandidates,
  resolveRulesDietType,
  loadMealAcceptabilityRule,
  loadPairingRules,
  getUserMenuGenerationContext,
  getMenuConversionFactors,
  safeLogMenuGeneration
} from './nutritionV2/menuDataAccess.js';
// Generadores de menú por comida extraídos (ARCH-002). Re-exportados más abajo.
import {
  generateDeterministicMenuForMeal,
  generateRecipeExamplesMenuForMeal,
  generateAiMenuForMeal,
  generateMenuForMeal
} from './nutritionV2/menuGenerators.js';

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
