import assert from "node:assert/strict";
import test from "node:test";

import {
  CROSSFIT_CLASSIFICATION_DIMENSIONS,
  classifyCrossfitLevel,
  resolveCrossfitClassificationConfidence
} from "../services/crossfit/classification/levelModel.js";

const NOW = new Date("2026-07-22T08:00:00.000Z");

function dimensions(scores) {
  return Object.fromEntries(
    CROSSFIT_CLASSIFICATION_DIMENSIONS.map((dimension, index) => [
      dimension,
      Array.isArray(scores) ? scores[index] : scores
    ])
  );
}

function evidence({ sessions = 6, verified = true, daysOld = 1, exposures = 3, weeks = 8 } = {}) {
  const observedAt = new Date(NOW.getTime() - daysOld * 86400000).toISOString();
  return {
    version: "assessment/2.0.0",
    comparable_sessions: sessions,
    comparable_exposures_per_dimension: exposures,
    weeks_in_level: weeks,
    technique_verified: verified,
    dimensions: Object.fromEntries(
      CROSSFIT_CLASSIFICATION_DIMENSIONS.map((dimension) => [dimension, { observed_at: observedAt }])
    )
  };
}

function classify(overrides = {}) {
  return classifyCrossfitLevel({
    now: NOW,
    dimension_scores: dimensions(2),
    evidence: evidence(),
    adherence_rate: 0.8,
    ...overrides
  });
}

test("clasifica avanzado solo con seis dimensiones avanzadas y ninguna inferior a competente", () => {
  const result = classify({ dimension_scores: dimensions([3, 3, 3, 3, 3, 3, 2, 2]) });

  assert.equal(result.global_level, "advanced");
  assert.equal(result.confidence, "high");
  assert.equal(result.elite_eligible, false);
  assert.equal(result.scale_policy, "per_movement_not_global_level");
});

test("clasifica intermedio con seis competencias y dimensiones críticas seguras", () => {
  const result = classify({
    dimension_scores: dimensions([2, 2, 2, 2, 2, 2, 1, 1]),
    evidence: evidence({ sessions: 3, verified: false }),
    adherence_rate: 0.7
  });

  assert.equal(result.global_level, "intermediate");
  assert.equal(result.confidence, "medium");
});

test("evidencia incompleta o caducada limita la clasificación a principiante provisional", () => {
  const missing = classify({ dimension_scores: { technique: 3 }, years_training: 12 });
  const stale = classify({ evidence: evidence({ daysOld: 57 }) });

  assert.equal(missing.global_level, "beginner");
  assert.equal(missing.status, "provisional");
  assert.equal(stale.global_level, "beginner");
  assert.ok(stale.reason_codes.includes("LEVEL_CONFIDENCE_LOW"));
});

test("los años entrenando nunca promocionan sin evidencia objetiva", () => {
  const result = classify({
    years_training: 20,
    dimension_scores: dimensions(1),
    evidence: evidence({ sessions: 2 })
  });

  assert.equal(result.global_level, "beginner");
  assert.equal(result.years_training, 20);
});

test("las capacidades asimétricas mantienen permisos por dimensión", () => {
  const permissions = { muscle_up: false, double_under: true };
  const result = classify({
    dimension_scores: dimensions([3, 3, 3, 1, 1, 3, 3, 3]),
    skill_permissions: permissions
  });

  assert.equal(result.global_level, "intermediate");
  assert.deepEqual(result.skill_permissions, permissions);
  assert.ok(result.reason_codes.includes("LEVEL_ASYMMETRIC"));
});

test("una promoción requiere tres exposiciones comparables y la ventana mínima", () => {
  const candidate = {
    current_level: "beginner",
    dimension_scores: dimensions(2),
    adherence_rate: 0.8
  };
  const held = classify({ ...candidate, evidence: evidence({ exposures: 2, weeks: 8 }) });
  const promoted = classify({ ...candidate, evidence: evidence({ exposures: 3, weeks: 6 }) });

  assert.equal(held.global_level, "beginner");
  assert.equal(held.decision, "stay");
  assert.ok(held.reason_codes.includes("AUTOREG_HOLD"));
  assert.equal(promoted.global_level, "intermediate");
  assert.equal(promoted.decision, "promote");
});

test("un benchmark aislado no promueve", () => {
  const result = classify({
    current_level: "beginner",
    dimension_scores: dimensions(3),
    evidence: evidence({ sessions: 1, exposures: 1, weeks: 12 }),
    benchmark_result: { name: "Fran", percentile: 95 }
  });

  assert.equal(result.global_level, "beginner");
  assert.equal(result.decision, "stay");
});

test("aplica retorno gradual a 21 días y regresión temporal con reevaluación a 60", () => {
  const after21 = classify({ pause_days: 21 });
  const after60 = classify({
    current_level: "advanced",
    dimension_scores: dimensions([3, 3, 3, 3, 3, 3, 2, 2]),
    pause_days: 60
  });

  assert.deepEqual(after21.return_protocol, {
    pause_days: 21,
    volume_reduction: 0.2,
    duration_weeks: 1,
    skill_tier_reduction: 0,
    requires_reassessment: false
  });
  assert.equal(after60.global_level, "intermediate");
  assert.equal(after60.return_protocol.requires_reassessment, true);
  assert.equal(after60.decision, "temporary_regress");
});

test("dolor severo, lesión aguda y red flags bloquean antes del rendimiento", () => {
  for (const safety of [{ pain_score: 5 }, { acute_injury: true }, { red_flag: true }]) {
    const result = classify({
      dimension_scores: dimensions(3),
      safety
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.global_level, null);
  }
});

test("la confianza respeta los límites exactos de sesiones, verificación y caducidad", () => {
  assert.equal(resolveCrossfitClassificationConfidence({
    dimensionScores: dimensions(2),
    evidence: evidence({ sessions: 6, verified: true, daysOld: 28 }),
    now: NOW
  }), "high");
  assert.equal(resolveCrossfitClassificationConfidence({
    dimensionScores: dimensions(2),
    evidence: evidence({ sessions: 3, verified: false, daysOld: 28 }),
    now: NOW
  }), "medium");
  assert.equal(resolveCrossfitClassificationConfidence({
    dimensionScores: dimensions(2),
    evidence: evidence({ sessions: 3, verified: false, daysOld: 29 }),
    now: NOW
  }), "low");
});

test("el identificador es estable ante orden de claves y cambia con evidencia anidada", () => {
  const first = classify({ skill_permissions: { a: true, b: false } });
  const reordered = classify({ skill_permissions: { b: false, a: true } });
  const changed = classify({ evidence: evidence({ weeks: 9 }) });

  assert.equal(first.classification_id, reordered.classification_id);
  assert.notEqual(first.classification_id, changed.classification_id);
});
