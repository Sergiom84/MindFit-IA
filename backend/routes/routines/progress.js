/**
 * Rutas de rutinas - dominio: progress (extraidas de routes/routines.js).
 */

import express from 'express';
import process from 'node:process';
import authenticateToken from '../../middleware/auth.js';
import {
  pool
} from '../../db.js';
import {
  findWeekInPlan
} from '../../utils/shared/planHelpers.js';

const router = express.Router();


// GET /api/routines/progress-data
// Obtiene datos de progreso histórico para el ProgressTab
router.get('/progress-data', authenticateToken, async (req, res) => {
  try {
    const userIdRaw = req.user?.userId || req.user?.id;
    const userId = parseInt(userIdRaw, 10);
    const { methodology_plan_id: planIdParam } = req.query;

    if (!planIdParam) {
      return res.status(400).json({
        success: false,
        error: 'methodology_plan_id es requerido'
      });
    }

    // Convertir methodology_plan_id a integer
    const methodology_plan_id = parseInt(planIdParam, 10);
    if (isNaN(methodology_plan_id)) {
      return res.status(400).json({
        success: false,
        error: 'methodology_plan_id debe ser un número válido'
      });
    }

    // Obtener información del plan
    const planQuery = await pool.query(
      'SELECT methodology_type, plan_data FROM app.methodology_plans WHERE id = $1 AND user_id = $2',
      [methodology_plan_id, userId]
    );

    if (planQuery.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Plan de metodología no encontrado'
      });
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

    // Calcular semana actual basada en fecha de inicio del plan
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

    // Sesiones REALMENTE agendadas por semana (workout_schedule = lo que el usuario
    // ve en el calendario). Cuando el plan arranca a mitad de semana, la 1ª semana es
    // PARCIAL (p.ej. 2 sesiones en vez de 4); plan_data describe semanas ideales
    // completas, así que usarlo como denominador dejaba esa semana en 2/4 para siempre
    // (nunca al 100%). workout_schedule es la fuente de verdad del calendario real.
    const scheduleQuery = await pool.query(
      `SELECT week_number, COUNT(*) as scheduled_sessions
         FROM app.workout_schedule
        WHERE user_id = $1 AND methodology_plan_id = $2
        GROUP BY week_number`,
      [userId, methodology_plan_id]
    );
    const scheduledByWeek = new Map(
      scheduleQuery.rows.map(r => [Number(r.week_number), Number(r.scheduled_sessions)])
    );
    const hasSchedule = scheduledByWeek.size > 0;
    const totalScheduled = hasSchedule
      ? [...scheduledByWeek.values()].reduce((a, b) => a + b, 0)
      : null;

    // Obtener actividad reciente (solo sesiones completadas)
    const recentActivityQuery = await pool.query(
      `SELECT
         mes.id as methodology_session_id,
         COALESCE(mes.session_date, mes.completed_at::date) as session_date,
         mes.week_number,
         mes.day_name,
         mes.total_duration_seconds as session_duration_seconds,
         COUNT(mep.id) as exercises_count,
         SUM(CASE WHEN mep.status = 'completed' THEN mep.series_completed ELSE 0 END) as total_series
       FROM app.methodology_exercise_sessions mes
       LEFT JOIN app.methodology_exercise_progress mep ON mep.methodology_session_id = mes.id
       WHERE mes.user_id = $1 AND mes.methodology_plan_id = $2 AND mes.session_status = 'completed'
       GROUP BY mes.id, mes.session_date, mes.completed_at, mes.week_number, mes.day_name, mes.total_duration_seconds
       ORDER BY COALESCE(mes.session_date, mes.completed_at::date) DESC, mes.id DESC
       LIMIT 10`,
      [userId, methodology_plan_id]
    );

    // Calcular totales del plan (desde el JSON)
    const totalWeeks = planData?.semanas?.length || 0;
    const totalSessionsInPlan = planData?.semanas?.reduce((acc, semana) =>
      acc + (semana.sesiones?.length || 0), 0) || 0;
    const totalExercisesInPlan = planData?.semanas?.reduce((acc, semana) =>
      acc + semana.sesiones?.reduce((sessAcc, sesion) =>
        sessAcc + (sesion.ejercicios?.length || 0), 0) || 0, 0) || 0;

    // Construir respuesta
    const generalStats = generalStatsQuery.rows[0];
    const weeklyProgress = weeklyProgressQuery.rows;
    const recentActivity = recentActivityQuery.rows;

    // La semana actual ya fue calculada arriba basada en la fecha de inicio

    // Construir progreso por semanas con datos reales
    const weeklyProgressData = [];
    for (let week = 1; week <= totalWeeks; week++) {
      const weekData = weeklyProgress.find(w => w.week_number === week);
      const weekInPlan = findWeekInPlan(planData?.semanas, week);
      const weekSessions = weekInPlan?.sesiones?.length || 0;
      const weekExercises = weekInPlan?.sesiones?.reduce(
        (acc, ses) => acc + (ses.ejercicios?.length || 0), 0) || 0;

      weeklyProgressData.push({
        week,
        // Denominador = sesiones agendadas reales (workout_schedule) si existen;
        // si no (planes antiguos sin schedule), se cae al ideal de plan_data.
        sessions: hasSchedule
          ? (scheduledByWeek.get(week) ?? weekData?.total_sessions ?? 0)
          : Math.max(weekSessions, weekData?.total_sessions || 0),
        completed: weekData?.sessions_completed || 0,
        exercises: Math.max(weekExercises, weekData?.total_exercises || 0),
        exercisesCompleted: weekData?.exercises_completed || 0,
        seriesCompleted: weekData?.series_completed || 0,
        timeSpentSeconds: weekData?.time_spent_seconds || 0
      });
    }

    const responseData = {
      totalWeeks,
      currentWeek,
      totalSessions: hasSchedule
        ? Math.max(totalScheduled, parseInt(generalStats.total_sessions_started) || 0)
        : Math.max(totalSessionsInPlan, parseInt(generalStats.total_sessions_started) || 0),
      completedSessions: parseInt(generalStats.total_sessions_completed) || 0,
      totalExercises: Math.max(totalExercisesInPlan, parseInt(generalStats.total_exercises_attempted) || 0),
      completedExercises: parseInt(generalStats.total_exercises_completed) || 0,
      totalSeriesCompleted: parseInt(generalStats.total_series_completed) || 0,
      totalTimeSpentSeconds: parseInt(generalStats.total_time_seconds) || 0,
      firstSessionDate: generalStats.first_session_date,
      lastSessionDate: generalStats.last_session_date,
      weeklyProgress: weeklyProgressData,
      recentActivity: recentActivity.map(activity => ({
        sessionId: activity.methodology_session_id,
        date: activity.session_date,
        weekNumber: activity.week_number,
        dayName: activity.day_name,
        exercisesCount: parseInt(activity.exercises_count) || 0,
        totalSeries: parseInt(activity.total_series) || 0,
        durationSeconds: parseInt(activity.session_duration_seconds) || 0,
        formattedDate: activity.session_date ? new Date(activity.session_date).toLocaleDateString('es-ES', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }) : 'Fecha no disponible'
      }))
    };

    res.json({ success: true, data: responseData });
  } catch (error) {
    console.error('Error obteniendo datos de progreso:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});


// POST /api/routines/process-feedback
// Procesa el feedback de ejercicios rechazados antes de cancelar una rutina
router.post('/process-feedback', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rejections } = req.body || {};
    const userId = req.user?.userId || req.user?.id;

    if (!Array.isArray(rejections) || rejections.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un array de ejercicios rechazados'
      });
    }

    console.log('🔄 USANDO SISTEMA UNIFICADO DE FEEDBACK');
    console.log(`📊 Procesando ${rejections.length} rechazo(s) de ejercicios`);

    await client.query('BEGIN');

    // Mapeo de categorías del modal a feedback_type
    const REJECTION_CATEGORY_MAPPING = {
      'too_hard': 'too_difficult',
      'dont_like': 'dont_like',
      'injury': 'physical_limitation',
      'equipment': 'no_equipment',
      'other': 'change_focus'
    };

    const insertedFeedback = [];

    for (const raw of rejections) {
      // Normalizar datos del modal
      const exercise_name = String(raw?.exercise_name || '').trim().slice(0, 255) || 'Ejercicio';
      const rejection_category = raw?.rejection_category || 'other';
      const rejection_reason = raw?.rejection_reason ? String(raw.rejection_reason).slice(0, 1000) : null;
      const expires_in_days = Number(raw?.expires_in_days) || null;

      // Mapear categoría del modal a feedback_type del sistema unificado
      const feedback_type = REJECTION_CATEGORY_MAPPING[rejection_category] || 'dont_like';

      // Calcular fecha de expiración
      let expires_at = null;
      if (expires_in_days && expires_in_days > 0) {
        expires_at = new Date();
        expires_at.setDate(expires_at.getDate() + expires_in_days);
      }

      console.log(`📝 Guardando feedback: ${exercise_name} - ${feedback_type} (rutina)`);

      // Verificar si ya existe feedback para este ejercicio
      const existingResult = await client.query(
        `SELECT id FROM app.user_exercise_feedback
         WHERE user_id = $1 AND exercise_name = $2 AND methodology_type = 'routine'
         LIMIT 1`,
        [userId, exercise_name]
      );

      if (existingResult.rowCount > 0) {
        // Actualizar feedback existente
        await client.query(
          `UPDATE app.user_exercise_feedback
           SET feedback_type = $3,
               comment = COALESCE($4, comment),
               expires_at = $5,
               updated_at = NOW()
           WHERE id = $1`,
          [existingResult.rows[0].id, userId, feedback_type, rejection_reason, expires_at]
        );
        console.log(`✏️  Feedback actualizado para: ${exercise_name}`);
      } else {
        // Insertar nuevo feedback
        await client.query(
          `INSERT INTO app.user_exercise_feedback
           (user_id, exercise_name, methodology_type, feedback_type, comment, expires_at)
           VALUES ($1, $2, 'routine', $3, $4, $5)`,
          [userId, exercise_name, feedback_type, rejection_reason, expires_at]
        );
        console.log(`✅ Nuevo feedback guardado para: ${exercise_name}`);
      }

      insertedFeedback.push({
        exercise_name,
        feedback_type,
        expires_at
      });
    }

    await client.query('COMMIT');

    console.log(`🎉 Procesamiento completo: ${insertedFeedback.length} registros`);

    res.json({
      success: true,
      message: 'Feedback procesado correctamente',
      processed: insertedFeedback.length
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error procesando feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Error procesando feedback de ejercicios',
      details: error.message
    });
  } finally {
    client.release();
  }
});


