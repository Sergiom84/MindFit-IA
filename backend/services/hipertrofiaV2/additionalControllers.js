/**
 * Controladores adicionales: Fatigue, Warmup, Reevaluation
 */

import pool from '../../db.js';
import { logger } from './logger.js';

/**
 * ============================================================
 * CONTROLADORES DE FATIGA
 * ============================================================
 */

export const fatigueControllers = {
  /**
   * POST /submit-fatigue-report
   */
  async submitFatigueReport(req, res) {
    try {
      const userId = req.user.id;
      const {
        sleep_quality,
        energy_level,
        doms_level = 0,
        joint_pain_level = 0,
        focus_level,
        motivation_level,
        notes = null
      } = req.body;

      logger.debug(`🩺 [FATIGUE] Usuario ${userId} reporta estado`);

      // Determinar tipo de flag
      let flag_type = null;

      if (joint_pain_level >= 6 || sleep_quality <= 3 || energy_level <= 3) {
        flag_type = 'critical';
      } else if (
        (sleep_quality >= 4 && sleep_quality <= 5) ||
        (energy_level >= 4 && energy_level <= 5) ||
        doms_level >= 6
      ) {
        flag_type = 'light';
      } else if (focus_level <= 4 || motivation_level <= 4) {
        flag_type = 'cognitive';
      }

      // Insertar flag si corresponde
      if (flag_type) {
        const result = await pool.query(`
          INSERT INTO app.fatigue_flags (
            user_id, flag_type, sleep_quality, energy_level,
            doms_level, joint_pain_level, focus_level,
            motivation_level, notes, auto_detected
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false)
          RETURNING id, flag_type, flag_date
        `, [
          userId, flag_type, sleep_quality, energy_level,
          doms_level, joint_pain_level, focus_level,
          motivation_level, notes
        ]);

        logger.info(`🚨 [FATIGUE] Flag creado: tipo=${flag_type}`);

        return res.json({
          success: true,
          flag_created: true,
          flag: result.rows[0]
        });
      }

      logger.debug(`✅ [FATIGUE] Sin flag detectado`);
      res.json({
        success: true,
        flag_created: false,
        message: 'Estado registrado, sin flag de fatiga'
      });

    } catch (error) {
      logger.error('❌ [FATIGUE] Error reportando:', error);
      res.status(500).json({
        success: false,
        error: 'Error al reportar estado de fatiga',
        details: error.message
      });
    }
  },

  /**
   * GET /fatigue-status/:userId
   */
  async getFatigueStatus(req, res) {
    try {
      const { userId } = req.params;
      logger.debug(`🔍 [FATIGUE] Obteniendo estado para usuario ${userId}`);

      const flagsResult = await pool.query(
        `SELECT app.count_recent_flags($1, 10) as flags`,
        [userId]
      );

      const actionResult = await pool.query(
        `SELECT app.evaluate_fatigue_action($1) as evaluation`,
        [userId]
      );

      const flags = flagsResult.rows[0].flags;
      const evaluation = actionResult.rows[0].evaluation;

      res.json({
        success: true,
        flags,
        evaluation
      });

    } catch (error) {
      logger.error('❌ [FATIGUE] Error obteniendo estado:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener estado de fatiga',
        details: error.message
      });
    }
  },

  /**
   * POST /apply-fatigue-adjustments
   */
  async applyFatigueAdjustments(req, res) {
    try {
      const userId = req.user.id;
      const { methodologyPlanId } = req.body;

      logger.info(`⚙️ [FATIGUE] Aplicando ajustes para usuario ${userId}`);

      const result = await pool.query(
        `SELECT app.apply_fatigue_adjustments($1, $2) as result`,
        [userId, methodologyPlanId]
      );

      const adjustments = result.rows[0].result;

      res.json({
        success: true,
        ...adjustments
      });

    } catch (error) {
      logger.error('❌ [FATIGUE] Error aplicando ajustes:', error);
      res.status(500).json({
        success: false,
        error: 'Error al aplicar ajustes de fatiga',
        details: error.message
      });
    }
  },

  /**
   * POST /detect-auto-fatigue
   */
  async detectAutoFatigue(req, res) {
    try {
      const userId = req.user.id;
      const { sessionId } = req.body;

      logger.debug(`🤖 [FATIGUE] Detectando en sesión ${sessionId}`);

      const result = await pool.query(
        `SELECT app.detect_automatic_fatigue_flags($1, $2) as result`,
        [userId, sessionId]
      );

      const detection = result.rows[0].result;

      if (detection.flag_detected) {
        logger.info(`🚨 [FATIGUE] Flag auto-detectado: tipo=${detection.flag_type}`);
      }

      res.json({
        success: true,
        ...detection
      });

    } catch (error) {
      logger.error('❌ [FATIGUE] Error detectando:', error);
      res.status(500).json({
        success: false,
        error: 'Error al detectar fatiga automática',
        details: error.message
      });
    }
  },

  /**
   * GET /fatigue-history/:userId
   */
  async getFatigueHistory(req, res) {
    try {
      const { userId } = req.params;
      const { limit = 20 } = req.query;

      const result = await pool.query(`
        SELECT
          id, flag_date, flag_type, sleep_quality, energy_level,
          doms_level, joint_pain_level, mean_rir_session,
          underperformed_sets, auto_detected, notes
        FROM app.fatigue_flags
        WHERE user_id = $1
        ORDER BY flag_date DESC
        LIMIT $2
      `, [userId, limit]);

      res.json({
        success: true,
        history: result.rows,
        total: result.rows.length
      });

    } catch (error) {
      logger.error('❌ [FATIGUE] Error obteniendo historial:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener historial de fatiga',
        details: error.message
      });
    }
  }
};

