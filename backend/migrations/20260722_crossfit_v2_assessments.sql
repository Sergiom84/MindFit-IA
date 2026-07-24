-- CrossFit profesional v2: ledger de evaluaciones y evidencia verificada.
-- PREPARADA, NO APLICADA. Es aditiva, append-only y no altera perfiles generales.

BEGIN;

CREATE TABLE IF NOT EXISTS app.crossfit_v2_assessments (
  assessment_id text PRIMARY KEY CHECK (assessment_id ~ '^cfx_[a-f0-9]{24}$'),
  event_sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  user_id integer NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  schema_version text NOT NULL CHECK (schema_version = 'crossfit-assessment/v2'),
  level_model_version text NOT NULL CHECK (level_model_version = 'level-model/2.0.0'),
  source text NOT NULL CHECK (source IN ('self_report', 'professional_review')),
  verification_status text NOT NULL CHECK (verification_status IN ('self_report', 'verified', 'revoked')),
  request_id text NOT NULL,
  idempotency_key text NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  assessment_payload jsonb NOT NULL,
  classification_payload jsonb NOT NULL,
  safety_payload jsonb NOT NULL,
  reviewer_reference text,
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_crossfit_v2_assessment_idempotency UNIQUE (user_id, idempotency_key),
  CONSTRAINT chk_crossfit_v2_assessment_source_status CHECK (
    (source = 'self_report' AND verification_status = 'self_report' AND reviewer_reference IS NULL)
    OR (source = 'professional_review' AND verification_status IN ('verified', 'revoked') AND reviewer_reference IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_crossfit_v2_assessments_user_created
  ON app.crossfit_v2_assessments (user_id, event_sequence DESC);

CREATE INDEX IF NOT EXISTS idx_crossfit_v2_assessments_verified
  ON app.crossfit_v2_assessments (user_id, event_sequence DESC)
  WHERE source = 'professional_review';

CREATE OR REPLACE FUNCTION app.crossfit_v2_reject_assessment_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, app
AS $$
BEGIN
  RAISE EXCEPTION 'CrossFit v2 assessment ledger cannot be mutated'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_crossfit_v2_assessments_append_only ON app.crossfit_v2_assessments;
CREATE TRIGGER trg_crossfit_v2_assessments_append_only
BEFORE UPDATE OR DELETE ON app.crossfit_v2_assessments
FOR EACH ROW EXECUTE FUNCTION app.crossfit_v2_reject_assessment_mutation();

ALTER TABLE app.crossfit_v2_assessments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app.crossfit_v2_assessments FROM PUBLIC;
REVOKE ALL ON SEQUENCE app.crossfit_v2_assessments_event_sequence_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION app.crossfit_v2_reject_assessment_mutation() FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT USAGE ON SCHEMA app TO authenticated;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'app' AND tablename = 'crossfit_v2_assessments'
        AND policyname = 'crossfit_v2_assessments_owner_read'
    ) THEN
      CREATE POLICY crossfit_v2_assessments_owner_read
        ON app.crossfit_v2_assessments FOR SELECT TO authenticated
        USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer);
    END IF;
    GRANT SELECT ON app.crossfit_v2_assessments TO authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT USAGE ON SCHEMA app TO service_role;
    GRANT ALL ON app.crossfit_v2_assessments TO service_role;
    GRANT USAGE, SELECT ON SEQUENCE app.crossfit_v2_assessments_event_sequence_seq TO service_role;
    GRANT EXECUTE ON FUNCTION app.crossfit_v2_reject_assessment_mutation() TO service_role;
  END IF;
END;
$$;

COMMENT ON TABLE app.crossfit_v2_assessments IS
  'Ledger append-only de autoevaluaciones y evidencia profesional CrossFit v2.';

COMMIT;
