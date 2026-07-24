import { useCallback } from 'react';
import { alertDialog } from '../../ui/dialogService.jsx';
import tokenManager from '../../../utils/tokenManager.js';

async function confirmPlan(methodologyPlanId, startConfig) {
  const response = await fetch('/api/routines/confirm-plan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenManager.getToken()}`
    },
    body: JSON.stringify({ methodology_plan_id: methodologyPlanId, startConfig })
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || 'Error al confirmar el plan');
  }
  return response.json();
}

export function useMethodologyPlanLifecycle({
  plan,
  ui,
  track,
  startSession,
  goToTraining,
  generatePlan,
  validatePlanData,
  buildStartConfigPayload,
  setSessionData,
  setIsConfirmingPlan,
  updateLocalState
}) {
  const handleSavePlan = useCallback(async () => {
    setIsConfirmingPlan(true);
    ui.setLoading(true);
    try {
      if (!plan.currentPlan || !plan.methodologyPlanId) {
        throw new Error('No hay plan generado para guardar');
      }
      await confirmPlan(plan.methodologyPlanId, buildStartConfigPayload());
      ui.hideModal('planConfirmation');
    } catch (error) {
      console.error('❌ Error guardando plan:', error);
      ui.setError(error.message || 'Error al guardar el plan');
    } finally {
      ui.setLoading(false);
      setIsConfirmingPlan(false);
    }
  }, [buildStartConfigPayload, plan.currentPlan, plan.methodologyPlanId, setIsConfirmingPlan, ui]);

  const handleStartTraining = useCallback(async () => {
    setIsConfirmingPlan(true);
    ui.setLoading(true);
    try {
      if (!plan.currentPlan || !plan.methodologyPlanId) {
        throw new Error('No hay plan generado para iniciar');
      }
      await confirmPlan(plan.methodologyPlanId, buildStartConfigPayload());

      const todayName = new Date().toLocaleDateString('es-ES', { weekday: 'long' });
      const dayName = todayName.charAt(0).toUpperCase() + todayName.slice(1);
      const result = await startSession({ methodologyPlanId: plan.methodologyPlanId, dayName });
      if (!result.success) {
        throw new Error(result.error || 'Error al iniciar el entrenamiento');
      }

      const { getSessionProgress } = await import('../../routines/api');
      const progressData = await getSessionProgress(result.session_id);
      if (!progressData.exercises?.length) {
        throw new Error('La sesión no tiene ejercicios disponibles');
      }

      const exercises = progressData.exercises.map(exercise => ({
        ...exercise,
        originalIndex: exercise.exercise_order,
        exercise_id: exercise.exercise_id ?? exercise.id ?? null,
        nombre: exercise.exercise_name || exercise.nombre,
        series: exercise.series_total || exercise.series,
        repeticiones: exercise.repeticiones,
        descanso_seg: exercise.descanso_seg,
        intensidad: exercise.intensidad,
        tempo: exercise.tempo,
        notas: exercise.notas,
        status: exercise.status,
        series_completed: exercise.series_completed || 0,
        time_spent_seconds: exercise.time_spent_seconds || 0
      }));
      setSessionData({
        ejercicios: exercises,
        session_id: result.session_id,
        sessionId: result.session_id,
        currentExerciseIndex: 0
      });
      ui.hideModal('planConfirmation');
      ui.showModal('warmup');
    } catch (error) {
      console.error('❌ Error iniciando entrenamiento:', error);
      ui.setError(error.message || 'Error al iniciar el entrenamiento');
    } finally {
      ui.setLoading(false);
      setIsConfirmingPlan(false);
    }
  }, [buildStartConfigPayload, plan.currentPlan, plan.methodologyPlanId, setIsConfirmingPlan, setSessionData, startSession, ui]);

  const handleWarmupComplete = useCallback(() => {
    track('BUTTON_CLICK', { id: 'warmup_complete' }, { component: 'MethodologiesScreen' });
    ui.hideModal('warmup');
    ui.showModal('routineSession');
  }, [track, ui]);

  const handleSkipWarmup = useCallback(() => {
    track('BUTTON_CLICK', { id: 'warmup_skip' }, { component: 'MethodologiesScreen' });
    ui.hideModal('warmup');
    ui.showModal('routineSession');
  }, [track, ui]);

  const handleCloseWarmup = useCallback(() => {
    track('BUTTON_CLICK', { id: 'warmup_close' }, { component: 'MethodologiesScreen' });
    ui.hideModal('warmup');
    ui.showModal('routineSession');
  }, [track, ui]);

  const handleEndSession = useCallback(() => {
    ui.hideModal('routineSession');
    goToTraining();
  }, [goToTraining, ui]);

  const handleGenerateAnother = useCallback(async (feedbackData) => {
    try {
      const canonical = plan.currentPlan?.crossfit_v2;
      const isCrossfitV2 = canonical?.schema_version === 'crossfit-plan/v2';
      const token = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      const result = await generatePlan(isCrossfitV2 ? {
        mode: 'regenerate',
        methodology: 'crossfit',
        previous_plan_id: plan.methodologyPlanId,
        expected_revision: canonical.generation.revision,
        regeneration_reasons: feedbackData?.reasons ?? [],
        crossfit_assessment_id: plan.currentPlan?.crossfit_assessment_id ?? null,
        request_id: `crossfit-regeneration-request-${token}`,
        idempotency_key: `crossfit-regeneration-idempotency-${token}`
      } : {
        mode: 'regenerate',
        feedback: feedbackData,
        previousPlan: plan.currentPlan
      });
      if (!result.success) throw new Error(result.error || 'Error al generar nuevo plan');

      const validation = validatePlanData(result.plan);
      if (!validation.isValid) {
        throw new Error(`Plan generado incorrectamente: ${validation.error}`);
      }
      ui.showModal('planConfirmation');
    } catch (error) {
      console.error('❌ Error al generar nuevo plan:', error);
      ui.setError(error.message || 'Error al generar nuevo plan');
    }
  }, [generatePlan, plan.currentPlan, plan.methodologyPlanId, ui, validatePlanData]);

  const handleWeekendContinueRegular = useCallback(async () => {
    updateLocalState({ showWeekendWarning: false, weekendGenerationData: null });
  }, [updateLocalState]);

  const handleWeekendFullBody = useCallback(async (fullBodyPlan) => {
    updateLocalState({ showWeekendWarning: false, weekendGenerationData: null });
    if (!fullBodyPlan?.sessionId) {
      await alertDialog('Error al iniciar el entrenamiento. Por favor, intenta de nuevo.');
      return;
    }

    updateLocalState({
      pendingSessionData: {
        dia: new Date().toLocaleDateString('es-ES', { weekday: 'long' }),
        tipo: 'Full Body Extra',
        ejercicios: fullBodyPlan.exercises || [],
        isWeekendExtra: true,
        sessionId: fullBodyPlan.sessionId,
        nivel: fullBodyPlan.nivel || 'Principiante'
      },
      showWarmupModal: true
    });
    ui.showModal('warmup');
  }, [ui, updateLocalState]);

  return {
    handleSavePlan,
    handleStartTraining,
    handleWarmupComplete,
    handleSkipWarmup,
    handleCloseWarmup,
    handleEndSession,
    handleGenerateAnother,
    handleWeekendContinueRegular,
    handleWeekendFullBody
  };
}
