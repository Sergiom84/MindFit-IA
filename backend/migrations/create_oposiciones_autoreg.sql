-- Autorregulación para OPOSICIONES (mismo modelo RIR/objetivo que calistenia:
-- las pruebas físicas progresan por repeticiones/tiempos, no por carga).
-- Estado por usuario + función de registro clonando la lógica de
-- calistenia_register_session_result.
CREATE TABLE IF NOT EXISTS app.oposiciones_autoreg_state (
  user_id integer NOT NULL,
  methodology_plan_id integer,
  microcycles_completed integer NOT NULL DEFAULT 0,
  easy_streak integer NOT NULL DEFAULT 0,
  hard_streak integer NOT NULL DEFAULT 0,
  deload_suggested boolean NOT NULL DEFAULT false,
  last_decision varchar(20),
  last_avg_rir numeric,
  updated_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now(),
  last_subjective numeric,
  PRIMARY KEY (user_id)
);

ALTER TABLE app.oposiciones_autoreg_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'app' AND tablename = 'oposiciones_autoreg_state'
  ) THEN
    CREATE POLICY oposiciones_autoreg_state_user_policy ON app.oposiciones_autoreg_state
      USING (user_id = (current_setting('app.current_user_id'::text))::integer);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.oposiciones_register_session_result(
  p_user_id integer,
  p_plan_id integer,
  p_avg_rir numeric,
  p_target_met boolean,
  p_subjective numeric DEFAULT NULL::numeric
) RETURNS jsonb
LANGUAGE plpgsql
AS $function$
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
$function$;
