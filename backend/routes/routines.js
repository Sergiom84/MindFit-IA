/* eslint-env node */
import express from 'express';
import process from 'node:process';
import authenticateToken from '../middleware/auth.js';
import { pool } from '../db.js';
import { preSessionCleanup } from '../utils/sessionCleanup.js';
import { ensureWorkoutScheduleV3, normalizeDayAbbrev } from '../utils/ensureScheduleV3.js';

// 🎯 HELPERS COMPARTIDOS - Evitar duplicación
import { stripDiacritics } from '../utils/shared/dayNormalizer.js';
import { findWeekInPlan, normalizePlanDays, deriveLevelFromPlan } from '../utils/shared/planHelpers.js';

const router = express.Router();

// Obtener ejercicios aleatorios de Calistenia por nivel (fallback)
async function getRandomCalistheniaExercises(client, level = 'basico', limit = 6) {
  const lvl = String(level).toLowerCase();
  let allowed = ['Básico'];
  if (lvl === 'intermedio') allowed = ['Básico', 'Intermedio'];
  if (lvl === 'avanzado') allowed = ['Básico', 'Intermedio', 'Avanzado'];

  const q = await client.query(
    `SELECT nombre, series_reps_objetivo, criterio_de_progreso, notas
     FROM app."Ejercicios_Calistenia"
     WHERE nivel = ANY($1::text[])
     ORDER BY RANDOM()
     LIMIT $2`,
    [allowed, limit]
  );
  return q.rows || [];
}


// 🎯 FASE 3: Función DESHABILITADA - Las sesiones se crean bajo demanda
// Esta función llamaba al stored procedure create_methodology_exercise_sessions
// que ha sido reemplazado por ensureWorkoutSchedule() + creación bajo demanda
async function ensureMethodologySessions() {
  console.log(`📋 [ensureMethodologySessions] DESHABILITADA (FASE 3) - sesiones se crean bajo demanda`);
  // Las sesiones en methodology_exercise_sessions se crean cuando el usuario
  // inicia un entrenamiento (endpoint /sessions/start)
  return;
}

