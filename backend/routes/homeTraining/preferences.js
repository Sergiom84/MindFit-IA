/**
 * Rutas de home-training - dominio: preferences (extraidas del monolito).
 */

import express from 'express';
import {
  pool
} from '../../db.js';
import authenticateToken from '../../middleware/auth.js';
import {
  normalizeEquipmentType,
  normalizeTrainingType,
  toExerciseKey
} from './_helpers.js';

const router = express.Router();


// ===============================================
// ENDPOINTS PARA SISTEMA DE RECHAZOS
// ===============================================

// Guardar ejercicios rechazados - SISTEMA UNIFICADO DE FEEDBACK
router.post('/rejections', authenticateToken, async (req, res) => {
  try {
    const { rejections } = req.body || {};
    const user_id = req.user.userId || req.user.id;

    if (!Array.isArray(rejections) || rejections.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un array de ejercicios rechazados'
      });
    }

    console.log('🔄 USANDO SISTEMA UNIFICADO DE FEEDBACK');
    console.log(`📊 Procesando ${rejections.length} rechazo(s) de ejercicios`);

    // Mapeo de categorías del modal a feedback_type
    const REJECTION_CATEGORY_MAPPING = {
      'too_hard': 'too_difficult',
      'dont_like': 'dont_like',
      'injury': 'physical_limitation',
      'equipment': 'no_equipment',
      'other': 'change_focus'
    };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const insertedFeedback = [];

      for (const raw of rejections) {
        // Normalizar datos del modal
        const exercise_name = String(raw?.exercise_name || '').trim().slice(0, 255) || 'Ejercicio';
        const raw_key = raw?.exercise_key ? String(raw.exercise_key).trim() : '';
        const exercise_key = exercise_name ? toExerciseKey(exercise_name) : (raw_key || 'ejercicio');
        const training_type = normalizeTrainingType(raw?.training_type);
        const equipment_type = normalizeEquipmentType(raw?.equipment_type);
        const rejection_category = raw?.rejection_category || 'other';
        const rejection_reason = raw?.rejection_reason ? String(raw.rejection_reason).slice(0, 1000) : null;
        const expires_in_days = Number(raw?.expires_in_days) || null;

        // Mapear categoría del modal a feedback_type del sistema unificado
        const feedback_type = REJECTION_CATEGORY_MAPPING[rejection_category] || 'dont_like';

        // Calcular fecha de expiración
        let expiresAt = null;
        if (expires_in_days && expires_in_days > 0) {
          expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + expires_in_days);
        }

        // Determinar methodology_type basado en training_type
        let methodology_type = 'home_training'; // Por defecto
        if (training_type?.toLowerCase().includes('calistenia')) {
          methodology_type = 'calistenia';
        } else if (training_type?.toLowerCase().includes('hipertrofia')) {
          methodology_type = 'hipertrofia';
        }

        console.log(`📝 Guardando feedback: ${exercise_name} - ${feedback_type} (${methodology_type})`);

        await client.query(
          `INSERT INTO app.home_exercise_rejections
           (user_id, exercise_name, exercise_key, equipment_type, training_type, rejection_reason, rejection_category, expires_at, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
           ON CONFLICT (user_id, exercise_key, equipment_type, training_type, is_active)
           DO UPDATE SET rejection_reason = EXCLUDED.rejection_reason,
                         rejection_category = EXCLUDED.rejection_category,
                         expires_at = EXCLUDED.expires_at,
                         rejected_at = NOW(),
                         updated_at = NOW()`,
          [user_id, exercise_name, exercise_key, equipment_type, training_type, rejection_reason, rejection_category, expiresAt]
        );

        // Verificar si ya existe feedback para este ejercicio
        const existingResult = await client.query(
          `SELECT id FROM app.user_exercise_feedback
           WHERE user_id = $1 AND exercise_name = $2
           AND methodology_type = $3
           AND (expires_at IS NULL OR expires_at > NOW())`,
          [user_id, exercise_name, methodology_type]
        );

        if (existingResult.rows.length > 0) {
          // Actualizar feedback existente
          const updateResult = await client.query(
            `UPDATE app.user_exercise_feedback
             SET feedback_type = $1,
                 comment = $2,
                 avoidance_duration_days = $3,
                 expires_at = $4,
                 updated_at = NOW()
             WHERE id = $5
             RETURNING *`,
            [feedback_type, rejection_reason, expires_in_days, expiresAt, existingResult.rows[0].id]
          );
          insertedFeedback.push(updateResult.rows[0]);
          console.log(`✏️  Feedback actualizado para: ${exercise_name}`);
        } else {
          // Crear nuevo feedback usando el sistema unificado
          const insertResult = await client.query(
            `INSERT INTO app.user_exercise_feedback
             (user_id, exercise_name, exercise_key, methodology_type, feedback_type,
              comment, avoidance_duration_days, expires_at, ai_weight, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1.0, NOW())
             RETURNING *`,
            [user_id, exercise_name, exercise_key, methodology_type, feedback_type,
             rejection_reason, expires_in_days, expiresAt]
          );
          insertedFeedback.push(insertResult.rows[0]);
          console.log(`✅ Nuevo feedback creado para: ${exercise_name}`);
        }
      }

      await client.query('COMMIT');

      console.log(`🎉 Procesamiento completo: ${insertedFeedback.length} registros`);

      res.json({
        success: true,
        message: `${insertedFeedback.length} ejercicio${insertedFeedback.length !== 1 ? 's' : ''} marcado${insertedFeedback.length !== 1 ? 's' : ''} como rechazado${insertedFeedback.length !== 1 ? 's' : ''}`,
        feedback: insertedFeedback,
        system: 'unified_feedback' // Identificador del nuevo sistema
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('❌ Error dentro de transacción /rejections (unified):', err);
      return res.status(500).json({
        success: false,
        message: 'Error al guardar las preferencias de ejercicios',
        details: err.message,
        system: 'unified_feedback'
      });
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error saving exercise feedback (unified system):', error);
    res.status(500).json({
      success: false,
      message: 'Error al guardar las preferencias de ejercicios'
    });
  }
});


