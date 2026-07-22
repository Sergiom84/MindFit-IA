# Matriz de trazabilidad de implementación

Estado inicial tras el baseline. Se actualiza en cada subfase; `PENDIENTE_QA_BD`
significa que existe o se prepara prueba, pero este equipo carece de PostgreSQL
efímero y nunca debe sustituirse por producción.

| Requisito                          | Especificación                | Código objetivo                             | Test/oráculo                     | Estado                     |
| ---------------------------------- | ----------------------------- | ------------------------------------------- | -------------------------------- | -------------------------- |
| Flags independientes off           | docs 08/15                    | `backend/services/crossfit/featureFlags.js` | contract flags                   | EN_PROGRESO                |
| Plan/session/WOD/result/autoreg v2 | docs 15/16                    | `backend/services/crossfit/contracts/`      | strict + legacy fixtures         | EN_PROGRESO                |
| Reason codes centralizados         | data/reason_codes.csv         | `backend/services/crossfit/reasonCodes.js`  | paridad 45/45                    | EN_PROGRESO                |
| Catálogo canónico 92               | docs 04 + data                | repository + migración aditiva              | 92/92, alias, FK, RLS            | PENDIENTE                  |
| Safety antes de composer           | docs 07                       | `backend/services/crossfit/safety/`         | stop/block/substitute table      | PENDIENTE                  |
| Level-model/2.0.0                  | docs 02/11-13                 | `backend/services/crossfit/classification/` | boundary/asimetría/retorno       | PENDIENTE                  |
| Bloques 8/10/12                    | docs 11/12/13                 | `backend/services/crossfit/programming/`    | cuotas/deload/reeval             | PENDIENTE                  |
| Composer determinista              | docs 14/15                    | `backend/services/crossfit/generator/`      | seed, score, fallback            | PENDIENTE                  |
| 44 invariantes                     | data/generator_invariants.csv | validators por ámbito                       | 44/44 + statistical              | PENDIENTE                  |
| 30.000 planes mínimos              | docs 09/15                    | suite estadística                           | cero hard violation              | PENDIENTE                  |
| Single-day y plan                  | docs 05/17                    | adaptadores existentes                      | contract/integration/E2E         | PENDIENTE                  |
| Resultado WOD v2                   | docs 16/17                    | route/service/migration                     | idempotencia/out-of-order        | PENDIENTE                  |
| Autorregulación 7 estados          | docs 16                       | reducer + snapshot                          | tabla de transición/prioridad    | PENDIENTE                  |
| Planned/actual training-load       | docs 03/15                    | adaptador shared v1                         | valid >=99 %, dup=0              | PENDIENTE_FLAG_OFF         |
| Nutrición D0/D1/D2                 | docs 03 + mapping CSV         | motor canónico + adaptador                  | shadow/paridad/deriva            | PENDIENTE_FLAG_OFF         |
| Flujos completos                   | docs 05/17                    | front-back-BD                               | matriz E2E móvil/escritorio      | PENDIENTE                  |
| Migración y RLS                    | docs 04/08                    | SQL aditivo idempotente                     | up/status/idempotencia/isolation | PENDIENTE_QA_BD            |
| Regresión ajena                    | guardas repositorio           | sin cambios en motores ajenos               | unit/E2E/golden                  | PENDIENTE                  |
| Validación humana/legal            | docs 01/07/09/10              | gate preproducción                          | acta externa                     | REQUIERE_VALIDACION_HUMANA |
