/**
 * Configuración de Niveles para CrossFit
 * Basado en los principios de GPP (General Physical Preparedness)
 * y las 10 habilidades físicas generales
 *
 * @author Claude Code - Arquitectura Modular Profesional
 * @version 1.0.0
 */

// Constantes de configuración
const LEVEL_ORDER = ['principiante', 'intermedio', 'avanzado', 'elite'];

// Alias de CrossFit para los niveles
const CROSSFIT_ALIASES = {
  'scaled': 'principiante',
  'rx': 'intermedio',
  'rx+': 'avanzado',
  'rxplus': 'avanzado'
};

const TRAINING_CONSTANTS = {
  WARMUP_DURATION: {
    principiante: 15,
    intermedio: 20,
    avanzado: 25,
    elite: 30
  },
  COOLDOWN_DURATION: 10,
  INTENSITY_RANGE: {
    principiante: '60-75% max capacity',
    intermedio: '70-85% max capacity',
    avanzado: '80-90% max capacity',
    elite: '85-95% max capacity'
  },
  WEEKLY_FREQUENCY: {
    principiante: 3,
    intermedio: 4,
    avanzado: 5,
    elite: 6
  },
  REST_BETWEEN_ROUNDS: {
    principiante: '60-90s',
    intermedio: '30-60s',
    avanzado: '15-45s',
    elite: '10-30s'
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
    icon: '🤸'
  },
  intermedio: {
    primary: 'green-500',
    background: 'green-50',
    border: 'green-200',
    text: 'green-800',
    tailwindClass: 'bg-green-100 border-green-300 text-green-800',
    icon: '💪'
  },
  avanzado: {
    primary: 'orange-600',
    background: 'orange-50',
    border: 'orange-300',
    text: 'orange-900',
    tailwindClass: 'bg-orange-100 border-orange-400 text-orange-900',
    icon: '🔥'
  },
  elite: {
    primary: 'red-600',
    background: 'red-50',
    border: 'red-300',
    text: 'red-900',
    tailwindClass: 'bg-red-100 border-red-400 text-red-900',
    icon: '🏆'
  }
};

// Utilidades de validación
const ValidationUtils = {
  isValidLevelId(levelId) {
    const normalized = this.normalizeLevelId(levelId);
    return LEVEL_ORDER.includes(normalized);
  },

  normalizeLevelId(levelId) {
    if (typeof levelId !== 'string') return null;
    const sanitized = levelId.toLowerCase().trim();

    // Manejar aliases de CrossFit
    return CROSSFIT_ALIASES[sanitized] || sanitized;
  },

  sanitizeLevelId(levelId) {
    return this.normalizeLevelId(levelId);
  },

  logWarning(message, data = null) {
    if (import.meta.env.DEV) {
      console.warn(`[CrossFitLevels] ${message}`, data);
    }
  },

  logError(message, error = null) {
    console.error(`[CrossFitLevels] ${message}`, error);
  }
};