// Obtener ejercicios rechazados para una combinación
router.get('/rejections/:equipmentType/:trainingType', authenticateToken, async (req, res) => {
  try {
    const { equipmentType, trainingType } = req.params;
    const user_id = req.user.userId || req.user.id;

    const result = await pool.query(
      `SELECT * FROM app.get_rejected_exercises_for_combination($1, $2, $3)`,
      [user_id, equipmentType, trainingType]
    );

    res.json({
      success: true,
      rejections: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Error getting exercise rejections:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener ejercicios rechazados'
    });
  }
});


// Eliminar/desactivar un rechazo específico
router.delete('/rejections/:rejectionId', authenticateToken, async (req, res) => {
  try {
    const { rejectionId } = req.params;
    const user_id = req.user.userId || req.user.id;

    const result = await pool.query(
      `UPDATE app.home_exercise_rejections
       SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING exercise_name`,
      [rejectionId, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rechazo no encontrado'
      });
    }

    res.json({
      success: true,
      message: `"${result.rows[0].exercise_name}" ya no será rechazado`
    });

  } catch (error) {
    console.error('Error removing exercise rejection:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar el rechazo'
    });
  }
});


// Obtener historial completo de preferencias del usuario
router.get('/preferences-history', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.userId || req.user.id;

    // 1. Ejercicios favoritos (completados con feedback 'like')
    const favorites = await pool.query(`
      SELECT DISTINCT
        eh.exercise_name,
        COUNT(*) as times_completed,
        MAX(eh.created_at) as last_completed
      FROM app.home_exercise_history eh
      LEFT JOIN app.user_exercise_feedback uef ON (
        uef.user_id = eh.user_id 
        AND uef.exercise_name = eh.exercise_name 
        AND uef.sentiment = 'like'
      )
      WHERE eh.user_id = $1 
        AND uef.sentiment = 'like'
      GROUP BY eh.exercise_name
      ORDER BY times_completed DESC, last_completed DESC
      LIMIT 20
    `, [user_id]);

    // 2. Ejercicios desafiantes (completados con feedback 'hard')
    const challenging = await pool.query(`
      SELECT DISTINCT
        eh.exercise_name,
        COUNT(*) as times_completed,
        MAX(eh.created_at) as last_completed
      FROM app.home_exercise_history eh
      LEFT JOIN app.user_exercise_feedback uef ON (
        uef.user_id = eh.user_id 
        AND uef.exercise_name = eh.exercise_name 
        AND uef.sentiment = 'hard'
      )
      WHERE eh.user_id = $1 
        AND uef.sentiment = 'hard'
      GROUP BY eh.exercise_name
      ORDER BY times_completed DESC, last_completed DESC
      LIMIT 20
    `, [user_id]);

    // 3. Ejercicios rechazados activos
    const rejected = await pool.query(`
      SELECT 
        id,
        exercise_name,
        rejection_reason,
        rejection_category,
        rejected_at,
        expires_at,
        CASE 
          WHEN expires_at IS NULL THEN NULL
          ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (expires_at - NOW())) / 86400))
        END as days_until_expires
      FROM app.home_exercise_rejections 
      WHERE user_id = $1 
        AND is_active = true
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY rejected_at DESC
    `, [user_id]);

    // 4. Analytics generales
    const analytics = await pool.query(`
      SELECT 
        COUNT(*) as total_completed,
        COUNT(DISTINCT exercise_name) as unique_exercises,
        AVG(series) as avg_series,
        SUM(duration_seconds) as total_duration_seconds
      FROM app.home_exercise_history 
      WHERE user_id = $1
    `, [user_id]);

    // 5. Patrones de rechazo (para insights)
    const rejectionPatterns = await pool.query(`
      SELECT 
        rejection_category,
        COUNT(*) as count
      FROM app.home_exercise_rejections 
      WHERE user_id = $1 AND is_active = true
      GROUP BY rejection_category
      ORDER BY count DESC
    `, [user_id]);

    // 6. Ejercicios más populares (sin feedback específico)
    const popular = await pool.query(`
      SELECT 
        exercise_name,
        COUNT(*) as times_completed,
        MAX(created_at) as last_completed
      FROM app.home_exercise_history 
      WHERE user_id = $1
      GROUP BY exercise_name
      ORDER BY times_completed DESC
      LIMIT 10
    `, [user_id]);

    const preferences = {
      favorites: favorites.rows,
      challenging: challenging.rows,
      rejected: rejected.rows,
      analytics: {
        ...analytics.rows[0],
        rejection_patterns: rejectionPatterns.rows,
        popular_exercises: popular.rows
      }
    };

    res.json({
      success: true,
      preferences: preferences
    });

  } catch (error) {
    console.error('Error getting preferences history:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el historial de preferencias'
    });
  }
});

export default router;
