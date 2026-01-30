-- Ajuste Week 0: evitar progresión y conteo de microciclo en calibración
-- y asegurar deload planificado en semana 6 aunque current_week esté desfasado.

CREATE OR REPLACE FUNCTION app.advance_cycle_day(
  p_user_id integer,
  p_session_day_name character varying,
  p_session_patterns jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_state RECORD;
  v_new_cycle_day INT;
  v_microcycle_completed BOOLEAN := false;
  v_progression_result JSONB;
  v_fatigue_check JSONB;
  v_inactivity_check JSONB;
  v_session_patterns JSONB := COALESCE(p_session_patterns, '[]'::jsonb);
  v_current_week INT;
BEGIN
  -- Verificar inactividad >14 días (FASE 2 Módulo 2)
  v_inactivity_check := app.check_and_apply_inactivity_calibration(p_user_id);

  IF (v_inactivity_check->>'calibration_needed')::BOOLEAN THEN
    RAISE NOTICE '[MINDFEED] Calibración por inactividad aplicada: % días',
      v_inactivity_check->>'days_inactive';
  END IF;

  -- Obtener estado actual del usuario
  SELECT * INTO v_state
  FROM app.hipertrofia_v2_state
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'No state found for user');
  END IF;

  -- Extraer número del día desde el identificador (D1 -> 1, etc.)
  v_new_cycle_day := SUBSTRING(p_session_day_name FROM 2)::INT;

  -- Obtener semana actual del plan
  SELECT current_week INTO v_current_week
  FROM app.methodology_plans
  WHERE id = v_state.methodology_plan_id;

  -- Si completó D5, reiniciar microciclo y evaluar fatiga (FASE 2 Módulo 1)
  IF v_new_cycle_day = 5 THEN
    v_new_cycle_day := 1;

    -- Semana 0: calibración sin progresión ni conteo de microciclo
    IF COALESCE(v_current_week, 1) = 0 THEN
      v_microcycle_completed := false;
      v_progression_result := jsonb_build_object(
        'progression_applied', false,
        'reason', 'week_0_calibration'
      );
      v_fatigue_check := NULL;

      UPDATE app.hipertrofia_v2_state
      SET
        cycle_day = v_new_cycle_day,
        last_session_at = NOW(),
        last_session_patterns = v_session_patterns
      WHERE user_id = p_user_id;
    ELSE
      v_microcycle_completed := true;

      v_fatigue_check := app.evaluate_fatigue_action(p_user_id);

      IF NOT (v_fatigue_check->>'progression_blocked')::BOOLEAN
         AND NOT v_state.deload_active THEN
        v_progression_result := app.apply_microcycle_progression(
          p_user_id,
          v_state.methodology_plan_id
        );

        RAISE NOTICE '[MINDFEED] Progresión aplicada: %', v_progression_result;
      ELSE
        v_progression_result := jsonb_build_object(
          'progression_applied', false,
          'reason', CASE
            WHEN (v_fatigue_check->>'progression_blocked')::BOOLEAN THEN 'fatigue_flags'
            WHEN v_state.deload_active THEN 'deload_active'
          END
        );

        RAISE NOTICE '[MINDFEED] Progresión bloqueada: %', v_progression_result;
      END IF;

      UPDATE app.hipertrofia_v2_state
      SET
        cycle_day = v_new_cycle_day,
        microcycles_completed = microcycles_completed + 1,
        last_session_at = NOW(),
        last_session_patterns = v_session_patterns
      WHERE user_id = p_user_id;
    END IF;

  ELSE
    -- Avanzar al siguiente día dentro del mismo microciclo
    v_new_cycle_day := v_new_cycle_day + 1;

    UPDATE app.hipertrofia_v2_state
    SET
      cycle_day = v_new_cycle_day,
      last_session_at = NOW(),
      last_session_patterns = v_session_patterns
    WHERE user_id = p_user_id;

    v_fatigue_check := NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'cycle_day', v_new_cycle_day,
    'microcycles_completed', CASE
      WHEN v_microcycle_completed THEN v_state.microcycles_completed + 1
      ELSE v_state.microcycles_completed
    END,
    'microcycle_completed', v_microcycle_completed,
    'message', CASE
      WHEN v_microcycle_completed THEN '¡Microciclo completado!'
      ELSE 'Avanzaste a D' || v_new_cycle_day
    END,
    'progression', v_progression_result,
    'fatigue_check', v_fatigue_check,
    'inactivity_check', v_inactivity_check,
    'session_patterns_saved', v_session_patterns
  );
END;
$function$;

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
  v_planned_week INT;
BEGIN
  v_rules := app.get_active_mindfeed_ruleset('hipertrofia_v2_principiante');
  v_load_factor := COALESCE((v_rules->'deloadRules'->>'loadFactor')::NUMERIC, 0.7);
  v_volume_factor := COALESCE((v_rules->'deloadRules'->>'volumeFactor')::NUMERIC, 0.5);
  v_planned_week := COALESCE((v_rules->'deloadRules'->'deloadWeeks'->>0)::INT, 6);

  -- Determinar semana objetivo: si es planificado, ir a la semana definida por reglas.
  SELECT COALESCE(current_week, v_planned_week)
  INTO v_week_number
  FROM app.methodology_plans
  WHERE id = p_methodology_plan_id;

  IF p_reason = 'planificado' THEN
    v_target_week := v_planned_week;
  ELSE
    v_target_week := GREATEST(1, COALESCE(v_week_number, v_planned_week));
  END IF;

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
