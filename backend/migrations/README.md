# Migraciones (DB-001)

Runner ligero con ledger para que los cambios de esquema sean **ordenados y
rastreables**, en lugar de DDL manual sin registro (el problema que señaló la
auditoría: 125 tablas reales frente a las declaradas).

## Cómo funciona

- El estado aplicado se guarda en la tabla **`app.schema_migrations`**
  (`version`, `checksum`, `applied_at`, `baseline`).
- Las migraciones son ficheros `.sql` en esta carpeta. El **orden** es el
  lexicográfico del nombre; por eso los ficheros nuevos usan prefijo `AAAAMMDD_`.
- Cada fichero controla su propia transacción (`BEGIN; … COMMIT;`). Si usa
  `CREATE INDEX CONCURRENTLY` (que no admite transacción), déjalo suelto sin
  `BEGIN/COMMIT`.

## Comandos (desde `backend/`)

```bash
npm run migrate:status                 # aplicadas vs pendientes (+ aviso de drift)
npm run migrate:up                     # aplica las pendientes en orden y las registra
npm run migrate:new -- "slug corto"    # crea AAAAMMDD_slug_corto.sql
npm run migrate:baseline               # marca las actuales como aplicadas SIN ejecutarlas
```

Todos usan `DATABASE_URL` del entorno (`.env` en local; variables de Render en
prod). Aplican contra la BD a la que apunte esa URL, así que en local revisa que
no sea producción antes de `up` si estás probando.

## Estado de adopción

El ledger se inicializó el 2026-07-16 con `baseline`: las 79 migraciones
históricas se marcaron como aplicadas (sin re-ejecutarlas, porque el esquema de
producción ya las contenía; ver `backend/db/baseline/`). A partir de ahí, solo se
aplican y registran las migraciones **nuevas** con `migrate:up`.

## Flujo para un cambio de esquema

1. `npm run migrate:new -- "descripcion"` y escribe el DDL en el fichero.
2. Pruébalo en local/staging.
3. `npm run migrate:up` contra producción (de forma controlada).
4. Regenera el baseline (`backend/db/baseline/README.md`) para que no derive.

**No aplicar DDL a mano en producción**: rompe el ledger y la reproducibilidad.
