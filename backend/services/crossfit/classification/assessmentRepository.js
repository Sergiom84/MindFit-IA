import crypto from "node:crypto";

import { CROSSFIT_ASSESSMENT_VERSION } from "./assessmentService.js";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function stableId(prefix, value) {
  const hash = contentHash(value).slice(0, 24);
  return `${prefix}_${hash}`;
}

function contentHash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function idempotencyError() {
  const error = new Error("La idempotency_key ya existe con otro contenido");
  error.code = "IDEMPOTENCY_BROKEN";
  error.status = 409;
  return error;
}

function latestObservedAt(assessment) {
  const dates = Object.values(assessment?.evidence?.dimensions ?? {})
    .map((item) => new Date(item?.observed_at))
    .filter((date) => Number.isFinite(date.getTime()));
  if (!dates.length) return new Date(0).toISOString();
  return new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString();
}

export async function recordCrossfitAssessment({
  db,
  userId,
  assessment,
  classification,
  safety,
  requestId,
  idempotencyKey = requestId,
  requestPayload = null,
  source = "self_report",
  verificationStatus = "self_report",
  reviewerReference = null
} = {}) {
  if (!db?.query) throw new TypeError("recordCrossfitAssessment requiere db");
  const identity = {
    user_id: String(userId),
    request_id: String(requestId),
    idempotency_key: String(idempotencyKey),
    source,
    verification_status: verificationStatus,
    assessment
  };
  const persistedContent = requestPayload ?? {
    source,
    verification_status: verificationStatus,
    assessment,
    reviewer_reference: reviewerReference
  };
  const hash = contentHash(persistedContent);
  const assessmentId = stableId("cfx", identity);
  const params = [
    assessmentId,
    userId,
    source,
    verificationStatus,
    String(requestId),
    String(idempotencyKey),
    hash,
    JSON.stringify(assessment),
    JSON.stringify(classification),
    JSON.stringify(safety),
    reviewerReference,
    latestObservedAt(assessment)
  ];
  const inserted = await db.query(
    `INSERT INTO app.crossfit_v2_assessments (
       assessment_id, user_id, schema_version, level_model_version, source,
       verification_status, request_id, idempotency_key, content_hash, assessment_payload,
       classification_payload, safety_payload, reviewer_reference, observed_at
     ) VALUES (
       $1, $2, '${CROSSFIT_ASSESSMENT_VERSION}', 'level-model/2.0.0', $3,
       $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12
     )
     ON CONFLICT (user_id, idempotency_key) DO NOTHING
     RETURNING assessment_id, created_at`,
    params
  );
  if (inserted.rowCount) {
    return { assessment_id: inserted.rows[0].assessment_id, idempotent_replay: false };
  }
  const existing = await db.query(
    `SELECT assessment_id, content_hash
       FROM app.crossfit_v2_assessments
      WHERE user_id = $1 AND idempotency_key = $2`,
    [userId, String(idempotencyKey)]
  );
  if (existing.rows[0]?.content_hash !== hash) throw idempotencyError();
  return { assessment_id: existing.rows[0]?.assessment_id ?? assessmentId, idempotent_replay: true };
}

export async function loadLatestVerifiedCrossfitAssessment(db, userId) {
  if (!db?.query) throw new TypeError("loadLatestVerifiedCrossfitAssessment requiere db");
  const result = await db.query(
    `SELECT assessment_id, verification_status, assessment_payload, created_at, event_sequence
       FROM app.crossfit_v2_assessments
      WHERE user_id = $1 AND source = 'professional_review'
      ORDER BY event_sequence DESC
      LIMIT 1`,
    [userId]
  );
  const latest = result.rows[0];
  if (!latest || latest.verification_status !== "verified") return null;
  return {
    assessment_id: latest.assessment_id,
    assessment: latest.assessment_payload,
    created_at: latest.created_at
  };
}

export async function loadCrossfitSelfAssessment(db, userId, assessmentId) {
  if (!db?.query) throw new TypeError("loadCrossfitSelfAssessment requiere db");
  if (!assessmentId) return null;
  const result = await db.query(
    `SELECT assessment_id, assessment_payload, created_at
       FROM app.crossfit_v2_assessments
      WHERE user_id = $1 AND assessment_id = $2 AND source = 'self_report'
      LIMIT 1`,
    [userId, String(assessmentId)]
  );
  const assessment = result.rows[0];
  if (!assessment) return null;
  return {
    assessment_id: assessment.assessment_id,
    assessment: assessment.assessment_payload,
    created_at: assessment.created_at
  };
}
