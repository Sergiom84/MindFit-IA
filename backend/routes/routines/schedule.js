/**
 * Rutas de rutinas - dominio: schedule (extraidas de routes/routines.js).
 */

import express from 'express';
import authenticateToken from '../../middleware/auth.js';
import {
  pool
} from '../../db.js';
import {
  ensureWorkoutScheduleV3
} from '../../utils/ensureScheduleV3.js';
import {
  getDayAbbrevByIndex,
  getDayNameByIndex
} from '../../utils/shared/dayNormalizer.js';

const router = express.Router();


// GET /api/routines/active-plan
// Obtiene la rutina activa del usuario para restaurar después del login
// Busca plan de metodología activo del usuario
// GET /api/routines/calendar-schedule/:planId
// Obtiene el calendario real desde la BD con días redistribuidos
router.get('/calendar-schedule/:planId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const planId = req.params.planId;

    // Verificar que el plan pertenece al usuario
    const planCheck = await pool.query(
      `SELECT id, plan_data, plan_start_date, confirmed_at, created_at
       FROM app.methodology_plans
       WHERE id = $1 AND user_id = $2`,
      [planId, userId]
    );

    if (planCheck.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Plan no encontrado'
      });
    }

    const plan = planCheck.rows[0];
    const planData = typeof plan.plan_data === 'string' ? JSON.parse(plan.plan_data) : plan.plan_data;
    const startDateFromPlan = plan.plan_start_date || plan.confirmed_at || plan.created_at || new Date();

    // Intentar leer configuración de inicio (para redistribución)
    const startConfigQuery = await pool.query(
      `SELECT * FROM app.plan_start_config WHERE methodology_plan_id = $1`,
      [planId]
    );
    const startConfig = startConfigQuery.rowCount > 0 ? startConfigQuery.rows[0] : null;

    // Obtener el calendario real desde workout_schedule
    console.log(`[calendar-schedule] Buscando sesiones en workout_schedule para plan ${planId}, user ${userId}`);
    let scheduleQuery = await pool.query(
      `SELECT
        day_id,
        week_number,
        day_abbrev as dia,
        scheduled_date,
        session_title as titulo,
        exercises as ejercicios,
        status
       FROM app.workout_schedule
       WHERE methodology_plan_id = $1 AND user_id = $2
       ORDER BY week_number, session_order`,
      [planId, userId]
    );

    console.log(`[calendar-schedule] Encontradas ${scheduleQuery.rows.length} sesiones en workout_schedule`);
    if (scheduleQuery.rows.length === 0) {
      // Re-generar programación on-demand si está vacía para evitar calendarios en blanco
      console.log(`[calendar-schedule] Sin programación; intentando regenerar con ensureWorkoutScheduleV3...`);
      const client = await pool.connect();
      try {
        await ensureWorkoutScheduleV3(client, userId, planId, plan.plan_data, startDateFromPlan, startConfig);
      } catch (regenError) {
        console.warn('[calendar-schedule] No se pudo regenerar programación:', regenError?.message || regenError);
      } finally {
        client.release();
      }

      // Reintentar consulta después de regenerar
      scheduleQuery = await pool.query(
        `SELECT
          day_id,
          week_number,
          day_abbrev as dia,
          scheduled_date,
          session_title as titulo,
          exercises as ejercicios,
          status
         FROM app.workout_schedule
         WHERE methodology_plan_id = $1 AND user_id = $2
         ORDER BY week_number, session_order`,
        [planId, userId]
      );
      console.log(`[calendar-schedule] Reintento: ${scheduleQuery.rows.length} sesiones tras regenerar`);
    }

    if (scheduleQuery.rows.length === 0) {
      console.log(`[calendar-schedule] Verificando si existe tabla workout_schedule...`);
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'app' AND table_name = 'workout_schedule'
        )
      `);
      console.log(`[calendar-schedule] Tabla workout_schedule existe: ${tableCheck.rows[0].exists}`);

      // Verificar si hay datos en workout_schedule para cualquier plan
      const anyDataCheck = await pool.query(`SELECT COUNT(*) as total FROM app.workout_schedule`);
      console.log(`[calendar-schedule] Total registros en workout_schedule: ${anyDataCheck.rows[0].total}`);
    }

    const formatLocalDate = (value) => {
      if (!value) return null;
      const date = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Reorganizar por semanas
    const semanasMap = new Map();

    for (const row of scheduleQuery.rows) {
      const weekNum = row.week_number;

      if (!semanasMap.has(weekNum)) {
        // Obtener la semana original del plan para mantener metadata
        const originalWeek = planData.semanas?.[weekNum - 1] || {};
        semanasMap.set(weekNum, {
          semana: weekNum,
          nombre: originalWeek.nombre || `Semana ${weekNum}`,
          sesiones: []
        });
      }

      // Agregar sesión con el día real asignado
      semanasMap.get(weekNum).sesiones.push({
        day_id: row.day_id,
        dia: row.dia,
        fecha: formatLocalDate(row.scheduled_date),
        titulo: row.titulo || `Sesión del ${row.dia}`,
        ejercicios: row.ejercicios || []
      });
    }

    // Convertir a array y mantener estructura del plan original
    const updatedPlan = {
      ...planData,
      semanas: Array.from(semanasMap.values())
    };

    console.log('[calendar-schedule] Plan actualizado con días redistribuidos:', {
      planId,
      totalWeeks: updatedPlan.semanas.length,
      firstWeek: updatedPlan.semanas[0]?.sesiones?.map(s => s.dia)
    });

    res.json({
      success: true,
      plan: updatedPlan,
      planStartDate: plan.plan_start_date || startDateFromPlan
    });

  } catch (error) {
    console.error('Error obteniendo calendario:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});


// 🆕 POST /api/routines/generate-schedule
// Genera la programación de entrenamientos para un plan específico
router.post('/generate-schedule', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { methodology_plan_id, start_date } = req.body;

    console.log(`📅 [/generate-schedule] Generando programación para plan ${methodology_plan_id}, usuario ${userId}`);

    if (!methodology_plan_id) {
      return res.status(400).json({ error: 'methodology_plan_id es requerido' });
    }

    // Obtener datos del plan
    const planResult = await pool.query(
      `SELECT plan_data FROM app.methodology_plans
       WHERE id = $1 AND user_id = $2`,
      [methodology_plan_id, userId]
    );

    if (planResult.rowCount === 0) {
      return res.status(404).json({ error: 'Plan no encontrado' });
    }

    const planData = planResult.rows[0].plan_data;

    // Limpiar programación existente
    await pool.query(
      `DELETE FROM app.workout_schedule WHERE methodology_plan_id = $1`,
      [methodology_plan_id]
    );

    // Generar nueva programación
    let currentDate = new Date(start_date || new Date());
    let sessionOrder = 1;
    const insertedSessions = [];

    // Procesar cada semana
    for (let weekIndex = 0; weekIndex < planData.semanas.length; weekIndex++) {
      const semana = planData.semanas[weekIndex];
      let weekSessionOrder = 1;

      // Procesar cada sesión de la semana
      for (let sessionIndex = 0; sessionIndex < semana.sesiones.length; sessionIndex++) {
        const sesion = semana.sesiones[sessionIndex];

        // Generar título de sesión
        let sessionTitle;
        switch (sessionOrder) {
          case 1: sessionTitle = 'Primera sesión'; break;
          case 2: sessionTitle = 'Segunda sesión'; break;
          case 3: sessionTitle = 'Tercera sesión'; break;
          case 4: sessionTitle = 'Cuarta sesión'; break;
          case 5: sessionTitle = 'Quinta sesión'; break;
          default: sessionTitle = `Sesión ${sessionOrder}`; break;
        }

        // Obtener nombre del día desde el helper compartido.
        const dayOfWeek = currentDate.getDay();
        const dayName = getDayNameByIndex(dayOfWeek);
        const dayAbbrev = getDayAbbrevByIndex(dayOfWeek);

        // Insertar en la base de datos
        const insertResult = await pool.query(`
          INSERT INTO app.workout_schedule (
            methodology_plan_id,
            user_id,
            week_number,
            session_order,
            week_session_order,
            scheduled_date,
            day_name,
            day_abbrev,
            session_title,
            exercises,
            status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id, scheduled_date, day_name, session_title
        `, [
          methodology_plan_id,
          userId,
          weekIndex + 1,
          sessionOrder,
          weekSessionOrder,
          currentDate.toISOString().split('T')[0],
          dayName,
          dayAbbrev,
          sessionTitle,
          JSON.stringify(sesion.ejercicios || []),
          'scheduled'
        ]);

        insertedSessions.push(insertResult.rows[0]);

        // Avanzar contadores
        sessionOrder++;
        weekSessionOrder++;

        // Avanzar al siguiente día (saltar fines de semana)
        do {
          currentDate.setDate(currentDate.getDate() + 1);
        } while (currentDate.getDay() === 0 || currentDate.getDay() === 6);
      }
    }

    console.log(`✅ [/generate-schedule] Programación generada: ${insertedSessions.length} sesiones`);

    res.json({
      success: true,
      message: 'Programación generada correctamente',
      sessions_count: insertedSessions.length,
      sessions: insertedSessions
    });

  } catch (error) {
    console.error('❌ [/generate-schedule] Error:', error);
    res.status(500).json({ error: error.message });
  }
});


// 🆕 GET /api/routines/schedule/:methodology_plan_id
// Obtiene la programación completa de un plan
router.get('/schedule/:methodology_plan_id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { methodology_plan_id } = req.params;

    const schedule = await pool.query(`
      SELECT
        id,
        week_number,
        session_order,
        week_session_order,
        scheduled_date,
        day_name,
        day_abbrev,
        session_title,
        exercises,
        status,
        completed_at
      FROM app.workout_schedule
      WHERE methodology_plan_id = $1 AND user_id = $2
      ORDER BY session_order
    `, [methodology_plan_id, userId]);

    res.json({
      success: true,
      schedule: schedule.rows
    });

  } catch (error) {
    console.error('❌ [/schedule] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
