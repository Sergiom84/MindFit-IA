# Retiro del motor "Hipertrofia" legacy + renombrado HipertrofiaV2 → Hipertrofia

Fases 1-2: rama `chore/retire-hipertrofia-legacy`, **fusionada a `main` como PR #62** (commit `3e09559`, 2026-07-22).
Fase 3 (identidad canónica): rama `refactor/hipertrofia-identidad-canonica` desde `main` (3e09559); **no se mergea sin autorización de Pablo** (ver §Fase 3).

Este documento registra el inventario, las decisiones (con `fichero:línea`) y la evidencia de las dos fases.

---

## Fase 1 — Retiro del motor Hipertrofia legacy (datos)

### Contexto verificado

- El motor Hipertrofia legacy **ya estaba retirado del código**: no hay servicio ni ruta dedicada, y `normalizeMethodologyId('hipertrofia')` devuelve `null`. **No hay ficheros de código muerto que borrar.**
- Lo único que quedaba eran **filas históricas** en `app.methodology_plans` con `methodology_type = 'hipertrofia'` (9 filas conocidas: 0 activas, `plan_data` vacío).

### Qué se conserva (NO tocar)

| Elemento                                   | Fichero:línea                                                                 | Motivo                                                                                                                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entrada `gimnasio` del registry            | `backend/services/routineGeneration/methodologies/methodologyRegistry.js:160` | **Fallback genérico VIVO.** Default en `userProfileContract.js`; objetivos `ganar_masa`/`ganar_peso`/`tonificar` → `gimnasio`; endpoint `/ai/gym-routine`. Borrarla rompe la generación de rutinas. |
| Alias de lectura `hipertrofia: "gimnasio"` | `backend/services/userProfileContract.js:45`                                  | Alias de compatibilidad de lectura. Se deja intacto.                                                                                                                                                |
| `disciplina: 'hipertrofia'`                | `backend/services/routineGeneration/GymRoutineService.js:215`                 | Catálogo vivo (`app.ejercicios`). No es el motor legacy.                                                                                                                                            |
| Literal `'HipertrofiaV2_MindFeed'`         | 33 ocurrencias                                                                | `methodology_type` persistido de 99 planes (29 activos). Motor vivo.                                                                                                                                |

### Qué se borra

- Las **9 filas** de `app.methodology_plans WHERE methodology_type = 'hipertrofia'` (match **exacto**, nunca `HipertrofiaV2_MindFeed` ni `gimnasio`).
- Borrado **AUTORIZADO por el dueño**. La migración:
  - Aborta con `RAISE EXCEPTION` si hubiera algún plan legacy en estado `active` (guarda de seguridad).
  - Copia las filas a `app.methodology_plans_legacy_hipertrofia_bkp` **antes** de borrar (backup en servidor para auditoría).
  - Es **idempotente**.
- **Tablas hijas**: sus FKs son `ON DELETE CASCADE` / `SET NULL`, por lo que no requieren limpieza manual. Además, se exportan a JSON de evidencia antes del borrado.

### Artefactos Fase 1

- `backend/scripts/export-hipertrofia-legacy-evidence.mjs` — export **SOLO LECTURA** de las filas legacy (padre + hijas) a `backend/evidence/hipertrofia-legacy-plans-<timestamp>.json`. Ejecutar **antes** del borrado.
- `backend/migrations/20260722_retire_hipertrofia_legacy_plans.sql` — migración idempotente (backup + delete), aplicada con el runner del ledger (`npm run migrate:up`).
- `backend/evidence/hipertrofia-legacy-plans-*.json` — evidencia exportada (adjunta al commit).

### Ambigüedad reportada (decisión de Sergio)

- **`backend/services/userProfileContract.js:46` — `hipertrofiav2: "gimnasio"`**
  Este alias mapea `hipertrofiav2` (minúsculas, sin sufijo `_MindFeed`) al fallback `gimnasio`, no al motor HipertrofiaV2 vivo. Es ambiguo si es intencional (compat de lectura de valores legacy en minúsculas) o un resto que debería apuntar al motor vivo. **NO se toca**: se deja para decisión de Sergio.

---

## Fase 2 — Renombrado HipertrofiaV2 → Hipertrofia (identificadores internos)

**Alcance A confirmado por Sergio** (2026-07-22). Renombrado de **identificadores internos**, sin tocar endpoints, `name` cableado, valor persistido ni objetos de BD.

