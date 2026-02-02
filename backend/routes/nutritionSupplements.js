/**
 * Rutas para Complementos de Control Nutricional
 * 
 * Endpoints para:
 * - Ritmo de pérdida semanal
 * - Validación de pliegue abdominal
 * - Validación de perímetros musculares
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  evaluateWeightLossRate,
  evaluateSkinfold,
  evaluateMuscleCircumferences,
  validateSkinfoldChange,
  EXPECTED_WEIGHT_LOSS_RATES,
  SKINFOLD_THRESHOLDS,
  MUSCLE_CIRCUMFERENCE_THRESHOLDS
} from '../services/nutritionControlSupplements.js';
import { pool } from '../db.js';

const router = express.Router();

// ============================================
// RITMO DE PÉRDIDA SEMANAL
// ============================================

/**
 * GET /api/nutrition/supplements/weight-loss-rate/current
 * Evalúa el ritmo de pérdida de peso actual del usuario
 */
router.get('/weight-loss-rate/current', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Obtener las últimas 2 mediciones
    const measurementsResult = await pool.query(
      `SELECT measurement_date, weight_kg
       FROM app.body_measurements
       WHERE user_id = $1 AND is_validated = TRUE
       ORDER BY measurement_date DESC
       LIMIT 2`,
      [userId]
    );

    if (measurementsResult.rows.length < 2) {
      return res.status(200).json({
        success: false,
        message: 'Se necesitan al menos 2 mediciones para evaluar ritmo de pérdida'
      });
    }

    const [current, previous] = measurementsResult.rows;
    const weeklyWeightLoss = previous.weight_kg - current.weight_kg;

    const evaluation = await evaluateWeightLossRate(
      userId,
      weeklyWeightLoss,
      current.weight_kg
    );

    res.json(evaluation);

  } catch (error) {
    console.error('[GET /weight-loss-rate/current] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error evaluando ritmo de pérdida',
      error: error.message
    });
  }
});

/**
 * GET /api/nutrition/supplements/weight-loss-rate/thresholds
 * Obtiene los umbrales de ritmo de pérdida según nivel
 */
router.get('/weight-loss-rate/thresholds', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Obtener nivel de entrenamiento
    const userResult = await pool.query(
      `SELECT nivel_entrenamiento FROM app.nutrition_profiles WHERE user_id = $1`,
      [userId]
    );

    const trainingLevel = userResult.rows[0]?.nivel_entrenamiento || 'intermediate';
    const thresholds = EXPECTED_WEIGHT_LOSS_RATES[trainingLevel];

    res.json({
      success: true,
      training_level: trainingLevel,
      thresholds,
      all_levels: EXPECTED_WEIGHT_LOSS_RATES
    });

  } catch (error) {
    console.error('[GET /weight-loss-rate/thresholds] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo umbrales',
      error: error.message
    });
  }
});

// ============================================
// PLIEGUE ABDOMINAL
// ============================================

/**
 * GET /api/nutrition/supplements/skinfold/current
 * Evalúa el pliegue abdominal actual del usuario
 */
router.get('/skinfold/current', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Obtener última medición con pliegue
    const measurementResult = await pool.query(
      `SELECT 
        measurement_date,
        skinfold_abdominal_mm,
        weight_kg
       FROM app.body_measurements
       WHERE user_id = $1 
         AND is_validated = TRUE 
         AND skinfold_abdominal_mm IS NOT NULL
       ORDER BY measurement_date DESC
       LIMIT 1`,
      [userId]
    );

    if (measurementResult.rows.length === 0) {
      return res.status(200).json({
        success: false,
        message: 'No se encontraron mediciones de pliegue abdominal'
      });
    }

    const measurement = measurementResult.rows[0];

    // Obtener fase actual
    const phaseResult = await pool.query(
      `SELECT current_phase FROM app.bridge_current_state WHERE user_id = $1`,
      [userId]
    );
    const currentPhase = phaseResult.rows[0]?.current_phase || 'maintenance';

    const evaluation = await evaluateSkinfold(
      userId,
      measurement.skinfold_abdominal_mm,
      currentPhase
    );

    res.json({
      ...evaluation,
      measurement_date: measurement.measurement_date
    });

  } catch (error) {
    console.error('[GET /skinfold/current] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error evaluando pliegue abdominal',
      error: error.message
    });
  }
});

/**
 * POST /api/nutrition/supplements/skinfold/validate-change
 * Valida si un cambio de pliegue es sospechoso (±20% en 1 semana)
 */
router.post('/skinfold/validate-change', authenticateToken, async (req, res) => {
  try {
    const { current_skinfold, previous_skinfold } = req.body;

    if (!current_skinfold || !previous_skinfold) {
      return res.status(400).json({
        success: false,
        message: 'Se requieren current_skinfold y previous_skinfold'
      });
    }

    const validation = validateSkinfoldChange(current_skinfold, previous_skinfold);

    res.json({
      success: true,
      validation
    });

  } catch (error) {
    console.error('[POST /skinfold/validate-change] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error validando cambio de pliegue',
      error: error.message
    });
  }
});

/**
 * GET /api/nutrition/supplements/skinfold/thresholds
 * Obtiene los umbrales de pliegue según fase y género
 */
