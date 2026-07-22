-- 20260722_retire_hipertrofia_legacy_plans.sql
-- Descripción: Fase 1 del retiro del motor "Hipertrofia" legacy (previo a HipertrofiaV2).
--   Borra las filas históricas de app.methodology_plans con methodology_type = 'hipertrofia'
--   (9 filas conocidas: 0 activas, plan_data vacío). Borrado AUTORIZADO por el dueño.
--
-- Seguridad:
--   - Match EXACTO methodology_type = 'hipertrofia'. Nunca toca HipertrofiaV2_MindFeed ni gimnasio.
--   - Copia a backup en servidor antes de borrar.
--   - Tablas hijas: FKs ON DELETE CASCADE / SET NULL (no requieren limpieza manual).
--   - GUARDA: si hubiera algún plan legacy 'active', ABORTA (revisión humana).
-- Idempotente.

BEGIN;

DO $$
DECLARE
  active_legacy int;
BEGIN
  SELECT count(*) INTO active_legacy
  FROM app.methodology_plans
  WHERE methodology_type = 'hipertrofia' AND status = 'active';

  IF active_legacy > 0 THEN
    RAISE EXCEPTION
      'ABORTADO: % plan(es) legacy hipertrofia en estado active. Revisión humana requerida.',
      active_legacy;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS app.methodology_plans_legacy_hipertrofia_bkp
  AS TABLE app.methodology_plans WITH NO DATA;

COMMENT ON TABLE app.methodology_plans_legacy_hipertrofia_bkp IS
  'Backup de evidencia (2026-07-22) de filas legacy methodology_type=hipertrofia borradas al retirar el motor Hipertrofia legacy. Conservar para auditoría.';

INSERT INTO app.methodology_plans_legacy_hipertrofia_bkp
SELECT p.*
FROM app.methodology_plans p
WHERE p.methodology_type = 'hipertrofia'
  AND NOT EXISTS (
    SELECT 1 FROM app.methodology_plans_legacy_hipertrofia_bkp b WHERE b.id = p.id
  );

DELETE FROM app.methodology_plans
WHERE methodology_type = 'hipertrofia';

COMMIT;
