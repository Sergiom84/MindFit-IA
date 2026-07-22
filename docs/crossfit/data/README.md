# Artefactos de datos CrossFit

Todos los ficheros son especificaciones documentales. No son seeds ni migraciones ejecutables.

| Fichero                               | Contenido                                                                      | Filas de datos |
| ------------------------------------- | ------------------------------------------------------------------------------ | -------------- |
| `catalogo_crossfit_auditoria_120.csv` | auditoria individual de la BD viva                                             | 120            |
| `catalogo_crossfit_snapshot_120.csv`  | snapshot read-only de metadatos e instrucciones reales, con controles saneados | 120            |
| `catalogo_canonico_propuesto.csv`     | movimientos/variantes core y altas                                             | 92             |
| `catalogo_reference_sets.json`        | tecnica, cues, errores, contraindicaciones y progresiones                      | n/a            |
| `catalogo_operaciones_propuestas.csv` | altas/merges/backfill/deprecacion/rollback                                     | 21             |
| `niveles_evaluacion.csv`              | tests objetivos por dimension                                                  | 22             |
| `wod_format_rules.csv`                | dosis por formato/nivel                                                        | 24             |
| `generator_invariants.csv`            | invariantes por capa                                                           | 44             |
| `reason_codes.csv`                    | taxonomia de decisiones                                                        | 45             |
| `safety_rules.csv`                    | sintomas, fases y acciones                                                     | 28             |
| `nutrition_matrix.csv`                | nivel/objetivo/carga                                                           | 22             |
| `training_load_mapping.csv`           | sesion a D0/D1/D2                                                              | 12             |
| `qa_synthetic_profiles.csv`           | perfiles y oraculos                                                            | 32             |

Validacion local requerida: parser CSV/JSON, anchura uniforme, IDs unicos, referencias resolubles y conteos declarados. Cualquier SQL futuro se crea en rama y se revisa antes de autorizar su ejecucion.
