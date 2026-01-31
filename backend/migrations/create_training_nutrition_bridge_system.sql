-- ============================================================================
-- SISTEMA DE PUENTE ENTRENAMIENTO-NUTRICION
-- Tablas para coordinacion bidireccional y logs de decisiones
-- ============================================================================

-- 1. Tabla de logs de decisiones coordinadas
CREATE TABLE IF NOT EXISTS app.bridge_decision_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,

  -- Contexto de la decision
  decision_date DATE DEFAULT CURRENT_DATE,
  trigger_source VARCHAR(20) NOT NULL CHECK (trigger_source IN ('training', 'nutrition', 'manual', 'scheduled')),
  trigger_event VARCHAR(50) NOT NULL,

  -- Inputs del entrenamiento (Flujo A)
  training_inputs JSONB,
  -- Formato: { methodology, calendar, weekly_cls, performance, flags, session_data }

  -- Inputs de nutricion (Flujo B)
  nutrition_inputs JSONB,
  -- Formato: { kcal_actual, macros_actual, metabolic_profile, deficit_days, surplus_days }

  -- Decision tomada
  decision_type VARCHAR(30) NOT NULL,
  decision_details JSONB NOT NULL,
  -- Formato: { action, nutrition_adjustment, training_adjustment, reason, confidence }

  -- Resultado aplicado
  applied_nutrition JSONB,
  applied_training JSONB,

  -- Estado
  was_applied BOOLEAN DEFAULT FALSE,
  user_overridden BOOLEAN DEFAULT FALSE,
  override_reason TEXT,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bridge_logs_user ON app.bridge_decision_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_bridge_logs_date ON app.bridge_decision_logs(decision_date DESC);
CREATE INDEX IF NOT EXISTS idx_bridge_logs_trigger ON app.bridge_decision_logs(trigger_source, trigger_event);

COMMENT ON TABLE app.bridge_decision_logs IS 'Log de decisiones coordinadas entre entrenamiento y nutricion';

