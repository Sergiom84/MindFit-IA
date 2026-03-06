# Scripts del backend

Fecha de revisión: 2026-03-06

## Estado real

Este directorio sí contiene scripts activos y utilidades puntuales. No debe leerse como un directorio vacío ni como un sistema "100% sin scripts manuales".

## Grupos principales

### Migraciones y verificación

- `run-migration.js`
- `run-migrations.js`
- `run-adaptation-migration.js`
- `run-nutrition-review-migration.js`
- `run-nutrition-adjustments-migration.js`
- `run-nutrition-recipes-migration.js`
- `verify-migrations.js`

### Diagnóstico y comprobaciones

- `check-hipertrofia-v2-tables.js`
- `check-methodology-plans.js`
- `check-progress-tables.js`
- `check-session-structure.js`
- `check-session-tables.js`
- `check-videos.js`
- `read-sql-functions.js`
- `test-db-minimal.js`

### Nutrición y calidad de menús

- `backfill-food-semantics.mjs`
- `generate-menu-quality-baseline.mjs`
- `run-menu-hard-rules-qa.mjs`
- `import-recipe-examples-from-excel.js`
- `normalize-recipe-names.js`
- `curate-recipe-names.js`
- `import-phase1-gap-recipes-v1.js`

### Hipertrofia y adaptación

- `test-adaptation-generation.js`
- `test-d1d5-mapping.js`
- `test-hipertrofia-sabados.js`
- `test-sabados-local.js`
- `validate-volume-distribution.js`
- `regenerate-schedule.js`

### Carga de datos

- `load-bomberos-exercises.js`
- `upload-excel.js`

## Uso recomendado

- Consulta primero `backend/package.json` para ver qué scripts npm están soportados oficialmente.
- Usa estos archivos como utilidades operativas o de diagnóstico, no como documentación contractual del sistema.
- Si un script toca base de datos o datos reales, léelo antes de ejecutarlo.
