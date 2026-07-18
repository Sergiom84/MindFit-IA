import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserContext } from '@/contexts/UserContext';
import { useWorkout } from '@/contexts/WorkoutContext';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Alert, AlertDescription } from '@/components/ui/alert.jsx';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group.jsx';
import { Label } from '@/components/ui/label.jsx';
import { Settings, Brain, User as UserIcon, AlertCircle, Zap } from 'lucide-react';
import { METHODOLOGIES } from './methodologiesData.js';
import { LOCAL_STATE_INITIAL, formatLocalDate } from './MethodologiesScreen.helpers.js';
import { useMousePosition } from './hooks/useMousePosition.js';
import { useTrace } from '@/contexts/TraceContext';
import { useNavigate } from 'react-router-dom';

// 🎯 HOOKS MODULARES - Refactorización incremental
import { useMethodologyValidation } from './hooks/useMethodologyValidation';
import { useMethodologyEffortActions } from './hooks/useMethodologyEffortActions.js';
import { useManualPlanGeneration } from './hooks/useManualPlanGeneration.js';
import { useMethodologySelectionActions } from './hooks/useMethodologySelectionActions.js';
import { useMethodologyPlanLifecycle } from './hooks/useMethodologyPlanLifecycle.js';
import { useSingleDayMethodologyActions } from './hooks/useSingleDayMethodologyActions.js';

// 🎯 CONFIG Y SUBCOMPONENTES EXTRAÍDOS (ARCH-002)
import MethodologyCard from './MethodologyCard.jsx';
import MethodologiesModalLayer from './MethodologiesModalLayer.jsx';
import {
  CALISTENIA_FOCUS_GROUPS,
  CROSSFIT_FOCUS_GROUPS,
  CASA_FOCUS_GROUPS,
  FUNCIONAL_FOCUS_GROUPS,
  HALTEROFILIA_FOCUS_GROUPS,
  POWERLIFTING_FOCUS_GROUPS,
  HEAVY_DUTY_FOCUS_GROUPS
} from './MethodologiesScreen.focusGroups.js';


