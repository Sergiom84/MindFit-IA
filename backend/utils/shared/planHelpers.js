/**
 * @fileoverview Utilidades para manipulación de planes de entrenamiento
 * 
 * Funciones compartidas entre:
 * - routes/routines.js
 * - routes/trainingSession.js
 * - services/methodologyPlansService.js
 * 
 * @module utils/shared/planHelpers
 */

import { stripDiacritics, normalizeDayAbbrev } from './dayNormalizer.js';

/**
 * Busca una semana específica en el array de semanas del plan
 * Funciona con TODAS las metodologías (Calistenia, Heavy Duty, Hipertrofia, etc.)
 * Soporta diferentes formatos de campo: semana, numero, week, week_number
 * 
 * @param {Array} semanas - Array de semanas del plan
 * @param {number} weekNumber - Número de semana a buscar (1-indexed)
 * @returns {Object|undefined} Semana encontrada o undefined
 * @example
 * const week = findWeekInPlan(plan.semanas, 2);
 * // Busca en: s.semana, s.numero, s.week, s.week_number
 */
export function findWeekInPlan(semanas, weekNumber) {
  if (!Array.isArray(semanas) || !weekNumber) return undefined;

  const targetWeek = Number(weekNumber);
  if (isNaN(targetWeek)) return undefined;

  // ?? y no ||: una semana numerada 0 es válida (MindFeed) y con || se saltaba
  // al siguiente campo, con lo que jamás podía matchear.
  const weekValueOf = (s) => {
    const v = Number(s?.semana ?? s?.numero ?? s?.week ?? s?.week_number);
    return Number.isFinite(v) ? v : null;
  };

  // Los consumidores llaman SIEMPRE con semanas de calendario 1-based (así numeran
  // workout_schedule y methodology_exercise_sessions, vía ensureScheduleV3). Algunos
  // planes (HipertrofiaV2_MindFeed) numeran su plan_data desde 0 ("Semana 0" =
  // calibración): para ellos la semana calendario N es su semana interna N-1.
  const values = semanas.map(weekValueOf).filter(v => v !== null);
  const base = values.length > 0 ? Math.min(...values) : 1;
  const target = base === 0 ? targetWeek - 1 : targetWeek;

  return semanas.find(s => weekValueOf(s) === target);
}

/**
 * Normaliza los nombres de días en toda la estructura del plan
 * Convierte nombres completos o variantes a abreviaturas estándar (Lun, Mar, etc.)
 * 
 * @param {Object} planDataJson - Objeto del plan con estructura { semanas: [...] }
 * @returns {Object} Plan con días normalizados
 * @example
 * const normalized = normalizePlanDays(plan);
 * // 'lunes' -> 'Lun', 'miércoles' -> 'Mie'
 */
export function normalizePlanDays(planDataJson) {
  try {
    if (!planDataJson || !Array.isArray(planDataJson.semanas)) return planDataJson;
    
    return {
      ...planDataJson,
      semanas: planDataJson.semanas.map((sem) => ({
        ...sem,
        sesiones: Array.isArray(sem.sesiones)
          ? sem.sesiones.map((ses) => ({
              ...ses,
              dia: normalizeDayAbbrev(ses.dia),
            }))
          : sem.sesiones,
      })),
    };
  } catch (e) {
    console.error('No se pudo normalizar días del plan', e);
    return planDataJson;
  }
}

/**
 * Deriva el nivel de entrenamiento desde la estructura del plan JSON
 * Busca en múltiples ubicaciones posibles del nivel
 * 
 * @param {Object} planDataJson - Objeto del plan
 * @returns {'basico'|'intermedio'|'avanzado'} Nivel normalizado
 * @example
 * deriveLevelFromPlan({ selected_level: 'Avanzado' }) // 'avanzado'
 * deriveLevelFromPlan({ nivel: 'intermedio' }) // 'intermedio'
 */
export function deriveLevelFromPlan(planDataJson) {
  try {
    const candidates = [
      planDataJson?.selected_level,
      planDataJson?.nivel,
      planDataJson?.level,
      planDataJson?.perfil?.nivel,
      planDataJson?.evaluation?.level,
    ];
    
    const raw = candidates.find(Boolean) || 'basico';
    const s = stripDiacritics(String(raw).toLowerCase().trim());
    
    if (s.includes('avan')) return 'avanzado';
    if (s.includes('inter')) return 'intermedio';
    return 'basico';
  } catch {
    return 'basico';
  }
}

