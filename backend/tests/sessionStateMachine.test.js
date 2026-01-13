/**
 * Tests para Session State Machine
 * 
 * Ejecutar con: node backend/tests/sessionStateMachine.test.js
 */

import {
  transition,
  SESSION_ACTIONS,
  isValidTransition,
  createSessionContext,
  isTerminalState,
  getAvailableActions,
  getStateDescription
} from '../services/sessionStateMachine.js';

// Importar constantes desde archivo sin dependencias de DB
import { SESSION_STATES } from '../services/sessionStateConstants.js';

// Simple test runner
let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`✅ ${description}`);
    passed++;
  } catch (error) {
    console.error(`❌ ${description}`);
    console.error(`   Error: ${error.message}`);
    failed++;
  }
}

function expect(value) {
  return {
    toBe(expected) {
      if (value !== expected) {
        throw new Error(`Expected ${expected}, got ${value}`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(value) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
      }
    },
    toBeTrue() {
      if (value !== true) {
        throw new Error(`Expected true, got ${value}`);
      }
    },
    toBeFalse() {
      if (value !== false) {
        throw new Error(`Expected false, got ${value}`);
      }
    },
    toContain(item) {
      if (!Array.isArray(value) || !value.includes(item)) {
        throw new Error(`Expected array to contain ${item}`);
      }
    }
  };
}

console.log('\n🧪 Session State Machine Tests\n');
console.log('================================\n');

// Test 1: Transiciones válidas desde PENDING
test('pending → in_progress es válido (START)', () => {
  const result = transition(SESSION_STATES.PENDING, SESSION_ACTIONS.START);
  expect(result.success).toBeTrue();
  expect(result.newState).toBe(SESSION_STATES.IN_PROGRESS);
});

test('pending → cancelled es válido (CANCEL)', () => {
  const result = transition(SESSION_STATES.PENDING, SESSION_ACTIONS.CANCEL);
  expect(result.success).toBeTrue();
  expect(result.newState).toBe(SESSION_STATES.CANCELLED);
});

// Test 2: Transiciones válidas desde IN_PROGRESS
test('in_progress → completed es válido (FINISH con todos completados)', () => {
  const context = {
    metrics: { total: 5, completed: 5, skipped: 0, cancelled: 0 }
  };
  const result = transition(SESSION_STATES.IN_PROGRESS, SESSION_ACTIONS.FINISH, context);
  expect(result.success).toBeTrue();
  expect(result.newState).toBe(SESSION_STATES.COMPLETED);
});

test('in_progress → partial es válido (FINISH con algunos completados)', () => {
  const context = {
    metrics: { total: 5, completed: 3, skipped: 1, cancelled: 1 }
  };
  const result = transition(SESSION_STATES.IN_PROGRESS, SESSION_ACTIONS.FINISH, context);
  expect(result.success).toBeTrue();
  expect(result.newState).toBe(SESSION_STATES.PARTIAL);
});

test('in_progress → cancelled es válido (CANCEL)', () => {
  const result = transition(SESSION_STATES.IN_PROGRESS, SESSION_ACTIONS.CANCEL);
  expect(result.success).toBeTrue();
  expect(result.newState).toBe(SESSION_STATES.CANCELLED);
});

test('in_progress → abandoned es válido (TIMEOUT)', () => {
  const result = transition(SESSION_STATES.IN_PROGRESS, SESSION_ACTIONS.TIMEOUT);
  expect(result.success).toBeTrue();
  expect(result.newState).toBe(SESSION_STATES.ABANDONED);
});

// Test 3: Estados terminales no permiten transiciones
test('completed es estado terminal', () => {
  expect(isTerminalState(SESSION_STATES.COMPLETED)).toBeTrue();
});

test('abandoned es estado terminal', () => {
  expect(isTerminalState(SESSION_STATES.ABANDONED)).toBeTrue();
});

test('cancelled es estado terminal', () => {
  expect(isTerminalState(SESSION_STATES.CANCELLED)).toBeTrue();
});

test('transición desde estado terminal falla', () => {
  const result = transition(SESSION_STATES.COMPLETED, SESSION_ACTIONS.START);
  expect(result.success).toBeFalse();
});

// Test 4: Transiciones inválidas
test('pending no puede ir directo a completed', () => {
  const result = isValidTransition(SESSION_STATES.PENDING, SESSION_STATES.COMPLETED);
  expect(result).toBeFalse();
});

test('in_progress no puede volver a pending', () => {
  const result = isValidTransition(SESSION_STATES.IN_PROGRESS, SESSION_STATES.PENDING);
  expect(result).toBeFalse();
});

// Test 5: Acciones disponibles
test('pending tiene acciones START, CANCEL, ABANDON disponibles', () => {
  const actions = getAvailableActions(SESSION_STATES.PENDING);
  expect(actions).toContain(SESSION_ACTIONS.START);
  expect(actions).toContain(SESSION_ACTIONS.CANCEL);
});

test('estado terminal no tiene acciones disponibles', () => {
  const actions = getAvailableActions(SESSION_STATES.COMPLETED);
  expect(actions.length).toBe(0);
});

// Test 6: createSessionContext
test('createSessionContext calcula métricas correctamente', () => {
  const session = { id: 1, session_status: 'in_progress', started_at: new Date() };
  const exercises = [
    { status: 'completed' },
    { status: 'completed' },
    { status: 'skipped' },
    { status: 'pending' },
    { status: 'cancelled' }
  ];
  const context = createSessionContext(session, exercises);
  
  expect(context.metrics.total).toBe(5);
  expect(context.metrics.completed).toBe(2);
  expect(context.metrics.skipped).toBe(1);
  expect(context.metrics.cancelled).toBe(1);
  expect(context.metrics.pending).toBe(1);
});

// Test 7: Descripciones de estado
test('getStateDescription devuelve descripción para cada estado', () => {
  expect(getStateDescription(SESSION_STATES.PENDING).length > 0).toBeTrue();
  expect(getStateDescription(SESSION_STATES.IN_PROGRESS).length > 0).toBeTrue();
  expect(getStateDescription(SESSION_STATES.COMPLETED).length > 0).toBeTrue();
  expect(getStateDescription(SESSION_STATES.ABANDONED).length > 0).toBeTrue();
});

// Test 8: Caso de uso real - flujo completo
test('flujo completo: pending → in_progress → partial', () => {
  let currentState = SESSION_STATES.PENDING;
  
  // Iniciar sesión
  let result = transition(currentState, SESSION_ACTIONS.START);
  expect(result.success).toBeTrue();
  currentState = result.newState;
  expect(currentState).toBe(SESSION_STATES.IN_PROGRESS);
  
  // Finalizar con algunos ejercicios completados
  const context = {
    metrics: { total: 5, completed: 3, skipped: 1, cancelled: 1 }
  };
  result = transition(currentState, SESSION_ACTIONS.FINISH, context);
  expect(result.success).toBeTrue();
  expect(result.newState).toBe(SESSION_STATES.PARTIAL);
});

// Test 9: Caso de sesión abandonada por timeout
test('flujo de abandono: pending → in_progress → abandoned', () => {
  let currentState = SESSION_STATES.PENDING;
  
  // Iniciar sesión
  let result = transition(currentState, SESSION_ACTIONS.START);
  currentState = result.newState;
  
  // Simular timeout (usuario cierra app)
  result = transition(currentState, SESSION_ACTIONS.TIMEOUT);
  expect(result.success).toBeTrue();
  expect(result.newState).toBe(SESSION_STATES.ABANDONED);
});

// Test 10: Caso especial - todos los ejercicios saltados
test('todos saltados resulta en skipped', () => {
  const context = {
    metrics: { total: 5, completed: 0, skipped: 5, cancelled: 0 }
  };
  const result = transition(SESSION_STATES.IN_PROGRESS, SESSION_ACTIONS.FINISH, context);
  expect(result.success).toBeTrue();
  expect(result.newState).toBe(SESSION_STATES.SKIPPED);
});

// Test 11: Caso especial - todos cancelados
test('todos cancelados resulta en cancelled', () => {
  const context = {
    metrics: { total: 5, completed: 0, skipped: 0, cancelled: 5 }
  };
  const result = transition(SESSION_STATES.IN_PROGRESS, SESSION_ACTIONS.FINISH, context);
  expect(result.success).toBeTrue();
  expect(result.newState).toBe(SESSION_STATES.CANCELLED);
});

// Test 12: Caso especial - sin ejercicios
test('sesión vacía resulta en incomplete', () => {
  const context = {
    metrics: { total: 0, completed: 0, skipped: 0, cancelled: 0 }
  };
  const result = transition(SESSION_STATES.IN_PROGRESS, SESSION_ACTIONS.FINISH, context);
  expect(result.success).toBeTrue();
  expect(result.newState).toBe(SESSION_STATES.INCOMPLETE);
});

// Resumen
console.log('\n================================');
console.log(`\n📊 Resultados: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('✨ Todos los tests pasaron!\n');
  process.exit(0);
}
