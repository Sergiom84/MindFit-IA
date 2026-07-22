/**
 * Reglas de Progresión y Autorregulación para Hipertrofia V2
 * Sistema basado en RIR (Reps In Reserve)
 */

// ZONAS DE RIR
export const RIR_ZONES = {
  TOO_EASY: { min: 4, max: 10, label: 'Demasiado Fácil', color: 'blue' },
  OPTIMAL: { min: 2, max: 3, label: 'Zona Óptima', color: 'green' },
  TOO_HARD: { min: 0, max: 1, label: 'Demasiado Duro', color: 'red' }
};

// REGLAS DE AJUSTE BASADAS EN RIR
export const ADJUSTMENT_RULES = {
  DECREASE: {
    condition: (avgRIR) => avgRIR <= 1,
    action: 'decrease',
    amount: 2.5, // kg
    label: 'Bajar Peso',
    reason: 'RIR muy bajo - Intensidad excesiva',
    color: 'orange'
  },
  MAINTAIN: {
    condition: (avgRIR) => avgRIR >= 2 && avgRIR <= 3,
    action: 'maintain',
    amount: 0,
    label: 'Mantener Peso',
    reason: 'RIR óptimo - Intensidad perfecta',
    color: 'green'
  },
  INCREASE: {
    condition: (avgRIR) => avgRIR >= 4,
    action: 'increase',
    amount: 2.5, // kg
    label: 'Subir Peso',
    reason: 'RIR muy alto - Aumentar carga',
    color: 'blue'
  }
};

/**
 * Calcula el 1RM estimado usando la fórmula de Epley modificada
 * @param {number} weight - Peso utilizado
 * @param {number} reps - Repeticiones completadas
 * @param {number} rir - RIR reportado
 * @returns {number} 1RM estimado
 */
export function calculateEstimated1RM(weight, reps, rir) {
  if (!weight || !reps) return 0;
  // Fórmula: PR = peso × (1 + (reps + RIR) / 30)
  const estimated = weight * (1 + (reps + rir) / 30);
  return Math.round(estimated * 100) / 100; // 2 decimales
}

/**
 * Calcula el peso objetivo al 80% del PR
 * @param {number} pr - Personal Record (1RM)
 * @returns {number} Peso objetivo redondeado a 2.5kg
 */
export function calculateTargetWeight80(pr) {
  if (!pr) return 0;
  const target = pr * 0.8;
  // Redondear a múltiplo de 2.5 kg
  return Math.round(target / 2.5) * 2.5;
}

/**
 * Calcula el RPE (Rate of Perceived Exertion) desde RIR
 * @param {number} rir - RIR reportado (0-4)
 * @returns {number} RPE (6-10)
 */
export function calculateRPE(rir) {
  return 10 - rir;
}

/**
 * Calcula el volumen de carga (kg × reps)
 * @param {number} weight - Peso utilizado
 * @param {number} reps - Repeticiones completadas
 * @returns {number} Volumen de carga
 */
export function calculateVolumeLoad(weight, reps) {
  return weight * reps;
}

/**
 * Determina si una serie fue efectiva (RIR 2-3)
 * @param {number} rir - RIR reportado
 * @returns {boolean} True si RIR está en zona óptima
 */
export function isEffectiveSet(rir) {
  return rir >= 2 && rir <= 3;
}

/**
 * Determina el ajuste recomendado basado en RIR promedio
 * @param {number} avgRIR - RIR promedio de las series
 * @returns {object} Objeto con tipo de ajuste y detalles
 */
export function determineAdjustment(avgRIR) {
  if (ADJUSTMENT_RULES.DECREASE.condition(avgRIR)) {
    return ADJUSTMENT_RULES.DECREASE;
  } else if (ADJUSTMENT_RULES.INCREASE.condition(avgRIR)) {
    return ADJUSTMENT_RULES.INCREASE;
  } else {
    return ADJUSTMENT_RULES.MAINTAIN;
  }
}

