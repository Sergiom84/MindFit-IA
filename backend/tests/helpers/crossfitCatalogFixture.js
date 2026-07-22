import fs from "node:fs";

import { validateCanonicalCatalog } from "../../services/crossfit/catalog/catalogValidator.js";
import { parseCsv } from "../../services/crossfit/catalog/csv.js";

const dataUrl = (name) => new URL(`../../../docs/crossfit/data/${name}`, import.meta.url);

export function loadCrossfitCatalogFixture() {
  const rows = (name) => parseCsv(fs.readFileSync(dataUrl(name), "utf8"));
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
  const result = validateCanonicalCatalog(canonicalRows, references, { legacyInstructions: instructions });
  if (!result.valid) throw new Error(result.errors.join("\n"));
  return result.movements;
}

export function allCrossfitEquipment(catalog) {
  const values = catalog.flatMap((movement) => movement.equipment).flatMap((raw) => {
    const value = String(raw);
    if (value.includes("_or_")) return value.split("_or_");
    if (value.includes("_and_")) return value.split("_and_");
    if (value.startsWith("none_or_")) return [value.slice("none_or_".length)];
    return [value];
  }).filter((value) => value && value !== "none" && !value.endsWith("_optional"));
  return [...new Set(values)].sort();
}

export function allCrossfitSkillPermissions(catalog) {
  return Object.fromEntries(
    [...new Set(catalog.flatMap((movement) => movement.skill_prerequisites))].map((key) => [key, true])
  );
}
