/**
 * MIGRACIÓN: Bloque de Adaptación Inicial para HipertrofiaV2
 *
 * Permite a principiantes absolutos pasar por una fase de preparación
 * de 1-3 semanas antes de entrar al ciclo D1-D5 completo.
 *
 * Criterios de transición:
 * 1. Adherencia >80% (completar 4/5 sesiones por semana)
 * 2. RIR medio <4 (control de esfuerzo)
 * 3. Flags técnicas <1/semana (técnica aceptable)
 * 4. Progreso carga >8% (adaptación neuromuscular)
 */

-- ============================================
-- TABLA: adaptation_blocks
-- ============================================
-- Registra cada bloque de adaptación iniciado por un usuario

CREATE TABLE IF NOT EXISTS app.adaptation_blocks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  methodology_plan_id INTEGER REFERENCES app.methodology_plans(id) ON DELETE SET NULL,

  -- Configuración del bloque
  block_type VARCHAR(20) NOT NULL CHECK (block_type IN ('full_body', 'half_body')),
  duration_weeks INTEGER NOT NULL DEFAULT 2 CHECK (duration_weeks BETWEEN 1 AND 4),
  start_date DATE NOT NULL,

  -- Estado
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  completed_at TIMESTAMP,
  transitioned_to_hypertrophy BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Índices para queries frecuentes
  CONSTRAINT unique_active_adaptation UNIQUE (user_id, status)
);

CREATE INDEX IF NOT EXISTS idx_adaptation_blocks_user_status ON app.adaptation_blocks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_adaptation_blocks_methodology ON app.adaptation_blocks(methodology_plan_id);

-- ============================================
-- TABLA: adaptation_criteria_tracking
-- ============================================
-- Trackea semanalmente el progreso hacia los 4 criterios

CREATE TABLE IF NOT EXISTS app.adaptation_criteria_tracking (
  id SERIAL PRIMARY KEY,
  adaptation_block_id INTEGER NOT NULL REFERENCES app.adaptation_blocks(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL CHECK (week_number > 0),

  -- Criterio 1: Adherencia (sessions completed / sessions planned)
  sessions_planned INTEGER NOT NULL DEFAULT 5,
  sessions_completed INTEGER NOT NULL DEFAULT 0,
  adherence_percentage NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE
      WHEN sessions_planned > 0 THEN (sessions_completed::NUMERIC / sessions_planned::NUMERIC) * 100
      ELSE 0
    END
  ) STORED,
  adherence_met BOOLEAN GENERATED ALWAYS AS (
    (sessions_completed::NUMERIC / NULLIF(sessions_planned, 0)::NUMERIC) >= 0.8
  ) STORED,

  -- Criterio 2: RIR Medio (control de esfuerzo)
  mean_rir NUMERIC(3,1),
  rir_met BOOLEAN GENERATED ALWAYS AS (mean_rir <= 4) STORED,

  -- Criterio 3: Flags Técnicas (frecuencia de errores)
  technique_flags_count INTEGER NOT NULL DEFAULT 0,
  technique_met BOOLEAN GENERATED ALWAYS AS (technique_flags_count < 1) STORED,

  -- Criterio 4: Progreso de Carga (adaptación neuromuscular)
  initial_average_weight NUMERIC(6,2), -- Promedio de pesos semana 1
  current_average_weight NUMERIC(6,2), -- Promedio de pesos semana actual
  weight_progress_percentage NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE
      WHEN initial_average_weight > 0 THEN
        ((current_average_weight - initial_average_weight) / initial_average_weight) * 100
      ELSE 0
    END
  ) STORED,
  progress_met BOOLEAN GENERATED ALWAYS AS (
    CASE
      WHEN initial_average_weight > 0 THEN
        ((current_average_weight - initial_average_weight) / initial_average_weight) >= 0.08
      ELSE FALSE
    END
  ) STORED,

  -- Estado general de la semana (calculado en aplicación o vista)
  -- No puede ser columna generada porque referenciaría otras columnas generadas

  -- Timestamps
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  evaluated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT unique_week_per_block UNIQUE (adaptation_block_id, week_number)
);

CREATE INDEX IF NOT EXISTS idx_adaptation_criteria_block ON app.adaptation_criteria_tracking(adaptation_block_id);
CREATE INDEX IF NOT EXISTS idx_adaptation_criteria_week ON app.adaptation_criteria_tracking(adaptation_block_id, week_number);

-- ============================================
-- TABLA: adaptation_technique_flags
-- ============================================
-- Registra flags de técnica durante el bloque de adaptación

