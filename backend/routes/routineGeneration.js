/**
 * Routine Generation Routes - Thin Controllers
 * Refactored: Service Layer Architecture
 *
 * @module routes/routineGeneration
 * @version 3.0.0 (Refactored)
 *
 * All business logic delegated to services in backend/services/routineGeneration/
 * This file contains ONLY routing and error handling.
 */

import express from 'express';
import authenticateToken from '../middleware/auth.js';
import {
  // Orchestrator
  evaluateUserLevel,
  generateMethodologyPlan,
  getMethodologyLevels,
  getSupportedMethodologies,

  // Utilities
  cleanUserDrafts,
  validateRoutineRequest,
  logger,

  // Repositories
  getActivePlan,
  updatePlanStatus
} from '../services/routineGeneration/index.js';
import { getUserFullProfile } from '../services/routineGeneration/database/userRepository.js';
import { buildProfileAwarePlanData } from '../services/userProfileContract.js';

const router = express.Router();

// Mensajes públicos conocidos por código de error tipado. Whitelist deliberada (PR-CAL-01,
// corrección de Sergio): un `statusCode` tipado NO basta por sí solo para confiar en
// `error.message` — solo estos códigos reconocidos exponen texto al cliente; todo lo demás (y
// cualquier 5xx) cae al mensaje genérico. El log completo (stack/mensaje real) va solo a `logger`.
const PUBLIC_ERROR_MESSAGES = {
  CALISTHENICS_ASSESSMENT_REFER: 'Necesitas una valoración profesional antes de generar el entrenamiento.',
  CALISTHENICS_LEVEL_REQUIRED: 'Selecciona un nivel o confirma continuar con un nivel provisional antes de generar el entrenamiento.',
  CALISTHENICS_LEVEL_UNRECOGNIZED: 'El nivel indicado no es válido para esta metodología.'
};
const GENERIC_CLIENT_ERROR_MESSAGE = 'Solicitud inválida.';
const GENERIC_SERVER_ERROR_MESSAGE = 'Error interno durante la generación. Inténtalo de nuevo más tarde.';

/**
 * Responde un error de generación honrando un `statusCode` de dominio tipado (p.ej. 422 de
 * calistenia por nivel no reconocido o assessment 'refer'). Nunca expone `error.message` crudo:
 * los 5xx siempre devuelven un mensaje genérico fijo, y los 4xx solo exponen el mensaje si el
 * `code` está en la whitelist `PUBLIC_ERROR_MESSAGES` (PR-CAL-01, corrección de Sergio — sanear de
 * raíz, no solo por tener `statusCode`). Si el error trae `publicEvaluation` (p.ej. el envelope de
 * `CALISTHENICS_ASSESSMENT_REFER`), se propaga tal cual bajo `evaluation`.
 */
function respondGenerationError(res, context, error) {
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  logger.error(`❌ ${context} (${status}):`, error?.stack || error?.message);

  if (status >= 500) {
    return res.status(500).json({ success: false, error: GENERIC_SERVER_ERROR_MESSAGE });
  }

  const code = error?.code;
  const publicMessage = (code && PUBLIC_ERROR_MESSAGES[code]) || GENERIC_CLIENT_ERROR_MESSAGE;
  res.status(status).json({
    success: false,
    error: publicMessage,
    ...(code ? { code } : {}),
    ...(error?.publicEvaluation ? { evaluation: error.publicEvaluation } : {})
  });
}

// =========================================
// SPECIALIST ENDPOINTS - EVALUATION
// Pattern: /specialist/:methodology/evaluate
// =========================================

/**
 * POST /api/routine-generation/specialist/:methodology/evaluate
 * Evaluate user profile for a specific methodology
 * Supports: calistenia, crossfit, hipertrofia, powerlifting, etc.
 */
router.post('/specialist/:methodology/evaluate', authenticateToken, async (req, res) => {
  const userId = req.user?.userId || req.user?.id;
  const { methodology } = req.params;
  // PR-CAL-01: painStatus/demonstratedLevel/context capturados en el frontend viajan aquí y llegan
  // hasta assessCalistenia (antes solo se pasaba userId y estos campos nunca llegaban al backend).
  const assessmentInput = req.body?.assessmentInput || {};

  try {
    logger.info(`📊 Evaluando nivel de ${methodology} para usuario ${userId}`);

    const evaluation = await evaluateUserLevel(methodology, userId, assessmentInput);
    res.json(evaluation);

  } catch (error) {
    respondGenerationError(res, `Error en evaluación ${methodology}`, error);
  }
});

// =========================================
// SPECIALIST ENDPOINTS - GENERATION
// Pattern: /specialist/:methodology/generate
// =========================================

/**
 * POST /api/routine-generation/specialist/:methodology/generate
 * Generate specialized training plan for a methodology
 */
router.post('/specialist/:methodology/generate', authenticateToken, async (req, res) => {
  const userId = req.user?.userId || req.user?.id;
  const { methodology } = req.params;
  const planData = req.body;

  try {
    logger.info(`🏗️ Generando plan de ${methodology} para usuario ${userId}`);

    // Clean drafts before generation
    await cleanUserDrafts(userId);

    // Delegate to methodology orchestrator
    const result = await generateMethodologyPlan(methodology, userId, planData);
    res.json(result);

  } catch (error) {
    respondGenerationError(res, `Error generando plan ${methodology}`, error);
  }
});

