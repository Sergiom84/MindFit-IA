-- Unificar calibración nutricional con app.body_measurements (fuente única)

-- 1) Media móvil de peso sobre body_measurements
CREATE OR REPLACE FUNCTION app.calculate_weight_average(
  p_user_id INTEGER,
  p_days INTEGER DEFAULT 14,
  p_min_measurements INTEGER DEFAULT 5
)
RETURNS TABLE (
  media_peso DECIMAL(5,2),
  num_measurements INTEGER,
  is_valid BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    AVG(weight_kg)::DECIMAL(5,2) as media_peso,
    COUNT(*)::INTEGER as num_measurements,
    (COUNT(*) >= p_min_measurements) as is_valid
  FROM app.body_measurements
  WHERE user_id = p_user_id
  AND measurement_date >= CURRENT_DATE - INTERVAL '1 day' * p_days
  AND is_validated = TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.calculate_weight_average IS 'Calcula la media móvil de peso de los últimos N días (default 14 según documentación) con validación de cantidad mínima de mediciones';

-- 2) Validación de cintura sobre body_measurements
CREATE OR REPLACE FUNCTION app.validate_waist_measurement(
  p_user_id INTEGER,
  p_new_waist_cm DECIMAL(5,2),
  p_new_weight_kg DECIMAL(5,2)
)
RETURNS TABLE (
  is_suspicious BOOLEAN,
  reason TEXT,
  should_repeat BOOLEAN,
  previous_value DECIMAL(5,2),
  waist_change DECIMAL(5,2),
  weight_change DECIMAL(5,2)
) AS $$
DECLARE
  v_prev_waist DECIMAL(5,2);
  v_prev_weight DECIMAL(5,2);
  v_prev_date DATE;
  v_days_diff INTEGER;
  v_waist_change DECIMAL(5,2);
  v_weight_change DECIMAL(5,2);
  v_expected_weight_change DECIMAL(5,2);
BEGIN
  SELECT waist_cm, weight_kg, measurement_date
  INTO v_prev_waist, v_prev_weight, v_prev_date
  FROM app.body_measurements
  WHERE user_id = p_user_id
  AND waist_cm IS NOT NULL
  AND measurement_date >= CURRENT_DATE - INTERVAL '7 days'
  AND is_validated = TRUE
  ORDER BY measurement_date DESC
  LIMIT 1;

  IF v_prev_waist IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, FALSE, NULL::DECIMAL(5,2), NULL::DECIMAL(5,2), NULL::DECIMAL(5,2);
    RETURN;
  END IF;

  v_days_diff := CURRENT_DATE - v_prev_date;
  v_waist_change := ABS(p_new_waist_cm - v_prev_waist);
  v_weight_change := ABS(p_new_weight_kg - v_prev_weight);

  IF v_waist_change > 2.5 THEN
    v_expected_weight_change := (v_waist_change / 2.5) * 0.5;

    IF v_weight_change < (v_expected_weight_change * 0.5) THEN
      RETURN QUERY SELECT 
        TRUE,
        FORMAT('Cambio de cintura de %.1f cm en %s días sin cambio proporcional de peso (%.1f kg)', 
               v_waist_change, v_days_diff, v_weight_change),
        TRUE,
        v_prev_waist,
        v_waist_change,
        v_weight_change;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT FALSE, NULL::TEXT, FALSE, v_prev_waist, v_waist_change, v_weight_change;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.validate_waist_measurement IS 'Valida si un cambio de cintura es sospechoso (>2.5cm en 7 días sin cambio proporcional de peso)';

-- 3) Validación de peso sobre body_measurements
CREATE OR REPLACE FUNCTION app.validate_weight_change(
  p_user_id INTEGER,
  p_new_weight_kg DECIMAL(5,2),
  p_new_waist_cm DECIMAL(5,2) DEFAULT NULL
)
RETURNS TABLE (
  is_suspicious BOOLEAN,
  reason TEXT,
  should_repeat BOOLEAN,
  previous_weight DECIMAL(5,2),
  weight_change_kg DECIMAL(5,2),
  days_diff INTEGER
) AS $$
DECLARE
  v_prev_weight DECIMAL(5,2);
  v_prev_waist DECIMAL(5,2);
  v_prev_date DATE;
  v_days_diff INTEGER;
  v_weight_change DECIMAL(5,2);
  v_waist_change DECIMAL(5,2);
