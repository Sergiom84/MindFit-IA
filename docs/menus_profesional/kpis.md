# KPIs del sistema de menús profesional (Fase 0)

## KPIs de salida (go/no-go interno)

1. Coherencia culinaria (hard rules pass)

- Fórmula: `recetas_o_menus_sin_violaciones_hard / total * 100`
- Objetivo: `>= 95%`
- Baseline actual: `99.1%` (dataset recetas activas)

2. Cumplimiento nutricional por comida

- Fórmula: `% comidas con error kcal/macros dentro de tolerancia`
- Objetivo: `>= 95%`
- Fuente: validación `menu.validacion` por comida

3. Cumplimiento nutricional diario

- Fórmula: `% días con kcal total dentro de ±5% objetivo`
- Objetivo: `>= 95%`

4. Ratio de fallback

- Fórmula: `menus_con_fallback / total_menus * 100`
- Objetivo: `<= 10%`

5. Violaciones críticas

- Fórmula: recuento de menús con alergias/dieta incumplida
- Objetivo: `0`

6. Variedad intradía

- Fórmula: `% días sin receta repetida en comidas del mismo día`
- Objetivo: `>= 95%`

## Fuentes de datos

- `backend/tests/fixtures/menu_quality_baseline.json`
- logs de generación (`mode`, `fallback`, `metadata`)
- `nutrition_meal_items` + `nutrition_meals` para validación nutricional

## Periodicidad recomendada

- Baseline/regresión: cada cambio estructural de reglas o recetario
- KPI operativo: diario en entorno de desarrollo interno
