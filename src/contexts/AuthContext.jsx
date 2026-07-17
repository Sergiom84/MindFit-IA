/**
 * 🔐 AuthContext Refactorizado - Sistema de Autenticación Empresarial
 *
 * NUEVAS FUNCIONALIDADES:
 * - Token refresh automático y silencioso
 * - Control de inactividad con warnings
 * - Detección online/offline con queue de requests
 * - Rate limiting contra ataques de fuerza bruta
 * - Session analytics y métricas de uso
 * - Soporte multi-device con sincronización
 * - Storage robusto contra corrupciones
 * - Error handling avanzado con retry
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// Importar utilidades especializadas
import tokenManager from '../utils/tokenManager';
import sessionManager from '../utils/sessionManager';
import connectionManager from '../utils/connectionManager';

// Importar configuración centralizada
import {
  AUTH_ENDPOINTS,
  TIMEOUT_CONFIG,
  SECURITY_CONFIG,
  STORAGE_KEYS,
  ANALYTICS_CONFIG,
  MULTI_DEVICE_CONFIG
} from '../config/authConfig';

// =============================================================================
// 🔐 CONTEXT Y HOOK PRINCIPAL
// =============================================================================

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// =============================================================================
// 🚨 SISTEMA DE RATE LIMITING
// =============================================================================

class RateLimiter {
  constructor() {
    this.attempts = new Map();
  }

  canAttempt(key = 'global') {
    const now = Date.now();
    const attempt = this.attempts.get(key);

    if (!attempt) {
      this.attempts.set(key, { count: 1, firstAttempt: now, lockedUntil: null });
      return true;
    }

    // Si está bloqueado
    if (attempt.lockedUntil && now < attempt.lockedUntil) {
      return false;
    }

    // Reset window si pasó el tiempo
    if (now - attempt.firstAttempt > SECURITY_CONFIG.RATE_LIMIT_WINDOW) {
      this.attempts.set(key, { count: 1, firstAttempt: now, lockedUntil: null });
      return true;
    }

    // Incrementar intentos
    attempt.count++;

    // Si excedió el límite, bloquear
    if (attempt.count > SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS) {
      attempt.lockedUntil = now + SECURITY_CONFIG.LOCKOUT_DURATION;
      return false;
    }

    return true;
  }

  getRemainingTime(key = 'global') {
    const attempt = this.attempts.get(key);
    if (!attempt?.lockedUntil) return 0;

    const remaining = attempt.lockedUntil - Date.now();
    return Math.max(0, remaining);
  }

  reset(key = 'global') {
    this.attempts.delete(key);
  }
}

// =============================================================================
// 🏪 STORAGE MANAGER ROBUSTO
// =============================================================================

class StorageManager {
  static isAvailable() {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, 'test');
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  static get(key, defaultValue = null) {
    if (!this.isAvailable()) return defaultValue;

    try {
      const value = localStorage.getItem(key);
      if (value === null) return defaultValue;

      // Intentar parsear JSON, si falla devolver string
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      console.error(`Error getting ${key} from storage:`, error);
      return defaultValue;
    }
  }

  static set(key, value) {
    if (!this.isAvailable()) return false;

    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      localStorage.setItem(key, stringValue);
      return true;
    } catch (error) {
      console.error(`Error setting ${key} in storage:`, error);

      // Intentar limpiar storage si está lleno
      if (error.name === 'QuotaExceededError') {
        this.cleanup();
        try {
          const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
          localStorage.setItem(key, stringValue);
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }

  static remove(key) {
    if (!this.isAvailable()) return;

    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing ${key} from storage:`, error);
    }
  }

  static cleanup() {
    console.log('Cleaning up localStorage...');
    // Remover datos antiguos no críticos
    const keysToCheck = [STORAGE_KEYS.LOGIN_HISTORY, STORAGE_KEYS.SESSION_ANALYTICS];
    keysToCheck.forEach(key => this.remove(key));
  }
}

// =============================================================================
// 📊 ANALYTICS MANAGER
// =============================================================================

class AnalyticsManager {
  constructor() {
    this.eventQueue = [];
    this.flushTimer = null;
  }

  track(event, data = {}) {
    if (!ANALYTICS_CONFIG[`TRACK_${event.toUpperCase()}`]) return;

    const eventData = {
      event,
      data,
      timestamp: Date.now(),
      sessionId: StorageManager.get(STORAGE_KEYS.SESSION_ID),
      deviceId: this.getDeviceId(),
      ...this.getContextData()
    };

    this.eventQueue.push(eventData);

    // Auto-flush si es evento crítico
    if (['LOGIN', 'LOGOUT', 'SESSION_TIMEOUT'].includes(event.toUpperCase())) {
      this.flush();
    } else {
      this.scheduleFlush();
    }
  }

  getContextData() {
    const data = {};

    if (ANALYTICS_CONFIG.CAPTURE_USER_AGENT) {
      data.userAgent = navigator.userAgent;
    }

    if (ANALYTICS_CONFIG.CAPTURE_SCREEN_SIZE) {
      data.screenSize = { width: screen.width, height: screen.height };
    }

    if (ANALYTICS_CONFIG.CAPTURE_CONNECTION_TYPE) {
      data.connection = navigator.connection?.effectiveType || 'unknown';
    }

    return data;
  }

  getDeviceId() {
    let deviceId = StorageManager.get(STORAGE_KEYS.DEVICE_ID);
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      StorageManager.set(STORAGE_KEYS.DEVICE_ID, deviceId);
    }
    return deviceId;
  }

  scheduleFlush() {
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.flush();
    }, ANALYTICS_CONFIG.ANALYTICS_FLUSH_INTERVAL);
  }

  flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.eventQueue.length === 0) return;

    // Guardar en localStorage para envío posterior
    const existingAnalytics = StorageManager.get(STORAGE_KEYS.SESSION_ANALYTICS, []);
    const updatedAnalytics = [...existingAnalytics, ...this.eventQueue].slice(-ANALYTICS_CONFIG.MAX_SESSION_ANALYTICS);

    StorageManager.set(STORAGE_KEYS.SESSION_ANALYTICS, updatedAnalytics);

    console.log('Analytics flushed:', this.eventQueue);
    this.eventQueue = [];
  }
}

// =============================================================================
// 🔥 AUTH PROVIDER PRINCIPAL
// =============================================================================

export const AuthProvider = ({ children }) => {
  // Estados principales
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionState, setConnectionState] = useState({ isOnline: true });
  const [sessionInfo, setSessionInfo] = useState(null);

  // Referencias para managers
  const rateLimiter = useRef(new RateLimiter());
  const analytics = useRef(new AnalyticsManager());
  const navigate = useNavigate();

  // =============================================================================
  // 🚀 INICIALIZACIÓN
  // =============================================================================

  useEffect(() => {
    initializeAuth();

    // Cleanup al desmontar
    return () => {
      tokenManager.destroy();
      sessionManager.destroy();
      connectionManager.destroy();
      analytics.current.flush();
    };
  }, []);

  const initializeAuth = async () => {
    try {
      console.log('Initializing enhanced auth system...');

      // Inicializar token manager
      const hasValidToken = tokenManager.initialize();

      if (hasValidToken) {
        // Cargar datos de usuario
        await loadUserData();

        // Inicializar session manager
        sessionManager.setCallbacks({
          onInactivityWarning: handleInactivityWarning,
          onSessionTimeout: handleSessionTimeout,
          onActivityDetected: handleActivityDetected
        });
        sessionManager.initialize();

        // Inicializar connection manager
        connectionManager.setCallbacks({
          onConnectionChange: handleConnectionChange,
          onOfflineRequestQueued: handleOfflineRequest,
          onQueueProcessed: handleQueueProcessed
        });
        connectionManager.initialize();

        setIsAuthenticated(true);
        analytics.current.track('AUTH_RESTORED');
      } else {
        setIsAuthenticated(false);
      }

      // Configurar listeners de eventos globales
      setupEventListeners();

    } catch (error) {
      console.error('Error initializing auth:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  // =============================================================================
  // 🔄 GESTIÓN DE DATOS DE USUARIO
  // =============================================================================

  const loadUserData = async () => {
    try {
      const userData = StorageManager.get(STORAGE_KEYS.USER);
      if (userData && userData.id) {
        setUser(userData);
        return userData;
      }

      // Fallback defensivo: si la clave de usuario está corrupta pero hay token,
      // intentar recuperar datos desde la clave legacy 'user' para evitar logout por recarga.
      const token = (typeof tokenManager?.getToken === 'function')
        ? tokenManager.getToken()
        : (tokenManager.getToken() || tokenManager.getToken());
      const legacyUser = StorageManager.get('user');
      if (token && legacyUser && legacyUser.id) {
        // Sincronizar con la clave moderna y continuar
        StorageManager.set(STORAGE_KEYS.USER, legacyUser);
        setUser(legacyUser);
        return legacyUser;
      }

      // Si no hay forma de recuperar datos, limpiar sesión de forma segura
      await performLogout(false, 'corrupted_data');
      return null;
    } catch (error) {
      console.error('Error loading user data:', error);
      await performLogout(false, 'load_error');
      return null;
    }
  };

  // =============================================================================
  // 📧 LOGIN CON RATE LIMITING Y ANALYTICS
  // =============================================================================

  const login = async (credentials) => {
    try {
      const clientId = analytics.current.getDeviceId();

      // Verificar rate limiting
      if (!rateLimiter.current.canAttempt(clientId)) {
        const remainingTime = rateLimiter.current.getRemainingTime(clientId);
        const minutes = Math.ceil(remainingTime / 60000);

        throw new Error(`Demasiados intentos de login. Intenta de nuevo en ${minutes} minutos.`);
      }

      analytics.current.track('LOGIN_ATTEMPT', {
        email: credentials.email?.substring(0, 3) + '***' // Email parcial para privacy
      });

      // Realizar login
      const response = await fetch(AUTH_ENDPOINTS.LOGIN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error en login');
      }

      const { user: userData, token, refreshToken } = await response.json();

      // Guardar tokens
      tokenManager.setTokens(token, refreshToken);

      // Guardar datos de usuario
      StorageManager.set(STORAGE_KEYS.USER, userData);
      setUser(userData);
      setIsAuthenticated(true);

      // Generar session ID única
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      StorageManager.set(STORAGE_KEYS.SESSION_ID, sessionId);

      // Inicializar managers
      sessionManager.initialize();
      connectionManager.initialize();

      // Reset rate limiting en login exitoso
      rateLimiter.current.reset(clientId);

      // Analytics
      analytics.current.track('LOGIN', {
        userId: userData.id,
        sessionId,
        method: 'password'
      });

      console.log('Login successful');
      return { success: true, user: userData };

    } catch (error) {
      console.error('Login error:', error);
      analytics.current.track('LOGIN_FAILED', {
        error: error.message,
        timestamp: Date.now()
      });

      throw error;
    }
  };

  // =============================================================================
  // 🚪 LOGOUT CON CLEANUP COMPLETO
  // =============================================================================

  const logout = async (reason = 'manual') => {
    // Solo notificar al servidor en logout manual/solicitado por usuario
    const notifyServer = (reason === 'manual' || reason === 'user_requested');
    await performLogout(notifyServer, reason);
  };

  const performLogout = async (notifyServer = true, reason = 'manual') => {
    try {
      const sessionData = sessionManager.getSessionInfo();

      analytics.current.track('LOGOUT', {
        reason,
        sessionDuration: sessionData?.sessionDuration || 0
      });

      // Notificar al servidor si es necesario
      if (notifyServer && connectionManager.getConnectionState().isOnline) {
        const token = tokenManager.getToken();
        if (token) {
          try {
            await connectionManager.executeRequest(AUTH_ENDPOINTS.LOGOUT, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                reason,
                sessionData: {
                  duration: sessionData?.sessionDuration,
                  lastActivity: sessionData?.lastActivity
                }
              })
            });
          } catch (error) {
            console.warn('Could not notify server of logout:', error);
          }
        }
      }

      // Cleanup completo
      await cleanupSession();

      // Navegar a login
      navigate('/login');

    } catch (error) {
      console.error('Error during logout:', error);

      // Force cleanup en caso de error
      await cleanupSession();
      navigate('/login');
    }
  };

  const cleanupSession = async () => {
    // Limpiar tokens
    tokenManager.removeTokens();

    // Limpiar datos de usuario
    StorageManager.remove(STORAGE_KEYS.USER);

    // Preservar datos de recovery para rutinas (compatibilidad hacia atrás)
    const currentMethodologyPlanId = StorageManager.get('currentMethodologyPlanId') ||
                                    StorageManager.get(STORAGE_KEYS.METHODOLOGY_PLAN_ID);
    if (currentMethodologyPlanId) {
      StorageManager.set('lastMethodologyPlanId', currentMethodologyPlanId);
      StorageManager.set(STORAGE_KEYS.LAST_METHODOLOGY_PLAN_ID, currentMethodologyPlanId);
    }

    // Limpiar datos sensibles de sesión (mantener compatibilidad)
    StorageManager.remove('currentRoutineSessionId');
    StorageManager.remove('currentRoutineSessionStartAt');
    StorageManager.remove(STORAGE_KEYS.ROUTINE_SESSION_ID);
    StorageManager.remove(STORAGE_KEYS.SESSION_ID);

    // Cleanup managers
    sessionManager.cleanup();
    connectionManager.cleanup();

    // Flush analytics antes de limpiar
    analytics.current.flush();

    // Actualizar estados
    setUser(null);
    setIsAuthenticated(false);
    setSessionInfo(null);
  };

  // =============================================================================
  // ⚠️ HANDLERS DE EVENTOS DE SESIÓN
  // =============================================================================

  const handleInactivityWarning = useCallback((data) => {
    console.log('Inactivity warning:', data);
    setSessionInfo(prev => ({ ...prev, showInactivityWarning: true, ...data }));
    analytics.current.track('INACTIVITY_WARNING', data);
  }, []);

  const handleSessionTimeout = useCallback((data) => {
    console.log('Session timeout:', data);
    analytics.current.track('SESSION_TIMEOUT', data);
    performLogout(false, data.reason);
  }, []);

  const handleActivityDetected = useCallback((timestamp) => {
    setSessionInfo(prev => ({ ...prev, lastActivity: timestamp, showInactivityWarning: false }));
  }, []);

  const handleConnectionChange = useCallback((data) => {
    console.log('Connection change:', data);
    setConnectionState(data);
    analytics.current.track('CONNECTION_STATE', data);
  }, []);

  const handleOfflineRequest = useCallback((request) => {
    console.log('Request queued offline:', request);
  }, []);

  const handleQueueProcessed = useCallback((results) => {
    console.log('Offline queue processed:', results);
    analytics.current.track('OFFLINE_QUEUE_PROCESSED', results);
  }, []);

  // =============================================================================
  // 🎧 EVENT LISTENERS GLOBALES
  // =============================================================================

  const setupEventListeners = () => {
    // Token refresh events
    window.addEventListener('tokenRefreshed', handleTokenRefreshed);
    window.addEventListener('tokenRefreshFailed', handleTokenRefreshFailed);

    // Session events
    window.addEventListener('inactivityWarning', (e) => {
      setSessionInfo(prev => ({ ...prev, showInactivityWarning: true }));
    });

    window.addEventListener('inactivityWarningDismissed', () => {
      setSessionInfo(prev => ({ ...prev, showInactivityWarning: false }));
    });

    // Connection events
    window.addEventListener('connectionOnline', () => {
      setConnectionState(prev => ({ ...prev, isOnline: true }));
    });

    window.addEventListener('connectionOffline', () => {
      setConnectionState(prev => ({ ...prev, isOnline: false }));
    });
  };

  const handleTokenRefreshed = (event) => {
    console.log('Token refreshed successfully');
    analytics.current.track('TOKEN_REFRESH', { success: true });
  };

  const handleTokenRefreshFailed = (event) => {
    console.error('Token refresh failed:', event.detail.error);
    analytics.current.track('TOKEN_REFRESH', {
      success: false,
      error: event.detail.error
    });

    // Si falla el refresh, hacer logout
    performLogout(false, 'token_refresh_failed');
  };

  // =============================================================================
  // 🔍 UTILIDADES PÚBLICAS (Compatibilidad hacia atrás)
  // =============================================================================

  const checkAuthStatus = useCallback(async () => {
    return loadUserData();
  }, []);

  const getConnectionState = useCallback(() => {
    return connectionManager.getConnectionState();
  }, []);

  const getSessionInfo = useCallback(() => {
    return sessionManager.getSessionInfo();
  }, []);

  const dismissInactivityWarning = useCallback(() => {
    sessionManager.dismissInactivityWarning();
  }, []);

  // Función de login simplificada para compatibilidad hacia atrás
  const simpleLogin = (userData, token) => {
    // Guardar con el nuevo sistema pero mantener interfaz anterior
    StorageManager.set('token', token); // Compatibilidad
    StorageManager.set('user', userData); // Compatibilidad

    tokenManager.setTokens(token);
    StorageManager.set(STORAGE_KEYS.USER, userData);
    setUser(userData);
    setIsAuthenticated(true);

    // Inicializar sistemas
    sessionManager.initialize();
    connectionManager.initialize();

    analytics.current.track('LOGIN', {
      userId: userData.id,
      method: 'simple'
    });
  };

  // =============================================================================
  // 📤 CONTEXT VALUE
  // =============================================================================

  const value = {
    // Estados básicos (compatibilidad hacia atrás)
    user,
    isAuthenticated,
    isLoading,

    // Funciones principales
    login: simpleLogin, // Para compatibilidad hacia atrás
    loginAdvanced: login, // Nueva función avanzada
    logout,
    checkAuthStatus,

    // Estados avanzados
    connectionState,
    sessionInfo,

    // Utilidades
    getConnectionState,
    getSessionInfo,
    dismissInactivityWarning,

    // Para debugging (solo development)
    ...(process.env.NODE_ENV === 'development' && {
      _debug: {
        tokenManager,
        sessionManager,
        connectionManager,
        rateLimiter: rateLimiter.current,
        analytics: analytics.current
      }
    })
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};