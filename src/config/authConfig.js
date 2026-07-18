/**
 * 🔐 Configuración Centralizada de Autenticación - MindFit
 *
 * FUNCIONALIDAD:
 * - Configuración de endpoints de autenticación
 * - Timeouts y límites de sesión
 * - Rate limiting y seguridad
 * - Storage keys centralizados
 * - Configuración multi-environment
 */

import { getApiBaseUrl } from './api';

// =============================================================================
// 🌍 CONFIGURACIÓN POR ENTORNO
// =============================================================================

const ENVIRONMENTS = {
  development: {
    API_BASE: getApiBaseUrl(),
    TOKEN_REFRESH_THRESHOLD: 5 * 60 * 1000, // 5 minutos
    SESSION_TIMEOUT: 24 * 60 * 60 * 1000, // 24 horas
    INACTIVITY_TIMEOUT: 2 * 60 * 60 * 1000, // 2 horas
    REQUEST_TIMEOUT: 20000, // 20 segundos (aumentado para operaciones pesadas)
    RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutos
    MAX_LOGIN_ATTEMPTS: 10 // Más relajado en desarrollo
  },
  production: {
    // La web usa el mismo origen y Capacitor la URL configurada por el adapter.
    API_BASE: getApiBaseUrl(),
    TOKEN_REFRESH_THRESHOLD: 10 * 60 * 1000, // 10 minutos
    SESSION_TIMEOUT: 8 * 60 * 60 * 1000, // 8 horas
    INACTIVITY_TIMEOUT: 30 * 60 * 1000, // 30 minutos
    REQUEST_TIMEOUT: 15000, // 15 segundos
    RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutos
    MAX_LOGIN_ATTEMPTS: 5 // Más restrictivo en producción
  }
};

const ENV = import.meta.env.MODE || 'development';
const CONFIG = ENVIRONMENTS[ENV];

// =============================================================================
// 🔗 ENDPOINTS DE AUTENTICACIÓN
// =============================================================================

export const AUTH_ENDPOINTS = {
  LOGIN: `${CONFIG.API_BASE}/api/auth/login`,
  LOGOUT: `${CONFIG.API_BASE}/api/auth/logout`,
  REFRESH: `${CONFIG.API_BASE}/api/auth/refresh`,
  VERIFY: `${CONFIG.API_BASE}/api/auth/verify`,
  REGISTER: `${CONFIG.API_BASE}/api/auth/register`
};

// =============================================================================
// ⏱️ CONFIGURACIÓN DE TIMEOUTS Y LÍMITES
// =============================================================================

export const TIMEOUT_CONFIG = {
  // Tokens y sesión
  TOKEN_REFRESH_THRESHOLD: CONFIG.TOKEN_REFRESH_THRESHOLD,
  SESSION_TIMEOUT: CONFIG.SESSION_TIMEOUT,
  INACTIVITY_TIMEOUT: CONFIG.INACTIVITY_TIMEOUT,

  // Requests HTTP
  REQUEST_TIMEOUT: CONFIG.REQUEST_TIMEOUT,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,

  // Heartbeat y actividad
  HEARTBEAT_INTERVAL: 5 * 60 * 1000, // 5 minutos
  ACTIVITY_THROTTLE: 1000, // 1 segundo

  // Conexión
  CONNECTION_CHECK_INTERVAL: 30000, // 30 segundos
  OFFLINE_QUEUE_MAX: 50 // Máximo requests en queue offline
};

// =============================================================================
// 🛡️ CONFIGURACIÓN DE SEGURIDAD
// =============================================================================

export const SECURITY_CONFIG = {
  // Rate limiting
  RATE_LIMIT_WINDOW: CONFIG.RATE_LIMIT_WINDOW,
  MAX_LOGIN_ATTEMPTS: CONFIG.MAX_LOGIN_ATTEMPTS,

  // Lockout
  LOCKOUT_DURATION: 30 * 60 * 1000, // 30 minutos

  // Token validation
  MIN_TOKEN_LENGTH: 50,
  TOKEN_PREFIX: 'Bearer ',

  // Storage encryption (opcional para futuro)
  ENCRYPT_STORAGE: ENV === 'production',
  STORAGE_VERSION: '1.0'
};