router.get('/skinfold/thresholds', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Obtener género y fase
    const userResult = await pool.query(
      `SELECT u.gender, bcs.current_phase
       FROM app.users u
       LEFT JOIN app.bridge_current_state bcs ON bcs.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );

    const gender = userResult.rows[0]?.gender || 'male';
    const phase = userResult.rows[0]?.current_phase || 'maintenance';

    res.json({
      success: true,
      gender,
      phase,
      thresholds: SKINFOLD_THRESHOLDS,
      applicable_threshold: SKINFOLD_THRESHOLDS[phase] || SKINFOLD_THRESHOLDS.maintenance
    });

  } catch (error) {
    console.error('[GET /skinfold/thresholds] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo umbrales de pliegue',
      error: error.message
    });
  }
});

// ============================================
// PERÍMETROS MUSCULARES
// ============================================

/**
 * GET /api/nutrition/supplements/circumferences/current
 * Evalúa los cambios en perímetros musculares
 */
router.get('/circumferences/current', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Obtener las últimas 2 mediciones con perímetros
    const measurementsResult = await pool.query(
      `SELECT 
        measurement_date,
        biceps_cm,
        chest_cm,
        weight_kg
       FROM app.body_measurements
       WHERE user_id = $1 
         AND is_validated = TRUE
         AND biceps_cm IS NOT NULL
         AND chest_cm IS NOT NULL
       ORDER BY measurement_date DESC
       LIMIT 2`,
      [userId]
    );

    if (measurementsResult.rows.length < 2) {
      return res.status(200).json({
        success: false,
        message: 'Se necesitan al menos 2 mediciones con perímetros musculares'
      });
    }

    const [current, previous] = measurementsResult.rows;

    // Obtener fase actual
    const phaseResult = await pool.query(
      `SELECT current_phase FROM app.bridge_current_state WHERE user_id = $1`,
      [userId]
    );
    const currentPhase = phaseResult.rows[0]?.current_phase || 'maintenance';

    const evaluation = evaluateMuscleCircumferences(
      current,
      previous,
      currentPhase
    );

    res.json({
      ...evaluation,
      current_measurement_date: current.measurement_date,
      previous_measurement_date: previous.measurement_date
    });

  } catch (error) {
    console.error('[GET /circumferences/current] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error evaluando perímetros musculares',
      error: error.message
    });
  }
});

/**
 * GET /api/nutrition/supplements/circumferences/thresholds
 * Obtiene los umbrales de perímetros según fase
 */
router.get('/circumferences/thresholds', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Obtener fase actual
    const phaseResult = await pool.query(
      `SELECT current_phase FROM app.bridge_current_state WHERE user_id = $1`,
      [userId]
    );
    const currentPhase = phaseResult.rows[0]?.current_phase || 'maintenance';

    res.json({
      success: true,
      phase: currentPhase,
      thresholds: MUSCLE_CIRCUMFERENCE_THRESHOLDS,
      applicable_threshold: MUSCLE_CIRCUMFERENCE_THRESHOLDS[currentPhase] || {}
    });

  } catch (error) {
    console.error('[GET /circumferences/thresholds] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo umbrales de perímetros',
      error: error.message
    });
  }
});

// ============================================
// RESUMEN GENERAL
// ============================================

/**
 * GET /api/nutrition/supplements/summary
 * Obtiene un resumen completo de todos los complementos de control
 */
router.get('/summary', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const summary = {
      weight_loss_rate: null,
      skinfold: null,
      circumferences: null
    };

    // 1. Ritmo de pérdida
    try {
      const measurementsResult = await pool.query(
        `SELECT measurement_date, weight_kg
         FROM app.body_measurements
         WHERE user_id = $1 AND is_validated = TRUE
         ORDER BY measurement_date DESC
         LIMIT 2`,
        [userId]
      );

      if (measurementsResult.rows.length >= 2) {
        const [current, previous] = measurementsResult.rows;
        const weeklyWeightLoss = previous.weight_kg - current.weight_kg;
        summary.weight_loss_rate = await evaluateWeightLossRate(
          userId,
          weeklyWeightLoss,
          current.weight_kg
        );
      }
    } catch (err) {
      console.error('Error evaluando ritmo:', err);
    }

    // 2. Pliegue abdominal
    try {
      const skinfoldResult = await pool.query(
        `SELECT skinfold_abdominal_mm FROM app.body_measurements
         WHERE user_id = $1 AND is_validated = TRUE AND skinfold_abdominal_mm IS NOT NULL
         ORDER BY measurement_date DESC LIMIT 1`,
        [userId]
      );

      if (skinfoldResult.rows.length > 0) {
        const phaseResult = await pool.query(
          `SELECT current_phase FROM app.bridge_current_state WHERE user_id = $1`,
          [userId]
        );
        const phase = phaseResult.rows[0]?.current_phase || 'maintenance';
        
        summary.skinfold = await evaluateSkinfold(
          userId,
          skinfoldResult.rows[0].skinfold_abdominal_mm,
          phase
        );
      }
    } catch (err) {
      console.error('Error evaluando pliegue:', err);
    }

    // 3. Perímetros
    try {
      const circumferencesResult = await pool.query(
        `SELECT biceps_cm, chest_cm FROM app.body_measurements
         WHERE user_id = $1 AND is_validated = TRUE 
           AND biceps_cm IS NOT NULL AND chest_cm IS NOT NULL
         ORDER BY measurement_date DESC LIMIT 2`,
        [userId]
      );

      if (circumferencesResult.rows.length >= 2) {
        const phaseResult = await pool.query(
          `SELECT current_phase FROM app.bridge_current_state WHERE user_id = $1`,
          [userId]
        );
        const phase = phaseResult.rows[0]?.current_phase || 'maintenance';
        
        summary.circumferences = evaluateMuscleCircumferences(
          circumferencesResult.rows[0],
          circumferencesResult.rows[1],
          phase
        );
      }
    } catch (err) {
      console.error('Error evaluando perímetros:', err);
    }

    res.json({
      success: true,
      summary
    });

  } catch (error) {
    console.error('[GET /summary] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo resumen de complementos',
      error: error.message
    });
  }
});

export default router;
