/**
 * Rutas de seguimiento del Bloque de Adaptación.
 *   GET  /api/adaptation/progress            → progreso del bloque activo
 *   GET  /api/adaptation/sessions            → sesiones del bloque activo
 *   POST /api/adaptation/evaluate-week       → evaluación manual de una semana
 *   POST /api/adaptation/auto-evaluate-week  → evaluación automática desde logs
 *   POST /api/adaptation/technique-flag      → registro de flag de técnica
 *   GET  /api/adaptation/problem-exercises   → ejercicios problemáticos por RIR
 */

import express from 'express';
import pool from '../../db.js';
import { authenticateToken } from '../../middleware/auth.js';
import { getWeekBounds } from '../../services/hipertrofia/adaptation/adaptationHelpers.js';

const router = express.Router();

// ============================================
// GET /api/adaptation/progress
// ============================================
/**
 * Obtiene el progreso actual del bloque de adaptación del usuario
 */
router.get('/progress', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    console.log('📊 [ADAPTACIÓN] Obteniendo progreso para usuario:', userId);

    // Usar la vista de progreso
    const result = await pool.query(
      `SELECT * FROM app.adaptation_progress_summary
       WHERE user_id = $1 AND status = 'active'
       ORDER BY start_date DESC
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        hasActiveBlock: false,
        message: 'No tienes un bloque de adaptación activo'
      });
    }

    const progress = result.rows[0];

    const blockDetailsResult = await pool.query(
      `SELECT methodology_plan_id, ai_tag, sessions_per_week
       FROM app.adaptation_blocks
       WHERE id = $1`,
      [progress.adaptation_block_id]
    );
    const blockDetails = blockDetailsResult.rows[0] || {};

    // Obtener detalles de todas las semanas
    const weeksResult = await pool.query(
      `SELECT
        week_number,
        adherence_percentage,
        adherence_met,
        mean_rir,
        rir_met,
        technique_flags_count,
        technique_met,
        weight_progress_percentage,
        progress_met,
        (adherence_met AND rir_met AND technique_met AND progress_met) AS all_criteria_met
       FROM app.adaptation_criteria_tracking
       WHERE adaptation_block_id = $1
       ORDER BY week_number`,
      [progress.adaptation_block_id]
    );

    // 🎯 FIX: Obtener criterios de la última semana de tracking (la vista no tiene todas las columnas)
    const latestWeekData = weeksResult.rows.length > 0
      ? weeksResult.rows[weeksResult.rows.length - 1]
      : null;

    // Calcular si todos los criterios se cumplen usando datos de tracking
    const latestAdherenceMet = progress.latest_adherence_met ?? latestWeekData?.adherence_met ?? false;
    const latestRirMet = progress.latest_rir_met ?? latestWeekData?.rir_met ?? false;
    const latestTechniqueMet = latestWeekData?.technique_met ?? true; // Default true si no hay datos
    const latestProgressMet = latestWeekData?.progress_met ?? false;
    const allCriteriaMet = latestAdherenceMet && latestRirMet && latestTechniqueMet && latestProgressMet;

    // Contar semanas con todos los criterios cumplidos
    const weeksCriteriaMet = weeksResult.rows.filter(w => w.all_criteria_met).length;

    res.json({
      success: true,
      hasActiveBlock: true,
      block: {
        id: progress.adaptation_block_id,
        methodologyPlanId: blockDetails.methodology_plan_id ?? null,
        blockType: progress.block_type,
        aiTag: blockDetails.ai_tag ?? null,
        durationWeeks: progress.duration_weeks,
        sessionsPerWeek: blockDetails.sessions_per_week ?? null,
        startDate: progress.start_date,
        status: progress.status,
        weeksTracked: progress.weeks_tracked,
        weeksCriteriaMet: weeksCriteriaMet,
        latestWeek: progress.latest_week,
        readyForTransition: progress.ready_for_transition || allCriteriaMet
      },
      weeks: weeksResult.rows,
      latestCriteria: {
        adherence: {
          met: latestAdherenceMet,
          threshold: 80
        },
        rir: {
          met: latestRirMet,
          threshold: 4
        },
        technique: {
          met: latestTechniqueMet,
          threshold: 1
        },
        progress: {
          met: latestProgressMet,
          threshold: 8
        },
        allMet: allCriteriaMet
      }
    });

  } catch (error) {
    console.error('❌ [ADAPTACIÓN] Error obteniendo progreso:', error);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo progreso',
      details: error.message
    });
  }
});

// ============================================
// GET /api/adaptation/sessions
// ============================================
/**
 * Lista sesiones del bloque de adaptación activo
 */
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    const blockResult = await pool.query(
      `SELECT id, methodology_plan_id
       FROM app.adaptation_blocks
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (blockResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No tienes un bloque de adaptación activo'
      });
    }

    const block = blockResult.rows[0];

    const sessionsResult = await pool.query(
      `SELECT id, week_number, day_name, session_name, session_status, session_date, total_exercises
       FROM app.methodology_exercise_sessions
       WHERE user_id = $1 AND methodology_plan_id = $2
       ORDER BY week_number, day_name`,
      [userId, block.methodology_plan_id]
    );

    res.json({
      success: true,
      adaptation_block_id: block.id,
      methodology_plan_id: block.methodology_plan_id,
      sessions: sessionsResult.rows
    });
  } catch (error) {
    console.error('❌ [ADAPTACIÓN] Error obteniendo sesiones:', error);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo sesiones',
      details: error.message
    });
  }
});

