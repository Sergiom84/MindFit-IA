-- ============================================================================
-- SISTEMA DE CONFIRMACIÓN 2 SEMANAS PARA ICG/IPG
-- Tabla de historial de estados para validar cambios consecutivos
-- ============================================================================

-- Tabla de historial de estados ICG/IPG/IEC
CREATE TABLE IF NOT EXISTS app.icg_ipg_state_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  
  -- Fecha y tipo de medición
  measurement_date DATE NOT NULL,
  indicator_type VARCHAR(10) NOT NULL CHECK (indicator_type IN ('icg', 'ipg', 'iec')),
  
  -- Datos de la medición
  weight_kg DECIMAL(5,2) NOT NULL,
  waist_cm DECIMAL(5,2) NOT NULL,
  weight_change_kg DECIMAL(5,2),
  waist_change_cm DECIMAL(5,2),
  
  -- Valor y estado del indicador
  indicator_value DECIMAL(5,2),
  status VARCHAR(20) NOT NULL CHECK (status IN (
    'red', 'yellow', 'green', 'green_plus', 'neutral', 'unstable',
    'rojo', 'amarillo', 'verde', 'verde_plus'
  )),
  
  -- Contador de estados consecutivos
  consecutive_count INTEGER DEFAULT 1,
  previous_status VARCHAR(20),
  status_confirmed BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id, measurement_date, indicator_type)
);

CREATE INDEX IF NOT EXISTS idx_icg_ipg_history_user ON app.icg_ipg_state_history(user_id, measurement_date DESC);
CREATE INDEX IF NOT EXISTS idx_icg_ipg_history_type ON app.icg_ipg_state_history(user_id, indicator_type, measurement_date DESC);
CREATE INDEX IF NOT EXISTS idx_icg_ipg_history_status ON app.icg_ipg_state_history(user_id, status) WHERE status_confirmed = FALSE;

COMMENT ON TABLE app.icg_ipg_state_history IS 'Historial de estados ICG/IPG/IEC para validar confirmación de 2 semanas';
COMMENT ON COLUMN app.icg_ipg_state_history.consecutive_count IS 'Número de mediciones consecutivas con el mismo estado';
COMMENT ON COLUMN app.icg_ipg_state_history.status_confirmed IS 'TRUE cuando el estado se repite 2 mediciones consecutivas';

-- ============================================================================
-- FUNCIÓN PARA REGISTRAR Y VALIDAR ESTADO ICG/IPG
-- ============================================================================

CREATE OR REPLACE FUNCTION app.register_icg_ipg_state(
  p_user_id INTEGER,
  p_measurement_date DATE,
  p_indicator_type VARCHAR(10),
  p_weight_kg DECIMAL(5,2),
  p_waist_cm DECIMAL(5,2),
  p_weight_change DECIMAL(5,2),
  p_waist_change DECIMAL(5,2),
  p_indicator_value DECIMAL(5,2),
  p_status VARCHAR(20)
)
RETURNS TABLE (
  state_id INTEGER,
  consecutive_count INTEGER,
  status_confirmed BOOLEAN,
  previous_status VARCHAR(20),
  should_apply_change BOOLEAN,
  confirmation_reason TEXT
) AS $$
DECLARE
  v_last_state RECORD;
  v_consecutive INTEGER;
  v_confirmed BOOLEAN;
  v_should_apply BOOLEAN;
  v_reason TEXT;
  v_state_id INTEGER;
