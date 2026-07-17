/**
 * HipertrofiaV2 Routes - REFACTORIZADO
 * Router limpio que delega toda la lógica a servicios especializados
 */

import express from 'express';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

// Importar servicios
import { buildD1D5Plan, persistD1D5Plan } from '../services/hipertrofiaV2/planGenerationService.js';
import { evaluateHipertrofiaLevel } from '../services/hipertrofiaV2/levelEvaluator.js';
import { buildFullBodyWorkout, persistFullBodyWorkout, buildSingleDayWorkout, persistSingleDayWorkout } from '../services/hipertrofiaV2/extraWorkoutService.js';
import { selectExercises } from '../services/hipertrofiaV2/exerciseSelector.js';

// Importar controladores
import {
  cycleControllers,
  deloadControllers,
  priorityControllers,
  overlapControllers,
  progressionControllers
} from '../services/hipertrofiaV2/sqlControllers.js';

import {
  fatigueControllers,
  warmupControllers,
  reevaluationControllers,
  sessionControllers
} from '../services/hipertrofiaV2/additionalControllers.js';

import { logger } from '../services/hipertrofiaV2/logger.js';

// Importar servicio centralizado de limpieza de drafts
import { cleanUserDrafts } from '../services/routineGeneration/draftCleaner.js';

// Importar servicio de limpieza de sesiones huérfanas
import { cleanupUserStaleSessions } from '../services/sessionCleanupService.js';

const router = express.Router();

// 🛡️ Anti-IDOR: si la ruta lleva :userId, debe coincidir con el del token.
// Evita que un usuario autenticado consulte/mute datos de otro por la URL.
// Usar SIEMPRE después de authenticateToken.
const enforceSelfParam = (req, res, next) => {
  const paramUserId = req.params?.userId;
  if (!paramUserId) return next();
  const tokenUserId = req.user?.userId ?? req.user?.id;
  // Fail-closed: si la ruta lleva :userId debe haber id de token y coincidir.
  // (Antes, un token sin id dejaba pasar la comprobación.)
  if (!tokenUserId || Number(paramUserId) !== Number(tokenUserId)) {
    return res.status(403).json({ success: false, error: 'No autorizado' });
  }
  next();
};

// ============================================================
// EVALUACIÓN DE NIVEL
// ============================================================

/**
 * POST /api/hipertrofiav2/evaluate-level
 * Evalúa el nivel (Principiante/Intermedio/Avanzado) del usuario a partir de su
 * perfil real (A-01). Sustituye al alias genérico que devolvía siempre un default.
 */
router.post('/evaluate-level', authenticateToken, async (req, res) => {
  const userId = req.user?.userId || req.user?.id;
  try {
    const evaluation = await evaluateHipertrofiaLevel(pool, userId);
    res.json(evaluation);
  } catch (error) {
    logger.error('❌ [NIVEL HpV2] Error evaluando nivel:', error);
    res.status(500).json({ success: false, error: 'Error al evaluar el nivel del usuario' });
  }
});

// ============================================================
// GENERACIÓN DE PLANES
// ============================================================

/**
 * POST /api/hipertrofiav2/generate-d1d5
 * Genera plan completo D1-D5 (Motor MindFeed)
 */
router.post('/generate-d1d5', authenticateToken, async (req, res) => {
  const userId = req.user?.userId || req.user?.id;
  const {
    nivel = 'Principiante',
    totalWeeks,
    startConfig,
    includeWeek0 = true
  } = req.body;

  try {
    logger.always('🏋️ [MINDFEED] Generando plan D1-D5 para usuario:', userId);

    // 🧹 LIMPIEZA PRE-GENERACIÓN: Cerrar sesiones huérfanas antes de generar nuevo plan
    const cleanupResult = await cleanupUserStaleSessions(userId);
    if (cleanupResult.cleaned > 0) {
      logger.info(`🧹 [MINDFEED] Pre-limpieza: ${cleanupResult.cleaned} sesiones/drafts limpiados`);
    }

    // A1 · Fase 1: construcción (solo lecturas). Se hace sobre el pool para NO
    // retener una conexión de transacción durante todo el montaje del plan
    // (agravaba el agotamiento del pooler, pool_size=15).
    const built = await buildD1D5Plan(pool, {
      userId,
      nivel,
      totalWeeks,
      startConfig,
      includeWeek0
    });

    // A1 · Fase 2: persistencia atómica en una transacción CORTA (3 escrituras).
    const dbClient = await pool.connect();
    let result;
    try {
      await dbClient.query('BEGIN');
      await cleanUserDrafts(userId, dbClient);
      result = await persistD1D5Plan(dbClient, built);
      await dbClient.query('COMMIT');
    } catch (txError) {
      await dbClient.query('ROLLBACK');
      throw txError;
    } finally {
      dbClient.release();
    }

    logger.always(`✅ [MINDFEED] Plan generado: ID ${result.methodologyPlanId}`);

    res.json({
      success: true,
      plan: result.plan,
      methodologyPlanId: result.methodologyPlanId,
      planId: result.planId,
      message: 'Plan MindFeed D1-D5 generado exitosamente',
      system_info: {
        motor: 'MindFeed v1.0',
        ciclo: 'D1-D5',
        progresion: 'Por microciclo (+2.5%)',
        deload: 'Automático cada 6 ciclos'
      }
    });

  } catch (error) {
    logger.error('❌ [MINDFEED] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar plan MindFeed D1-D5'
    });
  }
});

