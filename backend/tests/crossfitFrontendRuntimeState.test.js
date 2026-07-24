import assert from "node:assert/strict";
import test from "node:test";

import {
  acknowledgeCrossfitRuntimeItem,
  createCrossfitRuntimeState,
  currentCrossfitElapsed,
  discardRejectedCrossfitSubstitution,
  hydrateCrossfitRuntimeState,
  isCrossfitV2Presentation,
  queueCrossfitSubstitution,
  queueCrossfitTimerAction
} from "../../src/components/routines/crossfit/runtimeState.js";

const START = Date.parse("2026-07-22T12:00:00.000Z");

function initial() {
  return createCrossfitRuntimeState({
    sessionId: 101,
    movementIds: ["run", "air_squat"],
    timeCapSeconds: 900,
    nowMs: START,
    token: "deterministicruntime"
  });
}

test("frontend runtime detecta únicamente envelopes CrossFit v2", () => {
  assert.equal(isCrossfitV2Presentation({ schema_version: "crossfit-session/v2" }), true);
  assert.equal(isCrossfitV2Presentation({
    metadata: { persisted_session_metadata: { crossfit_v2_session: { schema_version: "crossfit-session/v2" } } }
  }), true);
  assert.equal(isCrossfitV2Presentation({ wod: {}, methodology: "CrossFit" }), false);
});

test("timer usa ancla monotónica y sobrevive a background/reload", () => {
  const started = queueCrossfitTimerAction(initial(), "start", START);
  assert.equal(started.pending[0].body.event_type, "timer_started");
  assert.equal(started.pending[0].body.client_sequence, 0);
  assert.equal(currentCrossfitElapsed(started, START + 42000), 42);

  const hydrated = hydrateCrossfitRuntimeState(JSON.parse(JSON.stringify(started)), {
    sessionId: 101,
    movementIds: ["run", "air_squat"],
    timeCapSeconds: 900,
    nowMs: START + 42000,
    token: "ignored"
  });
  assert.equal(currentCrossfitElapsed(hydrated, START + 42000), 42);

  const paused = queueCrossfitTimerAction(hydrated, "pause", START + 42000);
  assert.equal(paused.pending[1].body.event_type, "timer_paused");
  assert.equal(paused.pending[1].body.client_sequence, 1);
  assert.equal(paused.timer.elapsed_seconds, 42);
});

test("sustitución se aplica solo tras respuesta del servidor", () => {
  const queued = queueCrossfitSubstitution(initial(), {
    movementId: "run",
    reason: "pain",
    checkIn: { pain: { score: 3, locations: ["tobillo"] } },
    nowMs: START
  });
  assert.equal(queued.scales.run, "base");
  assert.equal(queued.pending[0].kind, "substitution");

  const acknowledged = acknowledgeCrossfitRuntimeItem(
    queued,
    queued.pending[0].body.idempotency_key,
    {
      substitution: {
        original_movement_id: "run",
        replacement: { canonical_movement_id: "air_bike", name: "Air Bike" }
      }
    },
    START + 1000
  );
  assert.equal(acknowledged.pending.length, 0);
  assert.equal(acknowledged.scales.run, "substitution:air_bike");
  assert.equal(acknowledged.substitutions.run.replacement.name, "Air Bike");
});

test("sustitución rechazada reutiliza la secuencia sin dejar huecos", () => {
  const substitution = queueCrossfitSubstitution(initial(), {
    movementId: "run",
    reason: "pain",
    checkIn: { pain: { score: 5, locations: ["tobillo"] } },
    nowMs: START
  });
  const withPause = queueCrossfitTimerAction({
    ...substitution,
    timer: { ...substitution.timer, state: "running", anchor_ms: START }
  }, "pause", START + 10000);

  const recovered = discardRejectedCrossfitSubstitution(
    withPause,
    substitution.pending[0].body.idempotency_key,
    START + 11000
  );
  assert.equal(recovered.pending.length, 1);
  assert.equal(recovered.pending[0].body.client_sequence, 0);
  assert.equal(recovered.next_sequence, 1);
});

test("estado corrupto o con otro catálogo de movimientos se descarta", () => {
  const corrupt = { ...initial(), next_sequence: 8, pending: [{ kind: "event", body: { client_sequence: 9 } }] };
  const hydrated = hydrateCrossfitRuntimeState(corrupt, {
    sessionId: 101,
    movementIds: ["run", "row_erg"],
    timeCapSeconds: 900,
    nowMs: START,
    token: "freshstate"
  });
  assert.equal(hydrated.next_sequence, 0);
  assert.deepEqual(Object.keys(hydrated.scales), ["run", "row_erg"]);
});
