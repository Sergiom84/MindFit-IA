-- 20260720_sec006b_rerevoke_public_execute_app.sql
-- SEC-006 (cierre / re-barrido): retira EXECUTE de PUBLIC en funciones `app` creadas
-- DESPUÉS de la migración original.
--
-- Antecedente:
--   `20260717_sec006_revoke_public_execute_app.sql` ya se aplicó a producción
--   (2026-07-17, registrada en el ledger app.schema_migrations, ver RECONCILIATION.md).
--   Aquel barrido dejó 0 funciones `app` con EXECUTE para PUBLIC en aquel momento y
--   además fijó ALTER DEFAULT PRIVILEGES FOR ROLE postgres para las FUTURAS.
--
-- Hallazgo (inventario READ ONLY contra producción, 2026-07-20, BEGIN READ ONLY + ROLLBACK):
--   * current_user = postgres, current_database = postgres.
--   * 185 funciones en el esquema `app` (antes 184; +1 por doc04).
--   * 1 función con EXECUTE para PUBLIC de nuevo: `app.log_bridge_decision_v2(...)`,
--     creada por la migración doc04 PR3 `20260720_phase0_training_nutrition_contract.sql`
--     (posterior a SEC-006). Owner = postgres. 0 funciones con proacl NULL.
--   * Grants EXECUTE actuales (proacl explícito): postgres=185, service_role=185,
--     authenticated=1 (solo log_bridge_decision_v2, GRANT legítimo de PR3, línea 135-138),
--     PUBLIC=1 (solo log_bridge_decision_v2, el que esta migración retira).
--   * 0 funciones SECURITY DEFINER en `app`.
--   * El ALTER DEFAULT PRIVILEGES FOR ROLE postgres del SEC-006 original NO evitó el
--     leak pese a que el owner es postgres: la garantía fiable es este barrido explícito
--     (idempotente), no las default privileges. Ver nota al pie sobre el rol aplicador.
--
-- Efecto de esta migración: quita el EXECUTE de PUBLIC de log_bridge_decision_v2 (y de
-- cualquier otra función `app` que haya recuperado PUBLIC), CONSERVANDO el GRANT a
-- `authenticated` (REVOKE ... FROM PUBLIC no toca los grants a roles nominales) y a
-- service_role. No rompe ningún flujo: el backend conecta como postgres (owner) y la
-- app llama a log_bridge_decision_v2 como `authenticated` vía RPC, grant que se preserva.
--
-- Idempotente: REVOKE/GRANT/ALTER DEFAULT PRIVILEGES pueden reejecutarse sin efecto.
-- NO APLICADA por el ejecutor: la aplica el arquitecto con `npm run migrate:up`.

BEGIN;

-- 1) Re-barrido: retira EXECUTE de PUBLIC de TODAS las funciones app actuales.
--    Captura log_bridge_decision_v2 y cualquier drift futuro presente al aplicar.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;

-- 2) Re-afirma EXECUTE explícito al rol server-side de confianza (idempotente).
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO service_role;

-- 3) Re-afirma mínimo privilegio para funciones FUTURAS creadas por postgres en app.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app
  GRANT EXECUTE ON FUNCTIONS TO service_role;

COMMIT;

-- Nota (para el arquitecto): la DEFAULT PRIVILEGE del SEC-006 original no impidió que
-- log_bridge_decision_v2 (owner postgres) recuperase PUBLIC. Hipótesis: la migración
-- doc04 pudo aplicarse por un rol distinto de `postgres` (p.ej. supabase_admin vía panel
-- o herramienta) aunque el objeto acabe siendo propiedad de postgres; ALTER DEFAULT
-- PRIVILEGES FOR ROLE postgres solo cubre lo CREADO por postgres. Si se confirma que las
-- migraciones se aplican siempre como postgres, este re-barrido basta; si no, valorar
-- añadir ALTER DEFAULT PRIVILEGES FOR ROLE <rol_aplicador> o ejecutar el barrido explícito
-- como paso final de cada tanda de migraciones que cree funciones en `app`.
