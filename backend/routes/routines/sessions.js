/**
 * Rutas de rutinas - dominio: session (extraidas de routes/routines.js).
 */

import express from 'express';
import process from 'node:process';
import authenticateToken from '../../middleware/auth.js';
import {
  pool
} from '../../db.js';
import {
  preSessionCleanup
} from '../../utils/sessionCleanup.js';
import {
  normalizeDayAbbrev,
  normalizeDayFullName
} from '../../utils/shared/dayNormalizer.js';
import {
  getRandomByLevel
} from '../../services/exerciseRepository.js';
import {
  findWeekInPlan,
  deriveLevelFromPlan
} from '../../utils/shared/planHelpers.js';
import {
  ensureMethodologySessions,
  createMissingDaySession
} from './_helpers.js';

const router = express.Router();


// POST /api/routines/sessions/start
// Body: { methodology_plan_id, week_number, day_name } OR { methodology_plan_id, day_id }
router.post('/sessions/start', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = req.user?.userId || req.user?.id;
    const { methodology_plan_id } = req.body;
    let { week_number, day_name } = req.body;
    const day_id = req.body?.day_id ? parseInt(req.body.day_id, 10) : null;

    if (!methodology_plan_id || (!day_id && (!week_number || !day_name))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Faltan parámetros: methodology_plan_id y (day_id) o (week_number, day_name)' });
    }

    // 🧹 NUEVA VALIDACIÓN: Limpieza pre-sesión
    console.log(`🧹 Ejecutando limpieza pre-sesión para usuario ${userId}, plan ${methodology_plan_id}`);
    const cleanup = await preSessionCleanup(userId, methodology_plan_id);

    if (!cleanup.success) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: cleanup.error || 'Error en validación del plan'
      });
    }

    if (cleanup.cleanedSessions > 0 || cleanup.fixedStates > 0) {
      console.log(`✅ Limpieza completada: ${cleanup.cleanedSessions} sesiones limpiadas, ${cleanup.fixedStates} estados corregidos`);
    }

    // 🎯 PRIORIDAD POR FECHA: si el frontend envía session_date (hoy), resolver
    // week_number/day_name desde el calendario del plan por FECHA. Es autoritativo
    // y evita el desfase entre el day_id del frontend (computeDayId numera desde
    // plan_start_date) y methodology_plan_days (numera desde el lunes de la semana
    // de inicio). Sin esto, en arranques a media semana se abría un día distinto al
    // del preview (p.ej. HipertrofiaV2: la calibración se convertía en otra sesión).
    const bodySessionDate = req.body?.session_date || null;
    if (bodySessionDate && (!week_number || !day_name)) {
      const byDate = await client.query(
        `SELECT week_number, day_name FROM app.methodology_plan_days
         WHERE plan_id = $1 AND date_local = $2::date AND is_rest = false
         LIMIT 1`,
        [methodology_plan_id, bodySessionDate]
      );
      if (byDate.rowCount > 0) {
        week_number = byDate.rows[0].week_number;
        day_name = byDate.rows[0].day_name;
        console.log('🗓️ start: sesión resuelta por FECHA (methodology_plan_days)', { session_date: bodySessionDate, week_number, day_name });
      } else {
        // Fallback: workout_schedule por fecha programada.
        const bySched = await client.query(
          `SELECT week_number, day_name, day_abbrev FROM app.workout_schedule
           WHERE methodology_plan_id = $1 AND user_id = $2 AND scheduled_date::date = $3::date
           LIMIT 1`,
          [methodology_plan_id, userId, bodySessionDate]
        );
        if (bySched.rowCount > 0) {
          week_number = bySched.rows[0].week_number;
          day_name = bySched.rows[0].day_abbrev || bySched.rows[0].day_name;
          console.log('🗓️ start: sesión resuelta por FECHA (workout_schedule)', { session_date: bodySessionDate, week_number, day_name });
        }
      }
    }

    // Si viene day_id, resolver week_number y day_name desde calendario del plan
    if (!bodySessionDate && !req.query.session_date && day_id && (!week_number || !day_name)) {
      const dayInfoQ = await client.query(
        `SELECT week_number, day_name FROM app.methodology_plan_days WHERE plan_id = $1 AND day_id = $2`,
        [methodology_plan_id, day_id]
      );
      if (dayInfoQ.rowCount > 0) {
        week_number = dayInfoQ.rows[0].week_number;
        day_name = dayInfoQ.rows[0].day_name;
      } else {
        // Fallback simple si no existe fila (debería existir por migración):
        week_number = Math.ceil(Number(day_id) / 7);
        // Derivar nombre del día por seguridad (Lunes..Domingo)
        // Usar plan_start_datetime para calcularlo sería ideal; en ausencia, asumimos lunes si no podemos derivar
        day_name = day_name || 'lunes';
      }
    }

    // Verificar si ya existe una sesión activa para este día
    const existingActiveSession = await client.query(
      `SELECT id, session_status FROM app.methodology_exercise_sessions
       WHERE user_id = $1 AND methodology_plan_id = $2
       AND week_number = $3 AND day_name = $4
       AND session_status = 'in_progress'
       LIMIT 1`,
      [userId, methodology_plan_id, week_number || 1, normalizeDayAbbrev(day_name || 'lunes')]
    );

    if (existingActiveSession.rowCount > 0) {
      console.log(`⚠️ Sesión ya activa para el usuario ${userId}, plan ${methodology_plan_id}, semana ${week_number}, día ${day_name}`);
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'Ya existe una sesión activa para este día',
        session_id: existingActiveSession.rows[0].id
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
      // Crear de nuevo las sesiones por si acaso y reintentar
      await ensureMethodologySessions(client, userId, methodology_plan_id, planData);
      ses = await client.query(
        `SELECT * FROM app.methodology_exercise_sessions
           WHERE user_id = $1 AND methodology_plan_id = $2 AND week_number = $3 AND day_name = $4
           LIMIT 1`,
        [userId, methodology_plan_id, week_number, normalizedDay]
      );
    }

    if (ses.rowCount === 0) {
      // Si no existe la sesión, crearla usando la función de día faltante
      console.log(`⚠️ Sesión no encontrada para ${normalizedDay}, creando sesión adaptada...`);
      try {
        const sessionId = await createMissingDaySession(client, userId, methodology_plan_id, planData, day_name, week_number);
        // Obtener la sesión recién creada
        ses = await client.query(
          `SELECT * FROM app.methodology_exercise_sessions WHERE id = $1`,
          [sessionId]
        );
      } catch (createError) {
        console.error('Error creando sesión para día faltante:', createError);
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Sesión no encontrada para esa semana/día y no se pudo crear una adaptada' });
      }
    }

    const session = ses.rows[0];

    // Precrear progreso por ejercicio (si no existe)
    // 1) Preferir ejercicios de la programación (workout_schedule) para este día
    let scheduleExercises = [];
    try {
      const schedQ = await client.query(
        `SELECT exercises FROM app.workout_schedule
         WHERE methodology_plan_id = $1 AND user_id = $2 AND week_number = $3
           AND (LOWER(day_abbrev) = $4 OR LOWER(day_name) = $5)
         ORDER BY session_order
         LIMIT 1`,
        [methodology_plan_id, userId, week_number, normalizedDay.toLowerCase(), normalizedDay.toLowerCase()]
      );
      if (schedQ.rowCount > 0) {
        const ex = schedQ.rows[0].exercises;
        scheduleExercises = Array.isArray(ex) ? ex : [];
        if (scheduleExercises.length > 0) {
          console.log('🗓️ start: usando ejercicios de workout_schedule');
        }
      }
    } catch (e) {
      console.warn('No se pudo leer workout_schedule, se usará plan JSON', e?.message);
    }

    // 2) Si no hay programación, usar definición de ejercicios del plan JSON
    const semana = findWeekInPlan(planData.semanas || [], week_number);
    let sesionDef = semana ? (semana.sesiones || []).find(s => normalizeDayAbbrev(s.dia) === normalizedDay) : null;

    // 2b) Solo si no existe sesión para este día en el plan, usar la primera sesión disponible como template
    if (!sesionDef && scheduleExercises.length === 0 && semana && semana.sesiones && semana.sesiones.length > 0) {
      sesionDef = semana.sesiones[0];
      console.log(`📋 Usando template de ${sesionDef.dia} para día faltante ${normalizedDay}`);
    }

    // Extraer ejercicios: soportar estructura directa Y estructura de bloques (Halterofilia)
    let ejercicios = [];
    if (scheduleExercises.length > 0) {
      ejercicios = scheduleExercises;
    } else if (Array.isArray(sesionDef?.ejercicios)) {
      // Estructura directa: sesion.ejercicios[]
      ejercicios = sesionDef.ejercicios;
    } else if (Array.isArray(sesionDef?.bloques)) {
      // Estructura de bloques: sesion.bloques[].ejercicios[]
      // Aplanar todos los ejercicios de todos los bloques
      ejercicios = sesionDef.bloques.flatMap(bloque =>
        Array.isArray(bloque.ejercicios) ? bloque.ejercicios : []
      );
      console.log(`📦 Extrayendo ejercicios desde estructura de bloques: ${ejercicios.length} ejercicios`);
    }

    // 🛟 Fallback: si no hay ejercicios definidos para este día, tomar aleatorios por nivel desde BD
    if (!Array.isArray(ejercicios) || ejercicios.length === 0) {
      try {
        const levelNorm = deriveLevelFromPlan(planData);
        const rnd = await getRandomByLevel(client, { disciplina: 'calistenia', level: levelNorm, limit: 6 });
        if (rnd.length > 0) {
          ejercicios = rnd.map((r) => ({
            nombre: r.nombre,
            series: 3,
            repeticiones: 10,
            descanso_seg: 60,
            notas: r.notas || null,
            gif_url: r.gif_url || null
          }));
          console.log(`🛟 [start] Fallback ejercicios aleatorios aplicado (nivel=${levelNorm}) -> ${ejercicios.length} ejercicios`);
        } else {
          console.warn('⚠️ [start] Fallback aleatorio no encontró ejercicios en BD');
        }
      } catch (fe) {
        console.warn('⚠️ [start] Error en fallback aleatorio de ejercicios:', fe?.message || fe);
      }
    }

    for (let i = 0; i < ejercicios.length; i++) {
      const ej = ejercicios[i] || {};
      const order = i; // 0-based

      // 🎯 Extraer exercise_id si está disponible
      const exerciseId = ej.exercise_id || ej.id || null;
      const repsTarget =
        ej.repeticiones ||
        ej.reps_objetivo ||
        ej.reps ||
        ej.repsObjetivo ||
        ej.default_reps_range ||
        '0';
      const restSeconds = Number(ej.descanso_seg ?? ej.descanso ?? 60) || 60;

      // Insertar si no existe
      await client.query(
        `INSERT INTO app.methodology_exercise_progress (
           methodology_session_id, user_id, exercise_order, exercise_id, exercise_name,
           series_total, repeticiones, descanso_seg, intensidad, tempo, notas,
           gif_url, video_url, series_completed, status
         )
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, 'pending'
         WHERE NOT EXISTS (
           SELECT 1 FROM app.methodology_exercise_progress
            WHERE methodology_session_id = $1 AND exercise_order = $3
         )`,
        [session.id, userId, order, exerciseId, ej.nombre || `Ejercicio ${i + 1}`,
         String(ej.series || '3'), String(repsTarget || '0'), restSeconds,
         // Truncado defensivo a los límites de columna: un tempo/intensidad más largo
         // (p.ej. 'Controlado con aceleración' en Halterofilia) rompía TODO el start.
         ej.intensidad ? String(ej.intensidad).slice(0, 50) : null,
         ej.tempo ? String(ej.tempo).slice(0, 60) : null,
         ej.notas || null,
         ej.gif_url || null, ej.video_url || null]
      );
    }

    // Marcar sesión iniciada
    await client.query(
      `UPDATE app.methodology_exercise_sessions
         SET session_status = 'in_progress', started_at = COALESCE(started_at, NOW()), total_exercises = $2
       WHERE id = $1`,
      [session.id, ejercicios.length]
    );

    await client.query('COMMIT');
    res.json({ success: true, session_id: session.id, total_exercises: ejercicios.length });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error starting routine session:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  } finally {
    client.release();
  }
});



