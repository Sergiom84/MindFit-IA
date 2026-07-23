/**
 * 🏋️ Sistema de Constantes de Entrenamiento - Refactorizado y Consolidado
 *
 * CHANGELOG V2.0:
 * - ✅ Consolidado con methodologiesData.js (eliminando duplicaciones)
 * - ✅ Sistema de colores centralizado y extensible
 * - ✅ Feedback systems unificados
 * - ✅ Constantes no utilizadas removidas
 * - ✅ Sistema preparatorio de internacionalización
 * - ✅ Compatibilidad hacia atrás mantenida
 */

// =============================================================================
// 🌍 CONFIGURACIÓN DE INTERNACIONALIZACIÓN
// =============================================================================

/**
 * Configuración de idiomas soportados
 * Preparatorio para expansión internacional
 */
const I18N_CONFIG = {
  DEFAULT_LOCALE: 'es',
  SUPPORTED_LOCALES: ['es', 'en'],
  FALLBACK_LOCALE: 'es'
};

/**
 * Helper para obtener texto localizado
 * @param {Object} textMap - Mapa de traducciones
 * @param {string} locale - Idioma solicitado
 * @returns {string} Texto en el idioma solicitado o fallback
 */
const getLocalizedText = (textMap, locale = I18N_CONFIG.DEFAULT_LOCALE) => {
  return textMap[locale] || textMap[I18N_CONFIG.FALLBACK_LOCALE] || Object.values(textMap)[0];
};

// =============================================================================
// 🎯 WORKOUT ACTIONS Y STATES
// =============================================================================

/**
 * Acciones del contexto de entrenamiento
 */
export const WORKOUT_ACTIONS = {
  // Plan actions
  SET_PLAN: 'SET_PLAN',
  UPDATE_PLAN: 'UPDATE_PLAN',
  ACTIVATE_PLAN: 'ACTIVATE_PLAN',
  ARCHIVE_PLAN: 'ARCHIVE_PLAN',
  CLEAR_PLAN: 'CLEAR_PLAN',

  // Session actions
  START_SESSION: 'START_SESSION',
  UPDATE_SESSION: 'UPDATE_SESSION',
  UPDATE_EXERCISE: 'UPDATE_EXERCISE',
  COMPLETE_SESSION: 'COMPLETE_SESSION',
  PAUSE_SESSION: 'PAUSE_SESSION',
  END_SESSION: 'END_SESSION',

  // State management
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  SET_UI_STATE: 'SET_UI_STATE',

  // Navigation
  NAVIGATE_TO_TRAINING: 'NAVIGATE_TO_TRAINING',
  NAVIGATE_TO_PLAN: 'NAVIGATE_TO_PLAN'
};

export const PLAN_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ARCHIVED: 'archived'
};

export const SESSION_STATUS = {
  IDLE: 'idle',
  STARTING: 'starting',
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETING: 'completing',
  COMPLETED: 'completed'
};

export const PLAN_TYPES = {
  METHODOLOGY: 'methodology',
  HOME_TRAINING: 'home_training',
  CALISTENIA: 'calistenia',
  GYM_ROUTINE: 'gym_routine'
};

// =============================================================================
// 🏋️ METODOLOGÍAS DE ENTRENAMIENTO (Consolidado)
// =============================================================================

/**
 * Tipos de metodologías - Sincronizado con methodologiesData.js
 */
export const METHODOLOGY_TYPES = {
  HIPERTROFIA: 'Hipertrofia',
  POWERLIFTING: 'Powerlifting',
  FUNCIONAL: 'Funcional',
  HEAVY_DUTY: 'Heavy Duty',
  CROSSFIT: 'Crossfit',
  CALISTENIA: 'Calistenia',
  OPOSICIONES: 'Oposiciones',
  // Nuevas metodologías consolidadas
  ENTRENAMIENTO_CASA: 'Entrenamiento en Casa'
};

