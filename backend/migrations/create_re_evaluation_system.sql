-- ============================================================================
-- SISTEMA DE RE-EVALUACIÓN PROGRESIVA
-- Tablas para tracking de progreso y ajustes adaptativos con IA
-- ============================================================================

-- 1. Tabla principal de re-evaluaciones de usuario
CREATE TABLE IF NOT EXISTS app.user_re_evaluations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  methodology_plan_id INTEGER NOT NULL REFERENCES app.methodology_plans(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  sentiment VARCHAR(50),  -- 'excelente', 'bien', 'regular', 'dificil', 'muy_dificil'
  overall_comment TEXT,
  created_at TIMESTAMP DEFAULT NOW(),

  -- Índices para búsquedas rápidas
  CONSTRAINT unique_plan_week UNIQUE(methodology_plan_id, week_number)
);

CREATE INDEX IF NOT EXISTS idx_user_re_evaluations_user ON app.user_re_evaluations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_re_evaluations_plan ON app.user_re_evaluations(methodology_plan_id);
CREATE INDEX IF NOT EXISTS idx_user_re_evaluations_created ON app.user_re_evaluations(created_at DESC);

COMMENT ON TABLE app.user_re_evaluations IS 'Re-evaluaciones periódicas del progreso del usuario';
COMMENT ON COLUMN app.user_re_evaluations.sentiment IS 'Sensación general del usuario sobre el período evaluado';
COMMENT ON COLUMN app.user_re_evaluations.week_number IS 'Semana del plan en la que se realizó la evaluación';

