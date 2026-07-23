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

import { generateSingleDayWorkout } from '../services/hipertrofia/extraWorkoutService.js';
import { generateCalisteniaSingleDay } from '../services/singleDay/calisteniaSingleDay.js';
import { generateCrossFitSingleDay } from '../services/singleDay/crossfitSingleDay.js';
import { generateCasaSingleDay } from '../services/singleDay/casaSingleDay.js';
import { generateFuncionalSingleDay } from '../services/singleDay/funcionalSingleDay.js';
import { generateHalterofiliaSingleDay } from '../services/singleDay/halterofiliaSingleDay.js';
import { generatePowerliftingSingleDay } from '../services/singleDay/powerliftingSingleDay.js';
import { generateHeavyDutySingleDay } from '../services/singleDay/heavyDutySingleDay.js';
import { generatePreferenceSingleDay } from '../services/singleDay/preferenceSingleDay.js';
import { logger } from '../services/hipertrofia/logger.js';
import { cleanupUserStaleSessions } from '../services/sessionCleanupService.js';

const router = express.Router();

// Mensajes públicos conocidos por código de error tipado (whitelist deliberada, PR-CAL-01,
// corrección de Sergio: nunca exponer `error.message` crudo aunque el error traiga `statusCode`).
const PUBLIC_ERROR_MESSAGES = {
  CALISTHENICS_ASSESSMENT_REFER: 'Necesitas una valoración profesional antes de generar el entrenamiento.',
  CALISTHENICS_LEVEL_REQUIRED: 'Selecciona un nivel o confirma continuar con un nivel provisional antes de generar el entrenamiento.'
};

// Normaliza el nombre de metodología recibido del frontend.
function normalizeMethodology(raw) {
  const m = String(raw || '').toLowerCase().trim();
  if (m.includes('calistenia')) return 'calistenia';
  if (m.includes('crossfit') || m.includes('cross-fit')) return 'crossfit';
  if (m.includes('casa')) return 'casa';
  if (m.includes('funcional') || m.includes('functional')) return 'funcional';
  if (m.includes('halterofilia') || m.includes('halterofília') || m.includes('weightlifting')) return 'halterofilia';
  if (m.includes('powerlifting') || m.includes('power-lifting')) return 'powerlifting';
  if (m.includes('heavy') || m.includes('heavy_duty') || m.includes('heavy-duty')) return 'heavy_duty';
  if (m.includes('hipertrofia')) return 'hipertrofia';
  return m;
}

// Feedback subjetivo OPCIONAL ("aporte") para la autorregulación. Acepta un número
// directo (-1..+1) o un 'feeling' ('facil'|'normal'|'dificil'). Devuelve un score
// acotado en [-1, 1] o null si no aplica. Lo objetivo manda; esto solo matiza.
const FEELING_MAP = { facil: 1, easy: 1, me_gusta: 1, normal: 0, justo: 0, dificil: -1, hard: -1, me_cuesta: -1 };
function resolveSubjective(subjective = null, feeling = null) {
  let score = subjective;
  if (score == null && feeling != null) {
    score = FEELING_MAP[String(feeling).toLowerCase()] ?? null;
  }
  if (score == null) return null;
  score = Math.max(-1, Math.min(1, Number(score)));
  return Number.isNaN(score) ? null : score;
}

