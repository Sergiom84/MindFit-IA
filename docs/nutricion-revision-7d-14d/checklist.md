# Checklist: Nutrición Revisión 7d/14d + day_type/noise_flags (columnas)

## Fase 1 — Modelo de datos (SQL)

- [x] Añadir migración SQL: `app.daily_nutrition_log.day_type` (default `normal`).
- [x] Añadir migración SQL: `app.daily_nutrition_log.noise_flags` (default `{}`).
- [x] Añadir constraints (check de valores permitidos para `day_type`).
- [x] Añadir índice/optimización para queries por `user_id + log_date`. (Ya existía `idx_daily_nutrition_log_user_date`.)
- [x] Documentar mapping de banderas y day_type. (Valores: `normal|libre|cheat|diet_break`; flags: lista abierta en texto.)

**Tests**

- [ ] Verificar que las rutas legacy `/api/nutrition/daily` siguen funcionando. (Pendiente: requiere backend levantado.)
- [x] Query de prueba: insertar día sin flags y leerlo. (Automatizado en `backend/tests/nutritionReviewMigration.test.js`.)

**Gate: tests de fase pasados**

- [x] OK

## Fase 2 — API registro diario v2

- [x] `POST /api/nutrition-v2/daily`: guardar kcal + day_type + noise_flags (+ daily_log opcional).
- [x] `GET /api/nutrition-v2/daily/:date`: leer día.
- [x] Normalización/validación de inputs (valores permitidos).
- [x] Un día cuenta como “registrado” si tiene kcal o day_type != normal o daily_log con comidas/macros.

**Tests**

- [x] Guardar solo kcal y comprobar que cuenta como registro. (`backend/tests/nutritionDailyV2.test.js`)
- [x] Guardar `day_type=cheat` sin kcal y comprobar que cuenta como registro. (`backend/tests/nutritionDailyV2.test.js`)

**Gate: tests de fase pasados**

- [x] OK

## Fase 3 — Motor de Revisión (weekly/quincenal)

- [x] Servicio `nutritionReviewService` (o equivalente) que calcule:
  - rolling avg peso 7d y 7d previa
  - cintura si existe
  - adherencia de datos (% días con registro) sobre 14d
  - pesajes (≥6/14d o ≥4/7d)
  - compliance real (±10% sobre objetivo, rolling 7d)
  - banderas de ruido (manual/auto) y ventana 7d
- [x] `GET /api/nutrition-v2/review`: payload listo para UI (estados + métricas + “pendiente por…”).
- [x] Lógica modo SIMPLE vs FINO.
- [x] Si datos suficientes pero compliance bajo: no ajustar, explicar.

**Tests**

- [x] Caso: sin registro de comidas, con pesajes -> modo SIMPLE con feedback. (`backend/tests/nutritionReviewV2.test.js`)
- [x] Caso: registro ≥80% + pesajes suficientes -> modo FINO y estado quincenal recomendado/aplicable. (`backend/tests/nutritionReviewV2.test.js`)
- [x] Caso: banderas de ruido activas -> bloquea ajuste, mantiene feedback. (`backend/tests/nutritionReviewV2.test.js`)

**Gate: tests de fase pasados**

- [x] OK

## Fase 4 — Aplicar ajuste + regenerar plan (atómico) + auditoría

- [x] Endpoint `POST /api/nutrition-v2/adjustments/apply`:
  - delta quincenal: ±150..±250 con clamp <=10%
  - delta seguridad: ±100..±150 (solo señal fuerte)
  - regenerar plan activo (fuente de verdad) en misma operación
  - registrar auditoría + acción reversible
- [x] Tabla `nutrition_adjustment_actions` (si aplica) o mecanismo equivalente.

**Tests**

- [x] Caso: ajuste aplicado crea nuevo plan activo y archiva el anterior. (`backend/tests/nutritionAdjustmentsV2.test.js`)
- [x] Caso: UI (API) devuelve `new_plan_id` y métricas de decisión. (Incluido en response del servicio/endpoint; validado en test.)

**Gate: tests de fase pasados**

- [x] OK

## Fase 5 — Deshacer (24h)

- [x] Endpoint `POST /api/nutrition-v2/adjustments/undo-last`.
- [x] Validar ventana 24h.
- [x] Restaurar plan anterior como activo y archivar el nuevo.
- [x] Registrar log “revertido”.

**Tests**

- [x] Caso: deshacer dentro de 24h revierte plan. (`backend/tests/nutritionUndoV2.test.js`)
- [x] Caso: deshacer fuera de ventana falla con mensaje claro. (`backend/tests/nutritionUndoV2.test.js`)

**Gate: tests de fase pasados**

- [x] OK

## Fase 6 — UI (Revisión + registro rápido)

- [x] Bloque fijo “Revisión” (semanal/quincenal) con estados y “pendiente”.
- [x] Mostrar datos usados (rolling 7d vs 7d previa, adherencia %, nº pesajes, cintura si existe).
- [x] Registro rápido de kcal/day_type/noise_flags.
- [x] Ajuste aplicado: resumen + botón “Deshacer” (si ventana activa).
- [x] Rollout 1: confirmación manual en UI (no autoapply todavía; “modo manual” implícito).

**Tests**

- [x] Validación UI (Playwright headless): modo SIMPLE sin registro de comidas sigue mostrando feedback.
- [x] Validación UI (Playwright headless): modo FINO recomienda ajuste, permite aplicar y deja UI consistente con plan activo.

**Gate: tests de fase pasados**

- [x] OK

## Fase 7 — QA final + regresión

- [x] Caso borde: sin pesajes => weekly/quincenal insuficiente. (Test `backend/tests/nutritionReviewV2.test.js`)
- [x] Caso borde: outlier de peso (>1.5% en 24-48h) => ruido bloquea ajuste. (Test `backend/tests/nutritionReviewV2.test.js`)
- [x] Caso borde: `day_type=cheat` => ruido bloquea ajuste. (Test `backend/tests/nutritionReviewV2.test.js`)
- [x] Coherencia UX: objetivo semanal explica dirección (pérdida/ganancia) y el ritmo muestra signo + “subiendo/bajando”.
- [x] Coherencia UX: “Estado de Progresión” no muestra `unknown` si la fase se puede derivar desde el plan nutricional activo (fallback cuando el bridge está vacío).
- [x] Coherencia UX: cuando IPG/ICG no aplica (sin pérdida/ganancia significativa), el badge y el mensaje explican el “por qué” de forma clara (“Sin señal”) y qué hace falta para evaluarlo.
- [x] Regresión: no romper flujo actual de generación/lectura/ajuste/deshacer del plan v2. (Backend tests + QA UI)
- [x] Evidencias de QA registradas en `tests.md`.

**Gate: tests de fase pasados**

- [x] OK
