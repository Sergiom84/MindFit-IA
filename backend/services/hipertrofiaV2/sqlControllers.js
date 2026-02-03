/**
 * Controladores para endpoints que envuelven funciones SQL
 * Consolida el patrón repetitivo try/catch -> query -> res.json
 */

import pool from '../../db.js';
import { logger } from './logger.js';
import { buildCycleAdjustment, computeCycleConfidence } from '../menstrualCycle/engine.js';
import { findSwapCandidate, getExerciseTags } from '../menstrualCycle/swapEngine.js';
import {
  getActiveDeloadState,
  getPatternAutoAdjustments,
  resolvePattern
} from '../menstrualCycle/autoAdjustService.js';

/**
 * Calcula ajuste de entrenamiento según ciclo menstrual (si aplica)
 * Reutiliza la lógica del endpoint /api/menstrual-cycle/training-adjustment
 * @param {number} userId
 * @returns {Promise<object|null>}
 */
async function getMenstrualTrainingAdjustment(userId) {
  try {
    const sexoResult = await pool.query(
      `SELECT sexo FROM app.users WHERE id = $1`,
      [userId]
    );
    const sexo = sexoResult.rows[0]?.sexo;
    if (sexo !== 'femenino') return null;

    const configResult = await pool.query(
      `SELECT * FROM app.user_menstrual_config WHERE user_id = $1 AND tracking_enabled = true`,
      [userId]
    );
    if (configResult.rows.length === 0) return null;

    const config = configResult.rows[0];
    const today = new Date().toISOString().split('T')[0];

    const logResult = await pool.query(
      `SELECT * FROM app.menstrual_daily_log WHERE user_id = $1 AND log_date = $2`,
      [userId, today]
    );
    const todayLog = logResult.rows[0] || null;
    const normalizedLog = todayLog
      ? {
        pain_0_3: Number.isFinite(todayLog.pain_0_3)
          ? todayLog.pain_0_3
          : (Number.isFinite(todayLog.pain_level)
            ? (todayLog.pain_level <= 1 ? 0 : todayLog.pain_level === 2 ? 1 : todayLog.pain_level === 3 ? 1 : todayLog.pain_level === 4 ? 2 : 3)
            : undefined),
        fatigue_0_3: Number.isFinite(todayLog.fatigue_0_3)
          ? todayLog.fatigue_0_3
          : (Number.isFinite(todayLog.energy_level)
            ? (todayLog.energy_level <= 1 ? 3 : todayLog.energy_level === 2 ? 2 : todayLog.energy_level === 3 ? 1 : 0)
            : undefined),
        sleep_0_3: Number.isFinite(todayLog.sleep_0_3)
          ? todayLog.sleep_0_3
          : (Number.isFinite(todayLog.sleep_quality)
            ? (todayLog.sleep_quality <= 1 ? 3 : todayLog.sleep_quality === 2 ? 2 : todayLog.sleep_quality === 3 ? 1 : 0)
            : undefined),
        stress_0_3: Number.isFinite(todayLog.stress_0_3) ? todayLog.stress_0_3 : undefined
      }
      : {};

    const recentLogsResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM app.menstrual_daily_log
       WHERE user_id = $1 AND log_date BETWEEN $2 AND $3`,
      [userId, new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], today]
    );
    const hasRecentLogs = recentLogsResult.rows[0]?.total >= 10;

    const historyResult = await pool.query(
      `SELECT cycle_length_days
       FROM app.menstrual_cycle_history
       WHERE user_id = $1 AND cycle_length_days IS NOT NULL
       ORDER BY bleed_start_date ASC`,
      [userId]
    );
    const cycleLengths = historyResult.rows.map(row => row.cycle_length_days);
    const resolvedContraceptionType = config.contraception_type || (config.uses_hormonal_contraceptives ? 'other/unknown' : 'none');
    const computedConfidence = computeCycleConfidence({
      cycleLengths,
      hasLastBleedStartDate: !!(config.last_bleed_start_date || config.last_period_start),
      hasRecentLogs,
      contraceptionType: resolvedContraceptionType
    });

    const normalizedConfig = {
      ...config,
      contraception_type: resolvedContraceptionType,
      cycle_confidence: computedConfidence || config.cycle_confidence || 'low',
      last_bleed_start_date: config.last_bleed_start_date || config.last_period_start,
      bleed_length_days: config.bleed_length_days || config.period_length || 5,
      cycle_length_days: config.cycle_length_days || config.cycle_length || 28,
      luteal_length_days: config.luteal_length_days || 14
    };

    const deloadState = await getActiveDeloadState(pool, userId, today);
    const adjustmentResult = buildCycleAdjustment({
      config: normalizedConfig,
      dailyLog: normalizedLog,
      hasRecentLogs,
      today,
      deloadActive: Boolean(deloadState)
    });

    const painValue = Number.isFinite(normalizedLog.pain_0_3) ? normalizedLog.pain_0_3 : 0;
    const fatigueValue = Number.isFinite(normalizedLog.fatigue_0_3) ? normalizedLog.fatigue_0_3 : 0;
    const sleepValue = Number.isFinite(normalizedLog.sleep_0_3) ? normalizedLog.sleep_0_3 : 0;
    const jointLaxityRisk = !!normalizedConfig.joint_laxity_risk;

    const message = (() => {
      if (adjustmentResult.deloadActive) {
        return 'Semana de descarga: bajamos la carga para volver a progresar sin acumular fatiga.';
      }
      if (adjustmentResult.mode === 'symptoms') {
        return 'Usamos tus síntomas y rendimiento para ajustar la sesión (sin predecir fases).';
      }
      if (adjustmentResult.severity >= 2 && adjustmentResult.dominantDomain === 'pain') {
        return 'Dolor moderado: cambiamos a una variante con menos impacto sin perder el estímulo.';
      }
      if (adjustmentResult.severity >= 2 && adjustmentResult.dominantDomain === 'sleep') {
        return 'Sueño bajo: bajamos la intensidad y subimos el descanso para que recuperes mejor.';
      }
      if (adjustmentResult.severity >= 2 && adjustmentResult.dominantDomain === 'fatigue') {
        return 'Fatiga alta: reducimos volumen para proteger la recuperación.';
      }
      if (adjustmentResult.severity >= 2 && adjustmentResult.dominantDomain === 'stress') {
        return 'Estrés alto: bajamos la carga y cuidamos el descanso.';
      }
      return 'Sin ajustes necesarios.';
    })();

    const volumeModifier = (adjustmentResult.multipliers?.volume ?? 1) - 1;
    const intensityModifier = (adjustmentResult.multipliers?.intensity ?? 1) - 1;

    return {
      hasConfig: true,
      cycleDay: adjustmentResult.cycleDay,
      phase: adjustmentResult.phase,
      todayLog,
      adjustment: {
        severity_global: adjustmentResult.severity,
        dominant_domain: adjustmentResult.dominantDomain,
        multipliers: adjustmentResult.multipliers,
        rest_extra_seconds: adjustmentResult.restExtraSeconds,
        volumeModifier,
        intensityModifier,
        pain_0_3: painValue,
        fatigue_0_3: fatigueValue,
        sleep_0_3: sleepValue,
        joint_laxity_risk: jointLaxityRisk,
        phase: adjustmentResult.phase,
        mode: adjustmentResult.mode,
        message,
        deload_active: adjustmentResult.deloadActive
      }
    };
  } catch (error) {
    logger.warn('⚠️ [CYCLE] Ajuste menstrual no disponible:', error.message);
    return null;
  }
}

/**
 * Helper genérico para llamar funciones SQL
 * @param {object} res - Response object de Express
 * @param {string} queryText - Query SQL a ejecutar
 * @param {Array} params - Parámetros de la query
 * @param {string} [logPrefix='SQL'] - Prefijo para logs
 * @returns {Promise<void>}
 */
async function callDbFunction(res, queryText, params, logPrefix = 'SQL') {
  try {
    const result = await pool.query(queryText, params);
    const data = result.rows[0]?.result || result.rows[0];

    res.json({
      success: true,
      ...data
    });
  } catch (error) {
    logger.error(`❌ [${logPrefix}] Error:`, error);
    res.status(500).json({
      success: false,
      error: `Error en ${logPrefix}`,
      details: error.message
    });
  }
}

/**
 * ============================================================
 * CONTROLADORES DE CICLO
 * ============================================================
 */

export const cycleControllers = {
  /**
   * GET /cycle-status/:userId
   */
  async getCycleStatus(req, res) {
    try {
      const { userId } = req.params;
      logger.debug(`📊 [CYCLE] Obteniendo estado para usuario ${userId}`);

      const result = await pool.query(
        `SELECT * FROM app.hipertrofia_v2_user_status WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return res.json({
          success: true,
          cycleState: null,
          message: 'Usuario sin estado de ciclo (comenzará en D1)'
        });
      }

      res.json({
        success: true,
        cycleState: result.rows[0]
      });
    } catch (error) {
      logger.error('❌ [CYCLE] Error obteniendo estado:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener estado del ciclo'
      });
    }
  },

  /**
   * POST /advance-cycle
   */
  async advanceCycle(req, res) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const { sessionDayName, sessionPatterns = [] } = req.body;

      if (!sessionDayName) {
        return res.status(400).json({
          success: false,
          error: 'sessionDayName es requerido'
        });
      }

      const normalizedPatterns = Array.isArray(sessionPatterns)
        ? sessionPatterns.filter(v => typeof v === 'string' && v.trim().length > 0)
            .map(v => v.toLowerCase().trim())
        : [];

      logger.debug(`🔄 [CYCLE] Avanzando para usuario ${userId} desde ${sessionDayName}`);

      const result = await pool.query(
        `SELECT app.advance_cycle_day($1, $2, $3::jsonb) as result`,
        [userId, sessionDayName, JSON.stringify(normalizedPatterns)]
      );

      const cycleResult = result.rows[0].result;

      // Si completó microciclo, aplicar progresión
      if (cycleResult.microcycle_completed) {
        logger.info(`🎯 [CYCLE] Microciclo completado! Aplicando progresión...`);

        const planResult = await pool.query(
          `SELECT methodology_plan_id FROM app.hipertrofia_v2_state WHERE user_id = $1`,
          [userId]
        );

        if (planResult.rows.length > 0) {
          const methodologyPlanId = planResult.rows[0].methodology_plan_id;

          const progressionResult = await pool.query(
            `SELECT app.apply_microcycle_progression($1, $2) as result`,
            [userId, methodologyPlanId]
          );

          cycleResult.progression = progressionResult.rows[0].result;
        }
      }

      try {
        const deloadStatus = await pool.query(
          `SELECT
             hs.deload_active,
             hs.deload_reason,
             mp.current_week,
             mp.plan_data
           FROM app.hipertrofia_v2_state hs
           JOIN app.methodology_plans mp ON mp.id = hs.methodology_plan_id
           WHERE hs.user_id = $1
           LIMIT 1`,
          [userId]
        );

        if (deloadStatus.rows.length > 0) {
          const {
            deload_active: deloadActive,
            deload_reason: deloadReason,
            current_week: currentWeek,
            plan_data: planData
          } = deloadStatus.rows[0];

          let isDeloadWeek = false;
          if (planData?.semanas && Number.isFinite(currentWeek)) {
            const weekMatch = planData.semanas.find((week) => {
              const raw =
                week?.numero ??
                week?.semana ??
                week?.week ??
                week?.week_number ??
                null;
              const weekNumber = Number(raw);
              if (!Number.isFinite(weekNumber)) return false;
              return weekNumber === Number(currentWeek);
            });

            if (weekMatch) {
              const weekType = String(weekMatch.tipo || '').toLowerCase();
              isDeloadWeek = Boolean(weekMatch.es_deload) || weekType === 'deload';
            }
          }

          cycleResult.deload_active = Boolean(deloadActive);
          cycleResult.deload_reason = deloadReason || null;
          cycleResult.current_week = currentWeek ?? null;
          cycleResult.planned_deload_week = planData?.deload_week ?? null;
          cycleResult.is_deload_week = isDeloadWeek;
        }
      } catch (deloadError) {
        logger.warn('⚠️ [CYCLE] No se pudo adjuntar estado de deload:', deloadError.message);
      }

      res.json({
        success: true,
        cycleAdvanced: true,
        ...cycleResult
      });
    } catch (error) {
      logger.error('❌ [CYCLE] Error avanzando:', error);
      res.status(500).json({
        success: false,
        error: 'Error al avanzar ciclo',
        details: error.message
      });
    }
  }
};

