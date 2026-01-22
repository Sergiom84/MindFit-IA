-- Fix evaluate_level_change progression_rate calculation using existing columns
CREATE OR REPLACE FUNCTION app.evaluate_level_change(
  p_user_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_level VARCHAR(50);
  v_microcycles_completed INTEGER;
  v_avg_rir NUMERIC(3,1);
  v_adherence NUMERIC(5,2);
  v_progression_rate NUMERIC(5,2);
  v_fatigue_count INTEGER;
  v_sessions_last_month INTEGER;
  v_recommendation JSONB;
BEGIN
  -- Obtener nivel actual
  SELECT methodology_level INTO v_current_level
  FROM app.methodology_exercise_sessions
  WHERE user_id = p_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_current_level IS NULL THEN
    v_current_level := 'Principiante';
  END IF;

  -- Obtener métricas de los últimos 30 días
  SELECT
    COUNT(DISTINCT session_id) INTO v_sessions_last_month
  FROM app.hypertrophy_set_logs
  WHERE user_id = p_user_id
    AND created_at >= NOW() - INTERVAL '30 days';

  -- Calcular adherencia (sesiones esperadas vs completadas)
  v_adherence := CASE
    WHEN v_current_level = 'Principiante' THEN
      (v_sessions_last_month::NUMERIC / 12::NUMERIC) * 100 -- 3 sesiones/semana
    WHEN v_current_level = 'Intermedio' THEN
      (v_sessions_last_month::NUMERIC / 16::NUMERIC) * 100 -- 4 sesiones/semana
    ELSE
      (v_sessions_last_month::NUMERIC / 20::NUMERIC) * 100 -- 5 sesiones/semana
  END;

  -- RIR medio último mes
  SELECT AVG(rir_reported) INTO v_avg_rir
  FROM app.hypertrophy_set_logs
  WHERE user_id = p_user_id
    AND created_at >= NOW() - INTERVAL '30 days'
    AND is_warmup = FALSE;

  -- Microciclos completados
  SELECT microcycles_completed INTO v_microcycles_completed
  FROM app.hipertrofia_v2_state
  WHERE user_id = p_user_id;

  -- Fatiga acumulada
  SELECT COUNT(*) INTO v_fatigue_count
  FROM app.fatigue_flags
  WHERE user_id = p_user_id
    AND flag_date >= NOW() - INTERVAL '14 days'
    AND flag_type IN ('critical', 'light');

  -- Calcular tasa de progresión usando columnas existentes
  WITH progression AS (
    SELECT
      AVG(
        CASE
          WHEN current_pr IS NOT NULL AND current_pr != 0 THEN
            ((target_weight_next_cycle - (current_pr * 0.80)) / (current_pr * 0.80)) * 100
          WHEN target_weight_80 IS NOT NULL AND target_weight_80 != 0 THEN
            ((target_weight_next_cycle - target_weight_80) / target_weight_80) * 100
          ELSE NULL
        END
      ) AS avg_progression
    FROM app.hypertrophy_progression
    WHERE user_id = p_user_id
      AND updated_at >= NOW() - INTERVAL '30 days'
  )
  SELECT COALESCE(avg_progression, 0) INTO v_progression_rate
  FROM progression;

  -- Evaluar cambio de nivel
  v_recommendation := jsonb_build_object(
    'current_level', v_current_level,
    'metrics', jsonb_build_object(
      'microcycles_completed', v_microcycles_completed,
      'avg_rir', v_avg_rir,
      'adherence', v_adherence,
      'progression_rate', v_progression_rate,
      'fatigue_count', v_fatigue_count,
      'sessions_last_month', v_sessions_last_month
    )
  );

  -- Lógica de recomendación
  IF v_current_level = 'Principiante' THEN
    -- Criterios para subir a Intermedio
    IF v_microcycles_completed >= 3
       AND v_avg_rir <= 2.5
       AND v_adherence >= 80
       AND v_fatigue_count < 3 THEN
      v_recommendation := v_recommendation || jsonb_build_object(
        'suggested_level', 'Intermedio',
        'reason', 'Excelente progreso: 3+ microciclos completados con alta adherencia y buen control de RIR',
        'confidence', 0.85
      );
    END IF;

  ELSIF v_current_level = 'Intermedio' THEN
    -- Criterios para subir a Avanzado
    IF v_microcycles_completed >= 6
       AND v_avg_rir <= 2
       AND v_adherence >= 85
       AND v_progression_rate >= 2 THEN
      v_recommendation := v_recommendation || jsonb_build_object(
        'suggested_level', 'Avanzado',
        'reason', 'Listo para nivel avanzado: 6+ microciclos con excelente control y progresión',
        'confidence', 0.80
      );
    -- Criterios para bajar a Principiante
    ELSIF v_adherence < 50
          OR v_fatigue_count >= 5
          OR v_sessions_last_month < 8 THEN
      v_recommendation := v_recommendation || jsonb_build_object(
        'suggested_level', 'Principiante',
        'reason', 'Baja adherencia o alta fatiga detectada. Se recomienda reducir volumen',
        'confidence', 0.75
      );
    END IF;

  ELSIF v_current_level = 'Avanzado' THEN
    -- Criterios para bajar a Intermedio
    IF v_adherence < 60
       OR v_fatigue_count >= 7
       OR v_avg_rir > 3.5 THEN
      v_recommendation := v_recommendation || jsonb_build_object(
        'suggested_level', 'Intermedio',
        'reason', 'Fatiga acumulada o adherencia baja. Reducir intensidad temporalmente',
        'confidence', 0.70
      );
    END IF;
  END IF;

  -- Si no hay cambio sugerido
  IF NOT v_recommendation ? 'suggested_level' THEN
    v_recommendation := v_recommendation || jsonb_build_object(
      'suggested_level', v_current_level,
      'reason', 'Mantener nivel actual',
      'confidence', 1.0,
      'no_change', TRUE
    );
  END IF;

  RETURN v_recommendation;
END;
$$;
