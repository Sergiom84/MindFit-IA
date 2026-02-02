-- ============================================================================
-- SISTEMA DE GESTION DE SALTOS DE DIETA
-- Registrar saltos y mantener coherencia semanal sin castigar adherencia
-- ============================================================================

-- 1. Tabla principal de saltos de dieta
CREATE TABLE IF NOT EXISTS app.diet_deviations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

  -- Fecha y franja horaria
  deviation_date DATE NOT NULL,
  meal_slot VARCHAR(20) NOT NULL CHECK (meal_slot IN ('desayuno', 'comida', 'cena', 'extra', 'snack')),

  -- Descripcion del salto
  description TEXT,
  foods_consumed TEXT,  -- Lista de alimentos consumidos

  -- Calorias y macros estimados del EXCESO (no del total consumido)
  excess_kcal INTEGER NOT NULL,  -- Calorias de exceso sobre lo planificado
  excess_protein_g DECIMAL(6,1) DEFAULT 0,
  excess_carbs_g DECIMAL(6,1) DEFAULT 0,
  excess_fat_g DECIMAL(6,1) DEFAULT 0,

  -- Nivel de confianza en la estimacion
  confidence_level VARCHAR(10) NOT NULL DEFAULT 'medio' CHECK (confidence_level IN ('bajo', 'medio', 'alto')),

  -- Estado de compensacion
  compensation_status VARCHAR(20) DEFAULT 'pending' CHECK (compensation_status IN ('pending', 'partial', 'completed', 'skipped')),
  compensation_applied JSONB DEFAULT '[]'::JSONB,
  -- Formato: [{ date, kcal_reduced, applied }]

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diet_deviations_user ON app.diet_deviations(user_id);
CREATE INDEX IF NOT EXISTS idx_diet_deviations_date ON app.diet_deviations(deviation_date DESC);
CREATE INDEX IF NOT EXISTS idx_diet_deviations_week ON app.diet_deviations(user_id, deviation_date);

COMMENT ON TABLE app.diet_deviations IS 'Registro de saltos de dieta con sistema de compensacion semanal';

-- 2. Tabla de objetivos semanales de calorias
CREATE TABLE IF NOT EXISTS app.weekly_calorie_targets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

  -- Semana (lunes de la semana)
  week_start_date DATE NOT NULL,

  -- Objetivo semanal
  daily_target_kcal INTEGER NOT NULL,
  weekly_target_kcal INTEGER GENERATED ALWAYS AS (daily_target_kcal * 7) STORED,

  -- Acumulado real
  accumulated_kcal INTEGER DEFAULT 0,
  days_logged INTEGER DEFAULT 0,

  -- Desviacion
  current_deviation INTEGER DEFAULT 0,  -- acumulado - objetivo_proporcional

  -- Estado
  is_current BOOLEAN DEFAULT FALSE,
  closed_at TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_weekly_targets_user ON app.weekly_calorie_targets(user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_targets_current ON app.weekly_calorie_targets(user_id, is_current) WHERE is_current = TRUE;

COMMENT ON TABLE app.weekly_calorie_targets IS 'Objetivos y seguimiento de calorias semanales';

-- 3. Tabla de compensaciones diarias sugeridas
CREATE TABLE IF NOT EXISTS app.daily_compensation_plan (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  deviation_id INTEGER REFERENCES app.diet_deviations(id) ON DELETE CASCADE,

  -- Dia de compensacion
  compensation_date DATE NOT NULL,

  -- Ajuste sugerido
  kcal_adjustment INTEGER NOT NULL,  -- Negativo = reduccion
  protein_g_target DECIMAL(6,1),     -- Proteina minima a mantener
  carbs_g_adjustment DECIMAL(6,1),
  fat_g_adjustment DECIMAL(6,1),

  -- Estado
  is_applied BOOLEAN DEFAULT FALSE,
  actual_kcal_consumed INTEGER,
  notes TEXT,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, compensation_date, deviation_id)
);

CREATE INDEX IF NOT EXISTS idx_compensation_plan_user ON app.daily_compensation_plan(user_id, compensation_date);

COMMENT ON TABLE app.daily_compensation_plan IS 'Plan de compensacion diaria para saltos de dieta';

