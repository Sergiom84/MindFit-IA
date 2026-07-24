import { useCallback } from 'react';
import apiClient from '@/lib/apiClient';
import { methodologyApiKey } from '../MethodologiesScreen.focusGroups.js';

export function useSingleDayMethodologyActions({
  localState,
  updateLocalState,
  ui,
  getUserLevel,
  proceedWithMethodologySelection
}) {
  const closeSingleDayModals = useCallback(() => {
    updateLocalState({
      showHpv2WeekendModal: false,
      showHpv2FocusModal: false,
      showCasaEquipmentModal: false,
      isGeneratingSingleDay: false,
      pendingFocusGroup: null,
      pendingEquipment: null
    });
  }, [updateLocalState]);

  const startSingleDay = useCallback(async ({
    selectionMode = 'full_body',
    focusGroup = null,
    nivelOverride = null,
    equipment = null
  }) => {
    const level = nivelOverride || localState.pendingLevel || getUserLevel();
    const methodologyName = localState.pendingMethodology?.name || 'HipertrofiaV2';
    const equipmentList = equipment ?? localState.pendingEquipment ?? null;
    updateLocalState({ isGeneratingSingleDay: true });

    try {
      const response = await apiClient.post('/methodology-session/generate-single-day', {
        methodology: methodologyApiKey(methodologyName),
        nivel: level,
        isWeekendExtra: true,
        selectionMode,
        focusGroup,
        ...(equipmentList ? { equipment: equipmentList } : {})
      });
      const data = response.data || response;
      if (!data?.success || !data?.sessionId) {
        throw new Error(data?.error || 'No se pudo generar el entrenamiento');
      }

      const workout = data.workout || {};
      const discipline = workout.discipline || methodologyApiKey(methodologyName);
      const isCrossFit = discipline === 'crossfit';
      updateLocalState({
        pendingSessionData: {
          dia: new Date().toLocaleDateString('es-ES', { weekday: 'long' }),
          tipo: isCrossFit
            ? (workout.wod?.label || 'WOD del Día')
            : selectionMode === 'liked' ? 'Tus favoritos'
            : selectionMode === 'disliked' ? 'Los que te cuestan'
            : selectionMode === 'focus' && focusGroup ? `Foco: ${focusGroup}`
            : 'Full Body',
          ejercicios: workout.exercises || [],
          isWeekendExtra: true,
          sessionId: data.sessionId,
          methodology_plan_id: data.methodologyPlanId ?? null,
          planId: data.methodologyPlanId ?? null,
          nivel: level,
          discipline,
          schema_version: workout.schema_version ?? null,
          crossfit_v2_session: workout.crossfit_v2_session ?? null,
          wod: workout.wod || null
        },
        showWarmupModal: true,
        showHpv2WeekendModal: false,
        showHpv2FocusModal: false,
        isGeneratingSingleDay: false
      });
      ui.showModal('warmup');
    } catch (error) {
      console.error('❌ Error generando entrenamiento de un día:', error);
      const detail = error?.response?.data?.details || error?.data?.details;
      ui.setError(detail || error?.message || 'No se pudo generar el entrenamiento para hoy');
      updateLocalState({ isGeneratingSingleDay: false });
    }
  }, [getUserLevel, localState.pendingEquipment, localState.pendingLevel, localState.pendingMethodology?.name, ui, updateLocalState]);

  const handleWeekendAccept = useCallback(() => {
    const level = getUserLevel();
    if (localState.pendingMethodology?.name === 'Entrenamiento en Casa') {
      updateLocalState({
        showHpv2WeekendModal: false,
        showCasaEquipmentModal: true,
        pendingLevel: level
      });
      return;
    }
    updateLocalState({
      showHpv2WeekendModal: false,
      showHpv2FocusModal: true,
      pendingLevel: level
    });
  }, [getUserLevel, localState.pendingMethodology?.name, updateLocalState]);

  const handleCasaEquipmentConfirm = useCallback((equipment) => {
    updateLocalState({
      pendingEquipment: equipment,
      showCasaEquipmentModal: false,
      pendingLevel: getUserLevel(),
      showHpv2FocusModal: true
    });
  }, [getUserLevel, updateLocalState]);

  const handleWeekendLater = useCallback(() => {
    const methodology = localState.pendingMethodology;
    closeSingleDayModals();
    if (methodology) proceedWithMethodologySelection(methodology);
  }, [closeSingleDayModals, localState.pendingMethodology, proceedWithMethodologySelection]);

  return {
    closeHipertrofiaWeekendModals: closeSingleDayModals,
    handleHipertrofiaPreferenceMode: mode => startSingleDay({ selectionMode: mode }),
    handleHipertrofiaWeekendAccept: handleWeekendAccept,
    handleCasaEquipmentConfirm,
    handleHipertrofiaWeekendLater: handleWeekendLater,
    handleHipertrofiaFullBodyAdvanced: () => startSingleDay({ selectionMode: 'full_body' }),
    handleHipertrofiaFocusGroup: group => startSingleDay({ selectionMode: 'focus', focusGroup: group })
  };
}
