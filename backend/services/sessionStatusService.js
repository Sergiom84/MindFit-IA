/**
 * 🎯 SessionStatusService - Servicio Centralizado de Estados de Sesión
 * 
 * Este servicio centraliza TODA la lógica de transiciones de estado de sesiones.
 * Elimina la duplicación de código entre trainingSession.js y routines.js
 * 
 * Estados posibles:
 * - pending: Sesión creada pero no iniciada
 * - in_progress: Usuario ha empezado a entrenar
 * - completed: Todos los ejercicios completados
 * - partial: Algunos ejercicios completados, otros saltados/cancelados
 * - skipped: Sesión saltada completamente
 * - cancelled: Sesión cancelada por el usuario
 * - abandoned: Sesión abandonada (timeout automático)
 * - incomplete: Finalizada sin ejercicios completados
 * 
 * @module services/sessionStatusService
 */

import { pool } from '../db.js';

// Re-exportar constantes desde el archivo sin dependencias de DB
// Esto permite que otros módulos importen todo desde aquí
export { 
  SESSION_STATES, 
  TERMINAL_STATES, 
  RESUMABLE_STATES,
  calculateSessionStatus,
  canResumeSession,
  isSessionTerminal
} from './sessionStateConstants.js';

// Importar también para uso interno en este archivo
import { 
  SESSION_STATES, 
  TERMINAL_STATES, 
  RESUMABLE_STATES,
  calculateSessionStatus,
  canResumeSession,
  isSessionTerminal
} from './sessionStateConstants.js';

/**
 * Actualiza el estado de una sesión de metodología en la base de datos
 * @param {number} sessionId - ID de la sesión
 * @param {number} userId - ID del usuario (para validación)
 * @param {object} client - Cliente de BD (opcional, para transacciones)
 * @returns {Promise<object>} Resultado de la actualización
 */
