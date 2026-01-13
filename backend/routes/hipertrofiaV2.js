/**
 * HipertrofiaV2 Routes - REFACTORIZADO
 * Router limpio que delega toda la lógica a servicios especializados
 */

import express from 'express';
import pool from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

// Importar servicios
import { generateD1D5Plan } from '../services/hipertrofiaV2/planGenerationService.js';
import { generateFullBodyWorkout, generateSingleDayWorkout } from '../services/hipertrofiaV2/extraWorkoutService.js';
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

// ============================================================
// GENERACIÓN DE PLANES
// ============================================================

/**
 * POST /api/hipertrofiav2/generate-d1d5
 * Genera plan completo D1-D5 (Motor MindFeed)
 */
router.post('/generate-d1d5', authenticateToken, async (req, res) => {
  const dbClient = await pool.connect();

  try {
    const userId = req.user?.userId || req.user?.id;
    const {
      nivel = 'Principiante',
      totalWeeks,
      startConfig,
      includeWeek0 = true
    } = req.body;

    logger.always('🏋️ [MINDFEED] Generando plan D1-D5 para usuario:', userId);

    // 🧹 LIMPIEZA PRE-GENERACIÓN: Cerrar sesiones huérfanas antes de generar nuevo plan
    const cleanupResult = await cleanupUserStaleSessions(userId);
    if (cleanupResult.cleaned > 0) {
      logger.info(`🧹 [MINDFEED] Pre-limpieza: ${cleanupResult.cleaned} sesiones/drafts limpiados`);
    }

    await dbClient.query('BEGIN');
    await cleanUserDrafts(userId, dbClient);

    const result = await generateD1D5Plan(dbClient, {
      userId,
      nivel,
      totalWeeks,
      startConfig,
      includeWeek0
    });

    await dbClient.query('COMMIT');

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
    await dbClient.query('ROLLBACK');
    logger.error('❌ [MINDFEED] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar plan MindFeed D1-D5',
      details: error.message
    });
  } finally {
    dbClient.release();
  }
});

/**
 * POST /api/hipertrofiav2/generate-fullbody
 * Genera rutina Full Body para fin de semana
 */
router.post('/generate-fullbody', authenticateToken, async (req, res) => {
  const dbClient = await pool.connect();

  try {
    const userId = req.user?.userId || req.user?.id;
    const { nivel = 'Principiante' } = req.body;

    // 🧹 LIMPIEZA PRE-GENERACIÓN: Cerrar sesiones huérfanas
    const cleanupResult = await cleanupUserStaleSessions(userId);
    if (cleanupResult.cleaned > 0) {
      logger.info(`🧹 [FULLBODY] Pre-limpieza: ${cleanupResult.cleaned} sesiones/drafts limpiados`);
    }

    await dbClient.query('BEGIN');
    await cleanUserDrafts(userId, dbClient);

    const result = await generateFullBodyWorkout(dbClient, userId, nivel);

    await dbClient.query('COMMIT');

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
    await dbClient.query('ROLLBACK');
    logger.error('❌ [FULLBODY] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar rutina Full Body',
      details: error.message
    });
  } finally {
    dbClient.release();
  }
});

/**
 * POST /api/hipertrofiav2/generate-single-day
 * Genera entrenamiento de día único
 */
router.post('/generate-single-day', authenticateToken, async (req, res) => {
  const dbClient = await pool.connect();

  try {
    const userId = req.user?.userId || req.user?.id;
    const {
      nivel = 'Principiante',
      isWeekendExtra = false,
      selectionMode = 'full_body',
      focusGroup = null
    } = req.body;

    // 🧹 LIMPIEZA PRE-GENERACIÓN: Cerrar sesiones huérfanas
    const cleanupResult = await cleanupUserStaleSessions(userId);
    if (cleanupResult.cleaned > 0) {
      logger.info(`🧹 [SINGLE-DAY] Pre-limpieza: ${cleanupResult.cleaned} sesiones/drafts limpiados`);
    }

    await dbClient.query('BEGIN');

    const result = await generateSingleDayWorkout(dbClient, userId, nivel, isWeekendExtra, {
      selectionMode,
      focusGroup
    });

    await dbClient.query('COMMIT');

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
    await dbClient.query('ROLLBACK');
    logger.error('❌ [SINGLE-DAY] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Error al generar entrenamiento',
      details: error.message
    });
  } finally {
    dbClient.release();
  }
});

