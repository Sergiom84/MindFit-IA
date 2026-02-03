-- ============================================
-- MIGRACION: Ciclo menstrual v3 - base de datos
-- Fecha: 2026-02-02
-- Descripcion: Añade campos v3, historial de ciclos y tags de ejercicios
-- ============================================

-- 1) Configuracion de ciclo (nuevas columnas)
ALTER TABLE app.user_menstrual_config
  ADD COLUMN IF NOT EXISTS contraception_type TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS cycle_confidence TEXT DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS last_bleed_start_date DATE,
  ADD COLUMN IF NOT EXISTS bleed_length_days INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS cycle_length_days INTEGER DEFAULT 28,
  ADD COLUMN IF NOT EXISTS luteal_length_days INTEGER DEFAULT 14,
  ADD COLUMN IF NOT EXISTS joint_laxity_risk BOOLEAN DEFAULT false;

ALTER TABLE app.user_menstrual_config
  ADD CONSTRAINT user_menstrual_config_contraception_type_check
    CHECK (contraception_type IN ('none', 'combined', 'progestin_only', 'hormonal_iud', 'copper_iud', 'other/unknown')),
  ADD CONSTRAINT user_menstrual_config_cycle_confidence_check
    CHECK (cycle_confidence IN ('high', 'medium', 'low')),
  ADD CONSTRAINT user_menstrual_config_bleed_length_days_check
    CHECK (bleed_length_days BETWEEN 1 AND 10),
  ADD CONSTRAINT user_menstrual_config_cycle_length_days_check
    CHECK (cycle_length_days BETWEEN 21 AND 45),
  ADD CONSTRAINT user_menstrual_config_luteal_length_days_check
    CHECK (luteal_length_days BETWEEN 9 AND 18);

-- 2) Registro diario (nuevas columnas)
ALTER TABLE app.menstrual_daily_log
  ADD COLUMN IF NOT EXISTS pain_0_3 INTEGER,
  ADD COLUMN IF NOT EXISTS fatigue_0_3 INTEGER,
  ADD COLUMN IF NOT EXISTS sleep_0_3 INTEGER,
  ADD COLUMN IF NOT EXISTS stress_0_3 INTEGER,
  ADD COLUMN IF NOT EXISTS pain_next_day_0_10 INTEGER,
  ADD COLUMN IF NOT EXISTS session_quality_0_10 INTEGER;

ALTER TABLE app.menstrual_daily_log
  ADD CONSTRAINT menstrual_daily_log_pain_0_3_check
    CHECK (pain_0_3 IS NULL OR pain_0_3 BETWEEN 0 AND 3),
  ADD CONSTRAINT menstrual_daily_log_fatigue_0_3_check
    CHECK (fatigue_0_3 IS NULL OR fatigue_0_3 BETWEEN 0 AND 3),
  ADD CONSTRAINT menstrual_daily_log_sleep_0_3_check
    CHECK (sleep_0_3 IS NULL OR sleep_0_3 BETWEEN 0 AND 3),
  ADD CONSTRAINT menstrual_daily_log_stress_0_3_check
    CHECK (stress_0_3 IS NULL OR stress_0_3 BETWEEN 0 AND 3),
  ADD CONSTRAINT menstrual_daily_log_pain_next_day_0_10_check
    CHECK (pain_next_day_0_10 IS NULL OR pain_next_day_0_10 BETWEEN 0 AND 10),
  ADD CONSTRAINT menstrual_daily_log_session_quality_0_10_check
    CHECK (session_quality_0_10 IS NULL OR session_quality_0_10 BETWEEN 0 AND 10);

-- 3) Historial de ciclos
CREATE TABLE IF NOT EXISTS app.menstrual_cycle_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  bleed_start_date DATE NOT NULL,
  cycle_length_days INTEGER CHECK (cycle_length_days BETWEEN 21 AND 45),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, bleed_start_date)
);

CREATE INDEX IF NOT EXISTS idx_menstrual_cycle_history_user
  ON app.menstrual_cycle_history(user_id);

CREATE INDEX IF NOT EXISTS idx_menstrual_cycle_history_start
  ON app.menstrual_cycle_history(user_id, bleed_start_date);

-- 4) Tags de ejercicios (minimo para swaps)
CREATE TABLE IF NOT EXISTS app.exercise_tags (
  id SERIAL PRIMARY KEY,
  exercise_id BIGINT NOT NULL,
  source_table TEXT NOT NULL,
  pattern TEXT,
  equipment TEXT[],
  impact_level INTEGER,
  axial_load_level INTEGER,
  cod_level INTEGER,
  overhead BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(exercise_id, source_table),
  CHECK (impact_level IS NULL OR impact_level BETWEEN 0 AND 3),
  CHECK (axial_load_level IS NULL OR axial_load_level BETWEEN 0 AND 3),
  CHECK (cod_level IS NULL OR cod_level BETWEEN 0 AND 3)
);

-- 5) Backfill inicial (compatibilidad)
UPDATE app.user_menstrual_config
SET
  cycle_length_days = COALESCE(cycle_length_days, cycle_length),
  bleed_length_days = COALESCE(bleed_length_days, period_length),
  last_bleed_start_date = COALESCE(last_bleed_start_date, last_period_start),
  contraception_type = CASE
    WHEN uses_hormonal_contraceptives THEN 'other/unknown'
    WHEN contraception_type IS NULL THEN 'none'
    ELSE contraception_type
  END,
  cycle_confidence = COALESCE(cycle_confidence, 'low');

UPDATE app.menstrual_daily_log
SET
  pain_0_3 = COALESCE(pain_0_3,
    CASE
      WHEN pain_level IS NULL THEN NULL
      WHEN pain_level <= 1 THEN 0
      WHEN pain_level = 2 THEN 1
      WHEN pain_level = 3 THEN 1
      WHEN pain_level = 4 THEN 2
      ELSE 3
    END
  ),
  fatigue_0_3 = COALESCE(fatigue_0_3,
    CASE
      WHEN energy_level IS NULL THEN NULL
      WHEN energy_level <= 1 THEN 3
      WHEN energy_level = 2 THEN 2
      WHEN energy_level = 3 THEN 1
      ELSE 0
    END
  ),
  sleep_0_3 = COALESCE(sleep_0_3,
    CASE
      WHEN sleep_quality IS NULL THEN NULL
      WHEN sleep_quality <= 1 THEN 3
      WHEN sleep_quality = 2 THEN 2
      WHEN sleep_quality = 3 THEN 1
      ELSE 0
    END
  )
WHERE pain_0_3 IS NULL OR fatigue_0_3 IS NULL OR sleep_0_3 IS NULL;

-- ============================================
-- FIN DE MIGRACION
-- ============================================
