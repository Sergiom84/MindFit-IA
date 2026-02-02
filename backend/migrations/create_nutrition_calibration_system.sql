-- ============================================================================
-- SISTEMA DE CALIBRACIÓN NUTRICIONAL Y VALIDACIÓN DE MEDICIONES
-- Tablas para ajuste dinámico del GCT basado en datos reales del usuario
-- ============================================================================

-- 1. Tabla de historial de mediciones corporales
CREATE TABLE IF NOT EXISTS app.user_body_measurements (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  
  -- Mediciones corporales
  peso_kg DECIMAL(5,2) NOT NULL,
  cintura_cm DECIMAL(5,2),
  cuello_cm DECIMAL(5,2),
  cadera_cm DECIMAL(5,2),
  pecho_cm DECIMAL(5,2),
  brazo_cm DECIMAL(5,2),
  pierna_cm DECIMAL(5,2),
  
  -- Composición corporal (opcional)
  bodyfat_percent DECIMAL(4,2),
  muscle_mass_kg DECIMAL(5,2),
  
  -- Metadata de medición
  measurement_date DATE DEFAULT CURRENT_DATE,
  source VARCHAR(20) DEFAULT 'manual' CHECK (source IN ('manual', 'auto', 'calibration', 'integration')),
  
  -- Validación
  flagged_suspicious BOOLEAN DEFAULT FALSE,
  suspension_reason TEXT,
  validated BOOLEAN DEFAULT TRUE,
  
  -- Notas opcionales
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_body_measurements_user_date ON app.user_body_measurements(user_id, measurement_date DESC);
CREATE INDEX IF NOT EXISTS idx_body_measurements_flagged ON app.user_body_measurements(user_id, flagged_suspicious) WHERE flagged_suspicious = TRUE;

COMMENT ON TABLE app.user_body_measurements IS 'Historial de mediciones corporales del usuario para seguimiento y calibración';
COMMENT ON COLUMN app.user_body_measurements.flagged_suspicious IS 'Marca mediciones sospechosas que requieren validación (ej: cambio de cintura > 2.5cm en 7 días)';

-- 2. Tabla de calibraciones nutricionales
CREATE TABLE IF NOT EXISTS app.nutrition_calibrations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  
  -- Periodo de evaluación
  calibration_date DATE DEFAULT CURRENT_DATE,
  evaluation_period_days INTEGER DEFAULT 14,
  
  -- Datos de entrada (peso)
  peso_inicial_kg DECIMAL(5,2) NOT NULL,
  peso_final_kg DECIMAL(5,2) NOT NULL,
  peso_medio_7dias_kg DECIMAL(5,2) NOT NULL,
  
  -- Cambio observado
  peso_change_kg DECIMAL(5,2),
  peso_change_pct DECIMAL(5,3), -- % de cambio de peso
  weekly_change_pct DECIMAL(5,3), -- % de cambio semanal
  
  -- GCT actual y objetivo anterior
  current_kcal_objetivo INTEGER NOT NULL,
  previous_tdee INTEGER NOT NULL,
  
  -- Objetivo del usuario en el momento de calibración
  objetivo VARCHAR(20) NOT NULL CHECK (objetivo IN ('cut', 'mant', 'bulk')),
  
  -- Ajuste calculado
  adjustment_kcal INTEGER, -- +/- kcal recomendadas
  adjustment_reason TEXT,
  should_adjust BOOLEAN DEFAULT FALSE,
  
  -- Estado
  applied BOOLEAN DEFAULT FALSE,
  new_kcal_objetivo INTEGER,
  applied_at TIMESTAMP,
  
  -- Metadata adicional
  user_feedback TEXT, -- Retroalimentación del usuario sobre el ajuste
  performance_notes TEXT, -- Notas sobre rendimiento deportivo
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nutrition_calibrations_user ON app.nutrition_calibrations(user_id, calibration_date DESC);
CREATE INDEX IF NOT EXISTS idx_nutrition_calibrations_applied ON app.nutrition_calibrations(applied) WHERE applied = FALSE;

COMMENT ON TABLE app.nutrition_calibrations IS 'Registro de calibraciones nutricionales automáticas y ajustes del GCT';
COMMENT ON COLUMN app.nutrition_calibrations.adjustment_kcal IS 'Ajuste recomendado en kcal (+/- 150-250) según reglas anti-ruido';
COMMENT ON COLUMN app.nutrition_calibrations.should_adjust IS 'Indica si se debe aplicar el ajuste según las reglas de la fase';

-- 3. Tabla de configuración de calibración por usuario
CREATE TABLE IF NOT EXISTS app.user_calibration_config (
  user_id INTEGER PRIMARY KEY REFERENCES app.users(id) ON DELETE CASCADE,
  
  -- Configuración de calibración automática
  auto_calibrate BOOLEAN DEFAULT TRUE,
  calibration_frequency_days INTEGER DEFAULT 14 CHECK (calibration_frequency_days >= 7 AND calibration_frequency_days <= 60),
  
  -- Preferencias de ajuste
  min_measurements_required INTEGER DEFAULT 5, -- Mínimo de mediciones en 14 días (media móvil)
  max_adjustment_kcal INTEGER DEFAULT 250, -- Máximo ajuste por iteración
  
  -- Notificaciones
  notify_calibration BOOLEAN DEFAULT TRUE,
  notify_suspicious_measurement BOOLEAN DEFAULT TRUE,
  
  -- Última calibración
  last_calibration_date DATE,
  next_calibration_date DATE,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE app.user_calibration_config IS 'Configuración personalizada de calibración nutricional por usuario';

-- 4. Añadir columna auto_calibrate a nutrition_profiles si no existe
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'app' 
    AND table_name = 'nutrition_profiles' 
    AND column_name = 'auto_calibrate'
  ) THEN
    ALTER TABLE app.nutrition_profiles ADD COLUMN auto_calibrate BOOLEAN DEFAULT TRUE;
  END IF;
END $$;

-- 4b. Asegurar columnas base usadas por calibración/vistas
-- Nota: algunos entornos pueden tener un schema más antiguo de nutrition_profiles.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app'
      AND table_name = 'nutrition_profiles'
      AND column_name = 'kcal_objetivo'
  ) THEN
    ALTER TABLE app.nutrition_profiles ADD COLUMN kcal_objetivo INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app'
      AND table_name = 'nutrition_profiles'
      AND column_name = 'tdee'
  ) THEN
    ALTER TABLE app.nutrition_profiles ADD COLUMN tdee INTEGER;
  END IF;