/**
 * Calcula estadísticas de una sesión
 * @param {Array} seriesData - Array de series con weight, reps, rir
 * @returns {object} Estadísticas de la sesión
 */
export function calculateSessionStats(seriesData) {
  if (!seriesData || seriesData.length === 0) {
    return {
      totalSets: 0,
      totalVolume: 0,
      avgRIR: 0,
      avgRPE: 0,
      bestEstimated1RM: 0,
      effectiveSetsPercentage: 0,
      adjustment: null
    };
  }

  const totalSets = seriesData.length;
  const totalVolume = seriesData.reduce((sum, set) =>
    sum + calculateVolumeLoad(set.weight, set.reps), 0
  );

  const avgRIR = seriesData.reduce((sum, set) => sum + set.rir, 0) / totalSets;
  const avgRPE = 10 - avgRIR;

  const estimated1RMs = seriesData.map(set =>
    calculateEstimated1RM(set.weight, set.reps, set.rir)
  );
  const bestEstimated1RM = Math.max(...estimated1RMs);

  const effectiveSets = seriesData.filter(set => isEffectiveSet(set.rir)).length;
  const effectiveSetsPercentage = (effectiveSets / totalSets) * 100;

  const adjustment = determineAdjustment(avgRIR);

  return {
    totalSets,
    totalVolume: Math.round(totalVolume),
    avgRIR: Math.round(avgRIR * 10) / 10,
    avgRPE: Math.round(avgRPE * 10) / 10,
    bestEstimated1RM: Math.round(bestEstimated1RM * 100) / 100,
    effectiveSetsPercentage: Math.round(effectiveSetsPercentage),
    adjustment
  };
}

/**
 * Configuración de niveles de entrenamiento
 */
export const TRAINING_LEVELS = {
  PRINCIPIANTE: {
    key: 'principiante',
    label: 'Principiante',
    frequency: 3,
    setsPerExercise: 3,
    repsRange: '8-12',
    rirTarget: '2-3',
    restSeconds: 90,
    totalWeeks: 4,
    deloadWeek: null, // Sin deload para principiantes
    description: 'Full Body 3x/semana - Aprendizaje de técnica'
  },
  INTERMEDIO: {
    key: 'intermedio',
    label: 'Intermedio',
    frequency: 4,
    setsPerExercise: 4,
    repsRange: '6-10',
    rirTarget: '1-3',
    restSeconds: 120,
    totalWeeks: 6,
    deloadWeek: 4, // Deload en semana 4
    description: 'Upper/Lower 4x/semana - Mayor volumen'
  },
  AVANZADO: {
    key: 'avanzado',
    label: 'Avanzado',
    frequency: 6,
    setsPerExercise: 5,
    repsRange: '5-8',
    rirTarget: '0-2',
    restSeconds: 180,
    totalWeeks: 8,
    deloadWeek: 4, // Deload en semana 4 y 8
    description: 'Push/Pull/Legs 6x/semana - Alto volumen'
  }
};

/**
 * Obtiene la configuración para un nivel específico
 */
export function getLevelConfig(level) {
  const normalizedLevel = level?.toLowerCase() || 'principiante';

  return TRAINING_LEVELS[normalizedLevel.toUpperCase()] ||
         TRAINING_LEVELS.PRINCIPIANTE;
}

/**
 * Valida los datos de una serie
 */
export function validateSetData(weight, reps, rir) {
  const errors = [];

  if (!weight || weight <= 0) {
    errors.push('El peso debe ser mayor a 0');
  }
  if (!reps || reps <= 0) {
    errors.push('Las repeticiones deben ser mayores a 0');
  }
  if (rir === null || rir === undefined || rir < 0 || rir > 4) {
    errors.push('El RIR debe estar entre 0 y 4');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export default {
  RIR_ZONES,
  ADJUSTMENT_RULES,
  TRAINING_LEVELS,
  calculateEstimated1RM,
  calculateTargetWeight80,
  calculateRPE,
  calculateVolumeLoad,
  isEffectiveSet,
  determineAdjustment,
  calculateSessionStats,
  getLevelConfig,
  validateSetData
};
