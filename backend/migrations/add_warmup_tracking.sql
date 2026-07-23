/**
 * MIGRACIÓN: Añadir tracking de series de calentamiento
 * 
 * Permite distinguir entre series de calentamiento y series efectivas
 * según la metodología MindFeed v2.0
 */

-- ============================================
-- 1. Añadir campo is_warmup a hypertrophy_set_logs
-- ============================================
ALTER TABLE app.hypertrophy_set_logs 
ADD COLUMN IF NOT EXISTS is_warmup BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN app.hypertrophy_set_logs.is_warmup IS 
'Indica si la serie es de calentamiento/aproximación (true) o efectiva (false)';

-- ============================================
-- 2. Añadir tracking de series de calentamiento completadas
-- ============================================
CREATE TABLE IF NOT EXISTS app.warmup_sets_tracking (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  methodology_plan_id INTEGER REFERENCES app.methodology_plans(id) ON DELETE SET NULL,
  session_id INTEGER,
  exercise_id INTEGER NOT NULL,
  exercise_name VARCHAR(255) NOT NULL,

  -- Detalles del calentamiento
  warmup_config JSONB NOT NULL, -- Configuración usada (nivel, series, etc)
  sets_completed INTEGER NOT NULL,
  sets_planned INTEGER NOT NULL,
  completion_time TIMESTAMP NOT NULL,

  -- Metadata
  user_level VARCHAR(50),
  target_weight NUMERIC(6,2),

  created_at TIMESTAMP DEFAULT NOW()
);

-- Crear índices por separado
CREATE INDEX IF NOT EXISTS idx_warmup_user_session ON app.warmup_sets_tracking (user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_warmup_exercise ON app.warmup_sets_tracking (user_id, exercise_id);

COMMENT ON TABLE app.warmup_sets_tracking IS 
'Registro de series de calentamiento completadas por ejercicio';

-- ============================================
-- 3. Vista para análisis de adherencia al calentamiento
-- ============================================
CREATE OR REPLACE VIEW app.warmup_adherence_stats AS
SELECT
  u.id AS user_id,
  COUNT(DISTINCT wst.session_id) AS sessions_with_warmup,
  COUNT(DISTINCT hsl.session_id) AS total_sessions,
  CASE
    WHEN COUNT(DISTINCT hsl.session_id) > 0 THEN
      ROUND(COUNT(DISTINCT wst.session_id)::NUMERIC / COUNT(DISTINCT hsl.session_id)::NUMERIC * 100, 2)
    ELSE 0
  END AS warmup_adherence_percentage,

  -- Resumen últimos 30 días
  COUNT(DISTINCT CASE
    WHEN wst.completion_time >= NOW() - INTERVAL '30 days'
    THEN wst.session_id
  END) AS recent_warmups_30d,

  -- Última vez que hizo calentamiento
  MAX(wst.completion_time) AS last_warmup_date

FROM app.users u
LEFT JOIN app.warmup_sets_tracking wst ON wst.user_id = u.id
LEFT JOIN app.hypertrophy_set_logs hsl ON hsl.user_id = u.id
GROUP BY u.id;

COMMENT ON VIEW app.warmup_adherence_stats IS
'Estadísticas de adherencia al protocolo de calentamiento por usuario';

-- ============================================
-- 4. Función para verificar si el usuario necesita recordatorio de calentamiento
-- ============================================
CREATE OR REPLACE FUNCTION app.needs_warmup_reminder(
  p_user_id INTEGER,
  p_exercise_id INTEGER,
  p_session_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_warmup_exists BOOLEAN;
  v_last_reminder_date DATE;
  v_user_level VARCHAR(50);
BEGIN
  -- Verificar si ya hizo calentamiento para este ejercicio en esta sesión
  SELECT EXISTS(
    SELECT 1 FROM app.warmup_sets_tracking
    WHERE user_id = p_user_id 
      AND exercise_id = p_exercise_id
      AND session_id = p_session_id
  ) INTO v_warmup_exists;
  
  IF v_warmup_exists THEN
    RETURN jsonb_build_object(
      'needs_reminder', FALSE,
      'reason', 'Calentamiento ya completado'
    );
  END IF;
  
  -- Obtener nivel del usuario
  SELECT methodology_level INTO v_user_level
  FROM app.methodology_exercise_sessions
  WHERE id = p_session_id
  LIMIT 1;
  
  -- Verificar adherencia histórica
  WITH adherence AS (
    SELECT warmup_adherence_percentage
    FROM app.warmup_adherence_stats
    WHERE user_id = p_user_id
  )
  SELECT 
    CASE
      WHEN warmup_adherence_percentage < 50 THEN TRUE
      ELSE FALSE
    END INTO v_warmup_exists
  FROM adherence;
  
  RETURN jsonb_build_object(
    'needs_reminder', TRUE,
    'user_level', COALESCE(v_user_level, 'Principiante'),
    'adherence_low', COALESCE(v_warmup_exists, TRUE),
    'message', CASE
      WHEN COALESCE(v_warmup_exists, TRUE) THEN 
        'Importante: El calentamiento reduce el riesgo de lesión hasta un 50%'
      ELSE
        'Realiza las series de aproximación antes de comenzar'
    END
  );
END;
$$;

COMMENT ON FUNCTION app.needs_warmup_reminder IS
'Determina si mostrar recordatorio de calentamiento al usuario';

-- ============================================
-- 5. Actualizar función de guardado de series para manejar is_warmup
-- ============================================
CREATE OR REPLACE FUNCTION app.save_hypertrophy_set(
  p_user_id INTEGER,
  p_methodology_plan_id INTEGER,
  p_session_id INTEGER,
  p_exercise_id INTEGER,
  p_exercise_name VARCHAR,
  p_set_number INTEGER,
  p_weight_used NUMERIC,
  p_reps_completed INTEGER,
  p_rir_reported INTEGER,
  p_is_warmup BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_set_id INTEGER;
  v_is_effective BOOLEAN;
BEGIN
  -- Determinar si la serie es efectiva (no calentamiento y cumple criterios)
  v_is_effective := NOT p_is_warmup AND p_rir_reported <= 4;
  
  -- Insertar serie
  INSERT INTO app.hypertrophy_set_logs (
    user_id,
    methodology_plan_id,
    session_id,
    exercise_id,
    exercise_name,
    set_number,
    weight_used,
    reps_completed,
    rir_reported,
    is_warmup,
    is_effective,
    volume_load,
    estimated_1rm
  ) VALUES (
    p_user_id,
    p_methodology_plan_id,
    p_session_id,
    p_exercise_id,
    p_exercise_name,
    p_set_number,
    p_weight_used,
    p_reps_completed,
    p_rir_reported,
    p_is_warmup,
    v_is_effective,
    CASE WHEN NOT p_is_warmup THEN p_weight_used * p_reps_completed ELSE 0 END,
    CASE 
      WHEN NOT p_is_warmup AND p_reps_completed > 0 THEN
        p_weight_used * (1 + p_reps_completed * 0.0333)
      ELSE NULL
    END
  ) RETURNING id INTO v_set_id;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'set_id', v_set_id,
    'is_warmup', p_is_warmup,
    'is_effective', v_is_effective
  );
END;
$$;

-- ============================================
-- COMENTARIOS Y DOCUMENTACIÓN
-- ============================================
COMMENT ON FUNCTION app.save_hypertrophy_set IS
'Guarda una serie de hipertrofia distinguiendo entre calentamiento y efectivas';