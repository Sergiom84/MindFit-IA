-- Autorregulación en tiempo real para CrossFit (Fase 4)
-- ADITIVO y AISLADO: crea estado y función propios para CrossFit, sin tocar el
-- motor de HipertrofiaV2 ni el de calistenia (calistenia_autoreg_state).
--
-- Modelo (RPE + escala + resultado): tras completar un WOD se registra el RPE
-- (1-10), si se completó dentro del time cap y la escala usada (scaled/rx/rxplus).
-- La función decide el ajuste del próximo entrenamiento:
--   - 'progress' : 2+ WODs cómodos seguidos (completado, RPE<=6, escala RX/RX+) -> subir escala/densidad
--   - 'deload'   : 3 WODs duros seguidos (no completa, RPE>=9 o escala scaled)   -> descarga
--   - 'hold'     : mantener

CREATE TABLE IF NOT EXISTS app.crossfit_autoreg_state (
  user_id integer PRIMARY KEY,
  methodology_plan_id integer,
  wods_completed integer NOT NULL DEFAULT 0,
  easy_streak integer NOT NULL DEFAULT 0,
  hard_streak integer NOT NULL DEFAULT 0,
  deload_suggested boolean NOT NULL DEFAULT false,
  last_decision varchar(20),
  last_rpe numeric,
  last_scale varchar(12),
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  created_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION app.crossfit_register_wod_result(
  p_user_id integer,
  p_plan_id integer,
  p_rpe numeric,
  p_completed boolean,
  p_scale text
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_easy integer;
  v_hard integer;
  v_wods integer;
  v_decision varchar(20);
  v_deload boolean := false;
  v_scale text := lower(coalesce(p_scale, 'rx'));
BEGIN
  INSERT INTO app.crossfit_autoreg_state (user_id, methodology_plan_id)
  VALUES (p_user_id, p_plan_id)
  ON CONFLICT (user_id) DO UPDATE SET methodology_plan_id = EXCLUDED.methodology_plan_id;

  SELECT easy_streak, hard_streak, wods_completed
    INTO v_easy, v_hard, v_wods
  FROM app.crossfit_autoreg_state
  WHERE user_id = p_user_id;

  v_wods := COALESCE(v_wods, 0) + 1;

  IF p_completed AND COALESCE(p_rpe, 10) <= 6 AND v_scale IN ('rx', 'rxplus') THEN
    v_easy := COALESCE(v_easy, 0) + 1;
    v_hard := 0;
  ELSIF (NOT p_completed) OR COALESCE(p_rpe, 0) >= 9 OR v_scale = 'scaled' THEN
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

  UPDATE app.crossfit_autoreg_state
    SET easy_streak = v_easy,
        hard_streak = v_hard,
        wods_completed = v_wods,
        deload_suggested = v_deload,
        last_decision = v_decision,
        last_rpe = p_rpe,
        last_scale = v_scale,
        updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'decision', v_decision,
    'easy_streak', v_easy,
    'hard_streak', v_hard,
    'deload_suggested', v_deload,
    'wods_completed', v_wods
  );
END;
$$;
