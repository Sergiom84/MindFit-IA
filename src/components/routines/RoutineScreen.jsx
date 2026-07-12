import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useTrace } from '@/contexts/TraceContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.jsx';
import { Calendar, Dumbbell, BarChart3, History } from 'lucide-react';
import { useWorkout } from '@/contexts/WorkoutContext';
import TrainingPlanConfirmationModal from './TrainingPlanConfirmationModal.jsx';
import TodayTrainingTab from './tabs/TodayTrainingTab.jsx';
import CalendarTab from './tabs/CalendarTab.jsx';
import ProgressTab from './tabs/ProgressTab.jsx';
import HistoricalTab from './tabs/HistoricalTab.jsx';
import { getWeekendStatus } from './api.js';

// ===============================================
// 🚀 RoutineScreen - Versión Integrada con WorkoutContext
// ===============================================

const RoutineScreen = () => {
  console.log('🔧 RoutineScreen.jsx cargado - Versión con WorkoutContext integrado');

  const location = useLocation();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [hasStandaloneWeekendSession, setHasStandaloneWeekendSession] = useState(false);

  useEffect(() => {
    const handleMouseMove = (event) => {
      setMousePosition({ x: event.clientX, y: event.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // ===============================================
  // 🎯 INTEGRACIÓN CON WorkoutContext
  // ===============================================

  const {
    // Estado unificado
    plan,
    session,
    ui,

    // Acciones de plan
    activatePlan,
    loadActivePlan,

    // Acciones de sesión
    startSession,
    updateExercise,
    completeSession,

    // Navegación
    goToMethodologies,

    // Utilidades
    isTraining,
    hasActivePlan,
    hasActiveSession
  } = useWorkout();

  const { track } = useTrace();

  // ===============================================
  // 🎛️ ESTADO LOCAL MÍNIMO
  // ===============================================

  // State recibido desde MethodologiesScreen.navigate('/routines', { state })
  const incomingState = location.state || {};

  // Estado local mínimo para datos específicos de esta pantalla
  const [localState, setLocalState] = useState({
    activeTab: incomingState?.activeTab || (incomingState?.fromSession ? 'today' : 'today'),
    progressUpdatedAt: Date.now(),
    showConfirmationModal: false
  });
  const [calendarPlan, setCalendarPlan] = useState(null);
  const [isLoadingCalendarSummary, setIsLoadingCalendarSummary] = useState(false);

  const updateLocalState = useCallback((updates) => {
    setLocalState(prev => ({ ...prev, ...updates }));
  }, []);

  // Ref para evitar loop infinito en tracking
  const prevConfirmationModalRef = useRef(localState.showConfirmationModal);

  // Trace: apertura/cierre del modal de confirmación de plan - CORREGIDO
  useEffect(() => {
    try {
      if (prevConfirmationModalRef.current !== localState.showConfirmationModal) {
        track(
          localState.showConfirmationModal ? 'MODAL_OPEN' : 'MODAL_CLOSE',
          { name: 'TrainingPlanConfirmationModal' },
          { component: 'RoutineScreen' }
        );
        prevConfirmationModalRef.current = localState.showConfirmationModal;
      }
    } catch (e) { void e; }
  }, [localState.showConfirmationModal, track]);

  // ===============================================
  // 📅 UTILIDADES DE FECHA
  // ===============================================

  // Día actual
  const todayName = useMemo(() => {
    const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    return dias[new Date().getDay()];
  }, []);

  // ===============================================
  // 📋 DATOS EFECTIVOS DEL PLAN
  // ===============================================

  // Plan efectivo a usar (prioridad: contexto > location.state)
  const effectivePlan = plan.currentPlan || incomingState?.routinePlan || incomingState?.plan;
  const effectivePlanSource = incomingState?.planSource ||
    (plan.planType === 'manual' ? { label: 'Manual' } : { label: 'IA' });
  const effectivePlanId = plan.methodologyPlanId || incomingState?.planId;
  const effectiveMethodologyPlanId = plan.methodologyPlanId || incomingState?.methodology_plan_id;

  // ===============================================
  // 🔄 INICIALIZACIÓN Y RECUPERACIÓN DE ESTADO
  // ===============================================

  // Ref para prevenir múltiples inicializaciones
  const initializationRef = useRef(false);

  useEffect(() => {
    // Prevenir múltiples ejecuciones
    if (initializationRef.current) return;

    const initializeRoutineScreen = async () => {
      console.log('🚀 Inicializando RoutineScreen con WorkoutContext...');
      initializationRef.current = true;

      try {
        // Si viene un plan desde location.state, activarlo en el contexto
        if (incomingState?.plan && incomingState?.planJustActivated) {
          console.log('✅ Plan recién activado desde MethodologiesScreen');
          // El plan ya está activado, no hacer nada más
          return;
        }

        // Si viene un planId específico, cargarlo
        if (incomingState?.methodology_plan_id && !hasActivePlan) {
          console.log('🔍 Cargando plan específico:', incomingState.methodology_plan_id);
          const result = await loadActivePlan(incomingState.methodology_plan_id);

          // Si el plan está cancelado o no existe, redirigir
          if (!result.success || result.plan?.status === 'cancelled') {
            console.log('⚠️ Plan cancelado o no disponible, redirigiendo...');
            goToMethodologies();
            return;
          }
          return;
        }

        // Fallback: si no hay plan en contexto, intentar recuperarlo del backend
        if (!hasActivePlan) {
          console.log('🔎 No hay plan en contexto; consultando /api/routines/active-plan...');
          let result = await loadActivePlan();
          // Un fallo transitorio (red/timeout) NO significa "sin plan": reintentar antes de decidir.
          if (!result?.success && !result?.noPlan) {
            console.log('↻ Fallo transitorio consultando el plan; reintentando en 2s...');
            await new Promise(r => setTimeout(r, 2000));
            result = await loadActivePlan();
          }
          if (result?.success) {
            console.log('✅ Plan activo recuperado desde backend');
            return;
          }
          if (result?.noPlan) {
            const weekendSession = await getWeekendStatus();
            if (weekendSession?.hasWeekendSession) {
              setHasStandaloneWeekendSession(true);
              console.log('✅ Sesión suelta de fin de semana recuperada; permanecemos en Rutinas');
              return;
            }
            console.log('⚠️ Backend confirma que no hay plan activo; redirigiendo a metodologías...');
            goToMethodologies();
            return;
          }
          // Sigue fallando por red: quedarse en Rutinas y mostrar el error (sin expulsar al usuario).
          console.log('⚠️ No se pudo consultar el plan (error transitorio); permanecemos en Rutinas');
          ui.setError(result?.error || 'No se pudo cargar el plan. Comprueba tu conexión y reintenta.');
          return;
        }

      } catch (error) {
        console.error('❌ Error inicializando RoutineScreen:', error);
        ui.setError(error.message || 'Error cargando el plan de entrenamiento');
        // Error inesperado: mantener al usuario en Rutinas con el mensaje de error visible.
      }
    };

    initializeRoutineScreen();
  }, [incomingState]);

  useEffect(() => {
    let isMounted = true;

    const loadCalendarSummary = async () => {
      if (!effectiveMethodologyPlanId) {
        if (isMounted) {
          setCalendarPlan(null);
        }
        return;
      }

      setIsLoadingCalendarSummary(true);
      try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(
          `${import.meta.env.VITE_API_URL || 'http://localhost:3010'}/api/routines/calendar-schedule/${effectiveMethodologyPlanId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (!response.ok) {
          if (isMounted) {
            setCalendarPlan(null);
          }
          return;
        }

        const data = await response.json();
        if (isMounted) {
          setCalendarPlan(data?.success ? data.plan : null);
        }
      } catch (error) {
        console.warn('[RoutineScreen] No se pudo cargar resumen del calendario:', error);
        if (isMounted) {
          setCalendarPlan(null);
        }
      } finally {
        if (isMounted) {
          setIsLoadingCalendarSummary(false);
        }
      }
    };

    loadCalendarSummary();

    return () => {
      isMounted = false;
    };
  }, [effectiveMethodologyPlanId]);

  const planSummary = useMemo(() => {
    const calendarWeeks = calendarPlan?.semanas || [];
    const planWeeks = effectivePlan?.semanas || [];

    let durationWeeks = null;
    if (calendarWeeks.length > 0) {
      durationWeeks = calendarWeeks.length;
    } else if (effectivePlan) {
      durationWeeks = effectivePlan.duracion_total_semanas || effectivePlan.duration || planWeeks.length || null;
    }

    let frequencyPerWeek = null;
    if (calendarWeeks.length > 0) {
      const totalSessions = calendarWeeks.reduce(
        (acc, week) => acc + (week.sesiones?.length || 0),
        0
      );
      if (calendarWeeks.length > 0) {
        const rawFrequency = totalSessions / calendarWeeks.length;
        if (Number.isFinite(rawFrequency)) {
          frequencyPerWeek = Math.round(rawFrequency);
        }
      }
    } else if (effectivePlan) {
      frequencyPerWeek = effectivePlan.frecuencia_por_semana
        || effectivePlan.frecuencia_semanal
        || effectivePlan.frequency
        || null;
    }

    return {
      durationWeeks,
      frequencyPerWeek
    };
  }, [calendarPlan, effectivePlan]);

  const formatFrequencyLabel = (value) => {
    if (value == null || Number.isNaN(value)) return null;
    return Number.isInteger(value) ? `${value}` : value.toFixed(1);
  };

  // ===============================================
  // 🎭 GESTIÓN DE MODALES
  // ===============================================

  // Mostrar modal de confirmación si es necesario
  useEffect(() => {
    if (incomingState?.showModal === true && effectivePlan && !localState.showConfirmationModal) {
      console.log('🎭 Mostrando modal de confirmación por location.state');
      updateLocalState({ showConfirmationModal: true });
    }
  }, [incomingState?.showModal, effectivePlan, localState.showConfirmationModal]);

  // ===============================================
  // 🎯 HANDLERS DE ACCIONES
  // ===============================================

  const handleConfirmPlan = async () => {
    try {
      try { track('BUTTON_CLICK', { id: 'confirm_plan' }, { component: 'RoutineScreen' }); } catch (e) { void e; }
      console.log('✅ Confirmando plan de entrenamiento...');

      if (!effectivePlan || !effectiveMethodologyPlanId) {
        throw new Error('No hay plan para confirmar');
      }

      // Usar la función activatePlan del WorkoutContext
      const result = await activatePlan(effectiveMethodologyPlanId);

      if (result.success) {
        console.log('✅ Plan confirmado exitosamente');
        updateLocalState({ showConfirmationModal: false });
        ui.showSuccess('Plan de entrenamiento confirmado');
      } else {
        throw new Error(result.error || 'Error confirmando el plan');
      }

    } catch (error) {
      console.error('❌ Error confirmando plan:', error);
      ui.setError(error.message || 'Error confirmando el plan de entrenamiento');
    }
  };

  const handleStartTraining = async (startContext = {}) => {
    const context = startContext || {};
    const preStartedResult = context.sessionResult;
    const skipSessionStart = context.skipSessionStart || !!preStartedResult;

    if (skipSessionStart) {
      if (preStartedResult?.success) {
        console.log('✅ Sesión ya iniciada desde', context.source || 'origen externo');
        updateLocalState({ activeTab: 'today' });
        return preStartedResult;
      }

      if (preStartedResult && !preStartedResult.success) {
        ui.setError(preStartedResult.error || 'Error iniciando el entrenamiento');
        return preStartedResult;
      }

      updateLocalState({ activeTab: 'today' });
      return { success: true };
    }

    try {
      try { track('BUTTON_CLICK', { id: 'start_training' }, { component: 'RoutineScreen' }); } catch (e) { void e; }
      console.log('🚀 Iniciando entrenamiento del día...');

      if (!effectivePlan || !effectiveMethodologyPlanId) {
        throw new Error('No hay plan activo para entrenar');
      }

      const result = await startSession({
        methodologyPlanId: effectiveMethodologyPlanId,
        dayName: todayName
      });

      if (result.success) {
        console.log('✅ Sesión de entrenamiento iniciada');
        try { track('SESSION_START', { methodologyPlanId: effectiveMethodologyPlanId, dayName: todayName }, { component: 'RoutineScreen' }); } catch (e) { void e; }
        updateLocalState({ activeTab: 'today' });
        return result;
      }

      throw new Error(result.error || 'Error iniciando el entrenamiento');

    } catch (error) {
      console.error('❌ Error iniciando entrenamiento:', error);
      ui.setError(error.message || 'Error iniciando el entrenamiento');
      return { success: false, error: error.message };
    }
  };

  const handleGenerateAnother = async () => {
    try { track('BUTTON_CLICK', { id: 'generate_another' }, { component: 'RoutineScreen' }); } catch (e) { void e; }
    console.log('🔄 Redirigiendo para generar otro plan...');
    updateLocalState({ showConfirmationModal: false });
    goToMethodologies();
  };

  const handleTabChange = useCallback((newTab) => {
    console.log(`🏷️ Cambiando a pestaña: ${newTab}`);
    try { track('TAB_CLICK', { id: newTab, group: 'routine-tabs' }, { component: 'RoutineScreen' }); } catch (e) { void e; }
    updateLocalState({ activeTab: newTab });
  }, []);

  const handleProgressUpdate = useCallback(() => {
    console.log('📊 Progreso actualizado, refrescando datos...');
    updateLocalState({ progressUpdatedAt: Date.now() });
  }, []);

  // ===============================================
  // 🚨 VALIDACIONES Y REDIRECTS
  // ===============================================

  // Si no hay plan efectivo después de intentar cargar, redirigir
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!ui.isLoading && !effectivePlan && !incomingState?.plan && !hasStandaloneWeekendSession) {
        console.log('⚠️ No hay plan disponible, redirigiendo a metodologías...');
        goToMethodologies();
      }
    }, 3000); // Dar tiempo para cargar

    return () => clearTimeout(timer);
  }, [ui.isLoading, effectivePlan, incomingState?.plan, hasStandaloneWeekendSession, goToMethodologies]);

  // ===============================================
  // 🎨 RENDER CONDICIONAL PARA LOADING
  // ===============================================

  // 🎯 Solo mostrar la pantalla de carga a pantalla completa en la carga INICIAL
  // (aún no hay plan). Durante acciones puntuales como iniciar la sesión, el plan
  // ya existe: mostrar el loader global aquí DESMONTABA TodayTrainingTab y perdía
  // el estado del modal de calentamiento (el reproductor no llegaba a abrirse).
  if (ui.isLoading && !effectivePlan) {
    return (
      <div className="min-h-screen bg-[#050506] text-white relative overflow-hidden flex items-center justify-center font-body">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[url('/assets/tech-lux/bg-tech-lux-mobile.jpg')] sm:bg-[url('/assets/tech-lux/bg-tech-lux-desktop.jpg')] bg-cover bg-center opacity-60 sm:opacity-45" />
          <div className="absolute inset-0 bg-[url('/assets/tech-lux/texture-tech-lux-tile.jpg')] bg-repeat opacity-12 mix-blend-soft-light" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/80 sm:from-black/40 sm:via-black/60 sm:to-black" />
          <div className="absolute -top-20 right-0 h-56 w-56 bg-yellow-400/10 blur-[140px]" />
          <div className="absolute top-1/3 -left-16 h-64 w-64 bg-yellow-400/10 blur-[160px]" />
        </div>
        <div className="relative z-10 text-center space-y-4">
          <div className="relative">
            <div className="w-12 h-12 border-4 border-yellow-400/30 border-t-yellow-300 rounded-full animate-spin mx-auto" />
            <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-r-yellow-400/50 rounded-full animate-pulse mx-auto" />
          </div>
          <div className="space-y-2">
            <p className="text-white font-urbanist text-lg">Cargando plan de entrenamiento...</p>
            <p className="text-gray-300/80 text-sm">Preparando tu rutina personalizada</p>
          </div>
        </div>
      </div>
    );
  }

  // ===============================================
  // 🎨 RENDER PRINCIPAL
  // ===============================================

  return (
    <div className="min-h-screen bg-[#050506] text-white relative overflow-hidden font-body">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[url('/assets/tech-lux/bg-tech-lux-mobile.jpg')] sm:bg-[url('/assets/tech-lux/bg-tech-lux-desktop.jpg')] bg-cover bg-center opacity-80 sm:opacity-70" />
        <div className="absolute inset-0 bg-[url('/assets/tech-lux/texture-tech-lux-tile.jpg')] bg-repeat opacity-20 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/80 sm:from-black/40 sm:via-black/60 sm:to-black" />
        <div className="absolute -top-20 right-0 h-56 w-56 bg-yellow-400/10 blur-[140px]" />
        <div className="absolute top-1/3 -left-16 h-64 w-64 bg-yellow-400/10 blur-[160px]" />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(250, 204, 21, 0.18), transparent 60%)`
          }}
        />
      </div>
      <div className="relative z-10 container mx-auto px-4 py-8">
        <div>
          {/* Header con información del plan */}
          {effectivePlan && (
            <header className="mb-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-[0.4em] text-yellow-200/80">Rutinas</p>
                  <h1 className="text-3xl md:text-4xl font-semibold font-urbanist text-white">
                    {effectivePlan.selected_style || effectivePlan.nombre || 'Plan de Entrenamiento'}
                  </h1>
                  <p className="text-gray-200/80">
                    Fuente: {effectivePlanSource?.label || 'IA'} {effectivePlanSource?.detail && `${effectivePlanSource.detail}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-gray-200/80">
                  <div className="px-4 py-2 rounded-xl border border-white/10 bg-white/5">
                    <span className="text-gray-300/70">Duración</span>{' '}
                    <span className="text-white font-semibold">
                      {(planSummary.durationWeeks || effectivePlan?.duracion_total_semanas || effectivePlan?.duration || 4)} semanas
                    </span>
                  </div>
                  <div className="px-4 py-2 rounded-xl border border-white/10 bg-white/5">
                    <span className="text-gray-300/70">Frecuencia</span>{' '}
                    <span className="text-white font-semibold">
                      {(formatFrequencyLabel(planSummary.frequencyPerWeek) || effectivePlan?.frecuencia_por_semana || effectivePlan?.frecuencia_semanal || effectivePlan?.frequency || 3)}x/semana
                    </span>
                  </div>
                  {isLoadingCalendarSummary && (
                    <div className="flex items-center text-xs text-gray-300/60">
                      Actualizando calendario...
                    </div>
                  )}
                </div>
              </div>
            </header>
          )}

      {/* Pestañas principales */}
          <Tabs value={localState.activeTab} onValueChange={handleTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-4 bg-black/60 border border-white/10 p-1 rounded-2xl backdrop-blur-md">
          <TabsTrigger
            value="today"
            className="text-gray-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-yellow-300 data-[state=active]:via-yellow-400 data-[state=active]:to-amber-500 data-[state=active]:text-black data-[state=active]:shadow-[0_12px_30px_-18px_rgba(250,204,21,0.75)] rounded-xl"
          >
            <Dumbbell className="w-4 h-4 mr-2" />
            Hoy
          </TabsTrigger>
          <TabsTrigger
            value="calendar"
            className="text-gray-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-yellow-300 data-[state=active]:via-yellow-400 data-[state=active]:to-amber-500 data-[state=active]:text-black data-[state=active]:shadow-[0_12px_30px_-18px_rgba(250,204,21,0.75)] rounded-xl"
          >
            <Calendar className="w-4 h-4 mr-2" />
            Calendario
          </TabsTrigger>
          <TabsTrigger
            value="progress"
            className="text-gray-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-yellow-300 data-[state=active]:via-yellow-400 data-[state=active]:to-amber-500 data-[state=active]:text-black data-[state=active]:shadow-[0_12px_30px_-18px_rgba(250,204,21,0.75)] rounded-xl"
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            Progreso
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="text-gray-200 data-[state=active]:bg-gradient-to-r data-[state=active]:from-yellow-300 data-[state=active]:via-yellow-400 data-[state=active]:to-amber-500 data-[state=active]:text-black data-[state=active]:shadow-[0_12px_30px_-18px_rgba(250,204,21,0.75)] rounded-xl"
          >
            <History className="w-4 h-4 mr-2" />
            Historial
          </TabsTrigger>
            </TabsList>

        {/* Contenido de las pestañas */}
        <TabsContent value="today" className="mt-6">
          <TodayTrainingTab
            routinePlan={effectivePlan}
            routinePlanId={effectivePlanId}
            methodologyPlanId={effectiveMethodologyPlanId}
            planStartDate={plan.planStartDate || incomingState?.planStartDate}
            todayName={todayName}
            onProgressUpdate={handleProgressUpdate}
            onStartTraining={handleStartTraining}
          />
        </TabsContent>

        <TabsContent value="calendar" className="mt-6">
          <CalendarTab
            plan={effectivePlan}
            planStartDate={plan.planStartDate || incomingState?.planStartDate}
            methodologyPlanId={effectiveMethodologyPlanId}
            refreshTrigger={localState.progressUpdatedAt}
          />
        </TabsContent>

        <TabsContent value="progress" className="mt-6">
          <ProgressTab
            routinePlanId={effectivePlanId}
            methodologyPlanId={effectiveMethodologyPlanId}
            routinePlan={effectivePlan}
            progressUpdatedAt={localState.progressUpdatedAt}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <HistoricalTab
            routinePlanId={effectivePlanId}
            methodologyPlanId={effectiveMethodologyPlanId}
          />
        </TabsContent>
          </Tabs>

      {/* Modal de confirmación del plan */}
          <TrainingPlanConfirmationModal
            isOpen={localState.showConfirmationModal}
            onClose={() => updateLocalState({ showConfirmationModal: false })}
            onConfirm={handleConfirmPlan}
            onStartTraining={handleStartTraining}
            onGenerateAnother={handleGenerateAnother}
            plan={effectivePlan}
            methodology={effectivePlan?.selected_style || effectivePlan?.nombre}
            planSource={effectivePlanSource}
            successMessage={incomingState?.successMessage}
            isLoading={ui.isLoading}
            error={ui.error}
          />
        </div>
      </div>
    </div>
  );
};

export default RoutineScreen;
