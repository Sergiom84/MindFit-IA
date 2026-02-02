/**
 * Rutas API para Sistema de Calibración Nutricional
 * Endpoints para mediciones corporales, validación y calibración automática
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  saveMeasurement,
  validateWaistMeasurement,
  calculateWeightAverage,
  evaluateCalibration,
  applyCalibration,
  shouldTriggerCalibration,
  getCalibrationHistory,
  runAutoCalibration
} from '../services/nutritionCalibrator.js';
import pool from '../db.js';

const router = express.Router();

// ============================================================================
// POST /api/nutrition/measurements
// Guarda una nueva medición corporal con validación automática
// ============================================================================
router.post('/measurements', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const measurement = req.body;

    // Validar datos requeridos
    if (!measurement.peso_kg) {
      return res.status(400).json({
        success: false,
        error: 'El peso es obligatorio'
      });
    }

    // Guardar medición con validación
    const result = await saveMeasurement(userId, measurement);

    res.json({
      success: true,
      measurement: result,
      message: result.flagged 
        ? 'Medición guardada pero marcada como sospechosa. Por favor, verifica los datos.'
        : 'Medición guardada correctamente'
    });

  } catch (error) {
    console.error('Error guardando medición:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error guardando medición corporal' 
    });
  }
});

// ============================================================================
// GET /api/nutrition/measurements
// Obtiene el historial de mediciones del usuario
// ============================================================================
router.get('/measurements', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 30;
    const includeFlagged = req.query.include_flagged === 'true';

    const query = `
      SELECT 
        id, peso_kg, cintura_cm, cuello_cm, cadera_cm, pecho_cm,
        brazo_cm, pierna_cm, bodyfat_percent, muscle_mass_kg,
        measurement_date, source, flagged_suspicious, 
        suspension_reason, validated, notes, created_at
      FROM app.user_body_measurements
      WHERE user_id = $1
      ${!includeFlagged ? 'AND flagged_suspicious = FALSE' : ''}
      ORDER BY measurement_date DESC, created_at DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [userId, limit]);

    res.json({
      success: true,
      measurements: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('Error obteniendo mediciones:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error obteniendo historial de mediciones' 
    });
  }
});

// ============================================================================
// GET /api/nutrition/measurements/latest
// Obtiene la última medición válida del usuario
// ============================================================================
router.get('/measurements/latest', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT 
        id, peso_kg, cintura_cm, cuello_cm, cadera_cm, pecho_cm,
        brazo_cm, pierna_cm, bodyfat_percent, muscle_mass_kg,
        measurement_date, source, notes, created_at
       FROM app.user_body_measurements
       WHERE user_id = $1
       AND validated = TRUE
       AND flagged_suspicious = FALSE
       ORDER BY measurement_date DESC, created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        hasMeasurement: false,
        message: 'No hay mediciones registradas'
      });
    }

    res.json({
      success: true,
      hasMeasurement: true,
      measurement: result.rows[0]
    });

  } catch (error) {
    console.error('Error obteniendo última medición:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error obteniendo última medición' 
    });
  }
});

// ============================================================================
// GET /api/nutrition/measurements/average
// Calcula la media de peso de los últimos N días
// ============================================================================
router.get('/measurements/average', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 7;
    const minMeasurements = parseInt(req.query.min_measurements) || 5;

    const average = await calculateWeightAverage(userId, days, minMeasurements);

    if (!average) {
      return res.json({
        success: true,
        hasAverage: false,
        message: `Insuficientes mediciones en los últimos ${days} días (requiere al menos ${minMeasurements})`
      });
    }

    res.json({
      success: true,
      hasAverage: true,
      average: {
        mediaPeso: average.mediaPeso,
        numMeasurements: average.numMeasurements,
        days,
        calculatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error calculando media de peso:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error calculando media de peso' 
    });
  }
});

// ============================================================================
// POST /api/nutrition/measurements/validate-waist
// Valida una medición de cintura sin guardarla
// ============================================================================
router.post('/measurements/validate-waist', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { waist_cm, weight_kg } = req.body;

    if (!waist_cm || !weight_kg) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere cintura_cm y peso_kg'
      });
    }

    const validation = await validateWaistMeasurement(userId, waist_cm, weight_kg);

    res.json({
      success: true,
      validation
    });

  } catch (error) {
    console.error('Error validando cintura:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error validando medición de cintura' 
    });
  }
});

// ============================================================================
// POST /api/nutrition/calibrate
// Ejecuta una calibración nutricional manual
// ============================================================================
router.post('/calibrate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Obtener objetivo del usuario
    const profileResult = await pool.query(
      `SELECT objetivo FROM app.nutrition_profiles WHERE user_id = $1`,
      [userId]
    );

    if (profileResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No existe perfil nutricional. Configura tu perfil primero.'
      });
    }

    const { objetivo } = profileResult.rows[0];

    // Evaluar calibración
    const calibration = await evaluateCalibration(userId, objetivo);

    if (!calibration.canCalibrate) {
      return res.status(400).json({
        success: false,
        canCalibrate: false,
        reason: calibration.reason
      });
    }

    // Aplicar calibración
    calibration.objetivo = objetivo;
    const result = await applyCalibration(userId, calibration);

    res.json({
      success: true,
      calibration: {
        ...calibration,
        calibrationId: result.calibrationId,
        applied: result.applied
      },
      message: calibration.shouldAdjust
        ? `Calibración aplicada: ${calibration.reason}`
        : `Calibración registrada: ${calibration.reason}`
    });

  } catch (error) {
    console.error('Error en calibración:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error ejecutando calibración nutricional' 
    });
  }
});

// ============================================================================
// GET /api/nutrition/calibrate/evaluate
// Evalúa si se requiere calibración SIN aplicarla
// ============================================================================
router.get('/calibrate/evaluate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Obtener objetivo del usuario
    const profileResult = await pool.query(
      `SELECT objetivo FROM app.nutrition_profiles WHERE user_id = $1`,
      [userId]
    );

    if (profileResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No existe perfil nutricional'
      });
    }

    const { objetivo } = profileResult.rows[0];

    // Evaluar calibración
    const calibration = await evaluateCalibration(userId, objetivo);

    res.json({
      success: true,
      evaluation: calibration
    });

  } catch (error) {
    console.error('Error evaluando calibración:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error evaluando calibración' 
    });
  }
});

// ============================================================================
// GET /api/nutrition/calibrate/should-calibrate
// Verifica si el usuario debe realizar calibración
// ============================================================================
router.get('/calibrate/should-calibrate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await shouldTriggerCalibration(userId);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Error verificando calibración:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error verificando necesidad de calibración' 
    });
  }
});

// ============================================================================
// GET /api/nutrition/calibrate/history
// Obtiene el historial de calibraciones del usuario
// ============================================================================
router.get('/calibrate/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;

    const history = await getCalibrationHistory(userId, limit);

    res.json({
      success: true,
      calibrations: history,
      total: history.length
    });

  } catch (error) {
    console.error('Error obteniendo historial de calibraciones:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error obteniendo historial de calibraciones' 
    });
  }
});

// ============================================================================
// POST /api/nutrition/calibrate/auto
// Ejecuta calibración automática (verifica + evalúa + aplica)
// ============================================================================
router.post('/calibrate/auto', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await runAutoCalibration(userId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        executed: false,
        reason: result.reason || result.error
      });
    }

    res.json({
      success: true,
      ...result,
      message: result.calibration.shouldAdjust
        ? `Calibración automática aplicada: ${result.calibration.reason}`
        : `Calibración evaluada: ${result.calibration.reason}`
    });

  } catch (error) {
    console.error('Error en calibración automática:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error ejecutando calibración automática' 
    });
  }
});

// ============================================================================
// GET /api/nutrition/calibrate/config
// Obtiene la configuración de calibración del usuario
// ============================================================================
router.get('/calibrate/config', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT 
        auto_calibrate, calibration_frequency_days,
        min_measurements_required, max_adjustment_kcal,
        notify_calibration, notify_suspicious_measurement,
        last_calibration_date, next_calibration_date
       FROM app.user_calibration_config
       WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      // Crear configuración por defecto
      await pool.query(
        `INSERT INTO app.user_calibration_config (user_id)
         VALUES ($1)`,
        [userId]
      );

      return res.json({
        success: true,
        config: {
          auto_calibrate: true,
          calibration_frequency_days: 14,
          min_measurements_required: 5,
          max_adjustment_kcal: 250,
          notify_calibration: true,
          notify_suspicious_measurement: true,
          last_calibration_date: null,
          next_calibration_date: null
        }
      });
    }

    res.json({
      success: true,
      config: result.rows[0]
    });

  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error obteniendo configuración de calibración' 
    });
  }
});

// ============================================================================
// PUT /api/nutrition/calibrate/config
// Actualiza la configuración de calibración del usuario
// ============================================================================
router.put('/calibrate/config', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      auto_calibrate,
      calibration_frequency_days,
      min_measurements_required,
      max_adjustment_kcal,
      notify_calibration,
      notify_suspicious_measurement
    } = req.body;

    // Validaciones
    if (calibration_frequency_days !== undefined && 
        (calibration_frequency_days < 7 || calibration_frequency_days > 60)) {
      return res.status(400).json({
        success: false,
        error: 'La frecuencia debe estar entre 7 y 60 días'
      });
    }

    if (min_measurements_required !== undefined && 
        (min_measurements_required < 3 || min_measurements_required > 7)) {
      return res.status(400).json({
        success: false,
        error: 'Las mediciones mínimas deben estar entre 3 y 7'
      });
    }

    if (max_adjustment_kcal !== undefined && 
        (max_adjustment_kcal < 100 || max_adjustment_kcal > 500)) {
      return res.status(400).json({
        success: false,
        error: 'El ajuste máximo debe estar entre 100 y 500 kcal'
      });
    }

    // Construir query de actualización
    const updates = [];
    const values = [userId];
    let paramIndex = 2;

    if (auto_calibrate !== undefined) {
      updates.push(`auto_calibrate = $${paramIndex++}`);
      values.push(auto_calibrate);
    }
    if (calibration_frequency_days !== undefined) {
      updates.push(`calibration_frequency_days = $${paramIndex++}`);
      values.push(calibration_frequency_days);
    }
    if (min_measurements_required !== undefined) {
      updates.push(`min_measurements_required = $${paramIndex++}`);
      values.push(min_measurements_required);
    }
    if (max_adjustment_kcal !== undefined) {
      updates.push(`max_adjustment_kcal = $${paramIndex++}`);
      values.push(max_adjustment_kcal);
    }
    if (notify_calibration !== undefined) {
      updates.push(`notify_calibration = $${paramIndex++}`);
      values.push(notify_calibration);
    }
    if (notify_suspicious_measurement !== undefined) {
      updates.push(`notify_suspicious_measurement = $${paramIndex++}`);
      values.push(notify_suspicious_measurement);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No se proporcionaron campos para actualizar'
      });
    }

    updates.push('updated_at = NOW()');

    // Upsert configuración
    await pool.query(
      `INSERT INTO app.user_calibration_config (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET ${updates.join(', ')}`,
      values
    );

    res.json({
      success: true,
      message: 'Configuración de calibración actualizada correctamente'
    });

  } catch (error) {
    console.error('Error actualizando configuración:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error actualizando configuración de calibración' 
    });
  }
});

// ============================================================================
// POST /api/nutrition/calibrate/feedback
// Registra feedback del usuario sobre una calibración
// ============================================================================
router.post('/calibrate/feedback', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { calibration_id, feedback, performance_notes } = req.body;

    if (!calibration_id) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere calibration_id'
      });
    }

    // Verificar que la calibración pertenece al usuario
    const verifyResult = await pool.query(
      `SELECT id FROM app.nutrition_calibrations
       WHERE id = $1 AND user_id = $2`,
      [calibration_id, userId]
    );

    if (verifyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Calibración no encontrada'
      });
    }

    // Actualizar feedback
    await pool.query(
      `UPDATE app.nutrition_calibrations
       SET user_feedback = $1,
           performance_notes = $2
       WHERE id = $3`,
      [feedback, performance_notes, calibration_id]
    );

    res.json({
      success: true,
      message: 'Feedback registrado correctamente'
    });

  } catch (error) {
    console.error('Error registrando feedback:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error registrando feedback' 
    });
  }
});

export default router;
