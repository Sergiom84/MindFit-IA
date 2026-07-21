/**
 * @fileoverview Resumen de sesión de fin de semana (weekend-extra) (ARCH-002)
 *
 * Bloque presentacional extraído del monolito. Muestra la tarjeta de resumen
 * del entrenamiento extra de fin de semana con barra de progreso, lista de
 * ejercicios (con estados) y botones de reanudar/cancelar. Sin estado propio:
 * datos y callbacks llegan por props. Comportamiento idéntico al original.
 *
 * @module components/routines/tabs/TodayTrainingTab/components/WeekendExtraSummaryCard
 */

import { RefreshCw, Play } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { ExerciseListItem } from '../../../summary/ExerciseListItem.jsx';

export default function WeekendExtraSummaryCard({
  todayStatus,
  todaySessionData,
  ui,
  handleResumeSession,
  updateLocalState
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-semibold text-white">
            🌟 Entrenamiento Extra de {new Date().toLocaleDateString('es-ES', { weekday: 'long' })}
          </h3>
          <p className="text-gray-400 mt-1">
            {todayStatus.summary.completed} completados - {todayStatus.summary.skipped} saltados - {todayStatus.summary.total} ejercicios
          </p>
        </div>
        <div className="text-sm text-gray-400">
          {"Duración total: "}
          {todayStatus.session?.total_duration_seconds
            ? Math.round(
                (todayStatus.session.total_duration_seconds + (todayStatus.session.warmup_time_seconds || 0)) / 60
              )
            : 0}
          {" min"}
        </div>
      </div>

      {/* Barra de progreso */}
      <div className="mb-6">
        <div className="flex justify-between text-sm text-gray-400 mb-2">
          <span>Progreso</span>
          <span>{todayStatus.summary.progress || 0}%</span>
        </div>
        <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              todayStatus.summary.progress === 100
                ? 'bg-green-500'
                : todayStatus.summary.progress >= 75
                  ? 'bg-yellow-400'
                  : 'bg-blue-400'
            }`}
            style={{ width: `${todayStatus.summary.progress || 0}%` }}
          />
        </div>
        {todayStatus.summary.progress === 100 && (
          <p className="text-green-400 text-sm mt-2 text-center">
            ✨ ¡Entrenamiento completado al 100%!
          </p>
        )}
      </div>

      {/* Lista de ejercicios con colores de estado */}
      <div className="space-y-2">
        {todaySessionData?.ejercicios ? (
          todaySessionData.ejercicios.map((ejercicio, index) => {
            // Combinar datos del plan con estado desde backend
            const backendExercise = todayStatus?.exercises?.[index];
            const status = backendExercise?.status || 'pending';
            const ex = {
              ...ejercicio,
              status: String(status).toLowerCase(),
              exercise_name: ejercicio.nombre,
              series_total: ejercicio.series,
              sentiment: backendExercise?.sentiment,
              comment: backendExercise?.comment
            };
            return (
              <ExerciseListItem key={index} exercise={ex} index={index} />
            );
          })
        ) : (
          // Fallback si no hay todaySessionData
          todayStatus?.exercises?.map((exercise, index) => (
            <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-gray-800">
              <div className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                  exercise.status === 'completed' ? 'bg-green-500' :
                  exercise.status === 'skipped' ? 'bg-gray-500' :
                  exercise.status === 'cancelled' ? 'bg-red-500' :
                  'bg-gray-600'
                }`}>
                  {exercise.status === 'completed' ? '✓' :
                   exercise.status === 'skipped' ? '⏭' :
                   exercise.status === 'cancelled' ? '✕' :
                   (index + 1)}
                </div>
                <span className="text-white">Ejercicio {index + 1}</span>
              </div>
              <span className={`text-sm ${
                exercise.status === 'completed' ? 'text-green-400' :
                exercise.status === 'skipped' ? 'text-gray-400' :
                exercise.status === 'cancelled' ? 'text-red-400' :
                'text-gray-500'
              }`}>
                {exercise.status === 'completed' ? 'Completado' :
                 exercise.status === 'skipped' ? 'Saltado' :
                 exercise.status === 'cancelled' ? 'Cancelado' :
                 'Pendiente'}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Texto informativo sobre la duración de la rutina weekend */}
      <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <p className="text-blue-400 text-sm text-center">
          ℹ️ Esta rutina es solo para hoy. Una vez finalizada o cuando acabe el día se eliminará,
          aunque los datos generados serán guardados en el histórico.
        </p>
      </div>

      {/* Botones de acción */}
      {console.log('🔍 DEBUG Botón Reanudar:', {
        canRetry: todayStatus.summary.canRetry,
        progress: todayStatus.summary.progress,
        shouldShow: todayStatus.summary.canRetry && todayStatus.summary.progress < 100
      })}
      <div className="mt-6 flex gap-4 justify-center">
        {/* Botón de reanudar si no está completa */}
        {todayStatus.summary.canRetry && todayStatus.summary.progress < 100 && (
          <Button
            onClick={handleResumeSession}
            className="bg-yellow-400 hover:bg-yellow-500 text-gray-900 px-6 py-3 rounded-lg"
            disabled={ui.isLoading}
          >
            {ui.isLoading ? (
              <>
                <RefreshCw className="h-5 w-5 animate-spin mr-2" />
                Iniciando...
              </>
            ) : (
              <>
                <Play className="h-5 w-5 mr-2" />
                Reanudar Entrenamiento
              </>
            )}
          </Button>
        )}

        {/* Botón de cancelar (siempre visible en sesiones weekend) */}
        <Button
          onClick={() => {
            console.log('🔴 CANCELAR CLICK - Session info:', {
              sessionId: todayStatus.session.id,
              sessionType: todayStatus.session.session_type,
              todayStatusFull: todayStatus
            });
            updateLocalState({ showRejectionModal: true, pendingCancelSessionId: todayStatus.session.id });
          }}
          variant="outline"
          className="border-red-500/30 text-red-400 hover:bg-red-500/10 px-6 py-3 rounded-lg"
          disabled={ui.isLoading}
        >
          Cancelar rutina
        </Button>
      </div>
    </Card>
  );
}
