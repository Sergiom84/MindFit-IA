-- MindFeed Compliance v1 - Fase B
-- Deload completo: trigger planificado y reactivo, con -30% carga y -50% volumen

-- Helper: aplicar deload a una semana específica del plan (JSONB)
CREATE OR REPLACE FUNCTION app.apply_deload_to_week(
  p_week JSONB,
  p_load_factor NUMERIC,
  p_volume_factor NUMERIC,
  p_reason VARCHAR
)
RETURNS JSONB
LANGUAGE plpgsql
AS $function$
DECLARE
  v_week JSONB := COALESCE(p_week, '{}'::jsonb);
  v_sessions JSONB := COALESCE(v_week->'sesiones', '[]'::jsonb);
  v_session JSONB;
  v_exercises JSONB;
  v_ex JSONB;
  v_len_sessions INT := COALESCE(jsonb_array_length(v_sessions), 0);
  v_len_ex INT;
  v_i INT;
  v_j INT;
  v_session_intensity NUMERIC;
  v_new_session_intensity NUMERIC;
  v_series INT;
  v_new_series INT;
  v_intensity NUMERIC;
  v_new_intensity NUMERIC;
  v_note_suffix TEXT := CONCAT(' [DELOAD ', UPPER(COALESCE(p_reason, 'planificado')), '] -30% carga, -50% volumen');
BEGIN
  IF v_len_sessions = 0 THEN
    RETURN v_week;
  END IF;

  FOR v_i IN 0..v_len_sessions - 1 LOOP
    v_session := v_sessions->v_i;

    v_session_intensity := NULLIF((v_session->>'intensidad_porcentaje')::NUMERIC, NULL);
    IF v_session_intensity IS NOT NULL THEN
      v_new_session_intensity := ROUND(v_session_intensity * p_load_factor, 1);
      v_session := jsonb_set(v_session, '{intensidad_porcentaje}', to_jsonb(v_new_session_intensity), TRUE);
    END IF;

    v_session := jsonb_set(v_session, '{es_deload}', 'true'::jsonb, TRUE);
    v_session := jsonb_set(v_session, '{tipo}', to_jsonb('deload'::text), TRUE);
    v_session := jsonb_set(v_session, '{deload_reason}', to_jsonb(COALESCE(p_reason, 'planificado')), TRUE);

    v_exercises := COALESCE(v_session->'ejercicios', '[]'::jsonb);
    v_len_ex := COALESCE(jsonb_array_length(v_exercises), 0);

    IF v_len_ex > 0 THEN
      FOR v_j IN 0..v_len_ex - 1 LOOP
        v_ex := v_exercises->v_j;

        v_series := COALESCE(NULLIF((v_ex->>'series')::INT, NULL), 1);
        v_new_series := GREATEST(1, FLOOR(v_series * p_volume_factor)::INT);
        v_ex := jsonb_set(v_ex, '{series}', to_jsonb(v_new_series), TRUE);

        v_intensity := COALESCE(
          NULLIF((v_ex->>'intensidad_porcentaje')::NUMERIC, NULL),
          v_session_intensity
        );

        IF v_intensity IS NOT NULL THEN
          v_new_intensity := ROUND(v_intensity * p_load_factor, 1);
          v_ex := jsonb_set(v_ex, '{intensidad_porcentaje}', to_jsonb(v_new_intensity), TRUE);
        END IF;

        v_ex := jsonb_set(
          v_ex,
          '{notas}',
          to_jsonb(TRIM(COALESCE(v_ex->>'notas', '') || v_note_suffix)),
          TRUE
        );

        v_exercises := jsonb_set(v_exercises, ARRAY[v_j::text], v_ex, TRUE);
      END LOOP;

      v_session := jsonb_set(v_session, '{ejercicios}', v_exercises, TRUE);
    END IF;

    v_sessions := jsonb_set(v_sessions, ARRAY[v_i::text], v_session, TRUE);
  END LOOP;

  v_week := jsonb_set(v_week, '{sesiones}', v_sessions, TRUE);
  v_week := jsonb_set(v_week, '{tipo}', to_jsonb('deload'::text), TRUE);
  v_week := jsonb_set(v_week, '{es_deload}', 'true'::jsonb, TRUE);

  RETURN v_week;
END;
$function$;

-- Trigger deload: planificado (microciclos) y reactivo (fatiga crítica)
CREATE OR REPLACE FUNCTION app.check_deload_trigger(p_user_id integer)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_microcycles_completed INT;
  v_deload_active BOOLEAN;
  v_should_trigger BOOLEAN := false;
  v_reason VARCHAR(50);
  v_result JSONB;
  v_rules JSONB;
  v_window_days INT := 10;
  v_critical_threshold INT := 1;
  v_critical_flags INT := 0;
