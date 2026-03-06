/**
 * 👤 UserContext Refactorizado - Gestión Inteligente de Perfiles
 *
 * MEJORAS IMPLEMENTADAS:
 * - Integración con connectionManager para soporte offline
 * - Cache inteligente con invalidación automática
 * - Migración de localStorage directo a tokenManager
 * - Validación robusta de datos fitness
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';

// Integración con utilidades del ecosistema
import tokenManager from '../utils/tokenManager';
import connectionManager from '../utils/connectionManager';
import { STORAGE_KEYS } from '../config/authConfig';

// =============================================================================
// 🏋️ VALIDACIONES DE DATOS FITNESS
// =============================================================================

const FITNESS_VALIDATIONS = {
  peso: {
    min: 30,
    max: 300,
    required: false,
    validator: (value) => {
      const num = parseFloat(value);
      return !isNaN(num) && num >= 30 && num <= 300;
    },
    message: 'El peso debe estar entre 30 y 300 kg'
  },
  altura: {
    min: 100,
    max: 250,
    required: false,
    validator: (value) => {
      const num = parseFloat(value);
      return !isNaN(num) && num >= 100 && num <= 250;
    },
    message: 'La altura debe estar entre 100 y 250 cm'
  },
  edad: {
    min: 13,
    max: 100,
    required: false,
    validator: (value) => {
      const num = parseInt(value);
      return !isNaN(num) && num >= 13 && num <= 100;
    },
    message: 'La edad debe estar entre 13 y 100 años'
  },
  objetivo_principal: {
    required: false,
    validator: (value) => {
      const validObjectives = [
        'perder_peso',
        'ganar_musculo',
        'ganar_masa_muscular',
        'ganar_peso',
        'tonificar',
        'mejorar_resistencia',
        'fuerza',
        'mantener_forma',
        'mantenimiento',
        'rehabilitacion',
        'mejorar_flexibilidad',
        'salud_general',
        'resistencia',
        'flexibilidad'
      ];
      return !value || validObjectives.includes(value);
    },
    message: 'Objetivo no válido'
  },
  nivel_actual_entreno: {
    required: false,
    validator: (value) => {
      const validLevels = ['principiante', 'intermedio', 'avanzado'];
      return !value || validLevels.includes(value);
    },
    message: 'Nivel de entrenamiento no válido'
  },
  tiempo_disponible: {
    min: 15,
    max: 300,
    required: false,
    validator: (value) => {
      if (!value) return true;
      const num = parseInt(value);
      return !isNaN(num) && num >= 15 && num <= 300;
    },
    message: 'El tiempo disponible debe estar entre 15 y 300 minutos'
  }
};

/**
 * Valida datos de perfil fitness
 */
