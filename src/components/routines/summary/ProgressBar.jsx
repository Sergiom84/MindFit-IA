import React, { useMemo } from 'react';

/**
 * Barra de progreso con estadísticas - VERSIÓN OPTIMIZADA
 * Calcula el porcentaje real basado en ejercicios completados del día
 * Incluye validaciones, accesibilidad y manejo de casos edge
 */
export const ProgressBar = ({ progressStats }) => {
  // Validación de props y cálculos seguros
  const safeStats = useMemo(() => {
    if (!progressStats || typeof progressStats !== 'object') {
      return {
        percentage: 0,
        completed: 0,
        total: 0,
        skipped: 0,
        cancelled: 0,
        inProgress: 0
      };
    }

    const {
      completed = 0,
      total = 0,
      skipped = 0,
      cancelled = 0
    } = progressStats;

    // Validación de números negativos
    const safeCompleted = Math.max(0, completed);
    const safeTotal = Math.max(0, total);
    const safeSkipped = Math.max(0, skipped);
    const safeCancelled = Math.max(0, cancelled);

    // Calcular porcentaje real basado en ejercicios completados
    const realPercentage = safeTotal > 0
      ? Math.round((safeCompleted / safeTotal) * 100)
      : 0;

    // Calcular ejercicios en progreso (iniciados pero no terminados)
    const processed = safeCompleted + safeSkipped + safeCancelled;
    const inProgress = Math.max(0, safeTotal - processed);

    return {
      percentage: Math.min(100, Math.max(0, realPercentage)), // Clamping 0-100
      completed: safeCompleted,
      total: safeTotal,
      skipped: safeSkipped,
      cancelled: safeCancelled,
      inProgress
    };
  }, [progressStats]);

  const { percentage, completed, total, skipped, cancelled, inProgress } = safeStats;

  // Determinar color de la barra basado en el progreso - Memoizado para evitar recálculos
  const progressColor = useMemo(() => {
    if (percentage === 100) return 'from-green-500 to-green-300'; // Completado
    if (percentage >= 75) return 'from-blue-500 to-blue-300';     // Buen progreso
    if (percentage >= 50) return 'from-yellow-500 to-yellow-300'; // Progreso medio
    if (percentage >= 25) return 'from-orange-500 to-orange-300'; // Progreso bajo
    return 'from-gray-500 to-gray-400'; // Sin progreso
  }, [percentage]);

  // Mensaje descriptivo para casos especiales - Memoizado
  const statusMessage = useMemo(() => {
    if (total === 0) return 'Sin ejercicios disponibles';
    if (completed === 0 && skipped === 0 && cancelled === 0) {
      return 'Entrenamiento no iniciado';
    }
    if (percentage === 100) return '¡Entrenamiento completado!';
    return null;
  }, [total, completed, skipped, cancelled, percentage]);

  // Mensaje de progreso accesible - Memoizado
  const accessibleProgressLabel = useMemo(() => {
    const baseLabel = `Progreso del entrenamiento: ${completed} de ${total} ejercicios completados, ${percentage} por ciento`;

    // Agregar contexto adicional para lectores de pantalla
    const additionalContext = [];
    if (skipped > 0) additionalContext.push(`${skipped} saltados`);
    if (cancelled > 0) additionalContext.push(`${cancelled} cancelados`);
    if (inProgress > 0) additionalContext.push(`${inProgress} pendientes`);

    return additionalContext.length > 0
      ? `${baseLabel}. Detalles: ${additionalContext.join(', ')}`
      : baseLabel;
  }, [completed, total, percentage, skipped, cancelled, inProgress]);

  // Determinar si se debe mostrar animación
  const shouldAnimate = percentage > 0 && percentage < 100;

  return (
    <div className="mb-6">
      {/* Header con progreso */}
      <div className="flex items-center justify-between text-sm text-gray-300 mb-1">
        <span>Progreso del día</span>
        <span
          aria-label={accessibleProgressLabel}
          className={`font-semibold transition-colors duration-300 ${
            percentage === 100 ? 'text-green-400' :
            percentage > 0 ? 'text-blue-300' :
            'text-gray-400'
          }`}
        >
          {percentage}%
        </span>
      </div>

      {/* Barra de progreso visual */}
      <div
        className="w-full h-2 bg-gray-800 rounded-full overflow-hidden border border-gray-700"
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={accessibleProgressLabel}
      >
        <div
          className={`h-full bg-gradient-to-r ${progressColor} transition-all duration-300 motion-reduce:transition-none ${
            shouldAnimate ? 'animate-pulse' : ''
          }`}
          style={{
            width: `${percentage}%`,
            // Mejora visual con sombra sutil
            boxShadow: percentage > 0 ? '0 0 10px rgba(59, 130, 246, 0.5)' : 'none'
          }}
        />
      </div>

      {/* Estadísticas detalladas */}
      <div className="mt-2 text-xs text-gray-400">
        {statusMessage ? (
          <span className="text-gray-300 font-medium">{statusMessage}</span>
        ) : (
          <div className="flex flex-wrap gap-x-2 gap-y-1">
            <span className="text-gray-300">
              {completed}/{total} completados
            </span>
            {inProgress > 0 && (
              <span className="text-blue-300">• {inProgress} pendientes</span>
            )}
            {skipped > 0 && (
              <span className="text-yellow-300">• {skipped} saltados</span>
            )}
            {cancelled > 0 && (
              <span className="text-red-300">• {cancelled} cancelados</span>
            )}
          </div>
        )}
      </div>

      {/* Indicador visual adicional para completado */}
      {percentage === 100 && total > 0 && (
        <div
          className="mt-2 text-xs text-green-300 font-medium flex items-center gap-1"
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true">✅</span>
          <span>¡Excelente trabajo! Has completado todos los ejercicios del día.</span>
        </div>
      )}

      {/* Indicador de advertencia para muchos ejercicios saltados/cancelados */}
      {total > 0 && (skipped + cancelled) / total > 0.3 && percentage < 100 && (
        <div
          className="mt-2 text-xs text-yellow-300 flex items-center gap-1"
          role="alert"
        >
          <span aria-hidden="true">⚠️</span>
          <span>
            Tienes varios ejercicios sin completar.
            {inProgress > 0 && ' ¡Aún puedes continuar!'}
          </span>
        </div>
      )}
    </div>
  );
};

export default ProgressBar;