/**
 * Descripciones de metodologías con soporte multiidioma
 */
export const METHODOLOGY_DESCRIPTIONS = {
  [METHODOLOGY_TYPES.HIPERTROFIA]: {
    es: 'Entrenamiento de hipertrofia para gimnasio',
    en: 'Hypertrophy training for gym'
  },
  [METHODOLOGY_TYPES.POWERLIFTING]: {
    es: 'Entrenamiento de fuerza con pesas libres',
    en: 'Strength training with free weights'
  },
  [METHODOLOGY_TYPES.FUNCIONAL]: {
    es: 'Entrenamiento funcional completo',
    en: 'Complete functional training'
  },
  [METHODOLOGY_TYPES.HEAVY_DUTY]: {
    es: 'Entrenamiento de alta intensidad',
    en: 'High intensity training'
  },
  [METHODOLOGY_TYPES.CROSSFIT]: {
    es: 'Entrenamiento variado de alta intensidad',
    en: 'High intensity varied training'
  },
  [METHODOLOGY_TYPES.CALISTENIA]: {
    es: 'Entrenamiento de calistenia con peso corporal',
    en: 'Calisthenics bodyweight training'
  },
  [METHODOLOGY_TYPES.OPOSICIONES]: {
    es: 'Preparación física específica',
    en: 'Specific physical preparation'
  },
  [METHODOLOGY_TYPES.ENTRENAMIENTO_CASA]: {
    es: 'Rutinas adaptadas para entrenar en casa',
    en: 'Home training routines'
  }
};

/**
 * Helper para obtener descripción de metodología localizada
 * @param {string} methodology - Tipo de metodología
 * @param {string} locale - Idioma solicitado
 * @returns {string} Descripción localizada
 */
export const getMethodologyDescription = (methodology, locale = I18N_CONFIG.DEFAULT_LOCALE) => {
  if (!methodology) return getLocalizedText({
    es: 'Entrenamiento personalizado adaptado a tu perfil',
    en: 'Custom training adapted to your profile'
  }, locale);

  const descriptions = METHODOLOGY_DESCRIPTIONS[methodology];
  if (!descriptions) return getLocalizedText({
    es: 'Entrenamiento personalizado adaptado a tu perfil',
    en: 'Custom training adapted to your profile'
  }, locale);

  return getLocalizedText(descriptions, locale);
};

// =============================================================================
// 📊 ESTADOS DE EJERCICIOS
// =============================================================================

/**
 * Estados de ejercicios con metadatos enriquecidos
 */
export const EXERCISE_STATUS = {
  COMPLETED: 'completed',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled',
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress'
};

/**
 * Metadatos de estados con información localizada
 */
export const EXERCISE_STATUS_META = {
  [EXERCISE_STATUS.COMPLETED]: {
    label: { es: 'Completado', en: 'Completed' },
    icon: 'CheckCircle',
    priority: 1,
    isPositive: true
  },
  [EXERCISE_STATUS.CANCELLED]: {
    label: { es: 'Cancelado', en: 'Cancelled' },
    icon: 'XCircle',
    priority: 3,
    isPositive: false
  },
  [EXERCISE_STATUS.SKIPPED]: {
    label: { es: 'Saltado', en: 'Skipped' },
    icon: 'SkipForward',
    priority: 2,
    isPositive: false
  },
  [EXERCISE_STATUS.PENDING]: {
    label: { es: 'Pendiente', en: 'Pending' },
    icon: 'Clock',
    priority: 4,
    isPositive: null
  },
  [EXERCISE_STATUS.IN_PROGRESS]: {
    label: { es: 'En Progreso', en: 'In Progress' },
    icon: 'Play',
    priority: 0,
    isPositive: null
  }
};

// =============================================================================
// 😊 SISTEMA DE FEEDBACK UNIFICADO
// =============================================================================

/**
 * Tipos de sentimientos básicos (compatibilidad hacia atrás)
 */