export async function updateMethodologySessionStatus(sessionId, userId, client = null) {
  const dbClient = client || pool;
  
  try {
    // Obtener ejercicios de la sesión
    const exercisesResult = await dbClient.query(`
      SELECT exercise_order, status, series_completed, series_total
      FROM app.methodology_exercise_progress
      WHERE methodology_session_id = $1
      ORDER BY exercise_order
    `, [sessionId]);

    // Calcular nuevo estado
    const { status, completionRate, metrics } = calculateSessionStatus(exercisesResult.rows);

    // Actualizar sesión
    const updateResult = await dbClient.query(`
      UPDATE app.methodology_exercise_sessions
      SET 
        session_status = $2,
        exercises_completed = $3,
        exercises_skipped = $4,
        exercises_cancelled = $5,
        total_exercises = $6,
        completion_rate = $7,
        updated_at = NOW(),
        completed_at = CASE 
          WHEN $2 IN ('completed', 'partial', 'skipped', 'cancelled', 'incomplete', 'abandoned') 
          THEN COALESCE(completed_at, NOW()) 
          ELSE completed_at 
        END
      WHERE id = $1 AND user_id = $8
      RETURNING *
    `, [
      sessionId,
      status,
      metrics.completed,
      metrics.skipped,
      metrics.cancelled,
      metrics.total,
      completionRate,
      userId
    ]);

    if (updateResult.rowCount === 0) {
      return {
        success: false,
        error: 'Sesión no encontrada o no autorizada'
      };
    }

    console.log(`📊 [SessionStatus] Sesión ${sessionId} actualizada: ${status} (${completionRate}%)`);

    return {
      success: true,
      session: updateResult.rows[0],
      status,
      completionRate,
      metrics
    };

  } catch (error) {
    console.error('❌ [SessionStatus] Error actualizando estado:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Marca una sesión como iniciada
 * @param {number} sessionId - ID de la sesión
 * @param {number} userId - ID del usuario
 * @param {object} client - Cliente de BD opcional
 * @returns {Promise<object>}
 */
export async function markSessionStarted(sessionId, userId, client = null) {
  const dbClient = client || pool;
  
  try {
    const result = await dbClient.query(`
      UPDATE app.methodology_exercise_sessions
      SET 
        session_status = CASE 
          WHEN session_status IN ('pending', 'in_progress') THEN 'in_progress'
          ELSE session_status 
        END,
        started_at = COALESCE(started_at, NOW()),
        updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING id, session_status, started_at
    `, [sessionId, userId]);

    if (result.rowCount === 0) {
      return { success: false, error: 'Sesión no encontrada' };
    }

    const session = result.rows[0];
    console.log(`▶️ [SessionStatus] Sesión ${sessionId} marcada como iniciada`);

    return {
      success: true,
      session,
      wasAlreadyStarted: session.started_at !== null
    };

  } catch (error) {
    console.error('❌ [SessionStatus] Error marcando inicio:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Finaliza una sesión calculando el estado final
 * @param {number} sessionId - ID de la sesión
 * @param {number} userId - ID del usuario
 * @param {string} outcome - 'auto' | 'skip_remaining' | 'cancel_remaining'
 * @param {object} client - Cliente de BD opcional
 * @returns {Promise<object>}
 */
export async function finalizeSession(sessionId, userId, outcome = 'auto', client = null) {
  const dbClient = client || pool;
  
  try {
    // Si se especifica outcome, actualizar ejercicios pendientes primero
    if (outcome === 'skip_remaining') {
      await dbClient.query(`
        UPDATE app.methodology_exercise_progress
        SET status = 'skipped', completed_at = NOW()
        WHERE methodology_session_id = $1
          AND status NOT IN ('completed', 'skipped')
      `, [sessionId]);
    } else if (outcome === 'cancel_remaining') {
      await dbClient.query(`
        UPDATE app.methodology_exercise_progress
        SET status = 'cancelled', completed_at = NOW()
        WHERE methodology_session_id = $1
          AND status NOT IN ('completed', 'cancelled')
      `, [sessionId]);
    }

    // Actualizar y calcular estado final
    const result = await updateMethodologySessionStatus(sessionId, userId, dbClient);

    if (!result.success) {
      return result;
    }

    // Calcular duración total
    await dbClient.query(`
      UPDATE app.methodology_exercise_sessions
      SET total_duration_seconds = CASE 
        WHEN started_at IS NOT NULL 
        THEN EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
        ELSE total_duration_seconds
      END
      WHERE id = $1
    `, [sessionId]);

    console.log(`🏁 [SessionStatus] Sesión ${sessionId} finalizada: ${result.status}`);

    return {
      success: true,
      ...result
    };

  } catch (error) {
    console.error('❌ [SessionStatus] Error finalizando sesión:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Obtiene el estado actual de una sesión con sus métricas
 * @param {number} sessionId - ID de la sesión
 * @param {number} userId - ID del usuario
 * @returns {Promise<object>}
 */
export async function getSessionStatus(sessionId, userId) {
  try {
    // Obtener sesión
    const sessionResult = await pool.query(`
      SELECT * FROM app.methodology_exercise_sessions
      WHERE id = $1 AND user_id = $2
    `, [sessionId, userId]);

    if (sessionResult.rowCount === 0) {
      return { success: false, error: 'Sesión no encontrada' };
    }

    const session = sessionResult.rows[0];

    // Obtener ejercicios
    const exercisesResult = await pool.query(`
      SELECT 
        exercise_order, exercise_name, status, 
        series_completed, series_total, time_spent_seconds
      FROM app.methodology_exercise_progress
      WHERE methodology_session_id = $1
      ORDER BY exercise_order
    `, [sessionId]);

    // Calcular métricas actualizadas
    const { status, completionRate, metrics } = calculateSessionStatus(exercisesResult.rows);

    return {
      success: true,
      session: {
        ...session,
        calculatedStatus: status // El estado calculado puede diferir del guardado
      },
      exercises: exercisesResult.rows,
      metrics,
      completionRate,
      canResume: canResumeSession(status, metrics),
      isTerminal: isSessionTerminal(status)
    };

  } catch (error) {
    console.error('❌ [SessionStatus] Error obteniendo estado:', error);
    return { success: false, error: error.message };
  }
}

// Exportación por defecto
export default {
  SESSION_STATES,
  TERMINAL_STATES,
  RESUMABLE_STATES,
  calculateSessionStatus,
  canResumeSession,
  isSessionTerminal,
  updateMethodologySessionStatus,
  markSessionStarted,
  finalizeSession,
  getSessionStatus
};
