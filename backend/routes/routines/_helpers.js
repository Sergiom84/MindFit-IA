/**
 * Helpers compartidos de las rutas de rutinas (extraidos de routes/routines.js).
 */

import {
  createMissingDaySession,
  ensureMethodologySessions
} from '../trainingSession/_helpers.js';


// Función auxiliar para extraer ejercicios del plan JSON
function extractExercisesFromPlanData(planData) {
  if (!planData?.semanas) return [];

  const fallbackExercises = planData.semanas
    .flatMap(sem => sem?.sesiones || [])
    .flatMap(ses => ses?.ejercicios || [])
    .reduce((acc, ej) => {
      const nombre = ej?.nombre || ej?.name || '';
      if (!nombre) return acc;
      if (!acc.find(x => x.nombre?.toLowerCase() === nombre.toLowerCase())) {
        acc.push({
          nombre,
          series: ej.series ?? ej.series_total ?? 3,
          repeticiones: ej.repeticiones ?? ej.reps ?? null,
          duracion_seg: ej.duracion_seg ?? ej.duration_sec ?? null,
        });
      }
      return acc;
    }, []);

  return fallbackExercises;
}

export {
  ensureMethodologySessions,
  createMissingDaySession,
  extractExercisesFromPlanData
};