-- 4. Configuracion de usuario para gestion de saltos
CREATE TABLE IF NOT EXISTS app.diet_deviation_config (
  user_id INTEGER PRIMARY KEY REFERENCES app.users(id) ON DELETE CASCADE,

  -- Configuracion de compensacion
  auto_compensate BOOLEAN DEFAULT TRUE,
  max_compensation_per_day_pct DECIMAL(3,2) DEFAULT 0.20,  -- Max 20% reduccion por dia
  min_protein_g_kg DECIMAL(3,1) DEFAULT 2.0,              -- Proteina minima siempre
  conservative_mode BOOLEAN DEFAULT FALSE,                 -- Modo conservador (repartir la mitad)

  -- Preferencias por fase
  phase_priority JSONB DEFAULT '{
    "bulk": "carbs_first",
    "cut": "carbs_only",
    "mant": "balanced"
  }'::JSONB,

  -- Notificaciones
  notify_on_deviation BOOLEAN DEFAULT TRUE,
  notify_compensation_reminder BOOLEAN DEFAULT TRUE,

  -- Metadata
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE app.diet_deviation_config IS 'Configuracion de usuario para gestion de saltos de dieta';

-- ============================================================================
-- FUNCIONES DE UTILIDAD
-- ============================================================================

-- 5. Funcion para obtener el lunes de una semana
CREATE OR REPLACE FUNCTION app.get_week_start(p_date DATE)
RETURNS DATE AS $$
BEGIN
  -- Devuelve el lunes de la semana de la fecha dada
  RETURN p_date - (EXTRACT(ISODOW FROM p_date) - 1)::INTEGER;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 6. Funcion para calcular compensacion sugerida
CREATE OR REPLACE FUNCTION app.calculate_compensation(
  p_user_id INTEGER,
  p_excess_kcal INTEGER,
  p_deviation_date DATE,
  p_confidence VARCHAR(10)
)
RETURNS TABLE (
  compensation_date DATE,
  kcal_reduction INTEGER,
  is_conservative BOOLEAN,
  protein_g_target DECIMAL(6,1),
  carbs_g_adjustment DECIMAL(6,1),
  fat_g_adjustment DECIMAL(6,1),
  phase_used VARCHAR(10)
) AS $$
DECLARE
  v_config app.diet_deviation_config%ROWTYPE;
  v_daily_target INTEGER;
  v_weight_kg DECIMAL;
  v_phase VARCHAR(10);
  v_phase_pref TEXT;
  v_protein_target DECIMAL(6,1);
  v_carb_share NUMERIC;
  v_fat_share NUMERIC;
  v_carb_kcal INTEGER;
  v_fat_kcal INTEGER;
  v_carb_adjust DECIMAL(6,1);
  v_fat_adjust DECIMAL(6,1);
  v_remaining_days INTEGER;
  v_per_day_reduction INTEGER;
  v_max_reduction INTEGER;
  v_week_end DATE;
  v_current_date DATE;
  v_effective_excess INTEGER;
