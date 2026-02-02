/**
 * DIET DEVIATION ROUTES
 * Rutas para gestionar saltos de dieta y compensacion semanal
 *
 * Endpoints:
 * - POST /register - Registrar un salto de dieta
 * - GET /weekly - Obtener resumen semanal
 * - GET /list - Listar saltos de una semana
 * - GET /today - Obtener objetivo ajustado de hoy
 * - GET /compensation/:date - Obtener compensacion para una fecha
 * - POST /compensation/:date/apply - Marcar compensacion como aplicada
 * - DELETE /:id - Eliminar un salto
 * - GET /config - Obtener configuracion
 * - PUT /config - Actualizar configuracion
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  registerDeviation,
  getWeeklySummary,
  getDeviationsForWeek,
  getCompensationForDate,
  getAdjustedDailyTarget,
  markCompensationApplied,
  updateUserConfig,
  deleteDeviation,
  checkWeeklyStatus,
  MEAL_SLOTS,
  CONFIDENCE_LEVELS
} from '../services/dietDeviationManager.js';
import { pool } from '../db.js';

const router = express.Router();

// ============================================================================
// REGISTRO DE SALTOS
// ============================================================================

/**
 * POST /register
 * Registra un nuevo salto de dieta
 */
router.post('/register', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      date,
      meal_slot,
      excess_kcal,
      description,
      foods_consumed,
      confidence_level,
      excess_protein,
      excess_carbs,
      excess_fat
    } = req.body;

    // Validaciones basicas
    if (!date) {
      return res.status(400).json({ error: 'Fecha requerida' });
    }
    if (!meal_slot) {
      return res.status(400).json({ error: 'Franja horaria requerida', valid_slots: MEAL_SLOTS });
    }
    if (!excess_kcal || excess_kcal <= 0) {
      return res.status(400).json({ error: 'Calorias de exceso requeridas (valor positivo)' });
    }

    const result = await registerDeviation(userId, {
      date,
      mealSlot: meal_slot,
      excessKcal: excess_kcal,
      description,
      foodsConsumed: foods_consumed,
      confidenceLevel: confidence_level || 'medio',
      excessProtein: excess_protein || 0,
      excessCarbs: excess_carbs || 0,
      excessFat: excess_fat || 0
    });

    res.json({
      success: true,
      deviation: result.deviation,
      compensation_plan: result.compensationPlan,
      message: result.message
    });

  } catch (error) {
    console.error('Error registrando salto de dieta:', error);
    res.status(500).json({ error: error.message || 'Error al registrar salto de dieta' });
  }
});

/**
 * POST /quick-register
 * Registro rapido con datos minimos
 */
