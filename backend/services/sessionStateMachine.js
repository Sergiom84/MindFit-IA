/**
 * 🔄 Session State Machine
 * 
 * Implementa una máquina de estados formal para las sesiones de entrenamiento.
 * Garantiza transiciones válidas y evita estados inconsistentes.
 * 
 * Diagrama de estados:
 * 
 *   ┌─────────┐
 *   │ pending │──────────────────────────────────┐
 *   └────┬────┘                                  │
 *        │ start()                               │ cancel()
 *        ▼                                       │
 *   ┌─────────────┐                              │
 *   │ in_progress │──────────────────────────────┤
 *   └──────┬──────┘                              │
 *          │                                     │
 *    ┌─────┴─────┬──────────────┐                │
 *    │           │              │                │
 *    ▼           ▼              ▼                ▼
 * ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌───────────┐
 * │ completed│ │ partial │ │ skipped  │ │ cancelled │
 * └──────────┘ └─────────┘ └──────────┘ └───────────┘
 *                                               │
 *                              timeout()        │
 *                                  ▼            │
 *                            ┌───────────┐      │
 *                            │ abandoned │◄─────┘
 *                            └───────────┘
 * 
 * @module services/sessionStateMachine
 */

// Importar constantes desde archivo sin dependencias de DB
import { SESSION_STATES, TERMINAL_STATES } from './sessionStateConstants.js';

/**
 * Definición de transiciones válidas
 * { estadoActual: [estadosPermitidos] }
 */
const VALID_TRANSITIONS = {
  [SESSION_STATES.PENDING]: [
    SESSION_STATES.IN_PROGRESS,
    SESSION_STATES.CANCELLED,
    SESSION_STATES.SKIPPED,
    SESSION_STATES.ABANDONED
  ],
  [SESSION_STATES.IN_PROGRESS]: [
    SESSION_STATES.COMPLETED,
    SESSION_STATES.PARTIAL,
    SESSION_STATES.SKIPPED,
    SESSION_STATES.CANCELLED,
    SESSION_STATES.ABANDONED,
    SESSION_STATES.INCOMPLETE
  ],
  // Estados terminales - no permiten transiciones
  [SESSION_STATES.COMPLETED]: [],
  [SESSION_STATES.PARTIAL]: [],
  [SESSION_STATES.SKIPPED]: [],
  [SESSION_STATES.CANCELLED]: [],
  [SESSION_STATES.ABANDONED]: [],
  [SESSION_STATES.INCOMPLETE]: []
};

/**
 * Acciones que disparan transiciones
 */
export const SESSION_ACTIONS = {
  START: 'start',
  COMPLETE_EXERCISE: 'complete_exercise',
  SKIP_EXERCISE: 'skip_exercise',
  CANCEL_EXERCISE: 'cancel_exercise',
  FINISH: 'finish',
  CANCEL: 'cancel',
  ABANDON: 'abandon',
  TIMEOUT: 'timeout'
};

/**
 * Verifica si una transición de estado es válida
 * @param {string} currentState - Estado actual
 * @param {string} newState - Estado al que se quiere transicionar
 * @returns {boolean}
 */
export function isValidTransition(currentState, newState) {
  const allowedTransitions = VALID_TRANSITIONS[currentState];
  
  if (!allowedTransitions) {
    console.warn(`⚠️ [StateMachine] Estado desconocido: ${currentState}`);
    return false;
  }
  
  return allowedTransitions.includes(newState);
}

/**
 * Intenta realizar una transición de estado
 * @param {string} currentState - Estado actual
 * @param {string} action - Acción que dispara la transición
 * @param {object} context - Contexto con métricas de ejercicios
 * @returns {{ success: boolean, newState: string, error?: string }}
 */
export function transition(currentState, action, context = {}) {
  const { metrics = {} } = context;
  
  // Verificar si el estado actual permite transiciones
  if (TERMINAL_STATES.includes(currentState)) {
    return {
      success: false,
      newState: currentState,
      error: `Estado ${currentState} es terminal y no permite transiciones`
    };
  }

  let newState = currentState;

  switch (action) {
    case SESSION_ACTIONS.START:
      if (currentState === SESSION_STATES.PENDING) {
        newState = SESSION_STATES.IN_PROGRESS;
      } else {
        return {
          success: false,
          newState: currentState,
          error: `No se puede iniciar desde estado ${currentState}`
        };
      }
      break;

    case SESSION_ACTIONS.FINISH:
      newState = calculateFinalState(metrics);
      break;

    case SESSION_ACTIONS.CANCEL:
      newState = SESSION_STATES.CANCELLED;
      break;

    case SESSION_ACTIONS.ABANDON:
    case SESSION_ACTIONS.TIMEOUT:
      newState = SESSION_STATES.ABANDONED;
      break;

    case SESSION_ACTIONS.COMPLETE_EXERCISE:
    case SESSION_ACTIONS.SKIP_EXERCISE:
    case SESSION_ACTIONS.CANCEL_EXERCISE:
      // Estas acciones no cambian el estado de la sesión directamente
      // Solo si se llama a FINISH después
      return {
        success: true,
        newState: currentState,
        message: `Acción ${action} registrada, estado de sesión sin cambios`
      };

    default:
      return {
        success: false,
        newState: currentState,
        error: `Acción desconocida: ${action}`
      };
  }

  // Verificar si la transición es válida
  if (!isValidTransition(currentState, newState)) {
    return {
      success: false,
      newState: currentState,
      error: `Transición inválida: ${currentState} → ${newState}`
    };
  }

  console.log(`🔄 [StateMachine] Transición: ${currentState} → ${newState} (acción: ${action})`);

  return {
    success: true,
    newState,
    previousState: currentState
  };
}

