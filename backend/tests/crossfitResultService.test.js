import assert from "node:assert/strict";
import test from "node:test";

import { registerSessionAutoreg } from "../services/progression/planAutoregService.js";
import {
  deriveCrossfitResultScales,
  isCrossfitV2Session,
  registerCrossfitV2Result
} from "../services/crossfit/results/resultService.js";
import { buildCrossfitPlannedTrainingLoad } from "../services/crossfit/trainingLoadAdapter.js";
import { CROSSFIT_VERSIONS } from "../services/crossfit/versions.js";

const NOW = new Date("2026-07-22T12:00:00.000Z");

function plannedLoad() {
  return buildCrossfitPlannedTrainingLoad({
    level: "intermediate",
    sessionType: "mixed",
    dayType: "D2",
    loadTier: "high",
    durationMin: 60,
    rpeTarget: 8
  }).load;
}

function session(overrides = {}) {
  return {
    id: 101,
    user_id: 7,
    methodology_plan_id: 22,
    methodology_type: "CrossFit",
    methodology_level: "Intermedio",
    day_id: 4,
    session_status: "completed",
    completion_rate: 100,
    total_duration_seconds: 3600,
    started_at: "2026-07-22T11:00:00.000Z",
    completed_at: "2026-07-22T12:00:00.000Z",
    session_type: "mixed",
    session_metadata: {
      planned_session_load: plannedLoad(),
      crossfit_v2_session: {
        schema_version: CROSSFIT_VERSIONS.session,
        level: "intermediate",
        wod: {
          movements: [
            { canonical_movement_id: "air_squat" },
            { canonical_movement_id: "run" }
          ]
        },
        provenance: { domain: "mixed" }
      }
    },
    ...overrides
  };
}

function manual(overrides = {}) {
  return {
    rpe: 7,
    completed: true,
    scale: "scaled",
    technique: 3,
    pain: { score: 0, locations: [], delta: 0 },
    readiness: { sleep: 4, fatigue: 2, recovery: 4, stress: 2 },
    score: { type: "time", elapsed_seconds: 900 },
    ...overrides
  };
}

class ResultClient {
  constructor({
    sessionRow = session(),
    existing = null,
    existingSessionId = null,
    existingPlanId = null,
    failOutbox = false,
    runtimeEvents = []
  } = {}) {
    this.sessionRow = sessionRow;
    this.existing = existing;
    this.existingSessionId = existingSessionId;
    this.existingPlanId = existingPlanId;
    this.failOutbox = failOutbox;
    this.runtimeEvents = runtimeEvents;
    this.calls = [];
  }

  async query(sql, params = []) {
    const text = String(sql);
    this.calls.push({ sql: text, params });
    if (text.includes("FROM app.methodology_exercise_sessions") && text.includes("FOR UPDATE")) {
      return this.sessionRow ? { rowCount: 1, rows: [this.sessionRow] } : { rowCount: 0, rows: [] };
    }
    if (text.includes("FROM app.crossfit_v2_results") && text.includes("session_id = $2")) {
      return this.existing ? {
        rowCount: 1,
        rows: [{
          session_id: this.existingSessionId ?? this.sessionRow?.id,
          methodology_plan_id: this.existingPlanId ?? this.sessionRow?.methodology_plan_id,
          payload: this.existing
        }]
      } : { rowCount: 0, rows: [] };
    }
    if (text.includes("FROM app.crossfit_v2_runtime_events")) {
      return { rowCount: this.runtimeEvents.length, rows: this.runtimeEvents };
    }
    if (text.includes("FROM app.methodology_exercise_progress")) {
      return { rowCount: 1, rows: [{ exercise_name: "Air Squat", status: "completed", series_completed: 3 }] };
    }
    if (text.includes("FROM app.exercise_session_tracking")) {
      return { rowCount: 1, rows: [{ exercise_name: "Air Squat", status: "completed", series_completed: 4 }] };
    }
    if (text.includes("FROM app.crossfit_v2_results") && text.includes("recorded_at >=")) {
      return { rowCount: 0, rows: [] };
    }
    if (text.includes("FROM app.crossfit_v2_autoreg_snapshots")) {
      return { rowCount: 0, rows: [] };
    }
    if (text.includes("INSERT INTO app.bridge_event_outbox")) {
      if (this.failOutbox) throw new Error("outbox unavailable");
      return { rowCount: 1, rows: [{ id: "outbox-1" }] };
    }
    return { rowCount: 1, rows: [] };
  }
}

test("servicio de resultado permanece completamente apagado por defecto", async () => {
  const client = new ResultClient();
  const result = await registerCrossfitV2Result(client, {
    userId: 7,
    planId: 22,
    sessionId: 101,
    manual: manual(),
    env: {}
  });
  assert.equal(result, null);
  assert.equal(client.calls.length, 0);
});

