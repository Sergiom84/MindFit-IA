/**
 * @fileoverview Gestor centralizado de modales de metodología
 * 
 * Centraliza todos los modales del flujo de metodologías:
 * - MethodologyDetailsDialog
 * - MethodologyVersionSelectionModal
 * - TrainingPlanConfirmationModal
 * - WarmupModal
 * - RoutineSessionModal
 * - StartDayConfirmationModal
 * - SessionDistributionModal
 * - WeekendWarningModal
 * - HipertrofiaWeekendModal
 * - HipertrofiaFocusModal
 * 
 * @module components/Methodologie/components/MethodologyModalsManager
 */

import React from 'react';
import MethodologyDetailsDialog from '../shared/MethodologyDetailsDialog';
import MethodologyVersionSelectionModal from '../shared/MethodologyVersionSelectionModal';
import TrainingPlanConfirmationModal from '../../routines/TrainingPlanConfirmationModal';
import WarmupModal from '../../routines/WarmupModal';
import RoutineSessionModal from '../../routines/RoutineSessionModal';
import StartDayConfirmationModal from '../../routines/modals/StartDayConfirmationModal';
import SessionDistributionModal from '../../routines/modals/SessionDistributionModal';
import WeekendWarningModal from '../../routines/modals/WeekendWarningModal';
import HipertrofiaWeekendModal from '../../routines/modals/HipertrofiaWeekendModal';
import HipertrofiaFocusModal from '../../routines/modals/HipertrofiaFocusModal';

/**
 * Gestor de modales de metodología
 * 
 * @param {Object} props
 * @param {Object} props.modalState - Estado de todos los modales
 * @param {Object} props.handlers - Handlers para cada modal
 * @param {Object} props.data - Datos para los modales
 */
export function MethodologyModalsManager({
  modalState,
  handlers,
  data
}) {
  const {
    showMethodologyDetails,
    showVersionSelection,
    showPlanConfirmation,
    showWarmup,
    showRoutineSession,
    showStartDayModal,
    showDistributionModal,
    showWeekendWarning,
    showHpv2WeekendModal,
    showHpv2FocusModal
  } = modalState;

  const {
    onCloseMethodologyDetails,
    onCloseVersionSelection,
    onClosePlanConfirmation,
    onCloseWarmup,
    onCloseRoutineSession,
    onCloseStartDayModal,
    onCloseDistributionModal,
    onCloseWeekendWarning,
    onCloseHpv2WeekendModal,
    onCloseHpv2FocusModal,
    onConfirmPlan,
    onWarmupComplete,
    onSessionComplete,
    onStartDayConfirm,
    onDistributionConfirm,
    onVersionSelect,
    onHpv2WeekendConfirm,
    onHpv2FocusConfirm
  } = handlers;

  const {
    detailsMethod,
    versionSelectionData,
    pendingSessionData,
    startConfig,
    distributionConfig,
    weekendGenerationData,
    pendingLevel,
    pendingFocusGroup,
    plan,
    session
  } = data;

  return (
    <>
      {/* Modal de detalles de metodología */}
      {showMethodologyDetails && detailsMethod && (
        <MethodologyDetailsDialog
          isOpen={showMethodologyDetails}
          onClose={onCloseMethodologyDetails}
          methodology={detailsMethod}
        />
      )}

      {/* Modal de selección de versión */}
      {showVersionSelection && versionSelectionData && (
        <MethodologyVersionSelectionModal
          isOpen={showVersionSelection}
          onClose={onCloseVersionSelection}
          onSelect={onVersionSelect}
          data={versionSelectionData}
        />
      )}

      {/* Modal de confirmación de plan */}
      {showPlanConfirmation && plan?.routinePlan && (
        <TrainingPlanConfirmationModal
          isOpen={showPlanConfirmation}
          onClose={onClosePlanConfirmation}
          onConfirm={onConfirmPlan}
          plan={plan.routinePlan}
          sessionData={pendingSessionData}
        />
      )}

      {/* Modal de calentamiento */}
      {showWarmup && (
        <WarmupModal
          isOpen={showWarmup}
          onClose={onCloseWarmup}
          onComplete={onWarmupComplete}
          sessionData={pendingSessionData}
        />
      )}

      {/* Modal de sesión de rutina */}
      {showRoutineSession && session && (
        <RoutineSessionModal
          isOpen={showRoutineSession}
          onClose={onCloseRoutineSession}
          onComplete={onSessionComplete}
          session={session}
        />
      )}

      {/* Modal de día de inicio */}
      {showStartDayModal && (
        <StartDayConfirmationModal
          isOpen={showStartDayModal}
          onClose={onCloseStartDayModal}
          onConfirm={onStartDayConfirm}
          config={startConfig}
        />
      )}

      {/* Modal de distribución de sesiones */}
      {showDistributionModal && (
        <SessionDistributionModal
          isOpen={showDistributionModal}
          onClose={onCloseDistributionModal}
          onConfirm={onDistributionConfirm}
          config={distributionConfig}
        />
      )}

      {/* Modal de advertencia de fin de semana */}
      {showWeekendWarning && (
        <WeekendWarningModal
          isOpen={showWeekendWarning}
          onClose={onCloseWeekendWarning}
          data={weekendGenerationData}
        />
      )}

      {/* Modal de fin de semana HipertrofiaV2 */}
      {showHpv2WeekendModal && (
        <HipertrofiaWeekendModal
          isOpen={showHpv2WeekendModal}
          onClose={onCloseHpv2WeekendModal}
          onConfirm={onHpv2WeekendConfirm}
          level={pendingLevel}
        />
      )}

      {/* Modal de enfoque HipertrofiaV2 */}
      {showHpv2FocusModal && (
        <HipertrofiaFocusModal
          isOpen={showHpv2FocusModal}
          onClose={onCloseHpv2FocusModal}
          onConfirm={onHpv2FocusConfirm}
          focusGroup={pendingFocusGroup}
        />
      )}
    </>
  );
}

export default MethodologyModalsManager;

