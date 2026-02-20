# Smoke API `recipe_examples` (2026-02-20)

## Entorno

- Backend local levantado en `http://127.0.0.1:3010`
- Usuario test: `user_id=33`
- Endpoint validado: `POST /api/nutrition-v2/generate-full-day-menus`

## Caso 1 (día de referencia)

- `day_id`: `80e33914-25a6-41bd-9a8e-3999b78998f5`
- Resultado:
  - `status=200`
  - `menus_generated=6`
  - `total_meals=6`
  - `fallback_count=0`
  - Todas las comidas en `mode=recipe_examples`
  - Todas las comidas con metadata `hard_rules` y `pairing_penalty`

## Caso 2 (muestra 7 días)

- Resultado agregado tras fix:
  - `allComplete=true` (`6/6` comidas en los 7 días probados)
  - penalties aplicadas (`anyPenalty=true`)
  - en días conflictivos se activa fallback por comida a `deterministic` (sin perder completitud)

- Días con fallback observado:
  - `bc4141a2-1a60-4b14-b485-ff0aaab4e3a5` (`fallback_count=3`)
  - `b137e2d3-7fdc-4d39-a45f-56707028901a` (`fallback_count=3`)
  - `7bcb3d5d-c79a-4afe-b88b-4f5108b1e10c` (`fallback_count=3`)
  - `53039c9f-d84f-4ff7-b28c-4d674411f416` (`fallback_count=2`)

## Estado actual

- Corregida la generación parcial `4/6`.
- Metadata consistente en todos los menús (`hard_rules` + `pairing_penalty`, también cuando hay fallback).

## Afinado posterior (misma fecha)

- Diagnóstico de bloqueo masivo:
  - causa raíz detectada en logs: `daily_processed_limit` acumulado en `recipe_examples`.
- Ajustes aplicados:
  - `DETERMINISTIC_MAX_RECIPE_TRIES`: `16 -> 40`.
  - Evaluación hard de `recipe_examples` sin acumulado diario de procesados (`varietyContext: null` en `evaluateRecipeHardRules`), manteniendo límite por receta.
  - Mensaje de error enriquecido con códigos de regla bloqueante para diagnóstico.
- Resultado tras ajuste:
  - muestra de 7 días: `6/6` comidas en todos los días.
  - `fallback_count=0` en todos los días de la muestra.
  - metadata consistente en todos los menús (`hard_rules` + `pairing_penalty`).

## Afinado de palatabilidad (misma fase)

- Se añade en ranking de `recipe_examples`:
  - penalización contextual por palatabilidad de receta.
  - penalización por repetición de familia principal dentro del mismo día.
- Metadata ampliada: cada comida incluye bloque `palatability`.
- Validación:
  - muestra de 7 días mantiene `6/6` y `fallback_count=0`.
  - metadata completa en todas las comidas (`hard_rules`, `pairing_penalty`, `palatability`).
