-- 20260717_data003_users_drop_live_pairs.sql
-- DATA-003 (pares vivos): canoniza app.users eliminando las 5 columnas duplicadas
-- que estaban vacías/residuales en datos pero VIVAS en código, tras el refactor que
-- deja el código leyendo/escribiendo solo la canónica.
--
-- IMPORTANTE (orden de despliegue): aplicar ESTA migración SOLO DESPUÉS de que el
-- código refactorizado esté desplegado en producción (main), porque el código previo
-- SELECT-eaba estas columnas. La reconciliación de datos va en la migración hermana
-- 20260717_data003_users_reconcile_live_pairs.sql (aplicar antes).
--
-- Duplicada -> canónica (verificado 2026-07-17):
--   "años_entrenando"     -> anos_entrenando        (SELECTs de adaptación/levelEvaluator retirados)
--   fecha_inicio_objetivo -> objetivo_activo_desde   (users.js SELECT/UPDATE + GoalProgressCard repunteados)
--   enfoque               -> enfoque_entrenamiento    (sin refs SQL; UI usa enfoque_entrenamiento)
--   metodologia           -> metodologia_preferida    (sin refs SQL; 1 fila reconciliada)
--   meta_grasa            -> meta_grasa_corporal       (users.js + useProfileState repunteados; 1 fila reconciliada)
--
-- Dependencias verificadas (read-only): sin vistas, sin defaults, sin generated.
-- Los CHECK monocolumna users_enfoque_check / users_metodologia_check caen
-- automáticamente con su columna (DROP COLUMN). Idempotente (IF EXISTS).

BEGIN;

ALTER TABLE app.users DROP COLUMN IF EXISTS "años_entrenando";
ALTER TABLE app.users DROP COLUMN IF EXISTS fecha_inicio_objetivo;
ALTER TABLE app.users DROP COLUMN IF EXISTS enfoque;
ALTER TABLE app.users DROP COLUMN IF EXISTS metodologia;
ALTER TABLE app.users DROP COLUMN IF EXISTS meta_grasa;

COMMIT;
