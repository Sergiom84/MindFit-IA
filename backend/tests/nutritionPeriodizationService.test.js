import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveDayNutritionTargets,
  resolvePerformanceCarbFloor,
  normalizePeriodizationMode,
  NUTRITION_PERIODIZATION_VERSION
} from "../services/nutritionPeriodizationService.js";
import { applyCarbCycling } from "../services/nutritionCalculator.js";

/**
 * PR4 (doc 04, Nutrición Fase 0) — PERIODIZADOR NUTRICIONAL CANÓNICO (spec §17.3 + §17.2.7).
 *
 * Funciones puras, sin BD. Fijan las invariantes del reparto D0/D1/D2 y, sobre todo, la
 * PARIDAD del modo `legacy` con el comportamiento anterior de applyCarbCycling (los golden
 * de PR0 siguen verdes porque el motor legado no cambia de salida).
 */

// Contrato training-load/v1 válido y mínimo.
function validLoad(overrides = {}) {
  return {
    contract_version: "training-load/v1",
    methodology_id: "powerlifting",
    methodology_level: "intermedio",
    session_type: "strength_volume",
    status: "planned",
    day_type: "D1",
    load_tier: "moderate",
    provenance: { source: "methodology_engine", confidence: "high" },
    ...overrides
  };
}

const BASE = { protein_g: 180, carbs_g: 300, fat_g: 80 }; // baseKcal = 2640
const KCAL = 2640;

// Réplica EXACTA del algoritmo legado (antes vivía inline en applyCarbCycling).
function legacyExpected(base, isTrainingDay) {
  const { protein_g, carbs_g, fat_g } = base;
  const baseKcal = protein_g * 4 + carbs_g * 4 + fat_g * 9;
  const mult = isTrainingDay ? 1.1 : 0.85;
  const newCarbs = Math.round(carbs_g * mult);
  const remainingFatKcal = Math.max(0, baseKcal - protein_g * 4 - newCarbs * 4);
  const newFat = Math.max(0, Math.round(remainingFatKcal / 9));
  return { protein_g, carbs_g: newCarbs, fat_g: newFat, kcal: protein_g * 4 + newCarbs * 4 + newFat * 9 };
}

// ── §17.3.1: D0/D1/D2 generan firmas explicables con contrato válido ──────────────
test("§17.3.1 · D0/D1/D2 producen day_type y reason_codes explicables (contrato válido)", () => {
  const d0 = resolveDayNutritionTargets({ baseMacros: BASE, kcalTarget: KCAL, weightKg: 80, sessionLoad: validLoad({ day_type: "D0", load_tier: "rest" }), mode: "active" });
  const d1 = resolveDayNutritionTargets({ baseMacros: BASE, kcalTarget: KCAL, weightKg: 80, sessionLoad: validLoad({ day_type: "D1", load_tier: "moderate" }), mode: "active" });
  const d2 = resolveDayNutritionTargets({ baseMacros: BASE, kcalTarget: KCAL, weightKg: 80, sessionLoad: validLoad({ day_type: "D2", load_tier: "high" }), mode: "active" });

  assert.equal(d0.day_type, "D0");
  assert.equal(d1.day_type, "D1");
  assert.equal(d2.day_type, "D2");
  assert.ok(d0.audit.reason_codes.includes("LOAD_D0"));
  assert.ok(d1.audit.reason_codes.includes("LOAD_D1"));
  assert.ok(d2.audit.reason_codes.includes("LOAD_D2"));
  assert.ok(d2.audit.reason_codes.includes("WEEKLY_ISOCALORIC"));
  // D2 exigente → punto de extensión del suelo de rendimiento registra el motivo (§11.6).
  assert.ok(d2.audit.reason_codes.includes("PERFORMANCE_FLOOR_NOT_CONFIGURED"));
  for (const r of [d0, d1, d2]) {
    assert.equal(r.policy_version, NUTRITION_PERIODIZATION_VERSION);
    assert.equal(r.audit.source_confidence, "high");
  }
});

// ── §17.3.2: proteína fija salvo guardarraíl ──────────────────────────────────────
test("§17.3.2 · la proteína se mantiene fija en la redistribución", () => {
  for (const dt of ["D0", "D1", "D2"]) {
    const tier = dt === "D0" ? "rest" : dt === "D2" ? "high" : "moderate";
    const r = resolveDayNutritionTargets({ baseMacros: BASE, kcalTarget: KCAL, weightKg: 80, sessionLoad: validLoad({ day_type: dt, load_tier: tier }), mode: "active" });
    assert.equal(r.macros.protein_g, BASE.protein_g);
  }
});

