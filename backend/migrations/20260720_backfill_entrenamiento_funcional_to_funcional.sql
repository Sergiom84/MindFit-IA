-- 20260720_backfill_entrenamiento_funcional_to_funcional.sql
-- Descripción: F2 (ONB-P2-01) — canoniza la metodología funcional. El alta guardaba
-- `entrenamiento_funcional`, que en Perfil se mostraba como "No especificado" (el mapa
-- de labels solo conocía `funcional`) y que el backend ya canoniza a `funcional`.
-- Este backfill unifica los 3 usuarios legacy al valor canónico en ambas tablas.
-- Idempotente: reejecutarla no afecta filas (ya no habrá `entrenamiento_funcional`).

BEGIN;

UPDATE app.users
SET metodologia_preferida = 'funcional',
    updated_at = NOW()
WHERE metodologia_preferida = 'entrenamiento_funcional';

UPDATE app.user_profiles
SET metodologia_preferida = 'funcional',
    updated_at = NOW()
WHERE metodologia_preferida = 'entrenamiento_funcional';

COMMIT;
