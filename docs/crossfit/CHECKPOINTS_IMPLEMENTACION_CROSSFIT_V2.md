# Checkpoints de implementación CrossFit profesional v2

Especificación: `crossfit-product-spec/2.0.0`
Rama: `codex/crossfit-profesional-v2`
Base: `origin/main@e7f57116363d9283a27c1d5d375da674414ddf1f`
Sincronizada con: `origin/main@3e0955921ed75244bd4f205dba20c1878f1b6da4`
Estado global: `EN_PROGRESO`

## Guardas permanentes

- Worktree aislado; no modificar el checkout documental previo.
- No tocar `WorkoutContext.generatePlan()`, la redirección ni el frontend agnóstico.
- No cambiar programación de Hipertrofia, Hipertrofia V2 o Calistenia.
- No escribir en Supabase/Render ni aplicar migraciones/flags sin autorización.
- No hacer push ni abrir PR sin confirmación expresa de Pablo.
- Dolor, red flags y técnica insegura tienen precedencia sobre rendimiento.
- Elite se conserva como legacy y queda fuera del producto principal.

## Estado de fases

| Fase                          | Estado                        | Evidencia / gate                                             |
| ----------------------------- | ----------------------------- | ------------------------------------------------------------ |
| A. Baseline y DoR             | `COMPLETADA_CON_LIMITACION`   | 231/231 unit, lint, build; integración requiere BD efímera   |
| B. Contratos/versionado/flags | `COMPLETADA`                  | 8/8 específicos; suite 239/239; lint; flags off              |
| C. Catálogo/seguridad         | `COMPLETADA_CON_GATE_BD`      | 13/13; 92+104+236; 120/120; SQL/RLS requiere BD efímera      |
| D. Clasificación              | `COMPLETADA_CON_GATE_BD_E2E`  | level-model + UI 8D + ledger/revisión; 32 focalizados        |
| E. Programación por nivel     | `COMPLETADA_TECNICA`          | bloques 8/10/12; seis frecuencias; 12/12 tests               |
| F. Composer/validadores       | `COMPLETADA_TECNICA`          | 30.000 planes + 30.000 regeneraciones; cero hard violation   |
| G. Flujos de producto         | `COMPLETADA_CON_GATE_E2E`     | 51/51 focalizados; generación, plan, single-day y player     |
| H. Resultados/autorregulación | `COMPLETADA_CON_GATE_BD`      | siete estados; 18/18 específicos; SQL/RLS requiere BD        |
| I. Training load/nutrición    | `COMPLETADA_TECNICA_FLAG_OFF` | 49/49; 355/355; shadow/BD/aprobación pendientes              |
| J. QA integral                | `PREPARADA_GATE_CI`           | unit/lint/build verdes; BD/RLS/E2E preparados, no ejecutados |
| K. Validaciones externas      | `GATE_PREPRODUCCION`          | entrenador, nutricionista, clínico si aplica y legal         |

## Baseline reproducible

| Comprobación               | Resultado 2026-07-22                                               |
| -------------------------- | ------------------------------------------------------------------ |
| `origin/main` inicial      | `e7f5711`; baseline desde el que se abrió el worktree              |
| `origin/main` sincronizado | `3e09559`; retiro legacy y rename interno integrados sin rebase    |
| CI `main`                  | CI y Android verdes en el SHA de referencia                        |
| `npm ci` raíz/backend      | correcto desde lockfiles                                           |
| `npm run test:backend`     | 231/231                                                            |
| Regresión actual           | 382/382 tras regeneración inmutable, runtime y guardas QA          |
| `npm run lint -- --quiet`  | correcto                                                           |
| `npm run build`            | correcto; warnings preexistentes de chunks/browser data            |
| Integración backend        | no ejecutada: no hay PostgreSQL/Docker local ni URL QA             |
| Migración 20260721         | registrada en Supabase, checksum coincide; no reescribir           |
| Deuda histórica            | 29 calendarios sin `day_id`; sesiones se auditan por relación real |
| Dossier baseline           | 120/120, 92, 44, 45, 32; PDF 43 páginas válido                     |
| Corrección reason codes    | 65: paridad código/CSV, incluida regeneración inmutable trazable   |

