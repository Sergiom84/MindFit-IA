/**
 * Configuración de Niveles para Calistenia Manual
 * Basado en criterios científicos de progresión
 *
 * @author Claude Code - Arquitectura Modular
 * @version 2.0.0 - Refactored with constants, theme system and improved logic
 */

// Constantes de configuración
const LEVEL_ORDER = ['principiante', 'intermedio', 'avanzado'];

const TRAINING_CONSTANTS = {
  WARMUP_DURATION: {
    principiante: 10,
    intermedio: 15,
    avanzado: 20
  },
  COOLDOWN_DURATION: 10, // Igual para todos los niveles
  SKILL_WORK_PERCENT: {
    principiante: 30,
    intermedio: 50,
    avanzado: 70
  },
  STRENGTH_WORK_PERCENT: {
    principiante: 70,
    intermedio: 50,
    avanzado: 30
  },
  DELOAD_WEEKS: {
    principiante: 6,
    intermedio: 4,
    avanzado: 3
  },
  MAX_TRAINING_DAYS: {
    principiante: 3,
    intermedio: 5,
    avanzado: 6
  }
};

// Sistema de temas de colores
const LEVEL_THEMES = {
  principiante: {
    primary: 'green-500',
    background: 'green-50',
    border: 'green-200',
    text: 'green-800',
    tailwindClass: 'bg-green-100 border-green-300 text-green-800',
    icon: '🟢'
  },
  intermedio: {
    primary: 'yellow-500',
    background: 'yellow-50',
    border: 'yellow-200',
    text: 'yellow-800',
    tailwindClass: 'bg-yellow-100 border-yellow-300 text-yellow-800',
    icon: '🟡'
  },
  avanzado: {
    primary: 'red-500',
    background: 'red-50',
    border: 'red-200',
    text: 'red-800',
    tailwindClass: 'bg-red-100 border-red-300 text-red-800',
    icon: '🔴'
  }
};

// Utilidades de validación
const ValidationUtils = {
  isValidLevelId(levelId) {
    return typeof levelId === 'string' && LEVEL_ORDER.includes(levelId.toLowerCase());
  },

  sanitizeLevelId(levelId) {
    if (typeof levelId !== 'string') return null;
    try {
      // Normaliza y elimina diacríticos: mantiene compatibilidad con niveles antiguos
      const noDiacritics = levelId
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return noDiacritics.toLowerCase().trim();
    } catch {
      return levelId.toLowerCase().trim();
    }
  },

  validateLevelData(levelData) {
    if (!levelData || typeof levelData !== 'object') {
      return { isValid: false, error: 'Invalid level data provided' };
    }

    const requiredFields = ['id', 'name', 'description', 'frequency', 'duration', 'hitos', 'focus'];
    const missingFields = requiredFields.filter(field => !levelData[field]);

    if (missingFields.length > 0) {
      return {
        isValid: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      };
    }

    return { isValid: true };
  },

  logWarning(message, data = null) {
    if (import.meta.env.DEV) {
      console.warn(`[CalisteniaLevels] ${message}`, data);
    }
  },

  logError(message, error = null) {
    console.error(`[CalisteniaLevels] ${message}`, error);
  }
};

