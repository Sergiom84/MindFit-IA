/**
 * @fileoverview Componente de lista de ejercicios para la sesión de hoy
 * 
 * Muestra la lista de ejercicios programados con su estado de progreso
 * 
 * @module components/routines/tabs/TodayTrainingTab/components/ExerciseList
 */

import React from 'react';
import { Clock, Target } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ExerciseListItem } from '../../../summary/ExerciseListItem';

/**
 * Lista de ejercicios de la sesión de hoy
 * 
 * @param {Object} props
 * @param {Array} props.exercises - Lista de ejercicios
 * @param {Object} props.todayStatus - Estado de la sesión desde backend
 * @param {Object} props.exerciseProgress - Progreso local de ejercicios
 * @param {Object} props.session - Datos de sesión activa
 * @param {boolean} props.hasActiveSession - Si hay sesión activa
 * @param {string} props.dayName - Nombre del día actual
 * @param {number} props.estimatedDuration - Duración estimada en segundos
 * @param {string} props.methodologyType - Tipo de metodología
 */
export function ExerciseList({
  exercises = [],
  todayStatus,
  exerciseProgress = {},
  session,
  hasActiveSession,
  dayName,
  estimatedDuration = 0,
  methodologyType = 'Rutina'
}) {
  if (!exercises || exercises.length === 0) {
    return null;
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-semibold text-white">
            Sesión de {dayName}
          </h3>
          <p className="text-gray-400 mt-1">
            {exercises.length} ejercicios programados
          </p>
        </div>

        <div className="flex items-center gap-4 text-sm text-gray-400">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            <span>~{Math.round(estimatedDuration / 60)}min</span>
          </div>
          <div className="flex items-center gap-1">
            <Target className="h-4 w-4" />
            <span>{methodologyType}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {exercises.map((ejercicio, index) => {
          // Combinar datos del plan con estado desde backend
          const backendExercise = todayStatus?.exercises?.[index];

          const status = (() => {
            // Prioridad 1: Estado desde backend
            if (backendExercise?.status) {
              return String(backendExercise.status).toLowerCase();
            }
            // Prioridad 2: Estado local
            if (exerciseProgress[index]?.status) {
              return String(exerciseProgress[index].status).toLowerCase();
            }
            // Prioridad 3: Si es el ejercicio actual en sesión activa
            if (hasActiveSession && session?.currentExerciseIndex === index) {
              return 'in_progress';
            }
            // Por defecto: pendiente
            return 'pending';
          })();

          const ex = {
            ...ejercicio,
            status,
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

export default ExerciseList;

