/**
 * @fileoverview Endpoints de sesiones de home training
 * 
 * Endpoints:
 * - POST /sessions/start - Iniciar sesión
 * - PUT /sessions/:sessionId/exercise/:exerciseOrder - Actualizar progreso
 * - GET /sessions/:sessionId/progress - Obtener progreso
 * - GET /sessions/:sessionId/feedback - Obtener feedback
 * - POST /sessions/:sessionId/exercise/:exerciseOrder/feedback - Crear feedback
 * - POST /sessions/:sessionId/handle-abandon - Manejar abandono
 * - PUT /close-active-sessions - Cerrar sesiones activas
 * - GET /stats - Estadísticas del usuario
 * 
 * @module routes/homeTraining/sessions
 */

import express from 'express';
import { pool } from '../../db.js';
import authenticateToken from '../../middleware/auth.js';

const router = express.Router();

// =============================================================================
// POST /sessions/start - Iniciar sesión
// =============================================================================
router.post('/sessions/start', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { home_training_plan_id } = req.body;
    const user_id = req.user.userId || req.user.id;

    const planResult = await client.query(
      'SELECT * FROM app.home_training_plans WHERE id = $1 AND user_id = $2',
      [home_training_plan_id, user_id]
    );

    if (planResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Plan de entrenamiento no encontrado' });
    }

    const plan = planResult.rows[0];
    const exercises = plan.plan_data.plan_entrenamiento?.ejercicios || [];

    const sessionResult = await client.query(
      `INSERT INTO app.home_training_sessions (user_id, home_training_plan_id, total_exercises, session_data)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [user_id, home_training_plan_id, exercises.length, JSON.stringify({ exercises })]
    );
    const session = sessionResult.rows[0];

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i] || {};
      const totalSeries = Number(ex.series ?? ex.total_series ?? ex.totalSeries) || 4;
      await client.query(
        `INSERT INTO app.home_exercise_progress
         (home_training_session_id, exercise_order, exercise_name, total_series, series_completed, status, duration_seconds, started_at, exercise_data)
         VALUES ($1, $2, $3, $4, 0, 'pending', NULL, NOW(), $5)`,
        [session.id, i, ex.nombre, totalSeries, JSON.stringify(ex)]
      );
    }

    await client.query('COMMIT');
    res.json({ success: true, session });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error starting training session:', error);
    res.status(500).json({ success: false, message: 'Error al iniciar la sesión de entrenamiento' });
  } finally {
    client.release();
  }
});

// =============================================================================
// GET /sessions/:sessionId/progress - Obtener progreso
// =============================================================================
router.get('/sessions/:sessionId/progress', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const user_id = req.user.userId || req.user.id;

    const sessionResult = await pool.query(
      'SELECT * FROM app.home_training_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, user_id]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Sesión no encontrada' });
    }

    const progressResult = await pool.query(
      `SELECT p.*, fb.sentiment AS feedback_sentiment, fb.comment AS feedback_comment
       FROM app.home_exercise_progress p
       LEFT JOIN LATERAL (
         SELECT sentiment, comment FROM app.user_exercise_feedback uf
         WHERE uf.user_id = $2 AND uf.session_id = $1 AND uf.exercise_order = p.exercise_order
         ORDER BY created_at DESC LIMIT 1
       ) fb ON true
       WHERE p.home_training_session_id = $1 ORDER BY p.exercise_order`,
      [sessionId, user_id]
    );

    const session = sessionResult.rows[0];
    const exercises = progressResult.rows;
    const nextExerciseIndex = exercises.findIndex(ex => ex.status !== 'completed');
    const completedExercises = exercises.filter(ex => ex.status === 'completed').map(ex => ex.exercise_order);
    const safeCurrentExercise = nextExerciseIndex >= 0 ? nextExerciseIndex : Math.max(0, exercises.length - 1);
    const allCompleted = exercises.length > 0 && exercises.every(ex => ex.status === 'completed');

    res.json({
      success: true,
      session,
      exercises,
      progress: { currentExercise: safeCurrentExercise, completedExercises, percentage: session.progress_percentage || 0, allCompleted }
    });
  } catch (error) {
    console.error('Error getting session progress:', error);
    res.status(500).json({ success: false, message: 'Error al obtener el progreso de la sesión' });
  }
});

// =============================================================================
// GET /stats - Estadísticas del usuario
// =============================================================================
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.userId || req.user.id;

    const statsResult = await pool.query(
      `SELECT * FROM app.user_home_training_stats WHERE user_id = $1`,
      [user_id]
    );

    if (statsResult.rows.length === 0) {
      return res.json({ success: true, stats: { total_sessions: 0, total_exercises: 0, total_time_minutes: 0 } });
    }

    res.json({ success: true, stats: statsResult.rows[0] });
  } catch (error) {
    console.error('Error getting user stats:', error);
    res.status(500).json({ success: false, message: 'Error al obtener estadísticas' });
  }
});

export default router;