const validateUserData = (data) => {
  const errors = {};

  Object.keys(data).forEach(field => {
    const validation = FITNESS_VALIDATIONS[field];
    if (!validation) return;

    const value = data[field];

    // Verificar si es requerido
    if (validation.required && (!value || value === '')) {
      errors[field] = `${field} es requerido`;
      return;
    }

    // Si no es requerido y está vacío, skip validación
    if (!validation.required && (!value || value === '')) {
      return;
    }

    // Ejecutar validador personalizado
    if (validation.validator && !validation.validator(value)) {
      errors[field] = validation.message;
    }
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

// =============================================================================
// 💾 CACHE MANAGER PARA DATOS DE PERFIL
// =============================================================================

class ProfileCacheManager {
  constructor() {
    this.cache = new Map();
    this.cacheTimestamps = new Map();
    this.cacheTimeout = 10 * 60 * 1000; // 10 minutos
  }

  setCache(userId, data) {
    this.cache.set(userId, { ...data });
    this.cacheTimestamps.set(userId, Date.now());

    // También guardar en localStorage como backup
    try {
      localStorage.setItem(`${STORAGE_KEYS.USER}_${userId}_cache`, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.warn('Could not save profile cache to localStorage:', error);
    }
  }

  getCache(userId) {
    // Verificar cache en memoria primero
    if (this.cache.has(userId)) {
      const timestamp = this.cacheTimestamps.get(userId);
      if (Date.now() - timestamp < this.cacheTimeout) {
        return this.cache.get(userId);
      } else {
        // Cache expirado, limpiar
        this.cache.delete(userId);
        this.cacheTimestamps.delete(userId);
      }
    }

    // Intentar recuperar de localStorage
    try {
      const cached = localStorage.getItem(`${STORAGE_KEYS.USER}_${userId}_cache`);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < this.cacheTimeout) {
          // Restaurar a cache en memoria
          this.cache.set(userId, data);
          this.cacheTimestamps.set(userId, timestamp);
          return data;
        }
      }
    } catch (error) {
      console.warn('Error loading profile cache from localStorage:', error);
    }

    return null;
  }

  invalidateCache(userId) {
    this.cache.delete(userId);
    this.cacheTimestamps.delete(userId);

    try {
      localStorage.removeItem(`${STORAGE_KEYS.USER}_${userId}_cache`);
    } catch (error) {
      console.warn('Error removing profile cache:', error);
    }
  }

  clearAllCache() {
    this.cache.clear();
    this.cacheTimestamps.clear();
  }
}

// =============================================================================
// 🔄 CONTEXT PRINCIPAL
// =============================================================================

const UserContext = createContext();

export const useUserContext = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUserContext must be used within a UserProvider');
  }
  return context;
};

