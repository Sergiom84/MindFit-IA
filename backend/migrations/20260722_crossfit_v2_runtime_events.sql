-- CrossFit profesional v2: eventos append-only del WOD player.
-- PREPARADA, NO APLICADA. No modifica sesiones ni resultados historicos.

BEGIN;

CREATE TABLE IF NOT EXISTS app.crossfit_v2_runtime_events (
  event_id text PRIMARY KEY CHECK (event_id ~ '^cfu_[a-f0-9]{24}$'),
  event_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  user_id integer NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  methodology_plan_id integer NOT NULL REFERENCES app.methodology_plans(id) ON DELETE CASCADE,
  session_id integer NOT NULL REFERENCES app.methodology_exercise_sessions(id) ON DELETE CASCADE,
  day_id integer NOT NULL,
  schema_version text NOT NULL CHECK (schema_version = 'crossfit-runtime-event/v2'),
  ruleset_version text NOT NULL CHECK (ruleset_version = 'crossfit-rules/2.0.0'),
  catalog_version text NOT NULL CHECK (catalog_version = 'crossfit-catalog/2.0.0'),
  stream_id text NOT NULL CHECK (stream_id ~ '^[A-Za-z0-9_-]{8,100}$'),
  client_sequence integer NOT NULL CHECK (client_sequence >= 0),
  event_type text NOT NULL CHECK (event_type IN (
    'timer_started', 'timer_paused', 'timer_resumed', 'timer_reset',
    'scale_selected', 'movement_substituted'
  )),
  request_id text NOT NULL,
  idempotency_key text NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_crossfit_v2_runtime_day
    FOREIGN KEY (methodology_plan_id, day_id)
    REFERENCES app.methodology_plan_days(plan_id, day_id) ON DELETE RESTRICT,
  CONSTRAINT uq_crossfit_v2_runtime_idempotency UNIQUE (user_id, idempotency_key),
  CONSTRAINT uq_crossfit_v2_runtime_client_sequence UNIQUE (session_id, stream_id, client_sequence),
  CONSTRAINT chk_crossfit_v2_runtime_payload_identity CHECK (
    payload ->> 'event_id' = event_id
    AND payload ->> 'schema_version' = schema_version
    AND payload ->> 'event_type' = event_type
  )
);

CREATE INDEX IF NOT EXISTS idx_crossfit_v2_runtime_session_order
  ON app.crossfit_v2_runtime_events (session_id, occurred_at, client_sequence, event_id);

CREATE OR REPLACE FUNCTION app.crossfit_v2_reject_runtime_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
BEGIN
  RAISE EXCEPTION 'CrossFit v2 runtime event ledger cannot be mutated'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_crossfit_v2_runtime_events_append_only ON app.crossfit_v2_runtime_events;
CREATE TRIGGER trg_crossfit_v2_runtime_events_append_only
BEFORE UPDATE OR DELETE ON app.crossfit_v2_runtime_events
FOR EACH ROW EXECUTE FUNCTION app.crossfit_v2_reject_runtime_event_mutation();

ALTER TABLE app.crossfit_v2_runtime_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.crossfit_v2_runtime_events FROM PUBLIC;
REVOKE ALL ON SEQUENCE app.crossfit_v2_runtime_events_event_sequence_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION app.crossfit_v2_reject_runtime_event_mutation() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA app TO authenticated;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'app' AND tablename = 'crossfit_v2_runtime_events'
        AND policyname = 'crossfit_v2_runtime_events_owner_read'
    ) THEN
      CREATE POLICY crossfit_v2_runtime_events_owner_read
        ON app.crossfit_v2_runtime_events FOR SELECT TO authenticated
        USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer);
    END IF;
    GRANT SELECT ON app.crossfit_v2_runtime_events TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA app TO service_role;
    GRANT ALL ON app.crossfit_v2_runtime_events TO service_role;
    GRANT USAGE, SELECT ON SEQUENCE app.crossfit_v2_runtime_events_event_sequence_seq TO service_role;
    GRANT EXECUTE ON FUNCTION app.crossfit_v2_reject_runtime_event_mutation() TO service_role;
  END IF;
END;
$$;

COMMENT ON TABLE app.crossfit_v2_runtime_events IS
  'Ledger append-only de pausa, escala y sustitucion del WOD player CrossFit v2.';

COMMIT;
