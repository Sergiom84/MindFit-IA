/**
 * Rutas de home-training - dominio: stats (extraidas del monolito).
 */

import express from 'express';
import {
  pool
} from '../../db.js';
import authenticateToken from '../../middleware/auth.js';

const router = express.Router();


// Obtener estadísticas del usuario (extendido con ejercicios y tiempo activo)
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.userId || req.user.id;

    const statsResult = await pool.query(
      'SELECT * FROM app.user_home_training_stats WHERE user_id = $1',
      [user_id]
    );

    let stats = statsResult.rows[0];

    if (!stats) {
      // Crear estadísticas iniciales si no existen
      const createResult = await pool.query(
        `INSERT INTO app.user_home_training_stats (user_id)
         VALUES ($1)
         RETURNING *`,
        [user_id]
      );
      stats = createResult.rows[0];
    }

    // Agregar métricas basadas en ejercicios completados (SOLO entrenamiento en casa)
    const exAgg = await pool.query(
      `SELECT COUNT(*)::int AS total_exercises_completed,
              COALESCE(SUM(duration_seconds), 0)::int AS total_exercise_duration_seconds
         FROM app.home_exercise_history
        WHERE user_id = $1`,
      [user_id]
    );
    const ex = exAgg.rows[0] || { total_exercises_completed: 0, total_exercise_duration_seconds: 0 };

    res.json({
      success: true,
      stats: {
        ...stats,
        total_exercises_completed: ex.total_exercises_completed,
        total_exercise_duration_seconds: ex.total_exercise_duration_seconds,
      }
    });
  } catch (error) {
    console.error('Error getting user stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las estadísticas'
    });
  }
});

export default router;