CREATE TABLE IF NOT EXISTS app.adaptation_technique_flags (
  id SERIAL PRIMARY KEY,
  adaptation_block_id INTEGER NOT NULL REFERENCES app.adaptation_blocks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  session_id INTEGER, -- Nullable, no foreign key por ahora (tabla de sesiones puede variar)
  exercise_id INTEGER,

  -- Detalles del flag
  flag_type VARCHAR(50) NOT NULL CHECK (flag_type IN (
    'incorrect_rom',        -- Rango de movimiento incorrecto
    'poor_posture',         -- Postura inadecuada
    'excessive_momentum',   -- Uso de impulso
    'unstable_movement',    -- Movimiento inestable
    'compensation_pattern', -- Patrón compensatorio
    'pain_reported'         -- Dolor reportado
  )),
  severity VARCHAR(20) NOT NULL DEFAULT 'moderate' CHECK (severity IN ('minor', 'moderate', 'serious')),
  description TEXT,

  -- Resolución
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMP,
  resolution_notes TEXT,

  -- Timestamps
  flagged_at TIMESTAMP DEFAULT NOW(),

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_technique_flags_block ON app.adaptation_technique_flags(adaptation_block_id);
CREATE INDEX IF NOT EXISTS idx_technique_flags_user ON app.adaptation_technique_flags(user_id, flagged_at);
CREATE INDEX IF NOT EXISTS idx_technique_flags_resolved ON app.adaptation_technique_flags(adaptation_block_id, resolved);

-- ============================================
-- VISTA: adaptation_progress_summary
-- ============================================
-- Vista consolidada del progreso de adaptación

CREATE OR REPLACE VIEW app.adaptation_progress_summary AS
SELECT
  ab.id AS adaptation_block_id,
  ab.user_id,
  ab.block_type,
  ab.duration_weeks,
  ab.start_date,
  ab.status,

  -- Progreso general
  COUNT(DISTINCT act.week_number) AS weeks_tracked,
  SUM(CASE WHEN (act.adherence_met AND act.rir_met AND act.technique_met AND act.progress_met) THEN 1 ELSE 0 END) AS weeks_criteria_met,

  -- Última semana evaluada
  MAX(act.week_number) AS latest_week,

  -- Criterios última semana
  (SELECT adherence_met FROM app.adaptation_criteria_tracking
   WHERE adaptation_block_id = ab.id
   ORDER BY week_number DESC LIMIT 1) AS latest_adherence_met,
  (SELECT rir_met FROM app.adaptation_criteria_tracking
   WHERE adaptation_block_id = ab.id
   ORDER BY week_number DESC LIMIT 1) AS latest_rir_met,
  (SELECT technique_met FROM app.adaptation_criteria_tracking
   WHERE adaptation_block_id = ab.id
   ORDER BY week_number DESC LIMIT 1) AS latest_technique_met,
  (SELECT progress_met FROM app.adaptation_criteria_tracking
   WHERE adaptation_block_id = ab.id
   ORDER BY week_number DESC LIMIT 1) AS latest_progress_met,
  (SELECT (adherence_met AND rir_met AND technique_met AND progress_met)
   FROM app.adaptation_criteria_tracking
   WHERE adaptation_block_id = ab.id
   ORDER BY week_number DESC LIMIT 1) AS latest_all_criteria_met,

  -- Ready para transición?
  CASE
    WHEN ab.status = 'active' AND
         (SELECT (adherence_met AND rir_met AND technique_met AND progress_met)
          FROM app.adaptation_criteria_tracking
          WHERE adaptation_block_id = ab.id
          ORDER BY week_number DESC LIMIT 1) = TRUE
    THEN TRUE
    ELSE FALSE
  END AS ready_for_transition,

  ab.created_at,
  ab.updated_at
FROM app.adaptation_blocks ab
LEFT JOIN app.adaptation_criteria_tracking act ON act.adaptation_block_id = ab.id
GROUP BY ab.id;

-- ============================================
-- FUNCIÓN: evaluate_adaptation_completion
-- ============================================
-- Evalúa si el usuario ha cumplido los criterios para transicionar

CREATE OR REPLACE FUNCTION app.evaluate_adaptation_completion(
  p_user_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_adaptation_block RECORD;
  v_latest_week RECORD;
  v_result JSONB;
BEGIN
  -- Buscar bloque de adaptación activo
  SELECT * INTO v_adaptation_block
  FROM app.adaptation_blocks
  WHERE user_id = p_user_id AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'No active adaptation block found'
    );
  END IF;

  -- Obtener última semana evaluada
  SELECT * INTO v_latest_week
  FROM app.adaptation_criteria_tracking
  WHERE adaptation_block_id = v_adaptation_block.id
  ORDER BY week_number DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'No weeks evaluated yet'
    );
  END IF;

  -- Construir respuesta
  v_result := jsonb_build_object(
    'success', TRUE,
    'adaptation_block_id', v_adaptation_block.id,
    'block_type', v_adaptation_block.block_type,
    'week_number', v_latest_week.week_number,
    'duration_weeks', v_adaptation_block.duration_weeks,

    -- Criterios individuales
    'criteria', jsonb_build_object(
      'adherence', jsonb_build_object(
        'value', v_latest_week.adherence_percentage,
        'threshold', 80,
        'met', v_latest_week.adherence_met,
        'sessions', v_latest_week.sessions_completed || '/' || v_latest_week.sessions_planned
      ),
      'rir', jsonb_build_object(
        'value', v_latest_week.mean_rir,
        'threshold', 4,
        'met', v_latest_week.rir_met
      ),
      'technique', jsonb_build_object(
        'flags_count', v_latest_week.technique_flags_count,
        'threshold', 1,
        'met', v_latest_week.technique_met
      ),
      'progress', jsonb_build_object(
        'value', v_latest_week.weight_progress_percentage,
        'threshold', 8,
        'met', v_latest_week.progress_met,
        'initial_weight', v_latest_week.initial_average_weight,
        'current_weight', v_latest_week.current_average_weight
      )
    ),

    -- Estado general
    'all_criteria_met', (v_latest_week.adherence_met AND v_latest_week.rir_met AND v_latest_week.technique_met AND v_latest_week.progress_met),
    'ready_for_transition', (v_latest_week.adherence_met AND v_latest_week.rir_met AND v_latest_week.technique_met AND v_latest_week.progress_met),

    -- Recomendación
    'recommendation', CASE
      WHEN (v_latest_week.adherence_met AND v_latest_week.rir_met AND v_latest_week.technique_met AND v_latest_week.progress_met) THEN 'ready_to_transition'
      WHEN v_latest_week.week_number >= v_adaptation_block.duration_weeks THEN 'extend_adaptation'
      ELSE 'continue_adaptation'
    END
  );

  RETURN v_result;
