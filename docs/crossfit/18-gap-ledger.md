# Gap ledger de la continuacion correctiva

| Deficit exigido                      | Evidencia de cierre                                                                    | Estado residual                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Fuentes de programadores reconocidos | doc 01: CrossFit Training, Castro, Hinshaw, Fitzgerald/OPEX, Bergeron, Gymnastics, BWL | revision humana de interpretacion                |
| Fuentes cientificas correctas        | doc 01 corrige PMID, excluye retractado, describe diseno/limites                       | evidencia futura puede actualizar ruleset        |
| Marca/licencia                       | doc 01 + default neutral                                                               | decision/legal review                            |
| Niveles objetivos                    | doc 02 + niveles CSV                                                                   | umbrales requieren coach validation              |
| Asimetrias/confianza/retorno         | doc 02 + `classification/levelModel.js`                                                | validación humana de umbrales                    |
| UI y persistencia de evaluacion      | tarjeta 8D + capabilities + ledger/revision admin                                      | BD/RLS/E2E y firma de entrenador                 |
| Programacion separada                | docs 11/12/13 + bloques 8/10/12 testeados                                              | muestra humana                                   |
| WOD formal                           | doc 14 + WOD CSV                                                                       | calibrar p75 con datos propios                   |
| Repeticion/interferencia             | doc 14 + invariantes + gate 30.000                                                     | E2E/persistencia futura                          |
| Catalogo 120 fila a fila             | audit CSV 120/120                                                                      | BD no modificada                                 |
| Canonico completo y altas            | canonical CSV + reference JSON + operations CSV                                        | editorial/media/human review                     |
| Benchmarks separados                 | docs 04/14                                                                             | entidad futura                                   |
| Generador determinista               | doc 15 + composer/validator + 30.000 regeneraciones idénticas                          | integrado bajo flag; E2E pendiente               |
| Reason codes huérfanos               | 18 códigos usados por invariantes/nutrición añadidos al catálogo                       | cerrado: 63 totales; test de paridad obligatorio |
| Autorreg profesional                 | doc 16 + reducer/result service + SQL                                                  | lógica cerrada; migración/RLS/E2E pendientes     |
| Seguridad por patron/sintoma         | doc 07 + safety CSV                                                                    | contrato clinico/RLS/human review                |
| Embarazo/posparto                    | bloqueo funcional y contrato definido                                                  | BLOQUEADO_CLINICAL_PROFILE_CONTRACT              |
| Nutricion por nivel/objetivo/carga   | doc 03 + adapter/matriz 3x4x3, plan/day, safety y métricas                             | código flag off; BD/shadow/dietista pendientes   |
| Flujos plan/single-day/player        | docs 05/17 + adaptadores + 51 pruebas focalizadas                                      | código cerrado; BD/E2E/offline pendientes        |
| QA/oraculos/perfiles                 | doc 09 + 32 perfiles + invariantes; gate puro 30.000 verde                             | BD/E2E/humanos pendientes                        |
| QA efímero fail-closed               | PostgreSQL 17/CI, RLS cross-user y 10 E2E preparados; 355/355 unit verdes              | ejecución CI aún pendiente                       |
| Roadmap/DoR/DoD/rollback             | doc 08 + checkpoints                                                                   | implementación iniciada                          |
| Etiquetas de gate                    | maestro, docs 08/10 y operaciones                                                      | Fase 0 desbloqueada; rollout aún bloqueado       |
| PDF maestro                          | PDF consolidado, extraccion y render de todas las paginas                              | verificacion visual repetida tras ultima edicion |

## Resumen por etiqueta

- `LISTO_AHORA_DOCUMENTAL`: fundamento, niveles, programas, WOD, contratos, matrices, roadmap y oraculos.
- `FASE_0_COMPARTIDA_DESBLOQUEADA_PARA_DESARROLLO`: contratos compartidos disponibles en `origin/main@e7f5711`.
- `COMPLETADO_TECNICO_FLAG_OFF`: training load, cierre/outbox, nutrición y métricas están implementados y pasan unit/contract; no equivale a shadow real.
- `PENDIENTE_GATE_LOAD_SHADOW`: ejecutar PostgreSQL efímero y shadow QA hasta lograr >=99 % carga válida, <1 % degradada justificada y cero duplicados/drift.
- `IMPLEMENTACION_EN_RAMA`: código, flags y tests v2 en `codex/crossfit-profesional-v2`.
- `REQUIERE_MIGRACION_AUTORIZADA`: catalogo normalizado, RLS, resultados/eventos y backfill.
- `REQUIERE_VALIDACION_HUMANA`: deporte, nutricion, seguridad, media y muestra final.

## Criterio honesto

Los déficits de decisión deportiva/funcional quedan cerrados a nivel de especificación. Contratos, motor, autorregulación, training load, nutrición y flujo técnico principal están implementados bajo flags apagados. No queda cerrada la eficacia ni seguridad real del software: exige BD aislada, E2E, shadow y profesionales. La rama sigue siendo apta para desarrollar y revisar, no para activar producción.