// ── §17.3.3 + §17.3.5: grasa nunca bajo el mínimo; clamp registrado ───────────────
test("§17.3.3/§17.3.5 · la grasa no baja del mínimo y el clamp queda registrado", () => {
  // Base con poca grasa: D2 (carbos ×1.25) empujaría la grasa por debajo del suelo.
  const lowFatBase = { protein_g: 180, carbs_g: 400, fat_g: 40 }; // baseKcal = 2680
  const r = resolveDayNutritionTargets({ baseMacros: lowFatBase, kcalTarget: 2680, weightKg: 80, sessionLoad: validLoad({ day_type: "D2", load_tier: "high" }), mode: "active" });
  // Suelo: mayor de 0.6 g/kg (48) o 20% kcal (59.6) → 60 g.
  assert.ok(r.macros.fat_g >= 60, `fat ${r.macros.fat_g} debe ser >= 60`);
  assert.ok(r.audit.clamps.length >= 1);
  assert.equal(r.audit.clamps[0].macro, "fat");
  assert.ok(r.audit.reason_codes.includes("FAT_FLOOR_CLAMP"));
});

// ── §17.3.4: kcal semanales dentro de ±1% ─────────────────────────────────────────
test("§17.3.4 · las kcal semanales se mantienen dentro de ±1% (isocalórico)", () => {
  const week = ["D1", "D1", "D0", "D2", "D1", "D0", "D2"];
  let total = 0;
  for (const dt of week) {
    const tier = dt === "D0" ? "rest" : dt === "D2" ? "high" : "moderate";
    const r = resolveDayNutritionTargets({ baseMacros: BASE, kcalTarget: KCAL, weightKg: 80, sessionLoad: validLoad({ day_type: dt, load_tier: tier }), mode: "active" });
    total += r.macros.kcal;
    assert.ok(Math.abs(r.macros.kcal - KCAL) / KCAL <= 0.01, `día ${dt} kcal ${r.macros.kcal} fuera de ±1%`);
  }
  const avg = total / week.length;
  assert.ok(Math.abs(avg - KCAL) / KCAL <= 0.01, `media semanal ${avg} fuera de ±1%`);
});

// ── §17.3.6: mismo demand con distinto methodology_id → mismas macros ─────────────
test("§17.3.6 · cambiar solo methodology_id con la misma demanda no cambia macros", () => {
  const a = resolveDayNutritionTargets({ baseMacros: BASE, kcalTarget: KCAL, weightKg: 80, sessionLoad: validLoad({ methodology_id: "powerlifting", day_type: "D2", load_tier: "high" }), mode: "active" });
  const b = resolveDayNutritionTargets({ baseMacros: BASE, kcalTarget: KCAL, weightKg: 80, sessionLoad: validLoad({ methodology_id: "crossfit", day_type: "D2", load_tier: "high" }), mode: "active" });
  assert.deepEqual(a.macros, b.macros);
});

// ── §17.3.7: D1→D2 cambia el reparto bajo active (pero NO bajo legacy) ────────────
test("§17.3.7 · D1→D2 cambia el reparto bajo active y es idéntico bajo legacy", () => {
  const d1Active = resolveDayNutritionTargets({ baseMacros: BASE, kcalTarget: KCAL, weightKg: 80, sessionLoad: validLoad({ day_type: "D1", load_tier: "moderate" }), mode: "active" });
  const d2Active = resolveDayNutritionTargets({ baseMacros: BASE, kcalTarget: KCAL, weightKg: 80, sessionLoad: validLoad({ day_type: "D2", load_tier: "high" }), mode: "active" });
  assert.notEqual(d1Active.macros.carbs_g, d2Active.macros.carbs_g);

  // Bajo legacy, D1 y D2 son ambos "día de entreno" → mismo reparto.
  const d1Legacy = resolveDayNutritionTargets({ baseMacros: BASE, weightKg: 80, sessionLoad: validLoad({ day_type: "D1", load_tier: "moderate" }), mode: "legacy" });
  const d2Legacy = resolveDayNutritionTargets({ baseMacros: BASE, weightKg: 80, sessionLoad: validLoad({ day_type: "D2", load_tier: "high" }), mode: "legacy" });
  assert.deepEqual(d1Legacy.macros, d2Legacy.macros);
});

