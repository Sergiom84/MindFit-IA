-- MindFeed Compliance v1 - Fix
-- Asegurar que la firma usada por el backend (2 args) aplica las reglas nuevas

DROP FUNCTION IF EXISTS app.activate_muscle_priority(integer, character varying);

CREATE OR REPLACE FUNCTION app.activate_muscle_priority(
  p_user_id integer,
  p_muscle_group character varying
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_exists BOOLEAN;
  v_deload_active BOOLEAN := FALSE;
  v_plan_id INTEGER;
  v_reason VARCHAR := 'manual';
BEGIN
  SELECT priority_muscle IS NOT NULL, deload_active, methodology_plan_id
  INTO v_exists, v_deload_active, v_plan_id
  FROM app.hipertrofia_v2_state
  WHERE user_id = p_user_id;

  IF v_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ya hay una prioridad activa');
  END IF;

  IF v_deload_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'No se puede activar prioridad durante deload');
  END IF;

  UPDATE app.hipertrofia_v2_state
  SET
    priority_muscle = p_muscle_group,
    priority_started_at = NOW(),
    priority_microcycles_completed = 0,
    priority_top_sets_this_week = 0,
    priority_last_week_reset = NOW(),
    weekly_topset_used = false,
    np_high_rir_streak = 0,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO app.mindfeed_priority_events (
    user_id,
    methodology_plan_id,
    muscle_group,
    action,
    reason,
    metadata
  ) VALUES (
    p_user_id,
    v_plan_id,
    p_muscle_group,
    'activate',
    v_reason,
    jsonb_build_object('source', 'activate_muscle_priority')
  );

  RETURN jsonb_build_object('success', true, 'priority_muscle', p_muscle_group);
END;
$function$;
