# Checklist: sistema-menus-profesional-omni-veg

## Fase 0 - Baseline medible

- [x] Definir salida baseline reproducible en fixture versionado.
- [x] Ejecutar baseline sobre recetas activas.
- [x] Documentar baseline y KPIs iniciales.

**Tests**

- [x] Script baseline ejecuta y genera `backend/tests/fixtures/menu_quality_baseline.json`.
- [x] Baseline muestra métricas por `meal_type` y reglas bloqueadas.

**Gate: tests de fase pasados**

- [x] OK

## Fase 5 - Afinado de selección (no bloqueante)

- [x] Reducir fallback recurrente en `recipe_examples` (objetivo: completitud diaria sin caer a deterministic en muestra de control).
- [x] Introducir score de palatabilidad contextual y diversidad por familia principal en ranking de `recipe_examples`.
- [x] Mantener estabilidad tras afinado (`fallback_count=0`, `6/6` comidas, metadata completa).

**Tests**

- [x] Smoke API de 7 días en `recipe_examples` con `fallback_count=0`.
- [x] Metadata consistente en todas las comidas (`hard_rules` + `pairing_penalty`).
- [x] Metadata de palatabilidad presente en todas las comidas (`palatability`).

**Gate: tests de fase pasados**

- [x] OK

## Fase 1 - Semántica de catálogo y reglas de aceptabilidad

- [x] Crear migración de semántica en `app.foods`.
- [x] Crear tablas `food_pairing_rules` y `meal_acceptability_rules`.
- [x] Crear y ejecutar backfill inicial de semántica.
- [x] Exponer nuevos campos semánticos en endpoint `/foods`.
- [x] Integrar hard rules mínimas en generación `recipe_examples`.

**Tests**

- [x] Unit tests de hard rules (`backend/tests/menuHardRulesEngine.test.js`).
- [x] Suite backend completa en verde.
- [x] Verificación de columnas semánticas creadas en DB.

**Gate: tests de fase pasados**

- [x] OK

## Fase 2 - Próximo bloque inmediato

- [x] Añadir lectura de `meal_acceptability_rules` desde DB en runtime.
- [x] Añadir `food_pairing_rules` al filtro hard de candidatos.
- [x] Ejecutar QA de 200 muestras y registrar tasa de coherencia.

**Tests**

- [x] Unit tests hard rules ampliados (familias requeridas/prohibidas + pairing prohibido).
- [x] Suite backend completa en verde (48/48).
- [x] QA hard rules 200 muestras (`pass_rate=98%`).

**Gate: tests de fase pasados**

- [x] OK

## Fase 3 - Próximo bloque inmediato

- [x] Diagnosticar bloqueos recurrentes de QA (`EX_D03_*`, `EX_C24_2`) y validar que no son regresión del motor.
- [x] Curar recetas bloqueadas detectadas por QA (`EX_C24_2`, `EX_C24_3` reclasificadas a `SNACK`).
- [x] Ajustar/afinar reglas `required_families` por meal_type para reducir falsos bloqueos.
- [x] Integrar scoring/penalización de `food_pairing_rules` tipo `penalty` en ranking.

**Tests**

- [x] QA hard rules 200 muestras en verde (`pass_rate=100%`).

**Gate: tests de fase pasados**

- [x] OK

## Fase 4 - Próximo bloque inmediato

- [x] Ajustar `required_families` por meal_type para no sobre-restringir recetas válidas.
- [x] Ejecutar smoke funcional en API/UI: generación diaria + revisión de metadata (`hard_rules`, `pairing_penalty`) en respuesta.
- [x] Diseñar primera tanda de reglas `penalty` adicionales basada en menús reales (no solo seeds iniciales).
- [x] Corregir generación parcial detectada en smoke (`4/6` comidas en algunos días por bloqueo total de `COMIDA/CENA`).

**Gate: tests de fase pasados**

- [x] OK
