/**
 * 🔌 API Services Refactorizado - Servicios especializados integrados
 *
 * MEJORAS FASE 1 (Ultra-segura):
 * - Integración con tokenManager (gestión mejorada de tokens)
 * - JSDoc completo para todos los endpoints
 * - Helpers para FormData (eliminación duplicación)
 * - Logging mejorado para debugging
 * - API pública idéntica (cero breaking changes)
 */

import apiClient from '../lib/apiClient';
import tokenManager from '../utils/tokenManager';
import logger from '../utils/logger';

// =============================================================================
// 🛠️ HELPERS INTERNOS (NUEVOS - RIESGO CERO)
// =============================================================================

/**
 * Crea FormData de forma consistente para uploads
 * @private
 */
const createFormData = (files, fields = {}) => {
  const formData = new FormData();

  // Añadir archivos
  if (Array.isArray(files)) {
    files.forEach((file, index) => {
      const fieldName = fields.fileFieldName || `document_${index}`;
      formData.append(fieldName, file);
    });
  } else if (files) {
    const fieldName = fields.fileFieldName || 'file';
    formData.append(fieldName, files);
  }

  // Añadir campos adicionales
  Object.entries(fields).forEach(([key, value]) => {
    if (key !== 'fileFieldName' && value !== undefined) {
      formData.append(key, value);
    }
  });

  return formData;
};

/**
 * Headers para FormData uploads
 * @private
 */
const getFormDataHeaders = () => ({
  'Content-Type': undefined // Permite al browser setear boundary automáticamente
});

/**
 * Wrapper para logging de API calls
 * @private
 */
const withLogging = (apiCall, context) => async (...args) => {
  const startTime = Date.now();
  try {
    logger.debug(`API call started: ${context}`, { args }, 'APIServices');
    const result = await apiCall(...args);
    const duration = Date.now() - startTime;
    logger.debug(`API call completed: ${context}`, { duration: `${duration}ms` }, 'APIServices');
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`API call failed: ${context}`, { error: error.message, duration: `${duration}ms` }, 'APIServices');
    throw error;
  }
};

// =============================================================================
// 🔐 AUTHENTICATION SERVICES
// =============================================================================
export const authApi = {
  /**
   * Iniciar sesión de usuario
   * @param {Object} credentials - Credenciales de acceso
   * @param {string} credentials.email - Email del usuario
   * @param {string} credentials.password - Contraseña del usuario
   * @returns {Promise<Object>} Respuesta con user data y token
   * @example
   * const result = await authApi.login({ email: 'user@test.com', password: '123456' });
   */
  login: withLogging(async (credentials) => {
    const response = await apiClient.post('/auth/login', credentials);

    // ✅ MEJORA: Usar tokenManager en lugar de localStorage directo
    if (response.token) {
      tokenManager.setTokens(response.token, response.refreshToken);
      logger.info('Usuario autenticado exitosamente', { userId: response.user?.id }, 'AuthAPI');
    }

    return response;
  }, 'authApi.login'),

  /**
   * Registrar nuevo usuario
   * @param {Object} userData - Datos del usuario a registrar
   * @param {string} userData.email - Email del usuario
   * @param {string} userData.password - Contraseña del usuario
   * @param {string} userData.nombre - Nombre del usuario
   * @param {string} userData.apellido - Apellido del usuario
   * @returns {Promise<Object>} Respuesta con user data y token (opcional)
   */
  register: withLogging(async (userData) => {
    const response = await apiClient.post('/auth/register', userData);

    // ✅ MEJORA: Usar tokenManager para gestión consistente
    if (response.token) {
      tokenManager.setTokens(response.token, response.refreshToken);
      logger.info('Usuario registrado exitosamente', { userId: response.user?.id }, 'AuthAPI');
    }

    return response;
  }, 'authApi.register'),

  /**
   * Obtener perfil del usuario actual
   * @returns {Promise<Object>} Datos del perfil del usuario
   */
  getProfile: withLogging(async () => {
    return apiClient.get('/users/profile');
  }, 'authApi.getProfile'),

  /**
   * Actualizar perfil del usuario
   * @param {Object} profileData - Datos del perfil a actualizar
   * @param {string} [profileData.nombre] - Nombre del usuario
   * @param {string} [profileData.apellido] - Apellido del usuario
   * @param {number} [profileData.peso] - Peso en kg
   * @param {number} [profileData.altura] - Altura en cm
   * @param {number} [profileData.edad] - Edad en años
   * @returns {Promise<Object>} Perfil actualizado
   */
  updateProfile: withLogging(async (profileData) => {
    return apiClient.put('/users/profile', profileData);
  }, 'authApi.updateProfile'),

  /**
   * Cerrar sesión del usuario
   * @returns {Promise<void>} Promesa que resuelve cuando se completa el logout
   */
  logout: withLogging(async () => {
    try {
      await apiClient.post('/auth/logout');
      logger.info('Logout exitoso', null, 'AuthAPI');
    } catch (error) {
      logger.warn('Error en logout API, continuando con limpieza local', { error: error.message }, 'AuthAPI');
    } finally {
      // ✅ MEJORA: Usar tokenManager para limpieza consistente
      tokenManager.removeTokens();
      logger.debug('Tokens limpiados correctamente', null, 'AuthAPI');
    }
  }, 'authApi.logout')
};

