/**
 * Helpers compartidos de las rutas de rutinas (extraidos de routes/routines.js).
 */

import {
  normalizeDayAbbrev
} from '../../utils/ensureScheduleV3.js';
import {
  findWeekInPlan,
  normalizePlanDays
} from '../../utils/shared/planHelpers.js';

async function ensureMethodologySessions() {
  console.log(`📋 [ensureMethodologySessions] DESHABILITADA (FASE 3) - sesiones se crean bajo demanda`);
  // Las sesiones en methodology_exercise_sessions se crean cuando el usuario
  // inicia un entrenamiento (endpoint /sessions/start)
  return;
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

export {
  ensureMethodologySessions,
  createMissingDaySession,
  extractExercisesFromPlanData
};
