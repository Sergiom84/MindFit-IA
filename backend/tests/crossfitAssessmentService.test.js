import assert from "node:assert/strict";
import test from "node:test";

import {
  CROSSFIT_ASSESSMENT_VERSION,
  evaluatePublicCrossfitAssessment,
  evaluateTrustedCrossfitAssessment,
  getCrossfitAssessmentRequiredResponse,
  getCrossfitAssessmentCapabilities,
  normalizeCrossfitAssessmentRequest,
  sanitizePublicCrossfitAssessment,
  sanitizeTrustedCrossfitAssessment
} from "../services/crossfit/classification/assessmentService.js";
import { CROSSFIT_CLASSIFICATION_DIMENSIONS } from "../services/crossfit/classification/levelModel.js";

const NOW = new Date("2026-07-22T12:00:00.000Z");

function assessment(score = 2, overrides = {}) {
  const dimensionScores = Object.fromEntries(
    CROSSFIT_CLASSIFICATION_DIMENSIONS.map((dimension) => [dimension, score])
  );
  const dimensions = Object.fromEntries(
    CROSSFIT_CLASSIFICATION_DIMENSIONS.map((dimension) => [dimension, {
      observed_at: "2026-07-20T12:00:00.000Z",
      test_ids: [`test-${dimension}`]
    }])
  );
  return {
    dimension_scores: dimensionScores,
    evidence: {
      dimensions,
      comparable_sessions: 3,
      comparable_exposures_per_dimension: 0,
      weeks_in_level: 0,
      technique_verified: false,
      verification_source: "self_report"
    },
    skill_permissions: {},
    adherence_rate: 0.8,
    pause_days: 0,
    ...overrides
  };
}

function request(crossfitAssessment = assessment(), checkIn = {}) {
  return {
    schema_version: CROSSFIT_ASSESSMENT_VERSION,
    request_id: "req-assessment-1",
    crossfitAssessment,
    check_in: checkIn
  };
}

test("capacidades v2 reflejan el flag del servidor y excluyen Elite", () => {
  const disabled = getCrossfitAssessmentCapabilities(17, {});
  const excluded = getCrossfitAssessmentCapabilities(99, {
    CROSSFIT_V2_GENERATION: "true",
    CROSSFIT_V2_QA_USERS: "17"
  });
  const enabled = getCrossfitAssessmentCapabilities(17, {
    CROSSFIT_V2_GENERATION: "true",
    CROSSFIT_V2_QA_USERS: "17"
  });

  assert.equal(disabled.enabled, false);
  assert.equal(excluded.enabled, false);
  assert.equal(enabled.enabled, true);
  assert.deepEqual(enabled.levels, [
    { id: "beginner", frequencies: [2, 3] },
    { id: "intermediate", frequencies: [3, 4] },
    { id: "advanced", frequencies: [4, 5] }
  ]);
  assert.equal(enabled.constraints.elite_in_product, false);
  assert.equal(enabled.constraints.scale_is_not_level, true);
});

test("clientes legacy reciben un fallback provisional legible sin invocar IA", () => {
  const result = getCrossfitAssessmentRequiredResponse(NOW);

  assert.equal(result.evaluation.recommended_level, "principiante");
  assert.equal(result.evaluation.confidence, 0);
  assert.equal(result.evaluation.assessment_required, true);
  assert.equal(result.metadata.legacy_read_compatibility, true);
});

test("autoevaluacion completa puede clasificar intermedio con confianza media", () => {
  const result = evaluatePublicCrossfitAssessment({
    profile: { anos_entrenando: 4 },
    body: request(),
    now: NOW
  });

  assert.equal(result.evaluation.recommended_level, "intermediate");
  assert.equal(result.evaluation.confidence, "medium");
  assert.equal(result.evaluation.classification.elite_eligible, false);
  assert.equal(result.metadata.evidence_source, "self_report");
});

