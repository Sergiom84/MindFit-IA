-- Fix calculate_mean_rir_last_microcycle to average last 5 sessions safely
CREATE OR REPLACE FUNCTION app.calculate_mean_rir_last_microcycle(
  p_user_id integer,
  p_methodology_plan_id integer
)
RETURNS numeric
LANGUAGE plpgsql
AS $function$
DECLARE
  v_mean_rir DECIMAL;
BEGIN
  -- Average RIR across the last 5 sessions (within last 14 days)
  WITH last_sessions AS (
    SELECT session_id, MAX(created_at) AS last_set_at
    FROM app.hypertrophy_set_logs
    WHERE user_id = p_user_id
      AND methodology_plan_id = p_methodology_plan_id
      AND created_at > NOW() - INTERVAL '14 days'
    GROUP BY session_id
    ORDER BY last_set_at DESC
    LIMIT 5
  )
  SELECT AVG(rir_reported)
  INTO v_mean_rir
  FROM app.hypertrophy_set_logs hsl
  JOIN last_sessions ls ON ls.session_id = hsl.session_id
  WHERE hsl.user_id = p_user_id
    AND hsl.methodology_plan_id = p_methodology_plan_id;

  RETURN COALESCE(v_mean_rir, 2.5);
END;
$function$;
