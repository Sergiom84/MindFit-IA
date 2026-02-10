# Implementación: Revisión Nutricional Semanal/Quincenal (rolling 7d/14d) + Modo SIMPLE/FINO

## Resumen

Implementar un sistema de **revisión semanal (feedback)** y **revisión quincenal (autoajuste por defecto)** para Nutrición, con anti‑ruido y adherencia como “completitud de datos”. El sistema debe:

- Dar feedback útil aunque el usuario **no registre comidas** (Modo SIMPLE).
- Aplicar autoajustes **fiables** solo cuando hay datos suficientes (Modo FINO).
- Evitar incoherencias UI (p. ej. “perfil con kcal nuevas pero plan viejo”).
- Ser “profesional”: ajustes **explicados, auditables y reversibles** (deshacer 24h).

Decisión clave: `day_type` y `noise_flags` se almacenan como **columnas** (no solo JSON).

## Objetivo y alcance

### Objetivo

1. **Revisión semanal (cada 7 días):** evaluación sin acción por defecto. Mostrar estado: “vas bien / vas lento / vas rápido / datos insuficientes”.
2. **Revisión quincenal (cada 14 días):** acción por defecto (autoajuste) usando:
   - Rolling **últimos 7 días** vs rolling **7 días anteriores**.
   - Confirmación 2 semanas (anti‑ruido).
   - Gate de datos: adherencia de registro ≥80% en 14 días + pesajes suficientes.
3. **Ajuste de seguridad semanal (excepción):** solo señal fuerte + datos suficientes + sin ruido.
4. **Consistencia:** el **plan activo** es la fuente de verdad para lo visible en UI. Si se ajusta kcal, se **regenera el plan** en la misma operación y se guarda snapshot para “Deshacer”.

### Alcance incluido

- Modelo de datos para tracking diario:
  - `app.daily_nutrition_log`: añadir columnas `day_type` y `noise_flags`.
- Endpoints v2 para:
  - Guardar/leer registro diario (kcal total + tipo de día + banderas).
  - Obtener “Revisión” (semanal/quincenal) con métricas y estado.
  - Aplicar ajuste (auto o manual) con regeneración de plan.
  - Deshacer el último ajuste (24h) restaurando el plan anterior.
- Servicio backend unificado de decisión (“NutritionReview”).
- UI: bloque fijo de “Revisión” + registro rápido de kcal y banderas.
- Auditoría: log del ajuste aplicado y del revertido con datos usados.

### No‑objetivos

- No generar menús/recetas.
- No obligar a registro detallado de comidas/macros para funcionar (solo mejora Modo FINO).
- No cambiar reglas de entrenamiento; solo consumir calendario/plan activo ya enlazado.
- No “recalcular a ojo”: el motor seguirá siendo determinista y auditable.

## Decisiones tomadas (sesión actual)

1. **Adherencia = completitud de datos** (no “cumplimiento”).
   - Un día cuenta como “registrado” si tiene:
     - kcal totales del día, o
     - comidas/macros, o
     - marcado como “día libre / diet break / cheat” (cuenta como dato).
   - Umbral modo FINO (14 días):
     - ≥80% días con algún registro, y
     - ≥6 pesajes en 14 días (o ≥4 por semana).
2. **Separar**:
   - A) completitud de datos (adherencia de registro)
   - B) cumplimiento real (compliance): usarlo para interpretar, no para permitir ajustes.
3. “Media 7 días” = **rolling last 7 days**, no semana calendario.
4. Ruido:
   - Manual (usuario): viaje, enfermedad/medicación, semana caótica, diet break planificado.
   - Automático (sistema): cheat/diet break registrado, outlier de peso >1.5% en 24–48h, pesajes insuficientes.
   - Bloquea ajustes 7 días desde la bandera; no bloquea feedback.
5. **Deshacer**:
   - Revierte kcal objetivo al valor anterior.
   - Restaura el plan anterior (snapshot).
   - Solo último ajuste, ventana 24h.
   - Log obligatorio (aplicado/revertido/motivo/datos).
