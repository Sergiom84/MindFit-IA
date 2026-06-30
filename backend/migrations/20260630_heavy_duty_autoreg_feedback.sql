-- Autorregulación Heavy Duty: feedback SUBJETIVO como modificador acotado.
-- Modelo asimétrico (fallo + recuperación, sin racha "fácil"). Lo OBJETIVO manda
-- (no llegar al fallo = fatiga → deload a las 2). El feedback (p_subjective)
-- solo actúa como FRENO de seguridad: si llegaste al fallo y cumpliste objetivo
-- (subiría carga) pero lo sentiste muy duro ("me costó", <= -0.5), se mantiene
-- carga en vez de progresar. No toca el gate de deload. NULL → idéntico.

ALTER TABLE app.heavy_duty_autoreg_state
  ADD COLUMN IF NOT EXISTS last_subjective numeric;

DROP FUNCTION IF EXISTS app.heavy_duty_register_session_result(integer, integer, boolean, boolean);

CREATE OR REPLACE FUNCTION app.heavy_duty_register_session_result(
  p_user_id integer,
  p_plan_id integer,
  p_reached_failure boolean,
  p_target_met boolean,
  p_subjective numeric DEFAULT NULL
) RETURNS jsonb
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
