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
import { Card } from '@/components/ui/card.jsx';

import {
  RefreshCw,
  Calendar,
  AlertTriangle,
  Dumbbell,
  Clock,
  Target,
  Play
} from 'lucide-react';

import { useWorkout } from '@/contexts/WorkoutContext';
import { useAuth } from '@/contexts/AuthContext';

import SafeComponent from '../../ui/SafeComponent';
import { useTrace } from '@/contexts/TraceContext.jsx';
import { ExerciseListItem } from '../summary/ExerciseListItem.jsx';
import { SummaryHeader } from '../summary/SummaryHeader.jsx';
import { UserProfileDisplay } from '../summary/UserProfileDisplay.jsx';
import { ProgressBar } from '../summary/ProgressBar.jsx';
import { FirstWeekWarning, usePlanConfig } from '../alerts/FirstWeekWarning.jsx';
import CycleStatusBadge from '../../Methodologie/methodologies/HipertrofiaV2/components/CycleStatusBadge';
import AdaptationTrackingBadge from '../../Methodologie/methodologies/HipertrofiaV2/components/AdaptationTrackingBadge.jsx';

import { useNavigate } from 'react-router-dom';

// 🎯 UTILS COMPARTIDOS - Helpers extraídos para reutilización
import { getTodayName, isWeekend, computeDayId, formatDateForDisplay } from '@/utils/training/dateHelpers';
import { findTodaySession } from '@/utils/training/sessionFinders';

// 🎯 API HELPER - Usar el mismo helper robusto que CalendarTab
import { getTodaySessionStatus, getWeekendStatus } from '../api.js';

// 🎯 COMPONENTES MODULARES - Refactorización incremental
import { ExerciseList, RestDayCard, StartSessionCard } from './TodayTrainingTab/components';
import TodayTrainingModalLayer from './TodayTrainingTab/components/TodayTrainingModalLayer.jsx';
import { resolveEffortMethodKey } from './TodayTrainingTab/effortConfig.js';
import { computeGateCounts, computeGateLogic, computeHeaderProgressStats } from './TodayTrainingTab/gateLogic.js';
import { useRoutineSessionActions } from './TodayTrainingTab/hooks/useRoutineSessionActions.js';
import { useRoutineAuxiliaryActions } from './TodayTrainingTab/hooks/useRoutineAuxiliaryActions.js';

