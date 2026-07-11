/**
 * 🧹 Session Cleanup Utilities
 * Utilidades para limpiar sesiones en limbo y estados inconsistentes
 * 
 * MEJORADO: Ahora incluye limpieza de drafts y sesiones de fin de semana
 */

import { pool } from '../db.js';
import { cleanupStaleSessions } from '../services/sessionCleanupService.js';

/**
 * Limpia sesiones que han quedado en limbo (in_progress por mucho tiempo)
 * @param {number} userId - ID del usuario
 * @param {number} methodologyPlanId - ID del plan de metodología
 * @param {number} hoursThreshold - Horas después de las cuales cancelar sesión (default: 2)
 * @returns {Promise<number>} Número de sesiones limpiadas
 */
export async function cleanupLimboSessions(userId, methodologyPlanId = null, hoursThreshold = 2) {
  try {
    let query = `
      UPDATE app.methodology_exercise_sessions
      SET session_status = 'cancelled'
      WHERE user_id = $1
        AND session_status = 'in_progress'
        AND started_at < NOW() - INTERVAL '${hoursThreshold} hours'
    `;

    let params = [userId];

    if (methodologyPlanId) {
      query += ' AND methodology_plan_id = $2';
      params.push(methodologyPlanId);
    }

    query += ' RETURNING id, day_name, started_at';

    const result = await pool.query(query, params);

    if (result.rowCount > 0) {
      console.log(`🧹 Limpieza de sesiones en limbo:`);
      console.log(`   Usuario: ${userId}, Plan: ${methodologyPlanId || 'todos'}`);
      console.log(`   Sesiones canceladas: ${result.rowCount}`);
      result.rows.forEach(row => {
        console.log(`   - Sesión ${row.id} (${row.day_name}) iniciada: ${row.started_at}`);
      });
    }

    return result.rowCount;
  } catch (error) {
    console.error('❌ Error limpiando sesiones en limbo:', error);
    return 0;
  }
}

/**
 * Corrige estados inconsistentes (sesiones marcadas como in_progress pero con completed_at)
 * @param {number} userId - ID del usuario (opcional)
 * @returns {Promise<number>} Número de sesiones corregidas
 */
export async function fixInconsistentSessionStates(userId = null) {
  try {
    // Honestidad del historial: solo marcar 'completed' si realmente se terminaron
    // todos los ejercicios; si quedó trabajo a medias, la sesión es 'incomplete'
    // (antes una sesión cerrada por limpieza con 1/7 ejercicios salía "Completada").
    let query = `
      UPDATE app.methodology_exercise_sessions
      SET session_status = CASE
        WHEN total_exercises > 0 AND COALESCE(exercises_completed, 0) >= total_exercises THEN 'completed'
        ELSE 'incomplete'
      END
      WHERE session_status = 'in_progress'
        AND completed_at IS NOT NULL
    `;

    let params = [];

    if (userId) {
      query += ' AND user_id = $1';
      params.push(userId);
    }

    query += ' RETURNING id, day_name, completed_at';

    const result = await pool.query(query, params);

    if (result.rowCount > 0) {
      console.log(`🔧 Corrección de estados inconsistentes:`);
      console.log(`   Usuario: ${userId || 'todos'}`);
      console.log(`   Sesiones corregidas: ${result.rowCount}`);
      result.rows.forEach(row => {
        console.log(`   - Sesión ${row.id} (${row.day_name}) completada: ${row.completed_at}`);
      });
    }

    return result.rowCount;
  } catch (error) {
    console.error('❌ Error corrigiendo estados inconsistentes:', error);
    return 0;
  }
}

/**
 * Valida que un plan existe y está activo
 * @param {number} planId - ID del plan de metodología
 * @param {number} userId - ID del usuario
 * @returns {Promise<boolean>} true si el plan es válido y activo
 */
export async function validateActivePlan(planId, userId) {
  try {
    const result = await pool.query(`
      SELECT id, status, methodology_type
      FROM app.methodology_plans
      WHERE id = $1 AND user_id = $2
    `, [planId, userId]);

    if (result.rowCount === 0) {
      console.log(`⚠️ Plan ${planId} no encontrado para usuario ${userId}`);
      return false;
    }

    const plan = result.rows[0];
    if (plan.status !== 'active') {
      console.log(`⚠️ Plan ${planId} no está activo. Estado: ${plan.status}`);
      return false;
    }

    console.log(`✅ Plan ${planId} validado: ${plan.methodology_type} (${plan.status})`);
    return true;
  } catch (error) {
    console.error('❌ Error validando plan activo:', error);
    return false;
  }
}

/**
 * Limpieza completa antes de iniciar una nueva sesión
 * @param {number} userId - ID del usuario
 * @param {number} methodologyPlanId - ID del plan de metodología
 * @returns {Promise<{success: boolean, cleanedSessions: number, fixedStates: number}>}
 */
