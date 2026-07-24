import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  normalizeMethodologyId,
  getMethodologyDescriptor,
  getSupportedMethodologies,
  isOppositionMethodology,
  methodologyUsesImmutableDraftRevisions,
  resolveDemandFamily,
  METHODOLOGY_DESCRIPTORS
} from "../services/routineGeneration/methodologies/methodologyRegistry.js";
import {
  validateTrainingLoad,
  buildConservativeTrainingLoad,
  mergeActualSessionLoad,
  classifyDayType
} from "../services/trainingLoad/trainingLoadContract.js";

// ── §17.1 Registro: matriz de aliases ───────────────────────────────────────────
test("§17.1: aliases se normalizan a su ID canónico", () => {
  assert.equal(normalizeMethodologyId("Halterofília"), "halterofilia");
  assert.equal(normalizeMethodologyId("heavy duty"), "heavy-duty");
  assert.equal(normalizeMethodologyId("Guardia Civil"), "guardia-civil");
  assert.equal(normalizeMethodologyId("Policía Nacional"), "policia-nacional");
  assert.equal(normalizeMethodologyId("crossfit"), "crossfit");
  assert.equal(normalizeMethodologyId("cross-fit"), "crossfit");
  // F2: entrenamiento_funcional (con guion bajo) también se acepta como funcional.
  assert.equal(normalizeMethodologyId("entrenamiento_funcional"), "funcional");
  assert.equal(normalizeMethodologyId("Entrenamiento en Casa"), "casa");
});

test("§17.1: ID desconocido → null (NUNCA Hipertrofia ni general)", () => {
  assert.equal(normalizeMethodologyId("desconocido-xyz"), null);
  assert.equal(normalizeMethodologyId("hipertrofia"), null);
  assert.equal(normalizeMethodologyId(""), null);
  assert.equal(normalizeMethodologyId(null), null);
});

test("§17.1: gimnasio NO aparece en el listado seleccionable, pero SÍ se reconoce", () => {
  const selectable = getSupportedMethodologies(); // selectableOnly por defecto
  assert.ok(!selectable.some((m) => m.id === "gimnasio"), "gimnasio no debe ser seleccionable");
  // Se conserva por compatibilidad: se reconoce y aparece si se piden todas.
  assert.equal(normalizeMethodologyId("gimnasio"), "gimnasio");
  assert.equal(normalizeMethodologyId("gym"), "gimnasio");
  const all = getSupportedMethodologies({ selectableOnly: false });
  assert.ok(all.some((m) => m.id === "gimnasio"));
  const gim = getMethodologyDescriptor("gimnasio");
  assert.equal(gim.selectable, false);
  assert.equal(gim.legacy, true);
});

test("§17.1: el registro contiene los 11 IDs canónicos + gimnasio (12 descriptores)", () => {
  const ids = METHODOLOGY_DESCRIPTORS.map((d) => d.id).sort();
  assert.deepEqual(ids, [
    "bomberos", "calistenia", "casa", "crossfit", "funcional", "gimnasio",
    "guardia-civil", "halterofilia", "heavy-duty", "policia-local",
    "policia-nacional", "powerlifting"
  ]);
  // emits_training_load es false en TODAS por ahora (§7.2).
  assert.ok(METHODOLOGY_DESCRIPTORS.every((d) => d.emits_training_load === false));
});

test("§17.1: oposiciones y familia de demanda", () => {
  assert.equal(isOppositionMethodology("Guardia Civil"), true);
  assert.equal(isOppositionMethodology("powerlifting"), false);
  assert.equal(resolveDemandFamily("powerlifting"), "strength");
  assert.equal(resolveDemandFamily("desconocido"), null);
});

test("CrossFit v2: las revisiones inmutables solo se activan con su flag", () => {
  assert.equal(methodologyUsesImmutableDraftRevisions("crossfit", {}), false);
  assert.equal(methodologyUsesImmutableDraftRevisions("crossfit", { CROSSFIT_V2_GENERATION: "true" }), true);
  assert.equal(methodologyUsesImmutableDraftRevisions("crossfit", { CROSSFIT_V2_GENERATION: "TRUE" }), true);
  assert.equal(methodologyUsesImmutableDraftRevisions("crossfit", {
    CROSSFIT_V2_GENERATION: "true",
    CROSSFIT_V2_QA_USERS: "17"
  }, 99), false);
  assert.equal(methodologyUsesImmutableDraftRevisions("crossfit", {
    CROSSFIT_V2_GENERATION: "true",
    CROSSFIT_V2_QA_USERS: "17"
  }, 17), true);
  assert.equal(methodologyUsesImmutableDraftRevisions("calistenia", { CROSSFIT_V2_GENERATION: "true" }), false);
  assert.equal(methodologyUsesImmutableDraftRevisions("desconocido", { CROSSFIT_V2_GENERATION: "true" }), false);
});

