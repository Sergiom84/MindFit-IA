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
  CrossFitService,
  methodologyUsesImmutableDraftRevisions,

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
import { isHipertrofiaMethodology } from '../services/hipertrofia/identity.js';
import { generateAndPersistD1D5Plan } from '../services/hipertrofia/d1d5Orchestrator.js';

const router = express.Router();

function sendRoutineGenerationError(res, error, fallbackMessage) {
  const status = Number(error?.status) || 500;
  return res.status(status).json({
    success: false,
    error: status >= 500 ? fallbackMessage : error.message,
    code: error?.code ?? null,
    details: status < 500 ? error?.details : undefined
  });
}

router.get('/specialist/crossfit/capabilities', authenticateToken, (req, res) => {
  const userId = req.user?.userId || req.user?.id;
  res.json(CrossFitService.getCrossFitV2Capabilities(userId));
});

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

    const evaluation = await evaluateUserLevel(methodology, userId, req.body ?? {});
    res.json(evaluation);

  } catch (error) {
    logger.error(`❌ Error en evaluación ${methodology}:`, error.message);
    return sendRoutineGenerationError(res, error, 'No se pudo evaluar la metodología');
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

    if (!methodologyUsesImmutableDraftRevisions(methodology, process.env, userId)) {
      await cleanUserDrafts(userId);
    }

    // Delegate to methodology orchestrator
    const result = await generateMethodologyPlan(methodology, userId, planData);
    res.json(result);

  } catch (error) {
    logger.error(`❌ Error generando plan ${methodology}:`, error.message);
    return sendRoutineGenerationError(res, error, 'No se pudo generar el plan');
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

    const userProfile = await getUserFullProfile(userId);
    const personalizedPlanData = buildProfileAwarePlanData(planData, userProfile);

    // 🧬 Hipertrofia tiene motor DEDICADO (D1-D5 MindFeed) fuera del orquestador genérico.
    // Si la preferencia explícita (o un alias histórico) resuelve a Hipertrofia, se DELEGA
    // internamente en el mismo flujo que /api/hipertrofia/generate-d1d5, produciendo un plan
    // REAL. Nunca se genera una rutina genérica de gimnasio ni se devuelve un error al
    // usuario (Fase 4 + cierre de Pablo). NO se toca WorkoutContext.generatePlan().
    if (isHipertrofiaMethodology(personalizedPlanData.methodology)) {
      logger.info(`🧬 Delegación interna al flujo dedicado de Hipertrofia (user ${userId})`);
      const nivel = personalizedPlanData.selectedLevel
        || planData.selectedLevel || planData.nivel || planData.level || 'Principiante';
      const dedicated = await generateAndPersistD1D5Plan(userId, {
        nivel,
        totalWeeks: planData.totalWeeks,
        startConfig: planData.startConfig,
        includeWeek0: planData.includeWeek0 !== undefined ? planData.includeWeek0 : true
      });
      return res.json({
        success: true,
        methodology: 'hipertrofia',
        plan: dedicated.plan,
        methodologyPlanId: dedicated.methodologyPlanId,
        planId: dedicated.planId,
        message: 'Plan MindFeed D1-D5 generado exitosamente',
        system_info: { motor: 'MindFeed v1.0', ciclo: 'D1-D5' }
      });
    }

    // Hipertrofia limpia dentro de su orquestador. CrossFit v2 conserva el draft
    // anterior hasta crear la revisión inmutable que lo sustituye.
    if (!methodologyUsesImmutableDraftRevisions(personalizedPlanData.methodology, process.env, userId)) {
      await cleanUserDrafts(userId);
    }

    const result = await generateMethodologyPlan(
      personalizedPlanData.methodology,
      userId,
      personalizedPlanData
    );

    res.json(result);

  } catch (error) {
    logger.error(`❌ Error en generación IA:`, error.message);
    return sendRoutineGenerationError(res, error, 'No se pudo generar el plan');
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
    logger.error(`❌ Error en rutina gimnasio IA:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
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

    const methodology = planData.methodology || 'gimnasio';
    validateRoutineRequest(planData);
    if (!methodologyUsesImmutableDraftRevisions(methodology, process.env, userId)) {
      await cleanUserDrafts(userId);
    }
    const result = await generateMethodologyPlan(methodology, userId, planData);

    res.json(result);

  } catch (error) {
    logger.error(`❌ Error en creación manual:`, error.message);
    return sendRoutineGenerationError(res, error, 'No se pudo generar el plan');
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
    logger.error(`❌ Error en plan calistenia manual:`, error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
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

    const deleted = await updatePlanStatus(planId, 'cancelled', userId);

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
