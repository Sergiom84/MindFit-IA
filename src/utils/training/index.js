/**
 * @fileoverview Índice de utilidades de entrenamiento del frontend
 * 
 * Re-exporta todas las funciones de:
 * - dateHelpers.js
 * - sessionFinders.js
 * 
 * @module utils/training
 */

// Date utilities
export {
  FULL_DAY_NAMES,
  DAY_ABBREVIATIONS,
  getTodayName,
  getTodayAbbrev,
  isWeekend,
  shouldShowStartDayModal,
  computeDayId,
  computeWeekNumber,
  getDayOfWeekFromDayId,
  formatDateForDisplay
} from './dateHelpers.js';

// Session finding utilities
export {
  normalizeDay,
  findWeekInPlan,
  findTodaySession,
  findSessionByDayId,
  getSessionsForWeek,
  getCurrentWeekIndex,
  countTotalSessions,
  getPlanMethodology
} from './sessionFinders.js';

