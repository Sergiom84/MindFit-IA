import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isTrainingDay as isTrainingDayBackend,
  normalizeDayType as normalizeDayTypeBackend
} from "../services/trainingLoad/dayType.js";
import {
  isTrainingDay as isTrainingDayFrontend,
  normalizeDayType as normalizeDayTypeFrontend
} from "../../src/utils/dayType.js";
import { resolveDayNutritionTargets } from "../services/nutritionPeriodizationService.js";
import { nutritionMenuGeneratorPrompt } from "../prompts/nutrition-menu-generator.js";
import {
  collectPhase0Metrics,
  PERIODIZATION_CONFIDENCE_SQL,
  SHADOW_DIFF_SQL,
  SCHEDULE_DAY_ID_SQL,
  OUTBOX_HEALTH_SQL,
  DUPLICATE_DECISIONS_SQL,
  WEEKLY_DRIFT_SQL
} from "../services/trainingLoad/phase0Metrics.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ningún test toca la BD: funciones puras, SQL como texto y un mock de db (patrón del repo).

const BASE_MACROS = { protein_g: 180, carbs_g: 300, fat_g: 70 };

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

// ── COR-F0-01: normalización única del tipo de día ───────────────────────────────
test("COR-F0-01: isTrainingDay trata entreno/entreno_normal/entreno_alto como entrenamiento", () => {
  for (const fn of [isTrainingDayBackend, isTrainingDayFrontend]) {
    assert.equal(fn("entreno"), true);
    assert.equal(fn("entreno_normal"), true);
    assert.equal(fn("entreno_alto"), true);
    assert.equal(fn("ENTRENO_ALTO"), true); // tolerante a mayúsculas
    assert.equal(fn("descanso"), false);
    assert.equal(fn(""), false);
    assert.equal(fn(null), false);
    assert.equal(fn("desconocido"), false);
  }
});

test("COR-F0-01: backend y frontend normalizan idénticamente a la etiqueta legacy", () => {
  for (const value of ["entreno", "entreno_normal", "entreno_alto", "descanso", "", null, "x"]) {
    assert.equal(normalizeDayTypeBackend(value), normalizeDayTypeFrontend(value));
  }
  assert.equal(normalizeDayTypeBackend("entreno_alto"), "entreno");
  assert.equal(normalizeDayTypeBackend("descanso"), "descanso");
});

test("COR-F0-01: el generador de menús recibe contexto ENTRENO para los tres valores", () => {
  const meal = { nombre: "Comida", kcal: 600, macros: { protein_g: 40, carbs_g: 60, fat_g: 15 }, orden: 3 };
  const userPreferences = { preferencias: {}, alergias: [] };
  const availableFoods = [{ nombre: "Arroz", categoria: "cereal", macros_100g: { protein_g: 7, carbs_g: 78, fat_g: 1, kcal: 350 } }];
  for (const tipo of ["entreno", "entreno_normal", "entreno_alto"]) {
    const prompt = nutritionMenuGeneratorPrompt({ meal, dayInfo: { tipo_dia: tipo }, userPreferences, availableFoods });
    assert.match(prompt, /DÍA DE ENTRENAMIENTO/, `tipo_dia=${tipo} debe ser día de entrenamiento`);
  }
  const rest = nutritionMenuGeneratorPrompt({ meal, dayInfo: { tipo_dia: "descanso" }, userPreferences, availableFoods });
  assert.match(rest, /DÍA DE DESCANSO/);
});

test("COR-F0-01: la ruta sólo sirve tipos nuevos como autoritativos si la metodología emite carga", () => {
  const src = fs.readFileSync(path.join(__dirname, "../routes/nutritionV2.js"), "utf8");
  // El gate combina modo active + methodologyEmitsLoad antes de reconstruir tipo_dia/macros.
  assert.match(src, /servesAuthoritative\s*=\s*periodizationMode === 'active' && methodologyEmitsLoad === true/);
  assert.match(src, /if \(servesAuthoritative\)/);
  // Y usa el normalizador único (no comparaciones literales sueltas).
  assert.match(src, /isTrainingDay\(day\.tipo_dia\)/);
});