export const CROSSFIT_LEVELS = {
  'principiante': {
    id: 'principiante',
    name: 'Principiante',
    alias: 'Scaled',
    description: '0-12 meses de experiencia en CrossFit',
    frequency: '3 días/semana',
    restDays: 'Descanso completo entre sesiones, mínimo 48h',
    duration: '30-45 minutos por sesión',

    hitos: [
      'Dominar movimientos básicos de los 3 dominios (G/W/M)',
      'Pull-Ups con banda asistida (5-10 reps)',
      'Air Squats con buena forma (20 reps consecutivas)',
      'Push-Ups correctas (10-15 reps)',
      'Deadlift 1x peso corporal con técnica correcta',
      'Completar un WOD Scaled sin parar'
    ],

    focus: [
      'Técnica perfecta en movimientos fundamentales',
      'Desarrollo de resistencia cardiovascular base',
      'Movilidad y flexibilidad',
      'Adaptación metabólica a alta intensidad',
      'Aprender scaling options para cada movimiento'
    ],

    equipment: ['Pull-up bar', 'Kettlebells', 'Dumbbells', 'Jump rope', 'Box', 'Rower/Bike (opcional)'],

    technical: {
      wodTypes: ['AMRAP (12-15 min)', 'For Time (bajo volumen)', 'EMOM (simple)'],
      intensityRange: '60-75% capacidad máxima',
      restBetweenRounds: '60-90 segundos',
      workoutDuration: '30-45 minutos',
      scalingRequired: 'Sí - Band pull-ups, box push-ups, reduced weight'
    },

    benchmarks: {
      'Fran': 'Scaled - Sub-12 min (thrusters 45/35 lbs, ring rows)',
      'Cindy': '10-15 rounds (scaled: box push-ups, ring rows)',
      'Helen': 'Sub-15 min (scaled: kb swings en lugar de kbs)'
    },

    theme: LEVEL_THEMES.principiante,
    color: LEVEL_THEMES.principiante.tailwindClass,
    icon: LEVEL_THEMES.principiante.icon,
    recommendedProgression: 'Enfoque en técnica y consistencia, 3-4 días/semana'
  },

  'intermedio': {
    id: 'intermedio',
    name: 'Intermedio',
    alias: 'RX',
    description: '1-3 años de CrossFit consistente',
    frequency: '4-5 días/semana',
    restDays: 'Active recovery, 1-2 días de descanso completo',
    duration: '45-60 minutos por sesión',

    hitos: [
      'Pull-Ups kipping (10+ reps)',
      'Double-unders (50+ consecutivas)',
      'Thrusters RX (95/65 lbs) en WODs',
      'Deadlift 1.5x peso corporal',
      'Front Squat 1.25x peso corporal',
      'Completar benchmarks RX (Fran, Helen, Cindy)'
    ],

    focus: [
      'Desarrollo de potencia y velocidad',
      'Gimnásticos intermedios (chest-to-bar, toes-to-bar)',
      'Olympic lifts técnica refinada',
      'Aumento de capacidad metabólica',
      'Estrategia de pacing en WODs'
    ],

    equipment: ['Barbell', 'Bumper plates', 'Pull-up bar', 'Rowing machine', 'Assault bike', 'Kettlebells', 'Dumbbells'],

    technical: {
      wodTypes: ['AMRAP (10-20 min)', 'For Time (volumen moderado)', 'EMOM', 'Tabata', 'Strength + Metcon'],
      intensityRange: '70-85% capacidad máxima',
      restBetweenRounds: '30-60 segundos',
      workoutDuration: '45-60 minutos',
      scalingRequired: 'Opcional - Kipping pull-ups, RX weights'
    },

    benchmarks: {
      'Fran': 'Sub-8 min (95/65 lbs thrusters + pull-ups)',
      'Helen': 'Sub-12 min (RX)',
      'Cindy': '18-22 rounds RX',
      'Murph': 'Sub-50 min (con chaleco opcional)'
    },

    theme: LEVEL_THEMES.intermedio,
    color: LEVEL_THEMES.intermedio.tailwindClass,
    icon: LEVEL_THEMES.intermedio.icon,
    recommendedProgression: 'Periodización semanal, balance G/W/M, 4-5 días/semana'
  },

  'avanzado': {
    id: 'avanzado',
    name: 'Avanzado',
    alias: 'RX+',
    description: '3-5 años de CrossFit competitivo',
    frequency: '5-6 días/semana',
    restDays: 'Active recovery obligatorio, 1 día descanso completo',
    duration: '60-90 minutos por sesión',

    hitos: [
      'Muscle-ups (5+ consecutivos)',
      'Handstand Push-Ups (10+ consecutivos)',
      'Snatch 1.25x peso corporal',
      'Clean & Jerk 1.5x peso corporal',
      'Back Squat 2x peso corporal',
      'Deadlift 2.5x peso corporal',
      'Open Quarterfinals qualifier'
    ],

    focus: [
      'Gimnásticos avanzados (bar muscle-ups, strict HSPU)',
      'Olympic lifts cargas competitivas',
      'Estrategia de competencia',
      'Recovery y mobility avanzada',
      'Mental toughness y pacing strategy'
    ],

    equipment: ['Full CrossFit box setup', 'Specialty bars', 'Rings', 'GHD', 'Sled', 'Rower', 'Assault bike'],

    technical: {
      wodTypes: ['AMRAP (alta densidad)', 'For Time (alto volumen)', 'EMOM (avanzado)', 'Chippers', 'Hero WODs'],
      intensityRange: '80-90% capacidad máxima',
      restBetweenRounds: '15-45 segundos',
      workoutDuration: '60-90 minutos',
      scalingRequired: 'No - RX+ movements (deficit HSPU, chest-to-bar, etc.)'
    },

    benchmarks: {
      'Fran': 'Sub-5 min (RX+)',
      'Helen': 'Sub-9 min',
      'Murph': 'Sub-40 min con chaleco',
      'Isabel': 'Sub-5 min (135/95 lbs snatches)'
    },

    theme: LEVEL_THEMES.avanzado,
    color: LEVEL_THEMES.avanzado.tailwindClass,
    icon: LEVEL_THEMES.avanzado.icon,
    recommendedProgression: 'Periodización multi-fase, preparación competitiva, 5-6 días/semana'
  },

  'elite': {
    id: 'elite',
    name: 'Elite',
    alias: 'Elite / Games',
    description: '+5 años de CrossFit competitivo de alto nivel',
    frequency: '6-7 días/semana + double sessions',
    restDays: 'Periodización avanzada con recovery protocols',
    duration: '2-3 horas por día (sesiones dobles)',

    hitos: [
      'Open top 1% mundial',
      'Quarterfinals/Semifinals competidor',
      'CrossFit Games aspirante',
      'Snatch 1.5x+ peso corporal',
      'Clean & Jerk 2x+ peso corporal',
      'Dominio total de movimientos avanzados',
      'Sub-3 min Fran, Sub-7 min Helen'
    ],

    focus: [
      'Preparación específica para competencia Games-level',
      'Gimnásticos extremos (ring HSPUs, legless rope climbs)',
      'Cargas olímpicas elite',
      'Multiple modalities avanzadas',
      'Recovery y nutrition optimization',
      'Sport psychology y mental training'
    ],

    equipment: ['Elite CrossFit facility', 'All specialty equipment', 'Advanced recovery tools'],

    technical: {
      wodTypes: ['Todos los tipos', 'Hero WODs', 'Games-style chippers', 'Multiple modalities'],
      intensityRange: '85-95% capacidad máxima',
      restBetweenRounds: '10-30 segundos',
      workoutDuration: '2-3 horas (sesiones dobles)',
      scalingRequired: 'No - Elite level execution'
    },

    benchmarks: {
      'Fran': 'Sub-3 min',
      'Helen': 'Sub-7 min',
      'Murph': 'Sub-35 min con chaleco',
      'Diane': 'Sub-4 min',
      'Karen': 'Sub-5 min'
    },

    theme: LEVEL_THEMES.elite,
    color: LEVEL_THEMES.elite.tailwindClass,
    icon: LEVEL_THEMES.elite.icon,
    recommendedProgression: 'Individualización extrema, preparación multi-pico para competencias'
  }
};

