import assert from "node:assert/strict";
import test from "node:test";

import {
  loadCrossfitSelfAssessment,
  loadLatestVerifiedCrossfitAssessment,
  recordCrossfitAssessment
} from "../services/crossfit/classification/assessmentRepository.js";

function fakeDb({ insert = true, latest = null, existingHash = null } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes("INSERT INTO app.crossfit_v2_assessments")) {
        return insert
          ? { rowCount: 1, rows: [{ assessment_id: "cfx_aaaaaaaaaaaaaaaaaaaaaaaa", created_at: new Date() }] }
          : { rowCount: 0, rows: [] };
      }
      if (sql.includes("idempotency_key = $2")) {
        return {
          rowCount: 1,
          rows: [{
            assessment_id: "cfx_bbbbbbbbbbbbbbbbbbbbbbbb",
            content_hash: existingHash ?? calls[0].params[6]
          }]
        };
      }
      if (sql.includes("source = 'professional_review'")) {
        return { rowCount: latest ? 1 : 0, rows: latest ? [latest] : [] };
      }
      if (sql.includes("source = 'self_report'")) {
        return { rowCount: latest ? 1 : 0, rows: latest ? [latest] : [] };
      }
      throw new Error(`SQL inesperado: ${sql}`);
    }
  };
}

const assessment = {
  evidence: {
    dimensions: {
      technique: { observed_at: "2026-07-20T12:00:00.000Z" },
      strength: { observed_at: "2026-07-21T12:00:00.000Z" }
    }
  }
};

test("persiste evaluación append-only con identidad e idempotencia", async () => {
  const db = fakeDb();
  const result = await recordCrossfitAssessment({
    db,
    userId: 71,
    assessment,
    classification: { global_level: "intermediate" },
    safety: { blocked: false },
    requestId: "req-assessment-repository"
  });

  assert.equal(result.idempotent_replay, false);
  assert.equal(result.assessment_id, "cfx_aaaaaaaaaaaaaaaaaaaaaaaa");
  const insert = db.calls[0];
  assert.equal(insert.params[1], 71);
  assert.equal(insert.params[11], "2026-07-21T12:00:00.000Z");
  assert.match(insert.sql, /ON CONFLICT \(user_id, idempotency_key\) DO NOTHING/);
});

test("un reintento devuelve el assessment previo sin mutarlo", async () => {
  const db = fakeDb({ insert: false });
  const result = await recordCrossfitAssessment({
    db,
    userId: 72,
    assessment,
    classification: {},
    safety: {},
    requestId: "req-assessment-replay"
  });

  assert.equal(result.idempotent_replay, true);
  assert.equal(result.assessment_id, "cfx_bbbbbbbbbbbbbbbbbbbbbbbb");
});

test("rechaza una idempotency key reutilizada con contenido divergente", async () => {
  const db = fakeDb({ insert: false, existingHash: "f".repeat(64) });
  await assert.rejects(
    recordCrossfitAssessment({
      db,
      userId: 72,
      assessment,
      classification: {},
      safety: {},
      requestId: "req-assessment-conflict"
    }),
    (error) => error.code === "IDEMPOTENCY_BROKEN" && error.status === 409
  );
});

test("solo el ultimo evento profesional verificado se considera confiable", async () => {
  const verified = await loadLatestVerifiedCrossfitAssessment(fakeDb({
    latest: {
      assessment_id: "cfx_cccccccccccccccccccccccc",
      verification_status: "verified",
      assessment_payload: { marker: "trusted" },
      created_at: new Date("2026-07-22T10:00:00.000Z")
    }
  }), 73);
  const revoked = await loadLatestVerifiedCrossfitAssessment(fakeDb({
    latest: {
      assessment_id: "cfx_dddddddddddddddddddddddd",
      verification_status: "revoked",
      assessment_payload: { marker: "old" }
    }
  }), 73);

  assert.equal(verified.assessment.marker, "trusted");
  assert.equal(revoked, null);
});

test("resuelve una autoevaluacion solo por usuario e identificador", async () => {
  const found = await loadCrossfitSelfAssessment(fakeDb({
    latest: {
      assessment_id: "cfx_eeeeeeeeeeeeeeeeeeeeeeee",
      assessment_payload: { marker: "self" },
      created_at: new Date("2026-07-22T11:00:00.000Z")
    }
  }), 74, "cfx_eeeeeeeeeeeeeeeeeeeeeeee");
  const missing = await loadCrossfitSelfAssessment(fakeDb(), 75, "cfx_ffffffffffffffffffffffff");

  assert.equal(found.assessment.marker, "self");
  assert.equal(missing, null);
});
