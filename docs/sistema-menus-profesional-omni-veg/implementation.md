# Implementación activa: sistema-menus-profesional-omni-veg

## Fuente de verdad funcional

- Plan maestro: `docs/PLAN_IMPLEMENTACION_SISTEMA_MENUS_PROFESIONAL_OMNI_VEG.md`
- Matriz de cobertura fase 1: `docs/MATRIZ_COBERTURA_MENUS_FASE1.md`
- Plan temporal swap/conversiones: `docs/TEMP_PLAN_IMPLEMENTACION_SWAP_CONVERSIONES.md`

## Objetivo operativo actual

Ejecutar Fase 0 + Fase 1 del plan profesional:

1. Baseline medible de calidad de menús.
2. Semántica de catálogo para filtrar por coherencia culinaria.
3. Reglas hard mínimas para bloquear combinaciones absurdas en generación `recipe_examples`.

## Alcance de esta ejecución

- Añadir campos semánticos a `app.foods`.
- Añadir tablas de reglas (`food_pairing_rules`, `meal_acceptability_rules`).
- Backfill inicial de semántica para alimentos activos.
- Integración backend de hard rules en generación de recetas.
- Baseline reproducible en fixture versionado + documentación KPI.

## Fuera de alcance en esta pasada

- Reranker culinario avanzado (fase 5).
- Solver multiobjetivo V2 completo (fase 4).
- Orquestador V2 completo de extremo a extremo (fase 6).
