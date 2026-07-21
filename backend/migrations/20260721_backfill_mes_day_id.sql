-- COR-F0-04 §8 · Backfill del enlace canónico methodology_exercise_sessions.day_id
-- Auditoría correctiva Fase 0 (AUDITORIA_CORRECTIVA_FASE_0_POST_IMPLEMENTACION_2026-07-21.md)
--
-- CONTEXTO
--   La auditoría constata que las ~1.551 filas históricas de
--   app.methodology_exercise_sessions tienen day_id = NULL, mientras que
--   app.workout_schedule ya tiene su day_id canónico (poblado por
--   ensureScheduleV3 en filas nuevas y por el backfill de
--   20260720_phase0_training_nutrition_contract.sql en las históricas).
--   A partir de esta corrección, todo calendario NUEVO copia el day_id canónico a la
--   sesión en el momento de crearla (plans.js precreación + createMissingDaySession).
--   Esta migración recupera el enlace para las sesiones históricas ya existentes.
--
-- SEGURIDAD / ALCANCE
--   - ADITIVA y NO DESTRUCTIVA: solo hace UPDATE de day_id donde hoy es NULL.
--   - No modifica la migración ya aplicada 20260720_phase0_training_nutrition_contract.sql.
--   - Idempotente: re-ejecutarla no cambia filas ya enlazadas (WHERE mes.day_id IS NULL).
--   - Enlace UNÍVOCO: app.workout_schedule tiene índice único (methodology_plan_id,
--     user_id, scheduled_date), por lo que existe como máximo UNA fila de calendario por
--     (plan, usuario, fecha). Además exigimos coincidencia de abreviatura de día
--     (ws.day_abbrev = mes.day_name) como salvaguarda extra. Una sesión sin
--     correspondencia unívoca simplemente NO se toca (queda NULL para revisión manual).
--
-- ESTADO: **NO APLICADA**. Requiere revisión y aplicación explícita por Sergio con el
--   runner (`npm run migrate:up` desde backend/, contra la BD correcta). Antes de
--   aplicar, se recomienda ejecutar el bloque de conteo comentado al final para verificar
--   cuántas filas se enlazarán y que no haya ambigüedad.

BEGIN;

UPDATE app.methodology_exercise_sessions mes
SET day_id = ws.day_id,
    updated_at = NOW()
FROM app.workout_schedule ws
WHERE mes.day_id IS NULL
  AND ws.day_id IS NOT NULL
  AND ws.methodology_plan_id = mes.methodology_plan_id
  AND ws.user_id = mes.user_id
  AND ws.scheduled_date = mes.session_date::date
  AND ws.day_abbrev = mes.day_name;

COMMIT;

-- Verificación sugerida (solo lectura, ejecutar por separado antes/después):
--   -- Filas históricas aún sin day_id tras el backfill:
--   SELECT count(*) AS mes_sin_day_id
--   FROM app.methodology_exercise_sessions
--   WHERE day_id IS NULL;
--
--   -- Comprobación de que ninguna fecha tiene calendario ambiguo (debe ser 0):
--   SELECT ws.methodology_plan_id, ws.user_id, ws.scheduled_date, count(*)
--   FROM app.workout_schedule ws
--   WHERE ws.day_id IS NOT NULL
--   GROUP BY 1,2,3
--   HAVING count(*) > 1;
