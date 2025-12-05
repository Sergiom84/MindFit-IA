/**
 * @fileoverview Componente para mostrar día de descanso o fin de semana
 *
 * Muestra información sobre el día de descanso y opción de entrenamiento extra
 *
 * @module components/routines/tabs/TodayTrainingTab/components/RestDayCard
 */

import React from 'react';
import { Calendar, Dumbbell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isWeekend } from '@/utils/training/dateHelpers';

/**
 * Tarjeta de día de descanso
 *
 * @param {Object} props
 * @param {boolean} props.isRestDay - Si es día de descanso programado
 * @param {boolean} props.isLoadingWeekendWorkout - Si está cargando entrenamiento de fin de semana
 * @param {Function} props.onGenerateWeekendWorkout - Handler para generar entrenamiento de fin de semana
 * @param {boolean} props.showExtraInfo - Mostrar información adicional (texto de no afecta plan)
 */
export function RestDayCard({
  isRestDay = false,
  isLoadingWeekendWorkout = false,
  onGenerateWeekendWorkout,
  showExtraInfo = true
}) {
  const isWeekendDay = isWeekend();
  const dayName = new Date().getDay() === 0 ? 'Domingo' : 'Sábado';

  return (
    <div className="text-center py-12">
      <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-white mb-2">
        {isWeekendDay ? '🌟 Fin de Semana' : isRestDay ? 'Día de descanso' : 'Entrenamiento completado'}
      </h3>

      {isWeekendDay ? (
        <>
          <p className="text-gray-400 mb-2">
            {dayName} - Día de descanso
          </p>
          <p className="text-blue-400 text-sm mb-6">
            🎯 Es fin de semana, toca descanso.
          </p>
          <p className="text-gray-400 text-sm mb-8">
            El descanso es parte fundamental del progreso.<br />
            Tu cuerpo necesita recuperarse para crecer más fuerte.
          </p>

          <div className="bg-gray-800/50 rounded-xl p-6 max-w-md mx-auto border border-gray-700">
            <p className="text-gray-300 mb-4">
              Pero si aún así quieres entrenar, podemos generar un{' '}
              <span className="text-yellow-400 font-semibold">entrenamiento especial para hoy</span>.
            </p>

            <Button
              onClick={onGenerateWeekendWorkout}
              disabled={isLoadingWeekendWorkout}
              className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 mx-auto"
            >
              {isLoadingWeekendWorkout ? (
                <>
                  <div className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full" />
                  <span>Generando...</span>
                </>
              ) : (
                <>
                  <Dumbbell className="h-5 w-5" />
                  <span>Entrenar Extra Hoy</span>
                </>
              )}
            </Button>

            {showExtraInfo && (
              <p className="text-xs text-gray-500 mt-4">
                Este entrenamiento no afectará tu plan semanal.<br />
                Se guardará en tu histórico como sesión extra.
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="text-gray-400 mb-6">
          {isRestDay
            ? 'No hay entrenamientos programados para hoy. ¡Disfruta tu día de recuperación!'
            : '¡Buen trabajo! Has completado el entrenamiento de hoy.'}
        </p>
      )}
    </div>
  );
}

export default RestDayCard;

