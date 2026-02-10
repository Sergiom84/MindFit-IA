-- Añade columnas para "tipo de día" y "banderas de ruido" al log diario de nutrición.
-- Objetivo: habilitar el motor de revisión 7d/14d (modo SIMPLE/FINO) sin romper endpoints legacy.
--
-- Backward compatible:
-- - Los inserts/updates legacy no envían estas columnas, pero caen en defaults.

ALTER TABLE app.daily_nutrition_log
  ADD COLUMN IF NOT EXISTS day_type TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS noise_flags TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

DO $$
BEGIN
  -- day_type: valores permitidos. Esto ayuda a mantener la UX consistente.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'app'
      AND t.relname = 'daily_nutrition_log'
      AND c.conname = 'daily_nutrition_log_day_type_check'
  ) THEN
    ALTER TABLE app.daily_nutrition_log
      ADD CONSTRAINT daily_nutrition_log_day_type_check
      CHECK (day_type IN ('normal', 'libre', 'cheat', 'diet_break'));
  END IF;
END $$;