### Renombrados aplicados

**Directorios / ficheros (`git mv`):**

| Antes                                                      | Después                                                  |
| ---------------------------------------------------------- | -------------------------------------------------------- |
| `backend/services/hipertrofiaV2/`                          | `backend/services/hipertrofia/`                          |
| `src/components/HipertrofiaV2/`                            | `src/components/Hipertrofia/`                            |
| `src/components/Methodologie/methodologies/HipertrofiaV2/` | `src/components/Methodologie/methodologies/Hipertrofia/` |
| `.../HipertrofiaV2/HipertrofiaV2ManualCard.jsx`            | `.../Hipertrofia/HipertrofiaManualCard.jsx`              |

**Imports actualizados:** todas las rutas de import que apuntaban a esos directorios (backend `hipertrofiaV2/` → `hipertrofia/`; frontend `HipertrofiaV2/` → `Hipertrofia/`).

**Símbolos JS renombrados (código interno, no cruzan el contrato):**

| Antes                                         | Después                           | Fichero                                                                                |
| --------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------- |
| `HipertrofiaV2ManualCard` (componente/export) | `HipertrofiaManualCard`           | `.../Hipertrofia/HipertrofiaManualCard.jsx`, `MethodologiesModalLayer.jsx`             |
| `handleHipertrofiaV2ManualGenerate`           | `handleHipertrofiaManualGenerate` | `useManualPlanGeneration.js`, `MethodologiesModalLayer.jsx`, `MethodologiesScreen.jsx` |
| `hipertrofiaV2Routes` (binding de import)     | `hipertrofiaRoutes`               | `backend/server.js:54,508`                                                             |

### NO tocado (contrato / persistido — verificado intacto)

- Literal `'HipertrofiaV2_MindFeed'` (18 ocurrencias en código): 0 líneas de diff lo tocan.
- `name: 'HipertrofiaV2'` (`methodologiesData.js:406`, `useManualPlanGeneration.js:108`) y todas las comparaciones `=== 'HipertrofiaV2'` / `|| 'HipertrofiaV2'` (compat de lectura).
- `id: 'hipertrofiaV2'` (`methodologiesData.js:402`) y `methodology: 'hipertrofiaV2'` (valor de routing/persistencia).
- Endpoints `/api/hipertrofiav2/*` y fichero `backend/routes/hipertrofiaV2.js` (nombre de fichero conservado: alineado con el endpoint).
- Objetos de BD `hipertrofia_v2_*` y todas las `backend/migrations/*.sql`.
- `disciplina: 'hipertrofia'` (catálogo vivo).
- Comparaciones de compat que aceptan `'HipertrofiaV2'` corto como alias de lectura (`RoutineSessionModal`, `SessionSummaryModal`, `TodayTrainingHeader`, `workoutUtils.js`): conservadas.
- Claves de modal `'hipertrofiaV2Manual'` y evento de analítica `'generate_hipertrofiav2'`: strings internos ligados al flujo `name`, conservados.

### Decisión reportada (símbolo NO renombrado, en contra del ejemplo del spec)

- **Booleanos/prop `isHypertrofiaV2` / `isHipertrofiaV2`** (`RoutineSessionModal.jsx`, `TodayTrainingTab.jsx`, `TodayTrainingModalLayer.jsx`): **NO renombrados.**
  Motivo: viven en los ficheros marcados como NO-TOCAR #5 (comparaciones de compat), el prop cruza el límite `TodayTrainingTab` ↔ `TodayTrainingModalLayer`, y el frontend **no tiene tests**. Un `build` no detecta un `ReferenceError` de variable/prop renombrada a medias → riesgo de romper el flujo "Hoy" en silencio, con beneficio puramente cosmético. Se deja para decisión explícita de Sergio.
- Comentarios/logs incidentales que citan "HipertrofiaV2" en ficheros no relacionados (`singleDay/*`, otros servicios, tests): conservados. El valor cableado sigue siendo `HipertrofiaV2`, así que esas referencias siguen siendo correctas; cambiarlas añadiría ruido sin valor (alcance mínimo).

### Verificación Fase 2