export const CALISTENIA_LEVELS = {
  'principiante': {
    id: 'principiante',
    name: 'Principiante',
    description: '0-6 meses de entrenamiento',
    frequency: '2-3 días/semana',
    restDays: 'Descanso mínimo 48h entre sesiones',
    duration: '30-45 minutos por sesión',
    hitos: [
      '3-5 dominadas estrictas o 20-30s de chin-over-bar hold',
      '12-20 flexiones estrictas; 4-6 fondos en paralelas',
      'Hollow hold 40s y Arch 40s; Hang 30s',
      'Handstand 20-30s a pared (alineación aceptable)',
      '20 sentadillas controladas; pistol asistido 5/5'
    ],
    focus: [
      'Construcción de base de fuerza funcional',
      'Desarrollo de técnica correcta',
      'Familiarización con patrones de movimiento',
      'Mejora de movilidad y flexibilidad básica'
    ],
    equipment: ['Suelo', 'Pared', 'Barra (opcional)'],
    theme: LEVEL_THEMES.principiante,
    // Backward compatibility
    color: LEVEL_THEMES.principiante.tailwindClass,
    icon: LEVEL_THEMES.principiante.icon,
    recommendedProgression: 'Enfoque en movimientos básicos hasta dominar técnica perfecta'
  },
  'intermedio': {
    id: 'intermedio',
    name: 'Intermedio',
    description: '6-24 meses de entrenamiento',
    frequency: '3-5 días/semana',
    restDays: 'Descanso activo recomendado',
    duration: '45-60 minutos por sesión',
    hitos: [
      '10-12 dominadas estrictas (prono/neutral)',
      '15-20 fondos; 30-40 flexiones estrictas',
      'L-sit 20-30s; handstand 60s a pared o 10-20s libre',
      'Muscle-up estricto (barra) 1-3 reps o 10+ ring dips sólidos',
      'Pistol 5-8/5-8 sin asistencia'
    ],
    focus: [
      'Progresión hacia habilidades avanzadas',
      'Desarrollo de fuerza unilateral',
      'Introducción a movimientos estáticos',
      'Refinamiento técnico en ejercicios complejos'
    ],
    equipment: ['Barra', 'Paralelas', 'Anillas (opcional)'],
    theme: LEVEL_THEMES.intermedio,
    // Backward compatibility
    color: LEVEL_THEMES.intermedio.tailwindClass,
    icon: LEVEL_THEMES.intermedio.icon,
    recommendedProgression: 'Combinación de progresiones específicas y trabajo de volumen'
  },
  'avanzado': {
    id: 'avanzado',
    name: 'Avanzado',
    description: '24+ meses (18+ si alta adherencia)',
    frequency: '4-6 días/semana',
    restDays: 'Periodización con fases de descarga',
    duration: '60-90 minutos por sesión',
    hitos: [
      'One-arm chin-up progresiones avanzadas',
      'Handstand push-ups y movimientos estáticos',
      'Planche, front lever, back lever progresiones',
      'Human flag y movimientos unilaterales complejos',
      'Dragon flags y V-sits controlados'
    ],
    focus: [
      'Habilidades de alta especialización técnica',
      'Desarrollo de fuerza máxima relativa',
      'Movimientos estáticos avanzados',
      'Trabajo artístico y de expresión corporal'
    ],
    equipment: ['Barra', 'Paralelas', 'Anillas', 'Barra sueca'],
    theme: LEVEL_THEMES.avanzado,
    // Backward compatibility
    color: LEVEL_THEMES.avanzado.tailwindClass,
    icon: LEVEL_THEMES.avanzado.icon,
    recommendedProgression: 'Especialización en habilidades específicas con alto volumen técnico'
  }
};

/**
 * Obtener configuración de nivel por ID
 * @param {string} levelId - ID del nivel ('principiante', 'intermedio', 'avanzado')
 * @returns {Object|null} Configuración del nivel
 */
export function getLevelConfig(levelId) {
  const sanitizedId = ValidationUtils.sanitizeLevelId(levelId);

  if (!sanitizedId) {
    ValidationUtils.logWarning('getLevelConfig called with invalid levelId', { levelId });
    return null;
  }

  return CALISTENIA_LEVELS[sanitizedId] || null;
}

/**
 * Obtener todos los niveles disponibles ordenados por progresión
 * @returns {Array} Array de configuraciones de nivel
 */
export function getAllLevels() {
  return LEVEL_ORDER.map(levelId => CALISTENIA_LEVELS[levelId]);
}

/**
 * Obtener nivel siguiente en la progresión
 * @param {string} currentLevel - Nivel actual
 * @returns {Object|null} Configuración del siguiente nivel
 */
export function getNextLevel(currentLevel) {
  const sanitizedLevel = ValidationUtils.sanitizeLevelId(currentLevel);

  if (!ValidationUtils.isValidLevelId(sanitizedLevel)) {
    ValidationUtils.logWarning('getNextLevel called with invalid level', { currentLevel });
    return null;
  }

  const currentIndex = LEVEL_ORDER.indexOf(sanitizedLevel);

  if (currentIndex === -1 || currentIndex === LEVEL_ORDER.length - 1) {
    return null;
  }

  return CALISTENIA_LEVELS[LEVEL_ORDER[currentIndex + 1]];
}

/**
 * Obtener nivel anterior en la progresión
 * @param {string} currentLevel - Nivel actual
 * @returns {Object|null} Configuración del nivel anterior
 */
