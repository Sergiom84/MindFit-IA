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

Prerrequisitos en la BD destino (Supabase los trae de serie; en Postgres puro hay
que crearlos antes): esquema `app`, y las extensiones `pgcrypto`/`uuid-ossp` si se
usan (`gen_random_uuid` es nativo desde PG13). Luego:

```bash
createdb entrenaconia_staging   # o el proyecto Supabase de test
psql "$STAGING_DATABASE_URL" -c "CREATE SCHEMA IF NOT EXISTS app;"
psql "$STAGING_DATABASE_URL" -f backend/db/baseline/app_schema_baseline.sql
```

## Limitaciones / siguientes pasos de DB-001

- Solo el esquema `app`. Los esquemas gestionados por Supabase (`auth`, `storage`,
  `realtime`, `vault`, …) no se incluyen (los provee la plataforma).
- Este baseline es una FOTO, no un ledger de migraciones. El siguiente paso es
  adoptar migraciones ordenadas a partir de aquí y prohibir DDL manual en prod.
- Falta un job de CI que restaure este baseline en una BD efímera y valide que
  arranca (parte de CI-001).
- Regenerar este fichero tras cambios de esquema aprobados para que no derive.
