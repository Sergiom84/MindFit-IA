import React from 'react';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import {
  getStatusClasses,
  getStatusPill,
  getSentimentDisplay,
  getExerciseName,
  getExerciseSeries,
  getExerciseReps,
  getRestTime,
  getExerciseNotes,
  getFeedbackComment,
  getFeedbackSentiment
} from '../../../utils/workoutUtils';

/**
 * Item individual de ejercicio en la lista de resumen
 * Muestra estado, nombre, datos y feedback del ejercicio
 */
export const ExerciseListItem = ({ exercise, index }) => {
  // Validación de props básica
  if (!exercise) {
    return (
      <div className="rounded-lg border p-3 border-gray-700 bg-gray-800/40">
        <div className="text-gray-400 text-sm">Ejercicio no disponible</div>
      </div>
    );
  }

  // Extracción segura de datos con manejo de errores
  const status = (exercise.status || '').toLowerCase();
  const sentiment = getFeedbackSentiment(exercise) || '';
  const comment = getFeedbackComment(exercise) || '';

  const statusClasses = getStatusClasses(status) || { bg: 'bg-gray-800/40', border: 'border-gray-700' };
  const statusPill = getStatusPill(status);
  const sentimentDisplay = getSentimentDisplay(sentiment);

  const exerciseName = getExerciseName(exercise, index) || `Ejercicio ${index + 1}`;
  const series = getExerciseSeries(exercise) || 3;
  const reps = getExerciseReps(exercise) || '—';
  const restTime = getRestTime(exercise) || 45;
  const notes = getExerciseNotes(exercise) || '';

  return (
    <div className={`rounded-lg border p-3 ${statusClasses.bg} ${statusClasses.border}`}>
      {/* Header con nombre y pills de estado */}
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold text-white">
          <span role="heading" aria-level="4">
            {exerciseName}
          </span>

          {/* Status pill */}
          {statusPill && (
            <span
              className={statusPill.className}
              aria-label={`Estado del ejercicio: ${statusPill.text}`}
            >
              {statusPill.showIcon && (
                <CheckCircle
                  className="w-3 h-3"
                  aria-hidden="true"
                />
              )}
              {statusPill.text}
            </span>
          )}

          {/* Sentiment pills */}
          {sentimentDisplay && (
            <span
              className={sentimentDisplay.className}
              aria-label={`Valoración: ${sentimentDisplay.text}`}
            >
              {sentimentDisplay.showLucideIcon ? (
                <AlertTriangle
                  className="w-3 h-3"
                  aria-hidden="true"
                />
              ) : (
                <span aria-hidden="true">{sentimentDisplay.icon}</span>
              )}
              {sentimentDisplay.text}
            </span>
          )}
        </div>

        <div
          className="text-xs text-gray-400 whitespace-nowrap"
          aria-label={`Tiempo de descanso: ${restTime} segundos`}
        >
          Descanso: {restTime}s
        </div>
      </div>

      {/* Datos del ejercicio */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-300 mt-2"
        role="group"
        aria-label="Detalles del ejercicio"
      >
        <div>
          <span className="text-gray-400">Series:</span>
          <span className="ml-1 font-medium" aria-label={`${series} series`}>
            {series}
          </span>
        </div>
        <div>
          <span className="text-gray-400">Reps:</span>
          <span className="ml-1 font-medium" aria-label={`${reps} repeticiones`}>
            {reps}
          </span>
        </div>
        <div className="md:col-span-2 text-gray-400">
          {notes && (
            <span className="text-gray-300" role="note" aria-label="Notas del ejercicio">
              {notes}
            </span>
          )}
        </div>
      </div>

      {/* 🆕 Mostrar datos de series completadas (peso, reps, RIR) */}
      {exercise.sets && exercise.sets.length > 0 && status === 'completed' && (
        <div className="mt-3 space-y-1">
          <div className="text-xs font-semibold text-gray-400 mb-1">Series completadas:</div>
          {exercise.sets.map((set, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 text-xs bg-gray-800/60 rounded px-2 py-1.5 border border-gray-700"
            >
              <span className="text-gray-400 font-medium">Serie {set.set_number}:</span>
              <span className="text-white font-semibold">{set.weight_used} kg</span>
              <span className="text-gray-300">× {set.reps_completed} reps</span>
              <span className={`ml-auto px-2 py-0.5 rounded ${
                set.rir_reported <= 2 ? 'bg-green-900/40 text-green-300' :
                set.rir_reported <= 4 ? 'bg-yellow-900/40 text-yellow-300' :
                'bg-red-900/40 text-red-300'
              }`}>
                RIR {set.rir_reported}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Comentario del feedback */}
      {comment && (
        <div
          className="mt-2 text-xs bg-yellow-900/20 border border-yellow-500/40 rounded px-2 py-1 text-yellow-200 inline-block"
          role="note"
          aria-label={`Comentario del usuario: ${comment}`}
        >
          <span aria-hidden="true">Mi comentario:</span> {comment}
        </div>
      )}
    </div>
  );
};

export default ExerciseListItem;