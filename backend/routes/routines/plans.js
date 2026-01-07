/**
 * @fileoverview Endpoints de gestión de planes de entrenamiento
 * 
 * Endpoints:
 * - GET /plan - Obtener plan por ID y tipo
 * - POST /bootstrap-plan - Crear plan de metodología desde routine_plan_id
 * - GET /active-plan - Obtener plan activo del usuario
 * - POST /confirm-plan - Confirmar plan (draft → active)
 * - POST /confirm-and-activate - Confirmar y activar plan en un solo paso
 * 
 * @module routes/routines/plans
 */

import express from 'express';
import authenticateToken from '../../middleware/auth.js';
import { pool } from '../../db.js';
import { normalizePlanDays } from '../../utils/shared/planHelpers.js';
import { ensureWorkoutScheduleV3 } from '../../utils/ensureScheduleV3.js';

const router = express.Router();

// =============================================================================
// HELPER: Función legacy deshabilitada (sesiones se crean bajo demanda)
// =============================================================================
async function ensureMethodologySessions() {
  console.log(`📋 [ensureMethodologySessions] DESHABILITADA (FASE 3) - sesiones se crean bajo demanda`);
  return { success: true, created: 0 };
}

// =============================================================================
// GET /plan - Obtener plan por ID y tipo
// =============================================================================
router.get('/plan', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.userId || req.user?.id;
    const { id, type } = req.query;
    
    if (!id || !type) {
      return res.status(400).json({ 
        success: false, 
        error: 'Parámetros requeridos: id y type (routine|methodology)' 
      });
    }

    if (type === 'routine') {
      const r = await client.query(
        `SELECT id, methodology_type, plan_data, generation_mode, frequency_per_week, total_weeks, status 
         FROM app.methodology_plans WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );
      if (r.rowCount === 0) {
        return res.status(404).json({ success: false, error: 'Plan no encontrado' });
      }
      return res.json({ success: true, plan: r.rows[0] });
    }

    if (type === 'methodology') {
      const r = await client.query(
        `SELECT id, methodology_type, plan_data, generation_mode 
         FROM app.methodology_plans WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );
      if (r.rowCount === 0) {
        return res.status(404).json({ success: false, error: 'Plan no encontrado' });
      }
      return res.json({ success: true, plan: r.rows[0] });
    }

    return res.status(400).json({ success: false, error: 'type inválido' });
  } catch (e) {
    console.error('Error fetching routine plan:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  } finally {
    client.release();
  }
});

// =============================================================================
// POST /bootstrap-plan - Crear plan de metodología desde routine_plan_id
// =============================================================================
router.post('/bootstrap-plan', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = req.user?.userId || req.user?.id;
    const { routine_plan_id } = req.body;
    
    if (!routine_plan_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'routine_plan_id requerido' });
    }

    const r = await client.query(
      `SELECT id, methodology_type, plan_data, generation_mode 
       FROM app.methodology_plans WHERE id = $1 AND user_id = $2`,
      [routine_plan_id, userId]
    );
    
    if (r.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Routine plan no encontrado' });
    }

    const { methodology_type, plan_data, generation_mode } = r.rows[0];

    const ins = await client.query(
      `INSERT INTO app.methodology_plans (user_id, methodology_type, plan_data, generation_mode, status, created_at)
       VALUES ($1, $2, $3, $4, 'draft', NOW()) RETURNING id`,
      [userId, methodology_type, plan_data, generation_mode || 'automatic']
    );

    const methodologyPlanId = ins.rows[0].id;
    await ensureMethodologySessions(client, userId, methodologyPlanId, plan_data);

    await client.query('COMMIT');
    res.json({ success: true, methodology_plan_id: methodologyPlanId });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error bootstrap plan:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  } finally {
    client.release();
  }
});

