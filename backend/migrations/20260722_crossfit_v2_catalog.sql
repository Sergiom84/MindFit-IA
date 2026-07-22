-- CrossFit profesional v2: catálogo canónico aditivo y versionado.
-- PREPARADA, NO APLICADA. No modifica ni borra app."Ejercicios_CrossFit",
-- app.ejercicios, Elite, calendarios ni sesiones históricas.

BEGIN;

CREATE TABLE IF NOT EXISTS app.crossfit_catalog_versions (
  catalog_version text PRIMARY KEY,
  ruleset_version text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'retired', 'rejected')),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  source text NOT NULL,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'active' AND activated_at IS NOT NULL) OR status <> 'active')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crossfit_catalog_one_active
  ON app.crossfit_catalog_versions ((status))
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS app.crossfit_movements (
  catalog_version text NOT NULL REFERENCES app.crossfit_catalog_versions(catalog_version) ON DELETE RESTRICT,
  canonical_id text NOT NULL CHECK (canonical_id ~ '^[a-z0-9_]+$'),
  name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  entity_type text NOT NULL CHECK (entity_type IN ('movement', 'variant', 'drill', 'progression', 'composite')),
  domain text NOT NULL,
  category text NOT NULL,
  pattern text NOT NULL,
  equipment text[] NOT NULL DEFAULT '{}',
  min_level text NOT NULL CHECK (min_level IN ('beginner', 'intermediate', 'advanced', 'elite_legacy')),
  skill_prerequisites text[] NOT NULL DEFAULT '{}',
  stimulus text[] NOT NULL DEFAULT '{}',
  time_domains text[] NOT NULL DEFAULT '{}',
  scaling_rule text NOT NULL,
  instruction_text text NOT NULL,
  cues text[] NOT NULL DEFAULT '{}',
  common_errors text[] NOT NULL DEFAULT '{}',
  contraindication_keys text[] NOT NULL DEFAULT '{}',
  regressions text[] NOT NULL DEFAULT '{}',
  progressions text[] NOT NULL DEFAULT '{}',
  substitutions text[] NOT NULL DEFAULT '{}',
  pairing_tags text[] NOT NULL DEFAULT '{}',
  avoid_pairing text[] NOT NULL DEFAULT '{}',
  supports_strength_block boolean NOT NULL DEFAULT false,
  benchmark_relation text,
  active boolean NOT NULL DEFAULT true,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (catalog_version, canonical_id),
  CHECK (NOT active OR deleted_at IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_crossfit_movements_catalog_level
  ON app.crossfit_movements (catalog_version, min_level, domain, pattern)
  WHERE active;

CREATE INDEX IF NOT EXISTS idx_crossfit_movements_aliases
  ON app.crossfit_movements USING gin (aliases);

CREATE TABLE IF NOT EXISTS app.crossfit_movement_variants (
  catalog_version text NOT NULL,
  variant_id text NOT NULL CHECK (variant_id ~ '^[a-z0-9_]+$'),
  canonical_id text NOT NULL,
  variant_type text NOT NULL CHECK (variant_type IN ('scale', 'progression', 'regression', 'substitution', 'drill', 'equipment', 'range')),
  prescription jsonb NOT NULL DEFAULT '{}',
  prerequisites text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (catalog_version, canonical_id, variant_id, variant_type),
  FOREIGN KEY (catalog_version, canonical_id)
    REFERENCES app.crossfit_movements(catalog_version, canonical_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS app.crossfit_movement_edges (
  catalog_version text NOT NULL,
  source_id text NOT NULL,
  target_id text NOT NULL,
  target_kind text NOT NULL CHECK (target_kind IN ('movement', 'variant')),
  relation_type text NOT NULL CHECK (relation_type IN ('progression', 'regression', 'substitution', 'avoid_pairing')),
  priority smallint NOT NULL DEFAULT 100 CHECK (priority >= 0),
  stimulus_delta numeric(5,4),
  conditions jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (catalog_version, source_id, target_id, relation_type),
  FOREIGN KEY (catalog_version, source_id)
    REFERENCES app.crossfit_movements(catalog_version, canonical_id) ON DELETE RESTRICT,
  CHECK (source_id <> target_id OR relation_type NOT IN ('substitution', 'avoid_pairing'))
);

CREATE OR REPLACE FUNCTION app.crossfit_validate_movement_edge_target()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
BEGIN
  IF NEW.target_kind = 'movement' AND NOT EXISTS (
    SELECT 1 FROM app.crossfit_movements
    WHERE catalog_version = NEW.catalog_version AND canonical_id = NEW.target_id
  ) THEN
    RAISE EXCEPTION 'dangling CrossFit movement edge target %', NEW.target_id
      USING ERRCODE = '23503';
  END IF;
  IF NEW.target_kind = 'variant' AND NOT EXISTS (
    SELECT 1 FROM app.crossfit_movement_variants
    WHERE catalog_version = NEW.catalog_version
      AND canonical_id = NEW.source_id
      AND variant_id = NEW.target_id
      AND variant_type = NEW.relation_type
  ) THEN
    RAISE EXCEPTION 'dangling CrossFit variant edge target %', NEW.target_id
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crossfit_movement_edges_validate_target ON app.crossfit_movement_edges;
CREATE TRIGGER trg_crossfit_movement_edges_validate_target
BEFORE INSERT OR UPDATE ON app.crossfit_movement_edges
FOR EACH ROW EXECUTE FUNCTION app.crossfit_validate_movement_edge_target();

CREATE TABLE IF NOT EXISTS app.crossfit_benchmark_workouts (
  catalog_version text NOT NULL REFERENCES app.crossfit_catalog_versions(catalog_version) ON DELETE RESTRICT,
  benchmark_id text NOT NULL CHECK (benchmark_id ~ '^[a-z0-9_]+$'),
  name text NOT NULL,
  definition jsonb NOT NULL,
  min_level text NOT NULL CHECK (min_level IN ('beginner', 'intermediate', 'advanced', 'elite_legacy')),
  repeat_window_days integer NOT NULL CHECK (repeat_window_days BETWEEN 56 AND 365),
  active boolean NOT NULL DEFAULT true,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (catalog_version, benchmark_id)
);

CREATE TABLE IF NOT EXISTS app.crossfit_movement_media (
  catalog_version text NOT NULL,
  canonical_id text NOT NULL,
  media_id text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('image', 'video', 'animation')),
  status text NOT NULL CHECK (status IN ('missing', 'existing_unverified', 'verified_owned', 'verified_licensed', 'rejected')),
  url text,
  checksum text,
  rights_owner text,
  license_reference text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (catalog_version, canonical_id, media_id),
  FOREIGN KEY (catalog_version, canonical_id)
    REFERENCES app.crossfit_movements(catalog_version, canonical_id) ON DELETE RESTRICT,
  CHECK (
    status NOT IN ('verified_owned', 'verified_licensed')
    OR (url IS NOT NULL AND checksum IS NOT NULL AND rights_owner IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS app.crossfit_legacy_movement_map (
  source_table text NOT NULL,
  source_id integer NOT NULL,
  catalog_version text NOT NULL,
  canonical_id text NOT NULL,
  mapping_action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_table, source_id, catalog_version),
  FOREIGN KEY (catalog_version, canonical_id)
    REFERENCES app.crossfit_movements(catalog_version, canonical_id) ON DELETE RESTRICT
);

-- Un catálogo activo es inmutable. Las correcciones crean otra versión.
CREATE OR REPLACE FUNCTION app.crossfit_reject_active_catalog_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
DECLARE
  v_catalog_version text;
BEGIN
  v_catalog_version := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.catalog_version
    ELSE NEW.catalog_version
  END;
  IF EXISTS (
    SELECT 1 FROM app.crossfit_catalog_versions
    WHERE catalog_version = v_catalog_version AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'active CrossFit catalog % is immutable', v_catalog_version
      USING ERRCODE = '55000';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_table text;
  v_trigger text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'crossfit_movements', 'crossfit_movement_variants', 'crossfit_movement_edges',
    'crossfit_benchmark_workouts', 'crossfit_movement_media', 'crossfit_legacy_movement_map'
  ] LOOP
    v_trigger := 'trg_' || v_table || '_immutable_active';
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON app.%I', v_trigger, v_table);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON app.%I '
      'FOR EACH ROW EXECUTE FUNCTION app.crossfit_reject_active_catalog_mutation()',
      v_trigger, v_table
    );
  END LOOP;
END;
$$;

ALTER TABLE app.crossfit_catalog_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.crossfit_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.crossfit_movement_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.crossfit_movement_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.crossfit_benchmark_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.crossfit_movement_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.crossfit_legacy_movement_map ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE app.crossfit_catalog_versions FROM PUBLIC;
REVOKE ALL ON TABLE app.crossfit_movements FROM PUBLIC;
REVOKE ALL ON TABLE app.crossfit_movement_variants FROM PUBLIC;
REVOKE ALL ON TABLE app.crossfit_movement_edges FROM PUBLIC;
REVOKE ALL ON TABLE app.crossfit_benchmark_workouts FROM PUBLIC;
REVOKE ALL ON TABLE app.crossfit_movement_media FROM PUBLIC;
REVOKE ALL ON TABLE app.crossfit_legacy_movement_map FROM PUBLIC;
REVOKE ALL ON FUNCTION app.crossfit_reject_active_catalog_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.crossfit_validate_movement_edge_target() FROM PUBLIC;

-- Políticas de lectura solo para versión activa; borradores quedan internos.
DO $$
DECLARE
  v_table text;
  v_policy text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA app TO authenticated;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'app' AND tablename = 'crossfit_catalog_versions'
        AND policyname = 'crossfit_catalog_versions_active_read'
    ) THEN
      CREATE POLICY crossfit_catalog_versions_active_read
        ON app.crossfit_catalog_versions FOR SELECT TO authenticated
        USING (status = 'active');
    END IF;

    FOREACH v_table IN ARRAY ARRAY[
      'crossfit_movements', 'crossfit_movement_variants', 'crossfit_movement_edges',
      'crossfit_benchmark_workouts', 'crossfit_movement_media'
    ] LOOP
      v_policy := v_table || '_active_read';
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'app' AND tablename = v_table AND policyname = v_policy
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON app.%I FOR SELECT TO authenticated USING '
          '(EXISTS (SELECT 1 FROM app.crossfit_catalog_versions v '
          'WHERE v.catalog_version = %I.catalog_version AND v.status = ''active''))',
          v_policy, v_table, v_table
        );
      END IF;
    END LOOP;

    GRANT SELECT ON app.crossfit_catalog_versions, app.crossfit_movements,
      app.crossfit_movement_variants, app.crossfit_movement_edges,
      app.crossfit_benchmark_workouts, app.crossfit_movement_media TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA app TO service_role;
    GRANT ALL ON app.crossfit_catalog_versions, app.crossfit_movements,
      app.crossfit_movement_variants, app.crossfit_movement_edges,
      app.crossfit_benchmark_workouts, app.crossfit_movement_media,
      app.crossfit_legacy_movement_map TO service_role;
    GRANT EXECUTE ON FUNCTION app.crossfit_reject_active_catalog_mutation() TO service_role;
    GRANT EXECUTE ON FUNCTION app.crossfit_validate_movement_edge_target() TO service_role;
  END IF;
END;
$$;

COMMIT;