// POST /api/routines/sessions/:sessionId/mark-started
// Marca una sesión como iniciada de forma segura sin recrearla
router.post('/sessions/:sessionId/mark-started', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.userId || req.user?.id;
    const sessionId = parseInt(req.params.sessionId, 10);

    if (!sessionId || Number.isNaN(sessionId)) {
      return res.status(400).json({ success: false, error: 'sessionId inválido' });
    }

    // Verificar sesión del usuario
    const sesQ = await client.query(
      `SELECT id, user_id, session_status, started_at
       FROM app.methodology_exercise_sessions WHERE id = $1`,
      [sessionId]
    );
    if (sesQ.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Sesión no encontrada' });
    }
    const ses = sesQ.rows[0];
    if (String(ses.user_id) !== String(userId)) {
      return res.status(403).json({ success: false, error: 'No autorizado' });
    }

    // Si ya está completada, no tocar y devolver estado actual
    if (ses.session_status === 'completed') {
      return res.json({
        success: true,
        session_id: sessionId,
        session_status: ses.session_status,
        session_started_at: ses.started_at || null
      });
    }

    // Actualizar timestamps de inicio y asegurar estado in_progress
    const upd = await client.query(
      `UPDATE app.methodology_exercise_sessions
         SET started_at = COALESCE(started_at, NOW()),
             session_status = CASE WHEN session_status = 'completed' THEN session_status ELSE 'in_progress' END,
             updated_at = NOW()
       WHERE id = $1
       RETURNING id, session_status, started_at`,
      [sessionId]
    );

    const updated = upd.rows[0];
    return res.json({
      success: true,
      session_id: sessionId,
      session_status: updated.session_status,



      session_started_at: updated.started_at || null
    });
  } catch (e) {
    console.error('Error marcando inicio de sesión:', e);
    return res.status(500).json({ success: false, error: 'Error marcando inicio de sesión' });
  } finally {
    client.release();
  }
});


