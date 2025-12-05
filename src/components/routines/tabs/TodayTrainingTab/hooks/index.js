/**
 * @fileoverview Índice de hooks para TodayTrainingTab
 * 
 * Exporta todos los hooks especializados para el componente TodayTrainingTab
 * 
 * @module components/routines/tabs/TodayTrainingTab/hooks
 */

export { useDayCalculation } from './useDayCalculation';
export { useSessionStatus } from './useSessionStatus';
export { useExerciseProgress } from './useExerciseProgress';

// Re-export default para compatibilidad
export { default as useDayCalculationDefault } from './useDayCalculation';
export { default as useSessionStatusDefault } from './useSessionStatus';
export { default as useExerciseProgressDefault } from './useExerciseProgress';

