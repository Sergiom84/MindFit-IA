/**
 * 🌐 Configuración de API - Sistema de endpoints dinámico y multi-ambiente
 *
 * CAMBIOS REALIZADOS EN V2:
 * - ✅ Sistema de configuración por ambientes (dev/staging/prod)
 * - ✅ Factory pattern para endpoints dinámicos
 * - ✅ URLs configurables en runtime
 * - ✅ Sistema de feature flags
 * - ✅ Mocking automático para testing
 * - ✅ Configuración de logging por ambiente
 * - ✅ Compatibilidad hacia atrás mantenida
 */

// =============================================================================
// 🌍 CONFIGURACIÓN POR AMBIENTES
// =============================================================================

/**
 * Configuración específica por ambiente
 */
const ENVIRONMENT_CONFIG = {
  development: {
    // En dev, usa VITE_API_URL si existe; de lo contrario, usa el mismo origen (Vite proxy a /api)
    API_URL: (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
      ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
      : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'),
    DEBUG: true,
    ENABLE_MOCKS: false,
    LOG_LEVEL: 'debug',
    FEATURES: {
      ANALYTICS: false,
      BETA_FEATURES: true,
      OFFLINE_MODE: true
    }
  },
  staging: {
    // CONFIG-001: sin dominio hardcodeado inexistente. Usa VITE_API_URL si está
    // definida (móvil/despliegue) o el mismo origen (web). Ver production.
    API_URL: (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
      ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
      : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'),
    DEBUG: true,
    ENABLE_MOCKS: false,
    LOG_LEVEL: 'info',
    FEATURES: {
      ANALYTICS: true,
      BETA_FEATURES: true,
      OFFLINE_MODE: false
    }
  },
  production: {
    // CONFIG-001: web en Render usa el MISMO origen (Express sirve API y SPA).
    // El móvil (Capacitor) DEBE definir VITE_API_URL. Antes apuntaba a
    // 'api.entrenaconia.com', un dominio que no es el de Render.
    API_URL: (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
      ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
      : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'),
    DEBUG: false,
    ENABLE_MOCKS: false,
    LOG_LEVEL: 'error',
    FEATURES: {
      ANALYTICS: true,
      BETA_FEATURES: false,
      OFFLINE_MODE: false
    }
  },
  test: {
    API_URL: 'http://localhost:3002',
    DEBUG: false,
    ENABLE_MOCKS: true,
    LOG_LEVEL: 'silent',
    FEATURES: {
      ANALYTICS: false,
      BETA_FEATURES: true,
      OFFLINE_MODE: true
    }
  }
};

/**
 * Detecta el ambiente actual basado en variables de entorno
 * @returns {string} Ambiente detectado
 */
const detectEnvironment = () => {
  // Prioridad: Variable explícita > Mode de Vite > Fallback
  return import.meta.env.VITE_ENVIRONMENT ||
         import.meta.env.MODE ||
         'development';
};

/**
 * Obtiene la configuración del ambiente actual
 * @param {string} [environment] - Ambiente específico (opcional)
 * @returns {Object} Configuración del ambiente
 */
const getEnvironmentConfig = (environment = detectEnvironment()) => {
  const config = ENVIRONMENT_CONFIG[environment];

  if (!config) {
    console.warn(`🚨 Ambiente '${environment}' no encontrado, usando development`);
    return ENVIRONMENT_CONFIG.development;
  }

  // Override con variables de entorno específicas
  return {
    ...config,
    API_URL: import.meta.env.VITE_API_URL || config.API_URL,
    DEBUG: import.meta.env.VITE_DEBUG === 'true' ? true : config.DEBUG,
    ENABLE_MOCKS: import.meta.env.VITE_ENABLE_MOCKS === 'true' ? true : config.ENABLE_MOCKS
  };
};

// Configuración activa
const CURRENT_CONFIG = getEnvironmentConfig();

/**
 * Obtiene y valida la URL base de la API
 * @param {Object} [config] - Configuración personalizada
 * @returns {string} URL base validada
 */
const getApiBaseUrl = (config = CURRENT_CONFIG) => {
  const url = config.API_URL;

  // Validar formato de URL
  try {
    new URL(url);
    return url.replace(/\/$/, ''); // Eliminar slash final si existe
  } catch (error) {
    console.warn('🚨 URL de API inválida, usando fallback al mismo origen');
    const origin = (typeof window !== 'undefined' && window.location && window.location.origin)
      ? window.location.origin
      : 'http://localhost:5173';
    return origin;
  }
};

// URL base activa (mantenida para compatibilidad)
const API_BASE_URL = getApiBaseUrl();

// =============================================================================
// 🛠️ HELPERS DE CONSTRUCCIÓN DE URLs
// =============================================================================

/**
 * Construye una URL completa para un endpoint
 * @param {string} path - Ruta del endpoint
 * @param {Object} params - Parámetros opcionales para query string
 * @param {string} [baseUrl] - URL base personalizada
 * @returns {string} URL completa
 */
const buildUrl = (path, params = {}, baseUrl = null) => {
  const resolvedBaseUrl = baseUrl || getApiBaseUrl();
  const url = new URL(`${resolvedBaseUrl}${path}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, value);
    }
  });

  return url.toString();
};

/**
 * Construye una URL para endpoints con ID dinámico
 * @param {string} basePath - Ruta base del endpoint
 * @param {string|number} id - ID del recurso
 * @param {string} subPath - Sub-ruta opcional
 * @param {string} [baseUrl] - URL base personalizada
 * @returns {string} URL completa
 */
const buildResourceUrl = (basePath, id, subPath = '', baseUrl = null) => {
  const resolvedBaseUrl = baseUrl || getApiBaseUrl();
  const path = subPath
    ? `${basePath}/${id}/${subPath}`
    : `${basePath}/${id}`;
  return `${resolvedBaseUrl}${path}`;
};

/**
 * Factory para crear funciones de endpoints con configuración específica
 * @param {Object} config - Configuración personalizada
 * @returns {Object} Objeto con funciones de construcción de URLs
 */
const createEndpointBuilder = (config = CURRENT_CONFIG) => {
  const baseUrl = getApiBaseUrl(config);

  return {
    build: (path, params = {}) => buildUrl(path, params, baseUrl),
    buildResource: (basePath, id, subPath = '') => buildResourceUrl(basePath, id, subPath, baseUrl),
    getBaseUrl: () => baseUrl,
    getConfig: () => config
  };
};

// =============================================================================
// 📍 ENDPOINTS DE LA API
// =============================================================================

/**
 * Factory para crear endpoints de API con configuración dinámica
 * @param {Object} [config] - Configuración personalizada
 * @returns {Object} Objeto con todos los endpoints
 */
const createApiEndpoints = (config = CURRENT_CONFIG) => {
  const builder = createEndpointBuilder(config);
  const { build, buildResource } = builder;

  return {
    /**
     * Endpoints de autenticación y sesiones
     */
    AUTH: {
      LOGIN: () => build('/api/auth/login'),
      REGISTER: () => build('/api/auth/register'),
      LOGOUT: () => build('/api/auth/logout'),
      REFRESH: () => build('/api/auth/refresh'),
      VERIFY: () => build('/api/auth/verify'),

      // Gestión de sesiones
      SESSIONS: {
        LIST: () => build('/api/auth/sessions'),
        HISTORY: () => build('/api/auth/sessions/history'),
        STATS: () => build('/api/auth/sessions/stats'),
        LOGOUT_ALL: () => build('/api/auth/sessions/logout-all'),
        LOGOUT_DEVICE: (sessionId) => buildResource('/api/auth/sessions', sessionId, 'logout')
      }
    },

    /**
     * Endpoints de gestión de usuario
     */
    USER: {
      PROFILE: () => build('/api/users/profile'),
      UPDATE_PROFILE: () => build('/api/users/profile'),
      CHANGE_PASSWORD: () => build('/api/users/change-password'),
      DELETE_ACCOUNT: () => build('/api/users/delete'),
      PREFERENCES: () => build('/api/users/preferences'),
      AVATAR: () => build('/api/users/avatar')
    },

    /**
     * Endpoints de rutinas de entrenamiento
     */
    ROUTINES: {
      ACTIVE_PLAN: () => build('/api/routines/active-plan'),
      SESSIONS: () => build('/api/routines/sessions'),
      CONFIRM_PLAN: () => build('/api/routines/confirm-plan'),
      BOOTSTRAP_PLAN: () => build('/api/routines/bootstrap-plan'),

      // Endpoints con parámetros dinámicos
      PLAN: (params) => build('/api/routines/plan', params),
      SESSION_BY_ID: (sessionId) => buildResource('/api/routines/sessions', sessionId),
      SESSION_FEEDBACK: (sessionId) => buildResource('/api/routines/sessions', sessionId, 'feedback'),
      SESSION_COMPLETE: (sessionId) => buildResource('/api/routines/sessions', sessionId, 'complete')
    },

    /**
     * Endpoints de metodologías de entrenamiento
     */
    METHODOLOGIES: {
      GENERATE: () => build('/api/methodologie/generate'),
      LIST: () => build('/api/methodologie/list'),
      DETAILS: (methodId) => buildResource('/api/methodologie', methodId),
      UPDATE: (methodId) => buildResource('/api/methodologie', methodId),
      DELETE: (methodId) => buildResource('/api/methodologie', methodId)
    },

    /**
     * Endpoints de entrenamiento en casa
     */
    HOME_TRAINING: {
      GENERATE: () => build('/api/home-training/generate'),
      SESSIONS: () => build('/api/home-training/sessions'),
      SESSION_BY_ID: (sessionId) => buildResource('/api/home-training/sessions', sessionId),
      SESSION_COMPLETE: (sessionId) => buildResource('/api/home-training/sessions', sessionId, 'complete'),
      TEMPLATES: () => build('/api/home-training/templates')
    },

    /**
     * Endpoints de estadísticas y progreso
     */
    STATS: {
      OVERVIEW: () => build('/api/stats/overview'),
      PROGRESS: () => build('/api/stats/progress'),
      ACHIEVEMENTS: () => build('/api/stats/achievements'),
      WEEKLY: () => build('/api/stats/weekly'),
      MONTHLY: () => build('/api/stats/monthly')
    },

    // Utilidades del builder
    _builder: builder
  };
};

// Instancia por defecto para compatibilidad hacia atrás
export const API_ENDPOINTS = (() => {
  const endpoints = createApiEndpoints();

  // Crear versión compatible con strings para compatibilidad hacia atrás
  const compatibleEndpoints = {
    AUTH: {
      LOGIN: endpoints.AUTH.LOGIN(),
      REGISTER: endpoints.AUTH.REGISTER(),
      LOGOUT: endpoints.AUTH.LOGOUT(),
      REFRESH: endpoints.AUTH.REFRESH(),
      VERIFY: endpoints.AUTH.VERIFY(),
      SESSIONS: {
        LIST: endpoints.AUTH.SESSIONS.LIST(),
        HISTORY: endpoints.AUTH.SESSIONS.HISTORY(),
        STATS: endpoints.AUTH.SESSIONS.STATS(),
        LOGOUT_ALL: endpoints.AUTH.SESSIONS.LOGOUT_ALL(),
        LOGOUT_DEVICE: endpoints.AUTH.SESSIONS.LOGOUT_DEVICE
      }
    },
    USER: {
      PROFILE: endpoints.USER.PROFILE(),
      UPDATE_PROFILE: endpoints.USER.UPDATE_PROFILE(),
      CHANGE_PASSWORD: endpoints.USER.CHANGE_PASSWORD(),
      DELETE_ACCOUNT: endpoints.USER.DELETE_ACCOUNT(),
      PREFERENCES: endpoints.USER.PREFERENCES(),
      AVATAR: endpoints.USER.AVATAR()
    },
    ROUTINES: {
      ACTIVE_PLAN: endpoints.ROUTINES.ACTIVE_PLAN(),
      SESSIONS: endpoints.ROUTINES.SESSIONS(),
      CONFIRM_PLAN: endpoints.ROUTINES.CONFIRM_PLAN(),
      BOOTSTRAP_PLAN: endpoints.ROUTINES.BOOTSTRAP_PLAN(),
      PLAN: endpoints.ROUTINES.PLAN,
      SESSION_BY_ID: endpoints.ROUTINES.SESSION_BY_ID,
      SESSION_FEEDBACK: endpoints.ROUTINES.SESSION_FEEDBACK,
      SESSION_COMPLETE: endpoints.ROUTINES.SESSION_COMPLETE
    },
    METHODOLOGIES: {
      GENERATE: endpoints.METHODOLOGIES.GENERATE(),
      LIST: endpoints.METHODOLOGIES.LIST(),
      DETAILS: endpoints.METHODOLOGIES.DETAILS,
      UPDATE: endpoints.METHODOLOGIES.UPDATE,
      DELETE: endpoints.METHODOLOGIES.DELETE
    },
    HOME_TRAINING: {
      GENERATE: endpoints.HOME_TRAINING.GENERATE(),
      SESSIONS: endpoints.HOME_TRAINING.SESSIONS(),
      SESSION_BY_ID: endpoints.HOME_TRAINING.SESSION_BY_ID,
      SESSION_COMPLETE: endpoints.HOME_TRAINING.SESSION_COMPLETE,
      TEMPLATES: endpoints.HOME_TRAINING.TEMPLATES()
    },
    STATS: {
      OVERVIEW: endpoints.STATS.OVERVIEW(),
      PROGRESS: endpoints.STATS.PROGRESS(),
      ACHIEVEMENTS: endpoints.STATS.ACHIEVEMENTS(),
      WEEKLY: endpoints.STATS.WEEKLY(),
      MONTHLY: endpoints.STATS.MONTHLY()
    }
  };

  return compatibleEndpoints;
})();

// =============================================================================
// ⚙️ CONFIGURACIÓN DE LA API
// =============================================================================

/**
 * Factory para crear configuración de API específica por ambiente
 * @param {Object} [config] - Configuración personalizada
 * @returns {Object} Configuración completa de API
 */
const createApiConfig = (config = CURRENT_CONFIG) => ({
  /**
   * Configuración de timeouts ajustada por ambiente
   */
  TIMEOUT: {
    DEFAULT: config.DEBUG ? 30000 : 10000,      // Más tiempo en desarrollo
    UPLOAD: config.DEBUG ? 60000 : 30000,       // Uploads más lentos en dev
    GENERATION: config.DEBUG ? 120000 : 60000,  // IA puede ser lenta en dev
    LONG_POLLING: 120000,                       // Constante para todos
    HEALTH_CHECK: 5000                          // Verificación rápida
  },

  /**
   * Headers por defecto con información del ambiente
   */
  HEADERS: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Client-Version': '2.0.0',
    'X-Environment': detectEnvironment(),
    'X-Debug': config.DEBUG ? 'true' : 'false',
    ...(config.DEBUG && { 'X-Debug-Features': JSON.stringify(config.FEATURES) })
  },

  /**
   * Configuración de reintentos adaptativa
   */
  RETRY: {
    ATTEMPTS: config.DEBUG ? 5 : 3,              // Más reintentos en desarrollo
    DELAY: config.DEBUG ? 2000 : 1000,           // Delay mayor en desarrollo
    BACKOFF_MULTIPLIER: 2,
    RETRYABLE_STATUSES: [408, 429, 500, 502, 503, 504],
    MAX_DELAY: 30000
  },

  /**
   * Códigos de estado HTTP con manejo específico
   */
  STATUS_CODES: {
    TOKEN_EXPIRED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    VALIDATION_ERROR: 422,
    SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
    RATE_LIMITED: 429
  },

  /**
   * Feature flags del ambiente actual
   */
  FEATURES: config.FEATURES,

  /**
   * Configuración de logging
   */
  LOGGING: {
    LEVEL: config.LOG_LEVEL,
    CONSOLE: config.DEBUG,
    NETWORK: config.DEBUG,
    ERRORS: true
  },

  /**
   * Configuración de mocking
   */
  MOCKING: {
    ENABLED: config.ENABLE_MOCKS,
    DELAY: config.DEBUG ? 1000 : 0,              // Simular latencia en desarrollo
    FAILURE_RATE: config.DEBUG ? 0.1 : 0         // 10% fallos en desarrollo
  }
});

// Configuración por defecto exportada
export const API_CONFIG = createApiConfig();

// =============================================================================
// 🔌 FUNCIONES DE UTILIDAD
// =============================================================================

/**
 * Verifica si la API está disponible
 * @param {Object} [config] - Configuración personalizada
 * @returns {Promise<boolean>} True si la API está disponible
 */
export const checkApiHealth = async (config = CURRENT_CONFIG) => {
  const baseUrl = getApiBaseUrl(config);
  const apiConfig = createApiConfig(config);

  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      timeout: apiConfig.TIMEOUT.HEALTH_CHECK,
      headers: {
        'Accept': 'application/json'
      }
    });
    return response.ok;
  } catch (error) {
    if (apiConfig.LOGGING.ERRORS) {
      console.error('🚨 API health check failed:', error);
    }
    return false;
  }
};

/**
 * Obtiene la versión de la API
 * @param {Object} [config] - Configuración personalizada
 * @returns {Promise<string|null>} Versión de la API o null si falla
 */
export const getApiVersion = async (config = CURRENT_CONFIG) => {
  const baseUrl = getApiBaseUrl(config);
  const apiConfig = createApiConfig(config);

  try {
    const response = await fetch(`${baseUrl}/api/version`, {
      method: 'GET',
      timeout: apiConfig.TIMEOUT.HEALTH_CHECK,
      headers: apiConfig.HEADERS
    });

    if (response.ok) {
      const data = await response.json();
      return data.version;
    }
    return null;
  } catch (error) {
    if (apiConfig.LOGGING.ERRORS) {
      console.error('🚨 Failed to get API version:', error);
    }
    return null;
  }
};

/**
 * Verifica si una feature flag está habilitada
 * @param {string} featureName - Nombre de la feature
 * @param {Object} [config] - Configuración personalizada
 * @returns {boolean} True si la feature está habilitada
 */
export const isFeatureEnabled = (featureName, config = CURRENT_CONFIG) => {
  const features = config.FEATURES || {};
  return features[featureName] === true;
};

/**
 * Obtiene información completa del ambiente actual
 * @returns {Object} Información del ambiente y configuración
 */
export const getEnvironmentInfo = () => ({
  environment: detectEnvironment(),
  config: CURRENT_CONFIG,
  baseUrl: getApiBaseUrl(),
  features: CURRENT_CONFIG.FEATURES,
  debug: CURRENT_CONFIG.DEBUG,
  version: '2.0.0'
});

/**
 * Logs de debugging condicional
 * @param {string} message - Mensaje a logear
 * @param {any} data - Datos adicionales
 * @param {Object} [config] - Configuración personalizada
 */
export const debugLog = (message, data = null, config = CURRENT_CONFIG) => {
  if (config.DEBUG && config.LOG_LEVEL !== 'silent') {
    console.log(`🔧 [API Debug] ${message}`, data || '');
  }
};

// =============================================================================
// 🧪 TESTING Y MOCKING
// =============================================================================

/**
 * Crea una configuración de testing con mocks
 * @param {Object} overrides - Configuración específica para tests
 * @returns {Object} Configuración completa de testing
 */
export const createTestConfig = (overrides = {}) => ({
  ...ENVIRONMENT_CONFIG.test,
  ...overrides,
  ENABLE_MOCKS: true,
  DEBUG: false
});

/**
 * Factory para crear endpoints de testing
 * @param {Object} [testConfig] - Configuración específica de test
 * @returns {Object} Endpoints configurados para testing
 */
export const createTestApiEndpoints = (testConfig = createTestConfig()) => {
  return createApiEndpoints(testConfig);
};

/**
 * Mock simple para simular respuestas de API
 * @param {string} endpoint - Endpoint a mockear
 * @param {Object} mockResponse - Respuesta simulada
 * @param {number} [delay] - Delay en ms (opcional)
 * @returns {Promise} Promesa con respuesta mockeada
 */
export const mockApiResponse = async (endpoint, mockResponse, delay = 0) => {
  if (delay > 0) {
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  return {
    ok: true,
    status: 200,
    json: async () => mockResponse,
    text: async () => JSON.stringify(mockResponse),
    url: endpoint
  };
};

/**
 * Utilidad para testing: Crea endpoints con URL base personalizada
 * @param {string} testBaseUrl - URL base para testing
 * @returns {Object} Endpoints configurados para la URL de test
 */
export const createTestApiWithUrl = (testBaseUrl) => {
  const testConfig = {
    ...createTestConfig(),
    API_URL: testBaseUrl
  };
  return createApiEndpoints(testConfig);
};

// =============================================================================
// 📤 EXPORTACIONES
// =============================================================================

// Factories principales
export {
  createApiEndpoints,
  createApiConfig,
  createEndpointBuilder,
  getEnvironmentConfig,
  detectEnvironment
};

// Helpers para uso externo
export {
  buildUrl,
  buildResourceUrl,
  getApiBaseUrl
};

// Configuración activa
export {
  CURRENT_CONFIG as CONFIG,
  ENVIRONMENT_CONFIG
};

// Export por defecto para compatibilidad hacia atrás
export default API_ENDPOINTS;

// =============================================================================
// 📋 EJEMPLOS DE USO
// =============================================================================

/*

// ✅ USO BÁSICO (Compatible con código existente)
import API_ENDPOINTS from './config/api.js';
const response = await fetch(API_ENDPOINTS.AUTH.LOGIN);

// ✅ USO AVANZADO: Diferentes ambientes
import { createApiEndpoints, createTestConfig } from './config/api.js';
const testApi = createApiEndpoints(createTestConfig({ API_URL: 'http://localhost:3003' }));
const response = await fetch(testApi.AUTH.LOGIN());

// ✅ USO EN TESTING
import { createTestApiWithUrl, mockApiResponse } from './config/api.js';
const testApi = createTestApiWithUrl('http://mock-server:3000');
const mockResponse = await mockApiResponse('/test', { success: true });

// ✅ FEATURE FLAGS
import { isFeatureEnabled } from './config/api.js';
if (isFeatureEnabled('ANALYTICS')) {
  // Código de analytics
}

// ✅ DEBUGGING
import { debugLog, getEnvironmentInfo } from './config/api.js';
debugLog('Estado de la aplicación', getEnvironmentInfo());

*/