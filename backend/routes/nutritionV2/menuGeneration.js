/**
 * Sub-router de nutrición V2: GENERACIÓN DE MENÚS CON IA
 * Extraído de routes/nutritionV2.js para reducir el monolito.
 * Se monta bajo la misma base /api/nutrition-v2.
 */

import express from 'express';
import { pool } from '../../db.js';
import { authenticateToken } from '../../middleware/auth.js';
import {
  VALID_MENU_GENERATION_MODES,
  DETERMINISTIC_RECENT_FOOD_WINDOW_DAYS,
  SWAP_MEAL_RECALC_MAX_ERROR,
  parseJsonObject,
  normalizeStringArray,
  normalizeEstadoPesado,
  parseNumeric,
  buildConversionMapFromRows,
  parseMealMacros,
  clampNumber,
  calculateMacroTotals,
  percentError,
  getPrimaryRoleFromRoles,
  areRoleSetsCompatible,
  computeMacrosAndKcalFromFood,
  computeSwapBaseGrams,
  resolveShownStateWithFallback,
  resolveBaseGramsFromMealItem,
  createVarietyContext,
  loadRecentFoodUsageMap,
  registerMenuFoodsInVarietyContext,
  persistGeneratedMenuItemsForMeal,
  getRoleGramBounds,
  optimizeDraftItemGrams,
  getUserMenuGenerationContext,
  getMenuConversionFactors,
  generateMenuForMeal,
  isHybridAiEnabled
} from '../../services/nutritionV2Engine.js';
// A-04: gate de calidad de menús (módulo directo; no pasa por el barrel).
import {
  evaluateMealQuality,
  evaluateDayQuality,
  logMenuQuality
} from '../../services/nutritionV2/menuQualityGate.js';

const router = express.Router();

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

    // A-04: veredicto de calidad explícito. Si el menú supera el umbral de error o usó
    // fallback/emergencia, se marca `quality: degraded` con motivo (no se da por válido
    // en silencio). La UI muestra el aviso.
    const quality = evaluateMealQuality({ meal, menu: result.menu, metadata: result.metadata });
    logMenuQuality('meal', quality, { user_id: userId, meal_id: meal?.id, mode: modeRaw });

    res.json({
      success: true,
      mode: modeRaw,
      menu: result.menu,
      metadata: result.metadata,
      quality,
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
          categoria,
          categoria_detalle,
          macros_100g,
          tags,
          estado_pesado_base,
          estado_pesado_mostrado_default,
          grupo_factor,
          porcion_tipica_g,
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
          f.categoria AS db_food_categoria,
          f.categoria_detalle AS db_food_categoria_detalle,
          f.macros_100g AS db_food_macros_100g,
          f.tags AS db_food_tags,
          f.estado_pesado_base AS db_food_estado_base,
          f.estado_pesado_mostrado_default AS db_food_estado_mostrado_default,
          f.grupo_factor AS db_food_grupo_factor,
          f.porcion_tipica_g AS db_food_porcion_tipica_g,
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
          categoria: row.db_food_categoria,
          categoria_detalle: row.db_food_categoria_detalle,
          macros_100g: row.db_food_macros_100g,
          tags: row.db_food_tags,
          estado_pesado_base: row.db_food_estado_base,
          estado_pesado_mostrado_default: row.db_food_estado_mostrado_default,
          grupo_factor: row.db_food_grupo_factor,
          porcion_tipica_g: row.db_food_porcion_tipica_g
        };

      if (!selectedFood?.id || !selectedFood?.macros_100g) {
        throw new Error(`No se encontraron datos nutricionales válidos para el item ${row.id}`);
      }

      const itemMacros = parseJsonObject(row.item_macros, {});
      const roleSet = isTarget
        ? currentRoles
        : (rolesByFoodId.get(String(selectedFood.id)) || []);
      const role = getPrimaryRoleFromRoles(roleSet, itemMacros);
      const bounds = getRoleGramBounds(role, selectedFood.porcion_tipica_g, selectedFood);
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
          meal, // A-04: se conserva la fila para calcular el target en el gate de día.
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

    // A-04: veredicto de calidad del DÍA (agrega error por comida y del día vs objetivo).
    const dayQuality = evaluateDayQuality(generatedMenus);
    logMenuQuality('day', dayQuality, { user_id: userId, day_id: dayId, mode: modeRaw });

    // No se exponen las filas `meal` internas (se usan solo para el gate de día).
    const menusPayload = generatedMenus.map((entry) => {
      const rest = { ...entry };
      delete rest.meal;
      return rest;
    });

    res.json({
      success: true,
      mode: modeRaw,
      day_id: dayId,
      menus_generated: menusPayload.filter(m => !m.error).length,
      total_meals: day.meals.length,
      items_persisted: menusPayload.reduce((acc, menu) => acc + (menu.persistence?.inserted_items || 0), 0),
      fallback_count: dayQuality.fallback_count,
      quality: dayQuality,
      menus: menusPayload
    });
  } catch (error) {
    console.error('Error generando menús del día:', error);
    res.status(500).json({ error: 'Error al generar menús del día' });
  }
});

export default router;