// =============================================================================
// 🔑 CLAVES DE STORAGE CENTRALIZADAS
// =============================================================================

export const STORAGE_KEYS = {
  // Autenticación
  TOKEN: 'authToken',
  REFRESH_TOKEN: 'refreshToken',
  USER: 'userProfile',

  // Sesión y actividad
  LAST_ACTIVITY: 'lastActivity',
  SESSION_START: 'sessionStart',
  LOGIN_ATTEMPTS: 'loginAttempts',
  LOCKOUT_UNTIL: 'lockoutUntil',

  // Multi-device
  DEVICE_ID: 'deviceId',
  SESSION_ID: 'sessionId',
  CONCURRENT_SESSIONS: 'concurrentSessions',

  // Rutinas (recovery)
  METHODOLOGY_PLAN_ID: 'currentMethodologyPlanId',
  LAST_METHODOLOGY_PLAN_ID: 'lastMethodologyPlanId',
  ROUTINE_SESSION_ID: 'currentRoutineSessionId',
  ROUTINE_PLAN_START_DATE: 'currentRoutinePlanStartDate',

  // Analytics
  SESSION_ANALYTICS: 'sessionAnalytics',
  LOGIN_HISTORY: 'loginHistory',

  // Queue offline
  OFFLINE_QUEUE: 'offlineRequestQueue',

  // Configuración
  STORAGE_VERSION: 'storageVersion',
  MIGRATION_STATUS: 'migrationStatus'
};

// =============================================================================
// 📊 CONFIGURACIÓN DE ANALYTICS
// =============================================================================

export const ANALYTICS_CONFIG = {
  // Eventos a trackear
  TRACK_LOGIN: true,
  TRACK_LOGOUT: true,
  TRACK_TOKEN_REFRESH: true,
  TRACK_SESSION_TIMEOUT: true,
  TRACK_INACTIVITY: true,
  TRACK_CONNECTION_STATE: true,

  // Límites de almacenamiento
  MAX_LOGIN_HISTORY: 50,
  MAX_SESSION_ANALYTICS: 100,

  // Intervalos de reporte
  ANALYTICS_FLUSH_INTERVAL: 60000, // 1 minuto

  // Datos a capturar
  CAPTURE_USER_AGENT: true,
  CAPTURE_SCREEN_SIZE: true,
  CAPTURE_CONNECTION_TYPE: true
};

// =============================================================================
// 📱 CONFIGURACIÓN MULTI-DEVICE
// =============================================================================

export const MULTI_DEVICE_CONFIG = {
  // Límites
  MAX_CONCURRENT_SESSIONS: 3,

  // Sincronización
  SYNC_INTERVAL: 30000, // 30 segundos
  CROSS_TAB_SYNC: true,

  // Detección de conflictos
  CONFLICT_RESOLUTION: 'newest_wins', // 'newest_wins' | 'user_choice'

  // Storage events
  LISTEN_STORAGE_EVENTS: true
};

// =============================================================================
// 🔄 CONFIGURACIÓN DE RETRY Y RECOVERY
// =============================================================================

export const RETRY_CONFIG = {
  // Exponential backoff
  INITIAL_DELAY: 1000,
  MAX_DELAY: 30000,
  BACKOFF_MULTIPLIER: 2,

  // Jitter para evitar thundering herd
  JITTER: true,
  JITTER_MAX: 0.3,

  // Condiciones de retry
  RETRYABLE_STATUS_CODES: [408, 429, 500, 502, 503, 504],
  RETRYABLE_ERRORS: ['NetworkError', 'TimeoutError', 'AbortError']
};

// =============================================================================
// 📤 EXPORT PRINCIPAL
// =============================================================================

export default {
  AUTH_ENDPOINTS,
  TIMEOUT_CONFIG,
  SECURITY_CONFIG,
  STORAGE_KEYS,
  ANALYTICS_CONFIG,
  MULTI_DEVICE_CONFIG,
  RETRY_CONFIG,
  ENV,
  CONFIG
};
