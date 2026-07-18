/**
 * Sistema de Base de Datos de Ejercicios para Calistenia
 * Integra con la tabla unificada app.ejercicios (disciplina='calistenia') de PostgreSQL
 *
 * @author Claude Code - Arquitectura Modular para Metodologías
 * @version 2.0.0 - Refactored with centralized config and improved error handling
 */

import React from 'react';
import tokenManager from '../../../utils/tokenManager';
import { getApiBaseUrl } from '../../../config/api';

// Configuración centralizada de API
const API_CONFIG = {
  BASE_URL: `${getApiBaseUrl()}/api`,
  ENDPOINTS: {
    EXERCISES: '/exercises',
    CALISTENIA: '/exercises/calistenia'
  },
  TIMEOUT: 10000 // 10 segundos
};

// Sistema de logging centralizado
const Logger = {
  error: (message, error = null) => {
    console.error(`[ExerciseDatabase] ${message}`, error);
    // TODO: Integrar con sistema de monitoring (Sentry, etc.)
  },
  warn: (message, data = null) => {
    console.warn(`[ExerciseDatabase] ${message}`, data);
  },
  info: (message, data = null) => {
    if (import.meta.env.DEV) {
      console.info(`[ExerciseDatabase] ${message}`, data);
    }
  }
};

