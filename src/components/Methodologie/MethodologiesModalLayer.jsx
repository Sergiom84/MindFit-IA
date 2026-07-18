import { Button } from '@/components/ui/button.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog.jsx';
import { AlertCircle } from 'lucide-react';
import MethodologyDetailsDialog from './shared/MethodologyDetailsDialog.jsx';
import MethodologyVersionSelectionModal from './shared/MethodologyVersionSelectionModal.jsx';
import TrainingPlanConfirmationModal from '../routines/TrainingPlanConfirmationModal.jsx';
import RoutineSessionModal from '../routines/RoutineSessionModal.jsx';
import WodSessionModal from '../routines/WodSessionModal.jsx';
import WarmupModal from '../routines/WarmupModal.jsx';
import CalisteniaManualCard from './methodologies/CalisteniaManual/CalisteniaManualCard.jsx';
import HeavyDutyManualCard from './methodologies/HeavyDuty/HeavyDutyManualCard.jsx';
import HipertrofiaV2ManualCard from './methodologies/HipertrofiaV2/HipertrofiaV2ManualCard.jsx';
import PowerliftingManualCard from './methodologies/Powerlifting/PowerliftingManualCard.jsx';
import CrossFitManualCard from './methodologies/CrossFit/CrossFitManualCard.jsx';
import FuncionalManualCard from './methodologies/Funcional/FuncionalManualCard.jsx';
import HalterofiliaManualCard from './methodologies/Halterofilia/HalterofiliaManualCard.jsx';
import CasaManualCard from './methodologies/Casa/CasaManualCard.jsx';
import WeekendWarningModal from '../routines/modals/WeekendWarningModal.jsx';
import StartDayConfirmationModal from '../routines/modals/StartDayConfirmationModal.jsx';
import SessionDistributionModal from '../routines/modals/SessionDistributionModal.jsx';
import HipertrofiaWeekendModal from '../routines/modals/HipertrofiaWeekendModal.jsx';
import HipertrofiaFocusModal from '../routines/modals/HipertrofiaFocusModal.jsx';
import CasaEquipmentModal from '../routines/modals/CasaEquipmentModal.jsx';
import EffortModals from './EffortModals.jsx';
import tokenManager from '../../utils/tokenManager.js';
import { getApiBaseUrl } from '../../config/api.js';

const API_URL = getApiBaseUrl();

