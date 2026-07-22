import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test from "node:test";

import {
  CROSSFIT_CATALOG_VERSION,
  validateCanonicalCatalog,
  validateLegacyMappings
} from "../services/crossfit/catalog/catalogValidator.js";
import {
  ACTIVE_CROSSFIT_CATALOG_QUERY,
  CrossfitCatalogRepository,
  LEGACY_CROSSFIT_CATALOG_QUERY,
  adaptLegacyCrossfitMovement
} from "../services/crossfit/catalog/catalogRepository.js";
import { parseCsv } from "../services/crossfit/catalog/csv.js";
import { evaluateCrossfitSafety } from "../services/crossfit/safety/safetyEvaluator.js";

const dataUrl = (name) => new URL(`../../docs/crossfit/data/${name}`, import.meta.url);
const rows = (name) => parseCsv(fs.readFileSync(dataUrl(name), "utf8"));

function loadCatalog() {
  const canonicalRows = rows("catalogo_canonico_propuesto.csv");
  const auditRows = rows("catalogo_crossfit_auditoria_120.csv");
  const snapshotRows = rows("catalogo_crossfit_snapshot_120.csv");
  const references = JSON.parse(fs.readFileSync(dataUrl("catalogo_reference_sets.json"), "utf8"));
  const snapshotBySource = new Map(snapshotRows.map((row) => [Number(row.source_id), row]));
  const instructions = new Map();
  for (const row of auditRows) {
    const instruction = snapshotBySource.get(Number(row.source_id))?.como_hacerlo;
    if (instruction && !instructions.has(row.canonical_id)) instructions.set(row.canonical_id, instruction);
  }
  return {
    canonicalRows,
    auditRows,
    catalog: validateCanonicalCatalog(canonicalRows, references, { legacyInstructions: instructions })
  };
}

test("CrossFit catálogo: 92 canónicos y 120 mappings pasan validación estricta", () => {
  const { canonicalRows, auditRows, catalog } = loadCatalog();
  assert.equal(catalog.valid, true, catalog.errors.join("\n"));
  assert.equal(catalog.movements.length, 92);
  assert.match(catalog.content_hash, /^[a-f0-9]{64}$/);
  assert.ok(catalog.variants.length > 0);
  assert.ok(catalog.edges.length > 0);
  const mapping = validateLegacyMappings(auditRows, new Set(canonicalRows.map((row) => row.canonical_id)));
  assert.equal(mapping.valid, true, mapping.errors.join("\n"));
  assert.equal(auditRows.length, 120);
});

test("CrossFit catálogo: toda relación resuelve a movimiento o variante heredada", () => {
  const { catalog } = loadCatalog();
  const movementIds = new Set(catalog.movements.map((movement) => movement.canonical_id));
  const variantKeys = new Set(catalog.variants.map((variant) =>
    `${variant.canonical_id}|${variant.variant_id}|${variant.variant_type}`));
  for (const edge of catalog.edges) {
    if (edge.target_kind === "movement") assert.equal(movementIds.has(edge.target_id), true);
    else assert.equal(variantKeys.has(`${edge.source_id}|${edge.target_id}|${edge.relation_type}`), true);
  }
});

test("CrossFit catálogo: Elite queda mapeado por historia pero no se activa como core", () => {
  const { auditRows, catalog } = loadCatalog();
  const eliteRows = auditRows.filter((row) => row.nivel_actual === "Elite");
  assert.equal(eliteRows.length, 19);
  assert.ok(eliteRows.every((row) => row.accion_propuesta === "EXCLUDE_ELITE_CORE"));
  const coreIds = new Set(catalog.movements.filter((movement) => movement.active).map((movement) => movement.canonical_id));
  assert.ok(eliteRows.every((row) => coreIds.has(row.canonical_id)));
  assert.equal(catalog.movements.some((movement) => movement.min_level === "elite_legacy" && movement.active), false);
});

test("CrossFit catálogo: media no verificada nunca expone URL como verificada", () => {
  const legacy = adaptLegacyCrossfitMovement({
    exercise_id: 1,
    nombre: "Remo",
    nivel: "Principiante",
    dominio: "Gymnastic",
    gif_url: "https://example.invalid/unverified.gif"
  }, "ring_row");
  assert.deepEqual(legacy.media, [{ status: "existing_unverified", url: null }]);
  const { catalog } = loadCatalog();
  assert.equal(catalog.movements.some((movement) => movement.media_status?.startsWith("verified_")), false);
});

test("CrossFit catálogo: repositorio alterna v2/legacy sin RANDOM ni fallback cruzado", async () => {
  const calls = [];
  const pool = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql === ACTIVE_CROSSFIT_CATALOG_QUERY) {
        return { rows: [{ catalog_version: CROSSFIT_CATALOG_VERSION }] };
      }
      if (sql === LEGACY_CROSSFIT_CATALOG_QUERY) {
        return { rows: [{ exercise_id: 1, nombre: "Remo", nivel: "Principiante", dominio: "Gymnastic" }] };
      }
      return { rows: [{ canonical_id: "ring_row", catalog_version: CROSSFIT_CATALOG_VERSION }] };
    }
  };
  const repository = new CrossfitCatalogRepository(pool);
  const legacy = await repository.listForGeneration({ useV2: false, canonicalIdBySource: new Map([[1, "ring_row"]]) });
  const canonical = await repository.listForGeneration({ useV2: true });
  assert.equal(legacy[0].provenance.source, "legacy_adapter");
  assert.equal(canonical[0].canonical_id, "ring_row");
  assert.equal(calls.some((call) => /ORDER BY RANDOM/i.test(call.sql)), false);
});

