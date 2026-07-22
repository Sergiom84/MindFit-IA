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

Ver sección al final tras confirmación de Alcance (A por defecto). El renombrado es de **identificadores internos** (directorios, ficheros, símbolos JS, comentarios/logs), sin tocar endpoints, `name` cableado, valor persistido ni objetos de BD.

_(Pendiente de completar tras cierre de Fase 1 y confirmación de Alcance.)_
