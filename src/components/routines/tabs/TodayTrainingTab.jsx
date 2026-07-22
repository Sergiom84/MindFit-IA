/**
 * 🎯 TodayTrainingTab - Version Final Consolidada
 *
 * CAMBIOS CRÍTICOS:
 * ✅ Estado de sesión desde BD (no localStorage)
 * ✅ useWorkout refactorizado sin localStorage
 * ✅ Progreso real-time desde Supabase
 * ✅ Sincronización automática
 * ✅ Estado persistente entre dispositivos
 * ✅ PROBLEMA DE HOOKS RESUELTO - Sin returns tempranos problemáticos
 * ✅ REFACTORIZADO: Helpers extraídos a utils/training
 *
 * @version 3.1.0 - Refactorización con utils compartidos
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';

import {
  RefreshCw,
  AlertTriangle,
  Dumbbell,
  Clock
} from 'lucide-react';

import { useWorkout } from '@/contexts/WorkoutContext';
import { useAuth } from '@/contexts/AuthContext';

import SafeComponent from '../../ui/SafeComponent';
import { useTrace } from '@/contexts/TraceContext.jsx';
import { usePlanConfig } from '../alerts/FirstWeekWarning.jsx';

import { useNavigate } from 'react-router-dom';

// 🎯 UTILS COMPARTIDOS - Helpers extraídos para reutilización
import { getTodayName, isWeekend, computeDayId, formatDateForDisplay } from '@/utils/training/dateHelpers';
import { findTodaySession } from '@/utils/training/sessionFinders';

// 🎯 API HELPER - Usar el mismo helper robusto que CalendarTab
import { getTodaySessionStatus, getWeekendStatus } from '../api.js';

// 🎯 COMPONENTES MODULARES - Refactorización incremental
import { RestDayCard } from './TodayTrainingTab/components';
import TodayTrainingModalLayer from './TodayTrainingTab/components/TodayTrainingModalLayer.jsx';
// 🎯 ARCH-002: bloques presentacionales extraídos del monolito
import TodayTrainingHeader from './TodayTrainingTab/components/TodayTrainingHeader.jsx';
import StartSessionSection from './TodayTrainingTab/components/StartSessionSection.jsx';
import WeekendExtraSummaryCard from './TodayTrainingTab/components/WeekendExtraSummaryCard.jsx';
import CompletedSessionSummaryCard from './TodayTrainingTab/components/CompletedSessionSummaryCard.jsx';
import NoActivePlanCard from './TodayTrainingTab/components/NoActivePlanCard.jsx';
import { computeEstimatedDuration } from './TodayTrainingTab/helpers.js';
import { resolveEffortMethodKey } from './TodayTrainingTab/effortConfig.js';
import { computeGateCounts, computeGateLogic, computeHeaderProgressStats } from './TodayTrainingTab/gateLogic.js';
import { useRoutineSessionActions } from './TodayTrainingTab/hooks/useRoutineSessionActions.js';
import { useRoutineAuxiliaryActions } from './TodayTrainingTab/hooks/useRoutineAuxiliaryActions.js';

// 🎯 ADAPTACIÓN - Evaluación de transición
import { useAdaptationEvaluation } from '@/hooks/useAdaptationEvaluation';
import tokenManager from '../../../utils/tokenManager';
import { getApiBaseUrl } from '../../../config/api';

// ARCH-001 residual: sin base URL hardcodeada; usa getApiBaseUrl() (respeta VITE_API_URL/origen).
const API_URL = getApiBaseUrl();

// 🎯 CONTRATO COMÚN DE CIERRE — endpoint de autorregulación por metodología.
// Hipertrofia queda fuera a propósito (tiene su propio subsistema D1-D5).
export default function TodayTrainingTab({
  routinePlan,
  methodologyPlanId,
  planStartDate,
  todayName,
  onProgressUpdate,
  onStartTraining
}) {
  const { track } = useTrace();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;

  // 🎯 NUEVO: Cargar configuración del plan para redistribución
  const { config: planConfig, loading: configLoading } = usePlanConfig(methodologyPlanId);

  // ===============================================
  // 🚀 WORKOUT CONTEXT
  // ===============================================

  const {
    // Estado desde BD (mejorado)
    plan,
    session,
    ui,

    // Acciones principales
    startSession,
    completeSession,
    updateExercise,

    // Modales
    showModal,
    hideModal,

    // Utilidades basadas en BD
    hasActivePlan,
    hasActiveSession,

    // Funciones adicionales
    setLoading,
    setError,
    showSuccess,
    goToMethodologies,
    cancelPlan
  } = useWorkout();

  const effectivePlanStartISO = plan?.planStartDate || planStartDate;
  const isPlanStartInFuture = useMemo(() => {
    if (!effectivePlanStartISO) return false;
    try {
      const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Madrid',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const startStr = fmt.format(new Date(effectivePlanStartISO));
      const todayStr = fmt.format(new Date());
      return startStr > todayStr;
    } catch (error) {
      console.warn('Error comprobando fecha de inicio:', error?.message || error);
      return false;
    }
  }, [effectivePlanStartISO]);

  const planStartDisplay = useMemo(() => {
    if (!effectivePlanStartISO) return null;
    return formatDateForDisplay(effectivePlanStartISO);
  }, [effectivePlanStartISO]);

  // ===============================================
  // 🎯 ESTADO LOCAL
  // ===============================================

  const [localState, setLocalState] = useState({
    showSessionModal: false,
    showWarmupModal: false,
    showRejectionModal: false,
    pendingSessionData: null,
    planExercises: [],
    loadingExercises: false
  });

  const [todaySessionData, setTodaySessionData] = useState(null);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [exerciseProgress, setExerciseProgress] = useState({});
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isStarting, setIsStarting] = useState(false); // Prevenir doble click
  const [sessionError, setSessionError] = useState(null);
  const [todayStatus, setTodayStatus] = useState(null);
  const [loadingTodayStatus, setLoadingTodayStatus] = useState(false);
  const [isLoadingWeekendWorkout, setIsLoadingWeekendWorkout] = useState(false);
  const [adaptationState, setAdaptationState] = useState({
    loading: false,
    hasBlock: false,
    readyForTransition: false,
    block: null
  });

  // 🎯 FASE 2: Estado para modal de prioridad muscular
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [currentPriority, setCurrentPriority] = useState(null);
  // 🎯 Autorregulación común: un único estado de modal de esfuerzo por metodología.
  // method = clave de EFFORT_ENDPOINTS (o null); scale solo aplica a CrossFit.
  const [effortModal, setEffortModal] = useState({
    method: null,
    show: false,
    decision: null,
    saving: false,
    error: null,
    scale: 'rx',
    sessionId: null,
    wodSummary: null,
    crossfitV2: false
  });

  // 🎯 Metodología del plan activo (para elegir player y modal de cierre correctos).
  const activeMethodKey = useMemo(() => resolveEffortMethodKey(
    plan?.metodologia || plan?.methodology_type || plan?.methodologyType ||
    routinePlan?.metodologia || routinePlan?.methodology_type || ''
  ), [plan?.metodologia, plan?.methodology_type, plan?.methodologyType, routinePlan?.metodologia, routinePlan?.methodology_type]);

  // 🎯 Guarda para no abrir dos veces el modal de esfuerzo de la misma sesión.
  // RoutineSessionModal filtra los ejercicios completados, así que se cierra tras
  // cada ejercicio y nunca llega a su EndModal→onEndSession; la apertura del modal
  // de esfuerzo se gestiona al detectar el cierre real en handleExerciseUpdate.
  const effortClosureHandledRef = useRef(new Set());

  // 🎯 ADAPTACIÓN: Hook para evaluación de transición
  const {
    evaluation,
    showTransitionModal,
    evaluationLoading,
    evaluationError,
    evaluateAdaptationWeek,
    resetModal,
    setShowTransitionModal
  } = useAdaptationEvaluation();

  // Nombre del día actual disponible para hooks que lo requieren
  const currentTodayName = todayName || getTodayName();


  // Estado de sesión de fin de semana (helper en ../api.js).
  const fetchWeekendStatus = useCallback(() => getWeekendStatus(), []);

  // Estado de adaptación (mostrar badge cuando hay bloque activo y aún no D1-D5)
  const fetchAdaptationProgress = useCallback(async () => {
    try {
      setAdaptationState((prev) => ({ ...prev, loading: true }));
      const token = tokenManager.getToken();
      if (!token) {
        setAdaptationState((prev) => ({ ...prev, loading: false }));
        return;
      }
      const resp = await fetch(
        `${API_URL}/api/adaptation/progress`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      const data = await resp.json();
      if (!resp.ok || data.success === false) {
        throw new Error(data.error || 'No se pudo cargar adaptación');
      }
      if (data.hasActiveBlock) {
        setAdaptationState({
          loading: false,
          hasBlock: true,
          readyForTransition: data.block?.readyForTransition || false,
          block: data.block
        });
      } else {
        setAdaptationState({
          loading: false,
          hasBlock: false,
          readyForTransition: false,
          block: null
        });
      }
    } catch (err) {
      console.error('❌ [ADAPTACIÓN] Error cargando progreso:', err);
      setAdaptationState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    fetchAdaptationProgress();
  }, [fetchAdaptationProgress]);

  const fetchTodayStatus = useCallback(async () => {
    const currentMethodologyPlanId = methodologyPlanId || plan.methodologyPlanId;

    console.log('🔍 fetchTodayStatus - isWeekend:', isWeekend(), 'day:', new Date().getDay());

    if (isPlanStartInFuture) {
      console.log('⏳ Plan aún no inicia, saltando fetchTodayStatus');
      setTodayStatus(null);
      setTodaySessionData(null);
      return null;
    }

    // Si es fin de semana, buscar sesiones de fin de semana
    if (isWeekend()) {
      console.log('📅 Es fin de semana, buscando sesión weekend...');
      const weekendData = await fetchWeekendStatus();
      console.log('📦 Weekend data recibida:', weekendData);
      if (weekendData?.hasWeekendSession) {
        console.log('🎯 Usando datos de sesión de fin de semana');
        setTodayStatus({
          session: weekendData.session,
          exercises: weekendData.exercises,
          summary: weekendData.summary
        });

        // Si hay ejercicios, configurar la sesión actual
        if (weekendData.exercises?.length > 0) {
          const exercisesData = typeof weekendData.session.exercises_data === 'string'
            ? JSON.parse(weekendData.session.exercises_data)
            : weekendData.session.exercises_data;

          setTodaySessionData({
            dia: new Date().toLocaleDateString('es-ES', { weekday: 'long' }),
            tipo: 'Full Body Extra',
            ejercicios: exercisesData || [],
            isWeekendExtra: true,
            session_type: 'weekend-extra'  // 🌟 Agregar session_type para detección
          });
        }

        return {
          session: weekendData.session,
          exercises: weekendData.exercises,
          summary: weekendData.summary
        };
      }
    }

    // Si no hay plan activo o metodología, no continuar
    if (!hasActivePlan || !currentMethodologyPlanId) return null;

    setLoadingTodayStatus(true);
    try {
      // Verificar que tenemos un token válido
      const token = tokenManager.getToken();
      if (!token) {
        console.error('❌ No hay token de autenticación');
        setTodayStatus(null);
        return null;
      }

      // Calcular semana actual desde el inicio del plan
    const startISO = (plan.planStartDate || planStartDate || new Date().toISOString());
      const dayId = computeDayId(startISO, 'Europe/Madrid');
      const weekNumber = Math.max(1, Math.ceil(dayId / 7));

      // Normalizar nombre del día actual
      const dayNames = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
      const dayName = dayNames[new Date().getDay()];
      const sessionDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Madrid',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());

      console.log('🔍 fetchTodayStatus params:', {
        methodologyPlanId: currentMethodologyPlanId,
        weekNumber,
        dayName,
        dayId,
        sessionDate,
        startISO,
        hasToken: !!token
      });

      // 🎯 UNIFICACIÓN: Usar el mismo helper robusto que CalendarTab
      // Este helper:
      // - Usa URLSearchParams para manejo seguro de null/undefined
      // - Envía day_id cuando está disponible (más confiable)
      // - Llama al endpoint robusto con sistema de prioridades y fallbacks
      // - Maneja 404 internamente y retorna null
      const data = await getTodaySessionStatus({
        methodology_plan_id: currentMethodologyPlanId,
        week_number: weekNumber,
        day_name: dayName,
        day_id: dayId,  // 🌟 Ahora se envía el day_id calculado
        session_date: sessionDate
      });

      // getTodaySessionStatus() ya maneja el 404 y retorna null
      if (!data) {
        console.log('ℹ️ Sesión no iniciada o día de descanso:', {
          methodologyPlanId: currentMethodologyPlanId,
          weekNumber,
          dayName,
          dayId
        });
        setTodayStatus(null);
        setTodaySessionData(null);
        return null;
      }

      console.log('📥 Respuesta completa de today-status:', data);

      // Data viene del helper, ya parseada
      const normalized = {
        session: data.session,
        exercises: data.exercises,
        summary: data.summary,
        sessionNotStarted: data.sessionNotStarted || false
      };
      setTodayStatus(normalized);

      // 🆕 Construir estructura compatible con ExerciseList usando datos reales del backend
      if (Array.isArray(data.exercises) && data.exercises.length > 0) {
        const normalizedExercises = data.exercises.map((exercise, index) => ({
          nombre: exercise.exercise_name || exercise.nombre || `Ejercicio ${index + 1}`,
          series: String(exercise.series_total || exercise.series || '—'),
          repeticiones: String(exercise.repeticiones || exercise.reps || '—'),
          descanso: exercise.descanso_seg
            ? `${exercise.descanso_seg}s`
            : (exercise.descanso || '60s'),
          intensidad: exercise.intensidad || null,
          tempo: exercise.tempo || null,
          notas: exercise.notas || '',
          order: exercise.exercise_order ?? index
        }));

        setTodaySessionData((prev) => ({
          ...prev,
          dia: data.session?.day_name || dayName,
          tipo: data.session?.session_name || prev?.tipo || 'Entrenamiento del día',
          ejercicios: normalizedExercises,
          sessionId: data.session?.id || prev?.sessionId || null,
          sessionStatus: data.session?.session_status || prev?.sessionStatus || null,
          summary: data.summary
        }));
      } else {
        setTodaySessionData(null);
      }

      console.log('✅ todayStatus actualizado:', {
        session_id: data.session?.id,
        session_status: data.session?.session_status,
        exercises_count: data.exercises?.length,
        completed: data.summary?.completed,
        skipped: data.summary?.skipped,
        cancelled: data.summary?.cancelled
      });

      return normalized;
    } catch (error) {
      console.error('❌ Error obteniendo estado del día:', error);
      setTodayStatus(null);
      return null;
    } finally {
      setLoadingTodayStatus(false);
    }
  }, [methodologyPlanId, plan.methodologyPlanId, plan.planStartDate, planStartDate, hasActivePlan, fetchWeekendStatus, isPlanStartInFuture]);


  const mountedRef = useRef(true);
  const warmupShownSessionsRef = useRef(new Set());

  const updateLocalState = (updates) => {
    // Acepta objeto o función (estilo setState). Antes, pasar una función esparcía
    // la función en el objeto (no-op silencioso) y se perdían transiciones clave
    // como calentamiento → entrenamiento principal.
    setLocalState(prev => ({
      ...prev,
      ...(typeof updates === 'function' ? updates(prev) : updates)
    }));
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ===============================================
  // 🔄 CARGAR PROGRESO DE EJERCICIOS
  // ===============================================

  const loadExerciseProgress = useCallback(async () => {
    if (!session.sessionId) return;

    console.log('🔍 DEBUG loadExerciseProgress: TEMPORALMENTE DESHABILITADO para evitar 404');
    // TEMPORALMENTE COMENTADO PARA EVITAR ERROR 404
    // TODO: Implementar endpoint /api/training-session/progress/:sessionId en backend
    /*

    try {
      const token = tokenManager.getToken();
      const response = await fetch(`/api/training-session/progress/${session.sessionId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.progress) {
          setExerciseProgress(result.progress);
        }
      }
    } catch (error) {
      console.error('Error cargando progreso de ejercicios:', error);
    }
    */
  }, [session.sessionId]);

  // ===============================================
  // 🔄 SINCRONIZACIÓN CON BD
  // ===============================================

  useEffect(() => {
    // Usar el plan de props si existe, sino el del contexto
    const effectivePlan = routinePlan || plan.currentPlan;

    console.log('🔍 DEBUG TodayTrainingTab - Estado inicial:', {
      hasActivePlan,
      effectivePlan: effectivePlan,
      currentTodayName,
      routinePlan: routinePlan,
      planFromContext: plan.currentPlan
    });

    if (hasActivePlan && effectivePlan) {
      if (isPlanStartInFuture) {
        setTodaySessionData(null);
        return;
      }
      // 🎯 FIX (sesión de hoy incoherente en arranques a media semana):
      // El backend (today-status) es la fuente autoritativa y respeta la
      // redistribución de días por fecha. findTodaySession() busca en plan_data
      // por NOMBRE DE DÍA, que no coincide con la sesión programada por fecha
      // cuando el plan empieza a media semana. Por eso solo usamos plan_data como
      // PREVIEW inicial mientras el backend no ha respondido; una vez hay sesión
      // del backend, no la sobrescribimos.
      if (!todayStatus?.exercises?.length) {
        const startISO = (plan.planStartDate || planStartDate || new Date().toISOString());
        const dayId = computeDayId(startISO, 'Europe/Madrid');
        const currentWeekIdx = Math.max(0, Math.ceil(dayId / 7) - 1);

        const sessionData = findTodaySession(effectivePlan, currentTodayName, currentWeekIdx);
        console.log('🔍 DEBUG sessionData (preview plan_data):', {
          sessionData,
          todayName: currentTodayName,
          currentWeekIdx,
          dayId,
          cantidadEjercicios: sessionData?.ejercicios?.length
        });
        setTodaySessionData(sessionData);
      }

      // Si hay sesión activa, cargar estado desde contexto
      if (hasActiveSession && session.sessionId) {
        setCurrentExerciseIndex(session.currentExerciseIndex || 0);
        setSessionStartTime(session.sessionStarted ? new Date(session.sessionStarted) : null);

        // Cargar progreso de ejercicios desde BD
        loadExerciseProgress();
      }
    }
  }, [hasActivePlan, routinePlan, plan.currentPlan, currentTodayName, hasActiveSession, session, plan.planStartDate, planStartDate, loadExerciseProgress, isPlanStartInFuture, todayStatus?.exercises?.length]);


  // ===============================================
  // 🏃 HANDLERS DE SESIÓN
  // ===============================================


  // 🎯 CORRECCIÓN CRÍTICA: Refrescar resumen del día al cambiar estado de sesión o cerrar el modal
  // Agregado: Forzar re-fetch cuando el modal se cierra (showSessionModal false)
  // 🌟 WEEKEND: También ejecutar si es fin de semana (para cargar sesiones weekend-extra)
  useEffect(() => {
    // 🌟 Permitir ejecución si hay plan activo O si es fin de semana
    if (!hasActivePlan && !isWeekend()) {
      console.log('⏸️ No hay plan activo y no es fin de semana, saltando fetchTodayStatus');
      return;
    }

    console.log('🔄 Ejecutando fetchTodayStatus...', { hasActivePlan, isWeekend: isWeekend() });

    // 🎯 IMPORTANTE: Si el modal se acaba de cerrado (showSessionModal === false), forzar actualización
    if (localState.showSessionModal === false) {
      console.log('🔄 Modal cerrado, forzando refresh del estado desde BD...');
      fetchTodayStatus();
    } else {
      fetchTodayStatus();
    }
  }, [hasActivePlan, currentTodayName, session.status, localState.showSessionModal, fetchTodayStatus]);

  const wantRoutineModal = localState.showSessionModal || ui.showRoutineSession || ui.showSession;

  // 🎯 FILTRAR EJERCICIOS NO COMPLETADOS para el modal
  const filteredSessionData = useMemo(() => {
    if (!todaySessionData?.ejercicios || !wantRoutineModal) return null;

    const allExercises = todaySessionData.ejercicios;
    const filteredExercises = [];
    const originalIndexMapping = [];

    // 🎯 CORRECCIÓN: Para "Reanudar Entrenamiento", solo mostrar ejercicios saltados/cancelados
    // Detectar si estamos en modo "retry" (cuando hay ejercicios saltados o cancelados)
    const hasSkippedOrCancelled = todayStatus?.exercises?.some(ex => {
      const status = String(ex?.status || '').toLowerCase();
      return status === 'skipped' || status === 'cancelled';
    }) || Object.values(exerciseProgress || {}).some(p => {
      const status = String(p?.status || '').toLowerCase();
      return status === 'skipped' || status === 'cancelled';
    });

    allExercises.forEach((ejercicio, originalIndex) => {
      // Verificar estado desde backend (prioritario) o estado local
      const backendStatus = todayStatus?.exercises?.[originalIndex]?.status;
      const localStatus = exerciseProgress?.[originalIndex]?.status;
      const effectiveStatus = String(backendStatus || localStatus || 'pending').toLowerCase();

      // Si hay ejercicios saltados/cancelados, SOLO incluir esos
      // Si no hay saltados/cancelados, incluir todos los no completados (comportamiento normal)
      const shouldInclude = hasSkippedOrCancelled
        ? (effectiveStatus === 'skipped' || effectiveStatus === 'cancelled')
        : (effectiveStatus !== 'completed');

      if (shouldInclude) {
        filteredExercises.push({
          ...ejercicio,
          originalIndex, // Mantener referencia al índice original
          currentStatus: effectiveStatus
        });
        originalIndexMapping.push(originalIndex);
      }
    });

    console.log('🔍 DEBUG Filtrado de ejercicios para modal:', {
      modoRetry: hasSkippedOrCancelled,
      totalEjercicios: allExercises.length,
      ejerciciosFiltrados: filteredExercises.length,
      indicesOriginales: originalIndexMapping,
      ejerciciosExcluidos: allExercises.length - filteredExercises.length,
      ejerciciosIncluidos: filteredExercises.map((e, i) => `${i} (orig: ${e.originalIndex}) - ${e.nombre} [${e.currentStatus}]`),
      filtro: hasSkippedOrCancelled ? 'Solo saltados/cancelados' : 'Todos los no completados'
    });

    return {
      ...todaySessionData,
      ejercicios: filteredExercises,
      originalIndexMapping,
      totalOriginalExercises: allExercises.length
    };
  }, [todaySessionData, wantRoutineModal, todayStatus?.exercises, exerciseProgress]);

  const sessionExerciseProgress = useMemo(() => {
    // Fuente preferente: todayStatus.exercises (estructura del backend)
    if (Array.isArray(todayStatus?.exercises) && todayStatus.exercises.length > 0) {
      return todayStatus.exercises.map((ex, idx) => ({
        exercise_order: idx,
        status: String(ex?.status || 'pending').toLowerCase()
      }));
    }

    // Fallback: estado local exerciseProgress
    if (todaySessionData?.ejercicios?.length) {
      return todaySessionData.ejercicios.map((_, idx) => ({
        exercise_order: idx,
        status: String(exerciseProgress?.[idx]?.status || 'pending').toLowerCase()
      }));
    }

    return [];
  }, [todayStatus?.exercises, exerciseProgress, todaySessionData?.ejercicios]);

  const {
    handleStartSession,
    handleResumeSession,
    handleCompleteSession,
    handleEffortSubmit,
    handleEffortClose,
    handleExerciseUpdate
  } = useRoutineSessionActions({
    activeMethodKey,
    completeSession,
    currentExerciseIndex,
    effortClosureHandledRef,
    effortModal,
    evaluateAdaptationWeek,
    exerciseProgress,
    fetchTodayStatus,
    hasActiveSession,
    isLoadingSession,
    isStarting,
    localState,
    methodologyPlanId,
    onProgressUpdate,
    onStartTraining,
    plan,
    planStartDate,
    routinePlan,
    session,
    sessionExerciseProgress,
    sessionStartTime,
    setCurrentExerciseIndex,
    setEffortModal,
    setError,
    setExerciseProgress,
    setIsLoadingSession,
    setIsStarting,
    setSessionError,
    setSessionStartTime,
    setTodaySessionData,
    showSuccess,
    startSession,
    todaySessionData,
    todayStatus,
    track,
    updateExercise,
    updateLocalState,
    warmupShownSessionsRef
  });

  const {
    handleWarmupComplete,
    handleGenerateWeekendWorkout,
    handleSkipWarmup,
    handleCloseWarmup,
    handleCancelPlan,
    handleCloseCancelModal
  } = useRoutineAuxiliaryActions({
    cancelPlan,
    fetchTodayStatus,
    goToMethodologies,
    hideModal,
    isLoadingWeekendWorkout,
    localState,
    plan,
    session,
    sessionExerciseProgress,
    setError,
    setIsLoadingWeekendWorkout,
    setLoading,
    setSessionError,
    setTodaySessionData,
    setTodayStatus,
    showModal,
    showSuccess,
    todaySessionData,
    todayStatus,
    track,
    ui,
    updateLocalState,
    user
  });

  // 🎯 FASE 2: HANDLERS DE PRIORIDAD MUSCULAR
  // ===============================================

  // Cargar prioridad actual al montar
  useEffect(() => {
    if (!userId) return;

    const fetchPriority = async () => {
      try {
        const token = tokenManager.getToken();
        const response = await fetch(
          `${API_URL}/api/hipertrofiav2/priority-status/${userId}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.priority) {
            setCurrentPriority(data.priority);
          }
        }
      } catch (error) {
        console.error('❌ [PRIORITY] Error cargando prioridad:', error);
      }
    };

    fetchPriority();
  }, [userId]);

  const handlePriorityActivate = (result) => {
    console.log('✅ [PRIORITY] Prioridad activada:', result);
    setCurrentPriority(result);
    showSuccess(`Prioridad activada para ${result.priority_muscle}`);
    // Refrescar el badge
    setTimeout(() => window.location.reload(), 500);
  };

  const handlePriorityDeactivate = (result) => {
    console.log('✅ [PRIORITY] Prioridad desactivada:', result);
    setCurrentPriority(null);
    showSuccess('Prioridad muscular desactivada');
    // Refrescar el badge
    setTimeout(() => window.location.reload(), 500);
  };

  // ===============================================
  // 📊 CÁLCULOS DE PROGRESO
  // ===============================================

  const estimatedDuration = useMemo(
    () => computeEstimatedDuration(todaySessionData?.ejercicios),
    [todaySessionData?.ejercicios]
  );

  // Progreso por ejercicio que usará el modal para saltar completados

  // 🎯 NUEVA LÓGICA: Usar canResume del backend en lugar de calcular localmente
  const shouldResume = useMemo(() => {
    // 1. Prioridad: Usar la decisión inteligente del backend
    if (todayStatus?.session?.canResume !== undefined) {
      return todayStatus.session.canResume;
    }

    // 2. Fallback: Si no hay respuesta del backend, calcular localmente
    if (Array.isArray(todayStatus?.exercises)) {
      return todayStatus.exercises.some((ex) => {
        const s = String(ex?.status || 'pending').toLowerCase();
        return s !== 'pending';
      });
    }
    return Object.values(exerciseProgress || {}).some((p) => {
      const s = String(p?.status || 'pending').toLowerCase();
      return s !== 'pending';
    });
  }, [todayStatus?.session?.canResume, todayStatus?.exercises, exerciseProgress]);

  // Índice recomendado para reanudar (primer ejercicio pendiente)
  const nextPendingIndex = useMemo(() => {
    if (Array.isArray(todayStatus?.exercises) && todayStatus.exercises.length > 0) {
      const idx = todayStatus.exercises.findIndex((ex) => String(ex?.status || 'pending').toLowerCase() === 'pending');
      return idx >= 0 ? idx : 0;
    }
    if (todaySessionData?.ejercicios?.length) {
      for (let i = 0; i < todaySessionData.ejercicios.length; i++) {
        const s = String(exerciseProgress?.[i]?.status || 'pending').toLowerCase();
        if (s === 'pending') return i;
      }
    }
    return 0;
  }, [todayStatus?.exercises, exerciseProgress, todaySessionData?.ejercicios?.length]);

  // Cuando no hay sesión activa, preparar el índice para reanudar
  useEffect(() => {
    if (!hasActiveSession) {
      setCurrentExerciseIndex(nextPendingIndex);
    }
  }, [hasActiveSession, nextPendingIndex]);

  // Estados para mostrar el entrenamiento de hoy.
  // Fuente de verdad: backend (`today-status.summary`) cuando existe. El estado
  // local solo se usa como fallback mientras llega la primera respuesta.
  // Lógica pura extraída a ./TodayTrainingTab/gateLogic.js (ARCH-002).
  const gateCounts = useMemo(
    () => computeGateCounts({ todayStatus, todaySessionData, exerciseProgress }),
    [todayStatus, todaySessionData, exerciseProgress]
  );
  const {
    total: totalCountForGate,
    completed: completedCountForGate,
    skipped: skippedCountForGate,
    cancelled: cancelledCountForGate,
    pending: pendingCountForGate,
    inProgress: inProgressCountForGate,
    hasBackendSummary
  } = gateCounts;

  // 🎯 CORRECCIÓN VISUAL: Lógica robusta estabilizada con useMemo para evitar recálculos
  const gateLogic = useMemo(
    () => computeGateLogic({ counts: gateCounts, todayStatus }),
    [gateCounts, todayStatus]
  );

  // Extraer valores del objeto memoizado
  const {
    hasIncompleteExercises,
    allProcessedToday,
    isFinishedToday,
    hasCompletedSession,
    allProcessedIncomplete,
    canRetryToday,
    hasUnfinishedWorkToday
  } = gateLogic;
  // 🎯 FIX: isRestDay solo es true cuando el backend confirma que no hay entrenamiento programado
  const isRestDay = hasActivePlan && !todaySessionData && !loadingTodayStatus && !isPlanStartInFuture;
  const noActivePlan = !hasActivePlan;
  
  // 🎯 FIX: Detectar sesión programada pero no iniciada
  const sessionNotStarted = todayStatus?.sessionNotStarted || false;
  const sessionMatchesToday = hasActiveSession && !!session?.dayName && !!todaySessionData?.dia && (
    session.dayName.toLowerCase() === todaySessionData.dia.toLowerCase()
  );

  // 🆕 CORRECCIÓN: Verificar tanto todaySessionData como todayStatus para detectar sesiones
  const hasToday = !isPlanStartInFuture && Boolean(
    todaySessionData?.ejercicios?.length > 0 ||
    (todayStatus?.session && todayStatus?.summary?.total > 0)
  );


  // Progreso para header (completados/total/skip/cancel)
  const headerProgressStats = useMemo(
    () => computeHeaderProgressStats({ todayStatus, todaySessionData, exerciseProgress }),
    [todayStatus, todaySessionData, exerciseProgress]
  );

  // 🔍 DEBUG: Verificar qué está pasando antes del render (incluyendo estados de carga)
  console.log('🔍 DEBUG TodayTrainingTab SECTIONS:', {
    // Condiciones principales
    hasActivePlan,
    hasToday,
    todayStatus: !!todayStatus,
    loadingTodayStatus, // 🎯 NUEVO: estado de carga

    // Contadores (priorizan datos locales sobre backend para estabilidad)
    totalCountForGate,
    completedCountForGate,
    pendingCountForGate,
    inProgressCountForGate,
    skippedCountForGate,
    cancelledCountForGate,

    // Estados derivados (corregidos y robustos con useMemo)
    hasIncompleteExercises,    // hay ejercicios sin completar
    allProcessedToday,         // no quedan pending/in_progress
    isFinishedToday,           // session_status === 'completed' (backend)
    hasCompletedSession,       // session completada exitosamente
    allProcessedIncomplete,    // procesados pero no todos completed
    hasUnfinishedWorkToday,    // hay trabajo sin terminar (botón de reanudar)

    // Secciones a renderizar (ahora incluye loading state)
    showSection1_InProgress: (hasToday && hasActivePlan && hasUnfinishedWorkToday) || (hasToday && hasActivePlan && loadingTodayStatus && !todayStatus),
    showSection2_Incomplete: hasActivePlan && hasToday && allProcessedIncomplete && todayStatus,
    showSection3_Completed: hasActivePlan && hasToday && hasCompletedSession && todayStatus,

    // Debug adicional
    sessionStatus: session.status,
    todayStatusSessionStatus: todayStatus?.session?.session_status,
    canRetry: canRetryToday,

    // 🎯 NUEVO: Fuente de datos para contadores
    dataSource: hasBackendSummary ? 'backend (today-status.summary)' : (todaySessionData?.ejercicios?.length ? 'local fallback' : 'ninguno')
  });


  const planMethodology = plan?.metodologia
    || plan?.methodologyType
    || plan?.methodology_type
    || plan?.currentPlan?.metodologia
    || plan?.currentPlan?.methodologyType
    || plan?.currentPlan?.methodology_type
    || routinePlan?.metodologia
    || routinePlan?.methodologyType
    || routinePlan?.methodology_type;

  // 🧬 HipertrofiaV2 (MindFeed) usa su reproductor propio, alimentado por el
  // backend (todayStatus), porque su plan_data etiqueta los días D1-D5 con nombres
  // de semana y el reproductor común mostraría la sesión equivocada. No afecta al
  // resto de metodologías (incluido Gimnasio, cuyo tipo es 'Gimnasio', no MindFeed).
  const isHipertrofiaV2 = /hipertrofia|mindfeed/i.test(String(planMethodology || ''));

  const effectiveSession = localState.pendingSessionData?.session || (
    wantRoutineModal && (session.sessionId || localState.pendingSessionData?.sessionId) && filteredSessionData
      ? {
          ...filteredSessionData,
          sessionId: session.sessionId || localState.pendingSessionData?.sessionId,
          // filteredSessionData viene de todaySessionData (resumen día), que NUNCA
          // trae methodologyPlanId (es un query param, no un campo de esa respuesta).
          // Sin este fallback, RoutineSessionModal guarda cada serie con
          // methodology_plan_id NULL en "Reanudar Entrenamiento" tras filtrar
          // ejercicios ya completados -> se pierde la autorregulación y el
          // modal de esfuerzo no siempre encuentra el plan al cerrar sesión.
          methodologyPlanId: filteredSessionData?.methodologyPlanId || methodologyPlanId || plan?.methodologyPlanId,
          metodologia: filteredSessionData?.metodologia || filteredSessionData?.methodology_type || planMethodology,
          methodology_type: filteredSessionData?.methodology_type || filteredSessionData?.metodologia || planMethodology,
          currentExerciseIndex: 0, // Siempre empezar desde el primer ejercicio filtrado
          exerciseProgress: sessionExerciseProgress
        }
      : null
  );
  const effectiveSessionId = localState.pendingSessionData?.sessionId || session.sessionId;

  // ===============================================
  // 🎨 RENDER - SIN RETURNS TEMPRANOS PROBLEMÁTICOS
  // ===============================================


  // 🔍 DEBUG: Condiciones para mostrar RoutineSessionModal (post-cálculo)
  console.log('🔍 DEBUG RoutineSessionModal gate:', {
    local_showSessionModal: localState.showSessionModal,
    ui_showRoutineSession: ui.showRoutineSession,
    wantRoutineModal,
    hasEffectiveSession: !!effectiveSession,
    effectiveSessionId,
    hasPendingSessionData: !!localState.pendingSessionData,
    pendingSessionId: localState.pendingSessionData?.sessionId,
    hasTodaySessionData: !!todaySessionData
  });

  return (
    <SafeComponent context="TodayTrainingTab" fallback={<div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">Error cargando entrenamiento de hoy. Por favor, recarga la pagina.</div>}>
      <div className="space-y-6">
        {/* =============================================== */}
        {/* 🎯 ESTADOS DE CARGA Y ERROR - INLINE */}
        {/* =============================================== */}

        {ui.isLoading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-6 h-6 text-yellow-400 animate-spin mr-2" />



            <span className="text-gray-400">Cargando sesión de hoy...</span>
          </div>
        )}

        {ui.error && (
          <Alert className="border-red-500/20 bg-red-500/10">


            <AlertTriangle className="h-4 w-4 text-red-400" />
            <AlertDescription className="text-red-400">
              Error cargando datos: {ui.error}
              <Button
                onClick={() => window.location.reload()}
                variant="ghost"
                size="sm"
                className="ml-2 text-red-400 hover:text-red-300"
              >
                Reintentar
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* =============================================== */}
        {/* 🎯 HEADER CON ESTADO ACTUAL */}
        {/* =============================================== */}

        {!ui.isLoading && !ui.error && (
          <>
            {/* Solo mostrar header completo si hay plan activo */}
            {hasActivePlan && (
                <TodayTrainingHeader
                  methodologyPlanId={methodologyPlanId}
                  configLoading={configLoading}
                  planConfig={planConfig}
                  isPlanStartInFuture={isPlanStartInFuture}
                  planStartDisplay={planStartDisplay}
                  plan={plan}
                  adaptationState={adaptationState}
                  userId={userId}
                  fetchAdaptationProgress={fetchAdaptationProgress}
                  goToMethodologies={goToMethodologies}
                  setShowTransitionModal={setShowTransitionModal}
                  currentPriority={currentPriority}
                  setShowPriorityModal={setShowPriorityModal}
                  session={session}
                  headerProgressStats={headerProgressStats}
                />
            )}


            {/* =============================================== */}
            {/* 🏃 SESIÓN ACTIVA */}
            {/* =============================================== */}


            {/* =============================================== */}
            {/* 📋 SESIÓN DEL DÍA (NO INICIADA) */}
            {/* =============================================== */}

            {/* 🎯 FIX: Mostrar botón cuando:
                1. Hay sesión activa con trabajo pendiente
                2. Hay sesión programada pero no iniciada (sessionNotStarted)
                3. Está cargando el estado
            */}
            {((hasToday && hasActivePlan && hasUnfinishedWorkToday) ||
              (hasActivePlan && sessionNotStarted && todaySessionData?.ejercicios?.length > 0) ||
              (hasToday && hasActivePlan && loadingTodayStatus && !todayStatus) ||
              (hasToday && hasActivePlan && !loadingTodayStatus && todaySessionData?.ejercicios?.length > 0)) &&
              // Día ya completado: no ofrecer "Reanudar Entrenamiento"
              !(todayStatus?.session?.session_status === 'completed' &&
                (todayStatus?.summary?.isComplete || todayStatus?.summary?.isFinished)) ? (
              <StartSessionSection
                currentTodayName={currentTodayName}
                todaySessionData={todaySessionData}
                todayStatus={todayStatus}
                ui={ui}
                loadingTodayStatus={loadingTodayStatus}
                isLoadingSession={isLoadingSession}
                shouldResume={shouldResume}
                hasUnfinishedWorkToday={hasUnfinishedWorkToday}
                hasActiveSession={hasActiveSession}
                handleResumeSession={handleResumeSession}
                handleStartSession={handleStartSession}
                exerciseProgress={exerciseProgress}
                session={session}
                estimatedDuration={estimatedDuration}
                plan={plan}
                hasCompletedSession={hasCompletedSession}
              />
            ) : null}


            {/* =============================================== */}
            {/* 🌟 SESIÓN DE FIN DE SEMANA (WEEKEND-EXTRA) */}
            {/* =============================================== */}

            {/* Mostrar resumen de sesión de fin de semana */}
            {!hasActivePlan && todayStatus?.session?.session_type === 'weekend-extra' && (
              <WeekendExtraSummaryCard
                todayStatus={todayStatus}
                todaySessionData={todaySessionData}
                ui={ui}
                handleResumeSession={handleResumeSession}
                updateLocalState={updateLocalState}
              />
            )}

            {/* =============================================== */}
            {/* ✅ SESIÓN COMPLETADA EXITOSAMENTE */}
            {/* =============================================== */}

            {/* Resumen de sesión completada exitosamente */}
            {hasActivePlan && hasToday && hasCompletedSession && todayStatus && (
              <CompletedSessionSummaryCard
                currentTodayName={currentTodayName}
                todayStatus={todayStatus}
                todaySessionData={todaySessionData}
              />
            )}



            {/* =============================================== */}
            {/* ❌ NO HAY PLAN ACTIVO (pero puede haber sesión de fin de semana) */}
            {/* =============================================== */}

            {noActivePlan && !todayStatus?.session && !(todayStatus?.session?.session_type === 'weekend-extra') && (
              <NoActivePlanCard />
            )}

            {/* =============================================== */}
            {/* 🛌 DÍA DE DESCANSO / FIN DE SEMANA */}
            {/* =============================================== */}

            {hasActivePlan && !hasToday && !sessionMatchesToday && !hasCompletedSession && !isPlanStartInFuture && (
              <RestDayCard
                isRestDay={isRestDay}
                isLoadingWeekendWorkout={isLoadingWeekendWorkout}
                onGenerateWeekendWorkout={handleGenerateWeekendWorkout}
                showExtraInfo={true}
              />
            )}

            {/* =============================================== */}
            {/* ⚠️ ERRORES Y ALERTAS */}
            {/* =============================================== */}

            {sessionError && (
              <Alert className="border-red-200 bg-red-50/10">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <AlertDescription className="text-red-400">
                  <strong>Error de sesión:</strong> {sessionError}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSessionError(null)}
                    className="ml-2 text-red-400 hover:text-red-300"
                  >
                    Cerrar
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Botones de acción - Solo mostrar si hay plan activo */}
            {hasActivePlan && (
              <div className="flex gap-4 justify-center pt-4">
                <Button
                  onClick={() => updateLocalState({ showRejectionModal: true })}
                  variant="outline"
                  className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                  disabled={ui.isLoading}
                >
                  Cancelar rutina
                </Button>
              </div>
            )}

          </>
        )}

      {/* =============================================== */}
      {/* 🎭 MODALES (fuera de gating de loading/error para no bloquear apertura) */}
      {/* =============================================== */}

      <TodayTrainingModalLayer
        localState={localState}
        ui={ui}
        session={session}
        routinePlan={routinePlan}
        plan={plan}
        isHipertrofiaV2={isHipertrofiaV2}
        todayStatus={todayStatus}
        effectiveSessionId={effectiveSessionId}
        methodologyPlanId={methodologyPlanId}
        planMethodology={planMethodology}
        effectiveSession={effectiveSession}
        activeMethodKey={activeMethodKey}
        effortModal={effortModal}
        showPriorityModal={showPriorityModal}
        currentPriority={currentPriority}
        showTransitionModal={showTransitionModal}
        evaluation={evaluation}
        updateLocalState={updateLocalState}
        handleWarmupComplete={handleWarmupComplete}
        handleSkipWarmup={handleSkipWarmup}
        handleCloseWarmup={handleCloseWarmup}
        handleExerciseUpdate={handleExerciseUpdate}
        handleCompleteSession={handleCompleteSession}
        handleCloseCancelModal={handleCloseCancelModal}
        handleCancelPlan={handleCancelPlan}
        handleEffortSubmit={handleEffortSubmit}
        handleEffortClose={handleEffortClose}
        handlePriorityActivate={handlePriorityActivate}
        handlePriorityDeactivate={handlePriorityDeactivate}
        setShowPriorityModal={setShowPriorityModal}
        setShowTransitionModal={setShowTransitionModal}
        resetModal={resetModal}
        fetchAdaptationProgress={fetchAdaptationProgress}
        navigate={navigate}
        onProgressUpdate={onProgressUpdate}
        goToMethodologies={goToMethodologies}
      />

      </div>
    </SafeComponent>
  );
}
