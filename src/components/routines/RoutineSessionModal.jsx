import { alertDialog } from '../ui/dialogService.jsx';
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { X as IconX, TrendingUp } from 'lucide-react';
import { formatExerciseName, extractSessionPatterns } from '../../utils/exerciseUtils';
import ExerciseFeedbackModal from '../HomeTraining/ExerciseFeedbackModal';
import ExerciseInfoModal from './ExerciseInfoModal';
import { saveExerciseFeedback, getSessionFeedback } from './api';
import SeriesTrackingModal from '../Methodologie/methodologies/Hipertrofia/components/SeriesTrackingModal';
import ApproximationSeriesModal from '../Methodologie/methodologies/Hipertrofia/components/ApproximationSeriesModal.jsx';

// Componentes refactorizados
import { useExerciseTimer } from './session/useExerciseTimer';
import { useExerciseProgress } from './session/useExerciseProgress';
import { ExerciseSessionView } from './session/ExerciseSessionView';
import { SessionSummaryModal } from './session/SessionSummaryModal';
import tokenManager from '../../utils/tokenManager';
import { getApiBaseUrl } from '../../config/api';

const API_URL = getApiBaseUrl();

/**
 * Modal de sesión de ejercicios - REFACTORIZADO
 *
 * Ahora usa componentes organizados y hooks especializados:
 * - useExerciseTimer: Maneja timer y fases
 * - useExerciseProgress: Maneja estados y navegación
 * - ExerciseSessionView: UI del ejercicio actual
 * - SessionSummaryModal: Modal de resumen final
 *
 * Mantiene TODA la funcionalidad original:
 * - Estados: completed, skipped, cancelled, mixed
 * - Navegación inteligente
 * - Feedback de ejercicios
 * - Salida segura con confirmación
 * - Persistencia en BD al cerrar
 */
