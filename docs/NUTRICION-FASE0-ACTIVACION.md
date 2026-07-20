# Nutrición Fase 0 · Runbook de activación y rollback (doc04 PR6)

Guía operativa para activar de forma controlada la integración entrenamiento↔nutrición
(spec §16 PR6, §18, §10.2, §23). **Nada se activa por defecto**: con la configuración de
fábrica el comportamiento observable es idéntico al baseline.

## Estado por defecto (fábrica)

| Variable                            | Default     | Efecto                                                                |
| ----------------------------------- | ----------- | --------------------------------------------------------------------- |
| `NUTRITION_LOAD_PERIODIZATION_MODE` | `legacy`    | Reparto legado byte-compatible; no se calcula ni persiste nada nuevo. |
| `NUTRITION_PERIODIZATION_QA_USERS`  | (vacío)     | Ningún usuario escala de modo.                                        |
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

| Señal                                 | Objetivo                                  | Alerta                          |
| ------------------------------------- | ----------------------------------------- | ------------------------------- |
| `schedule.pct_with_day_id`            | 100% en nuevos (históricos tras backfill) | —                               |
| `periodization.pct_d1_low_confidence` | baja al migrar metodologías               | —                               |
| `outbox.pending_over_10min`           | 0 sostenido                               | `alerts.outbox_pending_backlog` |
| `outbox.failed_after_max_attempts`    | 0                                         | `alerts.outbox_failed_terminal` |
| `decisions.duplicate_decisions`       | 0 (índice único)                          | `alerts.duplicate_decisions`    |
| `drift.days_drift_over_1pct`          | 0 (isocalórico)                           | `alerts.weekly_drift`           |

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

### 4. Worker del outbox

1. Poner `BRIDGE_OUTBOX_WORKER_ENABLED=true` (opcionalmente `intervalMs`).
2. Verificar en métricas que `pending`/`failed` drenan y no hay `failed_after_max_attempts`.

## Rollback (§10.2) — funcional, no destructivo

1. `NUTRITION_LOAD_PERIODIZATION_MODE=legacy` (respuesta al usuario vuelve al legado).
2. `BRIDGE_OUTBOX_WORKER_ENABLED=false` (detener el worker).
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
