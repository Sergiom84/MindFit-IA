/**
 * TRAINING-NUTRITION BRIDGE ROUTES
 * Rutas para el puente bidireccional entre entrenamiento y nutricion
 * Implementa el documento "Puente entre Modulos"
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { pool } from '../db.js';
import {
  processTrainingToNutrition,
  processNutritionToTraining,
  checkRecalculationNeeded,
  getBridgeState,
  getAdjustmentHistory,
  COORDINATED_FLAGS
} from '../services/bridgeCoordinator.js';
import {
  calculateBMR,
  calculateTDEE,
  adjustCaloriesForGoal,
  calculateMacros
} from '../services/nutritionCalculator.js';

const router = express.Router();

// ============================================================================
// FLUJO A: ENTRENAMIENTO -> NUTRICION
// ============================================================================

/**
 * POST /training-summary
 * Procesa resumen de entrenamiento y genera ajustes nutricionales
 * Este es el endpoint principal del Flujo A
 */
router.post('/training-summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      methodology,
      calendar = [],
      weekly_cls = null,
      performance = 'mantiene',
      flags = {},
      session_data = null,
      override_kcal,
      objective_phase
    } = req.body || {};

    // Usar el nuevo servicio coordinador
    const result = await processTrainingToNutrition(userId, {
      methodology,
      calendar,
      weekly_cls: weekly_cls || 50,
      performance,
      flags,
      session_data
    });

    // Si hay override, aplicarlo
    if (override_kcal) {
      result.nutrition.kcal_objetivo = override_kcal;
      // Recalcular macros con override
      const profileResult = await pool.query(
        'SELECT * FROM app.nutrition_profiles WHERE user_id = $1',
        [userId]
      );
      if (profileResult.rows.length > 0) {
        const profile = profileResult.rows[0];
        result.nutrition.macros_base = calculateMacros(
          override_kcal,
          profile.peso_kg,
          profile.training_type || 'hipertrofia',
          objective_phase || profile.objetivo || 'mant'
        );
      }
    }

    res.json({
      success: true,
      inputs: {
        methodology,
        weekly_cls,
        performance,
        flags
      },
      nutrition: result.nutrition,
      training_guidance: {
        objetivo_calorico_unico: result.nutrition.kcal_objetivo,
        carb_cycling_aplicado: true,
        notas: result.evaluation.recommendations
      },
      evaluation: result.evaluation,
      metabolic_profile: result.metabolic_profile
    });

  } catch (error) {
    console.error('Error en puente entrenamiento-nutricion:', error);
    res.status(500).json({ error: 'Error al procesar resumen de entrenamiento', details: error.message });
  }
});

/**
 * POST /session-completed
 * Notifica que una sesion de entrenamiento se completo
 * Trigger para recalculo por sesion
 */
