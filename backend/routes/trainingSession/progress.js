/**
 * @fileoverview Endpoints de progreso de ejercicios en sesiones
 * 
 * Endpoints:
 * - PUT /progress/methodology/:sessionId/:exerciseOrder - Actualizar progreso metodología
 * - PUT /progress/home/:sessionId/:exerciseOrder - Actualizar progreso home training
 * - GET /progress/methodology/:sessionId - Obtener progreso de sesión metodología
 * - GET /progress/home/:sessionId - Obtener progreso de sesión home
 * - POST /feedback/exercise - Registrar feedback de ejercicio
 * - PUT /warmup-time/:sessionId - Actualizar tiempo de calentamiento
 * 
 * @module routes/trainingSession/progress
 */

import express from 'express';
import authenticateToken from '../../middleware/auth.js';
import { pool } from '../../db.js';

const router = express.Router();

// =============================================================================
// PUT /progress/methodology/:sessionId/:exerciseOrder
// =============================================================================
router.put('/progress/methodology/:sessionId/:exerciseOrder', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = req.user?.userId || req.user?.id;
    const { sessionId, exerciseOrder } = req.params;
    const { series_completed, status, time_spent_seconds } = req.body;

    const ses = await client.query(
      'SELECT * FROM app.methodology_exercise_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );

    if (ses.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Sesión no encontrada' });
    }

    const sessionType = ses.rows[0].session_type;
    const isWeekendExtra = sessionType === 'weekend-extra';

    console.log(`📝 Actualizando ejercicio orden ${exerciseOrder} | Sesión ${sessionId} | Tipo: ${sessionType}`);

    // Para sesiones de fin de semana, usar exercise_session_tracking
    if (isWeekendExtra) {
      const trackingSel = await client.query(
        `SELECT * FROM app.exercise_session_tracking
         WHERE methodology_session_id = $1 AND exercise_order = $2`,
        [sessionId, exerciseOrder]
      );

      if (trackingSel.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Ejercicio no encontrado en tracking' });
      }

      const finalSeriesCompleted = (status === 'skipped' || status === 'cancelled') ? 0 : (series_completed ?? 0);

      const upd = await client.query(
        `UPDATE app.exercise_session_tracking
         SET actual_sets = $1::int, status = $2::varchar,
             actual_duration_seconds = COALESCE($3::int, actual_duration_seconds),
             completed_at = CASE WHEN $2::varchar = 'completed' THEN NOW() ELSE completed_at END,
             updated_at = NOW()
         WHERE methodology_session_id = $4 AND exercise_order = $5
         RETURNING *`,
        [finalSeriesCompleted, status, time_spent_seconds ?? null, sessionId, exerciseOrder]
      );

      const counters = await client.query(
        `SELECT COUNT(*) FILTER (WHERE status = 'completed') AS completed,
                COUNT(*) FILTER (WHERE status = 'skipped') AS skipped,
                COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
                COUNT(*) AS total
         FROM app.exercise_session_tracking WHERE methodology_session_id = $1`,
        [sessionId]
      );

      const { completed, skipped, cancelled, total } = counters.rows[0];

      await client.query(
        `UPDATE app.methodology_exercise_sessions
         SET exercises_completed = $2::int, exercises_skipped = $3::int, exercises_cancelled = $4::int,
             total_exercises = $5::int,
             session_status = CASE WHEN ($2::int + $3::int + $4::int) = $5::int AND $5::int > 0 THEN 'completed' ELSE 'in_progress' END,
             completed_at = CASE WHEN ($2::int + $3::int + $4::int) = $5::int AND $5::int > 0 THEN NOW() ELSE completed_at END,
             updated_at = NOW()
         WHERE id = $1`,
        [sessionId, Number(completed), Number(skipped), Number(cancelled), Number(total)]
      );

      await client.query('COMMIT');
      return res.json({ success: true, exercise: upd.rows[0], progress: { completed: Number(completed), skipped: Number(skipped), cancelled: Number(cancelled), total: Number(total) } });
    }

    // Para sesiones normales, usar methodology_exercise_progress
    const progSel = await client.query(
      `SELECT * FROM app.methodology_exercise_progress
       WHERE methodology_session_id = $1 AND exercise_order = $2`,
      [sessionId, exerciseOrder]
    );

    if (progSel.rowCount === 0) {
      await client.query(
        `INSERT INTO app.methodology_exercise_progress (
           methodology_session_id, user_id, exercise_order, exercise_name,
           series_total, repeticiones, descanso_seg, series_completed, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'pending')`,
        [sessionId, userId, exerciseOrder, 'Ejercicio', 3, '—', 60]
      );
    }

    const finalSeriesCompleted = (status === 'skipped' || status === 'cancelled') ? 0 : (series_completed ?? 0);

    const upd = await client.query(
      `UPDATE app.methodology_exercise_progress
       SET series_completed = $1::int, status = $2::varchar(20),
           time_spent_seconds = COALESCE($3, time_spent_seconds),
           completed_at = CASE WHEN $2::varchar(20) = 'completed' THEN NOW() ELSE completed_at END
       WHERE methodology_session_id = $4 AND exercise_order = $5
       RETURNING *`,
      [finalSeriesCompleted, status, time_spent_seconds ?? null, sessionId, exerciseOrder]
    );

    const counters = await client.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'completed') AS completed, COUNT(*) AS total
       FROM app.methodology_exercise_progress WHERE methodology_session_id = $1`,
      [sessionId]
    );

    const { completed, total } = counters.rows[0];

    await client.query(
      `UPDATE app.methodology_exercise_sessions
       SET exercises_completed = $2, total_exercises = GREATEST($3, COALESCE(total_exercises, 0)),
           total_duration_seconds = COALESCE(total_duration_seconds, 0) + COALESCE($4, 0),
           session_status = CASE WHEN $2 = $3 AND $3 > 0 THEN 'completed' ELSE 'in_progress' END,
           completed_at = CASE WHEN $2 = $3 AND $3 > 0 THEN NOW() ELSE completed_at END
       WHERE id = $1`,
      [sessionId, Number(completed), Number(total), time_spent_seconds ?? 0]
    );

    await client.query('COMMIT');
    res.json({ success: true, exercise: upd.rows[0], progress: { completed: Number(completed), total: Number(total) } });

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error updating methodology exercise:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  } finally {
    client.release();
  }
});

// =============================================================================
// PUT /progress/home/:sessionId/:exerciseOrder
// =============================================================================
router.put('/progress/home/:sessionId/:exerciseOrder', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { sessionId, exerciseOrder } = req.params;
    const { series_completed, duration_seconds, status } = req.body;
    const user_id = req.user.userId || req.user.id;

    const sessionResult = await client.query(
      'SELECT * FROM app.home_training_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, user_id]
    );

    if (sessionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Sesión no encontrada' });
    }

    const isDurationOnlyUpdate = !series_completed && !status && duration_seconds;
    let updateSql, updateParams;

    if (isDurationOnlyUpdate) {
      updateSql = `UPDATE app.home_exercise_progress SET duration_seconds = $1
                   WHERE home_training_session_id = $2 AND exercise_order = $3 RETURNING *`;
      updateParams = [duration_seconds, sessionId, exerciseOrder];
    } else {
      updateSql = `UPDATE app.home_exercise_progress
        SET series_completed = COALESCE($1, series_completed), status = COALESCE($2::text, status),
            duration_seconds = COALESCE($3, duration_seconds),
            completed_at = CASE WHEN COALESCE($2::text, status) = 'completed' THEN now() ELSE completed_at END
        WHERE home_training_session_id = $4 AND exercise_order = $5 RETURNING *`;
      updateParams = [
        series_completed !== undefined ? series_completed : null,
        status !== undefined ? status : null,
        duration_seconds !== undefined ? duration_seconds : null,
        sessionId, exerciseOrder
      ];
    }

    const updateResult = await client.query(updateSql, updateParams);

    if (updateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Ejercicio no encontrado' });
    }

    const progressResult = await client.query(
      `SELECT COUNT(*)::int as total_exercises,
              COUNT(CASE WHEN status = 'completed' THEN 1 END)::int as completed_exercises,
              SUM(CASE WHEN status = 'completed' THEN COALESCE(duration_seconds, 0) ELSE 0 END)::int as total_duration
       FROM app.home_exercise_progress WHERE home_training_session_id = $1`,
      [sessionId]
    );

    const progress = progressResult.rows[0];
    const progressPercentage = progress.total_exercises > 0
      ? Math.round((progress.completed_exercises / progress.total_exercises) * 100) : 0;

    await client.query(`
      UPDATE app.home_training_sessions SET
        exercises_completed = (SELECT COUNT(*) FROM app.home_exercise_progress WHERE home_training_session_id = $1 AND status = 'completed'),
        progress_percentage = ROUND(100.0 * (SELECT COUNT(*) FROM app.home_exercise_progress WHERE home_training_session_id = $1 AND status = 'completed') / NULLIF(total_exercises,0), 1),
        completed_at = CASE WHEN (SELECT COUNT(*) FROM app.home_exercise_progress WHERE home_training_session_id = $1 AND status <> 'completed') = 0 THEN COALESCE(completed_at, NOW()) ELSE NULL END,
        status = CASE WHEN (SELECT COUNT(*) FROM app.home_exercise_progress WHERE home_training_session_id = $1 AND status <> 'completed') = 0 THEN 'completed' ELSE 'in_progress' END
      WHERE id = $1
    `, [sessionId]);

    if (status === 'completed') {
      if (progressPercentage >= 100) {
        await client.query(
          `UPDATE app.user_home_training_stats SET total_sessions = total_sessions + 1, last_training_date = CURRENT_DATE, updated_at = NOW() WHERE user_id = $1`,
          [user_id]
        );
      }
      const exRow = updateResult.rows[0];
      const sessRow = sessionResult.rows[0];
      const exName = exRow.exercise_name || 'Ejercicio';
      const exKey = exName.toLowerCase().replace(/[^a-z0-9]+/g, '_');

      await client.query(
        `INSERT INTO app.home_exercise_history (user_id, exercise_name, exercise_key, reps, series, duration_seconds, session_id, plan_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id, exercise_name, session_id) DO NOTHING`,
        [user_id, exName, exKey, null, series_completed, duration_seconds ?? null, sessionId, sessRow.home_training_plan_id]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      exercise: updateResult.rows[0],
      session_progress: { completed_exercises: progress.completed_exercises, total_exercises: progress.total_exercises, percentage: progressPercentage, total_duration: progress.total_duration }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating home exercise progress:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar el progreso del ejercicio' });
  } finally {
    client.release();
  }
});

// =============================================================================
// GET /progress/methodology/:sessionId
// =============================================================================
router.get('/progress/methodology/:sessionId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { sessionId } = req.params;

    const ses = await pool.query(
      'SELECT * FROM app.methodology_exercise_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );

    if (ses.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Sesión no encontrada' });
    }

    const progress = await pool.query(
      `SELECT mep.exercise_order, mep.exercise_name, mep.series_total, mep.series_completed,
              mep.repeticiones, mep.descanso_seg, mep.intensidad, mep.tempo, mep.status,
              mep.time_spent_seconds, mep.notas, mef.sentiment, mef.comment
       FROM app.methodology_exercise_progress mep
       LEFT JOIN app.methodology_exercise_feedback mef
         ON mep.methodology_session_id = mef.methodology_session_id AND mep.exercise_order = mef.exercise_order
       WHERE mep.methodology_session_id = $1 ORDER BY mep.exercise_order ASC`,
      [sessionId]
    );

    const counters = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'completed')::int AS completed, COUNT(*)::int AS total
       FROM app.methodology_exercise_progress WHERE methodology_session_id = $1`,
      [sessionId]
    );

    res.json({ success: true, session: ses.rows[0], exercises: progress.rows, summary: counters.rows[0] });

  } catch (e) {
    console.error('Error fetching methodology session progress:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// =============================================================================
// GET /progress/home/:sessionId
// =============================================================================
router.get('/progress/home/:sessionId', authenticateToken, async (req, res) => {
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
    console.error('Error getting home session progress:', error);
    res.status(500).json({ success: false, message: 'Error al obtener el progreso de la sesión' });
  }
});

// =============================================================================
// GET /progress/plan/:planId - Obtener progreso completo del plan
// =============================================================================
import { checkPlanProgress, completePlanManually } from '../../services/methodologyPlansService.js';

router.get('/progress/plan/:planId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { planId } = req.params;

    // Verificar que el plan pertenece al usuario
    const planCheck = await pool.query(
      'SELECT id FROM app.methodology_plans WHERE id = $1 AND user_id = $2',
      [planId, userId]
    );

    if (planCheck.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Plan no encontrado' });
    }

    const progress = await checkPlanProgress(parseInt(planId));

    if (!progress.success) {
      return res.status(400).json(progress);
    }

    res.json(progress);

  } catch (error) {
    console.error('❌ Error obteniendo progreso del plan:', error);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

// =============================================================================
// POST /progress/plan/:planId/complete - Finalizar plan manualmente
// =============================================================================
router.post('/progress/plan/:planId/complete', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { planId } = req.params;

    console.log(`🏆 Usuario ${userId} solicita completar plan ${planId} manualmente`);

    const result = await completePlanManually(parseInt(planId), userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);

  } catch (error) {
    console.error('❌ Error completando plan manualmente:', error);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});

export default router;

