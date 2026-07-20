import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractPlannedSessionLoad,
  buildPlanDayMetadata,
  SCHEDULE_WITH_LOAD_QUERY
} from "../services/trainingLoad/sessionLoadBuilder.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ningún test toca la BD: solo funciones puras y SQL como texto (patrón unit del repo).

const MIGRATION_PATH = path.join(
  __dirname,
  "../migrations/20260720_phase0_training_nutrition_contract.sql"
);
const migrationSql = fs.readFileSync(MIGRATION_PATH, "utf8");

// Un contrato training-load/v1 válido y mínimo para las pruebas del helper.
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

// ── Migración: idempotencia lógica (spec §10) ────────────────────────────────────
test("migración: envuelta en una sola transacción BEGIN/COMMIT", () => {
  assert.match(migrationSql, /^BEGIN;/m);
  assert.match(migrationSql, /COMMIT;\s*$/);
  // Sin CREATE INDEX CONCURRENTLY (no puede ir en transacción).
  assert.doesNotMatch(migrationSql, /CONCURRENTLY/i);
});

test("migración: columnas aditivas idempotentes (IF NOT EXISTS)", () => {
  assert.match(
    migrationSql,
    /ALTER TABLE app\.nutrition_plan_days\s+ADD COLUMN IF NOT EXISTS periodization_context JSONB/
  );
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS source_event_id TEXT/);
  assert.match(migrationSql, /ADD COLUMN IF NOT EXISTS contract_version TEXT/);
});

test("migración: índice único parcial de idempotencia por evento origen", () => {
  assert.match(
    migrationSql,
    /CREATE UNIQUE INDEX IF NOT EXISTS uq_bridge_decision_source_event\s+ON app\.bridge_decision_logs \(user_id, trigger_source, source_event_id\)\s+WHERE source_event_id IS NOT NULL/
  );
});

test("migración: tabla bridge_event_outbox con CHECK, UNIQUE e índices parciales", () => {
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS app\.bridge_event_outbox/);
  assert.match(migrationSql, /event_key TEXT NOT NULL UNIQUE/);
  assert.match(
    migrationSql,
    /CHECK \(status IN \('pending', 'processing', 'completed', 'skipped', 'failed'\)\)/
  );
  assert.match(migrationSql, /attempts INTEGER NOT NULL DEFAULT 0 CHECK \(attempts >= 0\)/);
  assert.match(migrationSql, /REFERENCES app\.users\(id\) ON DELETE CASCADE/);
  assert.match(
    migrationSql,
    /CREATE INDEX IF NOT EXISTS idx_bridge_event_outbox_pending[\s\S]*?WHERE status IN \('pending', 'failed'\)/
  );
  assert.match(
    migrationSql,
    /CREATE INDEX IF NOT EXISTS idx_bridge_event_outbox_stale_processing[\s\S]*?WHERE status = 'processing'/
  );
});

