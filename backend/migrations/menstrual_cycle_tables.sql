-- ============================================
-- MIGRACIÓN: Tablas para Ciclo Menstrual
-- Fecha: 2026-01-30
-- Descripción: Crea las tablas necesarias para el seguimiento del ciclo menstrual
-- ============================================

-- Tabla de configuración del ciclo (una por usuario)
CREATE TABLE IF NOT EXISTS app.user_menstrual_config (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  cycle_length INTEGER DEFAULT 28 CHECK (cycle_length BETWEEN 21 AND 45),
  period_length INTEGER DEFAULT 5 CHECK (period_length BETWEEN 2 AND 10),
  is_regular BOOLEAN DEFAULT true,
  uses_hormonal_contraceptives BOOLEAN DEFAULT false,
  last_period_start DATE,
  tracking_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Índice para búsquedas por usuario
CREATE INDEX IF NOT EXISTS idx_menstrual_config_user ON app.user_menstrual_config(user_id);

-- Tabla de registros diarios
CREATE TABLE IF NOT EXISTS app.menstrual_daily_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  is_period_day BOOLEAN DEFAULT false,
  energy_level INTEGER CHECK (energy_level BETWEEN 1 AND 5),
  pain_level INTEGER CHECK (pain_level BETWEEN 1 AND 5),
  sleep_quality INTEGER CHECK (sleep_quality BETWEEN 1 AND 5),
  mood INTEGER CHECK (mood BETWEEN 1 AND 5),
  bloating INTEGER CHECK (bloating BETWEEN 1 AND 5),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, log_date)
);

-- Índices para búsquedas eficientes
CREATE INDEX IF NOT EXISTS idx_menstrual_log_user ON app.menstrual_daily_log(user_id);
CREATE INDEX IF NOT EXISTS idx_menstrual_log_date ON app.menstrual_daily_log(log_date);
CREATE INDEX IF NOT EXISTS idx_menstrual_log_user_date ON app.menstrual_daily_log(user_id, log_date);
CREATE INDEX IF NOT EXISTS idx_menstrual_log_period ON app.menstrual_daily_log(user_id, is_period_day) WHERE is_period_day = true;

-- Comentarios descriptivos
COMMENT ON TABLE app.user_menstrual_config IS 'Configuración del ciclo menstrual por usuario';
COMMENT ON TABLE app.menstrual_daily_log IS 'Registro diario de síntomas y estado del ciclo';

COMMENT ON COLUMN app.user_menstrual_config.cycle_length IS 'Duración promedio del ciclo en días (21-45)';
COMMENT ON COLUMN app.user_menstrual_config.period_length IS 'Duración promedio del periodo en días (2-10)';
COMMENT ON COLUMN app.user_menstrual_config.is_regular IS 'Si el ciclo es regular (variación < 7 días)';
COMMENT ON COLUMN app.user_menstrual_config.uses_hormonal_contraceptives IS 'Si usa anticonceptivos hormonales';
COMMENT ON COLUMN app.user_menstrual_config.last_period_start IS 'Fecha de inicio del último periodo';

COMMENT ON COLUMN app.menstrual_daily_log.energy_level IS 'Nivel de energía del día (1-5)';
COMMENT ON COLUMN app.menstrual_daily_log.pain_level IS 'Nivel de dolor/molestias (1-5)';
COMMENT ON COLUMN app.menstrual_daily_log.sleep_quality IS 'Calidad del sueño (1-5)';
COMMENT ON COLUMN app.menstrual_daily_log.mood IS 'Estado de ánimo (1-5, opcional)';
COMMENT ON COLUMN app.menstrual_daily_log.bloating IS 'Nivel de hinchazón (1-5, opcional)';

-- ============================================
-- FIN DE MIGRACIÓN
-- ============================================
