-- Tabla para aplicar/deshacer ajustes de kcal con consistencia (plan activo como fuente de verdad).
-- Permite "undo" en ventana de 24h y auditoría de datos usados.

CREATE TABLE IF NOT EXISTS app.nutrition_adjustment_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

  mode TEXT NOT NULL DEFAULT 'quincenal',
  source TEXT NOT NULL DEFAULT 'auto',

  previous_plan_id UUID NOT NULL REFERENCES app.nutrition_plans_v2(id),
  new_plan_id UUID NOT NULL REFERENCES app.nutrition_plans_v2(id),

  previous_kcal INTEGER NOT NULL,
  new_kcal INTEGER NOT NULL,
  delta_kcal INTEGER NOT NULL,

  reason TEXT,
  metrics JSONB,

  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  undo_expires_at TIMESTAMPTZ NOT NULL,
  reverted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'app'
      AND t.relname = 'nutrition_adjustment_actions'
      AND c.conname = 'nutrition_adjustment_actions_mode_check'
  ) THEN
    ALTER TABLE app.nutrition_adjustment_actions
      ADD CONSTRAINT nutrition_adjustment_actions_mode_check
      CHECK (mode IN ('quincenal', 'seguridad'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'app'
      AND t.relname = 'nutrition_adjustment_actions'
      AND c.conname = 'nutrition_adjustment_actions_source_check'
  ) THEN
    ALTER TABLE app.nutrition_adjustment_actions
      ADD CONSTRAINT nutrition_adjustment_actions_source_check
      CHECK (source IN ('auto', 'manual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_nutrition_adjustment_actions_user_applied
  ON app.nutrition_adjustment_actions (user_id, applied_at DESC);

CREATE INDEX IF NOT EXISTS idx_nutrition_adjustment_actions_user_active
  ON app.nutrition_adjustment_actions (user_id, applied_at DESC)
  WHERE reverted_at IS NULL;

