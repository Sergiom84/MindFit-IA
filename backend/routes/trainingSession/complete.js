/**
 * Rutas de training-session - dominio: complete (extraidas del monolito).
 */

import express from 'express';
import authenticateToken from '../../middleware/auth.js';
import {
  pool
} from '../../db.js';
import {
  finalizePlanIfCompleted
} from '../../services/methodologyPlansService.js';
import {
  calculateSessionStatus,
  SESSION_STATES
} from '../../services/sessionStatusService.js';
import {
  transition,
  SESSION_ACTIONS,
  createSessionContext
} from '../../services/sessionStateMachine.js';
import { normalizeMethodologyId } from '../../services/routineGeneration/methodologies/methodologyRegistry.js';
import { buildActualSessionLoad } from '../../services/trainingLoad/actualLoadBuilder.js';
import {
  buildSessionCompletedEvent,
  enqueueEvent
} from '../../services/bridgeEventOutboxService.js';

const router = express.Router();

/**
 * PR5 (Nutrición Fase 0, spec §13.1): encola el evento `training.session_completed` en el
 * outbox DENTRO de la transacción del cierre, ANTES del COMMIT y SIN alterar su orden.
 *
 * Trade-off resuelto (encargo PR5, punto 2): un fallo del INSERT dentro de una transacción
 * Postgres la deja ABORTADA ("current transaction is aborted") y un simple try/catch en JS
 * NO permitiría que el COMMIT posterior tuviera éxito. Por eso se envuelve el INSERT en un
 * SAVEPOINT: si falla, se hace ROLLBACK TO SAVEPOINT y la transacción del cierre sigue
 * siendo confirmable → la sesión queda completada aunque Nutrición/el outbox fallen (§9.5).
 * La construcción del payload es JS puro (no toca la BD) y no puede envenenar la transacción.
 */
async function safeEnqueueSessionCompleted(client, params) {
  try {
    const {
      userId, sessionId, session, exerciseRows = [],
      finalStatus, completionRate, keyNamespace = null
    } = params;

    const meta = (session && typeof session.session_metadata === 'object' && session.session_metadata)
      ? session.session_metadata
      : {};
    const plannedLoad = meta.planned_session_load ?? null;
    const methodologyId = normalizeMethodologyId(session?.methodology_type)
      || (keyNamespace === 'home' ? 'casa' : null);
    const methodologyLevel = plannedLoad?.methodology_level
      ?? meta.methodology_level
      ?? null;

    // Duración real: total_duration_seconds si existe, si no NOW - started_at (misma lógica
    // que el UPDATE del cierre); nunca se inventan minutos (§13.3).
    let durationSeconds = Number.isFinite(Number(session?.total_duration_seconds))
      ? Number(session.total_duration_seconds)
      : null;
    if (durationSeconds === null && session?.started_at) {
      const started = new Date(session.started_at).getTime();
      if (Number.isFinite(started)) durationSeconds = Math.round((Date.now() - started) / 1000);
    }

    const actualLoad = buildActualSessionLoad({
      plannedLoad,
      methodologyId,
      methodologyLevel,
      durationSeconds,
      exerciseRows
    });

    const event = buildSessionCompletedEvent({
      sessionId,
      userId,
      methodologyPlanId: session?.methodology_plan_id ?? null,
      methodologyId,
      methodologyLevel,
      completedAt: new Date().toISOString(),
      finalStatus,
      completionRate,
      plannedSessionLoad: plannedLoad,
      actualSessionLoad: actualLoad,
      keyNamespace
    });

    // SAVEPOINT: aísla el INSERT para que su fallo no aborte el cierre de sesión.
    await client.query('SAVEPOINT pr5_outbox');
    try {
      await enqueueEvent(client, event);
      await client.query('RELEASE SAVEPOINT pr5_outbox');
      return { enqueued: true };
    } catch (dbErr) {
      await client.query('ROLLBACK TO SAVEPOINT pr5_outbox');
      console.error('⚠️ [PR5] No se pudo encolar el evento de cierre (se degrada a log; la sesión queda completada):', dbErr?.message || dbErr);
      return { enqueued: false, error: dbErr?.message || String(dbErr) };
    }
  } catch (buildErr) {
    // Un fallo en la construcción (JS puro) tampoco debe tumbar el cierre.
    console.error('⚠️ [PR5] No se pudo construir el evento de cierre (se omite):', buildErr?.message || buildErr);
    return { enqueued: false, error: buildErr?.message || String(buildErr) };
  }
}


