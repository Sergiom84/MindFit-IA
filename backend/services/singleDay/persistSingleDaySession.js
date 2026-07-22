/**
 * Persistencia genérica de una sesión de "día único" (single-day / weekend extra).
 *
 * Extraído de hipertrofiaV2/extraWorkoutService.js para poder reutilizarlo entre
 * metodologías (HipertrofiaV2, Calistenia, …). Crea el plan temporal, la sesión
 * de ejercicios y el tracking por ejercicio, de modo que el reproductor
 * (RoutineSessionModal) y el guardado de progreso funcionen igual para todas.
 *
 * Los `exercises` deben venir ya mapeados al formato de reproducción:
 *   { orden, exercise_id, nombre, series (número), reps_objetivo,
 *     series_reps_objetivo, descanso_seg, ...resto opcional }
 */

import { DAY_NAMES, MONTH_NAMES } from '../hipertrofiaV2/constants.js';

/**
 * @param {object} dbClient - Cliente de base de datos (dentro de una transacción)
 * @param {object} params
 * @param {number} params.userId
 * @param {string} params.nivel - Nivel legible ('Principiante' | 'Intermedio' | 'Avanzado')
 * @param {string} params.nivelNormalized - Nivel normalizado para methodology_plans ('basico'…)
 * @param {string} [params.methodologyType='hipertrofia'] - Tipo de metodología persistido
 * @param {Array}  params.exercises - Ejercicios ya ordenados y mapeados
 * @param {string} [params.selectionMode='full_body']
 * @param {string|null} [params.focusGroup=null]
 * @param {string} params.sessionLabel
 * @param {string} params.planLabel
 * @param {boolean} [params.isWeekendExtra=true]
 * @param {object} [params.extraSessionMetadata=null] - Metadatos extra fusionados en session_metadata (p.ej. { wod } en CrossFit)
 * @param {object|null} [params.planData=null] - Snapshot opcional del plan single-day.
 * @param {number|null} [params.dayId=null] - Enlace canónico opcional del día.
 * @param {object|null} [params.planDayMetadata=null] - Metadata para methodology_plan_days.
 * @param {Date}   [params.currentDate=new Date()]
 * @returns {Promise<{sessionId:number, planId:number}>}
 */
export async function persistSingleDaySession(dbClient, {
  userId,
  nivel,
  nivelNormalized,
  methodologyType = 'hipertrofia',
  exercises,
  selectionMode = 'full_body',
  focusGroup = null,
  sessionLabel,
  planLabel,
  isWeekendExtra = true,
  extraSessionMetadata = null,
  planData = null,
  dayId = null,
  planDayMetadata = null,
  versionType = 'weekend-extra',
  currentDate = new Date(),
  startedAt = currentDate
}) {
  // Dedupe: si ya hay una sesión single-day sin terminar para este usuario, fecha y
  // metodología, reutilizarla en lugar de crear plan+sesión nuevos. (Cada re-clic en
  // "aceptar entrenamiento de hoy" creaba un plan 'completed' y una sesión duplicados.)
  const existing = await dbClient.query(`
    SELECT s.id AS session_id, s.methodology_plan_id AS plan_id
    FROM app.methodology_exercise_sessions s
    WHERE s.user_id = $1
      AND s.methodology_type = $2
      AND s.session_type = 'weekend-extra'
      AND s.session_date::date = $3::date
      AND s.session_status IN ('pending', 'in_progress')
    ORDER BY s.id DESC
    LIMIT 1
  `, [userId, methodologyType, currentDate]);

  if (existing.rows.length > 0) {
    return {
      sessionId: existing.rows[0].session_id,
      planId: existing.rows[0].plan_id,
      reused: true
    };
  }

  // Crear plan temporal
  const planResult = await dbClient.query(`
    INSERT INTO app.methodology_plans (
      user_id,
      methodology_type,
      nivel,
      plan_name,
      plan_start_date,
      status,
      total_days,
      generation_mode,
      version_type,
      plan_data
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
    RETURNING id
  `, [
    userId,
    methodologyType,
    nivelNormalized,
    planLabel,
    currentDate,
    'completed',
    1,
    'manual',
    versionType,
    planData ? JSON.stringify(planData) : null
  ]);

  const planId = planResult.rows[0].id;

  // Crear sesión
  const sessionResult = await dbClient.query(`
    INSERT INTO app.methodology_exercise_sessions (
      user_id,
      methodology_plan_id,
      day_id,
      methodology_type,
      methodology_level,
      session_name,
      day_name,
      session_date,
      session_type,
      total_exercises,
      session_status,
      started_at,
      day_of_month,
      month_name,
      month_number,
      year_number,
      exercises_data,
      session_metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    RETURNING id
  `, [
    userId,
    planId,
    dayId,
    methodologyType,
    nivel,
    sessionLabel,
    DAY_NAMES[currentDate.getDay()],
    currentDate,
    'weekend-extra',
    exercises.length,
    'pending',
    startedAt,
    currentDate.getDate(),
    MONTH_NAMES[currentDate.getMonth()],
    currentDate.getMonth() + 1,
    currentDate.getFullYear(),
    JSON.stringify(exercises),
    JSON.stringify({
      nivel,
      generated_at: currentDate,
      type: 'single-day-workout',
      methodology: methodologyType,
      weekend_extra: isWeekendExtra,
      selection_mode: selectionMode,
      focus_group: focusGroup,
      ...(extraSessionMetadata || {})
    })
  ]);

  const sessionId = sessionResult.rows[0].id;

  if (dayId != null && planDayMetadata) {
    await dbClient.query(
      `INSERT INTO app.methodology_plan_days
         (plan_id, day_id, week_number, day_name, date_local, is_rest,
          planned_exercises_count, metadata)
       VALUES ($1, $2, 1, $3, $4, FALSE, $5, $6::jsonb)
       ON CONFLICT (plan_id, day_id) DO UPDATE SET
         day_name = EXCLUDED.day_name,
         date_local = EXCLUDED.date_local,
         is_rest = FALSE,
         planned_exercises_count = EXCLUDED.planned_exercises_count,
         metadata = EXCLUDED.metadata`,
      [
        planId,
        dayId,
        DAY_NAMES[currentDate.getDay()],
        currentDate,
        exercises.length,
        JSON.stringify(planDayMetadata)
      ]
    );
  }

  // Crear tracking para ejercicios
  for (const exercise of exercises) {
    await dbClient.query(`
      INSERT INTO app.exercise_session_tracking (
        methodology_session_id,
        user_id,
        exercise_name,
        exercise_order,
        exercise_data,
        status,
        planned_sets,
        planned_reps,
        planned_rest_seconds,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      sessionId,
      userId,
      exercise.nombre,
      exercise.orden,
      JSON.stringify(exercise),
      'pending',
      exercise.series,
      exercise.series_reps_objetivo || exercise.reps_objetivo || '8-12',
      exercise.descanso_seg || 90,
      currentDate
    ]);
  }

  return { sessionId, planId };
}
