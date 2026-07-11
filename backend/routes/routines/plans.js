/**
 * Rutas de rutinas - dominio: plan (extraidas de routes/routines.js).
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
  activateMethodologyPlan
} from '../../services/methodologyPlansService.js';
import {
  ensureMethodologySessions,
  extractExercisesFromPlanData
} from './_helpers.js';

const router = express.Router();


// GET /api/routines/plan?id=...&type=routine|methodology
router.get('/plan', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.userId || req.user?.id;
    const { id, type } = req.query;
    if (!id || !type) {
      return res.status(400).json({ success: false, error: 'Parámetros requeridos: id y type (routine|methodology)' });
    }

    if (type === 'routine') {
      const r = await client.query(
        'SELECT id, methodology_type, plan_data, generation_mode, frequency_per_week, total_weeks, status FROM app.methodology_plans WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
      if (r.rowCount === 0) return res.status(404).json({ success: false, error: 'Plan no encontrado' });
      return res.json({ success: true, plan: r.rows[0] });
    }

    if (type === 'methodology') {
      const r = await client.query(
        'SELECT id, methodology_type, plan_data, generation_mode FROM app.methodology_plans WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
      if (r.rowCount === 0) return res.status(404).json({ success: false, error: 'Plan no encontrado' });
      return res.json({ success: true, plan: r.rows[0] });
    }

    return res.status(400).json({ success: false, error: 'type inválido' });
  } catch (e) {
    console.error('Error fetching routine plan:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  } finally {
    client.release();
  }
});


// POST /api/routines/bootstrap-plan
// Si solo se tiene routine_plan_id, crea un registro en methodology_plans y devuelve methodology_plan_id
router.post('/bootstrap-plan', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = req.user?.userId || req.user?.id;
    const { routine_plan_id } = req.body;
    if (!routine_plan_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'routine_plan_id requerido' });
    }

    const r = await client.query(
      'SELECT id, methodology_type, plan_data, generation_mode FROM app.methodology_plans WHERE id = $1 AND user_id = $2',
      [routine_plan_id, userId]
    );
    if (r.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Routine plan no encontrado' });
    }

    const { methodology_type, plan_data, generation_mode } = r.rows[0];

    // Crear methodology_plans
    const ins = await client.query(
      `INSERT INTO app.methodology_plans (user_id, methodology_type, plan_data, generation_mode, status, created_at)
       VALUES ($1, $2, $3, $4, 'draft', NOW()) RETURNING id`,
      [userId, methodology_type, plan_data, generation_mode || 'automatic']
    );

    const methodologyPlanId = ins.rows[0].id;

    // Crear sesiones derivadas del plan JSON
    await ensureMethodologySessions(client, userId, methodologyPlanId, plan_data);

    await client.query('COMMIT');
    res.json({ success: true, methodology_plan_id: methodologyPlanId });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error bootstrap plan:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  } finally {
    client.release();
  }
});


// POST /api/routines/confirm-plan
// Confirma una rutina cambiando su estado de 'draft' a 'active'
router.post('/confirm-plan', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    // Nota: Operamos en auto-commit para evitar estados abortados por funciones legacy.
    // Si la función legacy falla, haremos fallback con UPDATE sin necesidad de transacciones explícitas.

    const userId = req.user?.userId || req.user?.id;
    const { methodology_plan_id } = req.body;
    const incomingStartConfig = req.body?.startConfig || req.body?.start_config || null;

    if (!methodology_plan_id) {
      client.release();
      return res.status(400).json({
        success: false,
        error: 'methodology_plan_id es requerido'
      });
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

    const getNextMonday = (baseDate) => {
      const today = baseDate instanceof Date ? baseDate : new Date();
      const dayOfWeek = today.getDay();
      const daysUntilMonday = (8 - dayOfWeek) % 7;
      const offsetDays = daysUntilMonday === 0 ? 7 : daysUntilMonday;
      const nextMonday = new Date(today);
      nextMonday.setDate(today.getDate() + offsetDays);
      nextMonday.setHours(0, 0, 0, 0);
      return nextMonday;
    };

    const resolveStartDate = (config) => {
      if (!config) return null;

      const localRaw = config.startDateLocal || config.start_date_local;
      if (localRaw) {
        const parsed = new Date(`${localRaw}T00:00:00`);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed;
        }
      }

      const isoRaw = config.startDateISO || config.start_date_iso;
      if (isoRaw) {
        const parsed = new Date(isoRaw);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed;
        }
      }

      const rawStart = String(config.startDate || config.start_date || '').toLowerCase();
      if (rawStart === 'today' || rawStart === 'home_training_today') {
        return new Date();
      }
      if (rawStart === 'next_monday') {
        return getNextMonday(new Date());
      }

      if (config.startDate || config.start_date) {
        const parsed = new Date(config.startDate || config.start_date);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed;
        }
      }

      return null;
    };

    const toIntOrNull = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };

    const toBoolOrNull = (value) => {
      if (value === true || value === 'true') return true;
      if (value === false || value === 'false') return false;
      return null;
    };

    const resolvedStartDate = resolveStartDate(incomingStartConfig);
    const startConfigOverride = incomingStartConfig ? {
      sessions_first_week: toIntOrNull(
        incomingStartConfig.sessionsFirstWeek ?? incomingStartConfig.sessions_first_week
      ),
      distribution_option: incomingStartConfig.distributionOption ?? incomingStartConfig.distribution_option ?? null,
      include_saturdays: toBoolOrNull(incomingStartConfig.includeSaturdays ?? incomingStartConfig.include_saturdays),
      start_day_of_week: toIntOrNull(
        incomingStartConfig.startDayOfWeek ?? incomingStartConfig.start_day_of_week
      ),
      start_date: resolvedStartDate ? formatLocalDate(resolvedStartDate) : null
    } : null;

    // Verificar que el plan pertenece al usuario y está en estado draft
    const planCheck = await client.query(
      `SELECT id, status, methodology_type, plan_data
       FROM app.methodology_plans
       WHERE id = $1 AND user_id = $2`,
      [methodology_plan_id, userId]
    );

    if (planCheck.rowCount === 0) {
      client.release();
      return res.status(404).json({
        success: false,
        error: 'Plan no encontrado'
      });
    }

    const plan = planCheck.rows[0];
    console.log("🔍 [confirm-plan] Plan encontrado:", { id: plan.id, status: plan.status, methodology_type: plan.methodology_type, userId });

    // Si ya está activo, considerar la operación idempotente
    if (String(plan.status).toLowerCase() === 'active') {
      await activateMethodologyPlan(userId, methodology_plan_id, client);
      client.release();
      return res.json({ success: true, status: 'active', message: 'Plan ya confirmado (idempotente)' });
    }

    // Confirmación del plan con fallback seguro si no existe la función/tabla legacy
    let confirmed = false;
    let activated = false;
    try {
      const confirmResult = await client.query(
        'SELECT app.confirm_routine_plan($1, $2, $3) as confirmed',
        [userId, methodology_plan_id, null]
      );
      confirmed = Boolean(confirmResult.rows?.[0]?.confirmed);
    } catch (e) {
      // Si la función/tables legacy no existen (42P01: relation does not exist), usar activateMethodologyPlan
      if (e?.code === '42P01' || String(e?.message || '').includes('routine_plans')) {
        // Revertir solo la parte fallida y continuar dentro de la transaccin
        console.warn('⚠️ confirm_routine_plan no disponible. Usando activateMethodologyPlan()');
        await activateMethodologyPlan(userId, methodology_plan_id, client);
        confirmed = true;
        activated = true;
      } else {
        throw e;
      }
    }

    if (!confirmed) {
      client.release();
      return res.status(400).json({
        success: false,
        error: 'No se pudo confirmar el plan. Puede que ya esté confirmado o no esté en estado draft.'
      });
    }

    if (!activated) {
      await activateMethodologyPlan(userId, methodology_plan_id, client);
    }

    // 🎯 FIX: Persistir SIEMPRE plan_start_date. Si no llega startConfig con fecha,
    // usar hoy como inicio. Sin esto quedaba NULL y el frontend ("Hoy") caía a
    // new Date() como inicio en cada carga → dayId=1 permanente → la semana del
    // plan nunca avanzaba y divergía del calendario (que usa confirmed_at).
    // 🗓️ Sin startConfig y en fin de semana, el inicio por defecto es el próximo
    // lunes: anclar el plan al sábado/domingo dejaba la semana 1 sin sesiones
    // (p.ej. 21/24 programadas en un plan de 8 semanas).
    let persistedStartDate = resolvedStartDate;
    if (!persistedStartDate) {
      const now = new Date();
      const dow = now.getDay(); // 0=Dom, 6=Sáb
      persistedStartDate = (dow === 0 || dow === 6) ? getNextMonday(now) : now;
    }
    const startDateLocal = formatLocalDate(persistedStartDate);
    await client.query(
      `UPDATE app.methodology_plans
       SET plan_start_date = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3`,
      [startDateLocal, methodology_plan_id, userId]
    );

    // 🎯 FASE 2: STORED PROCEDURE DESHABILITADO
    // El stored procedure create_methodology_exercise_sessions tiene varios problemas:
    // 1. Espera un formato de JSON diferente al que genera la IA
    // 2. Crea sesiones duplicadas (ya las crea ensureWorkoutSchedule)
    // 3. Usa nombres de día completos (Lunes) en vez de abreviaturas (Lun)
    // 4. Calcula fechas incorrectamente (usa CURRENT_DATE en vez de plan_start_date)
    //
    // SOLUCIÓN: ensureWorkoutSchedule() hace todo lo que necesitamos:
    // - Crea methodology_plan_days (con day_id correcto)
    // - Crea workout_schedule (con sesiones programadas)
    // - Usa el formato correcto de días (Lun, Mar, Mié)
    // - Calcula fechas correctamente desde plan_start_date
    //
    // Las sesiones en methodology_exercise_sessions se crean bajo demanda
    // cuando el usuario inicia un entrenamiento (endpoint /sessions/start)
    console.log(`📋 [confirm-plan] Stored procedure omitido (FASE 2) - sesiones se crean bajo demanda`);

    // 🎯 FASE 1 & 2: Generar programación completa (methodology_plan_days + workout_schedule)
    console.log(`📅 [confirm-plan] Generando programación completa (methodology_plan_days + workout_schedule)...`);
    try {
      // 🆕 Leer configuración de inicio si existe (o usar la enviada por el frontend)
      let startConfig = null;
      if (startConfigOverride) {
        startConfig = startConfigOverride;
      } else {
        const startConfigQuery = await client.query(
          `SELECT * FROM app.plan_start_config WHERE methodology_plan_id = $1`,
          [methodology_plan_id]
        );
        startConfig = startConfigQuery.rowCount > 0 ? startConfigQuery.rows[0] : null;
      }

      if (startConfig) {
        console.log('🗓️ [confirm-plan] Configuración de inicio encontrada:', {
          startDate: startConfig.start_date,
          sessionsFirstWeek: startConfig.sessions_first_week,
          distributionOption: startConfig.distribution_option,
          includeSaturdays: startConfig.include_saturdays
        });
      }

      // Obtener la fecha de inicio del plan (usar startConfig si existe, sino NOW)
      const startDateQuery = await client.query(
        `SELECT COALESCE(plan_start_date, confirmed_at, NOW()) as start_date
         FROM app.methodology_plans
         WHERE id = $1`,
        [methodology_plan_id]
      );
      const startDate = resolvedStartDate || startConfig?.start_date || startDateQuery.rows[0]?.start_date || new Date();

      console.log(`📅 [confirm-plan] Fecha de inicio del plan: ${startDate}`);

      // Llamar a ensureWorkoutSchedule para generar la programación completa
      // 🆕 Pasar startConfig como parámetro
      await ensureWorkoutScheduleV3(client, userId, methodology_plan_id, plan.plan_data, startDate, startConfig);

      console.log('✅ Programación completa generada (methodology_plan_days + workout_schedule)');

      // 🎯 NUEVO: Pre-crear sesiones de la primera semana si hay redistribución
      try {
        // Verificar si existe configuración de redistribución
        const configCheck = await client.query(
          `SELECT * FROM app.plan_start_config WHERE methodology_plan_id = $1`,
          [methodology_plan_id]
        );

        if (configCheck.rowCount > 0) {
          const config = configCheck.rows[0];
          console.log('🔄 [confirm-plan] Detectada configuración de redistribución:', {
            firstWeekPattern: config.first_week_pattern,
            isConsecutive: config.is_consecutive_days,
            startDayOfWeek: config.start_day_of_week
          });

          // Pre-crear sesiones de la primera semana
          const firstWeekSchedule = await client.query(
            `SELECT * FROM app.workout_schedule
             WHERE methodology_plan_id = $1 AND user_id = $2 AND week_number = 1
             ORDER BY session_order`,
            [methodology_plan_id, userId]
          );

          console.log(`📋 Pre-creando ${firstWeekSchedule.rowCount} sesiones de la primera semana...`);

          for (const scheduleRow of firstWeekSchedule.rows) {
            // Verificar si ya existe la sesión
            const existingSession = await client.query(
              `SELECT id FROM app.methodology_exercise_sessions
               WHERE user_id = $1 AND methodology_plan_id = $2
               AND week_number = $3 AND day_name = $4`,
              [userId, methodology_plan_id, scheduleRow.week_number, scheduleRow.day_abbrev]
            );

            if (existingSession.rowCount === 0) {
              // Crear la sesión
              const sessionResult = await client.query(
                `INSERT INTO app.methodology_exercise_sessions (
                  user_id,
                  methodology_plan_id,
                  session_date,
                  week_number,
                  day_name,
                  session_status,
                  created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
                RETURNING id`,
                [
                  userId,
                  methodology_plan_id,
                  scheduleRow.scheduled_date,
                  scheduleRow.week_number,
                  scheduleRow.day_abbrev,
                  'not_started'
                ]
              );

              const sessionId = sessionResult.rows[0].id;
              console.log(`✅ Sesión pre-creada: ID ${sessionId} para ${scheduleRow.day_abbrev}`);

              // Pre-crear ejercicios con progreso inicial
              const exercises = typeof scheduleRow.exercises === 'string'
                ? JSON.parse(scheduleRow.exercises)
                : scheduleRow.exercises || [];

              for (let i = 0; i < exercises.length; i++) {
                const exercise = exercises[i];

                // 🎯 Guardar también el exercise_id para tracking RIR
                const exerciseId = exercise.exercise_id || exercise.id || null;

                await client.query(
                  `INSERT INTO app.methodology_exercise_progress (
                    methodology_session_id,
                    exercise_order,
                    exercise_id,
                    exercise_name,
                    series_total,
                    series_completed,
                    repeticiones,
                    descanso_seg,
                    status,
                    notas
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                  ON CONFLICT (methodology_session_id, exercise_order) DO NOTHING`,
                  [
                    sessionId,
                    i,
                    exerciseId,
                    exercise.nombre || exercise.name || `Ejercicio ${i + 1}`,
                    parseInt(exercise.series || exercise.sets || 3),
                    0,
                    exercise.repeticiones || exercise.reps || '8-12',
                    parseInt(exercise.descanso || exercise.descanso_seg || exercise.rest || 60),
                    'pending',
                    exercise.notas || exercise.notes || exercise.adjustment_note || null
                  ]
                );
              }

              console.log(`✅ ${exercises.length} ejercicios pre-creados para sesión ${sessionId}`);
            }
          }

          console.log('✅ Todas las sesiones de la primera semana han sido pre-creadas');
        }
      } catch (preCreateError) {
        console.warn('⚠️ No se pudieron pre-crear sesiones:', preCreateError.message);
        // No fallar, continuar sin pre-crear
      }
    } catch (scheduleError) {
      console.error('❌ Error generando programación completa:', scheduleError.message);
      console.error('Stack:', scheduleError.stack);
      // No fallar la confirmación por esto, pero es importante logearlo
    }

    // Auto-commit mode: no COMMIT necesario

    console.log(`✅ Rutina confirmada: methodology_plan(${methodology_plan_id})`);

    res.json({
      success: true,
      message: 'Rutina confirmada exitosamente',
      confirmed_at: new Date().toISOString(),
      methodology_plan_id: methodology_plan_id,
      status: 'active'
    });

  } catch (error) {
    console.error('❌ [confirm-plan] Error confirmando rutina:', error);
    console.error('Stack:', error.stack);

    // Intentar liberar el cliente de forma segura
    try {
      client.release();
    } catch (releaseError) {
      console.error('⚠️ Error liberando cliente:', releaseError.message);
    }

    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
});


// GET /api/routines/plan-status/:methodologyPlanId
// Verificar si un plan de metodología ya está confirmado (activo)
router.get('/plan-status/:methodologyPlanId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { methodologyPlanId } = req.params;

    // Verificar el estado del plan de metodología
    const planQuery = await pool.query(
      'SELECT status, confirmed_at FROM app.methodology_plans WHERE id = $1 AND user_id = $2',
      [methodologyPlanId, userId]
    );

    if (planQuery.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Plan no encontrado'
      });
    }

    const plan = planQuery.rows[0];
    const isConfirmed = plan.status === 'active';

    res.json({
      success: true,
      isConfirmed,
      status: plan.status,
      confirmedAt: plan.confirmed_at
    });

  } catch (error) {
    console.error('Error verificando estado del plan:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});


// GET /api/routines/plan-config/:planId
// Obtiene la configuración de redistribución del plan
router.get('/plan-config/:planId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { planId } = req.params;

    // Verificar que el plan pertenece al usuario
    const planCheck = await pool.query(
      `SELECT id FROM app.methodology_plans WHERE id = $1 AND user_id = $2`,
      [planId, userId]
    );

    if (planCheck.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Plan no encontrado'
      });
    }

    // Obtener configuración de redistribución
    const configQuery = await pool.query(
      `SELECT * FROM app.plan_start_config WHERE methodology_plan_id = $1`,
      [planId]
    );

    if (configQuery.rowCount === 0) {
      return res.json({
        success: true,
        config: null,
        message: 'No hay configuración de redistribución para este plan'
      });
    }

    const config = configQuery.rows[0];

    // Parsear JSONs
    if (config.warnings && typeof config.warnings === 'string') {
      try {
        config.warnings = JSON.parse(config.warnings);
      } catch (e) {
        config.warnings = [];
      }
    }

    if (config.day_mappings && typeof config.day_mappings === 'string') {
      try {
        config.day_mappings = JSON.parse(config.day_mappings);
      } catch (e) {
        config.day_mappings = {};
      }
    }

    res.json({
      success: true,
      config
    });

  } catch (error) {
    console.error('Error obteniendo configuración del plan:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});


router.get('/active-plan', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    console.log(`🔍 [/active-plan] Buscando plan activo para user ${userId}`);

    // 🆕 PRIMERO: Buscar si hay entrenamientos programados en la nueva estructura
    const todayWorkoutQuery = await pool.query(
      `SELECT
        ws.methodology_plan_id,
        ws.week_number,
        ws.session_order,
        ws.session_title,
        ws.day_name,
        ws.scheduled_date,
        ws.exercises,
        ws.status,
        mp.plan_data,
        mp.methodology_type,
        mp.confirmed_at,
        mp.created_at
       FROM app.workout_schedule ws
       JOIN app.methodology_plans mp ON ws.methodology_plan_id = mp.id
       WHERE ws.user_id = $1
         AND ws.scheduled_date = CURRENT_DATE
         AND ws.status = 'scheduled'
         AND mp.status IN ('active', 'confirmed')
         AND mp.cancelled_at IS NULL
       LIMIT 1`,
      [userId]
    );

    if (todayWorkoutQuery.rowCount > 0) {
      console.log(`✅ [/active-plan] Encontrado entrenamiento de hoy en nueva estructura`);
      const todayWorkout = todayWorkoutQuery.rows[0];

      return res.json({
        success: true,
        hasActivePlan: true,
        source: 'workout_schedule', // 🆕 Nuevo source
        methodology_plan_id: todayWorkout.methodology_plan_id,
        planId: todayWorkout.methodology_plan_id,
        routinePlan: todayWorkout.plan_data,
        planType: todayWorkout.methodology_type,
        methodology_type: todayWorkout.methodology_type,
        confirmedAt: todayWorkout.confirmed_at,
        createdAt: todayWorkout.created_at,
        todaySession: {
          week_number: todayWorkout.week_number,
          session_order: todayWorkout.session_order,
          session_title: todayWorkout.session_title,
          day_name: todayWorkout.day_name,
          scheduled_date: todayWorkout.scheduled_date,
          exercises: todayWorkout.exercises,
          status: todayWorkout.status
        }
      });
    }

    // Buscar plan de metodología activo (fallback al método anterior)
    const activeMethodologyQuery = await pool.query(
      `SELECT id as methodology_plan_id, methodology_type, plan_data,
              confirmed_at, created_at, plan_start_date, generation_mode,
              'methodology' as source, status
       FROM app.methodology_plans
       WHERE user_id = $1
         AND status = 'active'
         AND cancelled_at IS NULL
       ORDER BY confirmed_at DESC
       LIMIT 1`,
      [userId]
    );

    console.log(`📊 [/active-plan] Query result: ${activeMethodologyQuery.rowCount} plans found`);
    if (activeMethodologyQuery.rowCount > 0) {
      console.log(`📊 [/active-plan] Plan status: ${activeMethodologyQuery.rows[0].status}, ID: ${activeMethodologyQuery.rows[0].methodology_plan_id}`);
    }

    let activePlan = null;

    if (activeMethodologyQuery.rowCount > 0) {
      activePlan = activeMethodologyQuery.rows[0];
    }

    // 🆕 Fallback automático: si no hay sesión de hoy en workout_schedule pero sí hay plan activo,
    // generamos la programación y reintentamos para devolver todaySession inmediatamente.
    // ✅ Validación adicional: asegurar que el plan NO esté cancelado
    if (todayWorkoutQuery.rowCount === 0 && activePlan && ['active', 'confirmed'].includes(String(activePlan.status)) && !activePlan.cancelled_at) {
      try {
        // 🛡️ Solo generar si el plan NO tiene calendario. "Hoy sin sesión" es lo normal
        // en días de descanso; regenerar aquí borraba todo el calendario en cada visita
        // (perdiendo estados y re-anclando las semanas a la fecha del servidor).
        const scheduleCount = await pool.query(
          'SELECT count(*)::int AS n FROM app.workout_schedule WHERE methodology_plan_id = $1 AND user_id = $2',
          [activePlan.methodology_plan_id, userId]
        );
        if (scheduleCount.rows[0].n > 0) {
          console.log('🗓️ [/active-plan] Hoy es descanso (calendario ya existe); no se regenera');
        } else {
          console.log('🧩 [/active-plan] Plan sin calendario; generando programación on-demand...');
          const client = await pool.connect();
          try {
            // 📅 Usar plan_start_date o confirmed_at/created_at como fallback
            const startDate = activePlan.plan_start_date || activePlan.confirmed_at || activePlan.created_at || new Date();
            console.log(`📅 Fecha de inicio del plan: ${startDate}`);
            await ensureWorkoutScheduleV3(client, userId, activePlan.methodology_plan_id, activePlan.plan_data, startDate);
          } finally {
            client.release();
          }
        }

        // Reintentar la consulta de todaySession
        const retryToday = await pool.query(
          `SELECT
            ws.methodology_plan_id,
            ws.week_number,
            ws.session_order,
            ws.session_title,
            ws.day_name,
            ws.scheduled_date,
            ws.exercises,
            ws.status,
            mp.plan_data,
            mp.methodology_type,
            mp.confirmed_at,
            mp.created_at
           FROM app.workout_schedule ws
           JOIN app.methodology_plans mp ON ws.methodology_plan_id = mp.id
           WHERE ws.user_id = $1
             AND ws.scheduled_date = CURRENT_DATE
             AND ws.status = 'scheduled'
             AND mp.status IN ('active', 'confirmed')
             AND mp.cancelled_at IS NULL
           LIMIT 1`,
          [userId]
        );

        if (retryToday.rowCount > 0) {
          console.log('✅ [/active-plan] todaySession generada on-demand');
          const todayWorkout = retryToday.rows[0];
          return res.json({
            success: true,
            hasActivePlan: true,
            source: 'workout_schedule',
            methodology_plan_id: todayWorkout.methodology_plan_id,
            planId: todayWorkout.methodology_plan_id,
            routinePlan: todayWorkout.plan_data,
            planType: todayWorkout.methodology_type,
            methodology_type: todayWorkout.methodology_type,
            confirmedAt: todayWorkout.confirmed_at,
            createdAt: todayWorkout.created_at,
            todaySession: {
              week_number: todayWorkout.week_number,
              session_order: todayWorkout.session_order,
              session_title: todayWorkout.session_title,
              day_name: todayWorkout.day_name,
              scheduled_date: todayWorkout.scheduled_date,
              exercises: todayWorkout.exercises,
              status: todayWorkout.status
            }
          });
        }
      } catch (e) {
        console.log('⚠️ [/active-plan] Fallback de programación falló:', e.message);
      }
    }

    if (!activePlan) {
      console.log(`⚠️ [/active-plan] No active plan found for user ${userId}`);
      return res.json({
        success: true,
        hasActivePlan: false,
        message: 'No hay rutina activa'
      });
    }

    const planData = typeof activePlan.plan_data === 'string'
      ? JSON.parse(activePlan.plan_data)
      : activePlan.plan_data;

    // Usar el source que viene del query SQL (línea 1040)
    const planSource = activePlan.source || 'methodology';

    console.log(`✅ Recuperando plan activo desde ${planSource} para user ${userId}`);

    res.json({
      success: true,
      hasActivePlan: true,
      routinePlan: planData,
      // Etiqueta honesta según cómo se generó el plan (antes siempre decía 'IA')
      planSource: {
        label: activePlan.generation_mode === 'manual' ? 'Manual' : 'IA',
        type: activePlan.generation_mode || 'automatic'
      },
      generation_mode: activePlan.generation_mode || null,
      planId: activePlan.methodology_plan_id, // Solo tenemos methodology_plan_id
      methodology_plan_id: activePlan.methodology_plan_id,
      planType: activePlan.methodology_type,
      confirmedAt: activePlan.confirmed_at,
      createdAt: activePlan.created_at,
      recoverySource: planSource  // Para debugging
    });

  } catch (error) {
    console.error('Error obteniendo rutina activa:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});


// POST /api/routines/confirm-and-activate
// NUEVO ENDPOINT UNIFICADO: Confirma plan y lo deja listo para usar
router.post('/confirm-and-activate', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    console.log('🚀 FLUJO UNIFICADO: confirm-and-activate iniciado');
    await client.query('BEGIN');

    const userId = req.user?.userId || req.user?.id;
    const { methodology_plan_id, plan_data } = req.body;

    if (!methodology_plan_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'methodology_plan_id es requerido'
      });
    }

    console.log(`📋 Confirmando y activando plan ${methodology_plan_id} para user ${userId}`);

    // 1. VERIFICAR que el plan existe y pertenece al usuario
    const planCheck = await client.query(
      `SELECT id, status, methodology_type, plan_data
       FROM app.methodology_plans
       WHERE id = $1 AND user_id = $2`,
      [methodology_plan_id, userId]
    );

    if (planCheck.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Plan no encontrado'
      });
    }

    const plan = planCheck.rows[0];
    const finalPlanData = plan_data || plan.plan_data;

    // 2. USAR FUNCIÓN ATÓMICA para cancelar planes anteriores y activar el nuevo
    console.log('🧹 Activando plan de forma atómica...');
    const activationResult = await client.query(
      'SELECT app.activate_plan_atomic($1, $2, $3) as success',
      [userId, methodology_plan_id, null] // routine_plan_id se creará después
    );

    const activationSuccess = activationResult.rows[0]?.success;
    if (!activationSuccess) {
      throw new Error('No se pudo activar el plan de metodología');
    }

    console.log('✅ Plan confirmado y listo para uso');

    // 5. GENERAR sesiones de entrenamiento automáticamente
    console.log('🏋️ Generando sesiones de entrenamiento...');
    await ensureMethodologySessions(client, userId, methodology_plan_id, finalPlanData);

    await client.query('COMMIT');

    console.log('🎯 FLUJO UNIFICADO COMPLETADO exitosamente');

    // 6. RETORNAR todo listo para usar
    res.json({
      success: true,
      message: '¡Tu rutina está lista!',
      data: {
        methodology_plan_id: methodology_plan_id,
        methodology_type: plan.methodology_type,
        plan_data: finalPlanData,
        status: 'active',
        ready_for_training: true
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error en confirm-and-activate:', error.message);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  } finally {
    client.release();
  }
});


// POST /api/routines/cancel-routine
// Cancela una rutina activa cambiando su estado de 'active' a 'cancelled'
router.post('/cancel-routine', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = req.user?.userId || req.user?.id;
    const { methodology_plan_id } = req.body;

    if (!methodology_plan_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'methodology_plan_id es requerido'
      });
    }

    console.log('🚫 Cancelando rutina:', { methodology_plan_id, userId });

    // Verificar que el plan pertenece al usuario
    const planCheck = await client.query(
      `SELECT id, status, methodology_type
       FROM app.methodology_plans
       WHERE id = $1 AND user_id = $2`,
      [methodology_plan_id, userId]
    );

    if (planCheck.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Plan no encontrado'
      });
    }

    const currentStatus = planCheck.rows[0].status;

    // Verificar si el plan ya está cancelado
    if (currentStatus === 'cancelled') {
      await client.query('ROLLBACK');
      console.log(`⚠️ Plan ${methodology_plan_id} ya está cancelado`);
      return res.status(200).json({
        success: true,
        message: 'La rutina ya había sido cancelada anteriormente',
        already_cancelled: true
      });
    }

    // Verificar si el plan puede ser cancelado
    if (!['active', 'draft', 'confirmed'].includes(currentStatus)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: `No se puede cancelar un plan en estado: ${currentStatus}`
      });
    }

    // Actualizar estado del plan de metodología a 'cancelled'
    // ✅ CRÍTICO: Actualizar cancelled_at para que el filtro en /active-plan funcione
    await client.query(
      `UPDATE app.methodology_plans
       SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW(), is_current = FALSE
       WHERE id = $1 AND user_id = $2
       RETURNING methodology_type`,
      [methodology_plan_id, userId]
    );

    console.log(`✅ Plan de metodología ${methodology_plan_id} cancelado exitosamente`);

    // También cancelar las sesiones activas/pendientes
    // ✅ CRÍTICO: Actualizar cancelled_at y is_current_session para consistencia
    await client.query(
      `UPDATE app.methodology_exercise_sessions
       SET session_status = 'cancelled', cancelled_at = NOW(), is_current_session = false, updated_at = NOW()
       WHERE methodology_plan_id = $1 AND user_id = $2
         AND session_status IN ('active', 'pending', 'in_progress')`,
      [methodology_plan_id, userId]
    );

    await client.query('COMMIT');

    console.log('✅ Rutina cancelada exitosamente');
    res.json({
      success: true,
      message: 'Rutina cancelada correctamente'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error cancelando rutina:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  } finally {
    client.release();
  }
});


// GET /api/routines/plan-exercises
// Obtiene ejercicios únicos del plan para modales de cancelación
router.get('/plan-exercises', authenticateToken, async (req, res) => {
  try {
    const userIdRaw = req.user?.userId || req.user?.id;
    const userId = parseInt(userIdRaw, 10);
    const { methodology_plan_id: planIdParam } = req.query;

    // PASO 1: Validación exhaustiva de parámetros
    console.log('🔍 [STEP 1] Validando parámetros:', {
      userIdRaw,
      userId,
      planIdParam,
      userIdType: typeof userIdRaw,
      planIdType: typeof planIdParam
    });

    if (!planIdParam) {
      return res.status(400).json({
        success: false,
        error: 'Parámetro requerido: methodology_plan_id'
      });
    }

    // Validación extra de tipos
    const methodology_plan_id = parseInt(planIdParam, 10);
    if (isNaN(methodology_plan_id) || isNaN(userId)) {
      console.error('❌ [STEP 1] Error de tipos:', {
        methodology_plan_id,
        userId,
        planIdIsNaN: isNaN(methodology_plan_id),
        userIdIsNaN: isNaN(userId)
      });
      return res.status(400).json({
        success: false,
        error: 'Los IDs deben ser números válidos'
      });
    }

    console.log('✅ [STEP 1] Parámetros validados:', { methodology_plan_id, userId });

    // PASO 2: Consulta simple para verificar existencia del plan y su estado
    console.log('🔍 [STEP 2] Verificando existencia del plan...');
    const planQuery = await pool.query(
      'SELECT plan_data, status FROM app.methodology_plans WHERE id = $1 AND user_id = $2',
      [methodology_plan_id, userId]
    );

    if (planQuery.rowCount === 0) {
      console.log('❌ [STEP 2] Plan no encontrado');
      return res.status(404).json({
        success: false,
        error: 'Plan no encontrado'
      });
    }

    // Verificar que el plan esté activo
    const planStatus = planQuery.rows[0].status;
    if (planStatus !== 'active' && planStatus !== 'confirmed') {
      console.log(`❌ [STEP 2] Plan no activo - Estado: ${planStatus}`);
      return res.status(400).json({
        success: false,
        error: `Plan no disponible - Estado: ${planStatus}`
      });
    }
    console.log('✅ [STEP 2] Plan encontrado y activo');

    // PASO 3: Consulta simplificada SIN conversiones complejas
    console.log('🔍 [STEP 3] Ejecutando consulta simplificada...');
    let exercisesQuery;

    try {
      // PRIMERA CONSULTA: Solo campos básicos sin conversiones
      exercisesQuery = await pool.query(
        `SELECT DISTINCT
           exercise_name,
           series_total,
           repeticiones
         FROM app.methodology_exercise_progress mep
         JOIN app.methodology_exercise_sessions mes ON mep.methodology_session_id = mes.id
         WHERE mes.methodology_plan_id = $1::integer AND mes.user_id = $2::integer
           AND exercise_name IS NOT NULL AND TRIM(exercise_name) != ''
         ORDER BY exercise_name ASC`,
        [methodology_plan_id, userId]
      );
      console.log('✅ [STEP 3] Consulta básica exitosa, filas encontradas:', exercisesQuery.rows.length);

      if (exercisesQuery.rows.length > 0) {
        console.log('📊 [STEP 3] Muestra de datos:', exercisesQuery.rows[0]);
      }

    } catch (queryError) {
      console.error('❌ [STEP 3] Error en consulta básica:', {
        message: queryError.message,
        code: queryError.code,
        detail: queryError.detail,
        hint: queryError.hint,
        where: queryError.where,
        file: queryError.file,
        line: queryError.line,
        routine: queryError.routine
      });

      // FALLBACK INMEDIATO al plan JSON si falla la consulta
      console.log('🔄 [STEP 3] Usando fallback al plan JSON debido a error en BD');
      const planData = planQuery.rows[0]?.plan_data;
      const exercises = extractExercisesFromPlanData(planData);

      return res.json({
        success: true,
        exercises,
        source: 'fallback_due_to_db_error',
        error_details: queryError.message
      });
    }

    // PASO 4: Procesar resultados básicos
    console.log('🔍 [STEP 4] Procesando resultados...');
    let exercises = exercisesQuery.rows.map(row => ({
      nombre: row.exercise_name || '',
      series: parseInt(row.series_total) || 3,
      repeticiones: row.repeticiones || null,
      duracion_seg: null // Eliminamos cálculos complejos por ahora
    }));

    // PASO 5: Fallback al plan JSON si no hay datos en BD
    if (exercises.length === 0) {
      console.log('🔄 [STEP 5] No hay ejercicios en BD, usando plan JSON...');
      const planData = planQuery.rows[0]?.plan_data;
      exercises = extractExercisesFromPlanData(planData);
      console.log(`✅ [STEP 5] Ejercicios desde plan JSON: ${exercises.length}`);
    }

    console.log(`✅ [FINAL] Ejercicios obtenidos: ${exercises.length} ejercicios`);

    res.json({
      success: true,
      exercises,
      source: exercises.length > 0 ? 'database' : 'plan_json'
    });

  } catch (error) {
    console.error('❌ [ERROR GENERAL] Error obteniendo ejercicios del plan:', {
      message: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
});

export default router;
