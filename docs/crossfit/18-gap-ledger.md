# Gap ledger de la continuacion correctiva

| Deficit exigido                      | Evidencia de cierre                                                                    | Estado residual                              |
| ------------------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------- |
| Fuentes de programadores reconocidos | doc 01: CrossFit Training, Castro, Hinshaw, Fitzgerald/OPEX, Bergeron, Gymnastics, BWL | revision humana de interpretacion            |
| Fuentes cientificas correctas        | doc 01 corrige PMID, excluye retractado, describe diseno/limites                       | evidencia futura puede actualizar ruleset    |
| Marca/licencia                       | doc 01 + default neutral                                                               | decision/legal review                        |
| Niveles objetivos                    | doc 02 + niveles CSV                                                                   | umbrales requieren coach validation          |
| Asimetrias/confianza/retorno         | doc 02 + `classification/levelModel.js`                                                | validación humana de umbrales                |
| UI y persistencia de evaluacion      | tarjeta 8D + capabilities + ledger/revision admin + RLS/E2E verde                      | firma de entrenador preproducción            |
| Programacion separada                | docs 11/12/13 + bloques 8/10/12 testeados                                              | muestra humana                               |
| WOD formal                           | doc 14 + WOD CSV                                                                       | calibrar p75 con datos propios               |
| Repeticion/interferencia             | doc 14 + invariantes + gate 30.000 + E2E persistente                                   | calibración con datos reales                 |
| Catalogo 120 fila a fila             | audit CSV 120/120                                                                      | BD no modificada                             |
| Canonico completo y altas            | canonical CSV + reference JSON + operations CSV                                        | editorial/media/human review                 |
| Benchmarks separados                 | docs 04/14                                                                             | entidad futura                               |
| Generador determinista               | doc 15 + composer/validator + 30.000 regeneraciones idénticas + E2E                    | flag productivo apagado                      |
| Reason codes huérfanos               | catálogo código/CSV con invariantes, seguridad, regeneración y cierre terminal         | cerrado: 70 totales; paridad automatizada    |
| Autorreg profesional                 | doc 16 + reducer/result service + SQL + integración/RLS/E2E                            | migración productiva no autorizada           |
| Seguridad por patron/sintoma         | doc 07 + safety CSV                                                                    | contrato clinico/RLS/human review            |
| Embarazo/posparto                    | bloqueo funcional y contrato definido                                                  | BLOQUEADO_CLINICAL_PROFILE_CONTRACT          |
| Nutricion por nivel/objetivo/carga   | doc 03 + adapter 3x4x3 + D0/D1/D2 y métricas E2E shadow                                | flag off; shadow real/dietista pendientes    |
| Flujos plan/single-day/player        | docs 05/17 + adaptadores + cierre terminal + 16 E2E desktop/móvil                      | multi-device/notificaciones fuera de alcance |
| Regeneración de draft                | revisión inmutable, transacción, replay, índice y PostgreSQL efímero                   | migración productiva no autorizada           |
| QA/oraculos/perfiles                 | doc 09 + 32/32 ejecutables + 30.000 planes + 26 integración + 16 E2E                   | humanos y rollout pendientes                 |
| QA efímero fail-closed               | run 30050111128: seis jobs verdes, PostgreSQL 17, RLS y desktop/móvil                  | cerrado técnicamente                         |
| Roadmap/DoR/DoD/rollback             | docs 08/19 + checkpoints                                                               | runbook productivo preparado                 |
| Etiquetas de gate                    | maestro, docs 08/10 y operaciones                                                      | Fase 0 desbloqueada; rollout aún bloqueado   |
| GitGuardian                          | check autenticado: 1 credencial histórica en `5b2c639`; el head elimina el valor       | BLOQUEADO_ROTACION_Y_REMEDIACION             |
| PDF maestro                          | PDF consolidado, extracción y render visual                                            | regenerar tras este cierre                   |

## Resumen por etiqueta

- `LISTO_AHORA_DOCUMENTAL`: fundamento, niveles, programas, WOD, contratos, matrices, roadmap y oraculos.
- `FASE_0_COMPARTIDA_DESBLOQUEADA_PARA_DESARROLLO`: contratos disponibles
  desde `e7f5711`; rama sincronizada mediante merge con `origin/main@6493600`.
- `COMPLETADO_QA_AISLADA_FLAG_OFF`: código, migraciones, RLS, E2E, training
  load y nutrición shadow pasan en el run `30050111128`.
- `PENDIENTE_GATE_LOAD_SHADOW_PRODUCTIVO`: recopilar muestra QA/rollout real
  hasta >=99 % carga válida, <1 % degradada justificada y cero duplicados/drift.
- `BLOQUEADO_ROTACION_Y_REMEDIACION`: GitGuardian está autenticado y falla por
  una credencial PostgreSQL histórica. El valor se retiró del head sin exponerlo,
  pero debe rotarse y resolverse el incidente antes de repetir el check.
- `IMPLEMENTACION_EN_RAMA`: código, flags y tests v2 en `codex/crossfit-profesional-v2`.
- `REQUIERE_MIGRACION_AUTORIZADA`: catalogo normalizado, RLS, resultados/eventos y backfill.
- `REQUIERE_VALIDACION_HUMANA`: deporte, nutricion, seguridad, media y muestra final.

## Criterio honesto

Los déficits de decisión deportiva/funcional y QA técnica aislada quedan
cerrados. Contratos, motor, autorregulación, training load, nutrición y flujos
principales están implementados bajo flags apagados. No queda cerrada la
eficacia deportiva/clínica, el shadow de rollout, la remediación de la credencial
histórica ni la activación productiva. La rama supera los gates técnicos, pero no
es apta para ready/merge mientras GitGuardian siga rojo; tampoco para producción.
