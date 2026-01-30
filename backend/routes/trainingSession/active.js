/**
 * @fileoverview Endpoints de gestión de sesiones activas
 * 
 * Endpoints:
 * - POST /start/methodology - Iniciar sesión de metodología
 * - POST /start/home - Iniciar sesión de home training
 * - POST /complete/methodology/:sessionId - Completar sesión de metodología
 * - POST /complete/home/:sessionId - Completar sesión de home training
 * - POST /handle-abandon/:sessionId - Manejar abandono de sesión
 * - PUT /close-active - Cerrar sesiones activas
 * - DELETE /cancel/methodology/:sessionId - Cancelar sesión
 * 
 * @module routes/trainingSession/active
 */

import express from 'express';
import authenticateToken from '../../middleware/auth.js';
import { pool } from '../../db.js';
import { finalizePlanIfCompleted } from '../../services/methodologyPlansService.js';
import { calculateSessionStatus } from '../../services/sessionStatusService.js';
import { normalizeDayAbbrev } from '../../utils/shared/dayNormalizer.js';
import { findWeekInPlan, normalizePlanDays } from '../../utils/shared/planHelpers.js';
import { loadMindfeedRuleset } from '../../services/hipertrofiaV2/rulesetService.js';

const router = express.Router();

// =============================================================================
// HELPER: Función legacy deshabilitada
// =============================================================================
async function ensureMethodologySessions() {
  console.log(`📋 [ensureMethodologySessions] DESHABILITADA - sesiones se crean bajo demanda`);
  return { success: true, created: 0 };
}

function applyDeloadToExercises(exercises, ruleset, reason = 'reactivo') {
  const loadFactor = Number(ruleset?.deloadRules?.loadFactor ?? 0.7);
  const volumeFactor = Number(ruleset?.deloadRules?.volumeFactor ?? 0.5);
  const reasonLabel = String(reason || 'reactivo').toUpperCase();
  const note = `[DELOAD ${reasonLabel}] -30% carga, -50% volumen`;

  return (exercises || []).map(ex => {
    const baseSeries = Number(ex.series || 1);
    const baseIntensity = Number(ex.intensidad_porcentaje || 0);
    const newSeries = Math.max(1, Math.floor(baseSeries * volumeFactor));
    const newIntensity = baseIntensity > 0
      ? Math.round(baseIntensity * loadFactor * 10) / 10
      : baseIntensity;

    return {
      ...ex,
      series: newSeries,
      intensidad_porcentaje: newIntensity,
      notas: `${ex.notas || ''} ${note}`.trim()
    };
  });
}

function applyOverlapToExercises(exercises, overlapInfo) {
  const adjustment = Number(overlapInfo?.adjustment || 0);
  if (!overlapInfo || overlapInfo.overlap === 'none' || adjustment >= 0) {
    return exercises;
  }

  const factor = 1 + adjustment;
  const pct = Math.round(adjustment * 1000) / 10;
  const note = `[OVERLAP ${overlapInfo.overlap}] ${pct}%`;

  return (exercises || []).map(ex => {
    if (ex.tipo_ejercicio !== 'multiarticular') {
      return ex;
    }

    const baseIntensity = Number(ex.intensidad_porcentaje || 0);
    const newIntensity = baseIntensity > 0
      ? Math.round(baseIntensity * factor * 10) / 10
      : baseIntensity;

    return {
      ...ex,
      intensidad_porcentaje: newIntensity,
      notas: `${ex.notas || ''} ${note}`.trim()
    };
  });
}

function getRulesetDeloadWeeks(ruleset) {
  const weeks = ruleset?.deloadRules?.deloadWeeks;
  if (!Array.isArray(weeks) || weeks.length === 0) {
    return [6];
  }
  return weeks.map((week) => Number(week)).filter((week) => !Number.isNaN(week));
}

