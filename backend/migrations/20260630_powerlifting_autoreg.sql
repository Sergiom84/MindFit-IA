-- Autorregulación en tiempo real para Powerlifting (Fase 4)
-- ADITIVO y AISLADO: crea estado y función propios, sin tocar el motor de
-- HipertrofiaV2, calistenia (calistenia_autoreg_state), crossfit
-- (crossfit_autoreg_state) ni halterofilia (halterofilia_autoreg_state).
--
-- Modelo de FUERZA MÁXIMA (RPE + carga objetivo + técnica de competición): tras
-- completar una sesión se registra el RPE (1-10), si se alcanzó la CARGA objetivo
-- (%1RM) y si la TÉCNICA fue sólida. La función decide el ajuste de carga de la
-- próxima sesión:
--   - 'progress' : 2+ sesiones cómodas seguidas (carga objetivo cumplida, RPE<=7
--                  y buena técnica) -> subir carga
--   - 'deload'   : 3 sesiones duras seguidas (no se cumple carga, o RPE>=9, o
--                  técnica deficiente) -> descarga/tapering
--   - 'hold'     : mantener
--
-- Seguridad (crítico en básicos pesados): la mala técnica NUNCA cuenta como
-- sesión "cómoda" aunque el RPE sea bajo (no se empuja carga sin técnica sólida).

CREATE TABLE IF NOT EXISTS app.powerlifting_autoreg_state (
  user_id integer PRIMARY KEY,
  methodology_plan_id integer,
  sessions_completed integer NOT NULL DEFAULT 0,
  easy_streak integer NOT NULL DEFAULT 0,
  hard_streak integer NOT NULL DEFAULT 0,
  deload_suggested boolean NOT NULL DEFAULT false,
  last_decision varchar(20),
  last_rpe numeric,
  last_target_met boolean,
  last_good_technique boolean,
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  created_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION app.powerlifting_register_session_result(
  p_user_id integer,
  p_plan_id integer,
  p_rpe numeric,
  p_target_met boolean,
  p_good_technique boolean
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
BEGIN
  INSERT INTO app.powerlifting_autoreg_state (user_id, methodology_plan_id)
  VALUES (p_user_id, p_plan_id)
  ON CONFLICT (user_id) DO UPDATE SET methodology_plan_id = EXCLUDED.methodology_plan_id;

  SELECT easy_streak, hard_streak, sessions_completed
    INTO v_easy, v_hard, v_sessions
  FROM app.powerlifting_autoreg_state
  WHERE user_id = p_user_id;

  v_sessions := COALESCE(v_sessions, 0) + 1;

  -- Sesión cómoda: carga objetivo cumplida, RPE bajo y técnica sólida.
  -- La técnica deficiente nunca cuenta como cómoda (no se progresa carga sin técnica).
  IF p_target_met AND COALESCE(p_rpe, 10) <= 7 AND v_technique THEN
    v_easy := COALESCE(v_easy, 0) + 1;
    v_hard := 0;
  -- Sesión dura: no se cumple la carga, RPE muy alto o técnica deficiente.
  ELSIF (NOT p_target_met) OR COALESCE(p_rpe, 0) >= 9 OR (NOT v_technique) THEN
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
        updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'decision', v_decision,
    'easy_streak', v_easy,
    'hard_streak', v_hard,
    'deload_suggested', v_deload,
    'sessions_completed', v_sessions
  );
END;
$$;