// PUT /api/routines/sessions/:sessionId/exercise/:exerciseOrder
// Body: { series_completed, status, time_spent_seconds }
router.put('/sessions/:sessionId/exercise/:exerciseOrder', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = req.user?.userId || req.user?.id;
    const { sessionId, exerciseOrder } = req.params;
    const { series_completed, status, time_spent_seconds } = req.body;

    console.log(`📥 UPDATE EXERCISE - PUT /sessions/${sessionId}/exercise/${exerciseOrder} - user ${userId}`, {
      series_completed,
      status,
      time_spent_seconds
    });

    // Verificar sesión del usuario
    const ses = await client.query(
      'SELECT * FROM app.methodology_exercise_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );
    if (ses.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Sesión no encontrada' });
    }

    // Validación opcional de consistencia con plan/day recibidos
    const sessionRow = ses.rows[0];
    const bodyPlanId = req.body?.methodology_plan_id != null ? parseInt(req.body.methodology_plan_id, 10) : null;
    const bodyDayId = req.body?.day_id != null ? parseInt(req.body.day_id, 10) : null;

    if (bodyPlanId && Number(sessionRow.methodology_plan_id) !== Number(bodyPlanId)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ success: false, error: 'Inconsistencia: methodology_plan_id no coincide con la sesión' });
    }

    if (bodyDayId != null) {
      const dres = await client.query(
        `SELECT day_id FROM app.methodology_plan_days
         WHERE plan_id = $1 AND week_number = $2 AND day_name = $3
         LIMIT 1`,
        [sessionRow.methodology_plan_id, sessionRow.week_number, sessionRow.day_name]
      );
      const expectedDayId = dres.rows?.[0]?.day_id || null;
      if (!expectedDayId || Number(expectedDayId) !== Number(bodyDayId)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, error: 'Inconsistencia: day_id no corresponde a la sesión' });
      }
    }





    // Asegurar fila de progreso existente
    const progSel = await client.query(
      `SELECT * FROM app.methodology_exercise_progress
        WHERE methodology_session_id = $1 AND exercise_order = $2`,
      [sessionId, exerciseOrder]
    );

    if (progSel.rowCount === 0) {
      // Crear fila mínima (sin info completa) si faltase
      await client.query(
        `INSERT INTO app.methodology_exercise_progress (
           methodology_session_id, user_id, exercise_order, exercise_name,
           series_total, repeticiones, descanso_seg, series_completed, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'pending')`,
        [sessionId, userId, exerciseOrder, 'Ejercicio', 3, '—', 60]
      );
      console.log('🆕 Progreso creado para ejercicio', { sessionId, exerciseOrder });
    }

    // Actualizar progreso
    // Para ejercicios saltados o cancelados, series_completed debe ser 0
    const finalSeriesCompleted = (status === 'skipped' || status === 'cancelled') ? 0 : (series_completed ?? 0);

    const upd = await client.query(
      `UPDATE app.methodology_exercise_progress
         SET series_completed = $1::int,
             status = $2::varchar(20),
             time_spent_seconds = COALESCE($3, time_spent_seconds),
             completed_at = CASE WHEN $2::varchar(20) = 'completed' THEN NOW() ELSE completed_at END
       WHERE methodology_session_id = $4 AND exercise_order = $5
       RETURNING *`,
      [finalSeriesCompleted, status, time_spent_seconds ?? null, sessionId, exerciseOrder]
    );

    const updatedEx = upd.rows[0];
    console.log('✅ Exercise updated', {
      sessionId,
      exerciseOrder: parseInt(exerciseOrder, 10),
      status: updatedEx.status,
      series_completed: updatedEx.series_completed,
      time_spent_seconds: updatedEx.time_spent_seconds ?? null,
      completed_at: updatedEx.completed_at || null
    });

    // Actualizar sesión (contadores y estado)
    const counters = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'completed') AS completed,
         COUNT(*) FILTER (WHERE status = 'skipped') AS skipped,
         COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
         COUNT(*) FILTER (WHERE status = 'pending') AS pending,
         COUNT(*) AS total
       FROM app.methodology_exercise_progress
       WHERE methodology_session_id = $1`,
      [sessionId]
    );
    const { completed, skipped, cancelled, pending, total } = counters.rows[0];

    console.log('\ud83d\udcca Session counters', {
      sessionId,
      completed: Number(completed),
      skipped: Number(skipped),
      cancelled: Number(cancelled),
      pending: Number(pending),
      total: Number(total)
    });

    // 🎯 NUEVA LÓGICA: Solo 'completed' si TODOS están 'completed' (sin saltar ni cancelar)
    const allExercisesCompleted = (Number(completed) === Number(total) && Number(total) > 0);
    const newStatus = allExercisesCompleted ? 'completed' : 'in_progress';

    console.log('\ud83c\udfaf Session status decision', {
      sessionId,
      allExercisesCompleted,
      newStatus,
      reason: allExercisesCompleted
        ? 'Todos los ejercicios completados'
        : `${Number(skipped)} saltados, ${Number(cancelled)} cancelados, ${Number(pending)} pendientes`
    });

    await client.query(
      `UPDATE app.methodology_exercise_sessions
         SET exercises_completed = $2,
             total_exercises = GREATEST($3, COALESCE(total_exercises, 0)),
             total_duration_seconds = COALESCE(total_duration_seconds, 0) + COALESCE($4, 0),
             session_status = $5::text,
             completed_at = CASE WHEN $5::text = 'completed' THEN NOW() ELSE NULL END,
             updated_at = NOW()
       WHERE id = $1`,
      [sessionId, Number(completed), Number(total), time_spent_seconds ?? 0, String(newStatus)]
    );

    await client.query('COMMIT');
    res.json({ success: true, exercise: upd.rows[0], progress: { completed: Number(completed), total: Number(total) } });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error updating routine exercise:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  } finally {
    client.release();
  }
});


// POST /api/routines/sessions/:sessionId/finish
router.post('/sessions/:sessionId/finish', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = req.user?.userId || req.user?.id;
    const { sessionId } = req.params;

    const ses = await client.query(
      'SELECT * FROM app.methodology_exercise_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );
    if (ses.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Sesión no encontrada' });
    }

    // 🎯 CALCULAR ESTADO REAL basado en progreso de ejercicios
    console.log('\ud83d\udd1c FINISH SESSION - POST /sessions/' + sessionId + '/finish');

    const progressStats = await client.query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'skipped') as skipped,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress
       FROM app.methodology_exercise_progress
       WHERE methodology_session_id = $1`,
      [sessionId]
    );

    const stats = progressStats.rows[0];
    const total = Number(stats.total);
    const completed = Number(stats.completed);
    const skipped = Number(stats.skipped);
    const cancelled = Number(stats.cancelled);

    // Determinar estado correcto
    let finalStatus;
    if (completed === total && total > 0) {
      finalStatus = 'completed';  // Todos completados
    } else if (skipped === total && total > 0) {
      finalStatus = 'skipped';    // Todos saltados
    } else if (cancelled === total && total > 0) {
      finalStatus = 'cancelled';  // Todos cancelados
    } else if (completed > 0) {
      finalStatus = 'partial';    // Mezcla con algunos completados
    } else {
      finalStatus = 'incomplete'; // Sin ejercicios completados
    }

    console.log('📊 Estado calculado:', {
      sessionId,
      total,
      completed,
      skipped,
      cancelled,
      finalStatus
    });

    // 🕒 Duración de la sesión = MAX(reloj de pared, tiempo activo de ejercicios + warmup).
    // El reloj de pared solo (NOW()-started_at) daba ~0 en sesiones rápidas y era
    // inconsistente con Progreso (que suma time_spent_seconds). GREATEST garantiza que
    // nunca sea 0 cuando hubo entrenamiento y conserva la duración real en sesiones largas.
    await client.query(
      `UPDATE app.methodology_exercise_sessions
         SET session_status = $2,
             completed_at = NOW(),
             total_duration_seconds = GREATEST(
               EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
               COALESCE((
                 SELECT SUM(COALESCE(time_spent_seconds, 0))
                 FROM app.methodology_exercise_progress
                 WHERE methodology_session_id = $1 AND status = 'completed'
               ), 0) + COALESCE(warmup_time_seconds, 0)
             ),
             exercises_completed = $3,
             total_exercises = $4
       WHERE id = $1`,
      [sessionId, finalStatus, completed, total]
    );

    console.log('\u2705 Session finished', { sessionId, status: finalStatus });

    // Obtener todos los ejercicios de la sesión para mover al historial
    const exercisesQuery = await client.query(
      `SELECT mep.*, mes.methodology_type, mes.methodology_plan_id, mes.week_number, mes.day_name,
              mes.warmup_time_seconds, mes.started_at, mes.completed_at
       FROM app.methodology_exercise_progress mep
       JOIN app.methodology_exercise_sessions mes ON mep.methodology_session_id = mes.id
       WHERE mep.methodology_session_id = $1`,
      [sessionId]
    );

    // Mover cada ejercicio al historial completo
    for (const exercise of exercisesQuery.rows) {
      // Solo mover ejercicios que fueron completados o saltados (no pendientes)
      if (exercise.status !== 'pending') {
        await client.query(
          `INSERT INTO app.methodology_exercise_history_complete (
            user_id, methodology_plan_id, methodology_session_id,
            exercise_name, exercise_order, methodology_type,
            series_total, series_completed, repeticiones, intensidad,
            tiempo_dedicado_segundos, warmup_time_seconds, week_number, day_name,
            session_date, completed_at, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
          ON CONFLICT DO NOTHING`,
          [
            userId,
            exercise.methodology_plan_id,
            sessionId,
            exercise.exercise_name,
            exercise.exercise_order,
            exercise.methodology_type,
            exercise.series_total,
            exercise.series_completed || 0,
            exercise.repeticiones,
            exercise.intensidad,
            exercise.time_spent_seconds,
            exercise.warmup_time_seconds || 0, // ✅ NUEVO: Tiempo de calentamiento
            exercise.week_number,
            exercise.day_name,
            exercise.started_at ? new Date(exercise.started_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
            exercise.completed_at || new Date()
          ]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Sesión finalizada y datos guardados en historial' });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error finishing routine session:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  } finally {
    client.release();
  }
});


// PUT /api/routines/sessions/:sessionId/warmup-time
// Actualizar tiempo de calentamiento de una sesión
router.put('/sessions/:sessionId/warmup-time', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.userId || req.user?.id;
    const { sessionId } = req.params;
    const { warmup_time_seconds } = req.body;

    // Validar entrada
    if (!sessionId || warmup_time_seconds === undefined) {
      return res.status(400).json({
        success: false,
        error: 'sessionId y warmup_time_seconds son requeridos'
      });
    }

    // Verificar que la sesión existe y pertenece al usuario
    const sessionCheck = await client.query(`
      SELECT id, methodology_plan_id, user_id, session_status AS status, warmup_time_seconds
      FROM app.methodology_exercise_sessions
      WHERE id = $1 AND user_id = $2
    `, [sessionId, userId]);

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Sesión no encontrada o no autorizada'
      });
    }

    const session = sessionCheck.rows[0];

    // Solo permitir actualizar sesiones activas (no completadas)
    if (session.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'No se puede actualizar tiempo de warmup en sesión completada'
      });
    }

    // Actualizar tiempo de calentamiento
    const updateResult = await client.query(`
      UPDATE app.methodology_exercise_sessions
      SET
        warmup_time_seconds = $1,
        updated_at = NOW()
      WHERE id = $2 AND user_id = $3
      RETURNING warmup_time_seconds, total_duration_seconds
    `, [warmup_time_seconds, sessionId, userId]);

    if (updateResult.rows.length === 0) {
      return res.status(500).json({
        success: false,
        error: 'No se pudo actualizar el tiempo de calentamiento'
      });
    }

    const updated = updateResult.rows[0];

    console.log(`✅ Tiempo de calentamiento actualizado para sesión ${sessionId}: ${warmup_time_seconds}s`);

    res.json({
      success: true,
      message: 'Tiempo de calentamiento actualizado correctamente',
      data: {
        sessionId: parseInt(sessionId),
        warmup_time_seconds: updated.warmup_time_seconds,
        total_duration_seconds: updated.total_duration_seconds
      }
    });

  } catch (error) {
    console.error('Error actualizando tiempo de calentamiento:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  } finally {
    client.release();
  }
});


