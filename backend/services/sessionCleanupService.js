/**
 * Servicio de Limpieza de Sesiones Abandonadas/Huérfanas
 * 
 * Resuelve el problema de sesiones que quedan en estado 'in_progress' o 'pending'
 * cuando el usuario cierra la app sin completar el entrenamiento.
 * 
 * @module services/sessionCleanupService
 */

import { pool } from '../db.js';

// Configuración de tiempos de expiración
const STALE_SESSION_HOURS = 6;      // Sesiones 'in_progress' sin actividad
const DRAFT_PLAN_HOURS = 1;         // Planes 'draft' sin confirmar
const ABANDONED_SESSION_HOURS = 24; // Para marcar como 'abandoned' en vez de 'cancelled'

/**
 * Limpia sesiones en estado 'in_progress' que llevan más de X horas sin actividad
 * @param {number} userId - ID del usuario (opcional, si no se pasa limpia todas)
 * @param {object} client - Cliente de transacción (opcional)
 * @returns {Promise<object>} Resultado de la limpieza
 */
export async function cleanupStaleSessions(userId = null, client = null) {
  const dbClient = client || pool;
  const results = {
    methodology: { cancelled: 0, abandoned: 0 },
    home: { cancelled: 0, abandoned: 0 },
    drafts: 0,
    errors: []
  };

  try {
    console.log(`🧹 [CLEANUP] Iniciando limpieza de sesiones${userId ? ` para usuario ${userId}` : ' globales'}...`);

    // 1. Cancelar sesiones de metodología 'in_progress' de más de 6 horas
    const methodologyStaleQuery = `
      UPDATE app.methodology_exercise_sessions
      SET session_status = CASE 
            WHEN started_at < NOW() - INTERVAL '${ABANDONED_SESSION_HOURS} hours' THEN 'abandoned'
            ELSE 'cancelled'
          END,
          completed_at = NOW(),
          updated_at = NOW()
      WHERE session_status = 'in_progress'
        AND started_at < NOW() - INTERVAL '${STALE_SESSION_HOURS} hours'
        ${userId ? 'AND user_id = $1' : ''}
      RETURNING id, user_id, session_status, started_at
    `;
    
    const methodologyResult = await dbClient.query(
      methodologyStaleQuery,
      userId ? [userId] : []
    );

    if (methodologyResult.rowCount > 0) {
      results.methodology.cancelled = methodologyResult.rows.filter(r => r.session_status === 'cancelled').length;
      results.methodology.abandoned = methodologyResult.rows.filter(r => r.session_status === 'abandoned').length;
      
      console.log(`📋 [CLEANUP] Sesiones metodología cerradas: ${methodologyResult.rowCount}`);
      methodologyResult.rows.forEach(row => {
        const ageHours = Math.round((Date.now() - new Date(row.started_at).getTime()) / (1000 * 60 * 60));
        console.log(`   - Sesión ${row.id}: ${row.session_status} (${ageHours}h sin actividad)`);
      });
    }

    // 2. Cancelar sesiones de home training 'in_progress' de más de 6 horas
    const homeStaleQuery = `
      UPDATE app.home_training_sessions
      SET status = CASE 
            WHEN started_at < NOW() - INTERVAL '${ABANDONED_SESSION_HOURS} hours' THEN 'abandoned'
            ELSE 'cancelled'
          END,
          completed_at = NOW(),
          updated_at = NOW()
      WHERE status = 'in_progress'
        AND started_at < NOW() - INTERVAL '${STALE_SESSION_HOURS} hours'
        ${userId ? 'AND user_id = $1' : ''}
      RETURNING id, user_id, status, started_at
    `;

    const homeResult = await dbClient.query(
      homeStaleQuery,
      userId ? [userId] : []
    );

    if (homeResult.rowCount > 0) {
      results.home.cancelled = homeResult.rows.filter(r => r.status === 'cancelled').length;
      results.home.abandoned = homeResult.rows.filter(r => r.status === 'abandoned').length;
      
      console.log(`🏠 [CLEANUP] Sesiones home cerradas: ${homeResult.rowCount}`);
    }

    // 3. Eliminar planes 'draft' de más de 1 hora
    const draftQuery = `
      DELETE FROM app.methodology_plans
      WHERE status = 'draft'
        AND created_at < NOW() - INTERVAL '${DRAFT_PLAN_HOURS} hour'
        ${userId ? 'AND user_id = $1' : ''}
      RETURNING id, user_id, methodology_type
    `;

    const draftResult = await dbClient.query(
      draftQuery,
      userId ? [userId] : []
    );

    results.drafts = draftResult.rowCount;
    if (draftResult.rowCount > 0) {
      console.log(`📝 [CLEANUP] Drafts eliminados: ${draftResult.rowCount}`);
      draftResult.rows.forEach(row => {
        console.log(`   - Plan ${row.id} (${row.methodology_type})`);
      });
    }

    const totalCleaned = 
      results.methodology.cancelled + results.methodology.abandoned +
      results.home.cancelled + results.home.abandoned +
      results.drafts;

    console.log(`✅ [CLEANUP] Limpieza completada. Total items procesados: ${totalCleaned}`);

    return {
      success: true,
      cleaned: totalCleaned,
      details: results
    };

  } catch (error) {
    console.error('❌ [CLEANUP] Error en limpieza:', error);
    results.errors.push(error.message);
    return {
      success: false,
      error: error.message,
      details: results
    };
  }
}

