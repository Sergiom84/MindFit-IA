import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import {
  buildSessionCompletedEvent,
  buildSessionCompletedEventKey,
  computeBackoffSeconds,
  enqueueEvent,
  claimBatch,
  reclaimStaleProcessing,
  markFailed,
  ENQUEUE_SQL,
  CLAIM_BATCH_SQL,
  RECLAIM_STALE_SQL,
  MARK_FAILED_SQL,
  SESSION_COMPLETED_CONTRACT_VERSION,
  OUTBOX_EVENT_TYPE_SESSION_COMPLETED
} from '../services/bridgeEventOutboxService.js';
import {
  buildActualSessionLoad,
  aggregateCompletedSets
} from '../services/trainingLoad/actualLoadBuilder.js';
import {
  handleSessionCompletedEvent
} from '../jobs/processBridgeEventOutbox.js';

// Ningún test toca la BD: funciones puras, SQL como texto y un mock de client.query.
// Mock de client que devuelve respuestas programadas por índice de llamada.
function mockClient(responses = []) {
  const calls = [];
  let i = 0;
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params });
      const r = responses[i++];
      if (typeof r === 'function') return r(sql, params);
      return r ?? { rowCount: 0, rows: [] };
    }
  };
}

// ── event_key e idempotencia (§17.4.1) ───────────────────────────────────────────
test('event_key: formato exacto por sessionId (§13.2)', () => {
  assert.equal(
    buildSessionCompletedEventKey(9876),
    'training.session_completed:v1:9876'
  );
});

test('event_key: Casa se namespacea con :home: para no colisionar (§13.6)', () => {
  assert.equal(
    buildSessionCompletedEventKey(55, { namespace: 'home' }),
    'training.session_completed:v1:home:55'
  );
  // Metodología 55 y Casa 55 nunca comparten clave.
  assert.notEqual(
    buildSessionCompletedEventKey(55),
    buildSessionCompletedEventKey(55, { namespace: 'home' })
  );
});

test('buildSessionCompletedEvent: dos cierres idénticos generan la MISMA event_key (§17.4.1)', () => {
  const a = buildSessionCompletedEvent({ sessionId: 9876, userId: 42 });
  const b = buildSessionCompletedEvent({ sessionId: 9876, userId: 42 });
  assert.equal(a.event_key, b.event_key);
  assert.equal(a.event_type, OUTBOX_EVENT_TYPE_SESSION_COMPLETED);
  assert.equal(a.contract_version, SESSION_COMPLETED_CONTRACT_VERSION);
  assert.equal(a.payload.session_id, 9876);
});

test('enqueue: usa ON CONFLICT (event_key) DO NOTHING (§13.1) → dos cierres = un evento', async () => {
  assert.match(ENQUEUE_SQL, /ON CONFLICT \(event_key\) DO NOTHING/);
  const client = mockClient([
    { rowCount: 1, rows: [{ id: 'uuid-1' }] },  // primer cierre inserta
    { rowCount: 0, rows: [] }                    // segundo cierre: conflicto → no inserta
  ]);
  const event = buildSessionCompletedEvent({ sessionId: 9876, userId: 42 });
  const first = await enqueueEvent(client, event);
  const second = await enqueueEvent(client, event);
  assert.equal(first.inserted, true);
  assert.equal(second.inserted, false);
});

// ── SKIP LOCKED y reclamo (§17.4.2) ───────────────────────────────────────────────
test('claim: la query de reclamo usa FOR UPDATE SKIP LOCKED (§13.4.1)', () => {
  assert.match(CLAIM_BATCH_SQL, /FOR UPDATE\s+SKIP LOCKED/);
});

test('claim: solo reclama pending/failed disponibles; un completed NO vuelve (§17.4.7)', async () => {
  // La query filtra status IN ('pending','failed'); 'completed' queda excluido por definición.
  assert.match(CLAIM_BATCH_SQL, /status IN \('pending', 'failed'\)/);
  assert.match(CLAIM_BATCH_SQL, /available_at <= NOW\(\)/);
  const client = mockClient([{ rowCount: 0, rows: [] }]);
  const rows = await claimBatch(client, { batchSize: 5, workerId: 'w1' });
  assert.deepEqual(rows, []);
  assert.deepEqual(client.calls[0].params, [5, 'w1']);
});