router.post('/session-completed', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      session_id,
      exercises_completed,
      total_volume,
      perceived_effort, // 1-10 RPE
      session_duration,
      notes
    } = req.body;

    // Actualizar contador de sesiones
    await pool.query(
      `UPDATE app.bridge_current_state
       SET sessions_since_last_recalc = sessions_since_last_recalc + 1,
           last_session_date = CURRENT_DATE,
           updated_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );

    // Verificar si necesita recalculo
    const recalcCheck = await checkRecalculationNeeded(userId);

    // Calcular fatigue score basado en sesion
    let fatigueIncrement = 0;
    if (perceived_effort >= 9) fatigueIncrement = 15;
    else if (perceived_effort >= 7) fatigueIncrement = 10;
    else if (perceived_effort >= 5) fatigueIncrement = 5;

    // Actualizar fatigue score
    await pool.query(
      `UPDATE app.bridge_current_state
       SET accumulated_fatigue_score = LEAST(100, COALESCE(accumulated_fatigue_score, 0) + $2)
       WHERE user_id = $1`,
      [userId, fatigueIncrement]
    );

    // Log de la sesion
    await pool.query(
      `SELECT app.log_bridge_decision($1, 'training', 'session_completed', $2, NULL, 'session_log', $3, NULL, NULL)`,
      [
        userId,
        JSON.stringify({ session_id, exercises_completed, total_volume, perceived_effort }),
        JSON.stringify({ fatigue_increment: fatigueIncrement, needs_recalc: recalcCheck.needed })
      ]
    );

    res.json({
      success: true,
      session_logged: true,
      fatigue_increment: fatigueIncrement,
      needs_recalculation: recalcCheck.needed,
      recalc_reason: recalcCheck.reason
    });

  } catch (error) {
    console.error('Error registrando sesion completada:', error);
    res.status(500).json({ error: 'Error al registrar sesion', details: error.message });
  }
});

// ============================================================================
// FLUJO B: NUTRICION -> ENTRENAMIENTO
// ============================================================================

/**
 * POST /nutrition-feedback
 * Procesa feedback nutricional y genera recomendaciones de entrenamiento
 * Este es el endpoint principal del Flujo B
 */
router.post('/nutrition-feedback', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      actual_intake,
      weight_trend,
      energy_level,
      recovery_quality,
      adherence_percent
    } = req.body;

    const result = await processNutritionToTraining(userId, {
      actual_intake,
      weight_trend: weight_trend || 'stable',
      energy_level: energy_level || 'normal',
      recovery_quality: recovery_quality || 'good',
      adherence_percent: adherence_percent || 100
    });

    res.json({
      success: true,
      training_guidance: result.training_guidance,
      new_flags: result.new_flags,
      alerts: result.alerts
    });

  } catch (error) {
    console.error('Error en feedback nutricional:', error);
    res.status(500).json({ error: 'Error al procesar feedback nutricional', details: error.message });
  }
});

/**
 * POST /weight-update
 * Registra actualizacion de peso y evalua tendencia
 */
router.post('/weight-update', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { weight_kg, date } = req.body;

    if (!weight_kg) {
      return res.status(400).json({ error: 'Peso requerido' });
    }

    // Obtener peso anterior
    const prevResult = await pool.query(
      `SELECT peso_kg FROM app.nutrition_profiles WHERE user_id = $1`,
      [userId]
    );
    const previousWeight = prevResult.rows[0]?.peso_kg;

    // Actualizar peso en perfil
    await pool.query(
      `UPDATE app.nutrition_profiles SET peso_kg = $2, updated_at = NOW() WHERE user_id = $1`,
      [userId, weight_kg]
    );

    // Calcular tendencia
    let trend = 'stable';
    let changePercent = 0;
    if (previousWeight) {
      changePercent = ((weight_kg - previousWeight) / previousWeight) * 100;
      if (changePercent > 0.5) trend = 'gaining';
      else if (changePercent < -0.5) trend = 'losing';
    }

    // Actualizar estado del bridge
    const stateResult = await pool.query(
      'SELECT * FROM app.bridge_current_state WHERE user_id = $1',
      [userId]
    );

    const profileResult = await pool.query(
      'SELECT objetivo FROM app.nutrition_profiles WHERE user_id = $1',
      [userId]
    );
    const objetivo = profileResult.rows[0]?.objetivo || 'mant';

    // Actualizar dias en deficit/surplus
    let daysInDeficit = stateResult.rows[0]?.days_in_deficit || 0;
    let daysInSurplus = stateResult.rows[0]?.days_in_surplus || 0;

    if (objetivo === 'cut') {
      daysInDeficit += 1;
      daysInSurplus = 0;
    } else if (objetivo === 'bulk') {
      daysInSurplus += 1;
      daysInDeficit = 0;
    } else {
      // Reset gradual en mantenimiento
      daysInDeficit = Math.max(0, daysInDeficit - 1);
      daysInSurplus = Math.max(0, daysInSurplus - 1);
    }

    await pool.query(
      `INSERT INTO app.bridge_current_state (user_id, days_in_deficit, days_in_surplus)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         days_in_deficit = $2,
         days_in_surplus = $3,
         updated_at = NOW()`,
      [userId, daysInDeficit, daysInSurplus]
    );

    // Verificar flags por cambio de peso significativo
    const flags = [];
    if (objetivo === 'cut' && trend === 'losing' && changePercent < -1) {
      // Perdida rapida, posible riesgo muscular
      flags.push({ flag: COORDINATED_FLAGS.MUSCLE_LOSS_RISK, severity: 'medium' });
    }

    res.json({
      success: true,
      previous_weight: previousWeight,
      current_weight: weight_kg,
      change_percent: changePercent.toFixed(2),
      trend,
      days_in_deficit: daysInDeficit,
      days_in_surplus: daysInSurplus,
      flags_triggered: flags
    });

  } catch (error) {
    console.error('Error actualizando peso:', error);
    res.status(500).json({ error: 'Error al actualizar peso', details: error.message });
  }
});

// ============================================================================
// ESTADO Y CONFIGURACION
// ============================================================================

/**
 * GET /state
 * Obtiene el estado actual del bridge para el usuario
 */
router.get('/state', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const bridgeState = await getBridgeState(userId);

    res.json({
      success: true,
      ...bridgeState
    });

  } catch (error) {
    console.error('Error obteniendo estado del bridge:', error);
    res.status(500).json({ error: 'Error al obtener estado', details: error.message });
  }
});

/**
 * GET /needs-recalculation
 * Verifica si el usuario necesita recalculo
 */
router.get('/needs-recalculation', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await checkRecalculationNeeded(userId);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Error verificando recalculo:', error);
    res.status(500).json({ error: 'Error al verificar recalculo', details: error.message });
  }
});

/**
 * GET /config
 * Obtiene la configuracion de recalculo del usuario
 */
router.get('/config', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT * FROM app.bridge_recalculation_config WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      // Crear configuracion por defecto
      await pool.query(
        'INSERT INTO app.bridge_recalculation_config (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
        [userId]
      );
      const defaultResult = await pool.query(
        'SELECT * FROM app.bridge_recalculation_config WHERE user_id = $1',
        [userId]
      );
      return res.json({ success: true, config: defaultResult.rows[0] });
    }

    res.json({ success: true, config: result.rows[0] });

  } catch (error) {
    console.error('Error obteniendo config:', error);
    res.status(500).json({ error: 'Error al obtener configuracion', details: error.message });
  }
});

/**
 * PUT /config
 * Actualiza la configuracion de recalculo
 */
router.put('/config', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      recalc_on_session,
      recalc_weekly_cls,
      recalc_biweekly_metabolic,
      recalc_monthly_full,
      performance_drop_threshold,
      weight_change_threshold,
      notify_on_adjustment,
      auto_apply_minor_changes
    } = req.body;

    const updates = [];
    const values = [userId];
    let paramIndex = 2;

    const addUpdate = (field, value) => {
      if (value !== undefined) {
        updates.push(`${field} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    };

    addUpdate('recalc_on_session', recalc_on_session);
    addUpdate('recalc_weekly_cls', recalc_weekly_cls);
    addUpdate('recalc_biweekly_metabolic', recalc_biweekly_metabolic);
    addUpdate('recalc_monthly_full', recalc_monthly_full);
    addUpdate('performance_drop_threshold', performance_drop_threshold);
    addUpdate('weight_change_threshold', weight_change_threshold);
    addUpdate('notify_on_adjustment', notify_on_adjustment);
    addUpdate('auto_apply_minor_changes', auto_apply_minor_changes);

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    await pool.query(
      `INSERT INTO app.bridge_recalculation_config (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET ${updates.join(', ')}, updated_at = NOW()`,
      values
    );

    const result = await pool.query(
      'SELECT * FROM app.bridge_recalculation_config WHERE user_id = $1',
      [userId]
    );

    res.json({ success: true, config: result.rows[0] });

  } catch (error) {
    console.error('Error actualizando config:', error);
    res.status(500).json({ error: 'Error al actualizar configuracion', details: error.message });
  }
});