export const SENTIMENT_TYPES = {
  LIKE: 'like',
  DISLIKE: 'dislike',
  HARD: 'hard'
};

/**
 * Sistema de feedback extendido - Consolidado desde ExerciseFeedbackModal
 */
export const FEEDBACK_TYPES = {
  // Sentimientos básicos (para ejercicios individuales)
  LIKE: 'like',
  DISLIKE: 'dislike',
  HARD: 'hard',

  // Feedback específico de rutina (para generar nuevas rutinas)
  TOO_DIFFICULT: 'too_difficult',
  TOO_EASY: 'too_easy',
  DONT_LIKE: 'dont_like',
  CHANGE_FOCUS: 'change_focus'
};

/**
 * Configuración completa de feedback con metadatos
 */
export const FEEDBACK_CONFIG = {
  // Feedback de ejercicios individuales
  [FEEDBACK_TYPES.LIKE]: {
    label: { es: 'Me gusta', en: 'I like it' },
    icon: '❤️',
    lucideIcon: 'Heart',
    category: 'sentiment',
    isPositive: true
  },
  [FEEDBACK_TYPES.HARD]: {
    label: { es: 'Es difícil', en: 'It\'s hard' },
    icon: '⚠️',
    lucideIcon: 'AlertTriangle',
    category: 'sentiment',
    isPositive: false
  },
  [FEEDBACK_TYPES.DISLIKE]: {
    label: { es: 'No me gusta', en: 'I don\'t like it' },
    icon: '👎',
    lucideIcon: 'ThumbsDown',
    category: 'sentiment',
    isPositive: false
  },

  // Feedback para generación de rutinas
  [FEEDBACK_TYPES.TOO_DIFFICULT]: {
    label: { es: 'Muy difícil', en: 'Too difficult' },
    icon: '📈',
    lucideIcon: 'TrendingUp',
    category: 'routine_feedback',
    description: {
      es: 'Los ejercicios son demasiado avanzados para mi nivel',
      en: 'Exercises are too advanced for my level'
    },
    isPositive: false
  },
  [FEEDBACK_TYPES.TOO_EASY]: {
    label: { es: 'Muy fácil', en: 'Too easy' },
    icon: '📉',
    lucideIcon: 'TrendingDown',
    category: 'routine_feedback',
    description: {
      es: 'Necesito más desafío en los ejercicios',
      en: 'I need more challenge in exercises'
    },
    isPositive: false
  },
  [FEEDBACK_TYPES.DONT_LIKE]: {
    label: { es: 'No me gusta', en: 'Don\'t like' },
    icon: '💔',
    lucideIcon: 'Heart',
    category: 'routine_feedback',
    description: {
      es: 'Prefiero otro tipo de ejercicios',
      en: 'I prefer other type of exercises'
    },
    isPositive: false
  },
  [FEEDBACK_TYPES.CHANGE_FOCUS]: {
    label: { es: 'Cambiar enfoque', en: 'Change focus' },
    icon: '🎯',
    lucideIcon: 'Target',
    category: 'routine_feedback',
    description: {
      es: 'Quiero enfocarme en otras áreas del cuerpo',
      en: 'I want to focus on other body areas'
    },
    isPositive: null
  }
};

// =============================================================================
// 🎨 SISTEMA DE COLORES CENTRALIZADO Y EXTENSIBLE
// =============================================================================

/**
 * Paleta de colores principal de la aplicación
 * Centraliza todos los colores para consistencia visual
 */
