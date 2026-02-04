-- ============================================================================
-- FIX: cast de compensation_status en get_weekly_deviation_summary
-- ============================================================================

CREATE OR REPLACE FUNCTION app.get_weekly_deviation_summary(
  p_user_id INTEGER,
  p_week_start DATE DEFAULT NULL
)
RETURNS TABLE (
  week_start DATE,
  daily_target INTEGER,
  weekly_target INTEGER,
  total_deviations INTEGER,
  total_excess_kcal INTEGER,
  total_compensated INTEGER,
  net_deviation INTEGER,
  deviation_count INTEGER,
  compensation_status VARCHAR(20)
) AS $$
DECLARE
  v_week_start DATE;
BEGIN
  v_week_start := COALESCE(p_week_start, app.get_week_start(CURRENT_DATE));

  RETURN QUERY
  WITH deviations AS (
    SELECT
      COALESCE(SUM(excess_kcal), 0) AS total_excess,
      COUNT(*) AS dev_count
    FROM app.diet_deviations
    WHERE user_id = p_user_id
      AND deviation_date >= v_week_start
      AND deviation_date < v_week_start + 7
  ),
  compensations AS (
    SELECT COALESCE(SUM(ABS(kcal_adjustment)), 0) AS total_comp
    FROM app.daily_compensation_plan
    WHERE user_id = p_user_id
      AND compensation_date >= v_week_start
      AND compensation_date < v_week_start + 7
      AND is_applied = TRUE
  ),
  targets AS (
    SELECT
      COALESCE(wt.daily_target_kcal, np.kcal_objetivo, np.tdee, 2000) AS daily_tgt
    FROM app.nutrition_profiles np
    LEFT JOIN app.weekly_calorie_targets wt ON wt.user_id = np.user_id AND wt.week_start_date = v_week_start
    WHERE np.user_id = p_user_id
  )
  SELECT
    v_week_start,
    t.daily_tgt::INTEGER,
    (t.daily_tgt * 7)::INTEGER,
    d.total_excess::INTEGER,
    d.total_excess::INTEGER,
    c.total_comp::INTEGER,
    (d.total_excess - c.total_comp)::INTEGER,
    d.dev_count::INTEGER,
    CASE
      WHEN d.total_excess = 0 THEN 'none'
      WHEN c.total_comp >= d.total_excess THEN 'completed'
      WHEN c.total_comp > 0 THEN 'partial'
      ELSE 'pending'
    END::VARCHAR(20)
  FROM deviations d, compensations c, targets t;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION app.get_weekly_deviation_summary TO authenticated;

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================
