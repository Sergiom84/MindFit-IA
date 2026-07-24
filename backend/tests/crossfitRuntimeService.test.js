import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  allCrossfitEquipment,
  loadCrossfitCatalogFixture
} from "./helpers/crossfitCatalogFixture.js";
import {
  loadCrossfitRuntimeSession,
  normalizeCrossfitRuntimeEvent,
  normalizeCrossfitSubstitutionRequest,
  recordCrossfitRuntimeEvent,
  resolveCrossfitSubstitution,
  validateCrossfitRuntimeTransition
} from "../services/crossfit/runtime/runtimeService.js";
import { CROSSFIT_VERSIONS } from "../services/crossfit/versions.js";

const NOW = new Date("2026-07-22T12:00:00.000Z");
const CATALOG = loadCrossfitCatalogFixture();
const EQUIPMENT = allCrossfitEquipment(CATALOG);

function context(movementId = "run", level = "beginner") {
  const movement = CATALOG.find((item) => item.canonical_id === movementId);
  return {
    row: {
      id: 501,
      user_id: 71,
      methodology_plan_id: 91,
      day_id: 4,
      session_status: "in_progress"
    },
    canonical_session: {
      schema_version: CROSSFIT_VERSIONS.session,
      catalog_version: CROSSFIT_VERSIONS.catalog,
      level,
      wod: {
        movements: [{
          canonical_movement_id: movement.canonical_id,
          dose: movement.domain === "monostructural"
            ? { type: "duration", duration_seconds: 60 }
            : { type: "reps", reps: 10 }
        }]
      }
    },
    plan_data: {
      crossfit_classification: { skill_permissions: {} }
    }
  };
}

function edges(sourceId) {
  const source = CATALOG.find((item) => item.canonical_id === sourceId);
  const ids = new Set(CATALOG.map((item) => item.canonical_id));
  return source.substitutions.filter((targetId) => ids.has(targetId)).map((targetId) => ({
    source_id: sourceId,
    target_id: targetId,
    target_kind: "movement",
    priority: 100,
    stimulus_delta: null,
    conditions: { stimulus_preservation_required: true }
  }));
}

function substitutionBody(overrides = {}) {
  return {
    schema_version: CROSSFIT_VERSIONS.substitution,
    request_id: "runtime-substitution-request",
    idempotency_key: "runtime-substitution-idempotency",
    stream_id: "stream_runtime_1",
    client_sequence: 3,
    occurred_at: NOW.toISOString(),
    movement_id: "run",
    reason: "pain",
    check_in: { pain: { score: 3, delta: 0, quality: "molestia", locations: ["tobillo"] } },
    temporarily_unavailable_equipment: [],
    ...overrides
  };
}

test("normaliza eventos publicos y rechaza RX+ o sustitucion inyectada", () => {
  const base = {
    schema_version: CROSSFIT_VERSIONS.runtimeEvent,
    request_id: "runtime-event-request",
    idempotency_key: "runtime-event-idempotency",
    stream_id: "stream_runtime_1",
    client_sequence: 2,
    occurred_at: NOW.toISOString()
  };
  const valid = normalizeCrossfitRuntimeEvent({
    ...base,
    event_type: "scale_selected",
    payload: { movement_id: "run", scale_id: "scaled" }
  }, { now: NOW });
  assert.equal(valid.payload.scale_id, "scaled");
  assert.throws(
    () => normalizeCrossfitRuntimeEvent({
      ...base,
      event_type: "scale_selected",
      payload: { movement_id: "run", scale_id: "rxplus" }
    }, { now: NOW }),
    (error) => error.code === "WOD_SCALE_STIMULUS_LOSS"
  );
  assert.throws(
    () => normalizeCrossfitRuntimeEvent({
      ...base,
      event_type: "movement_substituted",
      payload: {}
    }, { now: NOW }),
    (error) => error.code === "CROSSFIT_RUNTIME_EVENT_INVALID"
  );
});

