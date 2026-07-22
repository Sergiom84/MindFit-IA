import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { API_ENDPOINTS } from '../config/api';

// Validación y parsing seguro de datos
const safeJSONParse = (data, fallback = {}) => {
  try {
    return typeof data === 'string' ? JSON.parse(data) : data || fallback;
  } catch (error) {
    console.warn('Error parsing JSON data:', error);
    return fallback;
  }
};

// Validador de estructura de sesión
const validateSessionData = (session) => {
  return {
    sessionId: session?.sessionId || session?.session_id || `temp-${Date.now()}`,
    deviceInfo: session?.deviceInfo || session?.user_agent_info || {},
    ipAddress: session?.ipAddress || session?.ip_address || 'Unknown',
    loginTime: session?.loginTime || session?.login_time || new Date().toISOString(),
    lastActivity: session?.lastActivity || session?.last_activity || session?.loginTime || session?.login_time,
    sessionAge: session?.sessionAge || session?.duration_seconds,
    isActive: session?.isActive ?? session?.is_active ?? true,
    logoutTime: session?.logoutTime || session?.logout_time,
    logoutType: session?.logoutType || session?.logout_type,
    durationSeconds: session?.durationSeconds || session?.duration_seconds
  };
};

export const useUserSessions = () => {
  const navigate = useNavigate();
  const { user, logout: contextLogout, getAuthToken } = useAuth();

  const [activeSessions, setActiveSessions] = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [sessionStats, setSessionStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Headers para requests autenticadas
  const getAuthHeaders = useCallback(() => {
    const token = getAuthToken();
    if (!token) {
      throw new Error('Token de autenticación no disponible');
    }

    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }, [getAuthToken]);

  // Función genérica para hacer requests con manejo de errores
  const apiRequest = useCallback(async (url, options = {}) => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(url, {
        ...options,
        headers: { ...headers, ...options.headers }
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Sesión expirada. Por favor, inicia sesión nuevamente.');
        }
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error.message.includes('fetch')) {
        throw new Error('Error de conexión. Verifica tu conexión a internet.');
      }
      throw error;
    }
  }, [getAuthHeaders]);

  // Cargar sesiones activas
  const loadActiveSessions = useCallback(async () => {
    try {
      setError(null);
      const data = await apiRequest(API_ENDPOINTS.AUTH.SESSIONS);

      const sessions = (data.activeSessions || []).map(validateSessionData);
      setActiveSessions(sessions);

      return sessions;
    } catch (error) {
      console.error('Error loading active sessions:', error);
      setError(error.message);
      return [];
    }
  }, [apiRequest]);

  // Cargar historial de sesiones
  const loadSessionHistory = useCallback(async (limit = 20) => {
    try {
      setError(null);
      const data = await apiRequest(`${API_ENDPOINTS.AUTH.SESSIONS_HISTORY}?limit=${limit}`);

      const history = (data.sessions || []).map(validateSessionData);
      setSessionHistory(history);

      return history;
    } catch (error) {
      console.error('Error loading session history:', error);
      setError(error.message);
      return [];
    }
  }, [apiRequest]);

  // Cargar estadísticas de sesiones
  const loadSessionStats = useCallback(async () => {
    try {
      setError(null);
      const data = await apiRequest(API_ENDPOINTS.AUTH.SESSIONS_STATS);

      setSessionStats(data.stats || null);
      return data.stats;
    } catch (error) {
      console.error('Error loading session stats:', error);
      setError(error.message);
      return null;
    }
  }, [apiRequest]);

  // Cerrar todas las sesiones
  const logoutAllSessions = useCallback(async () => {
    try {
      setError(null);
      const data = await apiRequest(API_ENDPOINTS.AUTH.LOGOUT_ALL, {
        method: 'POST',
        body: JSON.stringify({ reason: 'user_requested' })
      });

      // Limpiar estado local y hacer logout
      contextLogout();

      // Navegar usando React Router
      navigate('/login', {
        replace: true,
        state: { message: `${data.closedSessions || 'Todas las'} sesiones cerradas exitosamente.` }
      });

      return data;
    } catch (error) {
      console.error('Error logging out all sessions:', error);
      setError(error.message);
      throw error;
    }
  }, [apiRequest, contextLogout, navigate]);

  // Limpiar estados
  const clearState = useCallback(() => {
    setActiveSessions([]);
    setSessionHistory([]);
    setSessionStats(null);
    setError(null);
  }, []);

  // Efecto de limpieza al desmontar
  useEffect(() => {
    return () => clearState();
  }, [clearState]);

  // Utilidades para formateo
  const formatDuration = useCallback((duration) => {
    if (!duration) return 'Activa';

    if (typeof duration === 'number') {
      // Si es un número (segundos)
      const minutes = Math.floor(duration / 60);
      const hours = Math.floor(minutes / 60);

      if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
      }
      return `${minutes}m`;
    }

    // Si es un string con formato HH:MM:SS
    const match = duration.toString().match(/(\d+):(\d+):(\d+)/);
    if (match) {
      const hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    }

    return duration.toString();
  }, []);

  const getDeviceInfo = useCallback((deviceInfo) => {
    const info = safeJSONParse(deviceInfo, {});
    const ua = info?.userAgent || {};

    const platform = ua.platform || 'Desconocido';
    const browser = ua.browser || 'Desconocido';
    const version = ua.version || '';

    return `${platform} - ${browser}${version ? ` ${version}` : ''}`;
  }, []);

  const getDeviceType = useCallback((deviceInfo) => {
    const info = safeJSONParse(deviceInfo, {});
    const platform = info?.userAgent?.platform?.toLowerCase() || '';
    const mobile = info?.userAgent?.mobile;

    return mobile || platform.includes('android') || platform.includes('ios') ? 'mobile' : 'desktop';
  }, []);

  const getLogoutTypeLabel = useCallback((logoutType) => {
    const types = {
      'manual': 'Manual',
      'timeout': 'Timeout',
      'forced': 'Forzado',
      'system': 'Sistema'
    };
    return types[logoutType] || 'Desconocido';
  }, []);

  return {
    // Estado
    activeSessions,
    sessionHistory,
    sessionStats,
    loading,
    error,
    user,

    // Acciones
    loadActiveSessions,
    loadSessionHistory,
    loadSessionStats,
    logoutAllSessions,
    clearState,

    // Utilidades
    formatDuration,
    getDeviceInfo,
    getDeviceType,
    getLogoutTypeLabel,

    // Estado derivado
    hasActiveSessions: activeSessions.length > 0,
    hasMultipleSessions: activeSessions.length > 1
  };
};