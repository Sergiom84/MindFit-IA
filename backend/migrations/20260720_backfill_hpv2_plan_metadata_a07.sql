-- 20260720_backfill_hpv2_plan_metadata_a07.sql
-- Descripción: A-07 (T3) — backfill de metadatos de plan en los planes HipertrofiaV2
-- ACTIVOS creados antes del fix de código (que ya escribe metadatos reales para los
-- planes nuevos). Corrige dos incoherencias:
--   1) plan_start_config.total_weeks/expected_sessions con el default fijo 4/12 (o
--      valores stale) que no coincidían con el calendario real (10-13 semanas, 44-65
--      sesiones). Se recalculan desde app.workout_schedule.
--   2) methodology_exercise_sessions.methodology_level en 'básico' en TODAS las sesiones,
--      ignorando el nivel real del plan. Se toma el nivel de plan_data (mismo valor que
--      escribe el código para sesiones nuevas: 'Principiante'/'Intermedio'/'Avanzado').
--
-- Alcance: solo planes methodology_type='HipertrofiaV2_MindFeed' y status='active'.
-- Preview read-only (2026-07-20): 29 planes con plan_start_config desajustado; 129
-- sesiones en 25 planes con methodology_level='básico' a corregir.
-- Sin CHECK constraints sobre estos campos (verificado). Idempotente (IS DISTINCT FROM).

BEGIN;

-- 1) plan_start_config: total_weeks y expected_sessions reales desde el calendario.
UPDATE app.plan_start_config psc
SET total_weeks = rc.real_weeks,
    expected_sessions = rc.real_sessions,
    updated_at = NOW()
FROM app.methodology_plans p
JOIN LATERAL (
  SELECT
    COUNT(DISTINCT ws.week_number) AS real_weeks,
    COUNT(*)                       AS real_sessions
  FROM app.workout_schedule ws
  WHERE ws.methodology_plan_id = p.id
) rc ON TRUE
WHERE psc.methodology_plan_id = p.id
  AND p.methodology_type = 'HipertrofiaV2_MindFeed'
  AND p.status = 'active'
  AND rc.real_sessions > 0
  AND (psc.total_weeks IS DISTINCT FROM rc.real_weeks
       OR psc.expected_sessions IS DISTINCT FROM rc.real_sessions);

-- 2) methodology_level real del plan en las sesiones que quedaron en 'básico'.
UPDATE app.methodology_exercise_sessions s
SET methodology_level = COALESCE(p.plan_data->>'nivel', p.plan_data->>'nivel_hipertrofia'),
    updated_at = NOW()
FROM app.methodology_plans p
WHERE s.methodology_plan_id = p.id
  AND p.methodology_type = 'HipertrofiaV2_MindFeed'
  AND p.status = 'active'
  AND COALESCE(p.plan_data->>'nivel', p.plan_data->>'nivel_hipertrofia') IS NOT NULL
  AND s.methodology_level IS DISTINCT FROM COALESCE(p.plan_data->>'nivel', p.plan_data->>'nivel_hipertrofia');

COMMIT;
