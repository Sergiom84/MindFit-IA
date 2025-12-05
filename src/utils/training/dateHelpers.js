/**
 * @fileoverview Utilidades de fecha para entrenamiento
 * 
 * Funciones compartidas entre:
 * - TodayTrainingTab.jsx
 * - MethodologiesScreen.jsx
 * - HomeTrainingSection.jsx
 * 
 * @module utils/training/dateHelpers
 */

/**
 * Nombres completos de los días en español
 * @type {string[]}
 */
export const FULL_DAY_NAMES = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado'
];

/**
 * Abreviaturas estándar de los días
 * @type {string[]}
 */
export const DAY_ABBREVIATIONS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

/**
 * Obtiene el nombre completo del día actual en español
 * @returns {string} Nombre del día en minúsculas (ej: 'lunes', 'martes')
 */
export function getTodayName() {
  return FULL_DAY_NAMES[new Date().getDay()];
}

/**
 * Obtiene la abreviatura del día actual
 * @returns {string} Abreviatura del día (ej: 'Lun', 'Mar')
 */
export function getTodayAbbrev() {
  return DAY_ABBREVIATIONS[new Date().getDay()];
}

/**
 * Verifica si hoy es fin de semana (sábado o domingo)
 * @returns {boolean} True si es sábado o domingo
 */
export function isWeekend() {
  const dayOfWeek = new Date().getDay();
  return dayOfWeek === 0 || dayOfWeek === 6;
}

/**
 * Verifica si debería mostrarse el modal de día de inicio
 * Muestra modal si es Jueves, Viernes, Sábado o Domingo
 * @returns {boolean} True si debería mostrarse el modal
 */
export function shouldShowStartDayModal() {
  const dayOfWeek = new Date().getDay();
  return [0, 4, 5, 6].includes(dayOfWeek); // Dom, Jue, Vie, Sáb
}

/**
 * Calcula el day_id basado en la fecha de inicio del plan
 * Usa días calendario (1-indexed) con soporte de timezone
 * 
 * @param {string} startISO - Fecha de inicio del plan en formato ISO
 * @param {string} [timezone='Europe/Madrid'] - Timezone del usuario
 * @param {Date} [now=new Date()] - Fecha actual (para testing)
 * @returns {number} Número de día (mínimo 1)
 * @example
 * computeDayId('2024-01-01T00:00:00Z') // Retorna días transcurridos + 1
 */
export function computeDayId(startISO, timezone = 'Europe/Madrid', now = new Date()) {
  try {
    const getParts = (d, tz) => {
      const s = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(d);
      const [y, m, dd] = s.split('-').map(Number);
      return { y, m, d: dd };
    };
    
    const s = getParts(new Date(startISO), timezone);
    const n = getParts(now, timezone);
    
    const startUTC = Date.UTC(s.y, s.m - 1, s.d);
    const nowUTC = Date.UTC(n.y, n.m - 1, n.d);
    
    const diffDays = Math.floor((nowUTC - startUTC) / 86400000) + 1;
    return Math.max(1, diffDays);
  } catch (error) {
    console.warn('computeDayId fallback sin timezone:', error?.message || error);
    
    // Fallback sin timezone
    const start = new Date(startISO);
    const startDateOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const currentDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const diffDays = Math.floor((currentDateOnly - startDateOnly) / 86400000) + 1;
    return Math.max(1, diffDays);
  }
}

/**
 * Calcula el número de semana actual basado en el day_id
 * @param {number} dayId - ID del día actual
 * @returns {number} Número de semana (1-indexed)
 */
export function computeWeekNumber(dayId) {
  return Math.ceil(dayId / 7);
}

/**
 * Obtiene el día de la semana (0-6) desde un day_id
 * @param {number} dayId - ID del día
 * @param {number} [startDayOfWeek=1] - Día de inicio de la semana (1=Lun por defecto)
 * @returns {number} Índice del día (0=Dom, 1=Lun, etc.)
 */
export function getDayOfWeekFromDayId(dayId, startDayOfWeek = 1) {
  return ((dayId - 1 + startDayOfWeek) % 7);
}

/**
 * Formatea una fecha para mostrar en UI
 * @param {Date|string} date - Fecha a formatear
 * @param {string} [locale='es-ES'] - Locale para formateo
 * @returns {string} Fecha formateada
 */
export function formatDateForDisplay(date, locale = 'es-ES') {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
}