test('reclaimStale: devuelve processing con lock caducado a failed (§13.4.10)', async () => {
  assert.match(RECLAIM_STALE_SQL, /status = 'processing'/);
  assert.match(RECLAIM_STALE_SQL, /make_interval\(secs => \$1\)/);
  const client = mockClient([{ rowCount: 2, rows: [{ id: 'a' }, { id: 'b' }] }]);
  const ids = await reclaimStaleProcessing(client, { staleSeconds: 300 });
  assert.deepEqual(ids, ['a', 'b']);
  assert.deepEqual(client.calls[0].params, [300]);
});

// ── Backoff (§17.4.5) ─────────────────────────────────────────────────────────────
test('backoff: crece exponencialmente y satura; agota intentos → terminal', () => {
  assert.equal(computeBackoffSeconds(1).delaySeconds, 30);   // 30*2^0
  assert.equal(computeBackoffSeconds(2).delaySeconds, 60);   // 30*2^1
  assert.equal(computeBackoffSeconds(3).delaySeconds, 120);  // 30*2^2
  assert.equal(computeBackoffSeconds(1).terminal, false);
  const terminal = computeBackoffSeconds(5, { maxAttempts: 5 });
  assert.equal(terminal.terminal, true);
  assert.ok(terminal.delaySeconds > 60 * 60 * 24 * 365); // >1 año → no se reclama
});

test('markFailed: aplica backoff y marca terminal al agotar intentos', async () => {
  assert.match(MARK_FAILED_SQL, /status = 'failed'/);
  assert.match(MARK_FAILED_SQL, /available_at = NOW\(\) \+ make_interval/);
  const client = mockClient([{ rowCount: 1, rows: [{ id: 'x', attempts: 5, status: 'failed' }] }]);
  const r = await markFailed(client, 'x', { error: new Error('temporal'), attempts: 5, maxAttempts: 5 });
  assert.equal(r.terminal, true);
});

// ── Consumo del worker (§17.4.3/4/6) ──────────────────────────────────────────────
function validEvent(overrides = {}) {
  return {
    id: 'uuid-evt',
    event_key: 'training.session_completed:v1:9876',
    event_type: OUTBOX_EVENT_TYPE_SESSION_COMPLETED,
    contract_version: SESSION_COMPLETED_CONTRACT_VERSION,
    user_id: 42,
    attempts: 1,
    payload: {
      session_id: 9876,
      methodology_id: 'powerlifting',
      methodology_level: 'intermedio',
      final_status: 'completed',
      completion_rate: 100,
      actual_session_load: {
        contract_version: 'training-load/v1',
        methodology_id: 'powerlifting',
        methodology_level: 'intermedio',
        session_type: 'strength_volume',
        status: 'completed',
        day_type: 'D1',
        load_tier: 'moderate',
        provenance: { source: 'session_completion', confidence: 'high' }
      }
    },
    ...overrides
  };
}

test('worker: perfil nutricional ausente → skipped NO_NUTRITION_PROFILE (§17.4.4)', async () => {
  const client = mockClient([]);
  const result = await handleSessionCompletedEvent(client, validEvent(), {
    hasNutritionProfile: async () => false,
    logBridgeDecision: async () => { throw new Error('no debe llamarse'); }
  });
  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'NO_NUTRITION_PROFILE');
});

test('worker: contrato de evento inválido → skipped, sin reintento (§13.4.3)', async () => {
  const bad = validEvent({ contract_version: 'otra/v9' });
  const result = await handleSessionCompletedEvent(mockClient([]), bad, {
    hasNutritionProfile: async () => true,
    logBridgeDecision: async () => { throw new Error('no debe llamarse'); }
  });
  assert.equal(result.status, 'skipped');
  assert.equal(result.reason, 'INVALID_EVENT_CONTRACT');
});

