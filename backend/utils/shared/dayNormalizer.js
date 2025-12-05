/**
 * @fileoverview Utilidades para normalización de nombres de días
 * 
 * Funciones compartidas entre:
 * - routes/routines.js
 * - routes/trainingSession.js
 * - routes/homeTraining.js
 * 
 * @module utils/shared/dayNormalizer
 */

/**
 * Elimina diacríticos (acentos) de una cadena
 * @param {string} str - Cadena a normalizar
 * @returns {string} Cadena sin diacríticos
 * @example
 * stripDiacritics('miércoles') // 'miercoles'
 * stripDiacritics('sábado') // 'sabado'
 */
export function stripDiacritics(str = '') {
  try {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    return str;
  }
}

/**
 * Normaliza el nombre de un día a su abreviatura estándar de 3 letras
 * Soporta nombres completos y abreviados en español
 * 
 * @param {string} dayName - Nombre del día (ej: 'lunes', 'Lun', 'miércoles')
 * @returns {string} Abreviatura estándar (ej: 'Lun', 'Mar', 'Mie')
 * @example
 * normalizeDayAbbrev('lunes') // 'Lun'
 * normalizeDayAbbrev('miércoles') // 'Mie'
 * normalizeDayAbbrev('Vie') // 'Vie'
 */
export function normalizeDayAbbrev(dayName) {
  if (!dayName) return dayName;
  
  const raw = stripDiacritics(String(dayName).trim());
  const lower = raw.toLowerCase().replace(/\.$/, '');
  
  const map = {
    'lunes': 'Lun', 'lun': 'Lun',
    'martes': 'Mar', 'mar': 'Mar',
    'miercoles': 'Mie', 'mie': 'Mie', 'miércoles': 'Mie',
    'jueves': 'Jue', 'jue': 'Jue',
    'viernes': 'Vie', 'vie': 'Vie',
    'sabado': 'Sab', 'sab': 'Sab', 'sábado': 'Sab',
    'domingo': 'Dom', 'dom': 'Dom',
  };
  
  return map[lower] || dayName;
}

/**
 * Mapa de índice de día de la semana a abreviatura
 * @type {Object.<number, string>}
 */
export const DAY_INDEX_TO_ABBREV = {
  0: 'Dom',
  1: 'Lun',
  2: 'Mar',
  3: 'Mie',
  4: 'Jue',
  5: 'Vie',
  6: 'Sab'
};

/**
 * Mapa de abreviatura a índice de día de la semana
 * @type {Object.<string, number>}
 */
export const ABBREV_TO_DAY_INDEX = {
  'Dom': 0,
  'Lun': 1,
  'Mar': 2,
  'Mie': 3,
  'Jue': 4,
  'Vie': 5,
  'Sab': 6
};

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
 * Obtiene el nombre completo del día actual
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
  return DAY_INDEX_TO_ABBREV[new Date().getDay()];
}

/**
 * Verifica si hoy es fin de semana (sábado o domingo)
 * @returns {boolean} True si es sábado o domingo
 */
export function isWeekend() {
  const day = new Date().getDay();
  return day === 0 || day === 6;
}

