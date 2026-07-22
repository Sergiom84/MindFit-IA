/**
 * Repository para operaciones de usuario
 * @module routineGeneration/database/userRepository
 */

import { pool } from '../../../db.js';
import { logger } from '../logger.js';

/**
 * Obtener perfil completo del usuario desde la BD
 * @param {string} userId - ID del usuario
 * @returns {Promise<object>} Perfil completo del usuario
 * @throws {Error} Si el usuario no existe
 */
export async function getUserFullProfile(userId) {
  try {
    const userQuery = await pool.query(`
      SELECT
        u.id, u.nombre, u.apellido, u.email,
        u.edad, u.sexo, u.peso, u.altura,
        u.anos_entrenando, u.nivel_entrenamiento,
        u.nivel_actividad, u.grasa_corporal, u.masa_magra,
        u.pecho, u.brazos, u.alergias, u.medicamentos, u.lesiones,
        u.suplementacion, u.frecuencia_semanal,
        u.agua_corporal, u.metabolismo_basal,
        u.cintura, u.muslo, u.cuello, u.antebrazos, u.cadera,
        u.comidas_por_dia, u.alimentos_excluidos, u.meta_peso,
        u.meta_grasa_corporal, u.enfoque_entrenamiento, u.historial_medico,
        u.horario_preferido,
        -- 🩹 F1 (ONB-P1-01): app.users.limitaciones_fisicas (text[]) es el campo
        -- CANÓNICO. La edición en Perfil (PUT /api/users/:id) escribe ahí, así que el
        -- motor DEBE preferirlo; si lo hiciera al revés, una lesión editada en Perfil
        -- quedaría eclipsada por el texto stale de user_profiles y el filtro la ignoraría.
        -- Fallback a user_profiles.limitaciones_fisicas (text) solo para filas legacy.
        -- Se normaliza a texto con array_to_string (los consumidores esperan string).
        COALESCE(NULLIF(array_to_string(u.limitaciones_fisicas, '. '), ''), p.limitaciones_fisicas) AS limitaciones_fisicas,
        -- Onboarding escribe estos campos en users; user_profiles ahora se rellena en el
        -- registro, pero el COALESCE cubre a los usuarios antiguos (fila p inexistente/vacía).
        COALESCE(p.objetivo_principal, u.objetivo_principal) AS objetivo_principal,
        COALESCE(p.metodologia_preferida, u.metodologia_preferida) AS metodologia_preferida,
        p.usar_preferencias_ia, p.dias_preferidos_entrenamiento,
        p.ejercicios_por_dia_preferido, p.semanas_entrenamiento
      FROM app.users u
      LEFT JOIN app.user_profiles p ON u.id = p.user_id
      WHERE u.id = $1
    `, [userId]);

    if (userQuery.rowCount === 0) {
      throw new Error('Usuario no encontrado');
    }

    logger.info(`✅ Perfil de usuario ${userId} obtenido`);
    return userQuery.rows[0];
  } catch (error) {
    logger.error(`❌ Error obteniendo perfil de usuario ${userId}:`, error.message);
    throw error;
  }
}

/**
 * Obtener ejercicios recientes del usuario
 * @param {string} userId - ID del usuario
 * @param {number} [limit=50] - Cantidad de ejercicios a obtener
 * @returns {Promise<Array>} Ejercicios recientes
 */
export async function getUserRecentExercises(userId, limit = 50) {
  try {
    const result = await pool.query(`
      SELECT
        e.nombre,
        l.fecha,
        l.peso,
        l.repeticiones,
        l.series_completadas
      FROM app.historico_ejercicios l
      JOIN app.ejercicios e ON l.ejercicio_id = e.id
      WHERE l.user_id = $1
      ORDER BY l.fecha DESC
      LIMIT $2
    `, [userId, limit]);

    logger.info(`✅ Obtenidos ${result.rowCount} ejercicios recientes para usuario ${userId}`);
    return result.rows;
  } catch (error) {
    logger.error(`❌ Error obteniendo ejercicios recientes:`, error.message);
    return [];
  }
}
