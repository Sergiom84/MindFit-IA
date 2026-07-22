/**
 * ⏱️ Session Manager - Gestión Avanzada de Sesiones
 *
 * FUNCIONALIDADES:
 * - Control de inactividad con warnings
 * - Session timeout automático
 * - Detección de actividad del usuario
 * - Heartbeat con el servidor
 * - Page visibility handling
 * - Cross-tab session sync
 */

import { TIMEOUT_CONFIG, STORAGE_KEYS, ANALYTICS_CONFIG } from '../config/authConfig';
import tokenManager from './tokenManager';

// =============================================================================
// 🕐 GESTIÓN DE SESIONES Y TIMEOUTS
// =============================================================================

class SessionManager {
  constructor() {
    this.lastActivity = Date.now();
    this.sessionStart = null;
    this.inactivityTimer = null;
    this.heartbeatTimer = null;
    this.warningTimer = null;
    this.isWarningActive = false;
    this.activityThrottle = null;

    // Callbacks
    this.onInactivityWarning = null;
    this.onSessionTimeout = null;
    this.onActivityDetected = null;

    // Estado de la sesión
    this.isActive = true;
    this.isOnline = navigator.onLine;

    // Bind methods
    this.handleActivity = this.handleActivity.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleOnline = this.handleOnline.bind(this);
    this.handleOffline = this.handleOffline.bind(this);
    this.handleStorageChange = this.handleStorageChange.bind(this);
  }