// GET /api/routines/sessions/today-status
// Obtiene el estado de la sesión del día actual (si existe)
// Ahora acepta también day_id como forma preferida de identificar el día
router.get('/sessions/today-status', authenticateToken, async (req, res) => {
  try {
    // Log completo de la ruta y query para ver los parámetros (incluye day_id y methodology_plan_id)
    console.log(`📥 GET ${req.originalUrl} - ${new Date().toISOString()}`);
    console.log('🧭 today-status query:', req.query);

    const userIdRaw = req.user?.userId || req.user?.id;
    const userId = parseInt(userIdRaw, 10);
    const { methodology_plan_id: planIdParam } = req.query;
    let { week_number, day_name } = req.query;
    const day_id = req.query?.day_id ? parseInt(req.query.day_id, 10) : null;
    const session_date = req.query?.session_date;

    if (!planIdParam || (!day_id && (!week_number || !day_name))) {
      return res.status(400).json({
        success: false,
        error: 'Parámetros requeridos: methodology_plan_id y (day_id) o (week_number, day_name)'
      });
    }

    // Convertir methodology_plan_id a integer
    const methodology_plan_id = parseInt(planIdParam, 10);
    if (isNaN(methodology_plan_id)) {
      return res.status(400).json({
        success: false,
        error: 'methodology_plan_id debe ser un número válido'
      });
    }

    // Resolver week/day de forma robusta
    let session = null;
    if (session_date) {
      const sessionDateQuery = await pool.query(
        `SELECT * FROM app.methodology_exercise_sessions
         WHERE user_id = $1
           AND methodology_plan_id = $2
           AND session_date = $3::date
         ORDER BY COALESCE(updated_at, started_at, created_at) DESC
         LIMIT 1`,
        [userId, methodology_plan_id, session_date]
      );
      if (sessionDateQuery.rowCount > 0) {
        session = sessionDateQuery.rows[0];
        week_number = session.week_number || week_number;
        day_name = session.day_name || day_name;
        console.log('🗓️ today-status usa session_date para encontrar sesión', {
          session_date,
          session_id: session.id,
          week_number,
          day_name
        });
      }
    }

    // PRIORIDAD 0: Si viene session_date, usar workout_schedule por fecha (más confiable)
    if (req.query.session_date && (!week_number || !day_name)) {
      const sched = await pool.query(
        `SELECT week_number, day_name FROM app.workout_schedule
         WHERE methodology_plan_id = $1 AND user_id = $2 AND scheduled_date::date = $3::date
         LIMIT 1`,
        [methodology_plan_id, userId, req.query.session_date]
      );
      if (sched.rowCount > 0) {
        week_number = sched.rows[0].week_number;
        day_name = sched.rows[0].day_name;
        console.log('🗓️ today-status usa programación por fecha (workout_schedule)', { week_number, day_name });
      }
    }
    // 🎯 PRIORIDAD 1: Si viene day_id, usar methodology_plan_days (más confiable)
    if (day_id && (!week_number || !day_name)) {
      const dres = await pool.query(
        `SELECT week_number, day_name FROM app.methodology_plan_days WHERE plan_id = $1 AND day_id = $2`,
        [methodology_plan_id, day_id]
      );
      if (dres.rowCount > 0) {
        week_number = dres.rows[0].week_number;
        day_name = dres.rows[0].day_name;
        console.log('🎯 today-status usa day_id desde methodology_plan_days', { day_id, week_number, day_name });
      } else {
        // Fallback seguro: derivar semana
        week_number = Math.ceil(Number(day_id) / 7);
        day_name = day_name || 'lunes';
        console.log('⚠️ today-status fallback: day_id no encontrado en methodology_plan_days', { day_id, week_number, day_name });
      }
    }

    // 🎯 PRIORIDAD 2: Si no hay day_id pero viene session_date, usar programación (workout_schedule)
    if (req.query.session_date && (!week_number || !day_name)) {
      const sched = await pool.query(
        `SELECT week_number, day_name FROM app.workout_schedule
         WHERE methodology_plan_id = $1 AND user_id = $2 AND scheduled_date::date = $3::date
         LIMIT 1`,
        [methodology_plan_id, userId, req.query.session_date]
      );
      if (sched.rowCount > 0) {
        week_number = sched.rows[0].week_number;
        day_name = sched.rows[0].day_name;
        console.log('🗓️ today-status usa programación (workout_schedule)', { week_number, day_name });
      }
    }

    const normalizedDay = normalizeDayAbbrev(day_name);

    // Buscar la sesión del día por fecha específica (más preciso)
    // 🎯 BÚSQUEDA MEJORADA: Siempre filtrar por week_number Y day_name
    // Esto evita devolver sesiones de días incorrectos
    let sessionQuery = null;
    if (!session) {
      sessionQuery = await pool.query(
        `SELECT * FROM app.methodology_exercise_sessions
         WHERE user_id = $1
           AND methodology_plan_id = $2
           AND week_number = $3
           AND day_name = $4
         ORDER BY COALESCE(updated_at, started_at, created_at) DESC
         LIMIT 1`,
        [userId, methodology_plan_id, week_number, normalizedDay]
      );
      if (sessionQuery.rowCount > 0) {
        session = sessionQuery.rows[0];
      }
    }

    // Log detallado para debugging
    console.log('🔍 Búsqueda de sesión:', {
      userId,
      methodology_plan_id,
      day_id_received: day_id,
      week_number,
      day_name: normalizedDay,
      found: Boolean(session),
      session_id: session?.id || sessionQuery?.rows?.[0]?.id,
      source: session ? (session_date ? 'session_date' : 'week_day') : 'none'
    });

    if (!session) {
      // 🎯 FIX: Si no hay sesión iniciada, verificar si hay un día programado en workout_schedule.
      const dayFullName = normalizeDayFullName(normalizedDay);

      const scheduleQuery = await pool.query(
        `SELECT id, exercises, scheduled_date, day_name
         FROM app.workout_schedule
         WHERE methodology_plan_id = $1 AND week_number = $2
           AND (day_abbrev = $3 OR day_name = $4)
         LIMIT 1`,
        [methodology_plan_id, week_number, normalizedDay, dayFullName]
      );

      if (scheduleQuery.rowCount === 0) {
        // No hay día programado - es un día de descanso
        console.log('ℹ️ No hay entrenamiento programado para este día (día de descanso)');
        return res.status(200).json({
          success: true,
          session_type: 'methodology',
          session: null,
          exercises: [],
          isRestDay: true,
          message: 'Día de descanso - no hay entrenamiento programado para este día'
        });
      }

      // Hay un día programado pero la sesión aún no se ha iniciado
      const scheduleData = scheduleQuery.rows[0];
      const scheduledExercises = scheduleData.exercises || [];

      console.log('📋 Sesión programada pero no iniciada:', {
        scheduled_date: scheduleData.scheduled_date,
        exercises_count: scheduledExercises.length
      });

      // Formatear ejercicios para el frontend
      const formattedExercises = scheduledExercises.map((ex, idx) => ({
        exercise_order: idx + 1,
        exercise_name: ex.nombre || ex.name || `Ejercicio ${idx + 1}`,
        series_total: ex.series || 3,
        series_completed: 0,
        repeticiones: ex.repeticiones || ex.reps || '8-12',
        descanso_seg: ex.descanso_seg || ex.descanso || 90,
        intensidad: ex.intensidad || null,
        tempo: ex.tempo || null,
        status: 'pending',
        notas: ex.notas || ''
      }));

      return res.status(200).json({
        success: true,
        session_type: 'methodology',
        session: null, // No hay sesión iniciada aún
        sessionNotStarted: true,
        scheduledDate: scheduleData.scheduled_date,
        exercises: formattedExercises,
        summary: {
          total: formattedExercises.length,
          completed: 0,
          skipped: 0,
          cancelled: 0,
          pending: formattedExercises.length,
          isComplete: false,
          canRetry: false
        },
        message: 'Sesión programada pero no iniciada. Pulsa "Comenzar Entrenamiento" para empezar.'
      });
    }

    // 🎯 CORRECCIÓN CRÍTICA: Obtener el TOTAL REAL de ejercicios del plan
    // El query de progreso solo devuelve ejercicios que YA tienen progreso guardado
    // Esto causaba que summary.total = 2 cuando realmente el plan tiene 5 ejercicios
    const planDayQuery = await pool.query(
      `SELECT planned_exercises_count FROM app.methodology_plan_days
       WHERE plan_id = $1 AND week_number = $2 AND day_name = $3`,
      [methodology_plan_id, week_number, normalizedDay]
    );

    const totalExercisesFromPlan = planDayQuery.rows[0]?.planned_exercises_count || 0;

    console.log('🔍 Total real de ejercicios:', {
      totalFromPlan: totalExercisesFromPlan,
      planDayExists: planDayQuery.rowCount > 0,
      plannedCount: planDayQuery.rows[0]?.planned_exercises_count
    });

    // 🎯 Obtener ejercicios completos desde workout_schedule.
    const fullDayName = normalizeDayFullName(normalizedDay);

    const workoutScheduleQuery = await pool.query(
      `SELECT exercises FROM app.workout_schedule
       WHERE methodology_plan_id = $1 AND week_number = $2
         AND (day_abbrev = $3 OR day_name = $4)`,
      [methodology_plan_id, week_number, normalizedDay, fullDayName]
    );

    let planExercisesFromSchedule = workoutScheduleQuery.rows[0]?.exercises || [];

    console.log('🔍 Ejercicios desde workout_schedule:', {
      fullDayName,
      found: workoutScheduleQuery.rowCount > 0,
      exerciseCount: planExercisesFromSchedule.length
    });

    // 🎯 FALLBACK CRÍTICO: Si workout_schedule está vacío, obtener ejercicios desde plan_data
    // Esto es necesario para metodologías como Casa que no insertan en workout_schedule
    if (planExercisesFromSchedule.length === 0) {
      console.log('⚠️ workout_schedule vacío, obteniendo ejercicios desde plan_data...');

      const planQuery = await pool.query(
        `SELECT plan_data FROM app.methodology_plans WHERE id = $1`,
        [methodology_plan_id]
      );

      if (planQuery.rowCount > 0) {
        const planData = planQuery.rows[0].plan_data;
        const semanas = planData?.semanas || [];

        // Buscar la semana y sesión correspondiente
        const semana = semanas.find(s =>
          (s.semana || s.numero || s.week || s.week_number) === parseInt(week_number)
        );

        if (semana && semana.sesiones) {
          const sesion = semana.sesiones.find(s => {
            const sesionDia = normalizeDayAbbrev(s.dia);
            return sesionDia === normalizedDay;
          });

          if (sesion && sesion.ejercicios) {
            planExercisesFromSchedule = sesion.ejercicios;
            console.log(`✅ Ejercicios recuperados desde plan_data: ${planExercisesFromSchedule.length}`);
          }
        }
      }

      if (planExercisesFromSchedule.length === 0) {
        console.warn('⚠️ No se encontraron ejercicios ni en workout_schedule ni en plan_data');
      }
    }

    // Obtener progreso de ejercicios con feedback
    // COALESCE: si la fila progress no tiene gif_url (plan generado antes de poblar la BD),
    // se coge el valor actual de app.ejercicios como fallback
    const exercisesQuery = await pool.query(
      `SELECT
        p.exercise_order, p.exercise_id, p.exercise_name, p.series_total, p.series_completed,
        p.repeticiones, p.descanso_seg, p.intensidad, p.tempo, p.status,
        p.time_spent_seconds, p.notas,
        COALESCE(p.gif_url, e.gif_url) AS gif_url,
        p.video_url AS video_url,
        f.sentiment, f.comment
       FROM app.methodology_exercise_progress p
       LEFT JOIN app.ejercicios e ON e.id = p.exercise_id
       LEFT JOIN app.methodology_exercise_feedback f
         ON p.methodology_session_id = f.methodology_session_id
         AND p.exercise_order = f.exercise_order
       WHERE p.methodology_session_id = $1
       ORDER BY p.exercise_order ASC`,
      [session.id]
    );

    // Calcular resumen detallado por estado
    // ✅ CORRECCIÓN: Usar total del plan, no del query de progreso
    const totalExercises = totalExercisesFromPlan || exercisesQuery.rowCount;
    const statusCounts = exercisesQuery.rows.reduce((acc, ex) => {
      const s = String(ex.status || 'pending').toLowerCase();
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    const completedExercises = statusCounts['completed'] || 0;
    const skippedExercises = statusCounts['skipped'] || 0;
    const cancelledExercises = statusCounts['cancelled'] || 0;
    const inProgressExercises = statusCounts['in_progress'] || 0;

    // ✅ CORRECCIÓN: Calcular pendientes = total - (procesados)
    // Ejercicios sin registro en BD también son pendientes
    const exercisesWithProgress = exercisesQuery.rowCount;
    const pendingExercises = totalExercises - (completedExercises + skippedExercises + cancelledExercises + inProgressExercises);

    console.log('📊 Contadores de ejercicios:', {
      totalExercises,
      exercisesWithProgress,
      completedExercises,
      pendingExercises,
      inProgressExercises,
      skippedExercises,
      cancelledExercises,
      suma: completedExercises + pendingExercises + inProgressExercises + skippedExercises + cancelledExercises
    });

    // 🎯 CORRECCIÓN: isFinished debe reflejar la verdad de la BD (session_status)
    // Esta es la única fuente de verdad para determinar si una sesión está realmente completada
    const isFinished = session.session_status === 'completed';
    const isCompleteSuccess = totalExercises > 0 && completedExercises === totalExercises;

    // Nuevo flag: Todos fueron procesados (no hay pending/in_progress) pero NO necesariamente completados
    const allProcessed = totalExercises > 0 && pendingExercises === 0 && inProgressExercises === 0;

    // Lógica de reanudación:
    // - Reanudar si NO está completada (session_status) Y (ya hubo progreso O la sesión fue iniciada)
    // - Comenzar si todo sigue pendiente y session_started_at es null
    const hasAnyProgress = (inProgressExercises > 0) || ((completedExercises + skippedExercises + cancelledExercises) > 0);
    const sessionWasStarted = session.session_started_at != null;
    const canResume = session.session_status !== 'completed' && (hasAnyProgress || sessionWasStarted);

    // canRetry: puede reintentar si todos procesados pero no todos completados exitosamente (ej: skipped/cancelled)
    const canRetry = allProcessed && !isCompleteSuccess;

    console.log(`🎯 today-status NUEVA LÓGICA INTELIGENTE:`, {
      session_status: session.session_status,
      canResume,
      decision: canResume ? 'REANUDAR ⚠️' : (isFinished ? 'COMPLETADO ✅' : 'COMENZAR ✅'),
      totalExercises,
      completedExercises,
      skippedExercises,
      cancelledExercises,
      inProgressExercises,
      pendingExercises,
      isFinished,
      isCompleteSuccess,
      allProcessed,
      canRetry
    });

    // 🔍 DEBUG: Mostrar datos completos que se envían al frontend
    // ✅ CORRECCIÓN: Construir lista completa de ejercicios combinando plan con progreso
    // Frontend necesita ver TODOS los ejercicios (4), no solo los que tienen progreso (2)

    // 🎯 FIX PARA CASA: Manejar casos donde los ejercicios existen en progress pero no en plan
    let completeExerciseList;

    console.log('🏠 CASA FIX DEBUG:', {
      planExercisesLength: planExercisesFromSchedule.length,
      exercisesQueryLength: exercisesQuery.rows.length,
      exercisesQuerySample: exercisesQuery.rows.length > 0 ? exercisesQuery.rows[0] : 'none'
    });

    if (planExercisesFromSchedule.length > 0) {
      // Original logic: combine plan with progress
      const progressMap = new Map(exercisesQuery.rows.map(ex => [ex.exercise_order, ex]));

      completeExerciseList = planExercisesFromSchedule.map((planEx, index) => {
        const progressData = progressMap.get(index);

        if (progressData) {
          // Ejercicio con progreso guardado
          return {
            ...planEx,
            ...progressData,
            nombre: progressData.exercise_name || planEx.nombre,
            gif_url: progressData.gif_url || planEx.gif_url || null,
            video_url: progressData.video_url || planEx.video_url || null
          };
        } else {
          // Ejercicio sin progreso = pending
          return {
            ...planEx,
            exercise_order: index,
            exercise_name: planEx.nombre,
            series_total: planEx.series,
            series_completed: 0,
            repeticiones: planEx.repeticiones,
            descanso_seg: planEx.descanso_seg,
            intensidad: planEx.intensidad,
            tempo: planEx.tempo || null,
            status: 'pending',
            time_spent_seconds: 0,
            notas: planEx.notas || null,
            gif_url: planEx.gif_url || null,
            video_url: planEx.video_url || null,
            sentiment: null,
            comment: null
          };
        }
      });
    } else if (exercisesQuery.rows.length > 0) {
      // 🏠 CASA FALLBACK: Si no hay plan pero sí hay ejercicios en progress, usar esos directamente
      // Esto ocurre con Casa cuando los ejercicios ya fueron creados en la BD pero no están en workout_schedule
      console.log('📌 Using exercises from methodology_exercise_progress (Casa/methodology fallback)');
      console.log('📌 Exercises found:', exercisesQuery.rows.length);
      completeExerciseList = exercisesQuery.rows.map((ex) => ({
        ...ex,
        nombre: ex.exercise_name
      }));
    } else {
      // No exercises found anywhere
      console.log('⚠️ No exercises found in plan or progress table');
      completeExerciseList = [];
    }

    console.log(`🔍 today-status RESPONSE DATA:`, {
      session: {
        id: session.id,
        session_status: session.session_status,
        canResume: canResume,
        session_started_at: session.started_at,
        week_number,
        day_name
      },
      summary: {
        total: totalExercises,
        completed: completedExercises,
        skipped: skippedExercises,
        cancelled: cancelledExercises,
        in_progress: inProgressExercises,
        pending: pendingExercises,
        isFinished: isFinished,
        isComplete: isCompleteSuccess,
        allProcessed: allProcessed,  // 🆕 Todos procesados (no pending/in_progress)
        canRetry                     // 🆕 Puede reintentar ejercicios skipped/cancelled
      },
      exerciseCount: completeExerciseList.length,
      exercisesWithProgress: exercisesQuery.rows.length,
      exerciseStatuses: completeExerciseList.map(ex => ({ order: ex.exercise_order, status: ex.status, name: ex.exercise_name }))
    });

    res.json({
      success: true,
      session: {
        ...session,
        canResume,
        session_started_at: session.started_at
      },
      exercises: completeExerciseList,
      summary: {
        total: totalExercises,
        completed: completedExercises,
        skipped: skippedExercises,
        cancelled: cancelledExercises,
        in_progress: inProgressExercises,
        pending: pendingExercises,
        isFinished: isFinished,
        isComplete: isCompleteSuccess,
        allProcessed: allProcessed,  // 🆕 Todos procesados (no pending/in_progress)
        canRetry                     // 🆕 Puede reintentar ejercicios skipped/cancelled
      }
    });

  } catch (error) {
    console.error('Error obteniendo estado de sesión del día:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});


// GET /api/routines/sessions/:sessionId/progress
router.get('/sessions/:sessionId/progress', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { sessionId } = req.params;

    const ses = await pool.query(
      'SELECT * FROM app.methodology_exercise_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );
    if (ses.rowCount === 0) return res.status(404).json({ success: false, error: 'Sesión no encontrada' });

    const progress = await pool.query(
       `SELECT
        mep.exercise_order, mep.exercise_id, mep.exercise_name, mep.series_total, mep.series_completed,
        mep.repeticiones, mep.descanso_seg, mep.intensidad, mep.tempo, mep.status,
        mep.time_spent_seconds, mep.notas, mep.gif_url, mep.video_url,
        mef.sentiment, mef.comment
       FROM app.methodology_exercise_progress mep
       LEFT JOIN app.methodology_exercise_feedback mef
         ON mep.methodology_session_id = mef.methodology_session_id
         AND mep.exercise_order = mef.exercise_order
       WHERE mep.methodology_session_id = $1
       ORDER BY mep.exercise_order ASC`,
      [sessionId]
    );

    const counters = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
              COUNT(*)::int AS total
         FROM app.methodology_exercise_progress
        WHERE methodology_session_id = $1`,
      [sessionId]
    );

    res.json({ success: true, session: ses.rows[0], exercises: progress.rows, summary: counters.rows[0] });
  } catch (e) {
    console.error('Error fetching session progress:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  }
});


// POST /api/routines/sessions/:sessionId/exercise/:exerciseOrder/feedback
// Guardar feedback del usuario sobre un ejercicio específico
router.post('/sessions/:sessionId/exercise/:exerciseOrder/feedback', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = req.user?.userId || req.user?.id;
    const { sessionId, exerciseOrder } = req.params;
    const { sentiment, comment, exerciseName } = req.body;

    console.log('\ud83d\udcac FEEDBACK', { sessionId, exerciseOrder: parseInt(exerciseOrder, 10), sentiment, hasComment: !!comment, exerciseName });

    // Validar parámetros
    if (!sentiment || !['like', 'dislike', 'hard'].includes(sentiment)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'sentiment es requerido y debe ser: like, dislike, hard'
      });
    }

    // Verificar que la sesión pertenece al usuario
    const sessionCheck = await client.query(
      'SELECT id FROM app.methodology_exercise_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );

    if (sessionCheck.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'Sesión no encontrada'
      });
    }

    // Insertar o actualizar feedback (usando UPSERT)
    const upsertResult = await client.query(
      `INSERT INTO app.methodology_exercise_feedback (
        methodology_session_id, user_id, exercise_name, exercise_order, sentiment, comment, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (methodology_session_id, exercise_order)
      DO UPDATE SET
        sentiment = EXCLUDED.sentiment,
        comment = EXCLUDED.comment,
        updated_at = NOW()
      RETURNING id, sentiment, comment`,
      [sessionId, userId, exerciseName, parseInt(exerciseOrder), sentiment, comment || null]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      feedback: upsertResult.rows[0],
      message: 'Feedback guardado correctamente'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error guardando feedback de ejercicio:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  } finally {
    client.release();
  }
});


// GET /api/routines/sessions/:sessionId/feedback
// Obtener todo el feedback de una sesión
router.get('/sessions/:sessionId/feedback', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { sessionId } = req.params;

    // Verificar que la sesión pertenece al usuario
    const sessionCheck = await pool.query(
      'SELECT id FROM app.methodology_exercise_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );

    if (sessionCheck.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Sesión no encontrada'
      });
    }

    // Obtener feedback de todos los ejercicios de la sesión
    const feedbackQuery = await pool.query(
      `SELECT
        exercise_order,
        exercise_name,
        sentiment,
        comment,
        created_at,
        updated_at
       FROM app.methodology_exercise_feedback
       WHERE methodology_session_id = $1
       ORDER BY exercise_order ASC`,
      [sessionId]
    );

    res.json({
      success: true,
      feedback: feedbackQuery.rows
    });

  } catch (error) {
    console.error('Error obteniendo feedback de sesión:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});




// GET /api/routines/sessions/:sessionId/details
// Obtener datos completos de una sesión específica
router.get('/sessions/:sessionId/details', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const { sessionId } = req.params;

    // Obtener datos de la sesión
    const sessionQuery = await pool.query(
      `SELECT
        s.id, s.methodology_plan_id, s.week_number, s.day_name, s.status,
        s.started_at, s.completed_at, s.user_id,
        mp.methodology_type, mp.plan_data
       FROM app.methodology_exercise_sessions s
       JOIN app.methodology_plans mp ON s.methodology_plan_id = mp.id
       WHERE s.id = $1 AND s.user_id = $2`,
      [sessionId, userId]
    );

    if (sessionQuery.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Sesión no encontrada'
      });
    }

    const session = sessionQuery.rows[0];

    // Obtener progreso de ejercicios
    const exercisesQuery = await pool.query(
      `SELECT
        exercise_order, exercise_id, exercise_name, series_total, series_completed,
        status, time_spent_seconds, started_at, completed_at, gif_url, video_url
       FROM app.methodology_exercise_progress
       WHERE methodology_session_id = $1
       ORDER BY exercise_order ASC`,
      [sessionId]
    );

    const exercises = exercisesQuery.rows;

    // Calcular estadísticas de resumen
    const totalExercises = exercises.length;
    const completedExercises = exercises.filter(ex => ex.status === 'completed').length;
    const skippedExercises = exercises.filter(ex => ex.status === 'skipped').length;
    const cancelledExercises = exercises.filter(ex => ex.status === 'cancelled').length;
    const totalTimeSpent = exercises.reduce((sum, ex) => sum + (ex.time_spent_seconds || 0), 0);

    const summary = {
      totalExercises,
      completedExercises,
      skippedExercises,
      cancelledExercises,
      completionRate: totalExercises > 0 ? Math.round((completedExercises / totalExercises) * 100) : 0,
      totalTimeSpent,
      averageTimePerExercise: completedExercises > 0 ? Math.round(totalTimeSpent / completedExercises) : 0
    };

    console.log(`✅ Detalles de sesión ${sessionId} obtenidos correctamente`);

    res.json({
      success: true,
      session,
      exercises,
      summary
    });

  } catch (error) {
    console.error('❌ Error obteniendo detalles de sesión:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});


// ❌ ENDPOINT DUPLICADO ELIMINADO (FASE 1)
// Este endpoint estaba duplicado y nunca se ejecutaba porque Express usa el primero que coincide.
// El endpoint funcional está en la línea 1287.
// Eliminado en FASE 1 para evitar confusión y código muerto.


// DEV-ONLY: POST /api/routines/sessions/:sessionId/purge
// Elimina una sesión y su progreso asociado (solo entorno de pruebas)
router.post('/sessions/:sessionId/purge', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user?.userId || req.user?.id;
    const sessionId = parseInt(req.params.sessionId, 10);

    if (!sessionId || Number.isNaN(sessionId)) {
      return res.status(400).json({ success: false, error: 'sessionId inválido' });
    }

    // Opcional: limitar a entornos no productivos
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, error: 'Operación no permitida en producción' });
    }

    await client.query('BEGIN');

    // Verificar pertenencia
    const sesQ = await client.query(
      `SELECT id FROM app.methodology_exercise_sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, userId]
    );
    if (sesQ.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Sesión no encontrada para este usuario' });
    }

    // Borrar progreso primero
    await client.query(
      `DELETE FROM app.methodology_exercise_progress WHERE methodology_session_id = $1`,
      [sessionId]
    );

    // Borrar sesión
    await client.query(
      `DELETE FROM app.methodology_exercise_sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, userId]
    );

    await client.query('COMMIT');
    console.log(`🧹 Sesión ${sessionId} purgada (dev-only) para usuario ${userId}`);
    res.json({ success: true, purged_session_id: sessionId });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error purgando sesión:', e);
    res.status(500).json({ success: false, error: 'Error interno' });
  } finally {
    client.release();
  }
});

export default router;