// Utilidades para manejo de API y autenticación
const APIUtils = {
  /**
   * Obtener token de autenticación de forma centralizada
   * @returns {string|null} Token JWT o null si no existe
   */
  getAuthToken() {
    try {
      return tokenManager.getToken();
    } catch (error) {
      Logger.error('Error accessing localStorage for auth token', error);
      return null;
    }
  },

  /**
   * Crear headers estándar para requests autenticados
   * @returns {Object} Headers HTTP
   */
  getAuthHeaders() {
    const token = this.getAuthToken();
    const headers = {
      'Content-Type': 'application/json'
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  },

  /**
   * Realizar request HTTP con manejo de errores consistente
   * @param {string} endpoint - Endpoint relativo
   * @param {Object} options - Opciones del fetch
   * @returns {Promise<Object>} Respuesta procesada
   */
  async makeRequest(endpoint, options = {}) {
    const url = `${API_CONFIG.BASE_URL}${endpoint}`;

    try {
      Logger.info(`Making request to: ${endpoint}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);

      const response = await fetch(url, {
        ...options,
        headers: { ...this.getAuthHeaders(), ...options.headers },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorMessage = `HTTP ${response.status}: ${response.statusText}`;

        if (response.status === 401) {
          Logger.warn('Authentication failed - token may be expired');
          // TODO: Trigger token refresh or redirect to login
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();
      Logger.info(`Request successful: ${endpoint}`, { status: response.status });

      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        Logger.error(`Request timeout: ${endpoint}`);
        throw new Error('Request timeout - please check your connection');
      }

      Logger.error(`Request failed: ${endpoint}`, error);
      throw error;
    }
  }
};

/**
 * Cliente para obtener ejercicios de calistenia desde la base de datos
 */
export class CalisteniaExerciseDatabase {
  
  /**
   * Obtener todos los ejercicios de calistenia
   * @returns {Promise<Array>} Lista de ejercicios
   */
  static async getAllExercises() {
    try {
      const data = await APIUtils.makeRequest(API_CONFIG.ENDPOINTS.CALISTENIA);
      return data.exercises || [];
    } catch (error) {
      Logger.error('Failed to load calistenia exercises', error);
      return [];
    }
  }
  
  /**
   * Filtrar ejercicios por nivel
   * @param {string} nivel - 'Básico', 'Intermedio', 'Avanzado'
   * @returns {Promise<Array>} Ejercicios filtrados por nivel
   */
  static async getExercisesByLevel(nivel) {
    const exercises = await this.getAllExercises();
    return exercises.filter(ex => ex.nivel.toLowerCase() === nivel.toLowerCase());
  }
  
  /**
   * Filtrar ejercicios por categoría
   * @param {string} categoria - 'Empuje', 'Tracción', 'Piernas', 'Core'
   * @returns {Promise<Array>} Ejercicios filtrados por categoría
   */
  static async getExercisesByCategory(categoria) {
    const exercises = await this.getAllExercises();
    return exercises.filter(ex => ex.categoria.toLowerCase() === categoria.toLowerCase());
  }
  
  /**
   * Obtener ejercicio específico por ID
   * @param {string} exerciseId - ID único del ejercicio
   * @returns {Promise<Object|null>} Ejercicio encontrado o null
   */
  static async getExerciseById(exerciseId) {
    if (!exerciseId) {
      Logger.warn('getExerciseById called with invalid exerciseId', { exerciseId });
      return null;
    }

    try {
      const data = await APIUtils.makeRequest(`${API_CONFIG.ENDPOINTS.CALISTENIA}/${exerciseId}`);
      return data.exercise || null;
    } catch (error) {
      Logger.error(`Failed to get exercise by ID: ${exerciseId}`, error);
      return null;
    }
  }
  
  /**
   * Obtener cadena de progresión para un ejercicio
   * @param {string} exerciseId - ID del ejercicio
   * @returns {Promise<Object>} Objeto con ejercicios anteriores y siguientes
   */
  static async getProgressionChain(exerciseId) {
    const exercises = await this.getAllExercises();
    const currentExercise = exercises.find(ex => ex.exercise_id === exerciseId);
    
    if (!currentExercise) {
      return { previous: null, current: null, next: null };
    }
    
    const previous = currentExercise.progresion_desde ? 
      exercises.find(ex => ex.exercise_id === currentExercise.progresion_desde) : null;
    
    const next = currentExercise.progresion_hacia ? 
      exercises.find(ex => ex.exercise_id === currentExercise.progresion_hacia) : null;
    
    return {
      previous,
      current: currentExercise,
      next
    };
  }
  
  /**
   * Obtener ejercicios recomendados para un nivel y objetivos específicos
   * @param {string} nivel - Nivel del usuario
   * @param {string[]} categorias - Categorías de interés ['Empuje', 'Tracción']
   * @param {string} equipamiento - Equipamiento disponible
   * @returns {Promise<Array>} Ejercicios recomendados
   */
  static async getRecommendedExercises(nivel, categorias = [], equipamiento = '') {
    const exercises = await this.getAllExercises();
    
    return exercises.filter(ex => {
      // Filtro por nivel (incluir niveles inferiores también)
      const levelOrder = { 'básico': 1, 'intermedio': 2, 'avanzado': 3 };
      const userLevel = levelOrder[nivel.toLowerCase()] || 2;
      const exerciseLevel = levelOrder[ex.nivel.toLowerCase()] || 2;
      
      // Permitir ejercicios del mismo nivel o inferiores
      const levelMatch = exerciseLevel <= userLevel;
      
      // Filtro por categorías si se especifica
      const categoryMatch = categorias.length === 0 || 
        categorias.some(cat => ex.categoria.toLowerCase().includes(cat.toLowerCase()));
      
      // Filtro por equipamiento si se especifica
      const equipmentMatch = !equipamiento || 
        ex.equipamiento.toLowerCase().includes(equipamiento.toLowerCase()) ||
        ex.equipamiento.toLowerCase() === 'suelo' ||
        ex.equipamiento.toLowerCase() === 'pared';
      
      return levelMatch && categoryMatch && equipmentMatch;
    }).sort((a, b) => {
      // Ordenar por nivel y luego por categoría
      const levelOrder = { 'básico': 1, 'intermedio': 2, 'avanzado': 3 };
      const aLevel = levelOrder[a.nivel.toLowerCase()] || 2;
      const bLevel = levelOrder[b.nivel.toLowerCase()] || 2;
      
      if (aLevel !== bLevel) return aLevel - bLevel;
      return a.categoria.localeCompare(b.categoria);
    });
  }
}

/**
 * Utilidades para trabajar con ejercicios de calistenia
 */
export class CalisteniaExerciseUtils {
  
  /**
   * Parsear series y repeticiones objetivo
   * @param {string} seriesRepsObjectivo - Formato "3-5x8-12"
   * @returns {Object} Objeto con series min/max y reps min/max
   */
  static parseSeriesReps(seriesRepsObjectivo) {
    if (!seriesRepsObjectivo) return null;
    
    try {
      // Formato esperado: "3-5x8-12" o "4x10" o "3-4x15-20"
      const match = seriesRepsObjectivo.match(/(\d+)(?:-(\d+))?x(\d+)(?:-(\d+))?/);
      
      if (!match) return null;
      
      const [, seriesMin, seriesMax, repsMin, repsMax] = match;
      
      return {
        series: {
          min: parseInt(seriesMin),
          max: parseInt(seriesMax) || parseInt(seriesMin)
        },
        reps: {
          min: parseInt(repsMin),
          max: parseInt(repsMax) || parseInt(repsMin)
        }
      };
    } catch (error) {
      console.error('Error parseando series/reps:', error);
      return null;
    }
  }
  
  /**
   * Validar si un usuario cumple criterios de progreso
   * @param {Object} exercise - Ejercicio
   * @param {number} userReps - Repeticiones del usuario
   * @param {number} userSessions - Sesiones consecutivas con esas reps
   * @returns {boolean} True si puede progresar
   */
  static canProgress(exercise, userReps, userSessions = 1) {
    if (!exercise.criterio_de_progreso) return false;
    
    // Extraer número de reps requeridas del criterio
    const repsMatch = exercise.criterio_de_progreso.match(/(\d+) reps/);
    const sessionsMatch = exercise.criterio_de_progreso.match(/(\d+) sesiones/);
    
    const requiredReps = repsMatch ? parseInt(repsMatch[1]) : 0;
    const requiredSessions = sessionsMatch ? parseInt(sessionsMatch[1]) : 1;
    
    return userReps >= requiredReps && userSessions >= requiredSessions;
  }
  
  /**
   * Generar descripción de dificultad basada en el ejercicio
   * @param {Object} exercise - Ejercicio
   * @returns {Object} Información de dificultad
   */
  static getDifficultyInfo(exercise) {
    const difficultyMap = {
      'básico': {
        color: 'green',
        icon: '🟢',
        description: 'Nivel principiante - Fundamentos'
      },
      'intermedio': {
        color: 'yellow',
        icon: '🟡',
        description: 'Nivel intermedio - Progresión'
      },
      'avanzado': {
        color: 'red',
        icon: '🔴',
        description: 'Nivel avanzado - Habilidades complejas'
      }
    };
    
    const nivel = exercise.nivel.toLowerCase();
    return difficultyMap[nivel] || difficultyMap['intermedio'];
  }
  
  /**
   * Generar recomendación de entrenamiento semanal
   * @param {string} nivel - Nivel del usuario
   * @param {Array} exercises - Ejercicios seleccionados
   * @returns {Object} Plan de entrenamiento semanal
   */
  static generateWeeklyPlan(nivel, exercises) {
    const frequencyByLevel = {
      'básico': 3,      // 3 días por semana
      'intermedio': 4,  // 4 días por semana  
      'avanzado': 5     // 5 días por semana
    };
    
    const frequency = frequencyByLevel[nivel.toLowerCase()] || 3;
    
    // Agrupar ejercicios por categoría
    const empuje = exercises.filter(ex => ex.categoria.includes('Empuje'));
    const traccion = exercises.filter(ex => ex.categoria.includes('Tracción'));
    const others = exercises.filter(ex => !ex.categoria.includes('Empuje') && !ex.categoria.includes('Tracción'));
    
    return {
      frequency,
      structure: {
        empuje: empuje.length,
        traccion: traccion.length,
        others: others.length
      },
      recommendation: `Entrenar ${frequency} días por semana, alternando entre empuje y tracción`
    };
  }
}

/**
 * Hook personalizado avanzado para usar la base de datos de ejercicios de calistenia
 * @param {Object} options - Opciones de configuración
 * @param {boolean} options.autoLoad - Cargar automáticamente al montar (default: true)
 * @param {number} options.cacheTime - Tiempo de cache en ms (default: 5min)
 * @returns {Object} Estado y métodos del hook
 */
export function useCalisteniaExercises(options = {}) {
  const { autoLoad = true, cacheTime = 5 * 60 * 1000 } = options;

  const [state, setState] = React.useState({
    exercises: [],
    loading: false,
    error: null,
    lastUpdated: null,
    isStale: false
  });

  // Cache simple en memoria
  const cacheRef = React.useRef({
    data: null,
    timestamp: null
  });

  const loadExercises = React.useCallback(async (forceRefresh = false) => {
    // Verificar cache si no es forzado
    if (!forceRefresh && cacheRef.current.data && cacheRef.current.timestamp) {
      const cacheAge = Date.now() - cacheRef.current.timestamp;
      if (cacheAge < cacheTime) {
        Logger.info('Using cached exercises data');
        setState(prevState => ({
          ...prevState,
          exercises: cacheRef.current.data,
          error: null,
          isStale: false
        }));
        return;
      }
    }

    setState(prevState => ({ ...prevState, loading: true, error: null }));

    try {
      const data = await CalisteniaExerciseDatabase.getAllExercises();

      // Actualizar cache
      cacheRef.current = {
        data,
        timestamp: Date.now()
      };

      setState(prevState => ({
        ...prevState,
        exercises: data,
        loading: false,
        error: null,
        lastUpdated: new Date().toISOString(),
        isStale: false
      }));

      Logger.info(`Loaded ${data.length} calistenia exercises`);
    } catch (err) {
      const errorMessage = err.message || 'Failed to load exercises';

      setState(prevState => ({
        ...prevState,
        loading: false,
        error: errorMessage,
        isStale: true
      }));

      Logger.error('Error loading calistenia exercises in hook', err);
    }
  }, [cacheTime]);

  // Filtros avanzados
  const filterByLevel = React.useCallback((level) => {
    return state.exercises.filter(ex =>
      ex.nivel?.toLowerCase() === level.toLowerCase()
    );
  }, [state.exercises]);

  const filterByCategory = React.useCallback((category) => {
    return state.exercises.filter(ex =>
      ex.categoria?.toLowerCase().includes(category.toLowerCase())
    );
  }, [state.exercises]);

  const searchExercises = React.useCallback((query) => {
    if (!query) return state.exercises;

    const searchTerm = query.toLowerCase();
    return state.exercises.filter(ex =>
      ex.nombre?.toLowerCase().includes(searchTerm) ||
      ex.descripcion?.toLowerCase().includes(searchTerm) ||
      ex.musculos_trabajados?.toLowerCase().includes(searchTerm)
    );
  }, [state.exercises]);

  // Auto-load al montar
  React.useEffect(() => {
    if (autoLoad) {
      loadExercises();
    }
  }, [autoLoad, loadExercises]);

  // Detectar cuando el cache se vuelve obsoleto
  React.useEffect(() => {
    if (!state.lastUpdated) return;

    const interval = setInterval(() => {
      const timeSinceUpdate = Date.now() - new Date(state.lastUpdated).getTime();
      if (timeSinceUpdate > cacheTime && !state.isStale) {
        setState(prevState => ({ ...prevState, isStale: true }));
      }
    }, 30000); // Verificar cada 30 segundos

    return () => clearInterval(interval);
  }, [state.lastUpdated, cacheTime, state.isStale]);

  return {
    // Estado
    exercises: state.exercises,
    loading: state.loading,
    error: state.error,
    lastUpdated: state.lastUpdated,
    isStale: state.isStale,
    isEmpty: state.exercises.length === 0 && !state.loading,

    // Métodos
    reload: () => loadExercises(true),
    refresh: () => loadExercises(false),

    // Filtros
    filterByLevel,
    filterByCategory,
    searchExercises,

    // Utilidades
    getExerciseById: React.useCallback((id) => {
      return state.exercises.find(ex => ex.exercise_id === id) || null;
    }, [state.exercises]),

    // Estadísticas
    stats: React.useMemo(() => ({
      total: state.exercises.length,
      byLevel: state.exercises.reduce((acc, ex) => {
        const level = ex.nivel?.toLowerCase() || 'unknown';
        acc[level] = (acc[level] || 0) + 1;
        return acc;
      }, {}),
      byCategory: state.exercises.reduce((acc, ex) => {
        const category = ex.categoria || 'unknown';
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {})
    }), [state.exercises])
  };
}

// Export por defecto
export default CalisteniaExerciseDatabase;