// ============================================================================
// FLAGS COORDINADOS
// ============================================================================

/**
 * GET /flags
 * Obtiene los flags activos del usuario
 */
router.get('/flags', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Limpiar flags expirados primero
    await pool.query('SELECT app.cleanup_expired_bridge_flags()');

    const result = await pool.query(
      'SELECT active_flags FROM app.bridge_current_state WHERE user_id = $1',
      [userId]
    );

    const flags = result.rows[0]?.active_flags || [];

    res.json({
      success: true,
      flags,
      available_flags: Object.values(COORDINATED_FLAGS)
    });

  } catch (error) {
    console.error('Error obteniendo flags:', error);
    res.status(500).json({ error: 'Error al obtener flags', details: error.message });
  }
});

/**
 * POST /flags/activate
 * Activa manualmente un flag
 */
router.post('/flags/activate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { flag_name, severity = 'medium', duration_days } = req.body;

    if (!flag_name) {
      return res.status(400).json({ error: 'Nombre del flag requerido' });
    }

    // Validar que el flag existe
    if (!Object.values(COORDINATED_FLAGS).includes(flag_name)) {
      return res.status(400).json({
        error: 'Flag no valido',
        available_flags: Object.values(COORDINATED_FLAGS)
      });
    }

    await pool.query(
      'SELECT app.activate_bridge_flag($1, $2, $3, $4)',
      [userId, flag_name, severity, duration_days]
    );

    // Log de activacion manual
    await pool.query(
      `SELECT app.log_bridge_decision($1, 'manual', 'flag_activated', NULL, NULL, 'flag_manual', $2, NULL, NULL)`,
      [userId, JSON.stringify({ flag: flag_name, severity, duration_days })]
    );

    res.json({
      success: true,
      message: `Flag ${flag_name} activado`,
      severity,
      duration_days
    });

  } catch (error) {
    console.error('Error activando flag:', error);
    res.status(500).json({ error: 'Error al activar flag', details: error.message });
  }
});

/**
 * DELETE /flags/:flag_name
 * Desactiva un flag manualmente
 */
