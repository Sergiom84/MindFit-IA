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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog.jsx';
import { METHODOLOGIES, sanitizeProfile } from './methodologiesData.js';
import { LOCAL_STATE_INITIAL, formatLocalDate, getDayName } from './MethodologiesScreen.helpers.js';
import { useMousePosition } from './hooks/useMousePosition.js';
import MethodologyDetailsDialog from './shared/MethodologyDetailsDialog.jsx';
import TrainingPlanConfirmationModal from '../routines/TrainingPlanConfirmationModal.jsx';
import RoutineSessionModal from '../routines/RoutineSessionModal.jsx';
import WodSessionModal from '../routines/WodSessionModal.jsx';
import WarmupModal from '../routines/WarmupModal.jsx';
import MethodologyVersionSelectionModal from './shared/MethodologyVersionSelectionModal.jsx';
import CalisteniaManualCard from './methodologies/CalisteniaManual/CalisteniaManualCard.jsx';
import HeavyDutyManualCard from './methodologies/HeavyDuty/HeavyDutyManualCard.jsx';
import HipertrofiaV2ManualCard from './methodologies/HipertrofiaV2/HipertrofiaV2ManualCard.jsx';
import AdaptationTrackingBadge from './methodologies/HipertrofiaV2/components/AdaptationTrackingBadge.jsx';
import PowerliftingManualCard from './methodologies/Powerlifting/PowerliftingManualCard.jsx';
import CrossFitManualCard from './methodologies/CrossFit/CrossFitManualCard.jsx';
import FuncionalManualCard from './methodologies/Funcional/FuncionalManualCard.jsx';
import HalterofiliaManualCard from './methodologies/Halterofilia/HalterofiliaManualCard.jsx';
import CasaManualCard from './methodologies/Casa/CasaManualCard.jsx';
import { useTrace } from '@/contexts/TraceContext';
import { useNavigate } from 'react-router-dom';
import WeekendWarningModal from '../routines/modals/WeekendWarningModal.jsx';
import StartDayConfirmationModal from '../routines/modals/StartDayConfirmationModal.jsx';
import SessionDistributionModal from '../routines/modals/SessionDistributionModal.jsx';
import HipertrofiaWeekendModal from '../routines/modals/HipertrofiaWeekendModal.jsx';
import HipertrofiaFocusModal from '../routines/modals/HipertrofiaFocusModal.jsx';
import CalisteniaEffortModal from '../routines/modals/CalisteniaEffortModal.jsx';
import CrossFitEffortModal from '../routines/modals/CrossFitEffortModal.jsx';
import HalterofiliaEffortModal from '../routines/modals/HalterofiliaEffortModal.jsx';
import FuncionalEffortModal from '../routines/modals/FuncionalEffortModal.jsx';
import CasaEffortModal from '../routines/modals/CasaEffortModal.jsx';
import HeavyDutyEffortModal from '../routines/modals/HeavyDutyEffortModal.jsx';
import PowerliftingEffortModal from '../routines/modals/PowerliftingEffortModal.jsx';
import CasaEquipmentModal from '../routines/modals/CasaEquipmentModal.jsx';
import apiClient from '@/lib/apiClient';

// 🎯 HOOKS MODULARES - Refactorización incremental
import { useMethodologyValidation } from './hooks/useMethodologyValidation';

// ===============================================
// 🎯 ESTADO LOCAL MÍNIMO PARA ESTA PANTALLA
// ===============================================

// Metodologías que usan el flujo "single-day" in-app (modal fin de semana →
// elección de foco → calentamiento → reproductor de ejercicios).
const SINGLE_DAY_METHODOLOGIES = ['HipertrofiaV2', 'Calistenia', 'CrossFit', 'Entrenamiento en Casa', 'Funcional', 'Halterofilia', 'Powerlifting', 'Heavy Duty'];

// Grupos focales por metodología para el modal de "¿Qué prefieres entrenar?".
const CALISTENIA_FOCUS_GROUPS = [
  { id: 'Empuje', label: 'Empuje' },
  { id: 'Tracción', label: 'Tracción' },
  { id: 'Piernas', label: 'Piernas' },
  { id: 'Core', label: 'Core' },
  { id: 'Equilibrio/Soporte', label: 'Equilibrio' }
];

// Para CrossFit el "foco" es el formato de WOD o el dominio principal.
const CROSSFIT_FOCUS_GROUPS = [
  { id: 'amrap', label: 'AMRAP' },
  { id: 'for_time', label: 'For Time' },
  { id: 'emom', label: 'EMOM' },
  { id: 'chipper', label: 'Chipper' },
  { id: 'Weightlifting', label: 'Halterofilia' },
  { id: 'Gymnastic', label: 'Gimnásticos' }
];

// Para Entrenamiento en Casa el "foco" es el tipo de trabajo (mapea a categorías
// reales del catálogo disciplina='casa').
const CASA_FOCUS_GROUPS = [
  { id: 'Fuerza', label: 'Fuerza' },
  { id: 'Funcional', label: 'Funcional' },
  { id: 'Cardio', label: 'Cardio' },
  { id: 'Movilidad', label: 'Movilidad' }
];

// Para Funcional el "foco" es el patrón de movimiento (mapea a categorías
// reales del catálogo disciplina='funcional').
const FUNCIONAL_FOCUS_GROUPS = [
  { id: 'Empuje', label: 'Empuje' },
  { id: 'Tracción', label: 'Tracción' },
  { id: 'Piernas', label: 'Piernas' },
  { id: 'Core', label: 'Core' },
  { id: 'Movilidad', label: 'Movilidad' }
];

// Para Halterofilia el "foco" es la categoría olímpica (mapea a categorías
// reales del catálogo disciplina='halterofilia').
const HALTEROFILIA_FOCUS_GROUPS = [
  { id: 'Snatch', label: 'Snatch' },
  { id: 'Clean & Jerk', label: 'Clean & Jerk' },
  { id: 'Técnica', label: 'Técnica' },
  { id: 'Fuerza Base', label: 'Fuerza' }
];

// Para Powerlifting el "foco" es uno de los 3 básicos de competición (mapea a
// categorías reales del catálogo disciplina='powerlifting').
const POWERLIFTING_FOCUS_GROUPS = [
  { id: 'Sentadilla', label: 'Sentadilla' },
  { id: 'Press Banca', label: 'Press Banca' },
  { id: 'Peso Muerto', label: 'Peso Muerto' }
];

// Para Heavy Duty (HIT/Mentzer) el "foco" es el grupo muscular (agrupa las
// categorías reales del catálogo disciplina='heavy_duty' por ILIKE en backend).
const HEAVY_DUTY_FOCUS_GROUPS = [
  { id: 'Pecho', label: 'Pecho' },
  { id: 'Espalda', label: 'Espalda' },
  { id: 'Piernas', label: 'Piernas' },
  { id: 'Hombros', label: 'Hombros' },
  { id: 'Brazos', label: 'Brazos' },
  { id: 'Core', label: 'Core' }
];

