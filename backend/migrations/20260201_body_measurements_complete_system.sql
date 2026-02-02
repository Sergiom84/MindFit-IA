-- ============================================================================
-- SISTEMA COMPLETO DE MEDICIONES CORPORALES CON VALIDACIÓN
-- Tabla para peso, cintura, perímetros musculares y pliegues cutáneos
-- ============================================================================

-- 1. Tabla principal de mediciones corporales
CREATE TABLE IF NOT EXISTS app.body_measurements (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

  -- Fecha y condiciones de medición
  measurement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  time_of_day VARCHAR(20) CHECK (time_of_day IN ('morning', 'afternoon', 'evening', 'night')),
  is_fasted BOOLEAN DEFAULT TRUE,
  post_workout BOOLEAN DEFAULT FALSE,
  notes TEXT,

  -- Mediciones básicas (siempre recomendadas)
  weight_kg DECIMAL(5,2) NOT NULL,
  waist_cm DECIMAL(5,2) NOT NULL,

  -- Perímetros musculares (opcionales pero recomendados)
  biceps_cm DECIMAL(5,2),          -- Bíceps en su punto máximo
  chest_cm DECIMAL(5,2),           -- Pecho a nivel de pezones
  calf_cm DECIMAL(5,2),            -- Gemelo en su punto máximo

  -- Pliegues cutáneos (opcional, para usuarios avanzados)
  skinfold_abdominal_mm DECIMAL(4,1),   -- Pliegue abdominal (al lado del ombligo)
  skinfold_triceps_mm DECIMAL(4,1),     -- Pliegue tricipital (opcional)
  skinfold_subscapular_mm DECIMAL(4,1), -- Pliegue subescapular (opcional)

  -- Estado de validación
  is_validated BOOLEAN DEFAULT FALSE,
  validation_warnings JSONB DEFAULT '[]'::JSONB,
  -- Formato: [{ severity, code, message, suggestion, data }]

  requires_confirmation BOOLEAN DEFAULT FALSE,
  user_confirmed BOOLEAN DEFAULT FALSE,
  confirmed_at TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_body_measurements_user ON app.body_measurements(user_id);
CREATE INDEX IF NOT EXISTS idx_body_measurements_date ON app.body_measurements(measurement_date DESC);
CREATE INDEX IF NOT EXISTS idx_body_measurements_user_date ON app.body_measurements(user_id, measurement_date DESC);
CREATE INDEX IF NOT EXISTS idx_body_measurements_validation ON app.body_measurements(user_id, is_validated) WHERE requires_confirmation = TRUE;

COMMENT ON TABLE app.body_measurements IS 'Mediciones corporales completas con validación automática de datos sospechosos';
COMMENT ON COLUMN app.body_measurements.validation_warnings IS 'Array de advertencias detectadas por el sistema de validación';
COMMENT ON COLUMN app.body_measurements.requires_confirmation IS 'TRUE si el sistema detectó mediciones sospechosas que requieren confirmación del usuario';

-- 2. Vista para obtener cambios entre mediciones
CREATE OR REPLACE VIEW app.v_measurement_changes AS
SELECT
  curr.id,
  curr.user_id,
  curr.measurement_date,
  curr.weight_kg,
  curr.waist_cm,
  curr.biceps_cm,
  curr.chest_cm,
  curr.calf_cm,
  curr.skinfold_abdominal_mm,

  -- Medición previa
  prev.measurement_date as prev_date,
  prev.weight_kg as prev_weight,
  prev.waist_cm as prev_waist,

  -- Cambios calculados
  (curr.measurement_date - prev.measurement_date)::INTEGER as days_between,
  (curr.weight_kg - prev.weight_kg) as weight_change_kg,
  ((curr.weight_kg - prev.weight_kg) / prev.weight_kg * 100) as weight_change_pct,
  (curr.waist_cm - prev.waist_cm) as waist_change_cm,

  -- Cambios perímetros musculares
  (curr.biceps_cm - prev.biceps_cm) as biceps_change_cm,
  (curr.chest_cm - prev.chest_cm) as chest_change_cm,
  (curr.calf_cm - prev.calf_cm) as calf_change_cm,

  -- ICG/IPG (si aplica)
  CASE
    WHEN (curr.weight_kg - prev.weight_kg) > 0
    THEN (curr.waist_cm - prev.waist_cm) / (curr.weight_kg - prev.weight_kg)
    ELSE NULL
  END as icg_ratio,

  CASE
    WHEN (prev.weight_kg - curr.weight_kg) > 0
    THEN (prev.waist_cm - curr.waist_cm) / (prev.weight_kg - curr.weight_kg)
    ELSE NULL
  END as ipg_ratio,

  -- Estado de validación
  curr.is_validated,
  curr.requires_confirmation,
  curr.validation_warnings

FROM app.body_measurements curr
LEFT JOIN LATERAL (
  SELECT *
  FROM app.body_measurements
  WHERE user_id = curr.user_id
    AND measurement_date < curr.measurement_date
  ORDER BY measurement_date DESC
  LIMIT 1
) prev ON TRUE;

COMMENT ON VIEW app.v_measurement_changes IS 'Vista consolidada de cambios entre mediciones con cálculo automático de ICG/IPG';

-- 3. Función para obtener la última medición validada
CREATE OR REPLACE FUNCTION app.get_last_validated_measurement(p_user_id INTEGER)
RETURNS TABLE (
  measurement_date DATE,
  weight_kg DECIMAL,
  waist_cm DECIMAL,
  biceps_cm DECIMAL,
  chest_cm DECIMAL,
  calf_cm DECIMAL,
  skinfold_abdominal_mm DECIMAL,
  days_ago INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    bm.measurement_date,
    bm.weight_kg,
    bm.waist_cm,
    bm.biceps_cm,
    bm.chest_cm,
    bm.calf_cm,
    bm.skinfold_abdominal_mm,
    (CURRENT_DATE - bm.measurement_date)::INTEGER as days_ago
  FROM app.body_measurements bm
  WHERE bm.user_id = p_user_id
    AND bm.is_validated = TRUE
  ORDER BY bm.measurement_date DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- 4. Función para calcular tendencia de peso (media móvil 7 días)
CREATE OR REPLACE FUNCTION app.calculate_weight_trend(p_user_id INTEGER, p_days INTEGER DEFAULT 7)
RETURNS TABLE (
  avg_weight DECIMAL,
  avg_waist DECIMAL,
  measurements_count INTEGER,
  latest_date DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    AVG(weight_kg)::DECIMAL(5,2) as avg_weight,
    AVG(waist_cm)::DECIMAL(5,2) as avg_waist,
    COUNT(*)::INTEGER as measurements_count,
    MAX(measurement_date) as latest_date
  FROM app.body_measurements
  WHERE user_id = p_user_id
    AND measurement_date >= CURRENT_DATE - p_days
    AND is_validated = TRUE;
END;
$$ LANGUAGE plpgsql;

-- 5. Función para detectar necesidad de reevaluación de fase
-- (basado en cambios sostenidos de peso/cintura)
CREATE OR REPLACE FUNCTION app.should_reevaluate_phase(p_user_id INTEGER)
RETURNS TABLE (
  should_reevaluate BOOLEAN,
  reason TEXT,
  weight_trend VARCHAR(20),
  waist_trend VARCHAR(20),
  icg_status VARCHAR(20),
  days_since_last INTEGER
) AS $$
DECLARE
  v_current_weight DECIMAL;
  v_current_waist DECIMAL;
  v_week_ago_weight DECIMAL;
  v_week_ago_waist DECIMAL;
  v_two_weeks_ago_weight DECIMAL;
  v_two_weeks_ago_waist DECIMAL;
  v_weight_trend VARCHAR(20);
  v_waist_trend VARCHAR(20);
  v_should_eval BOOLEAN := FALSE;
  v_reason TEXT := '';
  v_icg DECIMAL;
  v_icg_status VARCHAR(20) := 'unknown';
BEGIN
  -- Obtener medición actual (última validada)
  SELECT weight_kg, waist_cm INTO v_current_weight, v_current_waist
  FROM app.body_measurements
  WHERE user_id = p_user_id AND is_validated = TRUE
  ORDER BY measurement_date DESC LIMIT 1;

  -- Obtener medición de hace ~7 días
  SELECT weight_kg, waist_cm INTO v_week_ago_weight, v_week_ago_waist
  FROM app.body_measurements
  WHERE user_id = p_user_id
    AND is_validated = TRUE
    AND measurement_date BETWEEN CURRENT_DATE - 9 AND CURRENT_DATE - 5
  ORDER BY measurement_date DESC LIMIT 1;

  -- Obtener medición de hace ~14 días
  SELECT weight_kg, waist_cm INTO v_two_weeks_ago_weight, v_two_weeks_ago_waist
  FROM app.body_measurements
  WHERE user_id = p_user_id
    AND is_validated = TRUE
    AND measurement_date BETWEEN CURRENT_DATE - 16 AND CURRENT_DATE - 12
  ORDER BY measurement_date DESC LIMIT 1;

  -- Si no hay suficientes mediciones, no evaluar
  IF v_current_weight IS NULL OR v_two_weeks_ago_weight IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Faltan mediciones para evaluar tendencia', NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR, NULL::INTEGER;
    RETURN;
  END IF;

  -- Calcular tendencias
  IF v_current_weight > v_two_weeks_ago_weight + 0.5 THEN
    v_weight_trend := 'gaining';
  ELSIF v_current_weight < v_two_weeks_ago_weight - 0.5 THEN
    v_weight_trend := 'losing';
  ELSE
    v_weight_trend := 'stable';
  END IF;

  IF v_current_waist > v_two_weeks_ago_waist + 1.0 THEN
    v_waist_trend := 'increasing';
  ELSIF v_current_waist < v_two_weeks_ago_waist - 1.0 THEN
    v_waist_trend := 'decreasing';
  ELSE
    v_waist_trend := 'stable';
  END IF;

  -- Calcular ICG si está ganando peso
  IF v_weight_trend = 'gaining' THEN
    v_icg := (v_current_waist - v_two_weeks_ago_waist) / (v_current_weight - v_two_weeks_ago_weight);

    IF v_icg >= 1.5 THEN
      v_icg_status := 'red';
      v_should_eval := TRUE;
      v_reason := 'ICG >= 1.5 (ganancia de grasa excesiva)';
    ELSIF v_icg >= 1.0 THEN
      v_icg_status := 'yellow';
      v_should_eval := TRUE;
      v_reason := 'ICG >= 1.0 (volumen descontrolado)';
    ELSIF v_icg >= 0.8 THEN
      v_icg_status := 'green';
    ELSE
      v_icg_status := 'green_plus';
    END IF;
  END IF;

  -- Evaluar pérdida de peso con cintura estable (posible pérdida muscular)
  IF v_weight_trend = 'losing' AND v_waist_trend = 'stable' THEN
    v_should_eval := TRUE;
    v_reason := 'Perdiendo peso pero cintura estable - posible pérdida muscular';
  END IF;

  RETURN QUERY SELECT
    v_should_eval,
    v_reason,
    v_weight_trend,
    v_waist_trend,
    v_icg_status,
    (CURRENT_DATE - (SELECT MAX(measurement_date) FROM app.body_measurements WHERE user_id = p_user_id))::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- 6. Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION app.update_measurement_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_body_measurement_updated ON app.body_measurements;
CREATE TRIGGER trg_body_measurement_updated
  BEFORE UPDATE ON app.body_measurements
  FOR EACH ROW
  EXECUTE FUNCTION app.update_measurement_timestamp();

-- ============================================================================
-- PERMISOS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON app.body_measurements TO authenticated;
GRANT SELECT ON app.v_measurement_changes TO authenticated;
GRANT EXECUTE ON FUNCTION app.get_last_validated_measurement TO authenticated;
GRANT EXECUTE ON FUNCTION app.calculate_weight_trend TO authenticated;
GRANT EXECUTE ON FUNCTION app.should_reevaluate_phase TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE app.body_measurements_id_seq TO authenticated;

-- ============================================================================
-- ÍNDICES ADICIONALES PARA PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_body_measurements_validated_recent
  ON app.body_measurements(user_id, measurement_date DESC)
  WHERE is_validated = TRUE;

CREATE INDEX IF NOT EXISTS idx_body_measurements_unconfirmed
  ON app.body_measurements(user_id, requires_confirmation)
  WHERE requires_confirmation = TRUE AND user_confirmed = FALSE;

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================
