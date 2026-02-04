-- ============================================================================
-- AUDITORIA NUTRICIONAL
-- Log de cambios + snapshots semanales (MindFit/MindFeed)
-- ============================================================================

-- 1. Log de cambios nutricionales
CREATE TABLE IF NOT EXISTS app.nutrition_change_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

  change_date DATE DEFAULT CURRENT_DATE,
  change_type VARCHAR(30) NOT NULL CHECK (change_type IN (
    'kcal_adjust',
    'macro_adjust',
    'phase_change',
    'carb_cycle_adjust',
    'activity_factor_adjust'
  )),

  delta JSONB,
  rule_id VARCHAR(50),
  reason TEXT,
  metrics JSONB,
  previous_values JSONB,
  new_values JSONB,
  source VARCHAR(30),

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nutrition_change_log_user ON app.nutrition_change_log(user_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_change_log_date ON app.nutrition_change_log(change_date DESC);
CREATE INDEX IF NOT EXISTS idx_nutrition_change_log_type ON app.nutrition_change_log(user_id, change_type);

COMMENT ON TABLE app.nutrition_change_log IS 'Log de cambios nutricionales con rule IDs y métricas de soporte';
COMMENT ON COLUMN app.nutrition_change_log.delta IS 'Cambios aplicados (kcal/macros/fase/actividad)';
COMMENT ON COLUMN app.nutrition_change_log.metrics IS 'Métricas usadas en la decisión (peso/cintura/CLS/etc.)';

-- 2. Snapshots semanales
CREATE TABLE IF NOT EXISTS app.nutrition_weekly_snapshots (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

  snapshot_date DATE NOT NULL,
  phase VARCHAR(30),
  kcal_objetivo INTEGER,
  kcal_semanal INTEGER,
  metabolic_profile JSONB,
  macros JSONB,
  indicator JSONB,
  cls_score INTEGER,
  flags JSONB,
  adherence JSONB,
  source VARCHAR(30),

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_nutrition_weekly_snapshots_user ON app.nutrition_weekly_snapshots(user_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_nutrition_weekly_snapshots_phase ON app.nutrition_weekly_snapshots(user_id, phase);

COMMENT ON TABLE app.nutrition_weekly_snapshots IS 'Snapshots semanales de estado nutricional (fase, macros, indicadores)';
COMMENT ON COLUMN app.nutrition_weekly_snapshots.indicator IS 'ICG/IPG/IEC y estado confirmado si existe';

-- 3. Permisos
GRANT SELECT, INSERT, UPDATE ON app.nutrition_change_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON app.nutrition_weekly_snapshots TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE app.nutrition_change_log_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE app.nutrition_weekly_snapshots_id_seq TO authenticated;

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================
