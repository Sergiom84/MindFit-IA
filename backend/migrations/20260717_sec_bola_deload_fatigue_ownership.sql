-- 20260717_sec_bola_deload_fatigue_ownership.sql
-- SEC (P2): corrige BOLA / escritura y lectura cross-tenant en dos funciones de
-- HipertrofiaV2. La clave user_id sale del token, pero el id de objeto llegaba
-- del body sin verificar propiedad:
--   S1  app.activate_deload            -> leía/reescribía methodology_plans por id
--   S1b app.detect_automatic_fatigue_flags -> agregaba hypertrophy_set_logs por session_id
-- Fix homogéneo: añadir `AND user_id = p_user_id` a los accesos por id de objeto,
-- replicando el patrón que ya usa app.apply_microcycle_progression.
-- Cuerpos tomados de la definición VIVA en producción (pg_get_functiondef).

BEGIN;

-- ============================================================
-- S1: app.activate_deload
-- ============================================================
CREATE OR REPLACE FUNCTION app.activate_deload(p_user_id integer, p_methodology_plan_id integer, p_reason character varying DEFAULT 'planificado'::character varying)
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
  WHERE id = p_methodology_plan_id
    AND user_id = p_user_id; -- 🛡️ anti-BOLA: solo el plan del propio usuario

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
    AND user_id = p_user_id -- 🛡️ anti-BOLA: no leer el plan de otro usuario
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
        WHERE id = p_methodology_plan_id
          AND user_id = p_user_id; -- 🛡️ anti-BOLA: no reescribir el plan de otro usuario
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

-- ============================================================
-- S1b: app.detect_automatic_fatigue_flags
-- ============================================================
CREATE OR REPLACE FUNCTION app.detect_automatic_fatigue_flags(p_user_id integer, p_session_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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
  WHERE session_id = p_session_id
    AND user_id = p_user_id; -- 🛡️ anti-BOLA: solo series del propio usuario

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
$function$;

COMMIT;
