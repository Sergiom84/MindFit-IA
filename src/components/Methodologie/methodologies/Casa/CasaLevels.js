/**
 * Configuración de Niveles para Entrenamiento en Casa
 * Basado en maximizar resultados con equipamiento mínimo disponible
 *
 * @author Claude Code - Arquitectura Modular
 * @version 1.0.0 - Implementación inicial Casa
 */

// Constantes de configuración para entrenamiento en casa
const LEVEL_ORDER = ['principiante', 'intermedio', 'avanzado'];

const TRAINING_CONSTANTS = {
  WARMUP_DURATION: {
    principiante: 8,  // Calentamiento más corto para casa
    intermedio: 10,
    avanzado: 12
  },
  COOLDOWN_DURATION: 10,  // Igual para todos
  CARDIO_PERCENT: {
    principiante: 30,  // Mayor % de cardio para principiantes
    intermedio: 40,
    avanzado: 35
  },
  STRENGTH_PERCENT: {
    principiante: 40,  // Base de fuerza sólida
    intermedio: 35,
    avanzado: 40
  },
  FUNCTIONAL_PERCENT: {
    principiante: 30,  // Movimientos funcionales
    intermedio: 25,
    avanzado: 25
  },
  REST_BETWEEN_EXERCISES: {
    principiante: 60,  // Más descanso para principiantes
    intermedio: 45,
    avanzado: 30
  },
  MAX_TRAINING_DAYS: {
    principiante: 4,   // Frecuencia moderada
    intermedio: 5,
    avanzado: 6
  },
  SESSION_DURATION_MIN: {
    principiante: 25,
    intermedio: 35,
    avanzado: 45
  }
};

// Sistema de temas de colores
const LEVEL_THEMES = {
  principiante: {
    primary: 'blue-500',
    background: 'blue-50',
    border: 'blue-200',
    text: 'blue-800',
    tailwindClass: 'bg-blue-100 border-blue-300 text-blue-800',
    icon: '🏠'
  },
  intermedio: {
    primary: 'orange-500',
    background: 'orange-50',
    border: 'orange-200',
    text: 'orange-800',
    tailwindClass: 'bg-orange-100 border-orange-300 text-orange-800',
    icon: '🏡'
  },
  avanzado: {
    primary: 'purple-500',
    background: 'purple-50',
    border: 'purple-200',
    text: 'purple-800',
    tailwindClass: 'bg-purple-100 border-purple-300 text-purple-800',
    icon: '🏰'
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
      const normalized = levelId
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
      return LEVEL_ORDER.includes(normalized) ? normalized : null;
    } catch (error) {
      this.logError('Error sanitizing level ID', error);
      return null;
    }
  },

  validateLevelData(level) {
    if (!level || typeof level !== 'object') {
      return {
        isValid: false,
        error: 'Level data must be an object'
      };
    }

    const requiredFields = ['id', 'name', 'hitos', 'frequency', 'duration'];
    const missingFields = requiredFields.filter(field => !level[field]);

    if (missingFields.length > 0) {
      return {
        isValid: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      };
    }

    if (!Array.isArray(level.hitos) || level.hitos.length === 0) {
      return {
        isValid: false,
        error: 'Hitos must be a non-empty array'
      };
    }

    return { isValid: true };
  },

  logWarning(message, data = null) {
    if (import.meta.env.DEV) {
      console.warn(`[CasaLevels] ${message}`, data);
    }
  },

  logError(message, error = null) {
    console.error(`[CasaLevels] ${message}`, error);
  }
};