test("sesión v2 se reconoce por contrato, nunca solo por nombre de metodología", () => {
  assert.equal(isCrossfitV2Session(session()), true);
  assert.equal(isCrossfitV2Session(session({ session_metadata: {} })), false);
});

test("resultado v2 persiste ledger, snapshot y actual load sin consultar RIR", async () => {
  const client = new ResultClient();
  const output = await registerCrossfitV2Result(client, {
    userId: 7,
    planId: 22,
    sessionId: 101,
    manual: manual(),
    now: NOW,
    env: { CROSSFIT_V2_RESULTS: "true" }
  });

  assert.equal(output.registered, true);
  assert.equal(output.alreadyRegistered, false);
  assert.equal(output.decision, "hold");
  assert.equal(output.result.day_id, 4);
  assert.equal(output.result.actual_training_load.effort.rpe_actual, 7);
  assert.ok(output.result.reason_codes.includes("SESSION_COMPLETED"));
  assert.deepEqual(output.result.scales, [
    { movement_id: "air_squat", scale_id: "base" },
    { movement_id: "run", scale_id: "base" }
  ]);
  assert.equal(output.outbox.reason, "CROSSFIT_EMITS_TRAINING_LOAD_DISABLED");
  const sql = client.calls.map((call) => call.sql).join("\n");
  assert.match(sql, /INSERT INTO app\.crossfit_v2_results/);
  assert.match(sql, /INSERT INTO app\.crossfit_v2_autoreg_events/);
  assert.match(sql, /INSERT INTO app\.crossfit_v2_autoreg_snapshots/);
  assert.doesNotMatch(sql, /hypertrophy_set_logs|avg_rir|rir_reported/i);
});

test("feedback parcial cierra sesión, conserva porcentaje y traza el motivo", async () => {
  const client = new ResultClient({
    sessionRow: session({
      session_status: "in_progress",
      completion_rate: 0,
      completed_at: null,
      total_exercises: 2,
      exercises_completed: 0
    })
  });
  const output = await registerCrossfitV2Result(client, {
    userId: 7,
    planId: 22,
    sessionId: 101,
    manual: manual({
      completed: false,
      status: "partial",
      completion: 0.45,
      termination_reason: "fatigue"
    }),
    now: NOW,
    env: { CROSSFIT_V2_RESULTS: "true" }
  });

  assert.equal(output.result.status, "partial");
  assert.equal(output.result.completion, 0.45);
  assert.equal(output.result.provenance.termination_reason, "fatigue");
  assert.ok(output.result.reason_codes.includes("SESSION_PARTIAL"));
  assert.ok(client.calls.some((call) => /UPDATE app\.methodology_exercise_progress/.test(call.sql)));
  const closure = client.calls.find((call) => /crossfit_v2_closure/.test(call.sql));
  assert.equal(closure.params[1], "partial");
  assert.equal(closure.params[5], 45);
  assert.doesNotMatch(closure.sql, /abandoned_at/);
  assert.match(closure.sql, /session_status = \$2::varchar/);
  assert.match(closure.sql, /WHEN \$2::varchar = 'cancelled'/);
});

test("cancelación sin exposición no inventa métricas y emite carga real D0", async () => {
  const client = new ResultClient({
    sessionRow: session({
      session_status: "pending",
      completion_rate: 0,
      started_at: null,
      completed_at: null,
      total_duration_seconds: 0,
      total_exercises: 2,
      exercises_completed: 0
    })
  });
  const output = await registerCrossfitV2Result(client, {
    userId: 7,
    planId: 22,
    sessionId: 101,
    manual: {
      status: "cancelled",
      completion: 0,
      termination_reason: "time",
      score: { type: "none" }
    },
    now: NOW,
    env: { CROSSFIT_V2_RESULTS: "true" }
  });

  assert.equal(output.result.status, "cancelled");
  assert.equal(output.result.rpe, null);
  assert.equal(output.result.technique, null);
  assert.deepEqual(output.result.readiness, {
    sleep: null,
    fatigue: null,
    recovery: null,
    stress: null
  });
  assert.equal(output.result.actual_training_load.day_type, "D0");
  assert.equal(output.result.actual_training_load.load_tier, "rest");
  assert.equal(output.result.actual_training_load.duration.actual_min, 0);
  assert.equal(output.decision, "hold");
  assert.ok(output.autoreg.reason_codes.includes("SESSION_CANCELLED"));
  const closure = client.calls.find((call) => /crossfit_v2_closure/.test(call.sql));
  assert.equal(closure.params[1], "cancelled");
});

