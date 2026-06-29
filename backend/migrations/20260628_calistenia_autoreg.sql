-- Autorregulación en tiempo real para Calistenia (Fase 4)
-- ADITIVO y AISLADO: crea estado y función propios para Calistenia, sin tocar
-- el motor de HipertrofiaV2 (hipertrofia_v2_state / apply_microcycle_progression).
--
-- Modelo (reps + RIR): tras completar una sesión se registra el RIR medio y si
-- se cumplió el objetivo de repeticiones. La función decide el ajuste del próximo
-- microciclo:
--   - 'progress' : 2+ sesiones fáciles seguidas (objetivo cumplido y RIR>=2) -> acelerar
--   - 'deload'   : 3 sesiones duras seguidas (objetivo no cumplido o RIR<=0) -> descarga
--   - 'hold'     : mantener

CREATE TABLE IF NOT EXISTS app.calistenia_autoreg_state (
  user_id integer PRIMARY KEY,
  methodology_plan_id integer,
  microcycles_completed integer NOT NULL DEFAULT 0,
  easy_streak integer NOT NULL DEFAULT 0,
  hard_streak integer NOT NULL DEFAULT 0,
  deload_suggested boolean NOT NULL DEFAULT false,
  last_decision varchar(20),
  last_avg_rir numeric,
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  created_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION app.calistenia_register_session_result(
  p_user_id integer,
  p_plan_id integer,
  p_avg_rir numeric,
  p_target_met boolean
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_easy integer;
  v_hard integer;
  v_micro integer;
  v_decision varchar(20);
  v_deload boolean := false;
BEGIN
  INSERT INTO app.calistenia_autoreg_state (user_id, methodology_plan_id)
  VALUES (p_user_id, p_plan_id)
  ON CONFLICT (user_id) DO UPDATE SET methodology_plan_id = EXCLUDED.methodology_plan_id;

  SELECT easy_streak, hard_streak, microcycles_completed
    INTO v_easy, v_hard, v_micro
  FROM app.calistenia_autoreg_state
  WHERE user_id = p_user_id;

  v_micro := COALESCE(v_micro, 0) + 1;

  IF p_target_met AND COALESCE(p_avg_rir, 0) >= 2 THEN
    v_easy := COALESCE(v_easy, 0) + 1;
    v_hard := 0;
  ELSIF (NOT p_target_met) OR COALESCE(p_avg_rir, 99) <= 0 THEN
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

  UPDATE app.calistenia_autoreg_state
    SET easy_streak = v_easy,
        hard_streak = v_hard,
        microcycles_completed = v_micro,
        deload_suggested = v_deload,
        last_decision = v_decision,
        last_avg_rir = p_avg_rir,
        updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'decision', v_decision,
    'easy_streak', v_easy,
    'hard_streak', v_hard,
    'deload_suggested', v_deload,
    'microcycles_completed', v_micro
  );
END;
$$;