export default function MethodologiesScreen() {
  const { user } = useAuth();
  const { userData } = useUserContext();
  const navigate = useNavigate();
  const mousePosition = useMousePosition();

  // ===============================================
  // 🛡️ FUNCIONES DE VALIDACIÓN - Hook modular
  // ===============================================
  const {
    isWeekend,
    shouldShowStartDayModal,
    shouldShowDistributionModal,
    getUserLevel,
    validatePlanData,
    userLevel
  } = useMethodologyValidation();

  // ===============================================
  // 🚀 INTEGRACIÓN CON WorkoutContext
  // ===============================================

  const {
    // Estado unificado
    plan,
    session,
    ui,

    // Acciones de plan
    generatePlan,
    activatePlan,
    cancelPlan,
    updatePlan,

    // Acciones de sesión
    startSession,
    updateExercise,

    // Navegación
    goToTraining,

    // Utilidades
    hasActivePlan,

    // 🚀 NEW: Supabase Integration
    hasActivePlanFromDB,
    syncWithDatabase
  } = useWorkout();
  const { track } = useTrace();


  // Estado local mínimo para datos específicos de esta pantalla
  const [localState, setLocalState] = useState(LOCAL_STATE_INITIAL);
  const [sessionData, setSessionData] = useState(null); // 🔥 Datos de la sesión con ejercicios

  const [isConfirmingPlan, setIsConfirmingPlan] = useState(false);

  const getNextMondayDate = useCallback(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilMonday = (8 - dayOfWeek) % 7;
    const offsetDays = daysUntilMonday === 0 ? 7 : daysUntilMonday;
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + offsetDays);
    nextMonday.setHours(0, 0, 0, 0);
    return nextMonday;
  }, []);

  const buildStartConfigPayload = useCallback(() => {
    if (!localState.startConfig) return null;

    const base = localState.startConfig;
    let resolvedDate = null;
    const rawStart = base.startDate;

    if (rawStart === 'next_monday') {
      resolvedDate = getNextMondayDate();
    } else if (rawStart === 'today') {
      resolvedDate = new Date();
    } else if (rawStart) {
      const parsed = new Date(rawStart);
      if (!Number.isNaN(parsed.getTime())) {
        resolvedDate = parsed;
      }
    }

    if (resolvedDate) {
      resolvedDate.setHours(0, 0, 0, 0);
    }

    return {
      startDate: rawStart,
      startDateLocal: resolvedDate ? formatLocalDate(resolvedDate) : null,
      sessionsFirstWeek: base.sessionsFirstWeek ?? null,
      distributionOption: base.distributionOption ?? null,
      includeSaturdays: base.includeSaturdays ?? null,
      startDayOfWeek: base.startDayOfWeek ?? null
    };
  }, [localState.startConfig, getNextMondayDate]);

  useEffect(() => {
    if (!ui.showPlanConfirmation) return;
    if (!plan?.methodologyPlanId || !localState.startConfig) return;
    if (localState.startConfig.startDate !== 'next_monday') return;

    const nextMonday = getNextMondayDate();
    const currentStart = plan.planStartDate ? new Date(plan.planStartDate) : null;
    const currentKey = currentStart ? currentStart.toDateString() : null;
    const nextKey = nextMonday.toDateString();

    if (currentKey !== nextKey) {
      updatePlan({ planStartDate: nextMonday.toISOString() });
    }
  }, [plan?.methodologyPlanId, plan?.planStartDate, localState.startConfig, ui.showPlanConfirmation, getNextMondayDate, updatePlan]);

  const updateLocalState = useCallback((updates) => {
    setLocalState(prev => ({ ...prev, ...updates }));
  }, []);
  // Trace: cambios de estado de modales relevantes
  const modalPrevRef = useRef({});
  useEffect(() => {
    try {
      const current = {
        methodologyDetails: ui.showMethodologyDetails,
        versionSelection: ui.showVersionSelection,
        activeTrainingWarning: ui.showActiveTrainingWarning,
        activePlanWarning: ui.showActivePlanWarning,
        planConfirmation: ui.showPlanConfirmation,
        warmup: ui.showWarmup,
        routineSession: ui.showRoutineSession,
      };
      const prev = modalPrevRef.current || {};
      Object.entries(current).forEach(([key, val]) => {
        if (prev[key] !== val) {
          track(val ? 'MODAL_OPEN' : 'MODAL_CLOSE', { name: key }, { component: 'MethodologiesScreen' });
        }
      });
      modalPrevRef.current = current;
    } catch (e) { console.warn('Track error:', e); }
  }, [ui.showMethodologyDetails, ui.showVersionSelection, ui.showActiveTrainingWarning, ui.showActivePlanWarning, ui.showPlanConfirmation, ui.showWarmup, ui.showRoutineSession]);

  const {
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
  } = useMethodologySelectionActions({
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
  });

  const {
    handleCalisteniaManualGenerate,
    handleHeavyDutyManualGenerate,
    handleHipertrofiaV2ManualGenerate,
    handlePowerliftingManualGenerate,
    handleCrossFitManualGenerate,
    handleFuncionalManualGenerate,
    handleHalterofíliaManualGenerate,
    handleCasaManualGenerate
  } = useManualPlanGeneration({
    ui,
    track,
    generatePlan,
    validatePlanData,
    runWithActivePlanGuard,
    isWeekend,
    getUserLevel,
    userData,
    updateLocalState
  });

  const {
    handleSavePlan,
    handleStartTraining,
    handleWarmupComplete,
    handleSkipWarmup,
    handleCloseWarmup,
    handleEndSession,
    handleGenerateAnother,
    handleWeekendContinueRegular,
    handleWeekendFullBody
  } = useMethodologyPlanLifecycle({
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
  });

  const {
    closeHipertrofiaWeekendModals,
    handleHipertrofiaPreferenceMode,
    handleHipertrofiaWeekendAccept,
    handleCasaEquipmentConfirm,
    handleHipertrofiaWeekendLater,
    handleHipertrofiaFullBodyAdvanced,
    handleHipertrofiaFocusGroup
  } = useSingleDayMethodologyActions({
    localState,
    updateLocalState,
    ui,
    getUserLevel,
    proceedWithMethodologySelection
  });

  const {
    handleCalisteniaEffortSubmit,
    finishCalisteniaEffort,
    handleFuncionalEffortSubmit,
    finishFuncionalEffort,
    handleCasaEffortSubmit,
    finishCasaEffort,
    handleCrossfitEffortSubmit,
    finishCrossfitEffort,
    handleHalterofiliaEffortSubmit,
    finishHalterofiliaEffort,
    handlePowerliftingEffortSubmit,
    finishPowerliftingEffort,
    handleHeavyDutyEffortSubmit,
    finishHeavyDutyEffort
  } = useMethodologyEffortActions({ localState, updateLocalState, navigate });

  // ===============================================
  // 🎨 RENDER
  // ===============================================

  return (
    <div className="min-h-screen bg-[#050506] text-white relative overflow-hidden font-body">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[url('/assets/tech-lux/bg-tech-lux-mobile.jpg')] sm:bg-[url('/assets/tech-lux/bg-tech-lux-desktop.jpg')] bg-cover bg-center opacity-80 sm:opacity-70" />
        <div className="absolute inset-0 bg-[url('/assets/tech-lux/texture-tech-lux-tile.jpg')] bg-repeat opacity-20 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/80 sm:from-black/40 sm:via-black/60 sm:to-black" />
        <div className="absolute -top-24 right-0 h-60 w-60 bg-yellow-400/10 blur-[140px]" />
        <div className="absolute top-1/3 -left-16 h-72 w-72 bg-yellow-400/10 blur-[160px]" />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(250, 204, 21, 0.18), transparent 60%)`
          }}
        />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-8">
        <div className="space-y-10">
          <header className="space-y-3">
            <p className="text-xs uppercase tracking-[0.4em] text-yellow-200/80">Metodologías</p>
            <h1 className="text-4xl md:text-5xl font-semibold font-urbanist">
              Metodologías de Entrenamiento
            </h1>
            <p className="text-gray-200/80 max-w-2xl">
              Elige IA automática o modo manual para crear un plan alineado con tu perfil.
            </p>
          </header>

          {ui.error && (
            <Alert className="bg-red-900/30 border-red-400/40">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <AlertDescription className="text-red-200">{ui.error}</AlertDescription>
            </Alert>
          )}

          <Card className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg">
            <div className="p-5">
              <div className="flex items-center gap-2">
                <Settings className="text-yellow-300" />
                <span className="text-white font-urbanist text-lg">Modo de selección</span>
              </div>
              <div className="text-gray-200/70 mt-1">
                Decide si prefieres la recomendación automática o seleccionar la metodología tú mismo.
              </div>

              <div className="grid md:grid-cols-2 gap-4 mt-5">
                <div
                  onClick={() => { updateLocalState({ selectionMode: 'auto' }); try { track('CARD_CLICK', { id: 'selection-mode', value: 'auto' }, { component: 'MethodologiesScreen' }); } catch (e) { console.warn('Track error:', e); } }}
                  className={`p-4 rounded-xl transition-all bg-white/5 cursor-pointer border backdrop-blur
                ${localState.selectionMode === 'auto'
                    ? 'border-yellow-400/50 ring-2 ring-yellow-400/20 shadow-[0_20px_40px_-30px_rgba(250,204,21,0.6)]'
                    : 'border-white/10 hover:border-yellow-400/30'}`}
                >
                  <div className="flex items-start gap-3">
                    <RadioGroup
                      value={localState.selectionMode}
                      onValueChange={(mode) => updateLocalState({ selectionMode: mode })}
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="auto" id="auto" />
                        <Label htmlFor="auto" className="text-white font-semibold flex items-center gap-2">
                          <Brain className="w-4 h-4 text-yellow-300" />
                          Automático (Recomendado)
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <p className="text-gray-300 text-sm mt-2">La IA elige la mejor metodología para tu perfil.</p>
                  {localState.selectionMode === 'auto' && (
                    <div className="mt-4">
                      <Button
                        onClick={() => handleActivateIA(null)}
                        disabled={ui.isLoading}
                        className="bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
                      >
                        <Zap className={`w-4 h-4 mr-2 ${ui.isLoading ? 'animate-pulse' : ''}`} />
                        {ui.isLoading ? 'Procesando…' : 'Activar IA'}
                      </Button>
                    </div>
                  )}
                </div>

                <div
                  onClick={() => { updateLocalState({ selectionMode: 'manual' }); try { track('CARD_CLICK', { id: 'selection-mode', value: 'manual' }, { component: 'MethodologiesScreen' }); } catch (e) { console.warn('Track error:', e); } }}
                  className={`p-4 rounded-xl transition-all cursor-pointer bg-white/5 border backdrop-blur
                ${localState.selectionMode === 'manual'
                    ? 'border-yellow-400/50 ring-2 ring-yellow-400/20 shadow-[0_20px_40px_-30px_rgba(250,204,21,0.6)]'
                    : 'border-white/10 hover:border-yellow-400/30'}`}
                  title="Pulsa para activar el modo manual y luego elige una metodología"
                >
                  <div className="flex items-start gap-3">
                    <RadioGroup
                      value={localState.selectionMode}
                      onValueChange={(mode) => updateLocalState({ selectionMode: mode })}
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="manual" id="manual" />
                        <Label htmlFor="manual" className="text-white font-semibold flex items-center gap-2">
                          <UserIcon className="w-4 h-4 text-yellow-300" />
                          Manual (tú eliges)
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <p className="text-gray-300 text-sm mt-2">
                    Selecciona una metodología y la IA creará tu plan con esa base.
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {METHODOLOGIES.map((methodology) => (
              <MethodologyCard
                key={methodology.name}
                methodology={methodology}
                manualActive={localState.selectionMode === 'manual'}
                onDetails={handleOpenDetails}
                onSelect={handleManualCardClick}
              />
            ))}
          </div>

      {/* Loading Overlay */}
          {ui.isLoading && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
              <div className="bg-neutral-900/95 border border-white/10 border-l-2 border-l-yellow-400/30 ring-1 ring-white/5 rounded-2xl p-8 text-center shadow-2xl backdrop-blur-xl">
                <div className="mx-auto mb-4 h-14 w-14 rounded-full border border-yellow-400/30 bg-yellow-500/10 flex items-center justify-center">
                  <svg className="w-8 h-8 text-yellow-300 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                </svg>
                </div>
                <p className="text-white font-urbanist text-lg">La IA está generando tu entrenamiento</p>
                <p className="text-gray-300/70 text-sm mt-2">Analizando tu perfil para crear la rutina idónea…</p>
              </div>
            </div>
          )}
          <MethodologiesModalLayer
            {...{
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
            }}
          />
        </div>
      </div>
    </div>
  );
}
