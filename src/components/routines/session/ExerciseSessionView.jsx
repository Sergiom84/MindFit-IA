import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Info, SkipForward, Star, Target, Square, TrendingUp } from 'lucide-react';
import { getExerciseGifUrl } from '@/config/exerciseGifs.js';
import { getExerciseVideoUrl } from '@/config/exerciseVideos.js';
import { formatExerciseName } from '../../../utils/exerciseUtils';

function parseRepsText(raw) {
  if (!raw) return '';
  const str = String(raw);
  if (!str.includes('x')) return str;
  const parts = str.split('x');
  if (parts.length < 2) return str;
  return parts[1].trim();
}

/**
 * Vista del ejercicio actual - Solo UI
 *
 * Extraído de RoutineSessionModal.jsx para mejor organización
 * Se encarga únicamente de mostrar la interfaz del ejercicio actual
 * Sin lógica de estado compleja, recibe todo por props
 */
export const ExerciseSessionView = ({
  // Datos del ejercicio
  exercise,
  exerciseIndex,
  exerciseFeedback,

  // Estado del timer
  timerState,
  timerActions,

  // Estado del progreso
  progressState,

  // Callbacks de acciones
  onShowFeedback,
  onShowExerciseInfo,
  onShowSeriesTracking, // 🎯 Nuevo: Callback para tracking RIR
  onComplete,
  onSkip,
  onCancel,

  // Configuración
  allowManualTimer = true,
  timePerSeriesOptions = [
    { label: '30s', value: 30 },
    { label: '45s', value: 45 },
    { label: '60s', value: 60 },
    { label: 'Off', value: 0 }
  ]
}) => {
  const [exerciseGif, setExerciseGif] = useState(null);
  const exerciseName = exercise?.nombre || exercise?.exercise_name || exercise?.name;

  // 🎬 Actualizar video/GIF cuando cambia ejercicio
  // Usa la configuración centralizada de src/config/exerciseVideos.js
  useEffect(() => {
    if (!exercise) return;

    // 🎯 PRIORIDAD DE CARGA:
    // 1. video_url de BD (producción)
    // 2. Video local (desarrollo según config)
    // 3. gif_url de BD
    // 4. GIF por defecto (getExerciseGifUrl)

    const videoUrl = getExerciseVideoUrl(exercise);

    if (videoUrl) {
      setExerciseGif(videoUrl);
    } else {
      // Fallback final: GIF por defecto
      setExerciseGif(getExerciseGifUrl(exerciseName));
    }
  }, [exercise, exerciseName]);

  if (!exercise) return null;

  const {
    phase,
    series,
    seriesTotal,
    timeLeft,
    isRunning,
    formattedTimeLeft,
    phaseColor,
    progressPercent,
    seriesText,
    isTimeBased,
    customTimePerSeries,
    canAdvanceManually,
    hasTimer
  } = timerState;

  const {
    start,
    toggle,
    reset,
    manualAdvance,
    setTimePerSeries
  } = timerActions;

  // Buscar reps en múltiples campos posibles
  let repsText = exercise?.series_reps_objetivo || exercise?.repeticiones || exercise?.reps || '';
  
  // 🎯 PARSEO INTELIGENTE: Si viene como "3-5x8-12", mostrar solo "8-12"
  // Regex busca patrón: (números) x (cualquier cosa)
  const seriesRepsMatch = typeof repsText === 'string' ? repsText.match(/^(\d+(?:-\d+)?)\s*x\s*(.+)$/i) : null;
  if (seriesRepsMatch) {
    repsText = seriesRepsMatch[2]; // Nos quedamos con la segunda parte (las reps)
  }

  // 🔥 CORRECCIÓN: Usar originalIndex para buscar feedback en BD
  const currentFeedback = exerciseFeedback?.[exercise?.originalIndex ?? exerciseIndex];

  return (
    <div className="bg-neutral-900/80 p-5 sm:p-6 rounded-2xl border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)]">
      {/* Header del ejercicio - Nueva estructura unificada */}
      <div className="flex items-center justify-between mb-4 gap-4">
        <h4 className="text-white font-semibold font-urbanist text-lg flex-1">
          {formatExerciseName(exerciseName)}
          {/* 🎯 Indicador de volumen ajustado */}
          {exercise?.intensity_adjusted && (
            <span className="inline-flex items-center gap-1 px-2 py-1 ml-2 bg-orange-500/15 text-orange-200 rounded-md text-xs font-normal border border-orange-400/30">
              <span className="text-lg">⚡</span>
              Volumen ajustado
            </span>
          )}

          {/* ✨ Indicador de ejercicio reemplazado por ciclo menstrual */}
          {exercise?.replaced && (
            <span className="inline-flex items-center gap-1 px-2 py-1 ml-2 bg-green-500/15 text-green-200 rounded-md text-xs font-normal border border-green-400/30">
              <span className="text-lg">✓</span>
              Adaptado
            </span>
          )}

          {/* ✨ Advertencia crítica - ejercicio no recomendado */}
          {exercise?.warning_level === 'critical' && (
            <span className="inline-flex items-center gap-1 px-2 py-1 ml-2 bg-red-500/15 text-red-200 rounded-md text-xs font-normal border border-red-400/30">
              <span className="text-lg">⚠️</span>
              NO RECOMENDADO
            </span>
          )}

          {/* ✨ Advertencia moderada - intensidad reducida */}
          {exercise?.modified_for_menstrual && !exercise?.replaced && (
            <span className="inline-flex items-center gap-1 px-2 py-1 ml-2 bg-yellow-500/15 text-yellow-200 rounded-md text-xs font-normal border border-yellow-400/30">
              <span className="text-lg">⚡</span>
              Intensidad reducida
            </span>
          )}

          {/* 🩹 Precaución por lesión (contraindicación blanda: se mantiene con aviso) */}
          {exercise?.precaucion_lesion && (
            <span className="inline-flex items-center gap-1 px-2 py-1 ml-2 bg-amber-500/15 text-amber-200 rounded-md text-xs font-normal border border-amber-400/30">
              <span className="text-lg">🩹</span>
              Precaución{exercise?.zona_precaucion ? ` (${exercise.zona_precaucion})` : ''}
            </span>
          )}
        </h4>
        <div className="flex items-center gap-3 text-sm">
          <div className="text-gray-200/80">
            <span className="text-yellow-300 font-semibold">Ejercicio {progressState.currentIndex + 1}</span>
            <span className="text-gray-300/70"> de {progressState.total}</span>
          </div>
          <div className="text-gray-200/80">
            <span className="text-emerald-300 font-semibold">Serie {series}</span>
            <span className="text-gray-300/70"> de {seriesTotal}</span>
          </div>
        </div>
      </div>

      {/* 🎯 Mostrar nota de ajuste si existe */}
      {exercise?.adjustment_note && (
        <div className="mb-4 text-sm text-orange-200 bg-orange-500/10 border border-orange-400/30 rounded-xl px-3 py-2">
          <span className="font-semibold">Nota:</span> {exercise.adjustment_note}
        </div>
      )}

      {/* 🩹 Aviso de precaución por lesión (se mantiene el ejercicio con adaptación) */}
      {exercise?.aviso_lesion && (
        <div className="mb-4 text-sm text-amber-100 bg-amber-500/10 border border-amber-400/30 rounded-xl px-3 py-2">
          <span className="font-semibold text-amber-300">🩹 Precaución por lesión:</span> {exercise.aviso_lesion}
        </div>
      )}

      {/* ✨ Mensaje de ejercicio reemplazado por ciclo menstrual */}
      {exercise?.replaced && (
        <div className="mb-4 text-sm text-blue-200 bg-blue-500/10 border border-blue-400/30 rounded-xl px-3 py-2 space-y-1">
          <div className="font-semibold text-blue-300">✓ Ejercicio adaptado para ciclo menstrual</div>
          <div className="text-blue-100/80">
            Reemplaza a: <span className="font-medium">{exercise.original_exercise}</span>
          </div>
          {exercise.replacement_reason && (
            <div className="text-blue-100/70 text-xs mt-1">
              Motivo: {exercise.replacement_reason}
            </div>
          )}
        </div>
      )}

      {/* ✨ Advertencia crítica - ejercicio no recomendado */}
      {exercise?.warning_level === 'critical' && (
        <div className="mb-4 text-sm text-red-200 bg-red-500/10 border border-red-400/40 rounded-xl px-3 py-2 space-y-1">
          <div className="font-semibold text-red-300">⚠️ EJERCICIO NO RECOMENDADO</div>
          <div className="text-red-100/90">
            {exercise.warning_message}
          </div>
          {exercise.menstrual_notes && (
            <div className="text-red-100/70 text-xs mt-1 pt-1 border-t border-red-400/20">
              {exercise.menstrual_notes}
            </div>
          )}
        </div>
      )}

      {/* ✨ Advertencia moderada - intensidad reducida */}
      {exercise?.modified_for_menstrual && !exercise?.replaced && (
        <div className="mb-4 text-sm text-yellow-200 bg-yellow-500/10 border border-yellow-400/30 rounded-xl px-3 py-2 space-y-1">
          <div className="font-semibold text-yellow-300">⚡ Intensidad reducida para ciclo menstrual</div>
          <div className="text-yellow-100/90">
            {exercise.warning_message || `Carga reducida al 70% durante este período`}
          </div>
          {exercise.menstrual_modification_reason && (
            <div className="text-yellow-100/70 text-xs mt-1">
              Motivo: {exercise.menstrual_modification_reason}
            </div>
          )}
        </div>
      )}

      {/* Estado y cronómetro */}
      <div className="text-center mb-6">
        <h3 className={`text-lg font-semibold mb-2 ${phaseColor}`}>
          {phase === 'ready' ? `${seriesText}` :
           phase === 'exercise' ? `${seriesText}` :
           phase === 'rest' ? 'Tiempo de descanso' :
           '¡Ejercicio completado!'}
        </h3>

        {/* Timer circular */}
        <div className="relative w-32 h-32 mx-auto mb-2">
          <div className="absolute inset-0 rounded-full border-4 border-white/10"></div>
          <div
            className={`absolute inset-0 rounded-full border-4 border-t-transparent transition-all duration-1000 ${
              phase === 'exercise' ? 'border-emerald-300' :
              phase === 'rest' ? 'border-yellow-300' :
              'border-sky-300'
            }`}
            style={{ transform: `rotate(${progressPercent}deg)` }}
          />
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <span className={`text-3xl font-bold ${
              customTimePerSeries === 0 && phase === 'exercise' ? 'text-white' :
              timeLeft === 0 ? 'text-green-400 animate-pulse' :
              'text-white'
            }`}>
              {customTimePerSeries === 0 && phase === 'exercise' ? '--:--' :
               timeLeft === 0 ? '¡Listo!' :
               formattedTimeLeft}
            </span>
            {!isRunning && (phase === 'exercise' || phase === 'rest') && timeLeft > 0 && (
              <div className="text-xs text-gray-400 mt-1">Pausado</div>
            )}
            {timeLeft === 0 && phase === 'exercise' && customTimePerSeries !== 0 && (
              <div className="text-xs text-green-400 mt-1 animate-pulse">Serie completada</div>
            )}
            {timeLeft === 0 && phase === 'rest' && (
              <div className="text-xs text-green-400 mt-1 animate-pulse">Descanso terminado</div>
            )}
          </div>
        </div>
      </div>

      {/* Información del ejercicio */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div className="rounded-xl border border-white/10 bg-white/5 py-3">
            <div className="text-2xl font-bold text-white">{seriesTotal}</div>
            <div className="text-sm text-gray-300/70">Series</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 py-3">
            <div className="text-2xl font-bold text-white">
              {isTimeBased ? `${timerState.baseDuration}s` : (repsText || '—')}
            </div>
            <div className="text-sm text-gray-300/70">
              {isTimeBased ? 'Duración' : 'Repeticiones'}
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 py-3">
            <div className="text-2xl font-bold text-white">
              {Number(exercise?.descanso_seg) || 45}s
            </div>
            <div className="text-sm text-gray-300/70">Descanso</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 py-3">
            <div className="text-2xl font-bold text-emerald-300">{series}</div>
            <div className="text-sm text-gray-300/70">Serie Actual</div>
          </div>
        </div>
      </div>

      {/* Controles principales */}
      <div className="flex flex-wrap gap-2 justify-center mb-3">
        {phase === 'ready' && (
          <button
            onClick={start}
            className="flex items-center gap-2 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black font-semibold py-2 px-4 rounded-xl shadow-[0_12px_30px_-18px_rgba(250,204,21,0.7)] hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400"
          >
            <Play className="w-4 h-4" /> Comenzar
          </button>
        )}

        {phase !== 'ready' && hasTimer && (
          <button
            onClick={toggle}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold py-2 px-4 rounded-xl border border-white/10"
          >
            {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isRunning ? 'Pausar' : 'Reanudar'}
          </button>
        )}

        {canAdvanceManually && (
          <button
            onClick={manualAdvance}
            className="flex items-center gap-2 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black font-semibold py-2 px-4 rounded-xl shadow-[0_12px_30px_-18px_rgba(250,204,21,0.7)] hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400"
          >
            <SkipForward className="w-4 h-4" /> Avanzar
          </button>
        )}

        <button
          onClick={reset}
          className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold py-2 px-4 rounded-xl border border-white/10"
          title="Reiniciar ejercicio actual"
        >
          <RotateCcw className="w-4 h-4" /> Repetir
        </button>

        <button
          onClick={onSkip}
          className="flex items-center gap-2 bg-white/5 hover:bg-white/15 text-white font-semibold py-2 px-4 rounded-xl border border-white/10"
        >
          <SkipForward className="w-4 h-4" /> Saltar Ejercicio
        </button>

        <button
          onClick={onCancel}
          className="flex items-center gap-2 bg-gradient-to-r from-red-500 via-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 text-white font-semibold py-2 px-4 rounded-xl shadow-[0_12px_30px_-18px_rgba(248,113,113,0.6)]"
        >
          <Square className="w-4 h-4" /> Cancelar Ejercicio
        </button>
      </div>

      {/* Selector de tiempo por serie */}
      {!isTimeBased && allowManualTimer && (
        <div className="flex items-center gap-2 justify-center text-sm text-gray-300/70 mb-4">
          <span>Tiempo por serie:</span>
          {timePerSeriesOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTimePerSeries(opt.value)}
              className={`px-3 py-1.5 border rounded-full text-xs transition-colors ${
                customTimePerSeries === opt.value
                  ? 'border-yellow-400/60 text-yellow-200 bg-yellow-400/10'
                  : 'border-white/10 text-gray-300/70 bg-white/5 hover:text-white hover:bg-white/10'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Botones de Información y Valorar */}
      <div className="flex items-center justify-center gap-3 mb-6">
        {/* Botón circular de información */}
        <button
          onClick={onShowExerciseInfo}
          className="w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors shadow-lg border border-white/10"
          title="Ver información detallada del ejercicio"
        >
          <Info className="w-6 h-6 text-sky-300" />
        </button>

        {/* Botón de valorar */}
        <button
          onClick={onShowFeedback}
          className={`flex items-center gap-2 border px-4 py-2 rounded-xl transition-colors shadow-md ${
            currentFeedback
              ? 'text-emerald-200 hover:text-emerald-100 border-emerald-400/40 bg-emerald-500/10'
              : 'text-yellow-200 hover:text-yellow-100 border-yellow-400/40 bg-yellow-500/10'
          }`}
          title={currentFeedback ? 'Editar valoración' : 'Cómo has sentido este ejercicio?'}
        >
          <Star className={`w-5 h-5 ${currentFeedback ? 'fill-current' : ''}`} />
          {currentFeedback ? 'Editado' : 'Valorar'}
        </button>
      </div>

      {/* Notas / Consejos de ejecución */}
      {exercise?.notas && (
        <div className="bg-white/5 border border-white/10 border-l-2 border-l-sky-400/40 rounded-xl p-4 mb-6">
          <div className="flex items-start mb-3">
            <Target className="w-4 h-4 text-sky-300 mr-2 mt-1 flex-shrink-0" />
            <h4 className="text-sky-200 font-semibold text-sm">Consejos de Ejecución</h4>
          </div>
          <p className="text-gray-200/80 text-sm leading-relaxed">{exercise.notas}</p>
        </div>
      )}

      {/* Mostrar comentario del feedback si existe */}
      {currentFeedback?.comment && currentFeedback.comment.trim() && (
        <div className="p-3 bg-yellow-400/10 border border-yellow-400/30 rounded-xl mb-6">
          <div className="flex items-start gap-2">
            <Star className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5 fill-current" />
            <div>
              <div className="text-yellow-400 font-medium text-sm mb-1">Mi comentario:</div>
              <div className="text-yellow-200 text-sm leading-relaxed">{currentFeedback.comment}</div>
            </div>
          </div>
        </div>
      )}

      {/* Mostrar valoración si existe */}
      {currentFeedback?.sentiment && (
        <div className="p-2 bg-yellow-400/10 border border-yellow-400/30 rounded-md flex items-center gap-2 mb-6">
          <Star className="w-4 h-4 text-yellow-400 fill-current" />
          <span className="text-yellow-400 font-medium text-sm">
            Valoración: {currentFeedback.sentiment === 'like' ? '👍 Me gusta' : currentFeedback.sentiment === 'hard' ? '⚠️ Es difícil' : '👎 No me gusta'}
          </span>
        </div>
      )}

      {/* Demostración del ejercicio - Simplificado */}
      <div className="mb-6">
        {exerciseGif ? (
          <div className="relative inline-block w-full">
            {/* 🎬 Detectar si es video o imagen por extensión */}
            {exerciseGif.match(/\.(mp4|webm|mov|avi)$/i) ? (
              <video
                src={exerciseGif}
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                className="mx-auto max-h-64 rounded-xl shadow-lg border border-white/10 bg-black/40"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling.style.display = 'block';
                }}
              />
            ) : (
              <img
                src={exerciseGif}
                alt={formatExerciseName(exerciseName)}
                loading="lazy"
                decoding="async"
                className="mx-auto max-h-64 rounded-xl shadow-lg border border-white/10 bg-black/40"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling.style.display = 'block';
                }}
              />
            )}
            <div className="hidden text-center py-8">
              <Target className="mx-auto mb-2 text-gray-400" size={48} />
              <p className="text-gray-400">Demostración no disponible</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <Target className="mx-auto mb-2 text-gray-400" size={48} />
            <p className="text-gray-400">Demostración no disponible</p>
          </div>
        )}
      </div>

      {/* 🎯 BOTÓN DE TRACKING RIR - Aparece durante descanso o al completar serie */}
      {onShowSeriesTracking && (phase === 'rest' || (phase === 'exercise' && !isRunning)) && (
        <div className="mb-4 p-5 rounded-2xl border border-yellow-400/30 bg-gradient-to-r from-yellow-500/10 via-amber-500/10 to-transparent shadow-[0_20px_50px_-40px_rgba(250,204,21,0.6)]">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="flex items-center gap-2 text-yellow-200 font-semibold">
              <span className="h-8 w-8 rounded-full border border-yellow-400/30 bg-yellow-400/10 flex items-center justify-center text-sm">RIR</span>
              <span className="text-sm">
                {phase === 'rest' ? 'Serie completada' : 'Registra tu serie'}
              </span>
            </div>
            <p className="text-gray-200/80 text-sm max-w-md">
              Guarda peso, repeticiones y RIR para que el sistema ajuste tu progreso con precisión.
            </p>
            <button
              onClick={onShowSeriesTracking}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 text-gray-900 font-bold py-3 px-6 rounded-xl shadow-[0_12px_30px_-18px_rgba(250,204,21,0.75)] transform transition-all hover:scale-105"
            >
              <TrendingUp className="w-5 h-5" />
              Registrar Serie (RIR)
            </button>
            <p className="text-gray-300/60 text-xs">
              Solo toma unos segundos y mejora la personalización.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExerciseSessionView;
