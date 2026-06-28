/**
 * Orquestador de metodologías de entrenamiento
 * Coordina la generación de planes según la metodología seleccionada
 * @module routineGeneration/methodologies/MethodologyOrchestrator
 */

import { logger } from '../logger.js';
import { METODOLOGIAS } from '../constants.js';
import * as CalisteniaService from './CalisteniaService.js';
import * as CrossFitService from './CrossFitService.js';
import * as GymRoutineService from './GymRoutineService.js';

const METHODOLOGY_DATA_KEYS = {
  [METODOLOGIAS.CALISTENIA]: ['calisteniaData'],
  [METODOLOGIAS.CROSSFIT]: ['crossfitData'],
  [METODOLOGIAS.HIPERTROFIA]: ['hipertrofiaData'],
  [METODOLOGIAS.GIMNASIO]: ['gymData', 'gimnasioData'],
  [METODOLOGIAS.FUNCIONAL]: ['funcionalData'],
  [METODOLOGIAS.CASA]: ['casaData'],
  [METODOLOGIAS.HEAVY_DUTY]: ['heavyDutyData'],
  [METODOLOGIAS.POWERLIFTING]: ['powerliftingData'],
  [METODOLOGIAS.HALTEROFILIA]: ['halterofiliaData', 'halterofíliaData']
};

function stripDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizeMethodologyId(methodology) {
  const value = stripDiacritics(methodology)
    .toLowerCase()
    .replace(/_/g, '-')
    .trim();

  if (value.includes('calistenia')) return METODOLOGIAS.CALISTENIA;
  if (value.includes('crossfit') || value.includes('cross-fit')) return METODOLOGIAS.CROSSFIT;
  if (value.includes('hipertrofia') && !value.includes('v2')) return METODOLOGIAS.HIPERTROFIA;
  if (value.includes('funcional')) return METODOLOGIAS.FUNCIONAL;
  if (value.includes('powerlifting') || value.includes('power-lifting')) return METODOLOGIAS.POWERLIFTING;
  if (value.includes('heavy-duty') || value.includes('heavy duty') || value.includes('heavyduty')) {
    return METODOLOGIAS.HEAVY_DUTY;
  }
  if (value.includes('halterofilia')) return METODOLOGIAS.HALTEROFILIA;
  if (value.includes('entrenamiento-casa') || value.includes('entrenamiento casa') || value.includes('casa')) {
    return METODOLOGIAS.CASA;
  }
  if (value.includes('gimnasio') || value.includes('gym')) return METODOLOGIAS.GIMNASIO;

  return value;
}

function getNestedPlanData(methodology, planData) {
  const keys = METHODOLOGY_DATA_KEYS[methodology] || [];
  return keys
    .map((key) => planData?.[key])
    .find((value) => value && typeof value === 'object' && !Array.isArray(value));
}

function normalizePlanData(methodology, planData = {}) {
  const nestedData = getNestedPlanData(methodology, planData);
  const merged = nestedData ? { ...planData, ...nestedData } : { ...planData };
  const selectedLevel =
    merged.selectedLevel ||
    merged.level ||
    merged.nivel ||
    merged.aiEvaluation?.recommended_level ||
    merged.aiEvaluation?.level ||
    merged.evaluation?.level;

  return {
    ...merged,
    methodology,
    ...(selectedLevel ? { selectedLevel, level: merged.level || selectedLevel } : {})
  };
}

function defaultEvaluation(methodology) {
  return {
    success: true,
    evaluation: {
      recommended_level: 'intermedio',
      confidence: 0.5,
      reasoning: `Nivel por defecto para ${methodology}; la selección manual puede ajustarlo antes de generar el plan.`,
      key_indicators: [],
      suggested_focus_areas: []
    }
  };
}

/**
 * Evaluar nivel del usuario según la metodología
 * @param {string} methodology - Tipo de metodología
 * @param {string} userId - ID del usuario
 * @returns {Promise<object>} Evaluación del nivel
 */
export async function evaluateUserLevel(methodology, userId) {
  logger.info(`Evaluando nivel de usuario para metodología: ${methodology}`);

  const normalizedMethodology = normalizeMethodologyId(methodology);

  switch (normalizedMethodology) {
    case METODOLOGIAS.CALISTENIA:
      return await CalisteniaService.evaluateCalisteniaLevel(userId);

    case METODOLOGIAS.CROSSFIT:
      return await CrossFitService.evaluateCrossFitLevel(userId);

    case METODOLOGIAS.HIPERTROFIA:
    case METODOLOGIAS.GIMNASIO:
    case METODOLOGIAS.FUNCIONAL:
    case METODOLOGIAS.CASA:
    case METODOLOGIAS.HEAVY_DUTY:
    case METODOLOGIAS.POWERLIFTING:
    case METODOLOGIAS.HALTEROFILIA:
      // Por ahora, estas metodologías usan selección manual con fallback seguro.
      logger.info(`Metodología ${methodology} no tiene evaluación automática`);
      return defaultEvaluation(normalizedMethodology);

    default:
      throw new Error(`Metodología no soportada: ${methodology}`);
  }
}