// =========================================
// AI ENDPOINTS
// =========================================

/**
 * POST /api/routine-generation/ai/methodology
 * AI-powered automatic methodology generation
 * AI decides the best methodology based on user profile
 */
router.post('/ai/methodology', authenticateToken, async (req, res) => {
  const userId = req.user?.userId || req.user?.id;
  const planData = req.body;

  try {
    logger.info(`🤖 Generación automática IA para usuario ${userId}`);

    // Validate request
    validateRoutineRequest(planData);

    // Clean drafts
    await cleanUserDrafts(userId);

    const userProfile = await getUserFullProfile(userId);
    const personalizedPlanData = buildProfileAwarePlanData(planData, userProfile);
    const result = await generateMethodologyPlan(
      personalizedPlanData.methodology,
      userId,
      personalizedPlanData
    );

    res.json(result);

  } catch (error) {
    respondGenerationError(res, 'Error en generación IA', error);
  }
});

/**
 * POST /api/routine-generation/ai/gym-routine
 * AI-generated gym routine
 */
router.post('/ai/gym-routine', authenticateToken, async (req, res) => {
  const userId = req.user?.userId || req.user?.id;
  const routineData = req.body;

  try {
    logger.info(`🏋️ Generando rutina de gimnasio IA para usuario ${userId}`);

    await cleanUserDrafts(userId);

    const result = await generateMethodologyPlan('gimnasio', userId, routineData);
    res.json(result);

  } catch (error) {
    respondGenerationError(res, 'Error en rutina gimnasio IA', error);
  }
});

// =========================================
// MANUAL ENDPOINTS
// =========================================

/**
 * POST /api/routine-generation/manual/methodology
 * Manual methodology plan creation
 */
router.post('/manual/methodology', authenticateToken, async (req, res) => {
  const userId = req.user?.userId || req.user?.id;
  const planData = req.body;

  try {
    logger.info(`✋ Creación manual de plan para usuario ${userId}`);

    validateRoutineRequest(planData);
    await cleanUserDrafts(userId);

    const methodology = planData.methodology || 'gimnasio';
    const result = await generateMethodologyPlan(methodology, userId, planData);

    res.json(result);

  } catch (error) {
    respondGenerationError(res, 'Error en creación manual', error);
  }
});

/**
 * POST /api/routine-generation/manual/calistenia
 * Manual calistenia plan creation
 */
router.post('/manual/calistenia', authenticateToken, async (req, res) => {
  const userId = req.user?.userId || req.user?.id;
  const planData = req.body;

  try {
    logger.info(`🤸 Creación manual de plan calistenia para usuario ${userId}`);

    await cleanUserDrafts(userId);

    const result = await generateMethodologyPlan('calistenia', userId, planData);
    res.json(result);

  } catch (error) {
    respondGenerationError(res, 'Error en plan calistenia manual', error);
  }
});

// =========================================
// UTILITY ENDPOINTS
// =========================================

/**
 * GET /api/routine-generation/methodologies
 * Get list of all supported methodologies
 */
router.get('/methodologies', (req, res) => {
  try {
    const methodologies = getSupportedMethodologies();
    res.json({
      success: true,
      methodologies
    });
  } catch (error) {
    logger.error(`❌ Error obteniendo metodologías:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/routine-generation/calistenia/levels
 * Get calistenia levels information
 */
router.get('/calistenia/levels', (req, res) => {
  try {
    const levels = getMethodologyLevels('calistenia');
    res.json({
      success: true,
      levels
    });
  } catch (error) {
    logger.error(`❌ Error obteniendo niveles:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/routine-generation/user/current-plan
 * Get user's current active plan
 */
router.get('/user/current-plan', authenticateToken, async (req, res) => {
  const userId = req.user?.userId || req.user?.id;

  try {
    logger.info(`📋 Obteniendo plan actual para usuario ${userId}`);

    const plan = await getActivePlan(userId);

    if (!plan) {
      return res.json({
        success: true,
        hasPlan: false,
        plan: null
      });
    }

    res.json({
      success: true,
      hasPlan: true,
      plan
    });

  } catch (error) {
    logger.error(`❌ Error obteniendo plan actual:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/routine-generation/draft/:planId
 * Delete a draft plan
 */
router.delete('/draft/:planId', authenticateToken, async (req, res) => {
  const userId = req.user?.userId || req.user?.id;
  const { planId } = req.params;

  try {
    logger.info(`🗑️ Eliminando draft ${planId} para usuario ${userId}`);

    const deleted = await updatePlanStatus(planId, 'cancelled');

    if (deleted) {
      res.json({
        success: true,
        message: 'Draft eliminado'
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Draft no encontrado'
      });
    }

  } catch (error) {
    logger.error(`❌ Error eliminando draft:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/routine-generation/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    service: 'routine-generation',
    version: '3.0.0',
    timestamp: new Date().toISOString()
  });
});

export default router;