test("valida motivo de dolor, tecnica y material antes de resolver", () => {
  assert.throws(
    () => normalizeCrossfitSubstitutionRequest(substitutionBody({ check_in: { pain: { score: 0, locations: [] } } }), { now: NOW }),
    (error) => error.code === "CROSSFIT_SUBSTITUTION_INVALID"
  );
  assert.throws(
    () => normalizeCrossfitSubstitutionRequest(substitutionBody({ reason: "technique", check_in: { technique_score: 2 } }), { now: NOW }),
    (error) => error.code === "CROSSFIT_SUBSTITUTION_INVALID"
  );
  assert.throws(
    () => normalizeCrossfitSubstitutionRequest(substitutionBody({ reason: "equipment", check_in: {}, temporarily_unavailable_equipment: [] }), { now: NOW }),
    (error) => error.code === "CROSSFIT_SUBSTITUTION_INVALID"
  );
});

test("sustituye impacto por opcion segura preservando duracion y stimulus", () => {
  const request = normalizeCrossfitSubstitutionRequest(substitutionBody(), { now: NOW });
  const result = resolveCrossfitSubstitution({
    context: context(),
    request,
    catalog: CATALOG,
    edges: edges("run"),
    profile: {},
    equipment: EQUIPMENT
  });

  assert.equal(result.original_movement_id, "run");
  assert.equal(result.replacement.canonical_movement_id, "air_bike");
  assert.deepEqual(result.replacement.dose, { type: "duration", duration_seconds: 60 });
  assert.ok(result.stimulus_delta <= 0.15);
  assert.deepEqual(result.reason_codes, ["SAFETY_PAIN_MODIFY"]);
});

test("un target solicitado fuera de las aristas validadas falla cerrado", () => {
  const request = normalizeCrossfitSubstitutionRequest(substitutionBody({ requested_target_id: "burpee" }), { now: NOW });
  assert.throws(
    () => resolveCrossfitSubstitution({
      context: context(),
      request,
      catalog: CATALOG,
      edges: edges("run"),
      profile: {},
      equipment: EQUIPMENT
    }),
    (error) => error.code === "WOD_SCALE_STIMULUS_LOSS"
  );
});

test("una red flag bloquea la sesion antes de buscar candidato", () => {
  const request = normalizeCrossfitSubstitutionRequest(substitutionBody({
    check_in: {
      pain: { score: 3, locations: ["tobillo"] },
      red_flags: ["dolor toracico"]
    }
  }), { now: NOW });
  assert.throws(
    () => resolveCrossfitSubstitution({
      context: context(),
      request,
      catalog: CATALOG,
      edges: edges("run"),
      profile: {},
      equipment: EQUIPMENT
    }),
    (error) => error.code === "SAFETY_RED_FLAG" && error.details.safe_fallback === "stop_session_and_refer"
  );
});

test("el booleano de red flag bloquea aunque no incluya texto libre", () => {
  const request = normalizeCrossfitSubstitutionRequest(substitutionBody({
    check_in: {
      pain: { score: 3, locations: ["tobillo"] },
      red_flag: true,
      acute_injury: true
    }
  }), { now: NOW });
  assert.throws(
    () => resolveCrossfitSubstitution({
      context: context(),
      request,
      catalog: CATALOG,
      edges: edges("run"),
      profile: {},
      equipment: EQUIPMENT
    }),
    (error) => error.code === "SAFETY_RED_FLAG" && error.details.safe_fallback === "stop_session_and_refer"
  );
});

