/**
 * @fileoverview Endpoints de preferencias y rechazos de ejercicios
 * 
 * Endpoints:
 * - POST /rejections - Guardar ejercicios rechazados
 * - GET /rejections/:equipmentType/:trainingType - Obtener rechazos
 * - DELETE /rejections/:rejectionId - Eliminar rechazo
 * - GET /preferences-history - Historial de preferencias
 * - POST /exercise-info - Información de ejercicio
 * - GET /exercise-info/stats - Estadísticas de ejercicios
 * - PUT /exercise-info/:exerciseId/verify - Verificar ejercicio
 * 
 * @module routes/homeTraining/preferences
 */

import express from 'express';
import { pool } from '../../db.js';
import authenticateToken from '../../middleware/auth.js';

const router = express.Router();

// Helpers
function toExerciseKey(name) {
  const s = String(name || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
  return s.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'ejercicio';
}

function normalizeTrainingType(val) {
  const v = String(val || '').toLowerCase().trim();
  if (['funcional','hiit','fuerza'].includes(v)) return v;
  if (v.includes('hiit')) return 'hiit';
  if (v.includes('fuerza') || v.includes('calistenia') || v.includes('strength')) return 'fuerza';
  return 'funcional';
}

const REJECTION_CATEGORY_MAPPING = {
  'too_hard': 'too_difficult',
  'dont_like': 'dont_like',
  'injury': 'physical_limitation',
  'equipment': 'no_equipment',
  'other': 'change_focus'
};

// =============================================================================
// POST /rejections - Guardar ejercicios rechazados
// =============================================================================
router.post('/rejections', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rejections } = req.body || {};
    const user_id = req.user.userId || req.user.id;

    if (!Array.isArray(rejections) || rejections.length === 0) {
      return res.status(400).json({ success: false, message: 'Se requiere un array de ejercicios rechazados' });
    }

    await client.query('BEGIN');
    const insertedFeedback = [];

    for (const raw of rejections) {
      const exercise_name = String(raw?.exercise_name || '').trim().slice(0, 255) || 'Ejercicio';
      const exercise_key = (raw?.exercise_key && String(raw.exercise_key).trim()) || toExerciseKey(exercise_name);
      const training_type = normalizeTrainingType(raw?.training_type);
      const rejection_category = raw?.rejection_category || 'other';
      const rejection_reason = raw?.rejection_reason ? String(raw.rejection_reason).slice(0, 1000) : null;
      const expires_in_days = Number(raw?.expires_in_days) || null;
      const feedback_type = REJECTION_CATEGORY_MAPPING[rejection_category] || 'dont_like';

      let expiresAt = null;
      if (expires_in_days && expires_in_days > 0) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expires_in_days);
      }

      let methodology_type = 'home_training';
      if (training_type?.toLowerCase().includes('calistenia')) methodology_type = 'calistenia';
      else if (training_type?.toLowerCase().includes('hipertrofia')) methodology_type = 'hipertrofia';

      const existingResult = await client.query(
        `SELECT id FROM app.user_exercise_feedback
         WHERE user_id = $1 AND exercise_name = $2 AND methodology_type = $3
         AND (expires_at IS NULL OR expires_at > NOW())`,
        [user_id, exercise_name, methodology_type]
      );

      let result;
      if (existingResult.rows.length > 0) {
        result = await client.query(
          `UPDATE app.user_exercise_feedback
           SET feedback_type = $1, comment = $2, avoidance_duration_days = $3, expires_at = $4, updated_at = NOW()
           WHERE id = $5 RETURNING *`,
          [feedback_type, rejection_reason, expires_in_days, expiresAt, existingResult.rows[0].id]
        );
      } else {
        result = await client.query(
          `INSERT INTO app.user_exercise_feedback
           (user_id, exercise_name, exercise_key, methodology_type, feedback_type, comment, avoidance_duration_days, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [user_id, exercise_name, exercise_key, methodology_type, feedback_type, rejection_reason, expires_in_days, expiresAt]
        );
      }
      insertedFeedback.push(result.rows[0]);
    }

    await client.query('COMMIT');
    res.json({ success: true, feedback: insertedFeedback, count: insertedFeedback.length });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving rejections:', error);
    res.status(500).json({ success: false, message: 'Error al guardar los rechazos' });
  } finally {
    client.release();
  }
});

// =============================================================================
// GET /rejections/:equipmentType/:trainingType - Obtener rechazos
// =============================================================================
router.get('/rejections/:equipmentType/:trainingType', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.userId || req.user.id;
    const { equipmentType, trainingType } = req.params;

    const result = await pool.query(
      `SELECT * FROM app.user_exercise_feedback
       WHERE user_id = $1 AND methodology_type = $2
       AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC`,
      [user_id, trainingType]
    );

    res.json({ success: true, rejections: result.rows });
  } catch (error) {
    console.error('Error getting rejections:', error);
    res.status(500).json({ success: false, message: 'Error al obtener rechazos' });
  }
});

// =============================================================================
// DELETE /rejections/:rejectionId - Eliminar rechazo
// =============================================================================
router.delete('/rejections/:rejectionId', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.userId || req.user.id;
    const { rejectionId } = req.params;

    await pool.query(
      `DELETE FROM app.user_exercise_feedback WHERE id = $1 AND user_id = $2`,
      [rejectionId, user_id]
    );

    res.json({ success: true, message: 'Rechazo eliminado' });
  } catch (error) {
    console.error('Error deleting rejection:', error);
    res.status(500).json({ success: false, message: 'Error al eliminar rechazo' });
  }
});

export default router;

