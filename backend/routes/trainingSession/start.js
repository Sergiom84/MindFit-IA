/**
 * Rutas de training-session - dominio: start (extraidas del monolito).
 */

import express from 'express';
import authenticateToken from '../../middleware/auth.js';
import {
  pool
} from '../../db.js';
import {
  SESSION_STATES
} from '../../services/sessionStatusService.js';
import {
  transition,
  SESSION_ACTIONS
} from '../../services/sessionStateMachine.js';
import {
  normalizeDayAbbrev
} from '../../utils/shared/dayNormalizer.js';
import {
  findWeekInPlan
} from '../../utils/shared/planHelpers.js';
import {
  ensureMethodologySessions,
  createMissingDaySession
} from './_helpers.js';

const router = express.Router();


// ===============================================
// SESIÓN GENERAL - INICIO Y CONFIGURACIÓN
// ===============================================

/**
 * POST /api/training-session/start/methodology
 * Iniciar sesión de metodología (calistenia, hipertrofia, etc.)
 */
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

    // 🧹 LIMPIEZA PRE-SESIÓN: Cerrar sesiones viejas en limbo antes de iniciar nueva
    const { preSessionCleanup } = await import('../utils/sessionCleanup.js');
    const cleanupResult = await preSessionCleanup(userId, methodology_plan_id);
    if (cleanupResult.cleanedSessions > 0 || cleanupResult.fixedStates > 0) {
      console.log(`🧹 Pre-limpieza: ${cleanupResult.cleanedSessions} sesiones cerradas, ${cleanupResult.fixedStates} estados corregidos`);
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
    const methodologyType = String(planQ.rows[0].methodology_type || '');
    const isAdaptation = planData?.type === 'adaptation' || methodologyType.toLowerCase() === 'adaptation';

    // Mantener current_week sincronizado para lógica de calibración/deload
    await client.query(
      `UPDATE app.methodology_plans
       SET current_week = $1,
           updated_at = NOW()
       WHERE id = $2 AND user_id = $3`,
      [week_number, methodology_plan_id, userId]
    );

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
      if (isAdaptation) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error: 'Sesión de adaptación no encontrada para esa semana/día'
        });
      }

      // Intentar crear sesión para día faltante (solo metodologías estándar)
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

    // Precrear progreso por ejercicio
    let ejercicios = [];
    if (isAdaptation) {
      const rawExercises = session.exercises_data || session.exercises || [];
      if (Array.isArray(rawExercises)) {
        ejercicios = rawExercises;
      } else if (typeof rawExercises === 'string') {
        try {
          ejercicios = JSON.parse(rawExercises);
        } catch {
          ejercicios = [];
        }
      }
    } else {
      const semana = findWeekInPlan(planData.semanas || [], week_number);
      let sesionDef = semana ? (semana.sesiones || []).find(s => normalizeDayAbbrev(s.dia) === normalizedDay) : null;

      if (!sesionDef && semana && semana.sesiones && semana.sesiones.length > 0) {
        sesionDef = semana.sesiones[0];
        console.log(`📋 Usando template de ${sesionDef.dia} para día faltante ${normalizedDay}`);
      }

      ejercicios = Array.isArray(sesionDef?.ejercicios) ? sesionDef.ejercicios : [];
    }

    for (let i = 0; i < ejercicios.length; i++) {
      const ej = ejercicios[i] || {};
      const order = i;

      const repeticiones = ej.repeticiones ?? ej.reps ?? ej.reps_objetivo ?? ej.repsRange ?? ej.reps_range ?? '0';
      const series = ej.series ?? ej.series_total ?? ej.seriesTotal ?? '3';
      const rawExerciseId = ej.exercise_id ?? ej.id ?? null;
      const parsedExerciseId = Number(rawExerciseId);
      const exerciseId = Number.isFinite(parsedExerciseId) ? parsedExerciseId : null;
      await client.query(
        `INSERT INTO app.methodology_exercise_progress (
           methodology_session_id, user_id, exercise_order, exercise_name,
           series_total, repeticiones, descanso_seg, intensidad, tempo, notas,
           series_completed, status, exercise_id
         )
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, 'pending', $11
         WHERE NOT EXISTS (
           SELECT 1 FROM app.methodology_exercise_progress
            WHERE methodology_session_id = $1 AND exercise_order = $3
         )`,
        [
          session.id,
          userId,
          order,
          ej.nombre || ej.exercise_name || `Ejercicio ${i + 1}`,
          String(series),
          String(repeticiones),
          Number(ej.descanso_seg) || 60,
          ej.intensidad || ej.intensidad_porcentaje || ej.intensity || null,
          ej.tempo || null,
          ej.notas || null,
          exerciseId
        ]
      );
    }

    // 🔄 Validar transición de estado usando la máquina de estados
    const currentStatus = session.session_status || SESSION_STATES.PENDING;
    const transitionResult = transition(currentStatus, SESSION_ACTIONS.START);
    
    if (!transitionResult.success) {
      // Si la sesión ya está en progreso, permitir continuar (caso de reanudación)
      if (currentStatus === SESSION_STATES.IN_PROGRESS) {
        console.log(`📋 Sesión ${session.id} ya en progreso, continuando...`);
      } else {
        console.warn(`⚠️ [StateMachine] Transición inválida: ${transitionResult.error}`);
        // No bloqueamos, pero lo registramos
      }
    }

    // Marcar sesión iniciada con el estado validado
    const newStatus = transitionResult.success ? transitionResult.newState : SESSION_STATES.IN_PROGRESS;
    await client.query(
      `UPDATE app.methodology_exercise_sessions
       SET session_status = $3,
           started_at = COALESCE(started_at, NOW()),
           session_date = COALESCE(session_date, CURRENT_DATE),
           total_exercises = $2
       WHERE id = $1`,
      [session.id, ejercicios.length, newStatus]
    );

    console.log(`✅ Sesión marcada como ${newStatus} - ID: ${session.id}`);

    await client.query('COMMIT');

    res.json({
      success: true,
      session_id: session.id,
      total_exercises: ejercicios.length,
      session_type: 'methodology'
    });

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error starting methodology session:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  } finally {
    client.release();
  }
});


/**
 * POST /api/training-session/start/home
 * Iniciar sesión de entrenamiento en casa
 */
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
