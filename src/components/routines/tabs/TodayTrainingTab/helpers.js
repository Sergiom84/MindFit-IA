/**
 * @fileoverview Helpers puros para TodayTrainingTab (ARCH-002)
 *
 * Cálculos sin estado extraídos del monolito para reducir su tamaño sin
 * alterar el comportamiento. Sin dependencias de React ni de contextos.
 *
 * @module components/routines/tabs/TodayTrainingTab/helpers
 */

/**
 * Estima la duración total (en segundos) de una lista de ejercicios.
 *
 * Réplica exacta de la estimación original: (2 * reps * sets) por trabajo
 * más los descansos entre series (rest * (sets - 1)).
 *
 * @param {Array<Object>|null|undefined} ejercicios
 * @returns {number} duración estimada en segundos (0 si no hay ejercicios)
 */
export function computeEstimatedDuration(ejercicios) {
  if (!ejercicios) return 0;

  return ejercicios.reduce((total, ejercicio) => {
    const sets = parseInt(ejercicio.series, 10) || 3;
    const reps = parseInt(ejercicio.repeticiones, 10) || 10;
    const rest = parseInt(ejercicio.descanso_seg, 10) || 60;

    // Estimación básica: (tiempo por rep * reps * sets) + descansos
    const exerciseTime = (2 * reps * sets) + (rest * (sets - 1));
    return total + exerciseTime;
  }, 0);
}
