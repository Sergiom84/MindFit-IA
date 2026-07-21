/**
 * @fileoverview Resumen de sesión completada exitosamente (ARCH-002)
 *
 * Bloque presentacional extraído del monolito. Muestra la tarjeta con el
 * resumen del día completado y la lista de ejercicios con su feedback. Sin
 * estado propio; comportamiento idéntico al original.
 *
 * @module components/routines/tabs/TodayTrainingTab/components/CompletedSessionSummaryCard
 */

import { Card } from '@/components/ui/card.jsx';
import { ExerciseListItem } from '../../../summary/ExerciseListItem.jsx';

export default function CompletedSessionSummaryCard({
  currentTodayName,
  todayStatus,
  todaySessionData
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-semibold text-white">Resumen de hoy ({currentTodayName})</h3>
          <p className="text-gray-400 mt-1">
            {todayStatus.summary.completed} completados - {todayStatus.summary.skipped} saltados - {todayStatus.summary.total} ejercicios
          </p>
        </div>
        <div className="text-sm text-gray-400">
          {"Duracion total: "}
          {todayStatus.session?.total_duration_seconds
            ? Math.round(
                (todayStatus.session.total_duration_seconds + (todayStatus.session.warmup_time_seconds || 0)) / 60
              )
            : 0}
          {" min"}
        </div>
      </div>

      <div className="space-y-2">
        {todaySessionData.ejercicios.map((ejercicio, index) => {
          // Combinar datos del plan con estado desde backend
          const backendExercise = todayStatus?.exercises?.[index];
          const status = backendExercise?.status || 'completed';
          const ex = {
            ...ejercicio,
            status: String(status).toLowerCase(),
            exercise_name: ejercicio.nombre,
            series_total: ejercicio.series,
            // 🎯 NUEVO: Agregar feedback desde backend
            sentiment: backendExercise?.sentiment,
            comment: backendExercise?.comment
          };
          return (
            <ExerciseListItem key={index} exercise={ex} index={index} />
          );
        })}
      </div>
    </Card>
  );
}