END $$;

-- ============================================================================
-- FUNCIONES DE UTILIDAD
-- ============================================================================

-- 5. Función para calcular media de peso de los últimos N días (documentación: 14 días)
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
    AVG(peso_kg)::DECIMAL(5,2) as media_peso,
    COUNT(*)::INTEGER as num_measurements,
    (COUNT(*) >= p_min_measurements) as is_valid
  FROM app.user_body_measurements
  WHERE user_id = p_user_id
  AND measurement_date >= CURRENT_DATE - INTERVAL '1 day' * p_days
  AND validated = TRUE
  AND flagged_suspicious = FALSE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.calculate_weight_average IS 'Calcula la media móvil de peso de los últimos N días (default 14 según documentación) con validación de cantidad mínima de mediciones';

-- 6. Función para validar si una medición de cintura es sospechosa
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
  -- Obtener última medición de cintura en los últimos 7 días
  SELECT cintura_cm, peso_kg, measurement_date
  INTO v_prev_waist, v_prev_weight, v_prev_date
  FROM app.user_body_measurements
  WHERE user_id = p_user_id
  AND cintura_cm IS NOT NULL
  AND measurement_date >= CURRENT_DATE - INTERVAL '7 days'
  AND validated = TRUE
  ORDER BY measurement_date DESC
  LIMIT 1;

  -- Si no hay medición previa, no es sospechosa
  IF v_prev_waist IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, FALSE, NULL::DECIMAL(5,2), NULL::DECIMAL(5,2), NULL::DECIMAL(5,2);
    RETURN;
  END IF;

  -- Calcular cambios
  v_days_diff := CURRENT_DATE - v_prev_date;
  v_waist_change := ABS(p_new_waist_cm - v_prev_waist);
  v_weight_change := ABS(p_new_weight_kg - v_prev_weight);

  -- Regla: cambio > 2.5 cm en 7 días sin cambio de peso coherente
  IF v_waist_change > 2.5 THEN
    -- Peso coherente: al menos 0.5 kg por cada 2.5 cm de cintura
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

  -- No es sospechosa
  RETURN QUERY SELECT FALSE, NULL::TEXT, FALSE, v_prev_waist, v_waist_change, v_weight_change;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.validate_waist_measurement IS 'Valida si un cambio de cintura es sospechoso (>2.5cm en 7 días sin cambio proporcional de peso)';

