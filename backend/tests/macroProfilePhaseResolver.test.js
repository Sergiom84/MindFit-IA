import test from "node:test";
import assert from "node:assert/strict";

import {
  MACRO_RULESET_VERSION,
  getMacroDistributionCatalog,
  normalizeMetabolicProfile,
  normalizeNutritionPhase,
  resolveMacroTargets
} from "../services/macroProfilePhaseResolver.js";

const MATRIX_CASES = [
  ["tolerante", "cut", { protein_pct: 28, carbs_pct: 47, fat_pct: 25 }],
  ["tolerante", "mant", { protein_pct: 25, carbs_pct: 55, fat_pct: 20 }],
  ["tolerante", "bulk", { protein_pct: 23, carbs_pct: 57, fat_pct: 20 }],
  ["mixto", "cut", { protein_pct: 28, carbs_pct: 32, fat_pct: 40 }],
  ["mixto", "mant", { protein_pct: 25, carbs_pct: 40, fat_pct: 35 }],
  ["mixto", "bulk", { protein_pct: 23, carbs_pct: 47, fat_pct: 30 }],
  ["intolerante", "cut", { protein_pct: 30, carbs_pct: 22, fat_pct: 48 }],
  ["intolerante", "mant", { protein_pct: 27, carbs_pct: 28, fat_pct: 45 }],
  ["intolerante", "bulk", { protein_pct: 25, carbs_pct: 35, fat_pct: 40 }]
];

test("macroProfilePhaseResolver: resuelve la matriz oficial 3x3 sin desvíos", () => {
  for (const [profile, phase, expectedPct] of MATRIX_CASES) {
    const resolved = resolveMacroTargets({
      kcalTarget: 2400,
      pesoKg: 80,
      metabolicProfile: profile,
      phase
    });

    assert.deepEqual(resolved.template_pct, expectedPct, `${profile} + ${phase} template_pct`);
    assert.deepEqual(resolved.final_pct, expectedPct, `${profile} + ${phase} final_pct`);
    assert.equal(resolved.ruleset, MACRO_RULESET_VERSION);
  }
});

test("macroProfilePhaseResolver: soporta aliases de perfil y fase", () => {
  assert.equal(normalizeMetabolicProfile("equilibrado"), "mixto");
  assert.equal(normalizeMetabolicProfile("INTOLERANTE"), "intolerante");
  assert.equal(normalizeNutritionPhase("normocalórica"), "mant");
  assert.equal(normalizeNutritionPhase("superávit"), "bulk");
  assert.equal(normalizeNutritionPhase("perder_peso"), "cut");
});

test("macroProfilePhaseResolver: aplica guardarraíl mínimo de proteína cuando la plantilla se queda corta", () => {
  const resolved = resolveMacroTargets({
    kcalTarget: 1600,
    pesoKg: 100,
    metabolicProfile: "tolerante",
    phase: "bulk"
  });

  assert.equal(resolved.protein_range_g.min, 160);
  assert.ok(resolved.protein_g >= 160);
  assert.equal(resolved.guardrails_applied, true);
  assert.ok(resolved.adjustments.some((entry) => entry.macro === "protein"));
});

test("macroProfilePhaseResolver: aplica guardarraíl máximo de proteína cuando la plantilla se dispara", () => {
  const resolved = resolveMacroTargets({
    kcalTarget: 3200,
    pesoKg: 55,
    metabolicProfile: "intolerante",
    phase: "cut"
  });

  assert.equal(resolved.protein_range_g.max, 132);
  assert.ok(resolved.protein_g <= 132);
  assert.equal(resolved.guardrails_applied, true);
  assert.ok(resolved.adjustments.some((entry) => entry.macro === "protein" && entry.adjusted === 132));
});

test("macroProfilePhaseResolver: garantiza mínimo de grasa y publica catálogo compatible", () => {
  const resolved = resolveMacroTargets({
    kcalTarget: 1400,
    pesoKg: 100,
    metabolicProfile: "tolerante",
    phase: "bulk"
  });

  const catalog = getMacroDistributionCatalog();

  assert.ok(resolved.fat_g >= 60);
  assert.equal(catalog.ruleset, MACRO_RULESET_VERSION);
  assert.deepEqual(catalog.phase_table.tolerante.cut, { protein_pct: 28, carbs_pct: 47, fat_pct: 25 });
  assert.deepEqual(catalog.legacy_ranges.mixto.protein, { min: 25, max: 30, mid: 28 });
});