BEGIN
  -- Obtener configuracion del usuario
  SELECT * INTO v_config FROM app.diet_deviation_config WHERE user_id = p_user_id;

  -- Obtener objetivo diario, peso y fase
  SELECT daily_target_kcal, peso_kg, objetivo
  INTO v_daily_target, v_weight_kg, v_phase
  FROM app.nutrition_profiles
  WHERE user_id = p_user_id;

  IF v_daily_target IS NULL THEN
    v_daily_target := 2000; -- Default
  END IF;

  v_phase := COALESCE(v_phase, 'mant');
  v_phase_pref := COALESCE(v_config.phase_priority ->> v_phase, 'balanced');

  -- Proteina objetivo estable
  v_protein_target := ROUND(COALESCE(v_weight_kg, 70) * COALESCE(v_config.min_protein_g_kg, 2.0), 1);

  -- Calcular fin de semana (domingo)
  v_week_end := app.get_week_start(p_deviation_date) + 6;

  -- Calcular dias restantes en la semana (sin contar el dia del salto)
  v_remaining_days := v_week_end - p_deviation_date;

  IF v_remaining_days <= 0 THEN
    -- Si es domingo, no hay dias para compensar esta semana
    RETURN;
  END IF;

  -- Aplicar regla anti-ruido: si confianza baja, compensar solo la mitad
  IF p_confidence = 'bajo' OR COALESCE(v_config.conservative_mode, FALSE) THEN
    v_effective_excess := p_excess_kcal / 2;
  ELSE
    v_effective_excess := p_excess_kcal;
  END IF;

  -- Calcular reduccion por dia
  v_per_day_reduction := v_effective_excess / v_remaining_days;

  -- Aplicar limite maximo de reduccion por dia (20% por defecto)
  v_max_reduction := ROUND(v_daily_target * COALESCE(v_config.max_compensation_per_day_pct, 0.20));
  IF v_per_day_reduction > v_max_reduction THEN
    v_per_day_reduction := v_max_reduction;
  END IF;

  -- Reparto de kcal por macronutriente segun fase
  IF v_phase_pref IN ('carbs_only', 'carbs_first') THEN
    v_carb_share := 1.0;
  ELSE
    v_carb_share := 0.5; -- balanced
  END IF;
  v_fat_share := 1 - v_carb_share;

  v_carb_kcal := ROUND(v_per_day_reduction * v_carb_share);
  v_fat_kcal := v_per_day_reduction - v_carb_kcal;
  v_carb_adjust := -ROUND(v_carb_kcal / 4.0, 1); -- negativos indican reduccion
  v_fat_adjust := -ROUND(v_fat_kcal / 9.0, 1);

  -- Generar plan de compensacion para cada dia restante
  v_current_date := p_deviation_date + 1;
  WHILE v_current_date <= v_week_end LOOP
    RETURN QUERY SELECT
      v_current_date,
      -v_per_day_reduction,  -- Negativo indica reduccion
      (p_confidence = 'bajo' OR COALESCE(v_config.conservative_mode, FALSE)),
      v_protein_target,
      v_carb_adjust,
      v_fat_adjust,
      v_phase;

    v_current_date := v_current_date + 1;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 7. Funcion para obtener resumen semanal
CREATE OR REPLACE FUNCTION app.get_weekly_deviation_summary(
  p_user_id INTEGER,
  p_week_start DATE DEFAULT NULL
)
RETURNS TABLE (
  week_start DATE,
  daily_target INTEGER,
  weekly_target INTEGER,
  total_deviations INTEGER,
  total_excess_kcal INTEGER,
  total_compensated INTEGER,
  net_deviation INTEGER,
  deviation_count INTEGER,
  compensation_status VARCHAR(20)
) AS $$
DECLARE
  v_week_start DATE;
BEGIN
  -- Si no se especifica semana, usar la actual
  v_week_start := COALESCE(p_week_start, app.get_week_start(CURRENT_DATE));

  RETURN QUERY
  WITH deviations AS (
    SELECT
      COALESCE(SUM(excess_kcal), 0) AS total_excess,
      COUNT(*) AS dev_count
    FROM app.diet_deviations
    WHERE user_id = p_user_id
      AND deviation_date >= v_week_start
      AND deviation_date < v_week_start + 7
  ),
  compensations AS (
    SELECT COALESCE(SUM(ABS(kcal_adjustment)), 0) AS total_comp
    FROM app.daily_compensation_plan
    WHERE user_id = p_user_id
      AND compensation_date >= v_week_start
      AND compensation_date < v_week_start + 7
      AND is_applied = TRUE
  ),
  targets AS (
    SELECT
      COALESCE(wt.daily_target_kcal, np.daily_target_kcal, 2000) AS daily_tgt
    FROM app.nutrition_profiles np
    LEFT JOIN app.weekly_calorie_targets wt ON wt.user_id = np.user_id AND wt.week_start_date = v_week_start
    WHERE np.user_id = p_user_id
  )
  SELECT
    v_week_start,
    t.daily_tgt,
    t.daily_tgt * 7,
    d.total_excess::INTEGER,
    d.total_excess::INTEGER,
    c.total_comp::INTEGER,
    (d.total_excess - c.total_comp)::INTEGER,
    d.dev_count::INTEGER,
    CASE
      WHEN d.total_excess = 0 THEN 'none'
      WHEN c.total_comp >= d.total_excess THEN 'completed'
      WHEN c.total_comp > 0 THEN 'partial'
      ELSE 'pending'
    END
  FROM deviations d, compensations c, targets t;