// ── §7.4: el orquestador delega sin cambiar su contrato ─────────────────────────
test("§7.4: el orquestador delega en el registro sin cargar servicios con BD", () => {
  const source = fs.readFileSync(
    new URL("../services/routineGeneration/methodologies/MethodologyOrchestrator.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /normalizeMethodologyId as registryNormalizeMethodologyId/);
  assert.match(source, /getSupportedMethodologies as registryGetSupportedMethodologies/);
  assert.match(source, /const canonical = registryNormalizeMethodologyId\(methodology\)/);
  assert.match(source, /return registryGetSupportedMethodologies\(opts\)/);
});

// ── §17.2 Contrato de carga ─────────────────────────────────────────────────────
const validLoad = () => ({
  contract_version: "training-load/v1",
  methodology_id: "powerlifting",
  methodology_level: "intermedio",
  session_type: "strength_volume",
  status: "planned",
  day_type: "D1",
  load_tier: "moderate",
  duration: { planned_min: 75, actual_min: null },
  effort: { rpe_target: 7.5, rpe_actual: null },
  provenance: { source: "methodology_engine", confidence: "high", rule_ids: [] }
});

test("§17.2: un contrato válido pasa en strict", () => {
  const r = validateTrainingLoad(validLoad(), { mode: "strict" });
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, []);
});

test("§17.2.2: D2 con load_tier=low falla en strict", () => {
  const bad = { ...validLoad(), day_type: "D2", load_tier: "low" };
  const r = validateTrainingLoad(bad, { mode: "strict" });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /D2 incoherente/.test(e)));
});

test("§17.2.3: duración negativa falla", () => {
  const bad = { ...validLoad(), duration: { planned_min: -10, actual_min: null } };
  assert.equal(validateTrainingLoad(bad, { mode: "strict" }).valid, false);
});

test("§17.2.4: RPE fuera de 0-10 falla", () => {
  const bad = { ...validLoad(), effort: { rpe_target: 12, rpe_actual: null } };
  assert.equal(validateTrainingLoad(bad, { mode: "strict" }).valid, false);
});

test("§17.2 / §8.3: methodology_id desconocido falla en strict (no cae a Hipertrofia)", () => {
  const bad = { ...validLoad(), methodology_id: "hipertrofia" };
  const r = validateTrainingLoad(bad, { mode: "strict" });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /methodology_id desconocido/.test(e)));
});

test("§17.2.5: datos ausentes no se rellenan con números (null)", () => {
  const conservative = buildConservativeTrainingLoad({ methodology_id: "crossfit" });
  assert.equal(conservative.duration.planned_min, null);
  assert.equal(conservative.effort.rpe_target, null);
  assert.equal(conservative.work.volume_kg, null);
  assert.equal(conservative.provenance.confidence, "low");
  assert.equal(conservative.day_type, "D1");
});

test("§17.2.6: contrato histórico inválido se degrada a D1 low confidence en lenient", () => {
  const bad = { ...validLoad(), day_type: "D2", load_tier: "low", contract_version: "x" };
  const r = validateTrainingLoad(bad, { mode: "lenient" });
  assert.equal(r.valid, true);
  assert.equal(r.degraded, true);
  assert.equal(r.load.day_type, "D1");
  assert.equal(r.load.provenance.confidence, "low");
  assert.ok(Array.isArray(r.audit) && r.audit.length > 0);
});

test("§8.5: classifyDayType clasifica por coherencia de carga, no por nombre", () => {
  assert.equal(classifyDayType({ load_tier: "rest" }), "D0");
  assert.equal(classifyDayType({ load_tier: "moderate" }), "D1");
  assert.equal(classifyDayType({ load_tier: "very_high" }), "D2");
  assert.equal(classifyDayType({ load_tier: "low", context: { competition: true } }), "D2");
});

test("§8.6: mergeActualSessionLoad añade datos reales sin perder lo planificado", () => {
  const planned = validLoad();
  const merged = mergeActualSessionLoad(planned, {
    duration: { actual_min: 91 },
    effort: { rpe_actual: 9 },
    work: { volume_kg: 11240 }
  });
  assert.equal(merged.status, "completed");
  assert.equal(merged.duration.planned_min, 75);
  assert.equal(merged.duration.actual_min, 91);
  assert.equal(merged.effort.rpe_actual, 9);
  assert.equal(merged.work.volume_kg, 11240);
  assert.equal(merged.provenance.source, "session_completion");
});