// ── COR-F0-01: entreno_alto se ve como entrenamiento en calendario y detalle ──────
test("COR-F0-01: calendario y detalle frontend usan isTrainingDay (entreno_alto = entrenamiento)", () => {
  const cal = fs.readFileSync(path.join(__dirname, "../../src/components/nutrition/NutritionCalendarView.jsx"), "utf8");
  const detail = fs.readFileSync(path.join(__dirname, "../../src/components/nutrition/MealDetailView.jsx"), "utf8");
  assert.match(cal, /import \{ isTrainingDay \} from '\.\.\/\.\.\/utils\/dayType'/);
  assert.match(cal, /isTrainingDay\(day\?\.tipo_dia\)/);
  assert.match(detail, /import \{ isTrainingDay \} from '\.\.\/\.\.\/utils\/dayType'/);
  assert.match(detail, /isTrainingDay\(dayState\?\.tipo_dia\)/);
  // Un día entreno_alto se resuelve como entrenamiento con el mismo helper que usa la vista.
  assert.equal(isTrainingDayFrontend("entreno_alto"), true);
});

// ── COR-F0-05: load_contract_status honesto ──────────────────────────────────────
test("COR-F0-05: contrato válido y emisor → valid", () => {
  const r = resolveDayNutritionTargets({
    baseMacros: BASE_MACROS, weightKg: 80, mode: "shadow",
    sessionLoad: validLoad({ day_type: "D2", load_tier: "high" }),
    methodologyEmitsLoad: true
  });
  assert.equal(r.load_contract_status, "valid");
  assert.equal(r.day_type, "D2");
});

test("COR-F0-05: contrato incoherente → degraded (NO cuenta como válido)", () => {
  // D2 con load_tier low es incoherente → lenient lo degrada a D1.
  const r = resolveDayNutritionTargets({
    baseMacros: BASE_MACROS, weightKg: 80, mode: "shadow",
    sessionLoad: validLoad({ day_type: "D2", load_tier: "low" }),
    methodologyEmitsLoad: true
  });
  assert.equal(r.load_contract_status, "degraded");
  assert.notEqual(r.load_contract_status, "valid");
});

test("COR-F0-05: entreno sin contrato → boolean_fallback", () => {
  const r = resolveDayNutritionTargets({
    baseMacros: BASE_MACROS, weightKg: 80, mode: "shadow",
    sessionLoad: { is_training: true },
    methodologyEmitsLoad: true
  });
  assert.equal(r.load_contract_status, "boolean_fallback");
  assert.equal(r.day_type, "D1");
});

test("COR-F0-05: descanso → no_load", () => {
  const r = resolveDayNutritionTargets({
    baseMacros: BASE_MACROS, weightKg: 80, mode: "shadow",
    sessionLoad: { is_training: false },
    methodologyEmitsLoad: true
  });
  assert.equal(r.load_contract_status, "no_load");
  assert.equal(r.day_type, "D0");
});

test("COR-F0-05: gate por metodología no emisora → contrato ignorado, NO valid", () => {
  const r = resolveDayNutritionTargets({
    baseMacros: BASE_MACROS, weightKg: 80, mode: "shadow",
    sessionLoad: validLoad({ day_type: "D2", load_tier: "high" }),
    methodologyEmitsLoad: false
  });
  assert.notEqual(r.day_type, "D2"); // nunca sirve D2 autoritativo
  assert.equal(r.load_contract_status, "boolean_fallback");
});

test("COR-F0-05: legacy sigue devolviendo el reparto binario sin tipos nuevos", () => {
  const training = resolveDayNutritionTargets({
    baseMacros: BASE_MACROS, mode: "legacy", sessionLoad: { is_training: true }
  });
  const rest = resolveDayNutritionTargets({
    baseMacros: BASE_MACROS, mode: "legacy", sessionLoad: { is_training: false }
  });
  assert.ok(training.audit.reason_codes.includes("LEGACY_CARB_CYCLING"));
  assert.equal(training.macros.carbs_g, Math.round(BASE_MACROS.carbs_g * 1.10));
  assert.equal(rest.macros.carbs_g, Math.round(BASE_MACROS.carbs_g * 0.85));
});