## Semáforos de rollout

- `FASE_0_COMPARTIDA_DESBLOQUEADA_PARA_DESARROLLO`.
- `CROSSFIT_V2_GENERATION=false` hasta el gate funcional de generación.
- `CROSSFIT_V2_RESULTS=false` hasta persistencia e idempotencia verdes.
- `CROSSFIT_EMITS_TRAINING_LOAD=false` hasta contracts, outbox y métricas verdes.
- `CROSSFIT_NUTRITION_LOAD=false` hasta shadow, métricas y aprobación.
- Migraciones nuevas: solo archivo + test aislado; no aplicar en producción.

## Gate técnico H

- Contrato `crossfit-result/v2` estricto también en score, escalas, dolor,
  readiness y provenance; no admite campos internos enviados por cliente.
- Máquina pura de siete estados con prioridad de seguridad, dos señales para
  deload, tres exposiciones para progreso, histéresis y convergencia fuera de orden.
- Resultado, evento y snapshot se persisten transaccionalmente e idempotentes;
  resultados/eventos son append-only y el snapshot materializado es mutable.
- `planAutoregService` delega solo sesiones marcadas `crossfit-session/v2`; el
  flag apagado y las sesiones legacy conservan su ruta histórica.
- CrossFit v2 nunca deriva RPE de RIR. El cierre automático espera feedback y
  el modal recoge RPE, técnica, dolor/red flag, readiness, escala y score medido.
- Outbox real queda bajo `CROSSFIT_V2_RESULTS`, `CROSSFIT_EMITS_TRAINING_LOAD`
  y `BRIDGE_OUTBOX_EMIT_ENABLED`; su fallo revierte solo el savepoint.
- Verificación: 18/18 focalizados, 307/307 backend y lint quiet. La migración
  `20260722_crossfit_v2_results_autoreg.sql` está preparada, no aplicada; up,
  re-run y RLS cross-user siguen pendientes de PostgreSQL efímero/CI.

## Gate técnico I

- El registro compartido resuelve emisión y modo nutricional por flags CrossFit,
  sin alterar descriptores ni rollout de otras metodologías: sin emisión queda
  `legacy`; emisión + modo `shadow` calcula shadow; `active` exige además
  `CROSSFIT_NUTRITION_LOAD=true`.
- El adaptador `crossfit-nutrition/2.0.0` reutiliza
  `resolveDayNutritionTargets`: no recalcula BMR, TDEE, objetivo, menú, recetas ni
  lista de compra. Conserva energía y proteína canónicas y aplica rangos por los
  tres niveles, cuatro objetivos y D0/D1/D2.
- Los días nutricionales se enlazan por `methodology_plan_days(plan_id, day_id)` e
  incluyen descanso D0. Una sesión sin carga válida cae a D1 de baja confianza;
  una identidad ausente no se inventa ni se periodiza.
- El cierre/outbox transporta `methodology_plan_id + day_id`; CrossFit se omite
  fail-closed si falta identidad o `CROSSFIT_EMITS_TRAINING_LOAD` está apagado.
- Perfil médico canónico y último snapshot nutricional se proyectan a señales
  booleanas sin leer documentos clínicos. RED-S/baja energía y
  embarazo/posparto bloquean déficit automático; riesgo renal/cardiovascular o
  diuréticos bloquea dosis de electrolitos. No se emite diagnóstico.
- Endpoint admin read-only `/api/admin/crossfit-v2/metrics`: carga válida/degradada,
  contratos shadow/active, drift >1 %, outbox y duplicados, sin PII.
- Verificación: 49/49 focalizados, 355/355 backend y lint quiet verdes. Flags y
  `.env.example` siguen `false`; no se ejecutó shadow real, DB efímera, Render,
  Supabase ni activación. Gate operativo pendiente: valid load >=99 %, degradados
  <1 %, cero duplicados/drift en muestra QA y aprobación de nutricionista.