/**
 * Obtener configuración de nivel por ID
 */
export function getLevelConfig(levelId) {
  const sanitizedId = ValidationUtils.sanitizeLevelId(levelId);

  if (!sanitizedId) {
    ValidationUtils.logWarning('getLevelConfig called with invalid levelId', { levelId });
    return null;
  }

  return CROSSFIT_LEVELS[sanitizedId] || null;
}

/**
 * Obtener todos los niveles disponibles ordenados por progresión
 */
export function getAllLevels() {
  return LEVEL_ORDER.map(levelId => CROSSFIT_LEVELS[levelId]);
}

/**
 * Obtener nivel siguiente en la progresión
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

  return CROSSFIT_LEVELS[LEVEL_ORDER[currentIndex + 1]];
}

/**
 * Obtener nivel anterior en la progresión
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

  return CROSSFIT_LEVELS[LEVEL_ORDER[currentIndex - 1]];
}

/**
 * Validar si un nivel es válido
 */
export function isValidLevel(level) {
  return ValidationUtils.isValidLevelId(level);
}

/**
 * Obtener recomendaciones generales por nivel
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
    intensityRange: TRAINING_CONSTANTS.INTENSITY_RANGE[levelId],
    weeklyFrequency: TRAINING_CONSTANTS.WEEKLY_FREQUENCY[levelId],
    wodTypes: config.technical.wodTypes,
    restBetweenRounds: config.technical.restBetweenRounds,
    workoutDuration: config.technical.workoutDuration,
    scalingRequired: config.technical.scalingRequired
  };
}

/**
 * Obtener información de tema/colores para un nivel
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
 */
export function getLevelIndex(level) {
  const sanitizedLevel = ValidationUtils.sanitizeLevelId(level);

  if (!ValidationUtils.isValidLevelId(sanitizedLevel)) {
    return -1;
  }

  return LEVEL_ORDER.indexOf(sanitizedLevel);
}

/**
 * Comparar dos niveles en la progresión
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

/**
 * Obtener alias de CrossFit para un nivel
 */
export function getCrossFitAlias(level) {
  const config = getLevelConfig(level);
  return config?.alias || level;
}

export default CROSSFIT_LEVELS;
