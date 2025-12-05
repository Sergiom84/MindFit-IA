/**
 * @fileoverview Endpoints de finalización de sesiones
 * 
 * Endpoints:
 * - POST /complete/methodology/:sessionId - Completar sesión de metodología
 * - POST /complete/home/:sessionId - Completar sesión de home training
 * - POST /handle-abandon/:sessionId - Manejar abandono de sesión
 * - PUT /close-active - Cerrar sesiones activas
 * - DELETE /cancel/methodology/:sessionId - Cancelar sesión
 * 
 * @module routes/trainingSession/complete
 */

import express from 'express';
import authenticateToken from '../../middleware/auth.js';
import { pool } from '../../db.js';
import { finalizePlanIfCompleted } from '../../services/methodologyPlansService.js';
import { calculateSessionStatus } from '../../services/sessionStatusService.js';

const router = express.Router();

// =============================================================================
// POST /complete/methodology/:sessionId - Completar sesión de metodología
// =============================================================================
router.post('/complete/methodology/:sessionId', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = req.user?.userId || req.user?.id;
    const { sessionId } = req.params;
    const {
      outcome = 'auto',
      feedback = []
    } = req.body || {};

    const ses = await client.query(
      'SELECT * FROM app.methodology_exercise_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );

    if (ses.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Sesión no encontrada' });
    }

    // Actualizar ejercicios pendientes según outcome seleccionado
    if (outcome === 'skip_remaining') {
      await client.query(
        `UPDATE app.methodology_exercise_progress
         SET status = 'skipped', completed_at = NOW()
         WHERE methodology_session_id = $1
           AND status NOT IN ('completed','skipped')`,
        [sessionId]
      );
    } else if (outcome === 'cancel_remaining') {
      await client.query(
        `UPDATE app.methodology_exercise_progress
         SET status = 'cancelled', completed_at = NOW()
         WHERE methodology_session_id = $1
           AND status NOT IN ('completed','cancelled')`,
        [sessionId]
      );
    }

    // Obtener todos los ejercicios para calcular estado
    const exercisesQuery = await client.query(
      `SELECT exercise_order, status, series_completed, series_total
       FROM app.methodology_exercise_progress
       WHERE methodology_session_id = $1
       ORDER BY exercise_order`,
      [sessionId]
    );

    // Calcular estado de sesión usando el servicio
    const { status: sessionStatus, completionRate, metrics } = calculateSessionStatus(exercisesQuery.rows);

    const totalExercises = metrics.total;
    const completedExercises = metrics.completed;
    const skippedExercises = metrics.skipped;
    const cancelledExercises = metrics.cancelled;

    await client.query(
      `UPDATE app.methodology_exercise_sessions
       SET session_status = $2,
           exercises_completed = $3,
           exercises_skipped = $4,
           exercises_cancelled = $5,
           total_exercises = $6,
           completion_rate = $7,
           completed_at = NOW(),
           total_duration_seconds = CASE
             WHEN started_at IS NOT NULL THEN EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
             ELSE total_duration_seconds
           END
       WHERE id = $1`,
      [sessionId, sessionStatus, completedExercises, skippedExercises, cancelledExercises, totalExercises, completionRate]
    );

    // Obtener todos los ejercicios de la sesión para mover al historial
    const exercisesForHistory = await client.query(
      `SELECT mep.*, mes.methodology_type, mes.methodology_plan_id, mes.week_number, mes.day_name,
              mes.warmup_time_seconds, mes.started_at, mes.completed_at
       FROM app.methodology_exercise_progress mep
       JOIN app.methodology_exercise_sessions mes ON mep.methodology_session_id = mes.id
       WHERE mep.methodology_session_id = $1`,
      [sessionId]
    );

    // Mover cada ejercicio al historial completo
    for (const exercise of exercisesForHistory.rows) {
      if (exercise.status !== 'pending') {
        await client.query(
          `INSERT INTO app.methodology_exercise_history_complete (
            user_id, methodology_plan_id, methodology_session_id,
            exercise_name, exercise_order, methodology_type,
            series_total, series_completed, repeticiones, intensidad,
            tiempo_dedicado_segundos, warmup_time_seconds, week_number, day_name,
            session_date, completed_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
          ON CONFLICT DO NOTHING`,
          [
            userId,
            exercise.methodology_plan_id,
            sessionId,
            exercise.exercise_name,
            exercise.exercise_order,
            exercise.methodology_type,
            exercise.series_total,
            exercise.series_completed || 0,
            exercise.repeticiones,
            exercise.intensidad,
            exercise.time_spent_seconds,
            exercise.warmup_time_seconds || 0,
            exercise.week_number,
            exercise.day_name,
            exercise.started_at ? new Date(exercise.started_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            exercise.completed_at || new Date()
          ]
        );
      }
    }

    await finalizePlanIfCompleted(ses.rows[0].methodology_plan_id, client);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Sesión finalizada y datos guardados en historial',
      summary: {
        status: sessionStatus,
        completionRate,
        totalExercises,
        completedExercises,
        skippedExercises,
        cancelledExercises
      }
    });

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error finishing methodology session:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  } finally {
    client.release();
  }
});