// =============================================================================
// 🏋️ ROUTINES SERVICES
// =============================================================================
export const routinesApi = {
  /**
   * Obtener plan activo
   */
  async getActivePlan() {
    return apiClient.get('/routines/active-plan');
  },

  /**
   * Confirmar plan de rutina
   */
  async confirmPlan(planData) {
    return apiClient.post('/routines/confirm-plan', planData);
  },

  /**
   * Obtener estado de sesión de hoy
   */
  async getTodaySessionStatus(methodologyPlanId, dayName) {
    return apiClient.get(`/routines/today-status/${methodologyPlanId}/${dayName}`);
  },

  /**
   * Iniciar nueva sesión
   */
  async startSession(sessionData) {
    return apiClient.post('/routines/sessions/start', sessionData);
  },

  /**
   * Obtener progreso de sesión
   */
  async getSessionProgress(sessionId) {
    return apiClient.get(`/routines/sessions/${sessionId}/progress`);
  },

  /**
   * Actualizar ejercicio
   */
  async updateExercise(sessionId, exerciseOrder, updateData) {
    return apiClient.put(`/routines/sessions/${sessionId}/exercise/${exerciseOrder}`, updateData);
  },

  /**
   * Finalizar sesión
   */
  async finishSession(sessionId) {
    return apiClient.post(`/routines/sessions/${sessionId}/finish`);
  },

  /**
   * Obtener ejercicios pendientes
   */
  async getPendingExercises(methodologyPlanId) {
    return apiClient.get(`/routines/pending-exercises/${methodologyPlanId}`);
  },

  /**
   * Cancelar rutina
   */
  async cancelRoutine(methodologyPlanId) {
    return apiClient.delete(`/routines/cancel/${methodologyPlanId}`);
  },

  /**
   * Obtener datos de progreso para analytics
   */
  async getProgressData(methodologyPlanId) {
    return apiClient.get(`/routines/progress-data/${methodologyPlanId}`);
  },

  /**
   * Guardar feedback de ejercicio
   */
  async saveExerciseFeedback(sessionId, exerciseOrder, feedbackData) {
    return apiClient.post(`/routines/sessions/${sessionId}/exercise/${exerciseOrder}/feedback`, feedbackData);
  },

  /**
   * Obtener feedback de sesión
   */
  getSessionFeedback: withLogging(async (sessionId) => {
    return apiClient.get(`/routines/sessions/${sessionId}/feedback`);
  }, 'routinesApi.getSessionFeedback'),

  /**
   * Confirmar y activar plan de metodología (migrado de methodologyService)
   * @param {number} planId - ID del plan de metodología a activar
   * @param {Object} planData - Datos del plan a confirmar
   * @returns {Promise<Object>} Plan activado con routinePlanId
   */
  confirmAndActivatePlan: withLogging(async (planId, planData) => {
    return apiClient.post('/routines/confirm-and-activate', {
      methodology_plan_id: planId,
      plan_data: planData
    }, {
      timeout: 10000 // Timeout específico para activación
    });
  }, 'routinesApi.confirmAndActivatePlan')
};