export default function MethodologiesModalLayer({
  ui,
  userData,
  localState,
  updateLocalState,
  handleManualCardClick,
  handleVersionSelectionConfirm,
  confirmManualSelection,
  handleCalisteniaManualGenerate,
  handleHeavyDutyManualGenerate,
  handleHipertrofiaV2ManualGenerate,
  handlePowerliftingManualGenerate,
  handleCrossFitManualGenerate,
  handleFuncionalManualGenerate,
  handleHalterofíliaManualGenerate,
  handleCasaManualGenerate,
  plan,
  isConfirmingPlan,
  handleSavePlan,
  handleStartTraining,
  handleGenerateAnother,
  handleWarmupComplete,
  handleSkipWarmup,
  handleCloseWarmup,
  session,
  sessionData,
  setSessionData,
  updateExercise,
  handleEndSession,
  goToTraining,
  navigate,
  handleWeekendContinueRegular,
  handleWeekendFullBody,
  user,
  handleHipertrofiaWeekendAccept,
  handleHipertrofiaWeekendLater,
  closeHipertrofiaWeekendModals,
  getUserLevel,
  handleHipertrofiaFullBodyAdvanced,
  handleHipertrofiaFocusGroup,
  handleHipertrofiaPreferenceMode,
  handleCasaEquipmentConfirm,
  CALISTENIA_FOCUS_GROUPS,
  CROSSFIT_FOCUS_GROUPS,
  CASA_FOCUS_GROUPS,
  FUNCIONAL_FOCUS_GROUPS,
  HALTEROFILIA_FOCUS_GROUPS,
  POWERLIFTING_FOCUS_GROUPS,
  HEAVY_DUTY_FOCUS_GROUPS,
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
  finishCasaEffort,
  handleStartDayConfirm,
  handleDistributionConfirm,
  clearPendingPlanAction,
  handleActivePlanGoToPlan,
  handleActivePlanCancelAndContinue
}) {
  return (
    <>
      {/* =============================================== */}
      {/* 🎭 MODALES */}
      {/* =============================================== */}

      {/* Modal de detalles de metodología */}
      <MethodologyDetailsDialog
        open={ui.showMethodologyDetails}
        onOpenChange={(show) => show ? ui.showModal('methodologyDetails') : ui.hideModal('methodologyDetails')}
        detailsMethod={localState.detailsMethod}
        selectionMode={localState.selectionMode}
        onClose={() => ui.hideModal('methodologyDetails')}
        onSelect={handleManualCardClick}
      />

      {/* Modal de selección de versión */}
      <MethodologyVersionSelectionModal
        isOpen={ui.showVersionSelection}
        onClose={() => {
          ui.hideModal('versionSelection');
          updateLocalState({ versionSelectionData: null });
        }}
        onConfirm={localState.versionSelectionData?.isAutomatic ? handleVersionSelectionConfirm : confirmManualSelection}
        userProfile={{...userData, ...user}}
        isAutomatic={localState.versionSelectionData?.isAutomatic}
        selectedMethodology={localState.versionSelectionData?.selectedMethodology}
      />

      {/* Modal de advertencia de entrenamiento activo */}
      {ui.showActiveTrainingWarning && (
        <Dialog open={ui.showActiveTrainingWarning} onOpenChange={() => ui.hideModal('activeTrainingWarning')}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-orange-500" />
                <DialogTitle>Entrenamiento en Marcha</DialogTitle>
              </div>
              <DialogDescription>
                Tienes un entrenamiento activo. Si generas un nuevo entrenamiento, perderás el progreso actual.
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="flex gap-2 sm:gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  ui.hideModal('activeTrainingWarning');
                  goToTraining();
                }}
              >
                Continuar Entrenamiento
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  ui.hideModal('activeTrainingWarning');
                  ui.showModal('versionSelection');
                }}
              >
                Crear Nuevo Entrenamiento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de Calistenia Manual */}
      {ui.showCalisteniaManual && (
        <Dialog open={ui.showCalisteniaManual} onOpenChange={() => ui.hideModal('calisteniaManual')}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="sr-only">
              <DialogTitle>Calistenia Manual</DialogTitle>
            </DialogHeader>
            <CalisteniaManualCard
              onGenerate={handleCalisteniaManualGenerate}
              isLoading={ui.isLoading}
              error={ui.error}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de Heavy Duty Manual */}
      {ui.showHeavyDutyManual && (
        <Dialog open={ui.showHeavyDutyManual} onOpenChange={() => ui.hideModal('heavyDutyManual')}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="sr-only">
              <DialogTitle>Heavy Duty Manual</DialogTitle>
            </DialogHeader>
            <HeavyDutyManualCard
              onGenerate={handleHeavyDutyManualGenerate}
              isLoading={ui.isLoading}
              error={ui.error}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de Hipertrofia V2 Manual */}
      {ui.showHipertrofiaV2Manual && (
        <Dialog open={ui.showHipertrofiaV2Manual} onOpenChange={() => ui.hideModal('hipertrofiaV2Manual')}>
          <DialogContent className="w-[95vw] max-w-[95vw] mx-auto sm:max-w-4xl max-h-[90vh] overflow-y-auto pb-[calc(7rem+env(safe-area-inset-bottom))] sm:pb-6">
            <DialogHeader className="sr-only">
              <DialogTitle>Hipertrofia - Tracking RIR</DialogTitle>
            </DialogHeader>
            <HipertrofiaV2ManualCard
              onGenerate={handleHipertrofiaV2ManualGenerate}
              isLoading={ui.isLoading}
              error={ui.error}
              startConfig={localState.startConfig}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de Powerlifting Manual */}
      {ui.showPowerliftingManual && (
        <Dialog open={ui.showPowerliftingManual} onOpenChange={() => ui.hideModal('powerliftingManual')}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="sr-only">
              <DialogTitle>Powerlifting Manual</DialogTitle>
            </DialogHeader>
            <PowerliftingManualCard
              onGenerate={handlePowerliftingManualGenerate}
              isLoading={ui.isLoading}
              error={ui.error}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de CrossFit Manual */}
      {ui.showCrossFitManual && (
        <Dialog open={ui.showCrossFitManual} onOpenChange={() => ui.hideModal('crossfitManual')}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="sr-only">
              <DialogTitle>CrossFit Manual</DialogTitle>
            </DialogHeader>
            <CrossFitManualCard
              onGenerate={handleCrossFitManualGenerate}
              isLoading={ui.isLoading}
              error={ui.error}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de Funcional Manual */}
      {ui.showFuncionalManual && (
        <Dialog open={ui.showFuncionalManual} onOpenChange={() => ui.hideModal('funcionalManual')}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="sr-only">
              <DialogTitle>Entrenamiento Funcional Manual</DialogTitle>
            </DialogHeader>
            <FuncionalManualCard
              onGenerate={handleFuncionalManualGenerate}
              isLoading={ui.isLoading}
              error={ui.error}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de Halterofilia Manual */}
      {ui.showHalterofíliaManual && (
        <Dialog open={ui.showHalterofíliaManual} onOpenChange={() => ui.hideModal('halterofíliaManual')}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="sr-only">
              <DialogTitle>Halterofilia Manual</DialogTitle>
            </DialogHeader>
            <HalterofiliaManualCard
              onGenerate={handleHalterofíliaManualGenerate}
              isLoading={ui.isLoading}
              error={ui.error}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de Entrenamiento en Casa Manual */}
      {ui.showCasaManual && (
        <Dialog open={ui.showCasaManual} onOpenChange={() => ui.hideModal('casaManual')}>
          <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="sr-only">
              <DialogTitle>Entrenamiento en Casa Manual</DialogTitle>
            </DialogHeader>
            <CasaManualCard
              onGenerate={handleCasaManualGenerate}
              isLoading={ui.isLoading}
              error={ui.error}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de confirmación del plan */}
      <TrainingPlanConfirmationModal
        isOpen={ui.showPlanConfirmation}
        onClose={() => ui.hideModal('planConfirmation')}
        onStartTraining={handleStartTraining}
        onSavePlan={handleSavePlan}
        onGenerateAnother={handleGenerateAnother}
        plan={plan.currentPlan}
        planId={plan.methodologyPlanId}
        methodology={plan.methodology}
        startConfig={localState.startConfig}
        isLoading={ui.isLoading}
        error={ui.error}
        isConfirming={isConfirmingPlan}
      />

      {/* Modal de calentamiento */}
      {ui.showWarmup && session.sessionId && (
        <WarmupModal
          sessionId={session.sessionId}
          level={plan.currentPlan?.level || 'básico'}
          onComplete={handleWarmupComplete}
          onSkip={handleSkipWarmup}
          onClose={handleCloseWarmup}
        />
      )}

      {/* Modal de sesión de rutina (render condicional estricto) */}
      {ui.showRoutineSession && session.sessionId && sessionData && sessionData.ejercicios && (
        <RoutineSessionModal
          isOpen={ui.showRoutineSession}
          session={sessionData}
          sessionId={session.sessionId}
          onClose={() => {
            ui.hideModal('routineSession');
            setSessionData(null); // Limpiar datos de sesión al cerrar
          }}
          onFinishExercise={async (exerciseIndex, progressData) => {
            // 🌟 Verificar si es sesión de fin de semana (check both flags)
            const isWeekend = sessionData?.isWeekendExtra || sessionData?.session_type === 'weekend-extra';
            if (isWeekend) {
              console.log('🌟 Sesión weekend detectada, usando endpoint correcto');
              const sid = session.sessionId;
              const exerciseOrder = exerciseIndex + 1;
              try {
                await fetch(`${API_URL}/api/training-session/progress/methodology/${sid}/${exerciseOrder}`, {
                  method: 'PUT',
                  headers: {
                    'Authorization': `Bearer ${tokenManager.getToken()}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    status: progressData.status || 'completed',
                    series_completed: progressData.series_completed || 0,
                    time_spent_seconds: progressData.time_spent_seconds || 0
                  })
                });
              } catch (error) {
                console.error('❌ Error actualizando ejercicio weekend:', error);
              }
            } else {
              updateExercise(exerciseIndex, progressData);
            }
          }}
          onSkipExercise={async (exerciseIndex, progressData) => {
            // 🌟 Verificar si es sesión de fin de semana (check both flags)
            const isWeekend = sessionData?.isWeekendExtra || sessionData?.session_type === 'weekend-extra';
            if (isWeekend) {
              const sid = session.sessionId;
              const exerciseOrder = exerciseIndex + 1;
              try {
                await fetch(`${API_URL}/api/training-session/progress/methodology/${sid}/${exerciseOrder}`, {
                  method: 'PUT',
                  headers: {
                    'Authorization': `Bearer ${tokenManager.getToken()}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    status: 'skipped',
                    series_completed: 0,
                    time_spent_seconds: 0
                  })
                });
              } catch (error) {
                console.error('❌ Error actualizando ejercicio weekend:', error);
              }
            } else {
              updateExercise(exerciseIndex, progressData);
            }
          }}
          onCancelExercise={async (exerciseIndex, progressData) => {
            // 🌟 Verificar si es sesión de fin de semana (check both flags)
            const isWeekend = sessionData?.isWeekendExtra || sessionData?.session_type === 'weekend-extra';
            if (isWeekend) {
              const sid = session.sessionId;
              const exerciseOrder = exerciseIndex + 1;
              try {
                await fetch(`${API_URL}/api/training-session/progress/methodology/${sid}/${exerciseOrder}`, {
                  method: 'PUT',
                  headers: {
                    'Authorization': `Bearer ${tokenManager.getToken()}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    status: 'cancelled',
                    series_completed: 0,
                    time_spent_seconds: 0
                  })
                });
              } catch (error) {
                console.error('❌ Error actualizando ejercicio weekend:', error);
              }
            } else {
              updateExercise(exerciseIndex, progressData);
            }
          }}
          onEndSession={handleEndSession}
          navigateToRoutines={() => navigate('/routines')}
        />
      )}

      {/* Modal de advertencia de fin de semana */}
      <WeekendWarningModal
        isOpen={localState.showWeekendWarning}
        onClose={() => updateLocalState({ showWeekendWarning: false, weekendGenerationData: null })}
        onConfirm={handleWeekendContinueRegular}
        onFullBody={handleWeekendFullBody}
        nivel={localState.weekendGenerationData?.nivel || user?.nivel || 'Principiante'}
      />

      {/* Flujo single-day de fin de semana (HipertrofiaV2 / Calistenia) */}
      <HipertrofiaWeekendModal
        isOpen={localState.showHpv2WeekendModal}
        dayName={new Date().toLocaleDateString('es-ES', { weekday: 'long' })}
        onAccept={handleHipertrofiaWeekendAccept}
        onLater={handleHipertrofiaWeekendLater}
        onClose={closeHipertrofiaWeekendModals}
        isLoading={localState.isGeneratingSingleDay}
        methodologyName={
          localState.pendingMethodology?.name === 'Calistenia' ? 'Calistenia'
            : localState.pendingMethodology?.name === 'CrossFit' ? 'CrossFit'
            : localState.pendingMethodology?.name === 'Entrenamiento en Casa' ? 'Entrenamiento en Casa'
            : localState.pendingMethodology?.name === 'Funcional' ? 'Funcional'
            : localState.pendingMethodology?.name === 'Halterofilia' ? 'Halterofilia'
            : localState.pendingMethodology?.name === 'Powerlifting' ? 'Powerlifting'
            : localState.pendingMethodology?.name === 'Heavy Duty' ? 'Heavy Duty'
            : 'Hipertrofia'
        }
      />
      <HipertrofiaFocusModal
        isOpen={localState.showHpv2FocusModal}
        nivel={localState.pendingLevel || getUserLevel()}
        onFullBody={handleHipertrofiaFullBodyAdvanced}
        onSelectGroup={handleHipertrofiaFocusGroup}
        onSelectPreference={handleHipertrofiaPreferenceMode}
        onClose={closeHipertrofiaWeekendModals}
        isLoading={localState.isGeneratingSingleDay}
        muscleGroups={
          // Principiante: sin foco muscular (solo Full Body + preferencias)
          (localState.pendingLevel || getUserLevel()) === 'Principiante' ? []
            : localState.pendingMethodology?.name === 'Calistenia' ? CALISTENIA_FOCUS_GROUPS
            : localState.pendingMethodology?.name === 'CrossFit' ? CROSSFIT_FOCUS_GROUPS
            : localState.pendingMethodology?.name === 'Entrenamiento en Casa' ? CASA_FOCUS_GROUPS
            : localState.pendingMethodology?.name === 'Funcional' ? FUNCIONAL_FOCUS_GROUPS
            : localState.pendingMethodology?.name === 'Halterofilia' ? HALTEROFILIA_FOCUS_GROUPS
            : localState.pendingMethodology?.name === 'Powerlifting' ? POWERLIFTING_FOCUS_GROUPS
            : localState.pendingMethodology?.name === 'Heavy Duty' ? HEAVY_DUTY_FOCUS_GROUPS
            : undefined
        }
      />

      {/* Selección de material para Entrenamiento en Casa (single-day) */}
      <CasaEquipmentModal
        isOpen={localState.showCasaEquipmentModal}
        isLoading={localState.isGeneratingSingleDay}
        onConfirm={handleCasaEquipmentConfirm}
        onClose={closeHipertrofiaWeekendModals}
      />

      {/* Modales de autorregulación por disciplina (extraído en ARCH-002) */}
      <EffortModals
        localState={localState}
        handlers={{
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
        }}
      />

      {/* Modal de calentamiento para entrenamiento de fin de semana */}
      {localState.showWarmupModal && localState.pendingSessionData && (
        <WarmupModal
          sessionId={localState.pendingSessionData.sessionId}
          level={localState.pendingSessionData.nivel || 'Principiante'}
          onComplete={() => {
            console.log('🔥 Calentamiento completado, mostrando RoutineSessionModal');
            updateLocalState({
              showWarmupModal: false,
              showRoutineSessionModal: true
            });
          }}
          onSkip={() => {
            console.log('⏭️ Calentamiento saltado, mostrando RoutineSessionModal');
            updateLocalState({
              showWarmupModal: false,
              showRoutineSessionModal: true
            });
          }}
          onClose={() => {
            console.log('❌ Modal de calentamiento cerrado');
            updateLocalState({
              showWarmupModal: false,
              pendingSessionData: null
            });
          }}
        />
      )}

      {/* Reproductor de WOD (CrossFit) para entrenamiento de fin de semana */}
      {localState.showRoutineSessionModal && localState.pendingSessionData && localState.pendingSessionData.discipline === 'crossfit' && (
        <WodSessionModal
          isOpen={localState.showRoutineSessionModal}
          session={localState.pendingSessionData}
          sessionId={localState.pendingSessionData.sessionId}
          onClose={() => updateLocalState({ showRoutineSessionModal: false, pendingSessionData: null })}
          onFinishExercise={async (exerciseIndex, progressData) => {
            const sid = localState.pendingSessionData?.sessionId;
            if (!sid) return;
            const exerciseOrder = exerciseIndex + 1;
            try {
              await fetch(`${API_URL}/api/training-session/progress/methodology/${sid}/${exerciseOrder}`, {
                method: 'PUT',
                headers: {
                  'Authorization': `Bearer ${tokenManager.getToken()}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  status: progressData.status || 'completed',
                  series_completed: progressData.series_completed || 0,
                  time_spent_seconds: progressData.time_spent_seconds || 0
                })
              });
            } catch (error) {
              console.error('❌ Error guardando movimiento WOD:', error);
            }
          }}
          onCompleteSession={(summary) => {
            console.log('🎉 WOD completado:', summary);
            // Autorregulación: pedir RPE/escala/resultado antes de cerrar (mantener pendingSessionData).
            updateLocalState({
              showRoutineSessionModal: false,
              showCrossfitEffort: true,
              crossfitDecision: null,
              crossfitWodScale: summary?.escala || 'rx'
            });
          }}
        />
      )}

      {/* Modal de sesión de rutina para entrenamiento de fin de semana */}
      {localState.showRoutineSessionModal && localState.pendingSessionData && localState.pendingSessionData.discipline !== 'crossfit' && (
        <RoutineSessionModal
          isOpen={localState.showRoutineSessionModal}
          session={localState.pendingSessionData}
          sessionId={localState.pendingSessionData.sessionId}
          onClose={() => {
            console.log('❌ Modal de sesión cerrado');
            updateLocalState({
              showRoutineSessionModal: false,
              pendingSessionData: null
            });
          }}
          onFinishExercise={async (exerciseIndex, progressData) => {
            console.log('✅ Ejercicio completado:', exerciseIndex, progressData);
            const sid = localState.pendingSessionData?.sessionId;
            if (sid) {
              // El exerciseIndex viene base 0, pero en BD es base 1
              const exerciseOrder = exerciseIndex + 1;
              console.log(`📝 Guardando ejercicio ${exerciseOrder} (index ${exerciseIndex})`);
              try {
                await fetch(`${API_URL}/api/training-session/progress/methodology/${sid}/${exerciseOrder}`, {
                  method: 'PUT',
                  headers: {
                    'Authorization': `Bearer ${tokenManager.getToken()}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    status: progressData.status || 'completed',
                    series_completed: progressData.series_completed || 0,
                    time_spent_seconds: progressData.time_spent_seconds || 0
                  })
                });
                console.log('✅ Progreso guardado en BD');
              } catch (error) {
                console.error('❌ Error guardando progreso:', error);
              }
            }
          }}
          onSkipExercise={async (exerciseIndex, progressData) => {
            console.log('⏭️ Ejercicio saltado:', exerciseIndex, progressData);
            const sid = localState.pendingSessionData?.sessionId;
            if (sid) {
              const exerciseOrder = exerciseIndex + 1;
              console.log(`⏭️ Saltando ejercicio ${exerciseOrder} (index ${exerciseIndex})`);
              try {
                await fetch(`${API_URL}/api/training-session/progress/methodology/${sid}/${exerciseOrder}`, {
                  method: 'PUT',
                  headers: {
                    'Authorization': `Bearer ${tokenManager.getToken()}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    status: 'skipped',
                    series_completed: 0,
                    time_spent_seconds: progressData.time_spent_seconds || 0
                  })
                });
                console.log('⏭️ Ejercicio saltado guardado en BD');
              } catch (error) {
                console.error('❌ Error guardando skip:', error);
              }
            }
          }}
          onCancelExercise={async (exerciseIndex, progressData) => {
            console.log('❌ Ejercicio cancelado:', exerciseIndex, progressData);
            const sid = localState.pendingSessionData?.sessionId;
            if (sid) {
              const exerciseOrder = exerciseIndex + 1;
              console.log(`❌ Cancelando ejercicio ${exerciseOrder} (index ${exerciseIndex})`);
              try {
                await fetch(`${API_URL}/api/training-session/progress/methodology/${sid}/${exerciseOrder}`, {
                  method: 'PUT',
                  headers: {
                    'Authorization': `Bearer ${tokenManager.getToken()}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    status: 'cancelled',
                    series_completed: 0,
                    time_spent_seconds: progressData.time_spent_seconds || 0
                  })
                });
                console.log('❌ Ejercicio cancelado guardado en BD');
              } catch (error) {
                console.error('❌ Error guardando cancelación:', error);
              }
            }
          }}
          onCompleteSession={(sessionSummary) => {
            console.log('🎉 Sesión completada:', sessionSummary);
            const methodologyName = localState.pendingMethodology?.name;
            if (methodologyName === 'Calistenia') {
              // Autorregulación: pedir RIR/cumplimiento antes de cerrar (mantener pendingSessionData).
              updateLocalState({
                showRoutineSessionModal: false,
                showCalisteniaEffort: true,
                autoregDecision: null
              });
            } else if (methodologyName === 'Halterofilia') {
              // Autorregulación de fuerza: pedir RPE/carga/técnica antes de cerrar.
              updateLocalState({
                showRoutineSessionModal: false,
                showHalterofiliaEffort: true,
                halterofiliaDecision: null
              });
            } else if (methodologyName === 'Powerlifting') {
              // Autorregulación de fuerza máxima: pedir RPE/carga/técnica antes de cerrar.
              updateLocalState({
                showRoutineSessionModal: false,
                showPowerliftingEffort: true,
                powerliftingDecision: null
              });
            } else if (methodologyName === 'Funcional') {
              // Autorregulación: pedir RIR/cumplimiento antes de cerrar (mantener pendingSessionData).
              updateLocalState({
                showRoutineSessionModal: false,
                showFuncionalEffort: true,
                funcionalDecision: null
              });
            } else if (methodologyName === 'Entrenamiento en Casa') {
              // Autorregulación: pedir RIR/cumplimiento antes de cerrar (mantener pendingSessionData).
              updateLocalState({
                showRoutineSessionModal: false,
                showCasaEffort: true,
                casaDecision: null
              });
            } else if (methodologyName === 'Heavy Duty') {
              // Autorregulación HIT (fallo/carga): pedir fallo + tope de rango antes de cerrar.
              updateLocalState({
                showRoutineSessionModal: false,
                showHeavyDutyEffort: true,
                heavyDutyDecision: null
              });
            } else {
              updateLocalState({ showRoutineSessionModal: false, pendingSessionData: null });
              navigate('/routines', { state: { activeTab: 'today' } });
            }
          }}
        />
      )}

      {/* 🆕 Modal de Día de Inicio */}
      <StartDayConfirmationModal
        isOpen={localState.showStartDayModal}
        onClose={() => updateLocalState({ showStartDayModal: false, pendingMethodology: null })}
        onConfirm={handleStartDayConfirm}
        methodology={localState.pendingMethodology?.name || ''}
      />

      {/* 🆕 Modal de Distribución de Sesiones */}
      <SessionDistributionModal
        isOpen={localState.showDistributionModal}
        onClose={() => updateLocalState({ showDistributionModal: false, distributionConfig: null })}
        onConfirm={handleDistributionConfirm}
        config={localState.distributionConfig}
      />

      {/* Modal de advertencia de plan activo */}
      {ui.showActivePlanWarning && (
        <Dialog
          open={ui.showActivePlanWarning}
          onOpenChange={(open) => {
            if (!open) {
              clearPendingPlanAction();
              ui.hideModal('activePlanWarning');
            }
          }}
        >
          <DialogContent className="sm:max-w-md bg-neutral-900/95 border border-white/10 ring-1 ring-white/5 text-white shadow-2xl backdrop-blur-xl">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 shrink-0 aspect-square rounded-full border border-orange-400/30 bg-orange-500/10 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-orange-300" />
                </div>
                <div>
                  <DialogTitle className="font-urbanist text-lg">Plan activo detectado</DialogTitle>
                  <DialogDescription className="text-gray-300/80">
                    Ya tienes un plan activo. Si generas uno nuevo, el plan actual se cancelará y quedará en tu histórico.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                className="border-white/10 text-gray-200/80 hover:bg-white/10"
                onClick={handleActivePlanGoToPlan}
              >
                Ir a mi plan
              </Button>
              <Button
                className="bg-gradient-to-r from-red-500 via-red-500 to-orange-500 text-white hover:from-red-400 hover:to-orange-400 shadow-[0_12px_30px_-18px_rgba(248,113,113,0.65)]"
                onClick={handleActivePlanCancelAndContinue}
              >
                Generar nuevo y cancelar anterior
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
