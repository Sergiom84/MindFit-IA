# Plan de implementacion sin ambiguedad

Rama aislada creada tras confirmación expresa: `codex/crossfit-profesional-v2`, desde `origin/main@e7f5711`. No se usa ni altera el checkout documental anterior.

## Definition of Ready global

- Fase 0 compartida desbloqueada para desarrollo por confirmación de Pablo.
- nombre publico decidido o default neutral aceptado;
- entrenador y nutricionista asignados;
- entorno QA aislado y estrategia de fixtures/rollback;
- owners de archivos compartidos y ventana de revision Sergio;
- criterios de catalogo/RLS/migracion aprobados.

## Fases

### 0. Gate y rama

Estado: `COMPLETADA`.

Evidencia: `origin/main@e7f5711`, worktree limpio aislado, dossier transferido por checksum, 231/231 unitarios, lint y build verdes, CI `main` verde. Integración queda pendiente de PostgreSQL efímero; nunca se sustituye por producción. Rollback: eliminar la rama no publicada; ningún cambio de datos.

### 1. Contratos y feature flags

Archivos nuevos previstos: `backend/services/crossfit/contracts/*`, `backend/services/crossfit/reasonCodes.js`, schemas/tests. Extensiones: registry de metodologia y adaptador de training load, sin tocar convergencia frontend.

Flags separados, default off: `CROSSFIT_V2_GENERATION`, `CROSSFIT_V2_RESULTS`, `CROSSFIT_EMITS_TRAINING_LOAD`, `CROSSFIT_NUTRITION_LOAD`. DoD: schemas validan fixtures, flags independientes, legacy intacto. Tests: contract, idempotency, old reader. Rollback: flags off.

### 2. Catalogo y seguridad

Estado: `REQUIERE_MIGRACION_AUTORIZADA`, `REQUIERE_VALIDACION_HUMANA`.

Implementado en rama: schema SQL aditivo no aplicado, importador dry-run
fail-closed, repositorio canónico/legacy, resolución de variantes/edges y safety
evaluator previo al composer. QA disponible verde; migración/RLS real queda
`PENDIENTE_QA_BD_EFIMERA`.

Migraciones futuras: tablas de versiones/movimientos/variants/rules/media/benchmarks, mapeo legacy y RLS. Servicios: repositorio de snapshot y safety evaluator. No editar/ejecutar SQL antes de autorizacion.

DoD: 120/120 mapeadas, altas revisadas, cero dangling/duplicate, RLS cross-user verde, rollback de puntero. Riesgo: romper IDs historicos; mitigacion = fuente/ID legacy inmutable y activacion atomica.

### 3. Clasificacion y programacion

Estado: `COMPLETADA_TECNICA_GATE_BD_E2E`, `REQUIERE_VALIDACION_HUMANA`.

Implementados `level-model/2.0.0`, evaluacion publica estricta, tarjeta de ocho
dimensiones con fallback por capabilities, ledger append-only y revision
profesional admin fail-closed. La autoevaluacion no puede autoverificar tecnica
ni skills; avanzado se resuelve unicamente desde evidencia server-side vigente.
La migracion `20260722_crossfit_v2_assessments.sql` esta preparada y no aplicada.
Integracion por `CrossFitService`/orquestador; `WorkoutContext.generatePlan()` no
se modifica.

DoD residual: PostgreSQL/RLS y Playwright en CI efimero; entrenador cualificado
revisa umbrales, evidencia y muestra. Tests puros: contrato, unknown/version,
asimetria, retorno, seguridad, confianza publica/profesional, revocacion e
idempotencia. Rollback: flag generation off; el ledger no se borra.

### 4. Composer determinista y validadores

Archivos previstos: `CrossFitWodComposer`, `CrossFitCandidateScorer`, `CrossFitPlanValidator`, `CrossFitDecisionTrace`, adaptador single-day. DoD: seed/idempotency/fallback/invariantes; >=10.000 planes por nivel, cero hard fail. Riesgo: pool insuficiente; fallback recovery/block, nunca relajacion.

