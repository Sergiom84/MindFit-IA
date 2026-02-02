-- ============================================================================
-- SISTEMA DE TIMING DE CARBOHIDRATOS
-- Tabla opcional para logging de recomendaciones de timing
-- ============================================================================

-- 1. Tabla de logs de recomendaciones de timing (OPCIONAL)
CREATE TABLE IF NOT EXISTS app.carb_timing_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

  -- Contexto de la sesión
  session_id INTEGER,  -- FK opcional; se puede añadir si app.training_sessions existe
  methodology VARCHAR(50),
  intensity VARCHAR(20),
  duration_min INTEGER,

  -- Recomendación generada
  timing_window VARCHAR(20) NOT NULL CHECK (timing_window IN ('pre_workout', 'post_workout')),
  carbs_recommended INTEGER NOT NULL,
  protein_recommended INTEGER,

  -- Cumplimiento (opcional, para tracking)
  user_consumed_carbs INTEGER,
  user_consumed_protein INTEGER,
  consumed_at TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_carb_timing_user ON app.carb_timing_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_carb_timing_session ON app.carb_timing_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_carb_timing_date ON app.carb_timing_logs(created_at DESC);

COMMENT ON TABLE app.carb_timing_logs IS 'Log opcional de recomendaciones de timing de carbohidratos';

-- 2. Tabla de configuración de timing por usuario (OPCIONAL)
CREATE TABLE IF NOT EXISTS app.carb_timing_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES app.users(id) ON DELETE CASCADE,

  -- Preferencias personales
  default_pre_workout_hours DECIMAL(3,1) DEFAULT 1.5,  -- Cuánto antes come normalmente
  default_post_workout_urgency VARCHAR(20) DEFAULT 'medium',  -- high, medium, low

  -- Restricciones
  avoid_carbs_night BOOLEAN DEFAULT FALSE,  -- Si prefiere evitar carbos de noche
  preferred_carb_sources TEXT,  -- JSON con fuentes preferidas

  -- Notificaciones
  notify_pre_workout BOOLEAN DEFAULT FALSE,
  notify_post_workout BOOLEAN DEFAULT TRUE,

  -- Metadata
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE app.carb_timing_preferences IS 'Preferencias de usuario para timing de carbohidratos';

-- ============================================================================
-- FUNCIONES DE UTILIDAD
-- ============================================================================

-- 3. Función para obtener recomendación de timing basada en hora del día
-- Nota: depende de app.training_sessions; si no existe, la función retorna defaults.
CREATE OR REPLACE FUNCTION app.get_optimal_workout_time(p_user_id INTEGER)
RETURNS TABLE (
  recommended_time VARCHAR(20),
  reason TEXT,
  pre_workout_carbs_timing VARCHAR(50),
  post_workout_strategy TEXT
) AS $$
DECLARE
  v_workout_history RECORD;
  v_most_common_time VARCHAR(20);
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'app' AND table_name = 'training_sessions'
  ) INTO v_exists;

  IF v_exists THEN
    SELECT
      CASE
        WHEN EXTRACT(HOUR FROM start_time) BETWEEN 6 AND 11 THEN 'morning'
        WHEN EXTRACT(HOUR FROM start_time) BETWEEN 12 AND 17 THEN 'afternoon'
        WHEN EXTRACT(HOUR FROM start_time) BETWEEN 18 AND 21 THEN 'evening'
        ELSE 'night'
      END as time_slot,
      COUNT(*) as frequency
    INTO v_workout_history
    FROM app.training_sessions
    WHERE user_id = p_user_id
      AND start_time IS NOT NULL
      AND start_time >= CURRENT_DATE - 30
    GROUP BY time_slot
    ORDER BY frequency DESC
    LIMIT 1;

    v_most_common_time := COALESCE(v_workout_history.time_slot, 'afternoon');
  ELSE
    v_most_common_time := 'afternoon';
  END IF;

  RETURN QUERY
  SELECT
    v_most_common_time,
    CASE v_most_common_time
      WHEN 'morning' THEN 'Entrenas mayormente por la mañana - Asegura desayuno con carbos 1-2h antes'
      WHEN 'afternoon' THEN 'Entrenas por la tarde - Distribuye carbos en desayuno y comida pre-entreno'
      WHEN 'evening' THEN 'Entrenas por la noche - Prioriza comida pre-entreno abundante'
      ELSE 'Entrenas tarde en la noche - Come carbos post-entreno sin miedo, son para recuperación'
    END,
    CASE v_most_common_time
      WHEN 'morning' THEN 'Desayuno 1-2h antes con avena/pan/plátano'
      WHEN 'afternoon' THEN 'Comida 2-3h antes con arroz/pasta/boniato'
      WHEN 'evening' THEN 'Comida 2-3h antes + snack 1h antes si es necesario'
      ELSE 'Snack 1-2h antes, comida completa después'
    END,
    CASE v_most_common_time
      WHEN 'morning' THEN 'Post-entreno: comida completa después con carbos + proteína'
      WHEN 'afternoon' THEN 'Post-entreno: batido inmediato + cena completa'
      WHEN 'evening' THEN 'Post-entreno: batido/comida inmediata, carbos NO engordan de noche'
      ELSE 'Post-entreno: batido inmediato + snack antes de dormir si es necesario'
    END;
END;
$$ LANGUAGE plpgsql;

-- 4. Vista para análisis de adherencia al timing
CREATE OR REPLACE VIEW app.v_carb_timing_adherence AS
SELECT
  ctl.user_id,
  ctl.timing_window,
  COUNT(*) as total_recommendations,
  COUNT(ctl.consumed_at) as times_followed,
  ROUND(
    (COUNT(ctl.consumed_at)::DECIMAL / COUNT(*)) * 100,
    1
  ) as adherence_percentage,
  AVG(
    CASE
      WHEN ctl.user_consumed_carbs IS NOT NULL
      THEN (ctl.user_consumed_carbs::DECIMAL / ctl.carbs_recommended) * 100
      ELSE NULL
    END
  ) as avg_carbs_accuracy_pct,
  MAX(ctl.created_at) as last_recommendation_date
FROM app.carb_timing_logs ctl
WHERE ctl.created_at >= CURRENT_DATE - 30  -- Últimos 30 días
GROUP BY ctl.user_id, ctl.timing_window;

COMMENT ON VIEW app.v_carb_timing_adherence IS 'Análisis de adherencia a recomendaciones de timing (últimos 30 días)';

-- Si existe app.training_sessions, añadir FK opcional al campo session_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'app' AND table_name = 'training_sessions'
  ) THEN
    ALTER TABLE app.carb_timing_logs
    ADD CONSTRAINT fk_carb_timing_session
      FOREIGN KEY (session_id) REFERENCES app.training_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- DATOS INICIALES
-- ============================================================================

-- Crear preferencias por defecto para usuarios con perfil nutricional
INSERT INTO app.carb_timing_preferences (user_id)
SELECT np.user_id
FROM app.nutrition_profiles np
WHERE NOT EXISTS (
  SELECT 1 FROM app.carb_timing_preferences WHERE user_id = np.user_id
)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- PERMISOS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON app.carb_timing_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON app.carb_timing_preferences TO authenticated;
GRANT SELECT ON app.v_carb_timing_adherence TO authenticated;
GRANT EXECUTE ON FUNCTION app.get_optimal_workout_time TO authenticated;

-- Secuencias
GRANT USAGE, SELECT ON SEQUENCE app.carb_timing_logs_id_seq TO authenticated;

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================
