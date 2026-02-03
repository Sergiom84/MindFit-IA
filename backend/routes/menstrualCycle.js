import express from 'express';
import { pool } from '../db.js';
import authenticateToken from '../middleware/auth.js';
import {
  buildCycleAdjustment,
  computeCycleLengthEMA,
  computeCycleConfidence
} from '../services/menstrualCycle/engine.js';
import {
  applyAutoAdjustFromLog,
  getActiveDeloadState
} from '../services/menstrualCycle/autoAdjustService.js';

const router = express.Router();

const mapPainLevelTo0_3 = (painLevel) => {
  if (!Number.isFinite(painLevel)) return undefined;
  if (painLevel <= 1) return 0;
  if (painLevel === 2) return 1;
  if (painLevel === 3) return 1;
  if (painLevel === 4) return 2;
  return 3;
};

const mapEnergyLevelToFatigue0_3 = (energyLevel) => {
  if (!Number.isFinite(energyLevel)) return undefined;
  if (energyLevel <= 1) return 3;
  if (energyLevel === 2) return 2;
  if (energyLevel === 3) return 1;
  return 0;
};

const mapSleepQualityTo0_3 = (sleepQuality) => {
  if (!Number.isFinite(sleepQuality)) return undefined;
  if (sleepQuality <= 1) return 3;
  if (sleepQuality === 2) return 2;
  if (sleepQuality === 3) return 1;
  return 0;
};

const normalizeDailyLog = (log = {}) => ({
  pain_0_3: Number.isFinite(log.pain_0_3) ? log.pain_0_3 : mapPainLevelTo0_3(log.pain_level),
  fatigue_0_3: Number.isFinite(log.fatigue_0_3) ? log.fatigue_0_3 : mapEnergyLevelToFatigue0_3(log.energy_level),
  sleep_0_3: Number.isFinite(log.sleep_0_3) ? log.sleep_0_3 : mapSleepQualityTo0_3(log.sleep_quality),
  stress_0_3: Number.isFinite(log.stress_0_3) ? log.stress_0_3 : undefined
});

const getHasRecentLogs = async (client, userId, referenceDate) => {
  if (!referenceDate) return false;
  const endDate = new Date(referenceDate);
  const startDate = new Date(referenceDate);
  startDate.setDate(startDate.getDate() - 9);
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  const result = await client.query(
    `SELECT COUNT(*)::int AS total
     FROM app.menstrual_daily_log
     WHERE user_id = $1 AND log_date BETWEEN $2 AND $3`,
    [userId, startStr, endStr]
  );

  return result.rows[0]?.total >= 10;
};

const buildUserMessage = ({ mode, severity, dominantDomain, deloadActive }) => {
  if (deloadActive) {
    return 'Semana de descarga: bajamos la carga para volver a progresar sin acumular fatiga.';
  }
  if (mode === 'symptoms') {
    return 'Usamos tus síntomas y rendimiento para ajustar la sesión (sin predecir fases).';
  }
  if (severity >= 2 && dominantDomain === 'pain') {
    return 'Dolor moderado: cambiamos a una variante con menos impacto sin perder el estímulo.';
  }
  if (severity >= 2 && dominantDomain === 'sleep') {
    return 'Sueño bajo: bajamos la intensidad y subimos el descanso para que recuperes mejor.';
  }
  if (severity >= 2 && dominantDomain === 'fatigue') {
    return 'Fatiga alta: reducimos volumen para proteger la recuperación.';
  }
  if (severity >= 2 && dominantDomain === 'stress') {
    return 'Estrés alto: bajamos la carga y cuidamos el descanso.';
  }
  return 'Sin ajustes necesarios.';
};

/**
 * Rutas para el módulo de Ciclo Menstrual
 * Todas las rutas requieren autenticación
 */

// ============================================
// CONFIGURACIÓN DEL CICLO
// ============================================

/**
 * GET /api/menstrual-cycle/config
 * Obtener configuración del ciclo del usuario
 */
