import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeMethodologyId,
  getMethodologyDescriptor
} from "../services/routineGeneration/methodologies/methodologyRegistry.js";
import { validateTrainingLoad } from "../services/trainingLoad/trainingLoadContract.js";

// Contrato base válido (powerlifting/intermedio), clonable por test.
const baseLoad = (overrides = {}) => ({
  contract_version: "training-load/v1",
  methodology_id: "powerlifting",
  methodology_level: "intermedio",
  session_type: "strength_volume",
  status: "planned",
  day_type: "D1",
  load_tier: "moderate",
  duration: { planned_min: 75, actual_min: null },
  effort: { rpe_target: 7.5, rpe_actual: null },
  provenance: { source: "methodology_engine", confidence: "high", rule_ids: [] },
  ...overrides
});

// ── COR-F0-03 · Validación estricta de nivel ────────────────────────────────────
test("COR-F0-03: powerlifting/inventado FALLA en strict", () => {
  const r = validateTrainingLoad(baseLoad({ methodology_level: "inventado" }), { mode: "strict" });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /methodology_level/.test(e) && /no soportado/.test(e)));
});

test("COR-F0-03: powerlifting/intermedio (nivel declarado) pasa en strict", () => {
  const r = validateTrainingLoad(baseLoad(), { mode: "strict" });
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, []);
});

test("COR-F0-03: crossfit/elite pasa (elite sigue declarado en el registro)", () => {
  assert.ok(getMethodologyDescriptor("crossfit").levels.includes("elite"));
  const r = validateTrainingLoad(
    baseLoad({ methodology_id: "crossfit", methodology_level: "elite" }),
    { mode: "strict" }
  );
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, []);
});

test("COR-F0-03: powerlifting/elite FALLA (elite no está declarado ahí)", () => {
  assert.ok(!getMethodologyDescriptor("powerlifting").levels.includes("elite"));
  const r = validateTrainingLoad(baseLoad({ methodology_level: "elite" }), { mode: "strict" });
  assert.equal(r.valid, false);
});

test("COR-F0-03: mayúsculas y acentos se normalizan antes de validar", () => {
  const r = validateTrainingLoad(baseLoad({ methodology_level: "  INTERMEDIO " }), { mode: "strict" });
  assert.equal(r.valid, true);
});

test("COR-F0-03: 'básico'/'basico' es alias legacy documentado de principiante (pasa en strict)", () => {
  assert.equal(validateTrainingLoad(baseLoad({ methodology_level: "básico" }), { mode: "strict" }).valid, true);
  assert.equal(validateTrainingLoad(baseLoad({ methodology_level: "basico" }), { mode: "strict" }).valid, true);
});

test("COR-F0-03: nivel desconocido se DEGRADA en lenient con reason code (nunca válido silencioso)", () => {
  const r = validateTrainingLoad(baseLoad({ methodology_level: "inventado" }), { mode: "lenient" });
  assert.equal(r.valid, true);
  assert.equal(r.degraded, true);
  assert.ok(Array.isArray(r.audit) && r.audit.some((e) => /methodology_level/.test(e)));
  assert.equal(r.load.day_type, "D1");
  assert.equal(r.load.provenance.confidence, "low");
});

// ── COR-F0-03 · Aliases de oposiciones sin falsos positivos ─────────────────────
test("COR-F0-03: las 4 oposiciones oficiales normalizan desde su nombre real", () => {
  assert.equal(normalizeMethodologyId("Bomberos"), "bomberos");
  assert.equal(normalizeMethodologyId("Guardia Civil"), "guardia-civil");
  assert.equal(normalizeMethodologyId("Policía Nacional"), "policia-nacional");
  assert.equal(normalizeMethodologyId("Policía Local"), "policia-local");
});

test("COR-F0-03: los 3 falsos positivos por substring devuelven null", () => {
  assert.equal(normalizeMethodologyId("entrenamiento local"), null);
  assert.equal(normalizeMethodologyId("programa nacional"), null);
  assert.equal(normalizeMethodologyId("guardia activa"), null);
});

test("COR-F0-03: ningún desconocido cae en Hipertrofia, general ni una oposición", () => {
  for (const v of ["entrenamiento local", "programa nacional", "guardia activa", "algo raro", "general"]) {
    const id = normalizeMethodologyId(v);
    assert.equal(id, null, `'${v}' no debe normalizar a nada`);
  }
});

test("COR-F0-03: aliases legítimos existentes NO se rompen", () => {
  assert.equal(normalizeMethodologyId("entrenamiento_funcional"), "funcional"); // F2, guion bajo
  assert.equal(normalizeMethodologyId("Entrenamiento en Casa"), "casa");
  assert.equal(normalizeMethodologyId("heavy duty"), "heavy-duty");
  assert.equal(normalizeMethodologyId("cross-fit"), "crossfit");
  assert.equal(normalizeMethodologyId("Halterofília"), "halterofilia");
});