export const COLOR_PALETTE = {
  // Colores primarios
  PRIMARY: {
    yellow: {
      50: 'yellow-50', 100: 'yellow-100', 200: 'yellow-200', 300: 'yellow-300',
      400: 'yellow-400', 500: 'yellow-500', 600: 'yellow-600', 700: 'yellow-700',
      800: 'yellow-800', 900: 'yellow-900'
    }
  },

  // Estados semánticos
  SUCCESS: {
    light: 'green-300', normal: 'green-400', dark: 'green-600',
    bg: 'green-900/20', border: 'green-600'
  },
  ERROR: {
    light: 'red-300', normal: 'red-400', dark: 'red-600',
    bg: 'red-900/20', border: 'red-600'
  },
  WARNING: {
    light: 'orange-300', normal: 'orange-400', dark: 'orange-600',
    bg: 'orange-500/10', border: 'orange-500/20'
  },
  INFO: {
    light: 'blue-300', normal: 'blue-400', dark: 'blue-600',
    bg: 'blue-500/10', border: 'blue-500/20'
  },
  NEUTRAL: {
    light: 'gray-300', normal: 'gray-400', dark: 'gray-600',
    bg: 'gray-800/50', border: 'gray-700'
  },

  // Colores especiales
  PURPLE: {
    light: 'purple-300', normal: 'purple-400', dark: 'purple-600',
    bg: 'purple-500/10', border: 'purple-500/20'
  },

  // Fondos y superficies
  SURFACES: {
    background: 'gray-900',
    card: 'gray-800',
    cardHover: 'gray-800/80',
    overlay: 'black/90'
  }
};

/**
 * Sistema de colores unificado por estado de ejercicio
 * Reemplaza el fragmentado STATUS_COLORS anterior
 */
export const EXERCISE_STATUS_COLORS = {
  [EXERCISE_STATUS.COMPLETED]: {
    bg: `bg-${COLOR_PALETTE.SUCCESS.bg}`,
    border: `border-${COLOR_PALETTE.SUCCESS.border}`,
    text: `text-${COLOR_PALETTE.SUCCESS.light}`,
    pill: `text-${COLOR_PALETTE.SUCCESS.light}`,
    hover: `hover:bg-${COLOR_PALETTE.SUCCESS.bg}/30`
  },
  [EXERCISE_STATUS.CANCELLED]: {
    bg: `bg-${COLOR_PALETTE.ERROR.bg}`,
    border: `border-${COLOR_PALETTE.ERROR.border}`,
    text: `text-${COLOR_PALETTE.ERROR.light}`,
    pill: `text-${COLOR_PALETTE.ERROR.light}`,
    hover: `hover:bg-${COLOR_PALETTE.ERROR.bg}/30`
  },
  [EXERCISE_STATUS.SKIPPED]: {
    bg: `bg-${COLOR_PALETTE.NEUTRAL.bg}`,
    border: `border-${COLOR_PALETTE.NEUTRAL.border}`,
    text: `text-${COLOR_PALETTE.NEUTRAL.normal}`,
    pill: `text-${COLOR_PALETTE.NEUTRAL.normal}`,
    hover: `hover:bg-${COLOR_PALETTE.NEUTRAL.bg}/30`
  },
  [EXERCISE_STATUS.PENDING]: {
    bg: 'bg-gray-800/40',
    border: `border-${COLOR_PALETTE.NEUTRAL.border}`,
    text: `text-${COLOR_PALETTE.NEUTRAL.light}`,
    pill: `text-${COLOR_PALETTE.NEUTRAL.light}`,
    hover: 'hover:bg-gray-800/60'
  },
  [EXERCISE_STATUS.IN_PROGRESS]: {
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    text: 'text-yellow-300',
    pill: 'text-yellow-300',
    hover: 'hover:bg-yellow-500/20'
  }
};

/**
 * Sistema de colores unificado por feedback/sentimiento
 * Consolida colores desde ExerciseFeedbackModal y otros componentes
 */
