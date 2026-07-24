import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import pg from "pg";

import { parseCsv } from "../services/crossfit/catalog/csv.js";
import {
  CROSSFIT_CATALOG_VERSION,
  validateCanonicalCatalog,
  validateLegacyMappings,
} from "../services/crossfit/catalog/catalogValidator.js";
import {
  assertCrossfitCatalogImportTarget,
  resolveCrossfitCatalogWriteAction,
} from "../services/crossfit/catalog/catalogImportGuard.js";
import { CROSSFIT_VERSIONS } from "../services/crossfit/versions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const dataDir = path.join(repoRoot, "docs/crossfit/data");
const apply = process.argv.includes("--apply");
const applyProductionDraft = process.argv.includes("--apply-production-draft");
if (apply && applyProductionDraft) {
  throw new Error("Importación abortada: elige un único modo de escritura");
}
const writeMode = apply
  ? "local_ephemeral"
  : applyProductionDraft
    ? "production_draft"
    : null;

const canonicalRows = parseCsv(
  fs.readFileSync(
    path.join(dataDir, "catalogo_canonico_propuesto.csv"),
    "utf8",
  ),
);
const auditRows = parseCsv(
  fs.readFileSync(
    path.join(dataDir, "catalogo_crossfit_auditoria_120.csv"),
    "utf8",
  ),
);
const snapshotRows = parseCsv(
  fs.readFileSync(
    path.join(dataDir, "catalogo_crossfit_snapshot_120.csv"),
    "utf8",
  ),
);
const referenceSets = JSON.parse(
  fs.readFileSync(path.join(dataDir, "catalogo_reference_sets.json"), "utf8"),
);
const snapshotBySource = new Map(
  snapshotRows.map((row) => [Number(row.source_id), row]),
);
const legacyInstructions = new Map();
for (const row of auditRows) {
  const instruction = snapshotBySource.get(Number(row.source_id))?.como_hacerlo;
  if (instruction && !legacyInstructions.has(row.canonical_id))
    legacyInstructions.set(row.canonical_id, instruction);
}
const catalog = validateCanonicalCatalog(canonicalRows, referenceSets, {
  legacyInstructions,
});
const mappings = validateLegacyMappings(
  auditRows,
  new Set(canonicalRows.map((row) => row.canonical_id)),
);

if (!catalog.valid || !mappings.valid) {
  console.error(
    JSON.stringify(
      { catalog_errors: catalog.errors, mapping_errors: mappings.errors },
      null,
      2,
    ),
  );
  process.exit(1);
}

const summary = {
  mode: writeMode ?? "dry-run",
  catalog_version: CROSSFIT_CATALOG_VERSION,
  content_hash: catalog.content_hash,
  canonical_rows: catalog.movements.length,
  inherited_variants: catalog.variants.length,
  resolved_edges: catalog.edges.length,
  legacy_mappings: auditRows.length,
  media_verified: 0,
  activation: "not_performed",
};

if (!writeMode) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

if (writeMode === "local_ephemeral") {
  dotenv.config({ path: path.join(repoRoot, "backend/.env"), quiet: true });
}
const connectionString = writeMode === "production_draft"
  ? process.env.CROSSFIT_CATALOG_DATABASE_URL
  : process.env.CROSSFIT_CATALOG_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString)
  throw new Error("CROSSFIT_CATALOG_DATABASE_URL no está definida");
const importTarget = assertCrossfitCatalogImportTarget({
  mode: writeMode,
  env: process.env,
  connectionString,
  contentHash: catalog.content_hash,
});