// GET /api/routines/historical-data
// Obtiene datos históricos completos del usuario (todas las rutinas completadas)
router.get('/historical-data', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    // Obtener estadísticas generales históricas (todas las rutinas del usuario)
    const totalStatsQuery = await pool.query(
      `SELECT
         COUNT(DISTINCT mp.id) as total_routines_completed,
         COUNT(DISTINCT mes.id) as total_sessions_ever,
         COUNT(DISTINCT mep.id) as total_exercises_ever,
         SUM(CASE WHEN mep.status = 'completed' THEN mep.series_completed ELSE 0 END) as total_series_ever,
         SUM(CASE WHEN mep.status = 'completed' THEN COALESCE(mep.time_spent_seconds, 0) ELSE 0 END) +
         SUM(CASE WHEN mes.session_status = 'completed' THEN COALESCE(mes.warmup_time_seconds, 0) ELSE 0 END) as total_time_spent_ever,
         MIN(mes.started_at) as first_workout_date,
         MAX(mes.completed_at) as last_workout_date
       FROM app.methodology_plans mp
       LEFT JOIN app.methodology_exercise_sessions mes ON mes.methodology_plan_id = mp.id
       LEFT JOIN app.methodology_exercise_progress mep ON mep.methodology_session_id = mes.id
       WHERE mp.user_id = $1 AND mp.confirmed_at IS NOT NULL`,
      [userId]
    );

    // Obtener historial de rutinas completadas
    const routineHistoryQuery = await pool.query(
      `SELECT
         mp.id as routine_id,
         mp.methodology_type,
         mp.status as routine_status,
         mp.confirmed_at as completed_at,
         COUNT(DISTINCT mes.id) as sessions,
         COUNT(DISTINCT mep.id) as exercises,
         SUM(CASE WHEN mep.status = 'completed' THEN mep.series_completed ELSE 0 END) as series,
         SUM(CASE WHEN mep.status = 'completed' THEN COALESCE(mep.time_spent_seconds, 0) ELSE 0 END) +
         SUM(CASE WHEN mes.session_status = 'completed' THEN COALESCE(mes.warmup_time_seconds, 0) ELSE 0 END) as time_spent
       FROM app.methodology_plans mp
       LEFT JOIN app.methodology_exercise_sessions mes ON mes.methodology_plan_id = mp.id
       LEFT JOIN app.methodology_exercise_progress mep ON mep.methodology_session_id = mes.id
       WHERE mp.user_id = $1 AND (mp.confirmed_at IS NOT NULL OR mp.status = 'cancelled')
       GROUP BY mp.id, mp.methodology_type, mp.confirmed_at, mp.status
       ORDER BY COALESCE(mp.confirmed_at, mp.updated_at) DESC`,
      [userId]
    );

    // Obtener estadísticas mensuales
    const monthlyStatsQuery = await pool.query(
      `SELECT
         TO_CHAR(mes.started_at, 'YYYY-MM') as month_key,
         TO_CHAR(mes.started_at, 'Month YYYY') as month_label,
         COUNT(DISTINCT mes.id) as sessions,
         COUNT(DISTINCT mep.id) as exercises,
         SUM(CASE WHEN mep.status = 'completed' THEN mep.series_completed ELSE 0 END) as series
       FROM app.methodology_exercise_sessions mes
       LEFT JOIN app.methodology_exercise_progress mep ON mep.methodology_session_id = mes.id
       JOIN app.methodology_plans mp ON mp.id = mes.methodology_plan_id
       WHERE mp.user_id = $1 AND mes.started_at IS NOT NULL
       GROUP BY TO_CHAR(mes.started_at, 'YYYY-MM'), TO_CHAR(mes.started_at, 'Month YYYY')
       ORDER BY TO_CHAR(mes.started_at, 'YYYY-MM') DESC
       LIMIT 12`,
      [userId]
    );

    const totalStats = totalStatsQuery.rows[0] || {};
    const routineHistory = routineHistoryQuery.rows || [];
    const monthlyStats = monthlyStatsQuery.rows || [];

    // Formatear respuesta
    const responseData = {
      totalRoutinesCompleted: parseInt(totalStats.total_routines_completed) || 0,
      totalSessionsEver: parseInt(totalStats.total_sessions_ever) || 0,
      totalExercisesEver: parseInt(totalStats.total_exercises_ever) || 0,
      totalSeriesEver: parseInt(totalStats.total_series_ever) || 0,
      totalTimeSpentEver: parseInt(totalStats.total_time_spent_ever) || 0,
      firstWorkoutDate: totalStats.first_workout_date,
      lastWorkoutDate: totalStats.last_workout_date,
      routineHistory: routineHistory.map(routine => ({
        id: routine.routine_id,
        methodologyType: routine.methodology_type,
        status: routine.routine_status || 'completed',
        completedAt: routine.completed_at,
        sessions: parseInt(routine.sessions) || 0,
        exercises: parseInt(routine.exercises) || 0,
        series: parseInt(routine.series) || 0,
        timeSpent: parseInt(routine.time_spent) || 0
      })),
      monthlyStats: monthlyStats.map(month => ({
        month: month.month_label?.trim(),
        sessions: parseInt(month.sessions) || 0,
        exercises: parseInt(month.exercises) || 0,
        series: parseInt(month.series) || 0
      }))
    };

    console.log('✅ Datos históricos obtenidos:', {
      totalRoutines: responseData.totalRoutinesCompleted,
      totalSessions: responseData.totalSessionsEver,
      totalExercises: responseData.totalExercisesEver
    });

    res.json({ success: true, data: responseData });

  } catch (error) {
    console.error('❌ Error obteniendo datos históricos:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

export default router;
