/**
 * 🌐 API Client Refactorizado - Integración Completa del Ecosistema
 *
 * MEJORAS IMPLEMENTADAS:
 * - Integración con tokenManager (refresh automático)
 * - Integración con connectionManager (offline/online)
 * - Integración con sessionManager (heartbeat)
 * - Cache inteligente de respuestas GET
 * - Exponential backoff para retries
 * - Request deduplication
 * - Manejo avanzado de errores 401
 */

import logger from '../utils/logger';
import tokenManager from '../utils/tokenManager';
import connectionManager from '../utils/connectionManager';
import sessionManager from '../utils/sessionManager';
import { getApiBaseUrl } from '../config/api';

import { track as traceTrack } from '../utils/trace';

class ApiClient {
  constructor(baseURL = '', options = {}) {
    this.baseURL = baseURL;
    this.defaultOptions = {
      timeout: 10000,
      retries: 3,
      retryDelay: 1000,
      exponentialBackoff: true,
      cache: false,
      deduplicate: true,
      ...options
    };

    // Interceptors
    this.requestInterceptors = [];
    this.responseInterceptors = [];
    this.errorInterceptors = [];

    // Cache y deduplicación
    this.responseCache = new Map();
    this.pendingRequests = new Map();

    // Inicializar integraciones
    this.initializeIntegrations();
  }

  /**
   * Inicializa integraciones con el ecosistema refactorizado
   */
  initializeIntegrations() {
    // Integración con connectionManager para estado online/offline
    if (typeof window !== 'undefined') {
      window.addEventListener('connectionOnline', () => {
        logger.info('Conexión restaurada, procesando requests pendientes', null, 'ApiClient');
      });

      window.addEventListener('connectionOffline', () => {
        logger.warn('Conexión perdida, requests serán encolados', null, 'ApiClient');
      });
    }
  }

  /**
   * Obtener token de autenticación (integrado con tokenManager)
   */
  getAuthToken() {
    return tokenManager.getToken();
  }