export const FEEDBACK_COLORS = {
  [FEEDBACK_TYPES.LIKE]: {
    text: `text-${COLOR_PALETTE.SUCCESS.light}`,
    bg: `bg-${COLOR_PALETTE.SUCCESS.bg}`,
    border: `border-${COLOR_PALETTE.SUCCESS.border}`,
    hover: 'hover:bg-green-500/20',
    button: 'bg-green-500/10 border-green-500/20 hover:bg-green-500/20'
  },
  [FEEDBACK_TYPES.HARD]: {
    text: `text-${COLOR_PALETTE.ERROR.light}`,
    bg: `bg-${COLOR_PALETTE.ERROR.bg}`,
    border: `border-${COLOR_PALETTE.ERROR.border}`,
    hover: 'hover:bg-red-500/20',
    button: 'bg-red-500/10 border-red-500/20 hover:bg-red-500/20'
  },
  [FEEDBACK_TYPES.DISLIKE]: {
    text: `text-${COLOR_PALETTE.WARNING.light}`,
    bg: `bg-${COLOR_PALETTE.WARNING.bg}`,
    border: `border-${COLOR_PALETTE.WARNING.border}`,
    hover: 'hover:bg-orange-500/20',
    button: 'bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20'
  },
  [FEEDBACK_TYPES.TOO_DIFFICULT]: {
    text: `text-${COLOR_PALETTE.ERROR.normal}`,
    bg: `bg-${COLOR_PALETTE.ERROR.bg}`,
    border: `border-${COLOR_PALETTE.ERROR.border}`,
    hover: 'hover:bg-red-500/20',
    button: 'bg-red-500/10 border-red-500/20 hover:bg-red-500/20'
  },
  [FEEDBACK_TYPES.TOO_EASY]: {
    text: `text-${COLOR_PALETTE.INFO.normal}`,
    bg: `bg-${COLOR_PALETTE.INFO.bg}`,
    border: `border-${COLOR_PALETTE.INFO.border}`,
    hover: 'hover:bg-blue-500/20',
    button: 'bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20'
  },
  [FEEDBACK_TYPES.DONT_LIKE]: {
    text: `text-${COLOR_PALETTE.WARNING.normal}`,
    bg: `bg-${COLOR_PALETTE.WARNING.bg}`,
    border: `border-${COLOR_PALETTE.WARNING.border}`,
    hover: 'hover:bg-orange-500/20',
    button: 'bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20'
  },
  [FEEDBACK_TYPES.CHANGE_FOCUS]: {
    text: `text-${COLOR_PALETTE.PURPLE.normal}`,
    bg: `bg-${COLOR_PALETTE.PURPLE.bg}`,
    border: `border-${COLOR_PALETTE.PURPLE.border}`,
    hover: 'hover:bg-purple-500/20',
    button: 'bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20'
  }
};

/**
 * Colores por sentimiento (compatibilidad hacia atrás)
 * @deprecated Usar FEEDBACK_COLORS en su lugar
 */
export const SENTIMENT_COLORS = {
  [SENTIMENT_TYPES.LIKE]: {
    text: FEEDBACK_COLORS[FEEDBACK_TYPES.LIKE].text,
    icon: FEEDBACK_CONFIG[FEEDBACK_TYPES.LIKE].icon
  },
  [SENTIMENT_TYPES.HARD]: {
    text: FEEDBACK_COLORS[FEEDBACK_TYPES.HARD].text,
    icon: FEEDBACK_CONFIG[FEEDBACK_TYPES.HARD].icon
  },
  [SENTIMENT_TYPES.DISLIKE]: {
    text: FEEDBACK_COLORS[FEEDBACK_TYPES.DISLIKE].text,
    icon: FEEDBACK_CONFIG[FEEDBACK_TYPES.DISLIKE].icon
  }
};

/**
 * Alias para compatibilidad hacia atrás
 * @deprecated Usar EXERCISE_STATUS_COLORS en su lugar
 */
export const STATUS_COLORS = {
  [EXERCISE_STATUS.COMPLETED]: EXERCISE_STATUS_COLORS[EXERCISE_STATUS.COMPLETED],
  [EXERCISE_STATUS.CANCELLED]: EXERCISE_STATUS_COLORS[EXERCISE_STATUS.CANCELLED],
  [EXERCISE_STATUS.SKIPPED]: EXERCISE_STATUS_COLORS[EXERCISE_STATUS.SKIPPED],
  default: EXERCISE_STATUS_COLORS[EXERCISE_STATUS.PENDING]
};

