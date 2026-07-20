import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isCarbTimingPersonalizedEnabled,
  buildEducationalTimingResponse,
  PERSONALIZED_TIMING_PENDING_REASON
} from "../config/carbTiming.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

// ── PR1 · flag y respuesta educativa (§14.1, §14.4) ─────────────────────────────
test("PR1: la personalización de carb timing está DESACTIVADA por defecto", () => {
  const prev = process.env.CARB_TIMING_PERSONALIZED_ENABLED;
  delete process.env.CARB_TIMING_PERSONALIZED_ENABLED;
  assert.equal(isCarbTimingPersonalizedEnabled(), false);
  process.env.CARB_TIMING_PERSONALIZED_ENABLED = "false";
  assert.equal(isCarbTimingPersonalizedEnabled(), false);
  process.env.CARB_TIMING_PERSONALIZED_ENABLED = "true";
  assert.equal(isCarbTimingPersonalizedEnabled(), true);
  if (prev === undefined) delete process.env.CARB_TIMING_PERSONALIZED_ENABLED;
  else process.env.CARB_TIMING_PERSONALIZED_ENABLED = prev;
});

test("PR1: la respuesta educativa cumple el contrato §14.4 (sin gramos)", () => {
  const r = buildEducationalTimingResponse();
  assert.equal(r.success, true);
  assert.equal(r.mode, "educational");
  assert.equal(r.personalized, false);
  assert.equal(r.reason_code, PERSONALIZED_TIMING_PENDING_REASON);
  assert.ok(Array.isArray(r.guidance) && r.guidance.length >= 1);
  // No debe contener gramos ni cantidades personalizadas.
  assert.ok(!("carbs_g" in r) && !("protein_g" in r));
});

// ── PR1 · guards anti-reintroducción (§14.3, acción 5) ──────────────────────────
test("PR1: carbTiming NO reintroduce los divisores mágicos /25 /28 /60 /17", () => {
  for (const rel of ["services/carbTiming.js", "routes/carbTiming.js"]) {
    const src = read(rel);
    // Fabricación de gramos por división del objetivo de carbos/proteína.
    assert.ok(!/carbsTarget\s*\/\s*(25|28|60|17)/.test(src), `${rel} contiene un divisor mágico de carbos`);
    assert.ok(!/protein\s*\/\s*0?\.\d+/.test(src), `${rel} fabrica gramos de proteína por división`);
  }
});

test("PR1: carbTiming NO reintroduce ventana anabólica / countdown / 'come AHORA'", () => {
  for (const rel of ["services/carbTiming.js", "routes/carbTiming.js"]) {
    const src = read(rel).toLowerCase();
    assert.ok(!src.includes("ventana anab"), `${rel} menciona ventana anabólica`);
    assert.ok(!src.includes("come ahora"), `${rel} contiene 'come AHORA'`);
  }
});

test("PR1: carbTiming NO reintroduce peso 75 ni metodología por defecto Hipertrofia", () => {
  for (const rel of ["services/carbTiming.js", "routes/carbTiming.js"]) {
    const src = read(rel);
    assert.ok(!/\|\|\s*75\b/.test(src), `${rel} usa peso inventado de 75`);
    assert.ok(!/\|\|\s*['"]hipertrofia['"]/.test(src), `${rel} usa metodología por defecto Hipertrofia`);
    assert.ok(!/guides\.hipertrofia/.test(src), `${rel} hace fallback de metodología desconocida a Hipertrofia`);
  }
});

test("PR1: las rutas de carb timing pasan por el gate del flag", () => {
  const route = read("routes/carbTiming.js");
  assert.ok(route.includes("isCarbTimingPersonalizedEnabled"), "la ruta no consulta el flag");
  assert.ok(route.includes("buildEducationalTimingResponse"), "la ruta no devuelve la respuesta educativa");
});
