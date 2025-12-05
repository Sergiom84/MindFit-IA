/**
 * @fileoverview Endpoints de tracking de progreso y feedback
 * 
 * Endpoints:
 * - GET /progress-data - Datos de progreso histórico
 * - POST /sessions/:sessionId/exercise/:exerciseOrder/feedback - Guardar feedback de ejercicio
 * - GET /sessions/:sessionId/feedback - Obtener feedback de sesión
 * - GET /plan-status/:methodologyPlanId - Estado del plan
 * - GET /historical-data - Datos históricos completos
 * - POST /process-feedback - Procesar feedback de ejercicios rechazados
 * 
 * @module routes/routines/progress
 */

import express from 'express';
import authenticateToken from '../../middleware/auth.js';
import { pool } from '../../db.js';
import { findWeekInPlan } from '../../utils/shared/planHelpers.js';

const router = express.Router();

// =============================================================================
// GET /progress-data - Datos de progreso histórico para el ProgressTab
// =============================================================================
router.get('/progress-data', authenticateToken, async (req, res) => {
  try {
    const userIdRaw = req.user?.userId || req.user?.id;
    const userId = parseInt(userIdRaw, 10);
    const { methodology_plan_id: planIdParam } = req.query;

    if (!planIdParam) {
      return res.status(400).json({ success: false, error: 'methodology_plan_id es requerido' });
    }

    const methodology_plan_id = parseInt(planIdParam, 10);
    if (isNaN(methodology_plan_id)) {
      return res.status(400).json({ success: false, error: 'methodology_plan_id debe ser un número válido' });
    }

    // Obtener información del plan
    const planQuery = await pool.query(
      'SELECT methodology_type, plan_data FROM app.methodology_plans WHERE id = $1 AND user_id = $2',
      [methodology_plan_id, userId]
    );

    if (planQuery.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Plan de metodología no encontrado' });
    }

    const plan = planQuery.rows[0];
    const planData = typeof plan.plan_data === 'string' ? JSON.parse(plan.plan_data) : plan.plan_data;

    // Obtener información del plan para calcular semana actual
    const planInfoQuery = await pool.query(
      'SELECT created_at, confirmed_at FROM app.methodology_plans WHERE id = $1 AND user_id = $2',
      [methodology_plan_id, userId]
    );
    const planInfo = planInfoQuery.rows[0];
    const planStartDate = planInfo?.confirmed_at || planInfo?.created_at;

    let currentWeek = 1;
    if (planStartDate) {
      const daysSinceStart = Math.floor((new Date() - new Date(planStartDate)) / (1000 * 60 * 60 * 24));
      currentWeek = Math.max(1, Math.floor(daysSinceStart / 7) + 1);
    }

    // Obtener resumen general de progreso
    const generalStatsQuery = await pool.query(
      `SELECT
         COUNT(DISTINCT mes.id) FILTER (WHERE mes.session_status = 'completed') as total_sessions_completed,
         COUNT(DISTINCT mes.id) as total_sessions_started,
         COUNT(DISTINCT mep.id) FILTER (WHERE mep.status = 'completed') as total_exercises_completed,
         COUNT(DISTINCT mep.id) as total_exercises_attempted,
         SUM(CASE WHEN mep.status = 'completed' THEN mep.series_completed ELSE 0 END) as total_series_completed,
         SUM(CASE WHEN mep.status = 'completed' THEN COALESCE(mep.time_spent_seconds, 0) ELSE 0 END) +
         SUM(CASE WHEN mes.session_status = 'completed' THEN COALESCE(mes.warmup_time_seconds, 0) ELSE 0 END) as total_time_seconds,
         MIN(mes.started_at) as first_session_date,
         MAX(mes.completed_at) as last_session_date
       FROM app.methodology_exercise_sessions mes
       LEFT JOIN app.methodology_exercise_progress mep ON mep.methodology_session_id = mes.id
       WHERE mes.user_id = $1 AND mes.methodology_plan_id = $2`,
      [userId, methodology_plan_id]
    );

    // Obtener progreso por semanas
    const weeklyProgressQuery = await pool.query(
      `SELECT
         mes.week_number,
         COUNT(DISTINCT mes.id) FILTER (WHERE mes.session_status = 'completed') as sessions_completed,
         COUNT(DISTINCT mes.id) as total_sessions,
         COUNT(DISTINCT mep.id) FILTER (WHERE mep.status = 'completed') as exercises_completed,
         COUNT(DISTINCT mep.id) as total_exercises,
         SUM(CASE WHEN mep.status = 'completed' THEN mep.series_completed ELSE 0 END) as series_completed,
         SUM(CASE WHEN mep.status = 'completed' THEN COALESCE(mep.time_spent_seconds, 0) ELSE 0 END) +
         SUM(DISTINCT COALESCE(mes.warmup_time_seconds, 0)) as time_spent_seconds
       FROM app.methodology_exercise_sessions mes
       LEFT JOIN app.methodology_exercise_progress mep ON mep.methodology_session_id = mes.id
       WHERE mes.user_id = $1 AND mes.methodology_plan_id = $2
       GROUP BY mes.week_number
       ORDER BY mes.week_number ASC`,
      [userId, methodology_plan_id]
    );

    // Calcular totales del plan
    const totalWeeks = planData?.semanas?.length || 0;
    const totalSessionsInPlan = planData?.semanas?.reduce((acc, semana) =>
      acc + (semana.sesiones?.length || 0), 0) || 0;
    const totalExercisesInPlan = planData?.semanas?.reduce((acc, semana) =>
      acc + semana.sesiones?.reduce((sessAcc, sesion) =>
        sessAcc + (sesion.ejercicios?.length || 0), 0) || 0, 0) || 0;

    const generalStats = generalStatsQuery.rows[0];
    const weeklyProgress = weeklyProgressQuery.rows;

    // Construir progreso por semanas
    const weeklyProgressData = [];
    for (let week = 1; week <= totalWeeks; week++) {
      const weekData = weeklyProgress.find(w => w.week_number === week);
      const weekInPlan = findWeekInPlan(planData?.semanas, week);
      const weekSessions = weekInPlan?.sesiones?.length || 0;
      const weekExercises = weekInPlan?.sesiones?.reduce(
        (acc, ses) => acc + (ses.ejercicios?.length || 0), 0) || 0;

      weeklyProgressData.push({
        week,
        sessions: Math.max(weekSessions, weekData?.total_sessions || 0),
        completed: weekData?.sessions_completed || 0,
        exercises: Math.max(weekExercises, weekData?.total_exercises || 0),
        exercisesCompleted: weekData?.exercises_completed || 0,
        seriesCompleted: weekData?.series_completed || 0,
        timeSpentSeconds: weekData?.time_spent_seconds || 0
      });
    }

    res.json({
      success: true,
      data: {
        totalWeeks,
        currentWeek,
        totalSessions: Math.max(totalSessionsInPlan, parseInt(generalStats.total_sessions_started) || 0),
        completedSessions: parseInt(generalStats.total_sessions_completed) || 0,
        totalExercises: Math.max(totalExercisesInPlan, parseInt(generalStats.total_exercises_attempted) || 0),
        completedExercises: parseInt(generalStats.total_exercises_completed) || 0,
        totalSeriesCompleted: parseInt(generalStats.total_series_completed) || 0,
        totalTimeSpentSeconds: parseInt(generalStats.total_time_seconds) || 0,
        firstSessionDate: generalStats.first_session_date,
        lastSessionDate: generalStats.last_session_date,
        weeklyProgress: weeklyProgressData
      }
    });
  } catch (error) {
    console.error('Error obteniendo datos de progreso:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

export default router;

