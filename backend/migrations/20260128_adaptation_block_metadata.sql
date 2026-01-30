-- Añadir metadata requerida por spec en bloques de adaptación

ALTER TABLE app.adaptation_blocks
  ADD COLUMN IF NOT EXISTS ai_tag VARCHAR,
  ADD COLUMN IF NOT EXISTS sessions_per_week INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'adaptation_blocks_ai_tag_check'
  ) THEN
    ALTER TABLE app.adaptation_blocks
      ADD CONSTRAINT adaptation_blocks_ai_tag_check
      CHECK (ai_tag IS NULL OR ai_tag IN ('novato_total','readaptacion_mayor','reacondicionamiento_prev'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'adaptation_blocks_sessions_per_week_check'
  ) THEN
    ALTER TABLE app.adaptation_blocks
      ADD CONSTRAINT adaptation_blocks_sessions_per_week_check
      CHECK (sessions_per_week IS NULL OR sessions_per_week >= 1);
  END IF;
END $$;