test('worker: con perfil, registra UNA decisión con source_event_id (§17.4.6)', async () => {
  const logged = [];
  const result = await handleSessionCompletedEvent(mockClient([]), validEvent(), {
    hasNutritionProfile: async () => true,
    logBridgeDecision: async (_c, args) => { logged.push(args); return 555; }
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.decisionLogId, 555);
  assert.equal(logged.length, 1);
  // El source_event_id es la event_key → la idempotencia (índice único PR3) evita 2 decisiones.
  assert.equal(logged[0].eventKey, 'training.session_completed:v1:9876');
  assert.equal(logged[0].decisionDetails.applied, false);
});

// ── Construcción de carga real (§17.4.8) ──────────────────────────────────────────
test('carga real: NO suma strings de repeticiones; reps_total queda null (§13.3)', () => {
  const load = buildActualSessionLoad({
    methodologyId: 'powerlifting',
    methodologyLevel: 'intermedio',
    durationSeconds: 5460, // 91 min
    exerciseRows: [
      { series_completed: 4, repeticiones: '12,10,8' },
      { series_completed: 3, repeticiones: '8-12' },
      { series_completed: 'AMRAP' } // no parseable
    ]
  });
  assert.equal(load.status, 'completed');
  assert.equal(load.duration.actual_min, 91);
  assert.equal(load.work.sets_total, 7); // 4 + 3; 'AMRAP' ignorado, no sumado
  assert.equal(load.work.reps_total ?? null, null); // nunca se suman strings de reps
  // Un dato no parseable baja la confianza.
  assert.equal(load.provenance.confidence, 'low');
});

test('carga real: sin duración ni series → null y confianza baja (no se inventa) (§13.3)', () => {
  const load = buildActualSessionLoad({
    methodologyId: 'casa',
    durationSeconds: null,
    exerciseRows: []
  });
  assert.equal(load.duration.actual_min, null);
  assert.equal(load.work.sets_total, null);
  assert.equal(load.provenance.confidence, 'low');
  assert.equal(load.effort.rpe_actual, null); // sin fuente de RPE en Fase 0
});

// ── Fallo de Nutrición no revierte la sesión (§17.4.3) ────────────────────────────
test('enqueueEvent: propaga el error de BD para que el SAVEPOINT del cierre lo aísle', async () => {
  const client = { query: async () => { throw new Error('outbox caído'); } };
  await assert.rejects(
    () => enqueueEvent(client, buildSessionCompletedEvent({ sessionId: 1, userId: 1 })),
    /outbox caído/
  );
});

test('cierre: el INSERT del outbox va envuelto en SAVEPOINT (§13.1) → un fallo NO tumba la sesión', () => {
  const src = fs.readFileSync(path.join(__dirname, '../routes/trainingSession/complete.js'), 'utf8');
  // El evento se encola ANTES del COMMIT, dentro de un SAVEPOINT con ROLLBACK de rescate.
  assert.match(src, /SAVEPOINT pr5_outbox/);
  assert.match(src, /ROLLBACK TO SAVEPOINT pr5_outbox/);
  assert.match(src, /RELEASE SAVEPOINT pr5_outbox/);
  // La llamada al outbox ocurre antes del COMMIT del cierre de metodología.
  const enqueueIdx = src.indexOf('safeEnqueueSessionCompleted(client, {');
  const commitIdx = src.indexOf("await client.query('COMMIT')", enqueueIdx);
  assert.ok(enqueueIdx > 0 && commitIdx > enqueueIdx, 'el encolado precede al COMMIT');
});

test('aggregateCompletedSets: solo agrega numéricos y marca parseIssue', () => {
  assert.deepEqual(aggregateCompletedSets([{ series_completed: 2 }, { series_completed: '3' }]),
    { setsTotal: 5, parseIssue: false });
  assert.deepEqual(aggregateCompletedSets([{ series_completed: 'x' }]),
    { setsTotal: null, parseIssue: true });
  assert.deepEqual(aggregateCompletedSets([]), { setsTotal: null, parseIssue: false });
});