// Tras la decisión base de autorregulación, aplica el deload por ESTANCAMIENTO
// (meseta: demasiadas sesiones sin progresar) común a todas las metodologías.
// Muta y devuelve el objeto de resultado con la decisión posiblemente ajustada.
async function applyStallDeload(userId, methodology, result) {
  try {
    const q = await pool.query(
      `SELECT app.apply_stall_deload($1, $2, $3) AS s`,
      [userId, methodology, result?.decision || 'hold']
    );
    const s = q.rows[0].s;
    result.decision = s.decision;
    result.stall_streak = s.stall_streak;
    result.plateau_deload = s.plateau_deload;
    if (s.plateau_deload) result.deload_suggested = true;
  } catch (e) {
    logger.error('⚠️ [STALL-DELOAD] no aplicado:', e?.message);
  }
  return result;
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
      focusGroup = null,
      equipment = null,
      assessmentInput = null
    } = req.body;

    const method = normalizeMethodology(methodology);

    // Limpieza pre-generación: cerrar sesiones huérfanas
    const cleanupResult = await cleanupUserStaleSessions(userId);
    if (cleanupResult.cleaned > 0) {
      logger.info(`🧹 [METHODOLOGY-SINGLE-DAY] Pre-limpieza: ${cleanupResult.cleaned} sesiones/drafts limpiados`);
    }

    await dbClient.query('BEGIN');

    let result;
    if (selectionMode === 'liked' || selectionMode === 'disliked') {
      // Modo "extra" por preferencias: hoy los ejercicios que te gustan (liked)
      // o los que te cuestan/no te gustan (disliked), según tus valoraciones.
      result = await generatePreferenceSingleDay(dbClient, userId, nivel, selectionMode, method, isWeekendExtra);
    } else if (method === 'calistenia') {
      result = await generateCalisteniaSingleDay(dbClient, userId, nivel, isWeekendExtra, {
        selectionMode,
        focusGroup,
        // PR-CAL-01: painStatus/demonstratedLevel/context capturados en el frontend (antes solo
        // llegaba `nivel`, sin canal para el assessment determinista).
        assessmentInput: assessmentInput || {}
      });
    } else if (method === 'crossfit') {
      result = await generateCrossFitSingleDay(dbClient, userId, nivel, isWeekendExtra, {
        selectionMode,
        focusGroup
      });
    } else if (method === 'casa') {
      result = await generateCasaSingleDay(dbClient, userId, nivel, isWeekendExtra, {
        selectionMode,
        focusGroup,
        equipment
      });
    } else if (method === 'funcional') {
      result = await generateFuncionalSingleDay(dbClient, userId, nivel, isWeekendExtra, {
        selectionMode,
        focusGroup
      });
    } else if (method === 'halterofilia') {
      result = await generateHalterofiliaSingleDay(dbClient, userId, nivel, isWeekendExtra, {
        selectionMode,
        focusGroup
      });
    } else if (method === 'powerlifting') {
      result = await generatePowerliftingSingleDay(dbClient, userId, nivel, isWeekendExtra, {
        selectionMode,
        focusGroup
      });
    } else if (method === 'heavy_duty') {
      result = await generateHeavyDutySingleDay(dbClient, userId, nivel, isWeekendExtra, {
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
    logger.error('❌ [METHODOLOGY-SINGLE-DAY] Error:', error?.stack || error?.message);

    // Faltan valoraciones para el modo por preferencias: error de usuario, no del servidor.
    // `statusCode` tipado (p.ej. CALISTHENICS_ASSESSMENT_REFER/CALISTHENICS_LEVEL_REQUIRED) manda
    // si existe. Nunca se expone `error.message` crudo salvo que el código esté en la whitelist.
    const status = Number.isInteger(error?.statusCode)
      ? error.statusCode
      : error?.code === 'INSUFFICIENT_PREFERENCES' ? 400 : 500;

    if (status >= 500) {
      return res.status(500).json({ success: false, error: 'Error al generar entrenamiento.' });
    }

    const publicMessage = error?.code === 'INSUFFICIENT_PREFERENCES'
      ? error.message
      : PUBLIC_ERROR_MESSAGES[error?.code] || 'Solicitud inválida.';

    res.status(status).json({
      success: false,
      error: publicMessage,
      ...(error?.code ? { code: error.code } : {}),
      ...(error?.publicEvaluation ? { evaluation: error.publicEvaluation } : {})
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
    const { methodologyPlanId = null, avgRir, targetMet, subjective = null, feeling = null } = req.body;

    if (avgRir == null || typeof targetMet !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'avgRir (número) y targetMet (booleano) son requeridos'
      });
    }

    const subjectiveScore = resolveSubjective(subjective, feeling);

    const result = await pool.query(
      `SELECT app.calistenia_register_session_result($1, $2, $3, $4, $5) AS result`,
      [userId, methodologyPlanId, Number(avgRir), targetMet, subjectiveScore]
    );

    const decision = await applyStallDeload(userId, 'calistenia', result.rows[0].result);
    res.json({ success: true, ...decision });
  } catch (error) {
    logger.error('❌ [CALISTENIA-AUTOREG] Error:', error?.stack || error?.message);
    res.status(500).json({
      success: false,
      error: 'Error registrando el resultado de la sesión'
    });
  }
});

