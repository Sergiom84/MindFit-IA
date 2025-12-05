/**
 * @fileoverview Utilidades para buscar sesiones en planes de entrenamiento
 * 
 * Funciones compartidas entre:
 * - TodayTrainingTab.jsx
 * - CalendarTab.jsx
 * - RoutineScreen.jsx
 * 
 * @module utils/training/sessionFinders
 */

/**
 * Normaliza el nombre de un día para comparación
 * Soporta nombres completos y abreviados en español
 * 
 * @param {string} day - Nombre del día
 * @returns {string} Abreviatura normalizada en minúsculas (3 letras)
 */
export function normalizeDay(day) {
  if (!day) return '';
  
  const dayLower = day.toLowerCase();
  const dayMap = {
    'lunes': 'lun', 'lun': 'lun',
    'martes': 'mar', 'mar': 'mar',
    'miércoles': 'mie', 'miercoles': 'mie', 'mié': 'mie', 'mie': 'mie',
    'jueves': 'jue', 'jue': 'jue',
    'viernes': 'vie', 'vier': 'vie', 'vie': 'vie',
    'sábado': 'sab', 'sabado': 'sab', 'sáb': 'sab', 'sab': 'sab',
    'domingo': 'dom', 'dom': 'dom'
  };
  
  return dayMap[dayLower] || dayLower.substring(0, 3);
}

/**
 * Busca una semana específica en el array de semanas del plan
 * Soporta diferentes formatos de campo: semana, numero, week, week_number
 * 
 * @param {Array} semanas - Array de semanas del plan
 * @param {number} weekNumber - Número de semana a buscar (1-indexed)
 * @returns {Object|undefined} Semana encontrada o undefined
 */
export function findWeekInPlan(semanas, weekNumber) {
  if (!Array.isArray(semanas) || !weekNumber) return undefined;

  const targetWeek = Number(weekNumber);
  if (isNaN(targetWeek)) return undefined;

  return semanas.find(s => {
    const weekValue = s.semana || s.numero || s.week || s.week_number;
    return Number(weekValue) === targetWeek;
  });
}

/**
 * Busca la sesión de hoy en un plan de entrenamiento
 * Compatible con diferentes formatos de prompt (dia, dia_semana)
 * 
 * @param {Object} plan - Plan de entrenamiento con estructura { semanas: [...] }
 * @param {string} targetDay - Nombre del día a buscar
 * @param {number} [weekIdx=0] - Índice de la semana (0-indexed)
 * @returns {Object|null} Sesión encontrada o null
 */
export function findTodaySession(plan, targetDay, weekIdx = 0) {
  const semanas = plan?.semanas;
  if (!Array.isArray(semanas) || semanas.length === 0) return null;

  const safeWeekIdx = Math.max(0, Math.min(weekIdx, semanas.length - 1));
  const week = semanas[safeWeekIdx];
  if (!week?.sesiones) return null;

  const normalizedTarget = normalizeDay(targetDay);

  // Buscar por 'dia' o 'dia_semana' (compatibilidad con diferentes formatos)
  return week.sesiones.find((sesion) => {
    const diaField = sesion.dia || sesion.dia_semana;
    const normalizedDia = normalizeDay(diaField);
    return normalizedDia === normalizedTarget;
  }) || null;
}

/**
 * Busca una sesión por day_id en el schedule del plan
 * 
 * @param {Array} schedule - Array de sesiones programadas
 * @param {number} dayId - ID del día a buscar
 * @returns {Object|null} Sesión encontrada o null
 */
export function findSessionByDayId(schedule, dayId) {
  if (!Array.isArray(schedule) || !dayId) return null;
  
  return schedule.find(s => s.day_id === dayId) || null;
}

/**
 * Obtiene todas las sesiones de una semana específica
 * 
 * @param {Object} plan - Plan de entrenamiento
 * @param {number} weekNumber - Número de semana (1-indexed)
 * @returns {Array} Array de sesiones o array vacío
 */
export function getSessionsForWeek(plan, weekNumber) {
  const week = findWeekInPlan(plan?.semanas, weekNumber);
  return week?.sesiones || [];
}

/**
 * Encuentra el índice de semana actual basado en el day_id
 * 
 * @param {number} dayId - ID del día actual
 * @returns {number} Índice de semana (0-indexed)
 */
export function getCurrentWeekIndex(dayId) {
  if (!dayId || dayId < 1) return 0;
  return Math.floor((dayId - 1) / 7);
}

/**
 * Cuenta el total de sesiones en un plan
 * 
 * @param {Object} plan - Plan de entrenamiento
 * @returns {number} Total de sesiones
 */
export function countTotalSessions(plan) {
  if (!plan?.semanas || !Array.isArray(plan.semanas)) return 0;
  
  return plan.semanas.reduce((total, week) => {
    const sessions = week?.sesiones || [];
    return total + sessions.length;
  }, 0);
}

/**
 * Obtiene la metodología del plan
 * 
 * @param {Object} plan - Plan de entrenamiento
 * @returns {string|null} Nombre de la metodología
 */
export function getPlanMethodology(plan) {
  return plan?.metodologia || plan?.methodology || plan?.type || null;
}