test("datos incompletos conservan principiante provisional aunque haya antiguedad", () => {
  const incomplete = assessment(0, {
    dimension_scores: {
      technique: 3,
      strength: 3,
      aerobic: 3,
      gymnastics: 3,
      weightlifting: 3,
      pacing: 3,
      volume: 3,
      recovery: 0
    },
    years_training: 12
  });
  const result = evaluatePublicCrossfitAssessment({ body: request(incomplete), now: NOW });

  assert.equal(result.evaluation.recommended_level, "beginner");
  assert.equal(result.evaluation.status, "provisional");
  assert.ok(result.evaluation.classification.reason_codes.includes("LEVEL_CONFIDENCE_LOW"));
});

test("el cliente no puede autoverificar tecnica ni permisos de skills", () => {
  assert.throws(
    () => sanitizePublicCrossfitAssessment(assessment(3, {
      evidence: { ...assessment(3).evidence, technique_verified: true }
    }), { now: NOW }),
    (error) => error.code === "CROSSFIT_ASSESSMENT_UNTRUSTED_EVIDENCE"
  );
  assert.throws(
    () => sanitizePublicCrossfitAssessment(assessment(3, {
      skill_permissions: { muscle_up: true }
    }), { now: NOW }),
    (error) => error.code === "CROSSFIT_ASSESSMENT_UNTRUSTED_EVIDENCE"
  );
});

test("una autoevaluacion maxima no desbloquea avanzado sin validacion tecnica", () => {
  const maximum = assessment(3, {
    evidence: {
      ...assessment(3).evidence,
      comparable_sessions: 20,
      comparable_exposures_per_dimension: 10,
      weeks_in_level: 52
    }
  });
  const result = evaluatePublicCrossfitAssessment({ body: request(maximum), now: NOW });

  assert.equal(result.evaluation.confidence, "medium");
  assert.equal(result.evaluation.recommended_level, "intermediate");
  assert.equal(result.evaluation.requires_verified_technique_for_advanced, true);
});

test("evidencia profesional normalizada permite avanzado sin exponer Elite", () => {
  const trustedInput = assessment(3, {
    evidence: {
      ...assessment(3).evidence,
      comparable_sessions: 8,
      comparable_exposures_per_dimension: 4,
      weeks_in_level: 12,
      technique_verified: true
    },
    skill_permissions: { muscle_up: true, strict_pull_up: true }
  });
  const trusted = sanitizeTrustedCrossfitAssessment(trustedInput, { now: NOW });
  const result = evaluateTrustedCrossfitAssessment({
    assessment: trusted,
    requestId: "req-trusted-assessment",
    now: NOW
  });

  assert.equal(trusted.evidence.verification_source, "professional_review");
  assert.equal(result.evaluation.recommended_level, "advanced");
  assert.equal(result.evaluation.confidence, "high");
  assert.equal(result.evaluation.classification.elite_eligible, false);
});

test("dolor severo, red flag y lesion aguda bloquean antes del nivel", () => {
  for (const checkIn of [
    { pain: { score: 5, locations: ["hombro"] } },
    { red_flags: ["dolor toracico"] },
    { acute_injury: true }
  ]) {
    const result = evaluatePublicCrossfitAssessment({ body: request(assessment(3), checkIn), now: NOW });
    assert.equal(result.evaluation.status, "blocked");
    assert.equal(result.evaluation.recommended_level, null);
  }
});

test("el contrato rechaza versiones, unknowns y rangos invalidos", () => {
  assert.throws(
    () => normalizeCrossfitAssessmentRequest({ ...request(), schema_version: "crossfit-assessment/v1" }),
    (error) => error.code === "CROSSFIT_ASSESSMENT_VERSION_UNSUPPORTED"
  );
  assert.throws(
    () => normalizeCrossfitAssessmentRequest({ ...request(), unexpected: true }),
    (error) => error.code === "CROSSFIT_ASSESSMENT_INVALID"
  );
  assert.throws(
    () => normalizeCrossfitAssessmentRequest(request(assessment(4))),
    (error) => error.code === "CROSSFIT_ASSESSMENT_INVALID"
  );
});
