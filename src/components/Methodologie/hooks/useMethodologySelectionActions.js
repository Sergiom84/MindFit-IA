import { useCallback, useRef } from 'react';
import { sanitizeProfile } from '../methodologiesData.js';
import { getDayName } from '../MethodologiesScreen.helpers.js';
import { SINGLE_DAY_METHODOLOGIES } from '../MethodologiesScreen.focusGroups.js';

const MANUAL_MODAL_BY_METHODOLOGY = {
  Calistenia: 'calisteniaManual',
  'Heavy Duty': 'heavyDutyManual',
  Powerlifting: 'powerliftingManual',
  CrossFit: 'crossfitManual',
  Funcional: 'funcionalManual',
  Halterofilia: 'halterofíliaManual',
  'Entrenamiento en Casa': 'casaManual'
};

export function useMethodologySelectionActions({
  user,
  userData,
  localState,
  updateLocalState,
  ui,
  navigate,
  track,
  generatePlan,
  cancelPlan,
  syncWithDatabase,
  hasActivePlanFromDB,
  validatePlanData,
  isWeekend,
  getUserLevel,
  shouldShowStartDayModal,
  shouldShowDistributionModal
}) {
  const pendingPlanActionRef = useRef(null);

  const runWithActivePlanGuard = useCallback(async (action) => {
    let hasPlan = false;
    try {
      hasPlan = await hasActivePlanFromDB();
    } catch (error) {
      console.warn('⚠️ No se pudo validar plan activo en BD:', error);
    }

    if (hasPlan) {
      pendingPlanActionRef.current = action;
      ui.showModal('activePlanWarning');
      return false;
    }

    await action();
    return true;
  }, [hasActivePlanFromDB, ui]);

  const handleActivePlanGoToPlan = useCallback(() => {
    pendingPlanActionRef.current = null;
    ui.hideModal('activePlanWarning');
    navigate('/routines');
  }, [navigate, ui]);

  const handleActivePlanCancelAndContinue = useCallback(async () => {
    ui.hideModal('activePlanWarning');
    const pendingAction = pendingPlanActionRef.current;
    pendingPlanActionRef.current = null;

    try {
      let activePlanId = null;
      try {
        const { getActivePlan } = await import('@/components/routines/api');
        const activeData = await getActivePlan();
        activePlanId = activeData?.methodology_plan_id ?? activeData?.planId ?? null;
      } catch (error) {
        console.warn('⚠️ No se pudo recuperar el plan activo para cancelar:', error);
      }

      const result = await cancelPlan(activePlanId);
      if (result?.success === false) {
        throw new Error(result.error || 'No se pudo cancelar el plan activo');
      }
      await syncWithDatabase();
    } catch (error) {
      console.error('❌ Error cancelando plan activo:', error);
      ui.setError(error.message || 'Error cancelando el plan activo');
      return;
    }

    if (pendingAction) await pendingAction();
  }, [cancelPlan, syncWithDatabase, ui]);

  const proceedWithMethodologySelection = useCallback((methodology, startConfig = null) => {
    if (!methodology) return;

    const directModal = MANUAL_MODAL_BY_METHODOLOGY[methodology.name];
    if (directModal) {
      ui.showModal(directModal);
      return;
    }

    if (methodology.name === 'HipertrofiaV2') {
      const dayOfWeek = new Date().getDay();
      if (dayOfWeek === 4) {
        const sessionsFirstWeek = 5 - (dayOfWeek - 1);
        updateLocalState({
          pendingMethodology: methodology,
          showDistributionModal: true,
          distributionConfig: {
            startDay: getDayName(dayOfWeek),
            totalSessions: 40,
            sessionsPerWeek: 5,
            missingSessions: 5 - sessionsFirstWeek,
            startDayOfWeek: dayOfWeek
          }
        });
      } else {
        ui.showModal('hipertrofiaV2Manual');
      }
      return;
    }

    if (startConfig) updateLocalState({ startConfig });
    updateLocalState({
      pendingMethodology: methodology,
      versionSelectionData: {
        isAutomatic: false,
        selectedMethodology: methodology.name
      }
    });
    ui.showModal('versionSelection');
  }, [ui, updateLocalState]);

  const handleActivateIA = useCallback(async (forcedMethodology = null) => {
    try {
      track('BUTTON_CLICK', { id: 'activar_ia' }, { component: 'MethodologiesScreen' });
    } catch (error) {
      console.warn('Track error:', error);
    }
    if (!user) return;

    await runWithActivePlanGuard(async () => {
      updateLocalState({ versionSelectionData: { isAutomatic: true, forcedMethodology } });
      ui.showModal('versionSelection');
    });
  }, [runWithActivePlanGuard, track, ui, updateLocalState, user]);

  const handleVersionSelectionConfirm = useCallback(async (versionConfig) => {
    ui.hideModal('versionSelection');
    const rawProfile = { ...userData, ...user };
    const fullProfile = sanitizeProfile({
      ...rawProfile,
      peso_kg: rawProfile.peso || rawProfile.peso_kg,
      altura_cm: rawProfile.altura || rawProfile.altura_cm,
      años_entrenando: rawProfile.años_entrenando || rawProfile.anos_entrenando,
      nivel_entrenamiento: rawProfile.nivel || rawProfile.nivel_entrenamiento,
      objetivo_principal: rawProfile.objetivo_principal || rawProfile.objetivoPrincipal
    });

    if (isWeekend()) {
      if (localState.pendingMethodology?.name === 'HipertrofiaV2') {
        updateLocalState({ showHpv2WeekendModal: true, pendingLevel: getUserLevel() });
      } else {
        updateLocalState({
          showWeekendWarning: true,
          weekendGenerationData: { versionConfig, fullProfile, mode: 'automatic' }
        });
      }
      return;
    }

    await runWithActivePlanGuard(async () => {
      try {
        const result = await generatePlan({
          mode: 'automatic',
          versionConfig: versionConfig || { version: 'adapted', customWeeks: 4 },
          userProfile: fullProfile
        });
        if (!result.success) throw new Error(result.error || 'Error generando plan automático');

        const validation = validatePlanData(result.plan);
        if (!validation.isValid) {
          throw new Error(`Plan generado incorrectamente: ${validation.error}`);
        }
        ui.showModal('planConfirmation');
      } catch (error) {
        console.error('❌ Error generando plan:', error);
        ui.setError(error.message);
      }
    });
  }, [generatePlan, getUserLevel, isWeekend, localState.pendingMethodology?.name, runWithActivePlanGuard, ui, updateLocalState, user, userData, validatePlanData]);

  const handleManualCardClick = useCallback(async (methodology, forceManual = false) => {
    try {
      track('CARD_CLICK', { id: methodology?.name, group: 'methodology', mode: 'manual' }, { component: 'MethodologiesScreen' });
    } catch (error) {
      console.warn('Track error:', error);
    }

    if (forceManual && localState.selectionMode !== 'manual') {
      updateLocalState({ selectionMode: 'manual' });
    }
    if (localState.selectionMode !== 'manual' && !forceManual) return;

    await runWithActivePlanGuard(async () => {
      if (SINGLE_DAY_METHODOLOGIES.includes(methodology.name) && isWeekend()) {
        updateLocalState({
          pendingMethodology: methodology,
          showHpv2WeekendModal: true,
          pendingLevel: getUserLevel()
        });
        return;
      }
      if (shouldShowStartDayModal()) {
        updateLocalState({ pendingMethodology: methodology, showStartDayModal: true });
        return;
      }
      proceedWithMethodologySelection(methodology);
    });
  }, [getUserLevel, isWeekend, localState.selectionMode, proceedWithMethodologySelection, runWithActivePlanGuard, shouldShowStartDayModal, track, updateLocalState]);

  const confirmManualSelection = useCallback(async (versionConfig) => {
    if (!localState.pendingMethodology) return;
    ui.hideModal('versionSelection');

    await runWithActivePlanGuard(async () => {
      try {
        const planConfig = {
          mode: 'manual',
          methodology: (localState.pendingMethodology.name || '').toLowerCase(),
          versionConfig: versionConfig || { version: 'adapted', customWeeks: 4 }
        };
        if (localState.startConfig) planConfig.startConfig = localState.startConfig;

        const result = await generatePlan(planConfig);
        if (!result.success) throw new Error(result.error || 'Error al generar el plan');

        const validation = validatePlanData(result.plan);
        if (!validation.isValid) {
          throw new Error(`Plan generado incorrectamente: ${validation.error}`);
        }
        ui.showModal('planConfirmation');
      } catch (error) {
        console.error('❌ Error generando plan manual:', error);
        ui.setError(error.message || 'Error al generar el plan de entrenamiento');
      } finally {
        updateLocalState({ pendingMethodology: null });
      }
    });
  }, [generatePlan, localState.pendingMethodology, localState.startConfig, runWithActivePlanGuard, ui, updateLocalState, validatePlanData]);

  const handleStartDayConfirm = useCallback(async (config) => {
    updateLocalState({ showStartDayModal: false });
    if (config.isHomeTraining) {
      navigate('/home-training');
      return;
    }

    updateLocalState({ startConfig: config });
    if (shouldShowDistributionModal(config)) {
      updateLocalState({
        showDistributionModal: true,
        distributionConfig: {
          startDay: getDayName(config.startDayOfWeek ?? new Date().getDay()),
          totalSessions: 30,
          sessionsPerWeek: 5,
          missingSessions: 5 - config.sessionsFirstWeek,
          startDayOfWeek: config.startDayOfWeek
        }
      });
    } else {
      proceedWithMethodologySelection(localState.pendingMethodology, config);
    }
  }, [localState.pendingMethodology, navigate, proceedWithMethodologySelection, shouldShowDistributionModal, updateLocalState]);

  const handleDistributionConfirm = useCallback(async (option) => {
    updateLocalState({ showDistributionModal: false });
    const finalConfig = {
      ...localState.startConfig,
      distributionOption: option,
      includeSaturdays: option === 'saturdays'
    };
    if (localState.pendingMethodology?.name === 'HipertrofiaV2') {
      updateLocalState({ startConfig: finalConfig });
      ui.showModal('hipertrofiaV2Manual');
    } else {
      proceedWithMethodologySelection(localState.pendingMethodology, finalConfig);
    }
  }, [localState.pendingMethodology, localState.startConfig, proceedWithMethodologySelection, ui, updateLocalState]);

  const handleOpenDetails = useCallback((methodology) => {
    updateLocalState({ detailsMethod: methodology });
    ui.showModal('methodologyDetails');
  }, [ui, updateLocalState]);

  const clearPendingPlanAction = useCallback(() => {
    pendingPlanActionRef.current = null;
  }, []);

  return {
    runWithActivePlanGuard,
    handleActivePlanGoToPlan,
    handleActivePlanCancelAndContinue,
    handleActivateIA,
    handleVersionSelectionConfirm,
    handleManualCardClick,
    proceedWithMethodologySelection,
    confirmManualSelection,
    handleStartDayConfirm,
    handleDistributionConfirm,
    handleOpenDetails,
    clearPendingPlanAction
  };
}