-- 6b. Función para validar si un cambio de peso es sospechoso (> 3 kg en 7 días)
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
  -- Obtener última medición de peso en los últimos 7 días
  SELECT peso_kg, cintura_cm, measurement_date
  INTO v_prev_weight, v_prev_waist, v_prev_date
  FROM app.user_body_measurements
  WHERE user_id = p_user_id
  AND measurement_date >= CURRENT_DATE - INTERVAL '7 days'
  AND validated = TRUE
  ORDER BY measurement_date DESC
  LIMIT 1;

  -- Si no hay medición previa, no es sospechosa
  IF v_prev_weight IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, FALSE, NULL::DECIMAL(5,2), NULL::DECIMAL(5,2), NULL::INTEGER;
    RETURN;
  END IF;

  -- Calcular cambios
  v_days_diff := CURRENT_DATE - v_prev_date;
  v_weight_change := ABS(p_new_weight_kg - v_prev_weight);

  -- Regla documentación: Peso cambia > 3 kg en 7 días sin cambios coherentes en cintura y/o pliegue
  IF v_weight_change > 3.0 AND v_days_diff <= 7 THEN
    -- Si tenemos datos de cintura, verificar coherencia
    IF p_new_waist_cm IS NOT NULL AND v_prev_waist IS NOT NULL THEN
      v_waist_change := ABS(p_new_waist_cm - v_prev_waist);
      
      -- Si el peso cambió mucho pero la cintura no cambió proporcionalmente, es sospechoso
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
      -- Sin datos de cintura, marcar como sospechoso si > 3 kg en 7 días
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

  -- No es sospechosa
  RETURN QUERY SELECT FALSE, NULL::TEXT, FALSE, v_prev_weight, v_weight_change, v_days_diff;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.validate_weight_change IS 'Valida si un cambio de peso es sospechoso (>3kg en 7 días según documentación)';


-- 7. Función para verificar si toca calibración nutricional
CREATE OR REPLACE FUNCTION app.should_trigger_nutrition_calibration(p_user_id INTEGER)
RETURNS TABLE (
  should_calibrate BOOLEAN,
  days_since_last INTEGER,
  last_calibration_date DATE,
  next_calibration_date DATE,
  reason TEXT
) AS $$
DECLARE
  v_config RECORD;
  v_last_calibration_date DATE;
  v_days_since INTEGER;
  v_frequency INTEGER;
BEGIN
  -- Obtener configuración del usuario
  SELECT * INTO v_config
  FROM app.user_calibration_config
  WHERE user_id = p_user_id;

  -- Si no existe configuración, crear con defaults
  IF NOT FOUND THEN
    INSERT INTO app.user_calibration_config (user_id)
    VALUES (p_user_id)
    RETURNING * INTO v_config;
  END IF;

  -- Si auto_calibrate está desactivado
  IF v_config.auto_calibrate = FALSE THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::DATE, NULL::DATE, 'Calibración automática desactivada'::TEXT;
    RETURN;
  END IF;

  v_frequency := COALESCE(v_config.calibration_frequency_days, 14);

  -- Obtener última calibración
  SELECT calibration_date INTO v_last_calibration_date
  FROM app.nutrition_calibrations
  WHERE user_id = p_user_id
  ORDER BY calibration_date DESC
  LIMIT 1;

  -- Si nunca ha calibrado, debe calibrar
  IF v_last_calibration_date IS NULL THEN
    RETURN QUERY SELECT TRUE, NULL::INTEGER, NULL::DATE, CURRENT_DATE, 'Primera calibración'::TEXT;
    RETURN;
  END IF;

  -- Calcular días desde última calibración
  v_days_since := CURRENT_DATE - v_last_calibration_date;

  -- Verificar si toca calibración
  IF v_days_since >= v_frequency THEN
    RETURN QUERY SELECT 
      TRUE,
      v_days_since,
      v_last_calibration_date,
      v_last_calibration_date + v_frequency,
      FORMAT('Han pasado %s días desde la última calibración (frecuencia: %s días)', v_days_since, v_frequency);
  ELSE
    RETURN QUERY SELECT 
      FALSE,
      v_days_since,
      v_last_calibration_date,
      v_last_calibration_date + v_frequency,
      FORMAT('Próxima calibración en %s días', v_frequency - v_days_since);
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.should_trigger_nutrition_calibration IS 'Determina si el usuario debe realizar una calibración nutricional';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- 8. Trigger para actualizar updated_at en body_measurements
CREATE OR REPLACE FUNCTION app.update_body_measurements_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_body_measurements_updated ON app.user_body_measurements;
CREATE TRIGGER trg_body_measurements_updated
  BEFORE UPDATE ON app.user_body_measurements
  FOR EACH ROW
  EXECUTE FUNCTION app.update_body_measurements_timestamp();

