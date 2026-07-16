# Baseline del esquema `app` (DB-001)

Instantánea reproducible del esquema de negocio (`app`) de producción, para poder
crear un entorno de staging/test fiel y restaurar desde cero. Aborda parcialmente
el hallazgo **DB-001** de la auditoría ECI ("producción no se puede reconstruir
desde Git": 125 tablas reales frente a ~63 declaradas en SQL suelto, sin ledger de
migraciones).

## Qué contiene

`app_schema_baseline.sql` — **solo esquema** (sin datos): tablas, columnas, tipos,
defaults, constraints, índices, secuencias, vistas, funciones y triggers del
esquema `app`. Sin ownership ni grants (portable). Generado el 2026-07-16 y ya
incluye los arreglos de integridad de DATA-002 (4 FKs `ON DELETE CASCADE`).

Recuento capturado: 125 tablas · 184 funciones · 19 vistas · 43 triggers ·
99 foreign keys (95 originales + 4 nuevas de DATA-002). Excluye las tablas de
backup temporales (`*_bak_*`, `*dupbackup*`).

## Cómo se generó

```bash
pg_dump "$DATABASE_URL" \
  --schema-only --schema=app \
  --no-owner --no-privileges --no-comments \
  --exclude-table='app.*dupbackup*' --exclude-table='app.*_bak_*' \
  -f backend/db/baseline/app_schema_baseline.sql
```

(pg_dump 17 contra el servidor PostgreSQL 17.6 de Supabase.)

## Cómo restaurar en una BD limpia (staging/test)

En Supabase estos objetos ya existen. En un **Postgres vanilla** (p. ej. el CI) hay
que crear antes unos stubs que el baseline referencia: los roles gestionados por
Supabase que aparecen en políticas RLS (`authenticated`, y por prudencia `anon` /
`service_role`) y `auth.uid()`. El baseline ya crea su propio `CREATE SCHEMA app`.

```bash
createdb baseline_check
psql "$URL" -d baseline_check -v ON_ERROR_STOP=1 \
  -c "CREATE ROLE anon NOLOGIN;" \
  -c "CREATE ROLE authenticated NOLOGIN;" \
  -c "CREATE ROLE service_role NOLOGIN;" \
  -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" \
  -c "CREATE SCHEMA IF NOT EXISTS auth;" \
  -c "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';"
psql "$URL" -d baseline_check -v ON_ERROR_STOP=1 -f backend/db/baseline/app_schema_baseline.sql
```

Restaura limpio (verificado): 125 tablas, 184 funciones, 99 FKs, 17 vistas. El job
`db-baseline-restore` de `.github/workflows/ci.yml` ejecuta exactamente esto en un
contenedor `postgres:17` en cada push/PR, así que si el baseline deja de restaurar,
el CI se pone rojo.

## Flujo de cambios de esquema (política DB-001)

Para no volver al problema de "125 tablas reales vs 63 declaradas":

1. **Nada de DDL manual en producción.** Todo cambio de esquema es una migración
   numerada en `backend/migrations/` (`AAAAMMDD_descripcion.sql`), idempotente
   cuando sea posible.
2. Aplicar la migración a producción de forma controlada y **regenerar este
   baseline** con el comando de arriba, para que no derive.
3. El CI valida que el baseline sigue restaurando desde cero.

## Limitaciones / siguientes pasos de DB-001

- Solo el esquema `app`. Los esquemas gestionados por Supabase (`auth`, `storage`,
  `realtime`, `vault`, …) no se incluyen (los provee la plataforma).
- Este baseline es una FOTO, no un ledger de migraciones. El siguiente paso es
  adoptar migraciones ordenadas a partir de aquí y prohibir DDL manual en prod.
- Falta un job de CI que restaure este baseline en una BD efímera y valide que
  arranca (parte de CI-001).
- Regenerar este fichero tras cambios de esquema aprobados para que no derive.