// =============================================================================
// GET /active-plan - Obtener plan activo del usuario
// =============================================================================
router.get('/active-plan', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    console.log(`🔍 [/active-plan] Buscando plan activo para user ${userId}`);

    // PRIMERO: Buscar si hay entrenamientos programados en la nueva estructura
    const todayWorkoutQuery = await pool.query(
      `SELECT
        ws.methodology_plan_id,
        ws.week_number,
        ws.session_order,
        ws.session_title,
        ws.day_name,
        ws.scheduled_date,
        ws.exercises,
        ws.status,
        mp.plan_data,
        mp.methodology_type,
        mp.confirmed_at,
        mp.created_at
       FROM app.workout_schedule ws
       JOIN app.methodology_plans mp ON ws.methodology_plan_id = mp.id
       WHERE ws.user_id = $1
         AND ws.scheduled_date = CURRENT_DATE
         AND ws.status = 'scheduled'
         AND mp.status IN ('active', 'confirmed')
         AND mp.cancelled_at IS NULL
       LIMIT 1`,
      [userId]
    );

    if (todayWorkoutQuery.rowCount > 0) {
      console.log(`✅ [/active-plan] Encontrado entrenamiento de hoy en nueva estructura`);
      const todayWorkout = todayWorkoutQuery.rows[0];

      return res.json({
        success: true,
        hasActivePlan: true,
        source: 'workout_schedule',
        methodology_plan_id: todayWorkout.methodology_plan_id,
        planId: todayWorkout.methodology_plan_id,
        routinePlan: todayWorkout.plan_data,
        confirmedAt: todayWorkout.confirmed_at,
        createdAt: todayWorkout.created_at,
        todaySession: {
          week_number: todayWorkout.week_number,
          session_order: todayWorkout.session_order,
          session_title: todayWorkout.session_title,
          day_name: todayWorkout.day_name,
          scheduled_date: todayWorkout.scheduled_date,
          exercises: todayWorkout.exercises,
          status: todayWorkout.status
        }
      });
    }

    // Buscar plan de metodología activo (fallback)
    const activeMethodologyQuery = await pool.query(
      `SELECT id as methodology_plan_id, methodology_type, plan_data,
              confirmed_at, created_at, plan_start_date, 'methodology' as source, status
       FROM app.methodology_plans
       WHERE user_id = $1
         AND status = 'active'
         AND cancelled_at IS NULL
       ORDER BY is_current DESC NULLS LAST, confirmed_at DESC
       LIMIT 1`,
      [userId]
    );

    let activePlan = activeMethodologyQuery.rowCount > 0 ? activeMethodologyQuery.rows[0] : null;

    // Fallback: generar programación on-demand si no hay sesión de hoy
    if (todayWorkoutQuery.rowCount === 0 && activePlan &&
        ['active', 'confirmed'].includes(String(activePlan.status)) && !activePlan.cancelled_at) {
      try {
        console.log('🧩 [/active-plan] Sin todaySession; generando programación on-demand...');
        const client = await pool.connect();
        try {
          const startDate = activePlan.plan_start_date || activePlan.confirmed_at || activePlan.created_at || new Date();
          await ensureWorkoutScheduleV3(client, userId, activePlan.methodology_plan_id, activePlan.plan_data, startDate);
        } finally {
          client.release();
        }

        // Reintentar la consulta de todaySession
        const retryToday = await pool.query(
          `SELECT ws.methodology_plan_id, ws.week_number, ws.session_order, ws.session_title,
                  ws.day_name, ws.scheduled_date, ws.exercises, ws.status,
                  mp.plan_data, mp.methodology_type, mp.confirmed_at, mp.created_at
           FROM app.workout_schedule ws
           JOIN app.methodology_plans mp ON ws.methodology_plan_id = mp.id
           WHERE ws.user_id = $1 AND ws.scheduled_date = CURRENT_DATE AND ws.status = 'scheduled'
             AND mp.status IN ('active', 'confirmed') AND mp.cancelled_at IS NULL
           LIMIT 1`,
          [userId]
        );

        if (retryToday.rowCount > 0) {
          const todayWorkout = retryToday.rows[0];
          return res.json({
            success: true,
            hasActivePlan: true,
            source: 'workout_schedule',
            methodology_plan_id: todayWorkout.methodology_plan_id,
            planId: todayWorkout.methodology_plan_id,
            routinePlan: todayWorkout.plan_data,
            confirmedAt: todayWorkout.confirmed_at,
            createdAt: todayWorkout.created_at,
            todaySession: {
              week_number: todayWorkout.week_number,
              session_order: todayWorkout.session_order,
              session_title: todayWorkout.session_title,
              day_name: todayWorkout.day_name,
              scheduled_date: todayWorkout.scheduled_date,
              exercises: todayWorkout.exercises,
              status: todayWorkout.status
            }
          });
        }
      } catch (e) {
        console.log('⚠️ [/active-plan] Fallback de programación falló:', e.message);
      }
    }

    if (!activePlan) {
      return res.json({ success: true, hasActivePlan: false, message: 'No hay rutina activa' });
    }

    const planData = typeof activePlan.plan_data === 'string'
      ? JSON.parse(activePlan.plan_data)
      : activePlan.plan_data;

    res.json({
      success: true,
      hasActivePlan: true,
      routinePlan: planData,
      planSource: { label: 'IA' },
      planId: activePlan.methodology_plan_id,
      methodology_plan_id: activePlan.methodology_plan_id,
      planType: activePlan.methodology_type,
      confirmedAt: activePlan.confirmed_at,
      createdAt: activePlan.created_at,
      recoverySource: activePlan.source || 'methodology'
    });

  } catch (error) {
    console.error('Error obteniendo rutina activa:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

export default router;

