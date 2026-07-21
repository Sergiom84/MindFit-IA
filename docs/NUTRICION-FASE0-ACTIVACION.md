# Nutrición Fase 0 · Runbook de activación y rollback (doc04 PR6)

Guía operativa para activar de forma controlada la integración entrenamiento↔nutrición
(spec §16 PR6, §18, §10.2, §23). **Nada se activa por defecto**: con la configuración de
fábrica el comportamiento observable es idéntico al baseline.

## Estado por defecto (fábrica)

| Variable                            | Default     | Efecto                                                                |
| ----------------------------------- | ----------- | --------------------------------------------------------------------- |
| `NUTRITION_LOAD_PERIODIZATION_MODE` | `legacy`    | Reparto legado byte-compatible; no se calcula ni persiste nada nuevo. |
| `NUTRITION_PERIODIZATION_QA_USERS`  | (vacío)     | Ningún usuario escala de modo.                                        |
| `BRIDGE_OUTBOX_EMIT_ENABLED`        | `false`     | El cierre de sesión NO encola eventos → cero backlog con worker off.  |
| `BRIDGE_OUTBOX_WORKER_ENABLED`      | `false`     | El worker del outbox no arranca; los eventos encolados son inertes.   |
| `CARB_TIMING_PERSONALIZED_ENABLED`  | `false`     | El timing responde en modo educativo, sin gramos.                     |
| `ADMIN_TOKEN`                       | (sin fijar) | El endpoint de métricas responde 404 (fail-closed).                   |

## Modos de periodización

- `legacy`: reproduce exactamente el booleano de Nutrición V2 (rollback y paridad).
- `shadow`: sirve el resultado legado al usuario y persiste el reparto D0/D1/D2 en
  `nutrition_plan_days.periodization_context` para medir la diferencia.
- `active`: el reparto D0/D1/D2 es autoritativo (tipo_dia, macros y comidas del día).

### Rollout por usuario QA (canary)

`resolvePeriodizationModeForUser(userId)` escala **un peldaño** el modo global solo para los
`user_id` de `NUTRITION_PERIODIZATION_QA_USERS` (csv). Matriz resultante:

| Modo global | Usuario normal | Usuario QA |
| ----------- | -------------- | ---------- |
| `legacy`    | `legacy`       | `shadow`   |
| `shadow`    | `shadow`       | `active`   |
| `active`    | `active`       | `active`   |

El canary nunca retrocede el modo global. Con global `legacy` y sin lista QA, todos reciben
`legacy` → cero cambio observable.

### Gate por metodología

`emits_training_load` (registro canónico) vale `false` en las 11 metodologías durante la
Fase 0. Mientras sea `false`, aunque exista un contrato de carga en los metadatos, la
periodización cae a la **política conservadora** (descanso→D0, entreno→D1 baja confianza,
`reason_code` `NON_EMITTING_METHODOLOGY`). Una metodología pasa a `active` real solo cuando su
fase específica ponga `emits_training_load: true` tras sus pruebas.

## Verificación de métricas

`GET /api/admin/phase0/metrics` (cabecera `x-admin-token: <ADMIN_TOKEN>`). Devuelve conteos y
porcentajes agregados (sin datos sensibles). Umbrales de referencia (§18.1):

| Señal                                 | Objetivo                                                       | Alerta                          |
| ------------------------------------- | -------------------------------------------------------------- | ------------------------------- |
| `schedule.pct_with_day_id`            | 100% en nuevos (históricos tras backfill)                      | —                               |
| `periodization.pct_d1_low_confidence` | baja al migrar metodologías                                    | —                               |
| `outbox.pending_over_10min`           | 0 sostenido (salvo ventana `EMIT=true`/`WORKER=false`, ver §4) | `alerts.outbox_pending_backlog` |
| `outbox.failed_after_max_attempts`    | 0                                                              | `alerts.outbox_failed_terminal` |
| `decisions.duplicate_decisions`       | 0 (índice único)                                               | `alerts.duplicate_decisions`    |
| `drift.days_drift_over_1pct`          | 0 (isocalórico)                                                | `alerts.weekly_drift`           |

## Procedimiento de activación

### 1. legacy → shadow

1. En Render, poner `NUTRITION_LOAD_PERIODIZATION_MODE=shadow`.
2. Generar/regenerar algún plan nutricional; confirmar que `periodization_context` se
   persiste y que la respuesta al usuario **no cambia** (shadow sirve el legado).
3. Revisar `GET /api/admin/phase0/metrics`: `weekly_drift=false` y sin backlog de outbox.
4. **Criterio de vuelta atrás**: si `alerts.weekly_drift` es `true` o aparecen diferencias
   inesperadas en shadow, volver a `legacy` (rollback por variable, sin deploy).

### 2. Canary por usuario QA

1. Añadir los `user_id` de prueba a `NUTRITION_PERIODIZATION_QA_USERS` (csv).
2. Con global `shadow`, esos usuarios pasan a `active`: verificar sus planes e invariantes
   (proteína fija, grasa ≥ mínimo, kcal ±1%) y el aislamiento cruzado entre usuarios.
3. Si algo se desvía, vaciar la lista QA (los usuarios vuelven al modo global).

### 3. shadow → active por metodología

