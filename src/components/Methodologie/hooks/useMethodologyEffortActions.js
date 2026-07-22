import { useCallback, useMemo } from 'react';
import apiClient from '@/lib/apiClient';

const EFFORT_CONFIG = {
  calistenia: {
    endpoint: '/methodology-session/calistenia/session-result',
    decisionKey: 'autoregDecision',
    modalKey: 'showCalisteniaEffort'
  },
  funcional: {
    endpoint: '/methodology-session/funcional/session-result',
    decisionKey: 'funcionalDecision',
    modalKey: 'showFuncionalEffort'
  },
  casa: {
    endpoint: '/methodology-session/casa/session-result',
    decisionKey: 'casaDecision',
    modalKey: 'showCasaEffort'
  },
  crossfit: {
    endpoint: '/methodology-session/crossfit/wod-result',
    decisionKey: 'crossfitDecision',
    modalKey: 'showCrossfitEffort',
    finishState: { crossfitWodScale: 'rx' }
  },
  halterofilia: {
    endpoint: '/methodology-session/halterofilia/session-result',
    decisionKey: 'halterofiliaDecision',
    modalKey: 'showHalterofiliaEffort'
  },
  powerlifting: {
    endpoint: '/methodology-session/powerlifting/session-result',
    decisionKey: 'powerliftingDecision',
    modalKey: 'showPowerliftingEffort'
  },
  heavyDuty: {
    endpoint: '/methodology-session/heavy-duty/session-result',
    decisionKey: 'heavyDutyDecision',
    modalKey: 'showHeavyDutyEffort'
  }
};

export function useMethodologyEffortActions({ localState, updateLocalState, navigate }) {
  const planId = localState.pendingSessionData?.methodology_plan_id
    ?? localState.pendingSessionData?.planId
    ?? null;
  const sessionId = localState.pendingSessionData?.sessionId ?? null;

  const submitEffort = useCallback(async (method, payload) => {
    const config = EFFORT_CONFIG[method];
    if (!config) return;

    updateLocalState({ isSavingEffort: true });
    try {
      const endpoint = method === 'crossfit' && sessionId
        ? `/routines/sessions/${sessionId}/effort`
        : config.endpoint;
      const response = await apiClient.post(endpoint, {
        methodologyPlanId: planId,
        ...payload
      });
      const data = response?.data || response;
      updateLocalState({ [config.decisionKey]: data?.decision || 'hold' });
    } catch (error) {
      console.warn(`⚠️ No se pudo registrar la autorregulación ${method}:`, error?.message);
      updateLocalState({ [config.decisionKey]: 'hold' });
    } finally {
      updateLocalState({ isSavingEffort: false });
    }
  }, [planId, sessionId, updateLocalState]);

  const finishEffort = useCallback((method) => {
    const config = EFFORT_CONFIG[method];
    if (!config) return;

    updateLocalState({
      [config.modalKey]: false,
      [config.decisionKey]: null,
      pendingSessionData: null,
      ...config.finishState,
      crossfitWodSummary: null
    });
    navigate('/routines', { state: { activeTab: 'today' } });
  }, [navigate, updateLocalState]);

  return useMemo(() => ({
    handleCalisteniaEffortSubmit: ({ avgRir, targetMet, feeling = null }) =>
      submitEffort('calistenia', { avgRir, targetMet, feeling }),
    finishCalisteniaEffort: () => finishEffort('calistenia'),
    handleFuncionalEffortSubmit: ({ avgRir, targetMet, feeling = null }) =>
      submitEffort('funcional', { avgRir, targetMet, feeling }),
    finishFuncionalEffort: () => finishEffort('funcional'),
    handleCasaEffortSubmit: ({ avgRir, targetMet, feeling = null }) =>
      submitEffort('casa', { avgRir, targetMet, feeling }),
    finishCasaEffort: () => finishEffort('casa'),
    handleCrossfitEffortSubmit: (payload) => submitEffort('crossfit', payload),
    finishCrossfitEffort: () => finishEffort('crossfit'),
    handleHalterofiliaEffortSubmit: ({ rpe, targetMet, goodTechnique, feeling = null }) =>
      submitEffort('halterofilia', { rpe, targetMet, goodTechnique, feeling }),
    finishHalterofiliaEffort: () => finishEffort('halterofilia'),
    handlePowerliftingEffortSubmit: ({ rpe, targetMet, goodTechnique, feeling = null }) =>
      submitEffort('powerlifting', { rpe, targetMet, goodTechnique, feeling }),
    finishPowerliftingEffort: () => finishEffort('powerlifting'),
    handleHeavyDutyEffortSubmit: ({ reachedFailure, targetMet, feeling = null }) =>
      submitEffort('heavyDuty', { reachedFailure, targetMet, feeling }),
    finishHeavyDutyEffort: () => finishEffort('heavyDuty')
  }), [finishEffort, submitEffort]);
}
