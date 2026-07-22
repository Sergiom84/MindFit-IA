/**
 * 💾 useLocalStorage - Hook para persistencia en localStorage
 * 
 * RAZONAMIENTO:
 * - Patrón repetido: localStorage.getItem/setItem + useState
 * - Sincronización automática entre pestañas
 * - Serialización automática de objetos
 * - Fallback para errores de localStorage
 */

import { useState, useEffect, useCallback } from 'react';
import logger from '../utils/logger';

/**
 * Hook para gestionar datos en localStorage con sincronización
 */
export const useLocalStorage = (key, defaultValue = null, options = {}) => {
  const {
    serialize = JSON.stringify,
    deserialize = JSON.parse,
    syncAcrossTabs = true,
    context = 'LocalStorage'
  } = options;

  // Estado inicial desde localStorage
  const [value, setValue] = useState(() => {
    try {
      const storedValue = localStorage.getItem(key);
      
      if (storedValue !== null) {
        return deserialize(storedValue);
      }
      
      return defaultValue;
    } catch (error) {
      logger.error('Error leyendo localStorage', { key, error }, context);
      return defaultValue;
    }
  });

  // Función para actualizar valor
  const setStoredValue = useCallback((newValue) => {
    try {
      // Permitir funciones como en useState
      const valueToStore = typeof newValue === 'function' ? newValue(value) : newValue;
      
      setValue(valueToStore);
      
      if (valueToStore === null || valueToStore === undefined) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, serialize(valueToStore));
      }
      
      logger.debug('Valor guardado en localStorage', { key, value: valueToStore }, context);
      
    } catch (error) {
      logger.error('Error guardando en localStorage', { key, error }, context);
    }
  }, [key, value, serialize, context]);

  // Función para remover valor
  const removeValue = useCallback(() => {
    try {
      localStorage.removeItem(key);
      setValue(defaultValue);
      logger.debug('Valor removido de localStorage', { key }, context);
    } catch (error) {
      logger.error('Error removiendo de localStorage', { key, error }, context);
    }
  }, [key, defaultValue, context]);

  // Sincronización entre pestañas
  useEffect(() => {
    if (!syncAcrossTabs) return;

    const handleStorageChange = (e) => {
      if (e.key === key && e.newValue !== e.oldValue) {
        try {
          const newValue = e.newValue ? deserialize(e.newValue) : defaultValue;
          setValue(newValue);
          logger.debug('Valor sincronizado entre pestañas', { key, newValue }, context);
        } catch (error) {
          logger.error('Error sincronizando entre pestañas', { key, error }, context);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key, defaultValue, deserialize, syncAcrossTabs, context]);

  return [value, setStoredValue, removeValue];
};

/**
 * Hook especializado para objetos complejos
 */
export const useLocalStorageObject = (key, defaultValue = {}, options = {}) => {
  return useLocalStorage(key, defaultValue, {
    ...options,
    serialize: JSON.stringify,
    deserialize: JSON.parse
  });
};

/**
 * Hook especializado para arrays
 */
export const useLocalStorageArray = (key, defaultValue = [], options = {}) => {
  const [array, setArray, removeArray] = useLocalStorage(key, defaultValue, {
    ...options,
    serialize: JSON.stringify,
    deserialize: JSON.parse
  });

  const addItem = useCallback((item) => {
    setArray(prev => [...(prev || []), item]);
  }, [setArray]);

  const removeItem = useCallback((index) => {
    setArray(prev => (prev || []).filter((_, i) => i !== index));
  }, [setArray]);

  const updateItem = useCallback((index, newItem) => {
    setArray(prev => (prev || []).map((item, i) => i === index ? newItem : item));
  }, [setArray]);

  const clearArray = useCallback(() => {
    setArray([]);
  }, [setArray]);

  return {
    array: array || [],
    setArray,
    addItem,
    removeItem,
    updateItem,
    clearArray,
    removeArray,
    length: (array || []).length,
    isEmpty: !(array || []).length
  };
};

/**
 * Hook para gestión de configuración de usuario
 */
export const useUserConfig = (userId, defaultConfig = {}) => {
  const key = `userConfig_${userId}`;
  
  const [config, setConfig, removeConfig] = useLocalStorageObject(key, defaultConfig, {
    context: 'UserConfig'
  });

  const updateConfig = useCallback((updates) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, [setConfig]);

  const resetConfig = useCallback(() => {
    setConfig(defaultConfig);
  }, [setConfig, defaultConfig]);

  return {
    config,
    setConfig,
    updateConfig,
    resetConfig,
    removeConfig
  };
};

/**
 * Hook para cache con TTL (Time To Live)
 */
export const useCachedData = (key, ttlMs = 30 * 60 * 1000) => { // 30 minutos por defecto
  const [cache, setCache, removeCache] = useLocalStorageObject(`cache_${key}`, null, {
    context: 'Cache'
  });

  const isExpired = useCallback(() => {
    if (!cache || !cache.timestamp) return true;
    return Date.now() - cache.timestamp > ttlMs;
  }, [cache, ttlMs]);

  const getCachedData = useCallback(() => {
    if (isExpired()) {
      return null;
    }
    return cache?.data;
  }, [cache, isExpired]);

  const setCachedData = useCallback((data) => {
    setCache({
      data,
      timestamp: Date.now()
    });
  }, [setCache]);

  const clearCache = useCallback(() => {
    removeCache();
  }, [removeCache]);

  return {
    data: getCachedData(),
    setCachedData,
    clearCache,
    isExpired: isExpired(),
    hasData: Boolean(getCachedData())
  };
};

/**
 * Hook para mantener estado de formularios entre navegación
 */
export const useFormPersistence = (formId, initialValues = {}) => {
  const key = `form_${formId}`;
  
  const [values, setValues, removeValues] = useLocalStorageObject(key, initialValues, {
    context: 'FormPersistence'
  });

  const setValue = useCallback((name, value) => {
    setValues(prev => ({ ...prev, [name]: value }));
  }, [setValues]);

  const clearForm = useCallback(() => {
    removeValues();
  }, [removeValues]);

  const resetToDefault = useCallback(() => {
    setValues(initialValues);
  }, [setValues, initialValues]);

  return {
    values: values || initialValues,
    setValue,
    setValues,
    clearForm,
    resetToDefault,
    isDirty: JSON.stringify(values) !== JSON.stringify(initialValues)
  };
};

export default useLocalStorage;