/**
 * Sub-router de nutrición V2: CATÁLOGO DE ALIMENTOS
 * Extraído de routes/nutritionV2.js para reducir el monolito.
 * Se monta bajo la misma base /api/nutrition-v2.
 */

import express from 'express';
import { pool } from '../../db.js';
import { authenticateToken } from '../../middleware/auth.js';
import {
  VALID_ESTADOS_PESADO,
  VALID_DIET_FILTERS,
  normalizeStringArray,
  normalizeDietFilter,
  normalizeEstadoPesado,
  normalizePositiveInt,
  buildFoodCatalogFilters,
  areRoleSetsCompatible
} from '../../services/nutritionV2Engine.js';

const router = express.Router();

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

export default router;