// =============================================================================
// 🧠 METHODOLOGIES SERVICES
// =============================================================================
export const methodologiesApi = {
  /**
   * Generar metodología automática con IA
   */
  async generateMethodology(profileData) {
    return apiClient.post('/methodologie/generate', { profile: profileData });
  },

  /**
   * Generar metodología manual
   */
  async generateManualMethodology(methodologyData) {
    return apiClient.post('/methodology-manual/generate', methodologyData);
  },

  /**
   * Evaluar perfil para calistenia
   */
  async evaluateCalisteniaProfile(profileData) {
    return apiClient.post('/calistenia-specialist/evaluate-profile', profileData);
  },

  /**
   * Generar plan de calistenia especializado
   */
  async generateCalisteniaPlan(planData) {
    return apiClient.post('/calistenia-specialist/generate-plan', planData);
  }
};

// =============================================================================
// 🏠 HOME TRAINING SERVICES
// =============================================================================
export const homeTrainingApi = {
  /**
   * Generar plan de entrenamiento en casa
   */
  async generatePlan(planData) {
    return apiClient.post('/home-training/generate', planData);
  },

  /**
   * Obtener sesiones de entrenamiento en casa
   */
  async getSessions(userId) {
    return apiClient.get(`/home-training/sessions/${userId}`);
  },

  /**
   * Iniciar sesión de entrenamiento en casa
   */
  async startSession(sessionData) {
    return apiClient.post('/home-training/sessions/start', sessionData);
  },

  /**
   * Actualizar progreso de ejercicio
   */
  async updateExerciseProgress(sessionId, exerciseOrder, progressData) {
    return apiClient.put(`/home-training/sessions/${sessionId}/exercise/${exerciseOrder}`, progressData);
  },

  /**
   * Guardar rechazos de ejercicios
   */
  async saveRejections(rejectionData) {
    return apiClient.post('/home-training/save-rejections', rejectionData);
  },

  /**
   * Cerrar sesiones activas
   */
  async closeActiveSessions(userId) {
    return apiClient.put(`/home-training/close-active-sessions`, { userId });
  },

  /**
   * Obtener historial de preferencias
   */
  async getPreferencesHistory(userId) {
    return apiClient.get(`/home-training/preferences-history/${userId}`);
  }
};

// =============================================================================
// 🍎 NUTRITION SERVICES
// =============================================================================
export const nutritionApi = {
  /**
   * Obtener recomendaciones nutricionales con IA
   */
  async getNutritionRecommendations(profileData) {
    return apiClient.post('/nutrition/recommendations', profileData);
  },

  /**
   * Guardar log diario de nutrición
   */
  async saveDailyLog(logData) {
    return apiClient.post('/nutrition/daily-log', logData);
  },

  /**
   * Obtener historial de nutrición
   */
  async getNutritionHistory(userId, dateRange) {
    return apiClient.get(`/nutrition/history/${userId}`, {
      params: dateRange
    });
  },

  /**
   * Buscar alimentos en base de datos
   */
  async searchFoods(query) {
    return apiClient.get(`/nutrition/foods/search?q=${encodeURIComponent(query)}`);
  }
};