/**
 * POST /api/methodology-session/funcional/session-result
 * Autorregulación de Funcional (series×reps×RIR, mismo modelo que Calistenia):
 * registra el RIR medio + si se cumplió el objetivo de reps y devuelve la
 * decisión de ajuste del próximo microciclo ('progress' | 'hold' | 'deload').
 * Body: { methodologyPlanId?, avgRir, targetMet }
 */
router.post('/funcional/session-result', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { methodologyPlanId = null, avgRir, targetMet, subjective = null, feeling = null } = req.body;

    if (avgRir == null || typeof targetMet !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'avgRir (número) y targetMet (booleano) son requeridos'
      });
    }

    const subjectiveScore = resolveSubjective(subjective, feeling);

    const result = await pool.query(
      `SELECT app.funcional_register_session_result($1, $2, $3, $4, $5) AS result`,
      [userId, methodologyPlanId, Number(avgRir), targetMet, subjectiveScore]
    );

    const decision = await applyStallDeload(userId, 'funcional', result.rows[0].result);
    res.json({ success: true, ...decision });
  } catch (error) {
    logger.error('❌ [FUNCIONAL-AUTOREG] Error:', error?.stack || error?.message);
    res.status(500).json({
      success: false,
      error: 'Error registrando el resultado de la sesión'
    });
  }
});

/**
 * POST /api/methodology-session/casa/session-result
 * Autorregulación de Entrenamiento en Casa (series×reps×RIR, mismo modelo que
 * Calistenia/Funcional): registra el RIR medio + si se cumplió el objetivo y
 * devuelve la decisión de ajuste del próximo microciclo
 * ('progress' | 'hold' | 'deload').
 * Body: { methodologyPlanId?, avgRir, targetMet }
 */
router.post('/casa/session-result', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { methodologyPlanId = null, avgRir, targetMet, subjective = null, feeling = null } = req.body;

    if (avgRir == null || typeof targetMet !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'avgRir (número) y targetMet (booleano) son requeridos'
      });
    }

    const subjectiveScore = resolveSubjective(subjective, feeling);

    const result = await pool.query(
      `SELECT app.casa_register_session_result($1, $2, $3, $4, $5) AS result`,
      [userId, methodologyPlanId, Number(avgRir), targetMet, subjectiveScore]
    );

    const decision = await applyStallDeload(userId, 'casa', result.rows[0].result);
    res.json({ success: true, ...decision });
  } catch (error) {
    logger.error('❌ [CASA-AUTOREG] Error:', error?.stack || error?.message);
    res.status(500).json({
      success: false,
      error: 'Error registrando el resultado de la sesión'
    });
  }
});

/**
 * POST /api/methodology-session/crossfit/wod-result
 * Autorregulación de CrossFit: registra el resultado de un WOD completado
 * (RPE 1-10 + si se completó dentro del time cap + escala usada) y devuelve la
 * decisión de ajuste ('progress' | 'hold' | 'deload').
 * Body: { methodologyPlanId?, rpe, completed, scale }
 */
router.post('/crossfit/wod-result', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { methodologyPlanId = null, rpe, completed, scale = 'rx', subjective = null, feeling = null } = req.body;

    if (rpe == null || typeof completed !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'rpe (número 1-10) y completed (booleano) son requeridos'
      });
    }

    const subjectiveScore = resolveSubjective(subjective, feeling);

    const result = await pool.query(
      `SELECT app.crossfit_register_wod_result($1, $2, $3, $4, $5, $6) AS result`,
      [userId, methodologyPlanId, Number(rpe), completed, String(scale), subjectiveScore]
    );

    const decision = await applyStallDeload(userId, 'crossfit', result.rows[0].result);
    res.json({ success: true, ...decision });
  } catch (error) {
    logger.error('❌ [CROSSFIT-AUTOREG] Error:', error?.stack || error?.message);
    res.status(500).json({
      success: false,
      error: 'Error registrando el resultado del WOD'
    });
  }
});

/**
 * POST /api/methodology-session/halterofilia/session-result
 * Autorregulación de Halterofilia (disciplina de FUERZA): registra el resultado
 * de una sesión completada (RPE 1-10 + si se alcanzó la carga objetivo + si la
 * técnica fue sólida) y devuelve la decisión de ajuste de CARGA para la próxima
 * sesión ('progress' | 'hold' | 'deload').
 * Body: { methodologyPlanId?, rpe, targetMet, goodTechnique }
 */