6. **Fuente de verdad visible:** el **plan activo**. Perfil = preferencias/config.
   - Si cambia kcal, se actualiza plan activo en la misma operación (transacción / operación atómica).
7. Compliance real: **±10%** sobre objetivo, evaluado sobre rolling 7d.
8. `day_type` y `noise_flags` como **columnas** en `app.daily_nutrition_log`.

## Arquitectura propuesta

### Datos

1. `app.daily_nutrition_log`
   - Añadir:
     - `day_type TEXT NOT NULL DEFAULT 'normal'`
       - Valores: `normal | libre | cheat | diet_break`
     - `noise_flags TEXT[] NOT NULL DEFAULT '{}'`
       - Valores (ejemplo): `viaje`, `enfermedad`, `semana_caotica`, `retencion`, etc.
   - Usar `calories` (ya existe) como “kcal totales del día” (opción A mínima).
   - Mantener `daily_log JSONB` para detalle opcional (comidas/macros), sin hacerlo obligatorio.

2. Tabla de acciones reversibles (recomendado)
   - Nueva tabla `app.nutrition_adjustment_actions` (o equivalente) para “aplicar / deshacer”:
     - `id`, `user_id`, `applied_at`, `undo_expires_at`, `reverted_at`
     - `previous_plan_id`, `new_plan_id`
     - `previous_kcal`, `new_kcal`, `delta_kcal`
     - `reason`, `metrics JSONB`, `mode` (`quincenal` / `seguridad`), `source` (`auto` / `manual`)
   - Motivo: el `nutrition_change_log` sirve para auditoría general; esta tabla facilita “deshacer” y la ventana 24h de forma robusta.

### Backend (servicios + endpoints)

1. Servicio `nutritionReviewService` (nuevo)
   - Calcula:
     - rolling avg 7d (peso) + rolling avg 7d previa
     - cintura (si existe) como señal adicional (no bloqueante)
     - adherencia de datos: % días con registro (kcal o comidas o day_type “libre/cheat/diet_break”)
     - pesajes: conteos en 7d y 14d
     - compliance real: rolling 7d kcal vs objetivo (±10%)
     - banderas de ruido activas (manual/auto) y su ventana (7d)
   - Devuelve:
     - `mode`: `simple` o `fino`
     - `weekly_review`: estado + explicación
     - `biweekly_review`: estado + “pendiente” o “ajuste recomendado/aplicable” + datos usados

2. Endpoints v2 (propuesta)
   - `GET /api/nutrition-v2/review`
     - Devuelve bloque listo para UI (“Revisión semanal / quincenal”, contadores y razones).
   - `GET /api/nutrition-v2/daily/:date`
   - `POST /api/nutrition-v2/daily`
     - Guarda: `calories`, `day_type`, `noise_flags`, y opcionalmente `daily_log`.
   - `POST /api/nutrition-v2/adjustments/apply`
     - Aplica ajuste (auto o manual), **regenera plan** y crea registro reversible.
   - `POST /api/nutrition-v2/adjustments/undo-last`
     - Deshace el último ajuste si está dentro de 24h.

3. Aplicación del ajuste (consistencia y atomicidad)
   - Operación atómica:
     1. Leer plan activo actual (`nutrition_plans_v2`).
     2. Archivar plan activo actual.
     3. Generar nuevo plan v2 con kcal objetivo ajustada:
        - Mantener enlace a entrenamiento (calendario real) y duración coherente (<=28).
     4. Activar nuevo plan.
     5. Insertar `nutrition_adjustment_actions` con `previous_plan_id/new_plan_id` y métricas.
     6. Registrar en `nutrition_change_log` (audit) con rule id y métricas.

### UI (mínimo para que “se sienta” alineado)

1. Bloque fijo “Revisión”
   - “Revisión semanal: OK / vas lento / vas rápido / datos insuficientes”
   - “Revisión quincenal: faltan X / pendiente 2ª semana / ajuste aplicado”
   - Cuando hay ajuste: motivo + datos usados (rolling 7d vs 7d previa, adherencia %, nº pesajes, cintura si existe).

