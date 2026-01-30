-- MindFeed Compliance v1 - Fase G
-- Transiciones: adaptación -> hipertrofia (repeat con penalización) y principiante -> intermedio

-- 1) Estado adicional para repetir adaptación con penalización
ALTER TABLE app.adaptation_blocks
ADD COLUMN IF NOT EXISTS repeat_required BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS repeat_penalty_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS progression_cap_pct NUMERIC(5,2) NOT NULL DEFAULT 2.5,
ADD COLUMN IF NOT EXISTS repeat_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS repeat_reason TEXT NULL,
ADD COLUMN IF NOT EXISTS repeat_requested_at TIMESTAMP WITHOUT TIME ZONE NULL;

-- 2) Eventos de transición (auditoría)
CREATE TABLE IF NOT EXISTS app.mindfeed_transition_events (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  methodology_plan_id INTEGER NULL,
  source_block VARCHAR(100) NOT NULL,
  target_block VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  reason VARCHAR(200) NULL,
  baseline JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mindfeed_transition_events_user
  ON app.mindfeed_transition_events(user_id, created_at DESC);

-- 3) Adaptación -> hipertrofia o repeat con penalización
CREATE OR REPLACE FUNCTION app.transition_to_hypertrophy(p_user_id integer, p_adaptation_block_id integer)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_adaptation_block RECORD;
  v_evaluation JSONB;
  v_all_criteria_met BOOLEAN := FALSE;
BEGIN
  -- Verificar que el bloque existe y está activo
  SELECT * INTO v_adaptation_block
  FROM app.adaptation_blocks
  WHERE id = p_adaptation_block_id AND user_id = p_user_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Adaptation block not found or not active'
    );
  END IF;

  -- Evaluar criterios
  v_evaluation := app.evaluate_adaptation_completion(p_user_id);
  v_all_criteria_met := COALESCE((v_evaluation->>'all_criteria_met')::BOOLEAN, FALSE);

  -- Si no cumple criterios: repetir con penalización
  IF v_all_criteria_met = FALSE THEN
    UPDATE app.adaptation_blocks
    SET
      repeat_required = TRUE,
      repeat_penalty_pct = 10,
      progression_cap_pct = 2,
      repeat_count = repeat_count + 1,
      repeat_reason = 'criteria_not_met',
      repeat_requested_at = NOW(),
      updated_at = NOW()
    WHERE id = p_adaptation_block_id;

    INSERT INTO app.mindfeed_transition_events (
      user_id,
      methodology_plan_id,
      source_block,
      target_block,
      action,
      reason,
      baseline,
      metadata
    ) VALUES (
      p_user_id,
      v_adaptation_block.methodology_plan_id,
      'adaptation',
      'adaptation',
      'repeat',
      'criteria_not_met',
      COALESCE(v_evaluation, '{}'::jsonb),
      jsonb_build_object(
        'repeat_penalty_pct', 10,
        'progression_cap_pct', 2
      )
    );

    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Not all criteria met for transition',
      'evaluation', v_evaluation,
      'repeat_required', TRUE,
      'repeat_penalty_pct', 10,
      'progression_cap_pct', 2
    );
  END IF;

  -- Si cumple criterios: completar bloque y transicionar
  UPDATE app.adaptation_blocks
  SET
    status = 'completed',
    completed_at = NOW(),
    transitioned_to_hypertrophy = TRUE,
    repeat_required = FALSE,
    repeat_penalty_pct = 0,
    progression_cap_pct = 2.5,
    repeat_reason = NULL,
    repeat_requested_at = NULL,
    updated_at = NOW()
  WHERE id = p_adaptation_block_id;

  INSERT INTO app.mindfeed_transition_events (
    user_id,
    methodology_plan_id,
    source_block,
    target_block,
    action,
    reason,
    baseline,
    metadata
  ) VALUES (
    p_user_id,
    v_adaptation_block.methodology_plan_id,
    'adaptation',
    'hypertrophy_beginner',
    'advance',
    'criteria_met',
    COALESCE(v_evaluation, '{}'::jsonb),
    jsonb_build_object('adaptation_block_id', p_adaptation_block_id)
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Adaptation block completed successfully',
    'adaptation_block_id', p_adaptation_block_id,
    'ready_for_d1d5', TRUE,
    'evaluation', v_evaluation
  );
END;
$function$;

-- 4) Transición principiante -> intermedio tras semana 12
CREATE OR REPLACE FUNCTION app.transition_beginner_to_intermediate(
  p_user_id INTEGER,
  p_methodology_plan_id INTEGER,
  p_current_week INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $function$
DECLARE
  v_user_level VARCHAR;
  v_week INTEGER;
  v_plan_data JSONB;
  v_baseline JSONB := '[]'::jsonb;
  v_triggered BOOLEAN := FALSE;
BEGIN
  SELECT nivel_entrenamiento
  INTO v_user_level
  FROM app.users
  WHERE id = p_user_id;

  IF COALESCE(v_user_level, 'Principiante') <> 'Principiante' THEN
    RETURN jsonb_build_object('triggered', false, 'reason', 'user_not_beginner');
  END IF;

  SELECT current_week, plan_data
  INTO v_week, v_plan_data
  FROM app.methodology_plans
  WHERE id = p_methodology_plan_id;

  v_week := COALESCE(p_current_week, v_week, 1);

  IF v_week < 12 THEN
    RETURN jsonb_build_object('triggered', false, 'reason', 'week_below_threshold', 'current_week', v_week);
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'exercise_id', exercise_id,
        'exercise_name', exercise_name,
        'target_weight_next_cycle', target_weight_next_cycle,
        'last_adjustment', last_adjustment
      )
    ),
    '[]'::jsonb
  )
  INTO v_baseline
  FROM app.hypertrophy_progression
  WHERE user_id = p_user_id;

  UPDATE app.users
  SET nivel_entrenamiento = 'Intermedio'
  WHERE id = p_user_id;

  v_plan_data := jsonb_set(COALESCE(v_plan_data, '{}'::jsonb), '{transitioned_to_intermediate}', 'true'::jsonb, TRUE);

  UPDATE app.methodology_plans
  SET plan_data = v_plan_data,
      updated_at = NOW()
  WHERE id = p_methodology_plan_id;

  INSERT INTO app.mindfeed_transition_events (
    user_id,
    methodology_plan_id,
    source_block,
    target_block,
    action,
    reason,
    baseline,
    metadata
  ) VALUES (
    p_user_id,
    p_methodology_plan_id,
    'hypertrophy_beginner',
    'hypertrophy_intermediate',
    'advance',
    'week_12_threshold',
    v_baseline,
    jsonb_build_object('current_week', v_week)
  );

  v_triggered := TRUE;

  RETURN jsonb_build_object(
    'triggered', v_triggered,
    'current_week', v_week,
    'new_level', 'Intermedio'
  );
END;
$function$;
