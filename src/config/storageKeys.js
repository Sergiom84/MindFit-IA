/**
 * 🔑 Storage Keys Centralizados - MindFit
 *
 * ✅ MEJORA FASE 2: Unificación de todas las claves de almacenamiento
 *
 * ANTES: Múltiples archivos con nombres inconsistentes
 * DESPUÉS: Una sola fuente de verdad para todas las claves
 *
 * BENEFICIOS:
 * - Evita duplicación de nombres
 * - Facilita cambios globales
 * - Previene errores de tipeo
 * - Documentación centralizada
 */

// =============================================================================
// 🔐 AUTENTICACIÓN Y SESIONES
// =============================================================================

export const AUTH_STORAGE_KEYS = {
  // Tokens de autenticación
  AUTH_TOKEN: 'authToken',
  REFRESH_TOKEN: 'refreshToken',
  ACCESS_TOKEN: 'authToken', // Alias para compatibilidad
  TOKEN: 'authToken', // Alias para compatibilidad

  // Datos de usuario
  USER_PROFILE: 'userProfile',
  USER_DATA: 'userProfile', // Alias para compatibilidad
  USER_ID: 'userId',

  // Gestión de sesiones
  SESSION_ID: 'sessionId',
  SESSION_START: 'sessionStart',
  LAST_ACTIVITY: 'lastActivity',
  SESSION_TIMEOUT_WARNING: 'sessionTimeoutWarning'
};

// =============================================================================
// 🏋️ RUTINAS Y METODOLOGÍAS
// =============================================================================

export const ROUTINE_STORAGE_KEYS = {
  // Plan de metodología
  CURRENT_METHODOLOGY_PLAN_ID: 'currentMethodologyPlanId',
  METHODOLOGY_PLAN_ID: 'currentMethodologyPlanId', // Alias

  // Rutinas y sesiones
  CURRENT_ROUTINE_SESSION_ID: 'currentRoutineSessionId',
  ACTIVE_ROUTINE_SESSION: 'activeRoutineSession',
  CURRENT_ROUTINE_PLAN_START_DATE: 'currentRoutinePlanStartDate',
  PLAN_START_DATE: 'currentRoutinePlanStartDate', // Alias

  // Estado de entrenamiento
  TODAY_SESSION_STATUS: 'todaySessionStatus',
  EXERCISE_PROGRESS: 'exerciseProgress',
  ROUTINE_CACHE: 'routineCache',
  COMPLETED_EXERCISES: 'completedExercises'
};

// =============================================================================
// 🏠 HOME TRAINING
// =============================================================================

export const HOME_TRAINING_STORAGE_KEYS = {
  // Sesiones de entrenamiento en casa
  HOME_TRAINING_SESSION: 'homeTrainingSession',
  HOME_TRAINING_PROGRESS: 'homeTrainingProgress',
  HOME_TRAINING_PREFERENCES: 'homeTrainingPreferences',

  // Ejercicios rechazados y feedback
  REJECTED_EXERCISES: 'rejectedExercises',
  HOME_TRAINING_FEEDBACK: 'homeTrainingFeedback'
};

// =============================================================================
// 🍎 NUTRICIÓN Y PERFIL
// =============================================================================

export const NUTRITION_STORAGE_KEYS = {
  // Datos nutricionales
  NUTRITION_LOG: 'nutritionLog',
  NUTRITION_PREFERENCES: 'nutritionPreferences',
  NUTRITION_GOALS: 'nutritionGoals',

  // Equipamiento y perfil físico
  USER_EQUIPMENT: 'userEquipment',
  BODY_COMPOSITION: 'bodyComposition',
  FITNESS_LEVEL: 'fitnessLevel'
};

// =============================================================================
// ⚙️ CONFIGURACIÓN Y CACHE
// =============================================================================

export const APP_STORAGE_KEYS = {
  // Configuración de la aplicación
  APP_CONFIG: 'appConfig',
  THEME_PREFERENCE: 'themePreference',
  LANGUAGE_PREFERENCE: 'languagePreference',

  // Cache y performance
  API_CACHE: 'apiCache',
  OFFLINE_QUEUE: 'offlineQueue',
  LAST_SYNC: 'lastSync',

  // Formularios y temporal
  REGISTER_FORM_PROGRESS: 'register_form_progress',
  TEMP_DATA: 'tempData'
};

// =============================================================================
// 📊 ANALYTICS Y TRACKING
// =============================================================================

export const ANALYTICS_STORAGE_KEYS = {
  // Datos de analytics
  USER_ANALYTICS: 'userAnalytics',
  SESSION_ANALYTICS: 'sessionAnalytics',
  PERFORMANCE_METRICS: 'performanceMetrics',

  // Tracking de errores
  ERROR_LOG: 'errorLog',
  CRASH_REPORTS: 'crashReports'
};

// =============================================================================
// 🔄 COMPATIBILIDAD Y MIGRACIÓN
// =============================================================================

