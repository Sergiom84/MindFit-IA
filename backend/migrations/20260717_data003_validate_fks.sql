-- 20260717_data003_validate_fks.sql
-- DATA-003 (fase 3): valida las FKs NOT VALID de user_id / methodology_plan_id /
-- session_id creadas en las fases 1 y 2.
--
-- Tras limpiar los huérfanos (filas que referenciaban usuarios/planes/sesiones ya
-- borrados; respaldadas en output/data003_orphans_backup.json antes de borrar), ya se
-- puede promover cada constraint NOT VALID a validada: PostgreSQL escanea la tabla una
-- vez (SHARE UPDATE EXCLUSIVE, permite lecturas/escrituras) y garantiza integridad
-- total. En un restore limpio desde baseline no hay filas, así que valida al instante.
--
-- Idempotente: una constraint ya validada deja de aparecer en el cursor.

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT con.conname, rel.relname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'app'
      AND con.contype = 'f'
      AND NOT con.convalidated
      AND con.conname LIKE 'fk_%'
      AND EXISTS (
        SELECT 1 FROM unnest(con.conkey) k(n)
        JOIN pg_attribute a ON a.attrelid = rel.oid AND a.attnum = k.n
        WHERE a.attname IN ('user_id', 'methodology_plan_id', 'session_id')
      )
  LOOP
    EXECUTE format('ALTER TABLE app.%I VALIDATE CONSTRAINT %I', r.relname, r.conname);
  END LOOP;
END $$;
