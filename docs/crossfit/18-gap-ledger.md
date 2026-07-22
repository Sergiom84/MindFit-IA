# Gap ledger de la continuacion correctiva

| Deficit exigido                      | Evidencia de cierre                                                                    | Estado residual                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Fuentes de programadores reconocidos | doc 01: CrossFit Training, Castro, Hinshaw, Fitzgerald/OPEX, Bergeron, Gymnastics, BWL | revision humana de interpretacion                |
| Fuentes cientificas correctas        | doc 01 corrige PMID, excluye retractado, describe diseno/limites                       | evidencia futura puede actualizar ruleset        |
| Marca/licencia                       | doc 01 + default neutral                                                               | decision/legal review                            |
| Niveles objetivos                    | doc 02 + niveles CSV                                                                   | umbrales requieren coach validation              |
| Asimetrias/confianza/retorno         | doc 02 + `classification/levelModel.js`                                                | validación humana de umbrales                    |
| Programacion separada                | docs 11/12/13 + bloques 8/10/12 testeados                                              | muestra humana                                   |
| WOD formal                           | doc 14 + WOD CSV                                                                       | calibrar p75 con datos propios                   |
| Repeticion/interferencia             | doc 14 + invariantes + gate 30.000                                                     | E2E/persistencia futura                          |
| Catalogo 120 fila a fila             | audit CSV 120/120                                                                      | BD no modificada                                 |
| Canonico completo y altas            | canonical CSV + reference JSON + operations CSV                                        | editorial/media/human review                     |
| Benchmarks separados                 | docs 04/14                                                                             | entidad futura                                   |
| Generador determinista               | doc 15 + composer/validator + 30.000 regeneraciones idénticas                          | integración de producto pendiente                |
| Reason codes huérfanos               | 18 códigos usados por invariantes/nutrición añadidos al catálogo                       | cerrado: 63 totales; test de paridad obligatorio |
| Autorreg profesional                 | doc 16 + reducer/result service + SQL                                                  | lógica cerrada; migración/RLS/E2E pendientes     |
| Seguridad por patron/sintoma         | doc 07 + safety CSV                                                                    | contrato clinico/RLS/human review                |
| Embarazo/posparto                    | bloqueo funcional y contrato definido                                                  | BLOQUEADO_CLINICAL_PROFILE_CONTRACT              |
| Nutricion por nivel/objetivo/carga   | doc 03 + nutrition/load CSV                                                            | desarrollo flag off + dietista + shadow          |
| Todos los flujos                     | docs 05/17 + feedback plan/single-day                                                  | generación/persistencia/E2E aún parciales        |
| QA/oraculos/perfiles                 | doc 09 + 32 perfiles + invariantes; gate puro 30.000 verde                             | BD/E2E/humanos pendientes                        |
| Roadmap/DoR/DoD/rollback             | doc 08 + checkpoints                                                                   | implementación iniciada                          |
| Etiquetas de gate                    | maestro, docs 08/10 y operaciones                                                      | Fase 0 desbloqueada; rollout aún bloqueado       |
| PDF maestro                          | PDF consolidado, extraccion y render de todas las paginas                              | verificacion visual repetida tras ultima edicion |

## Resumen por etiqueta

- `LISTO_AHORA_DOCUMENTAL`: fundamento, niveles, programas, WOD, contratos, matrices, roadmap y oraculos.
- `FASE_0_COMPARTIDA_DESBLOQUEADA_PARA_DESARROLLO`: contratos compartidos disponibles en `origin/main@e7f5711`.
- `PENDIENTE_GATE_LOAD_SHADOW`: training load, cierre/outbox y nutrición se implementan con flags apagados hasta QA/métricas/aprobación.
- `IMPLEMENTACION_EN_RAMA`: código, flags y tests v2 en `codex/crossfit-profesional-v2`.
- `REQUIERE_MIGRACION_AUTORIZADA`: catalogo normalizado, RLS, resultados/eventos y backfill.
- `REQUIERE_VALIDACION_HUMANA`: deporte, nutricion, seguridad, media y muestra final.

## Criterio honesto

Los déficits de decisión deportiva/funcional quedan cerrados a nivel de especificación con defaults conservadores y la implementación está iniciada. No queda cerrada la eficacia ni seguridad real del software: exige QA y profesionales. La rama es apta para desarrollar, no para activar producción.
