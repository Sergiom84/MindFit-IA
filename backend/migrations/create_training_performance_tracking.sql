-- ============================================================================
-- SISTEMA DE TRACKING DE RENDIMIENTO EN ENTRENAMIENTO
-- Registra sistemáticamente si el rendimiento sube/mantiene/baja
-- ============================================================================

-- Tabla de rendimiento en entrenamiento
CREATE TABLE IF NOT EXISTS app.training_performance_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  
  -- Fecha de la evaluación de rendimiento
  measurement_date DATE NOT NULL,
  
  -- Tendencia de rendimiento
  performance_trend VARCHAR(20) NOT NULL CHECK (performance_trend IN ('sube', 'mantiene', 'baja', 'no_aplica')),
  
  -- Detalles opcionales
  performance_notes TEXT,
  session_count_last_week INTEGER, -- Número de sesiones completadas
  avg_rir DECIMAL(3,1), -- RIR promedio si disponible
  fatigue_level VARCHAR(20) CHECK (fatigue_level IN ('bajo', 'medio', 'alto', 'muy_alto')),
  
  -- Metadata
  source VARCHAR(20) DEFAULT 'manual' CHECK (source IN ('manual', 'auto', 'session_based')),
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id, measurement_date)
);

CREATE INDEX IF NOT EXISTS idx_training_performance_user ON app.training_performance_log(user_id, measurement_date DESC);
CREATE INDEX IF NOT EXISTS idx_training_performance_trend ON app.training_performance_log(user_id, performance_trend) WHERE performance_trend = 'baja';

COMMENT ON TABLE app.training_performance_log IS 'Registro de tendencias de rendimiento en entrenamiento (sube/mantiene/baja)';
COMMENT ON COLUMN app.training_performance_log.performance_trend IS 'Tendencia de rendimiento: sube (mejora), mantiene (estable), baja (descenso), no_aplica (sin datos)';

-- ============================================================================
-- FUNCIÓN PARA DETECTAR BAJADA DE RENDIMIENTO 2 SEMANAS CONSECUTIVAS
-- ============================================================================

CREATE OR REPLACE FUNCTION app.check_performance_drop(p_user_id INTEGER)
RETURNS TABLE (
  has_performance_drop BOOLEAN,
  consecutive_weeks INTEGER,
  last_measurement_date DATE,
  should_suggest_diet_break BOOLEAN,
  reason TEXT
) AS $$
DECLARE
  v_last_two_weeks RECORD[];
  v_count_baja INTEGER;
BEGIN
  -- Obtener últimas 2 semanas de rendimiento
  SELECT ARRAY_AGG(ROW(measurement_date, performance_trend)::RECORD ORDER BY measurement_date DESC)
  INTO v_last_two_weeks
  FROM app.training_performance_log
  WHERE user_id = p_user_id
  AND measurement_date >= CURRENT_DATE - INTERVAL '14 days'
  ORDER BY measurement_date DESC
  LIMIT 2;
  
  -- Si no hay suficientes datos
  IF ARRAY_LENGTH(v_last_two_weeks, 1) < 2 THEN
    RETURN QUERY SELECT
      FALSE,
      0,
      NULL::DATE,
      FALSE,
      'Insuficientes datos de rendimiento (requiere 2 semanas)'::TEXT;
    RETURN;
  END IF;
  
  -- Contar cuántas semanas consecutivas con bajada
  v_count_baja := 0;
  FOR i IN 1..ARRAY_LENGTH(v_last_two_weeks, 1) LOOP
    IF (v_last_two_weeks[i]).performance_trend = 'baja' THEN
      v_count_baja := v_count_baja + 1;
    ELSE
      EXIT; -- Si no es 'baja', salir del loop
    END IF;
  END LOOP;
  
  -- Evaluar si hay bajada consecutiva
  IF v_count_baja >= 2 THEN
    RETURN QUERY SELECT
      TRUE,
      v_count_baja,
      (v_last_two_weeks[1]).measurement_date::DATE,
      TRUE,
      FORMAT('Rendimiento bajando %s semanas consecutivas - Sugerir diet break o normocalórica', v_count_baja)::TEXT;
  ELSE
    RETURN QUERY SELECT
      FALSE,
      v_count_baja,
      (v_last_two_weeks[1]).measurement_date::DATE,
      FALSE,
      'Rendimiento estable o mejorando'::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.check_performance_drop IS 'Detecta si el rendimiento ha bajado 2 semanas consecutivas según documentación';

-- ============================================================================
-- PERMISOS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON app.training_performance_log TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE app.training_performance_log_id_seq TO authenticated;
GRANT EXECUTE ON FUNCTION app.check_performance_drop TO authenticated;

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================
