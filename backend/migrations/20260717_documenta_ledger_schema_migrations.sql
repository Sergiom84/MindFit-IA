-- Documenta la tabla del ledger de migraciones (DB-001). Idempotente e inocua:
-- solo fija un COMMENT. Sirve además como primera migración aplicada por el runner.

BEGIN;
COMMENT ON TABLE app.schema_migrations IS 'Ledger de migraciones aplicadas (DB-001, gestionado por backend/scripts/migrate.mjs)';
COMMIT;