/**
 * Mapa de claves para migración desde nombres antiguos
 * Permite migrar gradualmente sin romper código existente
 */
export const LEGACY_KEY_MIGRATION = {
  // Nombres antiguos → nombres nuevos
  'token': AUTH_STORAGE_KEYS.AUTH_TOKEN,
  'accessToken': AUTH_STORAGE_KEYS.AUTH_TOKEN,
  'userData': AUTH_STORAGE_KEYS.USER_PROFILE,
  'methodologyPlanId': ROUTINE_STORAGE_KEYS.CURRENT_METHODOLOGY_PLAN_ID,
  'routineSessionId': ROUTINE_STORAGE_KEYS.CURRENT_ROUTINE_SESSION_ID
};

// =============================================================================
// 🛡️ CLAVES CRÍTICAS (para protección en limpieza)
// =============================================================================

/**
 * Claves que NUNCA deben ser borradas en limpiezas normales
 * Usadas por clearCache.js y storageManager.js
 */
export const CRITICAL_STORAGE_KEYS = [
  AUTH_STORAGE_KEYS.AUTH_TOKEN,
  AUTH_STORAGE_KEYS.REFRESH_TOKEN,
  AUTH_STORAGE_KEYS.USER_PROFILE,
  ROUTINE_STORAGE_KEYS.CURRENT_METHODOLOGY_PLAN_ID,
  ROUTINE_STORAGE_KEYS.CURRENT_ROUTINE_SESSION_ID,
  ROUTINE_STORAGE_KEYS.CURRENT_ROUTINE_PLAN_START_DATE,
  ROUTINE_STORAGE_KEYS.ACTIVE_ROUTINE_SESSION
];

/**
 * Claves relacionadas con rutinas (para limpieza selectiva)
 */
export const ROUTINE_RELATED_KEYS = [
  ROUTINE_STORAGE_KEYS.CURRENT_METHODOLOGY_PLAN_ID,
  ROUTINE_STORAGE_KEYS.CURRENT_ROUTINE_SESSION_ID,
  ROUTINE_STORAGE_KEYS.CURRENT_ROUTINE_PLAN_START_DATE,
  ROUTINE_STORAGE_KEYS.ACTIVE_ROUTINE_SESSION,
  ROUTINE_STORAGE_KEYS.TODAY_SESSION_STATUS,
  ROUTINE_STORAGE_KEYS.EXERCISE_PROGRESS,
  ROUTINE_STORAGE_KEYS.ROUTINE_CACHE
];

// =============================================================================
// 🚀 EXPORT CONSOLIDADO
// =============================================================================

/**
 * Export principal con todas las claves organizadas
 */
export const STORAGE_KEYS = {
  ...AUTH_STORAGE_KEYS,
  ...ROUTINE_STORAGE_KEYS,
  ...HOME_TRAINING_STORAGE_KEYS,
  ...NUTRITION_STORAGE_KEYS,
  ...APP_STORAGE_KEYS,
  ...ANALYTICS_STORAGE_KEYS
};

/**
 * Helper para obtener una clave con fallback a nombre legacy
 * @param {string} keyName - Nombre de la clave
 * @returns {string} Clave normalizada
 */
export function getStorageKey(keyName) {
  // Buscar en STORAGE_KEYS primero
  if (Object.values(STORAGE_KEYS).includes(keyName)) {
    return keyName;
  }

  // Buscar en migración de nombres legacy
  if (LEGACY_KEY_MIGRATION[keyName]) {
    console.warn(`⚠️ Usando clave legacy '${keyName}', considera migrar a '${LEGACY_KEY_MIGRATION[keyName]}'`);
    return LEGACY_KEY_MIGRATION[keyName];
  }

  // Si no se encuentra, devolver tal como está con warning
  console.warn(`⚠️ Clave de storage no encontrada en configuración: '${keyName}'`);
  return keyName;
}

/**
 * Helper para verificar si una clave es crítica
 * @param {string} key - Clave a verificar
 * @returns {boolean} true si es crítica
 */
export function isCriticalKey(key) {
  return CRITICAL_STORAGE_KEYS.includes(key);
}

/**
 * Helper para verificar si una clave es relacionada con rutinas
 * @param {string} key - Clave a verificar
 * @returns {boolean} true si es de rutinas
 */
export function isRoutineRelatedKey(key) {
  return ROUTINE_RELATED_KEYS.includes(key);
}

// Export por defecto
export default {
  STORAGE_KEYS,
  AUTH_STORAGE_KEYS,
  ROUTINE_STORAGE_KEYS,
  HOME_TRAINING_STORAGE_KEYS,
  NUTRITION_STORAGE_KEYS,
  APP_STORAGE_KEYS,
  ANALYTICS_STORAGE_KEYS,
  CRITICAL_STORAGE_KEYS,
  ROUTINE_RELATED_KEYS,
  LEGACY_KEY_MIGRATION,
  getStorageKey,
  isCriticalKey,
  isRoutineRelatedKey
};