export function getPreviousLevel(currentLevel) {
  const sanitizedLevel = ValidationUtils.sanitizeLevelId(currentLevel);

  if (!ValidationUtils.isValidLevelId(sanitizedLevel)) {
    ValidationUtils.logWarning('getPreviousLevel called with invalid level', { currentLevel });
    return null;
  }

  const currentIndex = LEVEL_ORDER.indexOf(sanitizedLevel);

  if (currentIndex <= 0) {
    return null;
  }

  return CALISTENIA_LEVELS[LEVEL_ORDER[currentIndex - 1]];
}

/**
 * Validar si un nivel es válido
 * @param {string} level - Nivel a validar
 * @returns {boolean} True si es válido
 */
export function isValidLevel(level) {
  return ValidationUtils.isValidLevelId(level);
}

/**
 * Obtener recomendaciones generales por nivel
 * @param {string} level - Nivel del usuario
 * @returns {Object|null} Recomendaciones específicas
 */
export function getLevelRecommendations(level) {
  const config = getLevelConfig(level);

  if (!config) {
    ValidationUtils.logWarning('getLevelRecommendations called with invalid level', { level });
    return null;
  }

  const levelId = config.id;

  return {
    warmupDuration: TRAINING_CONSTANTS.WARMUP_DURATION[levelId],
    cooldownDuration: TRAINING_CONSTANTS.COOLDOWN_DURATION,
    skillWorkPercent: TRAINING_CONSTANTS.SKILL_WORK_PERCENT[levelId],
    strengthWorkPercent: TRAINING_CONSTANTS.STRENGTH_WORK_PERCENT[levelId],
    recommendedDeloadWeeks: TRAINING_CONSTANTS.DELOAD_WEEKS[levelId],
    maxTrainingDaysPerWeek: TRAINING_CONSTANTS.MAX_TRAINING_DAYS[levelId],
    // Recomendaciones adicionales calculadas
    totalWorkoutTime: TRAINING_CONSTANTS.WARMUP_DURATION[levelId] + TRAINING_CONSTANTS.COOLDOWN_DURATION,
    skillWorkMinutes: Math.round((TRAINING_CONSTANTS.SKILL_WORK_PERCENT[levelId] / 100) * 45),
    strengthWorkMinutes: Math.round((TRAINING_CONSTANTS.STRENGTH_WORK_PERCENT[levelId] / 100) * 45)
  };
}

/**
 * Obtener información de tema/colores para un nivel
 * @param {string} level - Nivel del usuario
 * @returns {Object|null} Información de tema
 */
export function getLevelTheme(level) {
  const config = getLevelConfig(level);

  if (!config) {
    ValidationUtils.logWarning('getLevelTheme called with invalid level', { level });
    return null;
  }

  return config.theme;
}

/**
 * Obtener orden/índice de un nivel en la progresión
 * @param {string} level - Nivel del usuario
 * @returns {number} Índice del nivel (0-2) o -1 si es inválido
 */
export function getLevelIndex(level) {
  const sanitizedLevel = ValidationUtils.sanitizeLevelId(level);

  if (!ValidationUtils.isValidLevelId(sanitizedLevel)) {
    return -1;
  }

  return LEVEL_ORDER.indexOf(sanitizedLevel);
}

/**
 * Obtener estadísticas de progresión entre niveles
 * @returns {Object} Información de progresión completa
 */
export function getProgressionStats() {
  return {
    totalLevels: LEVEL_ORDER.length,
    levelOrder: [...LEVEL_ORDER],
    progressionPath: LEVEL_ORDER.map(levelId => ({
      id: levelId,
      name: CALISTENIA_LEVELS[levelId].name,
      description: CALISTENIA_LEVELS[levelId].description,
      theme: CALISTENIA_LEVELS[levelId].theme
    })),
    trainingConstants: { ...TRAINING_CONSTANTS }
  };
}

/**
 * Comparar dos niveles en la progresión
 * @param {string} levelA - Primer nivel
 * @param {string} levelB - Segundo nivel
 * @returns {number} -1 si levelA es anterior, 0 si son iguales, 1 si levelA es posterior
 */
export function compareLevels(levelA, levelB) {
  const indexA = getLevelIndex(levelA);
  const indexB = getLevelIndex(levelB);

  if (indexA === -1 || indexB === -1) {
    ValidationUtils.logWarning('compareLevels called with invalid levels', { levelA, levelB });
    return 0;
  }

  if (indexA < indexB) return -1;
  if (indexA > indexB) return 1;
  return 0;
}

export default CALISTENIA_LEVELS;