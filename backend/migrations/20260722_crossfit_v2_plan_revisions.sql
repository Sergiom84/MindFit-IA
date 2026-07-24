-- CrossFit profesional v2: identidad unica de revisiones de plan.
-- PREPARADA, NO APLICADA. No reescribe planes ni sesiones historicas.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS ux_crossfit_v2_plan_idempotency
  ON app.methodology_plans (
    user_id,
    ((plan_data -> 'crossfit_v2' -> 'generation' ->> 'idempotency_key'))
  )
  WHERE methodology_type = 'CrossFit'
    AND plan_data ->> 'schema_version' = 'crossfit-plan/v2'
    AND plan_data -> 'crossfit_v2' -> 'generation' ->> 'idempotency_key' IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crossfit_v2_plan_supersedes
  ON app.methodology_plans (
    user_id,
    ((plan_data -> 'crossfit_v2' -> 'generation' ->> 'supersedes'))
  )
  WHERE methodology_type = 'CrossFit'
    AND plan_data ->> 'schema_version' = 'crossfit-plan/v2';

COMMENT ON INDEX app.ux_crossfit_v2_plan_idempotency IS
  'Impide dos revisiones CrossFit v2 para la misma identidad de generación y usuario.';

COMMIT;