## Gate técnico G

- `CrossFitService` delega en v2 solo con `CROSSFIT_V2_GENERATION=true`; con el
  flag apagado conserva byte a byte la ruta legacy y ningún desconocido cae en
  CrossFit.
- El plan presentado conserva el snapshot canónico completo y transporta
  `crossfit-session/v2` más `training-load/v1` hasta `methodology_plan_days` y
  la sesión real por `plan_id + day_id`.
- El adaptador de calendario materializa el bloque rodante completo de 8/10/12
  semanas sin recortar, clonar o recomponer WODs; valida antes de borrar y usa
  transacción/savepoint.
- Single-day usa el mismo composer determinista y safety evaluator, persiste
  `day_id`, sesión, carga y metadata canónica, y no confía en el nivel textual
  del frontend para promocionar.
- Inicio y autorregulación v2 no consultan offsets RIR legacy. Un snapshot
  `blocked` impide iniciar; las demás acciones cambian una sola dimensión y
  quedan trazadas en la sesión.
- El player soporta los ocho formatos de metcon más `strength_only` y
  `skill_only`, time cap, escala por movimiento y cierre fail-closed si falla
  cualquier persistencia. El feedback emite score tipado, RPE, técnica, dolor,
  readiness y escalas.
- Resultados de plan completo leen `methodology_exercise_progress`; single-day
  lee `exercise_session_tracking`, ambos normalizados al mismo actual load.
- Verificación: 51/51 focalizados, 327/327 backend, lint quiet y build verdes.
  Quedan pendientes Playwright real, offline/background timer, sustitución
  interactiva, PostgreSQL efímero y RLS cross-user.

## Gate técnico G.1: runtime y sustituciones backend

- Añadidos contratos `crossfit-runtime-event/v2` y `crossfit-substitution/v2`
  con límites estrictos, identidad, stream y secuencia de cliente.
- El servidor acepta eventos públicos de inicio, pausa, reanudación, reset y
  escala `base/scaled`; rechaza RX+, movimientos ajenos al WOD y la inyección
  directa de `movement_substituted`.
- La máquina de transición exige secuencia contigua, estado de temporizador
  válido, tiempo no regresivo y time cap inmutable. Los reintentos con la misma
  idempotency key devuelven el evento persistido; contenido divergente falla.
- Las sustituciones solo recorren aristas canónicas de la versión de catálogo
  congelada en la sesión. Safety, dolor/red flags, skill, equipo, pairing y
  `stimulus_delta <= 0.15` preceden al scoring; la dosis conserva duración
  estimada y el servidor genera la traza.
- Preparada, no aplicada, `20260722_crossfit_v2_runtime_events.sql`: ledger
  append-only, FK `plan_id + day_id`, owner-read RLS e índices de idempotencia y
  orden de stream. CI la reaplica dos veces y la incluye en integración/E2E.
- Evidencia local del backend: 13/13 runtime y 365/365 backend en el commit de
  esta subfase. Las
  5 pruebas BD no se ejecutan localmente por ausencia de PostgreSQL/Docker;
  migración, RLS y aislamiento quedan `PENDIENTE_EJECUCION_CI`.

## Gate técnico G.2: player persistente y escala autoritativa

- El player V2 persiste en `localStorage` stream, secuencia, timer, ancla,
  escalas, sustituciones confirmadas y cola pendiente. El tiempo se deriva de
  una ancla monotónica y sobrevive a background/cierre/reapertura sin depender
  de ticks perdidos.
- Inicio, pausa, reanudación y reset encolan eventos versionados y se envían en
  orden. Offline o error reintentable conserva la cola; una sustitución
  rechazada elimina solo esa petición y renumera los eventos locales aún no
  enviados para no dejar huecos de secuencia.
- CrossFit V2 ya no expone escala global ni RX+. Toda sustitución se solicita por
  movimiento y solo aparece tras respuesta del resolver servidor; red flags
  detienen el timer y nunca aplican una alternativa local.
