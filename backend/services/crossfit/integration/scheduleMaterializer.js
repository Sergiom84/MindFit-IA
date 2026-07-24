import { validateCrossfitPlan } from '../contracts/schemas.js';
import { buildPlanDayMetadata } from '../../trainingLoad/sessionLoadBuilder.js';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
const DAY_ABBREVS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
const DAY_MS = 86400000;

function parseIsoDate(value) {
  const raw = String(value ?? '');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T12:00:00.000Z`)
    : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Fecha de inicio CrossFit inválida');
  return date;
}

function localDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Fecha de inicio CrossFit inválida');
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function presentationByLogicalSession(planData) {
  return new Map((planData.semanas ?? []).flatMap((week) => week.sesiones ?? []).map((session) => [
    session.metadata?.persisted_session_metadata?.crossfit_v2?.logical_session_id ?? session.id,
    session
  ]));
}

function materializedPresentation(session, canonicalSession, actualDate, dbDayId) {
  const persisted = structuredClone(session.metadata?.persisted_session_metadata ?? {});
  if (persisted.crossfit_v2_session) persisted.crossfit_v2_session.date = actualDate;
  persisted.crossfit_v2 = {
    ...(persisted.crossfit_v2 ?? {}),
    materialized_date: actualDate,
    db_day_id: dbDayId
  };
  return {
    ...session,
    fecha: actualDate,
    session_load: canonicalSession.training_load,
    metadata: {
      ...(session.metadata ?? {}),
      session_load: canonicalSession.training_load,
      persisted_session_metadata: persisted
    }
  };
}

function contractError(errors) {
  const error = new Error(`Plan CrossFit v2 inválido antes de materializar: ${errors.join('; ')}`);
  error.code = 'CROSSFIT_MATERIALIZATION_CONTRACT_INVALID';
  error.reasonCode = 'TRACE_MISSING';
  error.status = 422;
  return error;
}

export async function materializeCrossfitSchedule({
  client,
  userId,
  methodologyPlanId,
  planData,
  startDate
} = {}) {
  if (!client?.query || !userId || !methodologyPlanId) {
    throw new TypeError('materializeCrossfitSchedule requiere client, userId y methodologyPlanId');
  }
  const canonical = planData?.crossfit_v2;
  const contract = validateCrossfitPlan(canonical);
  if (!contract.valid) throw contractError(contract.errors);

  const canonicalSessions = canonical.weeks.flatMap((week) => week.sessions);
  const canonicalStart = parseIsoDate(canonicalSessions[0].date);
  const actualStartKey = localDateKey(startDate ?? canonicalSessions[0].date);
  const actualStart = parseIsoDate(actualStartKey);
  const presentations = presentationByLogicalSession(planData);
  const sessionsByOffset = new Map();
  for (const session of canonicalSessions) {
    const offset = Math.round((parseIsoDate(session.date) - canonicalStart) / DAY_MS);
    if (offset < 0 || offset >= canonical.block.week_count * 7 || sessionsByOffset.has(offset)) {
      throw contractError([`offset de sesión no único o fuera del bloque: ${session.session_id}`]);
    }
    const presentation = presentations.get(session.session_id);
    if (!presentation) throw contractError([`presentación ausente: ${session.session_id}`]);
    sessionsByOffset.set(offset, { canonical: session, presentation });
  }

  let ownsTransaction = false;
  let hasSavepoint = false;
  try {
    try {
      await client.query('SAVEPOINT crossfit_v2_schedule');
      hasSavepoint = true;
    } catch {
      await client.query('BEGIN');
      ownsTransaction = true;
    }

    await client.query(
      'DELETE FROM app.workout_schedule WHERE methodology_plan_id = $1 AND user_id = $2',
      [methodologyPlanId, userId]
    );
    await client.query(
      'DELETE FROM app.methodology_plan_days WHERE plan_id = $1',
      [methodologyPlanId]
    );

    let sessionOrder = 1;
    const totalDays = canonical.block.week_count * 7;
    for (let offset = 0; offset < totalDays; offset += 1) {
      const date = addDays(actualStart, offset);
      const dateKey = isoDate(date);
      const weekNumber = Math.floor(offset / 7) + 1;
      const dbDayId = offset + 1;
      const dow = date.getUTCDay();
      const scheduled = sessionsByOffset.get(offset) ?? null;
      if (!scheduled) {
        await client.query(
          `INSERT INTO app.methodology_plan_days
             (plan_id, day_id, week_number, day_name, date_local, is_rest)
           VALUES ($1, $2, $3, $4, $5, TRUE)
           ON CONFLICT (plan_id, day_id) DO UPDATE SET
             week_number = EXCLUDED.week_number,
             day_name = EXCLUDED.day_name,
             date_local = EXCLUDED.date_local,
             is_rest = TRUE,
             planned_exercises_count = NULL,
             metadata = NULL`,
          [methodologyPlanId, dbDayId, weekNumber, DAY_ABBREVS[dow], dateKey]
        );
        continue;
      }

      const materialized = materializedPresentation(
        scheduled.presentation,
        scheduled.canonical,
        dateKey,
        dbDayId
      );
      const exercises = Array.isArray(materialized.ejercicios) ? materialized.ejercicios : [];
      if (exercises.length === 0) throw contractError([`WOD sin movimientos: ${scheduled.canonical.session_id}`]);
      const metadata = buildPlanDayMetadata(materialized);
      if (!metadata?.session_load || !metadata?.session_metadata?.crossfit_v2_session) {
        throw contractError([`metadata incompleta: ${scheduled.canonical.session_id}`]);
      }

      await client.query(
        `INSERT INTO app.workout_schedule
           (methodology_plan_id, user_id, day_id, week_number, session_order,
            week_session_order, scheduled_date, day_name, day_abbrev,
            session_title, exercises, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,'scheduled')
         ON CONFLICT (methodology_plan_id, user_id, scheduled_date) DO UPDATE SET
           day_id = EXCLUDED.day_id,
           week_number = EXCLUDED.week_number,
           session_order = EXCLUDED.session_order,
           week_session_order = EXCLUDED.week_session_order,
           day_name = EXCLUDED.day_name,
           day_abbrev = EXCLUDED.day_abbrev,
           session_title = EXCLUDED.session_title,
           exercises = EXCLUDED.exercises,
           status = 'scheduled'`,
        [
          methodologyPlanId,
          userId,
          dbDayId,
          weekNumber,
          sessionOrder,
          canonical.weeks[weekNumber - 1].sessions.indexOf(scheduled.canonical) + 1,
          dateKey,
          DAY_NAMES[dow],
          DAY_ABBREVS[dow],
          materialized.titulo || materialized.nombre || `WOD ${sessionOrder}`,
          JSON.stringify(exercises)
        ]
      );
      await client.query(
        `INSERT INTO app.methodology_plan_days
           (plan_id, day_id, week_number, day_name, date_local, is_rest,
            planned_exercises_count, metadata)
         VALUES ($1,$2,$3,$4,$5,FALSE,$6,$7::jsonb)
         ON CONFLICT (plan_id, day_id) DO UPDATE SET
           week_number = EXCLUDED.week_number,
           day_name = EXCLUDED.day_name,
           date_local = EXCLUDED.date_local,
           is_rest = FALSE,
           planned_exercises_count = EXCLUDED.planned_exercises_count,
           metadata = EXCLUDED.metadata`,
        [methodologyPlanId, dbDayId, weekNumber, DAY_ABBREVS[dow], dateKey, exercises.length, JSON.stringify(metadata)]
      );
      sessionOrder += 1;
    }

    if (hasSavepoint) await client.query('RELEASE SAVEPOINT crossfit_v2_schedule');
    if (ownsTransaction) await client.query('COMMIT');
    return {
      adapter: 'crossfit-v2',
      start_date: actualStartKey,
      total_days: totalDays,
      total_sessions: sessionOrder - 1,
      schema_version: canonical.schema_version,
      ruleset_version: canonical.ruleset_version,
      catalog_version: canonical.catalog_version
    };
  } catch (error) {
    if (hasSavepoint) await client.query('ROLLBACK TO SAVEPOINT crossfit_v2_schedule');
    if (ownsTransaction) await client.query('ROLLBACK');
    throw error;
  }
}
