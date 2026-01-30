import express from 'express';
import { pool } from '../db.js';
import authenticateToken from '../middleware/auth.js';

const router = express.Router();

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
      cycle_length = 28,
      period_length = 5,
      is_regular = true,
      uses_hormonal_contraceptives = false,
      last_period_start,
      tracking_enabled = true
    } = req.body;

    // Validaciones
    if (cycle_length < 21 || cycle_length > 45) {
      return res.status(400).json({ error: 'La duración del ciclo debe estar entre 21 y 45 días' });
    }

    if (period_length < 2 || period_length > 10) {
      return res.status(400).json({ error: 'La duración del periodo debe estar entre 2 y 10 días' });
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
             updated_at = NOW()
         WHERE user_id = $1
         RETURNING *`,
        [userId, cycle_length, period_length, is_regular, uses_hormonal_contraceptives, last_period_start, tracking_enabled]
      );
    } else {
      // Crear nuevo
      result = await pool.query(
        `INSERT INTO app.user_menstrual_config 
         (user_id, cycle_length, period_length, is_regular, uses_hormonal_contraceptives, last_period_start, tracking_enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [userId, cycle_length, period_length, is_regular, uses_hormonal_contraceptives, last_period_start, tracking_enabled]
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

    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;

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
      notes
    } = req.body;

    if (!log_date) {
      return res.status(400).json({ error: 'Se requiere log_date' });
    }

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
         (user_id, log_date, is_period_day, energy_level, pain_level, sleep_quality, mood, bloating, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [userId, log_date, is_period_day, energy_level, pain_level, sleep_quality, mood, bloating, notes]
      );
    }

    // Si es día de periodo, actualizar last_period_start en config
    if (is_period_day) {
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
        await client.query(
          `UPDATE app.user_menstrual_config 
           SET last_period_start = $2, updated_at = NOW()
           WHERE user_id = $1`,
          [userId, log_date]
        );
        console.log(`📅 Nuevo inicio de periodo registrado: ${log_date}`);
      }
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

    // Calcular día del ciclo
    let cycleDay = null;
    let phase = null;

    if (config.last_period_start) {
      const lastPeriod = new Date(config.last_period_start);
      const todayDate = new Date(today);
      const diffDays = Math.floor((todayDate - lastPeriod) / (1000 * 60 * 60 * 24)) + 1;
      cycleDay = diffDays % config.cycle_length || config.cycle_length;

      // Determinar fase
      if (config.uses_hormonal_contraceptives) {
        phase = 'hormonal';
      } else if (cycleDay <= config.period_length) {
        phase = 'menstrual';
      } else if (cycleDay <= Math.floor(config.cycle_length * 0.5)) {
        phase = 'follicular';
      } else if (cycleDay <= Math.floor(config.cycle_length * 0.5) + 3) {
        phase = 'ovulation';
      } else {
        phase = 'luteal';
      }
    }

    // Calcular ajuste
    let adjustment = {
      type: 'normal',
      volumeModifier: 0,
      intensityModifier: 0,
      message: 'Sin ajustes necesarios'
    };

    // Prioridad: síntomas reales > fase teórica
    if (todayLog) {
      if (todayLog.pain_level >= 4) {
        adjustment = {
          type: 'low_impact',
          volumeModifier: -0.3,
          intensityModifier: -0.3,
          message: 'Malestar detectado. Recomendamos movilidad o técnica ligera.',
          reason: 'high_pain'
        };
      } else if (todayLog.energy_level <= 2 || todayLog.sleep_quality <= 2) {
        adjustment = {
          type: 'reduce_volume',
          volumeModifier: -0.2,
          intensityModifier: -0.1,
          message: 'Energía baja. Reducimos volumen para mantener calidad.',
          reason: 'low_energy'
        };
      } else if (todayLog.energy_level >= 4 && todayLog.pain_level <= 2) {
        adjustment = {
          type: 'optimal',
          volumeModifier: 0,
          intensityModifier: 0,
          message: 'Estado óptimo. Puedes dar el 100%.',
          reason: 'optimal_state'
        };
      }
    } else if (phase === 'menstrual') {
      adjustment = {
        type: 'menstrual_phase',
        volumeModifier: -0.15,
        intensityModifier: -0.2,
        message: 'Fase menstrual. Escucha a tu cuerpo.',
        reason: 'menstrual_phase'
      };
    } else if (phase === 'luteal' && cycleDay > config.cycle_length - 5) {
      adjustment = {
        type: 'late_luteal',
        volumeModifier: -0.1,
        intensityModifier: -0.1,
        message: 'Fase premenstrual. No fuerces si no te sientes bien.',
        reason: 'premenstrual'
      };
    }

    res.json({
      hasConfig: true,
      cycleDay,
      phase,
      todayLog,
      adjustment
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