// 🎯 ADAPTACIÓN - Nuevos componentes para evaluación de transición
import AdaptationProgressPanel from '../../Methodologie/methodologies/HipertrofiaV2/components/AdaptationProgressPanel';
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
    scale: 'rx',
    sessionId: null
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

  const estimatedDuration = useMemo(() => {
    if (!todaySessionData?.ejercicios) return 0;

    return todaySessionData.ejercicios.reduce((total, ejercicio) => {
      const sets = parseInt(ejercicio.series, 10) || 3;
      const reps = parseInt(ejercicio.repeticiones, 10) || 10;
      const rest = parseInt(ejercicio.descanso_seg, 10) || 60;

      // Estimación básica: (tiempo por rep * reps * sets) + descansos
      const exerciseTime = (2 * reps * sets) + (rest * (sets - 1));
      return total + exerciseTime;
    }, 0);
  }, [todaySessionData?.ejercicios]);

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
              <>
                {/* 🎯 NUEVO: Mostrar warnings de redistribución si aplica */}
                {!configLoading && planConfig && (
                  <FirstWeekWarning
                    methodologyPlanId={methodologyPlanId}
                    config={planConfig}
                    onClose={(index) => {
                      // Opcional: Manejar cierre de warnings individuales
                      console.log('Warning cerrado:', index);
                    }}
                  />
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-white font-urbanist">
                      Entrenamiento de Hoy
                      {/* 🎯 Mostrar número de sesión SOLO si hoy tiene mapeo
                          (antes renderizaba "(Sesión )" vacío cuando no había). */}
                      {(() => {
                        if (!planConfig?.day_mappings) return null;
                        const today = getTodayName();
                        const todayAbbrev = today.substring(0, 3);
                        const todayCapitalized = todayAbbrev.charAt(0).toUpperCase() + todayAbbrev.slice(1);
                        const mapping = planConfig.day_mappings[todayCapitalized];
                        if (!mapping) return null;
                        // Numerador GLOBAL (no el slot semanal 1-3): (semana-1)*sesiones_semana + slot.
                        // Total robusto = total_weeks * sesiones/semana (no depende del expected_sessions
                        // guardado, que en planes de principiante antiguos quedó hardcodeado a 12).
                        const weeklySlot = parseInt(mapping.replace('sesion_', ''), 10) || 1;
                        const perWeek = Object.keys(planConfig.day_mappings).length || 3;
                        const totalWeeks = planConfig.total_weeks
                          || Math.round((planConfig.expected_sessions || perWeek) / perWeek);
                        const totalSessions = totalWeeks * perWeek;
                        const currentWeek = plan?.currentWeek || 1;
                        const globalNum = Math.min(totalSessions, (currentWeek - 1) * perWeek + weeklySlot);
                        return (
                          <span className="ml-3 text-lg font-normal text-yellow-400">
                            (Sesión {globalNum} de {totalSessions})
                          </span>
                        );
                      })()}
                    </h2>
                    <p className="text-gray-300/80">
                      {new Date().toLocaleDateString('es-ES', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                </div>

                {isPlanStartInFuture && (
                  <Card className="mt-4 border border-yellow-400/30 border-l-2 border-l-yellow-400/40 bg-black/60 backdrop-blur-md">
                    <div className="p-4">
                      <h3 className="text-lg font-semibold text-yellow-300 font-urbanist">
                        Tu plan comienza el {planStartDisplay || 'próximo lunes'}
                      </h3>
                      <p className="text-sm text-gray-300/80 mt-1">
                        Hemos guardado tu plan. El entrenamiento empezará automáticamente en la fecha indicada.
                      </p>
                    </div>
                  </Card>
                )}

                {/* 🟣 Badge de adaptación (solo para fase de adaptación inicial, NO para MindFeed/D1-D5) */}
                {/* 🎯 FIX: Agregar validación de userId y mejor logging */}
                {(() => {
                  const shouldRenderAdaptation = adaptationState.hasBlock && 
                    plan?.metodologia !== 'HipertrofiaV2_MindFeed' && 
                    plan?.metodologia !== 'HipertrofiaV2' &&
                    userId;
                  
                  if (adaptationState.hasBlock) {
                    console.log('🔍 Condiciones AdaptationProgressPanel:', {
                      hasBlock: adaptationState.hasBlock,
                      metodologia: plan?.metodologia,
                      userId: !!userId,
                      shouldRender: shouldRenderAdaptation
                    });
                  }
                  
                  return shouldRenderAdaptation;
                })() && (
                  <div className="mt-3 space-y-4">
                    <AdaptationTrackingBadge
                      loading={adaptationState.loading}
                      hasBlock={adaptationState.hasBlock}
                      block={adaptationState.block}
                      readyForTransition={adaptationState.readyForTransition}
                      onReload={fetchAdaptationProgress}
                      onTransition={() => goToMethodologies()} // que vaya a metodologías para transicionar
                    />

                    {/* 🎯 Panel de progreso detallado de adaptación (solo fase inicial) */}
                    <AdaptationProgressPanel
                      userId={userId}
                      onReadyForTransition={() => setShowTransitionModal(true)}
                      onNeedRepeat={() => console.log('Necesita repetir')}
                    />
                  </div>
                )}

                {/* 🔄 Badge de estado del ciclo MindFeed (solo para HipertrofiaV2) */}
                {(plan?.metodologia === 'HipertrofiaV2_MindFeed' || plan?.metodologia === 'HipertrofiaV2') && (
                  <div className="mt-4 space-y-3">
                    <CycleStatusBadge
                      userId={userId}
                      methodologyPlanId={methodologyPlanId || plan?.methodologyPlanId}
                    />

                    {/* 🎯 FASE 2: Botón de Prioridad Muscular */}
                    <button
                      onClick={() => setShowPriorityModal(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors"
                    >
                      <Target className="h-5 w-5" />
                      {currentPriority ? 'Gestionar Prioridad' : 'Activar Prioridad Muscular'}
                    </button>
                  </div>
                )}

                {/* Header enriquecido con metodología, fuente, perfil y progreso */}
                <section className="mt-4">
                  <SummaryHeader
                    plan={plan?.currentPlan || plan}
                    session={session}
                    planSource={{ label: (plan?.planType === 'manual' || plan?.currentPlan?.generation_mode === 'manual') ? 'Manual' : 'IA' }}
                  />
                  <UserProfileDisplay />
                  <ProgressBar progressStats={headerProgressStats} />
                </section>
              </>
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
              <section className="transition-opacity duration-300 ease-in-out opacity-100">

                {/* Componente modular para iniciar/reanudar sesión */}
                <StartSessionCard
                  dayName={currentTodayName}
                  exerciseCount={todaySessionData?.ejercicios?.length || 0}
                  hasExistingSession={Boolean(todayStatus?.session?.id)}
                  isLoading={ui.isLoading}
                  isLoadingStatus={loadingTodayStatus && !todayStatus}
                  isStarting={isLoadingSession}
                  onClick={() => {
                    // 🎯 FIX: Verificar si existe sesión en BD antes de decidir
                    const hasExistingSession = Boolean(todayStatus?.session?.id);

                    console.log('🔍 DEBUG Button Click Decision:', {
                      hasExistingSession,
                      sessionId: todayStatus?.session?.id,
                      shouldResume,
                      hasUnfinishedWorkToday,
                      todayStatusCanResume: todayStatus?.session?.canResume,
                      sessionStatus: todayStatus?.session?.session_status,
                      hasActiveSession
                    });

                    // 🎯 LÓGICA CORREGIDA:
                    // - Si existe sesión en BD → Reanudar
                    // - Si NO existe sesión en BD → Iniciar nueva
                    if (hasExistingSession && (shouldResume || hasUnfinishedWorkToday)) {
                      handleResumeSession();
                    } else {
                      handleStartSession(0);
                    }
                  }}
                />

                {/* Lista de ejercicios - Componente modular */}
                {todaySessionData?.ejercicios && todaySessionData.ejercicios.length > 0 && !hasCompletedSession && (
                  <div className="mt-6">
                    <ExerciseList
                      exercises={todaySessionData.ejercicios}
                      todayStatus={todayStatus}
                      exerciseProgress={exerciseProgress}
                      session={session}
                      hasActiveSession={hasActiveSession}
                      dayName={currentTodayName}
                      estimatedDuration={estimatedDuration}
                      methodologyType={plan.methodologyType || 'Rutina'}
                    />
                  </div>
                )}
              </section>
            ) : null}


            {/* =============================================== */}
            {/* 🌟 SESIÓN DE FIN DE SEMANA (WEEKEND-EXTRA) */}
            {/* =============================================== */}

            {/* Mostrar resumen de sesión de fin de semana */}
            {!hasActivePlan && todayStatus?.session?.session_type === 'weekend-extra' && (
              <Card className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-semibold text-white">
                      🌟 Entrenamiento Extra de {new Date().toLocaleDateString('es-ES', { weekday: 'long' })}
                    </h3>
                    <p className="text-gray-400 mt-1">
                      {todayStatus.summary.completed} completados - {todayStatus.summary.skipped} saltados - {todayStatus.summary.total} ejercicios
                    </p>
                  </div>
                  <div className="text-sm text-gray-400">
                    {"Duración total: "}
                    {todayStatus.session?.total_duration_seconds
                      ? Math.round(
                          (todayStatus.session.total_duration_seconds + (todayStatus.session.warmup_time_seconds || 0)) / 60
                        )
                      : 0}
                    {" min"}
                  </div>
                </div>

                {/* Barra de progreso */}
                <div className="mb-6">
                  <div className="flex justify-between text-sm text-gray-400 mb-2">
                    <span>Progreso</span>
                    <span>{todayStatus.summary.progress || 0}%</span>
                  </div>
                  <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        todayStatus.summary.progress === 100
                          ? 'bg-green-500'
                          : todayStatus.summary.progress >= 75
                            ? 'bg-yellow-400'
                            : 'bg-blue-400'
                      }`}
                      style={{ width: `${todayStatus.summary.progress || 0}%` }}
                    />
                  </div>
                  {todayStatus.summary.progress === 100 && (
                    <p className="text-green-400 text-sm mt-2 text-center">
                      ✨ ¡Entrenamiento completado al 100%!
                    </p>
                  )}
                </div>

                {/* Lista de ejercicios con colores de estado */}
                <div className="space-y-2">
                  {todaySessionData?.ejercicios ? (
                    todaySessionData.ejercicios.map((ejercicio, index) => {
                      // Combinar datos del plan con estado desde backend
                      const backendExercise = todayStatus?.exercises?.[index];
                      const status = backendExercise?.status || 'pending';
                      const ex = {
                        ...ejercicio,
                        status: String(status).toLowerCase(),
                        exercise_name: ejercicio.nombre,
                        series_total: ejercicio.series,
                        sentiment: backendExercise?.sentiment,
                        comment: backendExercise?.comment
                      };
                      return (
                        <ExerciseListItem key={index} exercise={ex} index={index} />
                      );
                    })
                  ) : (
                    // Fallback si no hay todaySessionData
                    todayStatus?.exercises?.map((exercise, index) => (
                      <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-gray-800">
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                            exercise.status === 'completed' ? 'bg-green-500' :
                            exercise.status === 'skipped' ? 'bg-gray-500' :
                            exercise.status === 'cancelled' ? 'bg-red-500' :
                            'bg-gray-600'
                          }`}>
                            {exercise.status === 'completed' ? '✓' :
                             exercise.status === 'skipped' ? '⏭' :
                             exercise.status === 'cancelled' ? '✕' :
                             (index + 1)}
                          </div>
                          <span className="text-white">Ejercicio {index + 1}</span>
                        </div>
                        <span className={`text-sm ${
                          exercise.status === 'completed' ? 'text-green-400' :
                          exercise.status === 'skipped' ? 'text-gray-400' :
                          exercise.status === 'cancelled' ? 'text-red-400' :
                          'text-gray-500'
                        }`}>
                          {exercise.status === 'completed' ? 'Completado' :
                           exercise.status === 'skipped' ? 'Saltado' :
                           exercise.status === 'cancelled' ? 'Cancelado' :
                           'Pendiente'}
                        </span>
                      </div>
                    ))
                  )}
                </div>

                {/* Texto informativo sobre la duración de la rutina weekend */}
                <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <p className="text-blue-400 text-sm text-center">
                    ℹ️ Esta rutina es solo para hoy. Una vez finalizada o cuando acabe el día se eliminará,
                    aunque los datos generados serán guardados en el histórico.
                  </p>
                </div>

                {/* Botones de acción */}
                {console.log('🔍 DEBUG Botón Reanudar:', {
                  canRetry: todayStatus.summary.canRetry,
                  progress: todayStatus.summary.progress,
                  shouldShow: todayStatus.summary.canRetry && todayStatus.summary.progress < 100
                })}
                <div className="mt-6 flex gap-4 justify-center">
                  {/* Botón de reanudar si no está completa */}
                  {todayStatus.summary.canRetry && todayStatus.summary.progress < 100 && (
                    <Button
                      onClick={handleResumeSession}
                      className="bg-yellow-400 hover:bg-yellow-500 text-gray-900 px-6 py-3 rounded-lg"
                      disabled={ui.isLoading}
                    >
                      {ui.isLoading ? (
                        <>
                          <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                          Iniciando...
                        </>
                      ) : (
                        <>
                          <Play className="h-5 w-5 mr-2" />
                          Reanudar Entrenamiento
                        </>
                      )}
                    </Button>
                  )}

                  {/* Botón de cancelar (siempre visible en sesiones weekend) */}
                  <Button
                    onClick={() => {
                      console.log('🔴 CANCELAR CLICK - Session info:', {
                        sessionId: todayStatus.session.id,
                        sessionType: todayStatus.session.session_type,
                        todayStatusFull: todayStatus
                      });
                      updateLocalState({ showRejectionModal: true, pendingCancelSessionId: todayStatus.session.id });
                    }}
                    variant="outline"
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10 px-6 py-3 rounded-lg"
                    disabled={ui.isLoading}
                  >
                    Cancelar rutina
                  </Button>
                </div>
              </Card>
            )}

            {/* =============================================== */}
            {/* ✅ SESIÓN COMPLETADA EXITOSAMENTE */}
            {/* =============================================== */}

            {/* Resumen de sesión completada exitosamente */}
            {hasActivePlan && hasToday && hasCompletedSession && todayStatus && (
              <Card className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-semibold text-white">Resumen de hoy ({currentTodayName})</h3>
                    <p className="text-gray-400 mt-1">
                      {todayStatus.summary.completed} completados - {todayStatus.summary.skipped} saltados - {todayStatus.summary.total} ejercicios
                    </p>
                  </div>
                  <div className="text-sm text-gray-400">
                    {"Duracion total: "}
                    {todayStatus.session?.total_duration_seconds
                      ? Math.round(
                          (todayStatus.session.total_duration_seconds + (todayStatus.session.warmup_time_seconds || 0)) / 60
                        )
                      : 0}
                    {" min"}
                  </div>
                </div>

                <div className="space-y-2">
                  {todaySessionData.ejercicios.map((ejercicio, index) => {
                    // Combinar datos del plan con estado desde backend
                    const backendExercise = todayStatus?.exercises?.[index];
                    const status = backendExercise?.status || 'completed';
                    const ex = {
                      ...ejercicio,
                      status: String(status).toLowerCase(),
                      exercise_name: ejercicio.nombre,
                      series_total: ejercicio.series,
                      // 🎯 NUEVO: Agregar feedback desde backend
                      sentiment: backendExercise?.sentiment,
                      comment: backendExercise?.comment
                    };
                    return (
                      <ExerciseListItem key={index} exercise={ex} index={index} />
                    );
                  })}
                </div>
              </Card>
            )}



            {/* =============================================== */}
            {/* ❌ NO HAY PLAN ACTIVO (pero puede haber sesión de fin de semana) */}
            {/* =============================================== */}

            {noActivePlan && !todayStatus?.session && !(todayStatus?.session?.session_type === 'weekend-extra') && (
              <div className="text-center py-12">
                <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">
                  No hay rutina programada
                </h3>
                <p className="text-gray-400 mb-6">
                  No tienes ninguna rutina activa. Ve a metodologías para crear una nueva rutina.
                </p>
              </div>
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
