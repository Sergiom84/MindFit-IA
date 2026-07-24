-- CrossFit profesional v2: resultados append-only y snapshot de autorregulación.
-- PREPARADA, NO APLICADA. No modifica app.crossfit_autoreg_state, sesiones
-- históricas, calendarios ni datos de otras metodologías.

BEGIN;

CREATE TABLE IF NOT EXISTS app.crossfit_v2_results (
  result_id text PRIMARY KEY CHECK (result_id ~ '^cfr_[a-f0-9]{24}$'),
  user_id integer NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  methodology_plan_id integer NOT NULL REFERENCES app.methodology_plans(id) ON DELETE CASCADE,
  session_id integer NOT NULL REFERENCES app.methodology_exercise_sessions(id) ON DELETE CASCADE,
  day_id integer NOT NULL,
  schema_version text NOT NULL CHECK (schema_version = 'crossfit-result/v2'),
  ruleset_version text NOT NULL,
  catalog_version text NOT NULL,
  request_id text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('completed', 'partial', 'abandoned', 'cancelled', 'capped')),
  completion numeric(5,4) NOT NULL CHECK (completion BETWEEN 0 AND 1),
  payload jsonb NOT NULL,
  actual_training_load jsonb NOT NULL,
  recorded_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_crossfit_v2_result_day
    FOREIGN KEY (methodology_plan_id, day_id)
    REFERENCES app.methodology_plan_days(plan_id, day_id) ON DELETE RESTRICT,
  CONSTRAINT uq_crossfit_v2_result_session UNIQUE (session_id),
  CONSTRAINT uq_crossfit_v2_result_idempotency UNIQUE (user_id, idempotency_key),
  CONSTRAINT chk_crossfit_v2_result_payload_identity CHECK (
    payload ->> 'result_id' = result_id
    AND payload ->> 'schema_version' = schema_version
    AND payload ->> 'idempotency_key' = idempotency_key
  )
);

CREATE INDEX IF NOT EXISTS idx_crossfit_v2_results_user_plan_recorded
  ON app.crossfit_v2_results (user_id, methodology_plan_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS app.crossfit_v2_autoreg_events (
  event_id text PRIMARY KEY CHECK (event_id ~ '^cfe_[a-f0-9]{24}$'),
  source_event_id text NOT NULL REFERENCES app.crossfit_v2_results(result_id) ON DELETE RESTRICT,
  user_id integer NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  methodology_plan_id integer NOT NULL REFERENCES app.methodology_plans(id) ON DELETE CASCADE,
  schema_version text NOT NULL CHECK (schema_version = 'crossfit-autoreg/v2'),
  ruleset_version text NOT NULL,
  catalog_version text NOT NULL,
  previous_state text NOT NULL CHECK (previous_state IN (
    'baseline', 'hold', 'progress_capacity', 'progress_skill', 'regress', 'deload', 'blocked'
  )),
  state text NOT NULL CHECK (state IN (
    'baseline', 'hold', 'progress_capacity', 'progress_skill', 'regress', 'deload', 'blocked'
  )),
  reason_codes text[] NOT NULL CHECK (cardinality(reason_codes) > 0),
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_crossfit_v2_autoreg_source UNIQUE (source_event_id),
  CONSTRAINT chk_crossfit_v2_autoreg_event_payload CHECK (
    payload ->> 'source_event_id' = source_event_id
    AND payload ->> 'schema_version' = schema_version
    AND payload ->> 'state' = state
  )
);

CREATE INDEX IF NOT EXISTS idx_crossfit_v2_autoreg_events_user_plan_processed
  ON app.crossfit_v2_autoreg_events (user_id, methodology_plan_id, processed_at DESC);

CREATE TABLE IF NOT EXISTS app.crossfit_v2_autoreg_snapshots (
  user_id integer NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  methodology_plan_id integer NOT NULL REFERENCES app.methodology_plans(id) ON DELETE CASCADE,
  snapshot_id text NOT NULL CHECK (snapshot_id ~ '^cfa_[a-f0-9]{24}$'),
  source_event_id text NOT NULL REFERENCES app.crossfit_v2_results(result_id) ON DELETE RESTRICT,
  schema_version text NOT NULL CHECK (schema_version = 'crossfit-autoreg/v2'),
  ruleset_version text NOT NULL,
  catalog_version text NOT NULL,
  state text NOT NULL CHECK (state IN (
    'baseline', 'hold', 'progress_capacity', 'progress_skill', 'regress', 'deload', 'blocked'
  )),
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, methodology_plan_id),
  CONSTRAINT chk_crossfit_v2_autoreg_snapshot_payload CHECK (
    payload ->> 'snapshot_id' = snapshot_id
    AND payload ->> 'source_event_id' = source_event_id
    AND payload ->> 'schema_version' = schema_version
    AND payload ->> 'state' = state
  )
);

