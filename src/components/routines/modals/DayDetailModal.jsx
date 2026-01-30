import React from 'react';
import { X, Dumbbell } from 'lucide-react';

/**
 * Modal de Detalle de Día
 * Muestra los ejercicios completos de un día específico del plan
 * NO es Home Training - es solo preview de la sesión del plan
 */
const DayDetailModal = ({ isOpen, onClose, day }) => {
  if (!isOpen || !day) return null;

  const exercises = day.ejercicios || [];
  const muscleGroups = day.muscleGroups || [];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-2 sm:p-4">
      <div className="bg-neutral-900/95 border border-white/10 ring-1 ring-white/5 shadow-2xl backdrop-blur-xl rounded-2xl w-full sm:max-w-3xl max-h-[calc(100dvh-1rem)] sm:max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-neutral-900/95 border-b border-white/10 p-4 sm:p-6 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div className="flex-1">
            <h2 className="text-xl sm:text-2xl font-semibold font-urbanist text-white mb-2">
              {day.date || 'Día de Entrenamiento'}
            </h2>
            <div className="flex flex-wrap gap-2">
              {muscleGroups.map((group, idx) => (
                <span
                  key={idx}
                  className="px-3 py-1 bg-white/10 border border-white/10 rounded-full text-white text-xs sm:text-sm font-medium"
                >
                  {group}
                </span>
              ))}
            </div>
            <p className="text-gray-300/70 text-sm mt-2">
              {exercises.length} ejercicio{exercises.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="self-start sm:self-auto p-2 rounded-lg border border-white/10 bg-white/5 text-gray-300/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Exercise List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
          {exercises.length === 0 ? (
            <div className="text-center py-12 text-gray-300/70">
              <Dumbbell className="w-12 h-12 mx-auto mb-3 text-gray-300/50" />
              <p>No hay ejercicios para este día</p>
            </div>
          ) : (
            exercises.map((exercise, idx) => {
              const intensityColor = getIntensityColor(exercise.intensidad);
              
              return (
                <div
                  key={idx}
                  className="bg-white/5 border border-white/10 rounded-xl p-3 sm:p-4 hover:border-yellow-400/30 transition-colors"
                >
                  {/* Exercise Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-yellow-300 font-bold text-base sm:text-lg">
                          #{idx + 1}
                        </span>
                        <h3 className="font-semibold text-white text-base sm:text-lg">
                          {exercise.nombre || exercise.name || 'Ejercicio'}
                        </h3>
                      </div>
                      {exercise.grupo_muscular && (
                        <p className="text-sm text-gray-300/70">
                          {exercise.grupo_muscular}
                        </p>
                      )}
                    </div>
                    {exercise.intensidad && (
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${intensityColor}`}>
                        {exercise.intensidad}
                      </span>
                    )}
                  </div>

                  {/* Exercise Details */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                    {exercise.series && (
                      <div className="bg-white/5 border border-white/10 rounded-lg p-2 sm:p-3">
                        <p className="text-xs text-gray-300/60 mb-1">Series</p>
                        <p className="text-base sm:text-lg font-bold text-white">
                          {exercise.series}
                        </p>
                      </div>
                    )}
                    {exercise.repeticiones && (
                      <div className="bg-white/5 border border-white/10 rounded-lg p-2 sm:p-3">
                        <p className="text-xs text-gray-300/60 mb-1">Reps</p>
                        <p className="text-base sm:text-lg font-bold text-white">
                          {exercise.repeticiones}
                        </p>
                      </div>
                    )}
                    {exercise.descanso && (
                      <div className="bg-white/5 border border-white/10 rounded-lg p-2 sm:p-3">
                        <p className="text-xs text-gray-300/60 mb-1">Descanso</p>
                        <p className="text-base sm:text-lg font-bold text-white">
                          {exercise.descanso}s
                        </p>
                      </div>
                    )}
                    {exercise.rir !== undefined && (
                      <div className="bg-white/5 border border-white/10 rounded-lg p-2 sm:p-3">
                        <p className="text-xs text-gray-300/60 mb-1">RIR</p>
                        <p className="text-base sm:text-lg font-bold text-white">
                          {exercise.rir}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Additional Info */}
                  {exercise.notas && (
                    <div className="mt-2 p-2 bg-white/5 border border-white/10 rounded-lg">
                      <p className="text-sm text-gray-200/80">
                        {exercise.notas}
                      </p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 p-3 sm:p-4 bg-neutral-900/95">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black font-semibold rounded-xl transition-colors hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

// Helper function for intensity colors
const getIntensityColor = (intensity) => {
  if (!intensity) return 'bg-white/5 border border-white/10 text-gray-200/70';
  
  const intensityLower = intensity.toLowerCase();
  
  if (intensityLower.includes('alta') || intensityLower.includes('high')) {
    return 'bg-red-500/15 border border-red-400/30 text-red-200';
  }
  if (intensityLower.includes('media') || intensityLower.includes('medium')) {
    return 'bg-yellow-500/15 border border-yellow-400/30 text-yellow-200';
  }
  if (intensityLower.includes('baja') || intensityLower.includes('low')) {
    return 'bg-emerald-500/15 border border-emerald-400/30 text-emerald-200';
  }

  return 'bg-white/5 border border-white/10 text-gray-200/70';
};

export default DayDetailModal;