test("persiste eventos con identidad estable e idempotencia", async () => {
  const calls = [];
  const db = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/INSERT INTO app\.crossfit_v2_runtime_events/.test(sql)) {
        return { rowCount: 1, rows: [{ event_id: "cfu_aaaaaaaaaaaaaaaaaaaaaaaa", event_sequence: 9 }] };
      }
      return { rowCount: 0, rows: [] };
    }
  };
  const event = normalizeCrossfitRuntimeEvent({
    schema_version: CROSSFIT_VERSIONS.runtimeEvent,
    request_id: "runtime-start-request",
    idempotency_key: "runtime-start-idempotency",
    stream_id: "stream_runtime_1",
    client_sequence: 0,
    event_type: "timer_started",
    occurred_at: NOW.toISOString(),
    payload: { elapsed_seconds: 0, time_cap_seconds: 900 }
  }, { now: NOW });
  const result = await recordCrossfitRuntimeEvent(db, context(), event);

  assert.equal(result.idempotent_replay, false);
  const insert = calls.find((call) => /INSERT INTO app\.crossfit_v2_runtime_events/.test(call.sql));
  assert.equal(result.event.event_id, insert.params[0]);
  assert.equal(result.event_sequence, 9);
  assert.match(insert.sql, /ON CONFLICT \(user_id, idempotency_key\) DO NOTHING/);
});

test("rechaza colision de secuencia aunque cambie la idempotency key", async () => {
  const db = {
    async query(sql) {
      if (/INSERT INTO app\.crossfit_v2_runtime_events/.test(sql)) {
        const error = new Error("duplicate");
        error.code = "23505";
        throw error;
      }
      return { rowCount: 0, rows: [] };
    }
  };
  const event = normalizeCrossfitRuntimeEvent({
    schema_version: CROSSFIT_VERSIONS.runtimeEvent,
    request_id: "runtime-reset-request",
    idempotency_key: "runtime-reset-idempotency",
    stream_id: "stream_runtime_1",
    client_sequence: 0,
    event_type: "timer_started",
    occurred_at: NOW.toISOString(),
    payload: { elapsed_seconds: 0, time_cap_seconds: 900 }
  }, { now: NOW });

  await assert.rejects(
    recordCrossfitRuntimeEvent(db, context(), event),
    (error) => error.code === "IDEMPOTENCY_BROKEN" && error.status === 409
  );
});

test("valida secuencia y transiciones del temporizador", () => {
  const event = (eventType, sequence, elapsed) => normalizeCrossfitRuntimeEvent({
    schema_version: CROSSFIT_VERSIONS.runtimeEvent,
    request_id: `runtime-${eventType}-request`,
    idempotency_key: `runtime-${eventType}-idempotency`,
    stream_id: "stream_runtime_1",
    client_sequence: sequence,
    event_type: eventType,
    occurred_at: NOW.toISOString(),
    payload: { elapsed_seconds: elapsed, time_cap_seconds: 900 }
  }, { now: NOW });
  const startedPayload = {
    payload: { elapsed_seconds: 0, time_cap_seconds: 900 }
  };

  assert.doesNotThrow(() => validateCrossfitRuntimeTransition(event("timer_started", 0, 0)));
  assert.doesNotThrow(() => validateCrossfitRuntimeTransition(event("timer_paused", 1, 42), {
    previousEvent: { client_sequence: 0 },
    previousTimerEvent: { event_type: "timer_started", ...startedPayload }
  }));
  assert.throws(
    () => validateCrossfitRuntimeTransition(event("timer_resumed", 3, 42), {
      previousEvent: { client_sequence: 1 },
      previousTimerEvent: { event_type: "timer_paused", payload: { elapsed_seconds: 42, time_cap_seconds: 900 } }
    }),
    (error) => error.code === "CROSSFIT_RUNTIME_SEQUENCE_INVALID"
      && error.details.expected_client_sequence === 2
  );
  assert.throws(
    () => validateCrossfitRuntimeTransition(event("timer_resumed", 1, 0), {
      previousEvent: { client_sequence: 0 },
      previousTimerEvent: { event_type: "timer_started", ...startedPayload }
    }),
    (error) => error.code === "CROSSFIT_RUNTIME_TRANSITION_INVALID"
  );
});