BEGIN
  SELECT weight_kg, waist_cm, measurement_date
  INTO v_prev_weight, v_prev_waist, v_prev_date
  FROM app.body_measurements
  WHERE user_id = p_user_id
  AND measurement_date >= CURRENT_DATE - INTERVAL '7 days'
  AND is_validated = TRUE
  ORDER BY measurement_date DESC
  LIMIT 1;

  IF v_prev_weight IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, FALSE, NULL::DECIMAL(5,2), NULL::DECIMAL(5,2), NULL::INTEGER;
    RETURN;
  END IF;

  v_days_diff := CURRENT_DATE - v_prev_date;
  v_weight_change := ABS(p_new_weight_kg - v_prev_weight);

  IF v_weight_change > 3.0 AND v_days_diff <= 7 THEN
    IF p_new_waist_cm IS NOT NULL AND v_prev_waist IS NOT NULL THEN
      v_waist_change := ABS(p_new_waist_cm - v_prev_waist);

      IF v_waist_change < 1.0 THEN
        RETURN QUERY SELECT 
          TRUE,
          FORMAT('Cambio de peso de %.1f kg en %s días sin cambio proporcional de cintura (%.1f cm)', 
                 v_weight_change, v_days_diff, v_waist_change),
          TRUE,
          v_prev_weight,
          v_weight_change,
          v_days_diff;
        RETURN;
      END IF;
    ELSE
      RETURN QUERY SELECT 
        TRUE,
        FORMAT('Cambio de peso muy rápido: %.1f kg en %s días - Verificar medición', 
               v_weight_change, v_days_diff),
        TRUE,
        v_prev_weight,
        v_weight_change,
        v_days_diff;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT FALSE, NULL::TEXT, FALSE, v_prev_weight, v_weight_change, v_days_diff;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.validate_weight_change IS 'Valida si un cambio de peso es sospechoso (>3kg en 7 días según documentación)';

-- 4) Trigger updated_at en body_measurements
CREATE OR REPLACE FUNCTION app.update_body_measurements_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_body_measurements_updated ON app.body_measurements;
CREATE TRIGGER trg_body_measurements_updated
  BEFORE UPDATE ON app.body_measurements
  FOR EACH ROW
  EXECUTE FUNCTION app.update_body_measurements_timestamp();

-- 5) Vista de calibraciones pendientes usando body_measurements
CREATE OR REPLACE VIEW app.v_pending_calibrations AS
SELECT 
  ucc.user_id,
  u.email,
  ucc.last_calibration_date,
  ucc.next_calibration_date,
  ucc.calibration_frequency_days,
  (CURRENT_DATE - COALESCE(ucc.last_calibration_date, CURRENT_DATE - 100)) as days_since_last,
  np.objetivo,
  np.kcal_objetivo,
  np.tdee,
  (SELECT COUNT(*) 
   FROM app.body_measurements bm 
   WHERE bm.user_id = ucc.user_id 
   AND bm.measurement_date >= CURRENT_DATE - INTERVAL '7 days'
   AND bm.is_validated = TRUE
  ) as measurements_last_7days
FROM app.user_calibration_config ucc
JOIN app.users u ON ucc.user_id = u.id
LEFT JOIN app.nutrition_profiles np ON ucc.user_id = np.user_id
WHERE ucc.auto_calibrate = TRUE
AND (
  ucc.last_calibration_date IS NULL 
  OR CURRENT_DATE >= ucc.next_calibration_date
);

COMMENT ON VIEW app.v_pending_calibrations IS 'Vista de usuarios que necesitan calibración nutricional';
