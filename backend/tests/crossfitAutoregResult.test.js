import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { reduceCrossfitAutoreg } from "../services/crossfit/autoreg/stateMachine.js";
import { validateCrossfitAutoreg, validateCrossfitResult } from "../services/crossfit/contracts/schemas.js";
import { buildCrossfitResultV2 } from "../services/crossfit/results/resultBuilder.js";
import { buildCrossfitPlannedTrainingLoad } from "../services/crossfit/trainingLoadAdapter.js";
import { adjustPrescriptionsForStart } from "../services/progression/planAutoregService.js";

const NOW = "2026-07-22T12:00:00.000Z";

function planned() {
  return buildCrossfitPlannedTrainingLoad({
    level: "intermediate",
    sessionType: "mixed",
    dayType: "D2",
    loadTier: "high",
    durationMin: 60,
    rpeTarget: 8
  }).load;
}

function result(overrides = {}) {
  const defaults = {
    request_id: "req_result",
    session_id: "session_1",
    plan_id: "plan_1",
    day_id: "day_1",
    user_id: "user_1",
    status: "completed",
    completion: 1,
    score: { type: "time", elapsed_seconds: 600 },
    scales: [{ movement_id: "air_squat", scale_id: "base" }],
    rpe: 7,
    technique: 3,
    pain: { score: 0, locations: [], quality: null, delta: 0, red_flag: false, acute_injury: false },
    readiness: { sleep: 4, fatigue: 2, recovery: 4, stress: 2 },
    recorded_at: NOW,
    idempotency_key: "result:session_1",
    planned_training_load: planned(),
    duration_seconds: 3600,
    exercise_rows: [{ series_completed: 3 }],
    level: "intermediate",
    provenance: { adherence_rate: 0.9, skill_prerequisites_met: true },
  };
  return buildCrossfitResultV2({
    ...defaults,
    ...overrides,
    pain: { ...defaults.pain, ...(overrides.pain ?? {}) },
    readiness: { ...defaults.readiness, ...(overrides.readiness ?? {}) },
    provenance: { ...defaults.provenance, ...(overrides.provenance ?? {}) }
  });
}

function autoreg(events, overrides = {}) {
  return reduceCrossfitAutoreg({
    events,
    user_id: "user_1",
    plan_id: "plan_1",
    source_event_id: events.at(-1)?.result_id ?? "event_1",
    request_id: "req_autoreg",
    processed_at: NOW,
    ...overrides
  });
}

test("construye resultado v2 con carga real, RPE y sin RIR", () => {
  const built = result();
  assert.equal(validateCrossfitResult(built).valid, true);
  assert.equal(built.actual_training_load.status, "completed");
  assert.equal(built.actual_training_load.effort.rpe_actual, 7);
  assert.equal("rir" in built, false);
  assert.equal(JSON.stringify(built).includes("avgRir"), false);
});

test("resultado idéntico conserva result_id e idempotency_key", () => {
  assert.deepEqual(result(), result());
});

test("red flag y dolor severo bloquean inmediatamente y requieren resolución explícita", () => {
  const blockedEvent = result({ pain: { score: 6, quality: "punzante" } });
  const blocked = autoreg([blockedEvent]);
  const stillBlocked = autoreg([result()], {
    previous_snapshot: blocked,
    source_event_id: "second_event",
    processed_at: "2026-07-23T12:00:00.000Z"
  });

  assert.equal(blocked.state, "blocked");
  assert.equal(stillBlocked.state, "blocked");
  assert.equal(validateCrossfitAutoreg(blocked).valid, true);
});

test("dolor moderado y técnica cero regresan antes del rendimiento", () => {
  const painResult = result({ pain: { score: 3 } });
  const techniqueResult = result({ technique: 0 });

  assert.deepEqual(painResult.reason_codes, ["SAFETY_PAIN_MODIFY"]);
  assert.deepEqual(techniqueResult.reason_codes, ["SAFETY_TECHNIQUE_STOP"]);
  assert.equal(autoreg([painResult]).state, "regress");
  assert.equal(autoreg([techniqueResult]).state, "regress");
});

test("dos señales independientes activan deload, una sola mantiene hold", () => {
  const highRpe = [0, 1, 2].map((index) => result({
    session_id: `session_${index}`,
    idempotency_key: `result:${index}`,
    recorded_at: new Date(Date.parse(NOW) - (2 - index) * 86400000).toISOString(),
    rpe: index >= 1 ? 9 : 8,
    readiness: { sleep: 2, fatigue: 4, recovery: 2 }
  }));
  const oneSignal = highRpe.map((event) => ({ ...event, readiness: { sleep: 4, fatigue: 2, recovery: 4 } }));

  assert.equal(autoreg(highRpe).state, "deload");
  assert.equal(autoreg(oneSignal).state, "hold");
});

test("tres exposiciones comparables progresan capacidad, nunca por una sola fácil", () => {
  const events = [0, 1, 2].map((index) => result({
    session_id: `session_${index}`,
    idempotency_key: `result:${index}`,
    recorded_at: new Date(Date.parse(NOW) - (2 - index) * 3 * 86400000).toISOString(),
    provenance: { adherence_rate: 0.9, domain: "monostructural" }
  }));

  assert.equal(autoreg([events[0]]).state, "hold");
  const progressed = autoreg(events);
  assert.equal(progressed.state, "progress_capacity");
  assert.equal(progressed.actions.capacity.variable, "work");
});

