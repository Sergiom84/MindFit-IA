/**
 * Rutas de home-training - dominio: sessions (extraidas del monolito).
 */

import express from 'express';
import {
  pool
} from '../../db.js';
import authenticateToken from '../../middleware/auth.js';

const router = express.Router();


// Iniciar una nueva sesión de entrenamiento
router.post('/sessions/start', authenticateToken, async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { home_training_plan_id } = req.body;
      const user_id = req.user.userId || req.user.id;

      // Verificar que el plan pertenece al usuario
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

      // Crear nueva sesión
      const sessionResult = await client.query(
        `INSERT INTO app.home_training_sessions
         (user_id, home_training_plan_id, total_exercises, session_data)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [user_id, home_training_plan_id, exercises.length, JSON.stringify({ exercises })]
      );
      const session = sessionResult.rows[0];
      const sessionId = session.id;

      // Crear registros de progreso para cada ejercicio (robusto)
      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i] || {};
        // Series por defecto (si la IA no especifica): 4
        const totalSeries = Number(ex.series ?? ex.total_series ?? ex.totalSeries) || 4;
        await client.query(
          `INSERT INTO app.home_exercise_progress
           (home_training_session_id, exercise_order, exercise_name, total_series, series_completed, status, duration_seconds, started_at, exercise_data)
           VALUES ($1, $2, $3, $4, 0, 'pending', NULL, NOW(), $5)`,
          [sessionId, i, ex.nombre, totalSeries, JSON.stringify(ex)]
        );
      }

      await client.query('COMMIT');

      res.json({ success: true, session });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error starting training session:', error);
    res.status(500).json({
      success: false,
      message: 'Error al iniciar la sesión de entrenamiento'
    });
  }
});


// Actualizar progreso de ejercicio (MEJORADO)
router.put('/sessions/:sessionId/exercise/:exerciseOrder', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { sessionId, exerciseOrder } = req.params;
    const { series_completed, duration_seconds, status } = req.body;
    const user_id = req.user.userId || req.user.id;

    console.log(`🔍 PUT /sessions/${sessionId}/exercise/${exerciseOrder} - Usuario: ${user_id}`);
    console.log(`📦 Body:`, { series_completed, duration_seconds, status });

    // Verificar que la sesión pertenece al usuario
    const sessionResult = await client.query(
      'SELECT * FROM app.home_training_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, user_id]
    );

    if (sessionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Sesión no encontrada' });
    }

    // Determinar si es una actualización de solo duración
    const isDurationOnlyUpdate = !series_completed && !status && duration_seconds;
    
    let updateSql, updateParams;
    
    if (isDurationOnlyUpdate) {
      // Solo actualizar duración sin cambiar status ni series
      console.log(`⏰ Actualizando solo duración para ejercicio ${exerciseOrder}: ${duration_seconds}s`);
      updateSql = `
        UPDATE app.home_exercise_progress
        SET duration_seconds = $1
        WHERE home_training_session_id = $2
          AND exercise_order = $3
        RETURNING *;
      `;
      updateParams = [duration_seconds, sessionId, exerciseOrder];
    } else {
      // Actualización completa (series, status y duración)
      console.log(`📊 Actualizando progreso completo para ejercicio ${exerciseOrder}: ${series_completed} series, ${status}`);
      updateSql = `
        UPDATE app.home_exercise_progress
        SET
          series_completed  = COALESCE($1, series_completed),
          status            = COALESCE($2::text, status),
          duration_seconds  = COALESCE($3, duration_seconds),
          completed_at      = CASE WHEN COALESCE($2::text, status) = 'completed' THEN now() ELSE completed_at END
        WHERE home_training_session_id = $4
          AND exercise_order = $5
        RETURNING *;
      `;
      updateParams = [
        series_completed !== undefined ? series_completed : null,
        status !== undefined ? status : null,
        duration_seconds !== undefined ? duration_seconds : null,
        sessionId,
        exerciseOrder
      ];
    }
    
    const updateResult = await client.query(updateSql, updateParams);


    if (updateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Ejercicio no encontrado' });
    }

    // Calcular progreso total de la sesión
    const progressResult = await client.query(
      `SELECT
         COUNT(*)::int as total_exercises,
         COUNT(CASE WHEN status = 'completed' THEN 1 END)::int as completed_exercises,
         SUM(CASE WHEN status = 'completed' THEN COALESCE(duration_seconds, 0) ELSE 0 END)::int as total_duration
       FROM app.home_exercise_progress
       WHERE home_training_session_id = $1`,
      [sessionId]
    );

    const progress = progressResult.rows[0];
    const progressPercentage = progress.total_exercises > 0
      ? Math.round((progress.completed_exercises / progress.total_exercises) * 100)
      : 0;

    // Actualizar la sesión
    await client.query(`
      UPDATE app.home_training_sessions
      SET
        exercises_completed    = (SELECT COUNT(*) FROM app.home_exercise_progress
                                  WHERE home_training_session_id = $1 AND status = 'completed'),
        progress_percentage    = ROUND(100.0 * (SELECT COUNT(*) FROM app.home_exercise_progress
                                  WHERE home_training_session_id = $1 AND status = 'completed')
                                  / NULLIF(total_exercises,0), 1),
        completed_at           = CASE
                                  WHEN (SELECT COUNT(*) FROM app.home_exercise_progress
                                        WHERE home_training_session_id = $1 AND status <> 'completed') = 0
                                  THEN COALESCE(completed_at, NOW())
                                  ELSE NULL
                                END,
        status                 = CASE
                                  WHEN (SELECT COUNT(*) FROM app.home_exercise_progress
                                        WHERE home_training_session_id = $1 AND status <> 'completed') = 0
                                  THEN 'completed'
                                  ELSE 'in_progress'
                                END
      WHERE id = $1
    `, [sessionId]);

    // Si el ejercicio se completó, actualizar estadísticas e historial
    if (status === 'completed') {
      if (progressPercentage >= 100) {
        await client.query(
          `UPDATE app.user_home_training_stats
           SET total_sessions = total_sessions + 1,
               last_training_date = CURRENT_DATE,
               updated_at = NOW()
           WHERE user_id = $1`,
          [user_id]
        );
      }

      const exRow = updateResult.rows[0];
      const sessRow = sessionResult.rows[0];
      const planId = sessRow.home_training_plan_id;

      const exName = exRow.exercise_name || (exRow.exercise_data && exRow.exercise_data.nombre) || 'Ejercicio';
      const exKey = (exName || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');

      await client.query(
        `INSERT INTO app.home_exercise_history
           (user_id, exercise_name, exercise_key, reps, series, duration_seconds, session_id, plan_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id, exercise_name, session_id) DO NOTHING`,
        [user_id, exName, exKey, null, series_completed, (duration_seconds ?? null), sessionId, planId]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      exercise: updateResult.rows[0],
      session_progress: {
        completed_exercises: progress.completed_exercises,
        total_exercises: progress.total_exercises,
        percentage: progressPercentage,
        total_duration: progress.total_duration
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating exercise progress:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar el progreso del ejercicio' });
  } finally {
    client.release();
  }
});


// Obtener progreso de sesión actual
router.get('/sessions/:sessionId/progress', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const user_id = req.user.userId || req.user.id;

    // Verificar que la sesión pertenece al usuario
    const sessionResult = await pool.query(
      'SELECT * FROM app.home_training_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, user_id]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sesión no encontrada'
      });
    }

    // Obtener progreso de todos los ejercicios + último feedback por ejercicio
    const progressResult = await pool.query(
      `SELECT p.*, fb.sentiment AS feedback_sentiment, fb.comment AS feedback_comment
         FROM app.home_exercise_progress p
         LEFT JOIN LATERAL (
           SELECT sentiment, comment
             FROM app.user_exercise_feedback uf
            WHERE uf.user_id = $2
              AND uf.session_id = $1
              AND uf.exercise_order = p.exercise_order
            ORDER BY created_at DESC
            LIMIT 1
         ) fb ON true
        WHERE p.home_training_session_id = $1
        ORDER BY p.exercise_order`,
      [sessionId, user_id]
    );

    const session = sessionResult.rows[0];
    const exercises = progressResult.rows;

    // Calcular siguiente ejercicio a realizar
    // Debe ser el primer ejercicio NO completado (incluye pending, in_progress, skipped, cancelled)
    const nextExerciseIndex = exercises.findIndex(ex => ex.status !== 'completed');
    const completedExercises = exercises
      .filter(ex => ex.status === 'completed')
      .map(ex => ex.exercise_order);

    // Si hay alguno sin completar, retomamos desde ese índice; si no, usar último índice válido
    let safeCurrentExercise;
    if (nextExerciseIndex >= 0) {
      safeCurrentExercise = nextExerciseIndex;
    } else if (exercises.length > 0) {
      safeCurrentExercise = Math.max(0, exercises.length - 1);
    } else {
      safeCurrentExercise = 0;
    }

    // allCompleted solo es true si absolutamente todos están marcados como 'completed'
    const allCompleted = exercises.length > 0 && exercises.every(ex => ex.status === 'completed');

    res.json({
      success: true,
      session: session,
      exercises: exercises,
      progress: {
        currentExercise: safeCurrentExercise,
        completedExercises: completedExercises,
        percentage: session.progress_percentage || 0,
        allCompleted
      }
    });
  } catch (error) {
    console.error('Error getting session progress:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el progreso de la sesión'
    });
  }
});



// Obtener feedback de una sesión
router.get('/sessions/:sessionId/feedback', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const user_id = req.user.userId || req.user.id;

    const result = await pool.query(
      `SELECT exercise_order, exercise_name, sentiment, comment
       FROM app.user_exercise_feedback
       WHERE user_id = $1 AND session_id = $2
       ORDER BY exercise_order`,
      [user_id, sessionId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo feedback de sesión:', error);
    res.status(500).json({ success: false, message: 'Error obteniendo feedback' });
  }
});


// Crear feedback de ejercicio
router.post('/sessions/:sessionId/exercise/:exerciseOrder/feedback', authenticateToken, async (req, res) => {
  try {
    const { sessionId, exerciseOrder } = req.params;
    const { sentiment, comment, exercise_name } = req.body || {};
    const user_id = req.user.userId || req.user.id;

    // Validar sentiment solo si está presente - Estados unificados post-merge
    if (sentiment !== null && sentiment !== undefined && !['like','dislike','hard'].includes(String(sentiment))) {
      return res.status(400).json({ success: false, message: 'sentiment inválido' });
    }

    // Buscar nombre/clave del ejercicio si no llega por body
    let exName = exercise_name;
    let exKey = null;
    if (!exName) {
      const q = await pool.query(
        `SELECT exercise_name, exercise_data
           FROM app.home_exercise_progress
          WHERE home_training_session_id = $1 AND exercise_order = $2
          LIMIT 1`,
        [sessionId, exerciseOrder]
      );
      if (q.rows.length) {
        exName = q.rows[0].exercise_name || q.rows[0].exercise_data?.nombre || 'Ejercicio';
      } else {
        exName = 'Ejercicio';
      }
    }
    exKey = (exName || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');

    const methodologyType = 'home_training';
    const feedbackType = 'exercise_rating';
    const normalizedComment = comment && String(comment).trim() !== '' ? String(comment).trim() : null;

    await pool.query(
      `INSERT INTO app.user_exercise_feedback
         (user_id, session_id, exercise_order, exercise_name, exercise_key, sentiment, comment, methodology_type, feedback_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (user_id, session_id, exercise_order) DO UPDATE
         SET sentiment = EXCLUDED.sentiment,
             comment = EXCLUDED.comment,
             methodology_type = EXCLUDED.methodology_type,
             feedback_type = EXCLUDED.feedback_type,
             updated_at = NOW()`
      ,
      [user_id, sessionId, exerciseOrder, exName, exKey, sentiment || null, normalizedComment, methodologyType, feedbackType]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error creating feedback:', error);
    res.status(500).json({ success: false, message: 'Error creando feedback' });
  }
});


// Manejar abandono de sesión (beforeunload, visibility change, etc.)
router.post('/sessions/:sessionId/handle-abandon', authenticateToken, async (req, res) => {
  const { sessionId } = req.params;
  const { currentProgress, reason } = req.body; // reason: 'beforeunload', 'visibility', 'logout'
  const user_id = req.user.userId || req.user.id;

  console.log(`🚪 Usuario ${user_id} abandonando sesión ${sessionId}, motivo: ${reason}`);

  try {
    // 1. Verificar que la sesión pertenece al usuario
    const sessionCheck = await pool.query(
      'SELECT * FROM app.home_training_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, user_id]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Sesión no encontrada' });
    }

    // 2. Guardar progreso actual si se proporciona
    if (currentProgress) {
      console.log(`💾 Guardando progreso antes de abandono:`, currentProgress);
      
      for (const [exerciseIndex, progress] of Object.entries(currentProgress)) {
        if (progress.series_completed > 0) {
          await pool.query(`
            UPDATE app.home_exercise_progress
            SET 
              series_completed = $1,
              status = $2,
              duration_seconds = COALESCE($3, duration_seconds)
            WHERE home_training_session_id = $4 
              AND exercise_order = $5
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

    // 3. Verificar progreso para determinar el status final
    const progressCheck = await pool.query(`
      SELECT
        COUNT(*) as total_exercises,
        COUNT(*) FILTER (WHERE status IN ('completed', 'skipped')) as finished_exercises,
        COUNT(*) FILTER (WHERE series_completed > 0 OR status IN ('completed', 'skipped', 'in_progress')) as exercises_with_progress
      FROM app.home_exercise_progress
      WHERE home_training_session_id = $1
    `, [sessionId]);

    const { total_exercises, finished_exercises, exercises_with_progress } = progressCheck.rows[0];
    const allFinished = parseInt(finished_exercises) === parseInt(total_exercises) && parseInt(total_exercises) > 0;
    const hasProgress = parseInt(exercises_with_progress) > 0;

    // 4. Determinar status final:
    // - Todos finalizados → 'completed'
    // - Hay progreso pero no todos finalizados → 'in_progress' (permitir reanudar)
    // - Sin progreso → 'cancelled'
    let finalStatus;
    if (allFinished) {
      finalStatus = 'completed';
    } else if (hasProgress) {
      finalStatus = 'in_progress';
    } else {
      finalStatus = 'cancelled';
    }

    // 5. Marcar abandono y actualizar status
    await pool.query(`
      UPDATE app.home_training_sessions
      SET
        abandoned_at = NOW(),
        abandon_reason = $2,
        status = $3,
        completed_at = CASE
          WHEN $3 = 'completed' THEN NOW()
          ELSE completed_at
        END
      WHERE id = $1
    `, [sessionId, reason, finalStatus]);

    console.log(`✅ Sesión ${sessionId} marcada como abandonada (${reason})`);
    console.log(`   Status final: ${finalStatus} (${finished_exercises}/${total_exercises} ejercicios finalizados)`);

    res.json({
      success: true,
      message: 'Progreso guardado antes de abandono',
      finalStatus: finalStatus,
      progress: {
        total: parseInt(total_exercises),
        finished: parseInt(finished_exercises),
        canResume: finalStatus === 'in_progress'
      }
    });
    
  } catch (error) {
    console.error('❌ Error manejando abandono:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// Cerrar sesiones activas (para el problema principal)
router.put('/close-active-sessions', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.userId || req.user.id;

    const result = await pool.query(
      `UPDATE app.home_training_sessions
       SET status = 'cancelled', 
           completed_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $1 AND status = 'in_progress'
       RETURNING id`,
      [user_id]
    );

    res.json({
      success: true,
      message: `${result.rows.length} sesión${result.rows.length !== 1 ? 'es' : ''} cerrada${result.rows.length !== 1 ? 's' : ''}`,
      closedSessions: result.rows.length
    });

  } catch (error) {
    console.error('Error closing active sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cerrar sesiones activas'
    });
  }
});

export default router;
