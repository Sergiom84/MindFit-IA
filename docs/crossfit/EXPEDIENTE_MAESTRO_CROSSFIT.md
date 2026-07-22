# Expediente maestro de acondicionamiento funcional Mindfit

Version documental: `crossfit-product-spec/2.0.0`
Fecha de corte: 2026-07-22
Estado: `IMPLEMENTACION_EN_PROGRESO`
Gate externo: `FASE_0_COMPARTIDA_DESBLOQUEADA_PARA_DESARROLLO`

## Dictamen

Este paquete es la especificacion de la implementación CrossFit profesional v2 para principiante, intermedio y avanzado. Pablo confirmó el desbloqueo técnico de la **Fase 0 compartida** y el desarrollo comenzó en la rama aislada `codex/crossfit-profesional-v2` desde `origin/main@e7f5711`. La rama quedó sincronizada sin rebase con `origin/main@3e09559`, incluido el retiro de Hipertrofia legacy y el rename interno HipertrofiaV2 -> Hipertrofia. Este cambio de estado permite código, migraciones preparadas y QA aislada; no autoriza escrituras en Supabase/Render, despliegues, flags activos, push ni PR.

El nombre publico recomendado es **Acondicionamiento funcional de alta intensidad** hasta obtener revision legal o autorizacion de marca. `crossfit` puede mantenerse como identificador interno de compatibilidad durante la migracion. Elite/competicion queda expresamente fuera de la primera entrega.

## Resultado real de la preparacion

| Area                             | Estado documental                                                | Estado real de producto                                                         |
| -------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Modelo por niveles               | Cerrado con criterios multidimensionales, confianza y asimetrias | UI 8D, ledger y revisión profesional implementados; BD/E2E pendientes           |
| Programacion 2/3, 3/4 y 4/5 dias | Cerrada por nivel y bloque                                       | Bloques 8/10/12 implementados y validados                                       |
| Biblioteca WOD                   | Formatos, dosis, caps, interferencias y escalado definidos       | Composer y player v2 implementados; E2E pendiente                               |
| Catalogo                         | 120 filas auditadas y modelo canonico propuesto                  | Repositorio/importador/SQL preparados; migración no aplicada                    |
| Generador                        | Contrato, semilla, scoring, fallback e invariantes definidos     | Integrado bajo flag; 30.000 planes y regeneraciones verdes                      |
| Autorregulacion                  | Maquina de estados y prioridades definidas                       | Siete estados persistentes; migración/RLS no aplicados                          |
| Seguridad                        | Stop rules y matriz por patron/sintoma definidas                 | Evaluador previo al composer; contratos clínicos externos pendientes            |
| Nutricion                        | Algoritmo por objetivo, carga y nivel definido                   | Adapter/UI/compras V2 implementados; rollout bloqueado por BD/shadow/aprobación |
| Flujos                           | Contratos front-back-BD y errores trazados                       | Evaluación/plan/single-day/player/cierre integrados; E2E/RLS pendientes         |
| QA                               | Oraculos, perfiles y gates cuantificados                         | 400/400 backend y 30.000 gate; CI DB/RLS/E2E preparado, no ejecutado            |

## Decisiones no negociables

1. El nivel global no equivale a `Rx`, `Scaled` o `Rx+`; la escala se decide por movimiento y sesion.
2. La IA no selecciona ni prescribe fuera de los candidatos previamente validados por reglas deterministas.
3. Dolor, red flags y tecnica insegura tienen prioridad sobre adherencia, rendimiento o progresion.
4. No se usa ACWR como predictor causal ni como umbral automatico de lesion. Se observan tendencias separadas de carga de 7 y 28 dias.
5. No se prescribe un 1RM obligatorio para clasificar. Existen alternativas submaximas.
6. Embarazo/posparto y enfermedad cardiovascular sintomatica quedan bloqueados para alta intensidad hasta disponer de contrato, autorizacion y validacion profesional; la app no diagnostica.
7. Nutricion reutiliza el motor canonico de Mindfit. Nivel no determina calorias: mandan objetivo, masa, energia estimada y carga real.
8. Cada sesion futura debe enlazarse por `plan_id + day_id`, producir `training-load/v1` planificado y real, y emitir cierre por outbox.
9. No se modifica el frontend agnostico, el sistema de redireccion ni `WorkoutContext.generatePlan()`.
10. No se borra historia ni Elite; se conserva como legacy excluido del producto principal.
11. La autoevaluacion no desbloquea tecnica verificada ni avanzado. Solo el
    ultimo evento profesional server-side vigente puede elevar la confianza a alta.

