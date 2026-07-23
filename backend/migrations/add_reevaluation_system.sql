/**
 * MIGRACIÓN: Sistema de Re-evaluación Automática de Nivel
 * 
 * Permite re-evaluar el nivel del usuario tras completar microciclos
 * o detectar abandono/bajo rendimiento
 */

-- ============================================
-- 1. Tabla para tracking de re-evaluaciones
-- ============================================
CREATE TABLE IF NOT EXISTS app.level_reevaluations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

  -- Estado anterior
  previous_level VARCHAR(50) NOT NULL,
  previous_confidence NUMERIC(3,2),

  -- Nueva evaluación
  new_level VARCHAR(50) NOT NULL,
  new_confidence NUMERIC(3,2),
  reason VARCHAR(255) NOT NULL,

  -- Métricas que triggerearon la re-evaluación
  microcycles_completed INTEGER,
  sessions_completed INTEGER,
  avg_rir_last_month NUMERIC(3,1),
  adherence_percentage NUMERIC(5,2),
  progression_rate NUMERIC(5,2),
  fatigue_flags_count INTEGER,

  -- Estado
  accepted BOOLEAN DEFAULT NULL, -- NULL = pendiente, TRUE = aceptado, FALSE = rechazado
  accepted_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT NOW()
);

-- Crear índices por separado
CREATE INDEX IF NOT EXISTS idx_reevaluation_user ON app.level_reevaluations (user_id);
CREATE INDEX IF NOT EXISTS idx_reevaluation_pending ON app.level_reevaluations (user_id, accepted);

COMMENT ON TABLE app.level_reevaluations IS 
'Historial de re-evaluaciones de nivel propuestas al usuario';

-- ============================================
-- 2. Función para evaluar necesidad de cambio de nivel
-- ============================================
CREATE OR REPLACE FUNCTION app.evaluate_level_change(
  p_user_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_level VARCHAR(50);
  v_microcycles_completed INTEGER;
  v_avg_rir NUMERIC(3,1);
  v_adherence NUMERIC(5,2);
  v_progression_rate NUMERIC(5,2);
  v_fatigue_count INTEGER;
  v_sessions_last_month INTEGER;
  v_recommendation JSONB;
BEGIN
  -- Obtener nivel actual
  SELECT methodology_level INTO v_current_level
  FROM app.methodology_exercise_sessions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF v_current_level IS NULL THEN
    v_current_level := 'Principiante';
  END IF;
  
  -- Obtener métricas de los últimos 30 días
  SELECT 
    COUNT(DISTINCT session_id) INTO v_sessions_last_month
  FROM app.hypertrophy_set_logs
  WHERE user_id = p_user_id
    AND created_at >= NOW() - INTERVAL '30 days';
    
  -- Calcular adherencia (sesiones esperadas vs completadas)
  v_adherence := CASE
    WHEN v_current_level = 'Principiante' THEN
      (v_sessions_last_month::NUMERIC / 12::NUMERIC) * 100 -- 3 sesiones/semana
    WHEN v_current_level = 'Intermedio' THEN
      (v_sessions_last_month::NUMERIC / 16::NUMERIC) * 100 -- 4 sesiones/semana
    ELSE
      (v_sessions_last_month::NUMERIC / 20::NUMERIC) * 100 -- 5 sesiones/semana
  END;
  
  -- RIR medio último mes
  SELECT AVG(rir_reported) INTO v_avg_rir
  FROM app.hypertrophy_set_logs
  WHERE user_id = p_user_id
    AND created_at >= NOW() - INTERVAL '30 days'
    AND is_warmup = FALSE;
    
  -- Microciclos completados
  SELECT microcycles_completed INTO v_microcycles_completed
  FROM app.hipertrofia_v2_state
  WHERE user_id = p_user_id;
  
  -- Fatiga acumulada
  SELECT COUNT(*) INTO v_fatigue_count
  FROM app.fatigue_flags
  WHERE user_id = p_user_id
    AND flag_date >= NOW() - INTERVAL '14 days'
    AND flag_type IN ('critical', 'light');
    
  -- Calcular tasa de progresión
  WITH progression AS (
    SELECT 
      AVG(progression_percentage) as avg_progression
    FROM app.hypertrophy_progression
    WHERE user_id = p_user_id
      AND last_updated >= NOW() - INTERVAL '30 days'
  )
  SELECT COALESCE(avg_progression, 0) INTO v_progression_rate
  FROM progression;
  
  -- Evaluar cambio de nivel
  v_recommendation := jsonb_build_object(
    'current_level', v_current_level,
    'metrics', jsonb_build_object(
      'microcycles_completed', v_microcycles_completed,
      'avg_rir', v_avg_rir,
      'adherence', v_adherence,
      'progression_rate', v_progression_rate,
      'fatigue_count', v_fatigue_count,
      'sessions_last_month', v_sessions_last_month
    )
  );
  
  -- Lógica de recomendación
  IF v_current_level = 'Principiante' THEN
    -- Criterios para subir a Intermedio
    IF v_microcycles_completed >= 3 
       AND v_avg_rir <= 2.5 
       AND v_adherence >= 80 
       AND v_fatigue_count < 3 THEN
      v_recommendation := v_recommendation || jsonb_build_object(
        'suggested_level', 'Intermedio',
        'reason', 'Excelente progreso: 3+ microciclos completados con alta adherencia y buen control de RIR',
        'confidence', 0.85
      );
    END IF;
    
  ELSIF v_current_level = 'Intermedio' THEN
    -- Criterios para subir a Avanzado
    IF v_microcycles_completed >= 6 
       AND v_avg_rir <= 2 
       AND v_adherence >= 85 
       AND v_progression_rate >= 2 THEN
      v_recommendation := v_recommendation || jsonb_build_object(
        'suggested_level', 'Avanzado',
        'reason', 'Listo para nivel avanzado: 6+ microciclos con excelente control y progresión',
        'confidence', 0.80
      );
    -- Criterios para bajar a Principiante
    ELSIF v_adherence < 50 
          OR v_fatigue_count >= 5 
          OR v_sessions_last_month < 8 THEN
      v_recommendation := v_recommendation || jsonb_build_object(
        'suggested_level', 'Principiante',
        'reason', 'Baja adherencia o alta fatiga detectada. Se recomienda reducir volumen',
        'confidence', 0.75
      );
    END IF;
    
  ELSIF v_current_level = 'Avanzado' THEN
    -- Criterios para bajar a Intermedio
    IF v_adherence < 60 
       OR v_fatigue_count >= 7 
       OR v_avg_rir > 3.5 THEN
      v_recommendation := v_recommendation || jsonb_build_object(
        'suggested_level', 'Intermedio',
        'reason', 'Fatiga acumulada o adherencia baja. Reducir intensidad temporalmente',
        'confidence', 0.70
      );
    END IF;
  END IF;
  
  -- Si no hay cambio sugerido
  IF NOT v_recommendation ? 'suggested_level' THEN
    v_recommendation := v_recommendation || jsonb_build_object(
      'suggested_level', v_current_level,
      'reason', 'Mantener nivel actual',
      'confidence', 1.0,
      'no_change', TRUE
    );
  END IF;
  
  RETURN v_recommendation;
END;
$$;

-- ============================================
-- 3. Función para registrar re-evaluación
-- ============================================
CREATE OR REPLACE FUNCTION app.register_reevaluation(
  p_user_id INTEGER,
  p_evaluation JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_reevaluation_id INTEGER;
BEGIN
  -- Solo registrar si hay cambio sugerido
  IF (p_evaluation->>'no_change')::BOOLEAN = TRUE THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'message', 'No se requiere cambio de nivel'
    );
  END IF;
  
  -- Insertar re-evaluación
  INSERT INTO app.level_reevaluations (
    user_id,
    previous_level,
    previous_confidence,
    new_level,
    new_confidence,
    reason,
    microcycles_completed,
    sessions_completed,
    avg_rir_last_month,
    adherence_percentage,
    progression_rate,
    fatigue_flags_count
  ) VALUES (
    p_user_id,
    p_evaluation->>'current_level',
    0.0, -- Confidence anterior no se trackea actualmente
    p_evaluation->>'suggested_level',
    (p_evaluation->>'confidence')::NUMERIC,
    p_evaluation->>'reason',
    (p_evaluation->'metrics'->>'microcycles_completed')::INTEGER,
    (p_evaluation->'metrics'->>'sessions_last_month')::INTEGER,
    (p_evaluation->'metrics'->>'avg_rir')::NUMERIC,
    (p_evaluation->'metrics'->>'adherence')::NUMERIC,
    (p_evaluation->'metrics'->>'progression_rate')::NUMERIC,
    (p_evaluation->'metrics'->>'fatigue_count')::INTEGER
  ) RETURNING id INTO v_reevaluation_id;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'reevaluation_id', v_reevaluation_id,
    'message', 'Re-evaluación registrada y pendiente de aceptación'
  );
