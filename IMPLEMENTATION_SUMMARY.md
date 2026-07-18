# Estado actual del repositorio

Fecha de revisión: 2026-07-18

> **Auditoría ECI**: el estado de cierre de cada hallazgo (SEC-004, DB-001, AUTH-001,
> AI-001, DEP-001, ARCH/OPS/P3) vive en [docs/AUDITORIA-ECI-CIERRE.md](docs/AUDITORIA-ECI-CIERRE.md),
> que es el índice vivo. Los snapshots antiguos son históricos, no la fuente de verdad.

## Frontend confirmado en código

- `src/App.jsx` carga por lazy loading las rutas principales: `/`, `/home-training`, `/methodologies`, `/oposiciones`, `/routines`, `/profile`, `/nutrition`, `/video-correction`, `/menstrual-cycle`, `/login` y `/register`.
- `src/providers/AppProviders.jsx` envuelve autenticación, usuario, trazas, workout y debugging.
- `src/providers/DebugProvider.jsx` expone `window.__DEBUG_CONTEXTS` en desarrollo.
- El flujo principal de nutrición vive en `src/components/nutrition/`.
- `src/components/nutrition/FoodDatabase.jsx` sigue existiendo, pero no está montado en la experiencia principal actual.

## Backend confirmado en código

- `backend/server.js` centraliza las APIs de entrenamiento en:
  - `/api/routine-generation`
  - `/api/training-session`
  - `/api/training`
  - `/api/exercise-catalog`
  - `/api/progress`
- Además siguen activos:
  - `/api/auth`, `/api/users`, `/api/uploads`
  - `/api/nutrition`, `/api/nutrition-v2`, `/api/metabolic-profile`, `/api/nutrition/calibration`
  - `/api/bridge`, `/api/diet-deviation`, `/api/body-measurements`, `/api/carb-timing`
  - `/api/performance-confirmation`, `/api/nutrition/supplements`
  - `/api/hipertrofiav2`, `/api/adaptation`, `/api/menstrual-cycle`
  - `/api/music`, `/api/analytics`, `/api/ai`, `/api/ai-photo-correction`
- El backend también sirve `dist/` y mantiene aliases legacy para `routines` y `home-training`.

## Estado real de Nutrición V2

- `GET /api/nutrition-v2/active-plan` devuelve días, comidas e ítems persistidos en `app.nutrition_meal_items`.
- `POST /api/nutrition-v2/generate-full-day-menus` persiste menús por defecto (`persist = true`).
- `GET /api/nutrition-v2/foods` ya soporta filtros por búsqueda, categoría, categoría detalle, dieta, alérgenos excluidos, estado base, grupo de factor y compatibilidad de sustitución.
- `GET /api/nutrition-v2/food-conversion-factors` expone la tabla de conversiones de pesado.
- `src/components/nutrition/NutritionCalendarView.jsx` tiene la generación de menús habilitada (`menusEnabled = true`).

## Verificación disponible

- `npm run lint` para consistencia de código.
- `npm run test:backend` para la suite Node de `backend/tests/`.
- `npx playwright test` para `tests/`, con arranque manual del entorno.
- `npm test` en raíz sigue siendo un placeholder y no debe leerse como cobertura real.

## Criterio documental

- La raíz queda reservada para guías vigentes y resúmenes de alto nivel.
- Los detalles extensos por feature viven en `docs/`.
- Las notas antiguas de hitos cerrados se han reducido o retirado para que la raíz no describa estados ya superados por el código.
