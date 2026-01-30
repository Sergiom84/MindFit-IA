-- MindFeed Compliance v1 - Fase C
-- Priorización estricta: eventos, reglas por RIR, NP congelado y reactivación

-- 1) Estado adicional para reactivación de NP
ALTER TABLE app.hipertrofia_v2_state
ADD COLUMN IF NOT EXISTS np_high_rir_streak INTEGER NOT NULL DEFAULT 0;

-- 2) Eventos de prioridad (auditoría)
CREATE TABLE IF NOT EXISTS app.mindfeed_priority_events (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  methodology_plan_id INTEGER NULL,
  muscle_group VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  reason VARCHAR(200) NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mindfeed_priority_events_user
  ON app.mindfeed_priority_events(user_id, created_at DESC);

-- 3) Correcciones técnicas por músculo/sesión
CREATE TABLE IF NOT EXISTS app.technique_corrections (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  methodology_plan_id INTEGER NULL,
  session_id INTEGER NULL,
  muscle_group VARCHAR(100) NOT NULL,
  corrections_count INTEGER NOT NULL DEFAULT 1,
  source VARCHAR(50) NOT NULL DEFAULT 'manual',
  notes TEXT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_technique_corrections_user_muscle
  ON app.technique_corrections(user_id, muscle_group, created_at DESC);

CREATE OR REPLACE FUNCTION app.record_technique_corrections(
  p_user_id INTEGER,
  p_methodology_plan_id INTEGER,
  p_session_id INTEGER,
  p_muscle_group VARCHAR,
  p_corrections_count INTEGER DEFAULT 1,
  p_source VARCHAR DEFAULT 'manual',
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $function$
DECLARE
  v_row_id BIGINT;
BEGIN
  INSERT INTO app.technique_corrections (
    user_id,
    methodology_plan_id,
    session_id,
    muscle_group,
    corrections_count,
    source,
    notes
  ) VALUES (
    p_user_id,
    p_methodology_plan_id,
    p_session_id,
    p_muscle_group,
    GREATEST(1, COALESCE(p_corrections_count, 1)),
    COALESCE(p_source, 'manual'),
    p_notes
  )
  RETURNING id INTO v_row_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_row_id
  );
END;
$function$;

-- 4) Mean RIR por categoría (últimos 5 sesiones con sets)
CREATE OR REPLACE FUNCTION app.calculate_mean_rir_last_microcycle_by_category(
  p_user_id INTEGER,
  p_methodology_plan_id INTEGER
)
RETURNS TABLE(categoria TEXT, mean_rir NUMERIC)
LANGUAGE sql
AS $function$
WITH recent_sessions AS (
  SELECT DISTINCT session_id
  FROM app.hypertrophy_set_logs
  WHERE user_id = p_user_id
    AND methodology_plan_id = p_methodology_plan_id
    AND rir_reported IS NOT NULL
  ORDER BY session_id DESC
  LIMIT 5
), logs AS (
  SELECT
    h.rir_reported,
    COALESCE(e.categoria, 'Desconocido') AS categoria
  FROM app.hypertrophy_set_logs h
  JOIN recent_sessions rs ON rs.session_id = h.session_id
  LEFT JOIN app."Ejercicios_Hipertrofia" e ON e.exercise_id = h.exercise_id
  WHERE h.user_id = p_user_id
    AND h.methodology_plan_id = p_methodology_plan_id
    AND h.rir_reported IS NOT NULL
)
SELECT categoria, ROUND(AVG(rir_reported)::NUMERIC, 2) AS mean_rir
FROM logs
GROUP BY categoria;
$function$;