const client = new pg.Client({ connectionString });
await client.connect();
let transactionOpen = false;
try {
  await client.query("BEGIN");
  transactionOpen = true;
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext('crossfit_catalog:' || $1))",
    [CROSSFIT_CATALOG_VERSION],
  );
  const existing = await client.query(
    `SELECT status, content_hash
       FROM app.crossfit_catalog_versions
      WHERE catalog_version = $1
      FOR UPDATE`,
    [CROSSFIT_CATALOG_VERSION],
  );
  const writeAction = resolveCrossfitCatalogWriteAction(
    existing.rows[0] ?? null,
    catalog.content_hash,
  );
  if (writeAction === "verify_active") {
    const verified = await client.query(
      `SELECT
         (SELECT count(*)::int FROM app.crossfit_movements WHERE catalog_version = $1) AS movements,
         (SELECT count(*)::int FROM app.crossfit_movement_variants WHERE catalog_version = $1) AS variants,
         (SELECT count(*)::int FROM app.crossfit_movement_edges WHERE catalog_version = $1) AS edges,
         (SELECT count(*)::int FROM app.crossfit_legacy_movement_map WHERE catalog_version = $1) AS mappings`,
      [CROSSFIT_CATALOG_VERSION],
    );
    const counts = verified.rows[0];
    const expected = {
      movements: catalog.movements.length,
      variants: catalog.variants.length,
      edges: catalog.edges.length,
      mappings: auditRows.length,
    };
    if (Object.keys(expected).some((key) => counts[key] !== expected[key])) {
      throw new Error(
        `El catálogo activo está incompleto: ${JSON.stringify({ counts, expected })}`,
      );
    }
    await client.query("COMMIT");
    transactionOpen = false;
    console.log(
      JSON.stringify(
        {
          ...summary,
          activation: "already_active_verified",
          applied_to: `${importTarget.appliedTo}_noop`,
        },
        null,
        2,
      ),
    );
  } else {
    await client.query(
      `INSERT INTO app.crossfit_catalog_versions
       (catalog_version, ruleset_version, status, content_hash, source)
     VALUES ($1, $2, 'draft', $3, 'docs/crossfit/data@crossfit-product-spec/2.0.0')
     ON CONFLICT (catalog_version) DO UPDATE
       SET content_hash = EXCLUDED.content_hash,
           ruleset_version = EXCLUDED.ruleset_version
     WHERE app.crossfit_catalog_versions.status = 'draft'`,
      [
        CROSSFIT_CATALOG_VERSION,
        CROSSFIT_VERSIONS.ruleset,
        catalog.content_hash,
      ],
    );

    for (const movement of catalog.movements) {
      await client.query(
        `INSERT INTO app.crossfit_movements (
         catalog_version, canonical_id, name, aliases, entity_type, domain, category,
         pattern, equipment, min_level, skill_prerequisites, stimulus, time_domains,
         scaling_rule, instruction_text, cues, common_errors, contraindication_keys,
         regressions, progressions, substitutions, pairing_tags, avoid_pairing,
         supports_strength_block, benchmark_relation, active, content_hash
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
         $21,$22,$23,$24,$25,$26,$27
       )
       ON CONFLICT (catalog_version, canonical_id) DO UPDATE SET
         name=EXCLUDED.name, aliases=EXCLUDED.aliases, entity_type=EXCLUDED.entity_type,
         domain=EXCLUDED.domain, category=EXCLUDED.category, pattern=EXCLUDED.pattern,
         equipment=EXCLUDED.equipment, min_level=EXCLUDED.min_level,
         skill_prerequisites=EXCLUDED.skill_prerequisites, stimulus=EXCLUDED.stimulus,
         time_domains=EXCLUDED.time_domains, scaling_rule=EXCLUDED.scaling_rule,
         instruction_text=EXCLUDED.instruction_text, cues=EXCLUDED.cues,
         common_errors=EXCLUDED.common_errors, contraindication_keys=EXCLUDED.contraindication_keys,
         regressions=EXCLUDED.regressions, progressions=EXCLUDED.progressions,
         substitutions=EXCLUDED.substitutions, pairing_tags=EXCLUDED.pairing_tags,
         avoid_pairing=EXCLUDED.avoid_pairing,
         supports_strength_block=EXCLUDED.supports_strength_block,
         benchmark_relation=EXCLUDED.benchmark_relation, active=EXCLUDED.active,
         content_hash=EXCLUDED.content_hash`,
        [
          movement.catalog_version,
          movement.canonical_id,
          movement.name,
          movement.aliases,
          movement.entity_type,
          movement.domain,
          movement.category,
          movement.pattern,
          movement.equipment,
          movement.min_level,
          movement.skill_prerequisites,
          movement.stimulus,
          movement.time_domains,
          movement.scaling_rule,
          movement.instruction_text,
          movement.cues,
          movement.common_errors,
          movement.contraindication_keys,
          movement.regressions,
          movement.progressions,
          movement.substitutions,
          movement.pairing_tags,
          movement.avoid_pairing,
          movement.supports_strength_block,
          movement.benchmark_relation,
          movement.active,
          movement.content_hash,
        ],
      );
    }

    for (const variant of catalog.variants) {
      await client.query(
        `INSERT INTO app.crossfit_movement_variants (
         catalog_version, variant_id, canonical_id, variant_type, prescription,
         prerequisites, active, content_hash
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (catalog_version, canonical_id, variant_id, variant_type) DO UPDATE SET
         prescription=EXCLUDED.prescription, prerequisites=EXCLUDED.prerequisites,
         active=EXCLUDED.active, content_hash=EXCLUDED.content_hash`,
        [
          variant.catalog_version,
          variant.variant_id,
          variant.canonical_id,
          variant.variant_type,
          variant.prescription,
          variant.prerequisites,
          variant.active,
          variant.content_hash,
        ],
      );
    }

    for (const edge of catalog.edges) {
      await client.query(
        `INSERT INTO app.crossfit_movement_edges (
         catalog_version, source_id, target_id, target_kind, relation_type,
         priority, conditions
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (catalog_version, source_id, target_id, relation_type) DO UPDATE SET
         target_kind=EXCLUDED.target_kind, priority=EXCLUDED.priority,
         conditions=EXCLUDED.conditions`,
        [
          edge.catalog_version,
          edge.source_id,
          edge.target_id,
          edge.target_kind,
          edge.relation_type,
          edge.priority,
          edge.conditions,
        ],
      );
    }

    for (const row of auditRows) {
      await client.query(
        `INSERT INTO app.crossfit_legacy_movement_map
         (source_table, source_id, catalog_version, canonical_id, mapping_action)
       VALUES ('Ejercicios_CrossFit', $1, $2, $3, $4)
       ON CONFLICT (source_table, source_id, catalog_version) DO UPDATE SET
         canonical_id=EXCLUDED.canonical_id, mapping_action=EXCLUDED.mapping_action`,
        [
          Number(row.source_id),
          CROSSFIT_CATALOG_VERSION,
          row.canonical_id,
          row.accion_propuesta,
        ],
      );
    }
    await client.query("COMMIT");
    transactionOpen = false;
    console.log(
      JSON.stringify(
        { ...summary, applied_to: importTarget.appliedTo },
        null,
        2,
      ),
    );
  }
} catch (error) {
  if (transactionOpen) await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
