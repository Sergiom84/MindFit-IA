-- Autorregulación en tiempo real para Heavy Duty (HIT / Mentzer) — Fase 4
-- ADITIVO y AISLADO: crea estado y función propios, sin tocar el motor de
-- HipertrofiaV2 ni las autorregulaciones de calistenia/crossfit/funcional/
-- halterofilia.
--
-- Modelo de INTENSIDAD/FALLO (no RIR ni %1RM): tras completar una sesión se
-- registra si la serie se llevó al FALLO muscular (reached_failure) y si se
-- alcanzó el TOPE del rango de repeticiones objetivo (target_met). La función
-- decide el ajuste de CARGA de la próxima sesión por doble progresión reps→carga:
--   - 'progress' : fallo alcanzado EN el tope del rango -> subir carga.
--   - 'hold'     : fallo dentro del rango pero sin llegar al tope -> mantener
--                  carga y buscar más repeticiones la próxima vez.
--   - 'deload'   : 2 sesiones seguidas sin llegar al fallo (fatiga / falta de
--                  recuperación) -> descarga y recuperación generosa (Mentzer).
--
-- Seguridad: el lever es el fallo, no las reps en reserva. La recuperación es
-- deliberadamente sensible (2 sesiones) por la filosofía de baja frecuencia.

CREATE TABLE IF NOT EXISTS app.heavy_duty_autoreg_state (
  user_id integer PRIMARY KEY,
  methodology_plan_id integer,
  sessions_completed integer NOT NULL DEFAULT 0,
  hard_streak integer NOT NULL DEFAULT 0,
  deload_suggested boolean NOT NULL DEFAULT false,
  last_decision varchar(20),
  last_reached_failure boolean,
  last_target_met boolean,
  updated_at timestamp without time zone NOT NULL DEFAULT now(),
  created_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION app.heavy_duty_register_session_result(
  p_user_id integer,
  p_plan_id integer,
  p_reached_failure boolean,
  p_target_met boolean
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

  -- No alcanzar el fallo es la señal de fatiga / falta de recuperación.
  IF NOT v_failure THEN
    v_hard := COALESCE(v_hard, 0) + 1;
  ELSE
    v_hard := 0;
  END IF;

  IF v_hard >= 2 THEN
    -- Recuperación generosa (Mentzer): 2 sesiones sin llegar al fallo -> descarga.
    v_decision := 'deload';
    v_deload := true;
    v_hard := 0;
  ELSIF v_failure AND v_target THEN
    -- Doble progresión: fallo en el tope del rango -> subir carga.
    v_decision := 'progress';
  ELSE
    -- Fallo dentro del rango pero sin llegar al tope -> mantener carga, sumar reps.
    v_decision := 'hold';
  END IF;

  UPDATE app.heavy_duty_autoreg_state
    SET hard_streak = v_hard,
        sessions_completed = v_sessions,
        deload_suggested = v_deload,
        last_decision = v_decision,
        last_reached_failure = v_failure,
        last_target_met = v_target,
        updated_at = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'decision', v_decision,
    'hard_streak', v_hard,
    'deload_suggested', v_deload,
    'sessions_completed', v_sessions
  );
END;
$$;
