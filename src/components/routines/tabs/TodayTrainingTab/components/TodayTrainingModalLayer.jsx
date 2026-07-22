import { Button } from "@/components/ui/button.jsx";
import { AlertTriangle, RefreshCw } from "lucide-react";

import RoutineSessionModal from "../../../RoutineSessionModal";
import WodSessionModal from "../../../WodSessionModal.jsx";
import HipertrofiaSessionModal from "../../../HipertrofiaSessionModal.jsx";
import WarmupModal from "../../../WarmupModal";
import MusclePriorityModal from "../../../../Methodologie/methodologies/Hipertrofia/components/MusclePriorityModal";
import AdaptationTransitionModal from "../../../../Methodologie/methodologies/Hipertrofia/components/AdaptationTransitionModal";
import EffortModals from "./EffortModals.jsx";

/**
 * Capa presentacional de los modales de la sesión de hoy.
 * Mantiene fuera de TodayTrainingTab el árbol visual sin mover su estado ni reglas.
 */
export default function TodayTrainingModalLayer({
  localState,
  ui,
  session,
  routinePlan,
  plan,
  isHipertrofiaV2,
  todayStatus,
  effectiveSessionId,
  methodologyPlanId,
  planMethodology,
  effectiveSession,
  activeMethodKey,
  effortModal,
  showPriorityModal,
  currentPriority,
  showTransitionModal,
  evaluation,
  updateLocalState,
  handleWarmupComplete,
  handleSkipWarmup,
  handleCloseWarmup,
  handleExerciseUpdate,
  handleCompleteSession,
  handleCloseCancelModal,
  handleCancelPlan,
  handleEffortSubmit,
  handleEffortClose,
  handlePriorityActivate,
  handlePriorityDeactivate,
  setShowPriorityModal,
  setShowTransitionModal,
  resetModal,
  fetchAdaptationProgress,
  navigate,
  onProgressUpdate,
  goToMethodologies
}) {
  const closeSession = () => {
    updateLocalState({ showSessionModal: false, pendingSessionData: null });
    ui.hideModal?.("routineSession");
  };

  return (
    <>
      {(localState.showWarmupModal || ui.showWarmup) &&
        (localState.pendingSessionData?.sessionId || session.sessionId) && (
          <WarmupModal
            level={(routinePlan || plan.currentPlan)?.level || "básico"}
            sessionId={localState.pendingSessionData?.sessionId || session.sessionId}
            onComplete={handleWarmupComplete}
            onSkip={handleSkipWarmup}
            onClose={handleCloseWarmup}
          />
        )}

      {(localState.showSessionModal || ui.showRoutineSession) && (
        isHipertrofiaV2 ? (
          todayStatus?.exercises?.length > 0 && (
            <HipertrofiaSessionModal
              todayStatus={todayStatus}
              sessionId={effectiveSessionId}
              methodologyPlanId={methodologyPlanId}
              metodologia={planMethodology}
              onClose={closeSession}
              onFinishExercise={handleExerciseUpdate}
              onSkipExercise={(exerciseIndex) => handleExerciseUpdate(exerciseIndex, { status: "skipped" })}
              onCancelExercise={(exerciseIndex) => handleExerciseUpdate(exerciseIndex, { status: "cancelled" })}
              onEndSession={handleCompleteSession}
              navigateToRoutines={() => navigate("/routines")}
              onProgressUpdate={onProgressUpdate}
            />
          )
        ) : effectiveSession ? (
          activeMethodKey === "crossfit" ? (
            <WodSessionModal
              isOpen
              session={effectiveSession}
              sessionId={effectiveSessionId}
              onClose={closeSession}
              onFinishExercise={handleExerciseUpdate}
              onCompleteSession={(summary) => {
                handleCompleteSession({ scale: summary?.escala || "rx" });
              }}
            />
          ) : (
            <RoutineSessionModal
              session={effectiveSession}
              sessionId={effectiveSessionId}
              onClose={closeSession}
              onFinishExercise={handleExerciseUpdate}
              onSkipExercise={(exerciseIndex) => handleExerciseUpdate(exerciseIndex, { status: "skipped" })}
              onCancelExercise={(exerciseIndex) => handleExerciseUpdate(exerciseIndex, { status: "cancelled" })}
              onEndSession={handleCompleteSession}
              navigateToRoutines={() => navigate("/routines")}
              onProgressUpdate={onProgressUpdate}
            />
          )
        ) : null
      )}

      {localState.showRejectionModal && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-2xl p-6 max-w-md w-full border border-gray-700">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center w-12 h-12 rounded-full bg-red-100/10 mb-4">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                ¿Cancelar rutina actual?
              </h3>
              <p className="text-gray-400 mb-6">
                Esta acción cancelará tu rutina activa. El progreso realizado se conservará en tu historial,
                pero tendrás que crear una nueva rutina para continuar entrenando.
              </p>
              <div className="flex gap-3 justify-center">
                <Button
                  onClick={handleCloseCancelModal}
                  variant="outline"
                  className="border-gray-600 text-gray-300 hover:bg-gray-700"
                  disabled={ui.isLoading}
                >
                  Mantener rutina
                </Button>
                <Button
                  onClick={handleCancelPlan}
                  className="bg-red-500 hover:bg-red-600 text-white"
                  disabled={ui.isLoading}
                >
                  {ui.isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                      Cancelando...
                    </>
                  ) : (
                    "Sí, cancelar rutina"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <EffortModals
        effortModal={effortModal}
        onSubmit={handleEffortSubmit}
        onClose={handleEffortClose}
      />

      <MusclePriorityModal
        show={showPriorityModal}
        onClose={() => setShowPriorityModal(false)}
        currentPriority={currentPriority}
        onActivate={handlePriorityActivate}
        onDeactivate={handlePriorityDeactivate}
      />

      <AdaptationTransitionModal
        isOpen={showTransitionModal}
        onClose={() => {
          setShowTransitionModal(false);
          resetModal();
        }}
        evaluation={evaluation}
        onTransitionSuccess={() => {
          setShowTransitionModal(false);
          resetModal();
          goToMethodologies?.();
        }}
        onRepeatBlock={() => {
          setShowTransitionModal(false);
          resetModal();
          fetchAdaptationProgress();
        }}
      />
    </>
  );
}