-- 5) Activación de prioridad con salvaguardas y evento
CREATE OR REPLACE FUNCTION app.activate_muscle_priority(
  p_user_id integer,
  p_muscle_group character varying,
  p_reason character varying DEFAULT 'manual'::character varying
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_exists BOOLEAN;
  v_deload_active BOOLEAN := FALSE;
  v_plan_id INTEGER;
BEGIN
  SELECT priority_muscle IS NOT NULL, deload_active, methodology_plan_id
  INTO v_exists, v_deload_active, v_plan_id
  FROM app.hipertrofia_v2_state
  WHERE user_id = p_user_id;

  IF v_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya hay una prioridad activa');
  END IF;

  IF v_deload_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se puede activar prioridad durante deload');
  END IF;

  UPDATE app.hipertrofia_v2_state
  SET
    priority_muscle = p_muscle_group,
    priority_started_at = NOW(),
    priority_microcycles_completed = 0,
    priority_top_sets_this_week = 0,
    priority_last_week_reset = NOW(),
    weekly_topset_used = false,
    np_high_rir_streak = 0,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO app.mindfeed_priority_events (
    user_id,
    methodology_plan_id,
    muscle_group,
    action,
    reason,
    metadata
  ) VALUES (
    p_user_id,
    v_plan_id,
    p_muscle_group,
    'activate',
    p_reason,
    jsonb_build_object('source', 'activate_muscle_priority')
  );

  RETURN jsonb_build_object('success', true, 'priority_muscle', p_muscle_group);
END;
$function$;

-- 6) Desactivación de prioridad con evento
CREATE OR REPLACE FUNCTION app.deactivate_muscle_priority(
  p_user_id integer,
  p_reason character varying DEFAULT 'completed'::character varying
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_muscle VARCHAR;
  v_plan_id INTEGER;
BEGIN
  SELECT priority_muscle, methodology_plan_id
  INTO v_muscle, v_plan_id
  FROM app.hipertrofia_v2_state
  WHERE user_id = p_user_id;

  UPDATE app.hipertrofia_v2_state
  SET
    priority_muscle = NULL,
    priority_started_at = NULL,
    priority_microcycles_completed = 0,
    priority_top_sets_this_week = 0,
    weekly_topset_used = false,
    np_high_rir_streak = 0,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  IF v_muscle IS NOT NULL THEN
    INSERT INTO app.mindfeed_priority_events (
      user_id,
      methodology_plan_id,
      muscle_group,
      action,
      reason,
      metadata
    ) VALUES (
      p_user_id,
      v_plan_id,
      v_muscle,
      'deactivate',
      p_reason,
      jsonb_build_object('source', 'deactivate_muscle_priority')
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'reason', p_reason);
END;
$function$;

-- 7) Progresión por microciclo con reglas de prioridad
CREATE OR REPLACE FUNCTION app.apply_microcycle_progression(p_user_id integer, p_methodology_plan_id integer)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_mean_rir DECIMAL;
  v_deload_active BOOLEAN := FALSE;
  v_priority_muscle VARCHAR;
  v_priority_started_at TIMESTAMP;
  v_should_progress BOOLEAN := false;
  v_rules JSONB;
  v_base_increment NUMERIC := 2.5;
  v_high_increment NUMERIC := 3.5;
  v_low_decrement NUMERIC := -2.5;
  v_high_rir_threshold NUMERIC := 3;
  v_low_rir_threshold NUMERIC := 2;
  v_np_reactivation_rir NUMERIC := 4;
  v_np_reactivation_weeks INT := 2;
  v_priority_increment NUMERIC := 0;
  v_np_increment NUMERIC := 0;
  v_flags_count INT := 0;
  v_mean_rir_priority NUMERIC := NULL;
  v_mean_rir_np NUMERIC := NULL;
  v_np_streak INT := 0;
  v_np_progression_active BOOLEAN := false;
  v_priority_updates INT := 0;
  v_np_updates INT := 0;
  v_priority_weeks_elapsed NUMERIC := 0;
  v_tech_corrections INT := 0;
