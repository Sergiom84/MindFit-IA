/**
 * Rutas de training-session - dominio: manage (extraidas del monolito).
 */

import express from 'express';
import authenticateToken from '../../middleware/auth.js';
import {
  pool
} from '../../db.js';
import {
  normalizeDayAbbrev
} from '../../utils/shared/dayNormalizer.js';

const router = express.Router();


/**
 * GET /api/training-session/today-status
 * Obtener estado de la sesión del día actual
 */
router.get('/today-status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { methodology_plan_id, week_number, day_name, session_date } = req.query;

    // Validar parámetros según el tipo de entrenamiento
    if (methodology_plan_id) {
      // Sesión de metodología
      if (!week_number || !day_name) {
        return res.status(400).json({
          success: false,
          error: 'Parámetros requeridos para metodología: week_number, day_name'
        });
      }

      const normalizedDay = normalizeDayAbbrev(day_name);

      let sessionQuery;
      if (session_date) {
        // Si se proporciona fecha específica, buscar por fecha exacta
        sessionQuery = await pool.query(
          `SELECT * FROM app.methodology_exercise_sessions
           WHERE user_id = $1 AND methodology_plan_id = $2
             AND session_date::date = $3::date
           ORDER BY created_at DESC
           LIMIT 1`,
          [userId, methodology_plan_id, session_date]
        );
      } else {
        // Buscar por week_number y day_name
        sessionQuery = await pool.query(
          `SELECT * FROM app.methodology_exercise_sessions
           WHERE user_id = $1 AND methodology_plan_id = $2
             AND week_number = $3 AND day_name = $4
           ORDER BY created_at DESC
           LIMIT 1`,
          [userId, methodology_plan_id, week_number, normalizedDay]
        );
      }

      if (sessionQuery.rowCount === 0) {
        return res.status(404).json({
          success: false,
          error: 'No hay sesión para este día'
        });
      }

      const session = sessionQuery.rows[0];

      // Obtener progreso de ejercicios con feedback
      const exercisesQuery = await pool.query(
        `SELECT
          p.exercise_order, p.exercise_name, p.series_total, p.series_completed,
          p.repeticiones, p.descanso_seg, p.intensidad, p.tempo, p.status,
          p.time_spent_seconds, p.notas, p.exercise_id,
          f.sentiment, f.comment
         FROM app.methodology_exercise_progress p
         LEFT JOIN app.methodology_exercise_feedback f
           ON p.methodology_session_id = f.methodology_session_id
           AND p.exercise_order = f.exercise_order
         WHERE p.methodology_session_id = $1
         ORDER BY p.exercise_order ASC`,
        [session.id]
      );

      // 🆕 Obtener datos de series (peso, reps, RIR) de hypertrophy_set_logs
      const setLogsQuery = await pool.query(
        `SELECT
          exercise_id,
          exercise_name,
          set_number,
          weight_used,
          reps_completed,
          rir_reported,
          estimated_1rm,
          rpe_calculated,
          volume_load,
          is_effective
         FROM app.hypertrophy_set_logs
         WHERE session_id = $1
         ORDER BY exercise_id, set_number ASC`,
        [session.id]
      );

      // Agrupar series por exercise_id
      const setLogsByExercise = {};
      setLogsQuery.rows.forEach(set => {
        if (!setLogsByExercise[set.exercise_id]) {
          setLogsByExercise[set.exercise_id] = [];
        }
        setLogsByExercise[set.exercise_id].push(set);
      });

      // Combinar datos de ejercicios con sus series
      const exercisesWithSets = exercisesQuery.rows.map(ex => ({
        ...ex,
        sets: setLogsByExercise[ex.exercise_id] || []
      }));

      // Calcular resumen
      const totalExercises = exercisesQuery.rowCount;
      const completedExercises = exercisesQuery.rows.filter(ex => ex.status === 'completed').length;
      const skippedExercises = exercisesQuery.rows.filter(ex => ex.status === 'skipped').length;

      // 🎯 LÓGICA INTELIGENTE: Misma que routines.js - Detectar progreso REAL
      const hasRealProgress = exercisesQuery.rows.some(ex => ex.status !== 'pending');

      let canResume;
      if (session.session_status === 'completed') {
        // Caso 1: Sesión completada → Mostrar resumen, no botones de inicio
        canResume = false;
      } else if (hasRealProgress) {
        // Caso 2: Usuario realmente empezó ejercicios → Reanudar
        canResume = true;
      } else {
        // Caso 3: Sesión creada pero sin progreso real → Comenzar
        canResume = false;
      }

      console.log(`🎯 trainingSession NUEVA LÓGICA INTELIGENTE:`, {
        session_status: session.session_status,
        hasRealProgress,
        canResume,
        decision: canResume ? 'REANUDAR ⚠️' : 'COMENZAR ✅'
      });

      // Calcular si puede reintentar ejercicios (skipped/cancelled)
      const cancelledExercises = exercisesQuery.rows.filter(ex => ex.status === 'cancelled').length;
      const canRetry = (skippedExercises > 0 || cancelledExercises > 0) && session.session_status === 'completed';

      res.json({
        success: true,
        session_type: 'methodology',
        session: {
          ...session,
          canResume
        },
        exercises: exercisesWithSets, // 🆕 Ahora incluye datos de series
        summary: {
          total: totalExercises,
          completed: completedExercises,
          skipped: skippedExercises,
          cancelled: cancelledExercises,
          pending: totalExercises - completedExercises - skippedExercises - cancelledExercises,
          isComplete: session.session_status === 'completed',
          canRetry  // ✅ NUEVO: Permite reintentar skipped/cancelled
        }
      });

    } else {
      // Para entrenamiento en casa, buscar la sesión activa más reciente
      const homeSessionQuery = await pool.query(
        `SELECT * FROM app.home_training_sessions
         WHERE user_id = $1 AND status = 'in_progress'
         ORDER BY started_at DESC
         LIMIT 1`,
        [userId]
      );

      if (homeSessionQuery.rowCount === 0) {
        return res.status(404).json({
          success: false,
          error: 'No hay sesión activa de entrenamiento en casa'
        });
      }

      const session = homeSessionQuery.rows[0];

      // Obtener progreso
      const progressQuery = await pool.query(
        `SELECT * FROM app.home_exercise_progress
         WHERE home_training_session_id = $1
         ORDER BY exercise_order`,
        [session.id]
      );

      const exercises = progressQuery.rows;
      const statusCounts = exercises.reduce((acc, ex) => {
        const s = String(ex.status || 'pending').toLowerCase();
        acc[s] = (acc[s] || 0) + 1;
        return acc;
      }, {});
      const total = exercises.length;
      const completed = statusCounts['completed'] || 0;
      const skipped = statusCounts['skipped'] || 0;
      const cancelled = statusCounts['cancelled'] || 0;
      const in_progress = statusCounts['in_progress'] || 0;
      const pending = statusCounts['pending'] || 0;

      const isFinished = total > 0 && pending === 0 && in_progress === 0;
      const isComplete = total > 0 && completed === total;
      const allSkipped = total > 0 && skipped === total;
      const allCancelled = total > 0 && cancelled === total;
      const hasAnyProgress = (in_progress > 0) || ((completed + skipped + cancelled) > 0);
      const canResume = !isFinished && hasAnyProgress;
      const canRetry = (allSkipped || allCancelled);

      res.json({
        success: true,
        session_type: 'home',
        session: {
          ...session,
          canResume
        },
        exercises,
        summary: {
          total,
          completed,
          skipped,
          cancelled,
          in_progress,
          pending,
          isFinished,
          isComplete,
          canRetry
        }
      });
    }

  } catch (error) {
    console.error('Error obteniendo estado de sesión del día:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});


// ===============================================
// GESTIÓN DE FEEDBACK
// ===============================================

/**
 * POST /api/training-session/feedback/exercise
 * Guardar feedback del usuario sobre un ejercicio
 */
router.post('/feedback/exercise', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = req.user?.userId || req.user?.id;
    const {
      sessionId,
      exerciseOrder,
      sentiment,
      comment,
      exerciseName,
      sessionType = 'methodology' // 'methodology' o 'home'
    } = req.body;

    // Validar parámetros
    if (!sessionId || exerciseOrder === undefined) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'sessionId y exerciseOrder son requeridos'
      });
    }

    if (!sentiment || !['like', 'dislike', 'hard'].includes(sentiment)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'sentiment es requerido y debe ser: like, dislike, hard'
      });
    }

    if (sessionType === 'methodology') {
      // Verificar que la sesión pertenece al usuario
      const sessionCheck = await client.query(
        'SELECT id FROM app.methodology_exercise_sessions WHERE id = $1 AND user_id = $2',
        [sessionId, userId]
      );

      if (sessionCheck.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'Sesión no encontrada'
        });
      }

      // Insertar o actualizar feedback
      const upsertResult = await client.query(
        `INSERT INTO app.methodology_exercise_feedback (
          methodology_session_id, user_id, exercise_name, exercise_order, sentiment, comment, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (methodology_session_id, exercise_order)
        DO UPDATE SET
          sentiment = EXCLUDED.sentiment,
          comment = EXCLUDED.comment,
          updated_at = NOW()
        RETURNING id, sentiment, comment`,
        [sessionId, userId, exerciseName, parseInt(exerciseOrder), sentiment, comment || null]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        feedback: upsertResult.rows[0],
        message: 'Feedback guardado correctamente'
      });

    } else if (sessionType === 'home') {
      // Buscar nombre del ejercicio si no llega por body
      let exName = exerciseName;
      let exKey = null;

      if (!exName) {
        const q = await client.query(
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

      await client.query(
        `INSERT INTO app.user_exercise_feedback
         (user_id, session_id, exercise_order, exercise_name, exercise_key, sentiment, comment)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [userId, sessionId, exerciseOrder, exName, exKey, sentiment, comment || null]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Feedback guardado correctamente'
      });
    }

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error guardando feedback de ejercicio:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  } finally {
    client.release();
  }
});


// ===============================================
// GESTIÓN DE TIEMPO DE CALENTAMIENTO
// ===============================================

/**
 * PUT /api/training-session/warmup-time/:sessionId
 * Actualizar tiempo de calentamiento de una sesión
 */
router.put('/warmup-time/:sessionId', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.userId || req.user?.id;
    const { sessionId } = req.params;
    const { warmup_time_seconds, session_type = 'methodology' } = req.body;

    // Validar entrada
    if (!sessionId || warmup_time_seconds === undefined) {
      return res.status(400).json({
        success: false,
        error: 'sessionId y warmup_time_seconds son requeridos'
      });
    }

    if (session_type === 'methodology') {
      // Verificar que la sesión existe y pertenece al usuario
      const sessionCheck = await client.query(`
        SELECT id, methodology_plan_id, user_id, status, warmup_time_seconds
        FROM app.methodology_exercise_sessions
        WHERE id = $1 AND user_id = $2
      `, [sessionId, userId]);

      if (sessionCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Sesión no encontrada o no autorizada'
        });
      }

      const session = sessionCheck.rows[0];

      // Solo permitir actualizar sesiones activas
      if (session.status === 'completed') {
        return res.status(400).json({
          success: false,
          error: 'No se puede actualizar tiempo de warmup en sesión completada'
        });
      }

      // Actualizar tiempo de calentamiento
      const updateResult = await client.query(`
        UPDATE app.methodology_exercise_sessions
        SET
          warmup_time_seconds = $1,
          updated_at = NOW()
        WHERE id = $2 AND user_id = $3
        RETURNING warmup_time_seconds, total_duration_seconds
      `, [warmup_time_seconds, sessionId, userId]);

      if (updateResult.rows.length === 0) {
        return res.status(500).json({
          success: false,
          error: 'No se pudo actualizar el tiempo de calentamiento'
        });
      }

      const updated = updateResult.rows[0];

      console.log(`✅ Tiempo de calentamiento actualizado para sesión ${sessionId}: ${warmup_time_seconds}s`);

      res.json({
        success: true,
        message: 'Tiempo de calentamiento actualizado correctamente',
        data: {
          sessionId: parseInt(sessionId),
          warmup_time_seconds: updated.warmup_time_seconds,
          total_duration_seconds: updated.total_duration_seconds
        }
      });

    } else {
      // Para entrenamiento en casa, podríamos agregar un campo similar si es necesario
      return res.status(400).json({
        success: false,
        error: 'Tiempo de calentamiento no disponible para sesiones de entrenamiento en casa'
      });
    }

  } catch (error) {
    console.error('Error actualizando tiempo de calentamiento:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  } finally {
    client.release();
  }
});


// ===============================================
// GESTIÓN DE SESIONES ABANDONADAS
// ===============================================

/**
 * POST /api/training-session/handle-abandon/:sessionId
 * Manejar abandono de sesión (guardar progreso parcial)
 */
router.post('/handle-abandon/:sessionId', authenticateToken, async (req, res) => {
  const { sessionId } = req.params;
  const { currentProgress, reason, session_type = 'home' } = req.body;
  const user_id = req.user.userId || req.user.id;

  console.log(`🚪 Usuario ${user_id} abandonando sesión ${sessionId}, motivo: ${reason}`);

  try {
    if (session_type === 'home') {
      // Verificar que la sesión pertenece al usuario
      const sessionCheck = await pool.query(
        'SELECT * FROM app.home_training_sessions WHERE id = $1 AND user_id = $2',
        [sessionId, user_id]
      );

      if (sessionCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Sesión no encontrada' });
      }

      // Guardar progreso actual si se proporciona
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

      // Verificar progreso para determinar el status final
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

      // Determinar status final:
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

      // Marcar abandono y actualizar status
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

      return res.json({
        success: true,
        message: 'Progreso guardado antes de abandono',
        finalStatus: finalStatus,
        progress: {
          total: parseInt(total_exercises),
          finished: parseInt(finished_exercises),
          canResume: finalStatus === 'in_progress'
        }
      });
    }

    res.json({ success: true, message: 'Progreso guardado antes de abandono' });

  } catch (error) {
    console.error('❌ Error manejando abandono:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


/**
 * POST /api/training-session/cleanup-stale
 * Limpia sesiones abandonadas/huérfanas del usuario
 * Útil para llamar antes de crear un nuevo entrenamiento
 */
router.post('/cleanup-stale', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    
    // Importar dinámicamente el servicio de limpieza
    const { cleanupUserStaleSessions, checkUserPendingSessions } = await import('../services/sessionCleanupService.js');
    
    // Verificar estado antes de limpiar
    const beforeStatus = await checkUserPendingSessions(userId);
    
    // Ejecutar limpieza
    const cleanupResult = await cleanupUserStaleSessions(userId);
    
    // Verificar estado después
    const afterStatus = await checkUserPendingSessions(userId);
    
    res.json({
      success: cleanupResult.success,
      message: `Limpieza completada: ${cleanupResult.cleaned || 0} sesiones procesadas`,
      before: beforeStatus,
      after: afterStatus,
      details: cleanupResult.details
    });
    
  } catch (error) {
    console.error('❌ Error en cleanup-stale:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


/**
 * GET /api/training-session/pending-sessions
 * Obtiene las sesiones pendientes/incompletas del usuario
 */
router.get('/pending-sessions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    
    const { checkUserPendingSessions } = await import('../services/sessionCleanupService.js');
    const result = await checkUserPendingSessions(userId);
    
    res.json(result);
    
  } catch (error) {
    console.error('❌ Error obteniendo sesiones pendientes:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


/**
 * PUT /api/training-session/close-active
 * Cerrar sesiones activas del usuario
 */
router.put('/close-active', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.userId || req.user.id;
    const { session_type = 'all' } = req.body;

    let totalClosed = 0;

    if (session_type === 'home' || session_type === 'all') {
      // Cerrar sesiones de entrenamiento en casa
      const homeResult = await pool.query(
        `UPDATE app.home_training_sessions
         SET status = 'cancelled',
             completed_at = NOW(),
             updated_at = NOW()
         WHERE user_id = $1 AND status = 'in_progress'
         RETURNING id`,
        [user_id]
      );
      totalClosed += homeResult.rows.length;
    }

    if (session_type === 'methodology' || session_type === 'all') {
      // Cerrar sesiones de metodología
      const methodologyResult = await pool.query(
        `UPDATE app.methodology_exercise_sessions
         SET session_status = 'cancelled',
             updated_at = NOW()
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
    res.status(500).json({
      success: false,
      message: 'Error al cerrar sesiones activas'
    });
  }
});


/**
 * GET /api/training-session/weekend-status
 * Obtiene el estado de sesión de fin de semana del día actual
 */
router.get('/weekend-status', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.userId || req.user?.id;

    // Buscar sesiones de fin de semana del día actual
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const sessionQuery = `
      SELECT
        mes.id,
        mes.methodology_plan_id,
        mes.session_status,
        mes.session_type,
        mes.exercises_completed,
        mes.exercises_skipped,
        mes.exercises_cancelled,
        mes.total_exercises,
        mes.exercises_data,
        mes.session_metadata,
        mes.started_at,
        mes.completed_at
      FROM app.methodology_exercise_sessions mes
      WHERE mes.user_id = $1
        AND mes.session_type = 'weekend-extra'
        AND mes.session_date >= $2
        AND mes.session_date < $3
      ORDER BY mes.id DESC
      LIMIT 1
    `;

    const sessionResult = await client.query(sessionQuery, [userId, today, tomorrow]);

    if (sessionResult.rows.length === 0) {
      return res.json({
        success: true,
        hasWeekendSession: false,
        message: 'No hay sesión de fin de semana para hoy'
      });
    }

    const session = sessionResult.rows[0];

    // Obtener el detalle de los ejercicios CON FEEDBACK
    const exercisesQuery = `
      SELECT
        est.exercise_order,
        est.exercise_name,
        est.status,
        est.exercise_data,
        est.actual_sets,
        est.planned_sets,
        est.actual_reps,
        est.planned_reps,
        est.completed_at,
        f.sentiment,
        f.comment
      FROM app.exercise_session_tracking est
      LEFT JOIN app.methodology_exercise_feedback f
        ON est.methodology_session_id = f.methodology_session_id
        AND est.exercise_order = f.exercise_order
      WHERE est.methodology_session_id = $1
      ORDER BY est.exercise_order
    `;

    const exercisesResult = await client.query(exercisesQuery, [session.id]);

    // 🎯 CORRECCIÓN: Calcular resumen directamente desde los ejercicios para evitar datos cacheados desactualizados
    const total = exercisesResult.rows.length;
    const completed = exercisesResult.rows.filter(ex => String(ex.status).toLowerCase() === 'completed').length;
    const skipped = exercisesResult.rows.filter(ex => String(ex.status).toLowerCase() === 'skipped').length;
    const cancelled = exercisesResult.rows.filter(ex => String(ex.status).toLowerCase() === 'cancelled').length;
    // 🎯 CORRECCIÓN: El progreso debe ser solo basado en ejercicios COMPLETADOS
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    console.log('📊 Weekend Status - Contadores calculados:', {
      sessionId: session.id,
      total,
      completed,
      skipped,
      cancelled,
      exercises: exercisesResult.rows.map(ex => ({
        order: ex.exercise_order,
        name: ex.exercise_name,
        status: ex.status
      }))
    });

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
      summary: {
        completed,
        skipped,
        cancelled,
        total,
        pending: total - (completed + skipped + cancelled),
        progress,
        // 🎯 CORRECCIÓN: canRetry debe ser true si hay ejercicios pendientes (no completados)
        // Permite reanudar incluso si algunos fueron saltados/cancelados
        canRetry: completed < total && total > 0,
        isCompleted: session.session_status === 'completed'
      }
    });

  } catch (error) {
    console.error('Error obteniendo estado de sesión de fin de semana:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener estado de sesión'
    });
  } finally {
    client.release();
  }
});

export default router;