/**
 * ============================================================
 * CONTROLADORES DE WARMUP
 * ============================================================
 */

export const warmupControllers = {
  /**
   * POST /save-warmup-completion
   */
  async saveWarmupCompletion(req, res) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const {
        methodologyPlanId,
        sessionId,
        exerciseId,
        exerciseName,
        warmupConfig,
        setsCompleted,
        setsPlanned,
        userLevel,
        targetWeight
      } = req.body;

      logger.debug(`🔥 [WARMUP] Registrando para ${exerciseName}`);

      const result = await pool.query(`
        INSERT INTO app.warmup_sets_tracking (
          user_id, methodology_plan_id, session_id, exercise_id,
          exercise_name, warmup_config, sets_completed, sets_planned,
          completion_time, user_level, target_weight
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10)
        RETURNING *
      `, [
        userId, methodologyPlanId, sessionId, exerciseId,
        exerciseName, JSON.stringify(warmupConfig), setsCompleted,
        setsPlanned, userLevel, targetWeight
      ]);

      res.json({
        success: true,
        tracking: result.rows[0],
        message: 'Calentamiento registrado correctamente'
      });

    } catch (error) {
      logger.error('❌ [WARMUP] Error registrando:', error);
      res.status(500).json({
        success: false,
        error: 'Error al registrar calentamiento'
      });
    }
  },

  /**
   * GET /check-warmup-reminder/:userId/:exerciseId/:sessionId
   */
  async checkWarmupReminder(req, res) {
    try {
      const { userId, exerciseId, sessionId } = req.params;

      const result = await pool.query(
        `SELECT app.needs_warmup_reminder($1, $2, $3) as reminder`,
        [userId, exerciseId, sessionId]
      );

      res.json({
        success: true,
        ...result.rows[0].reminder
      });

    } catch (error) {
      logger.error('❌ [WARMUP] Error verificando recordatorio:', error);
      res.status(500).json({
        success: false,
        error: 'Error al verificar recordatorio'
      });
    }
  }
};

/**
 * ============================================================
 * CONTROLADORES DE REEVALUACIÓN
 * ============================================================
 */

