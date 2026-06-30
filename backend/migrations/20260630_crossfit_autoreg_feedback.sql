-- Autorregulación CrossFit: incorporar feedback SUBJETIVO del usuario como
-- modificador acotado de la decisión, sin que mande sobre lo objetivo.
--
-- Principio: lo OBJETIVO (RPE + completado + escala) decide la clasificación
-- base (easy/hard/neutral) y las rachas. El feedback subjetivo (p_subjective,
-- rango -1..+1; negativo = "me cuesta", positivo = "me gusta/fácil") solo:
--   - FRENO DE SEGURIDAD: si lo objetivo dice "fácil" pero el usuario lo sintió
--     duro (p_subjective <= -0.5), NO se cuenta como fácil (no acelera progreso).
--   - DESEMPATE: cuando lo objetivo es neutro, el feeling inclina a easy/hard.
-- Nunca dispara por sí solo un 'deload' (sigue exigiendo 3 duras) ni un
-- 'progress' (sigue exigiendo 2 fáciles). Si p_subjective IS NULL → comportamiento
-- IDÉNTICO al anterior (100% retrocompatible).

ALTER TABLE app.crossfit_autoreg_state
  ADD COLUMN IF NOT EXISTS last_subjective numeric;

-- Eliminar la firma de 5 args para no dejar dos overloads. La nueva (6 args con
-- DEFAULT NULL en p_subjective) resuelve también las llamadas de 5 argumentos.
DROP FUNCTION IF EXISTS app.crossfit_register_wod_result(integer, integer, numeric, boolean, text);

CREATE OR REPLACE FUNCTION app.crossfit_register_wod_result(
  p_user_id integer,
  p_plan_id integer,
  p_rpe numeric,
  p_completed boolean,
  p_scale text,
  p_subjective numeric DEFAULT NULL
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
