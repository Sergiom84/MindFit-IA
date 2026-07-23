import test from "node:test";
import assert from "node:assert/strict";

// PR-CAL-01 · Subfase B — normalizadores puros de entorno y confirmación de seguridad de equipo.
// Contrato (defecto G4): valor ausente → null (jamás inventar); desconocido → null.
// Rojos hasta exportar los dos normalizadores desde userProfileContract.js.
import {
  normalizeTrainingEnvironment,
  normalizeEquipmentSafetyConfirmed
} from "../services/userProfileContract.js";

// ── normalizeTrainingEnvironment ────────────────────────────────────────────────
test("B-01: entornos canónicos", () => {
  assert.equal(normalizeTrainingEnvironment("gimnasio"), "gimnasio");
  assert.equal(normalizeTrainingEnvironment("casa"), "casa");
  assert.equal(normalizeTrainingEnvironment("exterior"), "exterior");
});

test("B-02: alias y forma (acentos, mayúsculas, espacios, guiones)", () => {
  assert.equal(normalizeTrainingEnvironment("Gym"), "gimnasio");
  assert.equal(normalizeTrainingEnvironment("HOGAR"), "casa");
  assert.equal(normalizeTrainingEnvironment("home"), "casa");
  assert.equal(normalizeTrainingEnvironment("  Aire libre "), "exterior");
  assert.equal(normalizeTrainingEnvironment("parque"), "exterior");
  assert.equal(normalizeTrainingEnvironment("calle"), "exterior");
});

test("B-03: ausente o desconocido → null (no inventar)", () => {
  assert.equal(normalizeTrainingEnvironment(null), null);
  assert.equal(normalizeTrainingEnvironment(undefined), null);
  assert.equal(normalizeTrainingEnvironment(""), null);
  assert.equal(normalizeTrainingEnvironment("   "), null);
  assert.equal(normalizeTrainingEnvironment("marte"), null);
  assert.equal(normalizeTrainingEnvironment(42), null);
});

// ── normalizeEquipmentSafetyConfirmed ───────────────────────────────────────────
test("B-04: confirmación explícita afirmativa → true", () => {
  assert.equal(normalizeEquipmentSafetyConfirmed(true), true);
  assert.equal(normalizeEquipmentSafetyConfirmed("true"), true);
  assert.equal(normalizeEquipmentSafetyConfirmed("sí"), true);
  assert.equal(normalizeEquipmentSafetyConfirmed("si"), true);
  assert.equal(normalizeEquipmentSafetyConfirmed("yes"), true);
  assert.equal(normalizeEquipmentSafetyConfirmed(1), true);
});

test("B-05: confirmación explícita negativa → false", () => {
  assert.equal(normalizeEquipmentSafetyConfirmed(false), false);
  assert.equal(normalizeEquipmentSafetyConfirmed("false"), false);
  assert.equal(normalizeEquipmentSafetyConfirmed("no"), false);
  assert.equal(normalizeEquipmentSafetyConfirmed(0), false);
});

test("B-06: ausente o ambiguo → null (dato ausente = null, no se asume seguridad)", () => {
  assert.equal(normalizeEquipmentSafetyConfirmed(null), null);
  assert.equal(normalizeEquipmentSafetyConfirmed(undefined), null);
  assert.equal(normalizeEquipmentSafetyConfirmed(""), null);
  assert.equal(normalizeEquipmentSafetyConfirmed("   "), null);
  assert.equal(normalizeEquipmentSafetyConfirmed("quizas"), null);
});