/**
 * ============================================================
 * CONTROLADORES DE DELOAD
 * ============================================================
 */

export const deloadControllers = {
  /**
   * GET /check-deload/:userId
   */
  async checkDeload(req, res) {
    const { userId } = req.params;
    logger.debug(`🔍 [DELOAD] Verificando para usuario ${userId}`);

    await callDbFunction(
      res,
      `SELECT app.check_deload_trigger($1) as result`,
      [userId],
      'DELOAD'
    );
  },

  /**
   * POST /activate-deload
   */
  async activateDeload(req, res) {
    const userId = req.user?.userId || req.user?.id;
    const { methodologyPlanId, reason = 'planificado' } = req.body;

    logger.info(`⚠️ [DELOAD] Activando para usuario ${userId} (${reason})`);

    await callDbFunction(
      res,
      `SELECT app.activate_deload($1, $2, $3) as result`,
      [userId, methodologyPlanId, reason],
      'DELOAD'
    );
  },

  /**
   * POST /deactivate-deload
   */
  async deactivateDeload(req, res) {
    const userId = req.user?.userId || req.user?.id;
    logger.info(`✅ [DELOAD] Desactivando para usuario ${userId}`);

    await callDbFunction(
      res,
      `SELECT app.deactivate_deload($1) as result`,
      [userId],
      'DELOAD'
    );
  }
};