export async function preSessionCleanup(userId, methodologyPlanId) {
  try {
    console.log(`🧹 Iniciando limpieza pre-sesión para usuario ${userId}, plan ${methodologyPlanId}`);

    // 1. Validar que el plan está activo
    const isValidPlan = await validateActivePlan(methodologyPlanId, userId);
    if (!isValidPlan) {
      return {
        success: false,
        error: 'Plan no válido o no activo',
        cleanedSessions: 0,
        fixedStates: 0
      };
    }

    // 2. Limpiar sesiones en limbo para este plan específico
    const cleanedSessions = await cleanupLimboSessions(userId, methodologyPlanId, 1); // 1 hora threshold

    // 3. Corregir estados inconsistentes
    const fixedStates = await fixInconsistentSessionStates(userId);

    console.log(`✅ Limpieza pre-sesión completada:`);
    console.log(`   - Sesiones en limbo limpiadas: ${cleanedSessions}`);
    console.log(`   - Estados inconsistentes corregidos: ${fixedStates}`);

    return {
      success: true,
      cleanedSessions,
      fixedStates
    };
  } catch (error) {
    console.error('❌ Error en limpieza pre-sesión:', error);
    return {
      success: false,
      error: error.message,
      cleanedSessions: 0,
      fixedStates: 0
    };
  }
}

/**
 * Limpieza general del sistema (para ejecutar periódicamente)
 * @returns {Promise<{totalCleaned: number, totalFixed: number, draftsRemoved: number, weekendCleaned: number}>}
 */
export async function systemWideCleanup() {
  try {
    console.log('🧹 Iniciando limpieza general del sistema...');

    // 1. Usar el servicio centralizado de limpieza
    const cleanupResult = await cleanupStaleSessions();
    
    // 2. Limpiar sesiones en limbo de más de 24 horas (por si el servicio no las capturó)
    const limboQuery = await pool.query(`
      UPDATE app.methodology_exercise_sessions
      SET session_status = 'cancelled',
          completed_at = NOW()
      WHERE session_status = 'in_progress'
        AND started_at < NOW() - INTERVAL '24 hours'
      RETURNING id, user_id, day_name, started_at
    `);

    // 3. Corregir todos los estados inconsistentes (solo 'completed' si se terminó todo)
    const inconsistentQuery = await pool.query(`
      UPDATE app.methodology_exercise_sessions
      SET session_status = CASE
        WHEN total_exercises > 0 AND COALESCE(exercises_completed, 0) >= total_exercises THEN 'completed'
        ELSE 'incomplete'
      END
      WHERE session_status = 'in_progress'
        AND completed_at IS NOT NULL
      RETURNING id, user_id, day_name, completed_at
    `);

    // 4. Limpiar planes draft antiguos (más de 1 hora)
    const draftQuery = await pool.query(`
      DELETE FROM app.methodology_plans
      WHERE status = 'draft'
        AND created_at < NOW() - INTERVAL '1 hour'
      RETURNING id, user_id, methodology_type
    `);

    // 5. Limpiar sesiones de fin de semana huérfanas (weekend-extra sin completar > 48h)
    const weekendQuery = await pool.query(`
      UPDATE app.methodology_exercise_sessions
      SET session_status = 'abandoned',
          completed_at = NOW()
      WHERE session_type = 'weekend-extra'
        AND session_status IN ('pending', 'in_progress')
        AND created_at < NOW() - INTERVAL '48 hours'
      RETURNING id, user_id
    `);

    // 6. Limpiar ejercicios de tracking huérfanos (sin sesión válida)
    const orphanTrackingQuery = await pool.query(`
      DELETE FROM app.exercise_session_tracking
      WHERE methodology_session_id NOT IN (
        SELECT id FROM app.methodology_exercise_sessions
      )
      RETURNING id
    `);

    const totalCleaned = limboQuery.rowCount + (cleanupResult.details?.methodology?.cancelled || 0);
    const totalFixed = inconsistentQuery.rowCount;
    const draftsRemoved = draftQuery.rowCount + (cleanupResult.details?.drafts || 0);
    const weekendCleaned = weekendQuery.rowCount;
    const orphansRemoved = orphanTrackingQuery.rowCount;

    console.log(`✅ Limpieza general completada:`);
    console.log(`   - Sesiones en limbo canceladas: ${totalCleaned}`);
    console.log(`   - Estados inconsistentes corregidos: ${totalFixed}`);
    console.log(`   - Drafts eliminados: ${draftsRemoved}`);
    console.log(`   - Sesiones fin de semana abandonadas: ${weekendCleaned}`);
    console.log(`   - Registros huérfanos eliminados: ${orphansRemoved}`);

    if (limboQuery.rowCount > 0) {
      console.log('   Sesiones en limbo canceladas:');
      limboQuery.rows.forEach(row => {
        console.log(`     - Usuario ${row.user_id}, Sesión ${row.id} (${row.day_name})`);
      });
    }

    if (draftQuery.rowCount > 0) {
      console.log('   Drafts eliminados:');
      draftQuery.rows.forEach(row => {
        console.log(`     - Usuario ${row.user_id}, Plan ${row.id} (${row.methodology_type})`);
      });
    }

    return { 
      totalCleaned, 
      totalFixed, 
      draftsRemoved, 
      weekendCleaned,
      orphansRemoved
    };
  } catch (error) {
    console.error('❌ Error en limpieza general del sistema:', error);
    return { totalCleaned: 0, totalFixed: 0, draftsRemoved: 0, weekendCleaned: 0, orphansRemoved: 0 };
  }
}