// ── COR-F0-05: métricas honestas (SQL como texto) ────────────────────────────────
test("COR-F0-05: % contrato válido se calcula desde load_contract_status, no desde source", () => {
  assert.match(PERIODIZATION_CONFIDENCE_SQL, /load_contract_status' = 'valid'/);
  assert.match(PERIODIZATION_CONFIDENCE_SQL, /load_contract_status' = 'degraded'/);
  assert.match(PERIODIZATION_CONFIDENCE_SQL, /load_contract_status' = 'boolean_fallback'/);
  assert.match(PERIODIZATION_CONFIDENCE_SQL, /load_contract_status' = 'no_load'/);
  // Ya NO se cuenta el contrato válido por la fuente del dato.
  assert.doesNotMatch(PERIODIZATION_CONFIDENCE_SQL, /source' = 'planned_session_load'[\s\S]*AS status_valid/);
});

test("COR-F0-05: SHADOW_DIFF_SQL agrega carbohidrato, kcal y clamps sin datos personales", () => {
  assert.match(SHADOW_DIFF_SQL, /avg_abs_carb_diff_g/);
  assert.match(SHADOW_DIFF_SQL, /avg_carb_diff_pct/);
  assert.match(SHADOW_DIFF_SQL, /avg_abs_kcal_diff/);
  assert.match(SHADOW_DIFF_SQL, /total_clamps/);
  // No selecciona identificadores de usuario ni texto libre.
  assert.doesNotMatch(SHADOW_DIFF_SQL, /user_id|email|nombre/i);
});

// ── COR-F0-05: collectPhase0Metrics con un mock de db (sin BD real) ───────────────
function mockDb(rowsBySql) {
  return {
    query: (sql) => Promise.resolve({ rows: [rowsBySql.get(sql) || {}] })
  };
}

test("COR-F0-05: collectPhase0Metrics no cuenta degradados como válidos y publica shadow", async () => {
  const prevFlag = process.env.CARB_TIMING_PERSONALIZED_ENABLED;
  delete process.env.CARB_TIMING_PERSONALIZED_ENABLED;

  const rows = new Map([
    [SCHEDULE_DAY_ID_SQL, { schedule_total: 100, schedule_with_day_id: 100 }],
    [PERIODIZATION_CONFIDENCE_SQL, {
      periodized_total: 10, status_valid: 4, status_degraded: 3,
      status_boolean_fallback: 2, status_no_load: 1, d1_low_confidence: 2
    }],
    [SHADOW_DIFF_SQL, {
      shadow_days: 7, avg_abs_carb_diff_g: 30, max_abs_carb_diff_g: 75, p95_abs_carb_diff_g: 70,
      avg_carb_diff_pct: 10, avg_abs_kcal_diff: 0, max_abs_kcal_diff: 5, total_clamps: 2, days_with_clamps: 1
    }],
    [OUTBOX_HEALTH_SQL, { pending_over_10min: 0, failed_after_max_attempts: 0, pending_total: 1 }],
    [DUPLICATE_DECISIONS_SQL, { duplicate_decisions: 0 }],
    [WEEKLY_DRIFT_SQL, { days_with_macros: 7, days_drift_over_1pct: 0 }]
  ]);

  const m = await collectPhase0Metrics(mockDb(rows));

  // Sólo 4 de 10 son válidos (no los 4+3 con source planned): honestidad del contrato.
  assert.equal(m.periodization.with_valid_contract, 4);
  assert.equal(m.periodization.pct_with_valid_contract, 40);
  assert.deepEqual(m.periodization.by_contract_status, {
    valid: 4, degraded: 3, boolean_fallback: 2, no_load: 1
  });
  // Shadow publica diferencias agregadas.
  assert.equal(m.shadow.carb_diff_g_avg, 30);
  assert.equal(m.shadow.carb_diff_pct_avg, 10);
  assert.equal(m.shadow.clamps_total, 2);
  // Flag apagado → 0 recomendaciones personalizadas sin catálogo.
  assert.equal(m.shadow.personalized_recommendations_without_catalog, 0);
  assert.equal(m.shadow.carb_timing_personalized_enabled, false);
  assert.equal(m.alerts.personalized_without_catalog, false);

  // Sin datos personales: el JSON serializado no contiene claves sensibles.
  const serialized = JSON.stringify(m);
  assert.doesNotMatch(serialized, /email|user_id|password|token/i);

  if (prevFlag === undefined) delete process.env.CARB_TIMING_PERSONALIZED_ENABLED;
  else process.env.CARB_TIMING_PERSONALIZED_ENABLED = prevFlag;
});
