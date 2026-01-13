/**
 * @fileoverview Endpoints de estado y estadísticas de sesiones
 * 
 * Endpoints:
 * - GET /today-status - Estado de sesión del día actual
 * - GET /weekend-status - Estado de sesión de fin de semana
 * - GET /stats/progress-data - Datos de progreso agregados
 * - GET /stats/historical - Estadísticas históricas
 * 
 * @module routes/trainingSession/stats
 */

import express from 'express';
import authenticateToken from '../../middleware/auth.js';
import { pool } from '../../db.js';
import { normalizeDayAbbrev, isWeekend as checkIsWeekend } from '../../utils/shared/dayNormalizer.js';

const router = express.Router();

// =============================================================================
// GET /today-status - Estado de sesión del día actual
// =============================================================================
router.get('/today-status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { methodology_plan_id, week_number, day_name, session_date } = req.query;

    if (methodology_plan_id) {
      if (!week_number || !day_name) {
        return res.status(400).json({
          success: false,
          error: 'Parámetros requeridos para metodología: week_number, day_name'
        });
      }

      const normalizedDay = normalizeDayAbbrev(day_name);
      let sessionQuery;

      if (session_date) {
        sessionQuery = await pool.query(
          `SELECT * FROM app.methodology_exercise_sessions
           WHERE user_id = $1 AND methodology_plan_id = $2 AND session_date::date = $3::date
           ORDER BY created_at DESC LIMIT 1`,
          [userId, methodology_plan_id, session_date]
        );
      } else {
        sessionQuery = await pool.query(
          `SELECT * FROM app.methodology_exercise_sessions
           WHERE user_id = $1 AND methodology_plan_id = $2 AND week_number = $3 AND day_name = $4
           ORDER BY created_at DESC LIMIT 1`,
          [userId, methodology_plan_id, week_number, normalizedDay]
        );
      }

      if (sessionQuery.rowCount === 0) {
        // 🎯 FIX: Si no hay sesión iniciada, verificar si hay un día programado en workout_schedule
        // Normalizar el día para buscar en workout_schedule (usa nombres completos: "Lunes", "Martes", etc.)
        const dayFullNameMap = {
          'Lun': 'Lunes', 'Mar': 'Martes', 'Mie': 'Miercoles', 'Miércoles': 'Miercoles',
          'Jue': 'Jueves', 'Vie': 'Viernes', 'Sab': 'Sabado', 'Sábado': 'Sabado', 'Dom': 'Domingo'
        };
        const dayFullName = dayFullNameMap[normalizedDay] || normalizedDay;
        
        const scheduleQuery = await pool.query(
          `SELECT id, exercises, scheduled_date, day_name
           FROM app.workout_schedule 
           WHERE methodology_plan_id = $1 AND week_number = $2 
             AND (day_name = $3 OR day_name = $4)
           LIMIT 1`,
          [methodology_plan_id, week_number, normalizedDay, dayFullName]
        );
        
        if (scheduleQuery.rowCount === 0) {
          // No hay día programado - es un día de descanso
          return res.status(200).json({ 
            success: true, 
            session_type: 'methodology',
            session: null,
            exercises: [],
            isRestDay: true,
            message: 'Día de descanso - no hay entrenamiento programado para este día'
          });
        }
        
        // Hay un día programado pero la sesión aún no se ha iniciado
        const scheduleData = scheduleQuery.rows[0];
        const scheduledExercises = scheduleData.exercises || [];
        
        // Formatear ejercicios para el frontend
        const formattedExercises = scheduledExercises.map((ex, idx) => ({
          exercise_order: idx + 1,
          exercise_name: ex.nombre || ex.name || `Ejercicio ${idx + 1}`,
          series_total: ex.series || 3,
          series_completed: 0,
          repeticiones: ex.repeticiones || ex.reps || '8-12',
          descanso_seg: ex.descanso_seg || ex.descanso || 90,
          intensidad: ex.intensidad || null,
          tempo: ex.tempo || null,
          status: 'pending',
          notas: ex.notas || ''
        }));
        
        return res.status(200).json({
          success: true,
          session_type: 'methodology',
          session: null, // No hay sesión iniciada aún
          sessionNotStarted: true,
          scheduledDate: scheduleData.scheduled_date,
          exercises: formattedExercises,
          summary: {
            total: formattedExercises.length,
            completed: 0,
            skipped: 0,
            cancelled: 0,
            pending: formattedExercises.length,
            isComplete: false,
            canRetry: false
          },
          message: 'Sesión programada pero no iniciada. Pulsa "Comenzar Entrenamiento" para empezar.'
        });
      }

      const session = sessionQuery.rows[0];

      const exercisesQuery = await pool.query(
        `SELECT p.exercise_order, p.exercise_name, p.series_total, p.series_completed,
                p.repeticiones, p.descanso_seg, p.intensidad, p.tempo, p.status,
                p.time_spent_seconds, p.notas, p.exercise_id, f.sentiment, f.comment
         FROM app.methodology_exercise_progress p
         LEFT JOIN app.methodology_exercise_feedback f
           ON p.methodology_session_id = f.methodology_session_id AND p.exercise_order = f.exercise_order
         WHERE p.methodology_session_id = $1 ORDER BY p.exercise_order ASC`,
        [session.id]
      );

      const setLogsQuery = await pool.query(
        `SELECT exercise_id, exercise_name, set_number, weight_used, reps_completed,
                rir_reported, estimated_1rm, rpe_calculated, volume_load, is_effective
         FROM app.hypertrophy_set_logs WHERE session_id = $1
         ORDER BY exercise_id, set_number ASC`,
        [session.id]
      );

      const setLogsByExercise = {};
      setLogsQuery.rows.forEach(set => {
        if (!setLogsByExercise[set.exercise_id]) setLogsByExercise[set.exercise_id] = [];
        setLogsByExercise[set.exercise_id].push(set);
      });

      const exercisesWithSets = exercisesQuery.rows.map(ex => ({
        ...ex,
        sets: setLogsByExercise[ex.exercise_id] || []
      }));

      const totalExercises = exercisesQuery.rowCount;
      const completedExercises = exercisesQuery.rows.filter(ex => ex.status === 'completed').length;
      const skippedExercises = exercisesQuery.rows.filter(ex => ex.status === 'skipped').length;
      const cancelledExercises = exercisesQuery.rows.filter(ex => ex.status === 'cancelled').length;

      const hasRealProgress = exercisesQuery.rows.some(ex => ex.status !== 'pending');
      let canResume = session.session_status !== 'completed' && hasRealProgress;

      res.json({
        success: true,
        session_type: 'methodology',
        session: { ...session, canResume },
        exercises: exercisesWithSets,
        summary: {
          total: totalExercises,
          completed: completedExercises,
          skipped: skippedExercises,
          cancelled: cancelledExercises,
          pending: totalExercises - completedExercises - skippedExercises - cancelledExercises,
          isComplete: session.session_status === 'completed',
          canRetry: (skippedExercises > 0 || cancelledExercises > 0) && session.session_status === 'completed'
        }
      });
      return;
    }

    // Home training status
    const { home_training_plan_id } = req.query;
    if (!home_training_plan_id) {
      return res.status(400).json({ success: false, error: 'Se requiere methodology_plan_id o home_training_plan_id' });
    }

    const homeSessionQuery = await pool.query(
      `SELECT * FROM app.home_training_sessions
       WHERE user_id = $1 AND home_training_plan_id = $2 AND status IN ('pending', 'in_progress')
       ORDER BY created_at DESC LIMIT 1`,
      [userId, home_training_plan_id]
    );

    if (homeSessionQuery.rowCount === 0) {
      return res.json({ success: true, session_type: 'home', session: null, message: 'No hay sesión activa' });
    }

    const homeSession = homeSessionQuery.rows[0];
    const homeExercises = await pool.query(
      `SELECT * FROM app.home_exercise_progress WHERE home_training_session_id = $1 ORDER BY exercise_order`,
      [homeSession.id]
    );

    res.json({
      success: true,
      session_type: 'home',
      session: homeSession,
      exercises: homeExercises.rows
    });

  } catch (e) {
    console.error('Error in today-status:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// =============================================================================
// GET /weekend-status - Estado de sesión de fin de semana
// =============================================================================
router.get('/weekend-status', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.userId || req.user?.id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const sessionResult = await client.query(
      `SELECT id, methodology_plan_id, session_status, session_type, exercises_completed,
              exercises_skipped, exercises_cancelled, total_exercises, exercises_data,
              session_metadata, started_at, completed_at
       FROM app.methodology_exercise_sessions
       WHERE user_id = $1 AND session_type = 'weekend-extra'
         AND session_date >= $2 AND session_date < $3
       ORDER BY id DESC LIMIT 1`,
      [userId, today, tomorrow]
    );

    if (sessionResult.rows.length === 0) {
      return res.json({ success: true, hasWeekendSession: false, message: 'No hay sesión de fin de semana para hoy' });
    }

    const session = sessionResult.rows[0];

    const exercisesResult = await client.query(
      `SELECT est.exercise_order, est.exercise_name, est.status, est.exercise_data,
              est.actual_sets, est.planned_sets, est.actual_reps, est.planned_reps,
              est.completed_at, f.sentiment, f.comment
       FROM app.exercise_session_tracking est
       LEFT JOIN app.methodology_exercise_feedback f
         ON est.methodology_session_id = f.methodology_session_id AND est.exercise_order = f.exercise_order
       WHERE est.methodology_session_id = $1 ORDER BY est.exercise_order`,
      [session.id]
    );

    const total = exercisesResult.rows.length;
    const completed = exercisesResult.rows.filter(ex => String(ex.status).toLowerCase() === 'completed').length;
    const skipped = exercisesResult.rows.filter(ex => String(ex.status).toLowerCase() === 'skipped').length;
    const cancelled = exercisesResult.rows.filter(ex => String(ex.status).toLowerCase() === 'cancelled').length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    res.json({
      success: true,
      hasWeekendSession: true,
      session: {
        id: session.id,
        methodology_plan_id: session.methodology_plan_id,
        session_status: session.session_status,
        session_type: session.session_type,
        started_at: session.started_at,
        completed_at: session.completed_at,
        exercises_data: session.exercises_data
      },
      exercises: exercisesResult.rows,
      summary: { completed, skipped, cancelled, total, pending: total - (completed + skipped + cancelled), progress, canRetry: completed < total && total > 0, isCompleted: session.session_status === 'completed' }
    });

  } catch (error) {
    console.error('Error obteniendo estado de sesión de fin de semana:', error);
    res.status(500).json({ success: false, message: 'Error al obtener estado de sesión' });
  } finally {
    client.release();
  }
});

export default router;

