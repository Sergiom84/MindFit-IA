/**
 * 🏋️ WorkoutContext - Constantes y estado inicial
 *
 * Extraído de WorkoutContext.jsx (ARCH-002) sin cambios de comportamiento.
 * Contiene únicamente tipos/constantes puras y el objeto de estado inicial.
 */

// =============================================================================
// 🎯 TIPOS Y CONSTANTES
// =============================================================================

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
  RESET_WORKOUT: 'RESET_WORKOUT',

  // Navigation
  SET_VIEW: 'SET_VIEW',

  // Modal management
  SHOW_MODAL: 'SHOW_MODAL',
  HIDE_MODAL: 'HIDE_MODAL',
  HIDE_ALL_MODALS: 'HIDE_ALL_MODALS',

  // Re-evaluation
  SET_RE_EVALUATION_TRIGGER: 'SET_RE_EVALUATION_TRIGGER',
  CLEAR_RE_EVALUATION: 'CLEAR_RE_EVALUATION'
};

export const WORKOUT_VIEWS = {
  METHODOLOGIES: 'methodologies',
  ROUTINE_OVERVIEW: 'routine_overview',
  TODAY_TRAINING: 'today_training',
  CALENDAR: 'calendar',
  PROGRESS: 'progress',
  HISTORICAL: 'historical'
};

export const SESSION_STATUS = {
  IDLE: 'idle',
  STARTING: 'starting',
  IN_PROGRESS: 'in_progress',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

export const PLAN_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ARCHIVED: 'archived'
};

// =============================================================================
// 📊 ESTADO INICIAL
// =============================================================================

export const initialState = {
  // ===============================
  // 📋 PLAN STATE
  // ===============================
  plan: {
    currentPlan: null,              // Plan completo desde la API
    methodologyPlanId: null,        // methodology_plan_id
    planStartDate: null,            // Fecha de inicio del plan
    planType: null,                 // 'automatic' | 'manual'
    methodology: null,              // 'calistenia' | 'hipertrofia' | etc.
    generatedAt: null,              // Timestamp de generación
    status: PLAN_STATUS.DRAFT,      // Estado del plan
    weekTotal: 0,                   // Número total de semanas
    currentWeek: 1,                 // Semana actual
    exerciseDatabase: null          // Base de datos de ejercicios
  },

  // ===============================
  // 🏃 SESSION STATE
  // ===============================
  session: {
    currentSession: null,           // Sesión actual completa
    sessionId: null,                // session_id de la BD
    status: SESSION_STATUS.IDLE,    // Estado de la sesión
    currentExercise: null,          // Ejercicio siendo ejecutado
    exerciseIndex: 0,               // Índice del ejercicio actual
    exerciseProgress: {},           // Progreso por ejercicio {exerciseId: data}
    sessionStarted: null,           // Timestamp inicio de sesión
    sessionPaused: null,            // Timestamp pausa
    sessionCompleted: null,         // Timestamp finalización
    weekNumber: 1,                  // Semana de la sesión
    dayName: null,                  // 'lunes' | 'martes' | etc.
    dayInfo: null,                  // Información completa del día
    totalExercises: 0,              // Total de ejercicios del día
    completedExercises: 0           // Ejercicios completados
  },

  // ===============================
  // 🎯 UI STATE
  // ===============================
  ui: {
    currentView: WORKOUT_VIEWS.METHODOLOGIES, // Vista actual
    isLoading: false,               // Estado de carga global
    error: null,                    // Error actual

    // Modal states
    showWarmup: false,              // Mostrar modal de calentamiento
    showSession: false,             // Mostrar modal de sesión
    showFeedback: false,            // Mostrar modal de feedback
    showConfirmation: false,        // Mostrar modal de confirmación
    showPlanConfirmation: false,    // Mostrar modal de confirmación de plan
    showRoutineSession: false,      // Mostrar modal de sesión de rutina
    showVersionSelection: false,    // Mostrar modal de selección de versión
    showMethodologyDetails: false,  // Mostrar modal de detalles de metodología
    showActiveTrainingWarning: false, // Mostrar modal de advertencia de entrenamiento activo
    showActivePlanWarning: false,     // Mostrar modal de advertencia de plan activo

    // Modales de metodologías manuales
    showCalisteniaManual: false,    // Mostrar modal de calistenia manual
    showHeavyDutyManual: false,     // Mostrar modal de Heavy Duty manual
    showHipertrofiaManual: false,   // Mostrar modal de Hipertrofia manual
    showHipertrofiaV2Manual: false, // Mostrar modal de Hipertrofia V2 con tracking RIR
    showPowerliftingManual: false,  // Mostrar modal de Powerlifting manual
    showCrossFitManual: false,      // Mostrar modal de CrossFit manual
    showFuncionalManual: false,     // Mostrar modal de Funcional manual
    showHalterofíliaManual: false,  // Mostrar modal de Halterofilia manual
    showCasaManual: false,          // Mostrar modal de Entrenamiento en Casa manual

    showReEvaluation: false         // Mostrar modal de re-evaluación progresiva
  },

  // ===============================
  // 📊 RE-EVALUATION STATE
  // ===============================
  reEvaluation: {
    shouldTrigger: false,           // Debe mostrarse el modal
    currentWeek: 1,                 // Semana actual del plan
    weeksSinceLastEval: 0,          // Semanas desde última evaluación
    lastEvaluation: null            // Última evaluación realizada
  },

  // ===============================
  // 📈 STATS STATE
  // ===============================
  stats: {
    totalSessions: 0,
    completedSessions: 0,
    totalExercisesCompleted: 0,
    averageSessionDuration: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastWorkout: null
  }
};