CREATE OR REPLACE FUNCTION app.crossfit_v2_reject_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
BEGIN
  RAISE EXCEPTION 'CrossFit v2 append-only table % cannot be mutated', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_crossfit_v2_results_append_only ON app.crossfit_v2_results;
CREATE TRIGGER trg_crossfit_v2_results_append_only
BEFORE UPDATE OR DELETE ON app.crossfit_v2_results
FOR EACH ROW EXECUTE FUNCTION app.crossfit_v2_reject_append_only_mutation();

DROP TRIGGER IF EXISTS trg_crossfit_v2_autoreg_events_append_only ON app.crossfit_v2_autoreg_events;
CREATE TRIGGER trg_crossfit_v2_autoreg_events_append_only
BEFORE UPDATE OR DELETE ON app.crossfit_v2_autoreg_events
FOR EACH ROW EXECUTE FUNCTION app.crossfit_v2_reject_append_only_mutation();

ALTER TABLE app.crossfit_v2_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.crossfit_v2_autoreg_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.crossfit_v2_autoreg_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE app.crossfit_v2_results FROM PUBLIC;
REVOKE ALL ON TABLE app.crossfit_v2_autoreg_events FROM PUBLIC;
REVOKE ALL ON TABLE app.crossfit_v2_autoreg_snapshots FROM PUBLIC;
REVOKE ALL ON FUNCTION app.crossfit_v2_reject_append_only_mutation() FROM PUBLIC;

DO $$
DECLARE
  v_table text;
  v_policy text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA app TO authenticated;
    FOREACH v_table IN ARRAY ARRAY[
      'crossfit_v2_results', 'crossfit_v2_autoreg_events', 'crossfit_v2_autoreg_snapshots'
    ] LOOP
      v_policy := v_table || '_owner_read';
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'app' AND tablename = v_table AND policyname = v_policy
      ) THEN
        EXECUTE format(
          'CREATE POLICY %I ON app.%I FOR SELECT TO authenticated USING '
          '(user_id = NULLIF(current_setting(''app.current_user_id'', true), '''')::integer)',
          v_policy, v_table
        );
      END IF;
    END LOOP;

    GRANT SELECT ON app.crossfit_v2_results,
      app.crossfit_v2_autoreg_events,
      app.crossfit_v2_autoreg_snapshots TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA app TO service_role;
    GRANT ALL ON app.crossfit_v2_results,
      app.crossfit_v2_autoreg_events,
      app.crossfit_v2_autoreg_snapshots TO service_role;
    GRANT EXECUTE ON FUNCTION app.crossfit_v2_reject_append_only_mutation() TO service_role;
  END IF;
END;
$$;

COMMENT ON TABLE app.crossfit_v2_results IS
  'Resultados CrossFit v2 append-only, idempotentes por usuario y sesión.';
COMMENT ON TABLE app.crossfit_v2_autoreg_events IS
  'Ledger append-only de transiciones de la máquina CrossFit v2.';
COMMENT ON TABLE app.crossfit_v2_autoreg_snapshots IS
  'Estado materializado actual de autorregulación CrossFit v2 por usuario y plan.';

COMMIT;
