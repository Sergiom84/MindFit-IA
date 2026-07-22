import { CROSSFIT_CATALOG_VERSION } from "./catalogValidator.js";

export const ACTIVE_CROSSFIT_CATALOG_QUERY = `
SELECT catalog_version, ruleset_version, content_hash
FROM app.crossfit_catalog_versions
WHERE status = 'active'
ORDER BY activated_at DESC
LIMIT 1`;

export const CROSSFIT_MOVEMENTS_QUERY = `
SELECT m.*,
       COALESCE(
         jsonb_agg(DISTINCT jsonb_build_object(
           'media_id', media.media_id,
           'media_type', media.media_type,
           'status', media.status,
           'url', CASE WHEN media.status IN ('verified_owned','verified_licensed') THEN media.url ELSE NULL END
         )) FILTER (WHERE media.media_id IS NOT NULL),
         '[]'::jsonb
       ) AS media
FROM app.crossfit_movements m
LEFT JOIN app.crossfit_movement_media media
  ON media.catalog_version = m.catalog_version
 AND media.canonical_id = m.canonical_id
WHERE m.catalog_version = $1
  AND m.active = TRUE
  AND m.deleted_at IS NULL
GROUP BY m.catalog_version, m.canonical_id
ORDER BY m.canonical_id`;

export const LEGACY_CROSSFIT_CATALOG_QUERY = `
SELECT exercise_id, nombre, nivel, dominio, categoria, equipamiento,
       tipo_wod, intensidad, duracion_seg, descanso_seg, escalamiento,
       notas, "Cómo_hacerlo" AS como_hacerlo, "Consejos" AS consejos,
       "Errores_comunes" AS errores_comunes, wod_types, time_domain,
       pairing_tags, avoid_pairing_with, supports_strength_block, gif_url
FROM app."Ejercicios_CrossFit"
WHERE nivel <> 'Elite'
ORDER BY exercise_id`;

export function adaptLegacyCrossfitMovement(row, canonicalId = null) {
  return {
    catalog_version: "crossfit-catalog/legacy-read",
    canonical_id: canonicalId ?? `legacy_${row.exercise_id}`,
    legacy_source_id: row.exercise_id,
    name: row.nombre,
    aliases: [],
    entity_type: "movement",
    domain: String(row.dominio ?? "unknown").toLowerCase(),
    category: row.categoria ?? "unknown",
    pattern: "unknown",
    equipment: row.equipamiento ? [row.equipamiento] : [],
    min_level: String(row.nivel ?? "Principiante").toLowerCase(),
    skill_prerequisites: [],
    stimulus: [],
    time_domains: row.time_domain ? String(row.time_domain).split(";").filter(Boolean) : [],
    scaling_rule: row.escalamiento ?? "legacy_unstructured",
    instruction_text: row.como_hacerlo ?? "",
    cues: [],
    common_errors: [],
    contraindication_keys: [],
    regressions: [],
    progressions: [],
    substitutions: [],
    pairing_tags: row.pairing_tags ? String(row.pairing_tags).split(";").filter(Boolean) : [],
    avoid_pairing: row.avoid_pairing_with ? String(row.avoid_pairing_with).split(";").filter(Boolean) : [],
    supports_strength_block: row.supports_strength_block === 1,
    benchmark_relation: null,
    media: row.gif_url ? [{ status: "existing_unverified", url: null }] : [],
    active: true,
    provenance: { source: "legacy_adapter", confidence: "low" }
  };
}

export class CrossfitCatalogRepository {
  constructor(pool) {
    if (!pool || typeof pool.query !== "function") throw new Error("CrossfitCatalogRepository requiere pool.query");
    this.pool = pool;
  }

  async getActiveVersion() {
    const { rows } = await this.pool.query(ACTIVE_CROSSFIT_CATALOG_QUERY);
    return rows[0] ?? null;
  }

  async listCanonicalMovements({ catalogVersion = null } = {}) {
    const active = catalogVersion ? { catalog_version: catalogVersion } : await this.getActiveVersion();
    if (!active) return [];
    const { rows } = await this.pool.query(CROSSFIT_MOVEMENTS_QUERY, [active.catalog_version]);
    return rows;
  }

  async listLegacyMovements({ canonicalIdBySource = new Map() } = {}) {
    const { rows } = await this.pool.query(LEGACY_CROSSFIT_CATALOG_QUERY);
    return rows.map((row) => adaptLegacyCrossfitMovement(row, canonicalIdBySource.get(Number(row.exercise_id))));
  }

  async listForGeneration({ useV2 = false, catalogVersion = CROSSFIT_CATALOG_VERSION, canonicalIdBySource } = {}) {
    if (useV2) return this.listCanonicalMovements({ catalogVersion });
    return this.listLegacyMovements({ canonicalIdBySource });
  }
}
