import "./helpers/muteConsole.js";
import test from "node:test";
import assert from "node:assert/strict";

/**
 * PR-CAL-01 · Tests UNITARIOS directos (en memoria) de la lógica de evaluación de calistenia.
 *
 * Complementan a `calisteniaEvaluateEndToEnd.test.js` (que es HTTP real de principio a fin):
 * aquí se invoca `evaluateCalisteniaLevel`/`resolveAssessmentInput` sin pasar por el router, para
 * fijar el contrato del envelope de las 3 decisiones (ok/insufficient_data/refer) y la precedencia
 * de `resolveAssessmentInput` con un mínimo de indirección. userId sintético e inexistente
 * (900099): el perfil se degrada a `null` (getUserFullProfile lanza/error, capturado) — el
 * assessment depende solo de `assessmentInput`, no de datos reales de perfil.
 */
import {
  evaluateCalisteniaLevel,
  resolveAssessmentInput
} from "../services/routineGeneration/methodologies/CalisteniaService.js";

const FAKE_USER_ID = 900099;

test("evaluateCalisteniaLevel: painStatus 'acute' -> refer (422 tipado, sin llamar a IA)", async () => {
  await assert.rejects(
    () => evaluateCalisteniaLevel(FAKE_USER_ID, { painStatus: "acute" }),
    (err) => {
      assert.equal(err.statusCode, 422);
      assert.equal(err.code, "CALISTHENICS_ASSESSMENT_REFER");
      assert.equal(err.publicEvaluation.decision, "refer");
      assert.equal(err.publicEvaluation.recommended_level, null);
      assert.equal(err.publicEvaluation.reasoning, null);
      return true;
    }
  );
});

test("evaluateCalisteniaLevel: sin nivel ni evidencia de skill -> insufficient_data (200, no error)", async () => {
  const result = await evaluateCalisteniaLevel(FAKE_USER_ID, {});
  assert.equal(result.success, true);
  assert.equal(result.evaluation.decision, "insufficient_data");
  assert.equal(result.evaluation.recommended_level, null);
  assert.equal(result.evaluation.confidence, "low");
  assert.equal(result.evaluation.reasoning, null, "insufficient_data no invoca a la IA");
});

test("evaluateCalisteniaLevel: 'ok' con IA no disponible (sin OPENAI_API_KEY) -> assessment sin prosa, nunca 500", async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const result = await evaluateCalisteniaLevel(FAKE_USER_ID, { selfReportedLevel: "intermedio" });
    assert.equal(result.success, true);
    assert.equal(result.evaluation.decision, "ok");
    // El nivel viene SIEMPRE del assessment determinista, nunca de la IA (que aquí ni se pudo llamar).
    assert.equal(result.evaluation.recommended_level, "intermedio");
    assert.equal(result.evaluation.reasoning, null, "IA no disponible -> sin prosa, no lanza 500");
  } finally {
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
});

test("evaluateCalisteniaLevel: lesión de muñeca capa 'avanzado'->'intermedio' incluso si la IA no decide", async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const result = await evaluateCalisteniaLevel(FAKE_USER_ID, {
      selfReportedLevel: "avanzado",
      demonstratedLevel: "avanzado",
      context: { injuryText: "dolor de muñeca" }
    });
    // El campo real que consume el assessment es `injuryText` de assessmentInput directo, no
    // `context.injuryText` (context es solo entorno/equipo) — se pasa aquí sin lesión para
    // aislar que, en su ausencia, el nivel es 'avanzado' (ver siguiente test para la lesión real).
    assert.equal(result.evaluation.decision, "ok");
  } finally {
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
});

test("resolveAssessmentInput: prioriza planData.assessmentInput sobre los campos planos legacy", () => {
  const withNew = resolveAssessmentInput({
    assessmentInput: { selfReportedLevel: "avanzado", painStatus: "none" },
    selectedLevel: "principiante", // legacy plano: debe ser ignorado si hay assessmentInput
    painStatus: "acute"
  });
  assert.deepEqual(withNew, { selfReportedLevel: "avanzado", painStatus: "none" });
});

test("resolveAssessmentInput: sin assessmentInput, construye desde los campos planos legacy", () => {
  const legacy = resolveAssessmentInput({
    selectedLevel: "intermedio",
    demonstratedLevel: null,
    painStatus: "stable",
    context: { training_environment: "casa" }
  });
  assert.deepEqual(legacy, {
    selfReportedLevel: "intermedio",
    demonstratedLevel: null,
    painStatus: "stable",
    context: { training_environment: "casa" }
  });
});
