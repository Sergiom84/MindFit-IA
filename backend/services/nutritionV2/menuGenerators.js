// Generadores de menú por comida de nutrición V2 (ARCH-002).
// Reúne las cuatro estrategias de generación y el orquestador que las despacha por modo:
//   - generateDeterministicMenuForMeal: plantillas + optimización de gramajes.
//   - generateRecipeExamplesMenuForMeal: recetas del catálogo con reglas hard/pairing.
//   - generateAiMenuForMeal: generación por LLM.
//   - generateMenuForMeal: orquestador (deterministic | ai | hybrid_ai | recipe_examples)
//     con fallbacks y auditoría.
// Consume la capa de acceso a datos y los helpers ya extraídos a nutritionV2/. El engine
// re-exporta estas funciones para no romper el contrato con las rutas.

import { pool } from '../../db.js';
import { nutritionMenuGeneratorPrompt } from '../../prompts/nutrition-menu-generator.js';
import { getOpenAIClient } from '../../lib/openaiClient.js';
import {
  generateHybridMenuForMeal,
  HybridMenuGenerationError
} from '../nutritionHybridOrchestrator.js';
import {
  evaluateRecipeHardRules,
  computePairingPenaltyForRecipe
} from '../menuHardRulesEngine.js';
import { parseJsonObject } from '../nutritionUtils.js';
import { parseNumeric, percentError } from './baseUtils.js';
import { normalizeEstadoPesado } from './dietNormalizers.js';
import { buildConversionMapFromRows } from './conversions.js';
import { calculateMacroTotals } from './macroMath.js';
import {
  buildFoodFiltersFromUserPreferences,
  resolveMealType,
  parseMealMacros,
  matchesFoodFilters,
  evaluateCandidateMealBalance
} from './mealSelectionHelpers.js';
import {
  getFoodVarietyPenalty,
  computeMealPalatabilityPenalty,
  registerSelectedRecipeInVarietyContext
} from './varietyPalatability.js';
import {
  buildSlotOptionsForTemplate,
  buildSlotCombinations
} from './roleScoring.js';
import {
  buildDraftItemsForTemplate,
  optimizeDraftItemGrams,
  buildDeterministicMenuItems
} from './deterministicOptimizer.js';
import {
  getDeterministicTemplateCandidates,
  getRecipeExampleCandidates,
  resolveRulesDietType,
  loadMealAcceptabilityRule,
  loadPairingRules,
  getUserMenuGenerationContext,
  getMenuConversionFactors,
  safeLogMenuGeneration
} from './menuDataAccess.js';
import {
  DETERMINISTIC_MAX_TEMPLATE_TRIES,
  DETERMINISTIC_MAX_RECIPE_TRIES,
  HYBRID_FALLBACK_MODE,
  isHybridAiEnabled,
  getHybridModelName
} from './menuGenerationConfig.js';

export async function generateDeterministicMenuForMeal({
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

export async function generateRecipeExamplesMenuForMeal({
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

export async function generateAiMenuForMeal({
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

export async function generateMenuForMeal({
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