BEGIN
  -- Obtener último estado del mismo indicador
  SELECT * INTO v_last_state
  FROM app.icg_ipg_state_history
  WHERE user_id = p_user_id
  AND indicator_type = p_indicator_type
  ORDER BY measurement_date DESC
  LIMIT 1;
  
  -- Si no hay estado previo, es el primero
  IF v_last_state IS NULL THEN
    INSERT INTO app.icg_ipg_state_history (
      user_id, measurement_date, indicator_type,
      weight_kg, waist_cm, weight_change_kg, waist_change_cm,
      indicator_value, status, consecutive_count, status_confirmed
    ) VALUES (
      p_user_id, p_measurement_date, p_indicator_type,
      p_weight_kg, p_waist_cm, p_weight_change, p_waist_change,
      p_indicator_value, p_status, 1, FALSE
    )
    RETURNING id INTO v_state_id;
    
    RETURN QUERY SELECT
      v_state_id,
      1,
      FALSE,
      NULL::VARCHAR(20),
      TRUE,
      'Primer estado registrado - se aplica directamente';
    RETURN;
  END IF;
  
  -- Si el estado es el mismo que el anterior, incrementar contador
  IF v_last_state.status = p_status THEN
    v_consecutive := v_last_state.consecutive_count + 1;
    v_confirmed := (v_consecutive >= 2); -- Confirmado si se repite 2 veces
    v_should_apply := v_confirmed;
    v_reason := FORMAT('Estado %s confirmado tras %s mediciones consecutivas', 
                      UPPER(p_status), v_consecutive);
  ELSE
    -- Estado cambió, resetear contador
    v_consecutive := 1;
    v_confirmed := FALSE;
    
    -- Evaluar si el cambio debe aplicarse según reglas
    IF v_last_state.status IN ('green', 'green_plus') AND p_status IN ('yellow', 'red') THEN
      -- Cambio de VERDE a AMARILLO/ROJO requiere confirmación
      v_should_apply := FALSE;
      v_reason := FORMAT('Cambio %s → %s requiere confirmación (2 semanas)', 
                        UPPER(v_last_state.status), UPPER(p_status));
    ELSIF v_last_state.status = 'yellow' AND p_status = 'red' THEN
      -- Cambio de AMARILLO a ROJO requiere confirmación
      v_should_apply := FALSE;
      v_reason := FORMAT('Cambio %s → %s requiere confirmación (2 semanas)', 
                        UPPER(v_last_state.status), UPPER(p_status));
    ELSIF p_status IN ('green', 'green_plus') THEN
      -- Mejoras se aplican directamente
      v_should_apply := TRUE;
      v_reason := FORMAT('Mejora de estado %s → %s se aplica directamente', 
                        UPPER(v_last_state.status), UPPER(p_status));
    ELSE
      -- Otros cambios se aplican directamente
      v_should_apply := TRUE;
      v_reason := 'Cambio de estado sin restricciones especiales';
    END IF;
  END IF;
  
  -- Insertar nuevo estado
  INSERT INTO app.icg_ipg_state_history (
    user_id, measurement_date, indicator_type,
    weight_kg, waist_cm, weight_change_kg, waist_change_cm,
    indicator_value, status, consecutive_count, previous_status, status_confirmed
  ) VALUES (
    p_user_id, p_measurement_date, p_indicator_type,
    p_weight_kg, p_waist_cm, p_weight_change, p_waist_change,
    p_indicator_value, p_status, v_consecutive, v_last_state.status, v_confirmed
  )
  RETURNING id INTO v_state_id;
  
  RETURN QUERY SELECT
    v_state_id,
    v_consecutive,
    v_confirmed,
    v_last_state.status,
    v_should_apply,
    v_reason;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.register_icg_ipg_state IS 'Registra estado ICG/IPG y valida si el cambio debe aplicarse según regla de confirmación de 2 semanas';

-- ============================================================================
-- FUNCIÓN PARA OBTENER ESTADO CONFIRMADO
-- ============================================================================

CREATE OR REPLACE FUNCTION app.get_confirmed_status(
  p_user_id INTEGER,
  p_indicator_type VARCHAR(10)
)
RETURNS TABLE (
  current_status VARCHAR(20),
  is_confirmed BOOLEAN,
  consecutive_count INTEGER,
  measurement_date DATE,
  indicator_value DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    status,
    status_confirmed,
    consecutive_count,
    measurement_date,
    indicator_value
  FROM app.icg_ipg_state_history
  WHERE user_id = p_user_id
  AND indicator_type = p_indicator_type
  ORDER BY measurement_date DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.get_confirmed_status IS 'Obtiene el estado más reciente de un indicador con su nivel de confirmación';

-- ============================================================================
-- PERMISOS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON app.icg_ipg_state_history TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE app.icg_ipg_state_history_id_seq TO authenticated;
GRANT EXECUTE ON FUNCTION app.register_icg_ipg_state TO authenticated;
GRANT EXECUTE ON FUNCTION app.get_confirmed_status TO authenticated;

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================
