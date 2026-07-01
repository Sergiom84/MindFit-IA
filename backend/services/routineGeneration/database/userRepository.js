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
        u.pecho, u.brazos, u.alergias, u.medicamentos,
        u.suplementacion, u.frecuencia_semanal,
        u.agua_corporal, u.metabolismo_basal,
        u.cintura, u.muslo, u.cuello, u.antebrazos, u.cadera,
        u.comidas_por_dia, u.alimentos_excluidos, u.meta_peso,
        u.meta_grasa_corporal, u.enfoque_entrenamiento, u.historial_medico,
        -- 🩹 FIX: las lesiones se guardan en users (registro/onboarding) pero antes
        -- solo se leía user_profiles (a menudo vacío), así que las limitaciones se
        -- perdían y la generación las ignoraba. Preferir la fuente con dato.
        -- Nota: user_profiles.limitaciones_fisicas es text y users es text[],
        -- por eso se normaliza a texto con array_to_string.
        COALESCE(NULLIF(p.limitaciones_fisicas, ''), array_to_string(u.limitaciones_fisicas, '. ')) AS limitaciones_fisicas,
        p.objetivo_principal, p.metodologia_preferida,
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