/**
 * Obtiene el número total de semanas en un plan
 * @param {Object} planDataJson - Objeto del plan
 * @returns {number} Número de semanas (0 si no hay semanas)
 */
export function getTotalWeeksInPlan(planDataJson) {
  if (!planDataJson?.semanas || !Array.isArray(planDataJson.semanas)) {
    return 0;
  }
  return planDataJson.semanas.length;
}

/**
 * Obtiene todas las sesiones de una semana específica
 * @param {Object} planDataJson - Objeto del plan
 * @param {number} weekNumber - Número de semana (1-indexed)
 * @returns {Array} Array de sesiones o array vacío
 */
export function getSessionsForWeek(planDataJson, weekNumber) {
  const week = findWeekInPlan(planDataJson?.semanas, weekNumber);
  return week?.sesiones || [];
}

/**
 * Denominadores de progreso por semana (sesiones/ejercicios "objetivo").
 *
 * Regla única para TODOS los endpoints de progreso: si la semana tiene filas en
 * app.workout_schedule (el calendario real que ve el usuario), el objetivo es lo
 * agendado — así una 1ª semana parcial (plan que arranca en martes/miércoles) puede
 * llegar al 100%. Si la semana aún no está en el schedule (planes antiguos sin
 * calendario, o mesociclos futuros que HipertrofiaV2 todavía no generó), el objetivo
 * es el ideal de plan_data — así una semana futura no marca 100% con 1 sola sesión.
 *
 * @param {Object} pool - Pool de pg (se inyecta para mantener este módulo sin deps de BD)
 * @param {number} userId
 * @param {number} methodologyPlanId
 * @param {Object} planDataJson - plan_data ya parseado ({ semanas: [...] })
 * @returns {Promise<{totalWeeks:number,totalSessions:number,totalExercises:number,weeks:Array}>}
 *          weeks[i] = { week, sessions, exercises, fromSchedule }
 */
export async function computeWeeklyTargets(pool, userId, methodologyPlanId, planDataJson) {
  const totalWeeks = getTotalWeeksInPlan(planDataJson);

  let scheduled = new Map();
  try {
    const q = await pool.query(
      `SELECT week_number,
              COUNT(*)::int AS sessions,
              COALESCE(SUM(CASE WHEN jsonb_typeof(exercises) = 'array'
                                THEN jsonb_array_length(exercises) ELSE 0 END), 0)::int AS exercises
         FROM app.workout_schedule
        WHERE user_id = $1 AND methodology_plan_id = $2
        GROUP BY week_number`,
      [userId, methodologyPlanId]
    );
    scheduled = new Map(q.rows.map(r => [Number(r.week_number), r]));
  } catch (e) {
    console.error('computeWeeklyTargets: fallo leyendo workout_schedule, uso plan_data', e.message);
  }

  const weeks = [];
  let totalSessions = 0;
  let totalExercises = 0;

  for (let week = 1; week <= totalWeeks; week++) {
    const ideal = findWeekInPlan(planDataJson?.semanas, week);
    const idealSessions = ideal?.sesiones?.length || 0;
    const idealExercises = ideal?.sesiones?.reduce(
      (acc, ses) => acc + (ses.ejercicios?.length || 0), 0) || 0;

    const sched = scheduled.get(week);
    const entry = {
      week,
      sessions: sched ? sched.sessions : idealSessions,
      // Algunos schedules antiguos guardan exercises vacío; en ese caso el ideal
      // de plan_data sigue siendo mejor denominador que 0.
      exercises: sched?.exercises > 0 ? sched.exercises : idealExercises,
      fromSchedule: Boolean(sched)
    };

    totalSessions += entry.sessions;
    totalExercises += entry.exercises;
    weeks.push(entry);
  }

  return { totalWeeks, totalSessions, totalExercises, weeks };
}

/**
 * Encuentra una sesión por día dentro de una semana
 * @param {Object} planDataJson - Objeto del plan
 * @param {number} weekNumber - Número de semana
 * @param {string} dayName - Nombre o abreviatura del día
 * @returns {Object|undefined} Sesión encontrada
 */
export function findSessionByDay(planDataJson, weekNumber, dayName) {
  const sessions = getSessionsForWeek(planDataJson, weekNumber);
  const normalizedDay = normalizeDayAbbrev(dayName);
  
  return sessions.find(s => normalizeDayAbbrev(s.dia) === normalizedDay);
}

