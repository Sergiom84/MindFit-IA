import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateBMRAudit,
  calculateTDEEAudit,
  calculateMacros
} from "../services/nutritionCalculator.js";
import { computeMacrosAndKcalFromFood } from "../services/nutritionV2/macroMath.js";
import { evaluateMealQuality } from "../services/nutritionV2/menuQualityGate.js";
import { activeInjuryRules, extractInjuryText } from "../services/routineGeneration/injuryContraindications.js";

/**
 * PR0 (doc 04, Nutrición Fase 0) — GATES DE PARIDAD.
 *
 * Golden tests que congelan el comportamiento ACTUAL de Nutrición V2 (cálculo de
 * energía/macros y reconciliación de alimento), el contrato del gate de calidad A-04
 * (campo `quality`, POSTERIOR a la spec pero parte del contrato vigente), la
 * no-regresión de HipertrofiaV2 (filtro de lesiones compartido) y el fallback booleano
 * de menú. Cualquier refactor posterior (PR2+) que cambie estos valores fallará aquí.
 *
 * Baseline de la suite en `main` a 2026-07-20: 102/102 (100% verde). La spec citaba
 * 81/82 por `express-rate-limit` ausente en su worktree; en main ese paquete está
 * presente y la suite es 100% verde — se documenta el número real.
 */

// ── Golden: energía y macros (funciones puras, sin BD) ──────────────────────────
test("PR0 golden · Nutrición V2: BMR/TDEE/macros para un perfil fijo", () => {
  const profile = { sexo: "masculino", peso_kg: 80, altura_cm: 178, edad: 30, actividad: "moderado" };
  const bmr = calculateBMRAudit(profile);
  assert.equal(bmr.bmr, 1608);

  const tdee = calculateTDEEAudit(bmr.bmr, "moderado", 4, 8000);
  assert.equal(tdee.tdee, 2492);

  const macros = calculateMacros(2400, 80, "hipertrofia", "ganar_masa_muscular", "normal", "media", "intermedio");
  assert.deepEqual(
    { protein_g: macros.protein_g, carbs_g: macros.carbs_g, fat_g: macros.fat_g },
    { protein_g: 138, carbs_g: 282, fat_g: 80 }
  );
  assert.equal(macros.kcal_calculated, 2400);
});

test("PR0 golden · Nutrición V2: reconciliación de macros de alimento desde macros_100g", () => {
  const out = computeMacrosAndKcalFromFood({ macros_100g: { protein_g: 23, carbs_g: 0, fat_g: 2, kcal: 110 } }, 150);
  assert.deepEqual(out, { protein_g: 34.5, carbs_g: 0, fat_g: 3, kcal: 165 });
});

// ── Contrato del gate A-04 (incluye el campo quality) ───────────────────────────
test("PR0 golden · contrato del gate de calidad de menús (campo quality vigente)", () => {
  const meal = { kcal: 500, macros: { protein_g: 40, carbs_g: 50, fat_g: 15 } };
  const menu = { validacion: { kcal_total: 500, macros_totales: { protein_g: 40, carbs_g: 50, fat_g: 15 } } };
  const q = evaluateMealQuality({ meal, menu, metadata: { target_within_tolerance: true } });
  // El contrato del endpoint incluye status, reasons y gate_version.
  assert.equal(q.status, "ok");
  assert.deepEqual(q.reasons, []);
  assert.ok(typeof q.gate_version === "string" && q.gate_version.length > 0);
  assert.ok(typeof q.max_error_pct === "number");
});

test("PR0 golden · fallback booleano de menú marca degraded", () => {
  const meal = { kcal: 500, macros: { protein_g: 40, carbs_g: 50, fat_g: 15 } };
  const menu = { validacion: { kcal_total: 500, macros_totales: { protein_g: 40, carbs_g: 50, fat_g: 15 } } };
  const q = evaluateMealQuality({ meal, menu, metadata: { fallback_used: true } });
  assert.equal(q.status, "degraded");
  assert.ok(q.reasons.includes("fallback_used"));
});

// ── No-regresión de HipertrofiaV2 (filtro de lesiones compartido) ───────────────
test("PR0 golden · HipertrofiaV2 sin cambio: el filtro de lesiones detecta las mismas zonas", () => {
  const profile = { limitaciones_fisicas: ["rodilla"], lesiones: ["hombro"] };
  const zonas = activeInjuryRules(extractInjuryText(profile)).map((r) => r.zona).sort();
  assert.deepEqual(zonas, ["hombro", "rodilla"]);
});
