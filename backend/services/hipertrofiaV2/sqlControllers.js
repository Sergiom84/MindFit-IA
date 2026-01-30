/**
 * Controladores para endpoints que envuelven funciones SQL
 * Consolida el patrón repetitivo try/catch -> query -> res.json
 */

import pool from '../../db.js';
import { logger } from './logger.js';

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
      logger.debug(`🔍 [SESSION+OVERLAP] Obteniendo D${cycleDay} para usuario ${userId}`);

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

      // Detectar solapamiento (solo principiantes)
      let adjustedSession = { ...currentSession };
      let overlapInfo = null;

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
            if (ex.tipo_ejercicio === 'multiarticular') {
              return {
                ...ex,
                intensidad_porcentaje: Math.round(ex.intensidad_porcentaje * adjustmentFactor * 10) / 10,
                notas: (ex.notas || '') + ` [⚠️ ${adjustmentPct}% por solapamiento ${overlapInfo.overlap}]`
              };
            }
            return ex;
          });
        }
      }

      res.json({
        success: true,
        session: adjustedSession,
        overlap_detected: overlapInfo?.overlap !== 'none',
        overlap_info: overlapInfo,
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
