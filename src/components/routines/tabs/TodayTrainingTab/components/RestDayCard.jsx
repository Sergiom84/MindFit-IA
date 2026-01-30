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
    <div className="text-center py-12 px-6 rounded-2xl bg-neutral-900/70 border border-white/10 border-l-2 border-l-sky-400/30 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.75)] backdrop-blur-lg transition-all duration-300 hover:border-white/20">
      <Calendar className="w-12 h-12 text-gray-500 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-white mb-2 font-urbanist">
        {isWeekendDay ? '🌟 Fin de Semana' : isRestDay ? 'Día de descanso' : 'Entrenamiento completado'}
      </h3>

      {isWeekendDay ? (
        <>
          <p className="text-gray-300/80 mb-2">
            {dayName} - Día de descanso
          </p>
          <p className="text-yellow-300/80 text-sm mb-6">
            🎯 Es fin de semana, toca descanso.
          </p>
          <p className="text-gray-300/80 text-sm mb-8">
            El descanso es parte fundamental del progreso.<br />
            Tu cuerpo necesita recuperarse para crecer más fuerte.
          </p>

          <div className="bg-neutral-900/60 rounded-xl p-6 max-w-md mx-auto border border-white/10">
            <p className="text-gray-200/80 mb-4">
              Pero si aún así quieres entrenar, podemos generar un{' '}
              <span className="text-yellow-300 font-semibold">entrenamiento especial para hoy</span>.
            </p>

            <Button
              onClick={onGenerateWeekendWorkout}
              disabled={isLoadingWeekendWorkout}
              className="bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black px-6 py-3 rounded-lg flex items-center justify-center gap-2 mx-auto hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
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
              <p className="text-xs text-gray-400/80 mt-4">
                Este entrenamiento no afectará tu plan semanal.<br />
                Se guardará en tu histórico como sesión extra.
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="text-gray-300/80 mb-6">
          {isRestDay
            ? 'No hay entrenamientos programados para hoy. ¡Disfruta tu día de recuperación!'
            : '¡Buen trabajo! Has completado el entrenamiento de hoy.'}
        </p>
      )}
    </div>
  );
}

export default RestDayCard;
