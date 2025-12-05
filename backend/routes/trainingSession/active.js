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

const router = express.Router();

// =============================================================================
// HELPER: Función legacy deshabilitada
// =============================================================================
async function ensureMethodologySessions() {
  console.log(`📋 [ensureMethodologySessions] DESHABILITADA - sesiones se crean bajo demanda`);
  return { success: true, created: 0 };
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

    if (!methodology_plan_id || !week_number || !day_name) {
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

    // Precrear progreso por ejercicio
    const semana = findWeekInPlan(planData.semanas || [], week_number);
    let sesionDef = semana ? (semana.sesiones || []).find(s => normalizeDayAbbrev(s.dia) === normalizedDay) : null;

    if (!sesionDef && semana && semana.sesiones && semana.sesiones.length > 0) {
      sesionDef = semana.sesiones[0];
      console.log(`📋 Usando template de ${sesionDef.dia} para día faltante ${normalizedDay}`);
    }

    const ejercicios = Array.isArray(sesionDef?.ejercicios) ? sesionDef.ejercicios : [];

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

