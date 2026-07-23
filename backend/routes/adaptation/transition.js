/**
 * Rutas de transición y evaluación de completado del Bloque de Adaptación.
 *   POST /api/adaptation/transition  → completa el bloque y habilita D1-D5
 *   GET  /api/adaptation/evaluate    → evalúa criterios sin completar el bloque
 */

import express from 'express';
import pool from '../../db.js';
import { authenticateToken } from '../../middleware/auth.js';

const router = express.Router();

// ============================================
// POST /api/adaptation/transition
// ============================================
/**
 * Completa el bloque de adaptación y habilita transición a D1-D5
 */
router.post('/transition', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    console.log('🚀 [ADAPTACIÓN] Solicitando transición a D1-D5 para usuario:', userId);

    // Obtener bloque activo
    const blockResult = await pool.query(
      `SELECT id FROM app.adaptation_blocks
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (blockResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No tienes un bloque de adaptación activo'
      });
    }

    const blockId = blockResult.rows[0].id;

    // Llamar a la función de transición
    const result = await pool.query(
      `SELECT app.transition_to_hypertrophy($1::integer, $2::integer) AS transition_to_hypertrophy`,
      [userId, blockId]
    );

    const transitionResult = result.rows[0].transition_to_hypertrophy;

    if (!transitionResult.success) {
      return res.status(400).json(transitionResult);
    }

    console.log('✅ [ADAPTACIÓN] Transición completada, usuario listo para D1-D5');

    res.json({
      success: true,
      message: 'Bloque de adaptación completado exitosamente',
      readyForD1D5: true,
      evaluation: transitionResult.evaluation,
      nextSteps: [
        'Genera tu plan D1-D5 de Hipertrofia',
        'El sistema usará los datos de tu adaptación para ajustar las cargas iniciales',
        'Comenzarás con intensidades apropiadas basadas en tu progreso'
      ]
    });

  } catch (error) {
    console.error('❌ [ADAPTACIÓN] Error en transición:', error);
    res.status(500).json({
      success: false,
      error: 'Error al transicionar a D1-D5',
      details: error.message
    });
  }
});

// ============================================
// GET /api/adaptation/evaluate
// ============================================
/**
 * Evalúa si el usuario está listo para transicionar (sin completar el bloque)
 */
router.get('/evaluate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    console.log('🔍 [ADAPTACIÓN] Evaluando criterios para usuario:', userId);

    // Llamar a la función de evaluación
    const result = await pool.query(
      `SELECT * FROM app.evaluate_adaptation_completion($1)`,
      [userId]
    );

    const evaluation = result.rows[0].evaluate_adaptation_completion;

    res.json(evaluation);

  } catch (error) {
    console.error('❌ [ADAPTACIÓN] Error evaluando criterios:', error);
    res.status(500).json({
      success: false,
      error: 'Error evaluando criterios',
      details: error.message
    });
  }
});

export default router;