export default function RoutineSessionModal({
  session,
  onClose,
  onFinishExercise,
  onSkipExercise,
  onCancelExercise,
  onEndSession,
  sessionId,
  allowManualTimer = true,
  navigateToRoutines = null,
  isOpen = true,
  onProgressUpdate,
}) {
  const [adjustedSession, setAdjustedSession] = useState(null);
  const [menstrualAdjustment, setMenstrualAdjustment] = useState(null);
  const [menstrualExclusions, setMenstrualExclusions] = useState(null);

  // Datos de la sesión (soporta "ejercicios" y fallback a "exercises")
  const exercises = useMemo(() => {
    const sourceSession = adjustedSession || session;
    const base = Array.isArray(sourceSession?.ejercicios)
      ? sourceSession.ejercicios
      : (Array.isArray(sourceSession?.exercises) ? sourceSession.exercises : []);

    // Normalizar ids y orden para evitar desfaces entre UI y API (usamos el índice como fuente de verdad)
    return base.map((ex, idx) => ({
      ...ex,
      nombre: ex.nombre ?? ex.exercise_name ?? ex.name,
      // Índice estable para llamadas a la API (0-based)
      originalIndex: Number.isFinite(ex.originalIndex)
        ? Number(ex.originalIndex)
        : (Number.isFinite(ex.exercise_order) ? Number(ex.exercise_order) : idx),
      // Id visible/seguimiento (1-based para RIR / UI)
      exercise_id: ex.exercise_id
        ?? ex.id
        ?? ex.exerciseId
        ?? (Number.isFinite(ex.exercise_order) ? Number(ex.exercise_order) + 1 : idx + 1),
      // Orden para mostrar (1-based)
      displayOrder: idx + 1
    }));
  }, [adjustedSession, session?.ejercicios, session?.exercises]);

  // Hooks de estado (siempre llamar hooks, validar después)
  const sourceSession = adjustedSession || session;
  const progressState = useExerciseProgress(sourceSession, exercises);
  const timerState = useExerciseTimer(progressState.currentExercise, progressState.seriesTotal, 45, allowManualTimer);
  const sessionPatterns = useMemo(() => extractSessionPatterns(sourceSession), [sourceSession]);
  const methodologyTag = sourceSession?.metodologia || sourceSession?.methodology_type;
  const isHypertrofiaV2 = methodologyTag === 'HipertrofiaV2_MindFeed' || methodologyTag === 'HipertrofiaV2';
  const trackingFlag = sourceSession?.tracking_enabled ?? sourceSession?.trackingEnabled;
  const requiresSeriesTracking = isHypertrofiaV2 || trackingFlag === undefined
    ? true
    : Boolean(trackingFlag);

  // Estados locales para modales y feedback
  const [showFeedback, setShowFeedback] = useState(false);
  const [showExerciseInfo, setShowExerciseInfo] = useState(false);
  const [exerciseFeedback, setExerciseFeedback] = useState({});
  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);
  const [showExerciseToast, setShowExerciseToast] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);

  // 🎯 Estados para tracking RIR
  const [showSeriesTracking, setShowSeriesTracking] = useState(false);
  const [seriesTrackingData, setSeriesTrackingData] = useState([]);
  const [exerciseProgression, setExerciseProgression] = useState({});
  const [neuralOverlapInfo, setNeuralOverlapInfo] = useState(null);
  const [showApproximationModal, setShowApproximationModal] = useState(false);
  const [approxShownFor, setApproxShownFor] = useState(new Set());
  const currentExerciseId = progressState.currentExercise?.exercise_id || progressState.currentExercise?.id;
  const hasTrackingForCurrentSet = useMemo(() => {
    if (!currentExerciseId) return false;
    const currentId = String(currentExerciseId);
    const currentSet = Number(timerState.series);
    return seriesTrackingData.some((set) => (
      String(set.exercise_id) === currentId && Number(set.set_number) === currentSet
    ));
  }, [seriesTrackingData, currentExerciseId, timerState.series]);
  // Guards y refs
  const closingRef = useRef(false);
  const toastTimeoutRef = useRef(null);

  // Cierre seguro para evitar múltiples llamadas a onClose (según traces)
  const safeClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    onClose?.();
  }, [onClose]);

  // 🎯 Obtener progresión previa del ejercicio (para sugerencias) - MOVIDO AQUÍ PARA EVITAR ERROR DE INICIALIZACIÓN
  const fetchExerciseProgression = useCallback(async (exerciseId) => {
    if (!exerciseId) return null;

    try {
      const token = tokenManager.getToken() || tokenManager.getToken();
      let userId = null;
      try {
        userId = JSON.parse(localStorage.getItem('user'))?.id
          ?? JSON.parse(localStorage.getItem('userProfile'))?.id
          ?? null;
      } catch {
        userId = null;
      }

      if (!userId || !token) return null;

      const response = await fetch(
        `${API_URL}/api/hipertrofiav2/progression/${userId}/${exerciseId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        return data.progression;
      }
    } catch (error) {
      console.error('Error obteniendo progresión:', error);
    }

    return null;
  }, []);

  // Gestionar timeout del toast de ejercicio completado con cleanup
  useEffect(() => {
    if (!showExerciseToast) return;
    toastTimeoutRef.current = setTimeout(() => setShowExerciseToast(false), 1500);
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }
    };
  }, [showExerciseToast]);

  // Mostrar modal de series de aproximación al cambiar de ejercicio (solo HipertrofiaV2)
  useEffect(() => {
    const currentId = progressState.currentExercise?.exercise_id || progressState.currentExercise?.id;
    if (isHypertrofiaV2 && currentId && !approxShownFor.has(currentId)) {
      setShowApproximationModal(true);
      setApproxShownFor((prev) => {
        const next = new Set(prev);
        next.add(currentId);
        return next;
      });
    }
  }, [progressState.currentExercise, isHypertrofiaV2, approxShownFor]);


  // Cargar feedback existente al abrir modal
  useEffect(() => {
    if (!isOpen || !sessionId) return;
    let cancelled = false;

    const loadExistingFeedback = async () => {
      try {
        const feedbackData = await getSessionFeedback({ sessionId });
        if (cancelled) return;
        const feedbackMap = {};

        feedbackData.forEach(fb => {
          feedbackMap[fb.exercise_order] = {
            sentiment: fb.sentiment,
            comment: fb.comment
          };
        });

        setExerciseFeedback(feedbackMap);
        console.log('📝 Feedback cargado:', feedbackMap);
      } catch (error) {
        if (!cancelled) {
          console.error('Error cargando feedback existente:', error);
        }
      }
    };

    loadExistingFeedback();
    return () => { cancelled = true; };
  }, [sessionId, isOpen]);

  // 🔄 Ajuste menstrual aplicado sobre la sesión (HipertrofiaV2)
  useEffect(() => {
    const cycleDay = session?.ciclo_dia || session?.cycle_day;
    if (!isHypertrofiaV2 || !cycleDay) return;

    const loadAdjustedSession = async () => {
      try {
        const token = tokenManager.getToken() || tokenManager.getToken();
        let userProfile = {};
        try {
          userProfile = JSON.parse(localStorage.getItem('user'))
            || JSON.parse(localStorage.getItem('userProfile') || '{}')
            || {};
        } catch {
          userProfile = {};
        }
        if (!token || !userProfile?.id) return;

        const resp = await fetch(
          `${API_URL}/api/hipertrofiav2/current-session-with-adjustments/${userProfile.id}/${cycleDay}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (!resp.ok) return;
        const data = await resp.json();
        if (data?.session) {
          setAdjustedSession(prev => ({
            ...(session || {}),
            ...data.session,
            metodologia: session?.metodologia || data.session?.metodologia
          }));
          if (data.menstrual_adjustment?.adjustment) {
            setMenstrualAdjustment(data.menstrual_adjustment);
          }
          if (data.menstrual_exclusions) {
            setMenstrualExclusions(data.menstrual_exclusions);
          }
        }
      } catch (err) {
        console.error('Error aplicando ajuste menstrual en sesión HipertrofiaV2:', err);
      }
    };

    loadAdjustedSession();
  }, [isHypertrofiaV2, session, session?.ciclo_dia, session?.cycle_day]);

  // 🎯 Cargar progresión del ejercicio actual (para sugerencias de peso)
  useEffect(() => {
    if (!progressState.currentExercise?.exercise_id) return;

    const loadProgression = async () => {
      const progression = await fetchExerciseProgression(progressState.currentExercise.exercise_id);
      if (progression) {
        setExerciseProgression(prev => ({
          ...prev,
          [progressState.currentExercise.exercise_id]: progression
        }));
        console.log('📊 Progresión cargada:', progression);
      }
    };

    loadProgression();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressState.currentExercise?.exercise_id]);

  // Detectar si hay ejercicio en progreso
  const isCurrentExerciseInProgress = useCallback(() => {
    return timerState.phase === 'exercise' ||
           timerState.phase === 'rest' ||
           (timerState.phase === 'ready' && timerState.series > 1);
  }, [timerState.phase, timerState.series]);

  // Completar ejercicio actual
  const handleCompleteExercise = useCallback(() => {
    const result = progressState.actions.complete(
      timerState.seriesTotal,
      timerState.spent,
      onFinishExercise
    );

    if (result.hasNext) {
      // Hay más ejercicios -> avanzar y resetear timer
      timerState.actions.prepareNext();
      setShowExerciseToast(true);
      console.log('✅ Ejercicio completado, avanzando a ejercicio', result.nextIndex);
    } else {
      // No hay más ejercicios -> mostrar resumen
      setShowEndModal(true);
    }
  }, [progressState.actions, timerState.seriesTotal, timerState.spent, timerState.actions, onFinishExercise]);

  const handleRestEnd = useCallback(() => {
    if (timerState.series < timerState.seriesTotal) {
      if (timerState.customTimePerSeries === 0) {
        // Manual mode: increment series and wait for user to start next series
        timerState.actions._setSeries(prev => prev + 1);
        timerState.actions._setPhase('ready');
        timerState.actions._setIsRunning(false);
      } else {
        // Auto mode: next series
        timerState.actions._setSeries(prev => prev + 1);
        timerState.actions._setPhase('exercise');
        timerState.actions._setTimeLeft(timerState.baseDuration);
        timerState.actions._setIsRunning(true);
      }
    } else {
      // Ejercicio completado
      handleCompleteExercise();
    }
  }, [timerState.series, timerState.seriesTotal, timerState.customTimePerSeries, timerState.baseDuration, timerState.actions, handleCompleteExercise]);

  // Manejar auto-avance del timer
  useEffect(() => {
    if (!isOpen) return;
    if (timerState.timeLeft === 0 && timerState.isRunning) {
      if (timerState.phase === 'exercise') {
        // Fin de ejercicio -> descanso
        timerState.actions._setPhase('rest');
        timerState.actions._setTimeLeft(timerState.restDuration);
        timerState.actions._setIsRunning(true);
      } else if (timerState.phase === 'rest') {
        if (requiresSeriesTracking && !hasTrackingForCurrentSet) {
          timerState.actions._setIsRunning(false);
          setShowSeriesTracking(true);
          return;
        }
        handleRestEnd();
      }
    }
  }, [timerState.timeLeft, timerState.isRunning, timerState.phase, timerState.restDuration, isOpen, requiresSeriesTracking, hasTrackingForCurrentSet, handleRestEnd, timerState.actions]);

  useEffect(() => {
    if (!requiresSeriesTracking) return;
    if (timerState.phase !== 'rest') return;
    if (!currentExerciseId) return;
    if (hasTrackingForCurrentSet) return;
    if (showSeriesTracking) return;
    setShowSeriesTracking(true);
  }, [requiresSeriesTracking, timerState.phase, currentExerciseId, hasTrackingForCurrentSet, showSeriesTracking]);

  // Saltar ejercicio actual
  const handleSkipExercise = useCallback(() => {
    const result = progressState.actions.skip(onSkipExercise);

    if (result.hasNext) {
      timerState.actions.prepareNext();
      console.log('⏩ Saltando a ejercicio', result.nextIndex);
    } else {
      setShowEndModal(true);
    }
  }, [progressState.actions, timerState.actions, onSkipExercise]);

  // Cancelar ejercicio actual
  const handleCancelExercise = useCallback(() => {
    const result = progressState.actions.cancel(onCancelExercise);

    if (result.hasNext) {
      timerState.actions.prepareNext();
      console.log('⛔ Cancelando ejercicio', progressState.currentIndex, 'y avanzando a', result.nextIndex);
    } else {
      setShowEndModal(true);
    }
  }, [progressState.actions, timerState.actions, onCancelExercise, progressState.currentIndex]);

  // Salida inteligente con X
  const handleSmartExit = useCallback(() => {
    const currentInProgress = isCurrentExerciseInProgress();

    if (currentInProgress) {
      setShowExitConfirmModal(true);
    } else {
      safeClose();
    }
  }, [isCurrentExerciseInProgress, onClose]);

  // Manejar confirmación de salida
  const handleExitConfirmation = useCallback((action) => {
    const currentInProgress = isCurrentExerciseInProgress();

    if (currentInProgress) {
      // 🔥 CORRECCIÓN: Usar originalIndex del ejercicio actual para la API
      const originalIdx = progressState.currentExercise?.originalIndex ?? progressState.currentIndex;

      if (action === 'save-as-partial') {
        // Guardar progreso parcial
        const partialSeries = Math.max(1, timerState.series - 1);
        onFinishExercise?.(originalIdx, {
          status: 'completed',
          series_completed: partialSeries,
          time_spent_seconds: timerState.spent
        });
        progressState.actions.markAs(progressState.currentIndex, 'completed');
      } else if (action === 'skip-current') {
        onSkipExercise?.(originalIdx, {
          status: 'skipped',
          series_completed: 0,
          time_spent_seconds: 0
        });
        progressState.actions.markAs(progressState.currentIndex, 'skipped');
      } else if (action === 'cancel-current') {
        onCancelExercise?.(originalIdx, {
          status: 'cancelled',
          series_completed: 0,
          time_spent_seconds: 0
        });
        progressState.actions.markAs(progressState.currentIndex, 'cancelled');
      }
    }

    setShowExitConfirmModal(false);
    safeClose();
  }, [isCurrentExerciseInProgress, timerState.series, timerState.spent, progressState.currentIndex, progressState.currentExercise, progressState.actions, onFinishExercise, onSkipExercise, onCancelExercise, safeClose]);

  // 🎯 Guardar datos de tracking RIR
  const handleSaveSeriesTracking = useCallback(async (trackingData) => {
    try {
      console.log('💾 Guardando tracking RIR:', trackingData);
      console.log('🔍 DEBUG - trackingData.exercise_id:', trackingData.exercise_id);

      // Claves canónicas de la app: el token se guarda como 'token' y el usuario
      // como 'user'. (Antes se leían 'authToken'/'userProfile', que ya no existen,
      // por lo que userId/token salían null y el guardado fallaba antes del fetch.)
      const token = tokenManager.getToken() || tokenManager.getToken();
      let userId = null;
      try {
        userId = JSON.parse(localStorage.getItem('user'))?.id
          ?? JSON.parse(localStorage.getItem('userProfile'))?.id
          ?? null;
      } catch {
        userId = null;
      }

      if (!userId || !sessionId || !token) {
        throw new Error('Faltan datos para guardar tracking');
      }

      const payload = {
        userId,
        methodologyPlanId: session?.methodologyPlanId,
        sessionId,
        ...trackingData
      };

      console.log('🔍 DEBUG - Payload completo a enviar:', payload);
      console.log('🔍 DEBUG - Payload.exercise_id:', payload.exercise_id);

      // Guardar en backend
      const response = await fetch(
        `${API_URL}/api/hipertrofiav2/save-set`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        }
      );

      if (!response.ok) {
        throw new Error('Error guardando serie');
      }

      const result = await response.json();
      console.log('✅ Serie guardada:', result);

      // Guardar en estado local
      setSeriesTrackingData(prev => [...prev, trackingData]);

      // Actualizar progresión
      if (trackingData.exercise_id) {
        const progression = await fetchExerciseProgression(trackingData.exercise_id);
        if (progression) {
          setExerciseProgression(prev => ({
            ...prev,
            [trackingData.exercise_id]: progression
          }));
        }
      }

      // Cerrar modal de tracking
      setShowSeriesTracking(false);

      const isLastSet = trackingData.set_number >= progressState.seriesTotal;
      const restEnded = timerState.phase === 'rest' && timerState.timeLeft === 0;

      if (restEnded) {
        handleRestEnd();
      }

      if (!isLastSet) {
        setShowExerciseToast(true);
      }

    } catch (error) {
      console.error('❌ Error guardando tracking:', error);
      alertDialog('Error al guardar la serie. Por favor, intenta de nuevo.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, session?.methodologyPlanId, progressState.seriesTotal, timerState.phase, timerState.timeLeft, handleRestEnd]);

  const applyNeuralAdjustment = useCallback((weight) => {
    if (!weight || !neuralOverlapInfo?.adjustment) return weight;

    const numericWeight = Number(weight);
    if (Number.isNaN(numericWeight)) return weight;

    const factor = 1 + Number(neuralOverlapInfo.adjustment);
    return Number(Math.max(0, numericWeight * factor).toFixed(2));
  }, [neuralOverlapInfo]);

  // Guardar feedback de ejercicio
  const handleSaveFeedback = useCallback(async (payload) => {
    try {
      console.log('Enviando feedback rutina:', payload);

      if (!sessionId) {
        throw new Error('No se puede guardar feedback: falta sessionId');
      }

      // 🔥 CORRECCIÓN: Usar originalIndex para la API
      const originalIdx = progressState.currentExercise?.originalIndex ?? progressState.currentIndex;

      const savedFeedback = await saveExerciseFeedback({
        sessionId,
        exerciseOrder: originalIdx,
        sentiment: payload.sentiment,
        comment: payload.comment,
        exerciseName: formatExerciseName(progressState.currentExercise?.nombre)
      });

      // Actualizar estado local usando índice original (mismo que BD)
      setExerciseFeedback(prev => ({
        ...prev,
        [originalIdx]: {
          sentiment: payload.sentiment,
          comment: payload.comment
        }
      }));

      // Notificar al padre para refrescar calendario/progreso
      if (typeof onProgressUpdate === 'function') {
        onProgressUpdate();
      }

      console.log('✅ Feedback guardado:', savedFeedback);
    } catch (error) {
      console.error('❌ Error enviando feedback:', error);
    } finally {
      setShowFeedback(false);
    }
  }, [sessionId, progressState.currentIndex, progressState.currentExercise, onProgressUpdate]);

  if (!isOpen || !session || exercises.length === 0) return null;

  return (
    <>
      {/* Modal principal. z-[60] para cubrir la barra de navegación inferior
          (Navigation, z-50); con z-50 empataban y la barra capturaba el toque
          sobre "Comenzar", permitiendo abandonar la sesión sin querer (A-05). */}
      <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative">
          {/* Botón de cierre en la esquina superior derecha */}
          <button
            onClick={handleSmartExit}
            className="absolute top-4 right-4 text-gray-400 hover:text-white z-10"
            aria-label="Cerrar"
          >
            <IconX className="w-6 h-6" />
          </button>

          {/* Body - Vista del ejercicio */}
          <div className="p-6 space-y-4">
            {menstrualAdjustment?.adjustment && (
              <div className="p-3 rounded-lg border border-pink-500/40 bg-pink-500/10 text-pink-100 text-sm space-y-2">
                <div className="font-semibold">Ajuste por ciclo menstrual</div>
                <div className="text-pink-100/90">
                  {menstrualAdjustment.adjustment.message}
                </div>

                {/* ✨ Información de ejercicios reemplazados */}
                {menstrualExclusions?.total_replaced > 0 && (
                  <div className="mt-2 pt-2 border-t border-pink-400/30">
                    <div className="text-xs text-pink-200/80 flex items-center gap-1">
                      <span className="text-green-400">✓</span>
                      {menstrualExclusions.total_replaced} ejercicio(s) reemplazado(s) por alternativas más seguras
                    </div>
                  </div>
                )}

                {/* ✨ Información de ejercicios con advertencia crítica */}
                {menstrualExclusions?.total_warnings_critical > 0 && (
                  <div className="mt-2 pt-2 border-t border-pink-400/30">
                    <div className="text-xs text-pink-200/80 flex items-center gap-1">
                      <span className="text-red-400">⚠️</span>
                      {menstrualExclusions.total_warnings_critical} ejercicio(s) con advertencia (no se encontró alternativa)
                    </div>
                  </div>
                )}

                {/* ✨ Información de ejercicios con intensidad modificada */}
                {menstrualExclusions?.total_modified > 0 && (
                  <div className="mt-2 pt-2 border-t border-pink-400/30">
                    <div className="text-xs text-pink-200/80 flex items-center gap-1">
                      <span className="text-yellow-400">⚡</span>
                      {menstrualExclusions.total_modified} ejercicio(s) con intensidad reducida al 70%
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ✨ Detalles de ejercicios reemplazados */}
            {menstrualExclusions?.replaced_exercises?.length > 0 && (
              <div className="p-3 bg-blue-500/10 border border-blue-400/30 rounded-lg">
                <div className="text-sm font-semibold text-blue-200 mb-2">Ejercicios adaptados:</div>
                <div className="space-y-1">
                  {menstrualExclusions.replaced_exercises.map((rep, idx) => (
                    <div key={idx} className="text-xs text-blue-100/80">
                      • <span className="line-through opacity-60">{rep.original}</span> → <span className="font-medium text-blue-300">{rep.replacement}</span>
                      {rep.auto && <span className="ml-1 text-blue-400/70">(auto)</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <ExerciseSessionView
              exercise={progressState.currentExercise}
              exerciseIndex={progressState.currentIndex}
              exerciseFeedback={exerciseFeedback}
              timerState={timerState}
              timerActions={timerState.actions}
              progressState={progressState}
              onShowFeedback={() => setShowFeedback(true)}
              onShowExerciseInfo={() => setShowExerciseInfo(true)}
              onComplete={handleCompleteExercise}
              onSkip={handleSkipExercise}
              onCancel={handleCancelExercise}
              allowManualTimer={allowManualTimer}
            />
          </div>
        </div>
      </div>

      {/* Modal de feedback */}
      {showFeedback && (
        <ExerciseFeedbackModal
          show={showFeedback}
          exerciseName={formatExerciseName(progressState.currentExercise?.nombre)}
          initialFeedback={exerciseFeedback[progressState.currentExercise?.originalIndex ?? progressState.currentIndex]}
          onClose={() => setShowFeedback(false)}
          onSubmit={handleSaveFeedback}
        />
      )}

      {/* Modal de información del ejercicio */}
      {showExerciseInfo && (
        <ExerciseInfoModal
          show={showExerciseInfo}
          exercise={progressState.currentExercise}
          onClose={() => setShowExerciseInfo(false)}
        />
      )}

      {/* 🎯 Modal de Tracking RIR (HipertrofiaV2) */}
      {showSeriesTracking && progressState.currentExercise && (() => {
        // 🐛 Debug: Verificar estructura del ejercicio
        console.log('🔍 DEBUG - currentExercise:', progressState.currentExercise);
        console.log('🔍 DEBUG - exercise_id:', progressState.currentExercise?.exercise_id);
        console.log('🔍 DEBUG - id:', progressState.currentExercise?.id);

        const exerciseId = progressState.currentExercise?.exercise_id || progressState.currentExercise?.id;
        console.log('🔍 DEBUG - exerciseId final:', exerciseId);

        // Calistenia y Entrenamiento en Casa (peso corporal / material doméstico):
        // el peso/lastre es opcional, no obligatorio.
        const bodyweightExercise = /calist|casa/i.test(String(
          sourceSession?.metodologia
          || sourceSession?.methodology_type
          || sourceSession?.methodology
          || ''
        )) || ['calistenia', 'casa'].includes(progressState.currentExercise?.tipo_ejercicio);

        return (
          <SeriesTrackingModal
            exerciseName={formatExerciseName(progressState.currentExercise?.nombre)}
            exerciseId={exerciseId}
            seriesNumber={timerState.series}
            totalSeries={timerState.seriesTotal}
            previousPR={exerciseProgression[exerciseId]?.current_pr}
            suggestedWeight={applyNeuralAdjustment(exerciseProgression[exerciseId]?.target_weight_80)}
            onSave={handleSaveSeriesTracking}
            onClose={() => setShowSeriesTracking(false)}
            neuralOverlap={neuralOverlapInfo}
            isMandatory={requiresSeriesTracking}
            bodyweight={bodyweightExercise}
          />
        );
      })()}

      {/* 🔥 Modal de Series de Aproximación (solo HipertrofiaV2) */}
      {showApproximationModal && progressState.currentExercise && (
        <ApproximationSeriesModal
          show={showApproximationModal}
          onClose={() => setShowApproximationModal(false)}
          exerciseName={formatExerciseName(progressState.currentExercise?.nombre)}
        />
      )}

      {/* Toast: Ejercicio completado */}
      {showExerciseToast && (
        <div className="fixed inset-0 z-[62] flex items-start justify-center pt-24 pointer-events-none">
          <div className="bg-green-600 text-white px-4 py-2 rounded shadow-lg">
            Ejercicio completado
          </div>
        </div>
      )}

      {/* Modal de resumen final */}
      <SessionSummaryModal
        show={showEndModal}
        endTitle={progressState.endMessage.title}
        endMessage={progressState.endMessage.message}
        progressState={progressState}
        session={session}
        sessionId={sessionId}
        onClose={() => { setShowEndModal(false); safeClose(); }}
        onEndSession={onEndSession}
        navigateToRoutines={navigateToRoutines}
      />

      {/* Modal de confirmación de salida. Por encima del reproductor (z-[60]). */}
      {showExitConfirmModal && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80" onClick={() => setShowExitConfirmModal(false)} />
          <div className="relative bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-white text-lg font-semibold mb-3">⚠️ Ejercicio en progreso</h3>
            <p className="text-gray-300 mb-4">
              Tienes un ejercicio en progreso. ¿Qué quieres hacer antes de salir?
            </p>

            <div className="space-y-2">
              <button
                onClick={() => handleExitConfirmation('save-as-partial')}
                className="w-full px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-md text-sm"
              >
                💾 Guardar progreso parcial (series: {Math.max(1, timerState.series - 1)})
              </button>

              <button
                onClick={() => handleExitConfirmation('skip-current')}
                className="w-full px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-md text-sm"
              >
                ⏭️ Marcar como saltado
              </button>

              <button
                onClick={() => handleExitConfirmation('cancel-current')}
                className="w-full px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-md text-sm"
              >
                ❌ Marcar como cancelado
              </button>

              <button
                onClick={() => setShowExitConfirmModal(false)}
                className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-md text-sm"
              >
                🔙 Continuar entrenando
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mensaje de solapamiento neural */}
      {neuralOverlapInfo?.overlap && neuralOverlapInfo.overlap !== 'none' && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[62]">
          <div className="bg-orange-900/80 border border-orange-500/50 px-4 py-2 rounded-lg text-sm text-orange-100 shadow-lg">
            🧠 Solapamiento {neuralOverlapInfo.overlap === 'high' ? 'alto' : 'parcial'} detectado.
            Ajuste sugerido: {Math.round((neuralOverlapInfo.adjustment || 0) * 100)}%
          </div>
        </div>
      )}
    </>
  );
}