/**
 * Limpia SOLO sesiones del usuario actual antes de crear una nueva
 * Útil para llamar desde el frontend antes de generar un entrenamiento
 * 
 * @param {number} userId - ID del usuario
 * @param {object} client - Cliente de transacción (opcional)
 * @returns {Promise<object>} Resultado de la limpieza
 */
export async function cleanupUserStaleSessions(userId, client = null) {
  if (!userId) {
    return { success: false, error: 'userId es requerido' };
  }
  return cleanupStaleSessions(userId, client);
}

/**
 * Verifica si el usuario tiene sesiones pendientes/incompletas
 * @param {number} userId - ID del usuario
 * @returns {Promise<object>} Estado de sesiones del usuario
 */
export async function checkUserPendingSessions(userId) {
  try {
    // Sesiones de metodología incompletas
    const methodologyPending = await pool.query(`
      SELECT 
        id, methodology_plan_id, session_name, session_status, 
        started_at, day_name, week_number,
        EXTRACT(EPOCH FROM (NOW() - started_at))/3600 as hours_since_start
      FROM app.methodology_exercise_sessions
      WHERE user_id = $1 
        AND session_status IN ('in_progress', 'pending')
      ORDER BY started_at DESC
      LIMIT 5
    `, [userId]);

    // Sesiones de home training incompletas
    const homePending = await pool.query(`
      SELECT 
        id, home_training_plan_id, status, 
        started_at,
        EXTRACT(EPOCH FROM (NOW() - started_at))/3600 as hours_since_start
      FROM app.home_training_sessions
      WHERE user_id = $1 
        AND status IN ('in_progress', 'pending')
      ORDER BY started_at DESC
      LIMIT 5
    `, [userId]);

    const hasPendingSessions = methodologyPending.rowCount > 0 || homePending.rowCount > 0;

    return {
      success: true,
      hasPendingSessions,
      methodology: {
        count: methodologyPending.rowCount,
        sessions: methodologyPending.rows
      },
      home: {
        count: homePending.rowCount,
        sessions: homePending.rows
      }
    };

  } catch (error) {
    console.error('❌ Error verificando sesiones pendientes:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Marca una sesión específica como abandonada (útil para el frontend)
 * @param {number} sessionId - ID de la sesión
 * @param {number} userId - ID del usuario (para validación)
 * @param {string} sessionType - 'methodology' o 'home'
 * @param {string} reason - Razón del abandono (opcional)
 * @returns {Promise<object>} Resultado
 */
export async function abandonSession(sessionId, userId, sessionType = 'methodology', reason = null) {
  try {
    let table, statusColumn;
    
    if (sessionType === 'methodology') {
      table = 'app.methodology_exercise_sessions';
      statusColumn = 'session_status';
    } else if (sessionType === 'home') {
      table = 'app.home_training_sessions';
      statusColumn = 'status';
    } else {
      return { success: false, error: 'Tipo de sesión inválido' };
    }

    const result = await pool.query(`
      UPDATE ${table}
      SET ${statusColumn} = 'abandoned',
          completed_at = NOW(),
          updated_at = NOW()
          ${reason ? ", abandon_reason = $4" : ""}
      WHERE id = $1 AND user_id = $2 AND ${statusColumn} IN ('in_progress', 'pending')
      RETURNING id, ${statusColumn} as status
    `, reason ? [sessionId, userId, reason] : [sessionId, userId]);

    if (result.rowCount === 0) {
      return {
        success: false,
        error: 'Sesión no encontrada o ya finalizada'
      };
    }

    console.log(`🚪 [ABANDON] Sesión ${sessionId} marcada como abandonada`);
    return {
      success: true,
      session: result.rows[0]
    };

  } catch (error) {
    console.error('❌ Error abandonando sesión:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Exportación por defecto para facilitar uso
export default {
  cleanupStaleSessions,
  cleanupUserStaleSessions,
  checkUserPendingSessions,
  abandonSession
};