router.post('/quick-register', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { excess_kcal, description } = req.body;

    if (!excess_kcal || excess_kcal <= 0) {
      return res.status(400).json({ error: 'Calorias de exceso requeridas' });
    }

    const result = await registerDeviation(userId, {
      date: new Date().toISOString().split('T')[0],
      mealSlot: 'extra',
      excessKcal: excess_kcal,
      description: description || 'Salto rapido',
      confidenceLevel: 'medio'
    });

    res.json({
      success: true,
      deviation: result.deviation,
      compensation_plan: result.compensationPlan,
      message: result.message
    });

  } catch (error) {
    console.error('Error en registro rapido:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// CONSULTAS SEMANALES
// ============================================================================

/**
 * GET /weekly
 * Obtiene el resumen semanal de desviaciones y compensaciones
 */
router.get('/weekly', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { week_start } = req.query;

    const summary = await getWeeklySummary(userId, week_start || null);

    res.json({
      success: true,
      summary
    });

  } catch (error) {
    console.error('Error obteniendo resumen semanal:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /list
 * Lista los saltos de dieta de una semana
 */
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { week_start } = req.query;

    const deviations = await getDeviationsForWeek(userId, week_start || null);

    res.json({
      success: true,
      deviations,
      count: deviations.length
    });

  } catch (error) {
    console.error('Error listando saltos:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /status
 * Obtiene el estado actual de la semana
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const status = await checkWeeklyStatus(userId);

    res.json({
      success: true,
      ...status
    });

  } catch (error) {
    console.error('Error obteniendo estado:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// COMPENSACIONES DIARIAS
// ============================================================================

/**
 * GET /today
 * Obtiene el objetivo ajustado para hoy (con compensaciones)
 */
router.get('/today', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    const adjusted = await getAdjustedDailyTarget(userId, today);

    res.json({
      success: true,
      ...adjusted
    });

  } catch (error) {
    console.error('Error obteniendo objetivo de hoy:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /compensation/:date
 * Obtiene la compensacion para una fecha especifica
 */
router.get('/compensation/:date', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.params;

    const compensation = await getCompensationForDate(userId, date);

    res.json({
      success: true,
      ...compensation
    });

  } catch (error) {
    console.error('Error obteniendo compensacion:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /adjusted/:date
 * Obtiene el objetivo ajustado para una fecha especifica
 */
router.get('/adjusted/:date', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.params;

    const adjusted = await getAdjustedDailyTarget(userId, date);

    res.json({
      success: true,
      ...adjusted
    });

  } catch (error) {
    console.error('Error obteniendo objetivo ajustado:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /compensation/:date/apply
 * Marca la compensacion de una fecha como aplicada
 */
router.post('/compensation/:date/apply', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.params;
    const { actual_kcal_consumed } = req.body;

    const result = await markCompensationApplied(userId, date, actual_kcal_consumed);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Error aplicando compensacion:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// GESTION DE SALTOS INDIVIDUALES
// ============================================================================

/**
 * GET /:id
 * Obtiene los detalles de un salto especifico
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT d.*,
        json_agg(json_build_object(
          'date', c.compensation_date,
          'adjustment', c.kcal_adjustment,
          'applied', c.is_applied
        )) as compensation_plan
       FROM app.diet_deviations d
       LEFT JOIN app.daily_compensation_plan c ON c.deviation_id = d.id
       WHERE d.id = $1 AND d.user_id = $2
       GROUP BY d.id`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Salto no encontrado' });
    }

    res.json({
      success: true,
      deviation: result.rows[0]
    });

  } catch (error) {
    console.error('Error obteniendo salto:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /:id
 * Elimina un salto de dieta y sus compensaciones
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await deleteDeviation(userId, parseInt(id));

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Error eliminando salto:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /:id
 * Actualiza un salto de dieta (solo campos editables)
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { description, confidence_level, excess_kcal } = req.body;

    // Verificar propiedad
    const check = await pool.query(
      'SELECT * FROM app.diet_deviations WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Salto no encontrado' });
    }

    const updates = [];
    const values = [id, userId];
    let paramIndex = 3;

    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (confidence_level !== undefined) {
      updates.push(`confidence_level = $${paramIndex++}`);
      values.push(confidence_level);
    }
    if (excess_kcal !== undefined) {
      updates.push(`excess_kcal = $${paramIndex++}`);
      values.push(excess_kcal);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    const result = await pool.query(
      `UPDATE app.diet_deviations
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      values
    );

    // Si cambio el exceso de calorias, recalcular compensaciones
    if (excess_kcal !== undefined && excess_kcal !== check.rows[0].excess_kcal) {
      // Eliminar compensaciones antiguas
      await pool.query(
        'DELETE FROM app.daily_compensation_plan WHERE deviation_id = $1',
        [id]
      );

      // Volver a registrar para generar nuevas compensaciones
      // (Simplificado: en produccion habria que recalcular sin eliminar)
    }

    res.json({
      success: true,
      deviation: result.rows[0],
      message: 'Salto actualizado'
    });

  } catch (error) {
    console.error('Error actualizando salto:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// CONFIGURACION
// ============================================================================

/**
 * GET /config
 * Obtiene la configuracion de gestion de saltos del usuario
 */
router.get('/user/config', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT * FROM app.diet_deviation_config WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Crear configuracion por defecto
      await pool.query(
        'INSERT INTO app.diet_deviation_config (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
        [userId]
      );
      const defaultResult = await pool.query(
        'SELECT * FROM app.diet_deviation_config WHERE user_id = $1',
        [userId]
      );
      return res.json({ success: true, config: defaultResult.rows[0] });
    }

    res.json({
      success: true,
      config: result.rows[0]
    });

  } catch (error) {
    console.error('Error obteniendo config:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /config
 * Actualiza la configuracion de gestion de saltos
 */
router.put('/user/config', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const config = await updateUserConfig(userId, req.body);

    res.json({
      success: true,
      config,
      message: 'Configuracion actualizada'
    });

  } catch (error) {
    console.error('Error actualizando config:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * GET /meal-slots
 * Obtiene las franjas horarias disponibles
 */
router.get('/options/meal-slots', authenticateToken, (req, res) => {
  res.json({
    success: true,
    meal_slots: MEAL_SLOTS,
    descriptions: {
      desayuno: 'Desayuno (6:00 - 10:00)',
      comida: 'Comida principal (12:00 - 15:00)',
      cena: 'Cena (19:00 - 22:00)',
      snack: 'Snack / Merienda',
      extra: 'Comida extra / Fuera de horario'
    }
  });
});

/**
 * GET /confidence-levels
 * Obtiene los niveles de confianza disponibles
 */
router.get('/options/confidence-levels', authenticateToken, (req, res) => {
  res.json({
    success: true,
    confidence_levels: Object.values(CONFIDENCE_LEVELS),
    descriptions: {
      bajo: 'Estimacion aproximada (aplica compensacion conservadora al 50%)',
      medio: 'Estimacion razonable (aplica compensacion completa)',
      alto: 'Conteo preciso de calorias (aplica compensacion completa)'
    }
  });
});

/**
 * POST /estimate
 * Ayuda a estimar calorias de exceso basado en alimentos comunes
 */
router.post('/estimate', authenticateToken, async (req, res) => {
  try {
    const { foods } = req.body;

    // Estimaciones comunes de exceso (simplificado)
    const commonExcess = {
      'pizza_slice': 250,
      'burger': 400,
      'fries_medium': 300,
      'ice_cream_scoop': 150,
      'beer': 150,
      'wine_glass': 120,
      'cake_slice': 350,
      'chips_bag': 200,
      'chocolate_bar': 250,
      'soda_can': 140,
      'donut': 300,
      'croissant': 250
    };

    let totalEstimate = 0;
    const breakdown = [];

    for (const food of foods || []) {
      const estimate = commonExcess[food.type] || food.kcal || 200;
      const quantity = food.quantity || 1;
      totalEstimate += estimate * quantity;
      breakdown.push({
        food: food.type || food.name,
        quantity,
        kcal: estimate * quantity
      });
    }

    res.json({
      success: true,
      estimated_excess_kcal: totalEstimate,
      breakdown,
      confidence_suggestion: totalEstimate > 0 ? 'medio' : 'bajo',
      note: 'Estas son estimaciones aproximadas. Para mayor precision, use una app de conteo de calorias.'
    });

  } catch (error) {
    console.error('Error estimando:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
