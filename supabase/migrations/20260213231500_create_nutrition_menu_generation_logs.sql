-- Auditoría de generación de menús IA/híbrido en nutrición v2

CREATE TABLE IF NOT EXISTS app.nutrition_menu_generation_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  plan_id UUID NULL,
  day_id UUID NULL,
  meal_id UUID NULL,
  mode_requested TEXT NOT NULL,
  mode_used TEXT NOT NULL,
  model_used TEXT NULL,
  fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  fallback_reason TEXT NULL,
  tokens_used INTEGER NULL,
  latency_ms INTEGER NULL,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nutrition_menu_generation_logs_user_created_at
  ON app.nutrition_menu_generation_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nutrition_menu_generation_logs_mode_created_at
  ON app.nutrition_menu_generation_logs (mode_used, created_at DESC);