/**
 * ============================================================
 * CONTROLADORES DE PRIORIDAD
 * ============================================================
 */

export const priorityControllers = {
  /**
   * POST /activate-priority
   */
  async activatePriority(req, res) {
    const userId = req.user?.userId || req.user?.id;
    const { muscleGroup } = req.body || {};

    if (!muscleGroup) {
      return res.status(400).json({ success: false, error: 'muscleGroup es requerido' });
    }

    logger.info(`🎯 [PRIORITY] Activando ${muscleGroup} para usuario ${userId}`);

    await callDbFunction(
      res,
      `SELECT app.activate_muscle_priority($1, $2) AS result`,
      [userId, muscleGroup],
      'PRIORITY'
    );
  },

  /**
   * POST /deactivate-priority
   */
  async deactivatePriority(req, res) {
    const userId = req.user?.userId || req.user?.id;
    logger.info(`🛑 [PRIORITY] Desactivando para usuario ${userId}`);

    await callDbFunction(
      res,
      `SELECT app.deactivate_muscle_priority($1) AS result`,
      [userId],
      'PRIORITY'
    );
  },

  /**
   * GET /priority-status/:userId
   */
  async getPriorityStatus(req, res) {
    try {
      const { userId } = req.params;
      logger.debug(`🔎 [PRIORITY] Consultando estado para usuario ${userId}`);

      const state = await pool.query(
        `SELECT priority_muscle, priority_started_at, priority_microcycles_completed, priority_top_sets_this_week
         FROM app.hipertrofia_v2_state WHERE user_id = $1`,
        [userId]
      );

      const timeoutCheck = await pool.query(
        `SELECT app.check_priority_timeout($1) AS result`,
        [userId]
      );

      res.json({
        success: true,
        priority: state.rows[0] || null,
        timeout_check: timeoutCheck.rows[0].result
      });
    } catch (error) {
      logger.error('❌ [PRIORITY] Error obteniendo estado:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener estado de prioridad',
        details: error.message
      });
    }
  }
};