END;
$$;

-- ============================================
-- FUNCIÓN: transition_to_hypertrophy
-- ============================================
-- Completa el bloque de adaptación y activa el plan D1-D5

CREATE OR REPLACE FUNCTION app.transition_to_hypertrophy(
  p_user_id INTEGER,
  p_adaptation_block_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_adaptation_block RECORD;
  v_evaluation JSONB;
BEGIN
  -- Verificar que el bloque existe y está activo
  SELECT * INTO v_adaptation_block
  FROM app.adaptation_blocks
  WHERE id = p_adaptation_block_id AND user_id = p_user_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Adaptation block not found or not active'
    );
  END IF;

  -- Evaluar criterios
  v_evaluation := app.evaluate_adaptation_completion(p_user_id);

  IF (v_evaluation->>'all_criteria_met')::BOOLEAN = FALSE THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Not all criteria met for transition',
      'evaluation', v_evaluation
    );
  END IF;

  -- Marcar bloque como completado
  UPDATE app.adaptation_blocks
  SET
    status = 'completed',
    completed_at = NOW(),
    transitioned_to_hypertrophy = TRUE,
    updated_at = NOW()
  WHERE id = p_adaptation_block_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Adaptation block completed successfully',
    'adaptation_block_id', p_adaptation_block_id,
    'ready_for_d1d5', TRUE,
    'evaluation', v_evaluation
  );
END;
$$;

-- ============================================
-- COMENTARIOS Y DOCUMENTACIÓN
-- ============================================

COMMENT ON TABLE app.adaptation_blocks IS 'Bloques de adaptación inicial para principiantes antes del ciclo D1-D5';
COMMENT ON TABLE app.adaptation_criteria_tracking IS 'Tracking semanal de los 4 criterios de transición';
COMMENT ON TABLE app.adaptation_technique_flags IS 'Flags de técnica reportadas durante adaptación';

COMMENT ON FUNCTION app.evaluate_adaptation_completion IS 'Evalúa si el usuario cumple los 4 criterios para transicionar a D1-D5';
COMMENT ON FUNCTION app.transition_to_hypertrophy IS 'Completa el bloque de adaptación y habilita transición a D1-D5';
