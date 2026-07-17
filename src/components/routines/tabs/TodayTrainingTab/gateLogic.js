// Lógica pura de "gate" de TodayTrainingTab: derivación de contadores y estados
// del entrenamiento de hoy a partir del estado de backend (today-status) con
// fallback al progreso local. Extraído de TodayTrainingTab.jsx (ARCH-002) para
// hacerlo testeable de forma aislada; comportamiento byte-equivalente.

const norm = (s) => String(s || '').toLowerCase();

/**
 * Calcula los contadores del gate. Fuente de verdad: `todayStatus.summary`
 * (backend); si no existe, se derivan del progreso local (`exerciseProgress`)
 * y de `todaySessionData.ejercicios`.
 * @returns {{total:number, completed:number, skipped:number, cancelled:number, pending:number, inProgress:number, hasBackendSummary:boolean}}
 */
export function computeGateCounts({ todayStatus, todaySessionData, exerciseProgress }) {
  const backendSummary = todayStatus?.summary || null;
  const hasBackendSummary = Boolean(backendSummary);
  const localProgressValues = Object.values(exerciseProgress || {});
  const ejercicios = todaySessionData?.ejercicios || [];

  const total = hasBackendSummary
    ? Number(backendSummary.total || 0)
    : (ejercicios.length || 0);

  const completed = hasBackendSummary
    ? Number(backendSummary.completed || 0)
    : localProgressValues.filter(p => norm(p?.status) === 'completed').length;

  const skipped = hasBackendSummary
    ? Number(backendSummary.skipped || 0)
    : localProgressValues.filter(p => norm(p?.status) === 'skipped').length;

  const cancelled = hasBackendSummary
    ? Number(backendSummary.cancelled || 0)
    : localProgressValues.filter(p => norm(p?.status) === 'cancelled').length;

  const pending = hasBackendSummary
    ? Number(backendSummary.pending || 0)
    : (ejercicios.length
        ? ejercicios.filter((_, i) => norm(exerciseProgress?.[i]?.status || 'pending') === 'pending').length
        : 0);

  const inProgress = hasBackendSummary
    ? Number(backendSummary.in_progress || 0)
    : localProgressValues.filter(p => norm(p?.status) === 'in_progress').length;

  return { total, completed, skipped, cancelled, pending, inProgress, hasBackendSummary };
}

/**
 * Deriva los estados booleanos del gate a partir de los contadores y del backend.
 * @returns {{hasIncompleteExercises:boolean, allProcessedToday:boolean, isFinishedToday:boolean, hasCompletedSession:boolean, allProcessedIncomplete:boolean, canRetryToday:boolean, hasUnfinishedWorkToday:boolean}}
 */
/**
 * Estadísticas de progreso para el header (completados/total/skip/cancel).
 * Prioriza `todayStatus.exercises`; si no, el progreso local; y `summary`
 * (backend) pisa los valores cuando existe.
 * @returns {{completed:number, total:number, skipped:number, cancelled:number}}
 */
export function computeHeaderProgressStats({ todayStatus, todaySessionData, exerciseProgress }) {
  const total = (todaySessionData?.ejercicios?.length) || (todayStatus?.summary?.total) || 0;
  let completed = 0, skipped = 0, cancelled = 0;

  if (Array.isArray(todayStatus?.exercises)) {
    for (const ex of todayStatus.exercises) {
      const s = norm(ex?.status);
      if (s === 'completed') completed++;
      else if (s === 'skipped') skipped++;
      else if (s === 'cancelled') cancelled++;
    }
  } else if (exerciseProgress && typeof exerciseProgress === 'object') {
    for (const p of Object.values(exerciseProgress)) {
      const s = norm(p?.status);
      if (s === 'completed') completed++;
      else if (s === 'skipped') skipped++;
      else if (s === 'cancelled') cancelled++;
    }
  }

  // Fallback a summary si existe (prioriza datos de backend)
  if (todayStatus?.summary) {
    completed = todayStatus.summary.completed ?? completed;
    skipped = todayStatus.summary.skipped ?? skipped;
    cancelled = todayStatus.summary.cancelled ?? cancelled;
  }

  return { completed, total, skipped, cancelled };
}

export function computeGateLogic({ counts, todayStatus }) {
  const { total, completed, pending, inProgress } = counts;

  // 1. Hay ejercicios incompletos (no todos están "completed")
  const hasIncompleteExercises = total > 0 && (completed < total);

  // 2. Todos los ejercicios fueron procesados (no quedan pending/in_progress)
  const allProcessedToday = total > 0 && pending === 0 && inProgress === 0;

  // 3. Estado desde backend (para validación adicional)
  const isFinishedToday = todayStatus?.session?.session_status === 'completed';

  // 4. Calcular si puede reintentar - simplificado
  const hasSkipped = (todayStatus?.summary?.skipped ?? 0) > 0;
  const hasCancelled = (todayStatus?.summary?.cancelled ?? 0) > 0;
  const canRetryToday = Boolean(todayStatus?.summary?.canRetry) || hasSkipped || hasCancelled;

  // 5. Sesión completada exitosamente: manda el backend; local solo como fallback.
  const hasCompletedSession = isFinishedToday || (total > 0 && completed === total);

  // 6. Mostrar CTA de comenzar/reanudar: hay ejercicios sin completar
  const hasUnfinishedWorkToday = !isFinishedToday && total > 0 && completed < total;

  // 7. Procesados pero no todos completados (skips/cancelaciones).
  const allProcessedIncomplete = allProcessedToday && !hasCompletedSession;

  return {
    hasIncompleteExercises,
    allProcessedToday,
    isFinishedToday,
    hasCompletedSession,
    allProcessedIncomplete,
    canRetryToday,
    hasUnfinishedWorkToday
  };
}