test("CrossFit migración: aditiva, idempotente, RLS y catálogo activo inmutable", () => {
  const sql = fs.readFileSync(new URL("../migrations/20260722_crossfit_v2_catalog.sql", import.meta.url), "utf8");
  assert.match(sql, /^--[\s\S]*\bBEGIN;/);
  assert.match(sql, /COMMIT;\s*$/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS app\.crossfit_catalog_versions/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS app\.crossfit_movements/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS app\.crossfit_movement_variants/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS app\.crossfit_benchmark_workouts/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(sql, /crossfit_reject_active_catalog_mutation/);
  assert.match(sql, /crossfit_validate_movement_edge_target/);
  assert.doesNotMatch(sql, /(?:UPDATE|DELETE FROM|TRUNCATE)\s+app\."Ejercicios_CrossFit"/i);
  assert.doesNotMatch(sql, /(?:UPDATE|DELETE FROM|TRUNCATE)\s+app\.methodology_exercise_sessions/i);
  assert.doesNotMatch(sql, /20260721_backfill_mes_day_id/);
});

test("CrossFit importador: dry-run valida y --apply rechaza host de producción", () => {
  const dry = spawnSync(process.execPath, ["scripts/import-crossfit-v2-catalog.mjs"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8"
  });
  assert.equal(dry.status, 0, dry.stderr);
  const summary = JSON.parse(dry.stdout);
  assert.equal(summary.canonical_rows, 92);
  assert.equal(summary.legacy_mappings, 120);
  assert.equal(summary.activation, "not_performed");

  const blocked = spawnSync(process.execPath, ["scripts/import-crossfit-v2-catalog.mjs", "--apply"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "test",
      CROSSFIT_CATALOG_APPLY_ACK: "EPHEMERAL_ONLY",
      CROSSFIT_CATALOG_DATABASE_URL: "postgresql://u:p@db.sbqcnlwpvjavmljzkmfy.supabase.co:5432/postgres"
    }
  });
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /Importación abortada/);
});

test("CrossFit safety: red flag y dolor severo bloquean antes de rendimiento", () => {
  const result = evaluateCrossfitSafety({
    profile: {},
    checkIn: { red_flags: ["dolor torácico"], pain: { score: 6, quality: "punzante" } }
  });
  assert.equal(result.blocked, true);
  assert.ok(result.reason_codes.includes("SAFETY_RED_FLAG"));
  assert.ok(result.reason_codes.includes("SAFETY_PAIN_BLOCK"));
});

test("CrossFit safety: dolor moderado contraindica patrón y propone sustitución segura", () => {
  const result = evaluateCrossfitSafety({
    profile: { available_equipment: ["dumbbell"] },
    movement: {
      canonical_id: "dumbbell_strict_press",
      equipment: ["dumbbell_or_kettlebell"],
      contraindication_keys: ["SHOULDER_WRIST"],
      substitutions: ["landmine_press", "push_up"]
    },
    checkIn: { pain: { score: 3, locations: ["hombro"] } }
  });
  assert.equal(result.blocked, false);
  assert.equal(result.movement_allowed, false);
  assert.equal(result.substitution_required, true);
  assert.deepEqual(result.safe_substitution_candidates, ["landmine_press", "push_up"]);
  assert.ok(result.reason_codes.includes("SAFETY_CONTRAINDICATED"));
});

test("CrossFit safety: molestia 1-2 monitoriza sin bloquear ni sustituir", () => {
  const result = evaluateCrossfitSafety({ checkIn: { pain: { score: 2, locations: [] } } });
  assert.equal(result.decision, "allow");
  assert.equal(result.blocked, false);
  assert.ok(result.reason_codes.includes("SAFETY_DISCOMFORT_MONITOR"));
});

test("CrossFit safety: embarazo sin contrato y cardiovascular no aclarado bloquean", () => {
  const pregnancy = evaluateCrossfitSafety({ profile: { pregnancy_status: "pregnant" } });
  assert.equal(pregnancy.blocked, true);
  assert.ok(pregnancy.reason_codes.includes("SAFETY_CLEARANCE_REQUIRED"));

  const cardiovascular = evaluateCrossfitSafety({
    profile: { known_conditions: ["hipertensión"], safety_screening: { clearance_status: "unknown" } }
  });
  assert.equal(cardiovascular.blocked, true);
});

test("CrossFit safety: obesidad y retorno modifican, no bloquean automáticamente", () => {
  const result = evaluateCrossfitSafety({
    profile: { obesity_declared: true, pause_days: 60 },
    now: new Date("2026-07-22T00:00:00Z")
  });
  assert.equal(result.blocked, false);
  assert.equal(result.decision, "modify");
  assert.ok(result.reason_codes.includes("RETURN_PROTOCOL_REQUIRED"));
  const returnFinding = result.findings.find((finding) => finding.rule_id === "SAFE-RETURN");
  assert.equal(returnFinding.details.volume_reduction, 0.5);
});

test("CrossFit safety: equipo ausente rechaza movimiento, no toda la sesión", () => {
  const result = evaluateCrossfitSafety({
    profile: { available_equipment: ["rower"] },
    movement: { canonical_id: "front_squat", equipment: ["barbell"], contraindication_keys: [], substitutions: ["goblet_squat"] }
  });
  assert.equal(result.blocked, false);
  assert.equal(result.movement_allowed, false);
  assert.ok(result.reason_codes.includes("EQUIPMENT_UNAVAILABLE"));
});