test("cancelación declarada por dolor exige contexto de dolor", async () => {
  await assert.rejects(
    registerCrossfitV2Result(new ResultClient({
      sessionRow: session({ session_status: "pending", completion_rate: 0 })
    }), {
      userId: 7,
      planId: 22,
      sessionId: 101,
      manual: {
        status: "cancelled",
        completion: 0,
        termination_reason: "pain",
        score: { type: "none" }
      },
      env: { CROSSFIT_V2_RESULTS: "true" }
    }),
    (error) => error.code === "CROSSFIT_PAIN_REQUIRED"
  );
});

test("estados terminales exigen porcentajes coherentes y no se pueden reescribir", async () => {
  await assert.rejects(
    registerCrossfitV2Result(new ResultClient({ sessionRow: session({ session_status: "in_progress" }) }), {
      userId: 7,
      planId: 22,
      sessionId: 101,
      manual: manual({ status: "cancelled", completion: 0.2, termination_reason: "time" }),
      env: { CROSSFIT_V2_RESULTS: "true" }
    }),
    (error) => error.code === "CROSSFIT_COMPLETION_INVALID"
  );
  await assert.rejects(
    registerCrossfitV2Result(new ResultClient(), {
      userId: 7,
      planId: 22,
      sessionId: 101,
      manual: manual({ status: "partial", completion: 0.5, termination_reason: "fatigue" }),
      env: { CROSSFIT_V2_RESULTS: "true" }
    }),
    (error) => error.code === "HISTORY_IMMUTABLE" && error.status === 409
  );
  await assert.rejects(
    registerCrossfitV2Result(new ResultClient({ sessionRow: session({ session_status: "pending" }) }), {
      userId: 7,
      planId: 22,
      sessionId: 101,
      manual: manual({ status: "partial", completion: 0.5, termination_reason: "time" }),
      env: { CROSSFIT_V2_RESULTS: "true" }
    }),
    (error) => error.code === "CROSSFIT_SESSION_NOT_STARTED" && error.status === 409
  );
});

test("escalas de resultado proceden del ledger y no del payload cliente", async () => {
  const runtimeEvents = [{
    event_type: "movement_substituted",
    payload: {
      payload: {
        original_movement_id: "run",
        replacement: { canonical_movement_id: "air_bike" }
      }
    }
  }];
  const client = new ResultClient({ runtimeEvents });
  const output = await registerCrossfitV2Result(client, {
    userId: 7,
    planId: 22,
    sessionId: 101,
    manual: manual({
      scale: "rxplus",
      scales: [{ movement_id: "air_squat", scale_id: "rxplus" }]
    }),
    now: NOW,
    env: { CROSSFIT_V2_RESULTS: "true" }
  });

  assert.deepEqual(output.result.scales, [
    { movement_id: "air_squat", scale_id: "base" },
    { movement_id: "run", scale_id: "substitution:air_bike" }
  ]);
});

test("derivación de escalas falla cerrada sin WOD canónico", () => {
  assert.throws(
    () => deriveCrossfitResultScales(session({
      session_metadata: {
        planned_session_load: plannedLoad(),
        crossfit_v2_session: { schema_version: CROSSFIT_VERSIONS.session, level: "intermediate" }
      }
    }), []),
    (error) => error.code === "CROSSFIT_RUNTIME_TRACE_REQUIRED"
  );
});

test("resultado single-day obtiene la carga real del tracking de fin de semana", async () => {
  const client = new ResultClient({ sessionRow: session({ session_type: "weekend-extra" }) });
  const output = await registerCrossfitV2Result(client, {
    userId: 7,
    planId: 22,
    sessionId: 101,
    manual: manual(),
    now: NOW,
    env: { CROSSFIT_V2_RESULTS: "true" }
  });

  assert.equal(output.result.actual_training_load.work.sets_total, 4);
  assert.equal(client.calls.some((call) => call.sql.includes("FROM app.exercise_session_tracking")), true);
  assert.equal(client.calls.some((call) => call.sql.includes("FROM app.methodology_exercise_progress")), false);
});

test("cierre automático v2 espera feedback y no cae al motor legacy", async () => {
  const client = new ResultClient();
  const original = process.env.CROSSFIT_V2_RESULTS;
  process.env.CROSSFIT_V2_RESULTS = "true";
  try {
    const output = await registerSessionAutoreg(client, {
      userId: 7,
      planId: 22,
      sessionId: 101,
      methodologyType: "CrossFit"
    });
    assert.equal(output.pendingFeedback, true);
    assert.equal(output.source, "crossfit_v2_pending_feedback");
    assert.equal(client.calls.some((call) => /crossfit_register_wod_result|hypertrophy_set_logs/i.test(call.sql)), false);
  } finally {
    if (original === undefined) delete process.env.CROSSFIT_V2_RESULTS;
    else process.env.CROSSFIT_V2_RESULTS = original;
  }
});

