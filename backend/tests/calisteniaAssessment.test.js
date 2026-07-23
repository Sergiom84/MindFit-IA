import test from "node:test";
import assert from "node:assert/strict";

// PR-CAL-01 · Subfase C — assessment determinista de calistenia (gate de seguridad).
// Contrato (spec §5.2 reconstruida; sign-off de Sergio 2026-07-23):
//   - nivel efectivo = demostrado-por-skill > self-report validado > insufficient_data;
//   - AÑOS DE EXPERIENCIA nunca elevan el nivel solos;
//   - lesión activa = patrón limitante + cap a 'intermedio' + confianza ≤ media (nunca 'avanzado');
//   - dolor AGUDO / contraindicación seria → decision 'refer' (level=null, gate no pasa);
//   - datos insuficientes → decision 'insufficient_data' + level=null + confianza 'low';
//   - la IA EXPLICA el resultado (requires_ai_explanation), nunca lo decide.
// Rojo hasta crear backend/services/routineGeneration/methodologies/calisteniaAssessment.js.
import { assessCalistenia, isCalisthenicsAssessmentEnabled }
  from "../services/routineGeneration/methodologies/calisteniaAssessment.js";

test("C-01: self-report válido + skill demostrado corroborado, sin lesión → ok/avanzado/high", () => {
  const a = assessCalistenia({ selfReportedLevel: "avanzado", demonstratedLevel: "avanzado" });
  assert.equal(a.decision, "ok");
  assert.equal(a.level, "avanzado");
  assert.equal(a.confidence, "high");
  assert.deepEqual(a.limiting_patterns, []);
  assert.equal(a.safety_gate.passed, true);
  assert.equal(a.version, "calisthenics-assessment/v1");
});

test("C-02: skill demostrado MANDA sobre el self-report (skill > self-report)", () => {
  const a = assessCalistenia({ selfReportedLevel: "avanzado", demonstratedLevel: "intermedio" });
  assert.equal(a.level, "intermedio");
  assert.equal(a.confidence, "high"); // hay evidencia de skill
});

test("C-03: años de experiencia NUNCA elevan el nivel solos → insufficient_data", () => {
  const a = assessCalistenia({ experienceYears: 12 });
  assert.equal(a.decision, "insufficient_data");
  assert.equal(a.level, null);
  assert.equal(a.confidence, "low");
});

test("C-04: self-report inválido se trata como ausente → insufficient_data", () => {
  const a = assessCalistenia({ selfReportedLevel: "ninja", experienceYears: 5 });
  assert.equal(a.decision, "insufficient_data");
  assert.equal(a.level, null);
});

test("C-05: alias 'basico' → principiante", () => {
  const a = assessCalistenia({ selfReportedLevel: "basico" });
  assert.equal(a.level, "principiante");
  assert.equal(a.decision, "ok");
  assert.equal(a.confidence, "medium"); // self-report sin skill corroborado
});

test("C-06: lesión de muñeca capa 'avanzado'→'intermedio' y marca patrón limitante", () => {
  const a = assessCalistenia({
    selfReportedLevel: "avanzado",
    demonstratedLevel: "avanzado",
    injuryText: "dolor de muñeca al apoyar"
  });
  assert.equal(a.level, "intermedio"); // cap por lesión, no 'avanzado'
  assert.ok(a.limiting_patterns.includes("muñeca"));
  assert.notEqual(a.confidence, "high"); // lesión baja la confianza
  assert.equal(a.safety_gate.passed, true); // puede entrenar con adaptaciones
});

test("C-07: múltiples lesiones → varios patrones limitantes", () => {
  const a = assessCalistenia({
    selfReportedLevel: "intermedio",
    injuryText: "molestias de muñeca y rodilla"
  });
  assert.ok(a.limiting_patterns.includes("muñeca"));
  assert.ok(a.limiting_patterns.includes("rodilla"));
});

test("C-08: dolor AGUDO → refer (no prescribe): level null, gate no pasa", () => {
  const a = assessCalistenia({ selfReportedLevel: "avanzado", painStatus: "acute" });
  assert.equal(a.decision, "refer");
  assert.equal(a.level, null);
  assert.equal(a.safety_gate.passed, false);
});

test("C-09: input vacío → insufficient_data honesto", () => {
  const a = assessCalistenia({});
  assert.equal(a.decision, "insufficient_data");
  assert.equal(a.level, null);
  assert.equal(a.confidence, "low");
  assert.equal(a.safety_gate.passed, true); // sin peligro declarado; solo faltan datos
});

test("C-10: la IA explica, no decide (requires_ai_explanation en resultados cerrados)", () => {
  assert.equal(assessCalistenia({ selfReportedLevel: "intermedio" }).requires_ai_explanation, true);
  assert.equal(assessCalistenia({ painStatus: "acute" }).requires_ai_explanation, true);
});

test("C-11: función pura y defensiva (sin args / null no lanza)", () => {
  assert.equal(assessCalistenia().decision, "insufficient_data");
  assert.equal(assessCalistenia(null).decision, "insufficient_data");
});

// ── Hardening tras revisión adversarial (H1/H2): no perder lesiones por el canal injuryText ──
test("C-H1: injuryText:'' (vacío) NO descarta lesiones de otros campos (lesiones/limitaciones)", () => {
  const a = assessCalistenia({ demonstratedLevel: "avanzado", injuryText: "", lesiones: ["muñeca"] });
  assert.equal(a.level, "intermedio"); // capado por la lesión, no 'avanzado'
  assert.ok(a.limiting_patterns.includes("muñeca"));
  assert.notEqual(a.confidence, "high");
});

test("C-H2: injuryText como array de lesiones se tiene en cuenta (no se ignora)", () => {
  const a = assessCalistenia({ demonstratedLevel: "avanzado", injuryText: ["muñeca"] });
  assert.equal(a.level, "intermedio");
  assert.ok(a.limiting_patterns.includes("muñeca"));
});

test("C-H1b: injuryText string no vacío sigue mandando (sin regresión)", () => {
  const a = assessCalistenia({ selfReportedLevel: "avanzado", injuryText: "dolor de rodilla" });
  assert.ok(a.limiting_patterns.includes("rodilla"));
});

// ── Flag de activación (rollback por flag; default OFF = lectura legacy) ──────────
test("C-12: CALISTHENICS_ASSESSMENT_V1_ENABLED default OFF", () => {
  assert.equal(isCalisthenicsAssessmentEnabled({}), false);
  assert.equal(isCalisthenicsAssessmentEnabled({ CALISTHENICS_ASSESSMENT_V1_ENABLED: "false" }), false);
  assert.equal(isCalisthenicsAssessmentEnabled({ CALISTHENICS_ASSESSMENT_V1_ENABLED: "0" }), false);
  assert.equal(isCalisthenicsAssessmentEnabled({ CALISTHENICS_ASSESSMENT_V1_ENABLED: undefined }), false);
});

test("C-13: flag ON solo con 'true'/'1' explícito", () => {
  assert.equal(isCalisthenicsAssessmentEnabled({ CALISTHENICS_ASSESSMENT_V1_ENABLED: "true" }), true);
  assert.equal(isCalisthenicsAssessmentEnabled({ CALISTHENICS_ASSESSMENT_V1_ENABLED: "1" }), true);
  assert.equal(isCalisthenicsAssessmentEnabled({ CALISTHENICS_ASSESSMENT_V1_ENABLED: "TRUE" }), true);
});