// Utilidad: asegurar programación (workout_schedule) a partir del plan JSON
async function ensureWorkoutSchedule(client, userId, methodologyPlanId, planDataJson, startDate = new Date()) {
  console.log(`📅 [ensureWorkoutSchedule] Iniciando para plan ${methodologyPlanId}, usuario ${userId}`);

  // Parsear plan si viene en string
  const planData = typeof planDataJson === 'string' ? JSON.parse(planDataJson) : planDataJson;
  if (!planData || !Array.isArray(planData.semanas) || planData.semanas.length === 0) {
    console.warn(`⚠️ [ensureWorkoutSchedule] Plan vacío o sin semanas para plan ${methodologyPlanId}`);
    return;
  }

  console.log(`📊 [ensureWorkoutSchedule] Plan tiene ${planData.semanas.length} semanas`);

  // 🎯 NORMALIZAR días del plan (Lunes/Lun → formato consistente)
  const normalizedPlan = normalizePlanDays(planData);

  // Limpiar programación existente del plan (idempotente)
  await client.query(
    `DELETE FROM app.workout_schedule WHERE methodology_plan_id = $1 AND user_id = $2`,
    [methodologyPlanId, userId]
  );

  // Limpiar methodology_plan_days existentes
  await client.query(
    `DELETE FROM app.methodology_plan_days WHERE plan_id = $1`,
    [methodologyPlanId]
  );

  console.log(`🧹 [ensureWorkoutSchedule] Tablas limpiadas para plan ${methodologyPlanId}`);

  // Mapas de días en español
  const dayNames = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const dayAbbrevs = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

  // 📅 Fecha de inicio real del plan
  const planStartDate = new Date(startDate);

  let day_id = 1;
  let globalSessionOrder = 1;

  // 🔄 NUEVO ALGORITMO: Iterar por días consecutivos, no por sesiones del JSON
  for (let weekIndex = 0; weekIndex < normalizedPlan.semanas.length; weekIndex++) {
    const semana = normalizedPlan.semanas[weekIndex];
    const weekNumber = weekIndex + 1;

    if (!semana?.sesiones?.length) continue;

    // Contador de sesiones dentro de esta semana específica
    let weekSessionOrder = 1;

    // Iterar los 7 días de esta semana
    for (let dayInWeek = 0; dayInWeek < 7; dayInWeek++) {
      const dayOffset = (weekIndex * 7) + dayInWeek;

      // Calcular la fecha para este día
      const currentDate = new Date(planStartDate);
      currentDate.setDate(currentDate.getDate() + dayOffset);

      // Determinar el día de la semana de esta fecha
      const dow = currentDate.getDay();
      const dayName = dayNames[dow];
      const dayAbbrev = (dayAbbrevs[dow] === 'MiAc' ? 'Mie' : (dayAbbrevs[dow] === 'SA�b' ? 'Sab' : dayAbbrevs[dow]));

      // 🎯 BUSCAR la sesión que corresponde a este día de la semana
      const sesion = semana.sesiones.find(s => {
        const sesionDay = normalizeDayAbbrev(s.dia);
        return sesionDay === dayAbbrev;
      });

      // Si no hay sesión para este día, es día de descanso
      if (!sesion) {
        // Registrar en methodology_plan_days como día de descanso
        // 🎯 USAR ABREVIATURA para consistencia con methodology_exercise_sessions
        await client.query(
          `INSERT INTO app.methodology_plan_days (
            plan_id, day_id, week_number, day_name, date_local, is_rest
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (plan_id, day_id) DO NOTHING`,
          [methodologyPlanId, day_id, weekNumber, dayAbbrev, currentDate.toISOString().split('T')[0], true]
        );
        day_id++;
        continue;
      }

      const sessionTitle = sesion?.titulo || sesion?.title || `Sesión ${globalSessionOrder}`;

      // 📦 Extraer ejercicios: soportar estructura directa Y estructura de bloques (Halterofilia)
      let sessionExercises = [];
      if (Array.isArray(sesion.ejercicios)) {
        // Estructura directa: sesion.ejercicios[]
        sessionExercises = sesion.ejercicios;
      } else if (Array.isArray(sesion.bloques)) {
        // Estructura de bloques: sesion.bloques[].ejercicios[]
        sessionExercises = sesion.bloques.flatMap(bloque =>
          Array.isArray(bloque.ejercicios) ? bloque.ejercicios : []
        );
      }

      // Insertar en workout_schedule
      await client.query(
        `INSERT INTO app.workout_schedule (
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
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          methodologyPlanId,
          userId,
          weekNumber,
          globalSessionOrder,
          weekSessionOrder,
          currentDate.toISOString().split('T')[0],
          dayName,
          dayAbbrev,
          sessionTitle,
          JSON.stringify(sessionExercises),
          'scheduled'
        ]
      );

      // Insertar en methodology_plan_days con referencia a los ejercicios
      // 🎯 USAR ABREVIATURA para consistencia con methodology_exercise_sessions
      await client.query(
        `INSERT INTO app.methodology_plan_days (
          plan_id, day_id, week_number, day_name, date_local, is_rest, planned_exercises_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (plan_id, day_id) DO NOTHING`,
        [methodologyPlanId, day_id, weekNumber, dayAbbrev, currentDate.toISOString().split('T')[0], false, sessionExercises.length]
      );

      day_id++;
      globalSessionOrder++;
      weekSessionOrder++;
    }
  }

  const totalSessions = globalSessionOrder - 1;
  const totalDays = day_id - 1;
  const restDays = totalDays - totalSessions;

  console.log(`✅ [ensureWorkoutSchedule] Programación generada para plan ${methodologyPlanId}:`);
  console.log(`   📊 Total días: ${totalDays}`);
  console.log(`   💪 Días de entreno: ${totalSessions}`);
  console.log(`   💤 Días de descanso: ${restDays}`);
  console.log(`   📅 Fecha inicio: ${startDate.toISOString().split('T')[0]}`);
}

// Utilidad: crear una sesión específica para un día que no existe en el plan
async function createMissingDaySession(client, userId, methodologyPlanId, planDataJson, requestedDay, weekNumber = 1) {
  const normalizedPlan = normalizePlanDays(planDataJson);
  const normalizedRequestedDay = normalizeDayAbbrev(requestedDay);

  // Buscar si ya existe la sesión para este día
  const existingSession = await client.query(
    'SELECT id FROM app.methodology_exercise_sessions WHERE user_id = $1 AND methodology_plan_id = $2 AND week_number = $3 AND day_name = $4',
    [userId, methodologyPlanId, weekNumber, normalizedRequestedDay]
  );

  if (existingSession.rowCount > 0) {
    return existingSession.rows[0].id;
  }

  // Si el plan no contiene una sesión para el día solicitado, usar la primera sesión disponible
  const semanas = normalizedPlan?.semanas || [];
  const firstWeek = findWeekInPlan(semanas, weekNumber) || semanas[0];
  const sesiones = firstWeek?.sesiones || [];

  if (sesiones.length === 0) {
    throw new Error('No hay sesiones disponibles en el plan para crear una sesión de reemplazo');
  }

  // Tomar la primera sesión como template
  const templateSession = sesiones[0];

  // Obtener la metodología real del plan JSON
  const realMethodology = planDataJson?.selected_style || planDataJson?.metodologia || 'Adaptada';

  // Crear la nueva sesión en la BD
  const newSession = await client.query(
    `INSERT INTO app.methodology_exercise_sessions
     (user_id, methodology_plan_id, methodology_type, session_name, week_number, day_name, total_exercises, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     RETURNING id`,
    [
      userId,
      methodologyPlanId,
      realMethodology,
      `Sesión ${normalizedRequestedDay}`,
      weekNumber,
      normalizedRequestedDay,
      templateSession.ejercicios?.length || 0
    ]
  );

  console.log(`✅ Sesión creada para día faltante: ${normalizedRequestedDay} (usando template de ${templateSession.dia})`);
  return newSession.rows[0].id;
}

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

    // Si viene day_id, resolver week_number y day_name desde calendario del plan
    if (!req.query.session_date && day_id && (!week_number || !day_name)) {
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
        const rnd = await getRandomCalistheniaExercises(client, levelNorm, 6);
        if (rnd.length > 0) {
          ejercicios = rnd.map((r) => ({
            nombre: r.nombre,
            series: 3,
            repeticiones: 10,
            descanso_seg: 60,
            notas: r.notas || null,
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
           series_completed, status
         )
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, 'pending'
         WHERE NOT EXISTS (
           SELECT 1 FROM app.methodology_exercise_progress
            WHERE methodology_session_id = $1 AND exercise_order = $3
         )`,
        [session.id, userId, order, exerciseId, ej.nombre || `Ejercicio ${i + 1}`,
         String(ej.series || '3'), String(repsTarget || '0'), restSeconds,
         ej.intensidad || null, ej.tempo || null, ej.notas || null]
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

    await client.query(
      `UPDATE app.methodology_exercise_sessions
         SET session_status = $2,
             completed_at = NOW(),
             total_duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
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
    const sessionQuery = await pool.query(
      `SELECT * FROM app.methodology_exercise_sessions
       WHERE user_id = $1
         AND methodology_plan_id = $2
         AND week_number = $3
         AND day_name = $4
       ORDER BY COALESCE(updated_at, started_at, created_at) DESC
       LIMIT 1`,
      [userId, methodology_plan_id, week_number, normalizedDay]
    );

    // Log detallado para debugging
    console.log('🔍 Búsqueda de sesión:', {
      userId,
      methodology_plan_id,
      day_id_received: day_id,
      week_number,
      day_name: normalizedDay,
      found: sessionQuery.rowCount > 0,
      session_id: sessionQuery.rows[0]?.id
    });

    if (sessionQuery.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'No hay sesión para este día'
      });
    }

    const session = sessionQuery.rows[0];

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

    // 🎯 Obtener ejercicios completos desde workout_schedule
    // Nota: workout_schedule usa day_name completo ("Lunes") no abreviado ("Lun")
    const dayNameMap = {
      'Lun': 'Lunes',
      'Mar': 'Martes',
      'Mie': 'Miércoles',
      'Jue': 'Jueves',
      'Vie': 'Viernes',
      'Sab': 'Sábado',
      'Dom': 'Domingo'
    };
    const fullDayName = dayNameMap[normalizedDay] || normalizedDay;

    const workoutScheduleQuery = await pool.query(
      `SELECT exercises FROM app.workout_schedule
       WHERE methodology_plan_id = $1 AND week_number = $2 AND day_name = $3`,
      [methodology_plan_id, week_number, fullDayName]
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
    const exercisesQuery = await pool.query(
      `SELECT
        p.exercise_order, p.exercise_name, p.series_total, p.series_completed,
        p.repeticiones, p.descanso_seg, p.intensidad, p.tempo, p.status,
        p.time_spent_seconds, p.notas,
        f.sentiment, f.comment
       FROM app.methodology_exercise_progress p
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
          return progressData;
        } else {
          // Ejercicio sin progreso = pending
          return {
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
      completeExerciseList = exercisesQuery.rows;
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
        mep.time_spent_seconds, mep.notas,
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

// POST /api/routines/confirm-plan
// Confirma una rutina cambiando su estado de 'draft' a 'active'
router.post('/confirm-plan', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    // Nota: Operamos en auto-commit para evitar estados abortados por funciones legacy.
    // Si la función legacy falla, haremos fallback con UPDATE sin necesidad de transacciones explícitas.

    const userId = req.user?.userId || req.user?.id;
    const { methodology_plan_id } = req.body;

    if (!methodology_plan_id) {
      client.release();
      return res.status(400).json({
        success: false,
        error: 'methodology_plan_id es requerido'
      });
    }

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
      client.release();
      return res.json({ success: true, status: 'active', message: 'Plan ya confirmado (idempotente)' });
    }

    // Confirmación del plan con fallback seguro si no existe la función/tabla legacy
    let confirmed = false;
    try {
      const confirmResult = await client.query(
        'SELECT app.confirm_routine_plan($1, $2, $3) as confirmed',
        [userId, methodology_plan_id, null]
      );
      confirmed = Boolean(confirmResult.rows?.[0]?.confirmed);
    } catch (e) {
      // Si la función/tables legacy no existen (42P01: relation does not exist), usar UPDATE directo
      if (e?.code === '42P01' || String(e?.message || '').includes('routine_plans')) {
        // Revertir solo la parte fallida y continuar dentro de la transaccin
        console.warn('⚠️ confirm_routine_plan no disponible. Aplicando UPDATE sobre app.methodology_plans');
        const upd = await pool.query(
          `UPDATE app.methodology_plans
             SET status = 'active',
                 confirmed_at = COALESCE(confirmed_at, NOW()),
                 updated_at = NOW()
           WHERE id = $1 AND user_id = $2 AND status IN ('draft','active')
           RETURNING id`,
          [methodology_plan_id, userId]
        );
        confirmed = upd.rowCount > 0;
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
      // 🆕 Leer configuración de inicio si existe
      const startConfigQuery = await client.query(
        `SELECT * FROM app.plan_start_config WHERE methodology_plan_id = $1`,
        [methodology_plan_id]
      );

      const startConfig = startConfigQuery.rowCount > 0 ? startConfigQuery.rows[0] : null;

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
      const startDate = startConfig?.start_date || startDateQuery.rows[0]?.start_date || new Date();

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

// GET /api/routines/progress-data
// Obtiene datos de progreso histórico para el ProgressTab
router.get('/progress-data', authenticateToken, async (req, res) => {
  try {
    const userIdRaw = req.user?.userId || req.user?.id;
    const userId = parseInt(userIdRaw, 10);
    const { methodology_plan_id: planIdParam } = req.query;

    if (!planIdParam) {
      return res.status(400).json({
        success: false,
        error: 'methodology_plan_id es requerido'
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

    // Obtener información del plan
    const planQuery = await pool.query(
      'SELECT methodology_type, plan_data FROM app.methodology_plans WHERE id = $1 AND user_id = $2',
      [methodology_plan_id, userId]
    );

    if (planQuery.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Plan de metodología no encontrado'
      });
    }

    const plan = planQuery.rows[0];
    const planData = typeof plan.plan_data === 'string' ? JSON.parse(plan.plan_data) : plan.plan_data;

    // Obtener información del plan para calcular semana actual
    const planInfoQuery = await pool.query(
      'SELECT created_at, confirmed_at FROM app.methodology_plans WHERE id = $1 AND user_id = $2',
      [methodology_plan_id, userId]
    );
    const planInfo = planInfoQuery.rows[0];
    const planStartDate = planInfo?.confirmed_at || planInfo?.created_at;

    // Calcular semana actual basada en fecha de inicio del plan
    let currentWeek = 1;
    if (planStartDate) {
      const daysSinceStart = Math.floor((new Date() - new Date(planStartDate)) / (1000 * 60 * 60 * 24));
      currentWeek = Math.max(1, Math.floor(daysSinceStart / 7) + 1);
    }

    // Obtener resumen general de progreso
    const generalStatsQuery = await pool.query(
      `SELECT
         COUNT(DISTINCT mes.id) FILTER (WHERE mes.session_status = 'completed') as total_sessions_completed,
         COUNT(DISTINCT mes.id) as total_sessions_started,
         COUNT(DISTINCT mep.id) FILTER (WHERE mep.status = 'completed') as total_exercises_completed,
         COUNT(DISTINCT mep.id) as total_exercises_attempted,
         SUM(CASE WHEN mep.status = 'completed' THEN mep.series_completed ELSE 0 END) as total_series_completed,
         SUM(CASE WHEN mep.status = 'completed' THEN COALESCE(mep.time_spent_seconds, 0) ELSE 0 END) +
         SUM(CASE WHEN mes.session_status = 'completed' THEN COALESCE(mes.warmup_time_seconds, 0) ELSE 0 END) as total_time_seconds,
         MIN(mes.started_at) as first_session_date,
         MAX(mes.completed_at) as last_session_date
       FROM app.methodology_exercise_sessions mes
       LEFT JOIN app.methodology_exercise_progress mep ON mep.methodology_session_id = mes.id
       WHERE mes.user_id = $1 AND mes.methodology_plan_id = $2`,
      [userId, methodology_plan_id]
    );

    // Obtener progreso por semanas
    const weeklyProgressQuery = await pool.query(
      `SELECT
         mes.week_number,
         COUNT(DISTINCT mes.id) FILTER (WHERE mes.session_status = 'completed') as sessions_completed,
         COUNT(DISTINCT mes.id) as total_sessions,
         COUNT(DISTINCT mep.id) FILTER (WHERE mep.status = 'completed') as exercises_completed,
         COUNT(DISTINCT mep.id) as total_exercises,
         SUM(CASE WHEN mep.status = 'completed' THEN mep.series_completed ELSE 0 END) as series_completed,
         SUM(CASE WHEN mep.status = 'completed' THEN COALESCE(mep.time_spent_seconds, 0) ELSE 0 END) +
         SUM(DISTINCT COALESCE(mes.warmup_time_seconds, 0)) as time_spent_seconds
       FROM app.methodology_exercise_sessions mes
       LEFT JOIN app.methodology_exercise_progress mep ON mep.methodology_session_id = mes.id
       WHERE mes.user_id = $1 AND mes.methodology_plan_id = $2
       GROUP BY mes.week_number
       ORDER BY mes.week_number ASC`,
      [userId, methodology_plan_id]
    );

    // Obtener actividad reciente (solo sesiones completadas)
    const recentActivityQuery = await pool.query(
      `SELECT
         mes.id as methodology_session_id,
         mes.completed_at as session_date,
         mes.week_number,
         mes.day_name,
         mes.total_duration_seconds as session_duration_seconds,
         COUNT(mep.id) as exercises_count,
         SUM(CASE WHEN mep.status = 'completed' THEN mep.series_completed ELSE 0 END) as total_series
       FROM app.methodology_exercise_sessions mes
       LEFT JOIN app.methodology_exercise_progress mep ON mep.methodology_session_id = mes.id
       WHERE mes.user_id = $1 AND mes.methodology_plan_id = $2 AND mes.session_status = 'completed'
       GROUP BY mes.id, mes.completed_at, mes.week_number, mes.day_name, mes.total_duration_seconds
       ORDER BY mes.completed_at DESC
       LIMIT 10`,
      [userId, methodology_plan_id]
    );

    // Calcular totales del plan (desde el JSON)
    const totalWeeks = planData?.semanas?.length || 0;
    const totalSessionsInPlan = planData?.semanas?.reduce((acc, semana) =>
      acc + (semana.sesiones?.length || 0), 0) || 0;
    const totalExercisesInPlan = planData?.semanas?.reduce((acc, semana) =>
      acc + semana.sesiones?.reduce((sessAcc, sesion) =>
        sessAcc + (sesion.ejercicios?.length || 0), 0) || 0, 0) || 0;

    // Construir respuesta
    const generalStats = generalStatsQuery.rows[0];
    const weeklyProgress = weeklyProgressQuery.rows;
    const recentActivity = recentActivityQuery.rows;

    // La semana actual ya fue calculada arriba basada en la fecha de inicio

    // Construir progreso por semanas con datos reales
    const weeklyProgressData = [];
    for (let week = 1; week <= totalWeeks; week++) {
      const weekData = weeklyProgress.find(w => w.week_number === week);
      const weekInPlan = findWeekInPlan(planData?.semanas, week);
      const weekSessions = weekInPlan?.sesiones?.length || 0;
      const weekExercises = weekInPlan?.sesiones?.reduce(
        (acc, ses) => acc + (ses.ejercicios?.length || 0), 0) || 0;

      weeklyProgressData.push({
        week,
        sessions: Math.max(weekSessions, weekData?.total_sessions || 0),
        completed: weekData?.sessions_completed || 0,
        exercises: Math.max(weekExercises, weekData?.total_exercises || 0),
        exercisesCompleted: weekData?.exercises_completed || 0,
        seriesCompleted: weekData?.series_completed || 0,
        timeSpentSeconds: weekData?.time_spent_seconds || 0
      });
    }

    const responseData = {
      totalWeeks,
      currentWeek,
      totalSessions: Math.max(totalSessionsInPlan, parseInt(generalStats.total_sessions_started) || 0),
      completedSessions: parseInt(generalStats.total_sessions_completed) || 0,
      totalExercises: Math.max(totalExercisesInPlan, parseInt(generalStats.total_exercises_attempted) || 0),
      completedExercises: parseInt(generalStats.total_exercises_completed) || 0,
      totalSeriesCompleted: parseInt(generalStats.total_series_completed) || 0,
      totalTimeSpentSeconds: parseInt(generalStats.total_time_seconds) || 0,
      firstSessionDate: generalStats.first_session_date,
      lastSessionDate: generalStats.last_session_date,
      weeklyProgress: weeklyProgressData,
      recentActivity: recentActivity.map(activity => ({
        sessionId: activity.methodology_session_id,
        date: activity.session_date,
        weekNumber: activity.week_number,
        dayName: activity.day_name,
        exercisesCount: parseInt(activity.exercises_count) || 0,
        totalSeries: parseInt(activity.total_series) || 0,
        durationSeconds: parseInt(activity.session_duration_seconds) || 0,
        formattedDate: activity.session_date ? new Date(activity.session_date).toLocaleDateString('es-ES', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }) : 'Fecha no disponible'
      }))
    };

    res.json({ success: true, data: responseData });
  } catch (error) {
    console.error('Error obteniendo datos de progreso:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
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
        dia: row.dia,
        fecha: row.scheduled_date,
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
              confirmed_at, created_at, plan_start_date, 'methodology' as source, status
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
        console.log('🧩 [/active-plan] Sin todaySession; generando programación on-demand...');
        const client = await pool.connect();
        try {
          // 📅 Usar plan_start_date o confirmed_at/created_at como fallback
          const startDate = activePlan.plan_start_date || activePlan.confirmed_at || activePlan.created_at || new Date();
          console.log(`📅 Fecha de inicio del plan: ${startDate}`);
          await ensureWorkoutScheduleV3(client, userId, activePlan.methodology_plan_id, activePlan.plan_data, startDate);
        } finally {
          client.release();
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
      planSource: { label: 'IA' }, // Siempre es IA cuando viene de methodology_plans
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

// POST /api/routines/process-feedback
// Procesa el feedback de ejercicios rechazados antes de cancelar una rutina
router.post('/process-feedback', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rejections } = req.body || {};
    const userId = req.user?.userId || req.user?.id;

    if (!Array.isArray(rejections) || rejections.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un array de ejercicios rechazados'
      });
    }

    console.log('🔄 USANDO SISTEMA UNIFICADO DE FEEDBACK');
    console.log(`📊 Procesando ${rejections.length} rechazo(s) de ejercicios`);

    await client.query('BEGIN');

    // Mapeo de categorías del modal a feedback_type
    const REJECTION_CATEGORY_MAPPING = {
      'too_hard': 'too_difficult',
      'dont_like': 'dont_like',
      'injury': 'physical_limitation',
      'equipment': 'no_equipment',
      'other': 'change_focus'
    };

    const insertedFeedback = [];

    for (const raw of rejections) {
      // Normalizar datos del modal
      const exercise_name = String(raw?.exercise_name || '').trim().slice(0, 255) || 'Ejercicio';
      const rejection_category = raw?.rejection_category || 'other';
      const rejection_reason = raw?.rejection_reason ? String(raw.rejection_reason).slice(0, 1000) : null;
      const expires_in_days = Number(raw?.expires_in_days) || null;

      // Mapear categoría del modal a feedback_type del sistema unificado
      const feedback_type = REJECTION_CATEGORY_MAPPING[rejection_category] || 'dont_like';

      // Calcular fecha de expiración
      let expires_at = null;
      if (expires_in_days && expires_in_days > 0) {
        expires_at = new Date();
        expires_at.setDate(expires_at.getDate() + expires_in_days);
      }

      console.log(`📝 Guardando feedback: ${exercise_name} - ${feedback_type} (rutina)`);

      // Verificar si ya existe feedback para este ejercicio
      const existingResult = await client.query(
        `SELECT id FROM app.user_exercise_feedback
         WHERE user_id = $1 AND exercise_name = $2 AND methodology_type = 'routine'
         LIMIT 1`,
        [userId, exercise_name]
      );

      if (existingResult.rowCount > 0) {
        // Actualizar feedback existente
        await client.query(
          `UPDATE app.user_exercise_feedback
           SET feedback_type = $3,
               comment = COALESCE($4, comment),
               expires_at = $5,
               updated_at = NOW()
           WHERE id = $1`,
          [existingResult.rows[0].id, userId, feedback_type, rejection_reason, expires_at]
        );
        console.log(`✏️  Feedback actualizado para: ${exercise_name}`);
      } else {
        // Insertar nuevo feedback
        await client.query(
          `INSERT INTO app.user_exercise_feedback
           (user_id, exercise_name, methodology_type, feedback_type, comment, expires_at)
           VALUES ($1, $2, 'routine', $3, $4, $5)`,
          [userId, exercise_name, feedback_type, rejection_reason, expires_at]
        );
        console.log(`✅ Nuevo feedback guardado para: ${exercise_name}`);
      }

      insertedFeedback.push({
        exercise_name,
        feedback_type,
        expires_at
      });
    }

    await client.query('COMMIT');

    console.log(`🎉 Procesamiento completo: ${insertedFeedback.length} registros`);

    res.json({
      success: true,
      message: 'Feedback procesado correctamente',
      processed: insertedFeedback.length
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error procesando feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Error procesando feedback de ejercicios',
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
       SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
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

// GET /api/routines/historical-data
// Obtiene datos históricos completos del usuario (todas las rutinas completadas)
router.get('/historical-data', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    // Obtener estadísticas generales históricas (todas las rutinas del usuario)
    const totalStatsQuery = await pool.query(
      `SELECT
         COUNT(DISTINCT mp.id) as total_routines_completed,
         COUNT(DISTINCT mes.id) as total_sessions_ever,
         COUNT(DISTINCT mep.id) as total_exercises_ever,
         SUM(CASE WHEN mep.status = 'completed' THEN mep.series_completed ELSE 0 END) as total_series_ever,
         SUM(CASE WHEN mep.status = 'completed' THEN COALESCE(mep.time_spent_seconds, 0) ELSE 0 END) +
         SUM(CASE WHEN mes.session_status = 'completed' THEN COALESCE(mes.warmup_time_seconds, 0) ELSE 0 END) as total_time_spent_ever,
         MIN(mes.started_at) as first_workout_date,
         MAX(mes.completed_at) as last_workout_date
       FROM app.methodology_plans mp
       LEFT JOIN app.methodology_exercise_sessions mes ON mes.methodology_plan_id = mp.id
       LEFT JOIN app.methodology_exercise_progress mep ON mep.methodology_session_id = mes.id
       WHERE mp.user_id = $1 AND mp.confirmed_at IS NOT NULL`,
      [userId]
    );

    // Obtener historial de rutinas completadas
    const routineHistoryQuery = await pool.query(
      `SELECT
         mp.id as routine_id,
         mp.methodology_type,
         mp.status as routine_status,
         mp.confirmed_at as completed_at,
         COUNT(DISTINCT mes.id) as sessions,
         COUNT(DISTINCT mep.id) as exercises,
         SUM(CASE WHEN mep.status = 'completed' THEN mep.series_completed ELSE 0 END) as series,
         SUM(CASE WHEN mep.status = 'completed' THEN COALESCE(mep.time_spent_seconds, 0) ELSE 0 END) +
         SUM(CASE WHEN mes.session_status = 'completed' THEN COALESCE(mes.warmup_time_seconds, 0) ELSE 0 END) as time_spent
       FROM app.methodology_plans mp
       LEFT JOIN app.methodology_exercise_sessions mes ON mes.methodology_plan_id = mp.id
       LEFT JOIN app.methodology_exercise_progress mep ON mep.methodology_session_id = mes.id
       WHERE mp.user_id = $1 AND (mp.confirmed_at IS NOT NULL OR mp.status = 'cancelled')
       GROUP BY mp.id, mp.methodology_type, mp.confirmed_at, mp.status
       ORDER BY COALESCE(mp.confirmed_at, mp.updated_at) DESC`,
      [userId]
    );

    // Obtener estadísticas mensuales
    const monthlyStatsQuery = await pool.query(
      `SELECT
         TO_CHAR(mes.started_at, 'YYYY-MM') as month_key,
         TO_CHAR(mes.started_at, 'Month YYYY') as month_label,
         COUNT(DISTINCT mes.id) as sessions,
         COUNT(DISTINCT mep.id) as exercises,
         SUM(CASE WHEN mep.status = 'completed' THEN mep.series_completed ELSE 0 END) as series
       FROM app.methodology_exercise_sessions mes
       LEFT JOIN app.methodology_exercise_progress mep ON mep.methodology_session_id = mes.id
       JOIN app.methodology_plans mp ON mp.id = mes.methodology_plan_id
       WHERE mp.user_id = $1 AND mes.started_at IS NOT NULL
       GROUP BY TO_CHAR(mes.started_at, 'YYYY-MM'), TO_CHAR(mes.started_at, 'Month YYYY'), mes.started_at
       ORDER BY TO_CHAR(mes.started_at, 'YYYY-MM') DESC
       LIMIT 12`,
      [userId]
    );

    const totalStats = totalStatsQuery.rows[0] || {};
    const routineHistory = routineHistoryQuery.rows || [];
    const monthlyStats = monthlyStatsQuery.rows || [];

    // Formatear respuesta
    const responseData = {
      totalRoutinesCompleted: parseInt(totalStats.total_routines_completed) || 0,
      totalSessionsEver: parseInt(totalStats.total_sessions_ever) || 0,
      totalExercisesEver: parseInt(totalStats.total_exercises_ever) || 0,
      totalSeriesEver: parseInt(totalStats.total_series_ever) || 0,
      totalTimeSpentEver: parseInt(totalStats.total_time_spent_ever) || 0,
      firstWorkoutDate: totalStats.first_workout_date,
      lastWorkoutDate: totalStats.last_workout_date,
      routineHistory: routineHistory.map(routine => ({
        id: routine.routine_id,
        methodologyType: routine.methodology_type,
        status: routine.routine_status || 'completed',
        completedAt: routine.completed_at,
        sessions: parseInt(routine.sessions) || 0,
        exercises: parseInt(routine.exercises) || 0,
        series: parseInt(routine.series) || 0,
        timeSpent: parseInt(routine.time_spent) || 0
      })),
      monthlyStats: monthlyStats.map(month => ({
        month: month.month_label?.trim(),
        sessions: parseInt(month.sessions) || 0,
        exercises: parseInt(month.exercises) || 0,
        series: parseInt(month.series) || 0
      }))
    };

    console.log('✅ Datos históricos obtenidos:', {
      totalRoutines: responseData.totalRoutinesCompleted,
      totalSessions: responseData.totalSessionsEver,
      totalExercises: responseData.totalExercisesEver
    });

    res.json({ success: true, data: responseData });

  } catch (error) {
    console.error('❌ Error obteniendo datos históricos:', error);
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
        exercise_order, exercise_name, series_total, series_completed,
        status, time_spent_seconds, started_at, completed_at
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

// Función auxiliar para extraer ejercicios del plan JSON
function extractExercisesFromPlanData(planData) {
  if (!planData?.semanas) return [];

  const fallbackExercises = planData.semanas
    .flatMap(sem => sem?.sesiones || [])
    .flatMap(ses => ses?.ejercicios || [])
    .reduce((acc, ej) => {
      const nombre = ej?.nombre || ej?.name || '';
      if (!nombre) return acc;
      if (!acc.find(x => x.nombre?.toLowerCase() === nombre.toLowerCase())) {
        acc.push({
          nombre,
          series: ej.series ?? ej.series_total ?? 3,
          repeticiones: ej.repeticiones ?? ej.reps ?? null,
          duracion_seg: ej.duracion_seg ?? ej.duration_sec ?? null,
        });
      }
      return acc;
    }, []);

  return fallbackExercises;
}

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

        // Obtener nombre del día
        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const dayAbbrevs = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
        const dayOfWeek = currentDate.getDay();
        const dayName = dayNames[dayOfWeek];
        const dayAbbrev = dayAbbrevs[dayOfWeek];

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

// --- Helper agregado: ensureWorkoutScheduleV2 (preferencias + abreviaturas corregidas)
async function ensureWorkoutScheduleV2(client, userId, methodologyPlanId, planDataJson, startDate = new Date()) {
  try {
    console.log(`📅 [ensureWorkoutScheduleV2] Iniciando para plan ${methodologyPlanId}, usuario ${userId}`);

    const planData = typeof planDataJson === 'string' ? JSON.parse(planDataJson) : planDataJson;
    if (!planData || !Array.isArray(planData.semanas) || planData.semanas.length === 0) {
      console.warn(`⚠️ [ensureWorkoutScheduleV2] Plan vacío o sin semanas para plan ${methodologyPlanId}`);
      return;
    }

    const normalizedPlan = normalizePlanDays(planData);

    // Limpiar programación existente
    await client.query(`DELETE FROM app.workout_schedule WHERE methodology_plan_id = $1 AND user_id = $2`, [methodologyPlanId, userId]);
    await client.query(`DELETE FROM app.methodology_plan_days WHERE plan_id = $1`, [methodologyPlanId]);
    console.log(`🧹 [ensureWorkoutScheduleV2] Tablas limpiadas para plan ${methodologyPlanId}`);

    const dayNames = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const dayAbbrevs = ['Dom','Lun','Mar','Mie','Jue','Vie','Sab'];
    const planStartDate = new Date(startDate);

    // Preferencias
    let userPrefs = null;
    try {
      const prefsQ = await client.query(
        `SELECT usar_preferencias_ia, dias_preferidos_entrenamiento, ejercicios_por_dia_preferido FROM app.user_profiles WHERE user_id = $1`,
        [userId]
      );
      userPrefs = prefsQ.rows?.[0] || null;
    } catch (e) {
      console.warn('⚠️ [ensureWorkoutScheduleV2] No se pudieron leer preferencias de usuario:', e?.message || e);
    }

    const preferredAbbrevs = Array.isArray(userPrefs?.dias_preferidos_entrenamiento)
      ? userPrefs.dias_preferidos_entrenamiento.map(d => normalizeDayAbbrev(d)).filter(Boolean)
      : null;
    const limitPerSession = (userPrefs?.usar_preferencias_ia && Number(userPrefs?.ejercicios_por_dia_preferido))
      ? Number(userPrefs.ejercicios_por_dia_preferido)
      : null;
    if (limitPerSession) {
      console.log('dY"_ [ensureWorkoutScheduleV2] Límite ejercicios por sesión:', limitPerSession);
    }

    let day_id = 1;
    let globalSessionOrder = 1;

    for (let weekIndex = 0; weekIndex < normalizedPlan.semanas.length; weekIndex++) {
      const semana = normalizedPlan.semanas[weekIndex];
      const weekNumber = weekIndex + 1;
      if (!semana?.sesiones?.length) continue;

      let weekSessions = Array.isArray(semana.sesiones) ? [...semana.sesiones] : [];
      if (userPrefs?.usar_preferencias_ia && Array.isArray(preferredAbbrevs) && preferredAbbrevs.length > 0) {
        weekSessions = weekSessions.map((s, idx) => ({ ...s, dia: preferredAbbrevs[idx % preferredAbbrevs.length] }));
      }

      let weekSessionOrder = 1;
      for (let dayInWeek = 0; dayInWeek < 7; dayInWeek++) {
        const dayOffset = (weekIndex * 7) + dayInWeek;
        const currentDate = new Date(planStartDate);
        currentDate.setDate(currentDate.getDate() + dayOffset);

        const dow = currentDate.getDay();
        const dayName = dayNames[dow];
        const dayAbbrev = dayAbbrevs[dow];

        const sesion = weekSessions.find(s => normalizeDayAbbrev(s.dia) === dayAbbrev);
        if (!sesion) {
          await client.query(
            `INSERT INTO app.methodology_plan_days (plan_id, day_id, week_number, day_name, date_local, is_rest)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (plan_id, day_id) DO NOTHING`,
            [methodologyPlanId, day_id, weekNumber, dayAbbrev, currentDate.toISOString().split('T')[0], true]
          );
          day_id++;
          continue;
        }

        const sessionTitle = sesion?.titulo || sesion?.title || `Sesión ${globalSessionOrder}`;
        let sessionExercises = [];
        if (Array.isArray(sesion.ejercicios)) {
          sessionExercises = sesion.ejercicios;
        } else if (Array.isArray(sesion.bloques)) {
          const mainBlock = (sesion.bloques || []).find(b => {
            const name = stripDiacritics(String(b?.nombre || b?.name || b?.titulo || '').toLowerCase());
            const tipo = stripDiacritics(String(b?.tipo || '').toLowerCase());
            return tipo === 'principal' || tipo === 'main' || name.includes('principal') || name.includes('trabajo');
          });
          const bloquesFuente = mainBlock ? [mainBlock] : sesion.bloques;
          sessionExercises = bloquesFuente.flatMap(b => Array.isArray(b?.ejercicios) ? b.ejercicios : []);
        }

        if (limitPerSession && limitPerSession > 0 && Array.isArray(sessionExercises) && sessionExercises.length > limitPerSession) {
          console.log('dY"_ [ensureWorkoutScheduleV2] Recortando ejercicios', {
            before: sessionExercises.length,
            limit: limitPerSession,
            planId: methodologyPlanId,
            weekNumber,
            dayAbbrev
          });
          sessionExercises = sessionExercises.slice(0, limitPerSession);
        }

        await client.query(
          `INSERT INTO app.workout_schedule (
             methodology_plan_id, user_id, week_number, session_order, week_session_order,
             scheduled_date, day_name, day_abbrev, session_title, exercises, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            methodologyPlanId,
            userId,
            weekNumber,
            globalSessionOrder,
            weekSessionOrder,
            currentDate.toISOString().split('T')[0],
            dayName,
            dayAbbrev,
            sessionTitle,
            JSON.stringify(sessionExercises),
            'scheduled'
          ]
        );

        await client.query(
          `INSERT INTO app.methodology_plan_days (plan_id, day_id, week_number, day_name, date_local, is_rest, planned_exercises_count)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (plan_id, day_id) DO NOTHING`,
          [methodologyPlanId, day_id, weekNumber, dayAbbrev, currentDate.toISOString().split('T')[0], false, Array.isArray(sessionExercises) ? sessionExercises.length : 0]
        );

        day_id++;
        globalSessionOrder++;
        weekSessionOrder++;
      }
    }

    const totalSessions = globalSessionOrder - 1;
    const totalDays = day_id - 1;
    const restDays = totalDays - totalSessions;

    console.log(`✅ [ensureWorkoutScheduleV2] Programación generada para plan ${methodologyPlanId}:`);
    console.log(`   📊 Total días: ${totalDays}`);
    console.log(`   💪 Días de entreno: ${totalSessions}`);
    console.log(`   💤 Días de descanso: ${restDays}`);
    console.log(`   📅 Fecha inicio: ${startDate.toISOString().split('T')[0]}`);
  } catch (e) {
    console.error('Error en ensureWorkoutScheduleV2:', e?.message || e);
  }
}

