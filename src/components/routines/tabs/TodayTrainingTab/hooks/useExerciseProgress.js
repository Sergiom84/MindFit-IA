/**
 * @fileoverview Hook para gestión del progreso de ejercicios
 * 
 * Proporciona:
 * - Tracking de series completadas por ejercicio
 * - Navegación entre ejercicios
 * - Cálculo de progreso total de la sesión
 * 
 * @module components/routines/tabs/TodayTrainingTab/hooks/useExerciseProgress
 */

import { useState, useCallback, useMemo } from 'react';

/**
 * Hook para gestionar el progreso de ejercicios en una sesión
 * 
 * @param {Object} params
 * @param {Array} params.exercises - Lista de ejercicios de la sesión
 * @returns {Object} Estado y funciones de progreso
 */
export function useExerciseProgress({ exercises = [] }) {
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [exerciseProgress, setExerciseProgress] = useState({});

  // Ejercicio actual
  const currentExercise = useMemo(() => {
    return exercises[currentExerciseIndex] || null;
  }, [exercises, currentExerciseIndex]);

  // Total de ejercicios
  const totalExercises = exercises.length;

  // Verificar si hay ejercicio siguiente
  const hasNextExercise = currentExerciseIndex < totalExercises - 1;

  // Verificar si hay ejercicio anterior
  const hasPreviousExercise = currentExerciseIndex > 0;

  // Ir al siguiente ejercicio
  const goToNextExercise = useCallback(() => {
    if (hasNextExercise) {
      setCurrentExerciseIndex(prev => prev + 1);
    }
  }, [hasNextExercise]);

  // Ir al ejercicio anterior
  const goToPreviousExercise = useCallback(() => {
    if (hasPreviousExercise) {
      setCurrentExerciseIndex(prev => prev - 1);
    }
  }, [hasPreviousExercise]);

  // Ir a un ejercicio específico
  const goToExercise = useCallback((index) => {
    if (index >= 0 && index < totalExercises) {
      setCurrentExerciseIndex(index);
    }
  }, [totalExercises]);

  // Actualizar progreso de un ejercicio
  const updateExerciseProgress = useCallback((exerciseIndex, progressData) => {
    setExerciseProgress(prev => ({
      ...prev,
      [exerciseIndex]: {
        ...prev[exerciseIndex],
        ...progressData
      }
    }));
  }, []);

  // Marcar serie como completada
  const completeSet = useCallback((exerciseIndex, setNumber, data = {}) => {
    setExerciseProgress(prev => {
      const current = prev[exerciseIndex] || { completedSets: [], totalSets: 0 };
      const completedSets = [...(current.completedSets || [])];
      
      if (!completedSets.includes(setNumber)) {
        completedSets.push(setNumber);
      }

      return {
        ...prev,
        [exerciseIndex]: {
          ...current,
          completedSets,
          lastSetData: data,
          updatedAt: new Date().toISOString()
        }
      };
    });
  }, []);

  // Obtener progreso de un ejercicio específico
  const getExerciseProgress = useCallback((exerciseIndex) => {
    return exerciseProgress[exerciseIndex] || { completedSets: [], totalSets: 0 };
  }, [exerciseProgress]);

  // Calcular progreso total de la sesión
  const sessionProgress = useMemo(() => {
    if (totalExercises === 0) return { completed: 0, total: 0, percentage: 0 };

    let totalSets = 0;
    let completedSets = 0;

    exercises.forEach((exercise, index) => {
      const sets = parseInt(exercise.series || exercise.sets || 3);
      totalSets += sets;
      
      const progress = exerciseProgress[index];
      if (progress?.completedSets) {
        completedSets += progress.completedSets.length;
      }
    });

    return {
      completed: completedSets,
      total: totalSets,
      percentage: totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0
    };
  }, [exercises, exerciseProgress, totalExercises]);

  // Verificar si todos los ejercicios están completados
  const allExercisesCompleted = useMemo(() => {
    if (totalExercises === 0) return false;

    return exercises.every((exercise, index) => {
      const sets = parseInt(exercise.series || exercise.sets || 3);
      const progress = exerciseProgress[index];
      return progress?.completedSets?.length >= sets;
    });
  }, [exercises, exerciseProgress, totalExercises]);

  // Resetear progreso
  const resetProgress = useCallback(() => {
    setCurrentExerciseIndex(0);
    setExerciseProgress({});
  }, []);

  return {
    // Estado actual
    currentExerciseIndex,
    currentExercise,
    totalExercises,
    exerciseProgress,
    
    // Navegación
    hasNextExercise,
    hasPreviousExercise,
    goToNextExercise,
    goToPreviousExercise,
    goToExercise,
    
    // Progreso
    updateExerciseProgress,
    completeSet,
    getExerciseProgress,
    sessionProgress,
    allExercisesCompleted,
    resetProgress
  };
}

export default useExerciseProgress;