// ============================================
// POST /api/adaptation/evaluate-week
// ============================================
/**
 * Evalúa una semana completada y actualiza los criterios
 */
router.post('/evaluate-week', authenticateToken, async (req, res) => {
  const dbClient = await pool.connect();

  try {
    const userId = req.user?.userId || req.user?.id;
    const {
      weekNumber,
      sessionsCompleted,
      meanRir,
      techniqueFlagsCount,
      initialAverageWeight,
      currentAverageWeight
    } = req.body;

    console.log(`📈 [ADAPTACIÓN] Evaluando semana ${weekNumber} para usuario:`, userId);

    await dbClient.query('BEGIN');

    // Obtener bloque activo
    const blockResult = await dbClient.query(
      `SELECT id, sessions_per_week FROM app.adaptation_blocks
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (blockResult.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'No tienes un bloque de adaptación activo'
      });
    }

    const blockRow = blockResult.rows[0];
    const blockId = blockRow.id;
    const sessionsPlanned = blockRow.sessions_per_week || 5;

    // Actualizar o insertar tracking de la semana
    const updateResult = await dbClient.query(
      `INSERT INTO app.adaptation_criteria_tracking (
        adaptation_block_id,
        week_number,
        sessions_planned,
        sessions_completed,
        mean_rir,
        technique_flags_count,
        initial_average_weight,
        current_average_weight,
        week_start_date,
        week_end_date,
        evaluated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        CURRENT_DATE - INTERVAL '6 days',
        CURRENT_DATE,
        NOW()
      )
      ON CONFLICT (adaptation_block_id, week_number)
      DO UPDATE SET
        sessions_completed = EXCLUDED.sessions_completed,
        mean_rir = EXCLUDED.mean_rir,
        technique_flags_count = EXCLUDED.technique_flags_count,
        initial_average_weight = EXCLUDED.initial_average_weight,
        current_average_weight = EXCLUDED.current_average_weight,
        evaluated_at = NOW()
      RETURNING *`,
      [
        blockId,
        weekNumber,
        sessionsPlanned,
        sessionsCompleted,
        meanRir,
        techniqueFlagsCount || 0,
        initialAverageWeight,
        currentAverageWeight
      ]
    );

    const weekData = updateResult.rows[0];

    await dbClient.query('COMMIT');

    console.log('✅ [ADAPTACIÓN] Semana evaluada:', weekNumber);

    // Calcular si todos los criterios se cumplieron
    const allCriteriaMet =
      weekData.adherence_met &&
      weekData.rir_met &&
      weekData.technique_met &&
      weekData.progress_met;

    res.json({
      success: true,
      message: 'Semana evaluada exitosamente',
      week: {
        number: weekData.week_number,
        criteria: {
          adherence: {
            value: weekData.adherence_percentage,
            met: weekData.adherence_met,
            sessions: `${weekData.sessions_completed}/${weekData.sessions_planned}`
          },
          rir: {
            value: weekData.mean_rir,
            met: weekData.rir_met
          },
          technique: {
            flags: weekData.technique_flags_count,
            met: weekData.technique_met
          },
          progress: {
            value: weekData.weight_progress_percentage,
            met: weekData.progress_met,
            initialWeight: weekData.initial_average_weight,
            currentWeight: weekData.current_average_weight
          }
        },
        allCriteriaMet
      },
      readyForTransition: allCriteriaMet
    });

  } catch (error) {
    await dbClient.query('ROLLBACK');
    console.error('❌ [ADAPTACIÓN] Error evaluando semana:', error);
    res.status(500).json({
      success: false,
      error: 'Error evaluando semana',
      details: error.message
    });
  } finally {
    dbClient.release();
  }
});

// ============================================
// POST /api/adaptation/auto-evaluate-week
// ============================================
/**
 * Calcula métricas de la semana actual usando los logs reales
 * y registra la evaluación semanal automáticamente.
 * Pensado para HipertrofiaV2 (usa hypertrophy_set_logs).
 */
router.post('/auto-evaluate-week', authenticateToken, async (req, res) => {
  const dbClient = await pool.connect();

  try {
    const userId = req.user?.userId || req.user?.id;

    console.log('🤖 [ADAPTACIÓN] Auto-evaluando semana para usuario:', userId);

    // Obtener bloque activo
    const blockResult = await dbClient.query(
      `SELECT id, start_date, methodology_plan_id, sessions_per_week
       FROM app.adaptation_blocks
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (blockResult.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'No tienes un bloque de adaptación activo'
      });
    }

    const block = blockResult.rows[0];
    const sessionsPlanned = block.sessions_per_week || 5;
    const { weekNumber, weekStart, weekEnd } = getWeekBounds(block.start_date);

    // Sesiones completadas en la ventana del bloque de adaptación
    const sessionsResult = await dbClient.query(
      `SELECT COUNT(*) AS count
       FROM app.methodology_exercise_sessions
       WHERE user_id = $1
         AND methodology_plan_id = $4
         AND session_status IN ('completed','partial')
         AND session_date::date BETWEEN $2::date AND $3::date`,
      [userId, weekStart, weekEnd, block.methodology_plan_id]
    );

    const sessionsCompleted = parseInt(sessionsResult.rows[0].count, 10) || 0;

    // Métricas desde hypertrophy_set_logs
    const rirResult = await dbClient.query(
      `SELECT
         AVG(rir_reported)                       AS mean_rir,
         AVG(weight_used)                        AS avg_weight
       FROM app.hypertrophy_set_logs
       WHERE user_id = $1
         AND methodology_plan_id = $4
         AND created_at BETWEEN $2 AND ($3 + INTERVAL '1 day')`,
      [userId, weekStart, weekEnd, block.methodology_plan_id]
    );

    const meanRir = parseFloat(rirResult.rows[0].mean_rir) || null;
    const currentAverageWeight = parseFloat(rirResult.rows[0].avg_weight) || null;

    // Peso inicial (baseline): primera semana evaluada o week 1
    let initialAverageWeight = null;
    const baselineResult = await dbClient.query(
      `SELECT initial_average_weight
       FROM app.adaptation_criteria_tracking
       WHERE adaptation_block_id = $1 AND week_number = 1
       ORDER BY evaluated_at DESC
       LIMIT 1`,
      [block.id]
    );
    if (baselineResult.rows.length > 0) {
      initialAverageWeight = parseFloat(baselineResult.rows[0].initial_average_weight) || null;
    }
    if (!initialAverageWeight && weekNumber === 1) {
      initialAverageWeight = currentAverageWeight;
    }

    // Flags técnicos en la semana
    const techniqueFlagsResult = await dbClient.query(
      `SELECT COUNT(*) AS count
       FROM app.adaptation_technique_flags
       WHERE adaptation_block_id = $1
         AND flagged_at BETWEEN $2 AND ($3 + INTERVAL '1 day')`,
      [block.id, weekStart, weekEnd]
    );
    const techniqueFlagsCount = parseInt(techniqueFlagsResult.rows[0].count, 10) || 0;

    // Upsert usando misma lógica que /evaluate-week
    const updateResult = await dbClient.query(
      `INSERT INTO app.adaptation_criteria_tracking (
        adaptation_block_id,
        week_number,
        sessions_planned,
        sessions_completed,
        mean_rir,
        technique_flags_count,
        initial_average_weight,
        current_average_weight,
        week_start_date,
        week_end_date,
        evaluated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9::date, $10::date, NOW()
      )
      ON CONFLICT (adaptation_block_id, week_number)
      DO UPDATE SET
        sessions_completed = EXCLUDED.sessions_completed,
        mean_rir = EXCLUDED.mean_rir,
        technique_flags_count = EXCLUDED.technique_flags_count,
        initial_average_weight = COALESCE(app.adaptation_criteria_tracking.initial_average_weight, EXCLUDED.initial_average_weight),
        current_average_weight = EXCLUDED.current_average_weight,
        week_start_date = EXCLUDED.week_start_date,
        week_end_date = EXCLUDED.week_end_date,
        evaluated_at = NOW()
      RETURNING *`,
      [
        block.id,
        weekNumber,
        sessionsPlanned,
        sessionsCompleted,
        meanRir,
        techniqueFlagsCount,
        initialAverageWeight,
        currentAverageWeight,
        weekStart,
        weekEnd
      ]
    );

    const weekData = updateResult.rows[0];
    const allCriteriaMet =
      weekData.adherence_met &&
      weekData.rir_met &&
      weekData.technique_met &&
      weekData.progress_met;

    res.json({
      success: true,
      message: 'Semana auto-evaluada exitosamente',
      week: {
        number: weekData.week_number,
        criteria: {
          adherence: {
            value: weekData.adherence_percentage,
            met: weekData.adherence_met,
            sessions: `${weekData.sessions_completed}/${weekData.sessions_planned}`
          },
          rir: {
            value: weekData.mean_rir,
            met: weekData.rir_met
          },
          technique: {
            flags: weekData.technique_flags_count,
            met: weekData.technique_met
          },
          progress: {
            value: weekData.weight_progress_percentage,
            met: weekData.progress_met,
            initialWeight: weekData.initial_average_weight,
            currentWeight: weekData.current_average_weight
          }
        },
        allCriteriaMet
      },
      readyForTransition: allCriteriaMet,
      window: {
        start: weekStart,
        end: weekEnd
      }
    });
  } catch (error) {
    await dbClient.query('ROLLBACK');
    console.error('❌ [ADAPTACIÓN] Error en auto-evaluación:', error);
    res.status(500).json({
      success: false,
      error: 'Error auto-evaluando semana',
      details: error.message
    });
  } finally {
    dbClient.release();
  }
});