END;
$$;

-- ============================================
-- 4. Trigger automático tras microciclos
-- ============================================
CREATE OR REPLACE FUNCTION app.check_reevaluation_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_evaluation JSONB;
  v_register_result JSONB;
BEGIN
  -- Solo evaluar cada 3 microciclos
  IF NEW.microcycles_completed % 3 = 0 AND NEW.microcycles_completed > 0 THEN
    -- Evaluar necesidad de cambio
    v_evaluation := app.evaluate_level_change(NEW.user_id);
    
    -- Registrar si hay cambio sugerido
    IF NOT (v_evaluation->>'no_change')::BOOLEAN THEN
      v_register_result := app.register_reevaluation(NEW.user_id, v_evaluation);
      
      -- Log para debugging
      RAISE NOTICE 'Re-evaluación automática para usuario %: %', 
        NEW.user_id, v_register_result;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Crear trigger
DROP TRIGGER IF EXISTS trigger_check_reevaluation ON app.hipertrofia_v2_state;
CREATE TRIGGER trigger_check_reevaluation
  AFTER UPDATE OF microcycles_completed ON app.hipertrofia_v2_state
  FOR EACH ROW
  EXECUTE FUNCTION app.check_reevaluation_trigger();

-- ============================================
-- 5. Vista de re-evaluaciones pendientes
-- ============================================
CREATE OR REPLACE VIEW app.pending_reevaluations AS
SELECT
  r.id,
  r.user_id,
  r.previous_level,
  r.new_level,
  r.reason,
  r.new_confidence,
  r.adherence_percentage,
  r.avg_rir_last_month,
  r.created_at,
  -- Días esperando respuesta
  EXTRACT(DAY FROM NOW() - r.created_at) AS days_pending
FROM app.level_reevaluations r
WHERE r.accepted IS NULL
ORDER BY r.created_at DESC;

COMMENT ON VIEW app.pending_reevaluations IS
'Re-evaluaciones de nivel pendientes de respuesta del usuario';

-- ============================================
-- COMENTARIOS Y DOCUMENTACIÓN
-- ============================================
COMMENT ON FUNCTION app.evaluate_level_change IS
'Evalúa si el usuario necesita cambio de nivel basado en métricas de rendimiento';

COMMENT ON FUNCTION app.register_reevaluation IS
'Registra una re-evaluación de nivel pendiente de aceptación';

COMMENT ON FUNCTION app.check_reevaluation_trigger IS
'Trigger que verifica automáticamente necesidad de re-evaluación cada 3 microciclos';