BEGIN
  v_rules := app.get_active_mindfeed_ruleset('hipertrofia_v2_principiante');
  v_base_increment := COALESCE((v_rules->'priorityRules'->'priorityProgression'->>'baseIncrementPct')::NUMERIC, 2.5);
  v_high_increment := COALESCE((v_rules->'priorityRules'->'priorityProgression'->>'highReadinessIncrementPct')::NUMERIC, 3.5);
  v_low_decrement := COALESCE((v_rules->'priorityRules'->'priorityProgression'->>'lowReadinessDecrementPct')::NUMERIC, -2.5);
  v_high_rir_threshold := COALESCE((v_rules->'priorityRules'->'priorityProgression'->>'highMeanRirThreshold')::NUMERIC, 3);
  v_low_rir_threshold := COALESCE((v_rules->'priorityRules'->'priorityProgression'->>'lowMeanRirThreshold')::NUMERIC, 2);
  v_np_reactivation_rir := COALESCE((v_rules->'priorityRules'->'nonPriority'->>'reactivationMeanRir')::NUMERIC, 4);
  v_np_reactivation_weeks := COALESCE((v_rules->'priorityRules'->'nonPriority'->>'reactivationWeeks')::INT, 2);

  -- Calcular RIR medio global
  v_mean_rir := app.calculate_mean_rir_last_microcycle(p_user_id, p_methodology_plan_id);

  -- Estado actual
  SELECT deload_active, priority_muscle, priority_started_at, np_high_rir_streak
  INTO v_deload_active, v_priority_muscle, v_priority_started_at, v_np_streak
  FROM app.hipertrofia_v2_state
  WHERE user_id = p_user_id;

  IF v_deload_active THEN
    RETURN jsonb_build_object(
      'progression_applied', false,
      'mean_rir', v_mean_rir,
      'reason', 'Deload activo',
      'message', 'Cargas mantenidas por deload activo'
    );
  END IF;

  -- Flags recientes (cualquier tipo) en ventana de 10 días
  SELECT COUNT(*)
  INTO v_flags_count
  FROM app.fatigue_flags
  WHERE user_id = p_user_id
    AND flag_date >= NOW() - INTERVAL '10 days';

  -- Si no hay prioridad, mantener lógica base condicionada por mean RIR
  IF v_priority_muscle IS NULL THEN
    v_should_progress := v_mean_rir >= 3;

    IF v_should_progress THEN
      UPDATE app.hypertrophy_progression
      SET
        target_weight_next_cycle = ROUND((COALESCE(current_pr, target_weight_80) * 0.80 * (1 + v_base_increment / 100))::NUMERIC, 2),
        last_adjustment = 'increase',
        adjustment_date = NOW(),
        last_microcycle_completed = (
          SELECT microcycles_completed
          FROM app.hipertrofia_v2_state
          WHERE user_id = p_user_id
        ),
        updated_at = NOW()
      WHERE user_id = p_user_id
        AND NOT progression_locked;

      GET DIAGNOSTICS v_np_updates = ROW_COUNT;

      RETURN jsonb_build_object(
        'progression_applied', true,
        'mean_rir', v_mean_rir,
        'increment_pct', v_base_increment,
        'exercises_updated', v_np_updates,
        'message', CONCAT('Progresión +', v_base_increment, '% aplicada a ', v_np_updates, ' ejercicios')
      );
    END IF;

    RETURN jsonb_build_object(
      'progression_applied', false,
      'mean_rir', v_mean_rir,
      'reason', 'RIR promedio bajo (mantener cargas)',
      'message', 'Cargas mantenidas este microciclo'
    );
  END IF;

  -- Con prioridad activa: calcular mean RIR por categoría
  WITH rir_by_cat AS (
    SELECT *
    FROM app.calculate_mean_rir_last_microcycle_by_category(p_user_id, p_methodology_plan_id)
  )
  SELECT
    MAX(mean_rir) FILTER (WHERE categoria ILIKE CONCAT('%', v_priority_muscle, '%')),
    AVG(mean_rir) FILTER (WHERE categoria NOT ILIKE CONCAT('%', v_priority_muscle, '%'))
  INTO v_mean_rir_priority, v_mean_rir_np
  FROM rir_by_cat;

  v_mean_rir_priority := COALESCE(v_mean_rir_priority, v_mean_rir);
  v_mean_rir_np := COALESCE(v_mean_rir_np, v_mean_rir);

  -- Correcciones técnicas recientes del músculo prioritario (últimos 7 días)
  SELECT COALESCE(SUM(corrections_count), 0)
  INTO v_tech_corrections
  FROM app.technique_corrections
  WHERE user_id = p_user_id
    AND muscle_group ILIKE CONCAT('%', v_priority_muscle, '%')
    AND created_at >= NOW() - INTERVAL '7 days';

  -- Semanas transcurridas desde activación de prioridad
  IF v_priority_started_at IS NOT NULL THEN
    v_priority_weeks_elapsed := GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (NOW() - v_priority_started_at)) / 604800) + 1);
  END IF;

  -- Determinar incremento/decremento para P
  IF v_mean_rir_priority <= v_low_rir_threshold OR v_flags_count > 0 OR v_tech_corrections >= 2 THEN
    v_priority_increment := v_low_decrement;
  ELSIF v_mean_rir >= 3 AND v_mean_rir_priority >= v_high_rir_threshold AND v_flags_count = 0 AND v_tech_corrections < 2 THEN
    v_priority_increment := v_high_increment;
  ELSIF v_mean_rir >= 3 THEN
    v_priority_increment := v_base_increment;
  ELSE
    v_priority_increment := 0;
  END IF;

  -- Reactivación de NP por mean RIR alto sostenido
  IF v_mean_rir_np >= v_np_reactivation_rir THEN
    v_np_streak := v_np_streak + 1;
  ELSE
    v_np_streak := 0;
  END IF;

  v_np_progression_active := v_np_streak >= v_np_reactivation_weeks;
  v_np_increment := CASE WHEN v_np_progression_active THEN v_base_increment ELSE 0 END;

  UPDATE app.hipertrofia_v2_state
  SET np_high_rir_streak = v_np_streak,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Actualizar ejercicios del músculo prioritario
  UPDATE app.hypertrophy_progression hp
  SET
    target_weight_next_cycle = ROUND((
      COALESCE(hp.target_weight_next_cycle, COALESCE(hp.current_pr, hp.target_weight_80) * 0.80)
      * (1 + v_priority_increment / 100)
    )::NUMERIC, 2),
    last_adjustment = CASE
      WHEN v_priority_increment > 0 THEN 'priority_increase'
      WHEN v_priority_increment < 0 THEN 'priority_decrease'
      ELSE 'priority_hold'
    END,
    adjustment_date = NOW(),
    last_microcycle_completed = (
      SELECT microcycles_completed
      FROM app.hipertrofia_v2_state
      WHERE user_id = p_user_id
    ),
    updated_at = NOW()
  FROM app."Ejercicios_Hipertrofia" ex
  WHERE hp.user_id = p_user_id
    AND hp.exercise_id = ex.exercise_id
    AND ex.categoria ILIKE CONCAT('%', v_priority_muscle, '%')
    AND NOT hp.progression_locked;

  GET DIAGNOSTICS v_priority_updates = ROW_COUNT;

  -- Actualizar ejercicios no prioritarios (congelados salvo reactivación)
  UPDATE app.hypertrophy_progression hp
  SET
    target_weight_next_cycle = ROUND((
      COALESCE(hp.target_weight_next_cycle, COALESCE(hp.current_pr, hp.target_weight_80) * 0.80)
      * (1 + v_np_increment / 100)
    )::NUMERIC, 2),
    last_adjustment = CASE
      WHEN v_np_increment > 0 THEN 'np_reactivated'
      ELSE 'np_frozen_priority'
    END,
    adjustment_date = NOW(),
    last_microcycle_completed = (
      SELECT microcycles_completed
      FROM app.hipertrofia_v2_state
      WHERE user_id = p_user_id
    ),
    updated_at = NOW()
  FROM app."Ejercicios_Hipertrofia" ex
  WHERE hp.user_id = p_user_id
    AND hp.exercise_id = ex.exercise_id
    AND ex.categoria NOT ILIKE CONCAT('%', v_priority_muscle, '%')
    AND NOT hp.progression_locked;

  GET DIAGNOSTICS v_np_updates = ROW_COUNT;

  RETURN jsonb_build_object(
    'progression_applied', (v_priority_updates + v_np_updates) > 0,
    'mean_rir_global', v_mean_rir,
    'mean_rir_priority', v_mean_rir_priority,
    'mean_rir_np', v_mean_rir_np,
    'priority_increment_pct', v_priority_increment,
    'np_increment_pct', v_np_increment,
    'np_streak', v_np_streak,
    'np_progression_active', v_np_progression_active,
    'flags_recent', v_flags_count,
    'tech_corrections_recent', v_tech_corrections,
    'priority_weeks_elapsed', v_priority_weeks_elapsed,
    'priority_updates', v_priority_updates,
    'np_updates', v_np_updates,
    'message', 'Progresión aplicada con reglas de prioridad MindFeed v1'
  );
END;
$function$;