/**
 * Configuración de equipamiento
 */
export const EQUIPMENT_TYPES = {
  MINIMO: 'Mínimo',
  INTERMEDIO: 'Intermedio',
  COMPLETO: 'Completo',
  GIMNASIO: 'Gimnasio'
};

// =============================================================================
// 🚀 HELPERS Y UTILIDADES CENTRALIZADAS
// =============================================================================

/**
 * Helper para obtener colores de estado de ejercicio
 * @param {string} status - Estado del ejercicio
 * @returns {Object} Objeto con clases CSS para el estado
 */
export const getExerciseStatusColors = (status) => {
  const normalizedStatus = (status || '').toLowerCase();
  return EXERCISE_STATUS_COLORS[normalizedStatus] || EXERCISE_STATUS_COLORS[EXERCISE_STATUS.PENDING];
};

/**
 * Helper para obtener colores de feedback
 * @param {string} feedbackType - Tipo de feedback
 * @returns {Object} Objeto con clases CSS para el feedback
 */
export const getFeedbackColors = (feedbackType) => {
  const normalizedType = (feedbackType || '').toLowerCase();
  return FEEDBACK_COLORS[normalizedType] || FEEDBACK_COLORS[FEEDBACK_TYPES.LIKE];
};

/**
 * Helper para obtener configuración de feedback localizada
 * @param {string} feedbackType - Tipo de feedback
 * @param {string} locale - Idioma solicitado
 * @returns {Object} Configuración completa del feedback
 */
export const getFeedbackConfig = (feedbackType, locale = I18N_CONFIG.DEFAULT_LOCALE) => {
  const config = FEEDBACK_CONFIG[feedbackType];
  if (!config) return null;

  return {
    ...config,
    label: getLocalizedText(config.label, locale),
    ...(config.description && {
      description: getLocalizedText(config.description, locale)
    })
  };
};

/**
 * Helper para obtener metadatos de estado de ejercicio localizados
 * @param {string} status - Estado del ejercicio
 * @param {string} locale - Idioma solicitado
 * @returns {Object} Metadatos completos del estado
 */
export const getExerciseStatusMeta = (status, locale = I18N_CONFIG.DEFAULT_LOCALE) => {
  const meta = EXERCISE_STATUS_META[status];
  if (!meta) return null;

  return {
    ...meta,
    label: getLocalizedText(meta.label, locale)
  };
};

// =============================================================================
// 📤 EXPORTS PRINCIPALES
// =============================================================================

/**
 * Export principal con todas las constantes principales
 */
export default {
  // Configuración de internacionalización
  I18N_CONFIG,

  // Workout actions y states
  WORKOUT_ACTIONS,
  PLAN_STATUS,
  SESSION_STATUS,
  PLAN_TYPES,

  // Metodologías
  METHODOLOGY_TYPES,
  METHODOLOGY_DESCRIPTIONS,

  // Estados y feedback
  EXERCISE_STATUS,
  EXERCISE_STATUS_META,
  SENTIMENT_TYPES,
  FEEDBACK_TYPES,
  FEEDBACK_CONFIG,

  // Sistemas de colores
  COLOR_PALETTE,
  EXERCISE_STATUS_COLORS,
  FEEDBACK_COLORS,

  // Equipamiento
  EQUIPMENT_TYPES,

  // Helpers
  getLocalizedText,
  getMethodologyDescription,
  getExerciseStatusColors,
  getFeedbackColors,
  getFeedbackConfig,
  getExerciseStatusMeta,

  // Compatibilidad hacia atrás (deprecated pero mantenidos)
  STATUS_COLORS,
  SENTIMENT_COLORS
};