BEGIN
  -- Obtener ruleset (si existe)
  v_rules := app.get_active_mindfeed_ruleset('hipertrofia_v2_principiante');
  v_window_days := COALESCE((v_rules->'deloadRules'->>'reactiveWindowDays')::INT, 10);
  v_critical_threshold := COALESCE((v_rules->'deloadRules'->>'reactiveCriticalFlagsThreshold')::INT, 1);

  -- Obtener estado actual
  SELECT microcycles_completed, deload_active
  INTO v_microcycles_completed, v_deload_active
  FROM app.hipertrofia_v2_state
  WHERE user_id = p_user_id;

  -- No activar si ya está en deload
  IF v_deload_active THEN
    RETURN jsonb_build_object(
      'should_trigger', false,
      'reason', 'Deload ya activo',
      'current_deload', true
    );
  END IF;

  -- Trigger reactivo por fatiga crítica reciente
  SELECT COUNT(*)
  INTO v_critical_flags
  FROM app.fatigue_flags
  WHERE user_id = p_user_id
    AND flag_type = 'critical'
    AND flag_date >= NOW() - make_interval(days => v_window_days);

  IF v_critical_flags >= v_critical_threshold THEN
    v_should_trigger := true;
    v_reason := 'reactivo_fatiga';
  END IF;

  -- Trigger planificado por microciclos
  IF NOT v_should_trigger AND v_microcycles_completed >= 6 THEN
    v_should_trigger := true;
    v_reason := 'planificado';
  END IF;

  v_result := jsonb_build_object(
    'should_trigger', v_should_trigger,
    'reason', v_reason,
    'microcycles_completed', v_microcycles_completed,
    'critical_flags_recent', v_critical_flags,
    'window_days', v_window_days,
    'message', CASE
      WHEN v_should_trigger THEN CONCAT('Deload requerido (', v_reason, ')')
      ELSE 'No se requiere deload aún'
    END
  );

  RETURN v_result;
END;
$function$;

-- Activación de deload con impacto real en plan_data (semana actual)
CREATE OR REPLACE FUNCTION app.activate_deload(
  p_user_id integer,
  p_methodology_plan_id integer,
  p_reason character varying DEFAULT 'planificado'::character varying
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_exercises_affected INT := 0;
  v_rules JSONB;
  v_load_factor NUMERIC := 0.7;
  v_volume_factor NUMERIC := 0.5;
  v_plan_data JSONB;
  v_semanas JSONB;
  v_semana JSONB;
  v_len INT;
  v_idx INT;
  v_week_number INT;
  v_target_week INT;
  v_plan_updated BOOLEAN := false;
BEGIN
  v_rules := app.get_active_mindfeed_ruleset('hipertrofia_v2_principiante');
  v_load_factor := COALESCE((v_rules->'deloadRules'->>'loadFactor')::NUMERIC, 0.7);
  v_volume_factor := COALESCE((v_rules->'deloadRules'->>'volumeFactor')::NUMERIC, 0.5);

  -- Determinar semana objetivo: usar current_week si existe, si no semana 6
  SELECT COALESCE(current_week, 6)
  INTO v_week_number
  FROM app.methodology_plans
  WHERE id = p_methodology_plan_id;

  v_target_week := GREATEST(1, COALESCE(v_week_number, 6));

  -- Marcar deload activo en estado
  UPDATE app.hipertrofia_v2_state
  SET
    deload_active = true,
    deload_reason = p_reason,
    deload_started_at = NOW(),
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Reducir peso objetivo según factor del ruleset
  UPDATE app.hypertrophy_progression
  SET
    target_weight_next_cycle = ROUND((COALESCE(target_weight_next_cycle, target_weight_80) * v_load_factor)::NUMERIC, 2),
    last_adjustment = 'deload',
    adjustment_date = NOW(),
    updated_at = NOW()
  WHERE user_id = p_user_id;

  GET DIAGNOSTICS v_exercises_affected = ROW_COUNT;

  -- Aplicar deload a la semana objetivo en plan_data
  SELECT plan_data
  INTO v_plan_data
  FROM app.methodology_plans
  WHERE id = p_methodology_plan_id
  FOR UPDATE;

  IF v_plan_data IS NOT NULL THEN
    v_semanas := COALESCE(v_plan_data->'semanas', '[]'::jsonb);
    v_len := COALESCE(jsonb_array_length(v_semanas), 0);

    IF v_len > 0 THEN
      FOR v_idx IN 0..v_len - 1 LOOP
        v_semana := v_semanas->v_idx;

        IF (v_semana->>'numero')::INT = v_target_week THEN
          v_semana := app.apply_deload_to_week(v_semana, v_load_factor, v_volume_factor, p_reason);
          v_semanas := jsonb_set(v_semanas, ARRAY[v_idx::text], v_semana, TRUE);
          v_plan_updated := true;
        END IF;
      END LOOP;

      IF v_plan_updated THEN
        v_plan_data := jsonb_set(v_plan_data, '{semanas}', v_semanas, TRUE);
        v_plan_data := jsonb_set(v_plan_data, '{deload_active}', 'true'::jsonb, TRUE);
        v_plan_data := jsonb_set(v_plan_data, '{deload_week}', to_jsonb(v_target_week), TRUE);

        UPDATE app.methodology_plans
        SET plan_data = v_plan_data,
            updated_at = NOW()
        WHERE id = p_methodology_plan_id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'deload_activated', true,
    'reason', p_reason,
    'load_reduction_pct', 30,
    'volume_reduction_pct', 50,
    'load_factor', v_load_factor,
    'volume_factor', v_volume_factor,
    'target_week', v_target_week,
    'plan_updated', v_plan_updated,
    'exercises_affected', v_exercises_affected,
    'message', CONCAT('Deload activado (', p_reason, ') en semana ', v_target_week)
  );
END;
$function$;
