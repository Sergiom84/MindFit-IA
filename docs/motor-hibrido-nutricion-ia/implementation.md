# Plan detallado de implementacion: motor hibrido de menus (IA + determinista)

Fecha: 13.02.2026  
Contexto: existe generacion determinista en `nutrition-v2` y queremos evolucionar a un motor hibrido que use IA para planificar mejor la variedad, manteniendo validaciones duras y coherencia nutricional con el motor actual.

## 1. Objetivo

Construir un motor de menus diario que:

- use IA para elegir combinaciones con sentido culinario y variedad real,
- use logica determinista para cuadrar kcal/macros y reglas de seguridad,
- trabaje solo con alimentos/platos de nuestra BD,
- sea trazable, testeable y con fallback automatico a modo determinista.

## 2. Alcance (esta fase)

Incluye:

- backend de planificacion hibrida para `generate-menu` y `generate-full-day-menus`,
- configuracion de API key dedicada (`OPENAI_API_KEY_NUTRITION`) y modelo configurable,
- validacion de salida IA por esquema y reglas de negocio,
- persistencia de menus/items y metadatos de decision,
- UI para ejecutar modo hibrido y mostrar razon del resultado.

No incluye (fase posterior):

- recomendador semanal de rotacion avanzada por preferencias aprendidas,
- fine-tuning/modelo propio,
- sistema de ranking por feedback explicito del usuario (like/dislike) completo.

## 3. Principios de arquitectura

1. IA decide "que combinacion tiene sentido" (planning).
2. Determinista decide "si cumple objetivos y como ajustar gramos" (solver).
3. Datos de la BD son fuente unica para alimentos y factores.
4. Si falla IA o no pasa validacion, fallback inmediato a determinista.
5. Todo ajuste debe ser explicable y auditable.

## 4. Estado actual (base tecnica)

- Endpoints activos:
  - `POST /api/nutrition-v2/generate-menu`
  - `POST /api/nutrition-v2/generate-full-day-menus`
- Modo actual por defecto en UI: `mode: "deterministic"` (`src/components/nutrition/NutritionCalendarView.jsx`).
- Persistencia de items: `app.nutrition_meal_items`.
- Factores de conversion: `GET /api/nutrition-v2/food-conversion-factors`.
- IA nutricion en backend hoy usa key unificada (`OPENAI_API_KEY`) y modelo legacy en rutas (`gpt-4`/`gpt-4o-mini`).

## 5. Diseño funcional del motor hibrido

## 5.1 Flujo por comida

1. Reunir contexto:

- objetivo de macros de la comida,
- tipo de comida (desayuno/comida/cena/snack),
- restricciones (alergias, dieta, preferencias),
- historial reciente (7 dias) para evitar repeticion.

2. IA genera "borrador de menu" en JSON estructurado:

- seleccion de items candidatos (ids reales BD),
- racional corto (por que esa combinacion),
- alternativa A/B opcional.

3. Validador estricto:

- ids existen,
- no rompe alergias/restricciones,
- no repite de forma prohibida,
- formato correcto.

4. Solver determinista:

- ajusta gramos para cumplir kcal/macros objetivo,
- respeta limites por item y conversiones,
- minimiza desviacion y evita cantidades absurdas.

5. Persistencia y salida:

- guarda items finales,
- guarda metadata (modo, modelo, motivo, fallback si aplica),
- responde a UI con explicacion legible.

## 5.2 Flujo por dia completo

1. Ejecutar planificador IA con vision de dia completo.
2. Repartir variedad entre comidas (no repetir bases iguales innecesariamente).
3. Resolver cada comida con el solver determinista compartiendo contexto del mismo dia.
4. Guardar todo en una sola operacion consistente.

## 6. Fases de implementacion

## Fase 0. Contrato tecnico y feature flags

Objetivo:

- introducir el modo hibrido sin romper el flujo actual.

Tareas:

- añadir `hybrid_ai` a `VALID_MENU_GENERATION_MODES` en `backend/routes/nutritionV2.js`.
- crear flags de runtime:
  - `NUTRITION_HYBRID_ENABLED=true|false`
  - `NUTRITION_HYBRID_MODEL=gpt-5.2` (configurable)
  - `OPENAI_API_KEY_NUTRITION` (preferente) con fallback controlado.
- definir politica de fallback (IA->determinista).

Criterio de salida:

- `mode=hybrid_ai` aceptado por API y desactivable por flag.

## Fase 1. Cliente IA dedicado nutricion

Objetivo:

- separar costes y control del modulo nutricion.

Tareas:

- actualizar `backend/lib/openaiClient.js` para que `nutrition` use `OPENAI_API_KEY_NUTRITION`.
- mantener fallback a `OPENAI_API_KEY` solo si no hay key especifica (con log claro).
- exponer helper de config/modelo para nutricion.

Criterio de salida:

- logs muestran que nutricion usa key dedicada cuando existe.

## Fase 2. Servicio planificador IA estructurado

Objetivo:

- crear servicio de planificacion de menu con salida estricta JSON.

Tareas:

- crear `backend/services/nutritionHybridPlanner.js`.
- definir prompt de sistema con reglas cerradas:
  - solo IDs de alimentos permitidos,
  - prohibido inventar items,
  - variedad intra-dia e inter-dia,
  - respeto alergias/restricciones.
- implementar respuesta con `response_format`/esquema JSON validable.
- incluir `temperature` conservadora y top-p bajo para estabilidad.

Criterio de salida:

- planner devuelve JSON valido >95% de veces en pruebas de lote.

## Fase 3. Validador + solver determinista

Objetivo:

- blindar calidad y coherencia nutricional.

Tareas:

