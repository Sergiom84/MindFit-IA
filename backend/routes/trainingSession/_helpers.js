/**
 * Helpers compartidos de las rutas de training-session (extraidos del monolito).
 */

import {
  normalizeDayAbbrev
} from '../../utils/shared/dayNormalizer.js';
import {
  findWeekInPlan,
  normalizePlanDays
} from '../../utils/shared/planHelpers.js';

async function ensureMethodologySessions(_client, _userId, _methodologyPlanId, _planDataJson) {
  console.log(`📋 [ensureMethodologySessions] DESHABILITADA (FASE 3) - sesiones se crean bajo demanda`);
  // Las sesiones en methodology_exercise_sessions se crean cuando el usuario
  // inicia un entrenamiento (endpoint /sessions/start)
  return;
}


/**
 * Crear sesión para día faltante usando template
 */
async function createMissingDaySession(client, userId, methodologyPlanId, planDataJson, requestedDay, weekNumber = 1) {
  const normalizedPlan = normalizePlanDays(planDataJson);
  const normalizedRequestedDay = normalizeDayAbbrev(requestedDay);

  const existingSession = await client.query(
    'SELECT id FROM app.methodology_exercise_sessions WHERE user_id = $1 AND methodology_plan_id = $2 AND week_number = $3 AND day_name = $4',
    [userId, methodologyPlanId, weekNumber, normalizedRequestedDay]
  );

  if (existingSession.rowCount > 0) {
    return existingSession.rows[0].id;
  }

  const semanas = normalizedPlan?.semanas || [];
  const firstWeek = findWeekInPlan(semanas, weekNumber) || semanas[0];
  const sesiones = firstWeek?.sesiones || [];

  if (sesiones.length === 0) {
    throw new Error('No hay sesiones disponibles en el plan para crear una sesión de reemplazo');
  }

  const templateSession = sesiones[0];
  const realMethodology = planDataJson?.selected_style || planDataJson?.metodologia || 'Adaptada';

  const newSession = await client.query(
    `INSERT INTO app.methodology_exercise_sessions
     (user_id, methodology_plan_id, methodology_type, session_name, week_number, day_name, total_exercises, session_date, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamp, NOW()), NOW(), NOW())
     RETURNING id`,
    [
      userId,
      methodologyPlanId,
      realMethodology,
      `Sesión ${normalizedRequestedDay}`,
      weekNumber,
      normalizedRequestedDay,
      templateSession.ejercicios?.length || 0,
      planDataJson?.planStartDate ? new Date(planDataJson.planStartDate) : null
    ]
  );

  console.log(`✅ Sesión creada para día faltante: ${normalizedRequestedDay}`);
  return newSession.rows[0].id;
}

export {
  ensureMethodologySessions,
  createMissingDaySession
};