## Estado de Fase 0 compartida

`FASE_0_COMPARTIDA_DESBLOQUEADA_PARA_DESARROLLO`. El baseline contiene
`training-load/v1`, identidad `plan_id + day_id`, cierre transaccional, outbox,
periodizador y métricas. La migración `20260721_backfill_mes_day_id.sql` está
registrada en Supabase con checksum coincidente; no se reescribe ni reaplica.
Persisten 29 filas históricas de calendario y 1.414 sesiones históricas sin
`day_id` según el corte compartido; son deuda compatible con fallback y no se
modifican en producción.

El desbloqueo de desarrollo no equivale a rollout. `CROSSFIT_EMITS_TRAINING_LOAD`
permanece `false` hasta superar los tests específicos de carga. Nutrición
CrossFit permanece inactiva hasta completar shadow, métricas y aprobación.

## Mapa del expediente

- [00 - Auditoria del estado real](./00-auditoria-estado-real.md)
- [01 - Fuentes y fundamento](./01-fundamento-profesional-y-fuentes.md)
- [02 - Clasificacion objetiva](./02-modelo-por-niveles.md)
- [03 - Nutricion](./03-especificacion-nutricional.md)
- [04 - Catalogo y plan de datos](./04-catalogo-y-migracion-ejercicios.md)
- [05 - Arquitectura y flujos](./05-arquitectura-e-integracion-flujos.md)
- [06 - Generador y autorregulacion](./06-reglas-generador-y-autoregulacion.md)
- [07 - Seguridad](./07-seguridad-lesiones-sustituciones.md)
- [08 - Implementacion](./08-plan-implementacion-y-qa.md)
- [09 - QA](./09-qa-y-validacion.md)
- [10 - Decisiones y bloqueos](./10-decisiones-y-bloqueos.md)
- [11 - Programacion principiante](./11-programacion-principiante.md)
- [12 - Programacion intermedio](./12-programacion-intermedio.md)
- [13 - Programacion avanzado](./13-programacion-avanzado.md)
- [14 - Biblioteca WOD](./14-biblioteca-wods-y-composicion.md)
- [15 - Contrato e invariantes](./15-contrato-generador-e-invariantes.md)
- [16 - Maquina de estados](./16-maquina-estados-autoregulacion.md)
- [17 - Matriz de flujos](./17-matriz-flujos-producto.md)
- [18 - Gap ledger](./18-gap-ledger.md)
- [`data/`](./data/) - matrices CSV/JSON propuestas, no ejecutables

## Secuencia de implementacion vigente

1. `COMPLETADO_TECNICO`: contratos, flags, clasificacion, programacion, composer y gate estadistico.
2. `COMPLETADO_CON_GATE_BD`: evaluacion/ledger, catalogo, seguridad, resultados y autorregulacion; migraciones no aplicadas.
3. `COMPLETADO_CON_GATE_E2E`: generación, plan, single-day, calendario, player, feedback y cierre por adaptadores.
4. `COMPLETADO_TECNICO_FLAG_OFF`: training load, outbox, nutrición por nivel/carga, presentación active, compras V2 y métricas; validar migración/BD/shadow QA.
5. `PENDIENTE_INFRAESTRUCTURA`: migraciones, RLS, E2E, accesibilidad y regresión con PostgreSQL aislado.
6. `REQUIERE_VALIDACION_HUMANA`: entrenador y nutricionista revisan reglas y muestra; legal decide el nombre.
7. Solicitar a Pablo autorización de push; PR revisable y revisión Sergio/Pablo. Nunca push directo a `main`.

## Limites de la declaracion

La rama está abierta y el paquete no está listo para producción. Persisten cinco gates externos: licencia/nombre, revisión profesional deportiva, revisión nutricional, contrato clínico de embarazo/posparto y QA integral de la implementación. El baseline de 231 tests valida regresión del punto de partida, no el nuevo modelo CrossFit.
