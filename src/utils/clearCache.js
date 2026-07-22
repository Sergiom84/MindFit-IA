// Utility para limpiar todo el caché de la aplicación
import { CRITICAL_STORAGE_KEYS, ROUTINE_RELATED_KEYS, AUTH_STORAGE_KEYS } from '../config/storageKeys.js';

// ✅ MEJORA FASE 2: Usar storage keys centralizadas
const PROTECTED_KEYS = CRITICAL_STORAGE_KEYS;

export function clearApplicationCache(options = {}) {
  const { preserveCriticalData = true, forceComplete = false } = options;

  console.log('🧹 Limpiando caché de la aplicación...');

  // Backup de datos críticos si se solicita preservar
  let backup = {};
  if (preserveCriticalData && !forceComplete) {
    console.log('🛡️ Creando backup de datos críticos...');
    PROTECTED_KEYS.forEach(key => {
      const value = localStorage.getItem(key);
      if (value) {
        backup[key] = value;
        console.log(`📋 Backup creado para: ${key}`);
      }
    });
  }

  // Limpiar localStorage
  const localStorageKeys = Object.keys(localStorage);
  console.log('📦 Limpiando localStorage keys:', localStorageKeys);
  localStorage.clear();

  // Restaurar datos críticos si hay backup
  if (preserveCriticalData && !forceComplete && Object.keys(backup).length > 0) {
    console.log('🔄 Restaurando datos críticos...');
    Object.entries(backup).forEach(([key, value]) => {
      localStorage.setItem(key, value);
      console.log(`✅ Restaurado: ${key}`);
    });
  }
  
  // Limpiar sessionStorage
  const sessionStorageKeys = Object.keys(sessionStorage);
  console.log('📦 Limpiando sessionStorage keys:', sessionStorageKeys);
  sessionStorage.clear();
  
  // Limpiar caché de service workers si existen
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for(let registration of registrations) {
        registration.unregister();
      }
    });
  }
  
  // Forzar reload
  console.log('🔄 Recargando aplicación...');
  window.location.reload(true);
}

// Función para limpiar solo caché específico de rutinas
export function clearRoutineCache(preserveAuth = true) {
  console.log('🧹 Limpiando caché de rutinas...');

  // ✅ MEJORA FASE 2: Usar claves centralizadas
  const keysToRemove = [...ROUTINE_RELATED_KEYS];

  // ✅ MEJORA FASE 1: Opción de preservar autenticación
  if (!preserveAuth) {
    keysToRemove.push(AUTH_STORAGE_KEYS.USER_PROFILE);
  }

  keysToRemove.forEach(key => {
    const existed = localStorage.getItem(key) !== null;
    localStorage.removeItem(key);
    if (existed) {
      console.log(`❌ Removed: ${key}`);
    }
  });

  console.log('✅ Caché de rutinas limpiado', preserveAuth ? '(auth preservada)' : '');
}

// ✅ MEJORA FASE 1: Función de emergencia para limpiar TODO sin protección
export function emergencyCompleteWipe() {
  console.warn('🚨 EMERGENCIA: Limpieza completa sin protección de datos');

  // Confirmar con el usuario (solo en development)
  if (import.meta.env.DEV) {
    const confirmed = confirm('⚠️ EMERGENCIA: Se borrarán TODOS los datos incluyendo tokens. ¿Continuar?');
    if (!confirmed) {
      console.log('❌ Limpieza de emergencia cancelada por el usuario');
      return false;
    }
  }

  // Limpiar todo sin protección
  clearApplicationCache({ preserveCriticalData: false, forceComplete: true });

  console.warn('🚨 Limpieza de emergencia completada - TODOS los datos eliminados');
  return true;
}