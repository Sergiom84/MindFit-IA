import { useState, useEffect, useMemo, useCallback } from "react";
import { Thermometer, Clock, Play, Pause, SkipForward, X, CheckCircle } from "lucide-react";

const WARMUP_LIBRARY = {
  funcional: [
    { name: "Movilidad articular total", duration: 45, description: "Circulos abiertos de hombros, cadera y tobillos" },
    { name: "Marcha con elevacion de rodillas", duration: 40, description: "Rodillas al pecho manteniendo el core activo" },
    { name: "Plancha activa con toques de hombro", duration: 35, description: "Alterna manos manteniendo la cadera estable" },
    { name: "Estocadas dinamicas", duration: 40, description: "Paso amplio con giro suave del tronco" },
    { name: "Jumping jacks controlados", duration: 35, description: "Manten un ritmo moderado para elevar temperatura" }
  ],
  hiit: [
    { name: "Skipping en el sitio", duration: 40, description: "Ritmo rapido, brazos acompanan el movimiento" },
    { name: "Squat reach", duration: 35, description: "Sentadilla corta con extension de brazos arriba" },
    { name: "Escaladores", duration: 40, description: "Rodillas al pecho manteniendo hombros sobre las manos" },
    { name: "Burpee modificado", duration: 35, description: "Sin salto, controla la bajada" },
    { name: "Shadow boxing", duration: 30, description: "Golpes suaves alternando guardia" }
  ],
  fuerza: [
    { name: "Puente de gluteo controlado", duration: 40, description: "Activa cadena posterior con subida progresiva" },
    { name: "Good morning con peso corporal", duration: 35, description: "Bisagra de cadera con espalda neutra" },
    { name: "Flexiones con tempo", duration: 45, description: "3 segundos bajada, 1 segundo subida" },
    { name: "Sentadillas con pausa", duration: 45, description: "Detente 2 segundos en el fondo" },
    { name: "Remo elastico ligero", duration: 40, description: "Apreta escapulas al final del recorrido" }
  ]
};

const LEVEL_MULTIPLIER = {
  principiante: 0.85,
  "basico": 0.9,
  "intermedio": 1,
  "avanzado": 1.15
};

