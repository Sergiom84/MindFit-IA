import React, { useMemo } from 'react';
import { CalendarDays, Clock, Settings, Activity } from 'lucide-react';
import {
  getCurrentDateFormatted,
  getEquipment,
  getEstimatedDuration,
  getMethodologyName
} from '../../../utils/workoutUtils';

/**
 * Metadatos del entrenamiento - MEJORADO Y SINCRONIZADO CON BD
 * Muestra información contextual del entrenamiento con datos de Supabase
 *
 * INTEGRACIÓN CON SUPABASE:
 * - plan.methodology_type (desde methodology_plans.methodology_type)
 * - plan.selected_style (desde methodology_plans.plan_data.selected_style)
 * - plan.semanas[0].sesiones[0].duracion_sesion_min (duración desde BD)
 * - Equipamiento calculado basado en methodology_type
 * - Fecha actual real (no estática)
 */
export const WorkoutMetadata = ({ plan, session }) => {
  // Procesamiento seguro de metadatos con validación
  const metadata = useMemo(() => {
    // Validación de props
    if (!plan && !session) {
      return {
        currentDate: getCurrentDateFormatted(),
        equipment: 'No disponible',
        estimatedDuration: 'No disponible',
        methodologyName: 'No disponible'
      };
    }

    // Extraer datos usando funciones utils (ya sincronizadas con Supabase)
    const currentDate = getCurrentDateFormatted(); // Fecha REAL actual
    const equipment = getEquipment(plan) || 'Mínimo'; // Con fallback inteligente por metodología
    const estimatedDuration = getEstimatedDuration(plan, session) || '—'; // Desde BD
    const methodologyName = getMethodologyName(plan, session) || 'Entrenamiento'; // Desde BD

    return {
      currentDate: String(currentDate).trim(),
      equipment: String(equipment).trim(),
      estimatedDuration: String(estimatedDuration).trim(),
      methodologyName: String(methodologyName).trim()
    };
  }, [plan, session]);

  const { currentDate, equipment, estimatedDuration, methodologyName } = metadata;

  return (
    <section
      className="mb-4"
      role="complementary"
      aria-label="Metadatos del entrenamiento"
    >
      {/* Grid responsive de metadatos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        {/* Fecha actual */}
        <div
          className="inline-flex items-center gap-2 text-gray-400"
          role="group"
          aria-label={`Fecha del entrenamiento: ${currentDate}`}
        >
          <CalendarDays
            className="w-4 h-4 text-blue-400 flex-shrink-0"
            aria-hidden="true"
          />
          <div>
            <div className="text-gray-500 text-xs">Fecha</div>
            <div className="text-gray-300 font-medium">{currentDate}</div>
          </div>
        </div>

        {/* Equipamiento requerido */}
        <div
          className="inline-flex items-center gap-2 text-gray-400"
          role="group"
          aria-label={`Equipamiento requerido: ${equipment}`}
        >
          <Settings
            className="w-4 h-4 text-green-400 flex-shrink-0"
            aria-hidden="true"
          />
          <div>
            <div className="text-gray-500 text-xs">Equipo</div>
            <div className="text-gray-300 font-medium">{equipment}</div>
          </div>
        </div>

        {/* Tipo de metodología */}
        <div
          className="inline-flex items-center gap-2 text-gray-400"
          role="group"
          aria-label={`Tipo de entrenamiento: ${methodologyName}`}
        >
          <Activity
            className="w-4 h-4 text-yellow-400 flex-shrink-0"
            aria-hidden="true"
          />
          <div>
            <div className="text-gray-500 text-xs">Tipo</div>
            <div className="text-gray-300 font-medium">{methodologyName}</div>
          </div>
        </div>

        {/* Duración estimada */}
        <div
          className="inline-flex items-center gap-2 text-gray-400"
          role="group"
          aria-label={`Duración estimada: ${estimatedDuration}`}
        >
          <Clock
            className="w-4 h-4 text-purple-400 flex-shrink-0"
            aria-hidden="true"
          />
          <div>
            <div className="text-gray-500 text-xs">Duración</div>
            <div className="text-gray-300 font-medium">{estimatedDuration}</div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WorkoutMetadata;