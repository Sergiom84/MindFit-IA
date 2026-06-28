/**
 * Configuración de Niveles para Halterofilia (Olympic Weightlifting)
 * Basado en levantamientos olímpicos: Snatch y Clean & Jerk
 *
 * @author Claude Code - Arquitectura Modular Profesional
 * @version 1.0.0 - Halterofilia Implementation
 */

// Constantes de configuración
const LEVEL_ORDER = ['principiante', 'intermedio', 'avanzado'];

const TRAINING_CONSTANTS = {
  WARMUP_DURATION: {
    principiante: 15, // Movilidad específica más larga
    intermedio: 18,
    avanzado: 20
  },
  COOLDOWN_DURATION: 12, // Recovery importante en halterofilia
  TECHNICAL_WORK_PERCENT: {
    principiante: 60, // Alta prioridad en técnica
    intermedio: 50,
    avanzado: 40
  },
  STRENGTH_WORK_PERCENT: {
    principiante: 30,
    intermedio: 35,
    avanzado: 45
  },
  ACCESSORY_WORK_PERCENT: {
    principiante: 10,
    intermedio: 15,
    avanzado: 15
  },
  DELOAD_WEEKS: {
    principiante: 4, // Más frecuente por novedad técnica
    intermedio: 5,
    avanzado: 4 // Más frecuente por intensidad
  },
  MAX_TRAINING_DAYS: {
    principiante: 4,
    intermedio: 5,
    avanzado: 6
  },
  INTENSITY_ZONES: {
    principiante: '50-70% 1RM',
    intermedio: '65-85% 1RM',
    avanzado: '75-95% 1RM'
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
    icon: '🔵'
  },
  intermedio: {
    primary: 'orange-500',
    background: 'orange-50',
    border: 'orange-200',
    text: 'orange-800',
    tailwindClass: 'bg-orange-100 border-orange-300 text-orange-800',
    icon: '🟠'
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
    if (!levelId) return 'principiante';
    const normalized = String(levelId).toLowerCase().trim();
    return this.isValidLevelId(normalized) ? normalized : 'principiante';
  },

  validateLevelData(levelData) {
    if (!levelData || typeof levelData !== 'object') {
      return { valid: false, error: 'Datos de nivel inválidos' };
    }
    if (!levelData.id || !this.isValidLevelId(levelData.id)) {
      return { valid: false, error: 'ID de nivel inválido' };
    }
    return { valid: true };
  }
};

// ===============================================
// DEFINICIÓN DE NIVELES
// ===============================================