function normalizeLevel(level) {
  if (!level) return "intermedio";
  const normalized = level.toString().toLowerCase();
  if (normalized.includes("avanz")) return "avanzado";
  if (normalized.includes("inter")) return "intermedio";
  if (normalized.includes("bas") || normalized.includes("bas")) return "basico";
  if (normalized.includes("princ")) return "principiante";
  return "intermedio";
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function HomeTrainingWarmupModal({
  isOpen,
  trainingType = "funcional",
  level = "intermedio",
  onSkip,
  onComplete,
  onClose
}) {
  const normalizedLevel = normalizeLevel(level);

  const exercises = useMemo(() => {
    const base = WARMUP_LIBRARY[trainingType] || WARMUP_LIBRARY.funcional;
    const multiplier = LEVEL_MULTIPLIER[normalizedLevel] ?? 1;

    return base.map((exercise) => ({
      ...exercise,
      duration: Math.max(20, Math.round(exercise.duration * multiplier))
    }));
  }, [trainingType, normalizedLevel]);

  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(exercises[0]?.duration || 30);
  const [isRunning, setIsRunning] = useState(false);
  const [totalTimeSpent, setTotalTimeSpent] = useState(0);

  const currentExercise = exercises[currentExerciseIndex];
  const totalExercises = exercises.length;

  useEffect(() => {
    if (!isOpen) return;
    setCurrentExerciseIndex(0);
    setTotalTimeSpent(0);
    setIsRunning(false);
    setTimeLeft(exercises[0]?.duration || 30);
  }, [isOpen, exercises]);

  useEffect(() => {
    if (!isOpen || !isRunning) return;
    const tick = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
      setTotalTimeSpent((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(tick);
  }, [isOpen, isRunning]);

  const goToNextExercise = useCallback(() => {
    setIsRunning(false);
    if (currentExerciseIndex < totalExercises - 1) {
      setCurrentExerciseIndex((prev) => prev + 1);
      const nextDuration = exercises[currentExerciseIndex + 1]?.duration || 30;
      setTimeLeft(nextDuration);
      setIsRunning(true);
    } else {
      onComplete?.();
      onClose?.();
    }
  }, [currentExerciseIndex, totalExercises, exercises, onComplete, onClose]);

  useEffect(() => {
    if (!isOpen || !isRunning) return;
    if (timeLeft === 0) {
      goToNextExercise();
    }
  }, [timeLeft, isRunning, isOpen, goToNextExercise]);

  if (!isOpen) {
    return null;
  }

  const progressPercent = totalExercises > 0 ? ((currentExerciseIndex) / totalExercises) * 100 : 0;

  const handleStart = () => setIsRunning(true);
  const handlePause = () => setIsRunning(false);

  const handleSkipWarmup = () => {
    setIsRunning(false);
    onSkip?.();
    onClose?.();
  };

  const handleManualNext = () => {
    goToNextExercise();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div
        className="w-full max-w-2xl rounded-3xl border border-white/10 bg-neutral-900/90 text-white shadow-[0_40px_90px_-60px_rgba(0,0,0,0.9)] ring-1 ring-white/10"
        role="dialog"
        aria-modal="true"
        aria-label="Calentamiento previo"
      >
        <header className="flex items-center justify-between border-b border-white/10 p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full border border-orange-400/30 bg-orange-500/10 flex items-center justify-center">
              <Thermometer className="h-5 w-5 text-orange-300" />
            </div>
            <div>
              <h2 className="flex items-center text-xl font-semibold font-urbanist">
              Calentamiento recomendado
            </h2>
              <p className="text-sm text-gray-300/70">
                Tipo {trainingType.toUpperCase()} · Nivel {normalizedLevel.toUpperCase()}
            </p>
          </div>
          </div>
          <button
            onClick={() => {
              setIsRunning(false);
              onClose?.();
            }}
            className="rounded-full p-2 text-gray-300 transition hover:text-white bg-white/5 border border-white/10"
            aria-label="Cerrar modal de calentamiento"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="border-b border-white/10 px-5 py-3">
          <div className="h-2 rounded-full bg-white/10">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-yellow-300 via-orange-400 to-red-400 transition-all"
              style={{ width: `${Math.min(progressPercent + (isRunning ? (1 / Math.max(totalExercises, 1)) * 100 : 0), 100)}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-gray-300/70">
            <span>
              Ejercicio {currentExerciseIndex + 1} de {totalExercises}
            </span>
            <span>Tiempo total: {formatTime(totalTimeSpent)}</span>
          </div>
        </div>

        <section className="space-y-6 px-6 py-6">
          <div className="text-center">
            <p className="text-sm uppercase tracking-[0.3em] text-gray-300/70">Preparacion actual</p>
            <h3 className="mt-2 text-2xl font-semibold font-urbanist text-white">{currentExercise?.name ?? "Calentamiento"}</h3>
            <p className="mt-2 text-base text-gray-200/80">
              {currentExercise?.description ?? "Activa el cuerpo antes del entrenamiento principal."}
            </p>
          </div>

          <div className="flex flex-col items-center">
            <div className="text-6xl font-bold text-orange-300">{formatTime(timeLeft)}</div>
            <div className="mt-2 flex items-center text-sm text-gray-300/70">
              <Clock className="mr-2 h-4 w-4" />
              Manten la tecnica controlada durante todo el tiempo
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            {!isRunning ? (
              <button
                onClick={handleStart}
                className="flex items-center rounded-xl bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500 px-5 py-3 text-sm font-semibold text-black transition hover:from-emerald-300 hover:to-teal-400 shadow-[0_12px_30px_-18px_rgba(16,185,129,0.6)]"
              >
                <Play className="mr-2 h-5 w-5" />
                {timeLeft === (currentExercise?.duration || 30) ? "Iniciar calentamiento" : "Reanudar"}
              </button>
            ) : (
              <button
                onClick={handlePause}
                className="flex items-center rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/20 border border-white/10"
              >
                <Pause className="mr-2 h-5 w-5" />
                Pausar
              </button>
            )}

            <button
              onClick={handleManualNext}
              className="flex items-center rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/20 border border-white/10"
            >
              <SkipForward className="mr-2 h-5 w-5" />
              {currentExerciseIndex < totalExercises - 1 ? "Siguiente ejercicio" : "Finalizar"}
            </button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h4 className="flex items-center text-sm font-semibold text-gray-200/80">
              <CheckCircle className="mr-2 h-4 w-4 text-emerald-300" />
              Secuencia completa
            </h4>
            <ul className="mt-3 space-y-2 text-sm text-gray-300/70">
              {exercises.map((exercise, index) => (
                <li key={exercise.name} className="flex items-center justify-between">
                  <span className={index === currentExerciseIndex ? "text-white" : ""}>{exercise.name}</span>
                  <span>{formatTime(exercise.duration)}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <footer className="flex items-center justify-between border-t border-white/10 bg-black/30 px-5 py-3 text-xs text-gray-300/70">
          <button onClick={handleSkipWarmup} className="text-gray-200/80 transition hover:text-white">
            Saltar calentamiento
          </button>
          <span>Completar el calentamiento mejora el rendimiento y reduce lesiones</span>
        </footer>
      </div>
    </div>
  );
}