// ===============================================
// FINALIZACIÓN DE SESIONES
// ===============================================

/**
 * POST /api/training-session/complete/methodology/:sessionId
 * Finalizar sesión de metodología
 */
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
    const { status: calculatedStatus, completionRate, metrics } = calculateSessionStatus(exercisesQuery.rows);

    const totalExercises = metrics.total;
    const completedExercises = metrics.completed;
    const skippedExercises = metrics.skipped;
    const cancelledExercises = metrics.cancelled;

    // 🔄 Validar transición de estado usando la máquina de estados
    const currentStatus = ses.rows[0].session_status || SESSION_STATES.IN_PROGRESS;
    const sessionContext = createSessionContext(ses.rows[0], exercisesQuery.rows);
    const transitionResult = transition(currentStatus, SESSION_ACTIONS.FINISH, sessionContext);
    
    // Determinar el estado final - usar el calculado si la transición es válida
    const finalSessionStatus = transitionResult.success 
      ? transitionResult.newState 
      : calculatedStatus;
    
    if (!transitionResult.success) {
      console.warn(`⚠️ [StateMachine] Transición al finalizar: ${transitionResult.error}. Usando estado calculado: ${calculatedStatus}`);
    } else {
      console.log(`🔄 [StateMachine] Transición exitosa: ${currentStatus} → ${finalSessionStatus}`);
    }

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
      [sessionId, finalSessionStatus, completedExercises, skippedExercises, cancelledExercises, totalExercises, completionRate]
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

    // Registrar feedback opcional
    if (Array.isArray(feedback) && feedback.length > 0) {
      for (const entry of feedback) {
        if (!entry) continue;
        const allowedTypes = ['skipped','cancelled','missed'];
        const allowedReasons = ['dificil','no_se_ejecutar','lesion','equipamiento','cansancio','tiempo','motivacion','auto_missed','otros'];
        const feedbackType = allowedTypes.includes(entry.feedback_type) ? entry.feedback_type : 'cancelled';
        const reasonCode = allowedReasons.includes(entry.reason_code) ? entry.reason_code : 'otros';

        await client.query(
          `INSERT INTO app.methodology_session_feedback (
            user_id, methodology_plan_id, methodology_session_id,
            exercise_order, exercise_name, feedback_type, reason_code, reason_text,
            difficulty_rating, would_retry, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT DO NOTHING`,
          [
            userId,
            ses.rows[0].methodology_plan_id,
            sessionId,
            entry.exercise_order ?? null,
            entry.exercise_name ?? null,
            feedbackType,
            reasonCode,
            entry.reason_text || null,
            entry.difficulty_rating ?? null,
            entry.would_retry ?? false
          ]
        );
      }
    }

    await finalizePlanIfCompleted(ses.rows[0].methodology_plan_id, client);

    // PR5 (spec §13.1/§13.2): encolar evento de cierre en el MISMO tx, ANTES del COMMIT.
    // Aditivo e idempotente (event_key por sessionId → doble POST = un solo evento).
    await safeEnqueueSessionCompleted(client, {
      userId,
      sessionId,
      session: ses.rows[0],
      exerciseRows: exercisesQuery.rows,
      finalStatus: finalSessionStatus,
      completionRate
    });

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Sesión finalizada y datos guardados en historial',
      summary: {
        status: finalSessionStatus,
        completionRate,
        totalExercises,
        completedExercises,
        skippedExercises,
        cancelledExercises,
        stateTransition: {
          from: currentStatus,
          to: finalSessionStatus,
          valid: transitionResult.success
        }
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


/**
 * POST /api/training-session/complete/home/:sessionId
 * Finalizar sesión de entrenamiento en casa
 */
router.post('/complete/home/:sessionId', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { sessionId } = req.params;
    const user_id = req.user.userId || req.user.id;

    // Verificar que la sesión existe y pertenece al usuario
    const sessionCheck = await client.query(
      'SELECT * FROM app.home_training_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, user_id]
    );

    if (sessionCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Sesión no encontrada'
      });
    }

    // Actualizar estado de la sesión a completada
    await client.query(
      `UPDATE app.home_training_sessions
       SET status = 'completed',
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [sessionId]
    );

    // Obtener resumen de la sesión
    const summaryResult = await client.query(
      `SELECT
         COUNT(*) as total_exercises,
         COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_exercises,
         SUM(COALESCE(duration_seconds, 0)) as total_duration
       FROM app.home_exercise_progress
       WHERE home_training_session_id = $1`,
      [sessionId]
    );

    const summary = summaryResult.rows[0];

    // PR5 (spec §13.6): la sesión de Casa emite el MISMO evento con methodology_id 'casa'
    // (nunca 'general' ni Hipertrofia). event_key namespaceado con `:home:` para no colisionar
    // con ids de sesiones de metodología. Adaptador mínimo: Casa no transporta carga planificada
    // ni RPE, así que la carga real se construye a baja confianza desde duración y series.
    const homeProgress = await client.query(
      `SELECT series_completed FROM app.home_exercise_progress
       WHERE home_training_session_id = $1`,
      [sessionId]
    );
    const totalDurationSeconds = Number.isFinite(Number(summary.total_duration))
      ? Number(summary.total_duration)
      : null;
    const completedCount = parseInt(summary.completed_exercises) || 0;
    const totalCount = parseInt(summary.total_exercises) || 0;
    await safeEnqueueSessionCompleted(client, {
      userId: user_id,
      sessionId,
      session: {
        ...sessionCheck.rows[0],
        methodology_type: 'casa',
        total_duration_seconds: totalDurationSeconds
      },
      exerciseRows: homeProgress.rows,
      finalStatus: 'completed',
      completionRate: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
      keyNamespace: 'home'
    });

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
    res.status(500).json({
      success: false,
      message: 'Error al completar la sesión'
    });
  } finally {
    client.release();
  }
});


// DELETE /api/training-session/cancel/methodology/:sessionId
// Cancelar sesión de metodología (incluyendo sesiones weekend)
router.delete('/cancel/methodology/:sessionId', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = req.user?.userId || req.user?.id;
    const { sessionId } = req.params;

    console.log(`🗑️ Cancelando sesión metodología ${sessionId} para usuario ${userId}`);

    // Verificar que la sesión pertenece al usuario
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

    // 🗑️ ELIMINAR ejercicios de la sesión
    const deleteExercisesResult = await client.query(
      `DELETE FROM app.exercise_session_tracking
       WHERE methodology_session_id = $1`,
      [sessionId]
    );
    console.log(`🗑️ ${deleteExercisesResult.rowCount} ejercicios eliminados de sesión ${sessionId}`);

    // 🗑️ ELIMINAR la sesión
    await client.query(
      `DELETE FROM app.methodology_exercise_sessions
       WHERE id = $1`,
      [sessionId]
    );
    console.log(`🗑️ Sesión ${sessionId} eliminada`);

    // 🗑️ Si es sesión weekend, también ELIMINAR el plan
    if (isWeekend && session.methodology_plan_id) {
      const deletePlanResult = await client.query(
        `DELETE FROM app.methodology_plans
         WHERE id = $1`,
        [session.methodology_plan_id]
      );
      console.log(`🗑️ Plan weekend ${session.methodology_plan_id} eliminado (${deletePlanResult.rowCount} filas)`);
    }

    await client.query('COMMIT');

    console.log(`✅ Sesión ${sessionId} cancelada exitosamente`);

    res.json({
      success: true,
      message: isWeekend
        ? 'Entrenamiento de fin de semana cancelado'
        : 'Sesión de entrenamiento cancelada'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error cancelando sesión:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cancelar la sesión'
    });
  } finally {
    client.release();
  }
});

export default router;
