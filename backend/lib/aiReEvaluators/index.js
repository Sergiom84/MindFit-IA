/**
 * 📋 AI RE-EVALUATORS REGISTRY
 * Sistema centralizado para gestión de re-evaluadores por metodología
 *
 * PROPÓSITO: Permitir escalabilidad fácil de nuevas metodologías
 * PATRÓN: Registry + Strategy Pattern
 *
 * @version 1.0.0 - Sistema de Re-evaluación Progresiva
 */

import calisteniaReEvaluator from './calisteniaReEvaluator.js';
// import hipertrofiaReEvaluator from './hipertrofiaReEvaluator.js';
// import crossfitReEvaluator from './crossfitReEvaluator.js';
// ... importar más re-evaluadores según se implementen

// =============================================================================
// 📋 REGISTRY DE RE-EVALUADORES POR METODOLOGÍA
// =============================================================================

/**
 * Mapeo de metodologías a sus re-evaluadores específicos
 * Añadir nuevas metodologías aquí es escalable y simple
 */
const RE_EVALUATORS_REGISTRY = {
  'calistenia': calisteniaReEvaluator,
  // 'hipertrofia': hipertrofiaReEvaluator,
  // 'crossfit': crossfitReEvaluator,
  // 'powerlifting': powerliftingReEvaluator,
  // 'oposicion': oposicionReEvaluator,
  // 'funcional': funcionalReEvaluator,
  // 'halterofilia': halterofiliaReEvaluator,
  // 'heavy_duty': heavyDutyReEvaluator,
};

// =============================================================================
// 🔧 RE-EVALUADOR GENÉRICO (Fallback)
// =============================================================================

/**
 * Re-evaluador genérico usado cuando no existe uno específico
 * Proporciona análisis básico sin especialización de metodología
 */
const genericReEvaluator = {
  async analyze({ currentPlan, userData, reEvaluationData }) {
    console.warn(`⚠️ [RE-EVAL] No existe re-evaluador específico, usando genérico`);

    const { sentiment, exercises } = reEvaluationData;

    // Análisis básico sin IA
    let progressAssessment = 'stalled';
    let intensityChange = 'maintain';

    // Lógica simple basada en sentiment
    if (sentiment === 'excelente') {
      progressAssessment = 'excellent';
      intensityChange = '+10%';
    } else if (sentiment === 'bien') {
      progressAssessment = 'progressing';
      intensityChange = 'maintain';
    } else if (sentiment === 'dificil' || sentiment === 'muy_dificil') {
      progressAssessment = 'regressing';
      intensityChange = '-10%';
    }

    // Análisis de ejercicios (si hay datos)
    const progressions = [];
    if (Array.isArray(exercises)) {
      exercises.forEach(ex => {
        if (ex.difficulty_rating === 'facil') {
          progressions.push({
            exercise: ex.exercise_name,
            current_level: `${ex.series_achieved}x${ex.reps_achieved}`,
            suggested_progression: 'Aumentar dificultad o repeticiones',
            reasoning: 'El ejercicio se percibe como fácil'
          });
        }
      });
    }

    return {
      progress_assessment: progressAssessment,
      suggested_adjustments: {
        intensity_change: intensityChange,
        volume_change: 'maintain',
        rest_modifications: 'maintain',
        exercise_progressions: progressions
      },
      motivational_feedback: getSentimentMessage(sentiment),
      warnings: sentiment === 'muy_dificil'
        ? ['Considera reducir la intensidad para evitar sobreentrenamiento']
        : [],
      reasoning: 'Análisis genérico sin especialización de metodología. Para mejores resultados, implementa un re-evaluador específico.'
    };
  }
};

/**
 * Mensajes motivacionales por sentiment
 */
function getSentimentMessage(sentiment) {
  const messages = {
    'excelente': '¡Excelente trabajo! Tu progreso es sobresaliente. Sigue así.',
    'bien': '¡Vas por buen camino! El progreso constante es la clave del éxito.',
    'regular': 'No te preocupes, el progreso no siempre es lineal. Mantén la constancia.',
    'dificil': 'Es normal tener períodos difíciles. Considera ajustar la intensidad.',
    'muy_dificil': 'Escucha a tu cuerpo. Es importante descansar y recuperar.'
  };
  return messages[sentiment] || '¡Sigue adelante! Cada entrenamiento cuenta.';
}

// =============================================================================
// 🎯 FUNCIÓN PRINCIPAL: getReEvaluatorForMethodology
// =============================================================================

/**
 * Obtener re-evaluador específico para una metodología
 * Si no existe, retorna re-evaluador genérico
 *
 * @param {string} methodology - Nombre de la metodología
 * @returns {Object} Re-evaluador con método analyze()
 */
export function getReEvaluatorForMethodology(methodology) {
  if (!methodology) {
    console.warn('⚠️ [RE-EVAL] Metodología no especificada, usando genérico');
    return genericReEvaluator;
  }

  const normalizedMethodology = methodology.toLowerCase().trim();
  const reEvaluator = RE_EVALUATORS_REGISTRY[normalizedMethodology];

  if (reEvaluator) {
    console.log(`✅ [RE-EVAL] Re-evaluador específico encontrado: ${normalizedMethodology}`);
    return reEvaluator;
  }

  console.warn(`⚠️ [RE-EVAL] No existe re-evaluador para "${methodology}", usando genérico`);
  return genericReEvaluator;
}

// =============================================================================
// 🔍 UTILIDADES
// =============================================================================

/**
 * Verificar si existe un re-evaluador específico para una metodología
 */
export function hasSpecificReEvaluator(methodology) {
  if (!methodology) return false;
  const normalized = methodology.toLowerCase().trim();
  return normalized in RE_EVALUATORS_REGISTRY;
}

/**
 * Listar todas las metodologías con re-evaluador específico
 */
export function listAvailableReEvaluators() {
  return Object.keys(RE_EVALUATORS_REGISTRY);
}

/**
 * Registrar dinámicamente un nuevo re-evaluador
 * Útil para plugins o extensiones
 */
export function registerReEvaluator(methodology, reEvaluator) {
  if (!methodology || !reEvaluator || typeof reEvaluator.analyze !== 'function') {
    throw new Error('Re-evaluador inválido: debe tener método analyze()');
  }

  const normalized = methodology.toLowerCase().trim();
  RE_EVALUATORS_REGISTRY[normalized] = reEvaluator;
  console.log(`✅ [RE-EVAL] Re-evaluador registrado: ${normalized}`);
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  getReEvaluatorForMethodology,
  hasSpecificReEvaluator,
  listAvailableReEvaluators,
  registerReEvaluator
};