function parseExercisesValue(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function resetPriorityWeeklyCounters(client, userId) {
  await client.query(
    `UPDATE app.hipertrofia_v2_state
     SET priority_top_sets_this_week = 0,
         weekly_topset_used = false,
         priority_last_week_reset = NOW(),
         updated_at = NOW()
     WHERE user_id = $1
       AND priority_last_week_reset IS NOT NULL
       AND priority_last_week_reset <= NOW() - INTERVAL '7 days'`,
    [userId]
  );
}

async function getMindfeedState(client, userId) {
  await resetPriorityWeeklyCounters(client, userId);

  const stateResult = await client.query(
    `SELECT
       priority_muscle,
       deload_active,
       deload_reason,
       priority_started_at,
       priority_top_sets_this_week,
       methodology_plan_id
     FROM app.hipertrofia_v2_state
     WHERE user_id = $1`,
    [userId]
  );

  return stateResult.rows[0] || null;
}

async function computePrioritySignals(client, userId, planId, priorityMuscle) {
  let meanRirPriority = null;
  let flagsCount = 0;
  let techCorrections = 0;

  try {
    const rirResult = await client.query(
      `SELECT mean_rir
       FROM app.calculate_mean_rir_last_microcycle_by_category($1, $2)
       WHERE categoria ILIKE CONCAT('%', $3, '%')
       ORDER BY mean_rir DESC
       LIMIT 1`,
      [userId, planId, priorityMuscle]
    );
    meanRirPriority = Number(rirResult.rows[0]?.mean_rir ?? null);
  } catch (error) {
    console.warn('[MINDFEED] No se pudo calcular mean RIR por categoría:', error.message);
  }

  const flagsResult = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM app.fatigue_flags
     WHERE user_id = $1
       AND flag_date >= NOW() - INTERVAL '10 days'`,
    [userId]
  );
  flagsCount = Number(flagsResult.rows[0]?.count || 0);

  try {
    const techResult = await client.query(
      `SELECT COALESCE(SUM(corrections_count), 0)::int AS count
       FROM app.technique_corrections
       WHERE user_id = $1
         AND muscle_group ILIKE CONCAT('%', $2, '%')
         AND created_at >= NOW() - INTERVAL '7 days'`,
      [userId, priorityMuscle]
    );
    techCorrections = Number(techResult.rows[0]?.count || 0);
  } catch (error) {
    console.warn('[MINDFEED] No se pudo leer correcciones técnicas:', error.message);
  }

  return { meanRirPriority, flagsCount, techCorrections };
}

function applyPriorityToExercises(exercises, priorityMuscle, npTargetPercent, topSetPercent, topSetAllowed) {
  const priorityIndexes = [];

  const adjusted = (exercises || []).map((ex, idx) => {
    const isPriority = String(ex.categoria || '')
      .toLowerCase()
      .includes(String(priorityMuscle || '').toLowerCase());

    if (isPriority) {
      priorityIndexes.push(idx);
      return {
        ...ex,
        notas: `${ex.notas || ''} [PRIORIDAD: foco técnico y control de RIR]`.trim()
      };
    }

    return {
      ...ex,
      intensidad_porcentaje: npTargetPercent,
      notas: `${ex.notas || ''} [NP: progresión congelada, intensidad ajustada]`.trim()
    };
  });

  if (topSetAllowed && priorityIndexes.length > 0) {
    const firstIdx = priorityIndexes[0];
    const first = adjusted[firstIdx];
    adjusted[firstIdx] = {
      ...first,
      top_set_percent: topSetPercent,
      notas: `${first.notas || ''} [TOP SET semanal: 1ª serie a ${topSetPercent}%]`.trim()
    };
  }

  return adjusted;
}

async function adjustMindfeedExercises(client, { userId, planId, weekNumber, sessionDef, ruleset }) {
  const rawExercises = Array.isArray(sessionDef?.ejercicios) ? sessionDef.ejercicios : [];
  if (rawExercises.length === 0) {
    return { exercises: rawExercises, overlapInfo: null, priority: null, deloadApplied: false };
  }

  const state = await getMindfeedState(client, userId);
  const isHeavyDay = Boolean(
    sessionDef?.es_dia_pesado ||
    sessionDef?.is_heavy_day ||
    Number(sessionDef?.intensidad_porcentaje || 0) >= 80
  );
  const deloadWeeks = getRulesetDeloadWeeks(ruleset);
  const sessionIsDeload = Boolean(sessionDef?.es_deload || sessionDef?.tipo === 'deload');
  const isProgrammedDeloadWeek = deloadWeeks.includes(Number(weekNumber));
  const deloadBlocked = Boolean(state?.deload_active || sessionIsDeload || isProgrammedDeloadWeek);

  let exercises = [...rawExercises];
  let deloadApplied = false;
  let priorityInfo = null;

  if (!sessionIsDeload && state?.deload_active) {
    exercises = applyDeloadToExercises(exercises, ruleset, state.deload_reason || 'reactivo');
    deloadApplied = true;
  } else if (!sessionIsDeload && isProgrammedDeloadWeek) {
    const programmedReason = `programado_semana_${weekNumber}`;
    exercises = applyDeloadToExercises(exercises, ruleset, programmedReason);
    deloadApplied = true;
  }

  if (state?.priority_muscle && !deloadBlocked) {
    const priorityRules = ruleset?.priorityRules || {};
    const topSetRules = priorityRules.topSet || {};
    const nonPriorityRules = priorityRules.nonPriority || {};

    const weeklyLimit = Number(topSetRules.weeklyLimit ?? 1);
    const initialPercent = Number(topSetRules.initialPercent ?? 82.5);
    const maxPercent = Number(topSetRules.maxPercent ?? 85);
    const firstWeeksLimit = Number(topSetRules.firstWeeksLimit ?? 4);
    const minWeeksForMaxPercent = Number(topSetRules.minWeeksForMaxPercent ?? 2);
    const minMeanRir = Number(topSetRules.minMeanRir ?? 3);

    const npTargetPercent = Number(
      isHeavyDay
        ? (nonPriorityRules.heavyDayPercent ?? 76)
        : (nonPriorityRules.lightDayPercent ?? 70)
    );

    const weeksElapsed = state.priority_started_at
      ? Math.max(
          1,
          Math.floor((Date.now() - new Date(state.priority_started_at).getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1
        )
      : 1;

    const { meanRirPriority, flagsCount, techCorrections } = await computePrioritySignals(
      client,
      userId,
      planId,
      state.priority_muscle
    );

    const meanRirReady = meanRirPriority === null ? true : meanRirPriority >= minMeanRir;
    const withinFirstWeeks = weeksElapsed <= firstWeeksLimit;
    const underWeeklyLimit = Number(state.priority_top_sets_this_week || 0) < weeklyLimit;
    const cleanFlags = flagsCount === 0;
    const cleanTechnique = techCorrections < 2;

    const topSetAllowed = isHeavyDay && withinFirstWeeks && underWeeklyLimit && meanRirReady && cleanFlags && cleanTechnique;
    const topSetPercent = weeksElapsed > minWeeksForMaxPercent && topSetAllowed ? maxPercent : initialPercent;

    exercises = applyPriorityToExercises(exercises, state.priority_muscle, npTargetPercent, topSetPercent, topSetAllowed);

    if (topSetAllowed) {
      await client.query(
        `UPDATE app.hipertrofia_v2_state
         SET priority_top_sets_this_week = COALESCE(priority_top_sets_this_week, 0) + 1,
             weekly_topset_used = true,
             updated_at = NOW()
         WHERE user_id = $1`,
        [userId]
      );
    }

    priorityInfo = {
      muscle: state.priority_muscle,
      weeksElapsed,
      meanRirPriority,
      flagsCount,
      techCorrections,
      topSetAllowed,
      topSetPercent,
      npTargetPercent
    };
  }

  let overlapInfo = null;
  try {
    const currentPatterns = exercises.map(ex => ex.patron_movimiento).filter(Boolean);
    const overlapResult = await client.query(
      `SELECT app.detect_neural_overlap($1, $2::jsonb) AS result`,
      [userId, JSON.stringify(currentPatterns)]
    );
    overlapInfo = overlapResult.rows[0]?.result || null;
  } catch (error) {
    console.warn('[MINDFEED] No se pudo detectar solapamiento neural:', error.message);
  }

  exercises = applyOverlapToExercises(exercises, overlapInfo);

  const adjustedAt = new Date().toISOString();
  const markedExercises = exercises.map((ex) => ({
    ...ex,
    mindfeed_adjusted_week: Number(weekNumber),
    mindfeed_adjusted_at: adjustedAt
  }));

  return { exercises: markedExercises, overlapInfo, priority: priorityInfo, deloadApplied };
}

// =============================================================================
// HELPER: Crear sesión para día faltante
// =============================================================================
async function createMissingDaySession(client, userId, methodologyPlanId, planData, dayName, weekNumber) {
  const normalizedDay = normalizeDayAbbrev(dayName);
  const semana = findWeekInPlan(planData?.semanas || [], weekNumber);
  
  if (!semana || !semana.sesiones || semana.sesiones.length === 0) {
    throw new Error('No hay sesiones disponibles en esta semana');
  }

  // Usar template de la primera sesión disponible
  const templateSession = semana.sesiones[0];
  const ejercicios = templateSession.ejercicios || [];

  const insertResult = await client.query(
    `INSERT INTO app.methodology_exercise_sessions 
     (user_id, methodology_plan_id, week_number, day_name, exercises, session_status, total_exercises)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6)
     RETURNING id`,
    [userId, methodologyPlanId, weekNumber, normalizedDay, JSON.stringify(ejercicios), ejercicios.length]
  );

  return insertResult.rows[0].id;
}

// =============================================================================
// POST /start/methodology - Iniciar sesión de metodología
// =============================================================================
router.post('/start/methodology', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = req.user?.userId || req.user?.id;
    const { methodology_plan_id, week_number, day_name } = req.body;

    if (!methodology_plan_id || week_number === undefined || week_number === null || !day_name) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'Faltan parámetros: methodology_plan_id, week_number, day_name'
      });
    }

    // Verificar plan y obtener plan_data
    const planQ = await client.query(
      'SELECT plan_data, methodology_type FROM app.methodology_plans WHERE id = $1 AND user_id = $2',
      [methodology_plan_id, userId]
    );

    if (planQ.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Plan no encontrado' });
    }

    const planData = planQ.rows[0].plan_data;
    const userLevelResult = await client.query(
      'SELECT nivel_entrenamiento FROM app.users WHERE id = $1',
      [userId]
    );
    const nivel = userLevelResult.rows[0]?.nivel_entrenamiento || 'Principiante';
    const ruleset = await loadMindfeedRuleset(client, nivel);

    // Mantener current_week sincronizado para el resto del sistema
    await client.query(
      `UPDATE app.methodology_plans
       SET current_week = $1,
           updated_at = NOW()
       WHERE id = $2 AND user_id = $3`,
      [week_number, methodology_plan_id, userId]
    );

    // Transición automática a intermedio tras semana 12 (si aplica)
    let transitionResult = null;
    try {
      const transitionQuery = await client.query(
        `SELECT app.transition_beginner_to_intermediate($1, $2, $3) AS result`,
        [userId, methodology_plan_id, week_number]
      );
      transitionResult = transitionQuery.rows[0]?.result || null;
    } catch (error) {
      console.warn('[MINDFEED] No se pudo evaluar transición a intermedio:', error.message);
    }

    // Asegurar sesiones creadas
    await ensureMethodologySessions(client, userId, methodology_plan_id, planData);

    const normalizedDay = normalizeDayAbbrev(day_name);

    // Buscar la sesión específica
    let ses = await client.query(
      `SELECT * FROM app.methodology_exercise_sessions
       WHERE user_id = $1 AND methodology_plan_id = $2 AND week_number = $3 AND day_name = $4
       LIMIT 1`,
      [userId, methodology_plan_id, week_number, normalizedDay]
    );

    if (ses.rowCount === 0) {
      console.log(`⚠️ Sesión no encontrada para ${normalizedDay}, creando sesión adaptada...`);
      try {
        const sessionId = await createMissingDaySession(client, userId, methodology_plan_id, planData, day_name, week_number);
        ses = await client.query(
          `SELECT * FROM app.methodology_exercise_sessions WHERE id = $1`,
          [sessionId]
        );
      } catch (createError) {
        console.error('Error creando sesión para día faltante:', createError);
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'Sesión no encontrada para esa semana/día'
        });
      }
    }

    const session = ses.rows[0];
    const existingExercises = parseExercisesValue(session.exercises);
    const alreadyAdjusted = existingExercises.some(
      (ex) => Number(ex?.mindfeed_adjusted_week) === Number(week_number)
    );

    // Precrear progreso por ejercicio
    const semana = findWeekInPlan(planData.semanas || [], week_number);
    let sesionDef = semana ? (semana.sesiones || []).find(s => normalizeDayAbbrev(s.dia) === normalizedDay) : null;

    if (!sesionDef && semana && semana.sesiones && semana.sesiones.length > 0) {
      sesionDef = semana.sesiones[0];
      console.log(`📋 Usando template de ${sesionDef.dia} para día faltante ${normalizedDay}`);
    }

    let ejerciciosFromPlan = Array.isArray(sesionDef?.ejercicios) ? sesionDef.ejercicios : [];
    if (ejerciciosFromPlan.length === 0 && existingExercises.length > 0) {
      ejerciciosFromPlan = existingExercises;
    }

    let ejercicios = alreadyAdjusted ? existingExercises : ejerciciosFromPlan;
    let adjustments = { overlapInfo: null, priority: null, deloadApplied: false };

    if (sesionDef && !alreadyAdjusted) {
      adjustments = await adjustMindfeedExercises(client, {
        userId,
        planId: methodology_plan_id,
        weekNumber: week_number,
        sessionDef: sesionDef,
        ruleset
      });
      ejercicios = adjustments.exercises;
      sesionDef = { ...sesionDef, ejercicios };

      // Persistir ejercicios ajustados en la sesión
      await client.query(
        `UPDATE app.methodology_exercise_sessions
         SET exercises = $2,
         total_exercises = $3
         WHERE id = $1`,
        [session.id, JSON.stringify(ejercicios), ejercicios.length]
      );
    }

    if (alreadyAdjusted) {
      const deloadWeeks = getRulesetDeloadWeeks(ruleset);
      const sessionIsDeload = Boolean(sesionDef?.es_deload || sesionDef?.tipo === 'deload');
      const notesSuggestDeload = existingExercises.some((ex) =>
        String(ex?.notas || '').includes('[DELOAD')
      );
      adjustments.deloadApplied = sessionIsDeload || deloadWeeks.includes(Number(week_number)) || notesSuggestDeload;
    }

    for (let i = 0; i < ejercicios.length; i++) {
      const ej = ejercicios[i] || {};
      const order = i;

      await client.query(
        `INSERT INTO app.methodology_exercise_progress (
           methodology_session_id, user_id, exercise_order, exercise_name,
           series_total, repeticiones, descanso_seg, intensidad, tempo, notas,
           series_completed, status
         )
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, 'pending'
         WHERE NOT EXISTS (
           SELECT 1 FROM app.methodology_exercise_progress
            WHERE methodology_session_id = $1 AND exercise_order = $3
         )`,
        [session.id, userId, order, ej.nombre || `Ejercicio ${i + 1}`,
         String(ej.series || '3'), String(ej.repeticiones || '0'), Number(ej.descanso_seg) || 60,
         ej.intensidad || null, ej.tempo || null, ej.notas || null]
      );
    }

    // Marcar sesión iniciada
    await client.query(
      `UPDATE app.methodology_exercise_sessions
       SET session_status = 'in_progress',
           started_at = COALESCE(started_at, NOW()),
           session_date = COALESCE(session_date, CURRENT_DATE),
           total_exercises = $2
       WHERE id = $1`,
      [session.id, ejercicios.length]
    );

    console.log(`✅ Sesión marcada como iniciada - ID: ${session.id}`);

    await client.query('COMMIT');

    res.json({
      success: true,
      session_id: session.id,
      total_exercises: ejercicios.length,
      session_type: 'methodology',
      mindfeed_adjustments: {
        deload: adjustments.deloadApplied,
        overlap: adjustments.overlapInfo?.overlap || 'none',
        priority: adjustments.priority?.muscle || null,
        transition: transitionResult?.triggered ? transitionResult : null
      }
    });

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error starting methodology session:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  } finally {
    client.release();
  }
});

// =============================================================================
// POST /start/home - Iniciar sesión de home training
// =============================================================================
router.post('/start/home', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { home_training_plan_id } = req.body;
    const user_id = req.user.userId || req.user.id;

    // Verificar que el plan pertenece al usuario
    const planResult = await client.query(
      'SELECT * FROM app.home_training_plans WHERE id = $1 AND user_id = $2',
      [home_training_plan_id, user_id]
    );

    if (planResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Plan de entrenamiento no encontrado'
      });
    }

    const plan = planResult.rows[0];
    const exercises = plan.plan_data.plan_entrenamiento?.ejercicios || [];

    // Crear nueva sesión
    const sessionResult = await client.query(
      `INSERT INTO app.home_training_sessions
       (user_id, home_training_plan_id, total_exercises, session_data)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [user_id, home_training_plan_id, exercises.length, JSON.stringify({ exercises })]
    );

    const session = sessionResult.rows[0];
    const sessionId = session.id;

    // Crear registros de progreso para cada ejercicio
    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i] || {};
      const totalSeries = Number(ex.series ?? ex.total_series ?? ex.totalSeries) || 4;

      await client.query(
        `INSERT INTO app.home_exercise_progress
         (home_training_session_id, exercise_order, exercise_name, total_series,
          series_completed, status, duration_seconds, started_at, exercise_data)
         VALUES ($1, $2, $3, $4, 0, 'pending', NULL, NOW(), $5)`,
        [sessionId, i, ex.nombre, totalSeries, JSON.stringify(ex)]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      session,
      session_type: 'home'
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error starting home training session:', err);
    res.status(500).json({
      success: false,
      message: 'Error al iniciar la sesión de entrenamiento'
    });
  } finally {
    client.release();
  }
});

export default router;
