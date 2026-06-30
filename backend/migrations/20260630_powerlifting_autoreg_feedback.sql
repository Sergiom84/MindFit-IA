-- Autorregulación Powerlifting: feedback SUBJETIVO como modificador acotado.
-- Gemela de Halterofilia (RPE + carga + técnica). Lo OBJETIVO manda; el feedback
-- frena y desempata; la técnica deficiente sigue siendo 'hard' siempre.
-- p_subjective NULL → idéntico al anterior.

ALTER TABLE app.powerlifting_autoreg_state
  ADD COLUMN IF NOT EXISTS last_subjective numeric;

DROP FUNCTION IF EXISTS app.powerlifting_register_session_result(integer, integer, numeric, boolean, boolean);

CREATE OR REPLACE FUNCTION app.powerlifting_register_session_result(
  p_user_id integer,
  p_plan_id integer,
  p_rpe numeric,
  p_target_met boolean,
  p_good_technique boolean,
  p_subjective numeric DEFAULT NULL
) RETURNS jsonb
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
