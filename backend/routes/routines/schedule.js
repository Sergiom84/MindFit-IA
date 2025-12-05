/**
 * @fileoverview Endpoints de calendario y programación de entrenamientos
 * 
 * Endpoints:
 * - GET /plan-config/:planId - Configuración de redistribución del plan
 * - GET /calendar-schedule/:planId - Calendario real con días redistribuidos
 * - POST /generate-schedule - Generar programación de entrenamientos
 * - GET /schedule/:methodology_plan_id - Programación completa del plan
 * - POST /cancel-routine - Cancelar rutina activa
 * 
 * @module routes/routines/schedule
 */

import express from 'express';
import authenticateToken from '../../middleware/auth.js';
import { pool } from '../../db.js';
import { ensureWorkoutScheduleV3 } from '../../utils/ensureScheduleV3.js';

const router = express.Router();

// =============================================================================
// GET /plan-config/:planId - Configuración de redistribución del plan
// =============================================================================
router.get('/plan-config/:planId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const planId = req.params.planId;

    // Verificar que el plan pertenece al usuario
    const planCheck = await pool.query(
      `SELECT id FROM app.methodology_plans WHERE id = $1 AND user_id = $2`,
      [planId, userId]
    );

    if (planCheck.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Plan no encontrado' });
    }

    // Obtener configuración de inicio
    const configQuery = await pool.query(
      `SELECT * FROM app.plan_start_config WHERE methodology_plan_id = $1`,
      [planId]
    );

    if (configQuery.rowCount === 0) {
      return res.json({ success: true, config: null, message: 'Sin configuración de redistribución' });
    }

    res.json({ success: true, config: configQuery.rows[0] });
  } catch (error) {
    console.error('Error obteniendo configuración del plan:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// =============================================================================
// GET /calendar-schedule/:planId - Calendario real con días redistribuidos
// =============================================================================
router.get('/calendar-schedule/:planId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const planId = req.params.planId;

    // Verificar plan y obtener datos
    const planCheck = await pool.query(
      `SELECT id, plan_data, plan_start_date, confirmed_at, created_at
       FROM app.methodology_plans WHERE id = $1 AND user_id = $2`,
      [planId, userId]
    );

    if (planCheck.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Plan no encontrado' });
    }

    const plan = planCheck.rows[0];
    const planData = typeof plan.plan_data === 'string' ? JSON.parse(plan.plan_data) : plan.plan_data;
    const startDateFromPlan = plan.plan_start_date || plan.confirmed_at || plan.created_at || new Date();

    // Obtener calendario desde workout_schedule
    let scheduleQuery = await pool.query(
      `SELECT week_number, day_abbrev as dia, scheduled_date, session_title as titulo, exercises as ejercicios, status
       FROM app.workout_schedule WHERE methodology_plan_id = $1 AND user_id = $2
       ORDER BY week_number, session_order`,
      [planId, userId]
    );

    // Si no hay programación, regenerar on-demand
    if (scheduleQuery.rows.length === 0) {
      console.log(`[calendar-schedule] Sin programación; regenerando con ensureWorkoutScheduleV3...`);
      const client = await pool.connect();
      try {
        const startConfigQuery = await pool.query(
          `SELECT * FROM app.plan_start_config WHERE methodology_plan_id = $1`, [planId]
        );
        const startConfig = startConfigQuery.rowCount > 0 ? startConfigQuery.rows[0] : null;
        await ensureWorkoutScheduleV3(client, userId, planId, plan.plan_data, startDateFromPlan, startConfig);
      } finally {
        client.release();
      }

      // Reintentar consulta
      scheduleQuery = await pool.query(
        `SELECT week_number, day_abbrev as dia, scheduled_date, session_title as titulo, exercises as ejercicios, status
         FROM app.workout_schedule WHERE methodology_plan_id = $1 AND user_id = $2
         ORDER BY week_number, session_order`,
        [planId, userId]
      );
    }

    // Reorganizar por semanas
    const semanasMap = new Map();
    for (const row of scheduleQuery.rows) {
      const weekNum = row.week_number;
      if (!semanasMap.has(weekNum)) {
        const originalWeek = planData.semanas?.[weekNum - 1] || {};
        semanasMap.set(weekNum, {
          semana: weekNum,
          nombre: originalWeek.nombre || `Semana ${weekNum}`,
          sesiones: []
        });
      }
      semanasMap.get(weekNum).sesiones.push({
        dia: row.dia,
        fecha: row.scheduled_date,
        titulo: row.titulo || `Sesión del ${row.dia}`,
        ejercicios: row.ejercicios || []
      });
    }

    const updatedPlan = { ...planData, semanas: Array.from(semanasMap.values()) };

    res.json({
      success: true,
      plan: updatedPlan,
      planStartDate: plan.plan_start_date || startDateFromPlan
    });

  } catch (error) {
    console.error('Error obteniendo calendario:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// =============================================================================
// GET /schedule/:methodology_plan_id - Programación completa del plan
// =============================================================================
router.get('/schedule/:methodology_plan_id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { methodology_plan_id } = req.params;

    const schedule = await pool.query(`
      SELECT id, week_number, session_order, week_session_order, scheduled_date,
             day_name, day_abbrev, session_title, exercises, status, completed_at
      FROM app.workout_schedule
      WHERE methodology_plan_id = $1 AND user_id = $2
      ORDER BY session_order
    `, [methodology_plan_id, userId]);

    res.json({ success: true, schedule: schedule.rows });
  } catch (error) {
    console.error('❌ [/schedule] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

