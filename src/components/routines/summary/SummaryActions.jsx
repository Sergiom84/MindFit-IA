import React from 'react';
import { getSessionDayName } from '../../../utils/workoutUtils';

/**
 * Botones de acción del resumen - TEMPORALMENTE DESHABILITADO
 *
 * NOTA: Este componente se ha deshabilitado temporalmente porque:
 * - Cuando el entrenamiento se completa, solo debe mostrarse:
 *   1. Los ejercicios completados
 *   2. La barra de progreso al 100%
 * - Los botones de acción no aportan valor en el estado actual
 * - Se puede reactivar en el futuro si se necesita funcionalidad adicional
 */
export const SummaryActions = ({
  selectedSession,
  session,
  onGenerateAnother,
  onContinueTraining
}) => {
  // Componente comentado - no renderiza nada por ahora
  return null;

  /*
  const sessionDay = getSessionDayName(selectedSession, session);

  return (
    <div className="mt-5 flex flex-col sm:flex-row gap-3">
      <button
        onClick={onGenerateAnother}
        className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded transition-colors"
        aria-label="Generar otro plan de entrenamiento"
      >
        Generar Otro Plan
      </button>

      <button
        onClick={onContinueTraining}
        className="flex-1 bg-green-600 hover:bg-green-500 text-white font-semibold py-2 px-4 rounded transition-colors"
        aria-label="Marcar rutina como finalizada"
      >
        Rutina del día: {sessionDay.toString()} finalizada
      </button>
    </div>
  );
  */
};

export default SummaryActions;