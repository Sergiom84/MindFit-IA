/**
 * Endpoint genérico de generación de entrenamiento de "día único" por metodología.
 *
 * Generaliza el flujo single-day (hasta ahora exclusivo de HipertrofiaV2) para
 * que cualquier metodología compatible pueda usar el mismo reproductor in-app.
 * Despacha al generador específico según `methodology`.
 */

import express from 'express';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

import { generateSingleDayWorkout } from '../services/hipertrofiaV2/extraWorkoutService.js';
import { generateCalisteniaSingleDay } from '../services/singleDay/calisteniaSingleDay.js';
import { logger } from '../services/hipertrofiaV2/logger.js';
import { cleanupUserStaleSessions } from '../services/sessionCleanupService.js';

const router = express.Router();

// Normaliza el nombre de metodología recibido del frontend.
function normalizeMethodology(raw) {
  const m = String(raw || '').toLowerCase().trim();
  if (m.includes('calistenia')) return 'calistenia';
  if (m.includes('hipertrofia')) return 'hipertrofia';
  return m;
}

/**
 * POST /api/methodology-session/generate-single-day
 * Body: { methodology, nivel, isWeekendExtra, selectionMode, focusGroup }
 */
router.post('/generate-single-day', authenticateToken, async (req, res) => {
  const dbClient = await pool.connect();
  try {
    const userId = req.user?.userId || req.user?.id;
    const {
      methodology,
      nivel = 'Principiante',
      isWeekendExtra = false,
      selectionMode = 'full_body',
      focusGroup = null
    } = req.body;

    const method = normalizeMethodology(methodology);

    // Limpieza pre-generación: cerrar sesiones huérfanas
    const cleanupResult = await cleanupUserStaleSessions(userId);
    if (cleanupResult.cleaned > 0) {
      logger.info(`🧹 [METHODOLOGY-SINGLE-DAY] Pre-limpieza: ${cleanupResult.cleaned} sesiones/drafts limpiados`);
    }

    await dbClient.query('BEGIN');

    let result;
    if (method === 'calistenia') {
      result = await generateCalisteniaSingleDay(dbClient, userId, nivel, isWeekendExtra, {
        selectionMode,
        focusGroup
      });
    } else if (method === 'hipertrofia') {
      result = await generateSingleDayWorkout(dbClient, userId, nivel, isWeekendExtra, {
        selectionMode,
        focusGroup
      });
    } else {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: `Metodología no soportada para single-day: ${methodology}`
      });
    }

    await dbClient.query('COMMIT');

    res.json({
      success: true,
      message: 'Entrenamiento del día generado exitosamente',
      sessionId: result.sessionId,
      workout: result.workout,
      notes: [
        'Este entrenamiento es independiente y no afecta tu plan semanal',
        'Se guardará en tu histórico como entrenamiento extra'
      ]
    });
  } catch (error) {
    await dbClient.query('ROLLBACK');
    logger.error('❌ [METHODOLOGY-SINGLE-DAY] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar entrenamiento',
      details: error.message
    });
  } finally {
    dbClient.release();
  }
});

/**
 * POST /api/methodology-session/calistenia/session-result
 * Autorregulación de Calistenia: registra el resultado de una sesión completada
 * (RIR medio + si se cumplió el objetivo de reps) y devuelve la decisión de
 * ajuste para el próximo microciclo ('progress' | 'hold' | 'deload').
 * Body: { methodologyPlanId?, avgRir, targetMet }
 */
router.post('/calistenia/session-result', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { methodologyPlanId = null, avgRir, targetMet } = req.body;

    if (avgRir == null || typeof targetMet !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'avgRir (número) y targetMet (booleano) son requeridos'
      });
    }

    const result = await pool.query(
      `SELECT app.calistenia_register_session_result($1, $2, $3, $4) AS result`,
      [userId, methodologyPlanId, Number(avgRir), targetMet]
    );

    res.json({ success: true, ...result.rows[0].result });
  } catch (error) {
    logger.error('❌ [CALISTENIA-AUTOREG] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error registrando el resultado de la sesión',
      details: error.message
    });
  }
});

export default router;