test("progresión de skill exige tres técnicas 3 y prerequisitos, separada de capacidad", () => {
  const events = [0, 1, 2].map((index) => result({
    session_id: `skill_${index}`,
    idempotency_key: `skill:${index}`,
    recorded_at: new Date(Date.parse(NOW) - (2 - index) * 3 * 86400000).toISOString(),
    provenance: {
      adherence_rate: 0.9,
      skill_candidate: true,
      skill_prerequisites_met: true,
      skill_id: "double_under"
    }
  }));
  const progressed = autoreg(events);

  assert.equal(progressed.state, "progress_skill");
  assert.equal(progressed.actions.capacity, null);
  assert.equal(progressed.actions.skill.skill_id, "double_under");
});

test("retorno y readiness baja regresan; cambio de equipo mantiene hold", () => {
  assert.equal(autoreg([result()], { pause_days: 21 }).state, "regress");
  assert.equal(autoreg([result({ readiness: { sleep: 2, recovery: 2, fatigue: 4 } })]).state, "regress");
  assert.equal(autoreg([result({ provenance: { equipment_signature_changed: true } })]).state, "hold");
});

test("eventos fuera de orden convergen al mismo snapshot material", () => {
  const events = [0, 1, 2].map((index) => result({
    session_id: `ordered_${index}`,
    idempotency_key: `ordered:${index}`,
    recorded_at: new Date(Date.parse(NOW) - (2 - index) * 2 * 86400000).toISOString(),
    provenance: { adherence_rate: 0.9 }
  }));
  const ordered = autoreg(events);
  const unordered = autoreg([events[2], events[0], events[1]]);

  assert.equal(ordered.state, unordered.state);
  assert.deepEqual(ordered.features, unordered.features);
  assert.equal(ordered.snapshot_id, unordered.snapshot_id);
});

test("inicio CrossFit v2 usa snapshot y no offsets RIR legacy", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (/crossfit_v2_autoreg_snapshots/.test(sql)) {
        return {
          rowCount: 1,
          rows: [{
            snapshot_id: "cfa_progress",
            state: "progress_capacity",
            payload: {
              state: "progress_capacity",
              reason_codes: ["AUTOREG_BUILD"],
              actions: { capacity: { variable: "load", increment: 0.025 }, skill: null, scale: "hold" }
            }
          }]
        };
      }
      if (/UPDATE app\.methodology_exercise_sessions/.test(sql)) return { rowCount: 1, rows: [] };
      throw new Error(`SQL inesperado: ${sql}`);
    }
  };
  const adjusted = await adjustPrescriptionsForStart(client, {
    userId: "user_1",
    planId: 7,
    sessionId: 11,
    methodologyType: "CrossFit",
    planSchemaVersion: "crossfit-plan/v2",
    ejercicios: [{ nombre: "Front Squat", repeticiones: "5" }]
  });

  assert.equal(adjusted.meta.state, "progress_capacity");
  assert.match(adjusted.ejercicios[0].notas, /solo load \+3%/);
  assert.equal(calls.some((call) => /plan_progression_offsets/.test(call.sql)), false);
  assert.equal(calls.some((call) => /crossfit_v2_start_adjustment/.test(call.sql)), true);
});

test("snapshot blocked impide iniciar antes de consultar progresión legacy", async () => {
  const client = {
    async query(sql) {
      assert.match(sql, /crossfit_v2_autoreg_snapshots/);
      return {
        rowCount: 1,
        rows: [{
          snapshot_id: "cfa_blocked",
          state: "blocked",
          payload: { state: "blocked", reason_codes: ["SAFETY_PAIN_BLOCK"], actions: {} }
        }]
      };
    }
  };
  await assert.rejects(
    adjustPrescriptionsForStart(client, {
      userId: "user_1",
      planId: 7,
      methodologyType: "CrossFit",
      planSchemaVersion: "crossfit-plan/v2",
      ejercicios: [{ nombre: "Burpee" }]
    }),
    (error) => error.code === "CROSSFIT_SESSION_BLOCKED"
      && error.reasonCode === "SAFETY_PAIN_BLOCK"
      && error.status === 423
  );
});

test("migración de resultados es aditiva, append-only, idempotente y con RLS", () => {
  const sql = fs.readFileSync(
    new URL("../migrations/20260722_crossfit_v2_results_autoreg.sql", import.meta.url),
    "utf8"
  );
  assert.match(sql, /^--[\s\S]*\bBEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS app\.crossfit_v2_results/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS app\.crossfit_v2_autoreg_events/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS app\.crossfit_v2_autoreg_snapshots/);
  assert.match(sql, /UNIQUE \(user_id, idempotency_key\)/);
  assert.match(sql, /UNIQUE \(source_event_id\)/);
  assert.match(sql, /crossfit_v2_reject_append_only_mutation/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(sql, /current_setting\(''app\.current_user_id'', true\)/);
  assert.doesNotMatch(sql, /(?:UPDATE|DELETE FROM|TRUNCATE)\s+app\.crossfit_autoreg_state/i);
  assert.doesNotMatch(sql, /(?:UPDATE|DELETE FROM|TRUNCATE)\s+app\.methodology_exercise_sessions/i);
  assert.doesNotMatch(sql, /20260721_backfill_mes_day_id/);
});
