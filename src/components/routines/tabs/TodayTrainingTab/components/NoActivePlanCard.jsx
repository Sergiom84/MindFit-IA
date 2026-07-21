/**
 * @fileoverview Estado vacío "No hay rutina programada" (ARCH-002)
 *
 * Bloque presentacional estático extraído del monolito. Comportamiento y
 * textos idénticos al original.
 *
 * @module components/routines/tabs/TodayTrainingTab/components/NoActivePlanCard
 */

import { Calendar } from 'lucide-react';

export default function NoActivePlanCard() {
  return (
    <div className="text-center py-12">
      <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-white mb-2">
        No hay rutina programada
      </h3>
      <p className="text-gray-400 mb-6">
        No tienes ninguna rutina activa. Ve a metodologías para crear una nueva rutina.
      </p>
    </div>
  );
}
