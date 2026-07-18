import { useCallback } from 'react';
import apiClient from '@/lib/apiClient';
import { getTodayName } from '@/utils/training/dateHelpers';
import tokenManager from '../../../../../utils/tokenManager';
import { getApiBaseUrl } from '../../../../../config/api';

const API_URL = getApiBaseUrl();

export function useRoutineAuxiliaryActions({
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
}) {
  const handleWarmupComplete = async () => {
    track('BUTTON_CLICK', { id: 'warmup_complete' }, { component: 'TodayTrainingTab' });

    const pendingId = localState.pendingSessionData?.sessionId || session.sessionId;
    if (!pendingId) return;

    // Marcar inicio real de la sesión en backend (idempotente)
    try {
      await apiClient.post(`/routines/sessions/${pendingId}/mark-started`);
    } catch (error) {
      console.warn('mark-started fallo (no bloqueante):', error?.message || error);
    }

    // Preparar datos mínimos de sesión si faltaran por cualquier carrera de estado
    updateLocalState(prev => ({
      ...prev,
      pendingSessionData: {
        session: prev.pendingSessionData?.session || (todaySessionData ? {
          ...todaySessionData,
          sessionId: pendingId,
          currentExerciseIndex: 0,
          exerciseProgress: sessionExerciseProgress
        } : null),
        sessionId: prev.pendingSessionData?.sessionId || pendingId
      },
      showWarmupModal: false,
      showSessionModal: true
    }));

    try { showModal?.('routineSession'); hideModal?.('warmup'); } catch (error) {
      console.warn('Modal method not available:', error);
    }

    // Reafirmar apertura tras el ciclo de render (con logs)
    setTimeout(() => {
      updateLocalState(prev => ({ ...prev, showSessionModal: true }));
      try { showModal?.('routineSession'); hideModal?.('warmup'); } catch (error) {
      console.warn('Modal method not available:', error);
    }
      console.log('🔍 DEBUG después de warmup_complete:', {
        'localState.showSessionModal': true,
        'ui.showRoutineSession': ui.showRoutineSession,
        'wantRoutineModal': (localState.showSessionModal || ui.showRoutineSession || ui.showSession),
        'effectiveSessionId (post)': pendingId,
        'pendingSessionData (post)': { hasSession: !!(todaySessionData), pendingId }
      });
    }, 0);
  };

  // Nueva función para generar entrenamiento de fin de semana
  const handleGenerateWeekendWorkout = async () => {
    if (isLoadingWeekendWorkout) return;

    track('BUTTON_CLICK', { id: 'generate_weekend_workout' }, { component: 'TodayTrainingTab' });

    setIsLoadingWeekendWorkout(true);
    setSessionError(null);

    try {
      // La fuente de verdad del perfil es AuthContext; no leer localStorage directamente.
      const nivel = user?.nivel_entrenamiento || plan.nivel || 'Principiante';

      console.log('🏋️ Generando entrenamiento de fin de semana. Nivel:', nivel);

      const response = await apiClient.post('/hipertrofiav2/generate-single-day', {
        nivel: nivel,
        objetivos: user?.objetivos || [],
        isWeekendExtra: true
      });

      if (response.data.success) {
        const { workout, sessionId } = response.data;

        // Transformar el workout al formato esperado por todaySessionData
        const weekendSessionData = {
          dia: getTodayName(),
          tipo: 'Full Body Extra',
          enfoque_principal: 'Full Body',
          enfoque_secundario: 'Recuperación activa',
          ejercicios: workout.exercises.map((ex, idx) => ({
            ...ex,
            orden: idx + 1,
            repeticiones: ex.reps,
            series: ex.series
          })),
          isWeekendExtra: true,
          sessionId: sessionId
        };

        // Actualizar el estado con la sesión de fin de semana
        setTodaySessionData(weekendSessionData);

        // Iniciar la sesión directamente (sin plan asociado)
        updateLocalState({
          pendingSessionData: {
            session: weekendSessionData,
            sessionId: sessionId
          },
          showWarmupModal: true,
          showSessionModal: false
        });

        track('WEEKEND_WORKOUT_GENERATED', {
          nivel,
          sessionId,
          exercises: workout.exercises_count
        });
      }
    } catch (error) {
      console.error('❌ Error generando entrenamiento de fin de semana:', error);
      setSessionError('Error al generar el entrenamiento. Por favor, intenta de nuevo.');
    } finally {
      setIsLoadingWeekendWorkout(false);
    }
  };

  const handleSkipWarmup = () => {
    track('BUTTON_CLICK', { id: 'warmup_skip' }, { component: 'TodayTrainingTab' });

    const pendingId = localState.pendingSessionData?.sessionId || session.sessionId;
    if (!pendingId) return;

    // Preparar datos mínimos de sesión si faltaran por cualquier carrera de estado
    updateLocalState(prev => ({
      ...prev,
      pendingSessionData: {
        session: prev.pendingSessionData?.session || (todaySessionData ? {
          ...todaySessionData,
          sessionId: pendingId,
          currentExerciseIndex: 0,
          exerciseProgress: sessionExerciseProgress
        } : null),
        sessionId: prev.pendingSessionData?.sessionId || pendingId
      },
      showWarmupModal: false,
      showSessionModal: true
    }));

    try { showModal?.('routineSession'); hideModal?.('warmup'); } catch (error) {
      console.warn('Modal method not available:', error);
    }

    setTimeout(() => {
      updateLocalState(prev => ({ ...prev, showSessionModal: true }));
      try { showModal?.('routineSession'); hideModal?.('warmup'); } catch (error) {
      console.warn('Modal method not available:', error);
    }
      console.log('🔍 DEBUG después de warmup_skip:', {
        'localState.showSessionModal': true,
        'ui.showRoutineSession': ui.showRoutineSession,
        'effectiveSessionId (post)': pendingId
      });
    }, 0);
  };

  const handleCloseWarmup = () => {
    track('BUTTON_CLICK', { id: 'warmup_close' }, { component: 'TodayTrainingTab' });

    const pendingId = localState.pendingSessionData?.sessionId || session.sessionId;
    if (!pendingId) {
      // Cerrar sin sesión válida
      return updateLocalState({ showWarmupModal: false });
    }

    // Alinear comportamiento: cerrar warmup y abrir RoutineSessionModal
    updateLocalState(prev => ({
      ...prev,
      pendingSessionData: {
        session: prev.pendingSessionData?.session || (todaySessionData ? {
          ...todaySessionData,
          sessionId: pendingId,
          currentExerciseIndex: 0,
          exerciseProgress: sessionExerciseProgress
        } : null),
        sessionId: prev.pendingSessionData?.sessionId || pendingId
      },
      showWarmupModal: false,
      showSessionModal: true
    }));
    try { showModal?.('routineSession'); hideModal?.('warmup'); } catch (error) {
      console.warn('Modal method not available:', error);
    }
  };

  // Handler para cancelar rutina
  const handleCancelPlan = useCallback(async () => {
    track('BUTTON_CLICK', { id: 'cancel_plan_confirm' }, { component: 'TodayTrainingTab' });

    console.log('🔴 HANDLE CANCEL PLAN - Start', {
      todayStatus: todayStatus,
      sessionType: todayStatus?.session?.session_type,
      pendingCancelSessionId: localState.pendingCancelSessionId,
      sessionIdFromStatus: todayStatus?.session?.id
    });

    try {
      setLoading(true);

      // 🌟 Verificar si es sesión weekend
      const isWeekendSession = todayStatus?.session?.session_type === 'weekend-extra';
      const sessionId = localState.pendingCancelSessionId || todayStatus?.session?.id;

      console.log('🔴 CANCEL - Decision:', {
        isWeekendSession,
        sessionId,
        willCallWeekendEndpoint: isWeekendSession && sessionId
      });

      if (isWeekendSession && sessionId) {
        console.log('🌟 Cancelando sesión weekend:', sessionId);
        const url = `${API_URL}/api/training-session/cancel/methodology/${sessionId}`;
        console.log('🔴 DELETE URL:', url);

        // Cancelar sesión weekend directamente
        const response = await fetch(url, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${tokenManager.getToken()}`,
            'Content-Type': 'application/json'
          }
        });

        console.log('🔴 DELETE Response:', {
          ok: response.ok,
          status: response.status
        });

        if (response.ok) {
          const data = await response.json();
          console.log('✅ DELETE Success:', data);
          updateLocalState({ showRejectionModal: false, pendingCancelSessionId: null });
          showSuccess('Entrenamiento de fin de semana cancelado');
          // Limpiar estado y refrescar
          setTodayStatus(null);
          setTodaySessionData(null);
          await fetchTodayStatus();
        } else {
          const errorData = await response.json();
          console.error('❌ DELETE Failed:', errorData);
          throw new Error(errorData.message || 'Error cancelando entrenamiento de fin de semana');
        }
      } else {
        // Cancelar plan normal
        const result = await cancelPlan();

        if (result.success) {
          updateLocalState({ showRejectionModal: false });
          showSuccess('Rutina cancelada exitosamente');
          // Redirigir a metodologías después de un breve delay
          setTimeout(() => {
            goToMethodologies();
          }, 1500);
        } else {
          throw new Error(result.error || 'Error cancelando la rutina');
        }
      }
    } catch (error) {
      console.error('Error cancelando rutina:', error);
      setError(`Error cancelando rutina: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [cancelPlan, setLoading, showSuccess, setError, goToMethodologies, track, todayStatus, localState.pendingCancelSessionId, fetchTodayStatus]);

  const handleCloseCancelModal = () => {
    track('BUTTON_CLICK', { id: 'cancel_plan_close' }, { component: 'TodayTrainingTab' });
    updateLocalState({ showRejectionModal: false });
  };

  return {
    handleWarmupComplete,
    handleGenerateWeekendWorkout,
    handleSkipWarmup,
    handleCloseWarmup,
    handleCancelPlan,
    handleCloseCancelModal
  };
}