// ── §17.3.8: modo legacy == baseline EXACTO ──────────────────────────────────────
test("§17.3.8 · modo legacy reproduce byte a byte el reparto legado (training y rest)", () => {
  const training = resolveDayNutritionTargets({ baseMacros: BASE, sessionLoad: { is_training: true }, mode: "legacy" });
  const rest = resolveDayNutritionTargets({ baseMacros: BASE, sessionLoad: { is_training: false }, mode: "legacy" });
  assert.deepEqual(training.macros, legacyExpected(BASE, true));
  assert.deepEqual(rest.macros, legacyExpected(BASE, false));

  // Y el wrapper deprecated applyCarbCycling delega y mantiene su contrato de salida.
  const wrapped = applyCarbCycling(BASE, true);
  assert.equal(wrapped.carbs_g, training.macros.carbs_g);
  assert.equal(wrapped.fat_g, training.macros.fat_g);
  assert.equal(wrapped.kcal, training.macros.kcal);
  assert.ok(wrapped.carb_cycling && wrapped.carb_cycling.day_type === "training");
});

// ── Política conservadora §11.5: descanso/entreno sin metadatos/contrato inválido ─
test("§11.5 · descanso→D0, entreno sin metadatos→D1 baja confianza, inválido→D1+alerta", () => {
  const rest = resolveDayNutritionTargets({ baseMacros: BASE, sessionLoad: { is_training: false }, mode: "shadow" });
  assert.equal(rest.day_type, "D0");

  const noMeta = resolveDayNutritionTargets({ baseMacros: BASE, sessionLoad: { is_training: true }, mode: "shadow" });
  assert.equal(noMeta.day_type, "D1");
  assert.equal(noMeta.audit.source_confidence, "low");
  assert.ok(noMeta.audit.reason_codes.includes("LOW_CONFIDENCE_FALLBACK"));

  // Contrato incoherente (D2 con load_tier low, §8.5) → degrada a D1 baja confianza + alerta.
  const invalid = resolveDayNutritionTargets({ baseMacros: BASE, sessionLoad: validLoad({ day_type: "D2", load_tier: "low" }), mode: "shadow" });
  assert.equal(invalid.day_type, "D1");
  assert.equal(invalid.audit.source_confidence, "low");
  assert.ok(invalid.audit.reason_codes.includes("INVALID_LOAD_CONTRACT"));
});

// ── §17.2.7: methodology_level no cambia el resultado por sí mismo ────────────────
test("§17.2.7 · methodology_level no cambia macros/energía por sí mismo en la nueva interfaz", () => {
  const beginner = resolveDayNutritionTargets({ baseMacros: BASE, kcalTarget: KCAL, weightKg: 80, sessionLoad: validLoad({ methodology_level: "principiante", day_type: "D1", load_tier: "moderate" }), mode: "active" });
  const advanced = resolveDayNutritionTargets({ baseMacros: BASE, kcalTarget: KCAL, weightKg: 80, sessionLoad: validLoad({ methodology_level: "avanzado", day_type: "D1", load_tier: "moderate" }), mode: "active" });
  assert.deepEqual(beginner.macros, advanced.macros);
  assert.equal(beginner.day_type, advanced.day_type);
});

// ── §11.6: suelo de rendimiento no configurado conserva el suelo actual ──────────
test("§11.6 · resolvePerformanceCarbFloor sin rule pack registra PERFORMANCE_FLOOR_NOT_CONFIGURED", () => {
  const floor = resolvePerformanceCarbFloor({ weightKg: 80, sessionLoad: validLoad({ day_type: "D2", load_tier: "high" }), objective: "mant" });
  assert.equal(floor.configured, false);
  assert.equal(floor.floor_g, null);
  assert.equal(floor.reason_code, "PERFORMANCE_FLOOR_NOT_CONFIGURED");
});

// ── Modos: normalización robusta (default legacy) ────────────────────────────────
test("modos · valor desconocido de NUTRITION_LOAD_PERIODIZATION_MODE cae a legacy", () => {
  assert.equal(normalizePeriodizationMode("shadow"), "shadow");
  assert.equal(normalizePeriodizationMode("active"), "active");
  assert.equal(normalizePeriodizationMode("ACTIVE"), "active");
  assert.equal(normalizePeriodizationMode("bogus"), "legacy");
  assert.equal(normalizePeriodizationMode(undefined), "legacy");
});