router.delete('/flags/:flag_name', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { flag_name } = req.params;

    // Obtener flags actuales
    const result = await pool.query(
      'SELECT active_flags FROM app.bridge_current_state WHERE user_id = $1',
      [userId]
    );

    const currentFlags = result.rows[0]?.active_flags || [];
    const updatedFlags = currentFlags.filter(f => f.flag !== flag_name);

    await pool.query(
      `UPDATE app.bridge_current_state
       SET active_flags = $2, updated_at = NOW()
       WHERE user_id = $1`,
      [userId, JSON.stringify(updatedFlags)]
    );

    res.json({
      success: true,
      message: `Flag ${flag_name} desactivado`,
      remaining_flags: updatedFlags
    });

  } catch (error) {
    console.error('Error desactivando flag:', error);
    res.status(500).json({ error: 'Error al desactivar flag', details: error.message });
  }
});

// ============================================================================
// HISTORIAL Y LOGS
// ============================================================================

/**
 * GET /history
 * Obtiene el historial de ajustes del bridge
 */
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 20;

    const history = await getAdjustmentHistory(userId, limit);

    res.json({
      success: true,
      history
    });

  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({ error: 'Error al obtener historial', details: error.message });
  }
});

/**
 * GET /decisions
 * Obtiene el log de decisiones del bridge
 */
router.get('/decisions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 20;
    const triggerSource = req.query.source; // 'training', 'nutrition', 'manual', 'scheduled'

    let query = `
      SELECT * FROM app.bridge_decision_logs
      WHERE user_id = $1
    `;
    const params = [userId];

    if (triggerSource) {
      query += ` AND trigger_source = $2`;
      params.push(triggerSource);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      decisions: result.rows
    });

  } catch (error) {
    console.error('Error obteniendo decisiones:', error);
    res.status(500).json({ error: 'Error al obtener decisiones', details: error.message });
  }
});

// ============================================================================
// TRIGGERS PROGRAMADOS
// ============================================================================

/**
 * POST /trigger-recalculation
 * Fuerza un recalculo manual
 */
router.post('/trigger-recalculation', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { reason = 'manual_trigger' } = req.body;

    // Obtener datos actuales
    const profileResult = await pool.query(
      'SELECT * FROM app.nutrition_profiles WHERE user_id = $1',
      [userId]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil nutricional no encontrado' });
    }

    // Ejecutar recalculo completo
    const result = await processTrainingToNutrition(userId, {
      methodology: null,
      calendar: [],
      weekly_cls: 50,
      performance: 'mantiene',
      flags: {}
    });

    // Actualizar timestamps de proximas evaluaciones
    await pool.query(
      `UPDATE app.bridge_current_state
       SET next_cls_update = CURRENT_DATE + 7,
           next_metabolic_eval = CURRENT_DATE + 14,
           last_recalculation = NOW(),
           sessions_since_last_recalc = 0
       WHERE user_id = $1`,
      [userId]
    );

    // Log del recalculo
    await pool.query(
      `SELECT app.log_bridge_decision($1, 'manual', $2, NULL, NULL, 'full_recalculation', $3, $4, NULL)`,
      [
        userId,
        reason,
        JSON.stringify({ triggered_by: 'user', reason }),
        JSON.stringify(result.nutrition)
      ]
    );

    res.json({
      success: true,
      message: 'Recalculo completado',
      nutrition: result.nutrition,
      next_evaluations: {
        cls_update: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        metabolic_eval: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error('Error en recalculo manual:', error);
    res.status(500).json({ error: 'Error al ejecutar recalculo', details: error.message });
  }
});

/**
 * POST /initialize
 * Inicializa el estado del bridge para un usuario nuevo
 */
router.post('/initialize', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Verificar si ya existe
    const existing = await pool.query(
      'SELECT 1 FROM app.bridge_current_state WHERE user_id = $1',
      [userId]
    );

    if (existing.rows.length > 0) {
      return res.json({ success: true, message: 'Estado ya inicializado' });
    }

    // Crear configuracion
    await pool.query(
      'INSERT INTO app.bridge_recalculation_config (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [userId]
    );

    // Crear estado inicial
    await pool.query(
      `INSERT INTO app.bridge_current_state (
        user_id,
        next_cls_update,
        next_metabolic_eval,
        next_full_review
      ) VALUES ($1, CURRENT_DATE + 7, CURRENT_DATE + 14, CURRENT_DATE + 30)`,
      [userId]
    );

    res.json({
      success: true,
      message: 'Estado del bridge inicializado',
      next_evaluations: {
        cls_update: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        metabolic_eval: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        full_review: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error('Error inicializando bridge:', error);
    res.status(500).json({ error: 'Error al inicializar', details: error.message });
  }
});

export default router;
