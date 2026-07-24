# Matriz de trazabilidad de implementación

Corte vigente tras el run aislado `30050111128`. PostgreSQL/RLS/E2E verdes
significa QA desechable; nunca equivale a migración o activación productiva.

| Requisito                          | Especificación                | Código objetivo                             | Test/oráculo                              | Estado                     |
| ---------------------------------- | ----------------------------- | ------------------------------------------- | ----------------------------------------- | -------------------------- |
| Flags independientes off           | docs 08/15                    | `backend/services/crossfit/featureFlags.js` | contract flags                            | COMPLETADO                 |
| Plan/session/WOD/result/autoreg v2 | docs 15/16                    | `backend/services/crossfit/contracts/`      | strict + legacy fixtures                  | COMPLETADO                 |
| Reason codes centralizados         | data/reason_codes.csv         | `backend/services/crossfit/reasonCodes.js`  | paridad 70/70; cero huérfanos             | COMPLETADO                 |
| Catálogo canónico 92               | docs 04 + data                | repository + migración aditiva              | 92/92 + 104 variants + 236 edges; 120/120 | COMPLETADO_QA_BD           |
| Safety antes de composer           | docs 07                       | `backend/services/crossfit/safety/`         | prioridades stop/block/substitute         | COMPLETADO                 |
| Level-model/2.0.0                  | docs 02/11-13                 | `backend/services/crossfit/classification/` | 11/11 boundary/asimetría/retorno          | COMPLETADO_TECNICO         |
| Evaluación objetiva y confianza    | docs 02/05/17                 | assessment service/UI/ledger/admin          | 32 focalizados + RLS/UI E2E               | COMPLETADO_QA_BD_E2E       |
| Bloques 8/10/12                    | docs 11/12/13                 | `backend/services/crossfit/programming/`    | 12/12 cuotas/deload/reeval                | COMPLETADO_TECNICO         |
| Composer determinista              | docs 14/15                    | `backend/services/crossfit/generator/`      | seed, score, fallback y 500 nodos         | COMPLETADO_TECNICO         |
| 44 invariantes                     | data/generator_invariants.csv | validators por ámbito                       | paridad 44/44 + negativos                 | COMPLETADO_TECNICO         |
| 30.000 planes mínimos              | docs 09/15                    | runner estadístico paralelo                 | 30k + 30k regen; cero hard violation      | COMPLETADO_TECNICO         |
| Single-day y plan                  | docs 05/17                    | adaptadores existentes                      | tres niveles + single-day E2E             | COMPLETADO_QA_E2E          |
| Resultado WOD v2                   | docs 16/17                    | result service + migración preparada        | terminales/atomicidad/idempotencia/outbox | COMPLETADO_QA_BD_E2E       |
| Autorregulación 7 estados          | docs 16                       | reducer + ledger + snapshot                 | prioridad/histéresis/out-of-order + RLS   | COMPLETADO_QA_BD           |
| Planned/actual training-load       | docs 03/15                    | adapter + plan/result/outbox                | strict, plan/day, D0 cancel y métricas    | COMPLETADO_FLAG_OFF        |
| Nutrición D0/D1/D2                 | docs 03 + mapping CSV         | motor/adaptador + presentación/compras V2   | 3x4x3 + D0/D1/D2 E2E shadow               | COMPLETADO_QA_SHADOW       |
| Calendario y metadata canónica     | docs 05/17                    | schedule adapter + metadata hydrator        | bloque 8/10/12 + day_id E2E               | COMPLETADO_QA_BD_E2E       |
| WOD player y feedback              | docs 14/16/17                 | player + draft owner-bound + result adapter | reload, terminales, escala, a11y          | COMPLETADO_QA_E2E          |
| Runtime y sustitucion validada     | docs 07/14/17                 | runtime service + ledger + API aislada      | éxito/replay y rechazo fail-closed E2E    | COMPLETADO_QA_BD_E2E       |
| Regeneración inmutable de draft    | docs 05/15/17                 | product adapter + índice parcial            | transacción, replay, colisión, BD         | COMPLETADO_QA_BD           |
| Flujos principales                 | docs 05/17/19                 | front-back-BD                               | 480 unit; 26 integración; 16 E2E          | COMPLETADO_QA_AISLADA      |
| Migración y RLS                    | docs 02/04/08/16/17           | assessment/catalog/result/runtime ledgers   | seis migraciones x2 + cross-user          | COMPLETADO_QA_NO_PROD      |
| Regresión ajena                    | guardas repositorio           | sin cambios en motores ajenos               | suite general + a11y/móvil verdes         | COMPLETADO_QA              |
| QA fail-closed                     | docs 09/19                    | CI + localQaGuard + Playwright              | run 30050111128, seis jobs verdes         | COMPLETADO_QA_AISLADA      |
| Secretos GitGuardian               | docs 19                       | historia limpia desde `main@c233ceb`        | PR #67 verde; repetir en PR sustituto      | PENDIENTE_RECHECK_PR       |
| Validación humana/legal            | docs 01/07/09/10              | gate preproducción                          | acta externa                              | REQUIERE_VALIDACION_HUMANA |