1. Requisito: la fase específica de la metodología pone `emits_training_load: true` y pasa
   sus pruebas. Sin eso, `active` global sigue cayendo a conservador para esa metodología.
2. Subir el modo global a `active` solo cuando shadow lleve estable y las métricas limpias.

### 4. Outbox de eventos: emisión y worker (dos flags independientes)

La **emisión** (`BRIDGE_OUTBOX_EMIT_ENABLED`, encola en el cierre) y el **consumo**
(`BRIDGE_OUTBOX_WORKER_ENABLED`, drena) son flags SEPARADOS a propósito (COR-F0-06). Emitir
siempre con el worker apagado generaría backlog indefinido sin control; por eso, en fábrica,
ambos están en `false` y el cierre no encola nada.

Política de secuencia (encender emisión ANTES que el worker, apagar en orden inverso):

| Paso    | `EMIT`  | `WORKER` | Estado esperado del outbox                                                                                                           |
| ------- | ------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Fábrica | `false` | `false`  | 0 filas. El cierre no encola. Comportamiento = baseline.                                                                             |
| Emisión | `true`  | `false`  | **Backlog ESPERADO y acotado**: cada cierre deja 1 evento `pending`. `outbox.pending_over_10min` subirá y es normal en esta ventana. |
| Drenaje | `true`  | `true`   | El worker reclama, registra 1 decisión por evento y marca `completed`. `pending_over_10min` → 0.                                     |

**Backlog esperado con worker pausado.** Mientras `EMIT=true` y `WORKER=false`, el backlog es
intencional, no una anomalía: son eventos aditivos e inertes esperando consumo. La alerta
`outbox_pending_backlog` en esa ventana es **esperada**; se resuelve al arrancar el worker.
Backlog anómalo = `EMIT=false` con filas `pending` acumulándose, o `failed_after_max_attempts>0`.

#### Pausar

- **Pausar consumo** (dejar de drenar, seguir encolando): `BRIDGE_OUTBOX_WORKER_ENABLED=false`.
  Los eventos quedan `pending` (backlog esperado, ver arriba). Idempotente y sin pérdida.
- **Pausar emisión** (dejar de encolar, no tocar lo ya en cola): `BRIDGE_OUTBOX_EMIT_ENABLED=false`.
  Los cierres dejan de generar eventos nuevos; los `pending` existentes se conservan.

#### Reanudar

1. Confirmar `BRIDGE_OUTBOX_EMIT_ENABLED=true` si se quiere seguir capturando cierres.
2. Poner `BRIDGE_OUTBOX_WORKER_ENABLED=true` (opcionalmente `intervalMs`).
3. En multi-instancia, el advisory lock (OPS-001) garantiza que solo una réplica procesa el lote.

#### Drenar

1. Con el worker activo, esperar a que `outbox.pending_over_10min` llegue a 0.
2. Verificar en `GET /api/admin/phase0/metrics`: `outbox.failed_after_max_attempts=0` y
   `decisions.duplicate_decisions=0` (el índice único de PR3 impide decisiones duplicadas).
3. Un error temporal reintenta con backoff exponencial (30s→60s→120s… acotado); un error
   terminal (agotados los intentos) queda `failed` visible para alerta, sin bloquear ningún cierre.

#### Rollback del outbox (funcional, no destructivo)

1. `BRIDGE_OUTBOX_WORKER_ENABLED=false` (detener consumo).
2. `BRIDGE_OUTBOX_EMIT_ENABLED=false` (detener emisión).
3. **No** borrar `app.bridge_event_outbox` ni las decisiones ya registradas: son aditivas y no
   afectan a consumidores antiguos. Un evento `pending` con emisión y worker apagados es inerte.

## Rollback (§10.2) — funcional, no destructivo

1. `NUTRITION_LOAD_PERIODIZATION_MODE=legacy` (respuesta al usuario vuelve al legado).
2. `BRIDGE_OUTBOX_WORKER_ENABLED=false` (detener el worker) y `BRIDGE_OUTBOX_EMIT_ENABLED=false`
   (detener la emisión de eventos en el cierre).
3. Vaciar `NUTRITION_PERIODIZATION_QA_USERS`.
4. **Mantener** columnas y tabla (`periodization_context`, `bridge_event_outbox`,
   `bridge_decision_logs.source_event_id/contract_version`): son aditivas y no afectan a
   consumidores antiguos. No hacer `DROP` en producción con decisiones ya auditadas.

## Checklist "antes de activar" (§23, adaptada)

- [ ] Backfill de `day_id` sin ambigüedades (migración PR3 ya aplicada a prod).
- [ ] Shadow mode estable: respuesta al usuario idéntica al baseline.
- [ ] Outbox sin acumulación (`pending_over_10min = 0`).
- [ ] Drift semanal dentro de tolerancia (`days_drift_over_1pct = 0`).
- [ ] Cero recomendaciones inseguras de timing (`CARB_TIMING_PERSONALIZED_ENABLED=false`).
- [ ] QA de usuario cruzado para aislamiento de perfil/caché.
- [ ] Aprobación profesional de las reglas nutricionales antes de `active` global.
- [ ] `ADMIN_TOKEN` configurado para consultar métricas.
