-- DATA-002 (prevención de recurrencia): índice único que impide duplicados de
-- (methodology_plan_id, user_id, scheduled_date) en workout_schedule, cerrando la
-- condición de carrera del generador. Verificado 0 duplicados y 0 NULLs en la
-- clave antes de aplicar.
--
-- CREATE INDEX CONCURRENTLY no admite transacción → este fichero NO lleva
-- BEGIN/COMMIT (el runner lo ejecuta tal cual).
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_workout_schedule_plan_user_date
  ON app.workout_schedule (methodology_plan_id, user_id, scheduled_date);