- crear `backend/services/nutritionHybridValidator.js`.
- crear `backend/services/nutritionHybridSolver.js` aprovechando logica existente.
- reglas de aceptacion:
  - desviacion kcal por comida <= umbral,
  - proteina minima por comida,
  - limites de gramos por alimento,
  - no outliers (ej: 400g cebolla en desayuno salvo caso excepcional).
- si no cumple, reintentar IA 1 vez con feedback estructurado; si vuelve a fallar, fallback determinista.

Criterio de salida:

- resultados aceptables y estables en escenarios reales.

## Fase 4. Orquestacion en endpoints actuales

Objetivo:

- integrar sin romper contratos de API existentes.

Tareas:

- extender `generateMenuForMeal` para `mode=hybrid_ai`.
- extender `POST /generate-full-day-menus` para modo hibrido con contexto compartido del dia.
- mantener persistencia en `nutrition_meal_items`.
- agregar metadata de decision en respuesta:
  - `mode_used`, `model_used`, `fallback_used`, `validation_summary`.

Criterio de salida:

- endpoint devuelve menus hibridos con fallback transparente.

## Fase 5. Persistencia de auditoria y trazabilidad

Objetivo:

- poder explicar y depurar cada generacion.

Tareas:

- agregar tabla de auditoria (migracion nueva):
  - `app.nutrition_menu_generation_logs`.
- guardar por ejecucion:
  - usuario, dia/comida, modo solicitado/usado,
  - modelo, latencia, tokens/coste estimado,
  - motivo de fallback,
  - metricas de calidad (desviacion macros, variedad).

Criterio de salida:

- cada menu generado deja traza consultable.

## Fase 6. UI (control + explicabilidad)

Objetivo:

- que el usuario entienda que ha generado el sistema y por que.

Tareas:

- `src/components/nutrition/NutritionCalendarView.jsx`:
  - selector de modo (`deterministic` | `hybrid_ai`),
  - estado de generacion y fallback.
- `src/components/nutrition/MealDetailView.jsx`:
  - mostrar "menu generado con IA + ajuste automatico",
  - mostrar motivo breve y calidad (kcal/macros objetivo vs final).
- mantener `deterministic` como modo seguro de respaldo.

Criterio de salida:

- UX clara y sin ambiguedad de que motor se uso.

## Fase 7. QA tecnico y funcional

Objetivo:

- validar robustez antes de habilitar para todos.

Tareas backend:

- tests unitarios nuevos:
  - planner parse,
  - validador,
  - solver,
  - fallback.
- tests integracion:
  - `/generate-menu` y `/generate-full-day-menus` en `hybrid_ai`.
- no-regresion:
  - mantener tests existentes en verde (`nutritionReview`, `daily`, `adjustments`).

Tareas funcionales:

- lote de 30 generaciones (diferentes perfiles/dias).
- KPI minima:
  - repeticion intra-dia < 10%,
  - desviacion kcal diaria dentro de rango definido,
  - 0 violaciones de alergias.

Criterio de salida:

- criterios de QA en verde y lista de edge cases cerrada.

## Fase 8. Despliegue gradual

Objetivo:

- minimizar riesgo en produccion.

Tareas:

- activar por porcentaje de usuarios o por rol interno.
- monitorear coste, latencia, ratio fallback y calidad de menu.
- si degradacion: rollback por flag sin despliegue.

Criterio de salida:

- modo hibrido estable y apto para activar por defecto.

## 7. Cambios de codigo previstos (mapa de archivos)

Backend:

- `backend/lib/openaiClient.js`
- `backend/routes/nutritionV2.js`
- `backend/services/nutritionHybridPlanner.js` (nuevo)
- `backend/services/nutritionHybridValidator.js` (nuevo)
- `backend/services/nutritionHybridSolver.js` (nuevo)
- `backend/services/nutritionHybridOrchestrator.js` (opcional nuevo)
- `supabase/migrations/XXXXXX_nutrition_menu_generation_logs.sql` (nuevo)

Frontend:

- `src/components/nutrition/NutritionCalendarView.jsx`
- `src/components/nutrition/MealDetailView.jsx`

Docs/tests:

- `docs/` (status/checklist si abrimos impl-pack)
- `backend/tests/*` (suite hibrida)

## 8. Reglas de negocio cerradas para esta implementacion

1. La IA no inventa alimentos ni macros.
2. El ajuste final de gramos lo manda el solver determinista.
3. Si no hay datos suficientes o falla IA, se usa determinista.
4. Se prioriza seguridad nutricional sobre creatividad.
5. Todo resultado debe poder explicarse en 1-2 lineas en UI.

## 9. Riesgos y mitigacion

Riesgo 1: salida IA inconsistente.  
Mitigacion: esquema JSON estricto + validador + reintento + fallback.

Riesgo 2: aumento de coste/latencia.  
Mitigacion: modelo configurable, limites de tokens, cache de candidatos por comida, despliegue gradual.

Riesgo 3: incoherencia visual (perfil vs plan).  
Mitigacion: seguir usando plan activo como fuente de verdad y persistir en la misma operacion.

Riesgo 4: regresion de motor ya estable.  
Mitigacion: feature flag + no-regresion obligatoria en tests existentes.

## 10. Definicion de "hecho"

Queda completado cuando:

1. `hybrid_ai` funciona en ambos endpoints (`generate-menu` y `generate-full-day-menus`).
2. Usa `OPENAI_API_KEY_NUTRITION` + modelo configurable.
3. Cumple validaciones y fallback automatico.
4. Persiste items y logs de auditoria.
5. UI muestra modo usado y explicacion.
6. Tests backend y smoke funcional en verde.

## 11. Orden recomendado de ejecucion

1. Fase 0
2. Fase 1
3. Fase 2
4. Fase 3
5. Fase 4
6. Fase 5
7. Fase 6
8. Fase 7
9. Fase 8
