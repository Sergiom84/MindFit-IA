/**
 * Servicio de limpieza de drafts fallidos
 * @module routineGeneration/draftCleaner
 */

import { pool } from '../../db.js';
import { logger } from './logger.js';

/**
 * Limpiar drafts fallidos del usuario antes de crear un plan nuevo
 * Esta función previene la acumulación de planes draft corruptos
 *
 * @param {string} userId - ID del usuario
 * @param {object} [client=null] - Cliente de BD opcional (para transacciones)
 * @returns {Promise<number>} Cantidad de drafts eliminados
 */
export async function cleanUserDrafts(userId, client = null) {
  const dbClient = client || pool;

  try {
    logger.info(`🧹 Limpiando drafts fallidos para usuario ${userId}...`);

    // Primero, verificar cuántos drafts existen
    const checkResult = await dbClient.query(`
      SELECT id, created_at, methodology_type
      FROM app.methodology_plans
      WHERE user_id = $1 AND status = 'draft'
      ORDER BY created_at DESC
    `, [userId]);

    if (checkResult.rowCount > 0) {
      logger.info(`📊 Encontrados ${checkResult.rowCount} drafts:`,
        checkResult.rows.map(r => ({
          id: r.id,
          type: r.methodology_type,
          age: Math.floor((Date.now() - new Date(r.created_at).getTime()) / 1000 / 60) + ' mins'
        }))
      );
    }

    // Eliminar todos los drafts
    const result = await dbClient.query(`
      DELETE FROM app.methodology_plans
      WHERE user_id = $1 AND status = 'draft'
      RETURNING id
    `, [userId]);

    const deletedCount = result.rowCount;
    if (deletedCount > 0) {
      logger.info(`✅ Eliminados ${deletedCount} drafts fallidos: IDs [${result.rows.map(r => r.id).join(', ')}]`);
    } else {
      logger.info(`ℹ️ No había drafts que limpiar para usuario ${userId}`);
    }

    return deletedCount;
  } catch (error) {
    logger.error('❌ Error limpiando drafts:', error.message);
    // No lanzar error - la limpieza es opcional pero loguear detalles
    return 0;
  }
}
