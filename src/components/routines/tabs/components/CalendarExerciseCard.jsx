/**
 * 🏃 Calendar Exercise Card - Tarjeta de ejercicio para el calendario
 *
 * RAZONAMIENTO:
 * - Extraído de CalendarTab.jsx para reducir complejidad (líneas 451-515)
 * - Componente especializado para mostrar ejercicios en el calendario
 * - Reutilizable y con mejor separación de responsabilidades
 */

import { getSentimentIcon } from '../../../../utils/exerciseUtils';

/**
 * Tarjeta individual de ejercicio para el calendario
 */
export const CalendarExerciseCard = ({
  ejercicio,
  exIndex,
  status,
  progress,
  className = ""
}) => {
  const sentimentData = getSentimentIcon(progress?.sentiment);
  const hasComment = !!(progress?.comment && progress.comment.trim());
  const seriesCompleted = progress?.series_completed ?? 0;

  // Colores por estado
  const rowClass =
    status === 'completed' ? 'bg-emerald-900/20 border-emerald-400/20' :
    status === 'skipped'   ? 'bg-white/5 border-white/10 opacity-90' :
    status === 'cancelled' ? 'bg-red-900/20 border-red-400/20' :
                             'bg-black/40 border-white/10';

  const nameClass =
    status === 'completed' ? 'text-emerald-200' :
    status === 'skipped'   ? 'text-gray-300' :
    status === 'cancelled' ? 'text-red-300'  :
                             'text-white';

  return (
    <div
      className={`text-xs pb-2 last:border-b-0 border rounded-md px-2 py-2 ${rowClass} ${className}`}
    >
      {/* Fila superior: nombre + descanso */}
      <div className="flex items-start justify-between">
        <div className={`font-medium ${nameClass}`}>
          {ejercicio.nombre}
        </div>
        {ejercicio.descanso_seg && (
          <span className="text-gray-300/70">{Math.round(ejercicio.descanso_seg / 60)}'</span>
        )}
      </div>

      {/* Fila media: series x repeticiones + progreso de series */}
      <div className="flex items-center justify-between text-xs text-gray-300/70 mt-0.5">
        <span>{ejercicio.series} × {ejercicio.repeticiones}</span>
        {status && <span className="text-[11px]">{seriesCompleted}/{ejercicio.series} series</span>}
      </div>

      {/* Fila inferior: chip de sentimiento + comentario */}
      {(sentimentData || hasComment) && (
        <div className="flex items-center gap-2 mt-1">
          {sentimentData && (
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md border ${sentimentData.bg} ${sentimentData.border}`}>
              <sentimentData.Icon className={`w-3 h-3 mr-1 ${sentimentData.color}`} />
              <span className={`text-[10px] ${sentimentData.color}`}>{sentimentData.label}</span>
            </span>
          )}
          {hasComment && (
            <span className="text-[11px] text-gray-300/70 italic truncate">"{progress.comment}"</span>
          )}
        </div>
      )}
    </div>
  );
};

export default CalendarExerciseCard;
