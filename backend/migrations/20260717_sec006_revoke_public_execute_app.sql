-- 20260717_sec006_revoke_public_execute_app.sql
-- SEC-006: mínimo privilegio en las funciones del esquema `app`.
--
-- Al crear una función, PostgreSQL concede EXECUTE a PUBLIC por defecto. En prod
-- esto se traduce en 184 funciones ejecutables por PUBLIC. Esta migración retira
-- ese grant implícito y deja EXECUTE solo para roles server-side de confianza.
--
-- Contexto verificado en producción antes de escribir esta migración:
--   * El backend conecta como `postgres`, OWNER de las 184 funciones -> puede
--     ejecutarlas siempre, sin depender de ningún GRANT. Revocar PUBLIC no le afecta.
--   * El esquema `app` NO está expuesto por PostgREST (no hay `pgrst.db_schemas`
--     configurado -> default `public`, `graphql_public`), luego `anon`/`authenticated`
--     no invocan estas funciones por RPC.
--   * 0 funciones SECURITY DEFINER en `app` (sin escalada de privilegios).
--   * Ninguna policy RLS ni check-constraint invoca funciones de `app`
--     (las policies que mencionan "app." usan el GUC current_setting('app.current_user_id'),
--      no una función del esquema).
-- => Revocar EXECUTE de PUBLIC no rompe ningún flujo actual.
--
-- Idempotente: REVOKE/GRANT/ALTER DEFAULT PRIVILEGES pueden reejecutarse sin efecto.

BEGIN;

-- 1) Retira el EXECUTE que PostgreSQL concede a PUBLIC por defecto en las funciones
--    ya existentes del esquema app.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;

-- 2) Concede EXECUTE explícito al rol server-side de confianza de Supabase.
--    El backend usa `postgres` (owner) y no lo necesita; service_role queda como
--    única vía server-side legítima (service key) si alguna vez se requiere.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO service_role;

-- 3) Mínimo privilegio también para funciones FUTURAS creadas por `postgres` en app
--    (todas las migraciones corren como postgres): sin PUBLIC, con EXECUTE explícito
--    a service_role.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app
  GRANT EXECUTE ON FUNCTIONS TO service_role;

COMMIT;