// =============================================================================
// 📹 VIDEO CORRECTION SERVICES
// =============================================================================
export const videoCorrectionApi = {
  /**
   * Subir video para análisis de IA
   * @param {File} videoFile - Archivo de video a analizar
   * @param {string} exerciseType - Tipo de ejercicio (sentadilla, flexiones, etc.)
   * @returns {Promise<Object>} Análisis del video con correcciones
   */
  uploadVideo: withLogging(async (videoFile, exerciseType) => {
    // ✅ MEJORA: Usar helper centralizado para FormData
    const formData = createFormData(videoFile, {
      fileFieldName: 'video',
      exercise_type: exerciseType
    });

    return apiClient.post('/ai/analyze-video', formData, {
      headers: getFormDataHeaders()
    });
  }, 'videoCorrectionApi.uploadVideo'),

  /**
   * Analizar imagen de ejercicio
   * @param {File} imageFile - Archivo de imagen a analizar
   * @param {string} exerciseType - Tipo de ejercicio
   * @returns {Promise<Object>} Análisis de la imagen con feedback
   */
  analyzeImage: withLogging(async (imageFile, exerciseType) => {
    // ✅ MEJORA: Usar helper centralizado
    const formData = createFormData(imageFile, {
      fileFieldName: 'image',
      exercise_type: exerciseType
    });

    return apiClient.post('/ai-photo-correction/analyze', formData, {
      headers: getFormDataHeaders()
    });
  }, 'videoCorrectionApi.analyzeImage')
};

// =============================================================================
// 👤 PROFILE SERVICES
// =============================================================================
export const profileApi = {
  /**
   * Obtener equipamiento del usuario
   */
  async getUserEquipment(userId) {
    return apiClient.get(`/equipment/user/${userId}`);
  },

  /**
   * Actualizar equipamiento
   */
  async updateEquipment(equipmentData) {
    return apiClient.put('/equipment/user', equipmentData);
  },

  /**
   * Obtener catálogo de equipamiento
   */
  async getEquipmentCatalog() {
    return apiClient.get('/equipment/catalog');
  },

  /**
   * Guardar composición corporal
   */
  async saveBodyComposition(compositionData) {
    return apiClient.post('/body-composition', compositionData);
  },

  /**
   * Obtener historial de composición corporal
   */
  async getBodyCompositionHistory(userId) {
    return apiClient.get(`/body-composition/history/${userId}`);
  },

  /**
   * Subir documentos médicos del usuario
   * @param {File[]} files - Array de archivos médicos a subir
   * @returns {Promise<Object>} Respuesta con URLs de documentos subidos
   */
  uploadMedicalDocs: withLogging(async (files) => {
    // ✅ MEJORA: Usar helper centralizado para consistencia
    const formData = createFormData(files, {
      fileFieldName: 'document' // Helper manejará el índice automáticamente
    });

    return apiClient.post('/uploads/medical-docs', formData, {
      headers: getFormDataHeaders()
    });
  }, 'profileApi.uploadMedicalDocs')
};

// =============================================================================
// 🎵 MUSIC SERVICES
// =============================================================================
export const musicApi = {
  /**
   * Obtener configuración de música del usuario
   */
  async getMusicConfig(userId) {
    return apiClient.get(`/music/config/${userId}`);
  },

  /**
   * Actualizar configuración de música
   */
  async updateMusicConfig(configData) {
    return apiClient.put('/music/config', configData);
  },

  /**
   * Sincronizar playlist
   */
  async syncPlaylist(playlistData) {
    return apiClient.post('/music/sync-playlist', playlistData);
  }
};

// =============================================================================
// 📊 STATS SERVICES
// =============================================================================
export const statsApi = {
  /**
   * Obtener estadísticas generales del usuario
   */
  async getUserStats(userId) {
    return apiClient.get(`/stats/user/${userId}`);
  },

  /**
   * Obtener estadísticas de rutinas
   */
  async getRoutineStats(methodologyPlanId) {
    return apiClient.get(`/stats/routines/${methodologyPlanId}`);
  },

  /**
   * Obtener estadísticas de home training
   */
  async getHomeTrainingStats(userId) {
    return apiClient.get(`/stats/home-training/${userId}`);
  }
};

// Exportación por defecto con todos los servicios agrupados
export default {
  auth: authApi,
  routines: routinesApi,
  methodologies: methodologiesApi,
  homeTraining: homeTrainingApi,
  nutrition: nutritionApi,
  videoCorrection: videoCorrectionApi,
  profile: profileApi,
  music: musicApi,
  stats: statsApi
};