/**
 * Generar plan de entrenamiento según la metodología
 * @param {string} methodology - Tipo de metodología
 * @param {string} userId - ID del usuario
 * @param {object} planData - Datos del plan
 * @returns {Promise<object>} Plan generado
 */
export async function generateMethodologyPlan(methodology, userId, planData) {
  logger.info(`Generando plan para metodología: ${methodology}`);

  const normalizedMethodology = normalizeMethodologyId(methodology);
  const normalizedPlanData = normalizePlanData(normalizedMethodology, planData);

  switch (normalizedMethodology) {
    case METODOLOGIAS.CALISTENIA:
      return await CalisteniaService.generateCalisteniaPlan(userId, normalizedPlanData);

    case METODOLOGIAS.CROSSFIT:
      return await CrossFitService.generateCrossFitPlan(userId, normalizedPlanData);

    case METODOLOGIAS.HIPERTROFIA:
    case METODOLOGIAS.GIMNASIO:
    case METODOLOGIAS.FUNCIONAL:
    case METODOLOGIAS.CASA:
    case METODOLOGIAS.HEAVY_DUTY:
    case METODOLOGIAS.POWERLIFTING:
    case METODOLOGIAS.HALTEROFILIA:
      return await GymRoutineService.generateGymRoutine(userId, normalizedPlanData);

    default:
      throw new Error(`Metodología no soportada: ${methodology}`);
  }
}

/**
 * Obtener información de niveles disponibles para una metodología
 * @param {string} methodology - Tipo de metodología
 * @returns {object} Niveles disponibles
 */
export function getMethodologyLevels(methodology) {
  const normalizedMethodology = normalizeMethodologyId(methodology);

  switch (normalizedMethodology) {
    case METODOLOGIAS.CALISTENIA:
      return CalisteniaService.getCalisteniaLevels();

    case METODOLOGIAS.CROSSFIT:
      return CrossFitService.getCrossFitLevels();

    case METODOLOGIAS.HIPERTROFIA:
    case METODOLOGIAS.GIMNASIO:
    case METODOLOGIAS.FUNCIONAL:
    case METODOLOGIAS.CASA:
    case METODOLOGIAS.HEAVY_DUTY:
    case METODOLOGIAS.POWERLIFTING:
    case METODOLOGIAS.HALTEROFILIA:
      return GymRoutineService.getGymRoutineTypes();

    default:
      throw new Error(`Metodología no soportada: ${methodology}`);
  }
}

/**
 * Obtener lista de metodologías soportadas
 * @returns {Array<object>} Lista de metodologías
 */
export function getSupportedMethodologies() {
  return [
    {
      id: METODOLOGIAS.CALISTENIA,
      name: 'Calistenia',
      description: 'Entrenamiento con peso corporal',
      hasAutoEvaluation: true,
      levels: ['principiante', 'intermedio', 'avanzado']
    },
    {
      id: METODOLOGIAS.CROSSFIT,
      name: 'CrossFit',
      description: 'Acondicionamiento funcional de alta intensidad',
      hasAutoEvaluation: true,
      levels: ['principiante', 'intermedio', 'avanzado', 'elite']
    },
    {
      id: METODOLOGIAS.HIPERTROFIA,
      name: 'Hipertrofia',
      description: 'Entrenamiento para ganancia de masa muscular',
      hasAutoEvaluation: false,
      levels: ['principiante', 'intermedio', 'avanzado']
    },
    {
      id: METODOLOGIAS.GIMNASIO,
      name: 'Gimnasio General',
      description: 'Rutinas de gimnasio personalizadas',
      hasAutoEvaluation: false,
      levels: ['principiante', 'intermedio', 'avanzado']
    },
    {
      id: METODOLOGIAS.FUNCIONAL,
      name: 'Funcional',
      description: 'Entrenamiento funcional y movimientos naturales',
      hasAutoEvaluation: false,
      levels: ['principiante', 'intermedio', 'avanzado']
    },
    {
      id: METODOLOGIAS.CASA,
      name: 'Entrenamiento en Casa',
      description: 'Rutinas adaptadas para entrenar en casa',
      hasAutoEvaluation: false,
      levels: ['principiante', 'intermedio', 'avanzado']
    },
    {
      id: METODOLOGIAS.HEAVY_DUTY,
      name: 'Heavy Duty',
      description: 'Entrenamiento de alta intensidad y bajo volumen',
      hasAutoEvaluation: false,
      levels: ['principiante', 'intermedio', 'avanzado']
    },
    {
      id: METODOLOGIAS.POWERLIFTING,
      name: 'Powerlifting',
      description: 'Fuerza máxima en sentadilla, banca y peso muerto',
      hasAutoEvaluation: false,
      levels: ['principiante', 'intermedio', 'avanzado']
    },
    {
      id: METODOLOGIAS.HALTEROFILIA,
      name: 'Halterofilia',
      description: 'Técnica olímpica, potencia y fuerza base',
      hasAutoEvaluation: false,
      levels: ['principiante', 'intermedio', 'avanzado']
    }
  ];
}