-- 2. Tabla de configuracion de frecuencias de recalculo
CREATE TABLE IF NOT EXISTS app.bridge_recalculation_config (
  user_id INTEGER PRIMARY KEY REFERENCES app.users(id) ON DELETE CASCADE,

  -- Frecuencias de recalculo (en dias o eventos)
  recalc_on_session BOOLEAN DEFAULT TRUE,          -- Cada sesion de entrenamiento
  recalc_weekly_cls BOOLEAN DEFAULT TRUE,          -- Semanal (CLS)
  recalc_biweekly_metabolic BOOLEAN DEFAULT TRUE,  -- Cada 14 dias (perfil metabolico)
  recalc_monthly_full BOOLEAN DEFAULT TRUE,        -- Mensual (revision completa)

  -- Umbrales para triggers automaticos
  performance_drop_threshold DECIMAL(3,2) DEFAULT 0.15,  -- 15% caida de rendimiento
  weight_change_threshold DECIMAL(3,2) DEFAULT 0.02,     -- 2% cambio de peso
  fatigue_accumulation_days INTEGER DEFAULT 14,          -- Dias de fatiga acumulada

  -- Preferencias de notificacion
  notify_on_adjustment BOOLEAN DEFAULT TRUE,
  auto_apply_minor_changes BOOLEAN DEFAULT FALSE,  -- Cambios <5% sin confirmacion

  -- Timestamps
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE app.bridge_recalculation_config IS 'Configuracion de frecuencias y umbrales de recalculo';

-- 3. Tabla de estado actual del bridge por usuario
CREATE TABLE IF NOT EXISTS app.bridge_current_state (
  user_id INTEGER PRIMARY KEY REFERENCES app.users(id) ON DELETE CASCADE,

  -- Estado actual de nutricion
  current_kcal INTEGER,
  current_macros JSONB,
  current_metabolic_profile VARCHAR(20),
  days_in_deficit INTEGER DEFAULT 0,
  days_in_surplus INTEGER DEFAULT 0,

  -- Estado actual de entrenamiento
  current_methodology VARCHAR(50),
  current_phase VARCHAR(30),  -- volumen, definicion, mantenimiento, deload
  weekly_cls_score INTEGER,
  accumulated_fatigue_score INTEGER DEFAULT 0,

  -- Flags activos
  active_flags JSONB DEFAULT '[]'::JSONB,
  -- Formato: [{ flag, activated_at, severity, expires_at }]

  -- Contadores
  sessions_since_last_recalc INTEGER DEFAULT 0,
  days_since_metabolic_eval INTEGER DEFAULT 0,

  -- Proximas evaluaciones
  next_cls_update DATE,
  next_metabolic_eval DATE,
  next_full_review DATE,

  -- Timestamps
  last_session_date DATE,
  last_recalculation TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

COMMENT ON TABLE app.bridge_current_state IS 'Estado actual consolidado del puente para cada usuario';

-- 4. Tabla de historial de ajustes aplicados
CREATE TABLE IF NOT EXISTS app.bridge_adjustment_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  decision_log_id INTEGER REFERENCES app.bridge_decision_logs(id) ON DELETE SET NULL,

  adjustment_date DATE DEFAULT CURRENT_DATE,
  adjustment_type VARCHAR(30) NOT NULL,
  -- Tipos: kcal_increase, kcal_decrease, macro_redistribution, deload_triggered,
  --        diet_break, carb_refeed, volume_reduction, intensity_reduction

  -- Valores antes/despues
  previous_values JSONB NOT NULL,
  new_values JSONB NOT NULL,

  -- Razon y duracion
  reason TEXT NOT NULL,
  duration_days INTEGER,  -- NULL si es permanente hasta proximo recalculo

  -- Estado
  is_active BOOLEAN DEFAULT TRUE,
  reverted_at TIMESTAMP,
  revert_reason TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bridge_history_user ON app.bridge_adjustment_history(user_id);
CREATE INDEX IF NOT EXISTS idx_bridge_history_active ON app.bridge_adjustment_history(user_id, is_active) WHERE is_active = TRUE;

COMMENT ON TABLE app.bridge_adjustment_history IS 'Historial de ajustes aplicados por el sistema de coordinacion';

-- ============================================================================
-- FUNCIONES DE UTILIDAD
-- ============================================================================

-- 5. Funcion para obtener el estado actual del bridge
CREATE OR REPLACE FUNCTION app.get_bridge_state(p_user_id INTEGER)
RETURNS TABLE (
  current_kcal INTEGER,
  current_macros JSONB,
  metabolic_profile VARCHAR(20),
  methodology VARCHAR(50),
  phase VARCHAR(30),
  weekly_cls INTEGER,
  fatigue_score INTEGER,
  active_flags JSONB,
  days_in_deficit INTEGER,
  days_in_surplus INTEGER,
  needs_recalculation BOOLEAN,
  recalc_reason TEXT
) AS $$
DECLARE
  v_state app.bridge_current_state%ROWTYPE;
  v_config app.bridge_recalculation_config%ROWTYPE;
  v_needs_recalc BOOLEAN := FALSE;
  v_reason TEXT := NULL;
BEGIN
  SELECT * INTO v_state FROM app.bridge_current_state WHERE user_id = p_user_id;
  SELECT * INTO v_config FROM app.bridge_recalculation_config WHERE user_id = p_user_id;

  -- Verificar si necesita recalculo
  IF v_state.user_id IS NULL THEN
    v_needs_recalc := TRUE;
    v_reason := 'Estado inicial no configurado';
  ELSIF v_config.recalc_on_session AND v_state.sessions_since_last_recalc >= 1 THEN
    v_needs_recalc := TRUE;
    v_reason := 'Recalculo post-sesion pendiente';
  ELSIF v_state.next_metabolic_eval IS NOT NULL AND v_state.next_metabolic_eval <= CURRENT_DATE THEN
    v_needs_recalc := TRUE;
    v_reason := 'Evaluacion metabolica vencida';
  ELSIF v_state.next_cls_update IS NOT NULL AND v_state.next_cls_update <= CURRENT_DATE THEN
    v_needs_recalc := TRUE;
    v_reason := 'Actualizacion CLS semanal vencida';
  END IF;

  RETURN QUERY SELECT
    COALESCE(v_state.current_kcal, 0),
    COALESCE(v_state.current_macros, '{}'::JSONB),
    v_state.current_metabolic_profile,
    v_state.current_methodology,
    v_state.current_phase,
    v_state.weekly_cls_score,
    v_state.accumulated_fatigue_score,
    COALESCE(v_state.active_flags, '[]'::JSONB),
    COALESCE(v_state.days_in_deficit, 0),
    COALESCE(v_state.days_in_surplus, 0),
    v_needs_recalc,
    v_reason;
END;
$$ LANGUAGE plpgsql;

-- 6. Funcion para registrar una decision del bridge
CREATE OR REPLACE FUNCTION app.log_bridge_decision(
  p_user_id INTEGER,
  p_trigger_source VARCHAR(20),
  p_trigger_event VARCHAR(50),
  p_training_inputs JSONB,
  p_nutrition_inputs JSONB,
  p_decision_type VARCHAR(30),
  p_decision_details JSONB,
  p_applied_nutrition JSONB DEFAULT NULL,
  p_applied_training JSONB DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_log_id INTEGER;
BEGIN
  INSERT INTO app.bridge_decision_logs (
    user_id, trigger_source, trigger_event,
    training_inputs, nutrition_inputs,
    decision_type, decision_details,
    applied_nutrition, applied_training,
    was_applied
  ) VALUES (
    p_user_id, p_trigger_source, p_trigger_event,
    p_training_inputs, p_nutrition_inputs,
    p_decision_type, p_decision_details,
    p_applied_nutrition, p_applied_training,
    p_applied_nutrition IS NOT NULL OR p_applied_training IS NOT NULL
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- 7. Funcion para activar un flag coordinado
CREATE OR REPLACE FUNCTION app.activate_bridge_flag(
  p_user_id INTEGER,
  p_flag_name VARCHAR(50),
  p_severity VARCHAR(20) DEFAULT 'medium',
  p_duration_days INTEGER DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_expires_at DATE;
  v_current_flags JSONB;
BEGIN
  IF p_duration_days IS NOT NULL THEN
    v_expires_at := CURRENT_DATE + p_duration_days;
  END IF;

  -- Obtener flags actuales
  SELECT COALESCE(active_flags, '[]'::JSONB)
  INTO v_current_flags
  FROM app.bridge_current_state
  WHERE user_id = p_user_id;

  -- Eliminar flag existente con mismo nombre si existe
  v_current_flags := (
    SELECT COALESCE(jsonb_agg(f), '[]'::JSONB)
    FROM jsonb_array_elements(v_current_flags) f
    WHERE f->>'flag' != p_flag_name
  );

  -- Agregar nuevo flag
  v_current_flags := v_current_flags || jsonb_build_object(
    'flag', p_flag_name,
    'severity', p_severity,
    'activated_at', CURRENT_DATE,
    'expires_at', v_expires_at
  );

  -- Actualizar o insertar estado
  INSERT INTO app.bridge_current_state (user_id, active_flags, updated_at)
  VALUES (p_user_id, v_current_flags, NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    active_flags = v_current_flags,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 8. Funcion para limpiar flags expirados
CREATE OR REPLACE FUNCTION app.cleanup_expired_bridge_flags()
RETURNS INTEGER AS $$
DECLARE
  v_cleaned INTEGER := 0;
BEGIN
  UPDATE app.bridge_current_state
  SET active_flags = (
    SELECT COALESCE(jsonb_agg(f), '[]'::JSONB)
    FROM jsonb_array_elements(active_flags) f
    WHERE (f->>'expires_at')::DATE IS NULL OR (f->>'expires_at')::DATE > CURRENT_DATE
  ),
  updated_at = NOW()
  WHERE active_flags != '[]'::JSONB;

  GET DIAGNOSTICS v_cleaned = ROW_COUNT;
  RETURN v_cleaned;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- 9. Trigger para actualizar timestamps
CREATE OR REPLACE FUNCTION app.update_bridge_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bridge_state_updated ON app.bridge_current_state;
CREATE TRIGGER trg_bridge_state_updated
  BEFORE UPDATE ON app.bridge_current_state
  FOR EACH ROW
  EXECUTE FUNCTION app.update_bridge_timestamp();

DROP TRIGGER IF EXISTS trg_bridge_config_updated ON app.bridge_recalculation_config;
CREATE TRIGGER trg_bridge_config_updated
  BEFORE UPDATE ON app.bridge_recalculation_config
  FOR EACH ROW
  EXECUTE FUNCTION app.update_bridge_timestamp();

-- ============================================================================
-- DATOS INICIALES
-- ============================================================================

-- Insertar configuracion default para usuarios existentes con perfil nutricional
INSERT INTO app.bridge_recalculation_config (user_id)
SELECT np.user_id
FROM app.nutrition_profiles np
WHERE NOT EXISTS (
  SELECT 1 FROM app.bridge_recalculation_config WHERE user_id = np.user_id
)
ON CONFLICT (user_id) DO NOTHING;

-- Inicializar estado del bridge para usuarios existentes
INSERT INTO app.bridge_current_state (user_id, next_cls_update, next_metabolic_eval)
SELECT
  np.user_id,
  CURRENT_DATE + 7,  -- Proxima actualizacion CLS en 7 dias
  CURRENT_DATE + 14  -- Proxima eval metabolica en 14 dias
FROM app.nutrition_profiles np
WHERE NOT EXISTS (
  SELECT 1 FROM app.bridge_current_state WHERE user_id = np.user_id
)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- PERMISOS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON app.bridge_decision_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON app.bridge_recalculation_config TO authenticated;
GRANT SELECT, INSERT, UPDATE ON app.bridge_current_state TO authenticated;
GRANT SELECT, INSERT, UPDATE ON app.bridge_adjustment_history TO authenticated;

GRANT EXECUTE ON FUNCTION app.get_bridge_state TO authenticated;
GRANT EXECUTE ON FUNCTION app.log_bridge_decision TO authenticated;
GRANT EXECUTE ON FUNCTION app.activate_bridge_flag TO authenticated;
GRANT EXECUTE ON FUNCTION app.cleanup_expired_bridge_flags TO authenticated;

-- Secuencias
GRANT USAGE, SELECT ON SEQUENCE app.bridge_decision_logs_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE app.bridge_adjustment_history_id_seq TO authenticated;

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================