-- 2. Tabla de progreso detallado por ejercicio
CREATE TABLE IF NOT EXISTS app.re_evaluation_exercises (
  id SERIAL PRIMARY KEY,
  re_evaluation_id INTEGER NOT NULL REFERENCES app.user_re_evaluations(id) ON DELETE CASCADE,
  exercise_name VARCHAR(255) NOT NULL,
  exercise_id VARCHAR(100),  -- ID del ejercicio en el plan
  series_achieved INTEGER,
  reps_achieved VARCHAR(100),  -- Puede ser "10" o "10-12" o "30 seg"
  weight_kg DECIMAL(6,2),  -- Peso utilizado (si aplica)
  difficulty_rating VARCHAR(50),  -- 'facil', 'adecuado', 'dificil'
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_re_eval_exercises_eval ON app.re_evaluation_exercises(re_evaluation_id);
CREATE INDEX IF NOT EXISTS idx_re_eval_exercises_name ON app.re_evaluation_exercises(exercise_name);

COMMENT ON TABLE app.re_evaluation_exercises IS 'Progreso detallado por ejercicio durante la re-evaluación';
COMMENT ON COLUMN app.re_evaluation_exercises.difficulty_rating IS 'Percepción del usuario sobre la dificultad del ejercicio';

-- 3. Tabla de ajustes sugeridos por IA
CREATE TABLE IF NOT EXISTS app.ai_adjustment_suggestions (
  id SERIAL PRIMARY KEY,
  re_evaluation_id INTEGER NOT NULL REFERENCES app.user_re_evaluations(id) ON DELETE CASCADE,

  -- Recomendaciones estructuradas
  progress_assessment VARCHAR(50),  -- 'progressing', 'stalled', 'regressing'
  intensity_change VARCHAR(50),     -- '+10%', '-10%', 'maintain'
  volume_change VARCHAR(50),        -- '+5%', '-5%', 'maintain'
  rest_modifications VARCHAR(50),   -- 'increase', 'decrease', 'maintain'

  -- Progresiones específicas (JSON)
  suggested_progressions JSONB,     -- Array de objetos con progresiones por ejercicio

  -- Feedback y análisis de IA
  ai_reasoning TEXT,                -- Explicación detallada del análisis
  motivational_feedback TEXT,       -- Mensaje motivacional personalizado
  warnings TEXT[],                  -- Advertencias (ej: sobreentrenamiento)

  -- Estado de aplicación
  applied BOOLEAN DEFAULT FALSE,
  applied_at TIMESTAMP,
  applied_by INTEGER REFERENCES app.users(id),

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_adjustments_eval ON app.ai_adjustment_suggestions(re_evaluation_id);
CREATE INDEX IF NOT EXISTS idx_ai_adjustments_applied ON app.ai_adjustment_suggestions(applied);

COMMENT ON TABLE app.ai_adjustment_suggestions IS 'Ajustes sugeridos por IA basados en re-evaluaciones';
COMMENT ON COLUMN app.ai_adjustment_suggestions.suggested_progressions IS 'JSON con progresiones específicas por ejercicio';
COMMENT ON COLUMN app.ai_adjustment_suggestions.applied IS 'Indica si el usuario aplicó las sugerencias al plan';

-- 4. Tabla de configuración de re-evaluación por usuario
CREATE TABLE IF NOT EXISTS app.user_re_eval_config (
  user_id INTEGER PRIMARY KEY REFERENCES app.users(id) ON DELETE CASCADE,

  -- Configuración de frecuencia
  frequency_weeks INTEGER DEFAULT 3 CHECK (frequency_weeks >= 1 AND frequency_weeks <= 12),

  -- Preferencias de automatización
  auto_apply_suggestions BOOLEAN DEFAULT FALSE,
  notification_enabled BOOLEAN DEFAULT TRUE,
  reminder_days_before INTEGER DEFAULT 1,

  -- Metadatos
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_re_eval_config_frequency ON app.user_re_eval_config(frequency_weeks);

COMMENT ON TABLE app.user_re_eval_config IS 'Configuración personalizada de re-evaluaciones por usuario';
COMMENT ON COLUMN app.user_re_eval_config.frequency_weeks IS 'Cada cuántas semanas se solicita re-evaluación';
COMMENT ON COLUMN app.user_re_eval_config.auto_apply_suggestions IS 'Si se aplican automáticamente los ajustes de IA';

-- 5. Vista consolidada de progreso histórico
CREATE OR REPLACE VIEW app.v_re_evaluation_history AS
SELECT
  re.id,
  re.user_id,
  re.methodology_plan_id,
  mp.methodology_type,
  re.week_number,
  re.sentiment,
  re.overall_comment,
  re.created_at as evaluation_date,

  -- Agregados de ejercicios
  COUNT(ree.id) as exercises_evaluated,
  AVG(CASE ree.difficulty_rating
    WHEN 'facil' THEN 1
    WHEN 'adecuado' THEN 2
    WHEN 'dificil' THEN 3
    ELSE NULL
  END) as avg_difficulty,

  -- Sugerencias de IA
  ai.progress_assessment,
  ai.intensity_change,
  ai.motivational_feedback,
  ai.applied as adjustments_applied

FROM app.user_re_evaluations re
LEFT JOIN app.methodology_plans mp ON re.methodology_plan_id = mp.id
LEFT JOIN app.re_evaluation_exercises ree ON re.id = ree.re_evaluation_id
LEFT JOIN app.ai_adjustment_suggestions ai ON re.id = ai.re_evaluation_id
GROUP BY re.id, mp.methodology_type, ai.id;

COMMENT ON VIEW app.v_re_evaluation_history IS 'Vista consolidada del historial de re-evaluaciones con métricas agregadas';

-- 6. Función para obtener última re-evaluación de un plan
CREATE OR REPLACE FUNCTION app.get_last_re_evaluation(p_methodology_plan_id INTEGER)
RETURNS TABLE (
  re_evaluation_id INTEGER,
  week_number INTEGER,
  created_at TIMESTAMP,
  weeks_since_last INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    re.id,
    re.week_number,
    re.created_at,
    (
      SELECT COALESCE(
        EXTRACT(WEEK FROM NOW())::INTEGER - EXTRACT(WEEK FROM re.created_at)::INTEGER,
        0
      )
    ) as weeks_since_last
  FROM app.user_re_evaluations re
  WHERE re.methodology_plan_id = p_methodology_plan_id
  ORDER BY re.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.get_last_re_evaluation IS 'Obtiene la última re-evaluación de un plan con cálculo de tiempo transcurrido';

-- 7. Función para verificar si toca re-evaluación
CREATE OR REPLACE FUNCTION app.should_trigger_re_evaluation(
  p_user_id INTEGER,
  p_methodology_plan_id INTEGER,
  p_current_week INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_frequency INTEGER;
  v_last_eval_week INTEGER;
  v_weeks_since_last INTEGER;
BEGIN
  -- Obtener configuración de frecuencia del usuario
  SELECT COALESCE(frequency_weeks, 3)
  INTO v_frequency
  FROM app.user_re_eval_config
  WHERE user_id = p_user_id;

  -- Si no tiene config, usar default de 3 semanas
  IF v_frequency IS NULL THEN
    v_frequency := 3;
  END IF;

  -- Obtener última evaluación
  SELECT week_number
  INTO v_last_eval_week
  FROM app.user_re_evaluations
  WHERE methodology_plan_id = p_methodology_plan_id
  ORDER BY created_at DESC
  LIMIT 1;

  -- Si nunca ha evaluado y está en semana >= frecuencia, trigger
  IF v_last_eval_week IS NULL THEN
    RETURN p_current_week >= v_frequency;
  END IF;

  -- Calcular semanas desde última evaluación
  v_weeks_since_last := p_current_week - v_last_eval_week;

  -- Trigger si han pasado suficientes semanas
  RETURN v_weeks_since_last >= v_frequency;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.should_trigger_re_evaluation IS 'Determina si debe mostrarse el modal de re-evaluación al usuario';

-- 8. Trigger para actualizar updated_at en config
CREATE OR REPLACE FUNCTION app.update_re_eval_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- DATOS INICIALES Y CONFIGURACIÓN DEFAULT
-- ============================================================================

-- Insertar configuración default para usuarios existentes
INSERT INTO app.user_re_eval_config (user_id, frequency_weeks, notification_enabled)
SELECT id, 3, true
FROM app.users
WHERE NOT EXISTS (
  SELECT 1 FROM app.user_re_eval_config WHERE user_id = users.id
)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- PERMISOS Y SEGURIDAD
-- ============================================================================

-- Grant permissions para las tablas (ajustar según tu configuración de roles)
GRANT SELECT, INSERT, UPDATE ON app.user_re_evaluations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON app.re_evaluation_exercises TO authenticated;
GRANT SELECT, INSERT, UPDATE ON app.ai_adjustment_suggestions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON app.user_re_eval_config TO authenticated;

GRANT SELECT ON app.v_re_evaluation_history TO authenticated;

GRANT EXECUTE ON FUNCTION app.get_last_re_evaluation TO authenticated;
GRANT EXECUTE ON FUNCTION app.should_trigger_re_evaluation TO authenticated;

-- ============================================================================
-- ÍNDICES ADICIONALES PARA PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_re_eval_user_week
  ON app.user_re_evaluations(user_id, week_number);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_assessment
  ON app.ai_adjustment_suggestions(progress_assessment)
  WHERE applied = false;

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================

-- Para verificar la instalación correcta:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'app' AND tablename LIKE '%re_eval%';
