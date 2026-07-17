/**
 * Exportaciones centralizadas de servicios HipertrofiaV2
 */

// Constantes
export * from './constants.js';

// Logger
export { logger } from './logger.js';

// Servicios
export { selectExercises, selectExercisesByTypeForSession, mapExercisesWithTrainingParams } from './exerciseSelector.js';
export { buildTrainingCalendar, getDefaultDayMapping, calculateFirstTrainingDay } from './calendarService.js';
export { loadSessionsConfig, parseMuscleGroups, generateSessionExercises } from './sessionService.js';
export { generateD1D5Plan, buildD1D5Plan, persistD1D5Plan } from './planGenerationService.js';
export { generateFullBodyWorkout, generateSingleDayWorkout } from './extraWorkoutService.js';

// Controladores
export {
  cycleControllers,
  deloadControllers,
  priorityControllers,
  overlapControllers,
  progressionControllers
} from './sqlControllers.js';

export {
  fatigueControllers,
  warmupControllers,
  reevaluationControllers,
  sessionControllers
} from './additionalControllers.js';