export const CASA_LEVELS = {
  'principiante': {
    id: 'principiante',
    name: 'Principiante',
    description: '0-3 meses de entrenamiento en casa',
    frequency: '3-4 días/semana',
    restDays: 'Al menos 1 día de descanso completo entre sesiones',
    duration: '25-35 minutos por sesión',
    intensity: '50-65% esfuerzo percibido',
    hitos: [
      '10-15 flexiones inclinadas en silla con técnica correcta',
      '20-25 sentadillas asistidas controladas',
      'Plancha sobre rodillas 30-40 segundos mantenida',
      '15-20 segundos de marcha en el sitio continua',
      'Puente de glúteo 12-15 reps con contracción en la cima',
      'Completar 2-3 circuitos de 4 ejercicios sin parar',
      'Estiramiento completo post-entreno de 5-8 minutos'
    ],
    focus: [
      'Establecer rutina consistente sin equipamiento',
      'Dominar técnica correcta en movimientos básicos',
      'Construir base de resistencia cardiovascular',
      'Desarrollar conciencia corporal y control'
    ],
    equipment: ['Peso corporal', 'Silla', 'Toalla', 'Pared', 'Esterilla (opcional)'],
    theme: LEVEL_THEMES.principiante,
    color: LEVEL_THEMES.principiante.tailwindClass,
    icon: LEVEL_THEMES.principiante.icon,
    recommendedProgression: 'Enfoque en consistencia y técnica. Incrementa repeticiones antes que intensidad.',
    commonMistakes: [
      'Entrenar demasiado al principio (sobreentrenamiento)',
      'Omitir el calentamiento por falta de tiempo',
      'Compararse con entrenamientos de gimnasio',
      'No adaptar el espacio del hogar adecuadamente'
    ],
    tips: [
      'Crea un espacio dedicado para entrenar, aunque sea pequeño',
      'Establece un horario fijo para crear hábito',
      'Usa objetos domésticos como equipamiento creativo',
      'Graba tus entrenamientos para revisar tu técnica'
    ]
  },
  'intermedio': {
    id: 'intermedio',
    name: 'Intermedio',
    description: '3-12 meses de entrenamiento en casa',
    frequency: '4-5 días/semana',
    restDays: 'Descanso activo recomendado (estiramientos, caminata)',
    duration: '35-45 minutos por sesión',
    intensity: '65-80% esfuerzo percibido',
    hitos: [
      '15-20 flexiones completas en el suelo con control',
      '10-12 sentadillas búlgaras por pierna sin asistencia',
      'Plancha completa 45-60 segundos con forma perfecta',
      '30-40 segundos de mountain climbers a ritmo moderado',
      'Burpees modificados 8-10 reps sin parar',
      'Fondos en silla 12-15 reps con rango completo',
      'Completar sesión de 40 min con bandas elásticas o mancuernas'
    ],
    focus: [
      'Introducir resistencia externa (bandas, mancuernas ligeras)',
      'Aumentar intensidad con movimientos dinámicos',
      'Desarrollar resistencia muscular localizada',
      'Incorporar entrenamiento HIIT básico'
    ],
    equipment: ['Banda elástica', 'Mancuernas ajustables', 'Esterilla', 'Silla robusta', 'Toalla'],
    theme: LEVEL_THEMES.intermedio,
    color: LEVEL_THEMES.intermedio.tailwindClass,
    icon: LEVEL_THEMES.intermedio.icon,
    recommendedProgression: 'Combina volumen con intensidad. Introduce variaciones y equipamiento progresivamente.',
    commonMistakes: [
      'Saltar directamente a ejercicios avanzados sin preparación',
      'No variar los entrenamientos (aburrimiento)',
      'Descuidar grupos musculares menos visibles (espalda, glúteos)',
      'No invertir en equipamiento básico de calidad'
    ],
    tips: [
      'Invierte en bandas de resistencia de calidad (múltiples niveles)',
      'Alterna días de fuerza con días de cardio/HIIT',
      'Prueba entrenamientos online pero adáptalos a tu nivel',
      'Mantén un diario de progreso con fotos y métricas'
    ]
  },
  'avanzado': {
    id: 'avanzado',
    name: 'Avanzado',
    description: '12+ meses con alta adherencia y progresión',
    frequency: '5-6 días/semana',
    restDays: 'Periodización con semanas de descarga cada 4-6 semanas',
    duration: '45-60 minutos por sesión',
    intensity: '80-95% esfuerzo percibido',
    hitos: [
      '5-8 pistol squats por pierna con control completo',
      '10-15 flexiones diamante o variantes explosivas',
      '3-5 dominadas en barra portátil (si disponible)',
      'Dragon flag 4-6 repeticiones o L-sit 20-30s',
      'Burpees completos con salto 15-20 reps sin parar',
      'Box jumps sobre silla robusta 8-10 reps explosivas',
      'Turkish get-up con kettlebell 3-5 por lado',
      'Sesiones de 50+ min con circuitos avanzados y recuperación mínima'
    ],
    focus: [
      'Dominar movimientos unilaterales complejos',
      'Desarrollar potencia explosiva con ejercicios pliométricos',
      'Incorporar equipamiento avanzado (TRX, kettlebells, barra)',
      'Entrenamiento HIIT de alta intensidad y variedad'
    ],
    equipment: ['TRX/sistema de suspensión', 'Kettlebells', 'Barra dominadas portátil', 'Mancuernas pesadas', 'Silla robusta/banco'],
    theme: LEVEL_THEMES.avanzado,
    color: LEVEL_THEMES.avanzado.tailwindClass,
    icon: LEVEL_THEMES.avanzado.icon,
    recommendedProgression: 'Especialización en movimientos complejos. Periodización estructurada con fases de fuerza, potencia e hipertrofia.',
    commonMistakes: [
      'Entrenar con intensidad máxima todos los días (burnout)',
      'Descuidar la movilidad y el trabajo correctivo',
      'No periodizar el entrenamiento (mesetas de progreso)',
      'Ignorar señales de sobreentrenamiento o lesiones'
    ],
    tips: [
      'Implementa periodización: semanas pesadas y ligeras',
      'Dedica 10-15 min diarios a movilidad y estiramientos',
      'Considera contratar un coach online para programación',
      'Graba tus PRs y celebra los logros alcanzados',
      'Varía los estímulos: fuerza máxima, potencia, resistencia'
    ]
  }
};

/**
 * Obtiene la configuración de un nivel específico
 * @param {string} levelId - ID del nivel
 * @returns {Object|null} Configuración del nivel o null si no existe
 */