export const HALTEROFILIA_LEVELS = {
  'principiante': {
    id: 'principiante',
    name: 'Principiante',
    display: 'Principiante - Fundamentos Técnicos',
    frequency: '3-4 días/semana',
    duration: '40-55 minutos por sesión',
    intensity: TRAINING_CONSTANTS.INTENSITY_ZONES.principiante,
    theme: LEVEL_THEMES.principiante,
    icon: '🔵',

    // Hitos técnicos específicos de halterofilia principiante
    hitos: [
      'Dominar posición de overhead squat con barra vacía (3x8)',
      'Ejecutar hang power clean con técnica correcta (5x3 @ 50-60kg)',
      'Realizar hang power snatch estable (5x3 @ 40-50kg)',
      'Mantener posición de front rack sin molestias (3 min acumulado)',
      'Completar muscle snatch con trayectoria vertical (4x5 @ barra)',
      'Ejecutar push press con timing correcto (4x6 @ 40kg)',
      'Front squat ATG con torso vertical (4x8 @ 60-70% back squat)',
      'Snatch balance con recepción rápida (4x4 @ 30-40kg)'
    ],

    description: 'Nivel introductorio centrado en fundamentos técnicos de los levantamientos olímpicos. Énfasis en movilidad overhead, posiciones correctas y patrones de movimiento básicos.',

    recommendations: [
      'Priorizar técnica sobre carga siempre',
      'Filmar tus levantamientos para análisis de técnica',
      'Trabajar movilidad de cadera, tobillos y hombros diariamente',
      'Dominar hang positions antes de lifts desde suelo',
      'Descansar adecuadamente entre series (2-3 minutos)',
      'Buscar feedback de entrenador certificado si es posible'
    ],

    focusAreas: [
      'Posiciones de recepción (overhead squat, front squat)',
      'Hang positions (knee, mid-thigh)',
      'Muscle variations (muscle snatch, muscle clean)',
      'Timing de extensión de cadera',
      'Movilidad activa overhead',
      'Fuerza base (back squat, RDL, strict press)'
    ],

    weeklyStructure: {
      day1: 'Snatch technique + Squat strength',
      day2: 'Clean & Jerk technique + Pull strength',
      day3: 'Snatch variations + Accessories',
      day4: 'Clean variations + Jerk practice (opcional)'
    },

    progressionCriteria: [
      'Consistencia técnica en lifts desde hang (80%+ intentos buenos)',
      'Overhead squat con barra sin compensaciones (3x8 perfecto)',
      'Front squat 1.2x peso corporal con buena postura',
      'Clean grip y snatch grip deadlift con setup correcto',
      'Movilidad de hombros para snatch grip BTN press'
    ]
  },

  'intermedio': {
    id: 'intermedio',
    name: 'Intermedio',
    display: 'Intermedio - Consolidación Técnica',
    frequency: '4-5 días/semana',
    duration: '55-70 minutos por sesión',
    intensity: TRAINING_CONSTANTS.INTENSITY_ZONES.intermedio,
    theme: LEVEL_THEMES.intermedio,
    icon: '🟠',

    hitos: [
      'Power snatch desde suelo con técnica consistente (5x3 @ 70-75%)',
      'Power clean + push jerk completo (5x(1+1) @ 75-80%)',
      'Snatch pull pesado con velocidad de barra (4x4 @ 100-110% snatch)',
      'Front squat 1.5x peso corporal mínimo (5x5)',
      'Overhead squat 80% del snatch máximo (4x5)',
      'Clean desde bloques con second pull explosivo (5x3 @ 75%)',
      'Split jerk con timing perfecto (5x3 @ 80%)',
      'Complejo de snatch: Power + Hang + OHS (4x1+1+2)'
    ],

    description: 'Nivel de consolidación donde se introducen lifts completos desde suelo y se aumenta progresivamente la carga. Balance entre perfección técnica y desarrollo de fuerza específica.',

    recommendations: [
      'Comenzar a introducir lifts desde suelo gradualmente',
      'Usar bloques/hang para reforzar second pull',
      'Implementar pulls pesados (100-120% del lift)',
      'Periodizar carga semanalmente (ligero-medio-pesado)',
      'Trabajar splits en jerk con consistencia',
      'Registrar cargas y PRs para tracking de progreso'
    ],

    focusAreas: [
      'Lifts completos desde suelo (power variations)',
      'Second pull explosivo (bloques, hang low)',
      'Jerk variations (push, power, split prep)',
      'Pulls pesados para overload',
      'Complejos técnicos (2-3 movimientos)',
      'Fuerza de piernas (front squat, back squat pesados)'
    ],

    weeklyStructure: {
      day1: 'Snatch technique + Heavy squats',
      day2: 'Clean & Jerk + Pull strength',
      day3: 'Snatch variations + Accessories',
      day4: 'Clean technique + Jerk practice',
      day5: 'Snatch/Clean from blocks + Recovery work (opcional)'
    },

    progressionCriteria: [
      'Power snatch y power clean desde suelo consistentes (75-80%)',
      'Front squat 1.5x+ peso corporal',
      'Snatch pull y clean pull a 110-120% del lift',
      'Overhead squat profundo con 70-80% snatch máximo',
      'Split jerk con timing fluido y estable',
      'Capaz de ejecutar complejos de 2-3 movimientos'
    ]
  },

  'avanzado': {
    id: 'avanzado',
    name: 'Avanzado',
    display: 'Avanzado - Maximización y Competición',
    frequency: '5-6 días/semana',
    duration: '70-90 minutos por sesión',
    intensity: TRAINING_CONSTANTS.INTENSITY_ZONES.avanzado,
    theme: LEVEL_THEMES.avanzado,
    icon: '🔴',

    hitos: [
      'Snatch completo consistente a 85-90% (singles y doubles)',
      'Clean & Jerk completo a 85-90% (singles)',
      'Snatch pull a 120-130% del snatch máximo (3x3)',
      'Front squat 2x peso corporal mínimo (3x3)',
      'Back squat 2.5x peso corporal mínimo (5x3)',
      'Overhead squat con 90% del snatch (3x3)',
      'Complejos avanzados: Clean + FS + Jerk (4x1+3+1 @ 80%)',
      'Participación en competición o mock meet'
    ],

    description: 'Nivel avanzado orientado a maximización de carga técnica y preparación para competición. Periodización estructurada, complejos exigentes y trabajo específico de debilidades.',

    recommendations: [
      'Implementar periodización por bloques (accumulation, intensification, realization)',
      'Identificar y trabajar debilidades técnicas específicas',
      'Usar video analysis regularmente',
      'Practicar protocolo de competición (intentos, timing)',
      'Considerar coaching especializado para ajustes finos',
      'Gestionar fatiga con deloads estratégicos',
      'Integrar trabajo de recuperación (movilidad, soft tissue)'
    ],

    focusAreas: [
      'Full lifts a porcentajes altos (80-95%)',
      'Complejos multi-movimiento bajo fatiga',
      'Pulls y squats pesados (overload)',
      'Technique refinement a intensidades altas',
      'Trabajo específico de debilidades',
      'Periodización estructurada hacia picos',
      'Simulación de condiciones de competición'
    ],

    weeklyStructure: {
      day1: 'Snatch heavy + Squat heavy',
      day2: 'Clean & Jerk heavy + Pull overload',
      day3: 'Snatch variants + Technique + Accessories',
      day4: 'Clean variants + Jerk practice',
      day5: 'Positional work + Complexes + Squats',
      day6: 'Recovery session / Technique / Active rest (opcional)'
    },

    progressionCriteria: [
      'Snatch y C&J consistentes a 85-90% de maxes',
      'Ratios fuerza adecuados (FS 120% snatch, BS 140-150% snatch)',
      'Capacidad de realizar complejos pesados (3-4 movimientos)',
      'Técnica estable bajo fatiga y porcentajes altos',
      'Manejo de periodización y peaking cycles',
      'Experiencia en competición o mock meets'
    ],

    competitionFocus: {
      enabled: true,
      note: 'Nivel preparado para competición amateur/regional',
      preparation: [
        'Practicar protocolo de calentamiento de competición',
        'Simular timing de intentos (cada 2 min)',
        'Trabajar mentalidad bajo presión',
        'Conocer reglas de federación (IWF, AEH, etc.)',
        'Estrategia de intentos (opener, realistic PR, ambitious)'
      ]
    }
  }
};

