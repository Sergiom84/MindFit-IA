import React, { useMemo } from 'react';
import { getMethodologyName, getMethodologyDescription } from '../../../utils/workoutUtils';

/**
 * Header del resumen de sesión - MEJORADO
 * Muestra el título y descripción de la metodología con validaciones robustas
 *
 * Integrado con Supabase:
 * - plan.selected_style (desde methodology_plans.plan_data.selected_style)
 * - plan.methodology_type (desde methodology_plans.methodology_type)
 * - session.methodology_type (desde methodology_exercise_sessions.methodology_type)
 */
export const SummaryHeader = ({ plan, session, planSource }) => {
  // Cálculos seguros con validación de datos de Supabase
  const safeData = useMemo(() => {
    // Validación de props básicas
    if (!plan && !session) {
      return {
        methodologyName: 'Entrenamiento de Hoy',
        methodologyDescription: 'Entrenamiento personalizado generado para ti.',
        planSourceLabel: 'Sistema'
      };
    }

    // Extraer nombre de metodología con prioridad correcta
    const methodologyName = getMethodologyName(plan, session) || 'Entrenamiento de Hoy';

    // Extraer descripción con fallback robusto
    const methodologyDescription = getMethodologyDescription(methodologyName) ||
      'Entrenamiento personalizado generado para ti.';

    // Extraer fuente del plan con fallback
    const planSourceLabel = planSource?.label || 'OpenAI';

    return {
      methodologyName: String(methodologyName).trim() || 'Entrenamiento de Hoy',
      methodologyDescription: String(methodologyDescription).trim(),
      planSourceLabel: String(planSourceLabel).trim()
    };
  }, [plan, session, planSource]);

  const { methodologyName, methodologyDescription, planSourceLabel } = safeData;

  // Determinar si mostrar indicador de estado
  const showStatusIndicator = methodologyName !== 'Entrenamiento de Hoy';

  return (
    <header role="banner" className="mb-4">
      {/* Header con título de metodología */}
      <div className="flex items-center gap-2 mb-2">
        {showStatusIndicator && (
          <div
            className="w-2 h-2 bg-yellow-400 rounded-full flex-shrink-0"
            aria-hidden="true"
            title="Plan activo"
          />
        )}
        <h1
          className="text-xl font-semibold text-white leading-tight break-words"
          aria-label={`Metodología de entrenamiento: ${methodologyName}`}
        >
          {methodologyName}
        </h1>
      </div>

      {/* Descripción de la metodología */}
      <p
        className="text-sm text-gray-300 leading-relaxed mb-2"
        role="note"
        aria-label={`Descripción: ${methodologyDescription}`}
      >
        {methodologyDescription}
      </p>

      {/* Metadata del plan */}
      <div className="text-xs text-gray-400 mb-2">
        <div className="flex items-center gap-1">
          <span aria-hidden="true">📋</span>
          <span>
            Fuente del plan: <span className="text-gray-300">{planSourceLabel}</span>
          </span>
        </div>
      </div>
    </header>
  );
};

export default SummaryHeader;