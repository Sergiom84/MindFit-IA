// Capa de acceso a datos de la generación de menús de nutrición V2 (ARCH-002).
// Agrupa todas las consultas/escrituras a BD que consumen los generadores: carga de
// plantillas/recetas candidatas, reglas de aceptabilidad y emparejamiento, contexto de
// usuario (perfil + alimentos disponibles), factores de conversión, persistencia de
// items de comida y auditoría de generación. Se extrae del monolito nutritionV2Engine.js;
// el engine la re-exporta para no romper el contrato con las rutas.

import { pool } from '../../db.js';
import { parseNumeric, hashString } from './baseUtils.js';
import { normalizeEstadoPesado, normalizeStringArray } from './dietNormalizers.js';
import { buildConversionMapFromRows, resolveShownStateConversion } from './conversions.js';
import {
  buildFoodCatalogFilters,
  buildFoodFiltersFromUserPreferences,
  resolvePhaseContext,
  normalizeTemplateContext,
  resolveSnackSlotTag,
  buildMealSelectionSeedSuffix
} from './mealSelectionHelpers.js';
import { parseJsonObject, normalizeFoodName } from '../nutritionUtils.js';
import { isTrainingDay } from '../trainingLoad/dayType.js';
import { isHipertrofiaMethodology } from '../hipertrofia/identity.js';

export function extractMenuItemsForPersistence(menuData) {
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

export async function persistGeneratedMenuItemsForMeal({ mealId, menuData, availableFoods = [] }) {
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

export function mapMethodologyToTrainingType(value) {
  if (!value) return null;
  if (isHipertrofiaMethodology(value)) return 'hipertrofia';
  const normalized = String(value).toLowerCase();
  if (normalized.includes('fuerza') || normalized.includes('power') || normalized.includes('heavy')) return 'fuerza';
  if (normalized.includes('resistencia') || normalized.includes('cardio') || normalized.includes('oposicion')) {
    return 'resistencia';
  }
  return 'general';
}

export async function getDeterministicTemplateCandidates({ userId, mealType, dayInfo, profile, userFoodFilters }) {
  const phaseContext = resolvePhaseContext(profile);
  const dayTypeContext = isTrainingDay(dayInfo?.tipo_dia) ? 'ENTRENO' : null;
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

export async function getRecipeExampleCandidates({ userId, mealType, meal, dayInfo, profile, userFoodFilters, varietyContext = null }) {
  const phaseContext = resolvePhaseContext(profile);
  const dayTypeContext = isTrainingDay(dayInfo?.tipo_dia) ? 'ENTRENO' : null;
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

export function resolveRulesDietType(userFoodFilters) {
  const diet = String(userFoodFilters?.diet || 'omnivoro').toLowerCase();
  return diet === 'omnivoro' ? 'AMBOS' : 'VEG';
}

export async function loadMealAcceptabilityRule({ mealType, dietType }) {
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

export async function loadPairingRules({ mealType, candidateSlugs = [] }) {
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

export async function getUserMenuGenerationContext({ userId, foodsLimit = 100 }) {
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

export async function getMenuConversionFactors() {
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

export async function safeLogMenuGeneration(logPayload) {
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