router.post('/halterofilia/session-result', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { methodologyPlanId = null, rpe, targetMet, goodTechnique = true, subjective = null, feeling = null } = req.body;

    if (rpe == null || typeof targetMet !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'rpe (número 1-10) y targetMet (booleano) son requeridos'
      });
    }

    const subjectiveScore = resolveSubjective(subjective, feeling);

    const result = await pool.query(
      `SELECT app.halterofilia_register_session_result($1, $2, $3, $4, $5, $6) AS result`,
      [userId, methodologyPlanId, Number(rpe), targetMet, Boolean(goodTechnique), subjectiveScore]
    );

    const decision = await applyStallDeload(userId, 'halterofilia', result.rows[0].result);
    res.json({ success: true, ...decision });
  } catch (error) {
    logger.error('❌ [HALTEROFILIA-AUTOREG] Error:', error?.stack || error?.message);
    res.status(500).json({
      success: false,
      error: 'Error registrando el resultado de la sesión'
    });
  }
});

/**
 * POST /api/methodology-session/powerlifting/session-result
 * Autorregulación de Powerlifting (disciplina de FUERZA MÁXIMA): registra el
 * resultado de una sesión completada (RPE 1-10 + si se alcanzó la CARGA objetivo
 * + si la TÉCNICA de competición fue sólida) y devuelve la decisión de ajuste de
 * CARGA para la próxima sesión ('progress' | 'hold' | 'deload').
 * Body: { methodologyPlanId?, rpe, targetMet, goodTechnique }
 */
router.post('/powerlifting/session-result', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { methodologyPlanId = null, rpe, targetMet, goodTechnique = true, subjective = null, feeling = null } = req.body;

    if (rpe == null || typeof targetMet !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'rpe (número 1-10) y targetMet (booleano) son requeridos'
      });
    }

    const subjectiveScore = resolveSubjective(subjective, feeling);

    const result = await pool.query(
      `SELECT app.powerlifting_register_session_result($1, $2, $3, $4, $5, $6) AS result`,
      [userId, methodologyPlanId, Number(rpe), targetMet, Boolean(goodTechnique), subjectiveScore]
    );

    const decision = await applyStallDeload(userId, 'powerlifting', result.rows[0].result);
    res.json({ success: true, ...decision });
  } catch (error) {
    logger.error('❌ [POWERLIFTING-AUTOREG] Error:', error?.stack || error?.message);
    res.status(500).json({
      success: false,
      error: 'Error registrando el resultado de la sesión'
    });
  }
});

/**
 * POST /api/methodology-session/heavy-duty/session-result
 * Autorregulación de Heavy Duty (HIT/Mentzer, disciplina de INTENSIDAD/FALLO):
 * registra si la serie se llevó al FALLO muscular y si se alcanzó el TOPE del
 * rango de repeticiones, y devuelve la decisión de ajuste de CARGA por doble
 * progresión reps→carga ('progress' | 'hold' | 'deload').
 * Body: { methodologyPlanId?, reachedFailure, targetMet }
 */
router.post('/heavy-duty/session-result', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { methodologyPlanId = null, reachedFailure, targetMet, subjective = null, feeling = null } = req.body;

    if (typeof reachedFailure !== 'boolean' || typeof targetMet !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'reachedFailure (booleano) y targetMet (booleano) son requeridos'
      });
    }

    const subjectiveScore = resolveSubjective(subjective, feeling);

    const result = await pool.query(
      `SELECT app.heavy_duty_register_session_result($1, $2, $3, $4, $5) AS result`,
      [userId, methodologyPlanId, Boolean(reachedFailure), Boolean(targetMet), subjectiveScore]
    );

    const decision = await applyStallDeload(userId, 'heavy-duty', result.rows[0].result);
    res.json({ success: true, ...decision });
  } catch (error) {
    logger.error('❌ [HEAVY-DUTY-AUTOREG] Error:', error?.stack || error?.message);
    res.status(500).json({
      success: false,
      error: 'Error registrando el resultado de la sesión'
    });
  }
});

export default router;
