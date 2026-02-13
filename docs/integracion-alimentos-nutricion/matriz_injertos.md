# Matriz de injertos (Fase 0)

## Bloques que se conservan desde `main` (intocables)

- `GET /api/nutrition-v2/daily/:date`
- `POST /api/nutrition-v2/daily`
- `GET /api/nutrition-v2/review`
- `POST /api/nutrition-v2/adjustments/apply`
- `POST /api/nutrition-v2/adjustments/undo-last`
- Logica de revision semanal/quincenal (rolling 7d/14d, ruido, adherencia, apply/undo).

## Bloques a injertar desde `origin/alimentos`

- `GET /api/nutrition-v2/food-conversion-factors`
- `GET /api/nutrition-v2/foods` avanzado (filtros: dieta, alergias, estado, grupo, paginacion)
- Persistencia de `nutrition_meal_items` al generar menus
- `GET /api/nutrition-v2/active-plan` enriquecido con `meals.items`
- Motor determinista de menu por plantillas/roles + fallback IA
- UI de items y conversiones:
  - `src/components/nutrition/MealDetailView.jsx`
  - `src/components/nutrition/NutritionCalendarView.jsx`

## Diferencias clave detectadas de endpoints

- Solo en `main`:
  - `GET /daily/:date`
  - `POST /daily`
  - `GET /review`
  - `POST /adjustments/apply`
  - `POST /adjustments/undo-last`
- Solo en `origin/alimentos`:
  - `GET /food-conversion-factors`

## Estrategia de integracion

- Base de archivo: `backend/routes/nutritionV2.js` de `main`.
- Integracion por bloques (no merge masivo/cherry-pick total).
- Gate obligatorio por fase: no regresion de endpoints 7d/14d.