test("idempotencia devuelve el resultado y snapshot existentes sin reinsertar", async () => {
  const existing = { result_id: "cfr_existing", recorded_at: NOW.toISOString(), rpe: 7 };
  const client = new ResultClient({ existing });
  const output = await registerCrossfitV2Result(client, {
    userId: 7,
    planId: 22,
    sessionId: 101,
    manual: manual(),
    env: { CROSSFIT_V2_RESULTS: "true" }
  });
  assert.equal(output.alreadyRegistered, true);
  assert.equal(output.result, existing);
  assert.equal(client.calls.some((call) => call.sql.includes("INSERT INTO app.crossfit_v2_results")), false);
});

test("idempotencia rechaza un segundo payload materialmente distinto", async () => {
  const first = await registerCrossfitV2Result(new ResultClient(), {
    userId: 7,
    planId: 22,
    sessionId: 101,
    manual: manual(),
    env: { CROSSFIT_V2_RESULTS: "true" }
  });
  await assert.rejects(
    registerCrossfitV2Result(new ResultClient({ existing: first.result }), {
      userId: 7,
      planId: 22,
      sessionId: 101,
      manual: manual({ rpe: 9 }),
      env: { CROSSFIT_V2_RESULTS: "true" }
    }),
    (error) => error.code === "IDEMPOTENCY_BROKEN" && error.status === 409
  );
});

test("idempotencia rechaza una clave ligada a otra sesión aunque coincida el feedback", async () => {
  const first = await registerCrossfitV2Result(new ResultClient(), {
    userId: 7,
    planId: 22,
    sessionId: 101,
    manual: manual(),
    env: { CROSSFIT_V2_RESULTS: "true" }
  });
  await assert.rejects(
    registerCrossfitV2Result(new ResultClient({
      existing: first.result,
      existingSessionId: 999,
      existingPlanId: 22
    }), {
      userId: 7,
      planId: 22,
      sessionId: 101,
      manual: manual(),
      env: { CROSSFIT_V2_RESULTS: "true" }
    }),
    (error) => error.code === "IDEMPOTENCY_BROKEN" && error.status === 409
  );
});

test("resultado v2 rechaza payload incompleto, cruce de plan y sesión sin day_id", async () => {
  await assert.rejects(
    registerCrossfitV2Result(new ResultClient(), {
      userId: 7, planId: 22, sessionId: 101, manual: manual({ technique: undefined }),
      env: { CROSSFIT_V2_RESULTS: "true" }
    }),
    { code: "CROSSFIT_TECHNIQUE_REQUIRED" }
  );
  await assert.rejects(
    registerCrossfitV2Result(new ResultClient(), {
      userId: 7, planId: 999, sessionId: 101, manual: manual(),
      env: { CROSSFIT_V2_RESULTS: "true" }
    }),
    { code: "CROSSFIT_PLAN_SESSION_MISMATCH" }
  );
  await assert.rejects(
    registerCrossfitV2Result(new ResultClient({ sessionRow: session({ day_id: null }) }), {
      userId: 7, planId: 22, sessionId: 101, manual: manual(),
      env: { CROSSFIT_V2_RESULTS: "true" }
    }),
    { code: "CROSSFIT_DAY_ID_REQUIRED" }
  );
});

test("outbox CrossFit requiere ambos flags y conserva RPE real", async () => {
  const client = new ResultClient();
  const output = await registerCrossfitV2Result(client, {
    userId: 7,
    planId: 22,
    sessionId: 101,
    manual: manual({ rpe: 8 }),
    now: NOW,
    env: {
      CROSSFIT_V2_RESULTS: "true",
      CROSSFIT_EMITS_TRAINING_LOAD: "true",
      BRIDGE_OUTBOX_EMIT_ENABLED: "true"
    }
  });
  const enqueue = client.calls.find((call) => call.sql.includes("INSERT INTO app.bridge_event_outbox"));
  const payload = JSON.parse(enqueue.params[4]);
  assert.equal(output.outbox.enqueued, true);
  assert.equal(payload.actual_session_load.effort.rpe_actual, 8);
  assert.equal(payload.completion_rate, 100);
});

test("fallo del outbox revierte su savepoint pero conserva el resultado", async () => {
  const client = new ResultClient({ failOutbox: true });
  const output = await registerCrossfitV2Result(client, {
    userId: 7,
    planId: 22,
    sessionId: 101,
    manual: manual(),
    env: {
      CROSSFIT_V2_RESULTS: "true",
      CROSSFIT_EMITS_TRAINING_LOAD: "true",
      BRIDGE_OUTBOX_EMIT_ENABLED: "true"
    }
  });
  assert.equal(output.registered, true);
  assert.equal(output.outbox.enqueued, false);
  assert.equal(client.calls.some((call) => call.sql === "ROLLBACK TO SAVEPOINT crossfit_v2_outbox"), true);
});