// =============================================================================
// POST /complete/home/:sessionId - Completar sesión de home training
// =============================================================================
router.post('/complete/home/:sessionId', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { sessionId } = req.params;
    const user_id = req.user.userId || req.user.id;

    const sessionCheck = await client.query(
      'SELECT * FROM app.home_training_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, user_id]
    );

    if (sessionCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Sesión no encontrada' });
    }

    await client.query(
      `UPDATE app.home_training_sessions
       SET status = 'completed', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [sessionId]
    );

    const summaryResult = await client.query(
      `SELECT COUNT(*) as total_exercises,
              COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_exercises,
              SUM(COALESCE(duration_seconds, 0)) as total_duration
       FROM app.home_exercise_progress
       WHERE home_training_session_id = $1`,
      [sessionId]
    );

    const summary = summaryResult.rows[0];

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Sesión completada exitosamente',
      summary: {
        total_exercises: parseInt(summary.total_exercises),
        completed_exercises: parseInt(summary.completed_exercises),
        total_duration_seconds: parseInt(summary.total_duration)
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error completing home training session:', error);
    res.status(500).json({ success: false, message: 'Error al completar la sesión' });
  } finally {
    client.release();
  }
});

// =============================================================================
// POST /handle-abandon/:sessionId - Manejar abandono de sesión
// =============================================================================
router.post('/handle-abandon/:sessionId', authenticateToken, async (req, res) => {
  const { sessionId } = req.params;
  const { currentProgress, reason, session_type = 'home' } = req.body;
  const user_id = req.user.userId || req.user.id;

  console.log(`🚪 Usuario ${user_id} abandonando sesión ${sessionId}, motivo: ${reason}`);

  try {
    if (session_type === 'home') {
      const sessionCheck = await pool.query(
        'SELECT * FROM app.home_training_sessions WHERE id = $1 AND user_id = $2',
        [sessionId, user_id]
      );

      if (sessionCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Sesión no encontrada' });
      }

      if (currentProgress) {
        for (const [exerciseIndex, progress] of Object.entries(currentProgress)) {
          if (progress.series_completed > 0) {
            await pool.query(`
              UPDATE app.home_exercise_progress
              SET series_completed = $1, status = $2, duration_seconds = COALESCE($3, duration_seconds)
              WHERE home_training_session_id = $4 AND exercise_order = $5
            `, [
              progress.series_completed,
              progress.status || 'in_progress',
              progress.duration_seconds,
              sessionId,
              parseInt(exerciseIndex)
            ]);
          }
        }
      }

      const progressCheck = await pool.query(`
        SELECT COUNT(*) as total_exercises,
               COUNT(*) FILTER (WHERE status IN ('completed', 'skipped')) as finished_exercises,
               COUNT(*) FILTER (WHERE series_completed > 0 OR status IN ('completed', 'skipped', 'in_progress')) as exercises_with_progress
        FROM app.home_exercise_progress
        WHERE home_training_session_id = $1
      `, [sessionId]);

      const { total_exercises, finished_exercises, exercises_with_progress } = progressCheck.rows[0];
      const allFinished = parseInt(finished_exercises) === parseInt(total_exercises) && parseInt(total_exercises) > 0;
      const hasProgress = parseInt(exercises_with_progress) > 0;

      let finalStatus;
      if (allFinished) finalStatus = 'completed';
      else if (hasProgress) finalStatus = 'in_progress';
      else finalStatus = 'cancelled';

      await pool.query(`
        UPDATE app.home_training_sessions
        SET abandoned_at = NOW(), abandon_reason = $2, status = $3,
            completed_at = CASE WHEN $3 = 'completed' THEN NOW() ELSE completed_at END
        WHERE id = $1
      `, [sessionId, reason, finalStatus]);

      return res.json({
        success: true,
        message: 'Progreso guardado antes de abandono',
        finalStatus,
        progress: { total: parseInt(total_exercises), finished: parseInt(finished_exercises), canResume: finalStatus === 'in_progress' }
      });
    }

    res.json({ success: true, message: 'Progreso guardado antes de abandono' });

  } catch (error) {
    console.error('❌ Error manejando abandono:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// PUT /close-active - Cerrar sesiones activas
// =============================================================================
router.put('/close-active', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.userId || req.user.id;
    const { session_type = 'all' } = req.body;

    let totalClosed = 0;

    if (session_type === 'home' || session_type === 'all') {
      const homeResult = await pool.query(
        `UPDATE app.home_training_sessions
         SET status = 'cancelled', completed_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND status = 'in_progress'
         RETURNING id`,
        [user_id]
      );
      totalClosed += homeResult.rows.length;
    }

    if (session_type === 'methodology' || session_type === 'all') {
      const methodologyResult = await pool.query(
        `UPDATE app.methodology_exercise_sessions
         SET session_status = 'cancelled', updated_at = NOW()
         WHERE user_id = $1 AND session_status = 'in_progress'
         RETURNING id`,
        [user_id]
      );
      totalClosed += methodologyResult.rows.length;
    }

    res.json({
      success: true,
      message: `${totalClosed} sesión${totalClosed !== 1 ? 'es' : ''} cerrada${totalClosed !== 1 ? 's' : ''}`,
      closedSessions: totalClosed
    });

  } catch (error) {
    console.error('Error closing active sessions:', error);
    res.status(500).json({ success: false, message: 'Error al cerrar sesiones activas' });
  }
});

// =============================================================================
// DELETE /cancel/methodology/:sessionId - Cancelar sesión de metodología
// =============================================================================
router.delete('/cancel/methodology/:sessionId', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = req.user?.userId || req.user?.id;
    const { sessionId } = req.params;

    console.log(`🗑️ Cancelando sesión metodología ${sessionId} para usuario ${userId}`);

    const sessionCheck = await client.query(
      `SELECT id, session_type, methodology_plan_id
       FROM app.methodology_exercise_sessions
       WHERE id = $1 AND user_id = $2`,
      [sessionId, userId]
    );

    if (sessionCheck.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Sesión no encontrada o no pertenece al usuario'
      });
    }

    const session = sessionCheck.rows[0];
    const isWeekend = session.session_type === 'weekend-extra';

    await client.query(
      `DELETE FROM app.exercise_session_tracking WHERE methodology_session_id = $1`,
      [sessionId]
    );

    await client.query(
      `DELETE FROM app.methodology_exercise_sessions WHERE id = $1`,
      [sessionId]
    );

    if (isWeekend && session.methodology_plan_id) {
      await client.query(
        `DELETE FROM app.methodology_plans WHERE id = $1`,
        [session.methodology_plan_id]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: isWeekend
        ? 'Entrenamiento de fin de semana cancelado'
        : 'Sesión de entrenamiento cancelada'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error cancelando sesión:', error);
    res.status(500).json({ success: false, message: 'Error al cancelar la sesión' });
  } finally {
    client.release();
  }
});

export default router;