- `npm run test:backend` → **231/231**.
- `npm run build` → **OK** (warnings de circular/empty chunk preexistentes, ajenos a este cambio).
- `grep -rIn "hipertrofiaV2/" src backend --include=*.js` → **0** imports viejos.
- `grep "HipertrofiaV2_MindFeed"` → sigue presente e intacto.
- **Residual para Sergio:** revisión manual de los flujos de Hipertrofia en UI (selección, sesión de hoy, resumen). El repo no tiene tests de frontend; el build valida la resolución de imports pero no el runtime de los flujos.

---

## Fase 3 — Identidad canónica (rama `refactor/hipertrofia-identidad-canonica`)

PR de seguimiento que cierra los residuales de la Fase 2 **con red de tests**, sin tocar
`WorkoutContext.generatePlan()`, la programación deportiva, ni Calistenia/CrossFit. Nada se
migra en BD y todos los flags/emisiones nuevos quedan **desactivados**.

### Helper canónico único (contrato + tests primero)

- `backend/services/hipertrofia/identity.js` y su espejo `src/utils/hipertrofiaIdentity.js`:
  - `isHipertrofiaMethodology(value)` — allowlist CERRADA. Acepta `hipertrofia`,
    `hipertrofiaV2`, `HipertrofiaV2`, `hipertrofiav2`, `HipertrofiaV2_MindFeed` (y variantes
    con separadores/acentos). **Rechaza** `gimnasio`/`gym`/`bodybuilding`, `mindfeed` genérico
    y textos con "hipertrofia" parcial. Sustituye al regex laxo `/hipertrofia|mindfeed/i`.
  - `normalizeHipertrofiaIdentity(value)` → `'hipertrofia'` | `null`.
  - `HIPERTROFIA_PERSISTED_TYPE = 'HipertrofiaV2_MindFeed'` — literal persistido centralizado.
  - Tests: `backend/tests/hipertrofiaIdentity.test.js` (paridad backend/frontend).

### Resoluciones de residuales de la Fase 2

| Residual Fase 2                                                                        | Estado en Fase 3                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Booleanos `isHypertrofiaV2`/`isHipertrofiaV2` **NO renombrados** (§Decisión reportada) | **RESUELTO**: renombrados a `isHipertrofia` vía helper, de forma atómica padre↔hijo (`RoutineSessionModal`, `TodayTrainingTab` ↔ `TodayTrainingModalLayer`). Cubierto por el spec de fuente `tests/hipertrofia-identidad-canonica.spec.js`. |
| Alias de lectura `hipertrofia: "gimnasio"` "se deja intacto" (§Qué se conserva)        | **CORREGIDO** (Fase 4 del plan): `hipertrofia`/`hipertrofiav2` → identidad canónica `'hipertrofia'`, **nunca** gimnasio genérico. `gimnasio`/`gym`/`bodybuilding` siguen siendo gimnasio.                                                     |

### Endpoints (alias de compatibilidad)

- Ruta **canónica** `/api/hipertrofia/*` y **alias legacy** `/api/hipertrofiav2/*` montados
  sobre la **misma instancia** de router (`backend/server.js`). Verificado empíricamente: ambos
  responden `401` sin token; ruta inexistente `404`. El evento de analítica
  `generate_hipertrofiav2` se **conserva** (continuidad de métricas).

### Redirección explícita (nunca fallback silencioso a gimnasio)

- `/api/routine-generation/ai/methodology`: si la preferencia resuelve a Hipertrofia,
  devuelve **409 con `redirect`** al flujo dedicado D1-D5 en vez de generar una rutina
  genérica de gimnasio (fallo controlado). Objetivos que legítimamente recomiendan gimnasio
  (`ganar_masa_muscular`/`tonificar`/`ganar_peso`) **siguen funcionando**.

### Verificación Fase 3

- `npm run test:backend` → **243/243** (incluye 17 nuevos de identidad/separación).
- `npm run lint -- --quiet` → **0**. `npm run build` → **OK**. `git diff --check` → limpio.
- `npx playwright test tests/hipertrofia-identidad-canonica.spec.js` → **18 passed** (guards de
  fuente, 3 navegadores) + 6 skipped (E2E autenticado, **staging**, no prod).
- **Migración de BD**: NO aplicada. Plan en `docs/MIGRACION_IDENTIDAD_HIPERTROFIA_BD.md`.
- **Residual para Pablo:** ejecutar el E2E autenticado en staging; migrar los ~19 `fetch`
  del frontend a la ruta canónica de forma incremental; decidir si/ cuándo migrar el valor
  persistido y retirar aliases.