// ===============================================
// FUNCIONES DE UTILIDAD
// ===============================================

/**
 * Obtiene la configuración completa de un nivel
 * @param {string} levelId - ID del nivel
 * @returns {Object|null} Configuración del nivel o null si no existe
 */
export function getLevelConfig(levelId) {
  const sanitized = ValidationUtils.sanitizeLevelId(levelId);
  return HALTEROFILIA_LEVELS[sanitized] || null;
}

/**
 * Obtiene todos los niveles en orden
 * @returns {Array} Array de configuraciones de nivel
 */
export function getAllLevels() {
  return LEVEL_ORDER.map(id => HALTEROFILIA_LEVELS[id]);
}

/**
 * Obtiene el siguiente nivel en la progresión
 * @param {string} currentLevel - Nivel actual
 * @returns {Object|null} Siguiente nivel o null si ya es el máximo
 */
export function getNextLevel(currentLevel) {
  const sanitized = ValidationUtils.sanitizeLevelId(currentLevel);
  const currentIndex = LEVEL_ORDER.indexOf(sanitized);

  if (currentIndex === -1 || currentIndex === LEVEL_ORDER.length - 1) {
    return null;
  }

  return HALTEROFILIA_LEVELS[LEVEL_ORDER[currentIndex + 1]];
}

/**
 * Verifica si un nivel es válido
 * @param {string} levelId - ID del nivel a validar
 * @returns {boolean} true si es válido
 */
export function isValidLevel(levelId) {
  return ValidationUtils.isValidLevelId(levelId);
}

/**
 * Obtiene las constantes de entrenamiento
 * @returns {Object} Constantes de configuración
 */
export function getTrainingConstants() {
  return { ...TRAINING_CONSTANTS };
}

/**
 * Calcula duración estimada de sesión por nivel
 * @param {string} levelId - ID del nivel
 * @returns {Object} Rango de duración {min, max, unit}
 */
export function getSessionDuration(levelId) {
  const durations = {
    principiante: { min: 40, max: 55, unit: 'minutos' },
    intermedio: { min: 55, max: 70, unit: 'minutos' },
    avanzado: { min: 70, max: 90, unit: 'minutos' }
  };

  const sanitized = ValidationUtils.sanitizeLevelId(levelId);
  return durations[sanitized] || durations.principiante;
}

/**
 * Obtiene recomendaciones específicas para un nivel
 * @param {string} levelId - ID del nivel
 * @returns {Array} Array de recomendaciones
 */
export function getLevelRecommendations(levelId) {
  const config = getLevelConfig(levelId);
  return config ? config.recommendations : [];
}

// ===============================================
// EXPORTS
// ===============================================

export {
  LEVEL_ORDER,
  TRAINING_CONSTANTS,
  LEVEL_THEMES,
  ValidationUtils
};

export default HALTEROFILIA_LEVELS;