END;
$$ LANGUAGE plpgsql;

-- 8. Funcion para registrar un salto de dieta
CREATE OR REPLACE FUNCTION app.register_diet_deviation(
  p_user_id INTEGER,
  p_date DATE,
  p_meal_slot VARCHAR(20),
  p_excess_kcal INTEGER,
  p_description TEXT DEFAULT NULL,
  p_confidence VARCHAR(10) DEFAULT 'medio',
  p_excess_protein DECIMAL DEFAULT 0,
  p_excess_carbs DECIMAL DEFAULT 0,
  p_excess_fat DECIMAL DEFAULT 0
)
RETURNS INTEGER AS $$
DECLARE
  v_deviation_id INTEGER;
  v_comp RECORD;
BEGIN
  -- Insertar el salto
  INSERT INTO app.diet_deviations (
    user_id, deviation_date, meal_slot, excess_kcal,
    description, confidence_level,
    excess_protein_g, excess_carbs_g, excess_fat_g
  ) VALUES (
    p_user_id, p_date, p_meal_slot, p_excess_kcal,
    p_description, p_confidence,
    p_excess_protein, p_excess_carbs, p_excess_fat
  )
  RETURNING id INTO v_deviation_id;

  -- Generar plan de compensacion automatico
  FOR v_comp IN
    SELECT * FROM app.calculate_compensation(p_user_id, p_excess_kcal, p_date, p_confidence)
  LOOP
    INSERT INTO app.daily_compensation_plan (
      user_id, deviation_id, compensation_date, kcal_adjustment,
      protein_g_target, carbs_g_adjustment, fat_g_adjustment
    ) VALUES (
      p_user_id, v_deviation_id, v_comp.compensation_date, v_comp.kcal_reduction,
      v_comp.protein_g_target, v_comp.carbs_g_adjustment, v_comp.fat_g_adjustment
    )
    ON CONFLICT (user_id, compensation_date, deviation_id) DO UPDATE SET
      kcal_adjustment = EXCLUDED.kcal_adjustment,
      protein_g_target = EXCLUDED.protein_g_target,
      carbs_g_adjustment = EXCLUDED.carbs_g_adjustment,
      fat_g_adjustment = EXCLUDED.fat_g_adjustment;
  END LOOP;

  RETURN v_deviation_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- 9. Trigger para actualizar timestamps
CREATE OR REPLACE FUNCTION app.update_deviation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_diet_deviation_updated ON app.diet_deviations;
CREATE TRIGGER trg_diet_deviation_updated
  BEFORE UPDATE ON app.diet_deviations
  FOR EACH ROW
  EXECUTE FUNCTION app.update_deviation_timestamp();

DROP TRIGGER IF EXISTS trg_weekly_target_updated ON app.weekly_calorie_targets;
CREATE TRIGGER trg_weekly_target_updated
  BEFORE UPDATE ON app.weekly_calorie_targets
  FOR EACH ROW
  EXECUTE FUNCTION app.update_deviation_timestamp();

-- ============================================================================
-- DATOS INICIALES
-- ============================================================================

-- Crear configuracion por defecto para usuarios con perfil nutricional
INSERT INTO app.diet_deviation_config (user_id)
SELECT np.user_id
FROM app.nutrition_profiles np
WHERE NOT EXISTS (
  SELECT 1 FROM app.diet_deviation_config WHERE user_id = np.user_id
)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- PERMISOS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.diet_deviations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON app.weekly_calorie_targets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON app.daily_compensation_plan TO authenticated;
GRANT SELECT, INSERT, UPDATE ON app.diet_deviation_config TO authenticated;

GRANT EXECUTE ON FUNCTION app.get_week_start TO authenticated;
GRANT EXECUTE ON FUNCTION app.calculate_compensation TO authenticated;
GRANT EXECUTE ON FUNCTION app.get_weekly_deviation_summary TO authenticated;
GRANT EXECUTE ON FUNCTION app.register_diet_deviation TO authenticated;

-- Secuencias
GRANT USAGE, SELECT ON SEQUENCE app.diet_deviations_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE app.weekly_calorie_targets_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE app.daily_compensation_plan_id_seq TO authenticated;

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================
