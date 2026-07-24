-- CrossFit profesional v2: permite distinguir D1/D2 en el tipo de día nutricional.
-- PREPARADA, NO APLICADA. La Fase 0 ya hizo tolerantes los lectores, pero el
-- constraint histórico todavía bloquea `entreno_normal` y `entreno_alto` al
-- activar la periodización. No modifica filas ni activa flags.

BEGIN;

DO $$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_get_constraintdef(c.oid)
    INTO v_definition
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'app'
    AND t.relname = 'nutrition_plan_days'
    AND c.conname = 'nutrition_plan_days_tipo_dia_check';

  IF v_definition IS NULL
     OR v_definition NOT LIKE '%entreno_normal%'
     OR v_definition NOT LIKE '%entreno_alto%' THEN
    ALTER TABLE app.nutrition_plan_days
      DROP CONSTRAINT IF EXISTS nutrition_plan_days_tipo_dia_check;

    ALTER TABLE app.nutrition_plan_days
      ADD CONSTRAINT nutrition_plan_days_tipo_dia_check
      CHECK (tipo_dia IN ('entreno', 'entreno_normal', 'entreno_alto', 'descanso'));
  END IF;
END;
$$;

COMMENT ON CONSTRAINT nutrition_plan_days_tipo_dia_check ON app.nutrition_plan_days IS
  'Tipos legacy y periodizados D0/D1/D2; activación gobernada por flags de metodología.';

COMMIT;
