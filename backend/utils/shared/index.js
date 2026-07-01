/**
 * @fileoverview Índice de utilidades compartidas del backend
 * 
 * Re-exporta todas las funciones de:
 * - dayNormalizer.js
 * - planHelpers.js
 * 
 * @module utils/shared
 */

// Day normalization utilities
export {
  stripDiacritics,
  normalizeDayAbbrev,
  normalizeDayFullName,
  getDayNameByIndex,
  getDayAbbrevByIndex,
  DAY_INDEX_TO_ABBREV,
  ABBREV_TO_DAY_INDEX,
  FULL_DAY_NAMES,
  FULL_DAY_NAMES_TITLE,
  getTodayName,
  getTodayAbbrev,
  isWeekend
} from './dayNormalizer.js';

// Plan manipulation utilities
export {
  findWeekInPlan,
  normalizePlanDays,
  deriveLevelFromPlan,
  getTotalWeeksInPlan,
  getSessionsForWeek,
  findSessionByDay
} from './planHelpers.js';