2. Registro rápido diario
   - Input “kcal del día” (opción mínima).
   - Selector `day_type` (normal/libre/cheat/diet_break).
   - Toggles de `noise_flags` (viaje, enfermedad, semana caótica, etc.).
   - Esto habilita Modo FINO sin exigir macros.

3. Modo manual (setting)
   - Por defecto: autoaplicar (quincenal/seguridad).
   - Si el usuario activa manual:
     - mostrar recomendación + CTA “Aplicar ajuste y regenerar plan” / “Posponer”.

## Plan por fases

### Fase 1 — Modelo de datos (SQL)

Entregables:

- Migración: añadir `day_type` y `noise_flags` como columnas.
- Índices mínimos por `user_id, log_date` y queries de ventana.

Criterios de aceptación:

- Backward compatible: no rompe el legacy `/api/nutrition/daily`.

### Fase 2 — API registro diario v2

Entregables:

- Endpoints v2 para guardar/leer kcal, day_type, noise_flags.
- Normalización de inputs (valores permitidos).

Criterios de aceptación:

- Un día con solo kcal cuenta como “registrado”.

### Fase 3 — Motor de revisión (semanal/quincenal)

Entregables:

- `GET /api/nutrition-v2/review` con estado y métricas.
- Gate de datos (modo SIMPLE vs FINO).
- Detección de banderas de ruido (manual/auto) con bloqueo 7d.
- Detección “datos suficientes pero compliance bajo”: no ajustar, explicar.

Criterios de aceptación:

- Siempre hay feedback semanal (aunque sea “datos insuficientes”).
- Quincenal solo propone/aplica si FINO + confirmación 2 semanas.

### Fase 4 — Aplicar ajuste + regenerar plan + auditoría

Entregables:

- Endpoint aplicar ajuste (auto/manual).
- Regeneración del plan activo en la misma operación.
- Log audit + registro reversible.

Criterios de aceptación:

- No existe estado “perfil nuevo / plan viejo” en UI.

### Fase 5 — Deshacer (24h)

Entregables:

- Endpoint “undo last adjustment”.
- Restaurar plan previo y registrar revertido.

Criterios de aceptación:

- Deshacer solo el último ajuste y solo dentro de ventana.

### Fase 6 — UI (bloque revisión + registro rápido)

Entregables:

- Bloque de revisión (semanal/quincenal) en dashboard.
- Registro rápido de kcal/day_type/noise_flags.
- Estado “pendiente” con motivo (faltan pesajes, adherencia, 2ª semana, ruido).

Criterios de aceptación:

- El usuario entiende qué falta para entrar en modo FINO.

### Fase 7 — Tests + QA

Entregables:

- Tests de motor (unit) + endpoints (integration).
- Casos borde y evidencias.

Criterios de aceptación:

- Gate de tests por fase en checklist en verde.

## Riesgos y mitigaciones

- **Confusión entre legacy y v2 (registro diario):**
  - Mitigación: endpoints v2 nuevos + tabla compatible.
- **Falsos positivos de “ruido”:**
  - Mitigación: usar rolling 7d, bloquear ajustes pero no feedback, y permitir “modo manual”.
- **Regeneración de plan puede ser percibida como “me cambió todo”:**
  - Mitigación: mostrar claramente “qué cambió” (kcal/macros), mantener proteína ancla y explicar motivo.

## Plan de despliegue / rollout

- Introducir primero tracking diario + review sin autoapply (solo recomendación), luego activar autoapply por defecto.
- Mantener “modo manual” como fallback.

## Definition of Done

- Modo SIMPLE y FINO funcionando con gates claros.
- Revisión semanal visible y útil.
- Ajuste quincenal confiable (anti‑ruido + datos suficientes) y explicado.
- Ajuste aplica regenerando plan activo (UI consistente).
- Deshacer 24h operativo.
- Auditoría completa (aplicado + revertido).