-- 9. Trigger para actualizar next_calibration_date cuando se configura la frecuencia
CREATE OR REPLACE FUNCTION app.update_next_calibration_date()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.calibration_frequency_days IS DISTINCT FROM OLD.calibration_frequency_days OR
     NEW.last_calibration_date IS DISTINCT FROM OLD.last_calibration_date THEN
    
    IF NEW.last_calibration_date IS NOT NULL THEN
      NEW.next_calibration_date := NEW.last_calibration_date + NEW.calibration_frequency_days;
    ELSE
      NEW.next_calibration_date := CURRENT_DATE + NEW.calibration_frequency_days;
    END IF;
  END IF;
  
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calibration_config_updated ON app.user_calibration_config;
CREATE TRIGGER trg_calibration_config_updated
  BEFORE UPDATE ON app.user_calibration_config
  FOR EACH ROW
  EXECUTE FUNCTION app.update_next_calibration_date();

-- 10. Trigger para actualizar last_calibration_date cuando se aplica una calibración
CREATE OR REPLACE FUNCTION app.update_last_calibration_on_apply()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.applied = TRUE AND OLD.applied = FALSE THEN
    UPDATE app.user_calibration_config
    SET last_calibration_date = NEW.calibration_date,
        next_calibration_date = NEW.calibration_date + calibration_frequency_days
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_calibration_on_apply ON app.nutrition_calibrations;
CREATE TRIGGER trg_update_calibration_on_apply
  AFTER UPDATE ON app.nutrition_calibrations
  FOR EACH ROW
  EXECUTE FUNCTION app.update_last_calibration_on_apply();

-- ============================================================================
-- VISTAS
-- ============================================================================

-- 11. Vista consolidada de calibraciones pendientes
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
   FROM app.user_body_measurements ubm 
   WHERE ubm.user_id = ucc.user_id 
   AND ubm.measurement_date >= CURRENT_DATE - INTERVAL '7 days'
   AND ubm.validated = TRUE
   AND ubm.flagged_suspicious = FALSE
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

-- ============================================================================
-- DATOS INICIALES
-- ============================================================================

-- 12. Crear configuración de calibración para usuarios existentes con perfil nutricional
INSERT INTO app.user_calibration_config (user_id, auto_calibrate, last_calibration_date)
SELECT np.user_id, TRUE, CURRENT_DATE - INTERVAL '14 days'
FROM app.nutrition_profiles np
WHERE NOT EXISTS (
  SELECT 1 FROM app.user_calibration_config WHERE user_id = np.user_id
)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- PERMISOS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON app.user_body_measurements TO authenticated;
GRANT SELECT, INSERT, UPDATE ON app.nutrition_calibrations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON app.user_calibration_config TO authenticated;
GRANT SELECT ON app.v_pending_calibrations TO authenticated;

GRANT EXECUTE ON FUNCTION app.calculate_weight_average TO authenticated;
GRANT EXECUTE ON FUNCTION app.validate_waist_measurement TO authenticated;
GRANT EXECUTE ON FUNCTION app.should_trigger_nutrition_calibration TO authenticated;

-- Secuencias
GRANT USAGE, SELECT ON SEQUENCE app.user_body_measurements_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE app.nutrition_calibrations_id_seq TO authenticated;

-- ============================================================================
-- INDICES ADICIONALES PARA PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_body_measurements_peso 
  ON app.user_body_measurements(user_id, peso_kg);

CREATE INDEX IF NOT EXISTS idx_body_measurements_validated 
  ON app.user_body_measurements(user_id, validated, flagged_suspicious) 
  WHERE validated = TRUE AND flagged_suspicious = FALSE;

CREATE INDEX IF NOT EXISTS idx_calibrations_should_adjust 
  ON app.nutrition_calibrations(user_id, should_adjust) 
  WHERE should_adjust = TRUE;

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================

-- Para verificar la instalación correcta:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'app' AND tablename LIKE '%calibration%';
-- SELECT proname FROM pg_proc WHERE proname LIKE '%calibrat%' OR proname LIKE '%weight%' OR proname LIKE '%waist%';
