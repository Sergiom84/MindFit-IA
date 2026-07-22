# Retiro del motor "Hipertrofia" legacy + renombrado HipertrofiaV2 → Hipertrofia

Rama: `chore/retire-hipertrofia-legacy` (desde `main`). **No se mergea a main**: queda PR para revisión de Sergio.

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