/**
 * Calcula el estado final basándose en las métricas de ejercicios
 * @param {object} metrics - { total, completed, skipped, cancelled, pending, inProgress }
 * @returns {string} Estado final
 */
function calculateFinalState(metrics) {
  const { total = 0, completed = 0, skipped = 0, cancelled = 0 } = metrics;

  if (total === 0) {
    return SESSION_STATES.INCOMPLETE;
  }

  if (completed === total) {
    return SESSION_STATES.COMPLETED;
  }

  if (skipped === total) {
    return SESSION_STATES.SKIPPED;
  }

  if (cancelled === total) {
    return SESSION_STATES.CANCELLED;
  }

  if (completed > 0) {
    return SESSION_STATES.PARTIAL;
  }

  return SESSION_STATES.INCOMPLETE;
}

/**
 * Obtiene las acciones disponibles desde un estado dado
 * @param {string} currentState - Estado actual
 * @returns {string[]} Lista de acciones disponibles
 */
export function getAvailableActions(currentState) {
  if (TERMINAL_STATES.includes(currentState)) {
    return [];
  }

  switch (currentState) {
    case SESSION_STATES.PENDING:
      return [
        SESSION_ACTIONS.START,
        SESSION_ACTIONS.CANCEL,
        SESSION_ACTIONS.ABANDON
      ];

    case SESSION_STATES.IN_PROGRESS:
      return [
        SESSION_ACTIONS.COMPLETE_EXERCISE,
        SESSION_ACTIONS.SKIP_EXERCISE,
        SESSION_ACTIONS.CANCEL_EXERCISE,
        SESSION_ACTIONS.FINISH,
        SESSION_ACTIONS.CANCEL,
        SESSION_ACTIONS.ABANDON
      ];

    default:
      return [];
  }
}

/**
 * Obtiene descripción legible del estado
 * @param {string} state - Estado de la sesión
 * @returns {string} Descripción
 */
export function getStateDescription(state) {
  const descriptions = {
    [SESSION_STATES.PENDING]: 'Sesión creada, esperando inicio',
    [SESSION_STATES.IN_PROGRESS]: 'Sesión en progreso',
    [SESSION_STATES.COMPLETED]: 'Sesión completada exitosamente',
    [SESSION_STATES.PARTIAL]: 'Sesión parcialmente completada',
    [SESSION_STATES.SKIPPED]: 'Sesión saltada',
    [SESSION_STATES.CANCELLED]: 'Sesión cancelada',
    [SESSION_STATES.ABANDONED]: 'Sesión abandonada (timeout)',
    [SESSION_STATES.INCOMPLETE]: 'Sesión finalizada sin ejercicios completados'
  };

  return descriptions[state] || 'Estado desconocido';
}

/**
 * Valida si un estado es terminal (no permite más acciones)
 * @param {string} state - Estado a verificar
 * @returns {boolean}
 */
export function isTerminalState(state) {
  return TERMINAL_STATES.includes(state);
}

/**
 * Crea un contexto de sesión para usar con la máquina de estados
 * @param {object} session - Datos de la sesión
 * @param {Array} exercises - Lista de ejercicios con su estado
 * @returns {object} Contexto
 */
export function createSessionContext(session, exercises = []) {
  const metrics = {
    total: exercises.length,
    completed: 0,
    skipped: 0,
    cancelled: 0,
    pending: 0,
    inProgress: 0
  };

  exercises.forEach(ex => {
    const status = String(ex.status || 'pending').toLowerCase();
    switch (status) {
      case 'completed': metrics.completed++; break;
      case 'skipped': metrics.skipped++; break;
      case 'cancelled': metrics.cancelled++; break;
      case 'in_progress': metrics.inProgress++; break;
      default: metrics.pending++;
    }
  });

  return {
    sessionId: session.id,
    currentState: session.session_status || SESSION_STATES.PENDING,
    metrics,
    startedAt: session.started_at,
    completedAt: session.completed_at
  };
}

// Exportación por defecto
export default {
  SESSION_ACTIONS,
  isValidTransition,
  transition,
  getAvailableActions,
  getStateDescription,
  isTerminalState,
  createSessionContext
};
