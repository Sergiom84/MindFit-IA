-- Autorregulación Calistenia: feedback SUBJETIVO como modificador acotado.
-- Mismo principio que CrossFit: lo OBJETIVO (target_met + avg_rir) clasifica la
-- sesión (easy/hard/neutral) y manda; el feedback subjetivo (p_subjective -1..+1)
-- solo frena (no contar "fácil" si lo sintió duro) y desempata (cuando es neutro).
-- p_subjective NULL → comportamiento IDÉNTICO al anterior (retrocompatible).

ALTER TABLE app.calistenia_autoreg_state
  ADD COLUMN IF NOT EXISTS last_subjective numeric;

DROP FUNCTION IF EXISTS app.calistenia_register_session_result(integer, integer, numeric, boolean);

CREATE OR REPLACE FUNCTION app.calistenia_register_session_result(
  p_user_id integer,
  p_plan_id integer,
  p_avg_rir numeric,
  p_target_met boolean,
  p_subjective numeric DEFAULT NULL
) RETURNS jsonb
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
