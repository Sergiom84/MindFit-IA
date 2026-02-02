-- ============================================================================
-- SISTEMA DE PERFIL METABOLICO Y DISTRIBUCION DE MACRONUTRIENTES
-- Tablas para clasificacion metabolica y ajuste de macros segun tolerancia a carbohidratos
-- ============================================================================

-- 1. Tabla principal de evaluaciones metabolicas
CREATE TABLE IF NOT EXISTS app.user_metabolic_evaluations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

  -- Respuestas del cuestionario (JSONB para flexibilidad)
  -- Formato: { "question_id": "si" | "no" | "no_se", ... }
  answers JSONB NOT NULL,

  -- Valores calculados
  raw_score INTEGER NOT NULL,
  metabolic_profile VARCHAR(20) NOT NULL CHECK (metabolic_profile IN ('tolerante', 'mixto', 'intolerante')),
  confidence_level VARCHAR(10) NOT NULL CHECK (confidence_level IN ('alta', 'media', 'baja')),

  -- Estadisticas de respuestas
  items_answered INTEGER NOT NULL,
  items_no_se INTEGER NOT NULL DEFAULT 0,

  -- Ajustes opcionales por senales objetivas
  -- Formato: { "waist_adjustment": +1, "performance_adjustment": -1, ... }
  objective_adjustments JSONB DEFAULT NULL,
  adjusted_score INTEGER, -- Score final despues de ajustes objetivos

  -- Distribucion de macros calculada para este perfil
  -- Formato: { "protein_pct": 25, "carbs_pct": 40, "fat_pct": 35, "protein_g": 150, "carbs_g": 200, "fat_g": 78 }
  calculated_macros JSONB,

  -- Estado
  is_active BOOLEAN DEFAULT TRUE,
  evaluation_date DATE DEFAULT CURRENT_DATE,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_metabolic_evaluations_user ON app.user_metabolic_evaluations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_metabolic_evaluations_active ON app.user_metabolic_evaluations(user_id, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_metabolic_evaluations_date ON app.user_metabolic_evaluations(evaluation_date DESC);

COMMENT ON TABLE app.user_metabolic_evaluations IS 'Evaluaciones del cuestionario metabolico para clasificar tolerancia a carbohidratos';
COMMENT ON COLUMN app.user_metabolic_evaluations.raw_score IS 'Puntuacion bruta del cuestionario (positivo=intolerante, negativo=tolerante)';
COMMENT ON COLUMN app.user_metabolic_evaluations.metabolic_profile IS 'Perfil metabolico: tolerante, mixto o intolerante a carbohidratos';
COMMENT ON COLUMN app.user_metabolic_evaluations.confidence_level IS 'Nivel de confianza basado en cantidad de respuestas y "no se"';

-- 2. Tabla de configuracion de perfil metabolico por usuario
CREATE TABLE IF NOT EXISTS app.user_metabolic_config (
  user_id INTEGER PRIMARY KEY REFERENCES app.users(id) ON DELETE CASCADE,

  -- Frecuencia de reevaluacion (default 14 dias)
  frequency_days INTEGER DEFAULT 14 CHECK (frequency_days >= 7 AND frequency_days <= 60),

  -- Sistema anti-ruido: contador de evaluaciones consecutivas con mismo resultado
  pending_profile_change VARCHAR(20) DEFAULT NULL CHECK (pending_profile_change IN ('tolerante', 'mixto', 'intolerante', NULL)),
  consecutive_change_count INTEGER DEFAULT 0,

  -- Ultimo perfil confirmado (para regla de cambio maximo 1 categoria)
  last_confirmed_profile VARCHAR(20) DEFAULT NULL,

  -- Preferencias de notificacion
  notification_enabled BOOLEAN DEFAULT TRUE,
  reminder_days_before INTEGER DEFAULT 2,

  -- Auto-aplicar perfil (sin confirmacion manual)
  auto_apply_profile BOOLEAN DEFAULT FALSE,

  -- Timestamps
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE app.user_metabolic_config IS 'Configuracion de reevaluacion metabolica por usuario';
COMMENT ON COLUMN app.user_metabolic_config.frequency_days IS 'Cada cuantos dias se solicita reevaluacion (default 14)';
COMMENT ON COLUMN app.user_metabolic_config.pending_profile_change IS 'Perfil pendiente de confirmacion (requiere 2 evaluaciones consecutivas)';
COMMENT ON COLUMN app.user_metabolic_config.consecutive_change_count IS 'Contador de evaluaciones consecutivas hacia el nuevo perfil';

-- 3. Tabla de historial de cambios de perfil
CREATE TABLE IF NOT EXISTS app.user_metabolic_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  evaluation_id INTEGER REFERENCES app.user_metabolic_evaluations(id) ON DELETE SET NULL,

  previous_profile VARCHAR(20),
  new_profile VARCHAR(20) NOT NULL,

  -- Razon del cambio
  change_reason TEXT,
  change_type VARCHAR(20) CHECK (change_type IN ('initial', 'confirmed', 'forced_low_confidence', 'manual')),

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_metabolic_history_user ON app.user_metabolic_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_metabolic_history_date ON app.user_metabolic_history(created_at DESC);

COMMENT ON TABLE app.user_metabolic_history IS 'Historial de cambios de perfil metabolico';

-- ============================================================================
-- FUNCIONES DE UTILIDAD
-- ============================================================================

-- 4. Funcion para obtener el perfil metabolico actual de un usuario
CREATE OR REPLACE FUNCTION app.get_current_metabolic_profile(p_user_id INTEGER)
RETURNS TABLE (
  evaluation_id INTEGER,
  metabolic_profile VARCHAR(20),
  confidence_level VARCHAR(10),
  raw_score INTEGER,
  calculated_macros JSONB,
  evaluation_date DATE,
  days_since_evaluation INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.metabolic_profile,
    e.confidence_level,
    e.raw_score,
    e.calculated_macros,
    e.evaluation_date,
    (CURRENT_DATE - e.evaluation_date)::INTEGER as days_since
  FROM app.user_metabolic_evaluations e
  WHERE e.user_id = p_user_id AND e.is_active = TRUE
  ORDER BY e.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.get_current_metabolic_profile IS 'Obtiene el perfil metabolico activo actual del usuario';

-- 5. Funcion para verificar si toca reevaluacion metabolica
CREATE OR REPLACE FUNCTION app.should_trigger_metabolic_evaluation(p_user_id INTEGER)
RETURNS TABLE (
  should_evaluate BOOLEAN,
  days_since_last INTEGER,
  days_until_due INTEGER,
  last_evaluation_date DATE
) AS $$
DECLARE
  v_frequency INTEGER;
  v_last_eval_date DATE;
  v_days_since INTEGER;
BEGIN
  -- Obtener configuracion de frecuencia del usuario (default 14 dias)
  SELECT COALESCE(frequency_days, 14)
  INTO v_frequency
  FROM app.user_metabolic_config
  WHERE user_id = p_user_id;

  IF v_frequency IS NULL THEN
    v_frequency := 14;
  END IF;

  -- Obtener ultima evaluacion
  SELECT evaluation_date
  INTO v_last_eval_date
  FROM app.user_metabolic_evaluations
  WHERE user_id = p_user_id AND is_active = TRUE
  ORDER BY created_at DESC
  LIMIT 1;

  -- Si nunca ha evaluado, debe evaluar
  IF v_last_eval_date IS NULL THEN
    RETURN QUERY SELECT TRUE, NULL::INTEGER, 0, NULL::DATE;
    RETURN;
  END IF;

  -- Calcular dias desde ultima evaluacion
  v_days_since := CURRENT_DATE - v_last_eval_date;

  RETURN QUERY SELECT
    v_days_since >= v_frequency,
    v_days_since,
    GREATEST(0, v_frequency - v_days_since),
    v_last_eval_date;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.should_trigger_metabolic_evaluation IS 'Determina si el usuario debe realizar una reevaluacion metabolica';

-- 6. Funcion para validar cambio de perfil (regla anti-ruido)
CREATE OR REPLACE FUNCTION app.validate_metabolic_profile_change(
  p_user_id INTEGER,
  p_new_profile VARCHAR(20),
  p_confidence VARCHAR(10)
)
RETURNS TABLE (
  can_change BOOLEAN,
  applied_profile VARCHAR(20),
  reason TEXT,
  consecutive_count INTEGER,
  needs_confirmation BOOLEAN
) AS $$
DECLARE
  v_current_profile VARCHAR(20);
  v_pending_profile VARCHAR(20);
  v_consecutive INTEGER;
  v_last_confirmed VARCHAR(20);
  v_profile_distance INTEGER;
BEGIN
  -- Obtener configuracion actual
  SELECT
    pending_profile_change,
    consecutive_change_count,
    last_confirmed_profile
  INTO v_pending_profile, v_consecutive, v_last_confirmed
  FROM app.user_metabolic_config
  WHERE user_id = p_user_id;

  -- Obtener perfil actual activo
  SELECT metabolic_profile INTO v_current_profile
  FROM app.user_metabolic_evaluations
  WHERE user_id = p_user_id AND is_active = TRUE
  ORDER BY created_at DESC
  LIMIT 1;

  -- Si no hay perfil previo, aceptar el nuevo
  IF v_current_profile IS NULL THEN
    RETURN QUERY SELECT TRUE, p_new_profile, 'Primer perfil establecido', 1, FALSE;
    RETURN;
  END IF;

  -- Regla 1: Confianza baja bloquea cambio a extremos, fuerza Mixto
  IF p_confidence = 'baja' AND p_new_profile IN ('tolerante', 'intolerante') THEN
    RETURN QUERY SELECT TRUE, 'mixto'::VARCHAR(20), 'Confianza baja: asignado perfil Mixto por seguridad', 0, FALSE;
    RETURN;
  END IF;

  -- Si el nuevo perfil es igual al actual, reiniciar contador
  IF p_new_profile = v_current_profile THEN
    RETURN QUERY SELECT TRUE, p_new_profile, 'Perfil confirmado (sin cambio)', 0, FALSE;
    RETURN;
  END IF;

  -- Regla 2: Maximo 1 categoria de cambio por ciclo
  -- tolerante=0, mixto=1, intolerante=2
  v_profile_distance := ABS(
    CASE p_new_profile
      WHEN 'tolerante' THEN 0
      WHEN 'mixto' THEN 1
      WHEN 'intolerante' THEN 2
    END
    -
    CASE v_current_profile
      WHEN 'tolerante' THEN 0
      WHEN 'mixto' THEN 1
      WHEN 'intolerante' THEN 2
    END
  );

  IF v_profile_distance > 1 THEN
    -- Forzar cambio intermedio (a mixto)
    RETURN QUERY SELECT TRUE, 'mixto'::VARCHAR(20),
      'Cambio gradual: de ' || v_current_profile || ' a mixto (paso intermedio requerido)',
      1, FALSE;
    RETURN;
  END IF;

  -- Regla 3: Requiere 2 evaluaciones consecutivas para confirmar cambio
  IF v_pending_profile = p_new_profile THEN
    -- Segunda evaluacion consecutiva con mismo resultado
    IF v_consecutive >= 1 THEN
      RETURN QUERY SELECT TRUE, p_new_profile,
        'Cambio confirmado: 2 evaluaciones consecutivas hacia ' || p_new_profile,
        v_consecutive + 1, FALSE;
    ELSE
      RETURN QUERY SELECT FALSE, v_current_profile,
        'Primera evaluacion hacia ' || p_new_profile || ': requiere confirmacion',
        v_consecutive + 1, TRUE;
    END IF;
  ELSE
    -- Nueva direccion de cambio, reiniciar contador
    RETURN QUERY SELECT FALSE, v_current_profile,
      'Cambio pendiente hacia ' || p_new_profile || ': requiere segunda evaluacion consecutiva',
      1, TRUE;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION app.validate_metabolic_profile_change IS 'Valida si un cambio de perfil metabolico es permitido segun reglas anti-ruido';

-- ============================================================================
-- VISTA CONSOLIDADA DE HISTORIAL
-- ============================================================================

-- 7. Vista de historial de evaluaciones con metricas
CREATE OR REPLACE VIEW app.v_metabolic_evaluation_history AS
SELECT
  e.id,
  e.user_id,
  e.metabolic_profile,
  e.confidence_level,
  e.raw_score,
  e.adjusted_score,
  e.items_answered,
  e.items_no_se,
  e.calculated_macros,
  e.evaluation_date,
  e.is_active,
  e.created_at,

  -- Datos de configuracion
  c.frequency_days,
  c.pending_profile_change,
  c.consecutive_change_count,

  -- Calculos adicionales
  (CURRENT_DATE - e.evaluation_date) as days_since_evaluation,
  CASE
    WHEN c.frequency_days IS NOT NULL
    THEN c.frequency_days - (CURRENT_DATE - e.evaluation_date)
    ELSE 14 - (CURRENT_DATE - e.evaluation_date)
  END as days_until_next_eval

FROM app.user_metabolic_evaluations e
LEFT JOIN app.user_metabolic_config c ON e.user_id = c.user_id
ORDER BY e.user_id, e.created_at DESC;

COMMENT ON VIEW app.v_metabolic_evaluation_history IS 'Vista consolidada del historial de evaluaciones metabolicas';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- 8. Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION app.update_metabolic_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_metabolic_evaluations_updated ON app.user_metabolic_evaluations;
CREATE TRIGGER trg_user_metabolic_evaluations_updated
  BEFORE UPDATE ON app.user_metabolic_evaluations
  FOR EACH ROW
  EXECUTE FUNCTION app.update_metabolic_timestamp();

DROP TRIGGER IF EXISTS trg_user_metabolic_config_updated ON app.user_metabolic_config;
CREATE TRIGGER trg_user_metabolic_config_updated
  BEFORE UPDATE ON app.user_metabolic_config
  FOR EACH ROW
  EXECUTE FUNCTION app.update_metabolic_timestamp();

-- 9. Trigger para desactivar evaluaciones anteriores al crear una nueva
CREATE OR REPLACE FUNCTION app.deactivate_previous_metabolic_evaluations()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE app.user_metabolic_evaluations
  SET is_active = FALSE
  WHERE user_id = NEW.user_id AND id != NEW.id AND is_active = TRUE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deactivate_previous_metabolic ON app.user_metabolic_evaluations;
CREATE TRIGGER trg_deactivate_previous_metabolic
  AFTER INSERT ON app.user_metabolic_evaluations
  FOR EACH ROW
  EXECUTE FUNCTION app.deactivate_previous_metabolic_evaluations();

-- ============================================================================
-- DATOS INICIALES
-- ============================================================================

-- Insertar configuracion default para usuarios existentes que tengan perfil nutricional
INSERT INTO app.user_metabolic_config (user_id, frequency_days, notification_enabled)
SELECT np.user_id, 14, true
FROM app.nutrition_profiles np
WHERE NOT EXISTS (
  SELECT 1 FROM app.user_metabolic_config WHERE user_id = np.user_id
)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- PERMISOS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON app.user_metabolic_evaluations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON app.user_metabolic_config TO authenticated;
GRANT SELECT, INSERT ON app.user_metabolic_history TO authenticated;
GRANT SELECT ON app.v_metabolic_evaluation_history TO authenticated;

GRANT EXECUTE ON FUNCTION app.get_current_metabolic_profile TO authenticated;
GRANT EXECUTE ON FUNCTION app.should_trigger_metabolic_evaluation TO authenticated;
GRANT EXECUTE ON FUNCTION app.validate_metabolic_profile_change TO authenticated;

-- Secuencias
GRANT USAGE, SELECT ON SEQUENCE app.user_metabolic_evaluations_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE app.user_metabolic_history_id_seq TO authenticated;

-- ============================================================================
-- INDICES ADICIONALES PARA PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_metabolic_eval_profile
  ON app.user_metabolic_evaluations(metabolic_profile);

CREATE INDEX IF NOT EXISTS idx_metabolic_eval_confidence
  ON app.user_metabolic_evaluations(confidence_level);

CREATE INDEX IF NOT EXISTS idx_metabolic_history_profile_change
  ON app.user_metabolic_history(user_id, previous_profile, new_profile);

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================

-- Para verificar la instalacion correcta:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'app' AND tablename LIKE '%metabolic%';
-- SELECT proname FROM pg_proc WHERE proname LIKE '%metabolic%';
