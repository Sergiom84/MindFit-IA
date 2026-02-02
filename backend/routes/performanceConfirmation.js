/**
 * PERFORMANCE CONFIRMATION ROUTES
 *
 * Endpoints:
 * - POST /performance               Registrar tendencia de rendimiento (sube/mantiene/baja/no_aplica)
 * - GET  /performance/check         Verificar bajada 2 semanas consecutivas
 * - GET  /icg-ipg/status            Obtener estado confirmado ICG/IPG/IEC (regla 2 semanas)
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { pool } from '../db.js';

const router = express.Router();

const VALID_TRENDS = ['sube', 'mantiene', 'baja', 'no_aplica'];
const VALID_FATIGUE_LEVELS = ['bajo', 'medio', 'alto', 'muy_alto'];
const VALID_INDICATORS = ['icg', 'ipg', 'iec'];

// ============================================================================
// POST /performance
// ============================================================================
router.post('/performance', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      measurement_date,
      performance_trend,
      performance_notes = null,
      session_count_last_week = null,
      avg_rir = null,
      fatigue_level = null,
      source = 'manual'
    } = req.body;

    if (!measurement_date) {
      return res.status(400).json({ success: false, error: 'measurement_date es requerido (YYYY-MM-DD)' });
    }

    if (!VALID_TRENDS.includes(performance_trend)) {
      return res.status(400).json({
        success: false,
        error: 'performance_trend inválido',
        valid: VALID_TRENDS
      });
    }

    if (fatigue_level && !VALID_FATIGUE_LEVELS.includes(fatigue_level)) {
      return res.status(400).json({
        success: false,
        error: 'fatigue_level inválido',
        valid: VALID_FATIGUE_LEVELS
      });
    }

    const result = await pool.query(
      `
        INSERT INTO app.training_performance_log (
          user_id, measurement_date, performance_trend,
          performance_notes, session_count_last_week,
          avg_rir, fatigue_level, source
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (user_id, measurement_date)
        DO UPDATE SET
          performance_trend = EXCLUDED.performance_trend,
          performance_notes = EXCLUDED.performance_notes,
          session_count_last_week = EXCLUDED.session_count_last_week,
          avg_rir = EXCLUDED.avg_rir,
          fatigue_level = EXCLUDED.fatigue_level,
          source = EXCLUDED.source
        RETURNING *
      `,
      [
        userId,
        measurement_date,
        performance_trend,
        performance_notes,
        session_count_last_week,
        avg_rir,
        fatigue_level,
        source
      ]
    );

    res.json({ success: true, performance: result.rows[0] });
  } catch (error) {
    console.error('[POST /performance-confirmation/performance] Error:', error);
    res.status(500).json({ success: false, error: 'Error registrando rendimiento' });
  }
});

// ============================================================================
// GET /performance/check
// ============================================================================
router.get('/performance/check', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT * FROM app.check_performance_drop($1)`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        has_data: false,
        message: 'No hay datos suficientes para evaluar rendimiento'
      });
    }

    res.json({
      success: true,
      has_data: true,
      ...result.rows[0]
    });
  } catch (error) {
    console.error('[GET /performance-confirmation/performance/check] Error:', error);
    res.status(500).json({ success: false, error: 'Error verificando rendimiento' });
  }
});

// ============================================================================
// GET /icg-ipg/status?indicator_type=icg|ipg|iec
// ============================================================================
router.get('/icg-ipg/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const indicatorType = String(req.query.indicator_type || 'icg').toLowerCase();

    if (!VALID_INDICATORS.includes(indicatorType)) {
      return res.status(400).json({
        success: false,
        error: 'indicator_type inválido',
        valid: VALID_INDICATORS
      });
    }

    const result = await pool.query(
      `SELECT * FROM app.get_confirmed_status($1, $2)`,
      [userId, indicatorType]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        has_data: false,
        indicator_type: indicatorType
      });
    }

    res.json({
      success: true,
      has_data: true,
      indicator_type: indicatorType,
      status: result.rows[0]
    });
  } catch (error) {
    console.error('[GET /performance-confirmation/icg-ipg/status] Error:', error);
    res.status(500).json({ success: false, error: 'Error obteniendo estado confirmado' });
  }
});

export default router;