// ============================================
// POST /api/adaptation/technique-flag
// ============================================
/**
 * Registra un flag de técnica durante el bloque de adaptación
 */
router.post('/technique-flag', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { sessionId, exerciseId, flagType, severity, description } = req.body;

    if (!flagType) {
      return res.status(400).json({
        success: false,
        error: 'flagType es requerido'
      });
    }

    console.log('⚠️  [ADAPTACIÓN] Registrando flag de técnica:', flagType);

    // Obtener bloque activo
    const blockResult = await pool.query(
      `SELECT id FROM app.adaptation_blocks
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (blockResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No tienes un bloque de adaptación activo'
      });
    }

    const blockId = blockResult.rows[0].id;

    // Insertar flag
    const result = await pool.query(
      `INSERT INTO app.adaptation_technique_flags (
        adaptation_block_id,
        user_id,
        session_id,
        exercise_id,
        flag_type,
        severity,
        description
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [blockId, userId, sessionId, exerciseId, flagType, severity || 'moderate', description]
    );

    const flag = result.rows[0];

    console.log('✅ [ADAPTACIÓN] Flag registrado:', flag.id);

    res.json({
      success: true,
      message: 'Flag de técnica registrado',
      flag: {
        id: flag.id,
        type: flag.flag_type,
        severity: flag.severity,
        description: flag.description,
        flaggedAt: flag.flagged_at
      }
    });

  } catch (error) {
    console.error('❌ [ADAPTACIÓN] Error registrando flag:', error);
    res.status(500).json({
      success: false,
      error: 'Error registrando flag de técnica',
      details: error.message
    });
  }
});