- El resultado ignora escalas aportadas por el cliente y reconstruye `base`,
  `scaled` o `substitution:<id>` desde el WOD canónico y el ledger servidor. El
  modal V2 las muestra en solo lectura, exige feedback y mantiene ese bloqueo si
  el resumen local se pierde.
- El inicio real se marca con el endpoint idempotente existente al arrancar el
  timer, incluido el camino que salta el calentamiento. El cierre no continúa
  mientras queden eventos sin sincronizar ni si falla un movimiento.
- Playwright efímero queda ampliado para registrar/reintentar eventos de timer,
  rechazar una sustitución inyectada, enviar RX+ adulterado y comprobar que el
  resultado autoritativo sigue en `base`; la UI comprueba que V2 no tiene
  selectores globales/RX+.
- Evidencia local: 5/5 estado frontend, 41/41 regresión focalizada, 375/375
  backend, lint quiet y build productivo verdes. Playwright y las 5 pruebas de
  PostgreSQL/RLS siguen `PENDIENTE_EJECUCION_CI`; no se levantaron servicios.
- No se considera cerrado aún el flujo G completo: faltan terminación explícita
  `partial/abandoned/cancelled` y recuperación durable de feedback tras una
  recarga completa. La regeneración versionada se cierra en G.3.

## Gate técnico G.3: regeneración inmutable de drafts

- El cliente identifica exclusivamente el envelope `crossfit-plan/v2`, fija
  `methodology=crossfit` y envía plan origen, revisión esperada, motivos,
  `request_id` e `idempotency_key`; legacy conserva su payload y limpieza previa.
- Con `CROSSFIT_V2_GENERATION=false` el registro mantiene el comportamiento
  histórico. Con el flag activo, la ruta compartida no limpia drafts CrossFit y
  delega el versionado al adaptador de producto.
- El servicio bloquea el draft origen con `FOR UPDATE`, exige ownership, contrato
  válido, revisión exacta y cero sesiones materializadas. La revisión nueva se
  inserta antes de marcar la anterior `superseded`, todo en una transacción.
- `generation.revision` aumenta en uno, `supersedes` conserva el `plan_id`
  lógico, y `PLAN_REGENERATED` registra motivos y revisión previa. Fecha,
  frecuencia y objetivo del bloque se conservan para evitar cambiar el encargo.
- El replay compara el hash del payload cliente antes de recargar perfil,
  equipamiento o catálogo. Reutilizar una clave con otro contenido, regenerar un
  plan activo o materializado, o perder una carrera concurrente falla cerrado.
- Preparada, no aplicada, `20260722_crossfit_v2_plan_revisions.sql`: índice
  único parcial por usuario/idempotency e índice de cadena `supersedes`, sin
  reescritura histórica. CI la aplica dos veces y prueba la unicidad real.
- Evidencia local: 36/36 focalizados, 382/382 backend, lint quiet, build y budget
  verdes. Las 6 pruebas PostgreSQL/RLS y Playwright siguen
  `PENDIENTE_EJECUCION_CI`; no se levantaron servicios ni se aplicó la migración.

## Gate técnico J

- El arnés `localQaGuard` queda desactivado sin acuse explícito y, aun con acuse,
  rechaza cualquier API, frontend o PostgreSQL que no sea local. La regresión E2E
  histórica deja de permitir Supabase/producción.
- CI prepara PostgreSQL 17 efímero, restaura baseline, aplica dos veces las cinco
  migraciones CrossFit y ejecuta la integración registrada por el runner.
- El job E2E importa el catálogo draft, lo activa solo en la BD desechable y
  verifica que un segundo import es un no-op con hash y conteos idénticos.
- La integración comprueba tablas, RLS, catálogo visible solo activo, bloqueo de
  mutación del catálogo activo, aislamiento entre dos usuarios y resultados
  append-only dentro de una transacción con rollback.
