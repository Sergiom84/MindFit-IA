-- ============================================================================
-- PARCHE BODY MEASUREMENTS (ajuste de columnas faltantes e índices)
-- Caso: la tabla app.body_measurements existe sin las columnas nuevas
-- ============================================================================

DO $$
BEGIN
  -- Columnas de condiciones y validación
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'body_measurements' AND column_name = 'time_of_day'
  ) THEN
    ALTER TABLE app.body_measurements ADD COLUMN time_of_day VARCHAR(20) CHECK (time_of_day IN ('morning','afternoon','evening','night'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'body_measurements' AND column_name = 'is_fasted'
  ) THEN
    ALTER TABLE app.body_measurements ADD COLUMN is_fasted BOOLEAN DEFAULT TRUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'body_measurements' AND column_name = 'post_workout'
  ) THEN
    ALTER TABLE app.body_measurements ADD COLUMN post_workout BOOLEAN DEFAULT FALSE;
  END IF;

  -- Columnas de mediciones nuevas
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'body_measurements' AND column_name = 'weight'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'body_measurements' AND column_name = 'weight_kg'
  ) THEN
    ALTER TABLE app.body_measurements RENAME COLUMN weight TO weight_kg;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'body_measurements' AND column_name = 'waist'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'body_measurements' AND column_name = 'waist_cm'
  ) THEN
    ALTER TABLE app.body_measurements RENAME COLUMN waist TO waist_cm;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'body_measurements' AND column_name = 'biceps_cm'
  ) THEN
    ALTER TABLE app.body_measurements ADD COLUMN biceps_cm DECIMAL(5,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'body_measurements' AND column_name = 'chest_cm'
  ) THEN
    ALTER TABLE app.body_measurements ADD COLUMN chest_cm DECIMAL(5,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'body_measurements' AND column_name = 'calf_cm'
  ) THEN
    ALTER TABLE app.body_measurements ADD COLUMN calf_cm DECIMAL(5,2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'body_measurements' AND column_name = 'skinfold_abdominal_mm'
  ) THEN
    ALTER TABLE app.body_measurements ADD COLUMN skinfold_abdominal_mm DECIMAL(4,1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'body_measurements' AND column_name = 'skinfold_triceps_mm'
  ) THEN
    ALTER TABLE app.body_measurements ADD COLUMN skinfold_triceps_mm DECIMAL(4,1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'body_measurements' AND column_name = 'skinfold_subscapular_mm'
  ) THEN
    ALTER TABLE app.body_measurements ADD COLUMN skinfold_subscapular_mm DECIMAL(4,1);
  END IF;

  -- Campos de validación
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'body_measurements' AND column_name = 'is_validated'
  ) THEN
    ALTER TABLE app.body_measurements ADD COLUMN is_validated BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'body_measurements' AND column_name = 'validation_warnings'
  ) THEN
    ALTER TABLE app.body_measurements ADD COLUMN validation_warnings JSONB DEFAULT '[]'::JSONB;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'body_measurements' AND column_name = 'requires_confirmation'
  ) THEN
    ALTER TABLE app.body_measurements ADD COLUMN requires_confirmation BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'body_measurements' AND column_name = 'user_confirmed'
  ) THEN
    ALTER TABLE app.body_measurements ADD COLUMN user_confirmed BOOLEAN DEFAULT FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'body_measurements' AND column_name = 'confirmed_at'
  ) THEN
    ALTER TABLE app.body_measurements ADD COLUMN confirmed_at TIMESTAMP;
  END IF;
END $$;

-- Índices que dependen de las columnas nuevas
CREATE INDEX IF NOT EXISTS idx_body_measurements_validation
  ON app.body_measurements(user_id, is_validated)
  WHERE requires_confirmation = TRUE;

CREATE INDEX IF NOT EXISTS idx_body_measurements_validated_recent
  ON app.body_measurements(user_id, measurement_date DESC)
  WHERE is_validated = TRUE;

CREATE INDEX IF NOT EXISTS idx_body_measurements_unconfirmed
  ON app.body_measurements(user_id, requires_confirmation)
  WHERE requires_confirmation = TRUE AND user_confirmed = FALSE;

