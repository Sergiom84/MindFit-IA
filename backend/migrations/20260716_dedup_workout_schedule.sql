-- DATA-002 (auditoría ECI): limpieza de duplicados en app.workout_schedule.
--
-- CAUSA RAÍZ: el generador (backend/utils/ensureScheduleV3.js:795) inserta con un
-- guard `WHERE NOT EXISTS (... methodology_plan_id, user_id, scheduled_date)`, que
-- tiene una condición de carrera (TOCTOU): dos generaciones casi simultáneas del
-- mismo plan pasan ambas el NOT EXISTS y ambas insertan → sesión duplicada en la
-- misma fecha. Se observaron pares creados con ~15 s de diferencia.
--
-- APLICADO EN PRODUCCIÓN el 2026-07-16 mediante script transaccional (no este .sql):
--   * 6597 -> 6423 filas (174 duplicadas borradas), 0 grupos duplicados restantes.
--   * Todas las filas eran status='scheduled' (ningún progreso real en esta tabla).
--   * Sin FKs apuntando a workout_schedule.id, sin riesgo de pérdida.
--   * BACKUP REVERSIBLE en: app.workout_schedule_dupbackup_20260716 (174 filas).
--
-- Este fichero documenta la operación de forma idempotente/reproducible.
-- Conserva la fila de MENOR id por (plan, user, scheduled_date).

BEGIN;

-- Respaldo (idempotente): solo crea si no existe
CREATE TABLE IF NOT EXISTS app.workout_schedule_dupbackup_20260716 AS
  SELECT w.* FROM app.workout_schedule w
  WHERE w.id IN (
    SELECT id FROM (
      SELECT id, row_number() OVER (
        PARTITION BY methodology_plan_id, user_id, scheduled_date ORDER BY id ASC) rn
      FROM app.workout_schedule) t
    WHERE rn > 1
  );

DELETE FROM app.workout_schedule WHERE id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (
      PARTITION BY methodology_plan_id, user_id, scheduled_date ORDER BY id ASC) rn
    FROM app.workout_schedule) t
  WHERE rn > 1
);

COMMIT;

-- PENDIENTE (follow-up, NO aplicado): prevención de recurrencia.
-- Un UNIQUE (methodology_plan_id, user_id, scheduled_date) cerraría la carrera,
-- pero antes hay que revisar/ajustar las otras vías de inserción (p. ej.
-- extraWorkoutService.js inserta con scheduled_date=CURRENT_DATE y columnas
-- inexistentes: código ya roto) para que no rompan en producción. Alternativa
-- más segura: corregir la carrera en ensureScheduleV3.js (INSERT ... ON CONFLICT
-- DO NOTHING sobre esa clave) en lugar del guard NOT EXISTS.
