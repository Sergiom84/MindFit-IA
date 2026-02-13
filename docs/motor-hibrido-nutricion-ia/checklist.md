# Checklist: motor híbrido nutrición IA

## Fase 0 - Contrato técnico y flags

- [x] Añadir `hybrid_ai` a modos válidos en API.
- [x] Añadir flags `NUTRITION_HYBRID_ENABLED` y `NUTRITION_HYBRID_MODEL`.
- [x] Definir fallback IA -> determinista.

**Tests**

- [x] Request con `mode=hybrid_ai` aceptada cuando flag activo.
- [ ] Request con `mode=hybrid_ai` rechazada cuando flag desactivado. (pendiente validar con backend arrancado en modo flag OFF)

**Gate: tests de fase pasados**

- [ ] OK (pendiente test de flag OFF)

## Fase 1 - Cliente IA dedicado nutrición

- [x] Usar `OPENAI_API_KEY_NUTRITION` como key preferida.
- [x] Mantener fallback controlado a `OPENAI_API_KEY`.
- [x] Modelo configurable por env para nutrición.

**Tests**

- [x] Test unitario de resolución de key/env para nutrición.

**Gate: tests de fase pasados**

- [x] OK

## Fase 2 - Planner IA estructurado

- [x] Crear servicio `nutritionHybridPlanner`.
- [x] Forzar salida JSON estructurada.
- [x] Evitar alimentos inventados (solo IDs/slug conocidos).

**Tests**

- [x] Test unitario parser/normalización de salida del planner.

**Gate: tests de fase pasados**

- [x] OK

## Fase 3 - Validador + solver determinista

- [x] Crear servicio `nutritionHybridValidator`.
- [x] Crear servicio `nutritionHybridSolver`.
- [x] Definir reglas de aceptación y fallback si no valida.

**Tests**

- [x] Test unitario solver (kcal/macros dentro de tolerancia razonable).
- [x] Test unitario validador (rechaza ítems fuera de catálogo).

**Gate: tests de fase pasados**

- [x] OK

## Fase 4 - Orquestación endpoints

- [x] Integrar `hybrid_ai` en `generate-menu`.
- [x] Integrar `hybrid_ai` en `generate-full-day-menus`.
- [x] Mantener persistencia de `nutrition_meal_items`.

**Tests**

- [x] Test integración `generate-menu` con fallback.
- [x] Test integración `generate-full-day-menus` con metadata.

**Gate: tests de fase pasados**

- [x] OK

## Fase 5 - Auditoría

- [x] Crear migración tabla `nutrition_menu_generation_logs`.
- [x] Guardar modo/modelo/fallback/métricas básicas por ejecución.

**Tests**

- [x] Test DB inserción de log de generación.

**Gate: tests de fase pasados**

- [x] OK

## Fase 6 - UI

- [x] Añadir selector de modo en `NutritionCalendarView`.
- [x] Mostrar metadata/fallback en feedback al usuario.

**Tests**

- [x] QA manual: deterministic e hybrid_ai funcionando.

**Gate: tests de fase pasados**

- [x] OK

## Fase 7 - QA final

- [x] Correr `npm run test:backend`.
- [x] Smoke de endpoints de generación en backend local.
- [x] Revisar no regresión de revisión 7d/14d.

**Gate: tests de fase pasados**

- [x] OK