/**
 * POST /api/hipertrofiav2/generate-fullbody
 * Genera rutina Full Body para fin de semana
 */
router.post('/generate-fullbody', authenticateToken, async (req, res) => {
  const userId = req.user?.userId || req.user?.id;
  const { nivel = 'Principiante' } = req.body;

  try {
    // 🧹 LIMPIEZA PRE-GENERACIÓN: Cerrar sesiones huérfanas
    const cleanupResult = await cleanupUserStaleSessions(userId);
    if (cleanupResult.cleaned > 0) {
      logger.info(`🧹 [FULLBODY] Pre-limpieza: ${cleanupResult.cleaned} sesiones/drafts limpiados`);
    }

    // A1 · Fase 1: construcción (solo lecturas, sin retener conexión de transacción).
    const built = await buildFullBodyWorkout(pool, userId, nivel);

    // A1 · Fase 2: persistencia atómica en transacción corta.
    const dbClient = await pool.connect();
    let result;
    try {
      await dbClient.query('BEGIN');
      await cleanUserDrafts(userId, dbClient);
      result = await persistFullBodyWorkout(dbClient, built);
      await dbClient.query('COMMIT');
    } catch (txError) {
      await dbClient.query('ROLLBACK');
      throw txError;
    } finally {
      dbClient.release();
    }

    logger.always('✅ [FULLBODY] Rutina generada exitosamente');

    res.json({
      success: true,
      message: 'Rutina Full Body generada exitosamente',
      methodology_plan_id: result.methodologyPlanId,
      plan: result.plan,
      warnings: [
        'Esta es una rutina especial para el fin de semana',
        'Trabaja todos los grupos musculares en una sesión',
        'El volumen está ajustado para permitir recuperación'
      ]
    });

  } catch (error) {
    logger.error('❌ [FULLBODY] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar rutina Full Body'
    });
  }
});

/**
 * POST /api/hipertrofiav2/generate-single-day
 * Genera entrenamiento de día único
 */
router.post('/generate-single-day', authenticateToken, async (req, res) => {
  const userId = req.user?.userId || req.user?.id;
  const {
    nivel = 'Principiante',
    isWeekendExtra = false,
    selectionMode = 'full_body',
    focusGroup = null
  } = req.body;

  try {
    // 🧹 LIMPIEZA PRE-GENERACIÓN: Cerrar sesiones huérfanas
    const cleanupResult = await cleanupUserStaleSessions(userId);
    if (cleanupResult.cleaned > 0) {
      logger.info(`🧹 [SINGLE-DAY] Pre-limpieza: ${cleanupResult.cleaned} sesiones/drafts limpiados`);
    }

    // A1 · Fase 1: construcción (solo lecturas, sin retener conexión de transacción).
    const built = await buildSingleDayWorkout(pool, userId, nivel, isWeekendExtra, {
      selectionMode,
      focusGroup
    });

    // A1 · Fase 2: persistencia atómica en transacción corta.
    const dbClient = await pool.connect();
    let result;
    try {
      await dbClient.query('BEGIN');
      result = await persistSingleDayWorkout(dbClient, built);
      await dbClient.query('COMMIT');
    } catch (txError) {
      await dbClient.query('ROLLBACK');
      throw txError;
    } finally {
      dbClient.release();
    }

    res.json({
      success: true,
      message: 'Entrenamiento del día generado exitosamente',
      sessionId: result.sessionId,
      workout: result.workout,
      notes: [
        'Este entrenamiento es independiente y no afecta tu plan semanal',
        'Se guardará en tu histórico como entrenamiento extra',
        'Ajusta los pesos según tu capacidad actual'
      ]
    });

  } catch (error) {
    logger.error('❌ [SINGLE-DAY] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar entrenamiento'
    });
  }
});

// ============================================================
// SELECCIÓN DE EJERCICIOS
// ============================================================

/**
 * POST /api/hipertrofiav2/select-exercises
 * Selecciona ejercicios por categoría y nivel
 */
router.post('/select-exercises', authenticateToken, async (req, res) => {
  try {
    const { categoria, nivel, cantidad = 1 } = req.body;

    logger.debug(`🎲 Seleccionando ${cantidad} ejercicio(s) de ${categoria} (${nivel})`);

    const exercises = await selectExercises(pool, {
      nivel,
      categoria,
      cantidad
    });

    if (exercises.length === 0) {
      return res.status(404).json({
        success: false,
        error: `No se encontraron ejercicios de ${categoria} para nivel ${nivel}`
      });
    }

    res.json({
      success: true,
      exercises: exercises.map(ex => ({
        ...ex,
        series: 3,
        reps: '8-12',
        rir_target: '2-3'
      }))
    });

  } catch (error) {
    logger.error('❌ Error seleccionando ejercicios:', error);
    res.status(500).json({
      success: false,
      error: 'Error al seleccionar ejercicios'
    });
  }
});

