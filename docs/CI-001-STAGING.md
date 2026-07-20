# CI-001 — Tests de integración contra BD efímera (staging local)

Los tests de integración del backend (los de `DB_TESTS` en `backend/scripts/run-tests.mjs`)
**escriben en la base de datos**. Para no tocar producción por accidente hay dos capas:

1. **Guard fail-closed en `backend/db.js` (§2.2).** Con `NODE_ENV=test`, si `DATABASE_URL`
   apunta a un host que parece producción (`*.supabase.co`/`*.supabase.com` o
   `*.pooler.supabase.com`), la carga del módulo **aborta** con un error `[test-safety]`
   antes de crear el pool o conectar. Override intencionado: `ALLOW_PROD_DB_TESTS=1`.
   El harness `run-tests.mjs integration` fija `NODE_ENV=test`, así que el guard está
   siempre activo por esa vía. Cobertura: `backend/tests/dbSafetyGuard.test.js` (unit).

2. **BD efímera local (Docker, puerto 55432).** Arnés ya existente:
   `scripts/arch002-test-db.ps1` (Windows/PowerShell). Levanta `postgres:17` en
   `127.0.0.1:55432`, base `arch002_test`, y restaura el baseline del esquema `app`
   (`backend/db/baseline/app_schema_baseline.sql`) + prelude + fixtures.

## Levantar la BD efímera y correr los tests de integración

```powershell
# 1) Reconstruye la BD efímera desde el baseline (idempotente; recrea el contenedor).
npm run qa:arch002:db
#   -> imprime:
#      ARCH-002 DB aislada lista (<n_tablas>:1:1)
#      DATABASE_URL=postgresql://postgres@127.0.0.1:55432/arch002_test
#      NODE_ENV=test

# 2) Corre los tests de integración apuntando a la efímera (host local => el guard NO
#    la considera producción y deja pasar).
$env:DATABASE_URL = "postgresql://postgres@127.0.0.1:55432/arch002_test"
$env:NODE_ENV = "test"
npm run test:backend:integration

# 3) Parar el contenedor cuando termines (no borra datos).
npm run qa:arch002:db:stop
```

En Git Bash / WSL el equivalente sin PowerShell:

```bash
DATABASE_URL="postgresql://postgres@127.0.0.1:55432/arch002_test" \
NODE_ENV=test \
npm run test:backend:integration
```

## Verificación del guard (el "fail-closed" de verdad)

Con un `DATABASE_URL` de producción y `NODE_ENV=test`, el harness se niega a correr sin
llegar a conectar:

```bash
NODE_ENV=test DATABASE_URL="postgresql://.../db.sbqcnlwpvjavmljzkmfy.supabase.co:5432/postgres" \
npm run test:backend:integration
# -> Error [test-safety]: DATABASE_URL apunta a una BD de producción (...) con NODE_ENV=test.
```

Esto está cubierto de forma automática por `backend/tests/dbSafetyGuard.test.js`
(usa hosts sintéticos, no conecta a nada) y corre en el CI como test unit.

## Notas

- Los tests **unit** (`npm run test:backend`) no tocan BD (mocks / pool lazy) y no se ven
  afectados por el guard.
- Riesgo residual conocido: ejecutar un fichero de `DB_TESTS` **directamente**
  (`node --test tests/<x>.test.js`) con `DATABASE_URL` de prod y **sin** `NODE_ENV=test`
  saltaría el guard. La vía sancionada es siempre `npm run test:backend:integration`,
  que fija `NODE_ENV=test`.
- El host `127.0.0.1`/`localhost` se trata explícitamente como no-producción en `db.js`.
