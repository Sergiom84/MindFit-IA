# QA y tests - Ciclo menstrual v3 (MindFeed)

Este documento define scripts y pruebas manuales para validar la implementacion.

## Pre-requisitos

- Backend disponible (no reiniciar sin permiso).
- Variables:
  - DATABASE_URL
  - JWT_SECRET
  - AUTH_TOKEN (JWT valido, **no almacenar en repo**)
  - API_URL (default http://localhost:3010)

### Nota de seguridad (obligatoria)

- No guardar tokens reales en este repositorio.
- Usar variables de entorno locales al ejecutar los scripts.

Ejemplo:

```bash
export AUTH_TOKEN="PEGA_TU_TOKEN_AQUI"
export API_URL="http://localhost:3010"
```

### Uso recomendado de .env (local, no commit)

1. Rellena el placeholder `AUTH_TOKEN=` en `.env`.
2. Antes de ejecutar scripts, carga las variables:

```bash
set -a
source .env
set +a
```

## Scripts a crear (y ejecutar)

### 0) Tags hipertrofia (seed + template)

- Archivo: scripts/seed-hypertrofia-tags.mjs
- Run: `node scripts/seed-hypertrofia-tags.mjs`
- Output: Rellena pattern/equipment en app.exercise_tags.

- Archivo: scripts/export-hypertrofia-tags.mjs
- Run: `node scripts/export-hypertrofia-tags.mjs`
- Output: `docs/ciclo_menstrual/tags_hypertrofia_template.csv` para completar riesgo.

- Archivo: scripts/import-hypertrofia-tags.mjs
- Run: `node scripts/import-hypertrofia-tags.mjs`
- Output: Importa impact/axial/cod/overhead desde el CSV.

### 1) Unit tests del motor

- Archivo: backend/tests/menstrualCycleEngine.test.js
- Run: `node --test backend/tests/menstrualCycleEngine.test.js`
- Cubre:
  - Modo sintomas por anticoncepcion o falta de data.
  - Fase y ciclo_day en modo fase.
  - Multiplicadores por fase y sintomas.
  - Clamp [0.80, 1.10].
  - Regla no subir volumen e intensidad a la vez.
  - Descanso extra por sleep>=2.

### 2) Integration API

- Archivo: scripts/test-menstrual-cycle-api.mjs
- Run: `node scripts/test-menstrual-cycle-api.mjs`
- Requiere AUTH_TOKEN y API_URL.
- Flujos:
  - POST /api/menstrual-cycle/config (campos nuevos).
  - POST /api/menstrual-cycle/log (campos 0-3 + quality/pain_next_day).
  - GET /api/menstrual-cycle/training-adjustment.

### 2.1) UI alignment (manual)

- Verificar que la UI muestra el mismo ajuste que `/training-adjustment`.
- En `useCycleAdjustment`, validar que `mode`, `cycle_confidence`, `multipliers` y `rest_extra_seconds` se reflejen en la UI.
- Si `mode = symptoms`, no mostrar fase estimada.

### 3) Swaps

- Archivo: scripts/test-menstrual-cycle-swaps.mjs
- Run: `node scripts/test-menstrual-cycle-swaps.mjs`
- Requiere DB y datos en app.exercise_tags.
- Flujos:
  - Ejercicio impact_level 3 -> swap a impact<=1 si pain>=2.
  - Ejercicio axial_load_level 3 -> swap axial<=1-2 si pain>=2.
  - joint_laxity_risk + ovulacion -> limitar cod_level<=1.
  - Si faltan tags de riesgo: no swap, solo ajuste conservador + nota.

### 4) Autoajuste y deload

- Archivo: scripts/test-menstrual-cycle-deload.mjs
- Run: `node scripts/test-menstrual-cycle-deload.mjs`
- Requiere: migracion `20260203_menstrual_auto_adjust.sql` aplicada (tablas `menstrual_pattern_metrics` y `menstrual_deload_state`).
- Flujos:
  - pain_next_day>=7 en 2/3 sesiones -> baja volumen + refuerzo swap.
  - session_quality<=4 en 2/3 -> baja intensidad + +15s descanso.
  - Ambas -> mini-deload 1 semana.

### 5) Runner total

- Archivo: scripts/run-menstrual-cycle-v3-tests.mjs
- Run: `node scripts/run-menstrual-cycle-v3-tests.mjs`
- Ejecuta todos los anteriores con salida resumida.

## Casos de prueba (desde spec v3)

| ID  | Inputs clave                                               | Esperado                                     |
| --- | ---------------------------------------------------------- | -------------------------------------------- |
| T1  | none, confidence high, folicular, severidad 0              | Modo fase. Sin ajustes.                      |
| T2  | none, confidence high, lutea tardia, severidad 1           | Volumen -~5%, descanso +15-30s.              |
| T3  | none, confidence medium, ovulacion, joint_laxity_risk=true | Limitar cod_level<=1.                        |
| T4  | combined, severidad 0                                      | Modo sintomas. No fases.                     |
| T5  | variacion >=8, severidad 2                                 | Modo sintomas. Volumen ~-10%, descanso +30s. |
| T6  | dolor 3, impact 3, axial 2                                 | Swap obligatorio a impact<=1 y axial<=1-2.   |
| T7  | sueno 3, severidad 3                                       | Ajuste fuerte, descanso +60s.                |
| T8  | pain_next_day 8 repetido + quality 3 repetido              | Mini-deload 1 semana.                        |

## Checklist de cierre

- [x] Unit tests del motor (OK)
- [x] Integration API (OK)
- [x] Swaps (OK)
- [x] Autoajuste/deload (OK)
- [x] Evidencias pegadas en SEGUIMIENTO_V3.md

## Ejecucion 03.02.2026 (local)

- `node --input-type=module -e "import dotenv from 'dotenv'; dotenv.config(); dotenv.config({ path: 'backend/.env', override: false }); await import('./scripts/test-menstrual-cycle-db.mjs');"` -> OK
- `node --test backend/tests/menstrualCycleEngine.test.js` -> OK (10/10)
- `node --input-type=module -e "import dotenv from 'dotenv'; dotenv.config(); dotenv.config({ path: 'backend/.env', override: false }); await import('./scripts/test-menstrual-cycle-api.mjs');"` -> OK
- `node scripts/test-menstrual-cycle-swaps.mjs` -> OK (rollback)
- `node scripts/test-menstrual-cycle-deload.mjs` -> OK (rollback)
