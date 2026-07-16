--
-- PostgreSQL database dump
--

\restrict sRch3r51hK9QzGRb0iRhIBMhdjbrViAXHbIVf7OOzo6dDkoOgaXtO8cGi4iE98P

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: app; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA app;


--
-- Name: estado_pesado_enum; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.estado_pesado_enum AS ENUM (
    'crudo',
    'cocido',
    'escurrido',
    'seco',
    'tal_cual'
);


--
-- Name: session_status_enum; Type: TYPE; Schema: app; Owner: -
--

CREATE TYPE app.session_status_enum AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'partial',
    'cancelled',
    'skipped',
    'paused'
);


--
-- Name: activate_bridge_flag(integer, character varying, character varying, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.activate_bridge_flag(p_user_id integer, p_flag_name character varying, p_severity character varying DEFAULT 'medium'::character varying, p_duration_days integer DEFAULT NULL::integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: activate_deload(integer, integer, character varying); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.activate_deload(p_user_id integer, p_methodology_plan_id integer, p_reason character varying DEFAULT 'planificado'::character varying) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: activate_muscle_priority(integer, character varying); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.activate_muscle_priority(p_user_id integer, p_muscle_group character varying) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_exists BOOLEAN;
  v_deload_active BOOLEAN := FALSE;
  v_plan_id INTEGER;
  v_reason VARCHAR := 'manual';
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
    v_reason,
    jsonb_build_object('source', 'activate_muscle_priority')
  );

  RETURN jsonb_build_object('success', true, 'priority_muscle', p_muscle_group);
END;
$$;


--
-- Name: activate_muscle_priority(integer, character varying, character varying); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.activate_muscle_priority(p_user_id integer, p_muscle_group character varying, p_reason character varying DEFAULT 'manual'::character varying) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: activate_plan_atomic(integer, integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.activate_plan_atomic(p_user_id integer, p_methodology_plan_id integer, p_routine_plan_id integer DEFAULT NULL::integer) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
      BEGIN
        -- 1. Cancelar cualquier plan activo previo del usuario y quitar is_current
        UPDATE app.methodology_plans
        SET status = 'cancelled',
            is_current = FALSE,
            cancelled_at = NOW(),
            updated_at = NOW()
        WHERE user_id = p_user_id
          AND status = 'active'
          AND id != p_methodology_plan_id;

        -- 2. Desactivar is_current de cualquier otro plan (por si tiene status != active)
        UPDATE app.methodology_plans
        SET is_current = FALSE
        WHERE user_id = p_user_id
          AND is_current = TRUE
          AND id != p_methodology_plan_id;

        -- 3. Activar el nuevo plan de metodología
        UPDATE app.methodology_plans
        SET status = 'active',
            is_current = TRUE,
            confirmed_at = COALESCE(confirmed_at, NOW()),
            updated_at = NOW()
        WHERE id = p_methodology_plan_id
          AND user_id = p_user_id
          AND status IN ('draft', 'active'); -- Permitir reactivación

        -- Verificar que se actualizó
        IF NOT FOUND THEN
          RETURN FALSE;
        END IF;

        -- 4. Actualizar sesiones de ejercicio asociadas si existen
        UPDATE app.methodology_exercise_sessions
        SET session_status = CASE
              WHEN session_status = 'completed' THEN 'completed'
              ELSE 'pending'
            END,
            updated_at = NOW()
        WHERE methodology_plan_id = p_methodology_plan_id
          AND user_id = p_user_id;

        RETURN TRUE;
      END;
      $$;


--
-- Name: add_methodology_feedback(integer, integer, character varying, character varying, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.add_methodology_feedback(p_user_id integer, p_methodology_plan_id integer, p_exercise_name character varying, p_sentiment character varying DEFAULT NULL::character varying, p_comment text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_session_id INTEGER;
    v_exercise_order INTEGER;
    v_sent TEXT := CASE WHEN p_sentiment IS NULL THEN NULL ELSE lower(p_sentiment) END;
BEGIN
    IF v_sent IS NOT NULL AND v_sent NOT IN ('love','normal','hard') THEN
        RAISE NOTICE 'Sentiment % inválido. Debe ser love|normal|hard o NULL.', v_sent;
        RETURN FALSE;
    END IF;
    SELECT mes.id
      INTO v_session_id
    FROM app.methodology_exercise_sessions mes
    WHERE mes.user_id = p_user_id
      AND mes.methodology_plan_id = p_methodology_plan_id
    ORDER BY COALESCE(mes.started_at, mes.created_at) DESC
    LIMIT 1;
    IF v_session_id IS NULL THEN
        RETURN FALSE;
    END IF;
    SELECT exercise_order
      INTO v_exercise_order
    FROM app.methodology_exercise_progress
    WHERE methodology_session_id = v_session_id
      AND exercise_name = p_exercise_name
    ORDER BY exercise_order
    LIMIT 1;
    v_exercise_order := COALESCE(v_exercise_order, 0);
    INSERT INTO app.methodology_exercise_feedback (
        methodology_session_id,
        user_id,
        exercise_name,
        exercise_order,
        sentiment,
        comment
    ) VALUES (
        v_session_id,
        p_user_id,
        p_exercise_name,
        v_exercise_order,
        v_sent,
        p_comment
    )
    ON CONFLICT ON CONSTRAINT methodology_feedback_unique
    DO UPDATE SET
        sentiment  = EXCLUDED.sentiment,
        comment    = EXCLUDED.comment,
        updated_at = NOW();
    RETURN TRUE;
END;
$$;


--
-- Name: advance_cycle_day(integer, character varying); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.advance_cycle_day(p_user_id integer, p_session_day_name character varying) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_state RECORD;
  v_new_cycle_day INT;
  v_microcycle_completed BOOLEAN := false;
  v_progression_result JSONB;
  v_fatigue_check JSONB;
  v_inactivity_check JSONB;
BEGIN
  -- ===================================
  -- 🎯 NUEVO: VERIFICAR INACTIVIDAD ANTES DE AVANZAR
  -- ===================================
  v_inactivity_check := app.check_and_apply_inactivity_calibration(p_user_id);

  IF (v_inactivity_check->>'calibration_needed')::BOOLEAN THEN
    RAISE NOTICE '[MINDFEED] Calibración por inactividad aplicada: % días',
      v_inactivity_check->>'days_inactive';
  END IF;

  -- Obtener estado actual
  SELECT * INTO v_state
  FROM app.hipertrofia_v2_state
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'No state found for user');
  END IF;

  -- Extraer número del día (D1 -> 1, D2 -> 2, etc.)
  v_new_cycle_day := SUBSTRING(p_session_day_name FROM 2)::INT;

  -- Si completó D5, reiniciar a D1 e incrementar microcycles_completed
  IF v_new_cycle_day = 5 THEN
    v_new_cycle_day := 1;
    v_microcycle_completed := true;

    -- ===================================
    -- EVALUAR FATIGA ANTES DE PROGRESAR (FASE 2 Módulo 1)
    -- ===================================
    v_fatigue_check := app.evaluate_fatigue_action(p_user_id);

    -- Si progresión NO está bloqueada y mean_RIR >= 3: aplicar progresión
    IF NOT (v_fatigue_check->>'progression_blocked')::BOOLEAN
       AND NOT v_state.deload_active THEN

      -- Aplicar progresión automática +2.5%
      v_progression_result := app.apply_microcycle_progression(
        p_user_id,
        v_state.methodology_plan_id
      );

      RAISE NOTICE '[MINDFEED] Progresión aplicada: %', v_progression_result;
    ELSE
      -- Progresión bloqueada por fatiga o deload
      v_progression_result := jsonb_build_object(
        'progression_applied', false,
        'reason', CASE
          WHEN (v_fatigue_check->>'progression_blocked')::BOOLEAN THEN 'fatigue_flags'
          WHEN v_state.deload_active THEN 'deload_active'
        END
      );

      RAISE NOTICE '[MINDFEED] Progresión bloqueada: %', v_progression_result;
    END IF;

    -- Incrementar contador de microciclos
    UPDATE app.hipertrofia_v2_state
    SET
      cycle_day = v_new_cycle_day,
      microcycles_completed = microcycles_completed + 1,
      last_session_at = NOW()
    WHERE user_id = p_user_id;

  ELSE
    -- Avanzar al siguiente día (D1->D2, D2->D3, etc.)
    v_new_cycle_day := v_new_cycle_day + 1;

    UPDATE app.hipertrofia_v2_state
    SET
      cycle_day = v_new_cycle_day,
      last_session_at = NOW()
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
    'inactivity_check', v_inactivity_check
  );
END;
$$;


--
-- Name: advance_cycle_day(integer, character varying, jsonb); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.advance_cycle_day(p_user_id integer, p_session_day_name character varying, p_session_patterns jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: apply_deload_to_week(jsonb, numeric, numeric, character varying); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.apply_deload_to_week(p_week jsonb, p_load_factor numeric, p_volume_factor numeric, p_reason character varying) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: apply_fatigue_adjustments(integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.apply_fatigue_adjustments(p_user_id integer, p_methodology_plan_id integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_fatigue_eval JSONB;
  v_load_adjustment NUMERIC;
  v_rows_updated INT;
BEGIN
  -- Evaluar acción recomendada
  v_fatigue_eval := app.evaluate_fatigue_action(p_user_id);
  v_load_adjustment := (v_fatigue_eval->>'load_adjustment')::NUMERIC;

  -- Si hay ajuste de carga, aplicarlo
  IF v_load_adjustment != 0 THEN
    UPDATE app.hypertrophy_progression
    SET target_weight_next_cycle = target_weight_next_cycle * (1 + v_load_adjustment)
    WHERE user_id = p_user_id;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

    RAISE NOTICE '[FATIGUE] Ajuste aplicado: % carga, % ejercicios actualizados',
      v_load_adjustment * 100, v_rows_updated;
  ELSE
    v_rows_updated := 0;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'fatigue_evaluation', v_fatigue_eval,
    'adjustments_applied', v_load_adjustment != 0,
    'exercises_updated', v_rows_updated
  );
END;
$$;


--
-- Name: apply_microcycle_progression(integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.apply_microcycle_progression(p_user_id integer, p_methodology_plan_id integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
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
  v_current_week INT := NULL;
  v_deload_weeks INT[] := ARRAY[6];
  v_programmed_deload BOOLEAN := FALSE;
BEGIN
  v_rules := app.get_active_mindfeed_ruleset('hipertrofia_v2_principiante');
  v_base_increment := COALESCE((v_rules->'priorityRules'->'priorityProgression'->>'baseIncrementPct')::NUMERIC, 2.5);
  v_high_increment := COALESCE((v_rules->'priorityRules'->'priorityProgression'->>'highReadinessIncrementPct')::NUMERIC, 3.5);
  v_low_decrement := COALESCE((v_rules->'priorityRules'->'priorityProgression'->>'lowReadinessDecrementPct')::NUMERIC, -2.5);
  v_high_rir_threshold := COALESCE((v_rules->'priorityRules'->'priorityProgression'->>'highMeanRirThreshold')::NUMERIC, 3);
  v_low_rir_threshold := COALESCE((v_rules->'priorityRules'->'priorityProgression'->>'lowMeanRirThreshold')::NUMERIC, 2);
  v_np_reactivation_rir := COALESCE((v_rules->'priorityRules'->'nonPriority'->>'reactivationMeanRir')::NUMERIC, 4);
  v_np_reactivation_weeks := COALESCE((v_rules->'priorityRules'->'nonPriority'->>'reactivationWeeks')::INT, 2);

  -- Deload weeks desde ruleset (fallback [6])
  SELECT array_agg((value)::INT)
  INTO v_deload_weeks
  FROM jsonb_array_elements_text(
    COALESCE(v_rules->'deloadRules'->'deloadWeeks', '[6]'::jsonb)
  ) AS value;
  v_deload_weeks := COALESCE(v_deload_weeks, ARRAY[6]);

  -- Semana actual del plan
  SELECT current_week
  INTO v_current_week
  FROM app.methodology_plans
  WHERE id = p_methodology_plan_id
    AND user_id = p_user_id;

  IF v_current_week IS NOT NULL AND v_current_week = ANY(v_deload_weeks) THEN
    v_programmed_deload := TRUE;
  END IF;

  -- Calcular RIR medio global
  v_mean_rir := app.calculate_mean_rir_last_microcycle(p_user_id, p_methodology_plan_id);

  -- Estado actual
  SELECT deload_active, priority_muscle, priority_started_at, np_high_rir_streak
  INTO v_deload_active, v_priority_muscle, v_priority_started_at, v_np_streak
  FROM app.hipertrofia_v2_state
  WHERE user_id = p_user_id;

  v_deload_active := v_deload_active OR v_programmed_deload;

  IF v_deload_active THEN
    RETURN jsonb_build_object(
      'progression_applied', false,
      'mean_rir', v_mean_rir,
      'current_week', v_current_week,
      'programmed_deload', v_programmed_deload,
      'deload_weeks', v_deload_weeks,
      'reason', CASE
        WHEN v_programmed_deload THEN CONCAT('Deload programado semana ', v_current_week)
        ELSE 'Deload activo'
      END,
      'message', 'Cargas mantenidas por deload'
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
$$;


--
-- Name: apply_stall_deload(integer, text, text, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.apply_stall_deload(p_user_id integer, p_methodology text, p_decision text, p_threshold integer DEFAULT 4) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_stall integer;
  v_decision text := p_decision;
  v_plateau boolean := false;
BEGIN
  INSERT INTO app.autoreg_stall (user_id, methodology)
  VALUES (p_user_id, p_methodology)
  ON CONFLICT (user_id, methodology) DO NOTHING;

  SELECT stall_streak INTO v_stall
  FROM app.autoreg_stall
  WHERE user_id = p_user_id AND methodology = p_methodology;

  IF p_decision IN ('progress', 'deload') THEN
    v_stall := 0;
  ELSE
    v_stall := COALESCE(v_stall, 0) + 1;
  END IF;

  -- Meseta: demasiadas sesiones sin progresar → romper con un deload.
  IF v_stall >= GREATEST(p_threshold, 2) AND v_decision = 'hold' THEN
    v_decision := 'deload';
    v_plateau := true;
    v_stall := 0;
  END IF;

  UPDATE app.autoreg_stall
    SET stall_streak = v_stall,
        last_decision = v_decision,
        updated_at = now()
  WHERE user_id = p_user_id AND methodology = p_methodology;

  RETURN jsonb_build_object(
    'decision', v_decision,
    'stall_streak', v_stall,
    'plateau_deload', v_plateau
  );
END;
$$;


--
-- Name: auto_calculate_set_metrics(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.auto_calculate_set_metrics() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Calcular 1RM estimado
  NEW.estimated_1rm := app.calculate_estimated_1rm(
    NEW.weight_used,
    NEW.reps_completed,
    NEW.rir_reported
  );

  -- Calcular RPE (Rate of Perceived Exertion)
  NEW.rpe_calculated := 10 - NEW.rir_reported;

  -- Calcular volumen de carga
  NEW.volume_load := NEW.weight_used * NEW.reps_completed;

  -- Marcar si fue serie efectiva (RIR 2-3 = zona óptima hipertrofia)
  NEW.is_effective := NEW.rir_reported BETWEEN 2 AND 3;

  RETURN NEW;
END;
$$;


--
-- Name: auto_register_session_activity(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.auto_register_session_activity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.status = 'in_progress' AND (OLD.status IS NULL OR OLD.status != 'in_progress') THEN
        PERFORM app.register_daily_activity(
            NEW.user_id, 
            NEW.routine_plan_id, 
            'session_start', 
            NEW.id
        );
    END IF;
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        PERFORM app.register_daily_activity(
            NEW.user_id, 
            NEW.routine_plan_id, 
            'session_complete', 
            NEW.id
        );
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: calculate_calistenia_progression_readiness(integer, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.calculate_calistenia_progression_readiness(p_user_id integer, p_exercise_name text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  recent_sets RECORD;
  analysis_result JSONB;
  consistency_score NUMERIC;
  volume_trend NUMERIC;
  quality_trend NUMERIC;
BEGIN
  -- Obtener sets de las últimas 2 semanas
  SELECT 
    COUNT(*) as total_sets,
    ROUND(AVG(actual_reps)::numeric, 2) as avg_reps,
    ROUND(AVG(form_quality)::numeric, 2) as avg_quality,
    ROUND(AVG(rpe_difficulty)::numeric, 2) as avg_rpe,
    COUNT(CASE WHEN progression_ready = true THEN 1 END) as ready_sets
  INTO recent_sets
  FROM app.calistenia_exercise_sets
  WHERE user_id = p_user_id 
    AND exercise_name = p_exercise_name
    AND completed_at >= CURRENT_DATE - INTERVAL '2 weeks';
  
  -- Si no hay suficientes datos
  IF recent_sets.total_sets < 3 THEN
    analysis_result := jsonb_build_object(
      'ready_to_progress', false,
      'confidence', 0.0,
      'requirements_met', jsonb_build_object(
        'sufficient_volume', false,
        'consistent_quality', false,
        'manageable_intensity', false
      ),
      'metrics', jsonb_build_object(
        'total_sets', recent_sets.total_sets,
        'avg_reps', COALESCE(recent_sets.avg_reps, 0),
        'avg_form_quality', COALESCE(recent_sets.avg_quality, 0),
        'avg_rpe', COALESCE(recent_sets.avg_rpe, 0)
      )
    );
    RETURN analysis_result;
  END IF;
  
  -- Calcular criterios básicos
  consistency_score := CASE 
    WHEN recent_sets.avg_quality >= 4.0 AND recent_sets.avg_rpe <= 7.0 THEN 1.0
    WHEN recent_sets.avg_quality >= 3.5 AND recent_sets.avg_rpe <= 8.0 THEN 0.7
    ELSE 0.3
  END;
  
  -- Determinar preparación
  analysis_result := jsonb_build_object(
    'ready_to_progress', (
      recent_sets.avg_reps >= 12 AND 
      recent_sets.avg_quality >= 4.0 AND 
      recent_sets.avg_rpe <= 7.0 AND
      recent_sets.ready_sets >= (recent_sets.total_sets * 0.6)
    ),
    'confidence', consistency_score,
    'requirements_met', jsonb_build_object(
      'sufficient_volume', recent_sets.avg_reps >= 12,
      'consistent_quality', recent_sets.avg_quality >= 4.0,
      'manageable_intensity', recent_sets.avg_rpe <= 7.0
    ),
    'metrics', jsonb_build_object(
      'total_sets', recent_sets.total_sets,
      'avg_reps', recent_sets.avg_reps,
      'avg_form_quality', recent_sets.avg_quality,
      'avg_rpe', recent_sets.avg_rpe,
      'ready_percentage', (recent_sets.ready_sets::numeric / recent_sets.total_sets * 100)
    )
  );
  
  RETURN analysis_result;
END;
$$;


--
-- Name: calculate_compensation(integer, integer, date, character varying); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.calculate_compensation(p_user_id integer, p_excess_kcal integer, p_deviation_date date, p_confidence character varying) RETURNS TABLE(compensation_date date, kcal_reduction integer, is_conservative boolean, protein_g_target numeric, carbs_g_adjustment numeric, fat_g_adjustment numeric, phase_used character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_config app.diet_deviation_config%ROWTYPE;
  v_daily_target INTEGER;
  v_weight_kg DECIMAL;
  v_phase VARCHAR(10);
  v_phase_pref TEXT;
  v_protein_target DECIMAL(6,1);
  v_carb_share NUMERIC;
  v_fat_share NUMERIC;
  v_carb_kcal INTEGER;
  v_fat_kcal INTEGER;
  v_carb_adjust DECIMAL(6,1);
  v_fat_adjust DECIMAL(6,1);
  v_remaining_days INTEGER;
  v_per_day_reduction INTEGER;
  v_max_reduction INTEGER;
  v_week_end DATE;
  v_current_date DATE;
  v_effective_excess INTEGER;
BEGIN
  -- Obtener configuracion del usuario
  SELECT * INTO v_config FROM app.diet_deviation_config WHERE user_id = p_user_id;

  -- Obtener objetivo diario, peso y fase
  SELECT daily_target_kcal, peso_kg, objetivo
  INTO v_daily_target, v_weight_kg, v_phase
  FROM app.nutrition_profiles
  WHERE user_id = p_user_id;

  IF v_daily_target IS NULL THEN
    v_daily_target := 2000; -- Default
  END IF;

  v_phase := COALESCE(v_phase, 'mant');
  v_phase_pref := COALESCE(v_config.phase_priority ->> v_phase, 'balanced');

  -- Proteina objetivo estable
  v_protein_target := ROUND(COALESCE(v_weight_kg, 70) * COALESCE(v_config.min_protein_g_kg, 2.0), 1);

  -- Calcular fin de semana (domingo)
  v_week_end := app.get_week_start(p_deviation_date) + 6;

  -- Calcular dias restantes en la semana (sin contar el dia del salto)
  v_remaining_days := v_week_end - p_deviation_date;

  IF v_remaining_days <= 0 THEN
    -- Si es domingo, no hay dias para compensar esta semana
    RETURN;
  END IF;

  -- Aplicar regla anti-ruido: si confianza baja, compensar solo la mitad
  IF p_confidence = 'bajo' OR COALESCE(v_config.conservative_mode, FALSE) THEN
    v_effective_excess := p_excess_kcal / 2;
  ELSE
    v_effective_excess := p_excess_kcal;
  END IF;

  -- Calcular reduccion por dia
  v_per_day_reduction := v_effective_excess / v_remaining_days;

  -- Aplicar limite maximo de reduccion por dia (20% por defecto)
  v_max_reduction := ROUND(v_daily_target * COALESCE(v_config.max_compensation_per_day_pct, 0.20));
  IF v_per_day_reduction > v_max_reduction THEN
    v_per_day_reduction := v_max_reduction;
  END IF;

  -- Reparto de kcal por macronutriente segun fase
  IF v_phase_pref IN ('carbs_only', 'carbs_first') THEN
    v_carb_share := 1.0;
  ELSE
    v_carb_share := 0.5; -- balanced
  END IF;
  v_fat_share := 1 - v_carb_share;

  v_carb_kcal := ROUND(v_per_day_reduction * v_carb_share);
  v_fat_kcal := v_per_day_reduction - v_carb_kcal;
  v_carb_adjust := -ROUND(v_carb_kcal / 4.0, 1); -- negativos indican reduccion
  v_fat_adjust := -ROUND(v_fat_kcal / 9.0, 1);

  -- Generar plan de compensacion para cada dia restante
  v_current_date := p_deviation_date + 1;
  WHILE v_current_date <= v_week_end LOOP
    RETURN QUERY SELECT
      v_current_date,
      -v_per_day_reduction,  -- Negativo indica reduccion
      (p_confidence = 'bajo' OR COALESCE(v_config.conservative_mode, FALSE)),
      v_protein_target,
      v_carb_adjust,
      v_fat_adjust,
      v_phase;

    v_current_date := v_current_date + 1;
  END LOOP;
END;
$$;


--
-- Name: calculate_current_streak(integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.calculate_current_streak(p_user_id integer, p_routine_plan_id integer DEFAULT NULL::integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    streak_count INTEGER := 0;
    current_date_check DATE;
    has_activity BOOLEAN;
BEGIN
    current_date_check := CURRENT_DATE;
    LOOP
        SELECT EXISTS(
            SELECT 1 FROM app.user_daily_activity 
            WHERE user_id = p_user_id 
            AND activity_date = current_date_check
            AND (p_routine_plan_id IS NULL OR routine_plan_id = p_routine_plan_id)
            AND activity_type = 'continue_training'
        ) INTO has_activity;
        IF NOT has_activity THEN
            EXIT;
        END IF;
        streak_count := streak_count + 1;
        current_date_check := current_date_check - INTERVAL '1 day';
        IF streak_count > 365 THEN
            EXIT;
        END IF;
    END LOOP;
    RETURN streak_count;
END;
$$;


--
-- Name: calculate_daily_macros(integer, date); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.calculate_daily_macros(p_user_id integer, p_date date DEFAULT CURRENT_DATE) RETURNS TABLE(total_calories numeric, total_protein numeric, total_carbs numeric, total_fat numeric, total_fiber numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(calories), 0) as total_calories,
        COALESCE(SUM(protein), 0) as total_protein,
        COALESCE(SUM(carbs), 0) as total_carbs,
        COALESCE(SUM(fat), 0) as total_fat,
        COALESCE(SUM(fiber), 0) as total_fiber
    FROM app.daily_nutrition_log
    WHERE user_id = p_user_id AND log_date = p_date;
END;
$$;


--
-- Name: calculate_estimated_1rm(numeric, integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.calculate_estimated_1rm(weight numeric, reps integer, rir integer) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  -- PR = peso × (1 + (reps + RIR) / 30)
  RETURN ROUND(weight * (1 + (reps + rir)::DECIMAL / 30), 2);
END;
$$;


--
-- Name: calculate_mean_rir_last_microcycle(integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.calculate_mean_rir_last_microcycle(p_user_id integer, p_methodology_plan_id integer) RETURNS numeric
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_mean_rir DECIMAL;
BEGIN
  -- Average RIR across the last 5 sessions (within last 14 days)
  WITH last_sessions AS (
    SELECT session_id, MAX(created_at) AS last_set_at
    FROM app.hypertrophy_set_logs
    WHERE user_id = p_user_id
      AND methodology_plan_id = p_methodology_plan_id
      AND created_at > NOW() - INTERVAL '14 days'
    GROUP BY session_id
    ORDER BY last_set_at DESC
    LIMIT 5
  )
  SELECT AVG(rir_reported)
  INTO v_mean_rir
  FROM app.hypertrophy_set_logs hsl
  JOIN last_sessions ls ON ls.session_id = hsl.session_id
  WHERE hsl.user_id = p_user_id
    AND hsl.methodology_plan_id = p_methodology_plan_id;

  RETURN COALESCE(v_mean_rir, 2.5);
END;
$$;


--
-- Name: calculate_mean_rir_last_microcycle_by_category(integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.calculate_mean_rir_last_microcycle_by_category(p_user_id integer, p_methodology_plan_id integer) RETURNS TABLE(categoria text, mean_rir numeric)
    LANGUAGE sql
    AS $$
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
$$;


--
-- Name: calculate_session_total_time(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.calculate_session_total_time(p_session_id integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
      DECLARE
        total_time INTEGER;
      BEGIN
        -- Sumar todos los time_spent_seconds de los ejercicios de la sesión
        SELECT COALESCE(SUM(time_spent_seconds), 0)
        INTO total_time
        FROM app.methodology_exercise_progress
        WHERE methodology_session_id = p_session_id;

        -- Actualizar el total en la sesión
        UPDATE app.methodology_exercise_sessions
        SET modal_time_total_seconds = total_time,
            actual_session_duration_seconds = CASE
              WHEN started_at IS NOT NULL AND completed_at IS NOT NULL THEN
                EXTRACT(EPOCH FROM (completed_at - started_at))::INTEGER
              ELSE actual_session_duration_seconds
            END,
            updated_at = NOW()
        WHERE id = p_session_id;

        RETURN total_time;
      END;
      $$;


--
-- Name: calculate_target_weight_80(numeric); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.calculate_target_weight_80(pr numeric) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
  target DECIMAL;
BEGIN
  target := pr * 0.8;
  -- Redondear a múltiplo de 2.5 kg
  RETURN ROUND((target / 2.5)::NUMERIC) * 2.5;
END;
$$;


--
-- Name: calculate_weight_average(integer, integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.calculate_weight_average(p_user_id integer, p_days integer DEFAULT 14, p_min_measurements integer DEFAULT 5) RETURNS TABLE(media_peso numeric, num_measurements integer, is_valid boolean)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    AVG(weight_kg)::DECIMAL(5,2) as media_peso,
    COUNT(*)::INTEGER as num_measurements,
    (COUNT(*) >= p_min_measurements) as is_valid
  FROM app.body_measurements
  WHERE user_id = p_user_id
  AND measurement_date >= CURRENT_DATE - INTERVAL '1 day' * p_days
  AND is_validated = TRUE;
END;
$$;


--
-- Name: calculate_weight_trend(integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.calculate_weight_trend(p_user_id integer, p_days integer DEFAULT 7) RETURNS TABLE(avg_weight numeric, avg_waist numeric, measurements_count integer, latest_date date)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    AVG(weight_kg)::DECIMAL(5,2) as avg_weight,
    AVG(waist_cm)::DECIMAL(5,2) as avg_waist,
    COUNT(*)::INTEGER as measurements_count,
    MAX(measurement_date) as latest_date
  FROM app.body_measurements
  WHERE user_id = p_user_id
    AND measurement_date >= CURRENT_DATE - p_days
    AND is_validated = TRUE;
END;
$$;


--
-- Name: calistenia_register_session_result(integer, integer, numeric, boolean, numeric); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.calistenia_register_session_result(p_user_id integer, p_plan_id integer, p_avg_rir numeric, p_target_met boolean, p_subjective numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_easy integer;
  v_hard integer;
  v_micro integer;
  v_decision varchar(20);
  v_deload boolean := false;
  v_class text;
BEGIN
  INSERT INTO app.calistenia_autoreg_state (user_id, methodology_plan_id)
  VALUES (p_user_id, p_plan_id)
  ON CONFLICT (user_id) DO UPDATE SET methodology_plan_id = EXCLUDED.methodology_plan_id;

  SELECT easy_streak, hard_streak, microcycles_completed
    INTO v_easy, v_hard, v_micro
  FROM app.calistenia_autoreg_state
  WHERE user_id = p_user_id;

  v_micro := COALESCE(v_micro, 0) + 1;

  -- 1) Clasificación OBJETIVA base (manda)
  IF p_target_met AND COALESCE(p_avg_rir, 0) >= 2 THEN
    v_class := 'easy';
  ELSIF (NOT p_target_met) OR COALESCE(p_avg_rir, 99) <= 0 THEN
    v_class := 'hard';
  ELSE
    v_class := 'neutral';
  END IF;

  -- 2) Aporte SUBJETIVO (acotado, no manda)
  IF p_subjective IS NOT NULL THEN
    IF v_class = 'easy' AND p_subjective <= -0.5 THEN
      v_class := 'neutral';
    ELSIF v_class = 'neutral' AND p_subjective >= 0.5 THEN
      v_class := 'easy';
    ELSIF v_class = 'neutral' AND p_subjective <= -0.5 THEN
      v_class := 'hard';
    END IF;
  END IF;

  -- 3) Rachas
  IF v_class = 'easy' THEN
    v_easy := COALESCE(v_easy, 0) + 1;
    v_hard := 0;
  ELSIF v_class = 'hard' THEN
    v_hard := COALESCE(v_hard, 0) + 1;
    v_easy := 0;
  ELSE
    v_easy := 0;
    v_hard := 0;
  END IF;

  -- 4) Decisión (gates OBJETIVOS intactos)
  IF v_hard >= 3 THEN
    v_decision := 'deload';
    v_deload := true;
    v_hard := 0;
  ELSIF v_easy >= 2 THEN
    v_decision := 'progress';
  ELSE
    v_decision := 'hold';
  END IF;

  UPDATE app.calistenia_autoreg_state
    SET easy_streak = v_easy,
        hard_streak = v_hard,
        microcycles_completed = v_micro,
        deload_suggested = v_deload,
        last_decision = v_decision,
        last_avg_rir = p_avg_rir,
        last_subjective = p_subjective,
        updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'decision', v_decision,
    'easy_streak', v_easy,
    'hard_streak', v_hard,
    'deload_suggested', v_deload,
    'microcycles_completed', v_micro,
    'subjective_applied', (p_subjective IS NOT NULL)
  );
END;
$$;


--
-- Name: can_repeat_exercise(character varying, integer, character varying); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.can_repeat_exercise(p_exercise_name character varying, p_user_id integer, p_methodology_type character varying DEFAULT 'general'::character varying) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
        DECLARE
            policy_record RECORD;
            last_usage TIMESTAMP;
            monthly_usage INTEGER;
        BEGIN
            -- Obtener política de repetición para la metodología
            SELECT * INTO policy_record
            FROM app.exercise_repetition_policy
            WHERE methodology_type = p_methodology_type;
            
            IF NOT FOUND THEN
                -- Si no hay política específica, permitir repetición
                RETURN TRUE;
            END IF;
            
            -- Verificar última vez que se usó el ejercicio
            SELECT MAX(used_at) INTO last_usage
            FROM app.exercise_history
            WHERE user_id = p_user_id 
            AND exercise_name = p_exercise_name;
            
            -- Si nunca se ha usado, permitir
            IF last_usage IS NULL THEN
                RETURN TRUE;
            END IF;
            
            -- Verificar si ha pasado el tiempo mínimo entre repeticiones (usar columna correcta)
            IF last_usage + (policy_record.min_days_between_same_exercise || ' days')::INTERVAL > NOW() THEN
                RETURN FALSE;
            END IF;
            
            -- Verificar uso mensual máximo
            SELECT COUNT(*) INTO monthly_usage
            FROM app.exercise_history
            WHERE user_id = p_user_id 
            AND exercise_name = p_exercise_name
            AND used_at >= (CURRENT_DATE - INTERVAL '30 days');
            
            IF monthly_usage >= policy_record.max_times_per_month THEN
                RETURN FALSE;
            END IF;
            
            RETURN TRUE;
        END;
        $$;


--
-- Name: can_use_exercise(integer, character varying, character varying); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.can_use_exercise(p_user_id integer, p_exercise_name character varying, p_methodology_type character varying) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    policy_record app.exercise_repetition_policy%ROWTYPE;
    last_usage TIMESTAMP;
    monthly_usage INTEGER;
BEGIN
    SELECT * INTO policy_record
    FROM app.exercise_repetition_policy
    WHERE methodology_type = p_methodology_type;
    IF NOT FOUND THEN
        RETURN TRUE;
    END IF;
    SELECT MAX(used_at) INTO last_usage
    FROM app.exercise_history
    WHERE user_id = p_user_id 
        AND exercise_name = p_exercise_name
        AND methodology_type = p_methodology_type;
    IF last_usage IS NULL THEN
        RETURN TRUE;
    END IF;
    IF (CURRENT_TIMESTAMP - last_usage) < INTERVAL '1 day' * policy_record.min_days_between_same_exercise THEN
        RETURN FALSE;
    END IF;
    SELECT COUNT(*) INTO monthly_usage
    FROM app.exercise_history
    WHERE user_id = p_user_id 
        AND exercise_name = p_exercise_name
        AND methodology_type = p_methodology_type
        AND used_at >= (CURRENT_TIMESTAMP - INTERVAL '30 days');
    IF monthly_usage >= policy_record.max_times_per_month THEN
        RETURN FALSE;
    END IF;
    RETURN TRUE;
END;
$$;


--
-- Name: casa_register_session_result(integer, integer, numeric, boolean, numeric); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.casa_register_session_result(p_user_id integer, p_plan_id integer, p_avg_rir numeric, p_target_met boolean, p_subjective numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_easy integer;
  v_hard integer;
  v_micro integer;
  v_decision varchar(20);
  v_deload boolean := false;
  v_class text;
BEGIN
  INSERT INTO app.casa_autoreg_state (user_id, methodology_plan_id)
  VALUES (p_user_id, p_plan_id)
  ON CONFLICT (user_id) DO UPDATE SET methodology_plan_id = EXCLUDED.methodology_plan_id;

  SELECT easy_streak, hard_streak, microcycles_completed
    INTO v_easy, v_hard, v_micro
  FROM app.casa_autoreg_state
  WHERE user_id = p_user_id;

  v_micro := COALESCE(v_micro, 0) + 1;

  IF p_target_met AND COALESCE(p_avg_rir, 0) >= 2 THEN
    v_class := 'easy';
  ELSIF (NOT p_target_met) OR COALESCE(p_avg_rir, 99) <= 0 THEN
    v_class := 'hard';
  ELSE
    v_class := 'neutral';
  END IF;

  IF p_subjective IS NOT NULL THEN
    IF v_class = 'easy' AND p_subjective <= -0.5 THEN
      v_class := 'neutral';
    ELSIF v_class = 'neutral' AND p_subjective >= 0.5 THEN
      v_class := 'easy';
    ELSIF v_class = 'neutral' AND p_subjective <= -0.5 THEN
      v_class := 'hard';
    END IF;
  END IF;

  IF v_class = 'easy' THEN
    v_easy := COALESCE(v_easy, 0) + 1;
    v_hard := 0;
  ELSIF v_class = 'hard' THEN
    v_hard := COALESCE(v_hard, 0) + 1;
    v_easy := 0;
  ELSE
    v_easy := 0;
    v_hard := 0;
  END IF;

  IF v_hard >= 3 THEN
    v_decision := 'deload';
    v_deload := true;
    v_hard := 0;
  ELSIF v_easy >= 2 THEN
    v_decision := 'progress';
  ELSE
    v_decision := 'hold';
  END IF;

  UPDATE app.casa_autoreg_state
    SET easy_streak = v_easy,
        hard_streak = v_hard,
        microcycles_completed = v_micro,
        deload_suggested = v_deload,
        last_decision = v_decision,
        last_avg_rir = p_avg_rir,
        last_subjective = p_subjective,
        updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'decision', v_decision,
    'easy_streak', v_easy,
    'hard_streak', v_hard,
    'deload_suggested', v_deload,
    'microcycles_completed', v_micro,
    'subjective_applied', (p_subjective IS NOT NULL)
  );
END;
$$;


--
-- Name: check_and_apply_inactivity_calibration(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.check_and_apply_inactivity_calibration(p_user_id integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_days_inactive NUMERIC;
  v_last_session_at TIMESTAMP;
  v_calibration_applied BOOLEAN := false;
BEGIN
  -- Obtener última sesión del usuario
  SELECT last_session_at
  INTO v_last_session_at
  FROM app.hipertrofia_v2_state
  WHERE user_id = p_user_id;

  -- Si no hay estado, retornar
  IF v_last_session_at IS NULL THEN
    RETURN jsonb_build_object(
      'calibration_needed', false,
      'reason', 'no_previous_sessions'
    );
  END IF;

  -- Calcular días de inactividad
  v_days_inactive := EXTRACT(EPOCH FROM (NOW() - v_last_session_at)) / 86400;

  RAISE NOTICE '[INACTIVITY] Usuario %: % días inactivo', p_user_id, v_days_inactive;

  -- Si >14 días: aplicar calibración
  IF v_days_inactive > 14 THEN
    -- Reducir cargas al 70%
    UPDATE app.hypertrophy_progression
    SET target_weight_next_cycle = current_weight * 0.70
    WHERE user_id = p_user_id;

    -- Desactivar prioridad si existe (FASE 2 Módulo 4)
    UPDATE app.hipertrofia_v2_state
    SET
      priority_muscle = NULL,
      priority_started_at = NULL,
      priority_microcycles_completed = 0,
      priority_top_sets_this_week = 0
    WHERE user_id = p_user_id;

    v_calibration_applied := true;

    RAISE NOTICE '[INACTIVITY] Calibración aplicada: cargas reducidas a 70%%';
  END IF;

  RETURN jsonb_build_object(
    'calibration_needed', v_calibration_applied,
    'days_inactive', v_days_inactive,
    'calibration_pct', 0.70,
    'message', CASE
      WHEN v_calibration_applied THEN
        'Inactividad detectada: cargas calibradas a 70%'
      ELSE
        'Sin inactividad prolongada'
    END
  );
END;
$$;


--
-- Name: check_deload_trigger(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.check_deload_trigger(p_user_id integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: check_performance_drop(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.check_performance_drop(p_user_id integer) RETURNS TABLE(has_performance_drop boolean, consecutive_weeks integer, last_measurement_date date, should_suggest_diet_break boolean, reason text)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_trend_1 TEXT;
  v_trend_2 TEXT;
  v_date_1 DATE;
BEGIN
  -- Obtener la última medición (dentro de 14 días)
  SELECT tpl.performance_trend, tpl.measurement_date
  INTO v_trend_1, v_date_1
  FROM app.training_performance_log tpl
  WHERE tpl.user_id = p_user_id
    AND tpl.measurement_date >= CURRENT_DATE - INTERVAL '14 days'
  ORDER BY tpl.measurement_date DESC
  LIMIT 1;

  -- Obtener la segunda última medición (dentro de 14 días)
  SELECT tpl.performance_trend
  INTO v_trend_2
  FROM app.training_performance_log tpl
  WHERE tpl.user_id = p_user_id
    AND tpl.measurement_date >= CURRENT_DATE - INTERVAL '14 days'
  ORDER BY tpl.measurement_date DESC
  OFFSET 1
  LIMIT 1;

  -- Si no hay suficientes datos (requiere 2 registros)
  IF v_trend_1 IS NULL OR v_trend_2 IS NULL THEN
    RETURN QUERY SELECT
      FALSE,
      0,
      NULL::DATE,
      FALSE,
      'Insuficientes datos de rendimiento (requiere 2 semanas)'::TEXT;
    RETURN;
  END IF;

  -- Contar semanas consecutivas bajando (solo evaluamos 2 semanas según especificación)
  IF v_trend_1 = 'baja' AND v_trend_2 = 'baja' THEN
    RETURN QUERY SELECT
      TRUE,
      2,
      v_date_1,
      TRUE,
      'Rendimiento bajando 2 semanas consecutivas - Sugerir diet break o normocalórica'::TEXT;
  ELSIF v_trend_1 = 'baja' THEN
    RETURN QUERY SELECT
      FALSE,
      1,
      v_date_1,
      FALSE,
      'Rendimiento bajando 1 semana - requiere confirmación otra semana'::TEXT;
  ELSE
    RETURN QUERY SELECT
      FALSE,
      0,
      v_date_1,
      FALSE,
      'Rendimiento estable o mejorando'::TEXT;
  END IF;
END;
$$;


--
-- Name: check_priority_timeout(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.check_priority_timeout(p_user_id integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_priority_age_weeks NUMERIC;
  v_microcycles_completed INT;
  v_has_priority BOOLEAN;
BEGIN
  SELECT
    priority_muscle IS NOT NULL,
    EXTRACT(EPOCH FROM (NOW() - priority_started_at)) / 604800,
    priority_microcycles_completed
  INTO v_has_priority, v_priority_age_weeks, v_microcycles_completed
  FROM app.hipertrofia_v2_state
  WHERE user_id = p_user_id;

  IF NOT v_has_priority THEN
    RETURN jsonb_build_object('deactivated', false, 'reason', 'no_priority');
  END IF;

  IF v_priority_age_weeks > 6 AND v_microcycles_completed < 1 THEN
    PERFORM app.deactivate_muscle_priority(p_user_id, 'timeout');
    RETURN jsonb_build_object('deactivated', true, 'reason', 'timeout');
  END IF;

  IF v_microcycles_completed >= 2 THEN
    PERFORM app.deactivate_muscle_priority(p_user_id, 'completed');
    RETURN jsonb_build_object('deactivated', true, 'reason', 'completed');
  END IF;

  RETURN jsonb_build_object('deactivated', false);
END;
$$;


--
-- Name: check_reevaluation_trigger(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.check_reevaluation_trigger() RETURNS trigger
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


--
-- Name: clean_expired_feedback(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.clean_expired_feedback() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM app.user_exercise_feedback
    WHERE expires_at IS NOT NULL
        AND expires_at <= NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$;


--
-- Name: cleanup_expired_bridge_flags(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.cleanup_expired_bridge_flags() RETURNS integer
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: cleanup_expired_rejections(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.cleanup_expired_rejections() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE app.home_exercise_rejections 
    SET is_active = FALSE, updated_at = NOW()
    WHERE expires_at IS NOT NULL 
      AND expires_at <= NOW() 
      AND is_active = TRUE;
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    
    RETURN expired_count;
END;
$$;


--
-- Name: cleanup_expired_training_sessions(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.cleanup_expired_training_sessions() RETURNS integer
    LANGUAGE plpgsql
    AS $$
    DECLARE
        cleaned_count INTEGER;
    BEGIN
        -- Cancelar sesiones "in_progress" abandonadas por más de 24 horas
        UPDATE methodology_exercise_sessions
        SET session_status = 'cancelled',
            cancelled_at = NOW(),
            is_current_session = false
        WHERE session_status = 'in_progress'
            AND started_at < NOW() - INTERVAL '24 hours';

        GET DIAGNOSTICS cleaned_count = ROW_COUNT;

        -- Limpiar estados de usuario para sesiones canceladas
        UPDATE user_training_state
        SET active_session_id = NULL,
            is_training = false,
            session_started_at = NULL,
            session_paused_at = NULL
        WHERE active_session_id IN (
            SELECT id FROM methodology_exercise_sessions
            WHERE session_status = 'cancelled'
        );

        RETURN cleaned_count;
    END;
    $$;


--
-- Name: cleanup_old_abandoned_sessions(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.cleanup_old_abandoned_sessions() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    cleaned_count INTEGER;
BEGIN
    -- Actualizar sesiones abandonadas hace más de 24 horas a status 'abandoned'
    UPDATE app.home_training_sessions
    SET status = 'abandoned'
    WHERE abandoned_at IS NOT NULL 
      AND abandoned_at < NOW() - INTERVAL '24 hours'
      AND status = 'in_progress';
    
    GET DIAGNOSTICS cleaned_count = ROW_COUNT;
    
    RETURN cleaned_count;
END;
$$;


--
-- Name: cleanup_old_sessions(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.cleanup_old_sessions() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    DELETE FROM app.user_sessions 
    WHERE login_time < NOW() - INTERVAL '90 days'
      AND is_active = FALSE;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    IF deleted_count > 0 THEN
        INSERT INTO app.auth_logs (event_type, metadata, created_at)
        VALUES ('old_sessions_cleanup', 
                jsonb_build_object('deleted_count', deleted_count),
                NOW());
    END IF;
    
    RETURN deleted_count;
END;
$$;


--
-- Name: confirm_routine_plan(integer, integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.confirm_routine_plan(p_user_id integer, p_methodology_plan_id integer, p_routine_plan_id integer DEFAULT NULL::integer) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    updated_count INTEGER := 0;
BEGIN
    -- Confirmar methodology_plan
    UPDATE app.methodology_plans 
    SET status = 'active', 
        confirmed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_methodology_plan_id 
      AND user_id = p_user_id 
      AND status = 'draft';
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    
    -- Si se proporcionó routine_plan_id, confirmarlo también
    IF p_routine_plan_id IS NOT NULL THEN
        UPDATE app.routine_plans 
        SET status = 'active', 
            confirmed_at = NOW(),
            updated_at = NOW()
        WHERE id = p_routine_plan_id 
          AND user_id = p_user_id 
          AND status = 'draft';
    END IF;
    
    RETURN updated_count > 0;
END;
$$;


--
-- Name: consolidate_manual_methodology_exercise_history(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.consolidate_manual_methodology_exercise_history() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    session_info RECORD;
BEGIN
    -- Solo procesar si el ejercicio se marca como completado
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        
        -- Obtener información de la sesión
        SELECT mes.methodology_plan_id, mes.methodology_type, mes.week_number, 
               mes.day_name, mes.completed_at::DATE as session_date
        INTO session_info
        FROM app.manual_methodology_exercise_sessions mes
        WHERE mes.id = NEW.manual_methodology_session_id;
        
        -- Obtener feedback si existe
        INSERT INTO app.manual_methodology_exercise_history_complete (
            user_id, methodology_plan_id, manual_methodology_session_id,
            exercise_name, exercise_order, methodology_type, generation_mode,
            series_total, series_completed, repeticiones, intensidad,
            tiempo_dedicado_segundos, sentiment, user_comment,
            week_number, day_name, session_date, completed_at
        )
        SELECT 
            NEW.user_id, session_info.methodology_plan_id, NEW.manual_methodology_session_id,
            NEW.exercise_name, NEW.exercise_order, session_info.methodology_type, 'manual',
            NEW.series_total, NEW.series_completed, NEW.repeticiones, NEW.intensidad,
            NEW.time_spent_seconds, mef.sentiment, mef.comment,
            session_info.week_number, session_info.day_name, 
            COALESCE(session_info.session_date, CURRENT_DATE), 
            COALESCE(NEW.completed_at, CURRENT_TIMESTAMP)
        FROM (SELECT NEW.manual_methodology_session_id, NEW.exercise_order) tmp
        LEFT JOIN app.manual_methodology_exercise_feedback mef 
            ON mef.manual_methodology_session_id = tmp.manual_methodology_session_id 
            AND mef.exercise_order = tmp.exercise_order;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: consolidate_methodology_exercise_history(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.consolidate_methodology_exercise_history() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    session_info RECORD;
    feedback_info RECORD;
    v_session_date DATE;
BEGIN
    SELECT 
        mes.methodology_type, 
        mes.week_number, 
        mes.day_name, 
        mes.started_at,
        mes.methodology_plan_id
    INTO session_info
    FROM app.methodology_exercise_sessions mes
    WHERE mes.id = NEW.methodology_session_id;
    v_session_date := COALESCE(DATE(session_info.started_at), DATE(NEW.completed_at), CURRENT_DATE);
    SELECT f.sentiment, f.comment
    INTO feedback_info
    FROM app.methodology_exercise_feedback f
    WHERE f.methodology_session_id = NEW.methodology_session_id 
      AND f.exercise_order = NEW.exercise_order;
    INSERT INTO app.methodology_exercise_history_complete (
        user_id,
        methodology_plan_id,
        methodology_session_id,
        exercise_name,
        exercise_order,
        methodology_type,
        series_total,
        series_completed,
        repeticiones,
        intensidad,
        tiempo_dedicado_segundos,
        sentiment,
        user_comment,
        week_number,
        day_name,
        session_date,
        completed_at
    ) VALUES (
        NEW.user_id,
        session_info.methodology_plan_id,
        NEW.methodology_session_id,
        NEW.exercise_name,
        NEW.exercise_order,
        session_info.methodology_type,
        NEW.series_total,
        NEW.series_completed,
        NEW.repeticiones,
        NEW.intensidad,
        NEW.time_spent_seconds,
        feedback_info.sentiment,
        feedback_info.comment,
        session_info.week_number,
        session_info.day_name,
        v_session_date,
        COALESCE(NEW.completed_at, NOW())
    )
    ON CONFLICT ON CONSTRAINT uq_mhistory_unique DO NOTHING;
    RETURN NEW;
END;
$$;


--
-- Name: count_recent_flags(integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.count_recent_flags(p_user_id integer, p_days_window integer DEFAULT 10) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_light_count INT;
  v_critical_count INT;
  v_cognitive_count INT;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE flag_type = 'light'),
    COUNT(*) FILTER (WHERE flag_type = 'critical'),
    COUNT(*) FILTER (WHERE flag_type = 'cognitive')
  INTO v_light_count, v_critical_count, v_cognitive_count
  FROM app.fatigue_flags
  WHERE user_id = p_user_id
    AND flag_date >= NOW() - (p_days_window || ' days')::INTERVAL;

  RETURN jsonb_build_object(
    'light', v_light_count,
    'critical', v_critical_count,
    'cognitive', v_cognitive_count,
    'window_days', p_days_window,
    'total', v_light_count + v_critical_count + v_cognitive_count
  );
END;
$$;


--
-- Name: create_routine_sessions(integer, integer, jsonb); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.create_routine_sessions(p_user_id integer, p_routine_plan_id integer, p_plan_data jsonb) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    semana_record JSONB;
    sesion_record JSONB;
    semana_num INTEGER;
    dia_nombre VARCHAR(20);
    session_id INTEGER;
    sessions_created INTEGER := 0;
BEGIN
    FOR semana_record IN SELECT * FROM jsonb_array_elements(p_plan_data->'semanas')
    LOOP
        semana_num := (semana_record->>'semana')::INTEGER;
        FOR sesion_record IN SELECT * FROM jsonb_array_elements(semana_record->'sesiones')
        LOOP
            dia_nombre := sesion_record->>'dia';
            INSERT INTO app.routine_sessions (
                user_id, 
                routine_plan_id, 
                week_number, 
                day_name, 
                exercises_data,
                status
            ) VALUES (
                p_user_id,
                p_routine_plan_id,
                semana_num,
                dia_nombre,
                sesion_record->'ejercicios',
                'pending'
            ) 
            ON CONFLICT (user_id, routine_plan_id, week_number, day_name) 
            DO UPDATE SET 
                exercises_data = EXCLUDED.exercises_data,
                updated_at = CURRENT_TIMESTAMP
            RETURNING id INTO session_id;
            INSERT INTO app.routine_exercise_progress (
                user_id,
                routine_session_id,
                exercise_order,
                exercise_name,
                series_total,
                status
            )
            SELECT 
                p_user_id,
                session_id,
                (row_number() OVER () - 1)::INTEGER,
                ejercicio->>'nombre',
                (ejercicio->>'series')::INTEGER,
                'pending'
            FROM jsonb_array_elements(sesion_record->'ejercicios') ejercicio
            ON CONFLICT (routine_session_id, exercise_order) DO NOTHING;
            sessions_created := sessions_created + 1;
        END LOOP;
    END LOOP;
    RETURN sessions_created;
END;
$$;


--
-- Name: crossfit_register_wod_result(integer, integer, numeric, boolean, text, numeric); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.crossfit_register_wod_result(p_user_id integer, p_plan_id integer, p_rpe numeric, p_completed boolean, p_scale text, p_subjective numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_easy integer;
  v_hard integer;
  v_wods integer;
  v_decision varchar(20);
  v_deload boolean := false;
  v_scale text := lower(coalesce(p_scale, 'rx'));
  v_class text;  -- 'easy' | 'hard' | 'neutral' (clasificación OBJETIVA base)
BEGIN
  INSERT INTO app.crossfit_autoreg_state (user_id, methodology_plan_id)
  VALUES (p_user_id, p_plan_id)
  ON CONFLICT (user_id) DO UPDATE SET methodology_plan_id = EXCLUDED.methodology_plan_id;

  SELECT easy_streak, hard_streak, wods_completed
    INTO v_easy, v_hard, v_wods
  FROM app.crossfit_autoreg_state
  WHERE user_id = p_user_id;

  v_wods := COALESCE(v_wods, 0) + 1;

  -- 1) Clasificación OBJETIVA base (manda)
  IF p_completed AND COALESCE(p_rpe, 10) <= 6 AND v_scale IN ('rx', 'rxplus') THEN
    v_class := 'easy';
  ELSIF (NOT p_completed) OR COALESCE(p_rpe, 0) >= 9 OR v_scale = 'scaled' THEN
    v_class := 'hard';
  ELSE
    v_class := 'neutral';
  END IF;

  -- 2) Aporte SUBJETIVO (acotado, no manda)
  IF p_subjective IS NOT NULL THEN
    -- Freno de seguridad: números dicen fácil pero el usuario lo sintió duro.
    IF v_class = 'easy' AND p_subjective <= -0.5 THEN
      v_class := 'neutral';
    -- Desempate cuando lo objetivo es neutro.
    ELSIF v_class = 'neutral' AND p_subjective >= 0.5 THEN
      v_class := 'easy';
    ELSIF v_class = 'neutral' AND p_subjective <= -0.5 THEN
      v_class := 'hard';
    END IF;
  END IF;

  -- 3) Actualizar rachas según la clasificación final
  IF v_class = 'easy' THEN
    v_easy := COALESCE(v_easy, 0) + 1;
    v_hard := 0;
  ELSIF v_class = 'hard' THEN
    v_hard := COALESCE(v_hard, 0) + 1;
    v_easy := 0;
  ELSE
    v_easy := 0;
    v_hard := 0;
  END IF;

  -- 4) Decisión (gates OBJETIVOS intactos)
  IF v_hard >= 3 THEN
    v_decision := 'deload';
    v_deload := true;
    v_hard := 0;
  ELSIF v_easy >= 2 THEN
    v_decision := 'progress';
  ELSE
    v_decision := 'hold';
  END IF;

  UPDATE app.crossfit_autoreg_state
    SET easy_streak = v_easy,
        hard_streak = v_hard,
        wods_completed = v_wods,
        deload_suggested = v_deload,
        last_decision = v_decision,
        last_rpe = p_rpe,
        last_scale = v_scale,
        last_subjective = p_subjective,
        updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'decision', v_decision,
    'easy_streak', v_easy,
    'hard_streak', v_hard,
    'deload_suggested', v_deload,
    'wods_completed', v_wods,
    'subjective_applied', (p_subjective IS NOT NULL)
  );
END;
$$;


--
-- Name: deactivate_deload(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.deactivate_deload(p_user_id integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Restablecer pesos a valores pre-deload (subir +2% para nuevo ciclo)
  UPDATE app.hypertrophy_progression
  SET
    target_weight_next_cycle = ROUND((target_weight_next_cycle / 0.7 * 1.02)::NUMERIC, 2),
    last_adjustment = 'post_deload_recovery',
    adjustment_date = NOW(),
    updated_at = NOW()
  WHERE user_id = p_user_id;

  -- Desactivar deload en estado
  UPDATE app.hipertrofia_v2_state
  SET
    deload_active = false,
    deload_reason = NULL,
    deload_started_at = NULL,
    microcycles_completed = 0,  -- Reiniciar contador post-deload
    updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'deload_deactivated', true,
    'message', 'Deload completado. Reiniciando progresión con +2% de recarga'
  );
END;
$$;


--
-- Name: deactivate_muscle_priority(integer, character varying); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.deactivate_muscle_priority(p_user_id integer, p_reason character varying DEFAULT 'completed'::character varying) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: deactivate_previous_metabolic_evaluations(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.deactivate_previous_metabolic_evaluations() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE app.user_metabolic_evaluations
  SET is_active = FALSE
  WHERE user_id = NEW.user_id AND id != NEW.id AND is_active = TRUE;
  RETURN NEW;
END;
$$;


--
-- Name: detect_automatic_fatigue_flags(integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.detect_automatic_fatigue_flags(p_user_id integer, p_session_id integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_mean_rir NUMERIC;
  v_underperformed_sets INT;
  v_performance_drop NUMERIC;
  v_flag_type VARCHAR(20);
  v_flag_inserted BOOLEAN := false;
BEGIN
  -- Calcular mean_RIR de la sesión actual
  SELECT
    AVG(rir_reported)::NUMERIC(3,1),
    COUNT(*) FILTER (WHERE rir_reported < 2)
  INTO v_mean_rir, v_underperformed_sets
  FROM app.hypertrophy_set_logs
  WHERE session_id = p_session_id;

  -- Si no hay datos de RIR, salir
  IF v_mean_rir IS NULL THEN
    RETURN jsonb_build_object(
      'flag_detected', false,
      'reason', 'no_rir_data'
    );
  END IF;

  -- Calcular caída de rendimiento (comparar con media de últimas 3 sesiones similares)
  -- TODO: implementar comparación con sesiones similares
  v_performance_drop := 0;

  -- ===================================
  -- DECIDIR TIPO DE FLAG
  -- ===================================

  -- CRÍTICO: ≥3 series con RIR <2 O mean_RIR <1.5
  IF v_underperformed_sets >= 3 OR v_mean_rir < 1.5 THEN
    v_flag_type := 'critical';
    v_flag_inserted := true;

  -- LEVE: ≥2 series con RIR <2 O mean_RIR <2.5
  ELSIF v_underperformed_sets >= 2 OR v_mean_rir < 2.5 THEN
    v_flag_type := 'light';
    v_flag_inserted := true;

  -- SIN FLAG: Todo OK
  ELSE
    v_flag_type := NULL;
  END IF;

  -- ===================================
  -- INSERTAR FLAG SI CORRESPONDE
  -- ===================================
  IF v_flag_type IS NOT NULL THEN
    INSERT INTO app.fatigue_flags (
      user_id,
      session_id,
      flag_type,
      mean_rir_session,
      underperformed_sets,
      performance_drop_pct,
      auto_detected
    ) VALUES (
      p_user_id,
      p_session_id,
      v_flag_type,
      v_mean_rir,
      v_underperformed_sets,
      v_performance_drop,
      true
    );

    -- Log para debugging
    RAISE NOTICE '[FATIGUE] Flag detectado automáticamente: tipo=%, mean_RIR=%, underperformed=%',
      v_flag_type, v_mean_rir, v_underperformed_sets;
  END IF;

  RETURN jsonb_build_object(
    'flag_detected', v_flag_inserted,
    'flag_type', v_flag_type,
    'mean_rir', v_mean_rir,
    'underperformed_sets', v_underperformed_sets,
    'performance_drop_pct', v_performance_drop
  );
END;
$$;


--
-- Name: detect_neural_overlap(integer, jsonb); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.detect_neural_overlap(p_user_id integer, p_current_session_patterns jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_state RECORD;
  v_last_patterns JSONB := '[]'::jsonb;
  v_current_patterns JSONB := COALESCE(p_current_session_patterns, '[]'::jsonb);
  v_overlap_level VARCHAR(20) := 'none';
  v_adjustment NUMERIC := 0;
  v_hours_since_last NUMERIC := NULL;
  v_last_pattern_arr TEXT[] := ARRAY[]::TEXT[];
  v_current_pattern_arr TEXT[] := ARRAY[]::TEXT[];
  v_last_pattern TEXT;
  v_curr_pattern TEXT;
BEGIN
  SELECT
    last_session_patterns,
    last_session_at,
    neural_overlap_detected
  INTO v_state
  FROM app.hipertrofia_v2_state
  WHERE user_id = p_user_id;

  IF NOT FOUND OR v_state.last_session_patterns IS NULL THEN
    RETURN jsonb_build_object(
      'overlap', 'none',
      'adjustment', 0,
      'message', 'Sin sesiones previas registradas'
    );
  END IF;

  v_last_patterns := COALESCE(v_state.last_session_patterns, '[]'::jsonb);
  v_hours_since_last := EXTRACT(EPOCH FROM (NOW() - v_state.last_session_at)) / 3600;

  IF v_hours_since_last IS NULL THEN
    v_hours_since_last := 999;
  END IF;

  -- Si pasaron más de 72h no se considera solapamiento
  IF v_hours_since_last > 72 THEN
    UPDATE app.hipertrofia_v2_state
    SET neural_overlap_detected = 'none'
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
      'overlap', 'none',
      'adjustment', 0,
      'hours_since_last', v_hours_since_last,
      'message', 'Más de 72h desde la última sesión: sin solapamiento'
    );
  END IF;

  -- Convertir JSON arrays a arreglos de texto normalizados
  SELECT ARRAY(
    SELECT LOWER(TRIM(value::text))
    FROM jsonb_array_elements_text(v_last_patterns) AS value
    WHERE TRIM(value::text) <> ''
  ) INTO v_last_pattern_arr;

  SELECT ARRAY(
    SELECT LOWER(TRIM(value::text))
    FROM jsonb_array_elements_text(v_current_patterns) AS value
    WHERE TRIM(value::text) <> ''
  ) INTO v_current_pattern_arr;

  IF array_length(v_last_pattern_arr, 1) IS NULL
     OR array_length(v_current_pattern_arr, 1) IS NULL THEN
    UPDATE app.hipertrofia_v2_state
    SET neural_overlap_detected = 'none'
    WHERE user_id = p_user_id;

    RETURN jsonb_build_object(
      'overlap', 'none',
      'adjustment', 0,
      'hours_since_last', v_hours_since_last,
      'message', 'No hay patrones suficientes para comparar'
    );
  END IF;

  -- Detección de solapamiento alto: patrones idénticos en ambas sesiones
  FOREACH v_curr_pattern IN ARRAY v_current_pattern_arr LOOP
    IF v_curr_pattern = ANY (v_last_pattern_arr) THEN
      v_overlap_level := 'high';
      EXIT;
    END IF;
  END LOOP;

  -- Detección de solapamiento parcial si no se detectó uno alto
  IF v_overlap_level <> 'high' THEN
    FOREACH v_last_pattern IN ARRAY v_last_pattern_arr LOOP
      FOREACH v_curr_pattern IN ARRAY v_current_pattern_arr LOOP
        IF (v_last_pattern = 'empuje_vertical' AND v_curr_pattern = 'empuje_horizontal')
           OR (v_last_pattern = 'empuje_horizontal' AND v_curr_pattern = 'empuje_vertical')
           OR (v_last_pattern = 'traccion_vertical' AND v_curr_pattern = 'traccion_horizontal')
           OR (v_last_pattern = 'traccion_horizontal' AND v_curr_pattern = 'traccion_vertical')
           OR (v_last_pattern = 'cadena_posterior' AND v_curr_pattern = 'bisagra_cadera')
           OR (v_last_pattern = 'bisagra_cadera' AND v_curr_pattern = 'cadena_posterior') THEN
          v_overlap_level := 'partial';
          EXIT;
        END IF;
      END LOOP;
      EXIT WHEN v_overlap_level = 'partial';
    END LOOP;
  END IF;

  -- Ajustes sugeridos
  IF v_overlap_level = 'high' THEN
    v_adjustment := -0.05;
  ELSIF v_overlap_level = 'partial' THEN
    v_adjustment := -0.025;
  END IF;

  UPDATE app.hipertrofia_v2_state
  SET neural_overlap_detected = v_overlap_level
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'overlap', v_overlap_level,
    'adjustment', v_adjustment,
    'hours_since_last', v_hours_since_last,
    'message', CASE v_overlap_level
      WHEN 'high' THEN 'Solapamiento alto: reducir cargas ~5%'
      WHEN 'partial' THEN 'Solapamiento parcial: reducir cargas ~2.5%'
      ELSE 'Sin solapamiento significativo'
    END
  );
END;
$$;


--
-- Name: determine_adjustment(numeric); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.determine_adjustment(avg_rir numeric) RETURNS character varying
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  IF avg_rir <= 1 THEN
    RETURN 'decrease';  -- Bajar peso (RIR muy bajo)
  ELSIF avg_rir >= 4 THEN
    RETURN 'increase';  -- Subir peso (RIR muy alto)
  ELSE
    RETURN 'maintain';  -- Mantener (RIR óptimo 2-3)
  END IF;
END;
$$;


--
-- Name: evaluate_adaptation_completion(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.evaluate_adaptation_completion(p_user_id integer) RETURNS jsonb
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


--
-- Name: evaluate_adaptation_completion(uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.evaluate_adaptation_completion(p_user_id uuid) RETURNS TABLE(evaluate_adaptation_completion jsonb)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_block_id UUID;
    v_ready BOOLEAN;
BEGIN
    SELECT id, ready_for_transition INTO v_block_id, v_ready 
    FROM app.adaptation_progress_summary 
    WHERE user_id = p_user_id AND status = 'active';
    
    evaluate_adaptation_completion := jsonb_build_object(
        'hasActiveBlock', v_block_id IS NOT NULL,
        'readyForTransition', COALESCE(v_ready, false)
    );
    RETURN NEXT;
END;
$$;


--
-- Name: evaluate_fatigue_action(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.evaluate_fatigue_action(p_user_id integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_flags JSONB;
  v_action VARCHAR(50);
  v_load_adjustment NUMERIC;
  v_volume_adjustment NUMERIC;
  v_progression_blocked BOOLEAN;
BEGIN
  -- Contar flags recientes (últimos 10 días)
  v_flags := app.count_recent_flags(p_user_id, 10);

  -- ===================================
  -- DECIDIR ACCIÓN SEGÚN REGLAS
  -- ===================================

  -- CASO 1: ≥2 críticos → Deload inmediato (~30% carga, ~50% volumen)
  IF (v_flags->>'critical')::INT >= 2 THEN
    v_action := 'immediate_deload';
    v_load_adjustment := -0.30;
    v_volume_adjustment := -0.50;
    v_progression_blocked := true;

  -- CASO 2: ≥1 crítico O ≥2 leves → Microciclo con recuperación (0% progresión, ~6% reducción)
  ELSIF (v_flags->>'critical')::INT >= 1 OR (v_flags->>'light')::INT >= 2 THEN
    v_action := 'recovery_microcycle';
    v_load_adjustment := -0.06;
    v_volume_adjustment := 0;
    v_progression_blocked := true;

  -- CASO 3: 1 leve → Mantener carga, NO aplicar +2.5%
  ELSIF (v_flags->>'light')::INT >= 1 THEN
    v_action := 'freeze_progression';
    v_load_adjustment := 0;
    v_volume_adjustment := 0;
    v_progression_blocked := true;

  -- CASO 4: Sin flags → Continuar normal
  ELSE
    v_action := 'continue_normal';
    v_load_adjustment := 0;
    v_volume_adjustment := 0;
    v_progression_blocked := false;
  END IF;

  RETURN jsonb_build_object(
    'action', v_action,
    'load_adjustment', v_load_adjustment,
    'volume_adjustment', v_volume_adjustment,
    'progression_blocked', v_progression_blocked,
    'flags', v_flags,
    'message', CASE v_action
      WHEN 'immediate_deload' THEN 'Deload inmediato requerido: reducción -30% carga, -50% volumen'
      WHEN 'recovery_microcycle' THEN 'Microciclo de recuperación: reducción -6% carga, progresión congelada'
      WHEN 'freeze_progression' THEN 'Mantener cargas actuales, no aplicar progresión'
      WHEN 'continue_normal' THEN 'Sin fatiga detectada, continuar normal'
    END
  );
END;
$$;


--
-- Name: evaluate_level_change(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.evaluate_level_change(p_user_id integer) RETURNS jsonb
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

  -- Calcular tasa de progresión usando columnas existentes
  WITH progression AS (
    SELECT
      AVG(
        CASE
          WHEN current_pr IS NOT NULL AND current_pr != 0 THEN
            ((target_weight_next_cycle - (current_pr * 0.80)) / (current_pr * 0.80)) * 100
          WHEN target_weight_80 IS NOT NULL AND target_weight_80 != 0 THEN
            ((target_weight_next_cycle - target_weight_80) / target_weight_80) * 100
          ELSE NULL
        END
      ) AS avg_progression
    FROM app.hypertrophy_progression
    WHERE user_id = p_user_id
      AND updated_at >= NOW() - INTERVAL '30 days'
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


--
-- Name: funcional_register_session_result(integer, integer, numeric, boolean, numeric); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.funcional_register_session_result(p_user_id integer, p_plan_id integer, p_avg_rir numeric, p_target_met boolean, p_subjective numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_easy integer;
  v_hard integer;
  v_micro integer;
  v_decision varchar(20);
  v_deload boolean := false;
  v_class text;
BEGIN
  INSERT INTO app.funcional_autoreg_state (user_id, methodology_plan_id)
  VALUES (p_user_id, p_plan_id)
  ON CONFLICT (user_id) DO UPDATE SET methodology_plan_id = EXCLUDED.methodology_plan_id;

  SELECT easy_streak, hard_streak, microcycles_completed
    INTO v_easy, v_hard, v_micro
  FROM app.funcional_autoreg_state
  WHERE user_id = p_user_id;

  v_micro := COALESCE(v_micro, 0) + 1;

  IF p_target_met AND COALESCE(p_avg_rir, 0) >= 2 THEN
    v_class := 'easy';
  ELSIF (NOT p_target_met) OR COALESCE(p_avg_rir, 99) <= 0 THEN
    v_class := 'hard';
  ELSE
    v_class := 'neutral';
  END IF;

  IF p_subjective IS NOT NULL THEN
    IF v_class = 'easy' AND p_subjective <= -0.5 THEN
      v_class := 'neutral';
    ELSIF v_class = 'neutral' AND p_subjective >= 0.5 THEN
      v_class := 'easy';
    ELSIF v_class = 'neutral' AND p_subjective <= -0.5 THEN
      v_class := 'hard';
    END IF;
  END IF;

  IF v_class = 'easy' THEN
    v_easy := COALESCE(v_easy, 0) + 1;
    v_hard := 0;
  ELSIF v_class = 'hard' THEN
    v_hard := COALESCE(v_hard, 0) + 1;
    v_easy := 0;
  ELSE
    v_easy := 0;
    v_hard := 0;
  END IF;

  IF v_hard >= 3 THEN
    v_decision := 'deload';
    v_deload := true;
    v_hard := 0;
  ELSIF v_easy >= 2 THEN
    v_decision := 'progress';
  ELSE
    v_decision := 'hold';
  END IF;

  UPDATE app.funcional_autoreg_state
    SET easy_streak = v_easy,
        hard_streak = v_hard,
        microcycles_completed = v_micro,
        deload_suggested = v_deload,
        last_decision = v_decision,
        last_avg_rir = p_avg_rir,
        last_subjective = p_subjective,
        updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'decision', v_decision,
    'easy_streak', v_easy,
    'hard_streak', v_hard,
    'deload_suggested', v_deload,
    'microcycles_completed', v_micro,
    'subjective_applied', (p_subjective IS NOT NULL)
  );
END;
$$;


--
-- Name: generate_exercise_id(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.generate_exercise_id(exercise_name text) RETURNS uuid
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  -- Genera UUID determinístico basado en MD5 del nombre
  -- Mismo nombre → mismo UUID (consistente)
  RETURN (
    SELECT (
      md5('exercise:' || LOWER(TRIM(exercise_name)))::uuid
    )
  );
END;
$$;


--
-- Name: get_active_mindfeed_ruleset(character varying); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_active_mindfeed_ruleset(p_scope character varying) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_rules JSONB;
BEGIN
  SELECT rules
  INTO v_rules
  FROM app.mindfeed_rulesets
  WHERE scope = p_scope AND is_active = TRUE
  ORDER BY id DESC
  LIMIT 1;

  RETURN COALESCE(v_rules, '{}'::jsonb);
END;
$$;


--
-- Name: get_avoided_exercises_for_ai(integer, character varying, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_avoided_exercises_for_ai(p_user_id integer, p_methodology_type character varying DEFAULT NULL::character varying, p_days_back integer DEFAULT 30) RETURNS text[]
    LANGUAGE plpgsql
    AS $$
DECLARE
    avoided_list TEXT[];
BEGIN
    SELECT array_agg(DISTINCT exercise_name)
    INTO avoided_list
    FROM app.user_exercise_feedback
    WHERE user_id = p_user_id
        AND (p_methodology_type IS NULL OR methodology_type = p_methodology_type)
        AND feedback_type IN ('too_difficult', 'dont_like', 'no_equipment', 'change_focus')
        AND (
            expires_at IS NULL
            OR expires_at > NOW()
            OR created_at >= NOW() - (p_days_back || ' days')::INTERVAL
        )
        AND ai_weight > 0.3; -- Solo considerar feedback con peso significativo

    RETURN COALESCE(avoided_list, ARRAY[]::TEXT[]);
END;
$$;


--
-- Name: get_bridge_state(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_bridge_state(p_user_id integer) RETURNS TABLE(current_kcal integer, current_macros jsonb, metabolic_profile character varying, methodology character varying, phase character varying, weekly_cls integer, fatigue_score integer, active_flags jsonb, days_in_deficit integer, days_in_surplus integer, needs_recalculation boolean, recalc_reason text)
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: get_combination_usage_stats(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_combination_usage_stats(p_user_id integer) RETURNS TABLE(combination text, total_exercises_used integer, most_used_exercise text, max_usage_count integer, last_training_date timestamp with time zone)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        CONCAT(h.equipment_type, ' + ', h.training_type)::TEXT as combination,
        COUNT(DISTINCT h.exercise_name)::INTEGER as total_exercises_used,
        (SELECT h2.exercise_name FROM app.home_combination_exercise_history h2 
         WHERE h2.user_id = h.user_id AND h2.equipment_type = h.equipment_type 
         AND h2.training_type = h.training_type 
         ORDER BY h2.times_used DESC LIMIT 1)::TEXT as most_used_exercise,
        MAX(h.times_used)::INTEGER as max_usage_count,
        MAX(h.last_used_at) as last_training_date
    FROM app.home_combination_exercise_history h
    WHERE h.user_id = p_user_id
    GROUP BY h.equipment_type, h.training_type, h.user_id
    ORDER BY last_training_date DESC;
END;
$$;


--
-- Name: get_confirmed_status(integer, character varying); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_confirmed_status(p_user_id integer, p_indicator_type character varying) RETURNS TABLE(current_status character varying, is_confirmed boolean, consecutive_count integer, measurement_date date, indicator_value numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    status,
    status_confirmed,
    consecutive_count,
    measurement_date,
    indicator_value
  FROM app.icg_ipg_state_history
  WHERE user_id = p_user_id
  AND indicator_type = p_indicator_type
  ORDER BY measurement_date DESC
  LIMIT 1;
END;
$$;


--
-- Name: get_current_metabolic_profile(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_current_metabolic_profile(p_user_id integer) RETURNS TABLE(evaluation_id integer, metabolic_profile character varying, confidence_level character varying, raw_score integer, calculated_macros jsonb, evaluation_date date, days_since_evaluation integer)
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: get_enhanced_routine_plan_stats(integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_enhanced_routine_plan_stats(p_user_id integer, p_routine_plan_id integer) RETURNS TABLE(completed_sessions integer, total_sessions_created integer, completed_exercises integer, total_exercises_attempted integer, total_training_time_minutes integer, total_feedback_given integer, loved_exercises integer, hard_exercises integer, neutral_exercises integer, last_session_date timestamp without time zone, current_streak_days integer, methodology_type character varying, generation_mode character varying, plan_created_at timestamp without time zone, frequency_per_week integer, total_weeks integer, overall_progress_percentage numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ers.completed_sessions::INTEGER,
        ers.total_sessions_created::INTEGER,
        ers.completed_exercises::INTEGER,
        ers.total_exercises_attempted::INTEGER,
        ers.total_training_time_minutes::INTEGER,
        ers.total_feedback_given::INTEGER,
        ers.loved_exercises::INTEGER,
        ers.hard_exercises::INTEGER,
        ers.neutral_exercises::INTEGER,
        ers.last_session_date,
        ers.current_streak_days::INTEGER,
        ers.methodology_type,
        ers.generation_mode,
        ers.plan_created_at,
        ers.frequency_per_week::INTEGER,
        ers.total_weeks::INTEGER,
        ers.overall_progress_percentage
    FROM app.enhanced_routine_stats ers
    WHERE ers.user_id = p_user_id 
    AND ers.routine_plan_id = p_routine_plan_id;
END;
$$;


--
-- Name: get_exercises_by_combination(integer, character varying, character varying, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_exercises_by_combination(p_user_id integer, p_equipment_type character varying, p_training_type character varying, p_limit integer DEFAULT 20) RETURNS TABLE(exercise_name text, exercise_key text, times_used integer, last_used_at timestamp with time zone)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ef.exercise_name,
        ef.exercise_key,
        ef.times_used,
        ef.last_used_at
    FROM app.get_exercises_for_combination(p_user_id, p_equipment_type, p_training_type, p_limit) ef;
END;
$$;


--
-- Name: get_exercises_for_combination(integer, character varying, character varying, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_exercises_for_combination(p_user_id integer, p_equipment_type character varying, p_training_type character varying, p_limit integer DEFAULT 50) RETURNS TABLE(exercise_name text, exercise_key text, times_used integer, last_used_at timestamp with time zone, user_rating text, combination_code text)
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
    combination_record RECORD;
BEGIN
    SELECT c.id, c.combination_code
      INTO combination_record
    FROM app.home_training_combinations c
    WHERE c.equipment_type = p_equipment_type 
      AND c.training_type  = p_training_type;
    IF NOT FOUND THEN
        RETURN; -- combinación no definida
    END IF;
    RETURN QUERY
    SELECT 
        h.exercise_name::TEXT,
        h.exercise_key::TEXT,
        h.times_used::INTEGER,
        h.last_used_at,
        h.user_rating::TEXT,
        h.combination_code::TEXT
    FROM app.home_combination_exercise_history h
    WHERE h.user_id = p_user_id 
      AND h.combination_id = combination_record.id
    ORDER BY h.times_used DESC, h.last_used_at DESC
    LIMIT p_limit;
END;
$$;


--
-- Name: get_feedback_stats(integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_feedback_stats(p_user_id integer, p_days_back integer DEFAULT 30) RETURNS TABLE(sentiment character varying, count bigint, percentage numeric)
    LANGUAGE plpgsql
    AS $$
      BEGIN
        RETURN QUERY
        SELECT
          f.sentiment,
          COUNT(*) as count,
          ROUND((COUNT(*) * 100.0 / SUM(COUNT(*)) OVER()), 2) as percentage
        FROM app.methodology_exercise_feedback f
        INNER JOIN app.methodology_exercise_sessions s ON s.id = f.methodology_session_id
        WHERE f.user_id = p_user_id
          AND s.created_at >= CURRENT_DATE - INTERVAL '1 day' * p_days_back
          AND f.sentiment IS NOT NULL
        GROUP BY f.sentiment
        ORDER BY count DESC;
      END;
      $$;


--
-- Name: get_hipertrofia_categories(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_hipertrofia_categories() RETURNS TABLE(categoria text, total_ejercicios bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    he.categoria,
    COUNT(*) as total_ejercicios
  FROM app."Ejercicios_Hipertrofia" he
  GROUP BY he.categoria
  ORDER BY total_ejercicios DESC, he.categoria;
END;
$$;


--
-- Name: get_hipertrofia_exercise_progression(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_hipertrofia_exercise_progression(p_exercise_id text) RETURNS TABLE(previous_exercise text, current_exercise text, next_exercise text)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    he.progresion_desde,
    he.nombre,
    he.progresion_hacia
  FROM app."Ejercicios_Hipertrofia" he
  WHERE he.exercise_id = p_exercise_id;
END;
$$;


--
-- Name: get_hipertrofia_exercises_by_category_and_level(text, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_hipertrofia_exercises_by_category_and_level(p_categoria text, p_nivel text) RETURNS TABLE(exercise_id text, nombre text, patron text, equipamiento text, series_reps_objetivo text, criterio_de_progreso text, notas text)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    he.exercise_id,
    he.nombre,
    he.patron,
    he.equipamiento,
    he.series_reps_objetivo,
    he.criterio_de_progreso,
    he.notas
  FROM app."Ejercicios_Hipertrofia" he
  WHERE he.categoria = p_categoria AND he.nivel = p_nivel
  ORDER BY he.nombre;
END;
$$;


--
-- Name: get_hipertrofia_exercises_by_level(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_hipertrofia_exercises_by_level(p_nivel text) RETURNS TABLE(exercise_id text, nombre text, categoria text, patron text, equipamiento text, series_reps_objetivo text, notas text)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    he.exercise_id,
    he.nombre,
    he.categoria,
    he.patron,
    he.equipamiento,
    he.series_reps_objetivo,
    he.notas
  FROM app."Ejercicios_Hipertrofia" he
  WHERE he.nivel = p_nivel
  ORDER BY he.categoria, he.nombre;
END;
$$;


--
-- Name: get_home_context(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_home_context(p_user_id integer) RETURNS TABLE(last_home_plan_id integer, equipment_type character varying, training_type character varying, last_home_plan_created_at timestamp with time zone, last_session_id integer, exercises_completed integer, total_exercises integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  WITH last_plan AS (
    SELECT htp.id, htp.equipment_type, htp.training_type, htp.created_at
    FROM app.home_training_plans htp
    WHERE htp.user_id = p_user_id
    ORDER BY htp.created_at DESC
    LIMIT 1
  ), last_session AS (
    SELECT hts.id, hts.exercises_completed, hts.total_exercises
    FROM app.home_training_sessions hts
    WHERE hts.user_id = p_user_id
    ORDER BY hts.started_at DESC
    LIMIT 1
  )
  SELECT lp.id, lp.equipment_type, lp.training_type, lp.created_at,
         ls.id, COALESCE(ls.exercises_completed,0), COALESCE(ls.total_exercises,0)
  FROM last_plan lp
  LEFT JOIN last_session ls ON TRUE;
END; $$;


--
-- Name: get_home_training_history(integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_home_training_history(p_user_id integer, p_limit integer DEFAULT 15) RETURNS TABLE(exercise_name text, exercise_key text, last_used_at timestamp with time zone, times_used integer)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
    WITH combined_home AS (
        SELECT 
            h.exercise_name::TEXT,
            h.exercise_key::TEXT,
            h.created_at,
            2 as priority_weight
        FROM app.v_home_hist_real h
        WHERE h.user_id = p_user_id
        UNION ALL
        SELECT 
            p.exercise_name::TEXT,
            p.exercise_key::TEXT,
            p.created_at,
            1 as priority_weight
        FROM app.v_home_hist_propuesto p
        WHERE p.user_id = p_user_id
    ),
    aggregated AS (
        SELECT 
            c.exercise_name,
            c.exercise_key,
            MAX(c.created_at) as last_used_at,
            COUNT(*) as times_used,
            MAX(c.priority_weight) as max_priority
        FROM combined_home c
        GROUP BY c.exercise_name, c.exercise_key
    )
    SELECT 
        a.exercise_name,
        a.exercise_key,
        a.last_used_at,
        a.times_used::INTEGER
    FROM aggregated a
    ORDER BY a.max_priority DESC, a.last_used_at DESC, a.times_used DESC
    LIMIT p_limit;
END;
$$;


--
-- Name: get_last_re_evaluation(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_last_re_evaluation(p_methodology_plan_id integer) RETURNS TABLE(re_evaluation_id integer, week_number integer, created_at timestamp without time zone, weeks_since_last integer)
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: get_last_validated_measurement(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_last_validated_measurement(p_user_id integer) RETURNS TABLE(measurement_date date, weight_kg numeric, waist_cm numeric, biceps_cm numeric, chest_cm numeric, calf_cm numeric, skinfold_abdominal_mm numeric, days_ago integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    bm.measurement_date,
    bm.weight_kg,
    bm.waist_cm,
    bm.biceps_cm,
    bm.chest_cm,
    bm.calf_cm,
    bm.skinfold_abdominal_mm,
    (CURRENT_DATE - bm.measurement_date)::INTEGER as days_ago
  FROM app.body_measurements bm
  WHERE bm.user_id = p_user_id
    AND bm.is_validated = TRUE
  ORDER BY bm.measurement_date DESC
  LIMIT 1;
END;
$$;


--
-- Name: get_methodology_context(integer, character varying); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_methodology_context(p_user_id integer, p_methodology_type character varying) RETURNS TABLE(last_plan_id integer, total_weeks integer, frequency_per_week integer, last_plan_created_at timestamp with time zone, recent_exercises integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  WITH last_plan AS (
    SELECT rp.id, rp.total_weeks, rp.frequency_per_week, rp.created_at
    FROM app.routine_plans rp
    WHERE rp.user_id = p_user_id AND rp.methodology_type = p_methodology_type
    ORDER BY rp.created_at DESC
    LIMIT 1
  ), recent AS (
    SELECT COUNT(*)::INT AS cnt
    FROM app.exercise_history eh
    WHERE eh.user_id = p_user_id AND eh.methodology_type = p_methodology_type
      AND eh.used_at >= (CURRENT_TIMESTAMP - INTERVAL '30 days')
  )
  SELECT lp.id, lp.total_weeks, lp.frequency_per_week, lp.created_at, COALESCE(r.cnt, 0)
  FROM last_plan lp
  CROSS JOIN recent r;
END; $$;


--
-- Name: get_methodology_exercise_history(integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_methodology_exercise_history(p_user_id integer, p_limit integer DEFAULT 30) RETURNS TABLE(exercise_name character varying, methodology_type character varying, times_used bigint, last_used_at timestamp without time zone, avg_sentiment numeric, last_sentiment character varying)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        h.exercise_name,
        h.methodology_type,
        COUNT(*)::BIGINT as times_used,
        MAX(h.completed_at) as last_used_at,
        ROUND(AVG(CASE 
            WHEN h.sentiment = 'love'   THEN 3
            WHEN h.sentiment = 'normal' THEN 2  
            WHEN h.sentiment = 'hard'   THEN 1
            ELSE NULL
        END), 2) as avg_sentiment,
        (array_agg(h.sentiment ORDER BY h.completed_at DESC))[1] as last_sentiment
    FROM app.methodology_exercise_history_complete h
    WHERE h.user_id = p_user_id
      AND h.completed_at >= NOW() - INTERVAL '60 days'
    GROUP BY h.exercise_name, h.methodology_type
    ORDER BY MAX(h.completed_at) DESC, COUNT(*) DESC
    LIMIT p_limit;
END;
$$;


--
-- Name: get_methodology_stats_quick(integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_methodology_stats_quick(p_user_id integer, p_methodology_plan_id integer) RETURNS TABLE(total_sessions integer, completed_sessions integer, total_exercises integer, completed_exercises integer, love_exercises integer, hard_exercises integer, avg_session_duration numeric)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
    WITH base AS (
        SELECT mes.id AS session_id,
               mes.total_exercises,
               mes.exercises_completed,
               mes.session_status,
               mes.total_duration_seconds
        FROM app.methodology_exercise_sessions mes
        WHERE mes.user_id = p_user_id
          AND mes.methodology_plan_id = p_methodology_plan_id
    ),
    fb AS (
        SELECT f.methodology_session_id AS session_id,
               f.exercise_order,
               f.sentiment
        FROM app.methodology_exercise_feedback f
        JOIN base b ON b.session_id = f.methodology_session_id
    )
    SELECT 
        (SELECT COUNT(*) FROM base)::INTEGER AS total_sessions,
        (SELECT COUNT(*) FROM base WHERE session_status = 'completed')::INTEGER AS completed_sessions,
        COALESCE((SELECT SUM(b.total_exercises) FROM base b), 0)::INTEGER AS total_exercises,
        COALESCE((SELECT SUM(b.exercises_completed) FROM base b), 0)::INTEGER AS completed_exercises,
        COALESCE((
            SELECT COUNT(DISTINCT (session_id, exercise_order)) 
            FROM fb WHERE sentiment = 'love'
        ), 0)::INTEGER AS love_exercises,
        COALESCE((
            SELECT COUNT(DISTINCT (session_id, exercise_order)) 
            FROM fb WHERE sentiment = 'hard'
        ), 0)::INTEGER AS hard_exercises,
        ROUND( (SELECT AVG(NULLIF(b.total_duration_seconds,0)) FROM base b) / 60.0, 2 ) AS avg_session_duration
    ;
END;
$$;


--
-- Name: get_optimal_workout_time(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_optimal_workout_time(p_user_id integer) RETURNS TABLE(recommended_time character varying, reason text, pre_workout_carbs_timing character varying, post_workout_strategy text)
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: get_or_create_routine_plan(integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_or_create_routine_plan(p_methodology_plan_id integer, p_user_id integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_routine_plan_id INTEGER;
    v_plan_data JSONB;
    v_methodology_type TEXT;
BEGIN
    SELECT rp.id INTO v_routine_plan_id
    FROM app.routine_plans rp
    INNER JOIN app.methodology_plans mp ON mp.user_id = rp.user_id
    WHERE mp.id = p_methodology_plan_id 
    AND mp.user_id = p_user_id 
    AND rp.generation_mode = 'automatic'
    AND rp.created_at >= mp.created_at
    ORDER BY rp.id DESC  -- El más reciente
    LIMIT 1;
    IF v_routine_plan_id IS NOT NULL THEN
        RETURN v_routine_plan_id;
    END IF;
    SELECT plan_data INTO v_plan_data
    FROM app.methodology_plans
    WHERE id = p_methodology_plan_id AND user_id = p_user_id;
    IF v_plan_data IS NULL THEN
        RAISE EXCEPTION 'Methodology plan % not found for user %', p_methodology_plan_id, p_user_id;
    END IF;
    v_methodology_type := COALESCE(v_plan_data->>'selected_style', 'Rutina');
    INSERT INTO app.routine_plans (user_id, methodology_type, plan_data, generation_mode, created_at)
    VALUES (p_user_id, v_methodology_type, v_plan_data, 'automatic', NOW())
    RETURNING id INTO v_routine_plan_id;
    RETURN v_routine_plan_id;
END;
$$;


--
-- Name: get_playlist_track_count(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_playlist_track_count(playlist_id integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN (
        SELECT jsonb_array_length(tracks)
        FROM app.music_playlists 
        WHERE id = playlist_id
    );
END;
$$;


--
-- Name: get_recent_exercises(integer, character varying, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_recent_exercises(p_user_id integer, p_methodology_type character varying, p_days_back integer DEFAULT 30) RETURNS TABLE(exercise_name character varying, usage_count bigint, last_used timestamp without time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        eh.exercise_name,
        COUNT(eh.exercise_name) as usage_count,
        MAX(eh.used_at) as last_used
    FROM app.exercise_history eh
    WHERE eh.user_id = p_user_id 
        AND eh.methodology_type = p_methodology_type
        AND eh.used_at >= (CURRENT_TIMESTAMP - INTERVAL '1 day' * p_days_back)
    GROUP BY eh.exercise_name
    ORDER BY usage_count DESC, last_used DESC;
END;
$$;


--
-- Name: get_recent_manual_exercises(integer, character varying, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_recent_manual_exercises(p_user_id integer, p_methodology_type character varying, p_days_back integer DEFAULT 30) RETURNS TABLE(exercise_name character varying, usage_count bigint, last_used date, avg_sentiment numeric, avg_series numeric, total_completions bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        h.exercise_name,
        COUNT(*)::BIGINT as usage_count,
        MAX(h.session_date) as last_used,
        AVG(CASE 
            WHEN h.sentiment = 'love' THEN 1.0 
            WHEN h.sentiment = 'normal' THEN 0.5 
            WHEN h.sentiment = 'hard' THEN 0.0 
            ELSE 0.5 
        END) as avg_sentiment,
        AVG(h.series_completed::DECIMAL) as avg_series,
        SUM(CASE WHEN h.series_completed > 0 THEN 1 ELSE 0 END)::BIGINT as total_completions
    FROM app.manual_methodology_exercise_history_complete h
    WHERE h.user_id = p_user_id
        AND h.methodology_type = p_methodology_type
        AND h.session_date >= CURRENT_DATE - INTERVAL '1 day' * p_days_back
    GROUP BY h.exercise_name
    ORDER BY last_used DESC, usage_count DESC;
END;
$$;


--
-- Name: get_rejected_exercises_for_combination(integer, character varying, character varying); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_rejected_exercises_for_combination(p_user_id integer, p_equipment_type character varying, p_training_type character varying) RETURNS TABLE(exercise_name character varying, exercise_key character varying, rejection_reason text, rejection_category character varying, rejected_at timestamp without time zone, expires_at timestamp without time zone, days_until_expires integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Primero limpiamos rechazos expirados
    PERFORM app.cleanup_expired_rejections();
    
    -- Devolvemos rechazos activos para esta combinación
    RETURN QUERY
    SELECT 
        r.exercise_name,
        r.exercise_key,
        r.rejection_reason,
        r.rejection_category,
        r.rejected_at,
        r.expires_at,
        CASE 
            WHEN r.expires_at IS NULL THEN NULL
            ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (r.expires_at - NOW())) / 86400))::INTEGER
        END as days_until_expires
    FROM app.home_exercise_rejections r
    WHERE r.user_id = p_user_id
      AND r.equipment_type = p_equipment_type
      AND r.training_type = p_training_type
      AND r.is_active = TRUE
      AND (r.expires_at IS NULL OR r.expires_at > NOW())
    ORDER BY r.rejected_at DESC;
END;
$$;


--
-- Name: get_routine_history(integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_routine_history(p_user_id integer, p_limit integer DEFAULT 15) RETURNS TABLE(exercise_name text, exercise_key text, last_used_at timestamp with time zone, times_used integer)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
    WITH combined_routine AS (
        SELECT 
            r.exercise_name::TEXT,
            r.exercise_key::TEXT,
            r.created_at,
            2 as priority_weight
        FROM app.v_routine_hist_real r
        WHERE r.user_id = p_user_id
        UNION ALL
        SELECT 
            p.exercise_name::TEXT,
            p.exercise_key::TEXT,
            p.created_at,
            1 as priority_weight
        FROM app.v_routine_hist_propuesto p
        WHERE p.user_id = p_user_id
    ),
    aggregated AS (
        SELECT 
            c.exercise_name,
            c.exercise_key,
            MAX(c.created_at) as last_used_at,
            COUNT(*) as times_used,
            MAX(c.priority_weight) as max_priority
        FROM combined_routine c
        GROUP BY c.exercise_name, c.exercise_key
    )
    SELECT 
        a.exercise_name,
        a.exercise_key,
        a.last_used_at,
        a.times_used::INTEGER
    FROM aggregated a
    ORDER BY a.max_priority DESC, a.last_used_at DESC, a.times_used DESC
    LIMIT p_limit;
END;
$$;


--
-- Name: get_routine_progress(integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_routine_progress(p_user_id integer, p_routine_plan_id integer) RETURNS TABLE(total_sessions integer, completed_sessions integer, in_progress_sessions integer, total_exercises integer, completed_exercises integer, current_week integer, current_day character varying, overall_percentage numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    WITH session_stats AS (
        SELECT 
            COUNT(*) as total_sess,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_sess,
            COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_sess
        FROM app.routine_sessions
        WHERE user_id = p_user_id AND routine_plan_id = p_routine_plan_id
    ),
    exercise_stats AS (
        SELECT 
            COUNT(*) as total_ex,
            COUNT(CASE WHEN rep.status = 'completed' THEN 1 END) as completed_ex
        FROM app.routine_sessions rs
        JOIN app.routine_exercise_progress rep ON rs.id = rep.routine_session_id
        WHERE rs.user_id = p_user_id AND rs.routine_plan_id = p_routine_plan_id
    ),
    current_progress AS (
        SELECT 
            rs.week_number,
            rs.day_name
        FROM app.routine_sessions rs
        WHERE rs.user_id = p_user_id 
            AND rs.routine_plan_id = p_routine_plan_id
            AND rs.status IN ('in_progress', 'pending')
        ORDER BY rs.week_number, rs.session_date
        LIMIT 1
    )
    SELECT 
        ss.total_sess::INTEGER,
        ss.completed_sess::INTEGER,
        ss.in_progress_sess::INTEGER,
        COALESCE(es.total_ex, 0)::INTEGER,
        COALESCE(es.completed_ex, 0)::INTEGER,
        COALESCE(cp.week_number, 1)::INTEGER,
        COALESCE(cp.day_name, 'Lun')::VARCHAR,
        CASE 
            WHEN ss.total_sess > 0 THEN 
                ROUND((ss.completed_sess::DECIMAL / ss.total_sess::DECIMAL) * 100, 2)
            ELSE 0.00
        END::DECIMAL
    FROM session_stats ss
    CROSS JOIN exercise_stats es
    CROSS JOIN current_progress cp;
END;
$$;


--
-- Name: get_user_active_plan(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_user_active_plan(p_user_id integer) RETURNS TABLE(plan_id integer, plan_data jsonb, methodology_type character varying, status character varying, current_week integer, current_day character varying, started_at timestamp with time zone, has_active_session boolean, active_session_id integer)
    LANGUAGE plpgsql
    AS $$
        BEGIN
            RETURN QUERY
            SELECT
                mp.id,
                mp.plan_data,
                mp.methodology_type,
                mp.status,
                mp.current_week,
                mp.current_day,
                mp.started_at,
                (uts.active_session_id IS NOT NULL AND uts.is_training = true) as has_active_session,
                uts.active_session_id
            FROM methodology_plans mp
            LEFT JOIN user_training_state uts ON uts.active_methodology_plan_id = mp.id
            WHERE mp.user_id = p_user_id
                AND mp.status = 'active'
            ORDER BY mp.created_at DESC
            LIMIT 1;
        END;
        $$;


--
-- Name: get_user_ai_context(integer, character varying); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_user_ai_context(p_user_id integer, p_methodology_type character varying DEFAULT NULL::character varying) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'user_id', p_user_id,
        'methodology_type', COALESCE(p_methodology_type, 'all'),
        'feedback_summary', (
            SELECT jsonb_build_object(
                'total_feedback_count', COUNT(*),
                'recent_feedback_count', COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'),
                'feedback_by_type', jsonb_object_agg(feedback_type, type_count),
                'most_common_issues', array_agg(DISTINCT feedback_type ORDER BY type_count DESC) FILTER (WHERE type_count > 1)
            )
            FROM (
                SELECT
                    feedback_type,
                    COUNT(*) as type_count
                FROM app.user_exercise_feedback
                WHERE user_id = p_user_id
                    AND (p_methodology_type IS NULL OR methodology_type = p_methodology_type)
                    AND (expires_at IS NULL OR expires_at > NOW())
                GROUP BY feedback_type
            ) feedback_stats
        ),
        'preferences', (
            SELECT row_to_json(pref.*)
            FROM app.user_training_preferences pref
            WHERE pref.user_id = p_user_id
        ),
        'avoided_exercises', (
            SELECT array_agg(DISTINCT exercise_name)
            FROM app.user_exercise_feedback
            WHERE user_id = p_user_id
                AND (p_methodology_type IS NULL OR methodology_type = p_methodology_type)
                AND feedback_type IN ('too_difficult', 'dont_like', 'no_equipment')
                AND (expires_at IS NULL OR expires_at > NOW())
        ),
        'preferred_exercises', (
            SELECT array_agg(DISTINCT exercise_name)
            FROM app.user_exercise_feedback
            WHERE user_id = p_user_id
                AND (p_methodology_type IS NULL OR methodology_type = p_methodology_type)
                AND feedback_type IN ('love_it', 'perfect_difficulty')
                AND (expires_at IS NULL OR expires_at > NOW())
        ),
        'generated_at', NOW()
    ) INTO result;

    RETURN result;
END;
$$;


--
-- Name: get_user_combination_stats(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_user_combination_stats(p_user_id integer) RETURNS TABLE(combination_code text, display_name text, total_exercises_used integer, most_used_exercise text, favorite_exercises text[], difficult_exercises text[], last_training_date timestamp with time zone, total_sessions integer)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.combination_code::TEXT,
        c.display_name::TEXT,
        COUNT(DISTINCT h.exercise_name)::INTEGER AS total_exercises_used,
        (
          SELECT h2.exercise_name 
          FROM app.home_combination_exercise_history h2 
          WHERE h2.user_id = p_user_id AND h2.combination_id = c.id 
          ORDER BY h2.times_used DESC, h2.last_used_at DESC
          LIMIT 1
        )::TEXT AS most_used_exercise,
        ARRAY(
          SELECT h3.exercise_name 
          FROM app.home_combination_exercise_history h3 
          WHERE h3.user_id = p_user_id AND h3.combination_id = c.id AND h3.user_rating = 'love'
        ) AS favorite_exercises,
        ARRAY(
          SELECT h4.exercise_name 
          FROM app.home_combination_exercise_history h4 
          WHERE h4.user_id = p_user_id AND h4.combination_id = c.id AND h4.user_rating = 'hard'
        ) AS difficult_exercises,
        MAX(h.last_used_at) AS last_training_date,
        COUNT(DISTINCT h.session_id)::INTEGER AS total_sessions
    FROM app.home_training_combinations c
    LEFT JOIN app.home_combination_exercise_history h 
      ON c.id = h.combination_id AND h.user_id = p_user_id
    WHERE EXISTS (
      SELECT 1 FROM app.home_combination_exercise_history h5 
      WHERE h5.user_id = p_user_id AND h5.combination_id = c.id
    )
    GROUP BY c.id, c.combination_code, c.display_name
    ORDER BY last_training_date DESC NULLS LAST;
END;
$$;


--
-- Name: get_user_methodology_recommendations(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_user_methodology_recommendations(p_user_id integer) RETURNS TABLE(user_id integer, nivel_calculado text, anos_experiencia integer, version_recomendada text, semanas_recomendadas integer, razon_recomendacion text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p_user_id,
        vump.nivel_calculado,
        vump.anos_entrenamiento_normalizado,
        vump.version_recomendada,
        vump.semanas_recomendadas,
        CASE 
            WHEN vump.nivel_calculado = 'principiante' THEN 
                'Recomendamos versión adaptada con progresión gradual para construir una base sólida'
            WHEN vump.nivel_calculado = 'intermedio' THEN 
                'Versión estricta apropiada con supervisión de la intensidad'
            ELSE 
                'Versión estricta recomendada con foco en optimización del rendimiento'
        END as razon_recomendacion
    FROM app.v_user_methodology_profile vump
    WHERE vump.id = p_user_id;
END;
$$;


--
-- Name: get_user_personalized_equipment(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_user_personalized_equipment(p_user_id integer) RETURNS TABLE(equipment_name text, equipment_key text, category text, attributes jsonb)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT e.equipment_name::TEXT, e.equipment_key::TEXT, e.category::TEXT, e.attributes
  FROM app.user_personalized_equipment e
  WHERE e.user_id = p_user_id AND e.is_active = TRUE
  ORDER BY e.equipment_name;
END;
$$;


--
-- Name: get_user_session_stats(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_user_session_stats(p_user_id integer) RETURNS TABLE(active_sessions integer, total_sessions integer, avg_session_duration interval, last_login timestamp with time zone, total_logins_last_30_days integer, unique_ips_last_30_days integer, longest_session interval, shortest_session interval)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(CASE WHEN s.is_active = TRUE THEN 1 END)::INTEGER as active_sessions,
        COUNT(*)::INTEGER as total_sessions,
        AVG(CASE WHEN s.session_duration IS NOT NULL THEN s.session_duration END) as avg_session_duration,
        MAX(s.login_time) as last_login,
        COUNT(CASE WHEN s.login_time >= NOW() - INTERVAL '30 days' THEN 1 END)::INTEGER as total_logins_last_30_days,
        COUNT(DISTINCT CASE WHEN s.login_time >= NOW() - INTERVAL '30 days' THEN s.ip_address END)::INTEGER as unique_ips_last_30_days,
        MAX(CASE WHEN s.session_duration IS NOT NULL THEN s.session_duration END) as longest_session,
        MIN(CASE WHEN s.session_duration IS NOT NULL AND s.session_duration > INTERVAL '1 minute' THEN s.session_duration END) as shortest_session
    FROM app.user_sessions s
    WHERE s.user_id = p_user_id;
END;
$$;


--
-- Name: get_user_streak(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_user_streak(p_user_id integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
      DECLARE
          streak_count INTEGER := 0;
          current_date_check DATE;
          has_activity BOOLEAN;
      BEGIN
          -- Empezar desde hoy y contar hacia atrás
          current_date_check := CURRENT_DATE;
          
          LOOP
              -- Verificar si hay actividad en esta fecha
              SELECT EXISTS(
                  SELECT 1 FROM app.exercise_history 
                  WHERE user_id = p_user_id 
                  AND DATE(used_at) = current_date_check
                  UNION
                  SELECT 1 FROM app.home_exercise_history 
                  WHERE user_id = p_user_id 
                  AND DATE(created_at) = current_date_check
              ) INTO has_activity;
              
              IF has_activity THEN
                  streak_count := streak_count + 1;
              ELSE
                  EXIT; -- Romper la racha
              END IF;
              
              current_date_check := current_date_check - INTERVAL '1 day';
          END LOOP;
          
          RETURN streak_count;
      END;
      $$;


--
-- Name: get_week_start(date); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_week_start(p_date date) RETURNS date
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  -- Devuelve el lunes de la semana de la fecha dada
  RETURN p_date - (EXTRACT(ISODOW FROM p_date) - 1)::INTEGER;
END;
$$;


--
-- Name: get_weekly_deviation_summary(integer, date); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_weekly_deviation_summary(p_user_id integer, p_week_start date DEFAULT NULL::date) RETURNS TABLE(week_start date, daily_target integer, weekly_target integer, total_deviations integer, total_excess_kcal integer, total_compensated integer, net_deviation integer, deviation_count integer, compensation_status character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_week_start DATE;
BEGIN
  v_week_start := COALESCE(p_week_start, app.get_week_start(CURRENT_DATE));

  RETURN QUERY
  WITH deviations AS (
    SELECT
      COALESCE(SUM(excess_kcal), 0) AS total_excess,
      COUNT(*) AS dev_count
    FROM app.diet_deviations
    WHERE user_id = p_user_id
      AND deviation_date >= v_week_start
      AND deviation_date < v_week_start + 7
  ),
  compensations AS (
    SELECT COALESCE(SUM(ABS(kcal_adjustment)), 0) AS total_comp
    FROM app.daily_compensation_plan
    WHERE user_id = p_user_id
      AND compensation_date >= v_week_start
      AND compensation_date < v_week_start + 7
      AND is_applied = TRUE
  ),
  targets AS (
    SELECT
      COALESCE(wt.daily_target_kcal, np.kcal_objetivo, np.tdee, 2000) AS daily_tgt
    FROM app.nutrition_profiles np
    LEFT JOIN app.weekly_calorie_targets wt ON wt.user_id = np.user_id AND wt.week_start_date = v_week_start
    WHERE np.user_id = p_user_id
  )
  SELECT
    v_week_start,
    t.daily_tgt::INTEGER,
    (t.daily_tgt * 7)::INTEGER,
    d.total_excess::INTEGER,
    d.total_excess::INTEGER,
    c.total_comp::INTEGER,
    (d.total_excess - c.total_comp)::INTEGER,
    d.dev_count::INTEGER,
    CASE
      WHEN d.total_excess = 0 THEN 'none'
      WHEN c.total_comp >= d.total_excess THEN 'completed'
      WHEN c.total_comp > 0 THEN 'partial'
      ELSE 'pending'
    END::VARCHAR(20)
  FROM deviations d, compensations c, targets t;
END;
$$;


--
-- Name: get_weekly_nutrition_stats(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.get_weekly_nutrition_stats(p_user_id integer) RETURNS TABLE(days_logged integer, avg_calories numeric, avg_protein numeric, avg_carbs numeric, avg_fat numeric, consistency_percentage integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as days_logged,
        COALESCE(AVG(calories), 0) as avg_calories,
        COALESCE(AVG(protein), 0) as avg_protein,
        COALESCE(AVG(carbs), 0) as avg_carbs,
        COALESCE(AVG(fat), 0) as avg_fat,
        ROUND(AVG(CASE WHEN calories > 0 THEN 100 ELSE 0 END))::INTEGER as consistency_percentage
    FROM app.daily_nutrition_log
    WHERE user_id = p_user_id 
    AND log_date >= CURRENT_DATE - INTERVAL '7 days';
END;
$$;


--
-- Name: halterofilia_register_session_result(integer, integer, numeric, boolean, boolean, numeric); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.halterofilia_register_session_result(p_user_id integer, p_plan_id integer, p_rpe numeric, p_target_met boolean, p_good_technique boolean, p_subjective numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_easy integer;
  v_hard integer;
  v_sessions integer;
  v_decision varchar(20);
  v_deload boolean := false;
  v_technique boolean := COALESCE(p_good_technique, true);
  v_class text;
BEGIN
  INSERT INTO app.halterofilia_autoreg_state (user_id, methodology_plan_id)
  VALUES (p_user_id, p_plan_id)
  ON CONFLICT (user_id) DO UPDATE SET methodology_plan_id = EXCLUDED.methodology_plan_id;

  SELECT easy_streak, hard_streak, sessions_completed
    INTO v_easy, v_hard, v_sessions
  FROM app.halterofilia_autoreg_state
  WHERE user_id = p_user_id;

  v_sessions := COALESCE(v_sessions, 0) + 1;

  -- Clasificación OBJETIVA (técnica deficiente nunca es cómoda)
  IF p_target_met AND COALESCE(p_rpe, 10) <= 7 AND v_technique THEN
    v_class := 'easy';
  ELSIF (NOT p_target_met) OR COALESCE(p_rpe, 0) >= 9 OR (NOT v_technique) THEN
    v_class := 'hard';
  ELSE
    v_class := 'neutral';
  END IF;

  -- Aporte SUBJETIVO (acotado; no puede sacar a 'hard' de técnica mala)
  IF p_subjective IS NOT NULL THEN
    IF v_class = 'easy' AND p_subjective <= -0.5 THEN
      v_class := 'neutral';
    ELSIF v_class = 'neutral' AND p_subjective >= 0.5 THEN
      v_class := 'easy';
    ELSIF v_class = 'neutral' AND p_subjective <= -0.5 THEN
      v_class := 'hard';
    END IF;
  END IF;

  IF v_class = 'easy' THEN
    v_easy := COALESCE(v_easy, 0) + 1;
    v_hard := 0;
  ELSIF v_class = 'hard' THEN
    v_hard := COALESCE(v_hard, 0) + 1;
    v_easy := 0;
  ELSE
    v_easy := 0;
    v_hard := 0;
  END IF;

  IF v_hard >= 3 THEN
    v_decision := 'deload';
    v_deload := true;
    v_hard := 0;
  ELSIF v_easy >= 2 THEN
    v_decision := 'progress';
  ELSE
    v_decision := 'hold';
  END IF;

  UPDATE app.halterofilia_autoreg_state
    SET easy_streak = v_easy,
        hard_streak = v_hard,
        sessions_completed = v_sessions,
        deload_suggested = v_deload,
        last_decision = v_decision,
        last_rpe = p_rpe,
        last_target_met = p_target_met,
        last_good_technique = v_technique,
        last_subjective = p_subjective,
        updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'decision', v_decision,
    'easy_streak', v_easy,
    'hard_streak', v_hard,
    'deload_suggested', v_deload,
    'sessions_completed', v_sessions,
    'subjective_applied', (p_subjective IS NOT NULL)
  );
END;
$$;


--
-- Name: heavy_duty_register_session_result(integer, integer, boolean, boolean, numeric); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.heavy_duty_register_session_result(p_user_id integer, p_plan_id integer, p_reached_failure boolean, p_target_met boolean, p_subjective numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_hard integer;
  v_sessions integer;
  v_decision varchar(20);
  v_deload boolean := false;
  v_failure boolean := COALESCE(p_reached_failure, true);
  v_target boolean := COALESCE(p_target_met, false);
BEGIN
  INSERT INTO app.heavy_duty_autoreg_state (user_id, methodology_plan_id)
  VALUES (p_user_id, p_plan_id)
  ON CONFLICT (user_id) DO UPDATE SET methodology_plan_id = EXCLUDED.methodology_plan_id;

  SELECT hard_streak, sessions_completed
    INTO v_hard, v_sessions
  FROM app.heavy_duty_autoreg_state
  WHERE user_id = p_user_id;

  v_sessions := COALESCE(v_sessions, 0) + 1;

  IF NOT v_failure THEN
    v_hard := COALESCE(v_hard, 0) + 1;
  ELSE
    v_hard := 0;
  END IF;

  IF v_hard >= 2 THEN
    v_decision := 'deload';
    v_deload := true;
    v_hard := 0;
  ELSIF v_failure AND v_target THEN
    v_decision := 'progress';
  ELSE
    v_decision := 'hold';
  END IF;

  -- Aporte SUBJETIVO (solo freno): si iba a subir carga pero lo sintió muy duro,
  -- mantener carga. No fuerza deload ni cambia las rachas objetivas.
  IF p_subjective IS NOT NULL AND v_decision = 'progress' AND p_subjective <= -0.5 THEN
    v_decision := 'hold';
  END IF;

  UPDATE app.heavy_duty_autoreg_state
    SET hard_streak = v_hard,
        sessions_completed = v_sessions,
        deload_suggested = v_deload,
        last_decision = v_decision,
        last_reached_failure = v_failure,
        last_target_met = v_target,
        last_subjective = p_subjective,
        updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'decision', v_decision,
    'hard_streak', v_hard,
    'deload_suggested', v_deload,
    'sessions_completed', v_sessions,
    'subjective_applied', (p_subjective IS NOT NULL)
  );
END;
$$;


--
-- Name: increment_exercise_request_count(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.increment_exercise_request_count(exercise_id integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
      DECLARE
        new_count INTEGER;
      BEGIN
        UPDATE app.exercise_ai_info
        SET request_count = request_count + 1,
            updated_at = NOW()
        WHERE id = exercise_id
        RETURNING request_count INTO new_count;

        RETURN COALESCE(new_count, 0);
      END;
      $$;


--
-- Name: increment_exercise_request_count(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.increment_exercise_request_count(exercise_name_param text) RETURNS void
    LANGUAGE plpgsql
    AS $$
      BEGIN
        UPDATE app.exercise_ai_info
           SET request_count = COALESCE(request_count, 0) + 1,
               updated_at = NOW()
         WHERE exercise_name = exercise_name_param
            OR exercise_name_normalized = app.normalize_exercise_name(exercise_name_param);
      END;
      $$;


--
-- Name: increment_template_usage(character varying, character varying); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.increment_template_usage(p_equipment_type character varying, p_training_type character varying) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE app.home_training_templates 
        updated_at = CURRENT_TIMESTAMP
    WHERE equipment_type = p_equipment_type 
      AND training_type = p_training_type
      AND is_active = true;
END;
$$;


--
-- Name: is_exercise_rejected(integer, character varying, character varying, character varying); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.is_exercise_rejected(p_user_id integer, p_exercise_key character varying, p_equipment_type character varying, p_training_type character varying) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    rejection_count INTEGER;
BEGIN
    -- Limpiar rechazos expirados primero
    PERFORM app.cleanup_expired_rejections();
    
    -- Contar rechazos activos para este ejercicio
    SELECT COUNT(*)
    INTO rejection_count
    FROM app.home_exercise_rejections
    WHERE user_id = p_user_id
      AND exercise_key = p_exercise_key
      AND equipment_type = p_equipment_type
      AND training_type = p_training_type
      AND is_active = TRUE
      AND (expires_at IS NULL OR expires_at > NOW());
    
    RETURN rejection_count > 0;
END;
$$;


--
-- Name: is_exercise_rejected_simple(integer, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.is_exercise_rejected_simple(p_user integer, p_key text) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
        SELECT EXISTS (
          SELECT 1 FROM app.home_exercise_rejections r
          WHERE r.user_id = p_user
            AND r.exercise_key = p_key
            AND r.is_active = true
            AND (r.expires_at IS NULL OR r.expires_at > NOW())
        );
      $$;


--
-- Name: log_bridge_decision(integer, character varying, character varying, jsonb, jsonb, character varying, jsonb, jsonb, jsonb); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.log_bridge_decision(p_user_id integer, p_trigger_source character varying, p_trigger_event character varying, p_training_inputs jsonb, p_nutrition_inputs jsonb, p_decision_type character varying, p_decision_details jsonb, p_applied_nutrition jsonb DEFAULT NULL::jsonb, p_applied_training jsonb DEFAULT NULL::jsonb) RETURNS integer
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: needs_warmup_reminder(integer, integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.needs_warmup_reminder(p_user_id integer, p_exercise_id integer, p_session_id integer) RETURNS jsonb
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


--
-- Name: normalize_exercise_name(text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.normalize_exercise_name(input_name text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
      BEGIN
        RETURN lower(trim(regexp_replace(input_name, 's+', ' ', 'g')));
      END; $$;


--
-- Name: oposiciones_register_session_result(integer, integer, numeric, boolean, numeric); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.oposiciones_register_session_result(p_user_id integer, p_plan_id integer, p_avg_rir numeric, p_target_met boolean, p_subjective numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_easy integer;
  v_hard integer;
  v_micro integer;
  v_decision varchar(20);
  v_deload boolean := false;
  v_class text;
BEGIN
  INSERT INTO app.oposiciones_autoreg_state (user_id, methodology_plan_id)
  VALUES (p_user_id, p_plan_id)
  ON CONFLICT (user_id) DO UPDATE SET methodology_plan_id = EXCLUDED.methodology_plan_id;

  SELECT easy_streak, hard_streak, microcycles_completed
    INTO v_easy, v_hard, v_micro
  FROM app.oposiciones_autoreg_state
  WHERE user_id = p_user_id;

  v_micro := COALESCE(v_micro, 0) + 1;

  -- 1) Clasificación OBJETIVA base (manda)
  IF p_target_met AND COALESCE(p_avg_rir, 0) >= 2 THEN
    v_class := 'easy';
  ELSIF (NOT p_target_met) OR COALESCE(p_avg_rir, 99) <= 0 THEN
    v_class := 'hard';
  ELSE
    v_class := 'neutral';
  END IF;

  -- 2) Aporte SUBJETIVO (acotado, no manda)
  IF p_subjective IS NOT NULL THEN
    IF v_class = 'easy' AND p_subjective <= -0.5 THEN
      v_class := 'neutral';
    ELSIF v_class = 'neutral' AND p_subjective >= 0.5 THEN
      v_class := 'easy';
    ELSIF v_class = 'neutral' AND p_subjective <= -0.5 THEN
      v_class := 'hard';
    END IF;
  END IF;

  -- 3) Rachas
  IF v_class = 'easy' THEN
    v_easy := COALESCE(v_easy, 0) + 1;
    v_hard := 0;
  ELSIF v_class = 'hard' THEN
    v_hard := COALESCE(v_hard, 0) + 1;
    v_easy := 0;
  ELSE
    v_easy := 0;
    v_hard := 0;
  END IF;

  -- 4) Decisión (gates OBJETIVOS intactos)
  IF v_hard >= 3 THEN
    v_decision := 'deload';
    v_deload := true;
    v_hard := 0;
  ELSIF v_easy >= 2 THEN
    v_decision := 'progress';
  ELSE
    v_decision := 'hold';
  END IF;

  UPDATE app.oposiciones_autoreg_state
    SET easy_streak = v_easy,
        hard_streak = v_hard,
        microcycles_completed = v_micro,
        deload_suggested = v_deload,
        last_decision = v_decision,
        last_avg_rir = p_avg_rir,
        last_subjective = p_subjective,
        updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'decision', v_decision,
    'easy_streak', v_easy,
    'hard_streak', v_hard,
    'deload_suggested', v_deload,
    'microcycles_completed', v_micro,
    'subjective_applied', (p_subjective IS NOT NULL)
  );
END;
$$;


--
-- Name: powerlifting_register_session_result(integer, integer, numeric, boolean, boolean, numeric); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.powerlifting_register_session_result(p_user_id integer, p_plan_id integer, p_rpe numeric, p_target_met boolean, p_good_technique boolean, p_subjective numeric DEFAULT NULL::numeric) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_easy integer;
  v_hard integer;
  v_sessions integer;
  v_decision varchar(20);
  v_deload boolean := false;
  v_technique boolean := COALESCE(p_good_technique, true);
  v_class text;
BEGIN
  INSERT INTO app.powerlifting_autoreg_state (user_id, methodology_plan_id)
  VALUES (p_user_id, p_plan_id)
  ON CONFLICT (user_id) DO UPDATE SET methodology_plan_id = EXCLUDED.methodology_plan_id;

  SELECT easy_streak, hard_streak, sessions_completed
    INTO v_easy, v_hard, v_sessions
  FROM app.powerlifting_autoreg_state
  WHERE user_id = p_user_id;

  v_sessions := COALESCE(v_sessions, 0) + 1;

  IF p_target_met AND COALESCE(p_rpe, 10) <= 7 AND v_technique THEN
    v_class := 'easy';
  ELSIF (NOT p_target_met) OR COALESCE(p_rpe, 0) >= 9 OR (NOT v_technique) THEN
    v_class := 'hard';
  ELSE
    v_class := 'neutral';
  END IF;

  IF p_subjective IS NOT NULL THEN
    IF v_class = 'easy' AND p_subjective <= -0.5 THEN
      v_class := 'neutral';
    ELSIF v_class = 'neutral' AND p_subjective >= 0.5 THEN
      v_class := 'easy';
    ELSIF v_class = 'neutral' AND p_subjective <= -0.5 THEN
      v_class := 'hard';
    END IF;
  END IF;

  IF v_class = 'easy' THEN
    v_easy := COALESCE(v_easy, 0) + 1;
    v_hard := 0;
  ELSIF v_class = 'hard' THEN
    v_hard := COALESCE(v_hard, 0) + 1;
    v_easy := 0;
  ELSE
    v_easy := 0;
    v_hard := 0;
  END IF;

  IF v_hard >= 3 THEN
    v_decision := 'deload';
    v_deload := true;
    v_hard := 0;
  ELSIF v_easy >= 2 THEN
    v_decision := 'progress';
  ELSE
    v_decision := 'hold';
  END IF;

  UPDATE app.powerlifting_autoreg_state
    SET easy_streak = v_easy,
        hard_streak = v_hard,
        sessions_completed = v_sessions,
        deload_suggested = v_deload,
        last_decision = v_decision,
        last_rpe = p_rpe,
        last_target_met = p_target_met,
        last_good_technique = v_technique,
        last_subjective = p_subjective,
        updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'decision', v_decision,
    'easy_streak', v_easy,
    'hard_streak', v_hard,
    'deload_suggested', v_deload,
    'sessions_completed', v_sessions,
    'subjective_applied', (p_subjective IS NOT NULL)
  );
END;
$$;


--
-- Name: range_to_max_value(character varying); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.range_to_max_value(range_text character varying) RETURNS integer
    LANGUAGE plpgsql
    AS $_$
      BEGIN
        -- Si es un rango como "3-5", tomar el valor máximo
        IF range_text ~ '^[0-9]+-[0-9]+$' THEN
          RETURN SPLIT_PART(range_text, '-', 2)::INTEGER;
        -- Si es un número simple, devolverlo
        ELSIF range_text ~ '^[0-9]+$' THEN
          RETURN range_text::INTEGER;
        -- Si no es válido, devolver 0
        ELSE
          RETURN 0;
        END IF;
      END;
      $_$;


--
-- Name: range_to_min_value(character varying); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.range_to_min_value(range_text character varying) RETURNS integer
    LANGUAGE plpgsql
    AS $_$
      BEGIN
        -- Si es un rango como "3-5", tomar el valor mínimo
        IF range_text ~ '^[0-9]+-[0-9]+$' THEN
          RETURN SPLIT_PART(range_text, '-', 1)::INTEGER;
        -- Si es un número simple, devolverlo
        ELSIF range_text ~ '^[0-9]+$' THEN
          RETURN range_text::INTEGER;
        -- Si no es válido, devolver 0
        ELSE
          RETURN 0;
        END IF;
      END;
      $_$;


--
-- Name: record_technique_corrections(integer, integer, integer, character varying, integer, character varying, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.record_technique_corrections(p_user_id integer, p_methodology_plan_id integer, p_session_id integer, p_muscle_group character varying, p_corrections_count integer DEFAULT 1, p_source character varying DEFAULT 'manual'::character varying, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: register_combination_exercise_usage(integer, character varying, character varying, character varying, integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.register_combination_exercise_usage(p_user_id integer, p_equipment_type character varying, p_training_type character varying, p_exercise_name character varying, p_session_id integer DEFAULT NULL::integer, p_plan_id integer DEFAULT NULL::integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    exercise_key_normalized VARCHAR(255);
BEGIN
    exercise_key_normalized := lower(regexp_replace(p_exercise_name, '[^a-z0-9]+', '_', 'g'));
    INSERT INTO app.home_combination_exercise_history 
    (user_id, equipment_type, training_type, exercise_name, exercise_key, 
     times_used, last_used_at, session_id, plan_id, updated_at)
    VALUES 
    (p_user_id, p_equipment_type, p_training_type, p_exercise_name, 
     exercise_key_normalized, 1, NOW(), p_session_id, p_plan_id, NOW())
    ON CONFLICT (user_id, equipment_type, training_type, exercise_name)
    DO UPDATE SET
        times_used = app.home_combination_exercise_history.times_used + 1,
        last_used_at = NOW(),
        updated_at = NOW(),
        session_id = COALESCE(p_session_id, app.home_combination_exercise_history.session_id),
        plan_id = COALESCE(p_plan_id, app.home_combination_exercise_history.plan_id);
END;
$$;


--
-- Name: register_daily_activity(integer, integer, character varying, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.register_daily_activity(p_user_id integer, p_routine_plan_id integer DEFAULT NULL::integer, p_activity_type character varying DEFAULT 'continue_training'::character varying, p_session_id integer DEFAULT NULL::integer) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO app.user_daily_activity (
        user_id,
        routine_plan_id,
        activity_type,
        session_id,
        activity_date
    ) VALUES (
        p_user_id,
        p_routine_plan_id,
        p_activity_type,
        p_session_id,
        CURRENT_DATE
    )
    ON CONFLICT (user_id, routine_plan_id, activity_date, activity_type) 
    DO UPDATE SET 
        session_id = COALESCE(EXCLUDED.session_id, app.user_daily_activity.session_id),
        created_at = CURRENT_TIMESTAMP;
    RETURN TRUE;
END;
$$;


--
-- Name: register_diet_deviation(integer, date, character varying, integer, text, character varying, numeric, numeric, numeric); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.register_diet_deviation(p_user_id integer, p_date date, p_meal_slot character varying, p_excess_kcal integer, p_description text DEFAULT NULL::text, p_confidence character varying DEFAULT 'medio'::character varying, p_excess_protein numeric DEFAULT 0, p_excess_carbs numeric DEFAULT 0, p_excess_fat numeric DEFAULT 0) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_deviation_id INTEGER;
  v_comp RECORD;
BEGIN
  -- Insertar el salto
  INSERT INTO app.diet_deviations (
    user_id, deviation_date, meal_slot, excess_kcal,
    description, confidence_level,
    excess_protein_g, excess_carbs_g, excess_fat_g
  ) VALUES (
    p_user_id, p_date, p_meal_slot, p_excess_kcal,
    p_description, p_confidence,
    p_excess_protein, p_excess_carbs, p_excess_fat
  )
  RETURNING id INTO v_deviation_id;

  -- Generar plan de compensacion automatico
  FOR v_comp IN
    SELECT * FROM app.calculate_compensation(p_user_id, p_excess_kcal, p_date, p_confidence)
  LOOP
    INSERT INTO app.daily_compensation_plan (
      user_id, deviation_id, compensation_date, kcal_adjustment,
      protein_g_target, carbs_g_adjustment, fat_g_adjustment
    ) VALUES (
      p_user_id, v_deviation_id, v_comp.compensation_date, v_comp.kcal_reduction,
      v_comp.protein_g_target, v_comp.carbs_g_adjustment, v_comp.fat_g_adjustment
    )
    ON CONFLICT (user_id, compensation_date, deviation_id) DO UPDATE SET
      kcal_adjustment = EXCLUDED.kcal_adjustment,
      protein_g_target = EXCLUDED.protein_g_target,
      carbs_g_adjustment = EXCLUDED.carbs_g_adjustment,
      fat_g_adjustment = EXCLUDED.fat_g_adjustment;
  END LOOP;

  RETURN v_deviation_id;
END;
$$;


--
-- Name: register_exercise_for_combination(integer, character varying, character varying, character varying, integer, integer, character varying); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.register_exercise_for_combination(p_user_id integer, p_equipment_type character varying, p_training_type character varying, p_exercise_name character varying, p_session_id integer DEFAULT NULL::integer, p_plan_id integer DEFAULT NULL::integer, p_user_rating character varying DEFAULT NULL::character varying) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    combination_record RECORD;
    exercise_key_normalized VARCHAR(255);
BEGIN
    SELECT c.id, c.combination_code
      INTO combination_record
    FROM app.home_training_combinations c
    WHERE c.equipment_type = p_equipment_type 
      AND c.training_type  = p_training_type;
    IF NOT FOUND THEN
        RETURN FALSE; -- combinación no definida
    END IF;
    exercise_key_normalized := lower(regexp_replace(p_exercise_name, '[^a-z0-9]+', '_', 'g'));
    INSERT INTO app.home_combination_exercise_history 
      (user_id, combination_id, combination_code, exercise_name, exercise_key, 
       times_used, last_used_at, session_id, plan_id, user_rating, updated_at)
    VALUES 
      (p_user_id, combination_record.id, combination_record.combination_code, 
       p_exercise_name, exercise_key_normalized, 
       1, NOW(), p_session_id, p_plan_id, p_user_rating, NOW())
    ON CONFLICT (user_id, combination_id, exercise_key)
    DO UPDATE SET
      times_used = app.home_combination_exercise_history.times_used + 1,
      last_used_at = NOW(),
      updated_at   = NOW(),
      session_id = COALESCE(p_session_id, app.home_combination_exercise_history.session_id),
      plan_id    = COALESCE(p_plan_id,    app.home_combination_exercise_history.plan_id),
      user_rating= COALESCE(p_user_rating,app.home_combination_exercise_history.user_rating);
    RETURN TRUE;
END;
$$;


--
-- Name: register_icg_ipg_state(integer, date, character varying, numeric, numeric, numeric, numeric, numeric, character varying); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.register_icg_ipg_state(p_user_id integer, p_measurement_date date, p_indicator_type character varying, p_weight_kg numeric, p_waist_cm numeric, p_weight_change numeric, p_waist_change numeric, p_indicator_value numeric, p_status character varying) RETURNS TABLE(state_id integer, consecutive_count integer, status_confirmed boolean, previous_status character varying, should_apply_change boolean, confirmation_reason text)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_last_state RECORD;
  v_consecutive INTEGER;
  v_confirmed BOOLEAN;
  v_should_apply BOOLEAN;
  v_reason TEXT;
  v_state_id INTEGER;
BEGIN
  -- Obtener último estado del mismo indicador
  SELECT * INTO v_last_state
  FROM app.icg_ipg_state_history
  WHERE user_id = p_user_id
  AND indicator_type = p_indicator_type
  ORDER BY measurement_date DESC
  LIMIT 1;
  
  -- Si no hay estado previo, es el primero
  IF v_last_state IS NULL THEN
    INSERT INTO app.icg_ipg_state_history (
      user_id, measurement_date, indicator_type,
      weight_kg, waist_cm, weight_change_kg, waist_change_cm,
      indicator_value, status, consecutive_count, status_confirmed
    ) VALUES (
      p_user_id, p_measurement_date, p_indicator_type,
      p_weight_kg, p_waist_cm, p_weight_change, p_waist_change,
      p_indicator_value, p_status, 1, FALSE
    )
    RETURNING id INTO v_state_id;
    
    RETURN QUERY SELECT
      v_state_id,
      1,
      FALSE,
      NULL::VARCHAR(20),
      TRUE,
      'Primer estado registrado - se aplica directamente';
    RETURN;
  END IF;
  
  -- Si el estado es el mismo que el anterior, incrementar contador
  IF v_last_state.status = p_status THEN
    v_consecutive := v_last_state.consecutive_count + 1;
    v_confirmed := (v_consecutive >= 2); -- Confirmado si se repite 2 veces
    v_should_apply := v_confirmed;
    v_reason := FORMAT('Estado %s confirmado tras %s mediciones consecutivas', 
                      UPPER(p_status), v_consecutive);
  ELSE
    -- Estado cambió, resetear contador
    v_consecutive := 1;
    v_confirmed := FALSE;
    
    -- Evaluar si el cambio debe aplicarse según reglas
    IF v_last_state.status IN ('green', 'green_plus') AND p_status IN ('yellow', 'red') THEN
      -- Cambio de VERDE a AMARILLO/ROJO requiere confirmación
      v_should_apply := FALSE;
      v_reason := FORMAT('Cambio %s → %s requiere confirmación (2 semanas)', 
                        UPPER(v_last_state.status), UPPER(p_status));
    ELSIF v_last_state.status = 'yellow' AND p_status = 'red' THEN
      -- Cambio de AMARILLO a ROJO requiere confirmación
      v_should_apply := FALSE;
      v_reason := FORMAT('Cambio %s → %s requiere confirmación (2 semanas)', 
                        UPPER(v_last_state.status), UPPER(p_status));
    ELSIF p_status IN ('green', 'green_plus') THEN
      -- Mejoras se aplican directamente
      v_should_apply := TRUE;
      v_reason := FORMAT('Mejora de estado %s → %s se aplica directamente', 
                        UPPER(v_last_state.status), UPPER(p_status));
    ELSE
      -- Otros cambios se aplican directamente
      v_should_apply := TRUE;
      v_reason := 'Cambio de estado sin restricciones especiales';
    END IF;
  END IF;
  
  -- Insertar nuevo estado
  INSERT INTO app.icg_ipg_state_history (
    user_id, measurement_date, indicator_type,
    weight_kg, waist_cm, weight_change_kg, waist_change_cm,
    indicator_value, status, consecutive_count, previous_status, status_confirmed
  ) VALUES (
    p_user_id, p_measurement_date, p_indicator_type,
    p_weight_kg, p_waist_cm, p_weight_change, p_waist_change,
    p_indicator_value, p_status, v_consecutive, v_last_state.status, v_confirmed
  )
  RETURNING id INTO v_state_id;
  
  RETURN QUERY SELECT
    v_state_id,
    v_consecutive,
    v_confirmed,
    v_last_state.status,
    v_should_apply,
    v_reason;
END;
$$;


--
-- Name: register_manual_plan_exercises(integer, character varying, jsonb, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.register_manual_plan_exercises(p_user_id integer, p_methodology_type character varying, p_plan_data jsonb, p_methodology_plan_id integer) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    semana JSONB;
    sesion JSONB;
    ejercicio JSONB;
    week_num INTEGER;
BEGIN
    -- Iterar sobre semanas del plan
    FOR semana IN SELECT * FROM jsonb_array_elements(p_plan_data->'semanas')
    LOOP
        week_num := (semana->>'semana')::INTEGER;
        
        -- Iterar sobre sesiones de la semana
        FOR sesion IN SELECT * FROM jsonb_array_elements(semana->'sesiones')
        LOOP
            -- Iterar sobre ejercicios de la sesión
            FOR ejercicio IN SELECT * FROM jsonb_array_elements(sesion->'ejercicios')
            LOOP
                -- Insertar cada ejercicio en el historial manual (como referencia)
                INSERT INTO app.manual_methodology_exercise_history_complete (
                    user_id, methodology_plan_id, exercise_name, exercise_order,
                    methodology_type, generation_mode, series_total, series_completed,
                    repeticiones, intensidad, week_number, day_name,
                    session_date, completed_at
                ) VALUES (
                    p_user_id, p_methodology_plan_id, ejercicio->>'nombre', 0,
                    p_methodology_type, 'manual', 
                    COALESCE((ejercicio->>'series')::INTEGER, 3), 0,
                    ejercicio->>'repeticiones', ejercicio->>'intensidad',
                    week_num, sesion->>'dia', CURRENT_DATE, CURRENT_TIMESTAMP
                );
            END LOOP;
        END LOOP;
    END LOOP;
    
    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;


--
-- Name: register_plan_exercises(integer, character varying, jsonb, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.register_plan_exercises(p_user_id integer, p_methodology_type character varying, p_plan_data jsonb, p_plan_id integer DEFAULT NULL::integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    semana_record JSONB;
    sesion_record JSONB;
    ejercicio_record JSONB;
    semana_num INTEGER;
    dia_nombre VARCHAR(20);
BEGIN
    FOR semana_record IN SELECT * FROM jsonb_array_elements(p_plan_data->'semanas')
    LOOP
        semana_num := (semana_record->>'semana')::INTEGER;
        FOR sesion_record IN SELECT * FROM jsonb_array_elements(semana_record->'sesiones')
        LOOP
            dia_nombre := sesion_record->>'dia';
            FOR ejercicio_record IN SELECT * FROM jsonb_array_elements(sesion_record->'ejercicios')
            LOOP
                INSERT INTO app.exercise_history (
                    user_id, 
                    exercise_name, 
                    methodology_type, 
                    plan_id, 
                    week_number, 
                    day_name
                ) VALUES (
                    p_user_id,
                    ejercicio_record->>'nombre',
                    p_methodology_type,
                    p_plan_id,
                    semana_num,
                    dia_nombre
                ) ON CONFLICT (user_id, exercise_name, plan_id, week_number, day_name) DO NOTHING;
            END LOOP;
        END LOOP;
    END LOOP;
END;
$$;


--
-- Name: register_reevaluation(integer, jsonb); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.register_reevaluation(p_user_id integer, p_evaluation jsonb) RETURNS jsonb
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


--
-- Name: report_problematic_sessions(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.report_problematic_sessions() RETURNS TABLE(session_id integer, user_id integer, status character varying, started_at timestamp without time zone, abandoned_at timestamp without time zone, abandon_reason character varying, hours_since_start numeric, hours_since_abandon numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id as session_id,
        s.user_id,
        s.status,
        s.started_at,
        s.abandoned_at,
        s.abandon_reason,
        ROUND(EXTRACT(EPOCH FROM (NOW() - s.started_at)) / 3600, 2) as hours_since_start,
        ROUND(EXTRACT(EPOCH FROM (NOW() - COALESCE(s.abandoned_at, s.started_at))) / 3600, 2) as hours_since_abandon
    FROM app.home_training_sessions s
    WHERE (
        -- Sesiones en progreso muy antiguas (más de 4 horas)
        (s.status = 'in_progress' AND s.started_at < NOW() - INTERVAL '4 hours')
        OR
        -- Sesiones abandonadas pero no marcadas como tal
        (s.abandoned_at IS NOT NULL AND s.status = 'in_progress' AND s.abandoned_at < NOW() - INTERVAL '1 hour')
    )
    ORDER BY s.started_at DESC;
END;
$$;


--
-- Name: routine_sessions_recalc_totals(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.routine_sessions_recalc_totals(p_session_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Actualizar total_exercises basado en el array de exercises_data
  UPDATE app.routine_sessions 
  SET total_exercises = COALESCE(
    CASE
      WHEN jsonb_typeof(exercises_data::jsonb) = 'array'
        THEN jsonb_array_length(exercises_data::jsonb)
      ELSE 0
    END, 0)
  WHERE id = p_session_id;
  
  -- Actualizar exercises_completed basado en el conteo de routine_exercise_progress completados
  UPDATE app.routine_sessions 
  SET exercises_completed = COALESCE((
    SELECT COUNT(*)::INT
    FROM app.routine_exercise_progress p
    WHERE p.routine_session_id = p_session_id
      AND p.status = 'completed'
  ), 0)
  WHERE id = p_session_id;
END;
$$;


--
-- Name: save_body_composition(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.save_body_composition() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Solo insertar si hay cambios en composición corporal
    IF (NEW.grasa_corporal IS DISTINCT FROM OLD.grasa_corporal) OR
       (NEW.masa_magra IS DISTINCT FROM OLD.masa_magra) OR
       (NEW.agua_corporal IS DISTINCT FROM OLD.agua_corporal) OR
       (NEW.metabolismo_basal IS DISTINCT FROM OLD.metabolismo_basal) OR
       (NEW.peso IS DISTINCT FROM OLD.peso) OR
       (NEW.cintura IS DISTINCT FROM OLD.cintura) OR
       (NEW.cuello IS DISTINCT FROM OLD.cuello) THEN

        INSERT INTO app.body_composition_history (
            user_id, peso, grasa_corporal, masa_magra,
            agua_corporal, metabolismo_basal, cintura, cuello,
            calculation_method, notes
        ) VALUES (
            NEW.id, NEW.peso, NEW.grasa_corporal, NEW.masa_magra,
            NEW.agua_corporal, NEW.metabolismo_basal, NEW.cintura, NEW.cuello,
            'us_navy', 'Actualización automática desde calculadora'
        );
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: save_home_training_rejection_compatible(integer, character varying, character varying, text, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.save_home_training_rejection_compatible(p_user_id integer, p_exercise_name character varying, p_reason character varying, p_comment text DEFAULT NULL::text, p_duration_days integer DEFAULT NULL::integer) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO app.user_exercise_feedback (
        user_id,
        exercise_name,
        methodology_type,
        feedback_type,
        comment,
        avoidance_duration_days,
        expires_at,
        created_at
    ) VALUES (
        p_user_id,
        p_exercise_name,
        'home_training',
        p_reason,
        p_comment,
        p_duration_days,
        CASE
            WHEN p_duration_days IS NOT NULL
            THEN NOW() + (p_duration_days || ' days')::INTERVAL
            ELSE NULL
        END,
        NOW()
    );

    RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;


--
-- Name: save_hypertrophy_set(integer, integer, integer, integer, character varying, integer, numeric, integer, integer, boolean); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.save_hypertrophy_set(p_user_id integer, p_methodology_plan_id integer, p_session_id integer, p_exercise_id integer, p_exercise_name character varying, p_set_number integer, p_weight_used numeric, p_reps_completed integer, p_rir_reported integer, p_is_warmup boolean DEFAULT false) RETURNS jsonb
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


--
-- Name: save_user_feedback(integer, character varying, character varying, character varying, text, integer, numeric); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.save_user_feedback(p_user_id integer, p_exercise_name character varying, p_methodology_type character varying, p_feedback_type character varying, p_comment text DEFAULT NULL::text, p_plan_id integer DEFAULT NULL::integer, p_ai_weight numeric DEFAULT 1.0) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    new_id INTEGER;
BEGIN
    INSERT INTO app.user_exercise_feedback (
        user_id,
        exercise_name,
        methodology_type,
        feedback_type,
        comment,
        plan_id,
        ai_weight,
        created_at
    ) VALUES (
        p_user_id,
        p_exercise_name,
        p_methodology_type,
        p_feedback_type,
        p_comment,
        p_plan_id,
        p_ai_weight,
        NOW()
    ) RETURNING id INTO new_id;

    RETURN new_id;
END;
$$;


--
-- Name: search_playlists_by_name(integer, text); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.search_playlists_by_name(p_user_id integer, search_term text) RETURNS TABLE(id integer, name character varying, track_count integer, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        mp.id,
        mp.name,
        jsonb_array_length(mp.tracks)::INTEGER as track_count,
        mp.created_at,
        mp.updated_at
    FROM app.music_playlists mp
    WHERE mp.user_id = p_user_id
      AND LOWER(mp.name) LIKE LOWER('%' || search_term || '%')
    ORDER BY mp.updated_at DESC;
END;
$$;


--
-- Name: seconds_to_time_format(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.seconds_to_time_format(seconds integer) RETURNS text
    LANGUAGE plpgsql
    AS $$
      DECLARE
        hours INTEGER;
        minutes INTEGER;
        remaining_seconds INTEGER;
      BEGIN
        IF seconds IS NULL OR seconds < 0 THEN
          RETURN '0:00';
        END IF;

        hours := seconds / 3600;
        minutes := (seconds % 3600) / 60;
        remaining_seconds := seconds % 60;

        IF hours > 0 THEN
          RETURN CONCAT(hours, ':', LPAD(minutes::TEXT, 2, '0'), ':', LPAD(remaining_seconds::TEXT, 2, '0'));
        ELSE
          RETURN CONCAT(minutes, ':', LPAD(remaining_seconds::TEXT, 2, '0'));
        END IF;
      END;
      $$;


--
-- Name: session_maintenance(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.session_maintenance() RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    expired_count INTEGER := 0;
    inactive_count INTEGER := 0;
    total_cleaned INTEGER := 0;
BEGIN
    -- 1. Marcar sesiones con JWT expirado como inactivas
    UPDATE app.user_sessions 
    SET is_active = FALSE,
        logout_time = COALESCE(logout_time, NOW()),
        logout_type = COALESCE(logout_type, 'expired'),
        updated_at = NOW()
    WHERE is_active = TRUE 
      AND jwt_expires_at IS NOT NULL 
      AND jwt_expires_at < NOW();
    
    GET DIAGNOSTICS expired_count = ROW_COUNT;
    
    -- 2. Marcar sesiones inactivas por más de 24 horas como expiradas
    UPDATE app.user_sessions 
    SET is_active = FALSE,
        logout_time = COALESCE(logout_time, NOW()),
        logout_type = COALESCE(logout_type, 'timeout'),
        updated_at = NOW()
    WHERE is_active = TRUE 
      AND last_activity < NOW() - INTERVAL '24 hours';
    
    GET DIAGNOSTICS inactive_count = ROW_COUNT;
    
    total_cleaned := expired_count + inactive_count;
    
    -- 3. Log del mantenimiento si hubo limpieza
    IF total_cleaned > 0 THEN
        INSERT INTO app.auth_logs (event_type, metadata, created_at)
        VALUES ('session_maintenance', 
                jsonb_build_object(
                    'expired_sessions', expired_count,
                    'inactive_sessions', inactive_count,
                    'total_cleaned', total_cleaned
                ),
                NOW());
    END IF;
    
    RETURN format('Mantenimiento completado: %s sesiones expiradas, %s inactivas, %s total limpiadas', 
                  expired_count, inactive_count, total_cleaned);
END;
$$;


--
-- Name: set_timestamp(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.set_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END; $$;


--
-- Name: should_reevaluate_phase(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.should_reevaluate_phase(p_user_id integer) RETURNS TABLE(should_reevaluate boolean, reason text, weight_trend character varying, waist_trend character varying, icg_status character varying, days_since_last integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_current_weight DECIMAL;
  v_current_waist DECIMAL;
  v_week_ago_weight DECIMAL;
  v_week_ago_waist DECIMAL;
  v_two_weeks_ago_weight DECIMAL;
  v_two_weeks_ago_waist DECIMAL;
  v_weight_trend VARCHAR(20);
  v_waist_trend VARCHAR(20);
  v_should_eval BOOLEAN := FALSE;
  v_reason TEXT := '';
  v_icg DECIMAL;
  v_icg_status VARCHAR(20) := 'unknown';
BEGIN
  -- Obtener medición actual (última validada)
  SELECT weight_kg, waist_cm INTO v_current_weight, v_current_waist
  FROM app.body_measurements
  WHERE user_id = p_user_id AND is_validated = TRUE
  ORDER BY measurement_date DESC LIMIT 1;

  -- Obtener medición de hace ~7 días
  SELECT weight_kg, waist_cm INTO v_week_ago_weight, v_week_ago_waist
  FROM app.body_measurements
  WHERE user_id = p_user_id
    AND is_validated = TRUE
    AND measurement_date BETWEEN CURRENT_DATE - 9 AND CURRENT_DATE - 5
  ORDER BY measurement_date DESC LIMIT 1;

  -- Obtener medición de hace ~14 días
  SELECT weight_kg, waist_cm INTO v_two_weeks_ago_weight, v_two_weeks_ago_waist
  FROM app.body_measurements
  WHERE user_id = p_user_id
    AND is_validated = TRUE
    AND measurement_date BETWEEN CURRENT_DATE - 16 AND CURRENT_DATE - 12
  ORDER BY measurement_date DESC LIMIT 1;

  -- Si no hay suficientes mediciones, no evaluar
  IF v_current_weight IS NULL OR v_two_weeks_ago_weight IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Faltan mediciones para evaluar tendencia', NULL::VARCHAR, NULL::VARCHAR, NULL::VARCHAR, NULL::INTEGER;
    RETURN;
  END IF;

  -- Calcular tendencias
  IF v_current_weight > v_two_weeks_ago_weight + 0.5 THEN
    v_weight_trend := 'gaining';
  ELSIF v_current_weight < v_two_weeks_ago_weight - 0.5 THEN
    v_weight_trend := 'losing';
  ELSE
    v_weight_trend := 'stable';
  END IF;

  IF v_current_waist > v_two_weeks_ago_waist + 1.0 THEN
    v_waist_trend := 'increasing';
  ELSIF v_current_waist < v_two_weeks_ago_waist - 1.0 THEN
    v_waist_trend := 'decreasing';
  ELSE
    v_waist_trend := 'stable';
  END IF;

  -- Calcular ICG si está ganando peso
  IF v_weight_trend = 'gaining' THEN
    v_icg := (v_current_waist - v_two_weeks_ago_waist) / (v_current_weight - v_two_weeks_ago_weight);

    IF v_icg >= 1.5 THEN
      v_icg_status := 'red';
      v_should_eval := TRUE;
      v_reason := 'ICG >= 1.5 (ganancia de grasa excesiva)';
    ELSIF v_icg >= 1.0 THEN
      v_icg_status := 'yellow';
      v_should_eval := TRUE;
      v_reason := 'ICG >= 1.0 (volumen descontrolado)';
    ELSIF v_icg >= 0.8 THEN
      v_icg_status := 'green';
    ELSE
      v_icg_status := 'green_plus';
    END IF;
  END IF;

  -- Evaluar pérdida de peso con cintura estable (posible pérdida muscular)
  IF v_weight_trend = 'losing' AND v_waist_trend = 'stable' THEN
    v_should_eval := TRUE;
    v_reason := 'Perdiendo peso pero cintura estable - posible pérdida muscular';
  END IF;

  RETURN QUERY SELECT
    v_should_eval,
    v_reason,
    v_weight_trend,
    v_waist_trend,
    v_icg_status,
    (CURRENT_DATE - (SELECT MAX(measurement_date) FROM app.body_measurements WHERE user_id = p_user_id))::INTEGER;
END;
$$;


--
-- Name: should_trigger_metabolic_evaluation(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.should_trigger_metabolic_evaluation(p_user_id integer) RETURNS TABLE(should_evaluate boolean, days_since_last integer, days_until_due integer, last_evaluation_date date)
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: should_trigger_nutrition_calibration(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.should_trigger_nutrition_calibration(p_user_id integer) RETURNS TABLE(should_calibrate boolean, days_since_last integer, last_calibration_date date, next_calibration_date date, reason text)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_config RECORD;
  v_last_calibration_date DATE;
  v_days_since INTEGER;
  v_frequency INTEGER;
BEGIN
  -- Obtener configuración del usuario
  SELECT * INTO v_config
  FROM app.user_calibration_config
  WHERE user_id = p_user_id;

  -- Si no existe configuración, crear con defaults
  IF NOT FOUND THEN
    INSERT INTO app.user_calibration_config (user_id)
    VALUES (p_user_id)
    RETURNING * INTO v_config;
  END IF;

  -- Si auto_calibrate está desactivado
  IF v_config.auto_calibrate = FALSE THEN
    RETURN QUERY SELECT FALSE, NULL::INTEGER, NULL::DATE, NULL::DATE, 'Calibración automática desactivada'::TEXT;
    RETURN;
  END IF;

  v_frequency := COALESCE(v_config.calibration_frequency_days, 14);

  -- Obtener última calibración
  SELECT calibration_date INTO v_last_calibration_date
  FROM app.nutrition_calibrations
  WHERE user_id = p_user_id
  ORDER BY calibration_date DESC
  LIMIT 1;

  -- Si nunca ha calibrado, debe calibrar
  IF v_last_calibration_date IS NULL THEN
    RETURN QUERY SELECT TRUE, NULL::INTEGER, NULL::DATE, CURRENT_DATE, 'Primera calibración'::TEXT;
    RETURN;
  END IF;

  -- Calcular días desde última calibración
  v_days_since := CURRENT_DATE - v_last_calibration_date;

  -- Verificar si toca calibración
  IF v_days_since >= v_frequency THEN
    RETURN QUERY SELECT 
      TRUE,
      v_days_since,
      v_last_calibration_date,
      v_last_calibration_date + v_frequency,
      FORMAT('Han pasado %s días desde la última calibración (frecuencia: %s días)', v_days_since, v_frequency);
  ELSE
    RETURN QUERY SELECT 
      FALSE,
      v_days_since,
      v_last_calibration_date,
      v_last_calibration_date + v_frequency,
      FORMAT('Próxima calibración en %s días', v_frequency - v_days_since);
  END IF;
END;
$$;


--
-- Name: should_trigger_re_evaluation(integer, integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.should_trigger_re_evaluation(p_user_id integer, p_methodology_plan_id integer, p_current_week integer) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: sync_methodology_exercise_progress(integer, character varying, character varying, integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.sync_methodology_exercise_progress(p_methodology_session_id integer, p_exercise_name character varying, p_status character varying DEFAULT 'pending'::character varying, p_series_completed integer DEFAULT 0, p_series_total integer DEFAULT 0) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
    DECLARE
        v_progress_id INTEGER;
        v_series_total INTEGER;
        v_order INTEGER;
        v_status TEXT := lower(p_status);
    BEGIN
        -- Validar estado permitido
        IF v_status NOT IN ('pending','in_progress','completed','skipped','cancelled') THEN
            RAISE NOTICE 'Estado % inválido. Debe ser pending|in_progress|completed|skipped|cancelled.', v_status;
            RETURN FALSE;
        END IF;
        
        -- Buscar progreso existente
        SELECT id, exercise_order, series_total
        INTO v_progress_id, v_order, v_series_total
        FROM app.methodology_exercise_progress
        WHERE methodology_session_id = p_methodology_session_id
        AND exercise_name = p_exercise_name;
        
        IF v_progress_id IS NULL THEN
            -- Asignar el siguiente exercise_order disponible
            SELECT COALESCE(MAX(exercise_order) + 1, 0)
            INTO v_order
            FROM app.methodology_exercise_progress
            WHERE methodology_session_id = p_methodology_session_id;
            
            -- Crear nuevo registro
            INSERT INTO app.methodology_exercise_progress (
                methodology_session_id, exercise_name, exercise_order,
                status, series_completed, series_total
            ) VALUES (
                p_methodology_session_id, p_exercise_name, v_order,
                v_status, COALESCE(p_series_completed, 0), COALESCE(p_series_total, 0)
            );
        ELSE
            -- Actualizar progreso existente
            UPDATE app.methodology_exercise_progress
            SET 
                series_completed = LEAST(GREATEST(COALESCE(p_series_completed, 0), 0), COALESCE(p_series_total, v_series_total, 0)),
                series_total = COALESCE(p_series_total, v_series_total, 0),
                status = v_status,
                updated_at = NOW()
            WHERE id = v_progress_id;
        END IF;
        
        RETURN TRUE;
    END;
    $$;


--
-- Name: sync_routine_to_methodology_progress(integer, integer, character varying, integer, character varying, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.sync_routine_to_methodology_progress(p_user_id integer, p_methodology_plan_id integer, p_exercise_name character varying, p_series_completed integer, p_status character varying, p_time_spent_seconds integer DEFAULT NULL::integer) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_session_id INTEGER;
    v_progress_id INTEGER;
    v_series_total INTEGER;
    v_order INTEGER;
    v_status TEXT := lower(p_status);
BEGIN
    IF v_status NOT IN ('pending','in_progress','completed','skipped','cancelled') THEN
        RAISE NOTICE 'Estado % inválido para methodology_exercise_progress', v_status;
        RETURN FALSE;
    END IF;
    SELECT id INTO v_session_id
    FROM app.methodology_exercise_sessions
    WHERE user_id = p_user_id
      AND methodology_plan_id = p_methodology_plan_id
      AND session_status IN ('pending', 'in_progress')
    ORDER BY COALESCE(started_at, created_at) DESC
    LIMIT 1;
    IF v_session_id IS NULL THEN
        RETURN FALSE;
    END IF;
    SELECT id, series_total
      INTO v_progress_id, v_series_total
    FROM app.methodology_exercise_progress
    WHERE methodology_session_id = v_session_id
      AND user_id = p_user_id
      AND exercise_name = p_exercise_name
    LIMIT 1;
    IF v_progress_id IS NULL THEN
        SELECT COALESCE(MAX(exercise_order) + 1, 0)
          INTO v_order
        FROM app.methodology_exercise_progress
        WHERE methodology_session_id = v_session_id;
        v_series_total := GREATEST(COALESCE(p_series_completed,0), 1);
        INSERT INTO app.methodology_exercise_progress (
            methodology_session_id,
            user_id,
            exercise_name,
            exercise_order,
            series_total,
            repeticiones,
            descanso_seg,
            intensidad,
            series_completed,
            status,
            time_spent_seconds,
            started_at,
            completed_at
        ) VALUES (
            v_session_id,
            p_user_id,
            p_exercise_name,
            v_order,
            v_series_total,
            '8-10',      -- por defecto
            90,          -- por defecto
            'RPE 8',     -- por defecto
            LEAST(GREATEST(COALESCE(p_series_completed,0), 0), v_series_total),
            v_status,
            p_time_spent_seconds,
            CASE WHEN v_status IN ('in_progress','completed') THEN NOW() ELSE NULL END,
            CASE WHEN v_status = 'completed' THEN NOW() ELSE NULL END
        );
    ELSE
        UPDATE app.methodology_exercise_progress
            status             = v_status,
            time_spent_seconds = COALESCE(p_time_spent_seconds, time_spent_seconds),
            started_at         = CASE 
                                   WHEN v_status IN ('in_progress','completed') AND started_at IS NULL 
                                   THEN NOW() 
                                   ELSE started_at 
                                 END,
            completed_at       = CASE 
                                   WHEN v_status = 'completed' AND completed_at IS NULL 
                                   THEN NOW() 
                                   ELSE completed_at 
                                 END,
            updated_at         = NOW()
        WHERE id = v_progress_id;
    END IF;
    RETURN TRUE;
END;
$$;


--
-- Name: tg_set_updated_at(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.tg_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


--
-- Name: tg_set_updated_at_calistenia(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.tg_set_updated_at_calistenia() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: tg_set_updated_at_ejercicios_calistenia(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.tg_set_updated_at_ejercicios_calistenia() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END; $$;


--
-- Name: tg_set_updated_at_exercise_ai(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.tg_set_updated_at_exercise_ai() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END; $$;


--
-- Name: tg_set_updated_at_hipertrofia(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.tg_set_updated_at_hipertrofia() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END; $$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: transition_beginner_to_intermediate(integer, integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.transition_beginner_to_intermediate(p_user_id integer, p_methodology_plan_id integer, p_current_week integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_user_level VARCHAR;
  v_week INTEGER;
  v_plan_data JSONB;
  v_baseline JSONB := '[]'::jsonb;
  v_triggered BOOLEAN := FALSE;
BEGIN
  SELECT nivel_entrenamiento
  INTO v_user_level
  FROM app.users
  WHERE id = p_user_id;

  IF COALESCE(v_user_level, 'Principiante') <> 'Principiante' THEN
    RETURN jsonb_build_object('triggered', false, 'reason', 'user_not_beginner');
  END IF;

  SELECT current_week, plan_data
  INTO v_week, v_plan_data
  FROM app.methodology_plans
  WHERE id = p_methodology_plan_id;

  v_week := COALESCE(p_current_week, v_week, 1);

  IF v_week < 12 THEN
    RETURN jsonb_build_object('triggered', false, 'reason', 'week_below_threshold', 'current_week', v_week);
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'exercise_id', exercise_id,
        'exercise_name', exercise_name,
        'target_weight_next_cycle', target_weight_next_cycle,
        'last_adjustment', last_adjustment
      )
    ),
    '[]'::jsonb
  )
  INTO v_baseline
  FROM app.hypertrophy_progression
  WHERE user_id = p_user_id;

  UPDATE app.users
  SET nivel_entrenamiento = 'Intermedio'
  WHERE id = p_user_id;

  v_plan_data := jsonb_set(COALESCE(v_plan_data, '{}'::jsonb), '{transitioned_to_intermediate}', 'true'::jsonb, TRUE);

  UPDATE app.methodology_plans
  SET plan_data = v_plan_data,
      updated_at = NOW()
  WHERE id = p_methodology_plan_id;

  INSERT INTO app.mindfeed_transition_events (
    user_id,
    methodology_plan_id,
    source_block,
    target_block,
    action,
    reason,
    baseline,
    metadata
  ) VALUES (
    p_user_id,
    p_methodology_plan_id,
    'hypertrophy_beginner',
    'hypertrophy_intermediate',
    'advance',
    'week_12_threshold',
    v_baseline,
    jsonb_build_object('current_week', v_week)
  );

  v_triggered := TRUE;

  RETURN jsonb_build_object(
    'triggered', v_triggered,
    'current_week', v_week,
    'new_level', 'Intermedio'
  );
END;
$$;


--
-- Name: transition_to_hypertrophy(integer, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.transition_to_hypertrophy(p_user_id integer, p_adaptation_block_id integer) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_adaptation_block RECORD;
  v_evaluation JSONB;
  v_all_criteria_met BOOLEAN := FALSE;
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
  v_all_criteria_met := COALESCE((v_evaluation->>'all_criteria_met')::BOOLEAN, FALSE);

  -- Si no cumple criterios: repetir con penalización
  IF v_all_criteria_met = FALSE THEN
    UPDATE app.adaptation_blocks
    SET
      repeat_required = TRUE,
      repeat_penalty_pct = 10,
      progression_cap_pct = 2,
      repeat_count = repeat_count + 1,
      repeat_reason = 'criteria_not_met',
      repeat_requested_at = NOW(),
      updated_at = NOW()
    WHERE id = p_adaptation_block_id;

    INSERT INTO app.mindfeed_transition_events (
      user_id,
      methodology_plan_id,
      source_block,
      target_block,
      action,
      reason,
      baseline,
      metadata
    ) VALUES (
      p_user_id,
      v_adaptation_block.methodology_plan_id,
      'adaptation',
      'adaptation',
      'repeat',
      'criteria_not_met',
      COALESCE(v_evaluation, '{}'::jsonb),
      jsonb_build_object(
        'repeat_penalty_pct', 10,
        'progression_cap_pct', 2
      )
    );

    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Not all criteria met for transition',
      'evaluation', v_evaluation,
      'repeat_required', TRUE,
      'repeat_penalty_pct', 10,
      'progression_cap_pct', 2
    );
  END IF;

  -- Si cumple criterios: completar bloque y transicionar
  UPDATE app.adaptation_blocks
  SET
    status = 'completed',
    completed_at = NOW(),
    transitioned_to_hypertrophy = TRUE,
    repeat_required = FALSE,
    repeat_penalty_pct = 0,
    progression_cap_pct = 2.5,
    repeat_reason = NULL,
    repeat_requested_at = NULL,
    updated_at = NOW()
  WHERE id = p_adaptation_block_id;

  INSERT INTO app.mindfeed_transition_events (
    user_id,
    methodology_plan_id,
    source_block,
    target_block,
    action,
    reason,
    baseline,
    metadata
  ) VALUES (
    p_user_id,
    v_adaptation_block.methodology_plan_id,
    'adaptation',
    'hypertrophy_beginner',
    'advance',
    'criteria_met',
    COALESCE(v_evaluation, '{}'::jsonb),
    jsonb_build_object('adaptation_block_id', p_adaptation_block_id)
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Adaptation block completed successfully',
    'adaptation_block_id', p_adaptation_block_id,
    'ready_for_d1d5', TRUE,
    'evaluation', v_evaluation
  );
END;
$$;


--
-- Name: transition_to_hypertrophy(uuid, uuid); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.transition_to_hypertrophy(p_user_id uuid, p_block_id uuid) RETURNS TABLE(transition_to_hypertrophy jsonb)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_block app.adaptation_blocks%ROWTYPE;
BEGIN
    -- Obtener bloque
    SELECT * INTO v_block FROM app.adaptation_blocks WHERE id = p_block_id AND user_id = p_user_id;
    
    IF NOT FOUND THEN
        transition_to_hypertrophy := jsonb_build_object('success', false, 'error', 'Bloque no encontrado');
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Marcar como completado
    UPDATE app.adaptation_blocks SET status = 'completed', updated_at = NOW() WHERE id = p_block_id;
    
    transition_to_hypertrophy := jsonb_build_object(
        'success', true,
        'message', 'Transición exitosa',
        'evaluation', jsonb_build_object('status', 'completed')
    );
    RETURN NEXT;
END;
$$;


--
-- Name: trg_progress_update_session_counters(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.trg_progress_update_session_counters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_sess_id INT;
  v_delta   INT := 0;
BEGIN
  v_sess_id := COALESCE(NEW.routine_session_id, OLD.routine_session_id);
  IF (TG_OP = 'INSERT') THEN
    IF NEW.status = 'completed' THEN
      v_delta := 1;
    END IF;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
      v_delta := 1;
    ELSIF OLD.status = 'completed' AND (NEW.status IS DISTINCT FROM 'completed') THEN
      v_delta := -1;
    ELSE
      v_delta := 0;
    END IF;
  ELSIF (TG_OP = 'DELETE') THEN
    IF OLD.status = 'completed' THEN
      v_delta := -1;
    END IF;
  END IF;
  IF v_delta <> 0 THEN
    UPDATE app.routine_sessions s
        updated_at = NOW()
    WHERE s.id = v_sess_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: trg_routine_sessions_exercises_data_changed(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.trg_routine_sessions_exercises_data_changed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (NEW.exercises_data IS DISTINCT FROM OLD.exercises_data) THEN
    PERFORM app.routine_sessions_recalc_totals(NEW.id);
    BEGIN
      NEW.updated_at := NOW();
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trigger_update_12_combinations_history(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.trigger_update_12_combinations_history() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    plan_info RECORD;
BEGIN
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status <> 'completed') THEN
        SELECT 
            hts.user_id,
            htp.equipment_type,
            htp.training_type,
            htp.id AS plan_id,
            hts.id AS session_id
        INTO plan_info
        FROM app.home_training_sessions hts
        JOIN app.home_training_plans    htp ON hts.home_training_plan_id = htp.id
        WHERE hts.id = NEW.home_training_session_id;
        IF FOUND THEN
            PERFORM app.register_exercise_for_combination(
                plan_info.user_id,
                plan_info.equipment_type,
                plan_info.training_type,
                NEW.exercise_name,
                plan_info.session_id,
                plan_info.plan_id,
                NULL  -- rating se captura aparte por feedback
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: trigger_update_combination_history(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.trigger_update_combination_history() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    plan_info RECORD;
    user_id_val INTEGER;
BEGIN
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        SELECT 
            hts.user_id,
            htp.equipment_type,
            htp.training_type,
            htp.id as plan_id
        INTO plan_info
        FROM app.home_training_sessions hts
        JOIN app.home_training_plans htp ON hts.home_training_plan_id = htp.id
        WHERE hts.id = NEW.home_training_session_id;
        IF FOUND THEN
            PERFORM app.register_combination_exercise_usage(
                plan_info.user_id,
                plan_info.equipment_type,
                plan_info.training_type,
                NEW.exercise_name,
                NEW.home_training_session_id,
                plan_info.plan_id
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: update_body_measurements_timestamp(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_body_measurements_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_bridge_timestamp(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_bridge_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_crossfit_updated_at(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_crossfit_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_daily_nutrition_log_updated_at(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_daily_nutrition_log_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_deviation_timestamp(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_deviation_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_exercise_ai_info(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_exercise_ai_info() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        NEW.updated_at = NOW();
        -- Normalize exercise name when inserting/updating
        IF NEW.exercise_name_normalized IS NULL OR NEW.exercise_name_normalized = '' THEN
          NEW.exercise_name_normalized = app.normalize_exercise_name(NEW.exercise_name);
        END IF;
        RETURN NEW;
      END;
      $$;


--
-- Name: update_exercise_name_row(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_exercise_name_row() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.exercise_name_normalized := app.normalize_exercise_name(NEW.exercise_name);
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_exercise_progression(integer, bigint, character varying); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_exercise_progression(p_user_id integer, p_exercise_id bigint, p_exercise_name character varying) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_best_pr DECIMAL;
  v_avg_rir DECIMAL;
  v_total_volume DECIMAL;
  v_sessions INT;
  v_adjustment VARCHAR;
  v_target_weight DECIMAL;
BEGIN
  -- Obtener estadísticas de las últimas 3 sesiones
  SELECT
    MAX(estimated_1rm),
    AVG(rir_reported),
    SUM(volume_load),
    COUNT(DISTINCT session_id)
  INTO
    v_best_pr,
    v_avg_rir,
    v_total_volume,
    v_sessions
  FROM app.hypertrophy_set_logs
  WHERE user_id = p_user_id
    AND exercise_id = p_exercise_id
    AND created_at > NOW() - INTERVAL '21 days';  -- Últimas 3 semanas

  -- Determinar ajuste
  v_adjustment := app.determine_adjustment(COALESCE(v_avg_rir, 2.5));

  -- Calcular peso objetivo
  v_target_weight := app.calculate_target_weight_80(COALESCE(v_best_pr, 0));

  -- Insertar o actualizar
  INSERT INTO app.hypertrophy_progression (
    user_id,
    exercise_id,
    exercise_name,
    current_pr,
    target_weight_80,
    last_adjustment,
    adjustment_date,
    total_volume_accumulated,
    last_rir_average,
    sessions_count,
    updated_at
  ) VALUES (
    p_user_id,
    p_exercise_id,
    p_exercise_name,
    v_best_pr,
    v_target_weight,
    v_adjustment,
    NOW(),
    v_total_volume,
    v_avg_rir,
    v_sessions,
    NOW()
  )
  ON CONFLICT (user_id, exercise_id)
  DO UPDATE SET
    current_pr = GREATEST(EXCLUDED.current_pr, hypertrophy_progression.current_pr),
    target_weight_80 = EXCLUDED.target_weight_80,
    last_adjustment = EXCLUDED.last_adjustment,
    adjustment_date = EXCLUDED.adjustment_date,
    total_volume_accumulated = hypertrophy_progression.total_volume_accumulated + EXCLUDED.total_volume_accumulated,
    last_rir_average = EXCLUDED.last_rir_average,
    sessions_count = EXCLUDED.sessions_count,
    updated_at = NOW();
END;
$$;


--
-- Name: update_feedback_timestamp(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_feedback_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_hipertrofia_v2_state_timestamp(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_hipertrofia_v2_state_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_hypertrophy_progression(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_hypertrophy_progression() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO app.hypertrophy_progression (
    user_id, exercise_id, exercise_name, current_pr, target_weight_80,
    last_rir_average, sessions_count, updated_at
  )
  VALUES (
    NEW.user_id,
    NEW.exercise_id,
    NEW.exercise_name,
    NEW.estimated_1rm,
    ROUND(NEW.estimated_1rm * 0.8, 2),
    NEW.rir_reported,
    1,
    NOW()
  )
  ON CONFLICT (user_id, exercise_id) 
  DO UPDATE SET
    current_pr = GREATEST(hypertrophy_progression.current_pr, EXCLUDED.current_pr),
    target_weight_80 = ROUND(GREATEST(hypertrophy_progression.current_pr, EXCLUDED.current_pr) * 0.8, 2),
    last_rir_average = (hypertrophy_progression.last_rir_average + EXCLUDED.last_rir_average) / 2,
    sessions_count = hypertrophy_progression.sessions_count + 1,
    updated_at = NOW();
  
  RETURN NEW;
END;
$$;


--
-- Name: update_last_calibration_on_apply(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_last_calibration_on_apply() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.applied = TRUE AND OLD.applied = FALSE THEN
    UPDATE app.user_calibration_config
    SET last_calibration_date = NEW.calibration_date,
        next_calibration_date = NEW.calibration_date + calibration_frequency_days
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_manual_methodology_session_counters(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_manual_methodology_session_counters() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Actualizar contadores de la sesión
    UPDATE app.manual_methodology_exercise_sessions 
    SET 
        exercises_completed = (
            SELECT COUNT(*) 
            FROM app.manual_methodology_exercise_progress 
            WHERE manual_methodology_session_id = COALESCE(NEW.manual_methodology_session_id, OLD.manual_methodology_session_id)
            AND status = 'completed'
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = COALESCE(NEW.manual_methodology_session_id, OLD.manual_methodology_session_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_measurement_timestamp(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_measurement_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_metabolic_timestamp(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_metabolic_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_methodology_session_progress(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_methodology_session_progress() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE app.methodology_exercise_sessions 
    SET 
        exercises_completed = (
            SELECT COUNT(*) 
            FROM app.methodology_exercise_progress 
            WHERE methodology_session_id = NEW.methodology_session_id 
              AND status = 'completed'
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.methodology_session_id;
    RETURN NEW;
END;
$$;


--
-- Name: update_mindfeed_rulesets_updated_at(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_mindfeed_rulesets_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_music_playlists_updated_at(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_music_playlists_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_next_calibration_date(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_next_calibration_date() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.calibration_frequency_days IS DISTINCT FROM OLD.calibration_frequency_days OR
     NEW.last_calibration_date IS DISTINCT FROM OLD.last_calibration_date THEN
    
    IF NEW.last_calibration_date IS NOT NULL THEN
      NEW.next_calibration_date := NEW.last_calibration_date + NEW.calibration_frequency_days;
    ELSE
      NEW.next_calibration_date := CURRENT_DATE + NEW.calibration_frequency_days;
    END IF;
  END IF;
  
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_nutrition_plans_updated_at(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_nutrition_plans_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_policy_timestamp(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_policy_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: update_re_eval_config_timestamp(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_re_eval_config_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_rejection_timestamp(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_rejection_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$;


--
-- Name: update_routine_exercise_progress(integer, integer, integer, character varying, integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_routine_exercise_progress(p_routine_session_id integer, p_exercise_order integer, p_series_completed integer, p_status character varying DEFAULT NULL::character varying, p_time_spent integer DEFAULT NULL::integer) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    current_status VARCHAR;
BEGIN
    SELECT status INTO current_status 
    FROM app.routine_exercise_progress 
    WHERE routine_session_id = p_routine_session_id 
        AND exercise_order = p_exercise_order;
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    UPDATE app.routine_exercise_progress 
    SET 
        series_completed = GREATEST(series_completed, p_series_completed),
        status = COALESCE(p_status, status),
        time_spent_seconds = COALESCE(p_time_spent, time_spent_seconds),
        started_at = CASE 
            WHEN started_at IS NULL AND p_status IN ('in_progress', 'completed') 
            THEN CURRENT_TIMESTAMP 
            ELSE started_at 
        END,
        completed_at = CASE 
            WHEN p_status = 'completed' 
            THEN CURRENT_TIMESTAMP 
            ELSE completed_at 
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE routine_session_id = p_routine_session_id 
        AND exercise_order = p_exercise_order;
    RETURN TRUE;
END;
$$;


--
-- Name: update_routine_timestamp(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_routine_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: update_session_date_fields(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_session_date_fields() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        -- Actualizar automáticamente los campos de fecha cuando se inserta o actualiza session_date
        IF NEW.session_date IS NOT NULL THEN
          NEW.day_of_month := EXTRACT(DAY FROM NEW.session_date);
          NEW.month_number := EXTRACT(MONTH FROM NEW.session_date);
          NEW.year_number := EXTRACT(YEAR FROM NEW.session_date);

          -- Obtener nombre del mes en español
          NEW.month_name := CASE EXTRACT(MONTH FROM NEW.session_date)
            WHEN 1 THEN 'enero'
            WHEN 2 THEN 'febrero'
            WHEN 3 THEN 'marzo'
            WHEN 4 THEN 'abril'
            WHEN 5 THEN 'mayo'
            WHEN 6 THEN 'junio'
            WHEN 7 THEN 'julio'
            WHEN 8 THEN 'agosto'
            WHEN 9 THEN 'septiembre'
            WHEN 10 THEN 'octubre'
            WHEN 11 THEN 'noviembre'
            WHEN 12 THEN 'diciembre'
          END;
        END IF;

        RETURN NEW;
      END;
      $$;


--
-- Name: update_session_stats(integer); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_session_stats(p_session_id integer) RETURNS void
    LANGUAGE plpgsql
    AS $$
      BEGIN
        UPDATE app.methodology_exercise_sessions SET
          exercises_completed = (
            SELECT COUNT(*) FROM app.methodology_exercise_progress
            WHERE methodology_session_id = p_session_id AND status = 'completed'
          ),
          exercises_skipped = (
            SELECT COUNT(*) FROM app.methodology_exercise_progress
            WHERE methodology_session_id = p_session_id AND status = 'skipped'
          ),
          exercises_cancelled = (
            SELECT COUNT(*) FROM app.methodology_exercise_progress
            WHERE methodology_session_id = p_session_id AND status = 'cancelled'
          ),
          exercises_in_progress = (
            SELECT COUNT(*) FROM app.methodology_exercise_progress
            WHERE methodology_session_id = p_session_id AND status = 'in_progress'
          ),
          updated_at = NOW()
        WHERE id = p_session_id;
      END;
      $$;


--
-- Name: update_session_time_on_exercise_change(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_session_time_on_exercise_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
      BEGIN
        -- Actualizar tiempo total de la sesión cuando cambia un ejercicio
        PERFORM app.calculate_session_total_time(NEW.methodology_session_id);
        RETURN NEW;
      END;
      $$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_session(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_updated_at_session() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_user_profiles_updated_at(); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.update_user_profiles_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: validate_metabolic_profile_change(integer, character varying, character varying); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.validate_metabolic_profile_change(p_user_id integer, p_new_profile character varying, p_confidence character varying) RETURNS TABLE(can_change boolean, applied_profile character varying, reason text, consecutive_count integer, needs_confirmation boolean)
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: validate_waist_measurement(integer, numeric, numeric); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.validate_waist_measurement(p_user_id integer, p_new_waist_cm numeric, p_new_weight_kg numeric) RETURNS TABLE(is_suspicious boolean, reason text, should_repeat boolean, previous_value numeric, waist_change numeric, weight_change numeric)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_prev_waist DECIMAL(5,2);
  v_prev_weight DECIMAL(5,2);
  v_prev_date DATE;
  v_days_diff INTEGER;
  v_waist_change DECIMAL(5,2);
  v_weight_change DECIMAL(5,2);
  v_expected_weight_change DECIMAL(5,2);
BEGIN
  SELECT waist_cm, weight_kg, measurement_date
  INTO v_prev_waist, v_prev_weight, v_prev_date
  FROM app.body_measurements
  WHERE user_id = p_user_id
  AND waist_cm IS NOT NULL
  AND measurement_date >= CURRENT_DATE - INTERVAL '7 days'
  AND is_validated = TRUE
  ORDER BY measurement_date DESC
  LIMIT 1;

  IF v_prev_waist IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, FALSE, NULL::DECIMAL(5,2), NULL::DECIMAL(5,2), NULL::DECIMAL(5,2);
    RETURN;
  END IF;

  v_days_diff := CURRENT_DATE - v_prev_date;
  v_waist_change := ABS(p_new_waist_cm - v_prev_waist);
  v_weight_change := ABS(p_new_weight_kg - v_prev_weight);

  IF v_waist_change > 2.5 THEN
    v_expected_weight_change := (v_waist_change / 2.5) * 0.5;

    IF v_weight_change < (v_expected_weight_change * 0.5) THEN
      RETURN QUERY SELECT 
        TRUE,
        FORMAT('Cambio de cintura de %.1f cm en %s días sin cambio proporcional de peso (%.1f kg)', 
               v_waist_change, v_days_diff, v_weight_change),
        TRUE,
        v_prev_waist,
        v_waist_change,
        v_weight_change;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT FALSE, NULL::TEXT, FALSE, v_prev_waist, v_waist_change, v_weight_change;
END;
$$;


--
-- Name: validate_weight_change(integer, numeric, numeric); Type: FUNCTION; Schema: app; Owner: -
--

CREATE FUNCTION app.validate_weight_change(p_user_id integer, p_new_weight_kg numeric, p_new_waist_cm numeric DEFAULT NULL::numeric) RETURNS TABLE(is_suspicious boolean, reason text, should_repeat boolean, previous_weight numeric, weight_change_kg numeric, days_diff integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_prev_weight DECIMAL(5,2);
  v_prev_waist DECIMAL(5,2);
  v_prev_date DATE;
  v_days_diff INTEGER;
  v_weight_change DECIMAL(5,2);
  v_waist_change DECIMAL(5,2);
BEGIN
  SELECT weight_kg, waist_cm, measurement_date
  INTO v_prev_weight, v_prev_waist, v_prev_date
  FROM app.body_measurements
  WHERE user_id = p_user_id
  AND measurement_date >= CURRENT_DATE - INTERVAL '7 days'
  AND is_validated = TRUE
  ORDER BY measurement_date DESC
  LIMIT 1;

  IF v_prev_weight IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, FALSE, NULL::DECIMAL(5,2), NULL::DECIMAL(5,2), NULL::INTEGER;
    RETURN;
  END IF;

  v_days_diff := CURRENT_DATE - v_prev_date;
  v_weight_change := ABS(p_new_weight_kg - v_prev_weight);

  IF v_weight_change > 3.0 AND v_days_diff <= 7 THEN
    IF p_new_waist_cm IS NOT NULL AND v_prev_waist IS NOT NULL THEN
      v_waist_change := ABS(p_new_waist_cm - v_prev_waist);

      IF v_waist_change < 1.0 THEN
        RETURN QUERY SELECT 
          TRUE,
          FORMAT('Cambio de peso de %.1f kg en %s días sin cambio proporcional de cintura (%.1f cm)', 
                 v_weight_change, v_days_diff, v_waist_change),
          TRUE,
          v_prev_weight,
          v_weight_change,
          v_days_diff;
        RETURN;
      END IF;
    ELSE
      RETURN QUERY SELECT 
        TRUE,
        FORMAT('Cambio de peso muy rápido: %.1f kg en %s días - Verificar medición', 
               v_weight_change, v_days_diff),
        TRUE,
        v_prev_weight,
        v_weight_change,
        v_days_diff;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT FALSE, NULL::TEXT, FALSE, v_prev_weight, v_weight_change, v_days_diff;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Ejercicios_Bomberos; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app."Ejercicios_Bomberos" (
    exercise_id integer NOT NULL,
    nombre character varying(200) NOT NULL,
    nivel character varying(50) NOT NULL,
    categoria character varying(100) NOT NULL,
    tipo_prueba character varying(100),
    baremo_hombres character varying(150),
    baremo_mujeres character varying(150),
    series_reps_objetivo character varying(50),
    intensidad character varying(50),
    descanso_seg integer,
    equipamiento character varying(200),
    notas text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    ejecucion text,
    consejos text,
    errores_evitar text,
    gif_url text
);


--
-- Name: Ejercicios_Bomberos_exercise_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app."Ejercicios_Bomberos_exercise_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Ejercicios_Bomberos_exercise_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app."Ejercicios_Bomberos_exercise_id_seq" OWNED BY app."Ejercicios_Bomberos".exercise_id;


--
-- Name: Ejercicios_CrossFit; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app."Ejercicios_CrossFit" (
    exercise_id integer NOT NULL,
    nombre character varying(200) NOT NULL,
    nivel character varying(50) NOT NULL,
    dominio character varying(100) NOT NULL,
    categoria character varying(100),
    equipamiento character varying(200),
    tipo_wod character varying(100),
    intensidad character varying(50),
    duracion_seg integer,
    descanso_seg integer DEFAULT 60,
    escalamiento text,
    notas text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    "Cómo_hacerlo" text,
    "Consejos" text,
    "Errores_comunes" text,
    alias text,
    featured integer DEFAULT 0,
    supports_strength_block integer DEFAULT 0,
    counts_as_movement integer DEFAULT 1,
    wod_types text,
    time_domain text,
    pairing_tags text,
    avoid_pairing_with text,
    is_benchmark integer DEFAULT 0,
    rx_carga_sugerida text,
    synonyms text,
    gif_url text,
    CONSTRAINT "Ejercicios_CrossFit_dominio_check" CHECK (((dominio)::text = ANY (ARRAY[('Gymnastic'::character varying)::text, ('Weightlifting'::character varying)::text, ('Monostructural'::character varying)::text, ('Accesorios'::character varying)::text]))),
    CONSTRAINT "Ejercicios_CrossFit_nivel_check" CHECK (((nivel)::text = ANY (ARRAY[('Principiante'::character varying)::text, ('Intermedio'::character varying)::text, ('Avanzado'::character varying)::text, ('Elite'::character varying)::text])))
);


--
-- Name: Ejercicios_CrossFit_exercise_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app."Ejercicios_CrossFit_exercise_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Ejercicios_CrossFit_exercise_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app."Ejercicios_CrossFit_exercise_id_seq" OWNED BY app."Ejercicios_CrossFit".exercise_id;


--
-- Name: Ejercicios_Guardia_Civil; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app."Ejercicios_Guardia_Civil" (
    exercise_id integer NOT NULL,
    nombre character varying(200) NOT NULL,
    nivel character varying(50) NOT NULL,
    categoria character varying(100) NOT NULL,
    tipo_prueba character varying(100),
    baremo_hombres character varying(150),
    baremo_mujeres character varying(150),
    series_reps_objetivo character varying(50),
    intensidad character varying(50),
    descanso_seg integer,
    equipamiento character varying(200),
    notas text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    ejecucion text,
    consejos text,
    errores_evitar text,
    gif_url text
);


--
-- Name: Ejercicios_Guardia_Civil_exercise_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app."Ejercicios_Guardia_Civil_exercise_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Ejercicios_Guardia_Civil_exercise_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app."Ejercicios_Guardia_Civil_exercise_id_seq" OWNED BY app."Ejercicios_Guardia_Civil".exercise_id;


--
-- Name: Ejercicios_Policia_Local; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app."Ejercicios_Policia_Local" (
    exercise_id integer NOT NULL,
    nombre character varying(200) NOT NULL,
    nivel character varying(50) NOT NULL,
    categoria character varying(100) NOT NULL,
    tipo_prueba character varying(100),
    baremo_hombres character varying(150),
    baremo_mujeres character varying(150),
    series_reps_objetivo character varying(50),
    intensidad character varying(50),
    descanso_seg integer,
    equipamiento character varying(200),
    notas text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    ejecucion text,
    consejos text,
    errores_evitar text,
    gif_url text
);


--
-- Name: Ejercicios_Policia_Local_exercise_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app."Ejercicios_Policia_Local_exercise_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Ejercicios_Policia_Local_exercise_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app."Ejercicios_Policia_Local_exercise_id_seq" OWNED BY app."Ejercicios_Policia_Local".exercise_id;


--
-- Name: Ejercicios_Policia_Nacional; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app."Ejercicios_Policia_Nacional" (
    exercise_id integer NOT NULL,
    nombre character varying NOT NULL,
    nivel character varying NOT NULL,
    categoria character varying NOT NULL,
    tipo_prueba character varying,
    baremo_hombres character varying,
    baremo_mujeres character varying,
    series_reps_objetivo character varying,
    intensidad character varying,
    descanso_seg integer,
    equipamiento character varying,
    notas text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    ejecucion text,
    consejos text,
    errores_evitar text,
    gif_url text
);


--
-- Name: Ejercicios_Policia_Nacional_exercise_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app."Ejercicios_Policia_Nacional_exercise_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Ejercicios_Policia_Nacional_exercise_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app."Ejercicios_Policia_Nacional_exercise_id_seq" OWNED BY app."Ejercicios_Policia_Nacional".exercise_id;


--
-- Name: adaptation_blocks; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.adaptation_blocks (
    id integer NOT NULL,
    user_id integer NOT NULL,
    methodology_plan_id integer,
    block_type character varying(20) NOT NULL,
    duration_weeks integer DEFAULT 2 NOT NULL,
    start_date date NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    completed_at timestamp without time zone,
    transitioned_to_hypertrophy boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    repeat_required boolean DEFAULT false NOT NULL,
    repeat_penalty_pct numeric(5,2) DEFAULT 0 NOT NULL,
    progression_cap_pct numeric(5,2) DEFAULT 2.5 NOT NULL,
    repeat_count integer DEFAULT 0 NOT NULL,
    repeat_reason text,
    repeat_requested_at timestamp without time zone,
    ai_tag character varying,
    sessions_per_week integer,
    CONSTRAINT adaptation_blocks_ai_tag_check CHECK (((ai_tag IS NULL) OR ((ai_tag)::text = ANY (ARRAY[('novato_total'::character varying)::text, ('readaptacion_mayor'::character varying)::text, ('reacondicionamiento_prev'::character varying)::text])))),
    CONSTRAINT adaptation_blocks_block_type_check CHECK (((block_type)::text = ANY (ARRAY[('full_body'::character varying)::text, ('half_body'::character varying)::text]))),
    CONSTRAINT adaptation_blocks_duration_weeks_check CHECK (((duration_weeks >= 1) AND (duration_weeks <= 4))),
    CONSTRAINT adaptation_blocks_sessions_per_week_check CHECK (((sessions_per_week IS NULL) OR (sessions_per_week >= 1))),
    CONSTRAINT adaptation_blocks_status_check CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('completed'::character varying)::text, ('abandoned'::character varying)::text])))
);


--
-- Name: adaptation_blocks_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.adaptation_blocks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: adaptation_blocks_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.adaptation_blocks_id_seq OWNED BY app.adaptation_blocks.id;


--
-- Name: adaptation_criteria_tracking; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.adaptation_criteria_tracking (
    id integer NOT NULL,
    adaptation_block_id integer NOT NULL,
    week_number integer NOT NULL,
    sessions_planned integer DEFAULT 5 NOT NULL,
    sessions_completed integer DEFAULT 0 NOT NULL,
    adherence_percentage numeric(5,2) GENERATED ALWAYS AS (
CASE
    WHEN (sessions_planned > 0) THEN (((sessions_completed)::numeric / (sessions_planned)::numeric) * (100)::numeric)
    ELSE (0)::numeric
END) STORED,
    adherence_met boolean GENERATED ALWAYS AS ((((sessions_completed)::numeric / (NULLIF(sessions_planned, 0))::numeric) >= 0.8)) STORED,
    mean_rir numeric(3,1),
    rir_met boolean GENERATED ALWAYS AS ((mean_rir <= (4)::numeric)) STORED,
    technique_flags_count integer DEFAULT 0 NOT NULL,
    technique_met boolean GENERATED ALWAYS AS ((technique_flags_count < 1)) STORED,
    initial_average_weight numeric(6,2),
    current_average_weight numeric(6,2),
    weight_progress_percentage numeric(5,2) GENERATED ALWAYS AS (
CASE
    WHEN (initial_average_weight > (0)::numeric) THEN (((current_average_weight - initial_average_weight) / initial_average_weight) * (100)::numeric)
    ELSE (0)::numeric
END) STORED,
    progress_met boolean GENERATED ALWAYS AS (
CASE
    WHEN (initial_average_weight > (0)::numeric) THEN (((current_average_weight - initial_average_weight) / initial_average_weight) >= 0.08)
    ELSE false
END) STORED,
    week_start_date date NOT NULL,
    week_end_date date NOT NULL,
    evaluated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT adaptation_criteria_tracking_week_number_check CHECK ((week_number > 0))
);


--
-- Name: adaptation_criteria_tracking_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.adaptation_criteria_tracking_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: adaptation_criteria_tracking_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.adaptation_criteria_tracking_id_seq OWNED BY app.adaptation_criteria_tracking.id;


--
-- Name: adaptation_progress_summary; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.adaptation_progress_summary AS
SELECT
    NULL::integer AS adaptation_block_id,
    NULL::integer AS user_id,
    NULL::character varying(20) AS block_type,
    NULL::integer AS duration_weeks,
    NULL::date AS start_date,
    NULL::character varying(20) AS status,
    NULL::bigint AS weeks_tracked,
    NULL::integer AS latest_week,
    NULL::numeric AS latest_adherence_pct,
    NULL::numeric(3,1) AS latest_mean_rir,
    NULL::boolean AS latest_adherence_met,
    NULL::boolean AS latest_rir_met,
    NULL::boolean AS ready_for_transition;


--
-- Name: adaptation_technique_flags; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.adaptation_technique_flags (
    id integer NOT NULL,
    adaptation_block_id integer NOT NULL,
    user_id integer NOT NULL,
    session_id integer,
    exercise_id integer,
    flag_type character varying(50) NOT NULL,
    severity character varying(20) DEFAULT 'moderate'::character varying NOT NULL,
    description text,
    resolved boolean DEFAULT false,
    resolved_at timestamp without time zone,
    resolution_notes text,
    flagged_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT adaptation_technique_flags_flag_type_check CHECK (((flag_type)::text = ANY (ARRAY[('incorrect_rom'::character varying)::text, ('poor_posture'::character varying)::text, ('excessive_momentum'::character varying)::text, ('unstable_movement'::character varying)::text, ('compensation_pattern'::character varying)::text, ('pain_reported'::character varying)::text]))),
    CONSTRAINT adaptation_technique_flags_severity_check CHECK (((severity)::text = ANY (ARRAY[('minor'::character varying)::text, ('moderate'::character varying)::text, ('serious'::character varying)::text])))
);


--
-- Name: adaptation_technique_flags_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.adaptation_technique_flags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: adaptation_technique_flags_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.adaptation_technique_flags_id_seq OWNED BY app.adaptation_technique_flags.id;


--
-- Name: ai_adjustment_suggestions; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.ai_adjustment_suggestions (
    id integer NOT NULL,
    re_evaluation_id integer NOT NULL,
    progress_assessment character varying(50),
    intensity_change character varying(50),
    volume_change character varying(50),
    rest_modifications character varying(50),
    suggested_progressions jsonb,
    ai_reasoning text,
    motivational_feedback text,
    warnings text[],
    applied boolean DEFAULT false,
    applied_at timestamp without time zone,
    applied_by integer,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: ai_adjustment_suggestions_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.ai_adjustment_suggestions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ai_adjustment_suggestions_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.ai_adjustment_suggestions_id_seq OWNED BY app.ai_adjustment_suggestions.id;


--
-- Name: auth_logs; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.auth_logs (
    id integer NOT NULL,
    event_type character varying(50) NOT NULL,
    user_id integer,
    session_id integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: auth_logs_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.auth_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: auth_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.auth_logs_id_seq OWNED BY app.auth_logs.id;


--
-- Name: autoreg_stall; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.autoreg_stall (
    user_id integer NOT NULL,
    methodology text NOT NULL,
    stall_streak integer DEFAULT 0 NOT NULL,
    last_decision character varying(20),
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: body_composition_history; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.body_composition_history (
    id integer NOT NULL,
    user_id integer NOT NULL,
    measurement_date timestamp with time zone DEFAULT now(),
    peso numeric(5,2),
    grasa_corporal numeric(4,2),
    masa_magra numeric(5,2),
    agua_corporal numeric(4,2),
    metabolismo_basal integer,
    imc numeric(4,2),
    cintura numeric(5,2),
    cuello numeric(5,2),
    cadera numeric(5,2),
    calculation_method character varying(50),
    notes text,
    CONSTRAINT body_composition_history_user_id_idx CHECK ((user_id IS NOT NULL))
);


--
-- Name: body_composition_history_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.body_composition_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: body_composition_history_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.body_composition_history_id_seq OWNED BY app.body_composition_history.id;


--
-- Name: body_measurements; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.body_measurements (
    id integer NOT NULL,
    user_id integer NOT NULL,
    measurement_date date NOT NULL,
    weight_kg numeric(5,2) NOT NULL,
    waist_cm numeric(5,2) NOT NULL,
    biceps numeric(5,2),
    chest numeric(5,2),
    calf numeric(5,2),
    abdominal_fold numeric(4,1),
    performance_trend character varying(20),
    measurement_conditions jsonb DEFAULT '{}'::jsonb,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    time_of_day character varying(20),
    is_fasted boolean DEFAULT true,
    post_workout boolean DEFAULT false,
    biceps_cm numeric(5,2),
    chest_cm numeric(5,2),
    calf_cm numeric(5,2),
    skinfold_abdominal_mm numeric(4,1),
    skinfold_triceps_mm numeric(4,1),
    skinfold_subscapular_mm numeric(4,1),
    is_validated boolean DEFAULT false,
    validation_warnings jsonb DEFAULT '[]'::jsonb,
    requires_confirmation boolean DEFAULT false,
    user_confirmed boolean DEFAULT false,
    confirmed_at timestamp without time zone,
    CONSTRAINT body_measurements_time_of_day_check CHECK (((time_of_day)::text = ANY (ARRAY[('morning'::character varying)::text, ('afternoon'::character varying)::text, ('evening'::character varying)::text, ('night'::character varying)::text])))
);


--
-- Name: body_measurements_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.body_measurements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: body_measurements_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.body_measurements_id_seq OWNED BY app.body_measurements.id;


--
-- Name: bridge_adjustment_history; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.bridge_adjustment_history (
    id integer NOT NULL,
    user_id integer NOT NULL,
    decision_log_id integer,
    adjustment_date date DEFAULT CURRENT_DATE,
    adjustment_type character varying(30) NOT NULL,
    previous_values jsonb NOT NULL,
    new_values jsonb NOT NULL,
    reason text NOT NULL,
    duration_days integer,
    is_active boolean DEFAULT true,
    reverted_at timestamp without time zone,
    revert_reason text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: bridge_adjustment_history_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.bridge_adjustment_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bridge_adjustment_history_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.bridge_adjustment_history_id_seq OWNED BY app.bridge_adjustment_history.id;


--
-- Name: bridge_current_state; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.bridge_current_state (
    user_id integer NOT NULL,
    current_kcal integer,
    current_macros jsonb,
    current_metabolic_profile character varying(20),
    days_in_deficit integer DEFAULT 0,
    days_in_surplus integer DEFAULT 0,
    current_methodology character varying(50),
    current_phase character varying(30),
    weekly_cls_score integer,
    accumulated_fatigue_score integer DEFAULT 0,
    active_flags jsonb DEFAULT '[]'::jsonb,
    sessions_since_last_recalc integer DEFAULT 0,
    days_since_metabolic_eval integer DEFAULT 0,
    next_cls_update date,
    next_metabolic_eval date,
    next_full_review date,
    last_session_date date,
    last_recalculation timestamp without time zone,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: bridge_decision_logs; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.bridge_decision_logs (
    id integer NOT NULL,
    user_id integer NOT NULL,
    decision_date date DEFAULT CURRENT_DATE,
    trigger_source character varying(20) NOT NULL,
    trigger_event character varying(50) NOT NULL,
    training_inputs jsonb,
    nutrition_inputs jsonb,
    decision_type character varying(30) NOT NULL,
    decision_details jsonb NOT NULL,
    applied_nutrition jsonb,
    applied_training jsonb,
    was_applied boolean DEFAULT false,
    user_overridden boolean DEFAULT false,
    override_reason text,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT bridge_decision_logs_trigger_source_check CHECK (((trigger_source)::text = ANY (ARRAY[('training'::character varying)::text, ('nutrition'::character varying)::text, ('manual'::character varying)::text, ('scheduled'::character varying)::text])))
);


--
-- Name: bridge_decision_logs_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.bridge_decision_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bridge_decision_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.bridge_decision_logs_id_seq OWNED BY app.bridge_decision_logs.id;


--
-- Name: bridge_recalculation_config; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.bridge_recalculation_config (
    user_id integer NOT NULL,
    recalc_on_session boolean DEFAULT true,
    recalc_weekly_cls boolean DEFAULT true,
    recalc_biweekly_metabolic boolean DEFAULT true,
    recalc_monthly_full boolean DEFAULT true,
    performance_drop_threshold numeric(3,2) DEFAULT 0.15,
    weight_change_threshold numeric(3,2) DEFAULT 0.02,
    fatigue_accumulation_days integer DEFAULT 14,
    notify_on_adjustment boolean DEFAULT true,
    auto_apply_minor_changes boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: calistenia_autoreg_state; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.calistenia_autoreg_state (
    user_id integer NOT NULL,
    methodology_plan_id integer,
    microcycles_completed integer DEFAULT 0 NOT NULL,
    easy_streak integer DEFAULT 0 NOT NULL,
    hard_streak integer DEFAULT 0 NOT NULL,
    deload_suggested boolean DEFAULT false NOT NULL,
    last_decision character varying(20),
    last_avg_rir numeric,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    last_subjective numeric
);


--
-- Name: carb_timing_logs; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.carb_timing_logs (
    id integer NOT NULL,
    user_id integer NOT NULL,
    session_id integer,
    methodology character varying(50),
    intensity character varying(20),
    duration_min integer,
    timing_window character varying(20) NOT NULL,
    carbs_recommended integer NOT NULL,
    protein_recommended integer,
    user_consumed_carbs integer,
    user_consumed_protein integer,
    consumed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT carb_timing_logs_timing_window_check CHECK (((timing_window)::text = ANY (ARRAY[('pre_workout'::character varying)::text, ('post_workout'::character varying)::text])))
);


--
-- Name: carb_timing_logs_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.carb_timing_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: carb_timing_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.carb_timing_logs_id_seq OWNED BY app.carb_timing_logs.id;


--
-- Name: carb_timing_preferences; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.carb_timing_preferences (
    user_id integer NOT NULL,
    default_pre_workout_hours numeric(3,1) DEFAULT 1.5,
    default_post_workout_urgency character varying(20) DEFAULT 'medium'::character varying,
    avoid_carbs_night boolean DEFAULT false,
    preferred_carb_sources text,
    notify_pre_workout boolean DEFAULT false,
    notify_post_workout boolean DEFAULT true,
    updated_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: casa_autoreg_state; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.casa_autoreg_state (
    user_id integer NOT NULL,
    methodology_plan_id integer,
    microcycles_completed integer DEFAULT 0 NOT NULL,
    easy_streak integer DEFAULT 0 NOT NULL,
    hard_streak integer DEFAULT 0 NOT NULL,
    deload_suggested boolean DEFAULT false NOT NULL,
    last_decision character varying(20),
    last_avg_rir numeric,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    last_subjective numeric
);


--
-- Name: crossfit_autoreg_state; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.crossfit_autoreg_state (
    user_id integer NOT NULL,
    methodology_plan_id integer,
    wods_completed integer DEFAULT 0 NOT NULL,
    easy_streak integer DEFAULT 0 NOT NULL,
    hard_streak integer DEFAULT 0 NOT NULL,
    deload_suggested boolean DEFAULT false NOT NULL,
    last_decision character varying(20),
    last_rpe numeric,
    last_scale character varying(12),
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    last_subjective numeric
);


--
-- Name: daily_compensation_plan; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.daily_compensation_plan (
    id integer NOT NULL,
    user_id integer NOT NULL,
    deviation_id integer,
    compensation_date date NOT NULL,
    kcal_adjustment integer NOT NULL,
    protein_g_target numeric(6,1),
    carbs_g_adjustment numeric(6,1),
    fat_g_adjustment numeric(6,1),
    is_applied boolean DEFAULT false,
    actual_kcal_consumed integer,
    notes text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: daily_compensation_plan_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.daily_compensation_plan_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: daily_compensation_plan_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.daily_compensation_plan_id_seq OWNED BY app.daily_compensation_plan.id;


--
-- Name: daily_nutrition_log; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.daily_nutrition_log (
    id integer NOT NULL,
    user_id integer NOT NULL,
    log_date date NOT NULL,
    daily_log jsonb DEFAULT '{"fat": 0, "carbs": 0, "meals": [], "protein": 0, "calories": 0}'::jsonb NOT NULL,
    calories numeric(7,2) DEFAULT 0.00,
    protein numeric(6,2) DEFAULT 0.00,
    carbs numeric(6,2) DEFAULT 0.00,
    fat numeric(6,2) DEFAULT 0.00,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    day_type text DEFAULT 'normal'::text NOT NULL,
    noise_flags text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT daily_nutrition_log_day_type_check CHECK ((day_type = ANY (ARRAY['normal'::text, 'libre'::text, 'cheat'::text, 'diet_break'::text])))
);


--
-- Name: daily_nutrition_log_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.daily_nutrition_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: daily_nutrition_log_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.daily_nutrition_log_id_seq OWNED BY app.daily_nutrition_log.id;


--
-- Name: diet_breaks; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.diet_breaks (
    id integer NOT NULL,
    user_id integer NOT NULL,
    break_date date NOT NULL,
    slot character varying(20) NOT NULL,
    description text,
    estimated_kcal integer NOT NULL,
    estimated_macros jsonb,
    confidence character varying(10) DEFAULT 'medio'::character varying,
    compensation_applied boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: diet_breaks_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.diet_breaks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: diet_breaks_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.diet_breaks_id_seq OWNED BY app.diet_breaks.id;


--
-- Name: diet_deviation_config; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.diet_deviation_config (
    user_id integer NOT NULL,
    auto_compensate boolean DEFAULT true,
    max_compensation_per_day_pct numeric(3,2) DEFAULT 0.20,
    min_protein_g_kg numeric(3,1) DEFAULT 2.0,
    conservative_mode boolean DEFAULT false,
    phase_priority jsonb DEFAULT '{"cut": "carbs_only", "bulk": "carbs_first", "mant": "balanced"}'::jsonb,
    notify_on_deviation boolean DEFAULT true,
    notify_compensation_reminder boolean DEFAULT true,
    updated_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: diet_deviations; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.diet_deviations (
    id integer NOT NULL,
    user_id integer NOT NULL,
    deviation_date date NOT NULL,
    meal_slot character varying(20) NOT NULL,
    description text,
    foods_consumed text,
    excess_kcal integer NOT NULL,
    excess_protein_g numeric(6,1) DEFAULT 0,
    excess_carbs_g numeric(6,1) DEFAULT 0,
    excess_fat_g numeric(6,1) DEFAULT 0,
    confidence_level character varying(10) DEFAULT 'medio'::character varying NOT NULL,
    compensation_status character varying(20) DEFAULT 'pending'::character varying,
    compensation_applied jsonb DEFAULT '[]'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT diet_deviations_compensation_status_check CHECK (((compensation_status)::text = ANY (ARRAY[('pending'::character varying)::text, ('partial'::character varying)::text, ('completed'::character varying)::text, ('skipped'::character varying)::text]))),
    CONSTRAINT diet_deviations_confidence_level_check CHECK (((confidence_level)::text = ANY (ARRAY[('bajo'::character varying)::text, ('medio'::character varying)::text, ('alto'::character varying)::text]))),
    CONSTRAINT diet_deviations_meal_slot_check CHECK (((meal_slot)::text = ANY (ARRAY[('desayuno'::character varying)::text, ('comida'::character varying)::text, ('cena'::character varying)::text, ('extra'::character varying)::text, ('snack'::character varying)::text])))
);


--
-- Name: diet_deviations_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.diet_deviations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: diet_deviations_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.diet_deviations_id_seq OWNED BY app.diet_deviations.id;


--
-- Name: ejercicios; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.ejercicios (
    id bigint NOT NULL,
    disciplina text NOT NULL,
    source_exercise_id text,
    slug text,
    nombre text NOT NULL,
    nivel text,
    categoria text,
    patron text,
    equipamiento text[],
    series_reps_objetivo text,
    descanso_seg integer,
    tempo text,
    criterio_de_progreso text,
    progresion_desde text,
    progresion_hacia text,
    notas text,
    como_hacerlo text,
    consejos text,
    errores_comunes text,
    gif_url text,
    extra jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tipo_ejercicio text,
    patron_movimiento text,
    orden_recomendado integer,
    menstrual_restriction text,
    menstrual_restriction_reason text,
    alternative_exercise_id text,
    menstrual_notes text
);


--
-- Name: ejercicios_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.ejercicios_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ejercicios_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.ejercicios_id_seq OWNED BY app.ejercicios.id;


--
-- Name: equipment_items; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.equipment_items (
    id integer NOT NULL,
    name character varying(200) NOT NULL,
    category character varying(100) NOT NULL,
    equipment_type character varying(100),
    description text,
    muscle_groups text[],
    difficulty_level character varying(20) DEFAULT 'intermedio'::character varying,
    price_range character varying(50),
    is_essential boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    name_es character varying(200),
    category_es character varying(100),
    equipment_type_es character varying(100)
);


--
-- Name: equipment_items_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.equipment_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equipment_items_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.equipment_items_id_seq OWNED BY app.equipment_items.id;


--
-- Name: equipment_translations; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.equipment_translations (
    id integer NOT NULL,
    equipment_type_en character varying(100) NOT NULL,
    equipment_type_es character varying(100) NOT NULL,
    category_en character varying(100),
    category_es character varying(100),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: equipment_translations_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.equipment_translations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: equipment_translations_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.equipment_translations_id_seq OWNED BY app.equipment_translations.id;


--
-- Name: exercise_ai_info; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.exercise_ai_info (
    id integer NOT NULL,
    exercise_name character varying(255) NOT NULL,
    exercise_name_normalized character varying(255),
    ejecucion text,
    consejos text,
    errores_evitar text,
    first_requested_by integer,
    request_count integer DEFAULT 1,
    ai_model_used character varying(100) DEFAULT 'gpt-3.5-turbo'::character varying,
    tokens_used integer DEFAULT 0,
    generation_cost numeric(10,6) DEFAULT 0.00,
    is_verified boolean DEFAULT false,
    last_updated timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: exercise_ai_info_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.exercise_ai_info_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exercise_ai_info_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.exercise_ai_info_id_seq OWNED BY app.exercise_ai_info.id;


--
-- Name: exercise_history; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.exercise_history (
    id integer NOT NULL,
    user_id integer NOT NULL,
    exercise_name character varying(255) NOT NULL,
    exercise_key character varying(255),
    exercise_type character varying(100) DEFAULT 'general'::character varying,
    training_type character varying(100),
    used_at timestamp with time zone DEFAULT now(),
    session_id integer,
    plan_id integer,
    methodology_type character varying(50),
    repetitions integer,
    sets integer,
    duration_seconds integer,
    notes text,
    difficulty_rating integer,
    completion_status character varying(20) DEFAULT 'completed'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT exercise_history_difficulty_rating_check CHECK (((difficulty_rating >= 1) AND (difficulty_rating <= 5)))
);


--
-- Name: exercise_history_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.exercise_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exercise_history_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.exercise_history_id_seq OWNED BY app.exercise_history.id;


--
-- Name: exercise_session_tracking; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.exercise_session_tracking (
    id integer NOT NULL,
    methodology_session_id integer,
    user_id integer,
    exercise_name character varying(200) NOT NULL,
    exercise_order integer NOT NULL,
    exercise_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying,
    planned_sets integer DEFAULT 0,
    planned_reps character varying(50) DEFAULT '0'::character varying,
    planned_duration_seconds integer DEFAULT 0,
    planned_rest_seconds integer DEFAULT 60,
    actual_sets integer DEFAULT 0,
    actual_reps character varying(50) DEFAULT '0'::character varying,
    actual_duration_seconds integer DEFAULT 0,
    actual_rest_seconds integer DEFAULT 0,
    difficulty_rating integer,
    effort_rating integer,
    personal_feedback text,
    was_difficult boolean,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT exercise_session_tracking_difficulty_rating_check CHECK (((difficulty_rating >= 1) AND (difficulty_rating <= 5))),
    CONSTRAINT exercise_session_tracking_effort_rating_check CHECK (((effort_rating >= 1) AND (effort_rating <= 5)))
);


--
-- Name: exercise_session_tracking_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.exercise_session_tracking_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exercise_session_tracking_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.exercise_session_tracking_id_seq OWNED BY app.exercise_session_tracking.id;


--
-- Name: exercise_tags; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.exercise_tags (
    id integer NOT NULL,
    exercise_id bigint NOT NULL,
    source_table text NOT NULL,
    pattern text,
    equipment text[],
    impact_level integer,
    axial_load_level integer,
    cod_level integer,
    overhead boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT exercise_tags_axial_load_level_check CHECK (((axial_load_level IS NULL) OR ((axial_load_level >= 0) AND (axial_load_level <= 3)))),
    CONSTRAINT exercise_tags_cod_level_check CHECK (((cod_level IS NULL) OR ((cod_level >= 0) AND (cod_level <= 3)))),
    CONSTRAINT exercise_tags_impact_level_check CHECK (((impact_level IS NULL) OR ((impact_level >= 0) AND (impact_level <= 3))))
);


--
-- Name: exercise_tags_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.exercise_tags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exercise_tags_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.exercise_tags_id_seq OWNED BY app.exercise_tags.id;


--
-- Name: fatigue_flags; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.fatigue_flags (
    id integer NOT NULL,
    user_id integer NOT NULL,
    methodology_plan_id integer,
    session_id integer,
    flag_date timestamp without time zone DEFAULT now(),
    flag_type character varying(20) NOT NULL,
    sleep_quality integer,
    energy_level integer,
    doms_level integer,
    joint_pain_level integer,
    focus_level integer,
    motivation_level integer,
    performance_drop_pct numeric(5,2),
    underperformed_sets integer DEFAULT 0,
    mean_rir_session numeric(3,1),
    notes text,
    auto_detected boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT fatigue_flags_doms_level_check CHECK (((doms_level >= 0) AND (doms_level <= 10))),
    CONSTRAINT fatigue_flags_energy_level_check CHECK (((energy_level >= 1) AND (energy_level <= 10))),
    CONSTRAINT fatigue_flags_flag_type_check CHECK (((flag_type)::text = ANY (ARRAY[('light'::character varying)::text, ('critical'::character varying)::text, ('cognitive'::character varying)::text]))),
    CONSTRAINT fatigue_flags_focus_level_check CHECK (((focus_level >= 1) AND (focus_level <= 10))),
    CONSTRAINT fatigue_flags_joint_pain_level_check CHECK (((joint_pain_level >= 0) AND (joint_pain_level <= 10))),
    CONSTRAINT fatigue_flags_motivation_level_check CHECK (((motivation_level >= 1) AND (motivation_level <= 10))),
    CONSTRAINT fatigue_flags_sleep_quality_check CHECK (((sleep_quality >= 1) AND (sleep_quality <= 10)))
);


--
-- Name: fatigue_flags_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.fatigue_flags_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fatigue_flags_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.fatigue_flags_id_seq OWNED BY app.fatigue_flags.id;


--
-- Name: food_conversion_factors; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.food_conversion_factors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grupo_factor text NOT NULL,
    estado_base text NOT NULL,
    estado_objetivo text NOT NULL,
    factor_base_objetivo numeric(10,6) NOT NULL,
    nota text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT check_factor_estados_base CHECK ((estado_base = ANY (ARRAY['crudo'::text, 'cocido'::text, 'escurrido'::text, 'seco'::text, 'tal_cual'::text]))),
    CONSTRAINT check_factor_estados_objetivo CHECK ((estado_objetivo = ANY (ARRAY['crudo'::text, 'cocido'::text, 'escurrido'::text, 'seco'::text, 'tal_cual'::text]))),
    CONSTRAINT check_factor_positive CHECK ((factor_base_objetivo > (0)::numeric))
);


--
-- Name: food_pairing_rules; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.food_pairing_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    food_slug_a text NOT NULL,
    food_slug_b text NOT NULL,
    rule_type text NOT NULL,
    penalty numeric(6,2) DEFAULT 0 NOT NULL,
    contexts text[] DEFAULT ARRAY['DESAYUNO'::text, 'COMIDA'::text, 'CENA'::text, 'SNACK'::text] NOT NULL,
    reason text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT food_pairing_rules_rule_type_check CHECK ((rule_type = ANY (ARRAY['forbidden'::text, 'penalty'::text, 'preferred'::text])))
);


--
-- Name: food_roles; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.food_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    food_id uuid NOT NULL,
    food_slug text NOT NULL,
    role text NOT NULL,
    diet_type text,
    category text,
    notes text,
    source text DEFAULT 'mindfeed_excel'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: foods; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.foods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    categoria text,
    macros_100g jsonb NOT NULL,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    equivalencias jsonb DEFAULT '{}'::jsonb,
    is_verified boolean DEFAULT false,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    slug text,
    porcion_tipica_g integer,
    fibra_100g numeric(5,2),
    estado_pesado_base text,
    estado_pesado_mostrado_default text,
    metodo_preparacion text,
    grupo_factor text,
    categoria_detalle text,
    is_vegetarian boolean DEFAULT false,
    is_vegan boolean DEFAULT false,
    medida_casera text,
    tipo_dieta text,
    meal_suitability jsonb,
    processing_level text,
    culinary_family text,
    is_snack_only boolean DEFAULT false NOT NULL,
    is_main_dish_allowed boolean DEFAULT true NOT NULL,
    palatability_score numeric(5,2),
    CONSTRAINT check_estado_mostrado CHECK (((estado_pesado_mostrado_default IS NULL) OR (estado_pesado_mostrado_default = ANY (ARRAY['crudo'::text, 'cocido'::text, 'escurrido'::text, 'seco'::text, 'tal_cual'::text])))),
    CONSTRAINT check_estado_pesado_base CHECK (((estado_pesado_base IS NULL) OR (estado_pesado_base = ANY (ARRAY['crudo'::text, 'cocido'::text, 'escurrido'::text, 'seco'::text, 'tal_cual'::text])))),
    CONSTRAINT check_tipo_dieta CHECK (((tipo_dieta IS NULL) OR (tipo_dieta = ANY (ARRAY['Omnívoro'::text, 'Ambos'::text, 'Vegetariano'::text, 'Vegano'::text])))),
    CONSTRAINT chk_foods_palatability_score CHECK (((palatability_score IS NULL) OR ((palatability_score >= (0)::numeric) AND (palatability_score <= (100)::numeric)))),
    CONSTRAINT chk_foods_processing_level CHECK (((processing_level IS NULL) OR (processing_level = ANY (ARRAY['minimo'::text, 'procesado'::text, 'ultraprocesado'::text])))),
    CONSTRAINT foods_categoria_check CHECK ((categoria = ANY (ARRAY['Proteína animal'::text, 'Huevo'::text, 'Proteína vegetal'::text, 'Legumbre'::text, 'Carbohidrato'::text, 'Verdura'::text, 'Fruta'::text, 'Lácteo'::text, 'Grasa'::text, 'Suplemento'::text, 'Bebida'::text, 'Otros'::text])))
);


--
-- Name: funcional_autoreg_state; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.funcional_autoreg_state (
    user_id integer NOT NULL,
    methodology_plan_id integer,
    microcycles_completed integer DEFAULT 0 NOT NULL,
    easy_streak integer DEFAULT 0 NOT NULL,
    hard_streak integer DEFAULT 0 NOT NULL,
    deload_suggested boolean DEFAULT false NOT NULL,
    last_decision character varying(20),
    last_avg_rir numeric,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    last_subjective numeric
);


--
-- Name: halterofilia_autoreg_state; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.halterofilia_autoreg_state (
    user_id integer NOT NULL,
    methodology_plan_id integer,
    sessions_completed integer DEFAULT 0 NOT NULL,
    easy_streak integer DEFAULT 0 NOT NULL,
    hard_streak integer DEFAULT 0 NOT NULL,
    deload_suggested boolean DEFAULT false NOT NULL,
    last_decision character varying(20),
    last_rpe numeric,
    last_target_met boolean,
    last_good_technique boolean,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    last_subjective numeric
);


--
-- Name: heavy_duty_autoreg_state; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.heavy_duty_autoreg_state (
    user_id integer NOT NULL,
    methodology_plan_id integer,
    sessions_completed integer DEFAULT 0 NOT NULL,
    hard_streak integer DEFAULT 0 NOT NULL,
    deload_suggested boolean DEFAULT false NOT NULL,
    last_decision character varying(20),
    last_reached_failure boolean,
    last_target_met boolean,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    last_subjective numeric
);


--
-- Name: hipertrofia_v2_session_config; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.hipertrofia_v2_session_config (
    id integer NOT NULL,
    cycle_day integer NOT NULL,
    session_name character varying(100) NOT NULL,
    muscle_groups jsonb NOT NULL,
    intensity_percentage integer NOT NULL,
    is_heavy_day boolean DEFAULT true,
    session_order integer NOT NULL,
    multiarticular_count integer DEFAULT 2,
    unilateral_count integer DEFAULT 2,
    analitico_count integer DEFAULT 1,
    default_sets integer DEFAULT 3,
    default_reps_range character varying(10) DEFAULT '8-12'::character varying,
    default_rir_target character varying(5) DEFAULT '2-3'::character varying,
    description text,
    coach_tip text,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT hipertrofia_v2_session_config_cycle_day_check CHECK (((cycle_day >= 1) AND (cycle_day <= 5)))
);


--
-- Name: hipertrofia_v2_session_config_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.hipertrofia_v2_session_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hipertrofia_v2_session_config_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.hipertrofia_v2_session_config_id_seq OWNED BY app.hipertrofia_v2_session_config.id;


--
-- Name: hipertrofia_v2_state; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.hipertrofia_v2_state (
    user_id integer NOT NULL,
    methodology_plan_id integer,
    cycle_day integer DEFAULT 1 NOT NULL,
    microcycles_completed integer DEFAULT 0 NOT NULL,
    current_week_number integer DEFAULT 1 NOT NULL,
    last_session_at timestamp without time zone,
    last_session_day_name character varying(20),
    priority_muscle character varying(50),
    priority_microcycles_elapsed integer DEFAULT 0,
    priority_duration_microcycles integer DEFAULT 3,
    weekly_topset_used boolean DEFAULT false,
    fatigue_flags_leves integer DEFAULT 0,
    fatigue_flags_criticos integer DEFAULT 0,
    fatigue_window_start date,
    deload_active boolean DEFAULT false,
    deload_reason character varying(50),
    deload_started_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    last_session_patterns jsonb DEFAULT '[]'::jsonb,
    neural_overlap_detected character varying(20),
    priority_started_at timestamp without time zone,
    priority_microcycles_completed integer DEFAULT 0,
    priority_top_sets_this_week integer DEFAULT 0,
    priority_last_week_reset timestamp without time zone DEFAULT now(),
    np_high_rir_streak integer DEFAULT 0 NOT NULL,
    CONSTRAINT hipertrofia_v2_state_cycle_day_check CHECK (((cycle_day >= 1) AND (cycle_day <= 5))),
    CONSTRAINT hipertrofia_v2_state_neural_overlap_detected_check CHECK (((neural_overlap_detected)::text = ANY (ARRAY[('none'::character varying)::text, ('partial'::character varying)::text, ('high'::character varying)::text])))
);


--
-- Name: hypertrophy_set_logs; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.hypertrophy_set_logs (
    id integer NOT NULL,
    user_id integer NOT NULL,
    methodology_plan_id integer,
    session_id integer,
    exercise_id bigint NOT NULL,
    exercise_name character varying(255),
    set_number integer NOT NULL,
    weight_used numeric(5,2) NOT NULL,
    reps_completed integer NOT NULL,
    rir_reported integer NOT NULL,
    estimated_1rm numeric(5,2),
    rpe_calculated integer,
    volume_load numeric(7,2),
    is_effective boolean,
    created_at timestamp without time zone DEFAULT now(),
    is_warmup boolean DEFAULT false
);


--
-- Name: hipertrofia_v2_user_status; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.hipertrofia_v2_user_status AS
 SELECT s.user_id,
    s.methodology_plan_id,
    s.cycle_day,
    s.microcycles_completed,
    s.last_session_at,
    s.last_session_day_name,
    s.deload_active,
    s.deload_reason,
    concat('D', s.cycle_day) AS next_session,
    sc.session_name AS next_session_name,
    sc.muscle_groups AS next_muscle_groups,
    sc.intensity_percentage AS next_intensity_pct,
    ( SELECT avg(hypertrophy_set_logs.rir_reported) AS avg
           FROM app.hypertrophy_set_logs
          WHERE ((hypertrophy_set_logs.user_id = s.user_id) AND (hypertrophy_set_logs.created_at > (now() - '14 days'::interval)))) AS recent_mean_rir,
    ((app.check_deload_trigger(s.user_id) ->> 'should_trigger'::text))::boolean AS deload_should_trigger,
    s.updated_at
   FROM (app.hipertrofia_v2_state s
     LEFT JOIN app.hipertrofia_v2_session_config sc ON ((sc.cycle_day = s.cycle_day)));


--
-- Name: historico_ejercicios; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.historico_ejercicios (
    id integer NOT NULL,
    user_id integer NOT NULL,
    nombre_ejercicio text NOT NULL,
    tipo_ejercicio text NOT NULL,
    repeticiones integer,
    tiempo integer,
    series integer,
    comentarios text,
    feedback text,
    fecha_ejercicio timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT historico_ejercicios_tipo_ejercicio_check CHECK ((tipo_ejercicio = ANY (ARRAY['calistenia'::text, 'hipertrofia'::text, 'hometraining'::text])))
);


--
-- Name: historico_ejercicios_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.historico_ejercicios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: historico_ejercicios_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.historico_ejercicios_id_seq OWNED BY app.historico_ejercicios.id;


--
-- Name: home_combination_exercise_history; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.home_combination_exercise_history (
    id integer NOT NULL,
    user_id integer NOT NULL,
    combination_id integer NOT NULL,
    combination_code character varying(50),
    exercise_name character varying(200) NOT NULL,
    exercise_key character varying(100),
    times_used integer DEFAULT 1,
    last_used_at timestamp with time zone DEFAULT now(),
    user_rating character varying(20),
    difficulty_feedback character varying(20),
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: home_combination_exercise_history_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.home_combination_exercise_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: home_combination_exercise_history_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.home_combination_exercise_history_id_seq OWNED BY app.home_combination_exercise_history.id;


--
-- Name: home_exercise_history; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.home_exercise_history (
    id integer NOT NULL,
    user_id integer NOT NULL,
    exercise_name character varying(255) NOT NULL,
    exercise_key character varying(255),
    reps text,
    series integer,
    duration_seconds integer,
    plan_id integer,
    session_id integer,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: home_exercise_history_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.home_exercise_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: home_exercise_history_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.home_exercise_history_id_seq OWNED BY app.home_exercise_history.id;


--
-- Name: home_exercise_progress; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.home_exercise_progress (
    id integer NOT NULL,
    home_training_session_id integer,
    exercise_name character varying(255) NOT NULL,
    exercise_order integer NOT NULL,
    series_completed integer DEFAULT 0,
    total_series integer DEFAULT 1 NOT NULL,
    duration_seconds integer,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    status character varying(20) DEFAULT 'pending'::character varying,
    exercise_data jsonb,
    CONSTRAINT chk_ex_progress_status CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('in_progress'::character varying)::text, ('completed'::character varying)::text, ('skipped'::character varying)::text, ('cancelled'::character varying)::text])))
);


--
-- Name: home_exercise_progress_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.home_exercise_progress_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: home_exercise_progress_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.home_exercise_progress_id_seq OWNED BY app.home_exercise_progress.id;


--
-- Name: home_exercise_rejections; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.home_exercise_rejections (
    id integer NOT NULL,
    user_id integer NOT NULL,
    exercise_name character varying(255) NOT NULL,
    exercise_key character varying(255) NOT NULL,
    equipment_type character varying(100) NOT NULL,
    training_type character varying(100) NOT NULL,
    rejection_reason text,
    rejection_category character varying(100) DEFAULT 'user_preference'::character varying,
    rejected_at timestamp without time zone DEFAULT now(),
    expires_at timestamp without time zone,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: home_exercise_rejections_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.home_exercise_rejections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: home_exercise_rejections_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.home_exercise_rejections_id_seq OWNED BY app.home_exercise_rejections.id;


--
-- Name: home_training_combinations; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.home_training_combinations (
    id integer NOT NULL,
    combination_code character varying(50) NOT NULL,
    equipment_type character varying(50) NOT NULL,
    training_type character varying(50) NOT NULL,
    difficulty_level character varying(20) DEFAULT 'intermedio'::character varying,
    description text,
    exercises jsonb,
    duration_minutes integer,
    calories_estimate integer,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: home_training_combinations_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.home_training_combinations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: home_training_combinations_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.home_training_combinations_id_seq OWNED BY app.home_training_combinations.id;


--
-- Name: home_training_plans; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.home_training_plans (
    id integer NOT NULL,
    user_id integer,
    plan_data jsonb NOT NULL,
    equipment_type character varying(20) NOT NULL,
    training_type character varying(20) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: home_training_plans_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.home_training_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: home_training_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.home_training_plans_id_seq OWNED BY app.home_training_plans.id;


--
-- Name: home_training_sessions; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.home_training_sessions (
    id integer NOT NULL,
    user_id integer,
    home_training_plan_id integer,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    total_duration_seconds integer,
    exercises_completed integer DEFAULT 0,
    total_exercises integer DEFAULT 0,
    progress_percentage numeric(5,2) DEFAULT 0.00,
    status character varying(20) DEFAULT 'in_progress'::character varying,
    session_data jsonb,
    updated_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now(),
    abandoned_at timestamp without time zone,
    abandon_reason character varying(50),
    CONSTRAINT check_abandon_reason CHECK (((abandon_reason)::text = ANY (ARRAY[('beforeunload'::character varying)::text, ('visibility_hidden'::character varying)::text, ('logout'::character varying)::text, ('manual_close'::character varying)::text, ('timeout'::character varying)::text])))
);


--
-- Name: home_training_sessions_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.home_training_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: home_training_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.home_training_sessions_id_seq OWNED BY app.home_training_sessions.id;


--
-- Name: hypertrophy_blocks; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.hypertrophy_blocks (
    id integer NOT NULL,
    user_id integer NOT NULL,
    methodology_plan_id integer,
    block_name character varying(100),
    start_date date NOT NULL,
    end_date date,
    total_weeks integer DEFAULT 4,
    current_week integer DEFAULT 1,
    split_type character varying(20) DEFAULT 'full_body'::character varying,
    sessions_per_week integer DEFAULT 3,
    user_level character varying(20) DEFAULT 'Principiante'::character varying,
    template_a_exercises jsonb,
    template_b_exercises jsonb,
    template_c_exercises jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: hypertrophy_blocks_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.hypertrophy_blocks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hypertrophy_blocks_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.hypertrophy_blocks_id_seq OWNED BY app.hypertrophy_blocks.id;


--
-- Name: hypertrophy_progression; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.hypertrophy_progression (
    user_id integer NOT NULL,
    exercise_id bigint NOT NULL,
    exercise_name character varying(255),
    current_pr numeric(5,2),
    target_weight_80 numeric(5,2),
    last_adjustment character varying(20),
    adjustment_date timestamp without time zone,
    total_volume_accumulated numeric(10,2),
    last_rir_average numeric(3,1),
    sessions_count integer DEFAULT 0,
    updated_at timestamp without time zone DEFAULT now(),
    target_weight_next_cycle numeric(5,2),
    last_microcycle_completed integer DEFAULT 0,
    progression_locked boolean DEFAULT false
);


--
-- Name: hypertrophy_set_logs_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.hypertrophy_set_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hypertrophy_set_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.hypertrophy_set_logs_id_seq OWNED BY app.hypertrophy_set_logs.id;


--
-- Name: hypertrophy_user_progress; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.hypertrophy_user_progress AS
 SELECT user_id,
    exercise_id,
    exercise_name,
    count(DISTINCT session_id) AS total_sessions,
    max(estimated_1rm) AS best_estimated_pr,
    avg(rir_reported) AS avg_rir,
    sum(volume_load) AS total_volume,
    round((avg(
        CASE
            WHEN is_effective THEN 1.0
            ELSE 0.0
        END) * (100)::numeric), 2) AS effective_sets_percentage,
    max(created_at) AS last_session_date
   FROM app.hypertrophy_set_logs sl
  GROUP BY user_id, exercise_id, exercise_name;


--
-- Name: hypertrophy_weekly_templates; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.hypertrophy_weekly_templates (
    id integer NOT NULL,
    template_name character varying(10) NOT NULL,
    day_of_week character varying(20) NOT NULL,
    exercise_order integer NOT NULL,
    exercise_id bigint NOT NULL,
    exercise_name character varying(255),
    muscle_group character varying(100),
    sets_base integer DEFAULT 3,
    reps_range character varying(10) DEFAULT '8-12'::character varying,
    rir_target character varying(5) DEFAULT '2-3'::character varying,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: hypertrophy_weekly_templates_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.hypertrophy_weekly_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hypertrophy_weekly_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.hypertrophy_weekly_templates_id_seq OWNED BY app.hypertrophy_weekly_templates.id;


--
-- Name: icg_ipg_state_history; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.icg_ipg_state_history (
    id integer NOT NULL,
    user_id integer NOT NULL,
    measurement_date date NOT NULL,
    indicator_type character varying(10) NOT NULL,
    weight_kg numeric(5,2) NOT NULL,
    waist_cm numeric(5,2) NOT NULL,
    weight_change_kg numeric(5,2),
    waist_change_cm numeric(5,2),
    indicator_value numeric(5,2),
    status character varying(20) NOT NULL,
    consecutive_count integer DEFAULT 1,
    previous_status character varying(20),
    status_confirmed boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT icg_ipg_state_history_indicator_type_check CHECK (((indicator_type)::text = ANY (ARRAY[('icg'::character varying)::text, ('ipg'::character varying)::text, ('iec'::character varying)::text]))),
    CONSTRAINT icg_ipg_state_history_status_check CHECK (((status)::text = ANY (ARRAY[('red'::character varying)::text, ('yellow'::character varying)::text, ('green'::character varying)::text, ('green_plus'::character varying)::text, ('neutral'::character varying)::text, ('unstable'::character varying)::text, ('rojo'::character varying)::text, ('amarillo'::character varying)::text, ('verde'::character varying)::text, ('verde_plus'::character varying)::text])))
);


--
-- Name: icg_ipg_state_history_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.icg_ipg_state_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: icg_ipg_state_history_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.icg_ipg_state_history_id_seq OWNED BY app.icg_ipg_state_history.id;


--
-- Name: level_reevaluations; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.level_reevaluations (
    id integer NOT NULL,
    user_id integer NOT NULL,
    previous_level character varying(50) NOT NULL,
    previous_confidence numeric(3,2),
    new_level character varying(50) NOT NULL,
    new_confidence numeric(3,2),
    reason character varying(255) NOT NULL,
    microcycles_completed integer,
    sessions_completed integer,
    avg_rir_last_month numeric(3,1),
    adherence_percentage numeric(5,2),
    progression_rate numeric(5,2),
    fatigue_flags_count integer,
    accepted boolean,
    accepted_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: level_reevaluations_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.level_reevaluations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: level_reevaluations_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.level_reevaluations_id_seq OWNED BY app.level_reevaluations.id;


--
-- Name: manual_methodology_exercise_feedback; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.manual_methodology_exercise_feedback (
    id integer NOT NULL,
    methodology_session_id integer NOT NULL,
    user_id integer NOT NULL,
    exercise_name character varying(200),
    exercise_order integer,
    sentiment character varying(50),
    comment text,
    difficulty_rating integer,
    effort_rating integer,
    personal_notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: manual_methodology_exercise_feedback_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.manual_methodology_exercise_feedback_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: manual_methodology_exercise_feedback_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.manual_methodology_exercise_feedback_id_seq OWNED BY app.manual_methodology_exercise_feedback.id;


--
-- Name: meal_acceptability_rules; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.meal_acceptability_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meal_type text NOT NULL,
    diet_type text DEFAULT 'AMBOS'::text NOT NULL,
    max_processed_items smallint DEFAULT 1 NOT NULL,
    forbidden_families text[] DEFAULT ARRAY[]::text[] NOT NULL,
    required_families text[] DEFAULT ARRAY[]::text[] NOT NULL,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT meal_acceptability_rules_diet_type_check CHECK ((diet_type = ANY (ARRAY['AMBOS'::text, 'VEG'::text]))),
    CONSTRAINT meal_acceptability_rules_max_processed_items_check CHECK ((max_processed_items >= 0)),
    CONSTRAINT meal_acceptability_rules_meal_type_check CHECK ((meal_type = ANY (ARRAY['DESAYUNO'::text, 'COMIDA'::text, 'CENA'::text, 'SNACK'::text])))
);


--
-- Name: meal_template_slots; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.meal_template_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    slot_order integer NOT NULL,
    slot_role text NOT NULL,
    slot_note text,
    quantity_hint text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: meal_templates; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.meal_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_code text NOT NULL,
    template_name text NOT NULL,
    meal_type text NOT NULL,
    diet_allowed text NOT NULL,
    day_context text DEFAULT 'AMBOS'::text NOT NULL,
    phase_bias text,
    satiety_bias text,
    is_active boolean DEFAULT true NOT NULL,
    source text DEFAULT 'mindfeed_excel'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT chk_meal_templates_diet_allowed CHECK ((diet_allowed = ANY (ARRAY['AMBOS'::text, 'VEG'::text]))),
    CONSTRAINT chk_meal_templates_meal_type CHECK ((meal_type = ANY (ARRAY['DESAYUNO'::text, 'COMIDA'::text, 'CENA'::text, 'SNACK'::text])))
);


--
-- Name: menstrual_cycle_history; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.menstrual_cycle_history (
    id integer NOT NULL,
    user_id integer NOT NULL,
    bleed_start_date date NOT NULL,
    cycle_length_days integer,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT menstrual_cycle_history_cycle_length_days_check CHECK (((cycle_length_days >= 21) AND (cycle_length_days <= 45)))
);


--
-- Name: menstrual_cycle_history_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.menstrual_cycle_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: menstrual_cycle_history_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.menstrual_cycle_history_id_seq OWNED BY app.menstrual_cycle_history.id;


--
-- Name: menstrual_daily_log; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.menstrual_daily_log (
    id integer NOT NULL,
    user_id integer,
    log_date date NOT NULL,
    is_period_day boolean DEFAULT false,
    energy_level integer,
    pain_level integer,
    sleep_quality integer,
    mood integer,
    bloating integer,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    pain_0_3 integer,
    fatigue_0_3 integer,
    sleep_0_3 integer,
    stress_0_3 integer,
    pain_next_day_0_10 integer,
    session_quality_0_10 integer,
    CONSTRAINT menstrual_daily_log_bloating_check CHECK (((bloating >= 1) AND (bloating <= 5))),
    CONSTRAINT menstrual_daily_log_energy_level_check CHECK (((energy_level >= 1) AND (energy_level <= 5))),
    CONSTRAINT menstrual_daily_log_fatigue_0_3_check CHECK (((fatigue_0_3 IS NULL) OR ((fatigue_0_3 >= 0) AND (fatigue_0_3 <= 3)))),
    CONSTRAINT menstrual_daily_log_mood_check CHECK (((mood >= 1) AND (mood <= 5))),
    CONSTRAINT menstrual_daily_log_pain_0_3_check CHECK (((pain_0_3 IS NULL) OR ((pain_0_3 >= 0) AND (pain_0_3 <= 3)))),
    CONSTRAINT menstrual_daily_log_pain_level_check CHECK (((pain_level >= 1) AND (pain_level <= 5))),
    CONSTRAINT menstrual_daily_log_pain_next_day_0_10_check CHECK (((pain_next_day_0_10 IS NULL) OR ((pain_next_day_0_10 >= 0) AND (pain_next_day_0_10 <= 10)))),
    CONSTRAINT menstrual_daily_log_session_quality_0_10_check CHECK (((session_quality_0_10 IS NULL) OR ((session_quality_0_10 >= 0) AND (session_quality_0_10 <= 10)))),
    CONSTRAINT menstrual_daily_log_sleep_0_3_check CHECK (((sleep_0_3 IS NULL) OR ((sleep_0_3 >= 0) AND (sleep_0_3 <= 3)))),
    CONSTRAINT menstrual_daily_log_sleep_quality_check CHECK (((sleep_quality >= 1) AND (sleep_quality <= 5))),
    CONSTRAINT menstrual_daily_log_stress_0_3_check CHECK (((stress_0_3 IS NULL) OR ((stress_0_3 >= 0) AND (stress_0_3 <= 3))))
);


--
-- Name: menstrual_daily_log_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.menstrual_daily_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: menstrual_daily_log_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.menstrual_daily_log_id_seq OWNED BY app.menstrual_daily_log.id;


--
-- Name: menstrual_deload_state; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.menstrual_deload_state (
    id integer NOT NULL,
    user_id integer NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT menstrual_deload_state_check CHECK ((start_date <= end_date))
);


--
-- Name: menstrual_deload_state_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.menstrual_deload_state_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: menstrual_deload_state_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.menstrual_deload_state_id_seq OWNED BY app.menstrual_deload_state.id;


--
-- Name: menstrual_pattern_metrics; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.menstrual_pattern_metrics (
    id integer NOT NULL,
    user_id integer NOT NULL,
    pattern text NOT NULL,
    last_sessions jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: menstrual_pattern_metrics_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.menstrual_pattern_metrics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: menstrual_pattern_metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.menstrual_pattern_metrics_id_seq OWNED BY app.menstrual_pattern_metrics.id;


--
-- Name: methodology_exercise_feedback; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.methodology_exercise_feedback (
    id integer NOT NULL,
    methodology_session_id integer NOT NULL,
    user_id integer NOT NULL,
    exercise_name character varying(200),
    exercise_order integer,
    sentiment character varying(50),
    comment text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: methodology_exercise_feedback_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.methodology_exercise_feedback_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: methodology_exercise_feedback_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.methodology_exercise_feedback_id_seq OWNED BY app.methodology_exercise_feedback.id;


--
-- Name: methodology_exercise_history_complete; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.methodology_exercise_history_complete (
    id integer NOT NULL,
    user_id integer NOT NULL,
    methodology_plan_id integer,
    methodology_session_id integer,
    exercise_name character varying(255) NOT NULL,
    exercise_order integer NOT NULL,
    methodology_type character varying(100),
    series_total character varying(50),
    series_completed integer DEFAULT 0,
    repeticiones character varying(100),
    intensidad character varying(100),
    tiempo_dedicado_segundos integer,
    week_number integer,
    day_name character varying(20),
    session_date date,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    warmup_time_seconds integer DEFAULT 0
);


--
-- Name: methodology_exercise_history_complete_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.methodology_exercise_history_complete_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: methodology_exercise_history_complete_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.methodology_exercise_history_complete_id_seq OWNED BY app.methodology_exercise_history_complete.id;


--
-- Name: methodology_exercise_progress; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.methodology_exercise_progress (
    id integer NOT NULL,
    user_id integer NOT NULL,
    methodology_session_id integer NOT NULL,
    exercise_name character varying(200) NOT NULL,
    exercise_order integer,
    exercise_level character varying(20) DEFAULT 'básico'::character varying,
    total_sets text DEFAULT 0,
    sets_completed integer DEFAULT 0,
    total_reps text DEFAULT 0,
    reps_completed text DEFAULT 0,
    planned_duration_seconds text DEFAULT 0,
    actual_duration_seconds text DEFAULT 0,
    rest_seconds integer DEFAULT 0,
    status character varying(20) DEFAULT 'pending'::character varying,
    difficulty_rating integer,
    effort_rating integer,
    exercise_notes text,
    additional_info text,
    was_difficult boolean,
    personal_feedback text,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    series_total text DEFAULT 0,
    repeticiones text DEFAULT 0,
    descanso_seg integer DEFAULT 0,
    intensidad character varying(50),
    tempo character varying(60),
    notas text,
    series_completed integer DEFAULT 0,
    time_spent_seconds integer DEFAULT 0,
    modal_opened_at timestamp without time zone,
    modal_closed_at timestamp without time zone,
    exercise_id bigint,
    gif_url text,
    video_url text
);


--
-- Name: methodology_exercise_progress_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.methodology_exercise_progress_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: methodology_exercise_progress_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.methodology_exercise_progress_id_seq OWNED BY app.methodology_exercise_progress.id;


--
-- Name: methodology_exercise_sessions; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.methodology_exercise_sessions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    methodology_plan_id integer NOT NULL,
    methodology_type character varying(100),
    methodology_level character varying(20) DEFAULT 'básico'::character varying,
    session_name character varying(200),
    week_number integer,
    day_name character varying(20),
    session_date date DEFAULT CURRENT_DATE,
    total_exercises integer DEFAULT 0,
    exercises_completed integer DEFAULT 0,
    exercises_skipped integer DEFAULT 0,
    exercises_cancelled integer DEFAULT 0,
    exercises_in_progress integer DEFAULT 0,
    session_status character varying(20) DEFAULT 'pending'::character varying,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    total_duration_seconds integer DEFAULT 0,
    difficulty_rating integer,
    effort_rating integer,
    progress_notes text,
    evolution_point character varying(50),
    target_point character varying(50),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    day_of_month integer,
    month_name character varying(20),
    month_number integer,
    year_number integer DEFAULT EXTRACT(year FROM CURRENT_DATE),
    actual_session_duration_seconds integer DEFAULT 0,
    modal_time_total_seconds integer DEFAULT 0,
    warmup_time_seconds integer DEFAULT 0,
    current_exercise_index integer DEFAULT 0,
    exercises_data jsonb DEFAULT '[]'::jsonb,
    session_metadata jsonb DEFAULT '{}'::jsonb,
    is_current_session boolean DEFAULT false,
    cancelled_at timestamp without time zone,
    session_type character varying(50) DEFAULT 'methodology'::character varying,
    session_template_id integer,
    day_id integer,
    completion_rate numeric(5,2) DEFAULT 0,
    session_started_at timestamp without time zone,
    CONSTRAINT check_session_status CHECK (((session_status)::text = ANY (ARRAY['scheduled'::text, 'pending'::text, 'in_progress'::text, 'completed'::text, 'partial'::text, 'cancelled'::text, 'skipped'::text, 'missed'::text, 'incomplete'::text, 'abandoned'::text])))
);


--
-- Name: methodology_exercise_sessions_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.methodology_exercise_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: methodology_exercise_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.methodology_exercise_sessions_id_seq OWNED BY app.methodology_exercise_sessions.id;


--
-- Name: methodology_plan_days; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.methodology_plan_days (
    plan_id integer NOT NULL,
    day_id integer NOT NULL,
    date_local date NOT NULL,
    day_name text NOT NULL,
    week_number integer NOT NULL,
    is_rest boolean DEFAULT true,
    planned_exercises_count integer DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: methodology_plans; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.methodology_plans (
    id integer NOT NULL,
    nombre_ejercicio text,
    nivel text,
    repeticiones integer,
    series integer,
    duracion integer,
    categoria text,
    patron text,
    equipamiento text,
    criterio_progreso text,
    progresion_desde text,
    progresion_hacia text,
    notas text,
    activo boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    user_id integer,
    methodology_type character varying(100),
    plan_data jsonb,
    generation_mode character varying(20),
    status character varying(20) DEFAULT 'draft'::character varying,
    confirmed_at timestamp with time zone,
    version_type character varying(50),
    custom_weeks integer,
    selection_mode character varying(50),
    plan_start_date date,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    current_week integer DEFAULT 1,
    current_day character varying(20),
    current_exercise_index integer DEFAULT 0,
    plan_progress jsonb DEFAULT '{}'::jsonb,
    last_session_date date,
    plan_start_datetime timestamp with time zone,
    plan_timezone text,
    total_days integer,
    plan_name text,
    plan_description text,
    origin text DEFAULT 'methodology'::text,
    is_current boolean DEFAULT false,
    CONSTRAINT methodology_plans_new_categoria_check CHECK ((categoria = ANY (ARRAY['traccion'::text, 'empuje'::text, 'piernas'::text, 'core'::text, 'equilibrado'::text, 'soporte'::text]))),
    CONSTRAINT methodology_plans_new_nivel_check CHECK ((nivel = ANY (ARRAY['basico'::text, 'intermedio'::text, 'avanzado'::text])))
);


--
-- Name: methodology_plans_new_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.methodology_plans_new_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: methodology_plans_new_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.methodology_plans_new_id_seq OWNED BY app.methodology_plans.id;


--
-- Name: methodology_session_feedback; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.methodology_session_feedback (
    id bigint NOT NULL,
    user_id integer NOT NULL,
    methodology_plan_id integer NOT NULL,
    methodology_session_id integer,
    exercise_order integer,
    exercise_name text,
    feedback_type text,
    reason_code text,
    reason_text text,
    created_at timestamp without time zone DEFAULT now(),
    difficulty_rating integer,
    would_retry boolean DEFAULT false,
    alternative_suggested text,
    CONSTRAINT methodology_session_feedback_difficulty_rating_check CHECK (((difficulty_rating >= 1) AND (difficulty_rating <= 5))),
    CONSTRAINT methodology_session_feedback_feedback_type_check CHECK ((feedback_type = ANY (ARRAY['skipped'::text, 'cancelled'::text]))),
    CONSTRAINT methodology_session_feedback_reason_code_check CHECK ((reason_code = ANY (ARRAY['dificil'::text, 'no_se_ejecutar'::text, 'lesion'::text, 'equipamiento'::text, 'cansancio'::text, 'tiempo'::text, 'motivacion'::text, 'auto_missed'::text, 'otros'::text])))
);


--
-- Name: methodology_session_feedback_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.methodology_session_feedback_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: methodology_session_feedback_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.methodology_session_feedback_id_seq OWNED BY app.methodology_session_feedback.id;


--
-- Name: mindfeed_priority_events; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.mindfeed_priority_events (
    id bigint NOT NULL,
    user_id integer NOT NULL,
    methodology_plan_id integer,
    muscle_group character varying(100) NOT NULL,
    action character varying(50) NOT NULL,
    reason character varying(200),
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mindfeed_priority_events_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.mindfeed_priority_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mindfeed_priority_events_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.mindfeed_priority_events_id_seq OWNED BY app.mindfeed_priority_events.id;


--
-- Name: mindfeed_rulesets; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.mindfeed_rulesets (
    id bigint NOT NULL,
    scope character varying(100) NOT NULL,
    version character varying(50) NOT NULL,
    rules jsonb NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mindfeed_rulesets_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.mindfeed_rulesets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mindfeed_rulesets_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.mindfeed_rulesets_id_seq OWNED BY app.mindfeed_rulesets.id;


--
-- Name: mindfeed_transition_events; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.mindfeed_transition_events (
    id bigint NOT NULL,
    user_id integer NOT NULL,
    methodology_plan_id integer,
    source_block character varying(100) NOT NULL,
    target_block character varying(100) NOT NULL,
    action character varying(50) NOT NULL,
    reason character varying(200),
    baseline jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mindfeed_transition_events_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.mindfeed_transition_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mindfeed_transition_events_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.mindfeed_transition_events_id_seq OWNED BY app.mindfeed_transition_events.id;


--
-- Name: music_playlists; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.music_playlists (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name character varying(255) NOT NULL,
    tracks jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_playlist_name_length CHECK (((length(TRIM(BOTH FROM name)) > 0) AND (length((name)::text) <= 255))),
    CONSTRAINT chk_tracks_is_array CHECK ((jsonb_typeof(tracks) = 'array'::text))
);


--
-- Name: music_playlists_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.music_playlists_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: music_playlists_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.music_playlists_id_seq OWNED BY app.music_playlists.id;


--
-- Name: nutrition_adjustment_actions; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.nutrition_adjustment_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    mode text DEFAULT 'quincenal'::text NOT NULL,
    source text DEFAULT 'auto'::text NOT NULL,
    previous_plan_id uuid NOT NULL,
    new_plan_id uuid NOT NULL,
    previous_kcal integer NOT NULL,
    new_kcal integer NOT NULL,
    delta_kcal integer NOT NULL,
    reason text,
    metrics jsonb,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    undo_expires_at timestamp with time zone NOT NULL,
    reverted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT nutrition_adjustment_actions_mode_check CHECK ((mode = ANY (ARRAY['quincenal'::text, 'seguridad'::text]))),
    CONSTRAINT nutrition_adjustment_actions_source_check CHECK ((source = ANY (ARRAY['auto'::text, 'manual'::text])))
);


--
-- Name: nutrition_calibrations; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.nutrition_calibrations (
    id integer NOT NULL,
    user_id integer NOT NULL,
    calibration_date date DEFAULT CURRENT_DATE,
    evaluation_period_days integer DEFAULT 14,
    peso_inicial_kg numeric(5,2) NOT NULL,
    peso_final_kg numeric(5,2) NOT NULL,
    peso_medio_7dias_kg numeric(5,2) NOT NULL,
    peso_change_kg numeric(5,2),
    peso_change_pct numeric(5,3),
    weekly_change_pct numeric(5,3),
    current_kcal_objetivo integer NOT NULL,
    previous_tdee integer NOT NULL,
    objetivo character varying(20) NOT NULL,
    adjustment_kcal integer,
    adjustment_reason text,
    should_adjust boolean DEFAULT false,
    applied boolean DEFAULT false,
    new_kcal_objetivo integer,
    applied_at timestamp without time zone,
    user_feedback text,
    performance_notes text,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT nutrition_calibrations_objetivo_check CHECK (((objetivo)::text = ANY (ARRAY[('cut'::character varying)::text, ('mant'::character varying)::text, ('bulk'::character varying)::text])))
);


--
-- Name: nutrition_calibrations_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.nutrition_calibrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nutrition_calibrations_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.nutrition_calibrations_id_seq OWNED BY app.nutrition_calibrations.id;


--
-- Name: nutrition_change_log; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.nutrition_change_log (
    id integer NOT NULL,
    user_id integer NOT NULL,
    change_date date DEFAULT CURRENT_DATE,
    change_type character varying(30) NOT NULL,
    delta jsonb,
    rule_id character varying(50),
    reason text,
    metrics jsonb,
    previous_values jsonb,
    new_values jsonb,
    source character varying(30),
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT nutrition_change_log_change_type_check CHECK (((change_type)::text = ANY (ARRAY[('kcal_adjust'::character varying)::text, ('macro_adjust'::character varying)::text, ('phase_change'::character varying)::text, ('carb_cycle_adjust'::character varying)::text, ('activity_factor_adjust'::character varying)::text])))
);


--
-- Name: nutrition_change_log_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.nutrition_change_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nutrition_change_log_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.nutrition_change_log_id_seq OWNED BY app.nutrition_change_log.id;


--
-- Name: nutrition_evaluations; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.nutrition_evaluations (
    id integer NOT NULL,
    user_id integer NOT NULL,
    evaluation_date date NOT NULL,
    phase character varying(20) NOT NULL,
    indicator_type character varying(10) NOT NULL,
    indicator_value numeric(5,2),
    status character varying(20) NOT NULL,
    interpretation text,
    action_recommended text,
    alerts jsonb,
    needs_confirmation boolean DEFAULT false,
    measurement_data jsonb,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: nutrition_evaluations_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.nutrition_evaluations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nutrition_evaluations_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.nutrition_evaluations_id_seq OWNED BY app.nutrition_evaluations.id;


--
-- Name: nutrition_guidelines; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.nutrition_guidelines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    version text NOT NULL,
    titulo text NOT NULL,
    contenido jsonb NOT NULL,
    source text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: nutrition_meal_items; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.nutrition_meal_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meal_id uuid NOT NULL,
    alimento_id uuid,
    descripcion text NOT NULL,
    cantidad_g numeric(6,1) NOT NULL,
    kcal integer NOT NULL,
    macros jsonb NOT NULL,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    orden integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    food_id uuid,
    estado_pesado_base text,
    estado_pesado_mostrado text,
    cantidad_g_base numeric(10,2),
    cantidad_g_mostrada numeric(10,2),
    CONSTRAINT check_meal_item_estado_base CHECK (((estado_pesado_base IS NULL) OR (estado_pesado_base = ANY (ARRAY['crudo'::text, 'cocido'::text, 'escurrido'::text, 'seco'::text, 'tal_cual'::text])))),
    CONSTRAINT check_meal_item_estado_mostrado CHECK (((estado_pesado_mostrado IS NULL) OR (estado_pesado_mostrado = ANY (ARRAY['crudo'::text, 'cocido'::text, 'escurrido'::text, 'seco'::text, 'tal_cual'::text]))))
);


--
-- Name: nutrition_meals; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.nutrition_meals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_day_id uuid NOT NULL,
    orden integer NOT NULL,
    nombre text NOT NULL,
    hora_sugerida time without time zone,
    kcal integer NOT NULL,
    macros jsonb NOT NULL,
    timing_note text,
    notas text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    meal_type character varying(20) DEFAULT 'SNACK'::character varying NOT NULL,
    CONSTRAINT nutrition_meals_meal_type_check CHECK (((meal_type)::text = ANY (ARRAY[('DESAYUNO'::character varying)::text, ('SNACK'::character varying)::text, ('COMIDA'::character varying)::text, ('CENA'::character varying)::text])))
);


--
-- Name: nutrition_menu_generation_logs; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.nutrition_menu_generation_logs (
    id bigint NOT NULL,
    user_id integer NOT NULL,
    plan_id uuid,
    day_id uuid,
    meal_id uuid,
    mode_requested text NOT NULL,
    mode_used text NOT NULL,
    model_used text,
    fallback_used boolean DEFAULT false NOT NULL,
    fallback_reason text,
    tokens_used integer,
    latency_ms integer,
    request_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    result_summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: nutrition_menu_generation_logs_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

ALTER TABLE app.nutrition_menu_generation_logs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME app.nutrition_menu_generation_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: nutrition_phase_history; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.nutrition_phase_history (
    id integer NOT NULL,
    user_id integer NOT NULL,
    phase character varying(20) NOT NULL,
    reason text,
    started_at timestamp without time zone DEFAULT now() NOT NULL,
    ended_at timestamp without time zone,
    evaluation_data jsonb
);


--
-- Name: nutrition_phase_history_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.nutrition_phase_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nutrition_phase_history_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.nutrition_phase_history_id_seq OWNED BY app.nutrition_phase_history.id;


--
-- Name: nutrition_plan_days; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.nutrition_plan_days (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_id uuid NOT NULL,
    day_index integer NOT NULL,
    tipo_dia text NOT NULL,
    kcal integer NOT NULL,
    macros jsonb NOT NULL,
    notas text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT nutrition_plan_days_tipo_dia_check CHECK ((tipo_dia = ANY (ARRAY['entreno'::text, 'descanso'::text])))
);


--
-- Name: nutrition_plans; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.nutrition_plans (
    id integer NOT NULL,
    user_id integer NOT NULL,
    plan_data jsonb NOT NULL,
    duration_days integer DEFAULT 7 NOT NULL,
    target_calories integer DEFAULT 2000 NOT NULL,
    target_protein numeric(6,2) DEFAULT 150.00 NOT NULL,
    target_carbs numeric(6,2) DEFAULT 200.00 NOT NULL,
    target_fat numeric(6,2) DEFAULT 65.00 NOT NULL,
    meals_per_day integer DEFAULT 4 NOT NULL,
    methodology_focus character varying(100),
    dietary_style character varying(50) DEFAULT 'none'::character varying,
    is_active boolean DEFAULT true,
    generation_mode character varying(20) DEFAULT 'ai_generated'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: nutrition_plans_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.nutrition_plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nutrition_plans_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.nutrition_plans_id_seq OWNED BY app.nutrition_plans.id;


--
-- Name: nutrition_plans_v2; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.nutrition_plans_v2 (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    plan_name text,
    tipo text DEFAULT 'borrador'::text NOT NULL,
    bmr integer,
    tdee integer,
    kcal_objetivo integer NOT NULL,
    macros_objetivo jsonb NOT NULL,
    meta text NOT NULL,
    duracion_dias integer NOT NULL,
    training_type text,
    comidas_por_dia integer DEFAULT 4,
    fuente text DEFAULT 'determinista'::text NOT NULL,
    version_reglas text DEFAULT 'v1'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT nutrition_plans_v2_comidas_por_dia_check CHECK (((comidas_por_dia >= 1) AND (comidas_por_dia <= 6))),
    CONSTRAINT nutrition_plans_v2_duracion_dias_check CHECK (((duracion_dias >= 3) AND (duracion_dias <= 31))),
    CONSTRAINT nutrition_plans_v2_fuente_check CHECK ((fuente = ANY (ARRAY['determinista'::text, 'ia'::text, 'hibrido'::text]))),
    CONSTRAINT nutrition_plans_v2_meta_check CHECK ((meta = ANY (ARRAY['cut'::text, 'mant'::text, 'bulk'::text]))),
    CONSTRAINT nutrition_plans_v2_tipo_check CHECK ((tipo = ANY (ARRAY['borrador'::text, 'activo'::text, 'archivado'::text])))
);


--
-- Name: nutrition_profiles; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.nutrition_profiles (
    user_id integer NOT NULL,
    sexo text NOT NULL,
    edad integer NOT NULL,
    altura_cm integer NOT NULL,
    peso_kg numeric(5,2) NOT NULL,
    objetivo text NOT NULL,
    actividad text NOT NULL,
    comidas_dia integer DEFAULT 4 NOT NULL,
    preferencias jsonb DEFAULT '{}'::jsonb NOT NULL,
    alergias jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    current_phase character varying(20) DEFAULT 'normocalorica'::character varying,
    phase_started_at timestamp without time zone DEFAULT now(),
    phase_change_reason text,
    level character varying(20) DEFAULT 'INTERMEDIO'::character varying,
    metabolic_type character varying,
    formula_preferida character varying,
    training_days integer,
    activity_factor numeric,
    waist_cm numeric,
    bodyfat_percent numeric,
    steps_per_day integer,
    metabolic_score integer,
    metabolic_confidence character varying,
    metabolic_pending_type character varying,
    metabolic_pending_count integer DEFAULT 0,
    metabolic_last_evaluated_at date,
    nutrition_overrides_profile boolean DEFAULT false NOT NULL,
    auto_calibrate boolean DEFAULT true,
    kcal_objetivo integer,
    tdee integer,
    CONSTRAINT nutrition_profiles_actividad_check CHECK ((actividad = ANY (ARRAY['sedentario'::text, 'ligero'::text, 'moderado'::text, 'alto'::text, 'muy_alto'::text, 'ligeramente_activo'::text, 'activo'::text, 'muy_activo'::text]))),
    CONSTRAINT nutrition_profiles_altura_cm_check CHECK (((altura_cm >= 120) AND (altura_cm <= 230))),
    CONSTRAINT nutrition_profiles_comidas_dia_check CHECK (((comidas_dia >= 1) AND (comidas_dia <= 6))),
    CONSTRAINT nutrition_profiles_edad_check CHECK (((edad >= 13) AND (edad <= 90))),
    CONSTRAINT nutrition_profiles_objetivo_check CHECK ((objetivo = ANY (ARRAY['cut'::text, 'mant'::text, 'bulk'::text]))),
    CONSTRAINT nutrition_profiles_peso_kg_check CHECK (((peso_kg >= (30)::numeric) AND (peso_kg <= (250)::numeric))),
    CONSTRAINT nutrition_profiles_sexo_check CHECK ((sexo = ANY (ARRAY['hombre'::text, 'mujer'::text])))
);


--
-- Name: nutrition_weekly_snapshots; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.nutrition_weekly_snapshots (
    id integer NOT NULL,
    user_id integer NOT NULL,
    snapshot_date date NOT NULL,
    phase character varying(30),
    kcal_objetivo integer,
    kcal_semanal integer,
    metabolic_profile jsonb,
    macros jsonb,
    indicator jsonb,
    cls_score integer,
    flags jsonb,
    adherence jsonb,
    source character varying(30),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: nutrition_weekly_snapshots_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.nutrition_weekly_snapshots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: nutrition_weekly_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.nutrition_weekly_snapshots_id_seq OWNED BY app.nutrition_weekly_snapshots.id;


--
-- Name: oposiciones_autoreg_state; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.oposiciones_autoreg_state (
    user_id integer NOT NULL,
    methodology_plan_id integer,
    microcycles_completed integer DEFAULT 0 NOT NULL,
    easy_streak integer DEFAULT 0 NOT NULL,
    hard_streak integer DEFAULT 0 NOT NULL,
    deload_suggested boolean DEFAULT false NOT NULL,
    last_decision character varying(20),
    last_avg_rir numeric,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    last_subjective numeric
);


--
-- Name: pending_reevaluations; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.pending_reevaluations AS
 SELECT id,
    user_id,
    previous_level,
    new_level,
    reason,
    new_confidence,
    adherence_percentage,
    avg_rir_last_month,
    created_at,
    EXTRACT(day FROM (now() - (created_at)::timestamp with time zone)) AS days_pending
   FROM app.level_reevaluations r
  WHERE (accepted IS NULL)
  ORDER BY created_at DESC;


--
-- Name: plan_progression_offsets; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.plan_progression_offsets (
    user_id integer NOT NULL,
    methodology_plan_id integer NOT NULL,
    rep_offset integer DEFAULT 0 NOT NULL,
    weight_pct numeric(6,2) DEFAULT 0 NOT NULL,
    deload_pending boolean DEFAULT false NOT NULL,
    progress_count integer DEFAULT 0 NOT NULL,
    deload_count integer DEFAULT 0 NOT NULL,
    last_decision character varying(20),
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: plan_start_config; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.plan_start_config (
    methodology_plan_id integer NOT NULL,
    start_day_of_week integer NOT NULL,
    is_consecutive_days boolean DEFAULT false,
    intensity_adjusted boolean DEFAULT false,
    is_extended_weeks boolean DEFAULT false,
    first_week_pattern text,
    regular_pattern text,
    total_weeks integer DEFAULT 4,
    expected_sessions integer DEFAULT 12,
    day_mappings jsonb,
    warnings jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    user_id integer NOT NULL,
    start_date date NOT NULL,
    original_pattern text,
    distribution_option text,
    include_saturdays boolean DEFAULT false
);


--
-- Name: powerlifting_autoreg_state; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.powerlifting_autoreg_state (
    user_id integer NOT NULL,
    methodology_plan_id integer,
    sessions_completed integer DEFAULT 0 NOT NULL,
    easy_streak integer DEFAULT 0 NOT NULL,
    hard_streak integer DEFAULT 0 NOT NULL,
    deload_suggested boolean DEFAULT false NOT NULL,
    last_decision character varying(20),
    last_rpe numeric,
    last_target_met boolean,
    last_good_technique boolean,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    last_subjective numeric
);


--
-- Name: progreso_usuario; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.progreso_usuario (
    id integer NOT NULL,
    user_id integer NOT NULL,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    peso numeric(5,2),
    nivel_fuerza text,
    objetivos_completados integer DEFAULT 0,
    tiempo_total_entrenamiento integer DEFAULT 0,
    ejercicios_dominados text[],
    notas text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: progreso_usuario_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.progreso_usuario_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: progreso_usuario_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.progreso_usuario_id_seq OWNED BY app.progreso_usuario.id;


--
-- Name: re_evaluation_exercises; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.re_evaluation_exercises (
    id integer NOT NULL,
    re_evaluation_id integer NOT NULL,
    exercise_name character varying(255) NOT NULL,
    exercise_id character varying(100),
    series_achieved integer,
    reps_achieved character varying(100),
    weight_kg numeric(6,2),
    difficulty_rating character varying(50),
    notes text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: re_evaluation_exercises_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.re_evaluation_exercises_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: re_evaluation_exercises_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.re_evaluation_exercises_id_seq OWNED BY app.re_evaluation_exercises.id;


--
-- Name: recipe_items; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.recipe_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipe_id uuid NOT NULL,
    food_id uuid NOT NULL,
    slot_order integer NOT NULL,
    role text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recipe_items_slot_order_check CHECK ((slot_order > 0))
);


--
-- Name: recipe_tags; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.recipe_tags (
    recipe_id uuid NOT NULL,
    tag text NOT NULL
);


--
-- Name: recipes; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.recipes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipe_code text NOT NULL,
    name text NOT NULL,
    meal_type text NOT NULL,
    diet_allowed text DEFAULT 'AMBOS'::text NOT NULL,
    day_context text DEFAULT 'AMBOS'::text NOT NULL,
    template_code text,
    source text DEFAULT 'manual'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    name_normalized text,
    CONSTRAINT recipes_day_context_check CHECK ((day_context = ANY (ARRAY['AMBOS'::text, 'DEFINICION'::text, 'ENTRENO'::text, 'NORMO'::text, 'VOLUMEN'::text]))),
    CONSTRAINT recipes_diet_allowed_check CHECK ((diet_allowed = ANY (ARRAY['AMBOS'::text, 'VEG'::text]))),
    CONSTRAINT recipes_meal_type_check CHECK ((meal_type = ANY (ARRAY['DESAYUNO'::text, 'COMIDA'::text, 'CENA'::text, 'SNACK'::text])))
);


--
-- Name: technique_corrections; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.technique_corrections (
    id bigint NOT NULL,
    user_id integer NOT NULL,
    methodology_plan_id integer,
    session_id integer,
    muscle_group character varying(100) NOT NULL,
    corrections_count integer DEFAULT 1 NOT NULL,
    source character varying(50) DEFAULT 'manual'::character varying NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: technique_corrections_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.technique_corrections_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: technique_corrections_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.technique_corrections_id_seq OWNED BY app.technique_corrections.id;


--
-- Name: training_performance_log; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.training_performance_log (
    id integer NOT NULL,
    user_id integer NOT NULL,
    measurement_date date NOT NULL,
    performance_trend character varying(20) NOT NULL,
    performance_notes text,
    session_count_last_week integer,
    avg_rir numeric(3,1),
    fatigue_level character varying(20),
    source character varying(20) DEFAULT 'manual'::character varying,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT training_performance_log_fatigue_level_check CHECK (((fatigue_level)::text = ANY (ARRAY[('bajo'::character varying)::text, ('medio'::character varying)::text, ('alto'::character varying)::text, ('muy_alto'::character varying)::text]))),
    CONSTRAINT training_performance_log_performance_trend_check CHECK (((performance_trend)::text = ANY (ARRAY[('sube'::character varying)::text, ('mantiene'::character varying)::text, ('baja'::character varying)::text, ('no_aplica'::character varying)::text]))),
    CONSTRAINT training_performance_log_source_check CHECK (((source)::text = ANY (ARRAY[('manual'::character varying)::text, ('auto'::character varying)::text, ('session_based'::character varying)::text])))
);


--
-- Name: training_performance_log_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.training_performance_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: training_performance_log_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.training_performance_log_id_seq OWNED BY app.training_performance_log.id;


--
-- Name: user_body_measurements; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_body_measurements (
    id integer NOT NULL,
    user_id integer NOT NULL,
    peso_kg numeric(5,2) NOT NULL,
    cintura_cm numeric(5,2),
    cuello_cm numeric(5,2),
    cadera_cm numeric(5,2),
    pecho_cm numeric(5,2),
    brazo_cm numeric(5,2),
    pierna_cm numeric(5,2),
    bodyfat_percent numeric(4,2),
    muscle_mass_kg numeric(5,2),
    measurement_date date DEFAULT CURRENT_DATE,
    source character varying(20) DEFAULT 'manual'::character varying,
    flagged_suspicious boolean DEFAULT false,
    suspension_reason text,
    validated boolean DEFAULT true,
    notes text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT user_body_measurements_source_check CHECK (((source)::text = ANY (ARRAY[('manual'::character varying)::text, ('auto'::character varying)::text, ('calibration'::character varying)::text, ('integration'::character varying)::text])))
);


--
-- Name: user_body_measurements_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.user_body_measurements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_body_measurements_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.user_body_measurements_id_seq OWNED BY app.user_body_measurements.id;


--
-- Name: user_calibration_config; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_calibration_config (
    user_id integer NOT NULL,
    auto_calibrate boolean DEFAULT true,
    calibration_frequency_days integer DEFAULT 14,
    min_measurements_required integer DEFAULT 5,
    max_adjustment_kcal integer DEFAULT 250,
    notify_calibration boolean DEFAULT true,
    notify_suspicious_measurement boolean DEFAULT true,
    last_calibration_date date,
    next_calibration_date date,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT user_calibration_config_calibration_frequency_days_check CHECK (((calibration_frequency_days >= 7) AND (calibration_frequency_days <= 60)))
);


--
-- Name: user_custom_equipment; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_custom_equipment (
    id integer NOT NULL,
    user_id integer NOT NULL,
    equipment_name character varying(200) NOT NULL,
    equipment_type character varying(100),
    description text,
    is_available boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_custom_equipment_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.user_custom_equipment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_custom_equipment_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.user_custom_equipment_id_seq OWNED BY app.user_custom_equipment.id;


--
-- Name: user_equipment; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_equipment (
    id integer NOT NULL,
    user_id integer NOT NULL,
    equipment_type character varying(100) NOT NULL,
    has_equipment boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_equipment_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.user_equipment_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_equipment_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.user_equipment_id_seq OWNED BY app.user_equipment.id;


--
-- Name: user_exercise_feedback; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_exercise_feedback (
    id integer NOT NULL,
    user_id integer NOT NULL,
    session_id integer,
    exercise_order integer,
    exercise_name text,
    exercise_key text,
    sentiment text,
    comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    methodology_type character varying(50) NOT NULL,
    feedback_type character varying(50) NOT NULL,
    ai_weight numeric(3,2) DEFAULT 1.0,
    avoidance_duration_days integer,
    expires_at timestamp without time zone,
    plan_id integer,
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT user_exercise_feedback_sentiment_unified CHECK (((sentiment IS NULL) OR (sentiment = ANY (ARRAY['like'::text, 'dislike'::text, 'hard'::text]))))
);


--
-- Name: user_exercise_feedback_backup; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_exercise_feedback_backup (
    id integer,
    user_id integer,
    session_id integer,
    exercise_order integer,
    exercise_name text,
    exercise_key text,
    sentiment text,
    comment text,
    created_at timestamp with time zone
);


--
-- Name: user_exercise_feedback_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.user_exercise_feedback_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_exercise_feedback_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.user_exercise_feedback_id_seq OWNED BY app.user_exercise_feedback.id;


--
-- Name: users; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.users (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    nombre character varying(100) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    edad integer,
    sexo character varying(20),
    peso numeric(5,2),
    altura numeric(5,2),
    nivel_actividad character varying(50),
    "años_entrenando" integer,
    grasa_corporal numeric(5,2),
    masa_magra numeric(5,2),
    agua_corporal numeric(5,2),
    metabolismo_basal integer,
    cintura numeric(5,2),
    cuello numeric(5,2),
    cadera numeric(5,2),
    pecho numeric(5,2),
    brazo numeric(5,2),
    muslo numeric(5,2),
    metodologia character varying(50),
    enfoque character varying(50),
    horario_preferido character varying(50),
    objetivo_principal character varying(50),
    meta_peso numeric(5,2),
    meta_grasa numeric(5,2),
    historial_medico_docs jsonb DEFAULT '[]'::jsonb,
    alergias text[],
    medicamentos text[],
    suplementacion text[],
    alimentos_evitar text[],
    apellido character varying(100) NOT NULL,
    nivel_entrenamiento character varying(50) DEFAULT 'principiante'::character varying,
    anos_entrenando integer DEFAULT 0,
    frecuencia_semanal integer,
    metodologia_preferida character varying(100),
    brazos numeric(5,2),
    antebrazos numeric(5,2),
    historial_medico text,
    limitaciones_fisicas text[],
    meta_grasa_corporal numeric(4,2),
    enfoque_entrenamiento character varying(50),
    comidas_por_dia integer,
    alimentos_excluidos text[],
    last_login timestamp with time zone,
    is_active boolean DEFAULT true,
    email_verified boolean DEFAULT false,
    lesiones text[],
    fecha_inicio_objetivo date,
    fecha_meta_objetivo date,
    notas_progreso text,
    gemelo numeric(5,2),
    pliegue_abdominal numeric(6,2),
    peso_inicio_objetivo numeric,
    objetivo_activo_desde date,
    CONSTRAINT chk_anos_entrenando_nonneg CHECK ((anos_entrenando >= 0)),
    CONSTRAINT chk_frecuencia_semanal_range CHECK (((frecuencia_semanal >= 0) AND (frecuencia_semanal <= 7))),
    CONSTRAINT users_anos_entrenando_chk CHECK ((anos_entrenando >= 0)),
    CONSTRAINT users_enfoque_check CHECK (((enfoque)::text = ANY (ARRAY[('fuerza'::character varying)::text, ('hipertrofia'::character varying)::text, ('resistencia'::character varying)::text, ('perdida_peso'::character varying)::text, ('general'::character varying)::text]))),
    CONSTRAINT users_horario_preferido_check CHECK (((horario_preferido)::text = ANY (ARRAY[('mañana'::character varying)::text, ('media_mañana'::character varying)::text, ('tarde'::character varying)::text, ('noche'::character varying)::text]))),
    CONSTRAINT users_metodologia_check CHECK (((metodologia)::text = ANY (ARRAY[('tradicional'::character varying)::text, ('funcional'::character varying)::text, ('crossfit'::character varying)::text, ('calistenia'::character varying)::text, ('powerlifting'::character varying)::text, ('bodybuilding'::character varying)::text]))),
    CONSTRAINT users_nivel_actividad_check CHECK (((nivel_actividad)::text = ANY (ARRAY[('sedentario'::character varying)::text, ('ligero'::character varying)::text, ('moderado'::character varying)::text, ('activo'::character varying)::text, ('muy_activo'::character varying)::text]))),
    CONSTRAINT users_objetivo_principal_check CHECK (((objetivo_principal)::text = ANY (ARRAY[('ganar_peso'::character varying)::text, ('rehabilitacion'::character varying)::text, ('perder_peso'::character varying)::text, ('tonificar'::character varying)::text, ('ganar_masa_muscular'::character varying)::text, ('mejorar_resistencia'::character varying)::text, ('mejorar_flexibilidad'::character varying)::text, ('salud_general'::character varying)::text, ('mantenimiento'::character varying)::text]))),
    CONSTRAINT users_sexo_check CHECK (((sexo)::text = ANY (ARRAY[('masculino'::character varying)::text, ('femenino'::character varying)::text])))
);


--
-- Name: user_fatigue_summary; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.user_fatigue_summary AS
 SELECT u.id AS user_id,
    u.email,
    count(*) FILTER (WHERE (ff.flag_date >= (now() - '7 days'::interval))) AS flags_last_7_days,
    count(*) FILTER (WHERE (((ff.flag_type)::text = 'light'::text) AND (ff.flag_date >= (now() - '7 days'::interval)))) AS light_flags_7d,
    count(*) FILTER (WHERE (((ff.flag_type)::text = 'critical'::text) AND (ff.flag_date >= (now() - '7 days'::interval)))) AS critical_flags_7d,
    max(ff.flag_date) AS last_flag_date,
    ( SELECT fatigue_flags.flag_type
           FROM app.fatigue_flags
          WHERE (fatigue_flags.user_id = u.id)
          ORDER BY fatigue_flags.flag_date DESC
         LIMIT 1) AS last_flag_type,
    ( SELECT (avg(hv.rir_reported))::numeric(3,1) AS avg
           FROM (app.hypertrophy_set_logs hv
             JOIN app.methodology_exercise_sessions mes ON ((hv.session_id = mes.id)))
          WHERE ((mes.user_id = u.id) AND (mes.session_date >= (now() - '14 days'::interval)))) AS mean_rir_14d
   FROM (app.users u
     LEFT JOIN app.fatigue_flags ff ON ((u.id = ff.user_id)))
  GROUP BY u.id, u.email;


--
-- Name: user_home_training_stats; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_home_training_stats (
    id integer NOT NULL,
    user_id integer NOT NULL,
    total_sessions integer DEFAULT 0,
    total_exercises_completed integer DEFAULT 0,
    total_time_minutes integer DEFAULT 0,
    current_streak integer DEFAULT 0,
    max_streak integer DEFAULT 0,
    last_workout_date date,
    average_session_time integer DEFAULT 0,
    favorite_training_type character varying(100),
    total_calories_burned integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_training_date date
);


--
-- Name: user_home_training_stats_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.user_home_training_stats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_home_training_stats_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.user_home_training_stats_id_seq OWNED BY app.user_home_training_stats.id;


--
-- Name: user_layouts; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_layouts (
    id integer NOT NULL,
    user_id integer NOT NULL,
    layout_id character varying(100) NOT NULL,
    layout_data jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: user_layouts_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.user_layouts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_layouts_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.user_layouts_id_seq OWNED BY app.user_layouts.id;


--
-- Name: user_menstrual_config; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_menstrual_config (
    id integer NOT NULL,
    user_id integer,
    cycle_length integer DEFAULT 28,
    period_length integer DEFAULT 5,
    is_regular boolean DEFAULT true,
    uses_hormonal_contraceptives boolean DEFAULT false,
    last_period_start date,
    tracking_enabled boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    contraception_type text DEFAULT 'none'::text,
    cycle_confidence text DEFAULT 'low'::text,
    last_bleed_start_date date,
    bleed_length_days integer DEFAULT 5,
    cycle_length_days integer DEFAULT 28,
    luteal_length_days integer DEFAULT 14,
    joint_laxity_risk boolean DEFAULT false,
    CONSTRAINT user_menstrual_config_bleed_length_days_check CHECK (((bleed_length_days >= 1) AND (bleed_length_days <= 10))),
    CONSTRAINT user_menstrual_config_contraception_type_check CHECK ((contraception_type = ANY (ARRAY['none'::text, 'combined'::text, 'progestin_only'::text, 'hormonal_iud'::text, 'copper_iud'::text, 'other/unknown'::text]))),
    CONSTRAINT user_menstrual_config_cycle_confidence_check CHECK ((cycle_confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text]))),
    CONSTRAINT user_menstrual_config_cycle_length_days_check CHECK (((cycle_length_days >= 21) AND (cycle_length_days <= 45))),
    CONSTRAINT user_menstrual_config_luteal_length_days_check CHECK (((luteal_length_days >= 9) AND (luteal_length_days <= 18)))
);


--
-- Name: user_menstrual_config_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.user_menstrual_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_menstrual_config_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.user_menstrual_config_id_seq OWNED BY app.user_menstrual_config.id;


--
-- Name: user_menstrual_cycle; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_menstrual_cycle (
    id integer NOT NULL,
    user_id integer,
    cycle_length integer DEFAULT 28,
    period_length integer DEFAULT 5,
    last_period_date date,
    tracking_enabled boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: user_menstrual_cycle_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.user_menstrual_cycle_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_menstrual_cycle_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.user_menstrual_cycle_id_seq OWNED BY app.user_menstrual_cycle.id;


--
-- Name: user_metabolic_config; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_metabolic_config (
    user_id integer NOT NULL,
    frequency_days integer DEFAULT 14,
    pending_profile_change character varying(20) DEFAULT NULL::character varying,
    consecutive_change_count integer DEFAULT 0,
    last_confirmed_profile character varying(20) DEFAULT NULL::character varying,
    notification_enabled boolean DEFAULT true,
    reminder_days_before integer DEFAULT 2,
    auto_apply_profile boolean DEFAULT false,
    updated_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT user_metabolic_config_frequency_days_check CHECK (((frequency_days >= 7) AND (frequency_days <= 60))),
    CONSTRAINT user_metabolic_config_pending_profile_change_check CHECK (((pending_profile_change)::text = ANY (ARRAY[('tolerante'::character varying)::text, ('mixto'::character varying)::text, ('intolerante'::character varying)::text, (NULL::character varying)::text])))
);


--
-- Name: user_metabolic_evaluations; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_metabolic_evaluations (
    id integer NOT NULL,
    user_id integer NOT NULL,
    answers jsonb NOT NULL,
    raw_score integer NOT NULL,
    metabolic_profile character varying(20) NOT NULL,
    confidence_level character varying(10) NOT NULL,
    items_answered integer NOT NULL,
    items_no_se integer DEFAULT 0 NOT NULL,
    objective_adjustments jsonb,
    adjusted_score integer,
    calculated_macros jsonb,
    is_active boolean DEFAULT true,
    evaluation_date date DEFAULT CURRENT_DATE,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT user_metabolic_evaluations_confidence_level_check CHECK (((confidence_level)::text = ANY (ARRAY[('alta'::character varying)::text, ('media'::character varying)::text, ('baja'::character varying)::text]))),
    CONSTRAINT user_metabolic_evaluations_metabolic_profile_check CHECK (((metabolic_profile)::text = ANY (ARRAY[('tolerante'::character varying)::text, ('mixto'::character varying)::text, ('intolerante'::character varying)::text])))
);


--
-- Name: user_metabolic_evaluations_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.user_metabolic_evaluations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_metabolic_evaluations_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.user_metabolic_evaluations_id_seq OWNED BY app.user_metabolic_evaluations.id;


--
-- Name: user_metabolic_history; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_metabolic_history (
    id integer NOT NULL,
    user_id integer NOT NULL,
    evaluation_id integer,
    previous_profile character varying(20),
    new_profile character varying(20) NOT NULL,
    change_reason text,
    change_type character varying(20),
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT user_metabolic_history_change_type_check CHECK (((change_type)::text = ANY (ARRAY[('initial'::character varying)::text, ('confirmed'::character varying)::text, ('forced_low_confidence'::character varying)::text, ('manual'::character varying)::text])))
);


--
-- Name: user_metabolic_history_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.user_metabolic_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_metabolic_history_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.user_metabolic_history_id_seq OWNED BY app.user_metabolic_history.id;


--
-- Name: user_profiles; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_profiles (
    id integer NOT NULL,
    user_id integer NOT NULL,
    objetivo_principal character varying(100),
    metodologia_preferida character varying(50),
    limitaciones_fisicas text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    music_config jsonb DEFAULT '{"repeat": "none", "volume": 0.5, "shuffle": false, "spotify": {"enabled": false, "connected": false}, "youtube": {"enabled": false, "connected": false}, "autoplay": false, "localFiles": {"path": "", "enabled": true}}'::jsonb,
    dias_preferidos_entrenamiento jsonb DEFAULT '["lunes", "martes", "miercoles", "jueves", "viernes"]'::jsonb,
    ejercicios_por_dia_preferido integer DEFAULT 8,
    usar_preferencias_ia boolean DEFAULT false,
    semanas_entrenamiento integer DEFAULT 4,
    gemelo numeric(5,2),
    pliegue_abdominal numeric(6,2),
    CONSTRAINT user_profiles_ejercicios_por_dia_preferido_check CHECK (((ejercicios_por_dia_preferido >= 4) AND (ejercicios_por_dia_preferido <= 15))),
    CONSTRAINT user_profiles_semanas_entrenamiento_check CHECK (((semanas_entrenamiento >= 1) AND (semanas_entrenamiento <= 8)))
);


--
-- Name: user_profiles_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.user_profiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.user_profiles_id_seq OWNED BY app.user_profiles.id;


--
-- Name: user_re_eval_config; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_re_eval_config (
    user_id integer NOT NULL,
    frequency_weeks integer DEFAULT 3,
    auto_apply_suggestions boolean DEFAULT false,
    notification_enabled boolean DEFAULT true,
    reminder_days_before integer DEFAULT 1,
    updated_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT user_re_eval_config_frequency_weeks_check CHECK (((frequency_weeks >= 1) AND (frequency_weeks <= 12)))
);


--
-- Name: user_re_evaluations; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_re_evaluations (
    id integer NOT NULL,
    user_id integer NOT NULL,
    methodology_plan_id integer NOT NULL,
    week_number integer NOT NULL,
    sentiment character varying(50),
    overall_comment text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: user_re_evaluations_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.user_re_evaluations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_re_evaluations_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.user_re_evaluations_id_seq OWNED BY app.user_re_evaluations.id;


--
-- Name: user_sessions; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_sessions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    session_id uuid DEFAULT gen_random_uuid() NOT NULL,
    jwt_token text,
    jwt_expires_at timestamp with time zone,
    is_active boolean DEFAULT true,
    login_time timestamp with time zone DEFAULT now(),
    logout_time timestamp with time zone,
    logout_type character varying(20),
    last_activity timestamp with time zone DEFAULT now(),
    ip_address inet,
    user_agent text,
    device_info text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    jwt_token_hash character varying(255),
    session_metadata jsonb DEFAULT '{}'::jsonb,
    session_duration interval GENERATED ALWAYS AS (
CASE
    WHEN (logout_time IS NOT NULL) THEN (logout_time - login_time)
    ELSE NULL::interval
END) STORED
);


--
-- Name: user_sessions_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.user_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.user_sessions_id_seq OWNED BY app.user_sessions.id;


--
-- Name: user_training_preferences; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_training_preferences (
    id integer NOT NULL,
    user_id integer NOT NULL,
    preferred_methodologies text[],
    focus_areas text[],
    physical_limitations text[],
    equipment_preferences text[],
    preferred_session_duration integer,
    progression_style character varying(20) DEFAULT 'gradual'::character varying,
    feedback_sensitivity numeric(3,2) DEFAULT 0.8,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: user_training_preferences_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.user_training_preferences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_training_preferences_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.user_training_preferences_id_seq OWNED BY app.user_training_preferences.id;


--
-- Name: user_training_state; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.user_training_state (
    id integer NOT NULL,
    user_id integer,
    active_methodology_plan_id integer,
    active_session_id integer,
    current_view character varying(50) DEFAULT 'methodologies'::character varying,
    is_training boolean DEFAULT false,
    current_exercise_index integer DEFAULT 0,
    session_started_at timestamp without time zone,
    session_paused_at timestamp without time zone,
    active_modals jsonb DEFAULT '{}'::jsonb,
    training_metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: user_training_state_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.user_training_state_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_training_state_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.user_training_state_id_seq OWNED BY app.user_training_state.id;


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.users_id_seq OWNED BY app.users.id;


--
-- Name: v_carb_timing_adherence; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.v_carb_timing_adherence AS
 SELECT user_id,
    timing_window,
    count(*) AS total_recommendations,
    count(consumed_at) AS times_followed,
    round((((count(consumed_at))::numeric / (count(*))::numeric) * (100)::numeric), 1) AS adherence_percentage,
    avg(
        CASE
            WHEN (user_consumed_carbs IS NOT NULL) THEN (((user_consumed_carbs)::numeric / (carbs_recommended)::numeric) * (100)::numeric)
            ELSE NULL::numeric
        END) AS avg_carbs_accuracy_pct,
    max(created_at) AS last_recommendation_date
   FROM app.carb_timing_logs ctl
  WHERE (created_at >= (CURRENT_DATE - 30))
  GROUP BY user_id, timing_window;


--
-- Name: v_exercise_progress_expanded; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.v_exercise_progress_expanded AS
 SELECT id,
    user_id,
    methodology_session_id,
    exercise_name,
    exercise_order,
    exercise_level,
    total_sets,
    sets_completed,
    total_reps,
    reps_completed,
    planned_duration_seconds,
    actual_duration_seconds,
    rest_seconds,
    status,
    difficulty_rating,
    effort_rating,
    exercise_notes,
    additional_info,
    was_difficult,
    personal_feedback,
    started_at,
    completed_at,
    created_at,
    updated_at,
    series_total,
    repeticiones,
    descanso_seg,
    intensidad,
    tempo,
    notas,
    series_completed,
    app.range_to_min_value((series_total)::character varying) AS series_min,
    app.range_to_max_value((series_total)::character varying) AS series_max,
    app.range_to_min_value((repeticiones)::character varying) AS reps_min,
    app.range_to_max_value((repeticiones)::character varying) AS reps_max,
    app.range_to_min_value((planned_duration_seconds)::character varying) AS duration_min,
    app.range_to_max_value((planned_duration_seconds)::character varying) AS duration_max
   FROM app.methodology_exercise_progress;


--
-- Name: v_home_hist_propuesto; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.v_home_hist_propuesto AS
 SELECT user_id,
    exercise_name,
    exercise_key,
    created_at
   FROM app.home_combination_exercise_history
  WHERE ((exercise_name IS NOT NULL) AND (exercise_key IS NOT NULL));


--
-- Name: v_home_hist_real; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.v_home_hist_real AS
 SELECT user_id,
    exercise_name,
    exercise_key,
    created_at
   FROM app.home_exercise_history
  WHERE ((exercise_name IS NOT NULL) AND (exercise_key IS NOT NULL));


--
-- Name: v_latest_nutrition_evaluation; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.v_latest_nutrition_evaluation AS
 SELECT DISTINCT ON (user_id) id,
    user_id,
    evaluation_date,
    phase,
    indicator_type,
    indicator_value,
    status,
    interpretation,
    action_recommended
   FROM app.nutrition_evaluations
  ORDER BY user_id, evaluation_date DESC;


--
-- Name: v_measurement_changes; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.v_measurement_changes AS
 SELECT curr.id,
    curr.user_id,
    curr.measurement_date,
    curr.weight_kg,
    curr.waist_cm,
    curr.biceps_cm,
    curr.chest_cm,
    curr.calf_cm,
    curr.skinfold_abdominal_mm,
    prev.measurement_date AS prev_date,
    prev.weight_kg AS prev_weight,
    prev.waist_cm AS prev_waist,
    (curr.measurement_date - prev.measurement_date) AS days_between,
    (curr.weight_kg - prev.weight_kg) AS weight_change_kg,
    (((curr.weight_kg - prev.weight_kg) / prev.weight_kg) * (100)::numeric) AS weight_change_pct,
    (curr.waist_cm - prev.waist_cm) AS waist_change_cm,
    (curr.biceps_cm - prev.biceps_cm) AS biceps_change_cm,
    (curr.chest_cm - prev.chest_cm) AS chest_change_cm,
    (curr.calf_cm - prev.calf_cm) AS calf_change_cm,
        CASE
            WHEN ((curr.weight_kg - prev.weight_kg) > (0)::numeric) THEN ((curr.waist_cm - prev.waist_cm) / (curr.weight_kg - prev.weight_kg))
            ELSE NULL::numeric
        END AS icg_ratio,
        CASE
            WHEN ((prev.weight_kg - curr.weight_kg) > (0)::numeric) THEN ((prev.waist_cm - curr.waist_cm) / (prev.weight_kg - curr.weight_kg))
            ELSE NULL::numeric
        END AS ipg_ratio,
    curr.is_validated,
    curr.requires_confirmation,
    curr.validation_warnings
   FROM (app.body_measurements curr
     LEFT JOIN LATERAL ( SELECT body_measurements.id,
            body_measurements.user_id,
            body_measurements.measurement_date,
            body_measurements.weight_kg,
            body_measurements.waist_cm,
            body_measurements.biceps,
            body_measurements.chest,
            body_measurements.calf,
            body_measurements.abdominal_fold,
            body_measurements.performance_trend,
            body_measurements.measurement_conditions,
            body_measurements.notes,
            body_measurements.created_at,
            body_measurements.updated_at,
            body_measurements.time_of_day,
            body_measurements.is_fasted,
            body_measurements.post_workout,
            body_measurements.biceps_cm,
            body_measurements.chest_cm,
            body_measurements.calf_cm,
            body_measurements.skinfold_abdominal_mm,
            body_measurements.skinfold_triceps_mm,
            body_measurements.skinfold_subscapular_mm,
            body_measurements.is_validated,
            body_measurements.validation_warnings,
            body_measurements.requires_confirmation,
            body_measurements.user_confirmed,
            body_measurements.confirmed_at
           FROM app.body_measurements
          WHERE ((body_measurements.user_id = curr.user_id) AND (body_measurements.measurement_date < curr.measurement_date))
          ORDER BY body_measurements.measurement_date DESC
         LIMIT 1) prev ON (true));


--
-- Name: v_measurements_with_changes; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.v_measurements_with_changes AS
 SELECT id,
    user_id,
    measurement_date,
    weight_kg AS weight,
    waist_cm AS waist,
    biceps,
    chest,
    calf,
    abdominal_fold,
    performance_trend,
    measurement_conditions,
    notes,
    created_at,
    updated_at,
    lag(weight_kg) OVER (PARTITION BY user_id ORDER BY measurement_date) AS prev_weight,
    lag(waist_cm) OVER (PARTITION BY user_id ORDER BY measurement_date) AS prev_waist,
    (weight_kg - lag(weight_kg) OVER (PARTITION BY user_id ORDER BY measurement_date)) AS weight_change,
    (waist_cm - lag(waist_cm) OVER (PARTITION BY user_id ORDER BY measurement_date)) AS waist_change,
        CASE
            WHEN (lag(weight_kg) OVER (PARTITION BY user_id ORDER BY measurement_date) > (0)::numeric) THEN round(((waist_cm - lag(waist_cm) OVER (PARTITION BY user_id ORDER BY measurement_date)) / NULLIF((weight_kg - lag(weight_kg) OVER (PARTITION BY user_id ORDER BY measurement_date)), (0)::numeric)), 2)
            ELSE NULL::numeric
        END AS icg_calculated
   FROM app.body_measurements bm;


--
-- Name: v_metabolic_evaluation_history; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.v_metabolic_evaluation_history AS
 SELECT e.id,
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
    c.frequency_days,
    c.pending_profile_change,
    c.consecutive_change_count,
    (CURRENT_DATE - e.evaluation_date) AS days_since_evaluation,
        CASE
            WHEN (c.frequency_days IS NOT NULL) THEN (c.frequency_days - (CURRENT_DATE - e.evaluation_date))
            ELSE (14 - (CURRENT_DATE - e.evaluation_date))
        END AS days_until_next_eval
   FROM (app.user_metabolic_evaluations e
     LEFT JOIN app.user_metabolic_config c ON ((e.user_id = c.user_id)))
  ORDER BY e.user_id, e.created_at DESC;


--
-- Name: v_pending_calibrations; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.v_pending_calibrations AS
 SELECT ucc.user_id,
    u.email,
    ucc.last_calibration_date,
    ucc.next_calibration_date,
    ucc.calibration_frequency_days,
    (CURRENT_DATE - COALESCE(ucc.last_calibration_date, (CURRENT_DATE - 100))) AS days_since_last,
    np.objetivo,
    np.kcal_objetivo,
    np.tdee,
    ( SELECT count(*) AS count
           FROM app.body_measurements bm
          WHERE ((bm.user_id = ucc.user_id) AND (bm.measurement_date >= (CURRENT_DATE - '7 days'::interval)) AND (bm.is_validated = true))) AS measurements_last_7days
   FROM ((app.user_calibration_config ucc
     JOIN app.users u ON ((ucc.user_id = u.id)))
     LEFT JOIN app.nutrition_profiles np ON ((ucc.user_id = np.user_id)))
  WHERE ((ucc.auto_calibrate = true) AND ((ucc.last_calibration_date IS NULL) OR (CURRENT_DATE >= ucc.next_calibration_date)));


--
-- Name: v_re_evaluation_history; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.v_re_evaluation_history AS
SELECT
    NULL::integer AS id,
    NULL::integer AS user_id,
    NULL::integer AS methodology_plan_id,
    NULL::character varying(100) AS methodology_type,
    NULL::integer AS week_number,
    NULL::character varying(50) AS sentiment,
    NULL::text AS overall_comment,
    NULL::timestamp without time zone AS evaluation_date,
    NULL::bigint AS exercises_evaluated,
    NULL::numeric AS avg_difficulty,
    NULL::character varying(50) AS progress_assessment,
    NULL::character varying(50) AS intensity_change,
    NULL::text AS motivational_feedback,
    NULL::boolean AS adjustments_applied;


--
-- Name: v_training_time_stats; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.v_training_time_stats AS
 SELECT s.id AS session_id,
    s.user_id,
    s.methodology_type,
    s.session_name,
    s.week_number,
    s.day_name,
    s.session_date,
    s.modal_time_total_seconds,
    s.actual_session_duration_seconds,
    app.seconds_to_time_format(s.modal_time_total_seconds) AS modal_time_formatted,
    app.seconds_to_time_format(s.actual_session_duration_seconds) AS session_duration_formatted,
    count(p.id) AS total_exercises,
    count(
        CASE
            WHEN ((p.status)::text = 'completed'::text) THEN 1
            ELSE NULL::integer
        END) AS completed_exercises,
    avg(p.time_spent_seconds) AS avg_time_per_exercise,
    app.seconds_to_time_format((avg(p.time_spent_seconds))::integer) AS avg_time_formatted
   FROM (app.methodology_exercise_sessions s
     LEFT JOIN app.methodology_exercise_progress p ON ((p.methodology_session_id = s.id)))
  GROUP BY s.id, s.user_id, s.methodology_type, s.session_name, s.week_number, s.day_name, s.session_date, s.modal_time_total_seconds, s.actual_session_duration_seconds;


--
-- Name: warmup_sets_tracking; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.warmup_sets_tracking (
    id integer NOT NULL,
    user_id integer NOT NULL,
    methodology_plan_id integer,
    session_id integer,
    exercise_id integer NOT NULL,
    exercise_name character varying(255) NOT NULL,
    warmup_config jsonb NOT NULL,
    sets_completed integer NOT NULL,
    sets_planned integer NOT NULL,
    completion_time timestamp without time zone NOT NULL,
    user_level character varying(50),
    target_weight numeric(6,2),
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: warmup_adherence_stats; Type: VIEW; Schema: app; Owner: -
--

CREATE VIEW app.warmup_adherence_stats AS
 SELECT u.id AS user_id,
    count(DISTINCT wst.session_id) AS sessions_with_warmup,
    count(DISTINCT hsl.session_id) AS total_sessions,
        CASE
            WHEN (count(DISTINCT hsl.session_id) > 0) THEN round((((count(DISTINCT wst.session_id))::numeric / (count(DISTINCT hsl.session_id))::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS warmup_adherence_percentage,
    count(DISTINCT
        CASE
            WHEN (wst.completion_time >= (now() - '30 days'::interval)) THEN wst.session_id
            ELSE NULL::integer
        END) AS recent_warmups_30d,
    max(wst.completion_time) AS last_warmup_date
   FROM ((app.users u
     LEFT JOIN app.warmup_sets_tracking wst ON ((wst.user_id = u.id)))
     LEFT JOIN app.hypertrophy_set_logs hsl ON ((hsl.user_id = u.id)))
  GROUP BY u.id;


--
-- Name: warmup_sets_tracking_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.warmup_sets_tracking_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: warmup_sets_tracking_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.warmup_sets_tracking_id_seq OWNED BY app.warmup_sets_tracking.id;


--
-- Name: weekly_calorie_targets; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.weekly_calorie_targets (
    id integer NOT NULL,
    user_id integer NOT NULL,
    week_start_date date NOT NULL,
    daily_target_kcal integer NOT NULL,
    weekly_target_kcal integer GENERATED ALWAYS AS ((daily_target_kcal * 7)) STORED,
    accumulated_kcal integer DEFAULT 0,
    days_logged integer DEFAULT 0,
    current_deviation integer DEFAULT 0,
    is_current boolean DEFAULT false,
    closed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: weekly_calorie_targets_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.weekly_calorie_targets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: weekly_calorie_targets_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.weekly_calorie_targets_id_seq OWNED BY app.weekly_calorie_targets.id;


--
-- Name: workout_schedule; Type: TABLE; Schema: app; Owner: -
--

CREATE TABLE app.workout_schedule (
    id integer NOT NULL,
    methodology_plan_id integer NOT NULL,
    user_id integer NOT NULL,
    week_number integer NOT NULL,
    session_order integer NOT NULL,
    week_session_order integer NOT NULL,
    scheduled_date date NOT NULL,
    day_name character varying(20) NOT NULL,
    day_abbrev character varying(3) NOT NULL,
    session_title character varying(100),
    exercises jsonb NOT NULL,
    status character varying(20) DEFAULT 'scheduled'::character varying,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    day_id integer
);


--
-- Name: workout_schedule_id_seq; Type: SEQUENCE; Schema: app; Owner: -
--

CREATE SEQUENCE app.workout_schedule_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: workout_schedule_id_seq; Type: SEQUENCE OWNED BY; Schema: app; Owner: -
--

ALTER SEQUENCE app.workout_schedule_id_seq OWNED BY app.workout_schedule.id;


--
-- Name: Ejercicios_Bomberos exercise_id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app."Ejercicios_Bomberos" ALTER COLUMN exercise_id SET DEFAULT nextval('app."Ejercicios_Bomberos_exercise_id_seq"'::regclass);


--
-- Name: Ejercicios_CrossFit exercise_id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app."Ejercicios_CrossFit" ALTER COLUMN exercise_id SET DEFAULT nextval('app."Ejercicios_CrossFit_exercise_id_seq"'::regclass);


--
-- Name: Ejercicios_Guardia_Civil exercise_id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app."Ejercicios_Guardia_Civil" ALTER COLUMN exercise_id SET DEFAULT nextval('app."Ejercicios_Guardia_Civil_exercise_id_seq"'::regclass);


--
-- Name: Ejercicios_Policia_Local exercise_id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app."Ejercicios_Policia_Local" ALTER COLUMN exercise_id SET DEFAULT nextval('app."Ejercicios_Policia_Local_exercise_id_seq"'::regclass);


--
-- Name: Ejercicios_Policia_Nacional exercise_id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app."Ejercicios_Policia_Nacional" ALTER COLUMN exercise_id SET DEFAULT nextval('app."Ejercicios_Policia_Nacional_exercise_id_seq"'::regclass);


--
-- Name: adaptation_blocks id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.adaptation_blocks ALTER COLUMN id SET DEFAULT nextval('app.adaptation_blocks_id_seq'::regclass);


--
-- Name: adaptation_criteria_tracking id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.adaptation_criteria_tracking ALTER COLUMN id SET DEFAULT nextval('app.adaptation_criteria_tracking_id_seq'::regclass);


--
-- Name: adaptation_technique_flags id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.adaptation_technique_flags ALTER COLUMN id SET DEFAULT nextval('app.adaptation_technique_flags_id_seq'::regclass);


--
-- Name: ai_adjustment_suggestions id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.ai_adjustment_suggestions ALTER COLUMN id SET DEFAULT nextval('app.ai_adjustment_suggestions_id_seq'::regclass);


--
-- Name: auth_logs id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.auth_logs ALTER COLUMN id SET DEFAULT nextval('app.auth_logs_id_seq'::regclass);


--
-- Name: body_composition_history id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.body_composition_history ALTER COLUMN id SET DEFAULT nextval('app.body_composition_history_id_seq'::regclass);


--
-- Name: body_measurements id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.body_measurements ALTER COLUMN id SET DEFAULT nextval('app.body_measurements_id_seq'::regclass);


--
-- Name: bridge_adjustment_history id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.bridge_adjustment_history ALTER COLUMN id SET DEFAULT nextval('app.bridge_adjustment_history_id_seq'::regclass);


--
-- Name: bridge_decision_logs id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.bridge_decision_logs ALTER COLUMN id SET DEFAULT nextval('app.bridge_decision_logs_id_seq'::regclass);


--
-- Name: carb_timing_logs id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.carb_timing_logs ALTER COLUMN id SET DEFAULT nextval('app.carb_timing_logs_id_seq'::regclass);


--
-- Name: daily_compensation_plan id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.daily_compensation_plan ALTER COLUMN id SET DEFAULT nextval('app.daily_compensation_plan_id_seq'::regclass);


--
-- Name: daily_nutrition_log id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.daily_nutrition_log ALTER COLUMN id SET DEFAULT nextval('app.daily_nutrition_log_id_seq'::regclass);


--
-- Name: diet_breaks id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.diet_breaks ALTER COLUMN id SET DEFAULT nextval('app.diet_breaks_id_seq'::regclass);


--
-- Name: diet_deviations id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.diet_deviations ALTER COLUMN id SET DEFAULT nextval('app.diet_deviations_id_seq'::regclass);


--
-- Name: ejercicios id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.ejercicios ALTER COLUMN id SET DEFAULT nextval('app.ejercicios_id_seq'::regclass);


--
-- Name: equipment_items id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.equipment_items ALTER COLUMN id SET DEFAULT nextval('app.equipment_items_id_seq'::regclass);


--
-- Name: equipment_translations id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.equipment_translations ALTER COLUMN id SET DEFAULT nextval('app.equipment_translations_id_seq'::regclass);


--
-- Name: exercise_ai_info id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.exercise_ai_info ALTER COLUMN id SET DEFAULT nextval('app.exercise_ai_info_id_seq'::regclass);


--
-- Name: exercise_history id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.exercise_history ALTER COLUMN id SET DEFAULT nextval('app.exercise_history_id_seq'::regclass);


--
-- Name: exercise_session_tracking id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.exercise_session_tracking ALTER COLUMN id SET DEFAULT nextval('app.exercise_session_tracking_id_seq'::regclass);


--
-- Name: exercise_tags id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.exercise_tags ALTER COLUMN id SET DEFAULT nextval('app.exercise_tags_id_seq'::regclass);


--
-- Name: fatigue_flags id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.fatigue_flags ALTER COLUMN id SET DEFAULT nextval('app.fatigue_flags_id_seq'::regclass);


--
-- Name: hipertrofia_v2_session_config id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.hipertrofia_v2_session_config ALTER COLUMN id SET DEFAULT nextval('app.hipertrofia_v2_session_config_id_seq'::regclass);


--
-- Name: historico_ejercicios id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.historico_ejercicios ALTER COLUMN id SET DEFAULT nextval('app.historico_ejercicios_id_seq'::regclass);


--
-- Name: home_combination_exercise_history id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_combination_exercise_history ALTER COLUMN id SET DEFAULT nextval('app.home_combination_exercise_history_id_seq'::regclass);


--
-- Name: home_exercise_history id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_exercise_history ALTER COLUMN id SET DEFAULT nextval('app.home_exercise_history_id_seq'::regclass);


--
-- Name: home_exercise_progress id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_exercise_progress ALTER COLUMN id SET DEFAULT nextval('app.home_exercise_progress_id_seq'::regclass);


--
-- Name: home_exercise_rejections id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_exercise_rejections ALTER COLUMN id SET DEFAULT nextval('app.home_exercise_rejections_id_seq'::regclass);


--
-- Name: home_training_combinations id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_training_combinations ALTER COLUMN id SET DEFAULT nextval('app.home_training_combinations_id_seq'::regclass);


--
-- Name: home_training_plans id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_training_plans ALTER COLUMN id SET DEFAULT nextval('app.home_training_plans_id_seq'::regclass);


--
-- Name: home_training_sessions id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_training_sessions ALTER COLUMN id SET DEFAULT nextval('app.home_training_sessions_id_seq'::regclass);


--
-- Name: hypertrophy_blocks id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.hypertrophy_blocks ALTER COLUMN id SET DEFAULT nextval('app.hypertrophy_blocks_id_seq'::regclass);


--
-- Name: hypertrophy_set_logs id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.hypertrophy_set_logs ALTER COLUMN id SET DEFAULT nextval('app.hypertrophy_set_logs_id_seq'::regclass);


--
-- Name: hypertrophy_weekly_templates id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.hypertrophy_weekly_templates ALTER COLUMN id SET DEFAULT nextval('app.hypertrophy_weekly_templates_id_seq'::regclass);


--
-- Name: icg_ipg_state_history id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.icg_ipg_state_history ALTER COLUMN id SET DEFAULT nextval('app.icg_ipg_state_history_id_seq'::regclass);


--
-- Name: level_reevaluations id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.level_reevaluations ALTER COLUMN id SET DEFAULT nextval('app.level_reevaluations_id_seq'::regclass);


--
-- Name: manual_methodology_exercise_feedback id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.manual_methodology_exercise_feedback ALTER COLUMN id SET DEFAULT nextval('app.manual_methodology_exercise_feedback_id_seq'::regclass);


--
-- Name: menstrual_cycle_history id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.menstrual_cycle_history ALTER COLUMN id SET DEFAULT nextval('app.menstrual_cycle_history_id_seq'::regclass);


--
-- Name: menstrual_daily_log id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.menstrual_daily_log ALTER COLUMN id SET DEFAULT nextval('app.menstrual_daily_log_id_seq'::regclass);


--
-- Name: menstrual_deload_state id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.menstrual_deload_state ALTER COLUMN id SET DEFAULT nextval('app.menstrual_deload_state_id_seq'::regclass);


--
-- Name: menstrual_pattern_metrics id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.menstrual_pattern_metrics ALTER COLUMN id SET DEFAULT nextval('app.menstrual_pattern_metrics_id_seq'::regclass);


--
-- Name: methodology_exercise_feedback id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_exercise_feedback ALTER COLUMN id SET DEFAULT nextval('app.methodology_exercise_feedback_id_seq'::regclass);


--
-- Name: methodology_exercise_history_complete id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_exercise_history_complete ALTER COLUMN id SET DEFAULT nextval('app.methodology_exercise_history_complete_id_seq'::regclass);


--
-- Name: methodology_exercise_progress id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_exercise_progress ALTER COLUMN id SET DEFAULT nextval('app.methodology_exercise_progress_id_seq'::regclass);


--
-- Name: methodology_exercise_sessions id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_exercise_sessions ALTER COLUMN id SET DEFAULT nextval('app.methodology_exercise_sessions_id_seq'::regclass);


--
-- Name: methodology_plans id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_plans ALTER COLUMN id SET DEFAULT nextval('app.methodology_plans_new_id_seq'::regclass);


--
-- Name: methodology_session_feedback id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_session_feedback ALTER COLUMN id SET DEFAULT nextval('app.methodology_session_feedback_id_seq'::regclass);


--
-- Name: mindfeed_priority_events id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.mindfeed_priority_events ALTER COLUMN id SET DEFAULT nextval('app.mindfeed_priority_events_id_seq'::regclass);


--
-- Name: mindfeed_rulesets id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.mindfeed_rulesets ALTER COLUMN id SET DEFAULT nextval('app.mindfeed_rulesets_id_seq'::regclass);


--
-- Name: mindfeed_transition_events id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.mindfeed_transition_events ALTER COLUMN id SET DEFAULT nextval('app.mindfeed_transition_events_id_seq'::regclass);


--
-- Name: music_playlists id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.music_playlists ALTER COLUMN id SET DEFAULT nextval('app.music_playlists_id_seq'::regclass);


--
-- Name: nutrition_calibrations id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_calibrations ALTER COLUMN id SET DEFAULT nextval('app.nutrition_calibrations_id_seq'::regclass);


--
-- Name: nutrition_change_log id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_change_log ALTER COLUMN id SET DEFAULT nextval('app.nutrition_change_log_id_seq'::regclass);


--
-- Name: nutrition_evaluations id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_evaluations ALTER COLUMN id SET DEFAULT nextval('app.nutrition_evaluations_id_seq'::regclass);


--
-- Name: nutrition_phase_history id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_phase_history ALTER COLUMN id SET DEFAULT nextval('app.nutrition_phase_history_id_seq'::regclass);


--
-- Name: nutrition_plans id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_plans ALTER COLUMN id SET DEFAULT nextval('app.nutrition_plans_id_seq'::regclass);


--
-- Name: nutrition_weekly_snapshots id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_weekly_snapshots ALTER COLUMN id SET DEFAULT nextval('app.nutrition_weekly_snapshots_id_seq'::regclass);


--
-- Name: progreso_usuario id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.progreso_usuario ALTER COLUMN id SET DEFAULT nextval('app.progreso_usuario_id_seq'::regclass);


--
-- Name: re_evaluation_exercises id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.re_evaluation_exercises ALTER COLUMN id SET DEFAULT nextval('app.re_evaluation_exercises_id_seq'::regclass);


--
-- Name: technique_corrections id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.technique_corrections ALTER COLUMN id SET DEFAULT nextval('app.technique_corrections_id_seq'::regclass);


--
-- Name: training_performance_log id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.training_performance_log ALTER COLUMN id SET DEFAULT nextval('app.training_performance_log_id_seq'::regclass);


--
-- Name: user_body_measurements id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_body_measurements ALTER COLUMN id SET DEFAULT nextval('app.user_body_measurements_id_seq'::regclass);


--
-- Name: user_custom_equipment id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_custom_equipment ALTER COLUMN id SET DEFAULT nextval('app.user_custom_equipment_id_seq'::regclass);


--
-- Name: user_equipment id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_equipment ALTER COLUMN id SET DEFAULT nextval('app.user_equipment_id_seq'::regclass);


--
-- Name: user_exercise_feedback id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_exercise_feedback ALTER COLUMN id SET DEFAULT nextval('app.user_exercise_feedback_id_seq'::regclass);


--
-- Name: user_home_training_stats id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_home_training_stats ALTER COLUMN id SET DEFAULT nextval('app.user_home_training_stats_id_seq'::regclass);


--
-- Name: user_layouts id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_layouts ALTER COLUMN id SET DEFAULT nextval('app.user_layouts_id_seq'::regclass);


--
-- Name: user_menstrual_config id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_menstrual_config ALTER COLUMN id SET DEFAULT nextval('app.user_menstrual_config_id_seq'::regclass);


--
-- Name: user_menstrual_cycle id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_menstrual_cycle ALTER COLUMN id SET DEFAULT nextval('app.user_menstrual_cycle_id_seq'::regclass);


--
-- Name: user_metabolic_evaluations id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_metabolic_evaluations ALTER COLUMN id SET DEFAULT nextval('app.user_metabolic_evaluations_id_seq'::regclass);


--
-- Name: user_metabolic_history id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_metabolic_history ALTER COLUMN id SET DEFAULT nextval('app.user_metabolic_history_id_seq'::regclass);


--
-- Name: user_profiles id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_profiles ALTER COLUMN id SET DEFAULT nextval('app.user_profiles_id_seq'::regclass);


--
-- Name: user_re_evaluations id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_re_evaluations ALTER COLUMN id SET DEFAULT nextval('app.user_re_evaluations_id_seq'::regclass);


--
-- Name: user_sessions id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_sessions ALTER COLUMN id SET DEFAULT nextval('app.user_sessions_id_seq'::regclass);


--
-- Name: user_training_preferences id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_training_preferences ALTER COLUMN id SET DEFAULT nextval('app.user_training_preferences_id_seq'::regclass);


--
-- Name: user_training_state id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_training_state ALTER COLUMN id SET DEFAULT nextval('app.user_training_state_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.users ALTER COLUMN id SET DEFAULT nextval('app.users_id_seq'::regclass);


--
-- Name: warmup_sets_tracking id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.warmup_sets_tracking ALTER COLUMN id SET DEFAULT nextval('app.warmup_sets_tracking_id_seq'::regclass);


--
-- Name: weekly_calorie_targets id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.weekly_calorie_targets ALTER COLUMN id SET DEFAULT nextval('app.weekly_calorie_targets_id_seq'::regclass);


--
-- Name: workout_schedule id; Type: DEFAULT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.workout_schedule ALTER COLUMN id SET DEFAULT nextval('app.workout_schedule_id_seq'::regclass);


--
-- Name: Ejercicios_Bomberos Ejercicios_Bomberos_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app."Ejercicios_Bomberos"
    ADD CONSTRAINT "Ejercicios_Bomberos_pkey" PRIMARY KEY (exercise_id);


--
-- Name: Ejercicios_CrossFit Ejercicios_CrossFit_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app."Ejercicios_CrossFit"
    ADD CONSTRAINT "Ejercicios_CrossFit_pkey" PRIMARY KEY (exercise_id);


--
-- Name: Ejercicios_Guardia_Civil Ejercicios_Guardia_Civil_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app."Ejercicios_Guardia_Civil"
    ADD CONSTRAINT "Ejercicios_Guardia_Civil_pkey" PRIMARY KEY (exercise_id);


--
-- Name: Ejercicios_Policia_Local Ejercicios_Policia_Local_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app."Ejercicios_Policia_Local"
    ADD CONSTRAINT "Ejercicios_Policia_Local_pkey" PRIMARY KEY (exercise_id);


--
-- Name: Ejercicios_Policia_Nacional Ejercicios_Policia_Nacional_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app."Ejercicios_Policia_Nacional"
    ADD CONSTRAINT "Ejercicios_Policia_Nacional_pkey" PRIMARY KEY (exercise_id);


--
-- Name: adaptation_blocks adaptation_blocks_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.adaptation_blocks
    ADD CONSTRAINT adaptation_blocks_pkey PRIMARY KEY (id);


--
-- Name: adaptation_criteria_tracking adaptation_criteria_tracking_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.adaptation_criteria_tracking
    ADD CONSTRAINT adaptation_criteria_tracking_pkey PRIMARY KEY (id);


--
-- Name: adaptation_technique_flags adaptation_technique_flags_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.adaptation_technique_flags
    ADD CONSTRAINT adaptation_technique_flags_pkey PRIMARY KEY (id);


--
-- Name: ai_adjustment_suggestions ai_adjustment_suggestions_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.ai_adjustment_suggestions
    ADD CONSTRAINT ai_adjustment_suggestions_pkey PRIMARY KEY (id);


--
-- Name: auth_logs auth_logs_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.auth_logs
    ADD CONSTRAINT auth_logs_pkey PRIMARY KEY (id);


--
-- Name: autoreg_stall autoreg_stall_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.autoreg_stall
    ADD CONSTRAINT autoreg_stall_pkey PRIMARY KEY (user_id, methodology);


--
-- Name: body_composition_history body_composition_history_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.body_composition_history
    ADD CONSTRAINT body_composition_history_pkey PRIMARY KEY (id);


--
-- Name: body_measurements body_measurements_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.body_measurements
    ADD CONSTRAINT body_measurements_pkey PRIMARY KEY (id);


--
-- Name: body_measurements body_measurements_user_id_measurement_date_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.body_measurements
    ADD CONSTRAINT body_measurements_user_id_measurement_date_key UNIQUE (user_id, measurement_date);


--
-- Name: bridge_adjustment_history bridge_adjustment_history_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.bridge_adjustment_history
    ADD CONSTRAINT bridge_adjustment_history_pkey PRIMARY KEY (id);


--
-- Name: bridge_current_state bridge_current_state_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.bridge_current_state
    ADD CONSTRAINT bridge_current_state_pkey PRIMARY KEY (user_id);


--
-- Name: bridge_decision_logs bridge_decision_logs_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.bridge_decision_logs
    ADD CONSTRAINT bridge_decision_logs_pkey PRIMARY KEY (id);


--
-- Name: bridge_recalculation_config bridge_recalculation_config_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.bridge_recalculation_config
    ADD CONSTRAINT bridge_recalculation_config_pkey PRIMARY KEY (user_id);


--
-- Name: calistenia_autoreg_state calistenia_autoreg_state_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.calistenia_autoreg_state
    ADD CONSTRAINT calistenia_autoreg_state_pkey PRIMARY KEY (user_id);


--
-- Name: carb_timing_logs carb_timing_logs_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.carb_timing_logs
    ADD CONSTRAINT carb_timing_logs_pkey PRIMARY KEY (id);


--
-- Name: carb_timing_preferences carb_timing_preferences_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.carb_timing_preferences
    ADD CONSTRAINT carb_timing_preferences_pkey PRIMARY KEY (user_id);


--
-- Name: casa_autoreg_state casa_autoreg_state_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.casa_autoreg_state
    ADD CONSTRAINT casa_autoreg_state_pkey PRIMARY KEY (user_id);


--
-- Name: crossfit_autoreg_state crossfit_autoreg_state_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.crossfit_autoreg_state
    ADD CONSTRAINT crossfit_autoreg_state_pkey PRIMARY KEY (user_id);


--
-- Name: daily_compensation_plan daily_compensation_plan_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.daily_compensation_plan
    ADD CONSTRAINT daily_compensation_plan_pkey PRIMARY KEY (id);


--
-- Name: daily_compensation_plan daily_compensation_plan_user_id_compensation_date_deviation_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.daily_compensation_plan
    ADD CONSTRAINT daily_compensation_plan_user_id_compensation_date_deviation_key UNIQUE (user_id, compensation_date, deviation_id);


--
-- Name: daily_nutrition_log daily_nutrition_log_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.daily_nutrition_log
    ADD CONSTRAINT daily_nutrition_log_pkey PRIMARY KEY (id);


--
-- Name: diet_breaks diet_breaks_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.diet_breaks
    ADD CONSTRAINT diet_breaks_pkey PRIMARY KEY (id);


--
-- Name: diet_deviation_config diet_deviation_config_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.diet_deviation_config
    ADD CONSTRAINT diet_deviation_config_pkey PRIMARY KEY (user_id);


--
-- Name: diet_deviations diet_deviations_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.diet_deviations
    ADD CONSTRAINT diet_deviations_pkey PRIMARY KEY (id);


--
-- Name: ejercicios ejercicios_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.ejercicios
    ADD CONSTRAINT ejercicios_pkey PRIMARY KEY (id);


--
-- Name: equipment_items equipment_items_name_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.equipment_items
    ADD CONSTRAINT equipment_items_name_key UNIQUE (name);


--
-- Name: equipment_items equipment_items_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.equipment_items
    ADD CONSTRAINT equipment_items_pkey PRIMARY KEY (id);


--
-- Name: equipment_translations equipment_translations_equipment_type_en_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.equipment_translations
    ADD CONSTRAINT equipment_translations_equipment_type_en_key UNIQUE (equipment_type_en);


--
-- Name: equipment_translations equipment_translations_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.equipment_translations
    ADD CONSTRAINT equipment_translations_pkey PRIMARY KEY (id);


--
-- Name: exercise_ai_info exercise_ai_info_exercise_name_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.exercise_ai_info
    ADD CONSTRAINT exercise_ai_info_exercise_name_key UNIQUE (exercise_name);


--
-- Name: exercise_ai_info exercise_ai_info_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.exercise_ai_info
    ADD CONSTRAINT exercise_ai_info_pkey PRIMARY KEY (id);


--
-- Name: exercise_history exercise_history_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.exercise_history
    ADD CONSTRAINT exercise_history_pkey PRIMARY KEY (id);


--
-- Name: exercise_session_tracking exercise_session_tracking_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.exercise_session_tracking
    ADD CONSTRAINT exercise_session_tracking_pkey PRIMARY KEY (id);


--
-- Name: exercise_tags exercise_tags_exercise_id_source_table_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.exercise_tags
    ADD CONSTRAINT exercise_tags_exercise_id_source_table_key UNIQUE (exercise_id, source_table);


--
-- Name: exercise_tags exercise_tags_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.exercise_tags
    ADD CONSTRAINT exercise_tags_pkey PRIMARY KEY (id);


--
-- Name: fatigue_flags fatigue_flags_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.fatigue_flags
    ADD CONSTRAINT fatigue_flags_pkey PRIMARY KEY (id);


--
-- Name: food_conversion_factors food_conversion_factors_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.food_conversion_factors
    ADD CONSTRAINT food_conversion_factors_pkey PRIMARY KEY (id);


--
-- Name: food_pairing_rules food_pairing_rules_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.food_pairing_rules
    ADD CONSTRAINT food_pairing_rules_pkey PRIMARY KEY (id);


--
-- Name: food_roles food_roles_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.food_roles
    ADD CONSTRAINT food_roles_pkey PRIMARY KEY (id);


--
-- Name: foods foods_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.foods
    ADD CONSTRAINT foods_pkey PRIMARY KEY (id);


--
-- Name: foods foods_slug_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.foods
    ADD CONSTRAINT foods_slug_key UNIQUE (slug);


--
-- Name: funcional_autoreg_state funcional_autoreg_state_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.funcional_autoreg_state
    ADD CONSTRAINT funcional_autoreg_state_pkey PRIMARY KEY (user_id);


--
-- Name: halterofilia_autoreg_state halterofilia_autoreg_state_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.halterofilia_autoreg_state
    ADD CONSTRAINT halterofilia_autoreg_state_pkey PRIMARY KEY (user_id);


--
-- Name: heavy_duty_autoreg_state heavy_duty_autoreg_state_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.heavy_duty_autoreg_state
    ADD CONSTRAINT heavy_duty_autoreg_state_pkey PRIMARY KEY (user_id);


--
-- Name: hipertrofia_v2_session_config hipertrofia_v2_session_config_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.hipertrofia_v2_session_config
    ADD CONSTRAINT hipertrofia_v2_session_config_pkey PRIMARY KEY (id);


--
-- Name: hipertrofia_v2_state hipertrofia_v2_state_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.hipertrofia_v2_state
    ADD CONSTRAINT hipertrofia_v2_state_pkey PRIMARY KEY (user_id);


--
-- Name: historico_ejercicios historico_ejercicios_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.historico_ejercicios
    ADD CONSTRAINT historico_ejercicios_pkey PRIMARY KEY (id);


--
-- Name: home_combination_exercise_history home_combination_exercise_his_user_id_combination_id_exerci_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_combination_exercise_history
    ADD CONSTRAINT home_combination_exercise_his_user_id_combination_id_exerci_key UNIQUE (user_id, combination_id, exercise_name);


--
-- Name: home_combination_exercise_history home_combination_exercise_history_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_combination_exercise_history
    ADD CONSTRAINT home_combination_exercise_history_pkey PRIMARY KEY (id);


--
-- Name: home_exercise_history home_exercise_history_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_exercise_history
    ADD CONSTRAINT home_exercise_history_pkey PRIMARY KEY (id);


--
-- Name: home_exercise_progress home_exercise_progress_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_exercise_progress
    ADD CONSTRAINT home_exercise_progress_pkey PRIMARY KEY (id);


--
-- Name: home_exercise_rejections home_exercise_rejections_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_exercise_rejections
    ADD CONSTRAINT home_exercise_rejections_pkey PRIMARY KEY (id);


--
-- Name: home_training_combinations home_training_combinations_combination_code_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_training_combinations
    ADD CONSTRAINT home_training_combinations_combination_code_key UNIQUE (combination_code);


--
-- Name: home_training_combinations home_training_combinations_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_training_combinations
    ADD CONSTRAINT home_training_combinations_pkey PRIMARY KEY (id);


--
-- Name: home_training_plans home_training_plans_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_training_plans
    ADD CONSTRAINT home_training_plans_pkey PRIMARY KEY (id);


--
-- Name: home_training_sessions home_training_sessions_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_training_sessions
    ADD CONSTRAINT home_training_sessions_pkey PRIMARY KEY (id);


--
-- Name: hypertrophy_blocks hypertrophy_blocks_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.hypertrophy_blocks
    ADD CONSTRAINT hypertrophy_blocks_pkey PRIMARY KEY (id);


--
-- Name: hypertrophy_progression hypertrophy_progression_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.hypertrophy_progression
    ADD CONSTRAINT hypertrophy_progression_pkey PRIMARY KEY (user_id, exercise_id);


--
-- Name: hypertrophy_set_logs hypertrophy_set_logs_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.hypertrophy_set_logs
    ADD CONSTRAINT hypertrophy_set_logs_pkey PRIMARY KEY (id);


--
-- Name: hypertrophy_weekly_templates hypertrophy_weekly_templates_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.hypertrophy_weekly_templates
    ADD CONSTRAINT hypertrophy_weekly_templates_pkey PRIMARY KEY (id);


--
-- Name: icg_ipg_state_history icg_ipg_state_history_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.icg_ipg_state_history
    ADD CONSTRAINT icg_ipg_state_history_pkey PRIMARY KEY (id);


--
-- Name: icg_ipg_state_history icg_ipg_state_history_user_id_measurement_date_indicator_ty_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.icg_ipg_state_history
    ADD CONSTRAINT icg_ipg_state_history_user_id_measurement_date_indicator_ty_key UNIQUE (user_id, measurement_date, indicator_type);


--
-- Name: level_reevaluations level_reevaluations_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.level_reevaluations
    ADD CONSTRAINT level_reevaluations_pkey PRIMARY KEY (id);


--
-- Name: manual_methodology_exercise_feedback manual_methodology_exercise_f_methodology_session_id_exerci_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.manual_methodology_exercise_feedback
    ADD CONSTRAINT manual_methodology_exercise_f_methodology_session_id_exerci_key UNIQUE (methodology_session_id, exercise_order);


--
-- Name: manual_methodology_exercise_feedback manual_methodology_exercise_feedback_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.manual_methodology_exercise_feedback
    ADD CONSTRAINT manual_methodology_exercise_feedback_pkey PRIMARY KEY (id);


--
-- Name: meal_acceptability_rules meal_acceptability_rules_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.meal_acceptability_rules
    ADD CONSTRAINT meal_acceptability_rules_pkey PRIMARY KEY (id);


--
-- Name: meal_template_slots meal_template_slots_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.meal_template_slots
    ADD CONSTRAINT meal_template_slots_pkey PRIMARY KEY (id);


--
-- Name: meal_templates meal_templates_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.meal_templates
    ADD CONSTRAINT meal_templates_pkey PRIMARY KEY (id);


--
-- Name: menstrual_cycle_history menstrual_cycle_history_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.menstrual_cycle_history
    ADD CONSTRAINT menstrual_cycle_history_pkey PRIMARY KEY (id);


--
-- Name: menstrual_cycle_history menstrual_cycle_history_user_id_bleed_start_date_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.menstrual_cycle_history
    ADD CONSTRAINT menstrual_cycle_history_user_id_bleed_start_date_key UNIQUE (user_id, bleed_start_date);


--
-- Name: menstrual_daily_log menstrual_daily_log_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.menstrual_daily_log
    ADD CONSTRAINT menstrual_daily_log_pkey PRIMARY KEY (id);


--
-- Name: menstrual_daily_log menstrual_daily_log_user_id_log_date_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.menstrual_daily_log
    ADD CONSTRAINT menstrual_daily_log_user_id_log_date_key UNIQUE (user_id, log_date);


--
-- Name: menstrual_deload_state menstrual_deload_state_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.menstrual_deload_state
    ADD CONSTRAINT menstrual_deload_state_pkey PRIMARY KEY (id);


--
-- Name: menstrual_deload_state menstrual_deload_state_user_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.menstrual_deload_state
    ADD CONSTRAINT menstrual_deload_state_user_id_key UNIQUE (user_id);


--
-- Name: menstrual_pattern_metrics menstrual_pattern_metrics_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.menstrual_pattern_metrics
    ADD CONSTRAINT menstrual_pattern_metrics_pkey PRIMARY KEY (id);


--
-- Name: menstrual_pattern_metrics menstrual_pattern_metrics_user_id_pattern_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.menstrual_pattern_metrics
    ADD CONSTRAINT menstrual_pattern_metrics_user_id_pattern_key UNIQUE (user_id, pattern);


--
-- Name: methodology_exercise_feedback methodology_exercise_feedback_methodology_session_id_exerci_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_exercise_feedback
    ADD CONSTRAINT methodology_exercise_feedback_methodology_session_id_exerci_key UNIQUE (methodology_session_id, exercise_order);


--
-- Name: methodology_exercise_feedback methodology_exercise_feedback_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_exercise_feedback
    ADD CONSTRAINT methodology_exercise_feedback_pkey PRIMARY KEY (id);


--
-- Name: methodology_exercise_history_complete methodology_exercise_history__methodology_session_id_exerci_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_exercise_history_complete
    ADD CONSTRAINT methodology_exercise_history__methodology_session_id_exerci_key UNIQUE (methodology_session_id, exercise_order);


--
-- Name: methodology_exercise_history_complete methodology_exercise_history_complete_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_exercise_history_complete
    ADD CONSTRAINT methodology_exercise_history_complete_pkey PRIMARY KEY (id);


--
-- Name: methodology_exercise_progress methodology_exercise_progress_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_exercise_progress
    ADD CONSTRAINT methodology_exercise_progress_pkey PRIMARY KEY (id);


--
-- Name: methodology_exercise_sessions methodology_exercise_sessions_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_exercise_sessions
    ADD CONSTRAINT methodology_exercise_sessions_pkey PRIMARY KEY (id);


--
-- Name: methodology_plan_days methodology_plan_days_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_plan_days
    ADD CONSTRAINT methodology_plan_days_pkey PRIMARY KEY (plan_id, day_id);


--
-- Name: methodology_plans methodology_plans_new_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_plans
    ADD CONSTRAINT methodology_plans_new_pkey PRIMARY KEY (id);


--
-- Name: methodology_session_feedback methodology_session_feedback_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_session_feedback
    ADD CONSTRAINT methodology_session_feedback_pkey PRIMARY KEY (id);


--
-- Name: mindfeed_priority_events mindfeed_priority_events_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.mindfeed_priority_events
    ADD CONSTRAINT mindfeed_priority_events_pkey PRIMARY KEY (id);


--
-- Name: mindfeed_rulesets mindfeed_rulesets_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.mindfeed_rulesets
    ADD CONSTRAINT mindfeed_rulesets_pkey PRIMARY KEY (id);


--
-- Name: mindfeed_transition_events mindfeed_transition_events_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.mindfeed_transition_events
    ADD CONSTRAINT mindfeed_transition_events_pkey PRIMARY KEY (id);


--
-- Name: music_playlists music_playlists_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.music_playlists
    ADD CONSTRAINT music_playlists_pkey PRIMARY KEY (id);


--
-- Name: nutrition_adjustment_actions nutrition_adjustment_actions_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_adjustment_actions
    ADD CONSTRAINT nutrition_adjustment_actions_pkey PRIMARY KEY (id);


--
-- Name: nutrition_calibrations nutrition_calibrations_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_calibrations
    ADD CONSTRAINT nutrition_calibrations_pkey PRIMARY KEY (id);


--
-- Name: nutrition_change_log nutrition_change_log_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_change_log
    ADD CONSTRAINT nutrition_change_log_pkey PRIMARY KEY (id);


--
-- Name: nutrition_evaluations nutrition_evaluations_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_evaluations
    ADD CONSTRAINT nutrition_evaluations_pkey PRIMARY KEY (id);


--
-- Name: nutrition_guidelines nutrition_guidelines_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_guidelines
    ADD CONSTRAINT nutrition_guidelines_pkey PRIMARY KEY (id);


--
-- Name: nutrition_guidelines nutrition_guidelines_slug_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_guidelines
    ADD CONSTRAINT nutrition_guidelines_slug_key UNIQUE (slug);


--
-- Name: nutrition_meal_items nutrition_meal_items_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_meal_items
    ADD CONSTRAINT nutrition_meal_items_pkey PRIMARY KEY (id);


--
-- Name: nutrition_meals nutrition_meals_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_meals
    ADD CONSTRAINT nutrition_meals_pkey PRIMARY KEY (id);


--
-- Name: nutrition_menu_generation_logs nutrition_menu_generation_logs_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_menu_generation_logs
    ADD CONSTRAINT nutrition_menu_generation_logs_pkey PRIMARY KEY (id);


--
-- Name: nutrition_phase_history nutrition_phase_history_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_phase_history
    ADD CONSTRAINT nutrition_phase_history_pkey PRIMARY KEY (id);


--
-- Name: nutrition_plan_days nutrition_plan_days_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_plan_days
    ADD CONSTRAINT nutrition_plan_days_pkey PRIMARY KEY (id);


--
-- Name: nutrition_plans nutrition_plans_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_plans
    ADD CONSTRAINT nutrition_plans_pkey PRIMARY KEY (id);


--
-- Name: nutrition_plans_v2 nutrition_plans_v2_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_plans_v2
    ADD CONSTRAINT nutrition_plans_v2_pkey PRIMARY KEY (id);


--
-- Name: nutrition_profiles nutrition_profiles_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_profiles
    ADD CONSTRAINT nutrition_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: nutrition_weekly_snapshots nutrition_weekly_snapshots_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_weekly_snapshots
    ADD CONSTRAINT nutrition_weekly_snapshots_pkey PRIMARY KEY (id);


--
-- Name: nutrition_weekly_snapshots nutrition_weekly_snapshots_user_id_snapshot_date_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_weekly_snapshots
    ADD CONSTRAINT nutrition_weekly_snapshots_user_id_snapshot_date_key UNIQUE (user_id, snapshot_date);


--
-- Name: oposiciones_autoreg_state oposiciones_autoreg_state_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.oposiciones_autoreg_state
    ADD CONSTRAINT oposiciones_autoreg_state_pkey PRIMARY KEY (user_id);


--
-- Name: plan_progression_offsets plan_progression_offsets_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.plan_progression_offsets
    ADD CONSTRAINT plan_progression_offsets_pkey PRIMARY KEY (user_id, methodology_plan_id);


--
-- Name: plan_start_config plan_start_config_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.plan_start_config
    ADD CONSTRAINT plan_start_config_pkey PRIMARY KEY (methodology_plan_id);


--
-- Name: powerlifting_autoreg_state powerlifting_autoreg_state_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.powerlifting_autoreg_state
    ADD CONSTRAINT powerlifting_autoreg_state_pkey PRIMARY KEY (user_id);


--
-- Name: progreso_usuario progreso_usuario_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.progreso_usuario
    ADD CONSTRAINT progreso_usuario_pkey PRIMARY KEY (id);


--
-- Name: progreso_usuario progreso_usuario_user_id_fecha_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.progreso_usuario
    ADD CONSTRAINT progreso_usuario_user_id_fecha_key UNIQUE (user_id, fecha);


--
-- Name: re_evaluation_exercises re_evaluation_exercises_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.re_evaluation_exercises
    ADD CONSTRAINT re_evaluation_exercises_pkey PRIMARY KEY (id);


--
-- Name: recipe_items recipe_items_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.recipe_items
    ADD CONSTRAINT recipe_items_pkey PRIMARY KEY (id);


--
-- Name: recipe_items recipe_items_recipe_id_slot_order_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.recipe_items
    ADD CONSTRAINT recipe_items_recipe_id_slot_order_key UNIQUE (recipe_id, slot_order);


--
-- Name: recipe_tags recipe_tags_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.recipe_tags
    ADD CONSTRAINT recipe_tags_pkey PRIMARY KEY (recipe_id, tag);


--
-- Name: recipes recipes_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.recipes
    ADD CONSTRAINT recipes_pkey PRIMARY KEY (id);


--
-- Name: recipes recipes_recipe_code_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.recipes
    ADD CONSTRAINT recipes_recipe_code_key UNIQUE (recipe_code);


--
-- Name: technique_corrections technique_corrections_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.technique_corrections
    ADD CONSTRAINT technique_corrections_pkey PRIMARY KEY (id);


--
-- Name: training_performance_log training_performance_log_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.training_performance_log
    ADD CONSTRAINT training_performance_log_pkey PRIMARY KEY (id);


--
-- Name: training_performance_log training_performance_log_user_id_measurement_date_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.training_performance_log
    ADD CONSTRAINT training_performance_log_user_id_measurement_date_key UNIQUE (user_id, measurement_date);


--
-- Name: adaptation_blocks unique_active_adaptation; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.adaptation_blocks
    ADD CONSTRAINT unique_active_adaptation UNIQUE (user_id, status);


--
-- Name: food_conversion_factors unique_conversion_factor; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.food_conversion_factors
    ADD CONSTRAINT unique_conversion_factor UNIQUE (grupo_factor, estado_base, estado_objetivo);


--
-- Name: user_re_evaluations unique_plan_week; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_re_evaluations
    ADD CONSTRAINT unique_plan_week UNIQUE (methodology_plan_id, week_number);


--
-- Name: home_exercise_rejections unique_rejection; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_exercise_rejections
    ADD CONSTRAINT unique_rejection UNIQUE (user_id, exercise_key, equipment_type, training_type, is_active);


--
-- Name: daily_nutrition_log unique_user_date_nutrition; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.daily_nutrition_log
    ADD CONSTRAINT unique_user_date_nutrition UNIQUE (user_id, log_date);


--
-- Name: adaptation_criteria_tracking unique_week_per_block; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.adaptation_criteria_tracking
    ADD CONSTRAINT unique_week_per_block UNIQUE (adaptation_block_id, week_number);


--
-- Name: food_pairing_rules uq_food_pairing_rule; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.food_pairing_rules
    ADD CONSTRAINT uq_food_pairing_rule UNIQUE (food_slug_a, food_slug_b, rule_type);


--
-- Name: food_roles uq_food_roles_food_role; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.food_roles
    ADD CONSTRAINT uq_food_roles_food_role UNIQUE (food_id, role);


--
-- Name: meal_acceptability_rules uq_meal_acceptability_rules; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.meal_acceptability_rules
    ADD CONSTRAINT uq_meal_acceptability_rules UNIQUE (meal_type, diet_type);


--
-- Name: meal_template_slots uq_meal_template_slots_order; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.meal_template_slots
    ADD CONSTRAINT uq_meal_template_slots_order UNIQUE (template_id, slot_order);


--
-- Name: meal_templates uq_meal_templates_code; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.meal_templates
    ADD CONSTRAINT uq_meal_templates_code UNIQUE (template_code);


--
-- Name: music_playlists uq_music_playlists_user_name; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.music_playlists
    ADD CONSTRAINT uq_music_playlists_user_name UNIQUE (user_id, name);


--
-- Name: user_body_measurements user_body_measurements_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_body_measurements
    ADD CONSTRAINT user_body_measurements_pkey PRIMARY KEY (id);


--
-- Name: user_calibration_config user_calibration_config_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_calibration_config
    ADD CONSTRAINT user_calibration_config_pkey PRIMARY KEY (user_id);


--
-- Name: user_custom_equipment user_custom_equipment_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_custom_equipment
    ADD CONSTRAINT user_custom_equipment_pkey PRIMARY KEY (id);


--
-- Name: user_custom_equipment user_custom_equipment_user_id_equipment_name_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_custom_equipment
    ADD CONSTRAINT user_custom_equipment_user_id_equipment_name_key UNIQUE (user_id, equipment_name);


--
-- Name: user_equipment user_equipment_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_equipment
    ADD CONSTRAINT user_equipment_pkey PRIMARY KEY (id);


--
-- Name: user_equipment user_equipment_user_id_equipment_type_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_equipment
    ADD CONSTRAINT user_equipment_user_id_equipment_type_key UNIQUE (user_id, equipment_type);


--
-- Name: user_exercise_feedback user_exercise_feedback_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_exercise_feedback
    ADD CONSTRAINT user_exercise_feedback_pkey PRIMARY KEY (id);


--
-- Name: user_exercise_feedback user_exercise_feedback_user_session_exercise_unique; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_exercise_feedback
    ADD CONSTRAINT user_exercise_feedback_user_session_exercise_unique UNIQUE (user_id, session_id, exercise_order);


--
-- Name: user_home_training_stats user_home_training_stats_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_home_training_stats
    ADD CONSTRAINT user_home_training_stats_pkey PRIMARY KEY (id);


--
-- Name: user_home_training_stats user_home_training_stats_user_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_home_training_stats
    ADD CONSTRAINT user_home_training_stats_user_id_key UNIQUE (user_id);


--
-- Name: user_layouts user_layouts_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_layouts
    ADD CONSTRAINT user_layouts_pkey PRIMARY KEY (id);


--
-- Name: user_layouts user_layouts_user_id_layout_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_layouts
    ADD CONSTRAINT user_layouts_user_id_layout_id_key UNIQUE (user_id, layout_id);


--
-- Name: user_menstrual_config user_menstrual_config_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_menstrual_config
    ADD CONSTRAINT user_menstrual_config_pkey PRIMARY KEY (id);


--
-- Name: user_menstrual_config user_menstrual_config_user_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_menstrual_config
    ADD CONSTRAINT user_menstrual_config_user_id_key UNIQUE (user_id);


--
-- Name: user_menstrual_cycle user_menstrual_cycle_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_menstrual_cycle
    ADD CONSTRAINT user_menstrual_cycle_pkey PRIMARY KEY (id);


--
-- Name: user_metabolic_config user_metabolic_config_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_metabolic_config
    ADD CONSTRAINT user_metabolic_config_pkey PRIMARY KEY (user_id);


--
-- Name: user_metabolic_evaluations user_metabolic_evaluations_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_metabolic_evaluations
    ADD CONSTRAINT user_metabolic_evaluations_pkey PRIMARY KEY (id);


--
-- Name: user_metabolic_history user_metabolic_history_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_metabolic_history
    ADD CONSTRAINT user_metabolic_history_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_user_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_profiles
    ADD CONSTRAINT user_profiles_user_id_key UNIQUE (user_id);


--
-- Name: user_re_eval_config user_re_eval_config_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_re_eval_config
    ADD CONSTRAINT user_re_eval_config_pkey PRIMARY KEY (user_id);


--
-- Name: user_re_evaluations user_re_evaluations_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_re_evaluations
    ADD CONSTRAINT user_re_evaluations_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_session_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_sessions
    ADD CONSTRAINT user_sessions_session_id_key UNIQUE (session_id);


--
-- Name: user_sessions user_sessions_session_id_unique; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_sessions
    ADD CONSTRAINT user_sessions_session_id_unique UNIQUE (session_id);


--
-- Name: user_training_preferences user_training_preferences_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_training_preferences
    ADD CONSTRAINT user_training_preferences_pkey PRIMARY KEY (id);


--
-- Name: user_training_preferences user_training_preferences_user_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_training_preferences
    ADD CONSTRAINT user_training_preferences_user_id_key UNIQUE (user_id);


--
-- Name: user_training_state user_training_state_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_training_state
    ADD CONSTRAINT user_training_state_pkey PRIMARY KEY (id);


--
-- Name: user_training_state user_training_state_user_id_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_training_state
    ADD CONSTRAINT user_training_state_user_id_key UNIQUE (user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: warmup_sets_tracking warmup_sets_tracking_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.warmup_sets_tracking
    ADD CONSTRAINT warmup_sets_tracking_pkey PRIMARY KEY (id);


--
-- Name: weekly_calorie_targets weekly_calorie_targets_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.weekly_calorie_targets
    ADD CONSTRAINT weekly_calorie_targets_pkey PRIMARY KEY (id);


--
-- Name: weekly_calorie_targets weekly_calorie_targets_user_id_week_start_date_key; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.weekly_calorie_targets
    ADD CONSTRAINT weekly_calorie_targets_user_id_week_start_date_key UNIQUE (user_id, week_start_date);


--
-- Name: workout_schedule workout_schedule_pkey; Type: CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.workout_schedule
    ADD CONSTRAINT workout_schedule_pkey PRIMARY KEY (id);


--
-- Name: ejercicios_categoria_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ejercicios_categoria_idx ON app.ejercicios USING btree (categoria);


--
-- Name: ejercicios_disc_nivel_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ejercicios_disc_nivel_idx ON app.ejercicios USING btree (disciplina, nivel);


--
-- Name: ejercicios_disc_slug_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ejercicios_disc_slug_idx ON app.ejercicios USING btree (disciplina, slug);


--
-- Name: ejercicios_disc_source_uq; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX ejercicios_disc_source_uq ON app.ejercicios USING btree (disciplina, source_exercise_id);


--
-- Name: ejercicios_disciplina_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ejercicios_disciplina_idx ON app.ejercicios USING btree (disciplina);


--
-- Name: ejercicios_menstrual_restriction_idx; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX ejercicios_menstrual_restriction_idx ON app.ejercicios USING btree (disciplina, menstrual_restriction);


--
-- Name: idx_adaptation_blocks_methodology; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_adaptation_blocks_methodology ON app.adaptation_blocks USING btree (methodology_plan_id);


--
-- Name: idx_adaptation_blocks_user_status; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_adaptation_blocks_user_status ON app.adaptation_blocks USING btree (user_id, status);


--
-- Name: idx_adaptation_criteria_block; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_adaptation_criteria_block ON app.adaptation_criteria_tracking USING btree (adaptation_block_id);


--
-- Name: idx_adaptation_criteria_week; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_adaptation_criteria_week ON app.adaptation_criteria_tracking USING btree (adaptation_block_id, week_number);


--
-- Name: idx_ai_adjustments_applied; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_ai_adjustments_applied ON app.ai_adjustment_suggestions USING btree (applied);


--
-- Name: idx_ai_adjustments_eval; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_ai_adjustments_eval ON app.ai_adjustment_suggestions USING btree (re_evaluation_id);


--
-- Name: idx_ai_suggestions_assessment; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_ai_suggestions_assessment ON app.ai_adjustment_suggestions USING btree (progress_assessment) WHERE (applied = false);


--
-- Name: idx_blocks_user_active; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_blocks_user_active ON app.hypertrophy_blocks USING btree (user_id, is_active);


--
-- Name: idx_body_composition_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_body_composition_date ON app.body_composition_history USING btree (measurement_date DESC);


--
-- Name: idx_body_composition_user_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_body_composition_user_date ON app.body_composition_history USING btree (user_id, measurement_date DESC);


--
-- Name: idx_body_composition_user_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_body_composition_user_id ON app.body_composition_history USING btree (user_id);


--
-- Name: idx_body_measurements_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_body_measurements_date ON app.body_measurements USING btree (measurement_date DESC);


--
-- Name: idx_body_measurements_flagged; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_body_measurements_flagged ON app.user_body_measurements USING btree (user_id, flagged_suspicious) WHERE (flagged_suspicious = true);


--
-- Name: idx_body_measurements_peso; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_body_measurements_peso ON app.user_body_measurements USING btree (user_id, peso_kg);


--
-- Name: idx_body_measurements_unconfirmed; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_body_measurements_unconfirmed ON app.body_measurements USING btree (user_id, requires_confirmation) WHERE ((requires_confirmation = true) AND (user_confirmed = false));


--
-- Name: idx_body_measurements_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_body_measurements_user ON app.body_measurements USING btree (user_id);


--
-- Name: idx_body_measurements_user_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_body_measurements_user_date ON app.body_measurements USING btree (user_id, measurement_date DESC);


--
-- Name: idx_body_measurements_validated; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_body_measurements_validated ON app.user_body_measurements USING btree (user_id, validated, flagged_suspicious) WHERE ((validated = true) AND (flagged_suspicious = false));


--
-- Name: idx_body_measurements_validated_recent; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_body_measurements_validated_recent ON app.body_measurements USING btree (user_id, measurement_date DESC) WHERE (is_validated = true);


--
-- Name: idx_body_measurements_validation; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_body_measurements_validation ON app.body_measurements USING btree (user_id, is_validated) WHERE (requires_confirmation = true);


--
-- Name: idx_bomberos_categoria; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_bomberos_categoria ON app."Ejercicios_Bomberos" USING btree (categoria);


--
-- Name: idx_bomberos_nivel; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_bomberos_nivel ON app."Ejercicios_Bomberos" USING btree (nivel);


--
-- Name: idx_bomberos_tipo_prueba; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_bomberos_tipo_prueba ON app."Ejercicios_Bomberos" USING btree (tipo_prueba);


--
-- Name: idx_bridge_history_active; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_bridge_history_active ON app.bridge_adjustment_history USING btree (user_id, is_active) WHERE (is_active = true);


--
-- Name: idx_bridge_history_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_bridge_history_user ON app.bridge_adjustment_history USING btree (user_id);


--
-- Name: idx_bridge_logs_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_bridge_logs_date ON app.bridge_decision_logs USING btree (decision_date DESC);


--
-- Name: idx_bridge_logs_trigger; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_bridge_logs_trigger ON app.bridge_decision_logs USING btree (trigger_source, trigger_event);


--
-- Name: idx_bridge_logs_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_bridge_logs_user ON app.bridge_decision_logs USING btree (user_id);


--
-- Name: idx_calibrations_should_adjust; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_calibrations_should_adjust ON app.nutrition_calibrations USING btree (user_id, should_adjust) WHERE (should_adjust = true);


--
-- Name: idx_carb_timing_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_carb_timing_date ON app.carb_timing_logs USING btree (created_at DESC);


--
-- Name: idx_carb_timing_session; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_carb_timing_session ON app.carb_timing_logs USING btree (session_id);


--
-- Name: idx_carb_timing_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_carb_timing_user ON app.carb_timing_logs USING btree (user_id);


--
-- Name: idx_compensation_plan_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_compensation_plan_user ON app.daily_compensation_plan USING btree (user_id, compensation_date);


--
-- Name: idx_conversion_estados; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_conversion_estados ON app.food_conversion_factors USING btree (grupo_factor, estado_base, estado_objetivo);


--
-- Name: idx_conversion_grupo_factor; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_conversion_grupo_factor ON app.food_conversion_factors USING btree (grupo_factor);


--
-- Name: idx_crossfit_categoria; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_crossfit_categoria ON app."Ejercicios_CrossFit" USING btree (categoria);


--
-- Name: idx_crossfit_dominio; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_crossfit_dominio ON app."Ejercicios_CrossFit" USING btree (dominio);


--
-- Name: idx_crossfit_nivel; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_crossfit_nivel ON app."Ejercicios_CrossFit" USING btree (nivel);


--
-- Name: idx_crossfit_nivel_dominio; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_crossfit_nivel_dominio ON app."Ejercicios_CrossFit" USING btree (nivel, dominio);


--
-- Name: idx_crossfit_tipo_wod; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_crossfit_tipo_wod ON app."Ejercicios_CrossFit" USING btree (tipo_wod);


--
-- Name: idx_daily_nutrition_log_user_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_daily_nutrition_log_user_date ON app.daily_nutrition_log USING btree (user_id, log_date DESC);


--
-- Name: idx_diet_breaks_user_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_diet_breaks_user_date ON app.diet_breaks USING btree (user_id, break_date DESC);


--
-- Name: idx_diet_deviations_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_diet_deviations_date ON app.diet_deviations USING btree (deviation_date DESC);


--
-- Name: idx_diet_deviations_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_diet_deviations_user ON app.diet_deviations USING btree (user_id);


--
-- Name: idx_diet_deviations_week; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_diet_deviations_week ON app.diet_deviations USING btree (user_id, deviation_date);


--
-- Name: idx_equipment_items_category; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_equipment_items_category ON app.equipment_items USING btree (category);


--
-- Name: idx_equipment_items_difficulty; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_equipment_items_difficulty ON app.equipment_items USING btree (difficulty_level);


--
-- Name: idx_equipment_items_essential; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_equipment_items_essential ON app.equipment_items USING btree (is_essential);


--
-- Name: idx_equipment_items_type; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_equipment_items_type ON app.equipment_items USING btree (equipment_type);


--
-- Name: idx_exercise_ai_info_name; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_exercise_ai_info_name ON app.exercise_ai_info USING btree (exercise_name);


--
-- Name: idx_exercise_ai_info_normalized; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_exercise_ai_info_normalized ON app.exercise_ai_info USING btree (exercise_name_normalized);


--
-- Name: idx_exercise_ai_info_request_count; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_exercise_ai_info_request_count ON app.exercise_ai_info USING btree (request_count);


--
-- Name: idx_exercise_ai_info_requested_by; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_exercise_ai_info_requested_by ON app.exercise_ai_info USING btree (first_requested_by);


--
-- Name: idx_exercise_ai_info_verified; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_exercise_ai_info_verified ON app.exercise_ai_info USING btree (is_verified);


--
-- Name: idx_exercise_history_exercise_name; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_exercise_history_exercise_name ON app.exercise_history USING btree (exercise_name);


--
-- Name: idx_exercise_history_used_at; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_exercise_history_used_at ON app.exercise_history USING btree (used_at DESC);


--
-- Name: idx_exercise_history_user_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_exercise_history_user_id ON app.exercise_history USING btree (user_id);


--
-- Name: idx_exercise_history_user_recent; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_exercise_history_user_recent ON app.exercise_history USING btree (user_id, used_at DESC);


--
-- Name: idx_exercise_progress_exercise_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_exercise_progress_exercise_id ON app.methodology_exercise_progress USING btree (exercise_id);


--
-- Name: idx_exercise_progress_time; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_exercise_progress_time ON app.methodology_exercise_progress USING btree (time_spent_seconds);


--
-- Name: idx_exercise_session_tracking_session; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_exercise_session_tracking_session ON app.exercise_session_tracking USING btree (methodology_session_id);


--
-- Name: idx_exercise_session_tracking_status; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_exercise_session_tracking_status ON app.exercise_session_tracking USING btree (status);


--
-- Name: idx_exercise_session_tracking_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_exercise_session_tracking_user ON app.exercise_session_tracking USING btree (user_id);


--
-- Name: idx_fatigue_flags_session; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_fatigue_flags_session ON app.fatigue_flags USING btree (session_id);


--
-- Name: idx_fatigue_flags_type; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_fatigue_flags_type ON app.fatigue_flags USING btree (user_id, flag_type, flag_date DESC);


--
-- Name: idx_fatigue_flags_user_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_fatigue_flags_user_date ON app.fatigue_flags USING btree (user_id, flag_date DESC);


--
-- Name: idx_feedback_exercise; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_feedback_exercise ON app.methodology_exercise_feedback USING btree (exercise_name);


--
-- Name: idx_feedback_exercise_key; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_feedback_exercise_key ON app.user_exercise_feedback USING btree (exercise_key);


--
-- Name: idx_feedback_sentiment; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_feedback_sentiment ON app.methodology_exercise_feedback USING btree (sentiment);


--
-- Name: idx_feedback_session; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_feedback_session ON app.methodology_exercise_feedback USING btree (methodology_session_id);


--
-- Name: idx_feedback_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_feedback_user ON app.methodology_exercise_feedback USING btree (user_id);


--
-- Name: idx_feedback_user_created; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_feedback_user_created ON app.user_exercise_feedback USING btree (user_id, created_at DESC);


--
-- Name: idx_feedback_user_reason; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_feedback_user_reason ON app.methodology_session_feedback USING btree (user_id, reason_code);


--
-- Name: idx_food_pairing_rules_active; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_food_pairing_rules_active ON app.food_pairing_rules USING btree (is_active);


--
-- Name: idx_food_pairing_rules_contexts; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_food_pairing_rules_contexts ON app.food_pairing_rules USING gin (contexts);


--
-- Name: idx_food_roles_role; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_food_roles_role ON app.food_roles USING btree (role);


--
-- Name: idx_food_roles_slug; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_food_roles_slug ON app.food_roles USING btree (food_slug);


--
-- Name: idx_foods_categoria; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_foods_categoria ON app.foods USING btree (categoria);


--
-- Name: idx_foods_categoria_detalle; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_foods_categoria_detalle ON app.foods USING btree (categoria_detalle);


--
-- Name: idx_foods_estado_base; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_foods_estado_base ON app.foods USING btree (estado_pesado_base);


--
-- Name: idx_foods_grupo_factor; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_foods_grupo_factor ON app.foods USING btree (grupo_factor);


--
-- Name: idx_foods_is_vegan; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_foods_is_vegan ON app.foods USING btree (is_vegan) WHERE (is_vegan = true);


--
-- Name: idx_foods_is_vegetarian; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_foods_is_vegetarian ON app.foods USING btree (is_vegetarian) WHERE (is_vegetarian = true);


--
-- Name: idx_foods_meal_suitability; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_foods_meal_suitability ON app.foods USING gin (meal_suitability);


--
-- Name: idx_foods_processing_level; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_foods_processing_level ON app.foods USING btree (processing_level);


--
-- Name: idx_foods_slug; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_foods_slug ON app.foods USING btree (slug);


--
-- Name: idx_foods_snack_main_flags; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_foods_snack_main_flags ON app.foods USING btree (is_snack_only, is_main_dish_allowed);


--
-- Name: idx_foods_tags; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_foods_tags ON app.foods USING gin (tags);


--
-- Name: idx_guardia_civil_categoria; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_guardia_civil_categoria ON app."Ejercicios_Guardia_Civil" USING btree (categoria);


--
-- Name: idx_guardia_civil_nivel; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_guardia_civil_nivel ON app."Ejercicios_Guardia_Civil" USING btree (nivel);


--
-- Name: idx_guardia_civil_tipo_prueba; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_guardia_civil_tipo_prueba ON app."Ejercicios_Guardia_Civil" USING btree (tipo_prueba);


--
-- Name: idx_hipertrofia_v2_state_last_session; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_hipertrofia_v2_state_last_session ON app.hipertrofia_v2_state USING btree (user_id, last_session_at);


--
-- Name: idx_hipertrofia_v2_state_plan; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_hipertrofia_v2_state_plan ON app.hipertrofia_v2_state USING btree (methodology_plan_id);


--
-- Name: idx_home_combinations_type; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_home_combinations_type ON app.home_training_combinations USING btree (equipment_type, training_type);


--
-- Name: idx_home_combo_history_combo_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_home_combo_history_combo_id ON app.home_combination_exercise_history USING btree (combination_id);


--
-- Name: idx_home_combo_history_exercise; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_home_combo_history_exercise ON app.home_combination_exercise_history USING btree (exercise_name);


--
-- Name: idx_home_combo_history_times_used; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_home_combo_history_times_used ON app.home_combination_exercise_history USING btree (times_used DESC);


--
-- Name: idx_home_combo_history_user_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_home_combo_history_user_id ON app.home_combination_exercise_history USING btree (user_id);


--
-- Name: idx_home_exercise_history_created_at; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_home_exercise_history_created_at ON app.home_exercise_history USING btree (created_at);


--
-- Name: idx_home_exercise_history_plan; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_home_exercise_history_plan ON app.home_exercise_history USING btree (plan_id);


--
-- Name: idx_home_exercise_history_session; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_home_exercise_history_session ON app.home_exercise_history USING btree (session_id);


--
-- Name: idx_home_exercise_history_user_exercise; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_home_exercise_history_user_exercise ON app.home_exercise_history USING btree (user_id, exercise_name);


--
-- Name: idx_home_exercise_history_user_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_home_exercise_history_user_id ON app.home_exercise_history USING btree (user_id);


--
-- Name: idx_home_exercise_progress_session_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_home_exercise_progress_session_id ON app.home_exercise_progress USING btree (home_training_session_id);


--
-- Name: idx_home_exercise_rejections_active; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_home_exercise_rejections_active ON app.home_exercise_rejections USING btree (is_active);


--
-- Name: idx_home_exercise_rejections_combo; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_home_exercise_rejections_combo ON app.home_exercise_rejections USING btree (user_id, equipment_type, training_type, is_active);


--
-- Name: idx_home_exercise_rejections_exercise_key; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_home_exercise_rejections_exercise_key ON app.home_exercise_rejections USING btree (exercise_key);


--
-- Name: idx_home_exercise_rejections_expires_at; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_home_exercise_rejections_expires_at ON app.home_exercise_rejections USING btree (expires_at);


--
-- Name: idx_home_exercise_rejections_user_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_home_exercise_rejections_user_id ON app.home_exercise_rejections USING btree (user_id);


--
-- Name: idx_home_training_plans_user_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_home_training_plans_user_id ON app.home_training_plans USING btree (user_id);


--
-- Name: idx_home_training_sessions_abandoned_at; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_home_training_sessions_abandoned_at ON app.home_training_sessions USING btree (abandoned_at) WHERE (abandoned_at IS NOT NULL);


--
-- Name: idx_home_training_sessions_plan_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_home_training_sessions_plan_id ON app.home_training_sessions USING btree (home_training_plan_id);


--
-- Name: idx_home_training_sessions_user_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_home_training_sessions_user_id ON app.home_training_sessions USING btree (user_id);


--
-- Name: idx_hypertrophy_templates_day; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_hypertrophy_templates_day ON app.hypertrophy_weekly_templates USING btree (template_name, day_of_week);


--
-- Name: idx_icg_ipg_history_status; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_icg_ipg_history_status ON app.icg_ipg_state_history USING btree (user_id, status) WHERE (status_confirmed = false);


--
-- Name: idx_icg_ipg_history_type; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_icg_ipg_history_type ON app.icg_ipg_state_history USING btree (user_id, indicator_type, measurement_date DESC);


--
-- Name: idx_icg_ipg_history_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_icg_ipg_history_user ON app.icg_ipg_state_history USING btree (user_id, measurement_date DESC);


--
-- Name: idx_items_alimento; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_items_alimento ON app.nutrition_meal_items USING btree (alimento_id);


--
-- Name: idx_items_meal; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_items_meal ON app.nutrition_meal_items USING btree (meal_id);


--
-- Name: idx_meal_acceptability_rules_active; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_meal_acceptability_rules_active ON app.meal_acceptability_rules USING btree (meal_type, diet_type, is_active);


--
-- Name: idx_meal_items_food_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_meal_items_food_id ON app.nutrition_meal_items USING btree (food_id);


--
-- Name: idx_meal_template_slots_role; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_meal_template_slots_role ON app.meal_template_slots USING btree (slot_role);


--
-- Name: idx_meal_templates_filters; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_meal_templates_filters ON app.meal_templates USING btree (meal_type, diet_allowed, day_context, is_active);


--
-- Name: idx_meals_plan_day; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_meals_plan_day ON app.nutrition_meals USING btree (plan_day_id);


--
-- Name: idx_meh_completed_at; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_meh_completed_at ON app.methodology_exercise_history_complete USING btree (completed_at);


--
-- Name: idx_meh_plan_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_meh_plan_id ON app.methodology_exercise_history_complete USING btree (methodology_plan_id);


--
-- Name: idx_meh_session_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_meh_session_date ON app.methodology_exercise_history_complete USING btree (session_date);


--
-- Name: idx_meh_session_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_meh_session_id ON app.methodology_exercise_history_complete USING btree (methodology_session_id);


--
-- Name: idx_meh_user_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_meh_user_id ON app.methodology_exercise_history_complete USING btree (user_id);


--
-- Name: idx_menstrual_cycle_history_start; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_menstrual_cycle_history_start ON app.menstrual_cycle_history USING btree (user_id, bleed_start_date);


--
-- Name: idx_menstrual_cycle_history_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_menstrual_cycle_history_user ON app.menstrual_cycle_history USING btree (user_id);


--
-- Name: idx_menstrual_deload_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_menstrual_deload_user ON app.menstrual_deload_state USING btree (user_id);


--
-- Name: idx_menstrual_pattern_metrics_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_menstrual_pattern_metrics_user ON app.menstrual_pattern_metrics USING btree (user_id);


--
-- Name: idx_mep_session; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_mep_session ON app.methodology_exercise_progress USING btree (methodology_session_id);


--
-- Name: idx_mep_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_mep_user ON app.methodology_exercise_progress USING btree (user_id);


--
-- Name: idx_mes_plan; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_mes_plan ON app.methodology_exercise_sessions USING btree (methodology_plan_id);


--
-- Name: idx_mes_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_mes_user ON app.methodology_exercise_sessions USING btree (user_id);


--
-- Name: idx_metabolic_eval_confidence; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_metabolic_eval_confidence ON app.user_metabolic_evaluations USING btree (confidence_level);


--
-- Name: idx_metabolic_eval_profile; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_metabolic_eval_profile ON app.user_metabolic_evaluations USING btree (metabolic_profile);


--
-- Name: idx_metabolic_history_profile_change; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_metabolic_history_profile_change ON app.user_metabolic_history USING btree (user_id, previous_profile, new_profile);


--
-- Name: idx_methodology_exercise_sessions_current; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_methodology_exercise_sessions_current ON app.methodology_exercise_sessions USING btree (user_id, is_current_session) WHERE (is_current_session = true);


--
-- Name: idx_methodology_exercise_sessions_plan; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_methodology_exercise_sessions_plan ON app.methodology_exercise_sessions USING btree (methodology_plan_id, session_status);


--
-- Name: idx_methodology_exercise_sessions_user_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_methodology_exercise_sessions_user_date ON app.methodology_exercise_sessions USING btree (user_id, session_date);


--
-- Name: idx_methodology_plan_days_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_methodology_plan_days_date ON app.methodology_plan_days USING btree (plan_id, date_local);


--
-- Name: idx_methodology_plan_days_plan_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_methodology_plan_days_plan_date ON app.methodology_plan_days USING btree (plan_id, date_local);


--
-- Name: idx_methodology_plan_days_plan_day; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_methodology_plan_days_plan_day ON app.methodology_plan_days USING btree (plan_id, day_id);


--
-- Name: idx_methodology_plans_active; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_methodology_plans_active ON app.methodology_plans USING btree (user_id) WHERE ((status)::text = 'active'::text);


--
-- Name: idx_methodology_plans_user_status; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_methodology_plans_user_status ON app.methodology_plans USING btree (user_id, status);


--
-- Name: idx_methodology_progress_session; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_methodology_progress_session ON app.methodology_exercise_progress USING btree (methodology_session_id, exercise_order);


--
-- Name: idx_methodology_session_feedback_plan; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_methodology_session_feedback_plan ON app.methodology_session_feedback USING btree (methodology_plan_id);


--
-- Name: idx_methodology_sessions_calendar; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_methodology_sessions_calendar ON app.methodology_exercise_sessions USING btree (user_id, year_number, month_number, day_of_month);


--
-- Name: idx_methodology_sessions_date_range; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_methodology_sessions_date_range ON app.methodology_exercise_sessions USING btree (session_date, user_id);


--
-- Name: idx_methodology_sessions_plan_day; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_methodology_sessions_plan_day ON app.methodology_exercise_sessions USING btree (methodology_plan_id, day_id);


--
-- Name: idx_methodology_sessions_plan_week_day; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_methodology_sessions_plan_week_day ON app.methodology_exercise_sessions USING btree (methodology_plan_id, week_number, day_name);


--
-- Name: idx_methodology_sessions_started_at; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_methodology_sessions_started_at ON app.methodology_exercise_sessions USING btree (session_started_at);


--
-- Name: idx_mindfeed_priority_events_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_mindfeed_priority_events_user ON app.mindfeed_priority_events USING btree (user_id, created_at DESC);


--
-- Name: idx_mindfeed_transition_events_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_mindfeed_transition_events_user ON app.mindfeed_transition_events USING btree (user_id, created_at DESC);


--
-- Name: idx_music_playlists_created_at; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_music_playlists_created_at ON app.music_playlists USING btree (created_at DESC);


--
-- Name: idx_music_playlists_tracks_gin; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_music_playlists_tracks_gin ON app.music_playlists USING gin (tracks);


--
-- Name: idx_music_playlists_user_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_music_playlists_user_id ON app.music_playlists USING btree (user_id);


--
-- Name: idx_music_playlists_user_name; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_music_playlists_user_name ON app.music_playlists USING btree (user_id, name);


--
-- Name: idx_nutrition_adjustment_actions_user_active; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_nutrition_adjustment_actions_user_active ON app.nutrition_adjustment_actions USING btree (user_id, applied_at DESC) WHERE (reverted_at IS NULL);


--
-- Name: idx_nutrition_adjustment_actions_user_applied; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_nutrition_adjustment_actions_user_applied ON app.nutrition_adjustment_actions USING btree (user_id, applied_at DESC);


--
-- Name: idx_nutrition_calibrations_applied; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_nutrition_calibrations_applied ON app.nutrition_calibrations USING btree (applied) WHERE (applied = false);


--
-- Name: idx_nutrition_calibrations_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_nutrition_calibrations_user ON app.nutrition_calibrations USING btree (user_id, calibration_date DESC);


--
-- Name: idx_nutrition_change_log_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_nutrition_change_log_date ON app.nutrition_change_log USING btree (change_date DESC);


--
-- Name: idx_nutrition_change_log_type; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_nutrition_change_log_type ON app.nutrition_change_log USING btree (user_id, change_type);


--
-- Name: idx_nutrition_change_log_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_nutrition_change_log_user ON app.nutrition_change_log USING btree (user_id);


--
-- Name: idx_nutrition_evaluations_user_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_nutrition_evaluations_user_date ON app.nutrition_evaluations USING btree (user_id, evaluation_date DESC);


--
-- Name: idx_nutrition_menu_generation_logs_mode_created_at; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_nutrition_menu_generation_logs_mode_created_at ON app.nutrition_menu_generation_logs USING btree (mode_used, created_at DESC);


--
-- Name: idx_nutrition_menu_generation_logs_user_created_at; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_nutrition_menu_generation_logs_user_created_at ON app.nutrition_menu_generation_logs USING btree (user_id, created_at DESC);


--
-- Name: idx_nutrition_phase_history_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_nutrition_phase_history_user ON app.nutrition_phase_history USING btree (user_id, started_at DESC);


--
-- Name: idx_nutrition_plans_user_active; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_nutrition_plans_user_active ON app.nutrition_plans USING btree (user_id, is_active) WHERE (is_active = true);


--
-- Name: idx_nutrition_plans_v2_tipo; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_nutrition_plans_v2_tipo ON app.nutrition_plans_v2 USING btree (tipo);


--
-- Name: idx_nutrition_plans_v2_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_nutrition_plans_v2_user ON app.nutrition_plans_v2 USING btree (user_id);


--
-- Name: idx_nutrition_plans_v2_user_active; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_nutrition_plans_v2_user_active ON app.nutrition_plans_v2 USING btree (user_id) WHERE (tipo = 'activo'::text);


--
-- Name: idx_nutrition_profiles_objetivo; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_nutrition_profiles_objetivo ON app.nutrition_profiles USING btree (objetivo);


--
-- Name: idx_nutrition_weekly_snapshots_phase; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_nutrition_weekly_snapshots_phase ON app.nutrition_weekly_snapshots USING btree (user_id, phase);


--
-- Name: idx_nutrition_weekly_snapshots_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_nutrition_weekly_snapshots_user ON app.nutrition_weekly_snapshots USING btree (user_id, snapshot_date DESC);


--
-- Name: idx_plan_start_config_start_day; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_plan_start_config_start_day ON app.plan_start_config USING btree (start_day_of_week);


--
-- Name: idx_plan_start_config_user_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_plan_start_config_user_id ON app.plan_start_config USING btree (user_id);


--
-- Name: idx_plans_user_created; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_plans_user_created ON app.home_training_plans USING btree (user_id, created_at DESC);


--
-- Name: idx_plans_user_time; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_plans_user_time ON app.home_training_plans USING btree (user_id, created_at DESC);


--
-- Name: idx_policia_local_categoria; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_policia_local_categoria ON app."Ejercicios_Policia_Local" USING btree (categoria);


--
-- Name: idx_policia_local_nivel; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_policia_local_nivel ON app."Ejercicios_Policia_Local" USING btree (nivel);


--
-- Name: idx_policia_local_tipo_prueba; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_policia_local_tipo_prueba ON app."Ejercicios_Policia_Local" USING btree (tipo_prueba);


--
-- Name: idx_progress_session_order; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_progress_session_order ON app.home_exercise_progress USING btree (home_training_session_id, exercise_order);


--
-- Name: idx_progress_session_status; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_progress_session_status ON app.home_exercise_progress USING btree (home_training_session_id, status);


--
-- Name: idx_progression_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_progression_user ON app.hypertrophy_progression USING btree (user_id);


--
-- Name: idx_re_eval_exercises_eval; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_re_eval_exercises_eval ON app.re_evaluation_exercises USING btree (re_evaluation_id);


--
-- Name: idx_re_eval_exercises_name; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_re_eval_exercises_name ON app.re_evaluation_exercises USING btree (exercise_name);


--
-- Name: idx_re_eval_user_week; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_re_eval_user_week ON app.user_re_evaluations USING btree (user_id, week_number);


--
-- Name: idx_recipe_items_food; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_recipe_items_food ON app.recipe_items USING btree (food_id);


--
-- Name: idx_recipe_items_recipe; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_recipe_items_recipe ON app.recipe_items USING btree (recipe_id, slot_order);


--
-- Name: idx_recipes_lookup; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_recipes_lookup ON app.recipes USING btree (meal_type, day_context, diet_allowed, is_active);


--
-- Name: idx_reevaluation_pending; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_reevaluation_pending ON app.level_reevaluations USING btree (user_id, accepted);


--
-- Name: idx_reevaluation_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_reevaluation_user ON app.level_reevaluations USING btree (user_id);


--
-- Name: idx_session_config_cycle_day; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_session_config_cycle_day ON app.hipertrofia_v2_session_config USING btree (cycle_day);


--
-- Name: idx_session_feedback_plan; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_session_feedback_plan ON app.methodology_session_feedback USING btree (methodology_plan_id);


--
-- Name: idx_sessions_duration; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_sessions_duration ON app.methodology_exercise_sessions USING btree (modal_time_total_seconds, actual_session_duration_seconds);


--
-- Name: idx_sessions_plan_week_day; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_sessions_plan_week_day ON app.methodology_exercise_sessions USING btree (methodology_plan_id, week_number, day_name);


--
-- Name: idx_sessions_user_started; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_sessions_user_started ON app.home_training_sessions USING btree (user_id, started_at DESC);


--
-- Name: idx_set_logs_plan; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_set_logs_plan ON app.hypertrophy_set_logs USING btree (methodology_plan_id);


--
-- Name: idx_set_logs_session; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_set_logs_session ON app.hypertrophy_set_logs USING btree (session_id);


--
-- Name: idx_set_logs_user_exercise; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_set_logs_user_exercise ON app.hypertrophy_set_logs USING btree (user_id, exercise_id, created_at DESC);


--
-- Name: idx_technique_corrections_user_muscle; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_technique_corrections_user_muscle ON app.technique_corrections USING btree (user_id, muscle_group, created_at DESC);


--
-- Name: idx_technique_flags_block; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_technique_flags_block ON app.adaptation_technique_flags USING btree (adaptation_block_id);


--
-- Name: idx_technique_flags_resolved; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_technique_flags_resolved ON app.adaptation_technique_flags USING btree (adaptation_block_id, resolved);


--
-- Name: idx_technique_flags_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_technique_flags_user ON app.adaptation_technique_flags USING btree (user_id, flagged_at);


--
-- Name: idx_training_performance_trend; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_training_performance_trend ON app.training_performance_log USING btree (user_id, performance_trend) WHERE ((performance_trend)::text = 'baja'::text);


--
-- Name: idx_training_performance_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_training_performance_user ON app.training_performance_log USING btree (user_id, measurement_date DESC);


--
-- Name: idx_uef_created_at; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_uef_created_at ON app.user_exercise_feedback USING btree (created_at);


--
-- Name: idx_uef_exercise_key; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_uef_exercise_key ON app.user_exercise_feedback USING btree (exercise_key);


--
-- Name: idx_uef_session_order; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_uef_session_order ON app.user_exercise_feedback USING btree (user_id, session_id, exercise_order);


--
-- Name: idx_user_custom_equipment_available; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_custom_equipment_available ON app.user_custom_equipment USING btree (is_available);


--
-- Name: idx_user_custom_equipment_type; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_custom_equipment_type ON app.user_custom_equipment USING btree (equipment_type);


--
-- Name: idx_user_custom_equipment_user_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_custom_equipment_user_id ON app.user_custom_equipment USING btree (user_id);


--
-- Name: idx_user_equipment_user_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_equipment_user_id ON app.user_equipment USING btree (user_id);


--
-- Name: idx_user_exercise_feedback_active; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_exercise_feedback_active ON app.user_exercise_feedback USING btree (user_id, methodology_type, expires_at);


--
-- Name: idx_user_exercise_feedback_exercise; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_exercise_feedback_exercise ON app.user_exercise_feedback USING btree (exercise_name);


--
-- Name: idx_user_exercise_feedback_methodology; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_exercise_feedback_methodology ON app.user_exercise_feedback USING btree (user_id, methodology_type);


--
-- Name: idx_user_exercise_feedback_type; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_exercise_feedback_type ON app.user_exercise_feedback USING btree (feedback_type);


--
-- Name: idx_user_exercise_feedback_user_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_exercise_feedback_user_id ON app.user_exercise_feedback USING btree (user_id);


--
-- Name: idx_user_home_stats_user_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_home_stats_user_id ON app.user_home_training_stats USING btree (user_id);


--
-- Name: idx_user_layouts_user_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_layouts_user_id ON app.user_layouts USING btree (user_id);


--
-- Name: idx_user_metabolic_evaluations_active; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_metabolic_evaluations_active ON app.user_metabolic_evaluations USING btree (user_id, is_active) WHERE (is_active = true);


--
-- Name: idx_user_metabolic_evaluations_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_metabolic_evaluations_date ON app.user_metabolic_evaluations USING btree (evaluation_date DESC);


--
-- Name: idx_user_metabolic_evaluations_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_metabolic_evaluations_user ON app.user_metabolic_evaluations USING btree (user_id);


--
-- Name: idx_user_metabolic_history_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_metabolic_history_date ON app.user_metabolic_history USING btree (created_at DESC);


--
-- Name: idx_user_metabolic_history_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_metabolic_history_user ON app.user_metabolic_history USING btree (user_id);


--
-- Name: idx_user_profiles_dias_preferidos; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_profiles_dias_preferidos ON app.user_profiles USING gin (dias_preferidos_entrenamiento);


--
-- Name: idx_user_profiles_metodologia; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_profiles_metodologia ON app.user_profiles USING btree (metodologia_preferida);


--
-- Name: idx_user_profiles_objetivo; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_profiles_objetivo ON app.user_profiles USING btree (objetivo_principal);


--
-- Name: idx_user_profiles_user_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_profiles_user_id ON app.user_profiles USING btree (user_id);


--
-- Name: idx_user_re_eval_config_frequency; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_re_eval_config_frequency ON app.user_re_eval_config USING btree (frequency_weeks);


--
-- Name: idx_user_re_evaluations_created; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_re_evaluations_created ON app.user_re_evaluations USING btree (created_at DESC);


--
-- Name: idx_user_re_evaluations_plan; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_re_evaluations_plan ON app.user_re_evaluations USING btree (methodology_plan_id);


--
-- Name: idx_user_re_evaluations_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_re_evaluations_user ON app.user_re_evaluations USING btree (user_id);


--
-- Name: idx_user_sessions_active; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_sessions_active ON app.user_sessions USING btree (is_active);


--
-- Name: idx_user_sessions_jwt_token_hash; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_sessions_jwt_token_hash ON app.user_sessions USING btree (jwt_token_hash);


--
-- Name: idx_user_sessions_metadata_gin; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_sessions_metadata_gin ON app.user_sessions USING gin (session_metadata);


--
-- Name: idx_user_sessions_user_id; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_sessions_user_id ON app.user_sessions USING btree (user_id);


--
-- Name: idx_user_training_state_active_plan; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_training_state_active_plan ON app.user_training_state USING btree (active_methodology_plan_id);


--
-- Name: idx_user_training_state_active_session; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_training_state_active_session ON app.user_training_state USING btree (active_session_id);


--
-- Name: idx_user_training_state_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_user_training_state_user ON app.user_training_state USING btree (user_id);


--
-- Name: idx_users_alergias_gin; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_users_alergias_gin ON app.users USING gin (alergias);


--
-- Name: idx_users_alimentos_excluidos_gin; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_users_alimentos_excluidos_gin ON app.users USING gin (alimentos_excluidos);


--
-- Name: idx_users_email; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_users_email ON app.users USING btree (email);


--
-- Name: idx_users_limitaciones_fisicas_gin; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_users_limitaciones_fisicas_gin ON app.users USING gin (limitaciones_fisicas);


--
-- Name: idx_users_medicamentos_gin; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_users_medicamentos_gin ON app.users USING gin (medicamentos);


--
-- Name: idx_users_nivel_anos; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_users_nivel_anos ON app.users USING btree (nivel_entrenamiento, anos_entrenando);


--
-- Name: idx_users_suplementacion_gin; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_users_suplementacion_gin ON app.users USING gin (suplementacion);


--
-- Name: idx_warmup_exercise; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_warmup_exercise ON app.warmup_sets_tracking USING btree (user_id, exercise_id);


--
-- Name: idx_warmup_user_session; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_warmup_user_session ON app.warmup_sets_tracking USING btree (user_id, session_id);


--
-- Name: idx_weekly_targets_current; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_weekly_targets_current ON app.weekly_calorie_targets USING btree (user_id, is_current) WHERE (is_current = true);


--
-- Name: idx_weekly_targets_user; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_weekly_targets_user ON app.weekly_calorie_targets USING btree (user_id);


--
-- Name: idx_workout_schedule_plan_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_workout_schedule_plan_date ON app.workout_schedule USING btree (methodology_plan_id, scheduled_date);


--
-- Name: idx_workout_schedule_plan_day; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX idx_workout_schedule_plan_day ON app.workout_schedule USING btree (methodology_plan_id, day_id);


--
-- Name: idx_workout_schedule_plan_week; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_workout_schedule_plan_week ON app.workout_schedule USING btree (methodology_plan_id, week_number);


--
-- Name: idx_workout_schedule_plan_week_day; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_workout_schedule_plan_week_day ON app.workout_schedule USING btree (methodology_plan_id, week_number, day_name);


--
-- Name: idx_workout_schedule_status; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_workout_schedule_status ON app.workout_schedule USING btree (status);


--
-- Name: idx_workout_schedule_user_date; Type: INDEX; Schema: app; Owner: -
--

CREATE INDEX idx_workout_schedule_user_date ON app.workout_schedule USING btree (user_id, scheduled_date);


--
-- Name: mindfeed_rulesets_one_active_per_scope; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX mindfeed_rulesets_one_active_per_scope ON app.mindfeed_rulesets USING btree (scope) WHERE (is_active = true);


--
-- Name: uidx_progress_session_order; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX uidx_progress_session_order ON app.home_exercise_progress USING btree (home_training_session_id, exercise_order);


--
-- Name: uidx_session_config_cycle_day; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX uidx_session_config_cycle_day ON app.hipertrofia_v2_session_config USING btree (cycle_day);


--
-- Name: uniq_current_methodology_plan; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX uniq_current_methodology_plan ON app.methodology_plans USING btree (user_id) WHERE ((is_current IS TRUE) AND ((status)::text = 'active'::text));


--
-- Name: unique_home_exercise_user_session; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX unique_home_exercise_user_session ON app.home_exercise_history USING btree (user_id, exercise_name, session_id);


--
-- Name: ux_foods_nombre; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX ux_foods_nombre ON app.foods USING btree (lower(nombre));


--
-- Name: ux_meals_plan_day_orden; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX ux_meals_plan_day_orden ON app.nutrition_meals USING btree (plan_day_id, orden);


--
-- Name: ux_plan_day_index; Type: INDEX; Schema: app; Owner: -
--

CREATE UNIQUE INDEX ux_plan_day_index ON app.nutrition_plan_days USING btree (plan_id, day_index);


--
-- Name: adaptation_progress_summary _RETURN; Type: RULE; Schema: app; Owner: -
--

CREATE OR REPLACE VIEW app.adaptation_progress_summary AS
 SELECT b.id AS adaptation_block_id,
    b.user_id,
    b.block_type,
    b.duration_weeks,
    b.start_date,
    b.status,
    count(t.week_number) AS weeks_tracked,
    max(t.week_number) AS latest_week,
    ( SELECT (((adaptation_criteria_tracking.sessions_completed)::numeric / (NULLIF(adaptation_criteria_tracking.sessions_planned, 0))::numeric) * (100)::numeric)
           FROM app.adaptation_criteria_tracking
          WHERE (adaptation_criteria_tracking.adaptation_block_id = b.id)
          ORDER BY adaptation_criteria_tracking.week_number DESC
         LIMIT 1) AS latest_adherence_pct,
    ( SELECT adaptation_criteria_tracking.mean_rir
           FROM app.adaptation_criteria_tracking
          WHERE (adaptation_criteria_tracking.adaptation_block_id = b.id)
          ORDER BY adaptation_criteria_tracking.week_number DESC
         LIMIT 1) AS latest_mean_rir,
        CASE
            WHEN (( SELECT ((adaptation_criteria_tracking.sessions_completed)::numeric / (NULLIF(adaptation_criteria_tracking.sessions_planned, 0))::numeric)
               FROM app.adaptation_criteria_tracking
              WHERE (adaptation_criteria_tracking.adaptation_block_id = b.id)
              ORDER BY adaptation_criteria_tracking.week_number DESC
             LIMIT 1) >= 0.8) THEN true
            ELSE false
        END AS latest_adherence_met,
        CASE
            WHEN (( SELECT adaptation_criteria_tracking.mean_rir
               FROM app.adaptation_criteria_tracking
              WHERE (adaptation_criteria_tracking.adaptation_block_id = b.id)
              ORDER BY adaptation_criteria_tracking.week_number DESC
             LIMIT 1) <= 4.0) THEN true
            ELSE false
        END AS latest_rir_met,
        CASE
            WHEN (((b.status)::text = 'active'::text) AND (( SELECT count(*) AS count
               FROM app.adaptation_criteria_tracking
              WHERE (adaptation_criteria_tracking.adaptation_block_id = b.id)) >= b.duration_weeks)) THEN true
            ELSE false
        END AS ready_for_transition
   FROM (app.adaptation_blocks b
     LEFT JOIN app.adaptation_criteria_tracking t ON ((b.id = t.adaptation_block_id)))
  GROUP BY b.id;


--
-- Name: v_re_evaluation_history _RETURN; Type: RULE; Schema: app; Owner: -
--

CREATE OR REPLACE VIEW app.v_re_evaluation_history AS
 SELECT re.id,
    re.user_id,
    re.methodology_plan_id,
    mp.methodology_type,
    re.week_number,
    re.sentiment,
    re.overall_comment,
    re.created_at AS evaluation_date,
    count(ree.id) AS exercises_evaluated,
    avg(
        CASE ree.difficulty_rating
            WHEN 'facil'::text THEN 1
            WHEN 'adecuado'::text THEN 2
            WHEN 'dificil'::text THEN 3
            ELSE NULL::integer
        END) AS avg_difficulty,
    ai.progress_assessment,
    ai.intensity_change,
    ai.motivational_feedback,
    ai.applied AS adjustments_applied
   FROM (((app.user_re_evaluations re
     LEFT JOIN app.methodology_plans mp ON ((re.methodology_plan_id = mp.id)))
     LEFT JOIN app.re_evaluation_exercises ree ON ((re.id = ree.re_evaluation_id)))
     LEFT JOIN app.ai_adjustment_suggestions ai ON ((re.id = ai.re_evaluation_id)))
  GROUP BY re.id, mp.methodology_type, ai.id;


--
-- Name: users set_timestamp_users; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER set_timestamp_users BEFORE UPDATE ON app.users FOR EACH ROW EXECUTE FUNCTION app.set_timestamp();


--
-- Name: exercise_ai_info tr_update_exercise_ai_info; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER tr_update_exercise_ai_info BEFORE INSERT OR UPDATE ON app.exercise_ai_info FOR EACH ROW EXECUTE FUNCTION app.update_exercise_ai_info();


--
-- Name: home_exercise_rejections tr_update_home_exercise_rejections_timestamp; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER tr_update_home_exercise_rejections_timestamp BEFORE UPDATE ON app.home_exercise_rejections FOR EACH ROW EXECUTE FUNCTION app.update_rejection_timestamp();


--
-- Name: body_measurements trg_body_measurement_updated; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_body_measurement_updated BEFORE UPDATE ON app.body_measurements FOR EACH ROW EXECUTE FUNCTION app.update_measurement_timestamp();


--
-- Name: body_measurements trg_body_measurements_updated; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_body_measurements_updated BEFORE UPDATE ON app.body_measurements FOR EACH ROW EXECUTE FUNCTION app.update_body_measurements_timestamp();


--
-- Name: user_body_measurements trg_body_measurements_updated; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_body_measurements_updated BEFORE UPDATE ON app.user_body_measurements FOR EACH ROW EXECUTE FUNCTION app.update_body_measurements_timestamp();


--
-- Name: bridge_recalculation_config trg_bridge_config_updated; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_bridge_config_updated BEFORE UPDATE ON app.bridge_recalculation_config FOR EACH ROW EXECUTE FUNCTION app.update_bridge_timestamp();


--
-- Name: bridge_current_state trg_bridge_state_updated; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_bridge_state_updated BEFORE UPDATE ON app.bridge_current_state FOR EACH ROW EXECUTE FUNCTION app.update_bridge_timestamp();


--
-- Name: user_calibration_config trg_calibration_config_updated; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_calibration_config_updated BEFORE UPDATE ON app.user_calibration_config FOR EACH ROW EXECUTE FUNCTION app.update_next_calibration_date();


--
-- Name: user_metabolic_evaluations trg_deactivate_previous_metabolic; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_deactivate_previous_metabolic AFTER INSERT ON app.user_metabolic_evaluations FOR EACH ROW EXECUTE FUNCTION app.deactivate_previous_metabolic_evaluations();


--
-- Name: diet_deviations trg_diet_deviation_updated; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_diet_deviation_updated BEFORE UPDATE ON app.diet_deviations FOR EACH ROW EXECUTE FUNCTION app.update_deviation_timestamp();


--
-- Name: foods trg_foods_touch; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_foods_touch BEFORE UPDATE ON app.foods FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();


--
-- Name: music_playlists trg_music_playlists_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_music_playlists_updated_at BEFORE UPDATE ON app.music_playlists FOR EACH ROW EXECUTE FUNCTION app.update_music_playlists_updated_at();


--
-- Name: nutrition_plans_v2 trg_nutrition_plans_v2_touch; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_nutrition_plans_v2_touch BEFORE UPDATE ON app.nutrition_plans_v2 FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();


--
-- Name: nutrition_profiles trg_nutrition_profiles_touch; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_nutrition_profiles_touch BEFORE UPDATE ON app.nutrition_profiles FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();


--
-- Name: users trg_save_body_composition; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_save_body_composition AFTER UPDATE ON app.users FOR EACH ROW EXECUTE FUNCTION app.save_body_composition();


--
-- Name: nutrition_calibrations trg_update_calibration_on_apply; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_update_calibration_on_apply AFTER UPDATE ON app.nutrition_calibrations FOR EACH ROW EXECUTE FUNCTION app.update_last_calibration_on_apply();


--
-- Name: mindfeed_rulesets trg_update_mindfeed_rulesets_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_update_mindfeed_rulesets_updated_at BEFORE UPDATE ON app.mindfeed_rulesets FOR EACH ROW EXECUTE FUNCTION app.update_mindfeed_rulesets_updated_at();


--
-- Name: hypertrophy_set_logs trg_update_progression; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_update_progression AFTER INSERT ON app.hypertrophy_set_logs FOR EACH ROW WHEN (((new.is_warmup = false) AND (new.is_effective = true))) EXECUTE FUNCTION app.update_hypertrophy_progression();


--
-- Name: user_re_eval_config trg_update_re_eval_config_timestamp; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_update_re_eval_config_timestamp BEFORE UPDATE ON app.user_re_eval_config FOR EACH ROW EXECUTE FUNCTION app.update_re_eval_config_timestamp();


--
-- Name: user_metabolic_config trg_user_metabolic_config_updated; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_user_metabolic_config_updated BEFORE UPDATE ON app.user_metabolic_config FOR EACH ROW EXECUTE FUNCTION app.update_metabolic_timestamp();


--
-- Name: user_metabolic_evaluations trg_user_metabolic_evaluations_updated; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_user_metabolic_evaluations_updated BEFORE UPDATE ON app.user_metabolic_evaluations FOR EACH ROW EXECUTE FUNCTION app.update_metabolic_timestamp();


--
-- Name: weekly_calorie_targets trg_weekly_target_updated; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trg_weekly_target_updated BEFORE UPDATE ON app.weekly_calorie_targets FOR EACH ROW EXECUTE FUNCTION app.update_deviation_timestamp();


--
-- Name: home_exercise_progress trigger_12_combinations_history_on_exercise_complete; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trigger_12_combinations_history_on_exercise_complete AFTER UPDATE ON app.home_exercise_progress FOR EACH ROW EXECUTE FUNCTION app.trigger_update_12_combinations_history();


--
-- Name: hypertrophy_set_logs trigger_calculate_set_metrics; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trigger_calculate_set_metrics BEFORE INSERT ON app.hypertrophy_set_logs FOR EACH ROW EXECUTE FUNCTION app.auto_calculate_set_metrics();


--
-- Name: hipertrofia_v2_state trigger_check_reevaluation; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trigger_check_reevaluation AFTER UPDATE OF microcycles_completed ON app.hipertrofia_v2_state FOR EACH ROW EXECUTE FUNCTION app.check_reevaluation_trigger();


--
-- Name: users trigger_save_body_composition; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trigger_save_body_composition AFTER UPDATE ON app.users FOR EACH ROW WHEN (((new.grasa_corporal IS DISTINCT FROM old.grasa_corporal) OR (new.masa_magra IS DISTINCT FROM old.masa_magra) OR (new.agua_corporal IS DISTINCT FROM old.agua_corporal) OR (new.metabolismo_basal IS DISTINCT FROM old.metabolismo_basal) OR (new.peso IS DISTINCT FROM old.peso))) EXECUTE FUNCTION app.save_body_composition();


--
-- Name: Ejercicios_CrossFit trigger_update_crossfit_timestamp; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trigger_update_crossfit_timestamp BEFORE UPDATE ON app."Ejercicios_CrossFit" FOR EACH ROW EXECUTE FUNCTION app.update_crossfit_updated_at();


--
-- Name: methodology_exercise_feedback trigger_update_feedback_timestamp; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trigger_update_feedback_timestamp BEFORE UPDATE ON app.methodology_exercise_feedback FOR EACH ROW EXECUTE FUNCTION app.update_feedback_timestamp();


--
-- Name: hipertrofia_v2_state trigger_update_hipertrofia_v2_state_timestamp; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trigger_update_hipertrofia_v2_state_timestamp BEFORE UPDATE ON app.hipertrofia_v2_state FOR EACH ROW EXECUTE FUNCTION app.update_hipertrofia_v2_state_timestamp();


--
-- Name: manual_methodology_exercise_feedback trigger_update_manual_feedback_timestamp; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trigger_update_manual_feedback_timestamp BEFORE UPDATE ON app.manual_methodology_exercise_feedback FOR EACH ROW EXECUTE FUNCTION app.update_feedback_timestamp();


--
-- Name: methodology_exercise_sessions trigger_update_session_dates; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trigger_update_session_dates BEFORE INSERT OR UPDATE ON app.methodology_exercise_sessions FOR EACH ROW EXECUTE FUNCTION app.update_session_date_fields();


--
-- Name: methodology_exercise_progress trigger_update_session_time; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trigger_update_session_time AFTER UPDATE ON app.methodology_exercise_progress FOR EACH ROW WHEN ((old.time_spent_seconds IS DISTINCT FROM new.time_spent_seconds)) EXECUTE FUNCTION app.update_session_time_on_exercise_change();


--
-- Name: user_profiles trigger_user_profiles_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER trigger_user_profiles_updated_at BEFORE UPDATE ON app.user_profiles FOR EACH ROW EXECUTE FUNCTION app.update_user_profiles_updated_at();


--
-- Name: exercise_session_tracking update_exercise_session_tracking_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER update_exercise_session_tracking_updated_at BEFORE UPDATE ON app.exercise_session_tracking FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();


--
-- Name: food_conversion_factors update_food_conversion_factors_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER update_food_conversion_factors_updated_at BEFORE UPDATE ON app.food_conversion_factors FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();


--
-- Name: food_pairing_rules update_food_pairing_rules_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER update_food_pairing_rules_updated_at BEFORE UPDATE ON app.food_pairing_rules FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();


--
-- Name: food_roles update_food_roles_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER update_food_roles_updated_at BEFORE UPDATE ON app.food_roles FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();


--
-- Name: meal_acceptability_rules update_meal_acceptability_rules_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER update_meal_acceptability_rules_updated_at BEFORE UPDATE ON app.meal_acceptability_rules FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();


--
-- Name: meal_templates update_meal_templates_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER update_meal_templates_updated_at BEFORE UPDATE ON app.meal_templates FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();


--
-- Name: methodology_exercise_sessions update_methodology_exercise_sessions_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER update_methodology_exercise_sessions_updated_at BEFORE UPDATE ON app.methodology_exercise_sessions FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();


--
-- Name: methodology_plans update_methodology_plans_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER update_methodology_plans_updated_at BEFORE UPDATE ON app.methodology_plans FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();


--
-- Name: user_training_state update_user_training_state_updated_at; Type: TRIGGER; Schema: app; Owner: -
--

CREATE TRIGGER update_user_training_state_updated_at BEFORE UPDATE ON app.user_training_state FOR EACH ROW EXECUTE FUNCTION app.update_updated_at_column();


--
-- Name: adaptation_blocks adaptation_blocks_methodology_plan_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.adaptation_blocks
    ADD CONSTRAINT adaptation_blocks_methodology_plan_id_fkey FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE SET NULL;


--
-- Name: adaptation_blocks adaptation_blocks_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.adaptation_blocks
    ADD CONSTRAINT adaptation_blocks_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: adaptation_criteria_tracking adaptation_criteria_tracking_adaptation_block_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.adaptation_criteria_tracking
    ADD CONSTRAINT adaptation_criteria_tracking_adaptation_block_id_fkey FOREIGN KEY (adaptation_block_id) REFERENCES app.adaptation_blocks(id) ON DELETE CASCADE;


--
-- Name: adaptation_technique_flags adaptation_technique_flags_adaptation_block_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.adaptation_technique_flags
    ADD CONSTRAINT adaptation_technique_flags_adaptation_block_id_fkey FOREIGN KEY (adaptation_block_id) REFERENCES app.adaptation_blocks(id) ON DELETE CASCADE;


--
-- Name: adaptation_technique_flags adaptation_technique_flags_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.adaptation_technique_flags
    ADD CONSTRAINT adaptation_technique_flags_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: ai_adjustment_suggestions ai_adjustment_suggestions_applied_by_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.ai_adjustment_suggestions
    ADD CONSTRAINT ai_adjustment_suggestions_applied_by_fkey FOREIGN KEY (applied_by) REFERENCES app.users(id);


--
-- Name: ai_adjustment_suggestions ai_adjustment_suggestions_re_evaluation_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.ai_adjustment_suggestions
    ADD CONSTRAINT ai_adjustment_suggestions_re_evaluation_id_fkey FOREIGN KEY (re_evaluation_id) REFERENCES app.user_re_evaluations(id) ON DELETE CASCADE;


--
-- Name: auth_logs auth_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.auth_logs
    ADD CONSTRAINT auth_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id);


--
-- Name: body_measurements body_measurements_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.body_measurements
    ADD CONSTRAINT body_measurements_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: bridge_adjustment_history bridge_adjustment_history_decision_log_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.bridge_adjustment_history
    ADD CONSTRAINT bridge_adjustment_history_decision_log_id_fkey FOREIGN KEY (decision_log_id) REFERENCES app.bridge_decision_logs(id) ON DELETE SET NULL;


--
-- Name: bridge_adjustment_history bridge_adjustment_history_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.bridge_adjustment_history
    ADD CONSTRAINT bridge_adjustment_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: bridge_current_state bridge_current_state_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.bridge_current_state
    ADD CONSTRAINT bridge_current_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: bridge_decision_logs bridge_decision_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.bridge_decision_logs
    ADD CONSTRAINT bridge_decision_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: bridge_recalculation_config bridge_recalculation_config_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.bridge_recalculation_config
    ADD CONSTRAINT bridge_recalculation_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: carb_timing_logs carb_timing_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.carb_timing_logs
    ADD CONSTRAINT carb_timing_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: carb_timing_preferences carb_timing_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.carb_timing_preferences
    ADD CONSTRAINT carb_timing_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: daily_compensation_plan daily_compensation_plan_deviation_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.daily_compensation_plan
    ADD CONSTRAINT daily_compensation_plan_deviation_id_fkey FOREIGN KEY (deviation_id) REFERENCES app.diet_deviations(id) ON DELETE CASCADE;


--
-- Name: daily_compensation_plan daily_compensation_plan_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.daily_compensation_plan
    ADD CONSTRAINT daily_compensation_plan_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: diet_breaks diet_breaks_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.diet_breaks
    ADD CONSTRAINT diet_breaks_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: diet_deviation_config diet_deviation_config_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.diet_deviation_config
    ADD CONSTRAINT diet_deviation_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: diet_deviations diet_deviations_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.diet_deviations
    ADD CONSTRAINT diet_deviations_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: exercise_session_tracking exercise_session_tracking_methodology_session_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.exercise_session_tracking
    ADD CONSTRAINT exercise_session_tracking_methodology_session_id_fkey FOREIGN KEY (methodology_session_id) REFERENCES app.methodology_exercise_sessions(id) ON DELETE CASCADE;


--
-- Name: exercise_session_tracking exercise_session_tracking_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.exercise_session_tracking
    ADD CONSTRAINT exercise_session_tracking_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: fatigue_flags fatigue_flags_methodology_plan_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.fatigue_flags
    ADD CONSTRAINT fatigue_flags_methodology_plan_id_fkey FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE CASCADE;


--
-- Name: fatigue_flags fatigue_flags_session_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.fatigue_flags
    ADD CONSTRAINT fatigue_flags_session_id_fkey FOREIGN KEY (session_id) REFERENCES app.methodology_exercise_sessions(id) ON DELETE SET NULL;


--
-- Name: fatigue_flags fatigue_flags_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.fatigue_flags
    ADD CONSTRAINT fatigue_flags_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: user_exercise_feedback fk_feedback_session; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_exercise_feedback
    ADD CONSTRAINT fk_feedback_session FOREIGN KEY (session_id) REFERENCES app.home_training_sessions(id) ON DELETE SET NULL;


--
-- Name: methodology_exercise_progress fk_mep_session; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_exercise_progress
    ADD CONSTRAINT fk_mep_session FOREIGN KEY (methodology_session_id) REFERENCES app.methodology_exercise_sessions(id) ON DELETE CASCADE;


--
-- Name: methodology_exercise_progress fk_mep_user; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_exercise_progress
    ADD CONSTRAINT fk_mep_user FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: methodology_exercise_sessions fk_mes_plan; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_exercise_sessions
    ADD CONSTRAINT fk_mes_plan FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE CASCADE;


--
-- Name: methodology_exercise_sessions fk_mes_user; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_exercise_sessions
    ADD CONSTRAINT fk_mes_user FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: music_playlists fk_music_playlists_user_id; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.music_playlists
    ADD CONSTRAINT fk_music_playlists_user_id FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: body_composition_history fk_user_id; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.body_composition_history
    ADD CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: food_roles food_roles_food_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.food_roles
    ADD CONSTRAINT food_roles_food_id_fkey FOREIGN KEY (food_id) REFERENCES app.foods(id) ON DELETE CASCADE;


--
-- Name: hipertrofia_v2_state hipertrofia_v2_state_methodology_plan_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.hipertrofia_v2_state
    ADD CONSTRAINT hipertrofia_v2_state_methodology_plan_id_fkey FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE SET NULL;


--
-- Name: hipertrofia_v2_state hipertrofia_v2_state_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.hipertrofia_v2_state
    ADD CONSTRAINT hipertrofia_v2_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: home_exercise_history home_exercise_history_plan_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_exercise_history
    ADD CONSTRAINT home_exercise_history_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES app.home_training_plans(id) ON DELETE CASCADE;


--
-- Name: home_exercise_history home_exercise_history_session_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_exercise_history
    ADD CONSTRAINT home_exercise_history_session_id_fkey FOREIGN KEY (session_id) REFERENCES app.home_training_sessions(id) ON DELETE CASCADE;


--
-- Name: home_exercise_history home_exercise_history_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_exercise_history
    ADD CONSTRAINT home_exercise_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: home_exercise_progress home_exercise_progress_home_training_session_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_exercise_progress
    ADD CONSTRAINT home_exercise_progress_home_training_session_id_fkey FOREIGN KEY (home_training_session_id) REFERENCES app.home_training_sessions(id) ON DELETE CASCADE;


--
-- Name: home_training_plans home_training_plans_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_training_plans
    ADD CONSTRAINT home_training_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: home_training_sessions home_training_sessions_home_training_plan_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_training_sessions
    ADD CONSTRAINT home_training_sessions_home_training_plan_id_fkey FOREIGN KEY (home_training_plan_id) REFERENCES app.home_training_plans(id) ON DELETE CASCADE;


--
-- Name: home_training_sessions home_training_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.home_training_sessions
    ADD CONSTRAINT home_training_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: icg_ipg_state_history icg_ipg_state_history_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.icg_ipg_state_history
    ADD CONSTRAINT icg_ipg_state_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: level_reevaluations level_reevaluations_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.level_reevaluations
    ADD CONSTRAINT level_reevaluations_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: meal_template_slots meal_template_slots_template_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.meal_template_slots
    ADD CONSTRAINT meal_template_slots_template_id_fkey FOREIGN KEY (template_id) REFERENCES app.meal_templates(id) ON DELETE CASCADE;


--
-- Name: menstrual_cycle_history menstrual_cycle_history_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.menstrual_cycle_history
    ADD CONSTRAINT menstrual_cycle_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: menstrual_daily_log menstrual_daily_log_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.menstrual_daily_log
    ADD CONSTRAINT menstrual_daily_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id);


--
-- Name: menstrual_deload_state menstrual_deload_state_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.menstrual_deload_state
    ADD CONSTRAINT menstrual_deload_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: menstrual_pattern_metrics menstrual_pattern_metrics_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.menstrual_pattern_metrics
    ADD CONSTRAINT menstrual_pattern_metrics_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: methodology_exercise_history_complete methodology_exercise_history_comple_methodology_session_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_exercise_history_complete
    ADD CONSTRAINT methodology_exercise_history_comple_methodology_session_id_fkey FOREIGN KEY (methodology_session_id) REFERENCES app.methodology_exercise_sessions(id) ON DELETE SET NULL;


--
-- Name: methodology_exercise_history_complete methodology_exercise_history_complete_methodology_plan_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_exercise_history_complete
    ADD CONSTRAINT methodology_exercise_history_complete_methodology_plan_id_fkey FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE SET NULL;


--
-- Name: methodology_exercise_history_complete methodology_exercise_history_complete_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_exercise_history_complete
    ADD CONSTRAINT methodology_exercise_history_complete_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: methodology_plan_days methodology_plan_days_plan_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_plan_days
    ADD CONSTRAINT methodology_plan_days_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES app.methodology_plans(id) ON DELETE CASCADE;


--
-- Name: methodology_session_feedback methodology_session_feedback_methodology_plan_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_session_feedback
    ADD CONSTRAINT methodology_session_feedback_methodology_plan_id_fkey FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE CASCADE;


--
-- Name: methodology_session_feedback methodology_session_feedback_methodology_session_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_session_feedback
    ADD CONSTRAINT methodology_session_feedback_methodology_session_id_fkey FOREIGN KEY (methodology_session_id) REFERENCES app.methodology_exercise_sessions(id) ON DELETE CASCADE;


--
-- Name: methodology_session_feedback methodology_session_feedback_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.methodology_session_feedback
    ADD CONSTRAINT methodology_session_feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: nutrition_adjustment_actions nutrition_adjustment_actions_new_plan_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_adjustment_actions
    ADD CONSTRAINT nutrition_adjustment_actions_new_plan_id_fkey FOREIGN KEY (new_plan_id) REFERENCES app.nutrition_plans_v2(id);


--
-- Name: nutrition_adjustment_actions nutrition_adjustment_actions_previous_plan_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_adjustment_actions
    ADD CONSTRAINT nutrition_adjustment_actions_previous_plan_id_fkey FOREIGN KEY (previous_plan_id) REFERENCES app.nutrition_plans_v2(id);


--
-- Name: nutrition_adjustment_actions nutrition_adjustment_actions_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_adjustment_actions
    ADD CONSTRAINT nutrition_adjustment_actions_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: nutrition_calibrations nutrition_calibrations_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_calibrations
    ADD CONSTRAINT nutrition_calibrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: nutrition_change_log nutrition_change_log_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_change_log
    ADD CONSTRAINT nutrition_change_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: nutrition_evaluations nutrition_evaluations_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_evaluations
    ADD CONSTRAINT nutrition_evaluations_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: nutrition_meal_items nutrition_meal_items_food_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_meal_items
    ADD CONSTRAINT nutrition_meal_items_food_id_fkey FOREIGN KEY (food_id) REFERENCES app.foods(id) ON DELETE SET NULL;


--
-- Name: nutrition_meal_items nutrition_meal_items_meal_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_meal_items
    ADD CONSTRAINT nutrition_meal_items_meal_id_fkey FOREIGN KEY (meal_id) REFERENCES app.nutrition_meals(id) ON DELETE CASCADE;


--
-- Name: nutrition_meals nutrition_meals_plan_day_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_meals
    ADD CONSTRAINT nutrition_meals_plan_day_id_fkey FOREIGN KEY (plan_day_id) REFERENCES app.nutrition_plan_days(id) ON DELETE CASCADE;


--
-- Name: nutrition_menu_generation_logs nutrition_menu_generation_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_menu_generation_logs
    ADD CONSTRAINT nutrition_menu_generation_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: nutrition_phase_history nutrition_phase_history_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_phase_history
    ADD CONSTRAINT nutrition_phase_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: nutrition_plan_days nutrition_plan_days_plan_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_plan_days
    ADD CONSTRAINT nutrition_plan_days_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES app.nutrition_plans_v2(id) ON DELETE CASCADE;


--
-- Name: nutrition_profiles nutrition_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_profiles
    ADD CONSTRAINT nutrition_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: nutrition_weekly_snapshots nutrition_weekly_snapshots_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.nutrition_weekly_snapshots
    ADD CONSTRAINT nutrition_weekly_snapshots_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: plan_start_config plan_start_config_methodology_plan_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.plan_start_config
    ADD CONSTRAINT plan_start_config_methodology_plan_id_fkey FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE CASCADE;


--
-- Name: plan_start_config plan_start_config_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.plan_start_config
    ADD CONSTRAINT plan_start_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: re_evaluation_exercises re_evaluation_exercises_re_evaluation_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.re_evaluation_exercises
    ADD CONSTRAINT re_evaluation_exercises_re_evaluation_id_fkey FOREIGN KEY (re_evaluation_id) REFERENCES app.user_re_evaluations(id) ON DELETE CASCADE;


--
-- Name: recipe_items recipe_items_food_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.recipe_items
    ADD CONSTRAINT recipe_items_food_id_fkey FOREIGN KEY (food_id) REFERENCES app.foods(id);


--
-- Name: recipe_items recipe_items_recipe_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.recipe_items
    ADD CONSTRAINT recipe_items_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES app.recipes(id) ON DELETE CASCADE;


--
-- Name: recipe_tags recipe_tags_recipe_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.recipe_tags
    ADD CONSTRAINT recipe_tags_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES app.recipes(id) ON DELETE CASCADE;


--
-- Name: training_performance_log training_performance_log_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.training_performance_log
    ADD CONSTRAINT training_performance_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: user_body_measurements user_body_measurements_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_body_measurements
    ADD CONSTRAINT user_body_measurements_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: user_calibration_config user_calibration_config_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_calibration_config
    ADD CONSTRAINT user_calibration_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: user_layouts user_layouts_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_layouts
    ADD CONSTRAINT user_layouts_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: user_menstrual_config user_menstrual_config_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_menstrual_config
    ADD CONSTRAINT user_menstrual_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id);


--
-- Name: user_menstrual_cycle user_menstrual_cycle_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_menstrual_cycle
    ADD CONSTRAINT user_menstrual_cycle_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id);


--
-- Name: user_metabolic_config user_metabolic_config_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_metabolic_config
    ADD CONSTRAINT user_metabolic_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: user_metabolic_evaluations user_metabolic_evaluations_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_metabolic_evaluations
    ADD CONSTRAINT user_metabolic_evaluations_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: user_metabolic_history user_metabolic_history_evaluation_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_metabolic_history
    ADD CONSTRAINT user_metabolic_history_evaluation_id_fkey FOREIGN KEY (evaluation_id) REFERENCES app.user_metabolic_evaluations(id) ON DELETE SET NULL;


--
-- Name: user_metabolic_history user_metabolic_history_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_metabolic_history
    ADD CONSTRAINT user_metabolic_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: user_profiles user_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_profiles
    ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: user_re_eval_config user_re_eval_config_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_re_eval_config
    ADD CONSTRAINT user_re_eval_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: user_re_evaluations user_re_evaluations_methodology_plan_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_re_evaluations
    ADD CONSTRAINT user_re_evaluations_methodology_plan_id_fkey FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE CASCADE;


--
-- Name: user_re_evaluations user_re_evaluations_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_re_evaluations
    ADD CONSTRAINT user_re_evaluations_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: user_training_preferences user_training_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_training_preferences
    ADD CONSTRAINT user_training_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: user_training_state user_training_state_active_methodology_plan_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_training_state
    ADD CONSTRAINT user_training_state_active_methodology_plan_id_fkey FOREIGN KEY (active_methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE SET NULL;


--
-- Name: user_training_state user_training_state_active_session_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_training_state
    ADD CONSTRAINT user_training_state_active_session_id_fkey FOREIGN KEY (active_session_id) REFERENCES app.methodology_exercise_sessions(id) ON DELETE SET NULL;


--
-- Name: user_training_state user_training_state_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.user_training_state
    ADD CONSTRAINT user_training_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: warmup_sets_tracking warmup_sets_tracking_methodology_plan_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.warmup_sets_tracking
    ADD CONSTRAINT warmup_sets_tracking_methodology_plan_id_fkey FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE SET NULL;


--
-- Name: warmup_sets_tracking warmup_sets_tracking_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.warmup_sets_tracking
    ADD CONSTRAINT warmup_sets_tracking_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: weekly_calorie_targets weekly_calorie_targets_user_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.weekly_calorie_targets
    ADD CONSTRAINT weekly_calorie_targets_user_id_fkey FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE;


--
-- Name: workout_schedule workout_schedule_methodology_plan_id_fkey; Type: FK CONSTRAINT; Schema: app; Owner: -
--

ALTER TABLE ONLY app.workout_schedule
    ADD CONSTRAINT workout_schedule_methodology_plan_id_fkey FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE CASCADE;


--
-- Name: food_conversion_factors Cualquiera puede leer factores de conversión; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "Cualquiera puede leer factores de conversión" ON app.food_conversion_factors FOR SELECT TO authenticated USING (true);


--
-- Name: food_roles Cualquiera puede leer food roles; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "Cualquiera puede leer food roles" ON app.food_roles FOR SELECT TO authenticated USING (true);


--
-- Name: meal_template_slots Cualquiera puede leer meal template slots; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "Cualquiera puede leer meal template slots" ON app.meal_template_slots FOR SELECT TO authenticated USING (true);


--
-- Name: meal_templates Cualquiera puede leer meal templates; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY "Cualquiera puede leer meal templates" ON app.meal_templates FOR SELECT TO authenticated USING (true);


--
-- Name: food_conversion_factors; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.food_conversion_factors ENABLE ROW LEVEL SECURITY;

--
-- Name: food_roles; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.food_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: foods; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.foods ENABLE ROW LEVEL SECURITY;

--
-- Name: hypertrophy_blocks; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.hypertrophy_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: hypertrophy_blocks hypertrophy_blocks_user_policy; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY hypertrophy_blocks_user_policy ON app.hypertrophy_blocks USING ((user_id = (current_setting('app.current_user_id'::text))::integer));


--
-- Name: hypertrophy_progression; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.hypertrophy_progression ENABLE ROW LEVEL SECURITY;

--
-- Name: hypertrophy_progression hypertrophy_progression_user_policy; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY hypertrophy_progression_user_policy ON app.hypertrophy_progression USING ((user_id = (current_setting('app.current_user_id'::text))::integer));


--
-- Name: hypertrophy_set_logs; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.hypertrophy_set_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: hypertrophy_set_logs hypertrophy_set_logs_user_policy; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY hypertrophy_set_logs_user_policy ON app.hypertrophy_set_logs USING ((user_id = (current_setting('app.current_user_id'::text))::integer));


--
-- Name: meal_template_slots; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.meal_template_slots ENABLE ROW LEVEL SECURITY;

--
-- Name: meal_templates; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.meal_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: nutrition_guidelines; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.nutrition_guidelines ENABLE ROW LEVEL SECURITY;

--
-- Name: oposiciones_autoreg_state; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.oposiciones_autoreg_state ENABLE ROW LEVEL SECURITY;

--
-- Name: oposiciones_autoreg_state oposiciones_autoreg_state_user_policy; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY oposiciones_autoreg_state_user_policy ON app.oposiciones_autoreg_state USING ((user_id = (current_setting('app.current_user_id'::text))::integer));


--
-- Name: plan_progression_offsets; Type: ROW SECURITY; Schema: app; Owner: -
--

ALTER TABLE app.plan_progression_offsets ENABLE ROW LEVEL SECURITY;

--
-- Name: plan_progression_offsets plan_progression_offsets_user_policy; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY plan_progression_offsets_user_policy ON app.plan_progression_offsets USING ((user_id = (current_setting('app.current_user_id'::text))::integer));


--
-- Name: foods sel_foods_authenticated; Type: POLICY; Schema: app; Owner: -
--

CREATE POLICY sel_foods_authenticated ON app.foods FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- PostgreSQL database dump complete
--

\unrestrict sRch3r51hK9QzGRb0iRhIBMhdjbrViAXHbIVf7OOzo6dDkoOgaXtO8cGi4iE98P