test("rechaza escala para un movimiento que no pertenece al WOD", async () => {
  const event = normalizeCrossfitRuntimeEvent({
    schema_version: CROSSFIT_VERSIONS.runtimeEvent,
    request_id: "runtime-foreign-movement-request",
    idempotency_key: "runtime-foreign-movement-idempotency",
    stream_id: "stream_runtime_1",
    client_sequence: 0,
    event_type: "scale_selected",
    occurred_at: NOW.toISOString(),
    payload: { movement_id: "burpee", scale_id: "scaled" }
  }, { now: NOW });

  await assert.rejects(
    recordCrossfitRuntimeEvent({ query: async () => ({ rowCount: 0, rows: [] }) }, context(), event),
    (error) => error.code === "CROSSFIT_MOVEMENT_NOT_FOUND" && error.status === 404
  );
});

test("migracion runtime es aditiva, append-only, idempotente y entra en QA efimero", () => {
  const sql = fs.readFileSync(
    new URL("../migrations/20260722_crossfit_v2_runtime_events.sql", import.meta.url),
    "utf8"
  );
  const workflow = fs.readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");

  assert.match(sql, /CREATE TABLE IF NOT EXISTS app\.crossfit_v2_runtime_events/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /crossfit_v2_runtime_events_owner_read/);
  assert.match(sql, /BEFORE UPDATE OR DELETE/);
  assert.match(sql, /uq_crossfit_v2_runtime_client_sequence UNIQUE/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM app\./);
  assert.equal(
    workflow.match(/20260722_crossfit_v2_runtime_events\.sql/g)?.length,
    2
  );
});

test("reintento idempotente devuelve el mismo evento sin segundo insert", async () => {
  let stored = null;
  let inserts = 0;
  const db = {
    async query(sql, params) {
      if (/WHERE user_id = \$1 AND idempotency_key = \$2/.test(sql)) {
        return stored ? { rowCount: 1, rows: [stored] } : { rowCount: 0, rows: [] };
      }
      if (/INSERT INTO app\.crossfit_v2_runtime_events/.test(sql)) {
        inserts += 1;
        stored = {
          event_sequence: 11,
          content_hash: params[13],
          payload: JSON.parse(params[14])
        };
        return { rowCount: 1, rows: [{ event_id: params[0], event_sequence: 11 }] };
      }
      return { rowCount: 0, rows: [] };
    }
  };
  const event = normalizeCrossfitRuntimeEvent({
    schema_version: CROSSFIT_VERSIONS.runtimeEvent,
    request_id: "runtime-replay-request",
    idempotency_key: "runtime-replay-idempotency",
    stream_id: "stream_runtime_1",
    client_sequence: 0,
    event_type: "timer_started",
    occurred_at: NOW.toISOString(),
    payload: { elapsed_seconds: 0, time_cap_seconds: 900 }
  }, { now: NOW });

  const first = await recordCrossfitRuntimeEvent(db, context(), event);
  const second = await recordCrossfitRuntimeEvent(db, context(), event);
  assert.equal(first.idempotent_replay, false);
  assert.equal(second.idempotent_replay, true);
  assert.deepEqual(second.event, first.event);
  assert.equal(inserts, 1);
});

test("solo sesiones abiertas admiten runtime; historial queda inmutable", async () => {
  const row = (status) => ({
    id: 501,
    user_id: 71,
    methodology_plan_id: 91,
    day_id: 4,
    session_status: status,
    session_metadata: {
      crossfit_v2_session: {
        schema_version: CROSSFIT_VERSIONS.session,
        catalog_version: CROSSFIT_VERSIONS.catalog
      }
    },
    plan_data: {}
  });
  const db = (status) => ({
    query: async () => ({ rowCount: 1, rows: [row(status)] })
  });

  const open = await loadCrossfitRuntimeSession(db("pending"), 71, 501);
  assert.equal(open.row.session_status, "pending");
  for (const status of ["completed", "partial", "cancelled", "abandoned", "skipped", "missed", "incomplete"]) {
    await assert.rejects(
      loadCrossfitRuntimeSession(db(status), 71, 501),
      (error) => error.code === "HISTORY_IMMUTABLE" && error.status === 409,
      status
    );
  }
});