export function getLevelConfig(levelId) {
  const sanitized = ValidationUtils.sanitizeLevelId(levelId);

  if (!sanitized) {
    ValidationUtils.logWarning(`Invalid level ID: ${levelId}`);
    return null;
  }

  const level = CASA_LEVELS[sanitized];

  if (!level) {
    ValidationUtils.logWarning(`Level not found: ${sanitized}`);
    return null;
  }

  const validation = ValidationUtils.validateLevelData(level);
  if (!validation.isValid) {
    ValidationUtils.logError(`Invalid level data for ${sanitized}`, validation.error);
    return null;
  }

  return level;
}

/**
 * Obtiene todos los niveles disponibles en orden
 * @returns {Array} Array de objetos de nivel
 */
export function getAllLevels() {
  return LEVEL_ORDER.map(id => CASA_LEVELS[id]).filter(Boolean);
}

/**
 * Obtiene el siguiente nivel en la progresión
 * @param {string} currentLevelId - ID del nivel actual
 * @returns {Object|null} Siguiente nivel o null si ya está en el máximo
 */
export function getNextLevel(currentLevelId) {
  const sanitized = ValidationUtils.sanitizeLevelId(currentLevelId);

  if (!sanitized) {
    return null;
  }

  const currentIndex = LEVEL_ORDER.indexOf(sanitized);

  if (currentIndex === -1 || currentIndex === LEVEL_ORDER.length - 1) {
    return null;
  }

  return CASA_LEVELS[LEVEL_ORDER[currentIndex + 1]];
}

/**
 * Verifica si un usuario ha alcanzado los hitos para avanzar de nivel
 * @param {string} levelId - ID del nivel actual
 * @param {Array} achievedGoals - Array de hitos alcanzados
 * @returns {Object} Estado de progreso
 */
export function checkLevelProgression(levelId, achievedGoals = []) {
  const level = getLevelConfig(levelId);

  if (!level) {
    return {
      canProgress: false,
      error: 'Invalid level'
    };
  }

  const totalGoals = level.hitos.length;
  const achieved = achievedGoals.length;
  const percentage = (achieved / totalGoals) * 100;

  // Requerir 75% de hitos alcanzados para avanzar
  const canProgress = percentage >= 75;

  return {
    canProgress,
    percentage: Math.round(percentage),
    achieved,
    total: totalGoals,
    remaining: totalGoals - achieved,
    nextLevel: canProgress ? getNextLevel(levelId) : null
  };
}

/**
 * Obtiene las constantes de entrenamiento para un nivel
 * @param {string} levelId - ID del nivel
 * @returns {Object} Constantes de entrenamiento
 */
export function getTrainingConstants(levelId) {
  const sanitized = ValidationUtils.sanitizeLevelId(levelId) || 'principiante';

  return {
    warmupDuration: TRAINING_CONSTANTS.WARMUP_DURATION[sanitized],
    cooldownDuration: TRAINING_CONSTANTS.COOLDOWN_DURATION,
    cardioPercent: TRAINING_CONSTANTS.CARDIO_PERCENT[sanitized],
    strengthPercent: TRAINING_CONSTANTS.STRENGTH_PERCENT[sanitized],
    functionalPercent: TRAINING_CONSTANTS.FUNCTIONAL_PERCENT[sanitized],
    restBetweenExercises: TRAINING_CONSTANTS.REST_BETWEEN_EXERCISES[sanitized],
    maxTrainingDays: TRAINING_CONSTANTS.MAX_TRAINING_DAYS[sanitized],
    sessionDurationMin: TRAINING_CONSTANTS.SESSION_DURATION_MIN[sanitized]
  };
}

/**
 * Obtiene recomendaciones de equipamiento para un nivel
 * @param {string} levelId - ID del nivel
 * @returns {Object} Recomendaciones de equipamiento
 */
export function getEquipmentRecommendations(levelId) {
  const level = getLevelConfig(levelId);

  if (!level) {
    return {
      essential: ['Peso corporal', 'Espacio de 2x2m'],
      recommended: [],
      optional: []
    };
  }

  const recommendations = {
    principiante: {
      essential: ['Peso corporal', 'Silla estable', 'Pared', 'Toalla'],
      recommended: ['Esterilla de yoga', 'Botella de agua como peso'],
      optional: ['Bandas elásticas ligeras']
    },
    intermedio: {
      essential: ['Bandas elásticas (3 resistencias)', 'Esterilla', 'Mancuernas ajustables (5-15kg)'],
      recommended: ['Silla robusta o banco', 'Barra de dominadas portátil'],
      optional: ['TRX o sistema de suspensión', 'Kettlebell (8-12kg)']
    },
    avanzado: {
      essential: ['TRX', 'Kettlebells (12-24kg)', 'Barra dominadas', 'Mancuernas pesadas (15-30kg)'],
      recommended: ['Anillas de gimnasia', 'Paralelas portátiles', 'Chaleco lastrado'],
      optional: ['Remo concepto', 'Bandas de resistencia pesadas']
    }
  };

  return recommendations[level.id] || recommendations.principiante;
}

export default CASA_LEVELS;
