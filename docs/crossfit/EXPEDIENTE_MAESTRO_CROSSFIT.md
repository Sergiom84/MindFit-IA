# Expediente maestro de acondicionamiento funcional Mindfit

Version documental: `crossfit-product-spec/2.0.0`
Fecha de corte: 2026-07-24
Estado: `TECNICAMENTE_VALIDADA_PR_BLOQUEADA_SEGURIDAD`
Gate externo: `FASE_0_COMPARTIDA_DESBLOQUEADA_PARA_DESARROLLO`

## Dictamen

Este paquete especifica y acompaña la implementación CrossFit profesional v2
para principiante, intermedio y avanzado. El desarrollo comenzó en la rama
aislada `codex/crossfit-profesional-v2` desde `origin/main@e7f5711` y se integró
mediante merges normales hasta `origin/main@6493600`, que incluye Fase 0, CAL-00
y la identidad canónica de Hipertrofia. PR #63 ejecutó en
`d358d2f9da2ad6138c0b09ae0a266360ecaeb167` el CI aislado `30050111128`: seis
jobs verdes, 480 tests backend con 479 pass, 0 fail, 0 skips y 1 todo heredado,
26/26 integración PostgreSQL/RLS y 16/16 E2E desktop/móvil. La implementación
supera los gates técnicos, pero GitGuardian mantiene un hallazgo histórico
`Triggered`; por tanto, no se autoriza ready/merge. Tampoco se autorizan
escrituras en Supabase/Render, despliegues manuales, migraciones productivas ni
activación de flags.

El nombre publico recomendado es **Acondicionamiento funcional de alta intensidad** hasta obtener revision legal o autorizacion de marca. `crossfit` puede mantenerse como identificador interno de compatibilidad durante la migracion. Elite/competicion queda expresamente fuera de la primera entrega.

## Resultado real de la preparacion

| Area                             | Estado documental                                                | Estado real de producto                                                      |
| -------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Modelo por niveles               | Cerrado con criterios multidimensionales, confianza y asimetrias | UI 8D, ledger, revisión profesional y E2E por los tres niveles verdes        |
| Programacion 2/3, 3/4 y 4/5 dias | Cerrada por nivel y bloque                                       | Bloques 8/10/12 implementados y validados                                    |
| Biblioteca WOD                   | Formatos, dosis, caps, interferencias y escalado definidos       | Composer/player v2; runtime y sustitución/rechazo seguro verificados por E2E |
| Catalogo                         | 120 filas auditadas y modelo canonico propuesto                  | Importador y SQL validados en PostgreSQL efímero; producción sin migrar      |
| Generador                        | Contrato, semilla, scoring, fallback e invariantes definidos     | Integrado bajo flag; 30.000 planes y regeneraciones verdes                   |
| Autorregulacion                  | Maquina de estados y prioridades definidas                       | Siete estados; persistencia, append-only, RLS e idempotencia verdes en QA    |
| Seguridad                        | Stop rules y matriz por patron/sintoma definidas                 | Evaluador previo al composer; contratos clínicos externos pendientes         |
| Nutricion                        | Algoritmo por objetivo, carga y nivel definido                   | D0/D1/D2 y métricas verdes en shadow efímero; rollout/aprobación pendientes  |
| Flujos                           | Contratos front-back-BD y errores trazados                       | Ciclo API/UI, single-day, cierre, historial y offline/retry E2E verdes       |
| QA                               | Oraculos, perfiles y gates cuantificados                         | 32/32 perfiles; 30.000 planes; 480 tests, 26 integración y 16 E2E sin fallos |

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
- [19 - Cierre tecnico y runbook](./19-cierre-tecnico-y-runbook.md)
- [`data/`](./data/) - matrices CSV/JSON propuestas, no ejecutables

## Secuencia de implementacion vigente

1. `COMPLETADO_TECNICO`: contratos, flags, clasificacion, programacion, composer y gate estadistico.
2. `COMPLETADO_QA_BD_EFIMERA`: evaluación, catálogo, resultados, runtime,
   revisiones y nutrición; seis migraciones idempotentes y RLS verdes sin
   aplicarlas en producción.
3. `COMPLETADO_E2E`: generación, plan, single-day, calendario, player,
   sustitución o bloqueo seguro, feedback, cierre, historial, offline y nutrición
   en 16/16 desktop/móvil.
4. `COMPLETADO_TECNICO_FLAG_OFF`: training load, outbox y nutrición
   D0/D1/D2; el shadow de QA no autoriza rollout.
5. `BLOQUEADO_ROTACION_Y_REMEDIACION`: GitGuardian autenticado detecta una
   credencial PostgreSQL en el commit histórico `5b2c639`; el head ya no contiene
   el valor, pero el check seguirá bloqueando hasta rotación y remediación formal.
6. `REQUIERE_VALIDACION_HUMANA_PREPRODUCCION`: entrenador, nutricionista y
   profesional clínico revisan; legal decide el nombre.
7. PR #63 solo pasa a ready y merge protegido cuando el head final repita CI y
   el gate de secretos quede demostrado. Nunca push directo a `main`.

## Limites de la declaracion

La rama está técnicamente validada en QA aislada, pero el paquete no está listo
para producción. Persisten licencia/nombre, revisión deportiva, revisión
nutricional, contrato clínico de embarazo/posparto, shadow/observabilidad,
autorización de migraciones/flags y la remediación del incidente GitGuardian
previa al merge. La evidencia específica de v2 está detallada en
[`19-cierre-tecnico-y-runbook.md`](./19-cierre-tecnico-y-runbook.md); no se
infiere de la antigua suite baseline.
