/**
 * Tests de las correcciones COR-F0-02 (payload real al completar sesión) y COR-F0-06
 * (outbox coherente + flag de emisión independiente) de la auditoría correctiva de Fase 0.
 *
 * Estilo del repo: sin BD real. Se prueban las funciones puras que encapsulan la lógica del
 * cierre (nivel, duración, gate de metodología, gate de emisión) y, para la ruta/transacción,
 * se verifica el texto fuente de complete.js (RETURNING, SAVEPOINT, gates) como ya hace
 * bridgeEventOutbox.test.js.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeMethodologyLevel,
  resolveMethodologyLevel,
  resolveEventMethodologyId,
  shouldEmitSessionCompleted,
  resolveSessionDurationSeconds,
  isOutboxEmissionEnabled,
  buildSessionCompletedEvent
} from '../services/bridgeEventOutboxService.js';
import { buildActualSessionLoad } from '../services/trainingLoad/actualLoadBuilder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPLETE_SRC = fs.readFileSync(
  path.join(__dirname, '../routes/trainingSession/complete.js'), 'utf8'
);

// ── COR-F0-02 §5/§6: normalización de nivel ───────────────────────────────────────
test('nivel: "Intermedio" se normaliza a "intermedio" (mayúsculas)', () => {
  assert.equal(normalizeMethodologyLevel('Intermedio'), 'intermedio');
});

test('nivel: alias histórico "básico"/"basico" → "principiante" (default de columna)', () => {
  assert.equal(normalizeMethodologyLevel('básico'), 'principiante');
  assert.equal(normalizeMethodologyLevel('basico'), 'principiante');
  assert.equal(normalizeMethodologyLevel('BÁSICO'), 'principiante');
});

test('nivel: un valor arbitrario NO pasa como válido → null (§6)', () => {
  assert.equal(normalizeMethodologyLevel('inventado'), null);
  assert.equal(normalizeMethodologyLevel(''), null);
  assert.equal(normalizeMethodologyLevel(null), null);
  assert.equal(normalizeMethodologyLevel(undefined), null);
});

test('nivel: se resuelve en orden planned → session → metadata → null', () => {
  // Carga planificada válida gana.
  assert.equal(resolveMethodologyLevel({
    plannedLevel: 'avanzado', sessionLevel: 'intermedio', metadataLevel: 'básico'
  }), 'avanzado');
  // Sin planned válido, usa session.methodology_level.
  assert.equal(resolveMethodologyLevel({
    plannedLevel: 'inventado', sessionLevel: 'Intermedio', metadataLevel: 'básico'
  }), 'intermedio');
  // Sin planned ni session, metadata legacy normalizada.
  assert.equal(resolveMethodologyLevel({
    plannedLevel: null, sessionLevel: null, metadataLevel: 'básico'
  }), 'principiante');
  // De verdad no hay → null.
  assert.equal(resolveMethodologyLevel({}), null);
});

// ── COR-F0-02 §2/§4: duración real, el 0 inicial no es medición ────────────────────
test('duración: sesión iniciada hace 91 min → ~91 min (started/completed, no el 0 inicial)', () => {
  const now = Date.now();
  const startedAt = new Date(now - 91 * 60 * 1000).toISOString();
  const completedAt = new Date(now).toISOString();
  // total_duration_seconds=0 (valor inicial de columna) NO debe interpretarse como medición real.
  const seconds = resolveSessionDurationSeconds({
    totalDurationSeconds: 0, startedAt, completedAt, now
  });
  assert.ok(Math.abs(seconds - 5460) <= 2, `esperado ~5460s, obtenido ${seconds}`);

  const load = buildActualSessionLoad({
    methodologyId: 'powerlifting', methodologyLevel: 'intermedio',
    durationSeconds: seconds, exerciseRows: [{ series_completed: 4 }]
  });
  assert.equal(load.duration.actual_min, 91);
});

test('duración: valor medido > 0 se usa tal cual', () => {
  assert.equal(resolveSessionDurationSeconds({ totalDurationSeconds: 5460 }), 5460);
});

test('duración: sin medición real (0 + sin started_at) → null, nunca 0 inventado', () => {
  assert.equal(resolveSessionDurationSeconds({ totalDurationSeconds: 0, startedAt: null }), null);
  assert.equal(resolveSessionDurationSeconds({ totalDurationSeconds: null }), null);
  // Duración negativa o incoherente tampoco se acepta.
  const now = Date.now();
  assert.equal(resolveSessionDurationSeconds({
    totalDurationSeconds: 0,
    startedAt: new Date(now).toISOString(),
    completedAt: new Date(now - 1000).toISOString(),
    now
  }), null);
});

// ── COR-F0-02 §4/§7: Hipertrofia / HPV2 no emiten evento con methodology_id=null ───
test('metodología: HPV2 e Hipertrofia no resuelven ID canónico → no se emite (§7)', () => {
  assert.equal(resolveEventMethodologyId('hipertrofia_v2'), null);
  assert.equal(resolveEventMethodologyId('hipertrofia'), null);
  assert.equal(shouldEmitSessionCompleted(resolveEventMethodologyId('hipertrofia_v2')), false);
  assert.equal(shouldEmitSessionCompleted(resolveEventMethodologyId('hipertrofia')), false);
});

test('metodología: una registrada sí emite; Casa mapea a "casa" por namespace', () => {
  assert.equal(resolveEventMethodologyId('powerlifting'), 'powerlifting');
  assert.equal(shouldEmitSessionCompleted('powerlifting'), true);
  assert.equal(resolveEventMethodologyId(undefined, { keyNamespace: 'home' }), 'casa');
  assert.equal(shouldEmitSessionCompleted(resolveEventMethodologyId(undefined, { keyNamespace: 'home' })), true);
});

test('shouldEmitSessionCompleted: null/undefined/"" → false', () => {
  assert.equal(shouldEmitSessionCompleted(null), false);
  assert.equal(shouldEmitSessionCompleted(undefined), false);
  assert.equal(shouldEmitSessionCompleted(''), false);
});

// ── COR-F0-02: idempotencia por event_key (doble POST = un solo evento) ────────────
test('idempotencia: dos cierres del mismo sessionId comparten event_key', () => {
  const a = buildSessionCompletedEvent({ sessionId: 321, userId: 7, methodologyId: 'powerlifting' });
  const b = buildSessionCompletedEvent({ sessionId: 321, userId: 7, methodologyId: 'powerlifting' });
  assert.equal(a.event_key, b.event_key);
  assert.equal(a.event_key, 'training.session_completed:v1:321');
});

// ── COR-F0-06: flag de emisión independiente, por defecto seguro (off) ─────────────
test('emisión: por defecto OFF (sin flag ni valor distinto de "true")', () => {
  assert.equal(isOutboxEmissionEnabled({}), false);
  assert.equal(isOutboxEmissionEnabled({ BRIDGE_OUTBOX_EMIT_ENABLED: 'false' }), false);
  assert.equal(isOutboxEmissionEnabled({ BRIDGE_OUTBOX_EMIT_ENABLED: '0' }), false);
});

test('emisión: se enciende explícitamente con "true" (case-insensitive)', () => {
  assert.equal(isOutboxEmissionEnabled({ BRIDGE_OUTBOX_EMIT_ENABLED: 'true' }), true);
  assert.equal(isOutboxEmissionEnabled({ BRIDGE_OUTBOX_EMIT_ENABLED: 'TRUE' }), true);
});

// ── COR-F0-02: prueba de ruta/transacción (texto fuente de complete.js) ────────────
test('ruta: el UPDATE de cierre usa RETURNING * y el evento se construye con esa fila', () => {
  assert.match(COMPLETE_SRC, /UPDATE app\.methodology_exercise_sessions[\s\S]*RETURNING \*/);
  assert.match(COMPLETE_SRC, /const updatedSession = updatedSessionResult\.rows\[0\]/);
  // El enqueue recibe la fila ACTUALIZADA, no la lectura previa (ses.rows[0]).
  assert.match(COMPLETE_SRC, /session:\s*updatedSession/);
});

test('ruta: el cierre respeta gate de emisión y gate de metodología antes de encolar', () => {
  assert.match(COMPLETE_SRC, /isOutboxEmissionEnabled\(\)/);
  assert.match(COMPLETE_SRC, /shouldEmitSessionCompleted\(methodologyId\)/);
  assert.match(COMPLETE_SRC, /OUTBOX_EMIT_DISABLED/);
  assert.match(COMPLETE_SRC, /NON_REGISTERED_METHODOLOGY/);
});

test('ruta: el INSERT del outbox sigue aislado por SAVEPOINT (fallo no revierte el cierre)', () => {
  assert.match(COMPLETE_SRC, /SAVEPOINT pr5_outbox/);
  assert.match(COMPLETE_SRC, /ROLLBACK TO SAVEPOINT pr5_outbox/);
  // El encolado precede al COMMIT del cierre de metodología.
  const enqueueIdx = COMPLETE_SRC.indexOf('safeEnqueueSessionCompleted(client, {');
  const commitIdx = COMPLETE_SRC.indexOf("await client.query('COMMIT')", enqueueIdx);
  assert.ok(enqueueIdx > 0 && commitIdx > enqueueIdx, 'el encolado precede al COMMIT');
});
