import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Hook personalizado para manejar el timer y las fases de ejercicio
 *
 * Extraído de RoutineSessionModal.jsx para mejor organización
 * Maneja las fases: ready | exercise | rest | done
 */
export const useExerciseTimer = (currentExercise, seriesTotal, timePerSeries = 45, allowManualTimer = true) => {
  // Estados del timer
  const [phase, setPhase] = useState('ready');
  const [series, setSeries] = useState(1);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [spent, setSpent] = useState(0);
  const [advancedManually, setAdvancedManually] = useState(false);
  const [customTimePerSeries, setCustomTimePerSeries] = useState(timePerSeries);

  const intervalRef = useRef(null);

  // Cálculos del ejercicio
  // 🎯 CORRECCIÓN: Verificar primero si es tipo "reps" (tiene series/repeticiones)
  const hasReps = (currentExercise?.series || currentExercise?.repeticiones);
  const durValue = Number(currentExercise?.duracion_seg ?? currentExercise?.duracion ?? currentExercise?.tiempo_segundos);

  // Solo es basado en tiempo si:
  // 1. Tiene duracion_seg/duracion/tiempo_segundos > 0, Y
  // 2. NO tiene series/repeticiones (es tipo "tiempo", no tipo "reps")
  const isTimeBased = (Number.isFinite(durValue) && durValue > 0) && !hasReps;

  const baseDuration = isTimeBased ? durValue : customTimePerSeries;
  const restDuration = Math.min(120, Math.max(30, Number(currentExercise?.descanso_seg) || 60));

  // Formatear tiempo
  const formatTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Color por fase
  const getPhaseColor = useCallback(() => {
    switch (phase) {
      case 'ready': return 'text-blue-400';
      case 'exercise': return 'text-green-400';
      case 'rest': return 'text-yellow-400';
      case 'done': return 'text-purple-400';
      default: return 'text-white';
    }
  }, [phase]);

  // Limpiar interval al desmontar
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Timer principal
  useEffect(() => {
    if (!isRunning) return;

    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => (t > 0 ? t - 1 : 0));
      setSpent((s) => s + 1);
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [isRunning]);

  // Iniciar ejercicio
  const startExercise = useCallback(() => {
    setAdvancedManually(false);
    setPhase('exercise');
    if (baseDuration > 0) {
      setTimeLeft(baseDuration);
      setIsRunning(true);
    } else {
      setTimeLeft(0);
      setIsRunning(false);
    }
  }, [baseDuration]);

  // Pausar/reanudar timer
  const toggleTimer = useCallback(() => {
    setIsRunning(prev => !prev);
  }, []);

  // Avance manual (para ejercicios sin timer)
  const handleManualAdvance = useCallback(() => {
    // In manual mode, don't increment series here - wait until rest finishes
    setPhase('rest');
    setTimeLeft(restDuration);
    setIsRunning(true);
  }, [restDuration]);

  // Reiniciar ejercicio actual
  const resetExercise = useCallback(() => {
    setPhase('ready');
    setSeries(1);
    setTimeLeft(0);
    setIsRunning(false);
    setAdvancedManually(false);
    setSpent(0);
  }, []);

  // Cambiar tiempo por serie (para ejercicios por repeticiones)
  const setTimePerSeries = useCallback((newTime) => {
    setCustomTimePerSeries(newTime);
    if (phase === 'exercise') {
      setTimeLeft(newTime);
      setIsRunning(newTime > 0);
    }
  }, [phase]);

  // Forzar pasar a fase de descanso
  const forceRestPhase = useCallback(() => {
    setPhase('rest');
    setTimeLeft(restDuration);
    setIsRunning(true);
  }, [restDuration]);

  // Forzar completar ejercicio
  const forceCompleteExercise = useCallback(() => {
    setPhase('done');
    setIsRunning(false);
  }, []);

  // Preparar para siguiente ejercicio
  const prepareNextExercise = useCallback(() => {
    setPhase('ready');
    setSeries(1);
    setTimeLeft(0);
    setIsRunning(false);
    setAdvancedManually(false);
    setSpent(0);
  }, []);

  // Estado computed
  const timerState = {
    phase,
    series,
    timeLeft,
    isRunning,
    spent,
    seriesTotal,
    baseDuration,
    restDuration,
    isTimeBased,
    customTimePerSeries,
    advancedManually,

    // Status helpers
    isReady: phase === 'ready',
    isExercising: phase === 'exercise',
    isResting: phase === 'rest',
    isDone: phase === 'done',
    canAdvanceManually: phase === 'exercise' && customTimePerSeries === 0,
    hasTimer: customTimePerSeries > 0 || isTimeBased,

    // Display helpers
    formattedTimeLeft: formatTime(timeLeft),
    formattedSpent: formatTime(spent),
    phaseColor: getPhaseColor(),
    progressPercent: baseDuration > 0 ? ((baseDuration - timeLeft) / baseDuration) * 100 : 0,

    // Series progress
    seriesText: `Serie ${series}/${seriesTotal}`,
    isLastSeries: series >= seriesTotal
  };

  // Acciones disponibles
  const timerActions = {
    start: startExercise,
    toggle: toggleTimer,
    pause: () => setIsRunning(false),
    resume: () => setIsRunning(true),
    reset: resetExercise,
    manualAdvance: handleManualAdvance,
    setTimePerSeries,
    forceRest: forceRestPhase,
    forceComplete: forceCompleteExercise,
    prepareNext: prepareNextExercise,

    // Control interno de fases
    _setPhase: setPhase,
    _setSeries: setSeries,
    _setTimeLeft: setTimeLeft,
    _setIsRunning: setIsRunning
  };

  return {
    ...timerState,
    actions: timerActions
  };
};

export default useExerciseTimer;