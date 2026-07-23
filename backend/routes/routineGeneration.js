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

/**
 * Responde un error de generación honrando un `statusCode` de dominio tipado (p.ej. 422 de
 * calistenia por nivel no reconocido o assessment 'refer'); el resto se mantiene en 500. Propaga
 * el `code` si existe. Antes cada handler devolvía 500 fijo, perdiendo la granularidad del error
 * en 3 de 4 rutas que llaman a la generación (PR-CAL-01, revisión adversarial F2).
 */
function respondGenerationError(res, context, error) {
  const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  logger.error(`❌ ${context} (${status}):`, error.message);
  res.status(status).json({
    success: false,
    error: error.message,
    ...(error?.code ? { code: error.code } : {})
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

  try {
    logger.info(`📊 Evaluando nivel de ${methodology} para usuario ${userId}`);

    const evaluation = await evaluateUserLevel(methodology, userId);
    res.json(evaluation);

  } catch (error) {
    logger.error(`❌ Error en evaluación ${methodology}:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
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
