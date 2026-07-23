/**
 * 🏋️ WorkoutContext - Contexto Unificado de Entrenamiento
 *
 * PROPÓSITO: Centralizar TODO el estado relacionado con entrenamientos
 * REEMPLAZA: useMethodologyAPI, useRoutinePlan, useRoutineSession, useTodaySession, etc.
 *
 * ARQUITECTURA:
 * - Estado unificado para planes y sesiones
 * - Acciones que abstraen la complejidad de APIs
 * - Navegación fluida entre MethodologiesScreen ↔ RoutineScreen
 * - Persistencia automática en localStorage
 *
 * @version 1.0.0 - Refactorización Arquitectural Completa
 */

import { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import apiClient from '../lib/apiClient';
import {
  WORKOUT_ACTIONS,
  WORKOUT_VIEWS,
  SESSION_STATUS,
  PLAN_STATUS,
  initialState
} from './workout/workoutConstants';
import { workoutReducer } from './workout/workoutReducer';

// =============================================================================
// 🎯 CONTEXTO
// =============================================================================

const WorkoutContext = createContext();

export function WorkoutProvider({ children }) {
  const [state, dispatch] = useReducer(workoutReducer, initialState);
  const { user } = useAuth();

  // =============================================================================
  // 🔄 PERSISTENCIA EN LOCALSTORAGE
  // =============================================================================

  // Cargar estado desde localStorage al inicializar
  useEffect(() => {
    if (!user) return;

    const validateAndRestoreState = async () => {
      try {
        const savedState = localStorage.getItem(`workout_state_${user.id}`);
        if (savedState) {
          const parsed = JSON.parse(savedState);

          // Validar plan antes de restaurar
          if (parsed.plan && parsed.plan.methodologyPlanId) {
            try {
              // Verificar que el plan sigue activo en el backend
              const { getActivePlan } = await import('@/components/routines/api');
              const activeData = await getActivePlan();

              if (activeData.hasActivePlan &&
                  activeData.methodology_plan_id === parsed.plan.methodologyPlanId) {
                // Plan válido, restaurarlo
                dispatch({ type: WORKOUT_ACTIONS.SET_PLAN, payload: parsed.plan });
              } else {
                // Plan obsoleto, limpiar localStorage
                console.log('⚠️ Plan guardado obsoleto o cancelado, limpiando localStorage');
                localStorage.removeItem(`workout_state_${user.id}`);
              }
            } catch (error) {
              console.warn('Error validando plan desde localStorage:', error);
              // En caso de error, limpiar para evitar inconsistencias
              localStorage.removeItem(`workout_state_${user.id}`);
            }
          }

          // Restaurar sesión activa si existe (sin cambios)
          if (parsed.session && parsed.session.status === SESSION_STATUS.IN_PROGRESS) {
            dispatch({ type: WORKOUT_ACTIONS.UPDATE_SESSION, payload: parsed.session });
          }
        }
      } catch (error) {
        console.warn('Error cargando estado del workout desde localStorage:', error);
      }
    };

    validateAndRestoreState();
  }, [user]);

  // Guardar estado en localStorage cuando cambie
  useEffect(() => {
    if (!user) return;

    const stateToSave = {
      plan: state.plan,
      session: state.session,
      stats: state.stats
    };

    try {
      localStorage.setItem(`workout_state_${user.id}`, JSON.stringify(stateToSave));
    } catch (error) {
      console.warn('Error guardando estado del workout en localStorage:', error);
    }
  }, [state.plan, state.session, state.stats, user]);

  // =============================================================================
  // 📡 PLAN ACTIONS
  // =============================================================================

  const updatePlan = useCallback((updates) => {
    dispatch({ type: WORKOUT_ACTIONS.UPDATE_PLAN, payload: updates });
  }, []);

  const loadActivePlan = useCallback(async () => {
    if (!user) throw new Error('Usuario no autenticado');

    dispatch({ type: WORKOUT_ACTIONS.SET_LOADING, payload: true });
    dispatch({ type: WORKOUT_ACTIONS.CLEAR_ERROR });

    try {
      // Import the API function
      const { getActivePlan } = await import('@/components/routines/api');
      const data = await getActivePlan();

      if (data.hasActivePlan) {
        const planData = {
          currentPlan: data.routinePlan,
          methodologyPlanId: data.methodology_plan_id,
          planStartDate: data.confirmedAt || data.createdAt || new Date().toISOString(),
          planType: data.generation_mode || data.planSource?.type || 'automatic',
          methodology: data.routinePlan?.selected_style || data.routinePlan?.nombre,
          status: PLAN_STATUS.ACTIVE,
          weekTotal: data.routinePlan?.weeks?.length || 0,
          currentWeek: 1
        };

        dispatch({ type: WORKOUT_ACTIONS.SET_PLAN, payload: planData });
        return { success: true, plan: planData };
      }

      dispatch({ type: WORKOUT_ACTIONS.SET_LOADING, payload: false });
      // El backend respondió correctamente y confirma que NO hay plan.
      return { success: false, noPlan: true, error: 'No hay plan activo' };
    } catch (error) {
      dispatch({ type: WORKOUT_ACTIONS.SET_ERROR, payload: error.message });
      // Error de red/transitorio: NO equivale a "sin plan"; el llamador no debe redirigir.
      return { success: false, transient: true, error: error.message };
    }
  }, [user]);

  const generatePlan = useCallback(async (config) => {
    if (!user) throw new Error('Usuario no autenticado');

    dispatch({ type: WORKOUT_ACTIONS.SET_LOADING, payload: true });
    dispatch({ type: WORKOUT_ACTIONS.CLEAR_ERROR });

    try {
      // Branch: HipertrofiaV2 MindFeed plan ya generado por endpoint dedicado
      if (
        String(config?.methodology || '').toLowerCase() === 'hipertrofiav2' &&
        config?.planData &&
        Array.isArray(config.planData?.semanas)
      ) {
        const methodologyPlanId = config.methodologyPlanId || config.planData.methodologyPlanId;
        const nowUTC = new Date().toISOString();

        const planPayload = {
          currentPlan: config.planData,
          methodologyPlanId,
          planStartDate: nowUTC,
          planType: 'manual',
          methodology: 'HipertrofiaV2_MindFeed',
          generatedAt: nowUTC,
          weekTotal: config.planData?.semanas?.length || 0,
          currentWeek: 1
        };

        dispatch({ type: WORKOUT_ACTIONS.SET_PLAN, payload: planPayload });

        return {
          success: true,
          plan: config.planData,
          planId: methodologyPlanId,
          methodologyPlanId,
          methodology: 'HipertrofiaV2_MindFeed',
          metadata: {
            generatedAt: nowUTC,
            source: 'mindfeed_generate_d1d5'
          }
        };
      }

      // Payload estándar con campo methodology (lowercase) para TODAS las metodologías
      // "manuales" normales (Calistenia incluida, PR-CAL-01: se retira el branch específico que
      // vivía aquí — `generatePlan()` no debe conocer detalles de ninguna metodología concreta).
      // El backend (`MethodologyOrchestrator.normalizePlanData`) ya desempaqueta el dato anidado
      // (p.ej. `calisteniaData`) y deriva `selectedLevel` desde `level` cuando falta; `assessmentInput`
      // viaja tal cual dentro del dato anidado. La construcción específica de Calistenia (contexto,
      // painStatus, demonstratedLevel) vive en `useManualPlanGeneration.handleCalisteniaManualGenerate`.
      const requestBody = {
        ...config,
        mode: (config.mode || 'automatic'),
        ...(config.methodology ? { methodology: String(config.methodology).toLowerCase() } : {})
      };

      // Determinar el endpoint correcto según el modo
      const endpoint = '/methodology/generate';

      // Usar apiClient que ya maneja la URL base y los headers
      const result = await apiClient.post(endpoint, requestBody);

      // Log detallado para debug
      console.log('📦 [WORKOUT] Respuesta del servidor:', {
        timestamp: new Date().toISOString(),
        success: result.success,
        hasPlan: !!result.plan,
        methodologyPlanId: result.planId || result.methodologyPlanId,
        methodology: result.methodology || config.mode,
        planStartDate: result.metadata?.plan_start_date,
        processingTime: result.metadata?.processing_time_seconds
      });

      // Verificar que la respuesta sea válida
      if (!result.success || !result.plan) {
        console.error('❌ [WORKOUT] Plan inválido recibido:', result);
        throw new Error(result.error || 'No se recibió un plan válido del servidor');
      }

      // Validar estructura del plan
      if (!result.plan.semanas || !Array.isArray(result.plan.semanas)) {
        console.error('❌ [WORKOUT] Estructura del plan inválida');
        throw new Error('El plan no tiene estructura de semanas válida');
      }

      console.log('✅ [WORKOUT] Plan validado en frontend');

      // Activar plan automáticamente - Usar UTC para consistencia
      const nowUTC = new Date().toISOString();
      const planData = {
        currentPlan: result.plan,
        methodologyPlanId: result.planId || result.methodologyPlanId,
        planStartDate: nowUTC,  // UTC timestamp
        planType: config.mode || 'automatic',
        methodology: result.methodology || config.mode || 'Calistenia',
        generatedAt: result.metadata?.generatedAt || nowUTC,
        weekTotal: result.plan?.semanas?.length || result.plan?.weeks?.length || 0,
        currentWeek: 1,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone // Guardar zona horaria del cliente
      };

      dispatch({ type: WORKOUT_ACTIONS.SET_PLAN, payload: planData });

      // Retornar el resultado con success para que MethodologiesScreen pueda procesarlo
      return {
        ...result,
        success: true
      };
    } catch (error) {
      dispatch({ type: WORKOUT_ACTIONS.SET_ERROR, payload: error.message });
      throw error;
    }
  }, [user]);

  const activatePlan = useCallback(async (methodologyPlanId) => {
    if (!methodologyPlanId) throw new Error('Plan ID requerido');

    dispatch({ type: WORKOUT_ACTIONS.SET_LOADING, payload: true });

    try {
      // Import the API function
      const { confirmRoutinePlan } = await import('@/components/routines/api');
      const result = await confirmRoutinePlan({
        methodology_plan_id: methodologyPlanId,
        routine_plan_id: state.plan.currentPlan?.id || methodologyPlanId
      });

      if (result.success) {
        // Generar programación de sesiones para que TodayTrainingTab y CalendarTab
        // tengan datos de "hoy" inmediatamente desde workout_schedule
        try {
          await apiClient.post('/routines/generate-schedule', { methodology_plan_id: methodologyPlanId });
        } catch (e) {
          console.warn('No se pudo generar la programación automática:', e?.message || e);
        }

        dispatch({ type: WORKOUT_ACTIONS.ACTIVATE_PLAN });
        dispatch({ type: WORKOUT_ACTIONS.SET_VIEW, payload: WORKOUT_VIEWS.TODAY_TRAINING });
        return { success: true };
      }

      throw new Error(result.error || 'Error activando el plan');
    } catch (error) {
      dispatch({ type: WORKOUT_ACTIONS.SET_ERROR, payload: error.message });
      return { success: false, error: error.message };
    }
  }, [state.plan.currentPlan]);

  const archivePlan = useCallback(async () => {
    dispatch({ type: WORKOUT_ACTIONS.CLEAR_PLAN });
  }, []);

  // Función específica para cancelar un plan completamente
  const cancelPlan = useCallback(async (methodologyPlanId) => {
    try {
      // Primero hacer la llamada al backend
      const { cancelRoutine } = await import('@/components/routines/api');
      await cancelRoutine({
        methodology_plan_id: methodologyPlanId || state.plan.methodologyPlanId,
        routine_plan_id: state.plan.currentPlan?.id || null
      });

      // Limpiar el estado del contexto
      dispatch({ type: WORKOUT_ACTIONS.CLEAR_PLAN });

      // Limpiar el localStorage
      if (user) {
        localStorage.removeItem(`workout_state_${user.id}`);
      }

      return { success: true };
    } catch (error) {
      dispatch({ type: WORKOUT_ACTIONS.SET_ERROR, payload: error.message });
      return { success: false, error: error.message };
    }
  }, [state.plan.methodologyPlanId, state.plan.currentPlan, user]);

  // =============================================================================
  // 🏃 SESSION ACTIONS
  // =============================================================================

  const startSession = useCallback(async (config) => {
    if (!state.plan.methodologyPlanId) {
      throw new Error('No hay plan activo para iniciar sesión');
    }

    dispatch({ type: WORKOUT_ACTIONS.SET_LOADING, payload: true });

    try {
      // Import the API function
      const { startSession: startSessionAPI } = await import('@/components/routines/api');

      // Construir payload según disponibilidad: preferir day_id; si no, usar (week_number, day_name)
      const payload = {
        methodology_plan_id: config.methodologyPlanId || state.plan.methodologyPlanId
      };
      // 🎯 session_date (HOY en Europe/Madrid): fuente autoritativa para que el
      // backend resuelva la sesión de hoy POR FECHA. Evita el desfase entre
      // computeDayId (numera desde plan_start_date, hoy=1) y methodology_plan_days
      // (numera desde el lunes de la semana de inicio) en arranques a media semana:
      // sin esto, /sessions/start abría un día equivocado (p.ej. la calibración de
      // HipertrofiaV2 se convertía en otra sesión distinta a la del preview).
      payload.session_date = config.sessionDate || new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit'
      }).format(new Date());
      if (config.dayId != null) {
        payload.day_id = config.dayId;
      } else {
        payload.week_number = config.weekNumber || state.plan.currentWeek || 1;
        if (config.dayName) payload.day_name = config.dayName;
      }

      const sessionData = await startSessionAPI(payload);

      dispatch({
        type: WORKOUT_ACTIONS.START_SESSION,
        payload: {
          currentSession: sessionData,
          sessionId: sessionData.session_id || sessionData.id,
          dayName: (config.dayInfo?.dia || config.dayName || null),
          dayInfo: config.dayInfo || null,
          weekNumber: state.plan.currentWeek,
          totalExercises: sessionData.total_exercises || 0
        }
      });

      return { success: true, ...sessionData };
    } catch (error) {
      // Caso recuperable: ya existe una sesión activa para el día. El backend
      // adjunta status 400 + session_id; la UI la reanuda, así que NO marcamos
      // error global (evita el banner "Error cargando datos" espurio).
      const isAlreadyActive = error?.status === 400 && error?.data?.session_id;
      if (!isAlreadyActive) {
        dispatch({ type: WORKOUT_ACTIONS.SET_ERROR, payload: error.message });
      }
      return {
        success: false,
        error: error.message,
        status: error?.status,
        session_id: error?.data?.session_id
      };
    } finally {
      dispatch({ type: WORKOUT_ACTIONS.SET_LOADING, payload: false });
    }
  }, [state.plan.methodologyPlanId, state.plan.currentWeek]);

  const updateExercise = useCallback(async (exerciseId, progressData) => {
    dispatch({
      type: WORKOUT_ACTIONS.UPDATE_EXERCISE,
      payload: { exerciseId, progress: progressData }
    });

    // Actualizar en backend si hay sesión activa
    if (state.session.sessionId) {
      try {
        await apiClient.put(
          `/routines/sessions/${state.session.sessionId}/exercise/${exerciseId}`,
          {
            series_completed: Math.max(0, parseInt(progressData.series_completed) || 0),
            status: progressData.status || 'completed',
            time_spent_seconds: Math.max(0, parseInt(progressData.time_spent_seconds) || 0),
            methodology_plan_id: state.plan?.methodologyPlanId ?? null
          }
        );
        return { success: true };
      } catch (error) {
        console.warn('Error guardando progreso en backend:', error);
        return { success: false, error: error?.message || String(error) };
      }
    }

    // Sin sesión activa, pero estado local actualizado
    return { success: true };
  }, [state.session.sessionId]);

  const completeSession = useCallback(async () => {
    if (!state.session.sessionId) return { success: false, error: 'No sessionId' };

    try {
      await apiClient.post(`/training-session/complete/methodology/${state.session.sessionId}`, {
        completedAt: new Date().toISOString(),
        exerciseProgress: state.session.exerciseProgress
      });

      dispatch({ type: WORKOUT_ACTIONS.COMPLETE_SESSION });
      return { success: true };
    } catch (error) {
      dispatch({ type: WORKOUT_ACTIONS.SET_ERROR, payload: error.message });
      return { success: false, error: error?.message || String(error) };
    }
  }, [state.session.sessionId, state.session.exerciseProgress]);

  const pauseSession = useCallback(() => {
    dispatch({ type: WORKOUT_ACTIONS.PAUSE_SESSION });
  }, []);

  const endSession = useCallback(() => {
    dispatch({ type: WORKOUT_ACTIONS.END_SESSION });
  }, []);

  // =============================================================================
  // 🧭 NAVIGATION ACTIONS
  // =============================================================================

  const goToMethodologies = useCallback(() => {
    dispatch({ type: WORKOUT_ACTIONS.SET_VIEW, payload: WORKOUT_VIEWS.METHODOLOGIES });
    // Also navigate to the methodologies page using window.location
    // This ensures the user is actually redirected, not just internal state change
    if (typeof window !== 'undefined' && window.location.pathname !== '/methodologies') {
      window.location.href = '/methodologies';
    }
  }, []);

  const goToTraining = useCallback(() => {
    dispatch({ type: WORKOUT_ACTIONS.SET_VIEW, payload: WORKOUT_VIEWS.TODAY_TRAINING });
  }, []);

  const goToCalendar = useCallback(() => {
    dispatch({ type: WORKOUT_ACTIONS.SET_VIEW, payload: WORKOUT_VIEWS.CALENDAR });
  }, []);

  const goToProgress = useCallback(() => {
    dispatch({ type: WORKOUT_ACTIONS.SET_VIEW, payload: WORKOUT_VIEWS.PROGRESS });
  }, []);

  const resetWorkout = useCallback(() => {
    dispatch({ type: WORKOUT_ACTIONS.RESET_WORKOUT });
    // Limpiar localStorage
    if (user) {
      localStorage.removeItem(`workout_state_${user.id}`);
    }
  }, [user]);

  // =============================================================================
  // 🧭 MODAL ACTIONS
  // =============================================================================

  const showModal = useCallback((modalName) => {
    dispatch({ type: WORKOUT_ACTIONS.SHOW_MODAL, payload: modalName });
  }, []);

  const hideModal = useCallback((modalName) => {
    dispatch({ type: WORKOUT_ACTIONS.HIDE_MODAL, payload: modalName });
  }, []);

  const hideAllModals = useCallback(() => {
    dispatch({ type: WORKOUT_ACTIONS.HIDE_ALL_MODALS });
  }, []);

  // =============================================================================
  // 🎯 API FUNCTIONS FOR SUPABASE INTEGRATION
  // =============================================================================

  // Obtener estado desde BD (reemplaza localStorage)
  const getTrainingStateFromDB = useCallback(async () => {
    if (!user?.id) return null;

    try {
      const data = await apiClient.get('/training/state');
      return data?.data || data;
    } catch (error) {
      console.error('Error obteniendo estado desde BD:', error);
      return null;
    }
  }, [user?.id]);

  // hasActivePlan desde BD (no localStorage)
  const hasActivePlanFromDB = useCallback(async () => {
    const trainingState = await getTrainingStateFromDB();
    return trainingState?.hasActivePlan || false;
  }, [getTrainingStateFromDB]);

  // Sincronizar estado local con BD
  const syncWithDatabase = useCallback(async () => {
    if (!user?.id) return;

    try {
      const dbState = await getTrainingStateFromDB();
      if (dbState && dbState.hasActivePlan && dbState.activePlan) {
        // Actualizar estado local con datos de BD
        dispatch({
          type: WORKOUT_ACTIONS.SET_PLAN,
          payload: {
            currentPlan: dbState.activePlan.plan_data,
            methodologyPlanId: dbState.activePlan.id,
            status: PLAN_STATUS.ACTIVE,
            planStartDate: dbState.activePlan.started_at || new Date().toISOString(),
            methodology: dbState.activePlan.methodology_type,
            weekTotal: dbState.activePlan.plan_data?.semanas?.length || dbState.activePlan.plan_data?.weeks?.length || 0,
            currentWeek: dbState.activePlan.current_week || 1
          }
        });
      }
    } catch (error) {
      console.error('Error sincronizando con BD:', error);
    }
  }, [user?.id]);

  // Efecto para sincronizar al montar
  useEffect(() => {
    if (user?.id) {
      syncWithDatabase();
    }
  }, [user?.id, syncWithDatabase]);

  // =============================================================================
  // 🔁 Today-status cache compartido (dedupe entre pestañas)
  // =============================================================================

  const todayStatusCacheRef = useRef({});

  const getTodayStatusCached = useCallback(async ({ methodologyPlanId, dayId }) => {
    if (!methodologyPlanId || !dayId) return null;
    const key = `${methodologyPlanId}:${dayId}`;
    const entry = todayStatusCacheRef.current[key] || {};

    // Reutilizar petición en curso
    if (entry.inflight) return entry.inflight;

    // TTL corto para evitar bursts de renders
    const TTL_MS = 1500;
    if (entry.ts && entry.data && (Date.now() - entry.ts < TTL_MS)) {
      return entry.data;
    }

    // Aadir session_date para forzar seleccin por fecha exacta en backend (Europe/Madrid)
    const tz = 'Europe/Madrid';
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const s = fmt.format(new Date()); // YYYY-MM-DD
    const todayISODate = s; // ya est en formato yyyy-mm-dd

    const params = new URLSearchParams({ methodology_plan_id: String(methodologyPlanId), session_date: todayISODate });
    console.log('🔍 [WorkoutContext] Llamando a today-status con:', { methodologyPlanId, dayId, session_date: todayISODate });
    const promise = apiClient.get(`/routines/sessions/today-status?${params.toString()}`)
      .then((data) => {
        console.log('✅ [WorkoutContext] today-status respuesta:', data);
        todayStatusCacheRef.current[key] = { data, ts: Date.now(), inflight: null };
        return data;
      })
      .catch((err) => {
        console.error('❌ [WorkoutContext] Error en today-status:', err);
        // Limpiar inflight en error para permitir reintentos
        todayStatusCacheRef.current[key] = { data: null, ts: Date.now(), inflight: null };
        // No lanzar el error si es 404 (sin sesión para este día)
        if (err?.status === 404) {
          console.log('ℹ️ [WorkoutContext] No hay sesión para este día (404)');
          return { success: false, session: null, exercises: [], summary: {} };
        }
        throw err;
      });

    todayStatusCacheRef.current[key] = { ...entry, inflight: promise };
    return promise;
  }, []);

  // =============================================================================
  // 🎯 CONTEXT VALUE
  // =============================================================================

  const contextValue = {
    // Estado
    ...state,

    // Plan actions
    loadActivePlan,
    updatePlan,

    // Shared cache helpers
    getTodayStatusCached,

    generatePlan,
    activatePlan,
    archivePlan,
    cancelPlan,

    // Session actions
    startSession,
    updateExercise,
    completeSession,
    pauseSession,
    endSession,

    // Navigation
    goToMethodologies,
    goToTraining,
    goToCalendar,
    goToProgress,
    resetWorkout,

    // Modal actions
    showModal,
    hideModal,
    hideAllModals,

    // Utilities
    isTraining: state.session.status === SESSION_STATUS.IN_PROGRESS,
    isPaused: state.session.status === SESSION_STATUS.PAUSED,
    hasActivePlan: Boolean(state.plan.methodologyPlanId && state.plan.status === PLAN_STATUS.ACTIVE),
    hasActiveSession: Boolean(state.session.sessionId &&
      [SESSION_STATUS.IN_PROGRESS, SESSION_STATUS.PAUSED].includes(state.session.status)),

    // 🚀 NEW: Supabase Integration Functions
    getTrainingStateFromDB,
    hasActivePlanFromDB,
    syncWithDatabase,

    // UI helpers with enhanced object
    ui: {
      ...state.ui,
      showModal,
      hideModal,
      hideAllModals,
      setError: (error) => dispatch({ type: WORKOUT_ACTIONS.SET_ERROR, payload: error }),
      clearError: () => dispatch({ type: WORKOUT_ACTIONS.CLEAR_ERROR }),
      setLoading: (loading) => dispatch({ type: WORKOUT_ACTIONS.SET_LOADING, payload: loading }),
      showSuccess: (message) => console.log('[WorkoutContext] Success:', message) // Added to ui object for consistency
    },
    setError: (error) => dispatch({ type: WORKOUT_ACTIONS.SET_ERROR, payload: error }),
    showSuccess: (message) => console.log('✅', message), // Temporary success handler
    setLoading: (loading) => dispatch({ type: WORKOUT_ACTIONS.SET_LOADING, payload: loading }),

    // Constants
    WORKOUT_VIEWS,
    SESSION_STATUS,
    PLAN_STATUS
  };

  return (
    <WorkoutContext.Provider value={contextValue}>
      {children}
    </WorkoutContext.Provider>
  );
}

// =============================================================================
// 🪝 HOOK PERSONALIZADO
// =============================================================================

export function useWorkout() {
  const context = useContext(WorkoutContext);

  if (!context) {
    throw new Error('useWorkout debe ser usado dentro de un WorkoutProvider');
  }

  return context;
}
