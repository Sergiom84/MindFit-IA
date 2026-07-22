/**
 * Exportaciones centralizadas de servicios Routine Generation
 * @module routineGeneration
 */

// Constantes
export * from './constants.js';

// Logger
export { logger } from './logger.js';

// Validadores
export {
  normalizeUserProfile,
  normalizeCasaPlan,
  validateRoutineRequest
} from './validators.js';

// Servicios principales
export { cleanUserDrafts } from './draftCleaner.js';
export { applySessionDistribution } from './sessionDistributor.js';

// Servicios de IA
export {
  parseAIResponse,
  validatePlanStructure
} from './ai/aiResponseParser.js';

// Repositories
export {
  getUserFullProfile,
  getUserRecentExercises
} from './database/userRepository.js';

export {
  createMethodologyPlan,
  getActivePlan,
  updatePlanStatus
} from './database/planRepository.js';

// Servicios de Metodologías
export * as CalisteniaService from './methodologies/CalisteniaService.js';
export * as CrossFitService from './methodologies/CrossFitService.js';
export * as GymRoutineService from './methodologies/GymRoutineService.js';

// Orquestador de Metodologías
export {
  evaluateUserLevel,
  generateMethodologyPlan,
  getMethodologyLevels,
  getSupportedMethodologies
} from './methodologies/MethodologyOrchestrator.js';
