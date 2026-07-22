import { useCallback } from 'react';
import apiClient from '@/lib/apiClient';
import { computeDayId } from '@/utils/training/dateHelpers';
import { isCrossfitV2Presentation } from '../../../crossfit/runtimeState.js';
import { EFFORT_ENDPOINTS, resolveEffortMethodKey } from '../effortConfig.js';

export function useRoutineSessionActions({
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
}) {
  const handleStartSession = useCallback(async (exerciseIndex = 0) => {
    console.log('🟢 handleStartSession called', {
      exerciseIndex,
      isStarting,
      isLoadingSession,
      hasTodaySessionData: !!todaySessionData,
      exercisesCount: todaySessionData?.ejercicios?.length,
      todayStatusSessionId: todayStatus?.session?.id
    });

    // 🚫 Prevenir doble ejecución
    if (isStarting || isLoadingSession) {
      console.log('⚠️ handleStartSession ya en progreso, evitando doble ejecución');
      return;
    }

    track('BUTTON_CLICK', { id: 'start_session', exerciseIndex }, { component: 'TodayTrainingTab' });

    // 🎯 NUEVA LÓGICA: Verificar si realmente debe reanudar usando backend
    if (!todaySessionData) {
      console.log('⚠️ No hay datos de sesión de hoy');
      return;
    }


    // Validaciones iniciales
    if (!todaySessionData?.ejercicios || todaySessionData.ejercicios.length === 0) {
      setError('La sesión de hoy no tiene ejercicios definidos');
      return;
    }

    if (!methodologyPlanId) {
      setError('No se puede iniciar sesión: falta información del plan');
      return;
    }

    // ✅ Pre-check robusto: si existe sesión hoy y NO debemos reanudar, abrir Warmup y evitar /start
    {
      const existingSid = todayStatus?.session?.id;
      const sessionKey = existingSid != null ? String(existingSid) : null;
      const sessionAlreadyStarted = Boolean(todayStatus?.session?.session_started_at);
      const warmupAlreadyShown = sessionKey ? warmupShownSessionsRef.current.has(sessionKey) : false;

      if (existingSid && (!warmupAlreadyShown && !sessionAlreadyStarted)) {
        if (sessionKey) {
          warmupShownSessionsRef.current.add(sessionKey);
        }
        updateLocalState({
          pendingSessionData: {
            session: { ...todaySessionData, sessionId: existingSid },
            sessionId: existingSid
          },
          showWarmupModal: true,
          showSessionModal: false
        });
        return;
      }

      if (existingSid) {
        if (sessionKey) {
          warmupShownSessionsRef.current.add(sessionKey);
        }
        // 🎯 CORRECCIÓN: Pasar todaySessionData para que effectiveSession tenga datos
        updateLocalState({
          pendingSessionData: {
            session: todaySessionData ? { ...todaySessionData, sessionId: existingSid } : null,
            sessionId: existingSid
          },
          showWarmupModal: false,
          showSessionModal: true
        });
        return;
      }
    }

    setIsLoadingSession(true);
    setIsStarting(true); // 🔒 Bloquear nuevas ejecuciones
    setSessionError(null);

    try {
      console.log('🏃 Iniciando sesión de hoy:', todaySessionData);

      const startISO = (plan.planStartDate || planStartDate || new Date().toISOString());
      const dayId = computeDayId(startISO, 'Europe/Madrid');
      console.log('🚀 Llamando a startSession con:', {
        methodologyPlanId,
        dayId,
        startISO,
        todaySessionData: todaySessionData?.dia
      });
      const result = await startSession({
        methodologyPlanId,  // 🎯 FIX: Nombre correcto del parámetro
        dayId,
        dayInfo: todaySessionData,
        exerciseIndex
      });

      if (result.success) {
        setSessionStartTime(new Date());
        setCurrentExerciseIndex(exerciseIndex);
        setExerciseProgress({});

        // Configurar datos de sesión para el modal
        const enrichedSession = {
          ...todaySessionData,
          sessionId: result.sessionId,
          currentExerciseIndex: Math.max(0, Math.min(exerciseIndex, (todaySessionData?.ejercicios?.length || 1) - 1)),
          exerciseProgress: sessionExerciseProgress
        };

        // Guardar datos de sesión para después del calentamiento
        const createdSessionId = result.sessionId || result.session_id || session.sessionId;
        const createdSessionKey = createdSessionId != null ? String(createdSessionId) : null;
        if (createdSessionKey) {
          warmupShownSessionsRef.current.add(createdSessionKey);
        }

        updateLocalState({
          pendingSessionData: {
            session: enrichedSession,
            sessionId: createdSessionId
          },
          showWarmupModal: true,
          showSessionModal: false
        });

        track('SESSION_START', {
          sessionId: result.sessionId,
          totalExercises: todaySessionData?.ejercicios?.length || 0,
          startingAt: exerciseIndex
        });

        // Opcional: Callback para notificar al componente padre
        if (onStartTraining) {
          onStartTraining({
            source: 'today-training-tab',
            sessionResult: result,
            dayId,
            exerciseIndex
          });
        }
      } else {
        // 🎯 Sesión ya activa para hoy: reanudarla (no es un error fatal).
        const existingSid = result.session_id || todayStatus?.session?.id;
        const msg = String(result.error || '').toLowerCase();
        if (existingSid && (result.status === 400 || msg.includes('ya existe una sesi'))) {
          console.log('[TodayTrainingTab] Sesión ya activa detectada, reanudando');
          const sessionKey = String(existingSid);
          warmupShownSessionsRef.current.add(sessionKey);
          updateLocalState({
            pendingSessionData: {
              session: { ...todaySessionData, sessionId: existingSid },
              sessionId: existingSid
            },
            showWarmupModal: true,
            showSessionModal: false
          });
          return;
        }
        throw new Error(result.error || 'Error iniciando la sesión');
      }

    } catch (error) {
      console.error('Error iniciando sesión de hoy:', error);

      // 🎯 MANEJO ESPECIAL: Sesión ya existente
      {
        const existingSid = todayStatus?.session?.id;
        const sid = error?.data?.session_id || existingSid;
        const msg = String(error?.message || '').toLowerCase();
        if ((error?.status === 400 && sid) || (msg.includes('ya existe una sesi') && sid)) {
          console.log('[TodayTrainingTab] Existing session detected, showing warmup modal');
          const sessionKey = sid != null ? String(sid) : null;
          if (sessionKey) {
            warmupShownSessionsRef.current.add(sessionKey);
          }
          updateLocalState({
            pendingSessionData: {
              session: { ...todaySessionData, sessionId: sid },
              sessionId: sid
            },
            showWarmupModal: true,
            showSessionModal: false
          });
          return;
        }
      }

      setSessionError(error.message);
      setError(`Error al iniciar la sesión: ${error.message}`);
    } finally {
      setIsLoadingSession(false);
      setIsStarting(false); // 🔓 Desbloquear
    }
  }, [todaySessionData, startSession, methodologyPlanId, session.sessionId, todayStatus, track, onStartTraining, setError, isStarting, isLoadingSession, plan.planStartDate, planStartDate, sessionExerciseProgress]);

  const handleResumeSession = useCallback(async () => {
    track('BUTTON_CLICK', { id: 'resume_session' }, { component: 'TodayTrainingTab' });

    console.log('🔄 Refrescando estado desde BD antes de reanudar...');
    const latestStatus = await fetchTodayStatus();
    const statusSource = latestStatus || todayStatus;

    const existingSessionId = statusSource?.session?.id || session.sessionId || localState.pendingSessionData?.sessionId;
    const sessionKey = existingSessionId != null ? String(existingSessionId) : null;
    const sessionStarted = Boolean(statusSource?.session?.session_started_at);
    const sessionCompleted = statusSource?.session?.session_status === 'completed';
    const warmupAlreadyShown = sessionKey ? warmupShownSessionsRef.current.has(sessionKey) : false;

    // Verificar si puede reintentar ejercicios (skipped/cancelled)
    const canRetry = statusSource?.summary?.canRetry || false;

    console.log('[TodayTrainingTab] handleResumeSession', {
      existingSessionId,
      sessionStarted,
      sessionCompleted,
      canRetry,
      warmupAlreadyShown,
      hasActiveSession,
      todayStatusSession: statusSource?.session,
      contextSessionId: session.sessionId,
      hasTodaySessionData: !!todaySessionData
    });

    // 🎯 CORRECCIÓN: Si la sesión está completada Y NO puede reintentar, NO abrir modal
    // pero SÍ avisar al usuario (antes el botón quedaba mudo) y refrescar el estado
    // para que la UI retire el CTA.
    if (sessionCompleted && !canRetry) {
      console.log('[TodayTrainingTab] Session completed with no exercises to retry');
      setSessionError('La sesión de hoy ya figura como completada o cerrada. No quedan ejercicios pendientes.');
      return;
    }

    if (!existingSessionId) {
      console.log('[TodayTrainingTab] No existing session found, starting new with warmup');
      handleStartSession(currentExerciseIndex || 0);
      return;
    }

    // 🆕 CORRECCIÓN: Si no hay todaySessionData, cargar desde el plan
    if (!todaySessionData) {
      console.log('⚠️ [TodayTrainingTab] todaySessionData no disponible, cargando desde plan...');
      // Forzar recarga de datos del plan
      const currentWeekIdx = plan.currentWeek || 1;
      const dayId = plan.currentDayId;

      if (dayId && plan.currentPlan?.plan_data) {
        try {
          const planData = typeof plan.currentPlan.plan_data === 'string'
            ? JSON.parse(plan.currentPlan.plan_data)
            : plan.currentPlan.plan_data;

          const sessionData = planData?.semanas?.[currentWeekIdx - 1]?.sesiones?.find(
            s => s.day_id === dayId
          );

          if (sessionData) {
            console.log('✅ [TodayTrainingTab] Datos del plan cargados:', sessionData);
            setTodaySessionData(sessionData);
          } else {
            console.error('❌ [TodayTrainingTab] No se encontró sesión en el plan');
            return;
          }
        } catch (error) {
          console.error('❌ [TodayTrainingTab] Error cargando datos del plan:', error);
          return;
        }
      } else {
        console.error('❌ [TodayTrainingTab] Faltan datos del plan');
        return;
      }
    }

    // Verificar si ya hay progreso real (ejercicios completados/saltados/cancelados)
    const hasRealProgress = statusSource?.exercises?.some(ex => {
      const status = String(ex?.status || '').toLowerCase();
      return status !== 'pending';
    }) || false;

    // Solo mostrar calentamiento si: NO se ha mostrado, NO hay progreso real, y NO ha comenzado la sesión
    if (!warmupAlreadyShown && !sessionStarted && !hasRealProgress) {
      console.log('[TodayTrainingTab] Existing session without warmup, showing warmup modal');
      if (sessionKey) {
        warmupShownSessionsRef.current.add(sessionKey);
      }
      updateLocalState({
        pendingSessionData: {
          session: todaySessionData ? { ...todaySessionData, sessionId: existingSessionId } : null,
          sessionId: existingSessionId
        },
        showWarmupModal: true,
        showSessionModal: false
      });
      return;
    }

    console.log('[TodayTrainingTab] Warmup already handled, opening session modal');

    if (sessionKey) {
      warmupShownSessionsRef.current.add(sessionKey);
    }

    // 🎯 CORRECCIÓN: Pasar filteredSessionData para que solo muestre ejercicios saltados/cancelados
    // Primero activar el modal para que filteredSessionData se compute
    updateLocalState({
      pendingSessionData: {
        session: null, // Será llenado por effectiveSession usando filteredSessionData
        sessionId: existingSessionId
      },
      showWarmupModal: false,
      showSessionModal: true,
      wantRoutineModal: true // Activar para que filteredSessionData se compute
    });

    console.log('[TodayTrainingTab] Resuming session with pending exercises', {
      hasTodaySessionData: !!todaySessionData,
      exercisesCount: todaySessionData?.ejercicios?.length
    });
  }, [todaySessionData, hasActiveSession, handleStartSession, currentExerciseIndex, session.sessionId, localState.pendingSessionData?.sessionId, todayStatus, track, fetchTodayStatus]);

  const handleCompleteSession = useCallback(async (options = {}) => {
    // options.scale solo lo aporta el WodSessionModal de CrossFit; el resto pasa un evento → 'rx'.
    const closingScale = (options && typeof options.scale === 'string') ? options.scale : 'rx';
    const sid = localState.pendingSessionData?.sessionId || session.sessionId;
    if (!sid) return;

    try {
      let ok = false;

      if (hasActiveSession) {
        const result = await completeSession();
        ok = !!result?.success;
      } else {
        // Fallback cuando el contexto no tiene sessionId activo
        await apiClient.post(`/training-session/complete/methodology/${sid}`, {
          completedAt: new Date().toISOString()
        });
        ok = true;
      }

      if (ok) {
        setSessionStartTime(null);
        setCurrentExerciseIndex(0);
        setExerciseProgress({});
        if (sid != null) {
          warmupShownSessionsRef.current.delete(String(sid));
        }

        // Limpiar estado del modal (TODOS los modales)
        updateLocalState({
          showSessionModal: false,
          showWarmupModal: false,
          pendingSessionData: null
        });

        track('SESSION_COMPLETE', {
          sessionId: sid,
          duration: sessionStartTime ? Date.now() - sessionStartTime.getTime() : 0,
          exercisesCompleted: Object.keys(exerciseProgress).length
        });

        // 🎯 CRÍTICO: Refrescar estado INMEDIATAMENTE después de completar
        console.log('🔄 Refrescando estado después de SESSION_COMPLETE');
        await fetchTodayStatus();

        if (typeof onProgressUpdate === 'function') {
          onProgressUpdate();
        }

        showSuccess('¡Entrenamiento completado exitosamente!');

        // 🎯 DISPATCHER COMÚN DE CIERRE: abrir el modal de esfuerzo de la metodología activa.
        // Lo objetivo (RIR/RPE/fallo/técnica) manda; el feeling solo matiza en el backend.
        const methodKey = resolveEffortMethodKey(
          plan?.metodologia || plan?.methodology_type || plan?.methodologyType ||
          routinePlan?.metodologia || routinePlan?.methodology_type || ''
        );
        if (methodKey) {
          setEffortModal({
            method: methodKey,
            show: true,
            decision: null,
            saving: false,
            error: null,
            scale: closingScale,
            sessionId: sid,
            wodSummary: options?.wodSummary || null,
            crossfitV2: methodKey === 'crossfit' && (
              options?.wodSummary?.runtimeVersion === 'crossfit-runtime-event/v2'
              || isCrossfitV2Presentation(todaySessionData)
            )
          });
        }

        // 🎯 ADAPTACIÓN: Evaluar semana si hay bloque activo
        console.log('📊 Iniciando evaluación de adaptación...');
        setTimeout(() => {
          evaluateAdaptationWeek();
        }, 1000); // Aguardar 1s para que los datos estén registrados
      } else {
        throw new Error('Error finalizando la sesión');
      }

    } catch (error) {
      console.error('Error completando sesión:', error);
      setError(`Error finalizando sesión: ${error.message}`);
    }
  }, [hasActiveSession, completeSession, session.sessionId, sessionStartTime, exerciseProgress, track, onProgressUpdate, showSuccess, setError, localState.pendingSessionData?.sessionId, fetchTodayStatus, evaluateAdaptationWeek, todaySessionData]);

  // 🎯 Autorregulación común: registra el resultado en el endpoint de la metodología activa.
  // El payload llega tal cual del modal (avgRir/rpe/targetMet/goodTechnique/reachedFailure/
  // completed/scale + feeling); aquí solo se añade el methodologyPlanId.
  const handleEffortSubmit = useCallback(async (payload = {}) => {
    const method = effortModal.method;
    const sessionId = effortModal.sessionId;
    setEffortModal(prev => ({ ...prev, saving: true }));
    try {
      let data;
      if (sessionId) {
        // 📈 Flujo de PLAN: endpoint por sesión. Lo objetivo (RIR de las series
        // guardadas) manda en el backend; el payload del modal solo matiza
        // (feeling) o hace de fallback si no hubo series logueadas.
        const resp = await apiClient.post(`/routines/sessions/${sessionId}/effort`, payload);
        data = resp?.data || resp;
      } else {
        // Fallback legado (sin sessionId): endpoint por metodología con valores manuales.
        const endpoint = method ? EFFORT_ENDPOINTS[method] : null;
        if (!endpoint) return;
        const resp = await apiClient.post(endpoint, {
          methodologyPlanId: methodologyPlanId || null,
          ...payload
        });
        data = resp?.data || resp;
      }
      setEffortModal(prev => ({ ...prev, decision: data?.decision || 'hold', saving: false, error: null }));
    } catch (e) {
      console.warn(`⚠️ Autorregulación ${method} falló:`, e?.message);
      setEffortModal(prev => method === 'crossfit'
        ? { ...prev, decision: null, saving: false, error: e?.message || 'No se pudo guardar el resultado. Reintenta.' }
        : { ...prev, decision: 'hold', saving: false });
    }
  }, [effortModal.method, effortModal.sessionId, methodologyPlanId]);

  const handleEffortClose = useCallback(() => {
    setEffortModal({ method: null, show: false, decision: null, saving: false, error: null, scale: 'rx', sessionId: null, wodSummary: null, crossfitV2: false });
  }, []);

  const handleExerciseUpdate = useCallback(async (exerciseIndex, progressData) => {
    // 🎯 CORRECCIÓN: exerciseIndex YA ES el originalIndex (viene desde useExerciseProgress)
    // NO aplicar mapping nuevamente para evitar doble conversión
    const originalIndex = exerciseIndex;

    console.log('🔍 DEBUG handleExerciseUpdate:', {
      receivedIndex: exerciseIndex,
      originalIndexForAPI: originalIndex,
      progressData
    });

    // Actualizar estado local usando ÍNDICE ORIGINAL (para mantener consistencia con backend)
    setExerciseProgress(prev => ({
      ...prev,
      [originalIndex]: progressData
    }));

    const sid = localState.pendingSessionData?.sessionId || session.sessionId;
    const payload = {
      status: progressData.status || 'completed',
      series_completed: Math.max(0, parseInt(progressData.series_completed ?? progressData.seriesCompleted) || 0),
      time_spent_seconds: Math.max(0, parseInt(progressData.time_spent_seconds ?? progressData.timeSpent) || 0)
    };

    try {
      let ok = false;

      if (session.sessionId) {
        // Usar índice original para la API del contexto
        const result = await updateExercise(originalIndex, payload);
        ok = !!result?.success;
      } else if (sid) {
        // Usar índice original para la API directa
        await apiClient.put(`/routines/sessions/${sid}/exercise/${originalIndex}`, payload);
        ok = true;
      }

      if (ok) {
        console.log('✅ Ejercicio actualizado correctamente:', {
          originalIndex,
          status: progressData.status,
          payload
        });

        // Notificar al padre para refrescar calendario/progreso
        if (typeof onProgressUpdate === 'function') {
          onProgressUpdate();
        }

        // 🎯 CIERRE DE AUTORREGULACIÓN: tras completar un ejercicio, refrescar la
        // verdad del backend y, si la sesión queda completada, abrir el modal de
        // esfuerzo de la metodología. RoutineSessionModal filtra los completados y
        // se cierra tras cada ejercicio, por lo que nunca alcanza su
        // EndModal→onEndSession→handleCompleteSession. CrossFit queda fuera: su
        // WodSessionModal ya dispara el cierre vía onCompleteSession.
        const isCompletion = String(progressData.status || 'completed').toLowerCase() === 'completed';
        if (isCompletion && activeMethodKey && activeMethodKey !== 'crossfit') {
          const fresh = await fetchTodayStatus();
          const fsid = fresh?.session?.id;
          const total = Number(fresh?.summary?.total) || 0;
          const done = Number(fresh?.summary?.completed) || 0;
          const finished = fresh?.session?.session_status === 'completed' || (total > 0 && done >= total);
          if (finished && fsid && !effortClosureHandledRef.current.has(fsid)) {
            effortClosureHandledRef.current.add(fsid);
            updateLocalState({ showSessionModal: false, pendingSessionData: null });
            setEffortModal({
              method: activeMethodKey,
              show: true,
              decision: null,
              saving: false,
              error: null,
              scale: 'rx',
              sessionId: fsid,
              wodSummary: null,
              crossfitV2: false
            });
          }
        }
      }
      return { success: ok };
    } catch (error) {
      console.error('❌ Error actualizando ejercicio:', error);
      setError(`Error actualizando ejercicio: ${error.message}`);
      return { success: false, error: error.message };
    }
  }, [updateExercise, setError, onProgressUpdate, session.sessionId, localState.pendingSessionData?.sessionId, activeMethodKey, fetchTodayStatus]);

  // Handlers de calentamiento
  return {
    handleStartSession,
    handleResumeSession,
    handleCompleteSession,
    handleEffortSubmit,
    handleEffortClose,
    handleExerciseUpdate
  };
}