/**
 * POST /api/hipertrofiav2/select-exercises-by-type
 * Selecciona ejercicios por tipo (multiarticular/unilateral/analitico)
 */
router.post('/select-exercises-by-type', authenticateToken, async (req, res) => {
  try {
    const {
      tipo_ejercicio,
      categoria,
      nivel = 'Principiante',
      cantidad = 1
    } = req.body;

    logger.debug(`🎯 Seleccionando ${cantidad} ${tipo_ejercicio} de ${categoria}`);

    const exercises = await selectExercises(pool, {
      nivel,
      categoria,
      tipo_ejercicio,
      cantidad
    });

    if (exercises.length === 0) {
      // Fallback sin filtro de tipo
      const fallbackExercises = await selectExercises(pool, {
        nivel,
        categoria,
        cantidad
      });

      if (fallbackExercises.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No se encontraron ejercicios de ${categoria} para nivel ${nivel}`
        });
      }

      return res.json({
        success: true,
        exercises: fallbackExercises,
        fallback: true,
        message: `No se encontraron ${tipo_ejercicio}, usando cualquier tipo`
      });
    }

    res.json({
      success: true,
      exercises
    });

  } catch (error) {
    logger.error('❌ Error seleccionando ejercicios por tipo:', error);
    res.status(500).json({
      success: false,
      error: 'Error al seleccionar ejercicios'    });
  }
});

// ============================================================
// CONFIGURACIÓN DE SESIONES
// ============================================================

router.get('/session-config/:cycleDay', authenticateToken, sessionControllers.getSessionConfig);
router.get('/session-config-all', authenticateToken, sessionControllers.getAllSessionConfigs);

// ============================================================
// TRACKING DE SERIES
// ============================================================

router.post('/save-set', authenticateToken, sessionControllers.saveSet);
router.get('/session-summary/:sessionId', authenticateToken, sessionControllers.getSessionSummary);

// ============================================================
// CICLO Y PROGRESIÓN
// ============================================================

router.get('/cycle-status/:userId', authenticateToken, enforceSelfParam, cycleControllers.getCycleStatus);
router.post('/advance-cycle', authenticateToken, cycleControllers.advanceCycle);
router.post('/apply-progression', authenticateToken, progressionControllers.applyProgression);
router.get('/progression/:userId/:exerciseId', authenticateToken, enforceSelfParam, progressionControllers.getProgression);
router.post('/update-progression', authenticateToken, progressionControllers.updateProgression);

// ============================================================
// DELOAD
// ============================================================

router.get('/check-deload/:userId', authenticateToken, enforceSelfParam, deloadControllers.checkDeload);
router.post('/activate-deload', authenticateToken, deloadControllers.activateDeload);
router.post('/deactivate-deload', authenticateToken, deloadControllers.deactivateDeload);

// ============================================================
// PRIORIDAD MUSCULAR
// ============================================================

router.post('/activate-priority', authenticateToken, priorityControllers.activatePriority);
router.post('/deactivate-priority', authenticateToken, priorityControllers.deactivatePriority);
router.get('/priority-status/:userId', authenticateToken, enforceSelfParam, priorityControllers.getPriorityStatus);

// ============================================================
// SOLAPAMIENTO NEURAL
// ============================================================

router.post('/check-neural-overlap', authenticateToken, overlapControllers.checkNeuralOverlap);
router.get('/current-session-with-adjustments/:userId/:cycleDay', authenticateToken, enforceSelfParam, overlapControllers.getCurrentSessionWithAdjustments);

// ============================================================
// FATIGA
// ============================================================

router.post('/submit-fatigue-report', authenticateToken, fatigueControllers.submitFatigueReport);
router.get('/fatigue-status/:userId', authenticateToken, enforceSelfParam, fatigueControllers.getFatigueStatus);
router.post('/apply-fatigue-adjustments', authenticateToken, fatigueControllers.applyFatigueAdjustments);
router.post('/detect-auto-fatigue', authenticateToken, fatigueControllers.detectAutoFatigue);
router.get('/fatigue-history/:userId', authenticateToken, enforceSelfParam, fatigueControllers.getFatigueHistory);

// ============================================================
// WARMUP
// ============================================================

router.post('/save-warmup-completion', authenticateToken, warmupControllers.saveWarmupCompletion);
router.get('/check-warmup-reminder/:userId/:exerciseId/:sessionId', authenticateToken, enforceSelfParam, warmupControllers.checkWarmupReminder);

// ============================================================
// REEVALUACIÓN
// ============================================================

router.get('/check-reevaluation/:userId', authenticateToken, enforceSelfParam, reevaluationControllers.checkReevaluation);
router.post('/accept-reevaluation', authenticateToken, reevaluationControllers.acceptReevaluation);
router.post('/trigger-reevaluation', authenticateToken, reevaluationControllers.triggerReevaluation);

export default router;
