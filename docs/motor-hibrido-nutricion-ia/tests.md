# Tests: motor híbrido nutrición IA

## Estrategia

- Unit tests para planner/validator/solver y configuración de cliente IA.
- Integración de endpoints `generate-menu` y `generate-full-day-menus`.
- No-regresión con suite backend existente.

## Casos clave

1. `mode=hybrid_ai` con key específica activa.
2. Fallback a determinista cuando IA falla o respuesta inválida.
3. Rechazo de alimentos fuera de catálogo.
4. Persistencia de items intacta.
5. Registro de auditoría creado por generación.

## Comandos

- `npm run test:backend`
- Smoke manual con backend levantado:
  - `POST /api/nutrition-v2/generate-menu`
  - `POST /api/nutrition-v2/generate-full-day-menus`

## Criterio de cierre

- Suite backend en verde.
- Endpoints híbridos responden y persisten.
- Fallback y metadata visibles.
- Sin regresiones en revisión/ajustes nutrición.

## Ejecución real (2026-02-13)

- `npm run test:backend`: ✅ 37/37 tests en verde (incluye nuevos tests híbridos y no-regresión 7d/14d).
- ESLint en archivos modificados: ✅ sin errores (solo warnings previos en `nutritionV2.js` no relacionados con este cambio).
- Smoke backend local `POST /api/nutrition-v2/generate-full-day-menus` (`mode=hybrid_ai`): ✅ `200 OK`.
  - Resultado de prueba final: `menus_generated=1`, `fallback_count=0`, `metadata_mode=hybrid_ai`, `metadata_fallback=false`.
- Smoke backend local `POST /api/nutrition-v2/generate-menu` (`mode=hybrid_ai`): ✅ `200 OK`.
  - Resultado de prueba final: `metadata.mode=hybrid_ai`, `fallback_used=false`.
- Verificación de auditoría DB: ✅ se insertó registro en `app.nutrition_menu_generation_logs` (`log_count=1` en test de smoke).

## Pendientes de test

- Validar respuesta de rechazo cuando `NUTRITION_HYBRID_ENABLED=false` en backend levantado con esa env.