router.get('/config', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `SELECT * FROM app.user_menstrual_config WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({ config: null });
    }

    res.json({ config: result.rows[0] });
  } catch (error) {
    console.error('Error obteniendo config del ciclo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/menstrual-cycle/config
 * Crear o actualizar configuración del ciclo
 */
router.post('/config', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      cycle_length,
      period_length,
      is_regular = true,
      uses_hormonal_contraceptives,
      last_period_start,
      tracking_enabled = true,
      contraception_type,
      last_bleed_start_date,
      bleed_length_days,
      cycle_length_days,
      luteal_length_days,
      joint_laxity_risk
    } = req.body;

    const resolvedCycleLengthDays = cycle_length_days ?? cycle_length ?? 28;
    const resolvedBleedLengthDays = bleed_length_days ?? period_length ?? 5;
    const resolvedLastBleedStart = last_bleed_start_date ?? last_period_start ?? null;
    const resolvedContraceptionType = contraception_type ?? (uses_hormonal_contraceptives ? 'other/unknown' : 'none');
    const resolvedUsesHormonal = uses_hormonal_contraceptives ?? (resolvedContraceptionType && !['none', 'copper_iud'].includes(resolvedContraceptionType));
    const resolvedLutealLength = luteal_length_days ?? 14;
    const resolvedCycleLength = cycle_length ?? resolvedCycleLengthDays;
    const resolvedPeriodLength = period_length ?? resolvedBleedLengthDays;

    // Validaciones
    if (resolvedCycleLength < 21 || resolvedCycleLength > 45) {
      return res.status(400).json({ error: 'La duración del ciclo debe estar entre 21 y 45 días' });
    }

    if (resolvedPeriodLength < 2 || resolvedPeriodLength > 10) {
      return res.status(400).json({ error: 'La duración del periodo debe estar entre 2 y 10 días' });
    }

    if (resolvedBleedLengthDays < 1 || resolvedBleedLengthDays > 10) {
      return res.status(400).json({ error: 'La duración del sangrado debe estar entre 1 y 10 días' });
    }

    if (resolvedCycleLengthDays < 21 || resolvedCycleLengthDays > 45) {
      return res.status(400).json({ error: 'cycle_length_days debe estar entre 21 y 45 días' });
    }

    if (resolvedLutealLength < 9 || resolvedLutealLength > 18) {
      return res.status(400).json({ error: 'luteal_length_days debe estar entre 9 y 18 días' });
    }

    // Verificar si ya existe configuración
    const existing = await pool.query(
      `SELECT id FROM app.user_menstrual_config WHERE user_id = $1`,
      [userId]
    );

    let result;

    if (existing.rows.length > 0) {
      // Actualizar
      result = await pool.query(
        `UPDATE app.user_menstrual_config 
         SET cycle_length = $2, 
             period_length = $3, 
             is_regular = $4, 
             uses_hormonal_contraceptives = $5,
             last_period_start = $6,
             tracking_enabled = $7,
             contraception_type = $8,
             last_bleed_start_date = $9,
             bleed_length_days = $10,
             cycle_length_days = $11,
             luteal_length_days = $12,
             joint_laxity_risk = $13,
             updated_at = NOW()
         WHERE user_id = $1
         RETURNING *`,
        [
          userId,
          resolvedCycleLength,
          resolvedPeriodLength,
          is_regular,
          resolvedUsesHormonal,
          resolvedLastBleedStart,
          tracking_enabled,
          resolvedContraceptionType,
          resolvedLastBleedStart,
          resolvedBleedLengthDays,
          resolvedCycleLengthDays,
          resolvedLutealLength,
          joint_laxity_risk ?? false
        ]
      );
    } else {
      // Crear nuevo
      result = await pool.query(
        `INSERT INTO app.user_menstrual_config 
         (user_id, cycle_length, period_length, is_regular, uses_hormonal_contraceptives, last_period_start, tracking_enabled,
          contraception_type, last_bleed_start_date, bleed_length_days, cycle_length_days, luteal_length_days, joint_laxity_risk)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          userId,
          resolvedCycleLength,
          resolvedPeriodLength,
          is_regular,
          resolvedUsesHormonal,
          resolvedLastBleedStart,
          tracking_enabled,
          resolvedContraceptionType,
          resolvedLastBleedStart,
          resolvedBleedLengthDays,
          resolvedCycleLengthDays,
          resolvedLutealLength,
          joint_laxity_risk ?? false
        ]
      );
    }

    console.log(`✅ Config de ciclo guardada para usuario ${userId}`);
    res.json({ success: true, config: result.rows[0] });

  } catch (error) {
    console.error('Error guardando config del ciclo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// ============================================
// REGISTRO DIARIO
// ============================================

/**
 * GET /api/menstrual-cycle/log/:date
 * Obtener registro de un día específico
 */
router.get('/log/:date', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { date } = req.params;

    const result = await pool.query(
      `SELECT * FROM app.menstrual_daily_log 
       WHERE user_id = $1 AND log_date = $2`,
      [userId, date]
    );

    res.json({ log: result.rows[0] || null });
  } catch (error) {
    console.error('Error obteniendo log del día:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/menstrual-cycle/logs
 * Obtener logs de un mes específico (para calendario)
 */
router.get('/logs', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({ error: 'Se requiere year y month' });
    }

    const yearNum = Number(year);
    const monthNum = Number(month);
    if (!Number.isFinite(yearNum) || !Number.isFinite(monthNum)) {
      return res.status(400).json({ error: 'year y month deben ser numericos' });
    }

    const startDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
    const endDate = new Date(Date.UTC(yearNum, monthNum, 0)).toISOString().split('T')[0];

    const result = await pool.query(
      `SELECT * FROM app.menstrual_daily_log 
       WHERE user_id = $1 AND log_date BETWEEN $2 AND $3
       ORDER BY log_date ASC`,
      [userId, startDate, endDate]
    );

    res.json({ logs: result.rows });
  } catch (error) {
    console.error('Error obteniendo logs del mes:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * POST /api/menstrual-cycle/log
 * Crear o actualizar registro diario
 */
router.post('/log', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const userId = req.user.userId;
    const {
      log_date,
      is_period_day = false,
      energy_level,
      pain_level,
      sleep_quality,
      mood,
      bloating,
      notes,
      pain_0_3,
      fatigue_0_3,
      sleep_0_3,
      stress_0_3,
      pain_next_day_0_10,
      session_quality_0_10
    } = req.body;

    if (!log_date) {
      return res.status(400).json({ error: 'Se requiere log_date' });
    }

    const resolvedPain0_3 = Number.isFinite(pain_0_3) ? pain_0_3 : mapPainLevelTo0_3(pain_level);
    const resolvedFatigue0_3 = Number.isFinite(fatigue_0_3) ? fatigue_0_3 : mapEnergyLevelToFatigue0_3(energy_level);
    const resolvedSleep0_3 = Number.isFinite(sleep_0_3) ? sleep_0_3 : mapSleepQualityTo0_3(sleep_quality);
    const resolvedStress0_3 = Number.isFinite(stress_0_3) ? stress_0_3 : undefined;

    await client.query('BEGIN');

    // Verificar si ya existe un registro para ese día
    const existing = await client.query(
      `SELECT id FROM app.menstrual_daily_log WHERE user_id = $1 AND log_date = $2`,
      [userId, log_date]
    );

    let result;

    if (existing.rows.length > 0) {
      // Actualizar registro existente
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (is_period_day !== undefined) {
        updates.push(`is_period_day = $${paramCount++}`);
        values.push(is_period_day);
      }
      if (energy_level !== undefined) {
        updates.push(`energy_level = $${paramCount++}`);
        values.push(energy_level);
      }
      if (pain_level !== undefined) {
        updates.push(`pain_level = $${paramCount++}`);
        values.push(pain_level);
      }
      if (sleep_quality !== undefined) {
        updates.push(`sleep_quality = $${paramCount++}`);
        values.push(sleep_quality);
      }
      if (mood !== undefined) {
        updates.push(`mood = $${paramCount++}`);
        values.push(mood);
      }
      if (bloating !== undefined) {
        updates.push(`bloating = $${paramCount++}`);
        values.push(bloating);
      }
      if (notes !== undefined) {
        updates.push(`notes = $${paramCount++}`);
        values.push(notes);
      }
      if (resolvedPain0_3 !== undefined) {
        updates.push(`pain_0_3 = $${paramCount++}`);
        values.push(resolvedPain0_3);
      }
      if (resolvedFatigue0_3 !== undefined) {
        updates.push(`fatigue_0_3 = $${paramCount++}`);
        values.push(resolvedFatigue0_3);
      }
      if (resolvedSleep0_3 !== undefined) {
        updates.push(`sleep_0_3 = $${paramCount++}`);
        values.push(resolvedSleep0_3);
      }
      if (resolvedStress0_3 !== undefined) {
        updates.push(`stress_0_3 = $${paramCount++}`);
        values.push(resolvedStress0_3);
      }
      if (pain_next_day_0_10 !== undefined) {
        updates.push(`pain_next_day_0_10 = $${paramCount++}`);
        values.push(pain_next_day_0_10);
      }
      if (session_quality_0_10 !== undefined) {
        updates.push(`session_quality_0_10 = $${paramCount++}`);
        values.push(session_quality_0_10);
      }

      values.push(userId, log_date);

      result = await client.query(
        `UPDATE app.menstrual_daily_log 
         SET ${updates.join(', ')}
         WHERE user_id = $${paramCount++} AND log_date = $${paramCount}
         RETURNING *`,
        values
      );
    } else {
      // Crear nuevo registro
      result = await client.query(
        `INSERT INTO app.menstrual_daily_log 
         (user_id, log_date, is_period_day, energy_level, pain_level, sleep_quality, mood, bloating, notes,
          pain_0_3, fatigue_0_3, sleep_0_3, stress_0_3, pain_next_day_0_10, session_quality_0_10)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING *`,
        [
          userId,
          log_date,
          is_period_day,
          energy_level,
          pain_level,
          sleep_quality,
          mood,
          bloating,
          notes,
          resolvedPain0_3 ?? null,
          resolvedFatigue0_3 ?? null,
          resolvedSleep0_3 ?? null,
          resolvedStress0_3 ?? null,
          pain_next_day_0_10 ?? null,
          session_quality_0_10 ?? null
        ]
      );
    }

    // Si es día de periodo, actualizar last_period_start en config
    if (is_period_day) {
      const configResult = await client.query(
        `SELECT * FROM app.user_menstrual_config WHERE user_id = $1`,
        [userId]
      );
      const config = configResult.rows[0];

      // Verificar si este es el primer día de un nuevo periodo
      const yesterday = new Date(log_date);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      const yesterdayLog = await client.query(
        `SELECT is_period_day FROM app.menstrual_daily_log 
         WHERE user_id = $1 AND log_date = $2`,
        [userId, yesterdayStr]
      );

      // Si ayer NO era día de periodo, este es el inicio de un nuevo periodo
      if (!yesterdayLog.rows[0]?.is_period_day) {
        if (config) {
          const previousStart = config.last_bleed_start_date || config.last_period_start;
          let cycleLengthDays = null;

          if (previousStart) {
            const prev = new Date(previousStart);
            const current = new Date(log_date);
            const diffDays = Math.floor((current - prev) / (1000 * 60 * 60 * 24));
            if (diffDays >= 21 && diffDays <= 45) {
              cycleLengthDays = diffDays;
            }
          }

          await client.query(
            `INSERT INTO app.menstrual_cycle_history (user_id, bleed_start_date, cycle_length_days)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, bleed_start_date) DO NOTHING`,
            [userId, log_date, cycleLengthDays]
          );

          const historyResult = await client.query(
            `SELECT cycle_length_days
             FROM app.menstrual_cycle_history
             WHERE user_id = $1 AND cycle_length_days IS NOT NULL
             ORDER BY bleed_start_date ASC`,
            [userId]
          );

          const cycleLengths = historyResult.rows.map(row => row.cycle_length_days);
          const hasRecentLogs = await getHasRecentLogs(client, userId, log_date);
          const contraceptionType = config.contraception_type || (config.uses_hormonal_contraceptives ? 'other/unknown' : 'none');
          const confidence = computeCycleConfidence({
            cycleLengths,
            hasLastBleedStartDate: true,
            hasRecentLogs,
            contraceptionType
          });

          let updatedCycleLength = config.cycle_length_days;
          if (cycleLengths.length >= 2) {
            const ema = computeCycleLengthEMA(cycleLengths, 0.3);
            if (ema) {
              updatedCycleLength = Math.min(45, Math.max(21, Math.round(ema)));
            }
          }

          await client.query(
            `UPDATE app.user_menstrual_config 
             SET last_period_start = $2,
                 last_bleed_start_date = $2,
                 cycle_length_days = $3,
                 cycle_length = $3,
                 cycle_confidence = $4,
                 updated_at = NOW()
             WHERE user_id = $1`,
            [userId, log_date, updatedCycleLength, confidence]
          );
        }
        console.log(`📅 Nuevo inicio de periodo registrado: ${log_date}`);
      }
    }

    // Autoajuste: registrar pain_next_day / session_quality por patrón
    if (pain_next_day_0_10 !== undefined || session_quality_0_10 !== undefined) {
      await applyAutoAdjustFromLog(client, {
        userId,
        logDate: log_date,
        painNextDay: pain_next_day_0_10,
        sessionQuality: session_quality_0_10
      });
    }

    await client.query('COMMIT');

    console.log(`✅ Log diario guardado para ${log_date}`);
    res.json({ success: true, log: result.rows[0] });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error guardando log diario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
});

// ============================================
// DATOS PARA INTEGRACIÓN CON ENTRENAMIENTOS
// ============================================

/**
 * GET /api/menstrual-cycle/training-adjustment
 * Obtener ajuste de entrenamiento recomendado para hoy
 * Usado por HipertrofiaV2 y HomeTraining
 */
router.get('/training-adjustment', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().split('T')[0];

    // Obtener config
    const configResult = await pool.query(
      `SELECT * FROM app.user_menstrual_config WHERE user_id = $1 AND tracking_enabled = true`,
      [userId]
    );

    if (configResult.rows.length === 0) {
      return res.json({ 
        hasConfig: false,
        adjustment: null 
      });
    }

    const config = configResult.rows[0];

    // Obtener log de hoy
    const logResult = await pool.query(
      `SELECT * FROM app.menstrual_daily_log WHERE user_id = $1 AND log_date = $2`,
      [userId, today]
    );

    const todayLog = logResult.rows[0] || null;
    const normalizedLog = todayLog ? normalizeDailyLog(todayLog) : {};
    const hasRecentLogs = await getHasRecentLogs(pool, userId, today);

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

    if (computedConfidence && computedConfidence !== config.cycle_confidence) {
      await pool.query(
        `UPDATE app.user_menstrual_config
         SET cycle_confidence = $2, updated_at = NOW()
         WHERE user_id = $1`,
        [userId, computedConfidence]
      );
    }

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

    const swapRequired = (normalizedLog.pain_0_3 ?? 0) >= 2;
    const message = buildUserMessage({
      mode: adjustmentResult.mode,
      severity: adjustmentResult.severity,
      dominantDomain: adjustmentResult.dominantDomain,
      deloadActive: adjustmentResult.deloadActive
    });

    const type = adjustmentResult.deloadActive
      ? 'deload'
      : adjustmentResult.severity >= 3
        ? 'low_impact'
        : adjustmentResult.severity === 2
          ? 'reduce_volume'
          : adjustmentResult.phase === 'menstruation'
            ? 'menstrual_phase'
            : adjustmentResult.phase === 'luteal_late'
              ? 'late_luteal'
              : 'normal';

    const volumeModifier = (adjustmentResult.multipliers?.volume ?? 1) - 1;
    const intensityModifier = (adjustmentResult.multipliers?.intensity ?? 1) - 1;
    const uiPhase = adjustmentResult.mode === 'symptoms'
      ? null
      : (adjustmentResult.phase === 'menstruation'
        ? 'menstrual'
        : adjustmentResult.phase === 'luteal_late'
          ? 'luteal'
          : adjustmentResult.phase);
    const cycleDayOut = adjustmentResult.mode === 'symptoms' ? null : adjustmentResult.cycleDay;

    res.json({
      hasConfig: true,
      mode: adjustmentResult.mode,
      cycle_confidence: adjustmentResult.cycleConfidence,
      cycle_day: cycleDayOut,
      cycleDay: cycleDayOut,
      phase: uiPhase,
      phase_v3: adjustmentResult.phase,
      todayLog,
      adjustment: {
        type,
        volumeModifier,
        intensityModifier,
        severity_global: adjustmentResult.severity,
        dominant_domain: adjustmentResult.dominantDomain,
        weight_symptoms: adjustmentResult.weightSymptoms,
        multipliers: adjustmentResult.multipliers,
        rest_extra_seconds: adjustmentResult.restExtraSeconds,
        swap_required: swapRequired,
        reason: adjustmentResult.dominantDomain,
        message,
        deload_active: adjustmentResult.deloadActive
      }
    });

  } catch (error) {
    console.error('Error obteniendo ajuste de entrenamiento:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/menstrual-cycle/check-user
 * Verificar si el usuario es femenino y tiene/necesita config de ciclo
 * Usado para mostrar/ocultar la pestaña de ciclo
 */
router.get('/check-user', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Verificar sexo del usuario
    const userResult = await pool.query(
      `SELECT sexo FROM app.users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.json({ showCycleFeature: false });
    }

    const isFemale = userResult.rows[0].sexo === 'femenino';

    if (!isFemale) {
      return res.json({ 
        showCycleFeature: false,
        reason: 'not_female'
      });
    }

    // Verificar si tiene configuración
    const configResult = await pool.query(
      `SELECT tracking_enabled FROM app.user_menstrual_config WHERE user_id = $1`,
      [userId]
    );

    const hasConfig = configResult.rows.length > 0;
    const trackingEnabled = hasConfig ? configResult.rows[0].tracking_enabled : false;

    res.json({
      showCycleFeature: true,
      hasConfig,
      trackingEnabled
    });

  } catch (error) {
    console.error('Error verificando usuario para ciclo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
