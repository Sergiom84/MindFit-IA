/**
 * 🎯 Session State Constants
 * 
 * Constantes de estado de sesión, separadas para permitir importación
 * sin dependencias de base de datos.
 * 
 * @module services/sessionStateConstants
 */

// Definición de estados válidos
export const SESSION_STATES = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  PARTIAL: 'partial',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled',
  ABANDONED: 'abandoned',
  INCOMPLETE: 'incomplete'
};

// Estados que indican que la sesión ha terminado
export const TERMINAL_STATES = [
  SESSION_STATES.COMPLETED,
  SESSION_STATES.PARTIAL,
  SESSION_STATES.SKIPPED,
  SESSION_STATES.CANCELLED,
  SESSION_STATES.ABANDONED,
  SESSION_STATES.INCOMPLETE
];

// Estados que permiten reanudar
export const RESUMABLE_STATES = [
  SESSION_STATES.PENDING,
  SESSION_STATES.IN_PROGRESS
];

/**
 * Calcula el estado de una sesión basándose en el progreso de sus ejercicios
 * @param {Array} exercises - Array de ejercicios con su estado
 * @returns {object} { status, completionRate, metrics }
 */
export function calculateSessionStatus(exercises) {
  if (!exercises || exercises.length === 0) {
    return {
      status: SESSION_STATES.PENDING,
      completionRate: 0,
      metrics: { total: 0, completed: 0, skipped: 0, cancelled: 0, pending: 0, inProgress: 0 }
    };
  }

  const metrics = {
    total: exercises.length,
    completed: 0,
    skipped: 0,
    cancelled: 0,
    pending: 0,
    inProgress: 0
  };

  // Contar por estado
  exercises.forEach(ex => {
    const status = String(ex.status || 'pending').toLowerCase();
    switch (status) {
      case 'completed':
        metrics.completed++;
        break;
      case 'skipped':
        metrics.skipped++;
        break;
      case 'cancelled':
        metrics.cancelled++;
        break;
      case 'in_progress':
        metrics.inProgress++;
        break;
      default:
        metrics.pending++;
    }
  });

  // Calcular tasa de completitud (solo ejercicios completados)
  const completionRate = metrics.total > 0 
    ? Math.round((metrics.completed / metrics.total) * 100) 
    : 0;

  // Determinar estado de sesión
  let status;
  
  if (metrics.completed === metrics.total && metrics.total > 0) {
    status = SESSION_STATES.COMPLETED;
  } else if (metrics.skipped === metrics.total && metrics.total > 0) {
    status = SESSION_STATES.SKIPPED;
  } else if (metrics.cancelled === metrics.total && metrics.total > 0) {
    status = SESSION_STATES.CANCELLED;
  } else if (metrics.completed > 0) {
    status = SESSION_STATES.PARTIAL;
  } else if (metrics.pending === 0 && metrics.inProgress === 0) {
    status = SESSION_STATES.INCOMPLETE;
  } else if (metrics.inProgress > 0 || (metrics.pending < metrics.total && metrics.pending > 0)) {
    status = SESSION_STATES.IN_PROGRESS;
  } else {
    status = SESSION_STATES.PENDING;
  }

  return { status, completionRate, metrics };
}

/**
 * Verifica si una sesión puede ser reanudada
 * @param {string} sessionStatus - Estado actual de la sesión
 * @param {object} metrics - Métricas de ejercicios
 * @returns {boolean}
 */
export function canResumeSession(sessionStatus, metrics = null) {
  if (metrics) {
    return metrics.pending > 0 || metrics.inProgress > 0;
  }
  return RESUMABLE_STATES.includes(sessionStatus);
}

/**
 * Verifica si una sesión ha terminado
 * @param {string} sessionStatus - Estado de la sesión
 * @returns {boolean}
 */
export function isSessionTerminal(sessionStatus) {
  return TERMINAL_STATES.includes(sessionStatus);
}
