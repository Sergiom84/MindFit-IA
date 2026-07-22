# Matriz de trazabilidad de implementación

Estado inicial tras el baseline. Se actualiza en cada subfase; `PENDIENTE_QA_BD`
significa que existe o se prepara prueba, pero este equipo carece de PostgreSQL
efímero y nunca debe sustituirse por producción.

| Requisito                          | Especificación                | Código objetivo                             | Test/oráculo                                | Estado                     |
| ---------------------------------- | ----------------------------- | ------------------------------------------- | ------------------------------------------- | -------------------------- |
| Flags independientes off           | docs 08/15                    | `backend/services/crossfit/featureFlags.js` | contract flags                              | COMPLETADO                 |
| Plan/session/WOD/result/autoreg v2 | docs 15/16                    | `backend/services/crossfit/contracts/`      | strict + legacy fixtures                    | COMPLETADO                 |
| Reason codes centralizados         | data/reason_codes.csv         | `backend/services/crossfit/reasonCodes.js`  | paridad 64/64; cero huérfanos               | COMPLETADO                 |
| Catálogo canónico 92               | docs 04 + data                | repository + migración aditiva              | 92/92 + 104 variants + 236 edges; 120/120   | COMPLETADO_GATE_BD         |
| Safety antes de composer           | docs 07                       | `backend/services/crossfit/safety/`         | prioridades stop/block/substitute           | COMPLETADO                 |
| Level-model/2.0.0                  | docs 02/11-13                 | `backend/services/crossfit/classification/` | 11/11 boundary/asimetría/retorno            | COMPLETADO_TECNICO         |
| Bloques 8/10/12                    | docs 11/12/13                 | `backend/services/crossfit/programming/`    | 12/12 cuotas/deload/reeval                  | COMPLETADO_TECNICO         |
| Composer determinista              | docs 14/15                    | `backend/services/crossfit/generator/`      | seed, score, fallback y 500 nodos           | COMPLETADO_TECNICO         |
| 44 invariantes                     | data/generator_invariants.csv | validators por ámbito                       | paridad 44/44 + negativos                   | COMPLETADO_TECNICO         |
| 30.000 planes mínimos              | docs 09/15                    | runner estadístico paralelo                 | 30k + 30k regen; cero hard violation        | COMPLETADO_TECNICO         |
| Single-day y plan                  | docs 05/17                    | adaptadores existentes                      | composer/persistencia 51/51; E2E pendiente  | COMPLETADO_GATE_E2E        |
| Resultado WOD v2                   | docs 16/17                    | result service + migración preparada        | strict/idempotencia/ownership/outbox        | COMPLETADO_GATE_BD         |
| Autorregulación 7 estados          | docs 16                       | reducer + ledger + snapshot                 | prioridad/histéresis/out-of-order           | COMPLETADO_GATE_BD         |
| Planned/actual training-load       | docs 03/15                    | adapter + plan/result/outbox                | strict, plan/day y flags 49/49              | COMPLETADO_FLAG_OFF        |
| Nutrición D0/D1/D2                 | docs 03 + mapping CSV         | motor canónico + adapter CrossFit           | matriz 3x4x3, seguridad, energía y métricas | COMPLETADO_GATE_SHADOW_BD  |
| Calendario y metadata canónica     | docs 05/17                    | schedule adapter + metadata hydrator        | bloque 8/10/12, day_id, fail-closed         | COMPLETADO_GATE_BD_E2E     |
| WOD player y feedback              | docs 14/16/17                 | player + effort modal + result adapter      | formatos, cap, escalas, score y error       | COMPLETADO_GATE_E2E        |
| Flujos completos                   | docs 05/17                    | front-back-BD                               | unit/contract verdes; matriz E2E pendiente  | EN_PROGRESO_GATE_E2E       |
| Migración y RLS                    | docs 04/08/16                 | catálogo + results/autoreg SQL              | estático verde; up/status/RLS en CI         | PENDIENTE_QA_BD            |
| Regresión ajena                    | guardas repositorio           | sin cambios en motores ajenos               | 336/336 unit; E2E/golden UI pendiente       | PARCIAL_GATE_E2E           |
| Validación humana/legal            | docs 01/07/09/10              | gate preproducción                          | acta externa                                | REQUIERE_VALIDACION_HUMANA |
