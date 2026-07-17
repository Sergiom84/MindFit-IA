-- 20260717_data003_users_reconcile_live_pairs.sql
-- DATA-003 (pares vivos): reconcilia los datos residuales de las columnas duplicadas
-- de app.users hacia sus canónicas ANTES de dejar el código de usar las duplicadas.
--
-- Inventario read-only (2026-07-17, 90 users):
--   años_entrenando -> anos_entrenando        : dup 0 non-null  -> nada que migrar
--   fecha_inicio_objetivo -> objetivo_activo_desde: dup 0 non-null -> nada que migrar
--   enfoque -> enfoque_entrenamiento           : dup 0 non-null  -> nada que migrar
--   metodologia -> metodologia_preferida       : dup 1 non-null, 1 dup_only, 0 conflictos
--   meta_grasa -> meta_grasa_corporal          : dup 4 non-null, 1 dup_only, 0 conflictos
--
-- Solo rellenamos la canónica cuando está NULL y la duplicada tiene dato (sin conflictos
-- detectados). Idempotente y sin pérdida (no sobreescribe canónicas ya pobladas).
-- Segura de aplicar en cualquier momento (no toca esquema).

BEGIN;

UPDATE app.users
   SET metodologia_preferida = metodologia
 WHERE metodologia IS NOT NULL
   AND metodologia_preferida IS NULL;

UPDATE app.users
   SET meta_grasa_corporal = meta_grasa
 WHERE meta_grasa IS NOT NULL
   AND meta_grasa_corporal IS NULL;

COMMIT;