  /**
   * Obtener headers por defecto (con token actualizado)
   */
  getDefaultHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };

    const token = this.getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Header para indicar actividad de sesión
    if (sessionManager) {
      headers['X-Session-Activity'] = Date.now().toString();
    }

    return headers;
  }

  /**
   * Genera clave de cache para requests GET
   */
  getCacheKey(url, options = {}) {
    const cacheOptions = {
      method: options.method || 'GET',
      headers: options.headers,
      body: options.body
    };
    return `${url}:${JSON.stringify(cacheOptions)}`;
  }

  /**
   * Verifica si una respuesta está en cache y es válida
   */
  getCachedResponse(cacheKey, ttl = 300000) { // 5 minutos por defecto
    const cached = this.responseCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < ttl) {
      return cached.data;
    }
    return null;
  }

  /**
   * Guarda respuesta en cache
   */
  setCachedResponse(cacheKey, data) {
    // Limitar tamaño del cache
    if (this.responseCache.size > 50) {
      const firstKey = this.responseCache.keys().next().value;
      this.responseCache.delete(firstKey);
    }

    this.responseCache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Calcula delay para retry con exponential backoff
   */
  calculateRetryDelay(attempt, baseDelay = 1000, exponential = true) {
    if (!exponential) return baseDelay;

    const delay = baseDelay * Math.pow(2, attempt);
    const jitter = delay * 0.1 * Math.random(); // 10% jitter
    return Math.min(delay + jitter, 30000); // Max 30 segundos
  }

  /**
   * Ejecutar interceptors de request
   */
  async executeRequestInterceptors(url, options) {
    let processedOptions = { ...options };

    for (const interceptor of this.requestInterceptors) {
      try {
        const result = await interceptor(url, processedOptions);
        if (result) {
          processedOptions = result;
        }
      } catch (error) {
        logger.error('Error en request interceptor', error, 'ApiClient');
      }
    }

    return processedOptions;
  }

  /**
   * Ejecutar interceptors de response
   */
  async executeResponseInterceptors(response, requestUrl) {
    let processedResponse = response;

    for (const interceptor of this.responseInterceptors) {
      try {
        const result = await interceptor(processedResponse, requestUrl);
        if (result) {
          processedResponse = result;
        }
      } catch (error) {
        logger.error('Error en response interceptor', error, 'ApiClient');
      }
    }

    return processedResponse;
  }

  /**
   * Ejecutar interceptors de error
   */
  async executeErrorInterceptors(error, requestUrl) {
    for (const interceptor of this.errorInterceptors) {
      try {
        const result = await interceptor(error, requestUrl);
        if (result) {
          return result; // Interceptor manejó el error
        }
      } catch (interceptorError) {
        logger.error('Error en error interceptor', interceptorError, 'ApiClient');
      }
    }

    throw error; // Re-lanzar si ningún interceptor manejó el error
  }

  /**
   * Petición avanzada con todas las mejoras integradas
   */
  async request(url, options = {}) {
    const fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`;
    const requestOptions = {
      ...this.defaultOptions,
      ...options,
      headers: {
        ...this.getDefaultHeaders(),
        ...options.headers
      }
    };

    // 1. VERIFICAR CACHE PARA REQUESTS GET
    const method = (requestOptions.method || 'GET').toUpperCase();
    if (method === 'GET' && requestOptions.cache !== false) {
      const cacheKey = this.getCacheKey(fullUrl, requestOptions);
      const cached = this.getCachedResponse(cacheKey, requestOptions.cacheTTL);
      if (cached) {
        logger.debug('Respuesta servida desde cache', { url: fullUrl }, 'ApiClient');
        return cached;
      }
    }

    // 2. DEDUPLICACIÓN DE REQUESTS
    if (requestOptions.deduplicate !== false) {
      const requestKey = this.getCacheKey(fullUrl, requestOptions);
      if (this.pendingRequests.has(requestKey)) {
        logger.debug('Request duplicado, esperando respuesta existente', { url: fullUrl }, 'ApiClient');
        return await this.pendingRequests.get(requestKey);
      }

      // Crear promise para deduplicación
      const requestPromise = this.executeRequest(fullUrl, requestOptions);
      this.pendingRequests.set(requestKey, requestPromise);

      try {
        const result = await requestPromise;
        this.pendingRequests.delete(requestKey);
        return result;
      } catch (error) {
        this.pendingRequests.delete(requestKey);
        throw error;
      }
    }

    return await this.executeRequest(fullUrl, requestOptions);
  }

  /**
   * Ejecuta la petición real con todas las mejoras
   */
  async executeRequest(fullUrl, requestOptions) {
    // Aplicar interceptors de request
    const processedOptions = await this.executeRequestInterceptors(fullUrl, requestOptions);

    logger.api.request(processedOptions.method || 'GET', fullUrl, processedOptions.body);

    // 3. USAR CONNECTIONMANAGER PARA MANEJO OFFLINE/ONLINE
    try {
      const response = await connectionManager.executeRequest(fullUrl, {
        method: processedOptions.method || 'GET',
        headers: processedOptions.headers,
        body: processedOptions.body
      }, {
        expectedStatus: 200,
        cacheKey: `api-${fullUrl}`,
        timeout: processedOptions.timeout
      });

      if (response && response.ok) {
        // Aplicar interceptors de response
        const processedResponse = await this.executeResponseInterceptors(response, fullUrl);

        logger.api.response(
          processedOptions.method || 'GET',
          fullUrl,
          processedResponse.status
        );

        // Parsear y cachear respuesta
        const result = await this.parseResponse(processedResponse);

        // Cachear respuestas GET exitosas
        const method = (processedOptions.method || 'GET').toUpperCase();
        if (method === 'GET' && processedOptions.cache !== false) {
          const cacheKey = this.getCacheKey(fullUrl, processedOptions);
          this.setCachedResponse(cacheKey, result);
        }

        return result;
      } else if (response && !response.ok) {
        // Manejo de respuestas no OK (verificar que sea una Response válida)
        const txt = await response.text();
        let data;
        try { data = JSON.parse(txt); } catch { data = { message: txt }; }
        const err = new Error(data?.error || data?.message || `HTTP ${response.status}: ${response.statusText}`);
        err.status = response.status;
        err.data = data;
        throw err;
      }
    } catch (error) {
      // MANEJO ESPECIAL: Errores de offline queuing
      if (error.name === 'OfflineQueuedError') {
        logger.info('Request queued for offline processing', { url: fullUrl, queueId: error.queueId }, 'ApiClient');
        // Retornar respuesta simulada para que el flujo continúe
        // El request se procesará cuando vuelva la conexión
        return {
          queued: true,
          queueId: error.queueId,
          message: 'Request queued for offline processing'
        };
      }

      // 4. MANEJO AVANZADO DE ERRORES 401 CON TOKEN REFRESH
      if (error.status === 401) {
        logger.warn('Token inválido, intentando refresh automático', { url: fullUrl }, 'ApiClient');

        try {
          const refreshResult = await tokenManager.refreshTokenSilently();
          if (refreshResult && refreshResult.success) {
            logger.info('Token refreshed exitosamente, reintentando request', { url: fullUrl }, 'ApiClient');

            // Actualizar headers con nuevo token
            const updatedOptions = {
              ...processedOptions,
              headers: {
                ...processedOptions.headers,
                'Authorization': `Bearer ${tokenManager.getToken()}`
              }
            };

            // Reintentar con nuevo token
            return await this.executeRequestWithRetry(fullUrl, updatedOptions);
          }
        } catch (refreshError) {
          logger.error('Falló el refresh automático de token', refreshError, 'ApiClient');
        }
      }

      // Aplicar interceptors de error
      return await this.executeErrorInterceptors(error, fullUrl);
    }
  }

  /**
   * Ejecuta request con retry y exponential backoff
   */
  async executeRequestWithRetry(fullUrl, processedOptions) {
    let lastError = null;
    const maxRetries = processedOptions.retries || 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Usar fetch directo para retry (connectionManager ya se intentó)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), processedOptions.timeout);

        const fetchOptions = {
          method: processedOptions.method,
          headers: processedOptions.headers,
          body: processedOptions.body,
          signal: controller.signal
        };

        const response = await fetch(fullUrl, fetchOptions);
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          let errorData;

          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { message: errorText };
          }

          const error = new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
          error.status = response.status;
          error.data = errorData;

          throw error;
        }

        // Aplicar interceptors de response
        const processedResponse = await this.executeResponseInterceptors(response, fullUrl);

        logger.api.response(
          processedOptions.method || 'GET',
          fullUrl,
          processedResponse.status
        );

        return await this.parseResponse(processedResponse);

      } catch (error) {
        lastError = error;

        // No reintentar para ciertos errores
        if (error.status === 401 || error.status === 403 || error.name === 'AbortError') {
          break;
        }

        // Si no es el último intento, esperar antes del retry
        if (attempt < maxRetries) {
          const delay = this.calculateRetryDelay(attempt, processedOptions.retryDelay, processedOptions.exponentialBackoff);
          logger.warn(`Reintentando petición (${attempt + 1}/${maxRetries + 1}) en ${delay}ms`, { url: fullUrl }, 'ApiClient');
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  /**
   * Parsea respuesta según content-type
   */
  async parseResponse(response) {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }
    return response;
  }

  // Métodos HTTP principales
  async get(url, options = {}) {
    return this.request(url, { ...options, method: 'GET' });
  }

  async post(url, data = null, options = {}) {
    return this.request(url, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined
    });
  }

  async put(url, data = null, options = {}) {
    return this.request(url, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined
    });
  }

  async patch(url, data = null, options = {}) {
    return this.request(url, {
      ...options,
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined
    });
  }

  async delete(url, options = {}) {
    return this.request(url, { ...options, method: 'DELETE' });
  }

  // Métodos para gestionar interceptors
  addRequestInterceptor(interceptor) {
    this.requestInterceptors.push(interceptor);
  }

  addResponseInterceptor(interceptor) {
    this.responseInterceptors.push(interceptor);
  }

  addErrorInterceptor(interceptor) {
    this.errorInterceptors.push(interceptor);
  }

  removeRequestInterceptor(interceptor) {
    const index = this.requestInterceptors.indexOf(interceptor);
    if (index > -1) {
      this.requestInterceptors.splice(index, 1);
    }
  }

  removeResponseInterceptor(interceptor) {
    const index = this.responseInterceptors.indexOf(interceptor);
    if (index > -1) {
      this.responseInterceptors.splice(index, 1);
    }
  }

  removeErrorInterceptor(interceptor) {
    const index = this.errorInterceptors.indexOf(interceptor);
    if (index > -1) {
      this.errorInterceptors.splice(index, 1);
    }
  }
}

// Instancia principal del cliente API
const apiClient = new ApiClient(`${getApiBaseUrl()}/api`);

// Interceptor de error mejorado con integración tokenManager
apiClient.addErrorInterceptor(async (error, url) => {
  if (error.status === 401) {
    logger.warn('Error 401 - Token inválido detectado', { url }, 'ApiClient');

    // Usar tokenManager para limpiar tokens correctamente
    tokenManager.removeTokens();

    // Solo redirigir si no estamos ya en login
    if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
      logger.warn('Redirigiendo a login por token expirado', null, 'ApiClient');

      // Emitir evento para que otros componentes sepan
      window.dispatchEvent(new CustomEvent('authTokenExpired', {
        detail: { url, timestamp: Date.now() }
      }));

      // Usar setTimeout para evitar conflictos con navegación React
      setTimeout(() => {
        window.location.href = '/login';
      }, 100);
    }
  }

  return null; // No manejar el error, dejarlo pasar
});

// Interceptor de request para actividad de sesión
apiClient.addRequestInterceptor((url, options) => {
  // Registrar actividad en sessionManager si existe
  if (sessionManager && typeof sessionManager.handleActivity === 'function') {
    sessionManager.handleActivity();
  }

  // Trace de request
  try {
    traceTrack('API_REQUEST', { url, method: (options?.method || 'GET').toUpperCase() }, { component: 'ApiClient' });
  } catch (e) { console.warn('Track error:', e); }

  return options; // No modificar options
});

// Interceptor de response para logging automático
apiClient.addResponseInterceptor((response, url) => {
  // Trace de response
  try {
    traceTrack('API_RESPONSE', { url, status: response.status, ok: response.ok }, { component: 'ApiClient' });
  } catch (e) { console.warn('Track error:', e); }

  if (!response.ok) {
    logger.api.error(response.status >= 500 ? 'Server Error' : 'Client Error', url, {
      status: response.status,
      statusText: response.statusText
    });
  }

  return response; // No modificar la response
});

export default apiClient;
export { ApiClient };
