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
  v_trend_1 TEXT;
  v_trend_2 TEXT;
  v_date_1 DATE;
BEGIN
  -- Obtener la última medición (dentro de 14 días)
  SELECT tpl.performance_trend, tpl.measurement_date
  INTO v_trend_1, v_date_1
  FROM app.training_performance_log tpl
  WHERE tpl.user_id = p_user_id
    AND tpl.measurement_date >= CURRENT_DATE - INTERVAL '14 days'
  ORDER BY tpl.measurement_date DESC
  LIMIT 1;

  -- Obtener la segunda última medición (dentro de 14 días)
  SELECT tpl.performance_trend
  INTO v_trend_2
  FROM app.training_performance_log tpl
  WHERE tpl.user_id = p_user_id
    AND tpl.measurement_date >= CURRENT_DATE - INTERVAL '14 days'
  ORDER BY tpl.measurement_date DESC
  OFFSET 1
  LIMIT 1;

  -- Si no hay suficientes datos (requiere 2 registros)
  IF v_trend_1 IS NULL OR v_trend_2 IS NULL THEN
    RETURN QUERY SELECT
      FALSE,
      0,
      NULL::DATE,
      FALSE,
      'Insuficientes datos de rendimiento (requiere 2 semanas)'::TEXT;
    RETURN;
  END IF;

  -- Contar semanas consecutivas bajando (solo evaluamos 2 semanas según especificación)
  IF v_trend_1 = 'baja' AND v_trend_2 = 'baja' THEN
    RETURN QUERY SELECT
      TRUE,
      2,
      v_date_1,
      TRUE,
      'Rendimiento bajando 2 semanas consecutivas - Sugerir diet break o normocalórica'::TEXT;
  ELSIF v_trend_1 = 'baja' THEN
    RETURN QUERY SELECT
      FALSE,
      1,
      v_date_1,
      FALSE,
      'Rendimiento bajando 1 semana - requiere confirmación otra semana'::TEXT;
  ELSE
    RETURN QUERY SELECT
      FALSE,
      0,
      v_date_1,
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
