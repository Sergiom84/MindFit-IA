import test from "node:test";
import assert from "node:assert/strict";

import {
  extractInjuryText,
  activeInjuryRules,
  isContraindicated
} from "../services/routineGeneration/injuryContraindications.js";

// Helpers
const zonas = (profile) => activeInjuryRules(extractInjuryText(profile)).map((r) => r.zona);
const blocks = (profile, nombre) =>
  isContraindicated({ nombre }, activeInjuryRules(extractInjuryText(profile)));

// ── F1 (ONB-P1-01): el fix real de riesgo clínico ──────────────────────────────
// Antes: extractInjuryText usaba `limitaciones_fisicas ?? lesiones`. Un array vacío
// NO es nullish, así que `limitaciones_fisicas: []` eclipsaba `lesiones` y el motor
// ignoraba la lesión. Ahora se COMBINAN ambos campos.
test("F1: lesiones legacy se respetan aunque limitaciones_fisicas sea array vacío", () => {
  const profile = { limitaciones_fisicas: [], lesiones: ["rodilla"] };
  assert.deepEqual(zonas(profile), ["rodilla"]);
  assert.equal(blocks(profile, "Sentadilla búlgara"), true);
});

test("F1: caso real usuario 419 (lesiones='rotura de femur derecho') alcanza el filtro", () => {
  // Antes de la migración, users.limitaciones_fisicas = ['no'] eclipsaba lesiones.
  const profile = { limitaciones_fisicas: ["no"], lesiones: ["rotura de femur derecho"] };
  const text = extractInjuryText(profile);
  assert.match(text, /rotura de femur derecho/);
  assert.match(text, /\bno\b/); // conserva el dato existente
});

test("F1: combina limitaciones_fisicas + lesiones con zonas distintas", () => {
  const profile = { limitaciones_fisicas: ["hombro"], lesiones: ["lumbar"] };
  assert.deepEqual(zonas(profile).sort(), ["hombro", "lumbar"]);
});

// ── Deduplicación (contrato del arquitecto: "combinar y deduplicar") ────────────
test("F1: deduplica el mismo token presente en ambos campos (case/acentos)", () => {
  const profile = { limitaciones_fisicas: ["Rodilla"], lesiones: ["rodilla"] };
  const text = extractInjuryText(profile);
  const ocurrencias = (text.toLowerCase().match(/rodilla/g) || []).length;
  assert.equal(ocurrencias, 1);
});

// ── No-regresión HipertrofiaV2 ─────────────────────────────────────────────────
// HpV2 (injuryFilter.js) usa extractInjuryText. Un perfil que YA tenía todo en
// limitaciones_fisicas debe producir exactamente las mismas reglas que antes:
// el cambio solo puede AÑADIR lesiones legacy, nunca perder ni alterar lo canónico.
test("no-regresión HpV2: perfil solo con limitaciones_fisicas produce las mismas zonas", () => {
  const profile = { limitaciones_fisicas: ["hombro", "rodilla"], lesiones: null };
  assert.deepEqual(zonas(profile).sort(), ["hombro", "rodilla"]);
});

test("no-regresión: string legacy en limitaciones_fisicas sigue funcionando", () => {
  const profile = { limitaciones_fisicas: "Tendinitis en hombro derecho, evitar press" };
  assert.deepEqual(zonas(profile), ["hombro"]);
});

test("no-regresión: perfil sin lesiones ni limitaciones devuelve texto vacío", () => {
  assert.equal(extractInjuryText({}), "");
  assert.equal(extractInjuryText({ limitaciones_fisicas: [], lesiones: [] }), "");
  assert.deepEqual(zonas({}), []);
});

test("F1: campo intermedio `limitaciones` (string) también se combina", () => {
  const profile = { limitaciones: "codo", lesiones: ["muñeca"] };
  assert.deepEqual(zonas(profile).sort(), ["codo", "muñeca"].sort());
});