/**
 * ============================================================
 * CONTROLADORES DE NEURAL OVERLAP
 * ============================================================
 */

export const overlapControllers = {
  /**
   * POST /check-neural-overlap
   */
  async checkNeuralOverlap(req, res) {
    const userId = req.user?.userId || req.user?.id;
    const { sessionPatterns = [] } = req.body || {};

    if (!Array.isArray(sessionPatterns)) {
      return res.status(400).json({
        success: false,
        error: 'sessionPatterns debe ser un arreglo'
      });
    }

    const normalizedPatterns = sessionPatterns
      .filter(v => typeof v === 'string' && v.trim().length > 0)
      .map(v => v.toLowerCase().trim());

    logger.debug(`🧠 [OVERLAP] Detectando para usuario ${userId}`);

    await callDbFunction(
      res,
      `SELECT app.detect_neural_overlap($1, $2::jsonb) as result`,
      [userId, JSON.stringify(normalizedPatterns)],
      'OVERLAP'
    );
  },

  /**
   * GET /current-session-with-adjustments/:userId/:cycleDay
   */
  async getCurrentSessionWithAdjustments(req, res) {
    try {
      const { userId, cycleDay } = req.params;
      if (req.user?.userId && Number(req.user.userId) !== Number(userId)) {
        return res.status(403).json({ success: false, error: 'No autorizado' });
      }
      logger.debug(`🔍 [SESSION+OVERLAP] Obteniendo D${cycleDay} para usuario ${userId}`);

      const normalizeExerciseReps = (exercise) => {
        if (!exercise) return exercise;
        if (exercise.repeticiones || exercise.series_reps_objetivo || exercise.reps) return exercise;
        if (!exercise.reps_objetivo) return exercise;
        return { ...exercise, repeticiones: exercise.reps_objetivo };
      };

      // Obtener nivel del usuario
      const userQuery = await pool.query(
        `SELECT nivel_entrenamiento FROM app.users WHERE id = $1`,
        [userId]
      );
      const nivel = userQuery.rows[0]?.nivel_entrenamiento || 'Principiante';

      // Obtener plan activo
      const planQuery = await pool.query(
        `SELECT plan_data, current_week FROM app.methodology_plans
         WHERE user_id = $1 AND status = 'active'
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );

      if (planQuery.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'No hay plan activo' });
      }

      const planData = planQuery.rows[0].plan_data;
      const currentWeekNumber = Number(planQuery.rows[0].current_week || 1);
      let currentSession = null;

      // Buscar primero en la semana actual
      const semanas = planData.semanas || [];
      const currentWeek = semanas.find(semana => Number(semana.numero) === currentWeekNumber) || semanas[0];

      if (currentWeek) {
        for (const sesion of (currentWeek.sesiones || [])) {
          if (sesion.ciclo_dia == cycleDay || sesion.cycle_day == cycleDay) {
            currentSession = sesion;
            break;
          }
        }
      }

      // Fallback: buscar en cualquier semana si no se encontró en la actual
      if (!currentSession) {
        for (const semana of semanas) {
          for (const sesion of (semana.sesiones || [])) {
            if (sesion.ciclo_dia == cycleDay || sesion.cycle_day == cycleDay) {
              currentSession = sesion;
              break;
            }
          }
          if (currentSession) break;
        }
      }

      if (!currentSession) {
        return res.status(404).json({ success: false, error: `Sesión D${cycleDay} no encontrada` });
      }

      // Ajuste por ciclo menstrual (solo mujeres con tracking activo)
      const menstrualAdjustment = await getMenstrualTrainingAdjustment(Number(userId));

      // Detectar solapamiento (solo principiantes)
      let adjustedSession = { ...currentSession };
      let overlapInfo = null;

      const baseExercisesKey = adjustedSession?.ejercicios ? 'ejercicios' : (adjustedSession?.exercises ? 'exercises' : null);
      if (baseExercisesKey && Array.isArray(adjustedSession[baseExercisesKey])) {
        adjustedSession = {
          ...adjustedSession,
          [baseExercisesKey]: adjustedSession[baseExercisesKey].map(normalizeExerciseReps)
        };
      }

      if (nivel === 'Principiante' && currentSession.ejercicios) {
        const currentPatterns = currentSession.ejercicios
          .map(ex => ex.patron_movimiento)
          .filter(Boolean);

        const overlapResult = await pool.query(
          `SELECT app.detect_neural_overlap($1, $2::jsonb) as result`,
          [userId, JSON.stringify(currentPatterns)]
        );

        overlapInfo = overlapResult.rows[0]?.result || {};

        if (overlapInfo.overlap !== 'none' && overlapInfo.adjustment < 0) {
          const adjustmentFactor = 1 + Number(overlapInfo.adjustment || 0);
          const adjustmentPct = Math.round(Number(overlapInfo.adjustment || 0) * 1000) / 10;
          logger.info(`⚠️ [OVERLAP] ${overlapInfo.overlap} detectado, ajustando ${adjustmentPct}%`);

          adjustedSession.ejercicios = currentSession.ejercicios.map(ex => {
            const normalized = normalizeExerciseReps(ex);
            if (ex.tipo_ejercicio === 'multiarticular') {
              return {
                ...normalized,
                intensidad_porcentaje: Math.round(normalized.intensidad_porcentaje * adjustmentFactor * 10) / 10,
                notas: (normalized.notas || '') + ` [⚠️ ${adjustmentPct}% por solapamiento ${overlapInfo.overlap}]`
              };
            }
            return normalized;
          });
        }
      }

      // Aplicar ajuste menstrual a la sesión si corresponde
      if (menstrualAdjustment?.adjustment) {
        const exercisesKey = adjustedSession?.ejercicios ? 'ejercicios' : (adjustedSession?.exercises ? 'exercises' : null);
        const exercises = exercisesKey ? adjustedSession[exercisesKey] : null;
        let autoAdjust = null;

        if (exercisesKey && exercises?.length) {
          const patterns = exercises
            .map(ex => resolvePattern(ex.patron_movimiento || ex.patron || ex.pattern))
            .filter(Boolean);
          const uniquePatterns = [...new Set(patterns)];
          autoAdjust = await getPatternAutoAdjustments(pool, userId, uniquePatterns);
        } else {
          autoAdjust = await getPatternAutoAdjustments(pool, userId, []);
        }

        if (exercisesKey && exercises?.length) {
          let sessionExercises = exercises;
          const {
            multipliers = {},
            rest_extra_seconds: restExtraSeconds = 0,
            message,
            dominant_domain: dominantDomain
          } = menstrualAdjustment.adjustment;
          const volumeMultiplier = Number.isFinite(multipliers.volume) ? multipliers.volume : 1;
          const intensityMultiplier = Number.isFinite(multipliers.intensity) ? multipliers.intensity : 1;

          const autoVolume = Number.isFinite(autoAdjust?.volumeMultiplier) ? autoAdjust.volumeMultiplier : 1;
          const autoIntensity = Number.isFinite(autoAdjust?.intensityMultiplier) ? autoAdjust.intensityMultiplier : 1;
          const autoRest = Number.isFinite(autoAdjust?.restExtraSeconds) ? autoAdjust.restExtraSeconds : 0;

          const combinedVolume = volumeMultiplier * autoVolume;
          const combinedIntensity = intensityMultiplier * autoIntensity;
          const combinedRest = restExtraSeconds + autoRest;

          menstrualAdjustment.adjustment.auto_adjustment = autoAdjust;
          menstrualAdjustment.adjustment.multipliers = {
            intensity: combinedIntensity,
            volume: combinedVolume
          };
          menstrualAdjustment.adjustment.rest_extra_seconds = combinedRest;
          menstrualAdjustment.adjustment.volumeModifier = combinedVolume - 1;
          menstrualAdjustment.adjustment.intensityModifier = combinedIntensity - 1;

          if (combinedVolume !== 1 || combinedIntensity !== 1 || combinedRest > 0) {
            sessionExercises = sessionExercises.map(ex => {
              const newSeries = Math.max(1, Math.round(Number(ex.series || 1) * combinedVolume));
              const baseIntensity = Number(ex.intensidad_porcentaje ?? adjustedSession.intensity_percentage ?? 0);
              const hasIntensity = Number.isFinite(baseIntensity) && baseIntensity > 0;
              const newIntensity = hasIntensity
                ? Math.min(100, Math.max(5, Math.round(baseIntensity * combinedIntensity)))
                : ex.intensidad_porcentaje;

              const restBase = Number.isFinite(ex.descanso_seg)
                ? ex.descanso_seg
                : (Number.isFinite(ex.rest_seconds)
                  ? ex.rest_seconds
                  : (Number.isFinite(ex.rest) ? ex.rest : null));

              const updated = {
                ...ex,
                series: newSeries,
                intensidad_porcentaje: hasIntensity ? newIntensity : ex.intensidad_porcentaje,
                notas: `${ex.notas || ''} [Ajuste ciclo: ${dominantDomain || 'menstrual'} - ${message}]`.trim()
              };

              if (restBase !== null && combinedRest > 0) {
                const restValue = restBase + combinedRest;
                if (Number.isFinite(ex.descanso_seg)) updated.descanso_seg = restValue;
                else if (Number.isFinite(ex.rest_seconds)) updated.rest_seconds = restValue;
                else if (Number.isFinite(ex.rest)) updated.rest = restValue;
              }

              return updated;
            });
          }

          const painLevel = Number.isFinite(menstrualAdjustment.adjustment.pain_0_3)
            ? menstrualAdjustment.adjustment.pain_0_3
            : 0;
          const fatigueLevel = Number.isFinite(menstrualAdjustment.adjustment.fatigue_0_3)
            ? menstrualAdjustment.adjustment.fatigue_0_3
            : 0;
          const jointLaxityRisk = !!menstrualAdjustment.adjustment.joint_laxity_risk;
          const phase = menstrualAdjustment.adjustment.phase;
          const needsCodLimit = jointLaxityRisk && (phase === 'ovulation' || fatigueLevel >= 2);
          const painLevelForSwap = Math.max(painLevel, autoAdjust?.painTriggered ? 2 : 0);

          if (painLevelForSwap >= 2 || needsCodLimit) {
            const exerciseIds = sessionExercises
              .map(ex => Number(ex.exercise_id || ex.id))
              .filter(Boolean);

            const tagsById = await getExerciseTags(pool, exerciseIds);

            sessionExercises = await Promise.all(sessionExercises.map(async ex => {
              const exerciseId = Number(ex.exercise_id || ex.id);
              const tags = tagsById.get(exerciseId);

              const addNote = (note) => ({
                ...ex,
                notas: `${ex.notas || ''} ${note}`.trim()
              });

              if (!tags) {
                return painLevelForSwap >= 2 || needsCodLimit
                  ? addNote('[SWAP ciclo: sin tags, se mantiene ejercicio]')
                  : ex;
              }

              const hasImpact = Number.isFinite(tags.impact_level);
              const hasAxial = Number.isFinite(tags.axial_load_level);
              const hasCod = Number.isFinite(tags.cod_level);

              const needsImpactSwap = painLevelForSwap >= 2 && hasImpact && tags.impact_level >= 2;
              const needsAxialSwap = painLevelForSwap >= 2 && hasAxial && tags.axial_load_level >= 2;
              const needsCodSwap = needsCodLimit && hasCod && tags.cod_level >= 2;

              if (!needsImpactSwap && !needsAxialSwap && !needsCodSwap) {
                return ex;
              }

              if ((needsImpactSwap && !hasImpact) || (needsAxialSwap && !hasAxial) || (needsCodSwap && !hasCod)) {
                return addNote('[SWAP ciclo: tags incompletos, se mantiene ejercicio]');
              }

              if (!tags.pattern) {
                return addNote('[SWAP ciclo: sin patrón, se mantiene ejercicio]');
              }

              const maxImpact = needsImpactSwap ? 1 : null;
              const maxAxial = needsAxialSwap ? 1 : null;
              const maxCod = needsCodSwap ? 1 : null;

              let candidate = await findSwapCandidate(pool, {
                pattern: tags.pattern,
                equipment: tags.equipment || [],
                maxImpact,
                maxAxial,
                maxCod,
                excludeIds: [exerciseId]
              });

              if (!candidate && needsAxialSwap) {
                candidate = await findSwapCandidate(pool, {
                  pattern: tags.pattern,
                  equipment: tags.equipment || [],
                  maxImpact,
                  maxAxial: 2,
                  maxCod,
                  excludeIds: [exerciseId]
                });
              }

              if (!candidate) {
                return addNote('[SWAP ciclo: sin alternativa segura]');
              }

              const reasons = [];
              if (needsImpactSwap) reasons.push('impacto');
              if (needsAxialSwap) reasons.push('axial');
              if (needsCodSwap) reasons.push('COD');

              return {
                ...ex,
                id: candidate.exercise_id,
                exercise_id: candidate.exercise_id,
                nombre: candidate.nombre,
                categoria: candidate.categoria ?? ex.categoria,
                tipo_ejercicio: candidate.tipo_ejercicio ?? ex.tipo_ejercicio,
                patron_movimiento: candidate.patron_movimiento ?? ex.patron_movimiento,
                notas: `${ex.notas || ''} [SWAP ciclo: ${reasons.join('+')} -> ${candidate.nombre}]`.trim()
              };
            }));
          }

          adjustedSession[exercisesKey] = sessionExercises;
        }
      }

      res.json({
        success: true,
        session: adjustedSession,
        overlap_detected: overlapInfo?.overlap !== 'none',
        overlap_info: overlapInfo,
        menstrual_adjustment: menstrualAdjustment,
        nivel,
        current_week: currentWeekNumber
      });
    } catch (error) {
      logger.error('❌ [SESSION+OVERLAP] Error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

/**
 * ============================================================
 * CONTROLADOR DE PROGRESIÓN
 * ============================================================
 */

export const progressionControllers = {
  /**
   * POST /apply-progression
   */
  async applyProgression(req, res) {
    const userId = req.user?.userId || req.user?.id;
    const { methodologyPlanId } = req.body;

    logger.info(`📈 [PROGRESSION] Aplicando para usuario ${userId}`);

    await callDbFunction(
      res,
      `SELECT app.apply_microcycle_progression($1, $2) as result`,
      [userId, methodologyPlanId],
      'PROGRESSION'
    );
  },

  /**
   * GET /progression/:userId/:exerciseId
   */
  async getProgression(req, res) {
    try {
      const { userId, exerciseId } = req.params;

      const result = await pool.query(
        `SELECT * FROM app.hypertrophy_progression WHERE user_id = $1 AND exercise_id = $2`,
        [userId, exerciseId]
      );

      if (result.rows.length === 0) {
        return res.json({
          success: true,
          progression: null,
          message: 'No hay progresión registrada aún'
        });
      }

      res.json({
        success: true,
        progression: result.rows[0]
      });
    } catch (error) {
      logger.error('❌ [PROGRESSION] Error obteniendo:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener progresión'
      });
    }
  },

  /**
   * POST /update-progression
   */
  async updateProgression(req, res) {
    try {
      const { userId, exerciseId, exerciseName } = req.body;

      logger.info(`📊 [PROGRESSION] Actualizando ${exerciseName} para usuario ${userId}`);

      await pool.query(
        `SELECT app.update_exercise_progression($1, $2, $3)`,
        [userId, exerciseId, exerciseName]
      );

      const result = await pool.query(
        `SELECT * FROM app.hypertrophy_progression WHERE user_id = $1 AND exercise_id = $2`,
        [userId, exerciseId]
      );

      res.json({
        success: true,
        progression: result.rows[0]
      });
    } catch (error) {
      logger.error('❌ [PROGRESSION] Error actualizando:', error);
      res.status(500).json({
        success: false,
        error: 'Error al actualizar progresión'
      });
    }
  }
};