export const reevaluationControllers = {
  /**
   * GET /check-reevaluation/:userId
   */
  async checkReevaluation(req, res) {
    try {
      const { userId } = req.params;

      logger.debug(`🔍 [REEVALUATION] Verificando para usuario ${userId}`);

      const evaluationResult = await pool.query(
        `SELECT app.evaluate_level_change($1) as evaluation`,
        [userId]
      );

      const evaluation = evaluationResult.rows[0].evaluation;

      const pendingResult = await pool.query(
        `SELECT id, new_level, reason, created_at
         FROM app.level_reevaluations
         WHERE user_id = $1 AND accepted IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );

      const hasPending = pendingResult.rows.length > 0;

      res.json({
        success: true,
        evaluation,
        hasPendingReevaluation: hasPending,
        pendingReevaluation: hasPending ? pendingResult.rows[0] : null,
        shouldShowNotification: !evaluation.no_change && !hasPending
      });

    } catch (error) {
      logger.error('❌ [REEVALUATION] Error verificando:', error);
      res.status(500).json({
        success: false,
        error: 'Error al verificar re-evaluación'
      });
    }
  },

  /**
   * POST /accept-reevaluation
   */
  async acceptReevaluation(req, res) {
    try {
      const userId = req.user?.userId || req.user?.id;
      const { reevaluationId, accept = true } = req.body;

      logger.info(`📝 [REEVALUATION] Usuario ${userId} ${accept ? 'acepta' : 'rechaza'} ${reevaluationId}`);

      const updateResult = await pool.query(
        `UPDATE app.level_reevaluations
         SET accepted = $1, accepted_at = NOW()
         WHERE id = $2 AND user_id = $3
         RETURNING *`,
        [accept, reevaluationId, userId]
      );

      if (updateResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Re-evaluación no encontrada'
        });
      }

      const reevaluation = updateResult.rows[0];

      if (accept) {
        logger.info(`✅ [REEVALUATION] Nivel cambiado a ${reevaluation.new_level}`);
      }

      res.json({
        success: true,
        message: accept ? 'Nivel actualizado exitosamente' : 'Cambio rechazado',
        newLevel: accept ? reevaluation.new_level : reevaluation.previous_level
      });

    } catch (error) {
      logger.error('❌ [REEVALUATION] Error procesando:', error);
      res.status(500).json({
        success: false,
        error: 'Error al procesar respuesta'
      });
    }
  },

  /**
   * POST /trigger-reevaluation
   */
  async triggerReevaluation(req, res) {
    try {
      const userId = req.user?.userId || req.user?.id;

      logger.info(`🔄 [REEVALUATION] Trigger manual para usuario ${userId}`);

      const evaluationResult = await pool.query(
        `SELECT app.evaluate_level_change($1) as evaluation`,
        [userId]
      );

      const evaluation = evaluationResult.rows[0].evaluation;

      res.json({
        success: true,
        evaluation,
        message: 'Evaluación completada'
      });

    } catch (error) {
      logger.error('❌ [REEVALUATION] Error en trigger:', error);
      res.status(500).json({
        success: false,
        error: 'Error al evaluar nivel'
      });
    }
  }
};

/**
 * ============================================================
 * CONTROLADORES DE SESIÓN
 * ============================================================
 */

export const sessionControllers = {
  /**
   * GET /session-config/:cycleDay
   */
  async getSessionConfig(req, res) {
    try {
      const { cycleDay } = req.params;

      const result = await pool.query(
        `SELECT * FROM app.hipertrofia_v2_session_config WHERE cycle_day = $1`,
        [cycleDay]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: `No se encontró configuración para D${cycleDay}`
        });
      }

      res.json({
        success: true,
        sessionConfig: result.rows[0]
      });

    } catch (error) {
      logger.error('❌ [SESSION] Error obteniendo config:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener configuración'
      });
    }
  },

  /**
   * GET /session-config-all
   */
  async getAllSessionConfigs(req, res) {
    try {
      const result = await pool.query(
        `SELECT * FROM app.hipertrofia_v2_session_config ORDER BY cycle_day`
      );

      res.json({
        success: true,
        sessions: result.rows
      });

    } catch (error) {
      logger.error('❌ [SESSION] Error obteniendo configs:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener configuraciones'
      });
    }
  },

  /**
   * POST /save-set
   */
  async saveSet(req, res) {
    try {
      logger.debug('🔍 [SET] Guardando serie');

      // Seguridad: el usuario SIEMPRE sale del token, nunca del body (anti-IDOR).
      const userId = req.user?.userId || req.user?.id;

      const {
        methodologyPlanId,
        sessionId,
        exerciseId,
        exercise_id,
        exerciseName,
        exercise_name,
        setNumber,
        set_number,
        weight,
        weight_used,
        reps,
        reps_completed,
        rir,
        rir_reported,
        isWarmup,
        is_warmup
      } = req.body;

      // Normalizar datos
      const normalizedExerciseId = exerciseId || exercise_id;
      const normalizedExerciseName = exerciseName || exercise_name;
      const normalizedSetNumber = setNumber || set_number;
      // ?? y no ||: el peso 0 es VÁLIDO (ejercicios de peso corporal en
      // calistenia/casa/funcional); con || se convertía en null y rompía el
      // NOT NULL de hypertrophy_set_logs.
      const normalizedWeight = weight ?? weight_used ?? 0;
      const normalizedReps = reps ?? reps_completed;
      const normalizedRir = rir !== undefined ? rir : rir_reported;
      const normalizedIsWarmup = isWarmup !== undefined ? isWarmup : (is_warmup || false);

      if (normalizedIsWarmup) {
        logger.debug('🔥 [SET] Serie de CALENTAMIENTO');
      }

      // Calcular valores derivados
      const isEffective = !normalizedIsWarmup && normalizedRir <= 4;
      const volumeLoad = !normalizedIsWarmup ? normalizedWeight * normalizedReps : 0;
      const estimated1RM = !normalizedIsWarmup && normalizedReps > 0
        ? normalizedWeight * (1 + normalizedReps * 0.0333)
        : null;

      // Idempotencia: un doble tap en "Guardar Serie" (o un retry del cliente) no debe
      // duplicar la serie: si ya existe esa serie para la sesión/ejercicio, se actualiza.
      const existing = await pool.query(`
        SELECT id FROM app.hypertrophy_set_logs
        WHERE session_id = $1 AND user_id = $2 AND set_number = $3 AND is_warmup = $4
          AND (exercise_id = $5 OR (exercise_id IS NULL AND exercise_name = $6))
        LIMIT 1
      `, [sessionId, userId, normalizedSetNumber, normalizedIsWarmup, normalizedExerciseId ?? null, normalizedExerciseName ?? null]);

      let result;
      if (existing.rows.length > 0) {
        result = await pool.query(`
          UPDATE app.hypertrophy_set_logs
          SET weight_used = $2, reps_completed = $3, rir_reported = $4,
              is_effective = $5, volume_load = $6, estimated_1rm = $7
          WHERE id = $1
          RETURNING *
        `, [existing.rows[0].id, normalizedWeight, normalizedReps, normalizedRir, isEffective, volumeLoad, estimated1RM]);
        logger.debug('♻️ [SET] Serie existente actualizada (guardado idempotente)');
      } else {
        result = await pool.query(`
          INSERT INTO app.hypertrophy_set_logs (
            user_id, methodology_plan_id, session_id, exercise_id,
            exercise_name, set_number, weight_used, reps_completed,
            rir_reported, is_warmup, is_effective, volume_load, estimated_1rm
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING *
        `, [
          userId, methodologyPlanId, sessionId, normalizedExerciseId,
          normalizedExerciseName, normalizedSetNumber, normalizedWeight,
          normalizedReps, normalizedRir, normalizedIsWarmup, isEffective,
          volumeLoad, estimated1RM
        ]);
      }

      res.json({
        success: true,
        setData: result.rows[0],
        isWarmup: normalizedIsWarmup,
        isEffective: isEffective
      });

    } catch (error) {
      logger.error('❌ [SET] Error guardando:', error);
      res.status(500).json({
        success: false,
        error: 'Error al guardar serie'
      });
    }
  },

  /**
   * GET /session-summary/:sessionId
   */
  async getSessionSummary(req, res) {
    try {
      const { sessionId } = req.params;
      // Seguridad: limita el resumen a sesiones del propio usuario (anti-IDOR).
      const userId = req.user?.userId || req.user?.id;

      const result = await pool.query(`
        SELECT
          exercise_name,
          COUNT(*) as total_sets,
          SUM(volume_load) as total_volume,
          AVG(rir_reported) as avg_rir,
          MAX(estimated_1rm) as best_pr,
          AVG(CASE WHEN is_effective THEN 1.0 ELSE 0.0 END) * 100 as effective_percentage
        FROM app.hypertrophy_set_logs
        WHERE session_id = $1 AND user_id = $2
        GROUP BY exercise_name
        ORDER BY exercise_name
      `, [sessionId, userId]);

      res.json({
        success: true,
        summary: result.rows
      });

    } catch (error) {
      logger.error('❌ [SESSION] Error obteniendo resumen:', error);
      res.status(500).json({
        success: false,
        error: 'Error al obtener resumen'
      });
    }
  }
};
