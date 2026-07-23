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
    equipment = null,
    assessmentInput = null
  }) => {
    const level = nivelOverride || localState.pendingLevel || getUserLevel();
    const methodologyName = localState.pendingMethodology?.name || 'HipertrofiaV2';
    const equipmentList = equipment ?? localState.pendingEquipment ?? null;
    // PR-CAL-01: canal del assessment determinista de calistenia (painStatus/demonstratedLevel/
    // context/selfReportedLevel). Sin esto el backend nunca podía derivar por dolor agudo (envelope
    // 'refer') en el flujo single-day. Se envía el objeto `assessmentInput` tal cual lo construye el
    // Card (buildAssessmentInput). Fuente: argumento explícito o el capturado en localState. Las demás
    // metodologías ignoran este campo en la ruta genérica, así que enviarlo cuando existe es inocuo.
    const assessment = assessmentInput ?? localState.pendingAssessmentInput ?? null;
    updateLocalState({ isGeneratingSingleDay: true });

    try {
      const response = await apiClient.post('/methodology-session/generate-single-day', {
        methodology: methodologyApiKey(methodologyName),
        nivel: level,
        isWeekendExtra: true,
        selectionMode,
        focusGroup,
        ...(equipmentList ? { equipment: equipmentList } : {}),
        ...(assessment ? { assessmentInput: assessment } : {})
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
          nivel: level,
          discipline,
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
  }, [getUserLevel, localState.pendingAssessmentInput, localState.pendingEquipment, localState.pendingLevel, localState.pendingMethodology?.name, ui, updateLocalState]);

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
