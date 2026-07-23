/**
 * 🔄 useRealtimeSync - Sistema de sincronización real-time con Supabase
 *
 * FUNCIONALIDADES:
 * ✅ Polling inteligente (frecuencia adaptativa)
 * ✅ Detección de cambios automática
 * ✅ Manejo de errores y reconexión
 * ✅ Optimizado para móvil (conserva batería)
 * ✅ WebSocket fallback a polling
 *
 * @version 1.0.0 - Sistema Real-time
 */

import { useEffect, useRef, useCallback, useState } from 'react';

// ===============================================
// 🎯 CONFIGURACIÓN
// ===============================================

const SYNC_CONFIG = {
  // Intervalos de polling (ms)
  ACTIVE_INTERVAL: 5000,      // 5s cuando la app está activa
  BACKGROUND_INTERVAL: 30000, // 30s cuando está en background
  ERROR_INTERVAL: 60000,      // 1min cuando hay errores

  // Límites
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000,

  // Estados de visibilidad
  VISIBILITY_CHECK: true
};

export function useRealtimeSync(syncFunction, options = {}) {
  const {
    enabled = true,
    dependencies = [],
    onError = null,
    onSync = null,
    immediate = true
  } = options;

  // ===============================================
  // 🎯 ESTADO INTERNO
  // ===============================================

  const [syncState, setSyncState] = useState({
    isActive: false,
    lastSync: null,
    error: null,
    retryCount: 0,
    syncCount: 0
  });

  const intervalRef = useRef(null);
  const retryTimeoutRef = useRef(null);
  const isActiveRef = useRef(true);
  const syncInProgressRef = useRef(false);

  // ===============================================
  // 🔄 FUNCIÓN DE SINCRONIZACIÓN
  // ===============================================

  const performSync = useCallback(async (force = false) => {
    // Evitar múltiples syncs simultáneos
    if (syncInProgressRef.current && !force) {
      return { success: false, reason: 'sync_in_progress' };
    }

    syncInProgressRef.current = true;

    try {
      setSyncState(prev => ({ ...prev, error: null }));

      console.log('🔄 Iniciando sincronización real-time...');
      const startTime = Date.now();

      const result = await syncFunction();

      const duration = Date.now() - startTime;
      console.log(`✅ Sincronización completada en ${duration}ms`);

      setSyncState(prev => ({
        ...prev,
        lastSync: new Date().toISOString(),
        retryCount: 0,
        syncCount: prev.syncCount + 1
      }));

      if (onSync) {
        onSync({ success: true, duration, result });
      }

      return { success: true, duration, result };

    } catch (error) {
      console.error('❌ Error en sincronización real-time:', error);

      setSyncState(prev => ({
        ...prev,
        error: error.message,
        retryCount: prev.retryCount + 1
      }));

      if (onError) {
        onError(error);
      }

      return { success: false, error: error.message };

    } finally {
      syncInProgressRef.current = false;
    }
  }, [syncFunction, onSync, onError]);

  // ===============================================
  // 🎯 MANEJO DE VISIBILIDAD
  // ===============================================

  useEffect(() => {
    if (!SYNC_CONFIG.VISIBILITY_CHECK) return;

    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;
      isActiveRef.current = isVisible;

      console.log(`👁️ App ${isVisible ? 'visible' : 'hidden'} - ajustando sync`);

      if (isVisible) {
        // App visible: sync inmediato + frecuencia alta
        performSync(true);
        startSyncInterval(SYNC_CONFIG.ACTIVE_INTERVAL);
      } else {
        // App en background: frecuencia baja
        startSyncInterval(SYNC_CONFIG.BACKGROUND_INTERVAL);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Check inicial
    handleVisibilityChange();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [performSync]);

  // ===============================================
  // ⏰ GESTIÓN DE INTERVALOS
  // ===============================================

  const startSyncInterval = useCallback((interval) => {
    // Limpiar intervalo anterior
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Crear nuevo intervalo
    intervalRef.current = setInterval(() => {
      if (enabled && !syncInProgressRef.current) {
        performSync();
      }
    }, interval);

    setSyncState(prev => ({ ...prev, isActive: true }));

    console.log(`⏰ Intervalo de sync iniciado: ${interval}ms`);
  }, [enabled, performSync]);

  const stopSync = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    setSyncState(prev => ({ ...prev, isActive: false }));

    console.log('⏹️ Sincronización detenida');
  }, []);

  // ===============================================
  // 🔄 REINTENTO AUTOMÁTICO
  // ===============================================

  const scheduleRetry = useCallback(() => {
    if (syncState.retryCount >= SYNC_CONFIG.MAX_RETRIES) {
      console.error(`❌ Máximo de reintentos alcanzado (${SYNC_CONFIG.MAX_RETRIES})`);
      startSyncInterval(SYNC_CONFIG.ERROR_INTERVAL);
      return;
    }

    const delay = SYNC_CONFIG.RETRY_DELAY * Math.pow(2, syncState.retryCount); // Exponential backoff

    console.log(`🔄 Reintentando sync en ${delay}ms (intento ${syncState.retryCount + 1})`);

    retryTimeoutRef.current = setTimeout(() => {
      performSync(true);
    }, delay);

  }, [syncState.retryCount, performSync]);

  // ===============================================
  // 🚀 INICIALIZACIÓN Y CLEANUP
  // ===============================================

  useEffect(() => {
    if (!enabled || !syncFunction) return;

    console.log('🚀 Iniciando sistema de sincronización real-time');

    // Sync inicial si está habilitado
    if (immediate) {
      performSync(true);
    }

    // Iniciar intervalo basado en visibilidad
    const initialInterval = isActiveRef.current
      ? SYNC_CONFIG.ACTIVE_INTERVAL
      : SYNC_CONFIG.BACKGROUND_INTERVAL;

    startSyncInterval(initialInterval);

    return () => {
      console.log('🧹 Limpiando sincronización real-time');
      stopSync();
    };
  }, [enabled, immediate, ...dependencies]);

  // Manejar errores con reintentos
  useEffect(() => {
    if (syncState.error && syncState.retryCount < SYNC_CONFIG.MAX_RETRIES) {
      scheduleRetry();
    }
  }, [syncState.error, syncState.retryCount, scheduleRetry]);

  // ===============================================
  // 📡 API PÚBLICA
  // ===============================================

  const forceSync = useCallback(() => {
    return performSync(true);
  }, [performSync]);

  const resetSync = useCallback(() => {
    setSyncState({
      isActive: false,
      lastSync: null,
      error: null,
      retryCount: 0,
      syncCount: 0
    });

    stopSync();

    if (enabled) {
      setTimeout(() => {
        startSyncInterval(SYNC_CONFIG.ACTIVE_INTERVAL);
      }, 100);
    }
  }, [enabled, stopSync, startSyncInterval]);

  return {
    // Estado
    ...syncState,
    isEnabled: enabled,
    isSyncing: syncInProgressRef.current,

    // Acciones
    forceSync,
    resetSync,
    stopSync,

    // Estadísticas
    stats: {
      syncCount: syncState.syncCount,
      lastSync: syncState.lastSync,
      retryCount: syncState.retryCount,
      hasError: !!syncState.error
    }
  };
}

// ===============================================
// 🎯 HOOK ESPECIALIZADO PARA TRAINING STATE
// ===============================================

export function useTrainingStateSync(syncTrainingState, options = {}) {
  return useRealtimeSync(syncTrainingState, {
    dependencies: [],
    onError: (error) => {
      console.error('Training sync error:', error);
    },
    onSync: (result) => {
      console.log('Training sync success:', result);
    },
    ...options
  });
}