export const UserProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [userData, setUserData] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});

  // Referencias para managers
  const cacheManager = useRef(new ProfileCacheManager());

  // =============================================================================
  // 🔄 FUNCIONES MEJORADAS CON INTEGRACIÓN AL ECOSISTEMA
  // =============================================================================

  /**
   * Carga datos del perfil con cache inteligente y soporte offline
   */
  const loadUserProfile = useCallback(async (userId) => {
    if (!userId) return null;

    // 1. VERIFICAR CACHE PRIMERO
    const cachedData = cacheManager.current.getCache(userId);
    if (cachedData) {
      console.log('Loading profile from cache:', userId);
      setUserData(cachedData);
      return cachedData;
    }

    setIsLoading(true);
    setValidationErrors({});

    try {
      // 2. USAR TOKEN MANAGER INTEGRADO (no localStorage directo)
      const token = tokenManager.getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      // 3. USAR CONNECTION MANAGER (soporte offline + retry automático)
      const response = await connectionManager.executeRequest(`/api/users/${userId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }, {
        expectedStatus: 200,
        cacheKey: `user-profile-${userId}`
      });

      if (response && response.ok) {
        const responseData = await response.json();

        // El backend devuelve { user: {...} }, extraer el objeto user
        const profileData = responseData.user || responseData;

        // 4. GUARDAR EN CACHE
        cacheManager.current.setCache(userId, profileData);

        // 5. ACTUALIZAR ESTADO
        setUserData(profileData);

        console.log('✅ Profile loaded successfully:', userId, {
          peso: profileData.peso,
          altura: profileData.altura,
          edad: profileData.edad,
          sexo: profileData.sexo
        });
        return profileData;
      } else {
        throw new Error('Failed to load user profile');
      }

    } catch (error) {
      console.error('Error loading user profile:', error);

      // Si hay error, intentar usar datos antiguos del cache como fallback
      const fallbackData = cacheManager.current.getCache(userId, true); // Force expired cache
      if (fallbackData) {
        console.log('Using expired cache as fallback:', userId);
        setUserData(fallbackData);
        return fallbackData;
      }

      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Actualiza perfil con validación y optimistic updates
   */
  const updateUserProfile = useCallback(async (updates) => {
    if (!user?.id) {
      console.warn('No user ID available for profile update');
      return { success: false, error: 'User not authenticated' };
    }

    // 1. VALIDACIÓN DE DATOS FITNESS
    const validation = validateUserData(updates);
    if (!validation.isValid) {
      console.warn('Validation failed:', validation.errors);
      setValidationErrors(validation.errors);
      return {
        success: false,
        error: 'Validation failed',
        validationErrors: validation.errors
      };
    }

    // Limpiar errores de validación anteriores
    setValidationErrors({});

    try {
      // 2. OPTIMISTIC UPDATE (actualizar UI inmediatamente)
      const originalUserData = { ...userData };
      const optimisticData = { ...userData, ...updates };
      setUserData(optimisticData);

      // 3. USAR TOKEN MANAGER INTEGRADO
      const token = tokenManager.getToken();
      if (!token) {
        // Revertir cambio optimistic
        setUserData(originalUserData);
        throw new Error('No authentication token available');
      }

      // 4. USAR CONNECTION MANAGER (soporte offline + retry)
      const response = await connectionManager.executeRequest(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      }, {
        expectedStatus: 200,
        cacheKey: `user-profile-${user.id}`
      });

      if (response && response.ok) {
        const updatedData = await response.json();

        // 5. ACTUALIZAR CACHE Y ESTADO CON DATOS DEL SERVIDOR
        cacheManager.current.setCache(user.id, updatedData);
        setUserData(updatedData);

        console.log('Profile updated successfully:', user.id);
        return { success: true, data: updatedData };

      } else {
        // Revertir cambio optimistic si el servidor rechaza
        setUserData(originalUserData);
        const errorData = response ? await response.json() : { message: 'Update failed' };
        throw new Error(errorData.message || 'Failed to update profile');
      }

    } catch (error) {
      console.error('Error updating user profile:', error);

      // Revertir cambio optimistic en caso de error
      setUserData(userData);

      return {
        success: false,
        error: error.message || 'Failed to update profile'
      };
    }
  }, [user?.id, userData]);

  /**
   * Invalida cache manualmente (útil para refresh forzado)
   */
  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;

    cacheManager.current.invalidateCache(user.id);
    return loadUserProfile(user.id);
  }, [user?.id, loadUserProfile]);

  /**
   * Obtiene errores de validación para campos específicos
   */
  const getFieldError = useCallback((fieldName) => {
    return validationErrors[fieldName] || null;
  }, [validationErrors]);

  /**
   * Verifica si hay errores de validación
   */
  const hasValidationErrors = useCallback(() => {
    return Object.keys(validationErrors).length > 0;
  }, [validationErrors]);

  // =============================================================================
  // 🔄 EFFECTS Y CLEANUP
  // =============================================================================

  // Cargar perfil cuando el usuario se autentica
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      loadUserProfile(user.id);
    } else {
      setUserData({});
      setValidationErrors({});

      // Limpiar cache si no hay usuario autenticado
      if (!isAuthenticated) {
        cacheManager.current.clearAllCache();
      }
    }
  }, [isAuthenticated, user?.id, loadUserProfile]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      cacheManager.current.clearAllCache();
    };
  }, []);

  // =============================================================================
  // 📤 CONTEXT VALUE CON NUEVAS FUNCIONALIDADES
  // =============================================================================

  const value = {
    // Estados básicos (compatibilidad hacia atrás)
    userData,
    setUserData,
    isLoading,

    // Funciones principales mejoradas
    loadUserProfile,
    updateUserProfile,

    // Nuevas funcionalidades
    refreshProfile,
    validationErrors,
    getFieldError,
    hasValidationErrors,

    // Utilidades
    validateUserData: (data) => validateUserData(data),

    // Para debugging (solo development)
    ...(process.env.NODE_ENV === 'development' && {
      _debug: {
        cacheManager: cacheManager.current,
        fitnessValidations: FITNESS_VALIDATIONS
      }
    })
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};
