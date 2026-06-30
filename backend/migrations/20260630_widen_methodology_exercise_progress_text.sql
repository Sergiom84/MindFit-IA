-- BUG-002: POST /api/routines/sessions/start devolvía 500 ("Error interno") para
-- CrossFit. Causa raíz: el INSERT en app.methodology_exercise_progress escribe
-- valores de texto libre propios de formatos WOD en columnas varchar(20).
-- CrossFit genera reps_objetivo = "Reps fijas por minuto" (21 chars) → desborda
-- repeticiones varchar(20) → "value too long for type character varying(20)".
-- El resto de metodologías usan reps cortas ("8-12"), por eso solo fallaba CrossFit.
--
-- Fix: ampliar a TEXT las columnas de valores de texto libre (reps/series/duración).
-- En PostgreSQL varchar(n) -> text es un cambio de metadatos instantáneo: no reescribe
-- la tabla, no pierde datos y es transparente para las consultas existentes.
--
-- La vista app.v_exercise_progress_expanded usa esas columnas (range_to_*), así que
-- hay que recrearla alrededor del ALTER. Todo en una transacción (atómico).

BEGIN;

DROP VIEW IF EXISTS app.v_exercise_progress_expanded;

ALTER TABLE app.methodology_exercise_progress
  ALTER COLUMN repeticiones TYPE text,
  ALTER COLUMN series_total TYPE text,
  ALTER COLUMN total_reps TYPE text,
  ALTER COLUMN total_sets TYPE text,
  ALTER COLUMN reps_completed TYPE text,
  ALTER COLUMN planned_duration_seconds TYPE text,
  ALTER COLUMN actual_duration_seconds TYPE text;

CREATE VIEW app.v_exercise_progress_expanded AS
 SELECT id, user_id, methodology_session_id, exercise_name, exercise_order,
    exercise_level, total_sets, sets_completed, total_reps, reps_completed,
    planned_duration_seconds, actual_duration_seconds, rest_seconds, status,
    difficulty_rating, effort_rating, exercise_notes, additional_info,
    was_difficult, personal_feedback, started_at, completed_at, created_at,
    updated_at, series_total, repeticiones, descanso_seg, intensidad, tempo,
    notas, series_completed,
    range_to_min_value(series_total::varchar) AS series_min,
    range_to_max_value(series_total::varchar) AS series_max,
    range_to_min_value(repeticiones::varchar) AS reps_min,
    range_to_max_value(repeticiones::varchar) AS reps_max,
    range_to_min_value(planned_duration_seconds::varchar) AS duration_min,
    range_to_max_value(planned_duration_seconds::varchar) AS duration_max
   FROM app.methodology_exercise_progress;

COMMIT;
