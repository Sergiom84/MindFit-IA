-- ============================================
-- MIGRACION: Ciclo menstrual v3 - autoajuste y deload
-- Fecha: 2026-02-03
-- Descripcion: Agrega tablas de métricas por patrón y estado de deload
-- ============================================

CREATE TABLE IF NOT EXISTS app.menstrual_pattern_metrics (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  last_sessions JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, pattern)
);

CREATE INDEX IF NOT EXISTS idx_menstrual_pattern_metrics_user
  ON app.menstrual_pattern_metrics(user_id);

CREATE TABLE IF NOT EXISTS app.menstrual_deload_state (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id),
  CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS idx_menstrual_deload_user
  ON app.menstrual_deload_state(user_id);

-- ============================================
-- FIN DE MIGRACION
-- ============================================