// ============================================
// GET /api/adaptation/problem-exercises
// ============================================
/**
 * Obtiene ejercicios con problemas basándose en RIR bajo
 * Muestra ejercicios donde el usuario llega muy cerca del fallo (RIR < 2)
 * o muy lejos (RIR > 4), junto con recomendaciones
 */
router.get('/problem-exercises', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    console.log('🔍 [ADAPTACIÓN] Buscando ejercicios problemáticos para usuario:', userId);

    // Obtener estadísticas de RIR por ejercicio
    const result = await pool.query(`
      SELECT
        exercise_name,
        AVG(rir_reported) as avg_rir,
        MIN(rir_reported) as min_rir,
        MAX(rir_reported) as max_rir,
        COUNT(*) as sets_count,
        AVG(weight_used) as avg_weight,
        MAX(weight_used) as max_weight,
        -- Clasificación del problema
        CASE
          WHEN AVG(rir_reported) < 1 THEN 'critical'    -- Llegando al fallo
          WHEN AVG(rir_reported) < 2 THEN 'warning'     -- Muy cerca del fallo
          WHEN AVG(rir_reported) > 4 THEN 'too_easy'    -- Demasiado fácil
          ELSE 'ok'
        END as status,
        -- Recomendación
        CASE
          WHEN AVG(rir_reported) < 1 THEN 'Reduce el peso un 10-15%. Debes terminar con 3-4 reps en reserva.'
          WHEN AVG(rir_reported) < 2 THEN 'Reduce el peso un 5-10%. El RIR objetivo es 3-4 en adaptación.'
          WHEN AVG(rir_reported) > 4 THEN 'Aumenta el peso un 5-10%. El ejercicio es demasiado ligero.'
          ELSE 'Mantén el peso actual. Buen control del RIR.'
        END as recommendation
      FROM app.hypertrophy_set_logs
      WHERE user_id = $1
        AND created_at > NOW() - INTERVAL '30 days'
        AND rir_reported IS NOT NULL
      GROUP BY exercise_name
      HAVING COUNT(*) >= 2
      ORDER BY
        CASE
          WHEN AVG(rir_reported) < 2 THEN 0  -- Críticos primero
          WHEN AVG(rir_reported) > 4 THEN 1  -- Fáciles después
          ELSE 2                              -- OK al final
        END,
        AVG(rir_reported) ASC
    `, [userId]);

    // Separar por categoría
    const problemExercises = result.rows.filter(r => r.status === 'critical' || r.status === 'warning');
    const easyExercises = result.rows.filter(r => r.status === 'too_easy');
    const okExercises = result.rows.filter(r => r.status === 'ok');

    // Calcular resumen
    const totalExercises = result.rows.length;
    const criticalCount = result.rows.filter(r => r.status === 'critical').length;
    const warningCount = result.rows.filter(r => r.status === 'warning').length;
    const avgRirAll = result.rows.length > 0
      ? result.rows.reduce((acc, r) => acc + parseFloat(r.avg_rir), 0) / result.rows.length
      : null;

    console.log(`📊 [ADAPTACIÓN] Análisis: ${problemExercises.length} problemas, ${easyExercises.length} fáciles, ${okExercises.length} OK`);

    res.json({
      success: true,
      summary: {
        totalExercises,
        criticalCount,
        warningCount,
        easyCount: easyExercises.length,
        okCount: okExercises.length,
        avgRirAll: avgRirAll ? parseFloat(avgRirAll.toFixed(2)) : null,
        rirTarget: '3-4',
        overallStatus: criticalCount > 0 ? 'needs_attention' :
                       warningCount > 2 ? 'minor_issues' : 'good'
      },
      exercises: {
        problems: problemExercises.map(ex => ({
          name: ex.exercise_name,
          avgRir: parseFloat(parseFloat(ex.avg_rir).toFixed(2)),
          minRir: parseFloat(ex.min_rir),
          maxRir: parseFloat(ex.max_rir),
          setsCount: parseInt(ex.sets_count),
          avgWeight: parseFloat(parseFloat(ex.avg_weight).toFixed(1)),
          status: ex.status,
          recommendation: ex.recommendation
        })),
        tooEasy: easyExercises.map(ex => ({
          name: ex.exercise_name,
          avgRir: parseFloat(parseFloat(ex.avg_rir).toFixed(2)),
          setsCount: parseInt(ex.sets_count),
          avgWeight: parseFloat(parseFloat(ex.avg_weight).toFixed(1)),
          recommendation: ex.recommendation
        })),
        ok: okExercises.map(ex => ({
          name: ex.exercise_name,
          avgRir: parseFloat(parseFloat(ex.avg_rir).toFixed(2)),
          setsCount: parseInt(ex.sets_count),
          avgWeight: parseFloat(parseFloat(ex.avg_weight).toFixed(1))
        }))
      },
      message: criticalCount > 0
        ? `⚠️ Tienes ${criticalCount} ejercicio(s) donde llegas muy cerca del fallo. Reduce el peso para mantener RIR 3-4.`
        : warningCount > 0
          ? `📊 Tienes ${warningCount} ejercicio(s) con RIR bajo. Considera reducir un poco el peso.`
          : '✅ Tu control del RIR es adecuado. ¡Sigue así!'
    });

  } catch (error) {
    console.error('❌ [ADAPTACIÓN] Error obteniendo ejercicios problemáticos:', error);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo análisis de ejercicios',
      details: error.message
    });
  }
});

export default router;
