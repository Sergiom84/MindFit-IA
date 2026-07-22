import CalisteniaEffortModal from '../routines/modals/CalisteniaEffortModal.jsx';
import CrossFitEffortModal from '../routines/modals/CrossFitEffortModal.jsx';
import HalterofiliaEffortModal from '../routines/modals/HalterofiliaEffortModal.jsx';
import FuncionalEffortModal from '../routines/modals/FuncionalEffortModal.jsx';
import CasaEffortModal from '../routines/modals/CasaEffortModal.jsx';
import HeavyDutyEffortModal from '../routines/modals/HeavyDutyEffortModal.jsx';
import PowerliftingEffortModal from '../routines/modals/PowerliftingEffortModal.jsx';

/**
 * Clúster de modales de autorregulación (auto-evaluación de esfuerzo por disciplina).
 * Extraído de MethodologiesScreen.jsx (ARCH-002) sin cambios de comportamiento.
 */
export default function EffortModals({ localState, handlers }) {
  const {
    handleCalisteniaEffortSubmit,
    finishCalisteniaEffort,
    handleCrossfitEffortSubmit,
    finishCrossfitEffort,
    handleHalterofiliaEffortSubmit,
    finishHalterofiliaEffort,
    handlePowerliftingEffortSubmit,
    finishPowerliftingEffort,
    handleHeavyDutyEffortSubmit,
    finishHeavyDutyEffort,
    handleFuncionalEffortSubmit,
    finishFuncionalEffort,
    handleCasaEffortSubmit,
    finishCasaEffort
  } = handlers;

  return (
    <>
      {/* Autorregulación Calistenia: auto-evaluación de esfuerzo al completar sesión */}
      <CalisteniaEffortModal
        isOpen={localState.showCalisteniaEffort}
        isLoading={localState.isSavingEffort}
        result={localState.autoregDecision}
        onSubmit={handleCalisteniaEffortSubmit}
        onSkip={finishCalisteniaEffort}
        onContinue={finishCalisteniaEffort}
      />

      {/* Autorregulación CrossFit: auto-evaluación de esfuerzo al completar el WOD */}
      <CrossFitEffortModal
        isOpen={localState.showCrossfitEffort}
        isLoading={localState.isSavingEffort}
        result={localState.crossfitDecision}
        defaultScale={localState.crossfitWodScale || 'rx'}
        wodSummary={localState.crossfitWodSummary}
        submitError={localState.crossfitEffortError}
        isV2Result={localState.crossfitResultV2 === true}
        onSubmit={handleCrossfitEffortSubmit}
        onSkip={finishCrossfitEffort}
        onContinue={finishCrossfitEffort}
      />

      {/* Autorregulación Halterofilia: auto-evaluación de esfuerzo (RPE/carga/técnica) al completar la sesión */}
      <HalterofiliaEffortModal
        isOpen={localState.showHalterofiliaEffort}
        isLoading={localState.isSavingEffort}
        result={localState.halterofiliaDecision}
        onSubmit={handleHalterofiliaEffortSubmit}
        onSkip={finishHalterofiliaEffort}
        onContinue={finishHalterofiliaEffort}
      />

      {/* Autorregulación Powerlifting: auto-evaluación de esfuerzo (RPE/carga/técnica) al completar la sesión */}
      <PowerliftingEffortModal
        isOpen={localState.showPowerliftingEffort}
        isLoading={localState.isSavingEffort}
        result={localState.powerliftingDecision}
        onSubmit={handlePowerliftingEffortSubmit}
        onSkip={finishPowerliftingEffort}
        onContinue={finishPowerliftingEffort}
      />

      {/* Autorregulación Heavy Duty: auto-evaluación de esfuerzo (fallo + tope de rango) al completar la sesión */}
      <HeavyDutyEffortModal
        isOpen={localState.showHeavyDutyEffort}
        isLoading={localState.isSavingEffort}
        result={localState.heavyDutyDecision}
        onSubmit={handleHeavyDutyEffortSubmit}
        onSkip={finishHeavyDutyEffort}
        onContinue={finishHeavyDutyEffort}
      />

      {/* Autorregulación Funcional: auto-evaluación de esfuerzo (RIR/cumplimiento) al completar la sesión */}
      <FuncionalEffortModal
        isOpen={localState.showFuncionalEffort}
        isLoading={localState.isSavingEffort}
        result={localState.funcionalDecision}
        onSubmit={handleFuncionalEffortSubmit}
        onSkip={finishFuncionalEffort}
        onContinue={finishFuncionalEffort}
      />

      {/* Autorregulación Casa: auto-evaluación de esfuerzo al completar sesión */}
      <CasaEffortModal
        isOpen={localState.showCasaEffort}
        isLoading={localState.isSavingEffort}
        result={localState.casaDecision}
        onSubmit={handleCasaEffortSubmit}
        onSkip={finishCasaEffort}
        onContinue={finishCasaEffort}
      />
    </>
  );
}
