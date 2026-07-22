import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SCHEDULE_WITH_LOAD_FALLBACK_QUERY,
  countDateFallbacks
} from "../services/trainingLoad/sessionLoadBuilder.js";

// COR-F0-04: enlace canónico por day_id + fallback histórico. Ningún test toca la BD:
// solo funciones puras y SQL/fuente como texto (patrón unit del repo).

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const read = (rel) => fs.readFileSync(path.join(__dirname, rel), "utf8");

const ensureSrc = read("../utils/ensureScheduleV3.js");
const plansSrc = read("../routes/routines/plans.js");
const helpersSrc = read("../routes/trainingSession/_helpers.js");
const startSrc = read("../routes/trainingSession/start.js");
const migrationSrc = read("../migrations/20260721_backfill_mes_day_id.sql");

// ── §2/§3: day_id canónico en ensureScheduleV3 (RETURNING + recuperación en conflicto) ──
test("ensureScheduleV3: el INSERT de workout_schedule usa RETURNING day_id", () => {
  assert.match(
    ensureSrc,
    /ON CONFLICT \(methodology_plan_id, user_id, scheduled_date\) DO NOTHING\s+RETURNING day_id/
  );
});

test("ensureScheduleV3: ante conflicto recupera el day_id canónico existente (SELECT)", () => {
  // Se recupera del calendario existente en vez de inventar uno nuevo independiente.
  assert.match(ensureSrc, /let canonicalDayId = wsInsert\.rows\?\.\[0\]\?\.day_id \?\? dayId/);
  assert.match(ensureSrc, /if \(wsInsert\.rowCount === 0\)/);
  assert.match(
    ensureSrc,
    /SELECT day_id FROM app\.workout_schedule\s+WHERE methodology_plan_id = \$1 AND user_id = \$2 AND scheduled_date = \$3/
  );
});

test("ensureScheduleV3: methodology_plan_days del día de entreno usa canonicalDayId, no dayId", () => {
  // El INSERT de metadata del día de entrenamiento debe enlazar con el day_id canónico.
  assert.match(
    ensureSrc,
    /INSERT INTO app\.methodology_plan_days \(plan_id, day_id, week_number, day_name, date_local, is_rest, planned_exercises_count, metadata\)[\s\S]*?\[methodologyPlanId, canonicalDayId,/
  );
});

// ── §9: no ocultar errores estructurales dejando la transacción abortada ──────────
test("ensureScheduleV3: aísla con SAVEPOINT y propaga si está en transacción", () => {
  assert.match(ensureSrc, /SAVEPOINT ensure_schedule_v3/);
  assert.match(ensureSrc, /ROLLBACK TO SAVEPOINT ensure_schedule_v3/);
  assert.match(ensureSrc, /RELEASE SAVEPOINT ensure_schedule_v3/);
  // En transacción, tras limpiar el savepoint, PROPAGA el error (no lo oculta).
  assert.match(ensureSrc, /if \(usingSavepoint\) \{[\s\S]*?throw error;/);
});

// ── §1/§4: la sesión conserva el mismo day_id que su fila de calendario ───────────
test("plans.js: la sesión precreada copia day_id (y fecha) desde workout_schedule", () => {
  assert.match(
    plansSrc,
    /INSERT INTO app\.methodology_exercise_sessions \([\s\S]*?day_id,[\s\S]*?RETURNING id/
  );
  assert.match(plansSrc, /scheduleRow\.day_id \?\? null/);
});

test("_helpers.js: createMissingDaySession traslada day_id y fecha exacta del calendario", () => {
  assert.match(
    helpersSrc,
    /SELECT day_id, scheduled_date\s+FROM app\.workout_schedule\s+WHERE methodology_plan_id = \$1 AND user_id = \$2 AND week_number = \$3 AND day_abbrev = \$4/
  );
  assert.match(helpersSrc, /INSERT INTO app\.methodology_exercise_sessions\s+\(user_id, methodology_plan_id, day_id,/);
  assert.match(helpersSrc, /canonicalDayId/);
  assert.match(helpersSrc, /canonicalDate/);
});

// ── §5: iniciar sesión busca la carga por plan_id + day_id (no day_name + LIMIT 1) ──
test("start.js: busca planned_session_load por plan_id + day_id cuando existe", () => {
  assert.match(startSrc, /if \(session\?\.day_id != null\)/);
  assert.match(
    startSrc,
    /WHERE plan_id = \$1 AND day_id = \$2 AND is_rest = FALSE/
  );
  // Mantiene el enlace previo por nombre de día SOLO como degradación para históricos.
  assert.match(
    startSrc,
    /WHERE plan_id = \$1 AND week_number = \$2 AND day_name = \$3 AND is_rest = FALSE/
  );
});

// ── §4/§6: fallback histórico REAL por (plan_id + fecha), unívoco y contado ────────
test("fallback query: LEFT JOIN LATERAL por fecha, unívoco (HAVING count(*) = 1)", () => {
  assert.match(SCHEDULE_WITH_LOAD_FALLBACK_QUERY, /LEFT JOIN LATERAL/);
  assert.match(SCHEDULE_WITH_LOAD_FALLBACK_QUERY, /m\.date_local = ws\.scheduled_date/);
  assert.match(SCHEDULE_WITH_LOAD_FALLBACK_QUERY, /m\.is_rest = FALSE/);
  assert.match(SCHEDULE_WITH_LOAD_FALLBACK_QUERY, /ws\.day_id IS NULL/);
  assert.match(SCHEDULE_WITH_LOAD_FALLBACK_QUERY, /HAVING count\(\*\) = 1/);
  // Enlace canónico por day_id sigue siendo la fuente preferente (COALESCE canónico primero).
  assert.match(
    SCHEDULE_WITH_LOAD_FALLBACK_QUERY,
    /COALESCE\(mpd\.metadata -> 'session_load', fb\.session_load\)/
  );
  // Etiqueta de origen para poder contar el uso del fallback.
  assert.match(SCHEDULE_WITH_LOAD_FALLBACK_QUERY, /AS load_source/);
});

test("countDateFallbacks: cuenta solo las filas recuperadas por fecha", () => {
  const rows = [
    { load_source: "day_id" },
    { load_source: "date_fallback" },
    { load_source: null },
    { load_source: "date_fallback" },
    {}
  ];
  assert.equal(countDateFallbacks(rows), 2);
  assert.equal(countDateFallbacks([]), 0);
  assert.equal(countDateFallbacks(null), 0);
  // Todo enlazado por day_id → cero usos de fallback (señal para retirarlo).
  assert.equal(countDateFallbacks([{ load_source: "day_id" }, { load_source: "day_id" }]), 0);
});

// ── §8: migración de backfill nueva, idempotente y no destructiva ─────────────────
test("migración backfill mes.day_id: idempotente y no destructiva", () => {
  assert.match(migrationSrc, /^BEGIN;/m);
  assert.match(migrationSrc, /^COMMIT;/m);
  // Solo enlaza filas hoy NULL (idempotente).
  assert.match(migrationSrc, /WHERE mes\.day_id IS NULL/);
  // Enlace unívoco por (plan, usuario, fecha) + salvaguarda de abreviatura de día.
  assert.match(migrationSrc, /ws\.scheduled_date = mes\.session_date::date/);
  assert.match(migrationSrc, /ws\.day_abbrev = mes\.day_name/);
  // No destructiva: sin DROP/DELETE/TRUNCATE.
  assert.doesNotMatch(migrationSrc, /\b(DROP|DELETE|TRUNCATE)\b/i);
});