### 5. Player, resultado y autorregulacion

Backend: resultado v2, reducer, eventos/snapshot. Frontend concreto CrossFit: ampliar WOD player/effort modal solo tras contrato; Today consume adaptador sin cambiar agnosticidad.

DoD: pause/reload/offline, scale por movimiento, cap, completion/abandon, pain/technique/readiness, hysteresis y eventos fuera de orden. Rollback: read v2/write legacy adapter segun flag; resultados append-only.

### 6. Training load y nutricion

Estado: `COMPLETADA_TECNICA_FLAG_OFF`, `PENDIENTE_QA_BD_SHADOW`.

Implementado: descriptor y rollout por flag, planned load al generar, actual al cerrar,
outbox con `plan_id + day_id`, repositorio de días de entrenamiento/descanso,
mapper D0/D1/D2 y adapter nutricional sobre el motor canónico. La ruta existente
conserva menús/recetas y solo cambia el objetivo diario cuando el modo es
autoritativo. El plan activo transporta timing/hidratación únicamente en active y
la lista de compra V2 se deriva de los ítems persistidos, preservando sustituciones
y estados de pesado. Señales explícitas de baja energía o embarazo/posparto bloquean déficit;
riesgo renal/cardiovascular bloquea dosis de electrolitos. Endpoint admin agregado
sin PII y con muestras separadas planned/actual. Preparada, no aplicada, la migración
de tipos `entreno_normal/entreno_alto`. Activar en orden: generation/results -> shadow training load -> validar
métricas -> `emits_training_load` -> shadow nutrition -> active nutrition con aprobación expresa.

Verificación local: gate previo 49/49 más 8 casos nuevos de migración, D0 real,
presentación active/shadow y compras; matriz 3 niveles x 4 objetivos x D0/D1/D2,
400/400 backend, lint, build y budget. DoD operativo aún pendiente: valid load >=99 %, degraded
<1 % justificado, cero duplicado outbox, menú idempotente en BD aislada y shadow.
Rollback: flags nutrition/load off, conservar eventos.

### 7. Flujos, RLS y observabilidad

Completar cambio de metodologia, regeneracion, empty/error/offline, historial, metrics y admin read-only. DoD: matriz 17 cubierta, alertas y privacy review, cero PII en traces/logs.

### 8. QA y validacion humana

Ejecutar matriz 09 y perfiles sintéticos. Entrenador/nutricionista revisan muestra y firman. Legal decide nombre. DoD: todos los gates, riesgo residual y rollback drill.

### 9. PR y rollout

Commits revisables por subfase, PR con migraciones/flags/QA/capturas, revision Sergio/Pablo, merge solo aprobado. Rollout canary/shadow segun Fase 0, monitorizar y ampliar. Nunca push directo a main.

## Archivos actuales previsiblemente afectados

- `backend/services/routineGeneration/methodologies/CrossFitService.js`
- `backend/services/singleDay/crossfitSingleDay.js`
- `backend/services/progression/planAutoregService.js`
- `backend/routes/methodologySingleDay.js`
- `backend/routes/trainingSession/complete.js` mediante extension compartida revisada
- `backend/services/routineGeneration/methodologies/methodologyRegistry.js`
- `backend/services/trainingLoad/*` mediante adaptador, no fork
- `src/components/routines/WodSessionModal.jsx`
- `src/components/routines/modals/CrossFitEffortModal.jsx`
- `src/components/routines/tabs/TodayTrainingTab.jsx`

Nuevos servicios se prefieren a inflar los existentes. Hipertrofia/HipertrofiaV2/Calistenia son solo targets de regresion.

## Criterio de merge

DoR/DoD de todas las fases, migraciones autorizadas y reversibles, zero hard invariant, Fase 0 y regresiones verdes, human review sin findings criticos/altos, legal/name decision, observabilidad activa, rollback probado y aprobaciones Sergio/Pablo.
