import assert from "node:assert/strict";
import test from "node:test";

import { registerSessionAutoreg } from "../services/progression/planAutoregService.js";
import {
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
  constructor({ sessionRow = session(), existing = null, failOutbox = false } = {}) {
    this.sessionRow = sessionRow;
    this.existing = existing;
    this.failOutbox = failOutbox;
    this.calls = [];
  }

  async query(sql, params = []) {
    const text = String(sql);
    this.calls.push({ sql: text, params });
    if (text.includes("FROM app.methodology_exercise_sessions") && text.includes("FOR UPDATE")) {
      return this.sessionRow ? { rowCount: 1, rows: [this.sessionRow] } : { rowCount: 0, rows: [] };
    }
    if (text.includes("FROM app.crossfit_v2_results") && text.includes("session_id = $2")) {
      return this.existing ? { rowCount: 1, rows: [{ payload: this.existing }] } : { rowCount: 0, rows: [] };
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
  assert.equal(output.outbox.reason, "CROSSFIT_EMITS_TRAINING_LOAD_DISABLED");
  const sql = client.calls.map((call) => call.sql).join("\n");
  assert.match(sql, /INSERT INTO app\.crossfit_v2_results/);
  assert.match(sql, /INSERT INTO app\.crossfit_v2_autoreg_events/);
  assert.match(sql, /INSERT INTO app\.crossfit_v2_autoreg_snapshots/);
  assert.doesNotMatch(sql, /hypertrophy_set_logs|avg_rir|rir_reported/i);
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
