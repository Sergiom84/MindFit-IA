# Fase 0 · Métricas de activación honestas (COR-F0-05)

Documento operativo de las métricas de observabilidad del puente entrenamiento↔nutrición
de la Fase 0. Complementa el runbook de activación (`docs/NUTRICION-FASE0-ACTIVACION.md`).

- **Fuente de código:** `backend/services/trainingLoad/phase0Metrics.js`.
- **Endpoint:** `GET /api/admin/phase0/metrics` (protegido, `requireAdmin`).
- **Principio:** solo conteos y estadísticos agregados. Nunca datos personales
  (email, texto clínico, tokens, `user_id`, documentos). Todas las queries son de solo
  lectura; ninguna muta datos.

## 1. Contrato de carga honesto (`load_contract_status`)

Cada día periodizado persiste en `nutrition_plan_days.periodization_context` un
`load_contract_status` que refleja el **resultado real** de la resolución, no la fuente del
dato. Es el arreglo central de COR-F0-05: antes se contaba como «válido» cualquier día cuyo
`source` fuese `planned_session_load`, aunque el contrato estuviese degradado o hubiese sido
ignorado por el gate de metodología.

| Estado             | Significado                                                                                                     | ¿Cuenta como válido? |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------- |
| `valid`            | Contrato `training-load/v1` presente y validado sin degradación.                                                | Sí                   |
| `degraded`         | Contrato presente pero incoherente/histórico; lenient lo degradó a D1.                                          | No                   |
| `boolean_fallback` | Sin contrato honrado: entreno derivado del booleano, o contrato ignorado por el gate de metodología no emisora. | No                   |
| `no_load`          | Día de descanso sin contrato que validar.                                                                       | No                   |

`% with_valid_contract` se calcula como `status_valid / periodized_total`. El endpoint
expone además el desglose completo en `periodization.by_contract_status`.

> Regla de activación (COR-F0-01): una metodología con `emits_training_load=false` **no**
> sirve `entreno_normal`/`entreno_alto` como resultado autoritativo. Aunque el modo global
> sea `active`, la salida visible sigue siendo legacy (`entreno`/`descanso`); el reparto
> nuevo se calcula y persiste como shadow (`periodization_context.authoritative=false`).

## 2. Diferencias shadow (`shadow`)

Con el modo `shadow`/`active` cada día persiste `base_macros` y `resolved_macros`. Las
métricas agregan la diferencia del reparto respecto a la base, sin exponer días concretos:

- `carb_diff_g_avg`, `carb_diff_g_max`, `carb_diff_g_p95`: diferencia absoluta de
  carbohidrato en gramos (media, máximo y percentil 95).
- `carb_diff_pct_avg`: diferencia porcentual media de carbohidrato respecto a la base.
- `kcal_diff_avg`, `kcal_diff_max`: diferencia energética (kcal) media y máxima. La
  periodización es isocalórica respecto a la base, así que debe tender a 0 salvo por el
  redondeo de macros.
- `clamps_total`, `days_with_clamps`: número de veces que el suelo de grasa forzó bajar
  carbohidrato (clamps) y días afectados.

`kcal` se derivan de las macros (`P*4 + C*4 + G*9`). Un día sin `base_macros`/`resolved_macros`
queda fuera del cálculo.

## 3. Recomendaciones personalizadas sin catálogo

`shadow.personalized_recommendations_without_catalog` mide recomendaciones de carb timing
con cantidades personalizadas que **no** proceden de la composición del catálogo. Con
`CARB_TIMING_PERSONALIZED_ENABLED` apagado (default) **debe ser 0**: no se sirve ningún
gramo personalizado. La alerta `alerts.personalized_without_catalog` se enciende si el valor
es `> 0`, lo que sería anómalo con el flag apagado. El estado del flag se refleja en
`shadow.carb_timing_personalized_enabled`.

## 4. Salud del outbox y comportamiento con el worker pausado

El worker de eventos (`processBridgeEventOutbox`) está **desactivado por defecto**. Esto es
intencionado en Fase 0: el cierre de sesión puede encolar eventos, pero nadie los consume
todavía. Consecuencias esperadas en las métricas:

- `outbox.pending_total` crecerá con la actividad; es **backlog esperado**, no una anomalía.
- `outbox.pending_over_10min` (y su alerta `alerts.outbox_pending_backlog`) se encenderá en
  cuanto un evento pendiente supere los 10 minutos. **Con el worker pausado esta alerta es
  esperada y no debe interpretarse como fallo**: refleja que el consumidor está apagado a
  propósito, no un problema del circuito.
- `outbox.failed_after_max_attempts` (alerta `outbox_failed_terminal`) sí es siempre
  anómala: implica errores terminales tras agotar reintentos.

### Lectura correcta antes de reanudar el worker

1. Con el worker pausado, distinguir el backlog esperado (`pending_total` alto,
   `pending_over_10min > 0`) del anómalo (`failed_after_max_attempts > 0`, `processing_total`
   atascado por procesos zombis).
2. Al reanudar el worker, `pending_over_10min` debe drenar a 0 y aparecer exactamente una
   decisión por evento (`decisions.duplicate_decisions` permanece en 0 gracias al índice
   único `uq_bridge_decision_source_event`).
3. La activación del worker y su política definitiva se gobiernan desde el runbook de
   activación (COR-F0-06), fuera del alcance de este documento.

## 5. Verificación

- Contraste manual: las alertas del endpoint deben coincidir con consultas SQL de control
  equivalentes a las constantes exportadas (`PERIODIZATION_CONFIDENCE_SQL`,
  `SHADOW_DIFF_SQL`, `OUTBOX_HEALTH_SQL`, etc.).
- Pruebas: `backend/tests/nutritionFase0Correctiva.test.js` (estados de contrato, shadow y
  runner con mock) y `backend/tests/phase0Activation.test.js` (forma SQL y agregación).
- Privacidad: ninguna query selecciona identificadores de usuario ni texto libre; el JSON
  del endpoint no contiene claves sensibles.