test("migración: función V2 nueva, sin tocar la firma legacy de 9 args", () => {
  assert.match(migrationSql, /CREATE OR REPLACE FUNCTION app\.log_bridge_decision_v2\(/);
  // La v2 añade source_event_id y contract_version (spec §10).
  assert.match(migrationSql, /p_source_event_id TEXT DEFAULT NULL/);
  assert.match(migrationSql, /p_contract_version TEXT DEFAULT NULL/);
  // NUNCA se redefine la función legacy con su firma original.
  assert.doesNotMatch(migrationSql, /CREATE OR REPLACE FUNCTION app\.log_bridge_decision\(/);
  // La v2 desduplica por evento origen (ON CONFLICT DO NOTHING).
  assert.match(migrationSql, /ON CONFLICT \(user_id, trigger_source, source_event_id\)/);
  assert.match(migrationSql, /DO NOTHING/);
});

test("migración: backfill de day_id por (plan_id + fecha), solo días no-descanso y NULL", () => {
  assert.match(migrationSql, /UPDATE app\.workout_schedule ws\s+SET day_id = mpd\.day_id/);
  assert.match(migrationSql, /WHERE ws\.day_id IS NULL/);
  assert.match(migrationSql, /AND mpd\.plan_id = ws\.methodology_plan_id/);
  assert.match(migrationSql, /AND mpd\.date_local = ws\.scheduled_date/);
  assert.match(migrationSql, /AND mpd\.is_rest = FALSE/);
});

// ── Helper puro: metadata del día del plan (spec §9.1) ────────────────────────────
test("buildPlanDayMetadata: sin carga → null (no se inventa metadata)", () => {
  assert.equal(buildPlanDayMetadata(null), null);
  assert.equal(buildPlanDayMetadata({}), null);
  assert.equal(buildPlanDayMetadata({ titulo: "Empuje", ejercicios: [] }), null);
  assert.equal(buildPlanDayMetadata({ session_load: 123 }), null);
});

test("buildPlanDayMetadata: carga válida → status 'valid' y session_load conservado", () => {
  const meta = buildPlanDayMetadata({ session_load: validLoad({ day_type: "D2", load_tier: "high" }) });
  assert.ok(meta);
  assert.equal(meta.load_contract_status, "valid");
  assert.equal(meta.session_load.contract_version, "training-load/v1");
  assert.equal(meta.session_load.day_type, "D2");
});

test("buildPlanDayMetadata: carga inválida → degradada a D1 (lenient, no rompe calendario)", () => {
  // D2 con load_tier low es incoherente (§8.5): en lenient se degrada, no se descarta.
  const meta = buildPlanDayMetadata({ session_load: validLoad({ day_type: "D2", load_tier: "low" }) });
  assert.ok(meta);
  assert.equal(meta.load_contract_status, "degraded");
  assert.equal(meta.session_load.day_type, "D1");
  assert.equal(meta.session_load.provenance.confidence, "low");
});

test("extractPlannedSessionLoad: acepta ubicaciones alternativas, ignora basura", () => {
  const load = validLoad();
  assert.deepEqual(extractPlannedSessionLoad({ session_load: load }), load);
  assert.deepEqual(extractPlannedSessionLoad({ sessionLoad: load }), load);
  assert.deepEqual(extractPlannedSessionLoad({ metadata: { session_load: load } }), load);
  assert.equal(extractPlannedSessionLoad({ session_load: "x" }), null);
  assert.equal(extractPlannedSessionLoad(undefined), null);
});

// ── Canal de datos: day_id en calendarios nuevos + join §12.1 ─────────────────────
test("ensureScheduleV3 persiste day_id en workout_schedule y metadata en plan_days", () => {
  const src = fs.readFileSync(path.join(__dirname, "../utils/ensureScheduleV3.js"), "utf8");
  // El INSERT de workout_schedule debe listar day_id y enlazarlo al mismo dayId del día.
  assert.match(
    src,
    /INSERT INTO app\.workout_schedule \(methodology_plan_id, user_id, day_id,/
  );
  // El INSERT de methodology_plan_days del día de entrenamiento incluye metadata.
  assert.match(
    src,
    /INSERT INTO app\.methodology_plan_days \(plan_id, day_id, week_number, day_name, date_local, is_rest, planned_exercises_count, metadata\)/
  );
  // Usa el helper puro para construir la metadata (sin inventar carga).
  assert.match(src, /buildPlanDayMetadata\(sesion\)/);
});

test("§12.1: join del calendario enriquecido es LEFT JOIN por day_id (no por fecha)", () => {
  assert.match(SCHEDULE_WITH_LOAD_QUERY, /LEFT JOIN app\.methodology_plan_days mpd/);
  assert.match(SCHEDULE_WITH_LOAD_QUERY, /ON mpd\.plan_id = ws\.methodology_plan_id/);
  assert.match(SCHEDULE_WITH_LOAD_QUERY, /AND mpd\.day_id = ws\.day_id/);
  assert.match(SCHEDULE_WITH_LOAD_QUERY, /mpd\.metadata -> 'session_load' AS session_load/);
  // No debe volver a juntar por fecha en el join canónico (eso era el fallback histórico).
  assert.doesNotMatch(SCHEDULE_WITH_LOAD_QUERY, /mpd\.date_local/);
});

test("start.js copia planned_session_load a session_metadata al iniciar", () => {
  const src = fs.readFileSync(path.join(__dirname, "../routes/trainingSession/start.js"), "utf8");
  assert.match(src, /metadata -> 'session_load' AS session_load/);
  assert.match(src, /jsonb_build_object\('planned_session_load'/);
  // No debe tocar la creación bajo demanda: sigue existiendo createMissingDaySession.
  assert.match(src, /createMissingDaySession/);
});