- Playwright descubre diez casos en proyectos escritorio y móvil 375x812: tres
  ciclos API por nivel y dos recorridos UI por viewport. Generation/results están
  activos solo dentro del job; carga, nutrición y workers continúan apagados.
- Verificación local segura: 382/382 unitarios, lint quiet, build y budget de
  bundle verdes. PostgreSQL/Docker no están disponibles y no hay servidores
  levantados; por tanto DB/RLS/E2E permanecen `PENDIENTE_EJECUCION_CI`, no verdes.

## Gate técnico D y evaluación de producto

- La UI consulta capabilities autenticadas: flag apagado o error conserva el
  componente legacy; flag encendido usa la tarjeta v2 sin selección manual.
- Ocho dimensiones 0-3, sesiones comparables, adherencia, pausa, dolor, zona,
  lesion aguda y red flag forman un contrato estricto con `request_id`.
- Objetivo, frecuencia y equipamiento se reutilizan del perfil; tras clasificar,
  las respuestas se congelan hasta reevaluar para evitar screening obsoleto.
- La autoevaluacion no puede enviar `technique_verified=true` ni permisos de
  skills y queda limitada a confianza media. Elite permanece fuera.
- Avanzado exige el ultimo evento profesional `verified` del ledger; un evento
  posterior `revoked` lo anula. El endpoint de revision esta protegido por
  `ADMIN_TOKEN`, pero la firma deportiva sigue siendo gate humano externo.
- Persistencia append-only con RLS owner-read, secuencia monotonica, hash de
  contenido e idempotencia fail-closed. La generacion resuelve el identificador
  persistido por usuario y rechaza referencias ajenas. La migracion
  `20260722_crossfit_v2_assessments.sql` esta preparada y no aplicada.
- Metricas admin agregan self-report, revisiones, activos, revocados y caducados
  sin exponer usuario ni contenido. Verificacion focalizada: 32/32; lint verde.
  PostgreSQL/RLS y Playwright siguen pendientes de ejecucion CI.

## Gate estadístico F

- Runner: `backend/scripts/qa-crossfit-generator-statistical.mjs`.
- Ejecución: `--per-level=10000 --workers=8` sobre catálogo canónico normalizado.
- Resultado post-sincronización: `passed` en 552.501 ms; 10.000/10.000 por nivel y 5.000 por frecuencia soportada.
- Reproducibilidad: 30.000 regeneraciones, `non_reproducible=0`.
- Seguridad: `hard_violations=0`, `unavailable_equipment=0`, `contraindicated=0`, `invalid=0`.
- Cobertura: AMRAP, EMOM, E2MOM, E3MOM, For Time, RFT, Chipper e Intervals presentes en los tres niveles.
- SHA-256 canónico del resumen post-sincronización: `c91364fef30e23e83ac6cc7cc84acea475fe4a61536a1251045bbfdd86b16b6e`.
- El JSON bruto permanece fuera del entregable; este resumen y el runner reproducible son la evidencia versionada.

## Sincronización con main

- Revisados e integrados `57b7b40`, `26b5fae` y `3e09559`, sin rebase y sin
  alterar el checkout documental original.
- El único conflicto textual fue el logger de `crossfitSingleDay.js`: se conservó
  toda la delegación CrossFit v2 y se adoptó `../hipertrofia/logger.js`.
- Revisados los otros cuatro solapes funcionales: ruta single-day, persistencia,
  capa modal de metodologías y capa modal de Hoy. Se conservan `equipment`,
  `check_in`, `plan_id + day_id`, resumen WOD y las nuevas rutas internas de
  Hipertrofia.
- Regresión post-merge: 104/104 CrossFit, 336/336 backend, lint quiet y build
  verdes; gate estadístico 30.000/30.000 verde. No se ejecutaron migraciones ni
  se activaron flags.

## Criterio de cierre técnico

Cada fase exige diff de alcance, tests de subfase, registro diario y trazabilidad
actualizada. Una limitación de infraestructura se marca como gate, nunca como test
verde. La eficacia deportiva, clínica, nutricional y legal solo se considera
validada con revisión humana documentada.
