/**
 * PR-CAL-00a · Guardas de FUENTE (VERDE): fijan los invariantes de plataforma que
 * los PRs de Calistenia NO deben romper mientras la integración no esté terminada.
 * NO cambian nada de producción: solo leen defaults y verifican existencia de ficheros.
 *
 * Ver docs/ROADMAP_CALISTENIA_ARQUITECTO.md §3 PR-CAL-00a y límites §0.
 */

import "./helpers/muteConsole.js"; // PRIMERO: silencia logs (evita flake IPC del runner)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getMethodologyDescriptor,
  methodologyEmitsTrainingLoad
} from "../services/routineGeneration/methodologies/methodologyRegistry.js";
import { isCarbTimingPersonalizedEnabled } from "../config/carbTiming.js";
import {
  normalizePeriodizationMode,
  getPeriodizationMode
} from "../services/nutritionPeriodizationService.js";
import { isOutboxEmissionEnabled } from "../services/bridgeEventOutboxService.js";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "../..");

// ── emits_training_load:false para calistenia (gate PR-CAL-06/08) ──
test("guard: calistenia NO emite training-load todavía", () => {
  const descriptor = getMethodologyDescriptor("calistenia");
  assert.ok(descriptor, "el descriptor de calistenia debe existir");
  assert.equal(descriptor.emits_training_load, false);
  assert.equal(methodologyEmitsTrainingLoad("calistenia"), false);
});

// ── Flags de Fase 0 en default seguro (se verifica el DEFAULT, no se cambia nada) ──
test("guard: CARB_TIMING_PERSONALIZED_ENABLED por defecto está OFF", () => {
  const saved = process.env.CARB_TIMING_PERSONALIZED_ENABLED;
  delete process.env.CARB_TIMING_PERSONALIZED_ENABLED;
  try {
    assert.equal(isCarbTimingPersonalizedEnabled(), false);
  } finally {
    if (saved === undefined) delete process.env.CARB_TIMING_PERSONALIZED_ENABLED;
    else process.env.CARB_TIMING_PERSONALIZED_ENABLED = saved;
  }
});

test("guard: NUTRITION_LOAD_PERIODIZATION_MODE por defecto es 'legacy'", () => {
  assert.equal(normalizePeriodizationMode(undefined), "legacy");
  const saved = process.env.NUTRITION_LOAD_PERIODIZATION_MODE;
  delete process.env.NUTRITION_LOAD_PERIODIZATION_MODE;
  try {
    assert.equal(getPeriodizationMode(), "legacy");
  } finally {
    if (saved === undefined) delete process.env.NUTRITION_LOAD_PERIODIZATION_MODE;
    else process.env.NUTRITION_LOAD_PERIODIZATION_MODE = saved;
  }
});

test("guard: BRIDGE_OUTBOX_EMIT_ENABLED por defecto está OFF", () => {
  assert.equal(isOutboxEmissionEnabled({}), false);
});

// ── Migración F0 intacta (existe en el ledger fechado) ──
test("guard: la migración Fase 0 del contrato de carga sigue presente", () => {
  const migrationPath = path.join(
    repoRoot,
    "backend/migrations/20260720_phase0_training_nutrition_contract.sql"
  );
  assert.equal(fs.existsSync(migrationPath), true);
});
