/**
 * @fileoverview Componente de resumen de sesión completada
 * 
 * Muestra el resumen de una sesión de entrenamiento completada
 * 
 * @module components/routines/tabs/TodayTrainingTab/components/SessionSummary
 */

import React from 'react';
import { CheckCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ExerciseListItem } from '../../../summary/ExerciseListItem';

/**
 * Resumen de sesión completada
 * 
 * @param {Object} props
 * @param {Object} props.todayStatus - Estado de la sesión desde backend
 * @param {Array} props.exercises - Lista de ejercicios
 * @param {string} props.dayName - Nombre del día
 */
export function SessionSummary({
  todayStatus,
  exercises = [],
  dayName
}) {
  if (!todayStatus?.session) {
    return null;
  }

  const { summary, session } = todayStatus;
  const totalDuration = session?.total_duration_seconds 
    ? Math.round((session.total_duration_seconds + (session.warmup_time_seconds || 0)) / 60)
    : 0;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <CheckCircle className="h-6 w-6 text-green-500" />
          <div>
            <h3 className="text-xl font-semibold text-white">
              Resumen de hoy ({dayName})
            </h3>
            <p className="text-gray-400 mt-1">
              {summary?.completed || 0} completados - {summary?.skipped || 0} saltados - {summary?.total || exercises.length} ejercicios
            </p>
          </div>
        </div>
        <div className="text-sm text-gray-400">
          Duración total: {totalDuration} min
        </div>
      </div>

      <div className="space-y-2">
        {exercises.map((ejercicio, index) => {
          const backendExercise = todayStatus?.exercises?.[index];
          const status = backendExercise?.status || 'completed';
          
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
        })}
      </div>
    </Card>
  );
}

export default SessionSummary;