// ============================================================
// SELECCIÓN DE EJERCICIOS
// ============================================================

/**
 * POST /api/hipertrofiav2/select-exercises
 * Selecciona ejercicios por categoría y nivel
 */
router.post('/select-exercises', async (req, res) => {
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
router.post('/select-exercises-by-type', async (req, res) => {
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
      error: 'Error al seleccionar ejercicios',
      details: error.message
    });
  }
});

// ============================================================
// CONFIGURACIÓN DE SESIONES
// ============================================================

router.get('/session-config/:cycleDay', sessionControllers.getSessionConfig);
router.get('/session-config-all', sessionControllers.getAllSessionConfigs);

// ============================================================
// TRACKING DE SERIES
// ============================================================

router.post('/save-set', sessionControllers.saveSet);
router.get('/session-summary/:sessionId', sessionControllers.getSessionSummary);

// ============================================================
// CICLO Y PROGRESIÓN
// ============================================================

router.get('/cycle-status/:userId', cycleControllers.getCycleStatus);
router.post('/advance-cycle', authenticateToken, cycleControllers.advanceCycle);
router.post('/apply-progression', authenticateToken, progressionControllers.applyProgression);
router.get('/progression/:userId/:exerciseId', progressionControllers.getProgression);
router.post('/update-progression', progressionControllers.updateProgression);

// ============================================================
// DELOAD
// ============================================================

router.get('/check-deload/:userId', deloadControllers.checkDeload);
router.post('/activate-deload', authenticateToken, deloadControllers.activateDeload);
router.post('/deactivate-deload', authenticateToken, deloadControllers.deactivateDeload);

// ============================================================
// PRIORIDAD MUSCULAR
// ============================================================

router.post('/activate-priority', authenticateToken, priorityControllers.activatePriority);
router.post('/deactivate-priority', authenticateToken, priorityControllers.deactivatePriority);
router.get('/priority-status/:userId', authenticateToken, priorityControllers.getPriorityStatus);

// ============================================================
// SOLAPAMIENTO NEURAL
// ============================================================

router.post('/check-neural-overlap', authenticateToken, overlapControllers.checkNeuralOverlap);
router.get('/current-session-with-adjustments/:userId/:cycleDay', authenticateToken, overlapControllers.getCurrentSessionWithAdjustments);

// ============================================================
// FATIGA
// ============================================================

router.post('/submit-fatigue-report', authenticateToken, fatigueControllers.submitFatigueReport);
router.get('/fatigue-status/:userId', authenticateToken, fatigueControllers.getFatigueStatus);
router.post('/apply-fatigue-adjustments', authenticateToken, fatigueControllers.applyFatigueAdjustments);
router.post('/detect-auto-fatigue', authenticateToken, fatigueControllers.detectAutoFatigue);
router.get('/fatigue-history/:userId', authenticateToken, fatigueControllers.getFatigueHistory);

// ============================================================
// WARMUP
// ============================================================

router.post('/save-warmup-completion', authenticateToken, warmupControllers.saveWarmupCompletion);
router.get('/check-warmup-reminder/:userId/:exerciseId/:sessionId', warmupControllers.checkWarmupReminder);

// ============================================================
// REEVALUACIÓN
// ============================================================

router.get('/check-reevaluation/:userId', reevaluationControllers.checkReevaluation);
router.post('/accept-reevaluation', authenticateToken, reevaluationControllers.acceptReevaluation);
router.post('/trigger-reevaluation', authenticateToken, reevaluationControllers.triggerReevaluation);

export default router;
