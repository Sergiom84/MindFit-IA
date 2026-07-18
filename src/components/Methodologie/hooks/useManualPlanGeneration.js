import { useCallback, useMemo } from 'react';

const MANUAL_GENERATORS = {
  calistenia: {
    trackId: 'generate_calistenia',
    methodology: 'calistenia',
    dataKey: 'calisteniaData',
    modal: 'calisteniaManual'
  },
  heavyDuty: {
    trackId: 'generate_heavy_duty',
    methodology: 'heavy-duty',
    dataKey: 'heavyDutyData',
    modal: 'heavyDutyManual'
  },
  powerlifting: {
    trackId: 'generate_powerlifting',
    methodology: 'powerlifting',
    dataKey: 'powerliftingData',
    modal: 'powerliftingManual'
  },
  crossfit: {
    trackId: 'generate_crossfit',
    methodology: 'crossfit',
    dataKey: 'crossfitData',
    modal: 'crossfitManual'
  },
  funcional: {
    trackId: 'generate_funcional',
    methodology: 'funcional',
    dataKey: 'funcionalData',
    modal: 'funcionalManual'
  },
  halterofilia: {
    trackId: 'generate_halterofilia',
    methodology: 'halterofilia',
    dataKey: 'halterofíliaData',
    modal: 'halterofíliaManual'
  },
  casa: {
    trackId: 'generate_casa',
    methodology: 'entrenamiento-casa',
    dataKey: 'casaData',
    modal: 'casaManual'
  }
};

export function useManualPlanGeneration({
  ui,
  track,
  generatePlan,
  validatePlanData,
  runWithActivePlanGuard,
  isWeekend,
  getUserLevel,
  userData,
  updateLocalState
}) {
  const runManualGenerate = useCallback(async (config, data) => {
    try {
      track('ACTION', { id: config.trackId }, { component: 'MethodologiesScreen' });
    } catch (error) {
      console.warn('Track error:', error);
    }

    if (ui.isLoading) return;

    await runWithActivePlanGuard(async () => {
      ui.setLoading(true);
      try {
        const result = await generatePlan({
          mode: 'manual',
          methodology: config.methodology,
          [config.dataKey]: data
        });
        if (!result.success) {
          throw new Error(result.error || `Error al generar el plan de ${config.methodology}`);
        }

        ui.hideModal(config.modal);
        const validation = validatePlanData(result.plan);
        if (!validation.isValid) {
          throw new Error(`Plan generado incorrectamente: ${validation.error}`);
        }
        ui.showModal('planConfirmation');
      } catch (error) {
        console.error(`❌ Error generando plan de ${config.methodology}:`, error);
        ui.setError(error.message || `Error al generar el plan de ${config.methodology}`);
      } finally {
        ui.setLoading(false);
      }
    });
  }, [generatePlan, runWithActivePlanGuard, track, ui, validatePlanData]);

  const handleHipertrofiaV2ManualGenerate = useCallback(async (data) => {
    try {
      track('ACTION', { id: 'generate_hipertrofiav2' }, { component: 'MethodologiesScreen' });
    } catch (error) {
      console.warn('Track error:', error);
    }

    if (ui.isLoading) return;

    if (isWeekend()) {
      const level = data?.evaluation?.level || userData?.nivel_entrenamiento || getUserLevel();
      ui.hideModal('hipertrofiaV2Manual');
      updateLocalState({
        pendingMethodology: { name: 'HipertrofiaV2' },
        pendingLevel: level,
        showHpv2WeekendModal: true
      });
      return;
    }

    await runWithActivePlanGuard(async () => {
      ui.setLoading(true);
      try {
        const validation = validatePlanData(data?.planData);
        if (!validation.isValid) {
          throw new Error(`Plan generado incorrectamente: ${validation.error}`);
        }

        const result = await generatePlan({
          mode: 'manual',
          methodology: 'hipertrofiaV2',
          planData: data?.planData,
          methodologyPlanId: data?.methodologyPlanId,
          systemInfo: data?.system_info
        });
        if (!result.success) {
          throw new Error(result.error || 'Error registrando el plan MindFeed');
        }

        ui.hideModal('hipertrofiaV2Manual');
        ui.showModal('planConfirmation');
      } catch (error) {
        console.error('❌ Error generando plan de Hipertrofia V2:', error);
        ui.setError(error.message || 'Error al generar el plan de Hipertrofia');
      } finally {
        ui.setLoading(false);
      }
    });
  }, [generatePlan, getUserLevel, isWeekend, runWithActivePlanGuard, track, ui, updateLocalState, userData?.nivel_entrenamiento, validatePlanData]);

  return useMemo(() => ({
    handleCalisteniaManualGenerate: data => runManualGenerate(MANUAL_GENERATORS.calistenia, data),
    handleHeavyDutyManualGenerate: data => runManualGenerate(MANUAL_GENERATORS.heavyDuty, data),
    handleHipertrofiaV2ManualGenerate,
    handlePowerliftingManualGenerate: data => runManualGenerate(MANUAL_GENERATORS.powerlifting, data),
    handleCrossFitManualGenerate: data => runManualGenerate(MANUAL_GENERATORS.crossfit, data),
    handleFuncionalManualGenerate: data => runManualGenerate(MANUAL_GENERATORS.funcional, data),
    handleHalterofíliaManualGenerate: data => runManualGenerate(MANUAL_GENERATORS.halterofilia, data),
    handleCasaManualGenerate: data => runManualGenerate(MANUAL_GENERATORS.casa, data)
  }), [handleHipertrofiaV2ManualGenerate, runManualGenerate]);
}
