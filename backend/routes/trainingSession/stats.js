/**
 * Rutas de training-session - dominio: stats (extraidas del monolito).
 */

import express from 'express';
import authenticateToken from '../../middleware/auth.js';
import {
  pool
} from '../../db.js';
import {
  computeWeeklyTargets
} from '../../utils/shared/planHelpers.js';

const router = express.Router();


// ===============================================
// ESTADÍSTICAS Y DATOS HISTÓRICOS
// ===============================================

/**
 * GET /api/training-session/stats/progress-data
 * Obtener datos de progreso histórico para el ProgressTab
 */
router.get('/stats/progress-data', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { methodology_plan_id, home_training_plan_id } = req.query;

    if (!methodology_plan_id && !home_training_plan_id) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere methodology_plan_id o home_training_plan_id'
      });
    }

    if (methodology_plan_id) {
      // Datos de progreso para metodología
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
           COALESCE((
             SELECT SUM(COALESCE(w.warmup_time_seconds, 0))
             FROM app.methodology_exercise_sessions w
             WHERE w.user_id = $1 AND w.methodology_plan_id = $2
               AND w.week_number = mes.week_number
               AND w.session_status = 'completed'
           ), 0) as time_spent_seconds
         FROM app.methodology_exercise_sessions mes
         LEFT JOIN app.methodology_exercise_progress mep ON mep.methodology_session_id = mes.id
         WHERE mes.user_id = $1 AND mes.methodology_plan_id = $2
         GROUP BY mes.week_number
         ORDER BY mes.week_number ASC`,
        [userId, methodology_plan_id]
      );

      // Denominadores por semana: workout_schedule cuando la semana está agendada
      // (semanas parciales cuentan lo real), plan_data para semanas sin agendar.
      // Lógica compartida con /api/routines/progress-data.
      const targets = await computeWeeklyTargets(pool, userId, methodology_plan_id, planData);
      const totalWeeks = targets.totalWeeks;

      const generalStats = generalStatsQuery.rows[0];
      const weeklyProgress = weeklyProgressQuery.rows;

      // Construir progreso por semanas con datos reales. El max con lo realmente
      // iniciado evita mostrar 3/2 si el usuario entrenó más de lo agendado.
      const weeklyProgressData = targets.weeks.map(target => {
        const weekData = weeklyProgress.find(w => w.week_number === target.week);
        return {
          week: target.week,
          sessions: Math.max(target.sessions, weekData?.total_sessions || 0),
          completed: weekData?.sessions_completed || 0,
          exercises: Math.max(target.exercises, weekData?.total_exercises || 0),
          exercisesCompleted: weekData?.exercises_completed || 0,
          seriesCompleted: weekData?.series_completed || 0,
          timeSpentSeconds: weekData?.time_spent_seconds || 0
        };
      });

      const responseData = {
        totalWeeks,
        currentWeek,
        totalSessions: Math.max(targets.totalSessions, parseInt(generalStats.total_sessions_started) || 0),
        completedSessions: parseInt(generalStats.total_sessions_completed) || 0,
        totalExercises: Math.max(targets.totalExercises, parseInt(generalStats.total_exercises_attempted) || 0),
        completedExercises: parseInt(generalStats.total_exercises_completed) || 0,
        totalSeriesCompleted: parseInt(generalStats.total_series_completed) || 0,
        totalTimeSpentSeconds: parseInt(generalStats.total_time_seconds) || 0,
        firstSessionDate: generalStats.first_session_date,
        lastSessionDate: generalStats.last_session_date,
        weeklyProgress: weeklyProgressData
      };

      res.json({ success: true, data: responseData });

    } else {
      // Datos de progreso para entrenamiento en casa
      const statsResult = await pool.query(
        'SELECT * FROM app.user_home_training_stats WHERE user_id = $1',
        [userId]
      );

      let stats = statsResult.rows[0];

      if (!stats) {
        // Crear estadísticas iniciales si no existen
        const createResult = await pool.query(
          `INSERT INTO app.user_home_training_stats (user_id)
           VALUES ($1)
           RETURNING *`,
          [userId]
        );
        stats = createResult.rows[0];
      }

      // Agregar métricas basadas en ejercicios completados
      const exAgg = await pool.query(
        `SELECT COUNT(*)::int AS total_exercises_completed,
                COALESCE(SUM(duration_seconds), 0)::int AS total_exercise_duration_seconds
         FROM app.home_exercise_history
         WHERE user_id = $1`,
        [userId]
      );
      const ex = exAgg.rows[0] || { total_exercises_completed: 0, total_exercise_duration_seconds: 0 };

      res.json({
        success: true,
        data: {
          ...stats,
          total_exercises_completed: ex.total_exercises_completed,
          total_exercise_duration_seconds: ex.total_exercise_duration_seconds,
        }
      });
    }

  } catch (error) {
    console.error('Error obteniendo datos de progreso:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});


/**
 * GET /api/training-session/stats/historical
 * Obtener datos históricos completos del usuario
 */
router.get('/stats/historical', authenticateToken, async (req, res) => {
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
       WHERE mp.user_id = $1 AND mp.status = 'active'`,
      [userId]
    );

    // Agregar estadísticas de entrenamiento en casa
    const homeStatsQuery = await pool.query(
      `SELECT
         COUNT(DISTINCT hts.id) as home_sessions,
         COUNT(DISTINCT hep.id) as home_exercises,
         SUM(CASE WHEN hep.status = 'completed' THEN hep.series_completed ELSE 0 END) as home_series,
         SUM(CASE WHEN hep.status = 'completed' THEN COALESCE(hep.duration_seconds, 0) ELSE 0 END) as home_time
       FROM app.home_training_sessions hts
       LEFT JOIN app.home_exercise_progress hep ON hep.home_training_session_id = hts.id
       WHERE hts.user_id = $1 AND hts.status = 'completed'`,
      [userId]
    );

    const methodologyStats = totalStatsQuery.rows[0] || {};
    const homeStats = homeStatsQuery.rows[0] || {};

    // Combinar estadísticas
    const responseData = {
      totalRoutinesCompleted: parseInt(methodologyStats.total_routines_completed) || 0,
      totalSessionsEver: (parseInt(methodologyStats.total_sessions_ever) || 0) + (parseInt(homeStats.home_sessions) || 0),
      totalExercisesEver: (parseInt(methodologyStats.total_exercises_ever) || 0) + (parseInt(homeStats.home_exercises) || 0),
      totalSeriesEver: (parseInt(methodologyStats.total_series_ever) || 0) + (parseInt(homeStats.home_series) || 0),
      totalTimeSpentEver: (parseInt(methodologyStats.total_time_spent_ever) || 0) + (parseInt(homeStats.home_time) || 0),
      firstWorkoutDate: methodologyStats.first_workout_date,
      lastWorkoutDate: methodologyStats.last_workout_date,
      breakdown: {
        methodology: {
          sessions: parseInt(methodologyStats.total_sessions_ever) || 0,
          exercises: parseInt(methodologyStats.total_exercises_ever) || 0,
          series: parseInt(methodologyStats.total_series_ever) || 0,
          time: parseInt(methodologyStats.total_time_spent_ever) || 0
        },
        home: {
          sessions: parseInt(homeStats.home_sessions) || 0,
          exercises: parseInt(homeStats.home_exercises) || 0,
          series: parseInt(homeStats.home_series) || 0,
          time: parseInt(homeStats.home_time) || 0
        }
      }
    };

    console.log('✅ Datos históricos obtenidos:', {
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