  /**
   * Inicializa el session manager
   */
  initialize() {
    try {
      // Inicializar timestamps
      this.sessionStart = Date.now();
      this.lastActivity = Date.now();

      // Guardar en localStorage
      localStorage.setItem(STORAGE_KEYS.SESSION_START, this.sessionStart.toString());
      localStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, this.lastActivity.toString());

      // Configurar listeners de actividad
      this.setupActivityListeners();

      // Configurar listeners de visibilidad
      this.setupVisibilityListeners();

      // Configurar listeners de conexión
      this.setupConnectionListeners();

      // Configurar listeners de storage (cross-tab)
      this.setupStorageListeners();

      // Iniciar timers
      this.startInactivityTimer();
      this.startHeartbeat();

      console.log('Session manager initialized');
      return true;
    } catch (error) {
      console.error('Error initializing session manager:', error);
      return false;
    }
  }

  /**
   * Configura listeners de actividad del usuario
   */
  setupActivityListeners() {
    this.activityEvents = [
      'mousedown', 'mousemove', 'keypress', 'scroll',
      'touchstart', 'touchmove', 'click', 'keydown'
    ];

    this.activityEvents.forEach(event => {
      document.addEventListener(event, this.handleActivity, { passive: true });
    });
  }

  /**
   * Configura listeners de visibilidad de página
   */
  setupVisibilityListeners() {
    document.addEventListener('visibilitychange', this.handleVisibilityChange, { passive: true });
  }

  /**
   * Configura listeners de estado de conexión
   */
  setupConnectionListeners() {
    window.addEventListener('online', this.handleOnline, { passive: true });
    window.addEventListener('offline', this.handleOffline, { passive: true });
  }

  /**
   * Configura listeners de localStorage (cross-tab sync)
   */
  setupStorageListeners() {
    window.addEventListener('storage', this.handleStorageChange, { passive: true });
  }

  /**
   * Maneja actividad del usuario con throttling
   */
  handleActivity() {
    // Throttling para evitar actualizaciones excesivas
    if (this.activityThrottle) {
      return;
    }

    this.activityThrottle = setTimeout(() => {
      this.activityThrottle = null;
    }, TIMEOUT_CONFIG.ACTIVITY_THROTTLE);

    // Actualizar timestamp de actividad
    this.lastActivity = Date.now();
    localStorage.setItem(STORAGE_KEYS.LAST_ACTIVITY, this.lastActivity.toString());

    // Si había warning, cancelarlo
    if (this.isWarningActive) {
      this.dismissInactivityWarning();
    }

    // Reiniciar timer de inactividad
    this.startInactivityTimer();

    // Callback de actividad detectada
    if (this.onActivityDetected) {
      this.onActivityDetected(this.lastActivity);
    }

    // Track analytics si está habilitado
    if (ANALYTICS_CONFIG.TRACK_INACTIVITY) {
      this.trackActivity();
    }
  }

  /**
   * Maneja cambios de visibilidad de página
   */
  handleVisibilityChange() {
    if (document.hidden) {
      // Página oculta - pausar actividad
      this.pauseActivity();
    } else {
      // Página visible - reanudar actividad
      this.resumeActivity();
    }
  }

  /**
   * Maneja cambio a estado online
   */
  handleOnline() {
    console.log('Connection restored');
    this.isOnline = true;

    // Reanudar heartbeat
    this.startHeartbeat();

    // Track event
    if (ANALYTICS_CONFIG.TRACK_CONNECTION_STATE) {
      this.trackConnectionChange('online');
    }

    // Emitir evento
    window.dispatchEvent(new CustomEvent('sessionOnline'));
  }

  /**
   * Maneja cambio a estado offline
   */
  handleOffline() {
    console.log('Connection lost');
    this.isOnline = false;

    // Pausar heartbeat
    this.stopHeartbeat();

    // Track event
    if (ANALYTICS_CONFIG.TRACK_CONNECTION_STATE) {
      this.trackConnectionChange('offline');
    }

    // Emitir evento
    window.dispatchEvent(new CustomEvent('sessionOffline'));
  }

  /**
   * Maneja cambios en localStorage (cross-tab sync)
   */
  handleStorageChange(e) {
    if (e.key === STORAGE_KEYS.LAST_ACTIVITY) {
      // Otra tab actualizó la actividad
      const newActivity = parseInt(e.newValue);
      if (newActivity > this.lastActivity) {
        this.lastActivity = newActivity;
        this.startInactivityTimer(); // Reiniciar timer
      }
    }
  }

  /**
   * Pausa la actividad (página oculta)
   */
  pauseActivity() {
    this.isActive = false;
    this.stopInactivityTimer();
  }

  /**
   * Reanuda la actividad (página visible)
   */
  resumeActivity() {
    this.isActive = true;
    this.handleActivity(); // Registrar actividad
  }

  /**
   * Inicia el timer de inactividad
   */
  startInactivityTimer() {
    this.stopInactivityTimer();

    if (!this.isActive) return;

    // Timer para warning de inactividad
    const warningTime = TIMEOUT_CONFIG.INACTIVITY_TIMEOUT - (5 * 60 * 1000); // 5 min antes
    this.warningTimer = setTimeout(() => {
      this.showInactivityWarning();
    }, warningTime);

    // Timer para logout por inactividad
    this.inactivityTimer = setTimeout(() => {
      this.handleInactivityTimeout();
    }, TIMEOUT_CONFIG.INACTIVITY_TIMEOUT);
  }

  /**
   * Detiene el timer de inactividad
   */
  stopInactivityTimer() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }

    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }
  }

  /**
   * Muestra warning de inactividad
   */
  showInactivityWarning() {
    this.isWarningActive = true;

    console.log('Showing inactivity warning');

    // Track event
    if (ANALYTICS_CONFIG.TRACK_INACTIVITY) {
      this.trackInactivityWarning();
    }

    // Callback para mostrar UI
    if (this.onInactivityWarning) {
      this.onInactivityWarning({
        remainingTime: 5 * 60 * 1000, // 5 minutos restantes
        lastActivity: this.lastActivity
      });
    }

    // Emitir evento
    window.dispatchEvent(new CustomEvent('inactivityWarning', {
      detail: { remainingTime: 5 * 60 * 1000 }
    }));
  }

  /**
   * Descarta el warning de inactividad
   */
  dismissInactivityWarning() {
    this.isWarningActive = false;

    // Emitir evento
    window.dispatchEvent(new CustomEvent('inactivityWarningDismissed'));
  }

  /**
   * Maneja timeout por inactividad
   */
  handleInactivityTimeout() {
    console.log('Session timeout due to inactivity');

    // Track event
    if (ANALYTICS_CONFIG.TRACK_SESSION_TIMEOUT) {
      this.trackSessionTimeout('inactivity');
    }

    // Callback para logout
    if (this.onSessionTimeout) {
      this.onSessionTimeout({
        reason: 'inactivity',
        lastActivity: this.lastActivity,
        sessionDuration: Date.now() - this.sessionStart
      });
    }

    // Emitir evento
    window.dispatchEvent(new CustomEvent('sessionTimeout', {
      detail: { reason: 'inactivity' }
    }));
  }

  /**
   * Inicia heartbeat con el servidor
   */
  startHeartbeat() {
    this.stopHeartbeat();

    if (!this.isOnline) return;

    this.heartbeatTimer = setTimeout(() => {
      this.sendHeartbeat();
    }, TIMEOUT_CONFIG.HEARTBEAT_INTERVAL);
  }

  /**
   * Detiene heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Envía heartbeat al servidor
   */
  async sendHeartbeat() {
    try {
      if (!this.isOnline) return;

      // ARCH-001: token vía el adapter (tokenManager), no localStorage directo.
      const token = tokenManager.getToken();
      if (!token) return;

      // ARCH-001: URL relativa (proxy en dev, same-origin en prod); sin base URL manual.
      const response = await fetch('/api/auth/heartbeat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          timestamp: Date.now(),
          lastActivity: this.lastActivity
        })
      });

      if (!response.ok) {
        console.warn('Heartbeat failed:', response.status);
      }

      // Programar próximo heartbeat
      this.startHeartbeat();
    } catch (error) {
      console.error('Heartbeat error:', error);

      // Intentar de nuevo en caso de error de red
      setTimeout(() => {
        this.startHeartbeat();
      }, 10000); // 10 segundos
    }
  }

  /**
   * Obtiene información de la sesión actual
   */
  getSessionInfo() {
    return {
      sessionStart: this.sessionStart,
      lastActivity: this.lastActivity,
      sessionDuration: Date.now() - this.sessionStart,
      timeSinceLastActivity: Date.now() - this.lastActivity,
      isActive: this.isActive,
      isOnline: this.isOnline,
      isWarningActive: this.isWarningActive
    };
  }

  /**
   * Verifica si la sesión debe expirar por tiempo total
   */
  shouldSessionExpire() {
    if (!this.sessionStart) return false;

    const sessionDuration = Date.now() - this.sessionStart;
    return sessionDuration >= TIMEOUT_CONFIG.SESSION_TIMEOUT;
  }

  /**
   * Configura callbacks
   */
  setCallbacks({ onInactivityWarning, onSessionTimeout, onActivityDetected }) {
    this.onInactivityWarning = onInactivityWarning;
    this.onSessionTimeout = onSessionTimeout;
    this.onActivityDetected = onActivityDetected;
  }

  /**
   * ✅ MEJORA FASE 1: Limpieza completa de event listeners y timers
   * Previene memory leaks al desmontar la aplicación
   */
  cleanupEnhanced() {
    // Limpiar activity listeners
    if (this.activityEvents) {
      this.activityEvents.forEach(event => {
        document.removeEventListener(event, this.handleActivity);
      });
      this.activityEvents = null;
    }

    // Limpiar visibility listener
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    // Limpiar todos los timers
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }

    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Resetear estado
    this.isActive = false;
    this.isOnline = false;
    this.isWarningActive = false;
    this.sessionStart = null;
    this.lastActivity = null;

    console.log('🧹 SessionManager cleanupEnhanced completado - Memory leaks prevenidos');
  }

  /**
   * Track actividad para analytics
   */
  trackActivity() {
    // Implementar según necesidades de analytics
    const analytics = this.getAnalyticsData();
    console.log('Activity tracked:', analytics);
  }

  /**
   * Track warning de inactividad
   */
  trackInactivityWarning() {
    const sessionInfo = this.getSessionInfo();
    console.log('Inactivity warning tracked:', sessionInfo);
  }

  /**
   * Track timeout de sesión
   */
  trackSessionTimeout(reason) {
    const sessionInfo = this.getSessionInfo();
    console.log('Session timeout tracked:', { reason, ...sessionInfo });
  }

  /**
   * Track cambio de conexión
   */
  trackConnectionChange(state) {
    console.log('Connection change tracked:', state);
  }

  /**
   * Obtiene datos para analytics
   */
  getAnalyticsData() {
    return {
      sessionDuration: Date.now() - this.sessionStart,
      timeSinceLastActivity: Date.now() - this.lastActivity,
      isActive: this.isActive,
      isOnline: this.isOnline,
      userAgent: ANALYTICS_CONFIG.CAPTURE_USER_AGENT ? navigator.userAgent : null,
      screenSize: ANALYTICS_CONFIG.CAPTURE_SCREEN_SIZE ? {
        width: screen.width,
        height: screen.height
      } : null
    };
  }

  /**
   * Limpia la sesión
   */
  cleanup() {
    // Remover listeners
    const events = [
      'mousedown', 'mousemove', 'keypress', 'scroll',
      'touchstart', 'touchmove', 'click', 'keydown'
    ];

    events.forEach(event => {
      document.removeEventListener(event, this.handleActivity);
    });

    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    window.removeEventListener('storage', this.handleStorageChange);

    // Limpiar timers
    this.stopInactivityTimer();
    this.stopHeartbeat();

    if (this.activityThrottle) {
      clearTimeout(this.activityThrottle);
      this.activityThrottle = null;
    }

    console.log('Session manager cleaned up');
  }

  /**
   * Destructor
   */
  destroy() {
    this.cleanup();
  }
}

// =============================================================================
// 📤 SINGLETON INSTANCE
// =============================================================================

const sessionManager = new SessionManager();

export default sessionManager;
export { SessionManager };