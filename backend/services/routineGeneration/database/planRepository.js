/**
 * Repository para operaciones de planes de metodología
 * @module routineGeneration/database/planRepository
 */

import { pool } from '../../../db.js';
import { logger } from '../logger.js';
import { PLAN_STATUS } from '../constants.js';

/**
 * Crear un nuevo plan de metodología en la BD
 * @param {object} planData - Datos del plan
 * @param {string} planData.userId - ID del usuario
 * @param {string} planData.methodologyType - Tipo de metodología
 * @param {object} planData.plan - Plan completo (JSON)
 * @param {string} [planData.status='draft'] - Estado inicial del plan
 * @returns {Promise<object>} Plan creado con ID
 */
export async function createMethodologyPlan(planData) {
  const { userId, methodologyType, plan, status = PLAN_STATUS.DRAFT } = planData;

  try {
    const result = await pool.query(`
      INSERT INTO app.methodology_plans (
        user_id,
        methodology_type,
        plan_data,
        status,
        created_at
      )
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id, created_at
    `, [userId, methodologyType, JSON.stringify(plan), status]);

    const createdPlan = {
      id: result.rows[0].id,
      created_at: result.rows[0].created_at,
      ...planData
    };

    logger.info(`✅ Plan de metodología creado con ID: ${createdPlan.id}`);
    return createdPlan;
  } catch (error) {
    logger.error(`❌ Error creando plan de metodología:`, error.message);
    throw error;
  }
}

/**
 * Obtener plan activo del usuario
 * @param {string} userId - ID del usuario
 * @returns {Promise<object|null>} Plan activo o null
 */
export async function getActivePlan(userId) {
  try {
    const result = await pool.query(`
      SELECT
        id,
        user_id,
        methodology_type,
        plan_data,
        status,
        created_at,
        updated_at
      FROM app.methodology_plans
      WHERE user_id = $1 AND status = $2
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId, PLAN_STATUS.ACTIVE]);

    if (result.rowCount === 0) {
      logger.info(`ℹ️ No hay plan activo para usuario ${userId}`);
      return null;
    }

    return result.rows[0];
  } catch (error) {
    logger.error(`❌ Error obteniendo plan activo:`, error.message);
    throw error;
  }
}

/**
 * Actualizar estado de un plan
 * @param {string} planId - ID del plan
 * @param {string} newStatus - Nuevo estado
 * @param {string} userId - Propietario del plan
 * @param {object} [runner=pool] - Pool/cliente inyectable
 * @returns {Promise<boolean>} True si se actualizó
 */
export async function updatePlanStatus(planId, newStatus, userId, runner = pool) {
  if (!userId) throw new TypeError('updatePlanStatus requiere userId');
  try {
    const result = await runner.query(`
      UPDATE app.methodology_plans
      SET status = $1, updated_at = NOW()
      WHERE id = $2 AND user_id = $3
      RETURNING id
    `, [newStatus, planId, userId]);

    if (result.rowCount > 0) {
      logger.info(`✅ Plan ${planId} actualizado a estado: ${newStatus}`);
      return true;
    }

    logger.warn(`⚠️ Plan ${planId} no encontrado para actualizar`);
    return false;
  } catch (error) {
    logger.error(`❌ Error actualizando estado del plan:`, error.message);
    throw error;
  }
}
