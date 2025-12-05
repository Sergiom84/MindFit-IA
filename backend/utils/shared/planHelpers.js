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

  return semanas.find(s => {
    // Intentar múltiples campos para máxima compatibilidad
    const weekValue = s.semana || s.numero || s.week || s.week_number;
    return Number(weekValue) === targetWeek;
  });
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

