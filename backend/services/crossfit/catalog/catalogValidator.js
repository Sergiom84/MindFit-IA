import crypto from "node:crypto";
import { splitCatalogList } from "./csv.js";

export const CROSSFIT_CATALOG_VERSION = "crossfit-catalog/2.0.0";

const REQUIRED_FIELDS = [
  "canonical_id", "name", "aliases", "entity_type", "domain", "category", "pattern",
  "equipment", "min_level", "skill_prerequisites", "stimulus", "time_domains",
  "scaling_rule", "technique_set", "cues_set", "error_set", "contra_set", "regressions",
  "progressions", "substitutions", "pairing_tags", "avoid_pairing", "strength_block",
  "benchmark_relation", "media_status"
];
const ENTITY_TYPES = new Set(["movement", "variant", "drill", "progression", "composite"]);
const LEVELS = new Set(["beginner", "intermediate", "advanced", "elite_legacy"]);
const MEDIA_STATES = new Set(["missing", "media_missing", "existing_unverified", "verified_owned", "verified_licensed", "rejected", "new_media_required"]);
const STABLE_ID_PATTERN = /^[a-z0-9_]+$/;
const CUE_TO_INSTRUCTION_FAMILY = Object.freeze({
  SQUAT: "squat",
  HINGE: "hinge",
  PUSH: "horizontal_push",
  PRESS: "vertical_push",
  PULL: "vertical_pull",
  BRACE: "brace",
  LANDING: "landing",
  PACING: "cyclical",
  OLY: "olympic",
  HANDSTAND: "inversion",
  MUSCLE_UP: "vertical_pull"
});

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function catalogContentHash(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function resolveSet(referenceSets, section, keys, rowPath, errors) {
  const resolved = [];
  for (const key of keys) {
    const value = referenceSets?.[section]?.[key];
    if (!Array.isArray(value) || value.length < 2) {
      errors.push(`${rowPath}: ${section}.${key} no existe o tiene menos de 2 elementos`);
      continue;
    }
    resolved.push(...value);
  }
  return [...new Set(resolved)];
}

function instructionFor(row, referenceSets, legacyInstructions, errors) {
  const legacy = legacyInstructions?.get(row.canonical_id);
  if (typeof legacy === "string" && legacy.trim()) return legacy;
  const override = referenceSets?.movement_overrides?.[row.canonical_id]?.instruction;
  if (typeof override === "string" && override.trim()) return override;
  const family = referenceSets?.instruction_families?.[row.pattern]
    ?? referenceSets?.instruction_families?.[row.category]
    ?? referenceSets?.instruction_families?.[row.domain]
    ?? referenceSets?.instruction_families?.[CUE_TO_INSTRUCTION_FAMILY[splitCatalogList(row.cues_set)[0]]];
  if (typeof family === "string" && family.trim()) return family;
  errors.push(`${row.canonical_id}: no existe instrucción de familia para pattern/category/domain`);
  return "";
}

export function normalizeCanonicalMovement(row, referenceSets, errors = [], legacyInstructions = new Map()) {
  const path = row?.canonical_id || "row_without_id";
  const cues = resolveSet(referenceSets, "cue_sets", splitCatalogList(row.cues_set), path, errors);
  const commonErrors = resolveSet(referenceSets, "error_sets", splitCatalogList(row.error_set), path, errors);
  const contraindications = splitCatalogList(row.contra_set);
  for (const key of contraindications) {
    if (!Array.isArray(referenceSets?.contraindication_sets?.[key])) {
      errors.push(`${path}: contraindication_sets.${key} no existe`);
    }
  }
  const movement = {
    catalog_version: CROSSFIT_CATALOG_VERSION,
    canonical_id: row.canonical_id,
    name: row.name,
    aliases: splitCatalogList(row.aliases),
    entity_type: row.entity_type,
    domain: row.domain,
    category: row.category,
    pattern: row.pattern,
    equipment: splitCatalogList(row.equipment),
    min_level: row.min_level,
    skill_prerequisites: splitCatalogList(row.skill_prerequisites),
    stimulus: splitCatalogList(row.stimulus),
    time_domains: splitCatalogList(row.time_domains),
    scaling_rule: row.scaling_rule,
    technique_set: row.technique_set,
    instruction_text: instructionFor(row, referenceSets, legacyInstructions, errors),
    cues,
    common_errors: commonErrors,
    contraindication_keys: contraindications,
    regressions: splitCatalogList(row.regressions),
    progressions: splitCatalogList(row.progressions),
    substitutions: splitCatalogList(row.substitutions),
    pairing_tags: splitCatalogList(row.pairing_tags),
    avoid_pairing: splitCatalogList(row.avoid_pairing),
    supports_strength_block: row.strength_block === "yes",
    benchmark_relation: row.benchmark_relation === "none" ? null : row.benchmark_relation,
    media_status: ["new_media_required", "media_missing"].includes(row.media_status) ? "missing" : row.media_status,
    active: row.min_level !== "elite_legacy"
  };
  return { ...movement, content_hash: catalogContentHash(movement) };
}

export function validateCanonicalCatalog(rows, referenceSets, { expectedCount = 92, legacyInstructions = new Map() } = {}) {
  const errors = [];
  if (!Array.isArray(rows)) return { valid: false, errors: ["catalog rows debe ser array"], movements: [] };
  if (rows.length !== expectedCount) errors.push(`catálogo debe contener ${expectedCount} filas; contiene ${rows.length}`);
  const ids = new Set();
  for (const [index, row] of rows.entries()) {
    const path = `row ${index + 1}`;
    for (const field of REQUIRED_FIELDS) {
      if (!Object.hasOwn(row, field) || row[field] === "") errors.push(`${path}: ${field} requerido`);
    }
    if (!STABLE_ID_PATTERN.test(row.canonical_id ?? "")) errors.push(`${path}: canonical_id no ASCII estable`);
    if (ids.has(row.canonical_id)) errors.push(`${path}: canonical_id duplicado ${row.canonical_id}`);
    ids.add(row.canonical_id);
    if (!ENTITY_TYPES.has(row.entity_type)) errors.push(`${path}: entity_type inválido`);
    if (!LEVELS.has(row.min_level)) errors.push(`${path}: min_level inválido`);
    if (!MEDIA_STATES.has(row.media_status)) errors.push(`${path}: media_status inválido`);
    if (/https?:\/\//i.test(row.media_status)) errors.push(`${path}: URL no permitida en media_status`);
  }
  const movements = rows.map((row) => normalizeCanonicalMovement(row, referenceSets, errors, legacyInstructions));
  for (const movement of movements) {
    if (movement.cues.length < 2) errors.push(`${movement.canonical_id}: requiere al menos 2 cues`);
    if (movement.common_errors.length < 2) errors.push(`${movement.canonical_id}: requiere al menos 2 errores`);
    if (movement.contraindication_keys.length === 0) errors.push(`${movement.canonical_id}: requiere safety key`);
    if (!movement.instruction_text) errors.push(`${movement.canonical_id}: instrucción vacía`);
  }
  const canonicalIds = new Set(movements.map((movement) => movement.canonical_id));
  const variants = [];
  const edges = [];
  const relationFields = {
    regressions: "regression",
    progressions: "progression",
    substitutions: "substitution"
  };
  for (const movement of movements) {
    for (const [field, relationType] of Object.entries(relationFields)) {
      for (const targetId of movement[field]) {
        if (targetId === movement.canonical_id) continue;
        if (!STABLE_ID_PATTERN.test(targetId)) {
          errors.push(`${movement.canonical_id}: ${field} contiene ID no ASCII estable ${targetId}`);
          continue;
        }
        const targetKind = canonicalIds.has(targetId) ? "movement" : "variant";
        if (targetKind === "variant") {
          const variant = {
            catalog_version: CROSSFIT_CATALOG_VERSION,
            canonical_id: movement.canonical_id,
            variant_id: targetId,
            variant_type: relationType,
            prescription: {
              inherit_metadata_from: movement.canonical_id,
              reference_only: true,
              human_review_required: true
            },
            prerequisites: relationType === "progression" ? movement.skill_prerequisites : [],
            active: true
          };
          variants.push({ ...variant, content_hash: catalogContentHash(variant) });
        }
        edges.push({
          catalog_version: CROSSFIT_CATALOG_VERSION,
          source_id: movement.canonical_id,
          target_id: targetId,
          target_kind: targetKind,
          relation_type: relationType,
          priority: 100,
          conditions: { stimulus_preservation_required: relationType === "substitution" }
        });
      }
    }
  }
  const variantKeys = new Set();
  const uniqueVariants = variants.filter((variant) => {
    const key = `${variant.canonical_id}|${variant.variant_id}|${variant.variant_type}`;
    if (variantKeys.has(key)) return false;
    variantKeys.add(key);
    return true;
  });
  const edgeKeys = new Set();
  const uniqueEdges = edges.filter((edge) => {
    const key = `${edge.source_id}|${edge.target_id}|${edge.relation_type}`;
    if (edgeKeys.has(key)) return false;
    edgeKeys.add(key);
    return true;
  });
  return {
    valid: errors.length === 0,
    errors,
    movements,
    variants: uniqueVariants,
    edges: uniqueEdges,
    content_hash: catalogContentHash({
      movements: movements.map(({ content_hash: _hash, ...movement }) => movement),
      variants: uniqueVariants.map(({ content_hash: _hash, ...variant }) => variant),
      edges: uniqueEdges
    })
  };
}

export function validateLegacyMappings(auditRows, canonicalIds, { expectedCount = 120 } = {}) {
  const errors = [];
  if (!Array.isArray(auditRows) || auditRows.length !== expectedCount) {
    errors.push(`mapeo legacy debe contener ${expectedCount} filas`);
  }
  const sourceIds = new Set();
  for (const row of auditRows ?? []) {
    const sourceId = Number(row.source_id);
    if (!Number.isInteger(sourceId)) errors.push(`source_id inválido: ${row.source_id}`);
    if (sourceIds.has(sourceId)) errors.push(`source_id duplicado: ${sourceId}`);
    sourceIds.add(sourceId);
    if (!canonicalIds.has(row.canonical_id)) errors.push(`canonical_id huérfano: ${row.canonical_id}`);
  }
  return { valid: errors.length === 0, errors };
}
