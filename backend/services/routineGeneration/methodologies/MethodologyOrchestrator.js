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
import * as OposicionService from './OposicionService.js';
// PR2 (§7.4): la identidad de dominio vive en el registro canónico. El orquestador
// delega en él la normalización y el listado, manteniendo sus exports públicos.
import {
  normalizeMethodologyId as registryNormalizeMethodologyId,
  getSupportedMethodologies as registryGetSupportedMethodologies
} from './methodologyRegistry.js';

const METHODOLOGY_DATA_KEYS = {
  [METODOLOGIAS.CALISTENIA]: ['calisteniaData'],
  [METODOLOGIAS.CROSSFIT]: ['crossfitData'],
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
  // §7.4: delega en el registro canónico. Para valores NO reconocidos se preserva el
  // comportamiento histórico (devolver el valor normalizado tal cual; el orquestador
  // nunca lanzaba). El rechazo explícito de IDs desconocidos vive en el contrato strict.
  const canonical = registryNormalizeMethodologyId(methodology);
  if (canonical) return canonical;
  return stripDiacritics(methodology)
    .toLowerCase()
    .replace(/_/g, '-')
    .trim();
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
export async function evaluateUserLevel(methodology, userId, evaluationData = {}) {
  logger.info(`Evaluando nivel de usuario para metodología: ${methodology}`);

  const normalizedMethodology = normalizeMethodologyId(methodology);

  // Oposiciones (bomberos, guardia-civil, policia-nacional, policia-local).
  if (OposicionService.isOposicion(normalizedMethodology)) {
    return await OposicionService.evaluateOposicionLevel(normalizedMethodology, userId);
  }

  switch (normalizedMethodology) {
    case METODOLOGIAS.CALISTENIA:
      return await CalisteniaService.evaluateCalisteniaLevel(userId);

    case METODOLOGIAS.CROSSFIT:
      return await CrossFitService.evaluateCrossFitLevel(userId, evaluationData);

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

  // Oposiciones (bomberos, guardia-civil, policia-nacional, policia-local).
  if (OposicionService.isOposicion(normalizedMethodology)) {
    return await OposicionService.generateOposicionPlan(normalizedMethodology, userId, normalizedPlanData);
  }

  switch (normalizedMethodology) {
    case METODOLOGIAS.CALISTENIA:
      return await CalisteniaService.generateCalisteniaPlan(userId, normalizedPlanData);

    case METODOLOGIAS.CROSSFIT:
      return await CrossFitService.generateCrossFitPlan(userId, normalizedPlanData);

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

  if (OposicionService.isOposicion(normalizedMethodology)) {
    return OposicionService.getOposicionLevels();
  }

  switch (normalizedMethodology) {
    case METODOLOGIAS.CALISTENIA:
      return CalisteniaService.getCalisteniaLevels();

    case METODOLOGIAS.CROSSFIT:
      return CrossFitService.getCrossFitLevels();

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
export function getSupportedMethodologies(opts) {
  // §7.4.2: delega en el registro. Por defecto solo seleccionables → `gimnasio` (legacy)
  // deja de aparecer en el listado, manteniendo el resto de metodologías y el shape.
  return registryGetSupportedMethodologies(opts);
}