// Mapea el nombre de metodología del frontend a la clave de API single-day.
const methodologyApiKey = (name) => {
  if (name === 'Calistenia') return 'calistenia';
  if (name === 'CrossFit') return 'crossfit';
  if (name === 'Entrenamiento en Casa') return 'casa';
  if (name === 'Funcional') return 'funcional';
  if (name === 'Halterofilia') return 'halterofilia';
  if (name === 'Powerlifting') return 'powerlifting';
  if (name === 'Heavy Duty') return 'heavy_duty';
  return 'hipertrofia';
};

// ===============================================
// 🎨 MethodologyCard (nivel de módulo: referencia estable, sin remontajes)
// ===============================================
function MethodologyCard({ methodology, manualActive, onDetails, onSelect }) {
  // Nombre visible (puede diferir del identificador interno `name`).
  const label = methodology.displayName || methodology.name;
  return (
    <Card
      className={`bg-neutral-900/70 border border-white/10 border-l-2 border-l-yellow-400/30 ring-1 ring-white/5 backdrop-blur-lg transition-all duration-300 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] ${
        manualActive
          ? 'hover:border-yellow-400/40 hover:border-l-yellow-400/60 hover:shadow-[0_25px_60px_-45px_rgba(250,204,21,0.35)]'
          : 'hover:border-white/20 hover:border-l-yellow-400/50'
      }`}
      aria-label={`Tarjeta de metodología ${label}`}
    >
      <div className="p-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {methodology.icon && <methodology.icon className="w-7 h-7 text-yellow-300" />}
            <h3 className="text-white text-base sm:text-xl font-semibold font-urbanist leading-tight break-words">
              {label}
            </h3>
          </div>
          <span className="text-xs px-2 py-1 border border-white/10 bg-white/5 text-gray-200 rounded">
            {methodology.level}
          </span>
        </div>
        <p className="text-gray-300 mt-2 text-sm">{methodology.description}</p>
      </div>
      <div className="px-4 pb-4 space-y-3">
        <div className="space-y-2">
          {[
            { label: 'Frecuencia', value: methodology.frequency },
            { label: 'Volumen', value: methodology.volume },
            { label: 'Intensidad', value: methodology.intensity }
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between text-sm">
              <span className="text-gray-400">{label}:</span>
              <span className="text-white">{value}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            className="flex-1 border border-white/10 text-gray-200 hover:bg-white/10 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              onDetails(methodology);
            }}
            aria-label={`Ver detalles de ${label}`}
          >
            Ver Detalles
          </Button>
          <Button
            className={`flex-1 ${manualActive
              ? 'bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]'
              : 'bg-gradient-to-r from-yellow-300/70 via-yellow-400/70 to-amber-500/70 text-black hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              // Activar modo manual (si hace falta) y seleccionar en un solo clic.
              onSelect(methodology, !manualActive);
            }}
            aria-label={`Seleccionar metodología ${label}`}
          >
            Seleccionar
          </Button>
        </div>
      </div>
    </Card>
  );
}


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
  const pendingPlanActionRef = useRef(null);

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

  const handleActivePlanGoToPlan = () => {
    pendingPlanActionRef.current = null;
    ui.hideModal('activePlanWarning');
    navigate('/routines');
  };

  const handleActivePlanCancelAndContinue = async () => {
    ui.hideModal('activePlanWarning');
    const pendingAction = pendingPlanActionRef.current;
    pendingPlanActionRef.current = null;

    try {
      // El plan activo vive en BD, no en WorkoutContext.state.plan (que está vacío al
      // entrar directo a /methodologies). Recuperamos su methodology_plan_id de la
      // fuente canónica para no llamar a cancel-routine con body vacío (→ 400 y bucle).
      let activePlanId = null;
      try {
        const { getActivePlan } = await import('@/components/routines/api');
        const activeData = await getActivePlan();
        activePlanId = activeData?.methodology_plan_id ?? activeData?.planId ?? null;
      } catch (lookupError) {
        console.warn('⚠️ No se pudo recuperar el plan activo para cancelar:', lookupError);
      }

      const result = await cancelPlan(activePlanId);
      if (result && result.success === false) {
        throw new Error(result.error || 'No se pudo cancelar el plan activo');
      }
      await syncWithDatabase();
    } catch (error) {
      console.error('❌ Error cancelando plan activo:', error);
      ui.setError(error.message || 'Error cancelando el plan activo');
      return;
    }

    if (pendingAction) {
      await pendingAction();
    }
  };


  // ===============================================
  // 🎨 MethodologyCard se define a nivel de módulo (ver abajo) para evitar
  // remontajes de la rejilla en cada render que provocaban pérdida de clics.
  // ===============================================
  // 🎛️ HANDLERS SIMPLIFICADOS
  // ===============================================

  const handleActivateIA = async (forcedMethodology = null) => {
    try { track('BUTTON_CLICK', { id: 'activar_ia' }, { component: 'MethodologiesScreen' }); } catch (e) { console.warn('Track error:', e); }
    if (!user) return;

    await runWithActivePlanGuard(async () => {
      // Configurar datos de selección de versión
      updateLocalState({
        versionSelectionData: {
          isAutomatic: true,
          forcedMethodology
        }
      });
      ui.showModal('versionSelection');
    });
  };

  const handleVersionSelectionConfirm = async (versionConfig) => {
    try { track('ACTION', { id: 'version_confirm', mode: 'automatic', version: versionConfig?.version }, { component: 'MethodologiesScreen' }); } catch (e) { console.warn('Track error:', e); }
    ui.hideModal('versionSelection');

    // Construir perfil completo
    const rawProfile = { ...userData, ...user };
    const fullProfile = sanitizeProfile({
      ...rawProfile,
      peso_kg: rawProfile.peso || rawProfile.peso_kg,
      altura_cm: rawProfile.altura || rawProfile.altura_cm,
      años_entrenando: rawProfile.años_entrenando || rawProfile.anos_entrenando,
      nivel_entrenamiento: rawProfile.nivel || rawProfile.nivel_entrenamiento,
      objetivo_principal: rawProfile.objetivo_principal || rawProfile.objetivoPrincipal
    });

    // 🎯 VERIFICAR FIN DE SEMANA
    if (isWeekend()) {
      // HipertrofiaV2 usa flujo especial
      if (localState.pendingMethodology?.name === 'HipertrofiaV2') {
        updateLocalState({
          showHpv2WeekendModal: true,
          pendingLevel: getUserLevel()
        });
        return;
      }

      console.log('🚨 Detectado generación en fin de semana');
      updateLocalState({
        showWeekendWarning: true,
        weekendGenerationData: {
          versionConfig,
          fullProfile,
          mode: 'automatic'
        }
      });
      return; // Detener aquí y esperar decisión del usuario
    }

    await runWithActivePlanGuard(async () => {
      try {
        console.log('🤖 Generando plan automático con WorkoutContext...');

        // Usar generatePlan del WorkoutContext
        const result = await generatePlan({
          mode: 'automatic',
          versionConfig: versionConfig || { version: 'adapted', customWeeks: 4 },
          userProfile: fullProfile
        });

        if (result.success) {
          console.log('✅ Plan automático generado exitosamente');

          // 🛡️ VALIDAR DATOS ANTES DE MOSTRAR MODAL (usar result.plan en lugar de plan.currentPlan)
          const validation = validatePlanData(result.plan);
          if (validation.isValid) {
            ui.showModal('planConfirmation');
          } else {
            console.error('❌ Plan inválido:', validation.error);
            ui.setError(`Plan generado incorrectamente: ${validation.error}`);
          }
        } else {
          throw new Error(result.error || 'Error generando plan automático');
        }

      } catch (err) {
        console.error('❌ Error generando plan:', err);
        ui.setError(err.message);
      }
    });
  };

  const handleManualCardClick = async (methodology, forceManual = false) => {
    try { track('CARD_CLICK', { id: methodology?.name, group: 'methodology', mode: 'manual' }, { component: 'MethodologiesScreen' }); } catch (e) { console.warn('Track error:', e); }

    // Si se fuerza desde el botón "Seleccionar", activar el modo manual.
    if (forceManual && localState.selectionMode !== 'manual') {
      updateLocalState({ selectionMode: 'manual' });
    }

    // Permitir ejecución si está en modo manual O si se fuerza (clic en botón Seleccionar)
    if (localState.selectionMode === 'manual' || forceManual) {
      await runWithActivePlanGuard(async () => {
        // 🚨 Metodologías con flujo single-day in-app en fin de semana: mostrar flujo especial
        if (SINGLE_DAY_METHODOLOGIES.includes(methodology.name) && isWeekend()) {
          updateLocalState({
            pendingMethodology: methodology,
            showHpv2WeekendModal: true,
            pendingLevel: getUserLevel()
          });
          return;
        }

        // 🆕 PASO 1: Detectar si debe mostrar modal de día de inicio
        if (shouldShowStartDayModal()) {
          console.log('🗓️ Día especial detectado, mostrando modal de inicio...');
          updateLocalState({
            pendingMethodology: methodology,
            showStartDayModal: true
          });
          return;
        }

        // PASO 2: Si no es día especial, continuar con flujo normal
        proceedWithMethodologySelection(methodology);
      });
    }
  };

  /**
    * 🆕 Procede con la selección de metodología (después de modal de inicio o directamente)
    */
  const proceedWithMethodologySelection = (methodology, startConfig = null) => {
    // Si es Calistenia, mostrar el modal específico
    if (methodology.name === 'Calistenia') {
      ui.showModal('calisteniaManual');
      return;
    }

    // Si es Heavy Duty, mostrar el modal específico
    if (methodology.name === 'Heavy Duty') {
      ui.showModal('heavyDutyManual');
      return;
    }

    // Si es HipertrofiaV2, verificar si necesita modal de distribución
    if (methodology.name === 'HipertrofiaV2') {
      // Detectar día de la semana
      const today = new Date();
      const dayOfWeek = today.getDay(); // 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb

      // Solo jueves ofrece modal de distribución (sábados). Otros días: flujo directo.
      if (dayOfWeek === 4) {
        console.log('🗓️ Usuario comienza HipertrofiaV2 en día incompleto, mostrando modal de distribución...');

        // Calcular sesiones restantes en la primera semana
        const sessionsFirstWeek = 5 - (dayOfWeek - 1); // Mar=4, Mié=3, Jue=2, Vie=1

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
        // Lunes → ir directo al modal (5 días completos disponibles)
        // Sábado/Domingo → ir directo, el WeekendWarningModal aparecerá después en handleHipertrofiaV2ManualGenerate
        ui.showModal('hipertrofiaV2Manual');
      }
      return;
    }

    // Si es Powerlifting, mostrar el modal específico
    if (methodology.name === 'Powerlifting') {
      ui.showModal('powerliftingManual');
      return;
    }

    // Si es CrossFit, mostrar el modal específico
    if (methodology.name === 'CrossFit') {
      ui.showModal('crossfitManual');
      return;
    }

    // Si es Funcional, mostrar el modal específico
    if (methodology.name === 'Funcional') {
      ui.showModal('funcionalManual');
      return;
    }

    // Si es Halterofilia, mostrar el modal específico
    if (methodology.name === 'Halterofilia') {
      ui.showModal('halterofíliaManual');
      return;
    }

    // Si es Entrenamiento en Casa, mostrar el modal específico
    if (methodology.name === 'Entrenamiento en Casa') {
      ui.showModal('casaManual');
      return;
    }

    // Guardar configuración de inicio si existe
    if (startConfig) {
      updateLocalState({ startConfig });
    }

    updateLocalState({
      pendingMethodology: methodology,
      versionSelectionData: {
        isAutomatic: false,
        selectedMethodology: methodology.name
      }
    });
    ui.showModal('versionSelection');
  };

  const confirmManualSelection = async (versionConfig) => {
    try { track('ACTION', { id: 'manual_version_confirm', methodology: localState.pendingMethodology?.name, version: versionConfig?.version }, { component: 'MethodologiesScreen' }); } catch (e) { console.warn('Track error:', e); }
    if (!localState.pendingMethodology) return;

    ui.hideModal('versionSelection');

    await runWithActivePlanGuard(async () => {
      try {
        console.log(`🎯 Generando plan manual para metodología: ${localState.pendingMethodology.name}`);

        // 🆕 Preparar configuración completa con datos de inicio
        const planConfig = {
          mode: 'manual',
          methodology: (localState.pendingMethodology.name || '').toLowerCase(),
          versionConfig: versionConfig || { version: 'adapted', customWeeks: 4 }
        };

        // 🆕 Añadir configuración de inicio si existe
        if (localState.startConfig) {
          planConfig.startConfig = localState.startConfig;
          console.log('🗓️ Configuración de inicio incluida:', localState.startConfig);
        }

        // Usar generatePlan del WorkoutContext
        const result = await generatePlan(planConfig);

        if (result.success) {
          console.log('✅ Plan manual generado exitosamente');

          // 🛡️ VALIDAR DATOS ANTES DE MOSTRAR MODAL (usar result.plan en lugar de plan.currentPlan)
          const validation = validatePlanData(result.plan);
          if (validation.isValid) {
            ui.showModal('planConfirmation');
          } else {
            console.error('❌ Plan inválido:', validation.error);
            ui.setError(`Plan generado incorrectamente: ${validation.error}`);
          }
        } else {
          throw new Error(result.error || 'Error al generar el plan');
        }

      } catch (error) {
        console.error('❌ Error generando plan manual:', error);
        ui.setError(error.message || 'Error al generar el plan de entrenamiento');
      } finally {
        updateLocalState({ pendingMethodology: null });
      }
    });
  };

  /**
    * 🆕 Handler para confirmación del modal de día de inicio
    */
  const handleStartDayConfirm = async (config) => {
    try { track('ACTION', { id: 'start_day_confirm', config }, { component: 'MethodologiesScreen' }); } catch (e) { console.warn('Track error:', e); }

    console.log('🗓️ Configuración de inicio confirmada:', config);

    // Cerrar modal de inicio
    updateLocalState({ showStartDayModal: false });

    // Si es Home Training, redirigir
    if (config.isHomeTraining) {
      console.log('🏠 Redirigiendo a Home Training...');
      navigate('/home-training');
      return;
    }

    // Guardar configuración de inicio
    updateLocalState({ startConfig: config });

    // Si comienza en día incompleto, mostrar modal de distribución
    if (shouldShowDistributionModal(config)) {
      console.log('📊 Mostrando modal de distribución de sesiones...');
      updateLocalState({
        showDistributionModal: true,
        distributionConfig: {
          startDay: getDayName(config.startDayOfWeek ?? new Date().getDay()),
          totalSessions: 30, // Por defecto, se puede ajustar según metodología
          sessionsPerWeek: 5,
          missingSessions: 5 - config.sessionsFirstWeek,
          startDayOfWeek: config.startDayOfWeek
        }
      });
    } else {
      // Continuar con selección de metodología
      proceedWithMethodologySelection(localState.pendingMethodology, config);
    }
  };

  /**
    * 🆕 Handler para confirmación del modal de distribución
    */
  const handleDistributionConfirm = async (option) => {
    try { track('ACTION', { id: 'distribution_confirm', option }, { component: 'MethodologiesScreen' }); } catch (e) { console.warn('Track error:', e); }

    console.log('📊 Opción de distribución confirmada:', option);

    // Cerrar modal de distribución
    updateLocalState({ showDistributionModal: false });

    // Combinar configuración de inicio con opción de distribución
    const finalConfig = {
      ...localState.startConfig,
      distributionOption: option, // 'saturdays' o 'extra_week'
      includeSaturdays: option === 'saturdays' // Mapeo explícito para HipertrofiaV2
    };

    // 🎯 CASO ESPECIAL: Si es HipertrofiaV2, pasar configuración directamente
    if (localState.pendingMethodology?.name === 'HipertrofiaV2') {
      console.log('🏋️ HipertrofiaV2 detectado, guardando configuración y mostrando modal...');
      updateLocalState({ startConfig: finalConfig });
      ui.showModal('hipertrofiaV2Manual');
    } else {
      // Continuar con selección de metodología para otras metodologías
      proceedWithMethodologySelection(localState.pendingMethodology, finalConfig);
    }
  };

  /**
    * 🆕 Helper para obtener nombre del día
    */
  const handleOpenDetails = (methodology) => {
    try { track('BUTTON_CLICK', { id: 'ver_detalles', methodology: methodology?.name }, { component: 'MethodologiesScreen' }); } catch (e) { console.warn('Track error:', e); }
    updateLocalState({ detailsMethod: methodology });
    ui.showModal('methodologyDetails');
  };

  // Generador manual genérico: consolida los handlers ManualGenerate por disciplina.
  const runManualGenerate = async ({ trackId, methodology, dataKey, hideModalName, data }) => {
    try { track('ACTION', { id: trackId }, { component: 'MethodologiesScreen' }); } catch (e) { console.warn('Track error:', e); }

    if (ui.isLoading) {
      console.warn('⚠️ Ya hay una generación en curso, ignorando click...');
      return;
    }

    await runWithActivePlanGuard(async () => {
      ui.setLoading(true);
      try {
        console.log(`🎯 [METHODOLOGIES] Generando plan manual: ${methodology}`);
        const result = await generatePlan({ mode: 'manual', methodology, [dataKey]: data });

        if (result.success) {
          console.log(`✅ Plan de ${methodology} generado exitosamente`);
          ui.hideModal(hideModalName);
          const validation = validatePlanData(result.plan);
          if (validation.isValid) {
            ui.showModal('planConfirmation');
          } else {
            console.error('❌ Plan inválido:', validation.error);
            ui.setError(`Plan generado incorrectamente: ${validation.error}`);
          }
        } else {
          throw new Error(result.error || `Error al generar el plan de ${methodology}`);
        }
      } catch (error) {
        console.error(`❌ Error generando plan de ${methodology}:`, error);
        ui.setError(error.message || `Error al generar el plan de ${methodology}`);
      } finally {
        ui.setLoading(false);
      }
    });
  };

  const handleCalisteniaManualGenerate = (calisteniaData) =>
    runManualGenerate({ trackId: 'generate_calistenia', methodology: 'calistenia', dataKey: 'calisteniaData', hideModalName: 'calisteniaManual', data: calisteniaData });

  const handleHeavyDutyManualGenerate = (heavyDutyData) =>
    runManualGenerate({ trackId: 'generate_heavy_duty', methodology: 'heavy-duty', dataKey: 'heavyDutyData', hideModalName: 'heavyDutyManual', data: heavyDutyData });

  const handleHipertrofiaV2ManualGenerate = async (hipertrofiaV2Data) => {
    try { track('ACTION', { id: 'generate_hipertrofiav2' }, { component: 'MethodologiesScreen' }); } catch (e) { console.warn('Track error:', e); }

    // 🛡️ Prevenir múltiples clicks estableciendo loading inmediatamente
    if (ui.isLoading) {
      console.warn('⚠️ Ya hay una generación en curso, ignorando click...');
      return;
    }

    // 🎯 VERIFICAR FIN DE SEMANA PARA HIPERTROFIAV2
    if (isWeekend()) {
      console.log('🚨 Detectado generación HipertrofiaV2 en fin de semana');

      // Obtener perfil del usuario para el nivel
      const userProfile = JSON.parse(localStorage.getItem('userProfile') || '{}');
      const nivel = hipertrofiaV2Data?.evaluation?.level || userProfile.nivel_entrenamiento || getUserLevel();

      // Cerrar el modal de HipertrofiaV2
      ui.hideModal('hipertrofiaV2Manual');

      // Lanzar flujo especial de sesión única (nuevo modal)
      updateLocalState({
        pendingMethodology: { name: 'HipertrofiaV2' },
        pendingLevel: nivel,
        showHpv2WeekendModal: true
      });
      return; // Detener aquí y esperar decisión del usuario
    }

    await runWithActivePlanGuard(async () => {
      ui.setLoading(true);

      try {
        // 🎯 FLUJO MOD MindFeed: usamos plan ya generado y lo registramos en el contexto
        const planData = hipertrofiaV2Data?.planData;
        const validation = validatePlanData(planData);

        if (!validation.isValid) {
          throw new Error(`Plan generado incorrectamente: ${validation.error}`);
        }

        const result = await generatePlan({
          mode: 'manual',
          methodology: 'hipertrofiaV2',
          planData,
          methodologyPlanId: hipertrofiaV2Data?.methodologyPlanId,
          systemInfo: hipertrofiaV2Data?.system_info
        });

        if (!result.success) {
          throw new Error(result.error || 'Error registrando el plan MindFeed');
        }

        console.log('✅ Plan de Hipertrofia V2 integrado en WorkoutContext');
        ui.hideModal('hipertrofiaV2Manual');
        ui.showModal('planConfirmation');

      } catch (error) {
        console.error('❌ Error generando plan de Hipertrofia V2:', error);
        ui.setError(error.message || 'Error al generar el plan de Hipertrofia');
      } finally {
        ui.setLoading(false);
      }
    });
  };

  const handlePowerliftingManualGenerate = (powerliftingData) =>
    runManualGenerate({ trackId: 'generate_powerlifting', methodology: 'powerlifting', dataKey: 'powerliftingData', hideModalName: 'powerliftingManual', data: powerliftingData });

  const handleCrossFitManualGenerate = (crossfitData) =>
    runManualGenerate({ trackId: 'generate_crossfit', methodology: 'crossfit', dataKey: 'crossfitData', hideModalName: 'crossfitManual', data: crossfitData });

  const handleFuncionalManualGenerate = (funcionalData) =>
    runManualGenerate({ trackId: 'generate_funcional', methodology: 'funcional', dataKey: 'funcionalData', hideModalName: 'funcionalManual', data: funcionalData });

  const handleHalterofíliaManualGenerate = async (halterofíliaData) => {
    try { track('ACTION', { id: 'generate_halterofilia' }, { component: 'MethodologiesScreen' }); } catch (e) { console.warn('Track error:', e); }

    // 🛡️ Prevenir múltiples clicks estableciendo loading inmediatamente
    if (ui.isLoading) {
      console.warn('⚠️ Ya hay una generación en curso, ignorando click...');
      return;
    }

    await runWithActivePlanGuard(async () => {
      ui.setLoading(true);

      try {
        console.log('🏋️ Generando plan de Halterofilia...');

        // Usar generatePlan del WorkoutContext
        const result = await generatePlan({
          mode: 'manual',
          methodology: 'halterofilia',
          halterofíliaData
        });

        if (result.success) {
          console.log('✅ Plan de Halterofilia generado exitosamente');
          console.log('🔍 Datos del plan generado:', {
            hasPlan: !!result.plan,
            methodologyPlanId: result.methodologyPlanId || result.planId,
            planId: result.planId,
            hasMetadata: !!result.metadata
          });

          ui.hideModal('halterofíliaManual');

          // 🛡️ VALIDAR DATOS ANTES DE MOSTRAR MODAL
          const validation = validatePlanData(result.plan);
          if (validation.isValid) {
            ui.showModal('planConfirmation');
          } else {
            console.error('❌ Plan inválido:', validation.error);
            ui.setError(`Plan generado incorrectamente: ${validation.error}`);
          }
        } else {
          throw new Error(result.error || 'Error al generar el plan de Halterofilia');
        }

      } catch (error) {
        console.error('❌ Error generando plan de Halterofilia:', error);
        ui.setError(error.message || 'Error al generar el plan de Halterofilia');
      } finally {
        ui.setLoading(false);
      }
    });
  };

  const handleCasaManualGenerate = (casaData) =>
    runManualGenerate({ trackId: 'generate_casa', methodology: 'entrenamiento-casa', dataKey: 'casaData', hideModalName: 'casaManual', data: casaData });

  const handleSavePlan = async () => {
    try {
      setIsConfirmingPlan(true);
      ui.setLoading(true);
      try { track('BUTTON_CLICK', { id: 'save_plan' }, { component: 'MethodologiesScreen' }); } catch (e) { console.warn('Track error:', e); }
      console.log('💾 Guardando plan sin iniciar sesión...');

      if (!plan.currentPlan || !plan.methodologyPlanId) {
        throw new Error('No hay plan generado para guardar');
      }

      const startConfigPayload = buildStartConfigPayload();
      const confirmResponse = await fetch('/api/routines/confirm-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({
          methodology_plan_id: plan.methodologyPlanId,
          startConfig: startConfigPayload
        })
      });

      if (!confirmResponse.ok) {
        const errorData = await confirmResponse.json();
        throw new Error(errorData.error || 'Error al confirmar el plan');
      }

      const confirmData = await confirmResponse.json();
      console.log('✅ Plan confirmado exitosamente (sin iniciar):', confirmData);

      ui.hideModal('planConfirmation');
    } catch (error) {
      console.error('❌ Error guardando plan:', error);
      ui.setError(error.message || 'Error al guardar el plan');
    } finally {
      ui.setLoading(false);
      setIsConfirmingPlan(false);
    }
  };

  const handleStartTraining = async () => {
    try {
      // Bloquear doble click mientras confirmamos/iniciamos
      setIsConfirmingPlan(true);
      ui.setLoading(true);
      try { track('BUTTON_CLICK', { id: 'start_training' }, { component: 'MethodologiesScreen' }); } catch (e) { console.warn('Track error:', e); }
      console.log('🚀 Iniciando sesión de entrenamiento...');

      console.log('🔍 Estado del plan antes de confirmar:', {
        hasPlan: !!plan.currentPlan,
        methodologyPlanId: plan.methodologyPlanId,
        planType: plan.planType,
        methodology: plan.methodology,
        status: plan.status
      });

      if (!plan.currentPlan || !plan.methodologyPlanId) {
        throw new Error('No hay plan generado para iniciar');
      }

      console.log('🎯 PASO 1: Confirmando plan con ID:', plan.methodologyPlanId);

      const startConfigPayload = buildStartConfigPayload();
      // 🎯 NUEVO: Confirmar el plan ANTES de iniciar sesión (draft → active)
      const confirmResponse = await fetch('/api/routines/confirm-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({
          methodology_plan_id: plan.methodologyPlanId,
          startConfig: startConfigPayload
        })
      });

      if (!confirmResponse.ok) {
        const errorData = await confirmResponse.json();
        throw new Error(errorData.error || 'Error al confirmar el plan');
      }

      const confirmData = await confirmResponse.json();
      console.log('✅ Plan confirmado exitosamente:', confirmData);

      console.log('🎯 PASO 2: Iniciando sesión...');

      // Usar startSession del WorkoutContext (DESPUÉS de confirmar)
      // Enviar el nombre real del día en español (e.g., 'Viernes') para evitar fallback 'today'
      const _todayName = new Date().toLocaleDateString('es-ES', { weekday: 'long' });
      const dayNameEs = _todayName.charAt(0).toUpperCase() + _todayName.slice(1);
      const result = await startSession({
        methodologyPlanId: plan.methodologyPlanId,
        dayName: dayNameEs
      });

      if (result.success) {
        console.log('✅ Sesión iniciada, session_id:', result.session_id);

        // 🔥 CRÍTICO: Cargar los ejercicios de la sesión INMEDIATAMENTE después de iniciarla
        try {
          const { getSessionProgress } = await import('../routines/api');
          const progressData = await getSessionProgress(result.session_id);
          console.log('✅ Ejercicios cargados para la sesión:', progressData);

          // Verificar que los ejercicios se cargaron correctamente
          if (!progressData.exercises || progressData.exercises.length === 0) {
            throw new Error('La sesión no tiene ejercicios disponibles');
          }

          console.log('✅ Ejercicios disponibles:', progressData.exercises.length);

          // 🔥 Guardar los datos de la sesión en el estado local
          // 🎯 MAPEAR exercise_name → nombre para compatibilidad con el modal
          const mappedExercises = progressData.exercises.map(ex => ({
            ...ex,
            // 🔑 Alinear indices con backend para PUT /exercise/:order
            originalIndex: ex.exercise_order,
            // Garantizar ejercicio ID para tracking RIR
            exercise_id: ex.exercise_id ?? ex.id ?? null,
            nombre: ex.exercise_name || ex.nombre, // Priorizar exercise_name del backend
            series: ex.series_total || ex.series,
            repeticiones: ex.repeticiones,
            descanso_seg: ex.descanso_seg,
            intensidad: ex.intensidad,
            tempo: ex.tempo,
            notas: ex.notas,
            status: ex.status,
            series_completed: ex.series_completed || 0,
            time_spent_seconds: ex.time_spent_seconds || 0
          }));

          setSessionData({
            ejercicios: mappedExercises,
            session_id: result.session_id,
            sessionId: result.session_id,
            currentExerciseIndex: 0
          });

        } catch (exerciseError) {
          console.error('❌ Error cargando ejercicios:', exerciseError);
          ui.setError('Error cargando ejercicios de la sesión');
          return;
        }

        ui.hideModal('planConfirmation');
        ui.showModal('warmup');
        console.log('🔥 Iniciando calentamiento...');
      } else {
        throw new Error(result.error || 'Error al iniciar el entrenamiento');
      }

    } catch (error) {
      console.error('❌ Error iniciando entrenamiento:', error);
      ui.setError(error.message || 'Error al iniciar el entrenamiento');
    } finally {
      ui.setLoading(false);
      setIsConfirmingPlan(false);
    }
  };

  const handleWarmupComplete = async () => {
    try { track('BUTTON_CLICK', { id: 'warmup_complete' }, { component: 'MethodologiesScreen' }); } catch (e) { console.warn('Track error:', e); }
    console.log('✅ Calentamiento completado');

    ui.hideModal('warmup');
    ui.showModal('routineSession');

    console.log('🔍 Estado después de warmup:', {
      showRoutineSession: ui.showRoutineSession,
      sessionId: session.sessionId,
      hasSessionData: !!sessionData,
      hasExercises: !!sessionData?.ejercicios
    });
  };

  const handleSkipWarmup = () => {
    try { track('BUTTON_CLICK', { id: 'warmup_skip' }, { component: 'MethodologiesScreen' }); } catch (e) { console.warn('Track error:', e); }
    console.log('⭕ Calentamiento saltado');
    ui.hideModal('warmup');
    ui.showModal('routineSession');
  };

  const handleCloseWarmup = () => {
    try { track('BUTTON_CLICK', { id: 'warmup_close' }, { component: 'MethodologiesScreen' }); } catch (e) { console.warn('Track error:', e); }
    console.log('❌ Calentamiento cerrado → abrir RoutineSessionModal');
    ui.hideModal('warmup');
    ui.showModal('routineSession');
  };

  const handleEndSession = () => {
    try { track('BUTTON_CLICK', { id: 'end_session' }, { component: 'MethodologiesScreen' }); } catch (e) { console.warn('Track error:', e); }
    console.log('🏁 Sesión terminada, navegando con WorkoutContext');
    ui.hideModal('routineSession');
    goToTraining();
  };

  const handleGenerateAnother = async (feedbackData) => {
    try { track('BUTTON_CLICK', { id: 'generate_another' }, { component: 'MethodologiesScreen' }); } catch (e) { console.warn('Track error:', e); }
    try {
      console.log('🔄 Generando nuevo plan con feedback:', feedbackData);

      // Usar generatePlan del WorkoutContext con feedback
      const result = await generatePlan({
        mode: 'regenerate',
        feedback: feedbackData,
        previousPlan: plan.currentPlan
      });

      if (result.success) {
        console.log('✅ Nuevo plan generado con feedback');

        // 🛡️ VALIDAR DATOS ANTES DE MOSTRAR MODAL (usar result.plan en lugar de plan.currentPlan)
        const validation = validatePlanData(result.plan);
        if (validation.isValid) {
          ui.showModal('planConfirmation');
        } else {
          console.error('❌ Plan inválido:', validation.error);
          ui.setError(`Plan generado incorrectamente: ${validation.error}`);
        }
      } else {
        throw new Error(result.error || 'Error al generar nuevo plan');
      }

    } catch (error) {
      console.error('❌ Error al generar nuevo plan:', error);
      ui.setError(error.message || 'Error al generar nuevo plan');
    }
  };

  // ===============================================
  // 🚨 HANDLERS PARA FIN DE SEMANA
  // ===============================================

  const handleWeekendContinueRegular = async () => {
    console.log('📅 Usuario eligió DESCANSAR - Plan comenzará el lunes');

    updateLocalState({
      showWeekendWarning: false,
      weekendGenerationData: null
    });

    // Simplemente cerrar el modal, el usuario volverá el lunes para generar
    console.log('✅ Modal cerrado. El usuario puede volver el lunes para generar su plan.');
  };

  const handleWeekendFullBody = async (fullBodyPlan) => {
    console.log('💪 Usuario eligió Full Body para fin de semana');
    console.log('📦 Datos del entrenamiento recibido:', fullBodyPlan);

    updateLocalState({
      showWeekendWarning: false,
      weekendGenerationData: null
    });

    // El modal ya generó el plan Full Body, ahora iniciamos el flujo de entrenamiento
    if (fullBodyPlan && fullBodyPlan.sessionId) {
      console.log('✅ Plan Full Body generado exitosamente, iniciando flujo de entrenamiento...');

      // Preparar datos para el modal de calentamiento
      const sessionData = {
        dia: new Date().toLocaleDateString('es-ES', { weekday: 'long' }),
        tipo: 'Full Body Extra',
        ejercicios: fullBodyPlan.exercises || [],
        isWeekendExtra: true,
        sessionId: fullBodyPlan.sessionId,
        nivel: fullBodyPlan.nivel || 'Principiante'
      };

      console.log('🔥 Datos de sesión preparados:', sessionData);

      // Actualizar estado para mostrar WarmupModal
      updateLocalState({
        pendingSessionData: sessionData,
        showWarmupModal: true
      });

      ui.showModal('warmup');
    } else {
      console.error('❌ No se recibió sessionId en el plan Full Body:', fullBodyPlan);
      alert('Error al iniciar el entrenamiento. Por favor, intenta de nuevo.');
    }
  };

  // ===============================================
  // 🆕 HIPERTROFIA V2 - FIN DE SEMANA (UN SOLO DÍA)
  // ===============================================

  const closeHipertrofiaWeekendModals = () => {
    updateLocalState({
      showHpv2WeekendModal: false,
      showHpv2FocusModal: false,
      showCasaEquipmentModal: false,
      isGeneratingSingleDay: false,
      pendingFocusGroup: null,
      pendingEquipment: null
    });
  };

  const startHipertrofiaSingleDay = async ({ selectionMode = 'full_body', focusGroup = null, nivelOverride = null, equipment = null }) => {
    const nivel = nivelOverride || localState.pendingLevel || getUserLevel();
    const methodologyName = localState.pendingMethodology?.name || 'HipertrofiaV2';
    // Material disponible (solo aplica a Entrenamiento en Casa).
    const equipmentList = equipment ?? localState.pendingEquipment ?? null;
    updateLocalState({ isGeneratingSingleDay: true });

    try {
      const response = await apiClient.post('/methodology-session/generate-single-day', {
        methodology: methodologyApiKey(methodologyName),
        nivel,
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
      const sessionData = {
        dia: new Date().toLocaleDateString('es-ES', { weekday: 'long' }),
        tipo: isCrossFit
          ? (workout.wod?.label || 'WOD del Día')
          : selectionMode === 'liked' ? 'Tus favoritos'
          : selectionMode === 'disliked' ? 'Los que te cuestan'
          : (selectionMode === 'focus' && focusGroup ? `Foco: ${focusGroup}` : 'Full Body'),
        ejercicios: workout.exercises || [],
        isWeekendExtra: true,
        sessionId: data.sessionId,
        nivel,
        discipline,
        wod: workout.wod || null
      };

      updateLocalState({
        pendingSessionData: sessionData,
        showWarmupModal: true,
        showHpv2WeekendModal: false,
        showHpv2FocusModal: false,
        isGeneratingSingleDay: false
      });

      ui.showModal('warmup');
    } catch (err) {
      console.error('❌ Error generando entrenamiento de un día (HipertrofiaV2):', err);
      // El backend detalla el motivo (p.ej. "Aún no has valorado suficientes
      // ejercicios...") en details; mostrarlo si existe.
      const detail = err?.response?.data?.details || err?.data?.details;
      ui.setError(detail || err?.message || 'No se pudo generar el entrenamiento para hoy');
      updateLocalState({ isGeneratingSingleDay: false });
    }
  };

  // Modo extra por preferencias: "hoy los que te gustan" / "hoy los que te cuestan"
  const handleHipertrofiaPreferenceMode = (mode) => {
    startHipertrofiaSingleDay({ selectionMode: mode });
  };

  const handleHipertrofiaWeekendAccept = () => {
    // Entrenamiento en Casa: antes de nada, preguntar el material disponible.
    if (localState.pendingMethodology?.name === 'Entrenamiento en Casa') {
      updateLocalState({
        showHpv2WeekendModal: false,
        showCasaEquipmentModal: true,
        pendingLevel: getUserLevel()
      });
      return;
    }

    const level = getUserLevel();
    // Todos los niveles pasan por el modal de elección: Intermedio/Avanzado con
    // grupos musculares; Principiante solo Full Body + modos por preferencias.
    updateLocalState({
      showHpv2WeekendModal: false,
      showHpv2FocusModal: true,
      pendingLevel: level
    });
  };

  // Casa: tras elegir el material, seguir con el mismo reparto por nivel
  // (Intermedio/Avanzado → elección de foco; Principiante → Full Body directo).
  const handleCasaEquipmentConfirm = (equipment) => {
    const level = getUserLevel();
    updateLocalState({
      pendingEquipment: equipment,
      showCasaEquipmentModal: false,
      pendingLevel: level,
      // Todos los niveles eligen tipo de sesión (principiante sin grupos)
      showHpv2FocusModal: true
    });
  };

  const handleHipertrofiaWeekendLater = () => {
    // "Prefiero volver el lunes a por un plan completo": en vez de solo cerrar,
    // abrir el configurador de plan completo de la metodología (calendario semanal).
    const methodology = localState.pendingMethodology;
    closeHipertrofiaWeekendModals();
    if (methodology) {
      proceedWithMethodologySelection(methodology);
    }
  };

  const handleHipertrofiaFullBodyAdvanced = () => {
    startHipertrofiaSingleDay({ selectionMode: 'full_body' });
  };

  const handleHipertrofiaFocusGroup = (group) => {
    startHipertrofiaSingleDay({ selectionMode: 'focus', focusGroup: group });
  };

  // ── Autorregulación Calistenia: registrar resultado de sesión y mostrar decisión ──
  const handleCalisteniaEffortSubmit = async ({ avgRir, targetMet, feeling = null }) => {
    const planId = localState.pendingSessionData?.methodology_plan_id
      ?? localState.pendingSessionData?.planId
      ?? null;
    updateLocalState({ isSavingEffort: true });
    try {
      const resp = await apiClient.post('/methodology-session/calistenia/session-result', {
        methodologyPlanId: planId,
        avgRir,
        targetMet,
        feeling // 'facil' | 'normal' | 'dificil' (opcional, matiza la autorreg)
      });
      const data = resp?.data || resp;
      updateLocalState({ autoregDecision: data?.decision || 'hold' });
    } catch (err) {
      console.warn('⚠️ No se pudo registrar la autorregulación:', err?.message);
      updateLocalState({ autoregDecision: 'hold' });
    } finally {
      updateLocalState({ isSavingEffort: false });
    }
  };

  const finishCalisteniaEffort = () => {
    updateLocalState({
      showCalisteniaEffort: false,
      autoregDecision: null,
      pendingSessionData: null
    });
    navigate('/routines', { state: { activeTab: 'today' } });
  };

  // ── Autorregulación Funcional (series×reps×RIR, mismo modelo que Calistenia) ──
  const handleFuncionalEffortSubmit = async ({ avgRir, targetMet, feeling = null }) => {
    const planId = localState.pendingSessionData?.methodology_plan_id
      ?? localState.pendingSessionData?.planId
      ?? null;
    updateLocalState({ isSavingEffort: true });
    try {
      const resp = await apiClient.post('/methodology-session/funcional/session-result', {
        methodologyPlanId: planId,
        avgRir,
        targetMet,
        feeling
      });
      const data = resp?.data || resp;
      updateLocalState({ funcionalDecision: data?.decision || 'hold' });
    } catch (err) {
      console.warn('⚠️ No se pudo registrar la autorregulación Funcional:', err?.message);
      updateLocalState({ funcionalDecision: 'hold' });
    } finally {
      updateLocalState({ isSavingEffort: false });
    }
  };

  const finishFuncionalEffort = () => {
    updateLocalState({
      showFuncionalEffort: false,
      funcionalDecision: null,
      pendingSessionData: null
    });
    navigate('/routines', { state: { activeTab: 'today' } });
  };

  // ── Autorregulación Casa (series×reps×RIR, mismo modelo que Calistenia) ──
  const handleCasaEffortSubmit = async ({ avgRir, targetMet, feeling = null }) => {
    const planId = localState.pendingSessionData?.methodology_plan_id
      ?? localState.pendingSessionData?.planId
      ?? null;
    updateLocalState({ isSavingEffort: true });
    try {
      const resp = await apiClient.post('/methodology-session/casa/session-result', {
        methodologyPlanId: planId,
        avgRir,
        targetMet,
        feeling
      });
      const data = resp?.data || resp;
      updateLocalState({ casaDecision: data?.decision || 'hold' });
    } catch (err) {
      console.warn('⚠️ No se pudo registrar la autorregulación Casa:', err?.message);
      updateLocalState({ casaDecision: 'hold' });
    } finally {
      updateLocalState({ isSavingEffort: false });
    }
  };

  const finishCasaEffort = () => {
    updateLocalState({
      showCasaEffort: false,
      casaDecision: null,
      pendingSessionData: null
    });
    navigate('/routines', { state: { activeTab: 'today' } });
  };

  // ── Autorregulación CrossFit: registrar resultado del WOD y mostrar decisión ──
  const handleCrossfitEffortSubmit = async ({ rpe, completed, scale, feeling = null }) => {
    const planId = localState.pendingSessionData?.methodology_plan_id
      ?? localState.pendingSessionData?.planId
      ?? null;
    updateLocalState({ isSavingEffort: true });
    try {
      const resp = await apiClient.post('/methodology-session/crossfit/wod-result', {
        methodologyPlanId: planId,
        rpe,
        completed,
        scale,
        feeling // 'facil' | 'normal' | 'dificil' (opcional, matiza la autorreg)
      });
      const data = resp?.data || resp;
      updateLocalState({ crossfitDecision: data?.decision || 'hold' });
    } catch (err) {
      console.warn('⚠️ No se pudo registrar la autorregulación CrossFit:', err?.message);
      updateLocalState({ crossfitDecision: 'hold' });
    } finally {
      updateLocalState({ isSavingEffort: false });
    }
  };

  const finishCrossfitEffort = () => {
    updateLocalState({
      showCrossfitEffort: false,
      crossfitDecision: null,
      crossfitWodScale: 'rx',
      pendingSessionData: null
    });
    navigate('/routines', { state: { activeTab: 'today' } });
  };

  // ── Autorregulación Halterofilia (fuerza): registrar resultado y mostrar decisión ──
  const handleHalterofiliaEffortSubmit = async ({ rpe, targetMet, goodTechnique, feeling = null }) => {
    const planId = localState.pendingSessionData?.methodology_plan_id
      ?? localState.pendingSessionData?.planId
      ?? null;
    updateLocalState({ isSavingEffort: true });
    try {
      const resp = await apiClient.post('/methodology-session/halterofilia/session-result', {
        methodologyPlanId: planId,
        rpe,
        targetMet,
        goodTechnique,
        feeling
      });
      const data = resp?.data || resp;
      updateLocalState({ halterofiliaDecision: data?.decision || 'hold' });
    } catch (err) {
      console.warn('⚠️ No se pudo registrar la autorregulación Halterofilia:', err?.message);
      updateLocalState({ halterofiliaDecision: 'hold' });
    } finally {
      updateLocalState({ isSavingEffort: false });
    }
  };

  const finishHalterofiliaEffort = () => {
    updateLocalState({
      showHalterofiliaEffort: false,
      halterofiliaDecision: null,
      pendingSessionData: null
    });
    navigate('/routines', { state: { activeTab: 'today' } });
  };

  // ── Autorregulación Powerlifting (fuerza máxima): registrar resultado y mostrar decisión ──
  const handlePowerliftingEffortSubmit = async ({ rpe, targetMet, goodTechnique, feeling = null }) => {
    const planId = localState.pendingSessionData?.methodology_plan_id
      ?? localState.pendingSessionData?.planId
      ?? null;
    updateLocalState({ isSavingEffort: true });
    try {
      const resp = await apiClient.post('/methodology-session/powerlifting/session-result', {
        methodologyPlanId: planId,
        rpe,
        targetMet,
        goodTechnique,
        feeling
      });
      const data = resp?.data || resp;
      updateLocalState({ powerliftingDecision: data?.decision || 'hold' });
    } catch (err) {
      console.warn('⚠️ No se pudo registrar la autorregulación Powerlifting:', err?.message);
      updateLocalState({ powerliftingDecision: 'hold' });
    } finally {
      updateLocalState({ isSavingEffort: false });
    }
  };

  const finishPowerliftingEffort = () => {
    updateLocalState({
      showPowerliftingEffort: false,
      powerliftingDecision: null,
      pendingSessionData: null
    });
    navigate('/routines', { state: { activeTab: 'today' } });
  };

  // ── Autorregulación Heavy Duty (HIT/fallo): registrar resultado y mostrar decisión ──
  const handleHeavyDutyEffortSubmit = async ({ reachedFailure, targetMet, feeling = null }) => {
    const planId = localState.pendingSessionData?.methodology_plan_id
      ?? localState.pendingSessionData?.planId
      ?? null;
    updateLocalState({ isSavingEffort: true });
    try {
      const resp = await apiClient.post('/methodology-session/heavy-duty/session-result', {
        methodologyPlanId: planId,
        reachedFailure,
        targetMet,
        feeling
      });
      const data = resp?.data || resp;
      updateLocalState({ heavyDutyDecision: data?.decision || 'hold' });
    } catch (err) {
      console.warn('⚠️ No se pudo registrar la autorregulación Heavy Duty:', err?.message);
      updateLocalState({ heavyDutyDecision: 'hold' });
    } finally {
      updateLocalState({ isSavingEffort: false });
    }
  };

  const finishHeavyDutyEffort = () => {
    updateLocalState({
      showHeavyDutyEffort: false,
      heavyDutyDecision: null,
      pendingSessionData: null
    });
    navigate('/routines', { state: { activeTab: 'today' } });
  };

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
                await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3010'}/api/training-session/progress/methodology/${sid}/${exerciseOrder}`, {
                  method: 'PUT',
                  headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
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
                await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3010'}/api/training-session/progress/methodology/${sid}/${exerciseOrder}`, {
                  method: 'PUT',
                  headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
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
                await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3010'}/api/training-session/progress/methodology/${sid}/${exerciseOrder}`, {
                  method: 'PUT',
                  headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
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
              await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3010'}/api/training-session/progress/methodology/${sid}/${exerciseOrder}`, {
                method: 'PUT',
                headers: {
                  'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
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
                await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3010'}/api/training-session/progress/methodology/${sid}/${exerciseOrder}`, {
                  method: 'PUT',
                  headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
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
                await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3010'}/api/training-session/progress/methodology/${sid}/${exerciseOrder}`, {
                  method: 'PUT',
                  headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
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
                await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3010'}/api/training-session/progress/methodology/${sid}/${exerciseOrder}`, {
                  method: 'PUT',
                  headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
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
              pendingPlanActionRef.current = null;
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
        </div>
      </div>
    </div>
  );
}
