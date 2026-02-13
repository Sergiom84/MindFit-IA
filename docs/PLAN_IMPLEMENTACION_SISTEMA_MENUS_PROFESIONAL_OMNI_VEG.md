# Plan de Implementación Profesional

## Sistema de Menús Coherentes + Macros basado en Recetas (Omnívoro y Vegetariano)

Versión: 1.1  
Fecha: 2026-02-13  
Estado: Aprobado para ejecución  
Ámbito de esta iteración: `omnivoro` + `vegetariano` (vegano fuera de alcance temporal)

---

## 1. Objetivo de producto

Construir un motor de menús que, para cada día y tipo de día (entreno/descanso), genere comidas:

- Nutricionalmente correctas (kcal/macros por comida y total diario dentro de tolerancias).
- Culinariamente coherentes (desayuno/comida/cena/almuerzo/merienda con sentido real).
- Variadas (sin repeticiones absurdas intra-día y con control semanal).
- Explicables y auditables (por qué eligió cada comida, por qué descartó otras).

---

## 2. Decisiones cerradas

1. Dietas incluidas en esta implementación: `omnivoro` y `vegetariano`.
2. Estructura de comidas configurable: de `3 a 6 comidas/día` (en entreno y descanso), con `4` como recomendación por defecto.
3. Reparto kcal en día de entreno según número de comidas:
   - 3 comidas: `30% / 40% / 30%`
   - 4 comidas: `25% / 31% / 19% / 25%`
   - 5 comidas: `22% / 28% / 16% / 14% / 20%`
   - 6 comidas: `18% / 24% / 14% / 12% / 14% / 18%`
     Nota: el reparto final podrá microajustarse por hora de entrenamiento (pre/post), manteniendo total diario y reglas de fase.
4. Reglas duras culinarias:
   - En `COMIDA` y `CENA` no se permite base de comida con barritas/galletas/margarina/untables industriales salvo excepción explícita.
5. Procesados:
   - Máximo 1 alimento procesado al día.
   - Nunca como base principal de `COMIDA` o `CENA`.
6. Repetición:
   - No repetir alimento dentro del mismo día.
   - Máximo 2 repeticiones por semana (por alimento).
7. Tolerancias nutricionales:
   - ±8% kcal por comida.
   - ±5% kcal en total diario.
   - proteína diaria mínima obligatoria.
8. Fallback:
   - Hasta 3 intentos de generación.
   - Si falla: menú seguro predefinido por tipo de comida.
9. Estrategia de generación oficial:
   - Fuente principal: recetario curado.
   - Alimentos sueltos: solo fallback controlado.
10. Preferencias del usuario:

- Alergias/intolerancias = hard rule.
- Gustos = soft rule.

11. Edición manual:
    - Permitida, con recálculo instantáneo de gramos/macros.
12. Criterio go-live interno:
    - > 95% menús coherentes.
    - > 95% menús dentro de tolerancia diaria.
13. Prioridad:
    - Primero coherencia culinaria.
    - Después variedad avanzada.

---

## 3. Alcance y no alcance

### 3.1 Alcance

- Modelo de datos semántico para alimentos y recetario.
- Motor de generación v2 con pipeline robusto de recetas (reglas + solver + reranking).
- Integración completa en backend `nutritionV2`.
- Ajustes UI para transparencia, control y edición.
- QA automatizado + dataset de evaluación + métricas operativas.

### 3.2 No alcance (esta iteración)

- Dieta `vegana` completa.
- Micronutrientes, suplementos y listas de compra avanzadas.
- Integraciones externas de supermercados o pricing.

---

## 4. Arquitectura objetivo (profesional)

Pipeline por comida:

1. **Input Normalization**
   - objetivo kcal/macros, tipo de día, `comidas_por_dia` (3-6), meal_type, dieta, alergias, preferencias.
2. **Recipe Candidate Builder**
   - genera candidatos desde recetas curadas válidas para ese meal_type (no desde alimentos sueltos).
3. **Hard Rules Filter (bloqueante)**
   - alergias, dieta, restricciones por meal_type, procesados, repetición, reglas culinarias.
4. **Macro Solver (determinista)**
   - escala porciones de receta para cumplir objetivo de comida (kcal + macros).
5. **Culinary Reranker (soft rules)**
   - puntúa aceptabilidad culinaria y adherencia esperada.
6. **Validator**
   - valida tolerancias por comida y consistencia del día.
7. **Fallback Manager**
   - reintentos controlados con nuevas recetas y, si falla, menú seguro; alimentos sueltos solo como último recurso.
8. **Audit Logger**
   - guarda decisiones, descartes y score final.

---

## 5. Modelo de datos objetivo

## 5.1 Nuevos campos en `app.foods`

- `meal_suitability jsonb`
  - ejemplo: `{ "desayuno": true, "comida": true, "cena": false, "snack": true }`
- `processing_level text`
  - valores: `minimo`, `procesado`, `ultraprocesado`
- `culinary_family text`
  - ejemplo: `cereal`, `legumbre`, `proteina_magra`, `untable`, `snack_dulce`.
- `is_snack_only boolean default false`
- `is_main_dish_allowed boolean default true`
- `palatability_score numeric(5,2)` (0-100)

## 5.2 Nueva tabla `app.food_pairing_rules`

- `id uuid pk`
- `food_slug_a text`
- `food_slug_b text`
- `rule_type text` (`forbidden`, `penalty`, `preferred`)
- `penalty numeric(6,2)`
- `contexts text[]` (ej. `['CENA','COMIDA']`)
- `reason text`

## 5.3 Nuevas tablas de recetario

- `app.recipes`
  - `id uuid pk`
  - `recipe_code text unique`
  - `name text`
  - `meal_type text` (`DESAYUNO`, `COMIDA`, `SNACK`, `CENA`)
  - `diet_type text` (`omnivoro`, `vegetariano`)
  - `day_context text[]` (`ENTRENO`, `DESCANSO`, `AMBOS`)
  - `processing_profile text`
  - `coherence_base_score numeric(5,2)`
  - `is_active boolean`
  - `created_at`, `updated_at`
- `app.recipe_items`
  - `id uuid pk`
  - `recipe_id uuid fk`
  - `food_id uuid fk`
  - `grams_base numeric(8,2)`
  - `estado_pesado_base text`
  - `role text`
  - `is_optional boolean`
  - `order_index int`
- `app.recipe_tags`
  - `recipe_id uuid fk`
  - `tag text`

## 5.4 Nueva tabla `app.meal_acceptability_rules`

- reglas por `meal_type` y dieta:
  - max procesados,
  - familias obligatorias,
  - familias prohibidas,
  - límites de combinaciones.

## 5.5 Tabla de score/auditoría extendida

Extender `app.nutrition_menu_generation_logs` con:

- `coherence_score`
- `variety_score`
- `processing_score`
- `blocked_rules jsonb`
- `selected_template_code`
- `generation_attempts`

---

## 6. Plan por fases (ultra detallado)

## Fase 0 - Kickoff técnico y baseline medible

### Objetivo

Congelar baseline actual para medir mejora real.

### Tareas

1. Definir dataset de casos de prueba reales (al menos 50 días: entreno y descanso).
2. Ejecutar motor actual y guardar outputs (JSON) como baseline.
3. Etiquetar manualmente una muestra (100 comidas) con `coherente/no coherente`.
4. Definir fórmula de KPIs y dashboard local.

### Entregables

- `docs/menus_profesional/baseline.md`
- `docs/menus_profesional/kpis.md`
- dataset inicial en `backend/tests/fixtures/menu_quality_baseline.json`

### Tests

- Script de evaluación baseline ejecutable.
- Snapshot de resultados versionado.

### Gate salida

- Baseline reproducible con métricas iniciales.

---

## Fase 1 - Semántica de catálogo y reglas de aceptabilidad

### Objetivo

Hacer que el catálogo exprese “qué alimento encaja en qué comida”.

### Tareas backend/DB

1. Crear migración con nuevos campos en `app.foods`.
2. Crear tablas `food_pairing_rules` y `meal_acceptability_rules`.
3. Backfill inicial automático con heurísticas:
   - por `categoria`, `categoria_detalle`, `metodo_preparacion`, `tags`, `role`.
4. Crear script de curación asistida para revisar alimentos conflictivos.

### Tareas de datos

1. Curar lista roja inicial (ej. barrita, galletas, margarina, cremas untables) por meal_type.
2. Marcar `is_snack_only` y `is_main_dish_allowed`.
3. Definir `processing_level` para 100% de alimentos usados por el motor.

### Entregables

- Migraciones SQL.
- Script `scripts/nutrition/backfill_food_semantics.mjs`.
- Documento `docs/menus_profesional/reglas_aceptabilidad_v1.md`.

### Tests

- SQL tests de integridad de nuevos campos.
- Cobertura: 0 nulos en campos críticos para alimentos activos.

### Gate salida

- Catálogo semántico listo para alimentar filtros duros.

---

## Fase 2 - Biblioteca de platos/plantillas por meal_type

### Objetivo

Construir recetario curado que sea la fuente principal de generación.

### Tareas

1. Definir esquema e ingesta de recetas (`recipes`, `recipe_items`, `recipe_tags`).
2. Crear recetario inicial curado por `meal_type`:
   - dataset semilla: importar `Biblioteca_Platos_Plantillas_MindFeed_v2_2_final.xlsx` (hoja `Ejemplos`) como base inicial de recetas.
   - mínimo operativo: 50 recetas por tipo.
   - objetivo robusto: 100 recetas por tipo.
3. Cubrir etiquetas de contexto:
   - `diet_type`, `day_context`, `processing_profile`, `tags`.
4. Definir “safe menus” por meal_type para fallback.
5. Definir alias funcionales de UX:
   - `almuerzo` y `merienda` mapeados a `SNACK` con etiquetas de franja horaria.

### Entregables

- SQL seeds de recetario v1.
- `docs/menus_profesional/biblioteca_recetas_v1.md`.

### Tests

- Validador de cobertura por meal_type y dieta.
- Ninguna receta activa sin ingredientes válidos ni macros calculables.

### Gate salida

- Recetario usable con cobertura mínima definida.

---

## Fase 3 - Hard Rules Engine (capa bloqueante)

### Objetivo

Evitar por diseño menús absurdos.

### Tareas

1. Implementar módulo `menuHardRulesEngine`.
2. Reglas bloqueantes:
   - dieta/alergias/intolerancias,
   - `meal_suitability`,
   - `is_snack_only` fuera de snack,
   - límite procesados por día,
   - no repetición intra-día,
   - pairings prohibidos por contexto.
3. Mensajes de bloqueo estructurados para auditoría.
4. Bloqueo de receta completa si incumple reglas de contexto meal_type.

### Entregables

- `backend/services/menuHardRulesEngine.js`
- tests unitarios de reglas.

### Tests

- Casos bloqueados y permitidos por meal_type.
- Regresión: no rompe generación actual cuando reglas permiten.

### Gate salida

- 0 menús con violaciones hard rule en dataset de validación.

---

## Fase 4 - Solver nutricional multiobjetivo

### Objetivo

Cumplir macros ajustando porciones de receta sin romper coherencia.

### Tareas

1. Implementar solver de escalado de porciones por receta:
   - variable principal: factor de escala por receta.
   - ajuste fino opcional por ingrediente escalable.
2. Función objetivo multi-criterio:
   - error kcal/macros,
   - penalización por procesado,
   - penalización por baja aceptabilidad.
3. Añadir límites de gramos por ingrediente/familia para evitar porciones absurdas.
4. Integrar límites por proteína mínima por comida.
5. Configurar tolerancias por meal_type.

### Entregables

- `backend/services/menuMacroSolverV2.js`
- configuración `backend/config/menuSolverConfig.js`

### Tests

- Unit tests solver con casos extremos.
- Validación estadística de tolerancias (batch test).

### Gate salida

- > 95% comidas en tolerancia individual de kcal/macros.

---

## Fase 5 - Culinary Reranker (calidad de plato)

### Objetivo

Elegir entre candidatos válidos el más “comible” y lógico.

### Tareas

1. Implementar score de coherencia culinaria:
   - compatibilidad de familias,
   - forma del plato,
   - penalización de combinaciones snack-industrial en `COMIDA/CENA`,
   - penalización por repetición semanal.
2. Añadir score de adherencia esperada (preferencias usuario).
3. Rankeo final top-N y selección determinista reproducible.

### Entregables

- `backend/services/menuCulinaryReranker.js`
- `docs/menus_profesional/scoring_culinario_v1.md`

### Tests

- Pruebas A/B offline vs baseline:
  - subida de coherencia culinaria.

### Gate salida

- Mejora mínima +25 puntos porcentuales sobre baseline de coherencia.

---

## Fase 6 - Orquestador v2 y fallback robusto

### Objetivo

Conectar todas las capas en una sola ejecución confiable.

### Tareas

1. Crear `menuGenerationOrchestratorV2`.
2. Flujo por intento:
   - build candidatos (recetas) -> hard filter -> solver -> reranker -> validator.
3. Reintentos automáticos (hasta 3) con relajación controlada.
4. Fallback a menú seguro por meal_type si no hay solución con recetas.
5. Fallback final a alimentos sueltos solo en casos extremos (debe quedar logueado como `last_resort_fallback=true`).
6. Persistencia de metadatos detallados de cada intento.

### Entregables

- `backend/services/menuGenerationOrchestratorV2.js`
- integración en `backend/routes/nutritionV2.js`.

### Tests

- Integración end-to-end con mock y con BD real.
- Casos de no factibilidad controlada.

### Gate salida

- Sin errores silenciosos.
- Fallback trazable y explicable.

---

## Fase 7 - API y contrato frontend

### Objetivo

Exponer resultados profesionales de forma estable.

### Tareas

1. Extender respuesta de generación con:
   - `coherence_score`, `processing_score`, `blocked_rules`, `selected_template`.
2. Endpoint de explicación de menú por comida.
3. Endpoint de sustitución de alimento con recálculo.
4. Mantener compatibilidad hacia atrás con payload actual.

### Entregables

- Contrato API v2 documentado.
- endpoints nuevos/ajustados en `nutritionV2`.

### Tests

- Contract tests de payload.
- No regresión en endpoints 7d/14d.

### Gate salida

- Frontend puede renderizar decisión y motivo sin lógica duplicada.

---

## Fase 8 - UX profesional

### Objetivo

Que el usuario perciba el sistema como “inteligente y confiable”.

### Tareas

1. Mostrar etiqueta de calidad del menú (coherencia alta/media).
2. Mostrar “por qué esta comida” en lenguaje natural.
3. Añadir sustitución guiada por equivalencias del mismo rol/familia.
4. Mostrar avisos claros cuando una regla bloquea opciones.
5. Añadir feedback rápido del usuario (`me gusta/no me gusta`) para aprendizaje.

### Entregables

- Ajustes en `NutritionCalendarView` y `MealDetailView`.
- copy UX final.

### Tests

- QA funcional desktop/mobile.
- Flujo completo: generar -> persistir -> editar -> recalcular.

### Gate salida

- UX sin contradicciones y sin “comidas absurdas” en muestra QA.

---

## Fase 9 - Evaluación offline + QA final

### Objetivo

Validar objetivamente que ya es profesional.

### Tareas

1. Ejecutar evaluación batch sobre 200+ días sintéticos/reales.
2. Panel de métricas:
   - coherencia culinaria,
   - % tolerancia macros,
   - diversidad,
   - ratio fallback,
   - ratio procesados.
3. Revisión manual de muestra estratificada (mínimo 120 comidas).
4. Corrección de outliers y recalibración de pesos de score.

### Entregables

- `docs/menus_profesional/reporte_qa_final.md`
- dataset de evaluación versionado.

### Gate salida (go/no-go)

- `coherencia >= 95%`
- `tolerancia diaria >= 95%`
- `fallback <= 10%`
- `0` violaciones hard rule

---

## Fase 10 - Producción interna (entorno desarrollo actual)

### Objetivo

Activar como motor por defecto en entorno de desarrollo.

### Tareas

1. Activar flag global en entorno actual.
2. Monitor de errores en runtime.
3. Revisión diaria de logs durante 7 días de pruebas internas.
4. Cierre de bugfixes críticos y ajuste fino final.

### Entregables

- changelog técnico.
- checklist de estabilidad semanal.

### Gate salida

- 7 días sin regresiones críticas en generación.

---

## 7. Backlog de Fase 2 (vegano)

Se ejecutará después de estabilizar omnivoro+vegetariano, con su propio plan:

1. Ampliar cobertura de `PROTEINA_VEGETAL` y `PROTEINA_VEGETAL_ALTA`.
2. Plantillas veganas específicas por meal_type.
3. Reglas nutricionales veganas (proteína utilizable por comida, carga de fibra).
4. Dataset QA vegano dedicado y safe menus veganos.

---

## 8. Plan de pruebas detallado

## 8.1 Unit tests

- Hard rules engine.
- Solver V2.
- Reranker culinario.
- Escalado de porciones por receta.
- Conversión base/mostrado.

## 8.2 Integration tests

- `generate-menu` y `generate-full-day-menus`.
- selección de receta por meal_type.
- persistencia `nutrition_meal_items`.
- `active-plan` enriquecido.

## 8.3 Regression tests

- revisión 7d/14d.
- ajustes y undo.
- daily log.

## 8.4 Batch evaluation

- calidad culinaria sobre dataset.
- estabilidad de macros.
- distribución de fallbacks.

## 8.5 UI QA

- desktop + mobile.
- flujo completo con sustituciones.

---

## 9. Riesgos y mitigación

1. **Riesgo**: sobre-restricción -> menús inviables.
   - Mitigación: jerarquía de relajación controlada + safe fallback.
2. **Riesgo**: catálogos mal etiquetados.
   - Mitigación: backfill + script de curación + auditoría semanal.
3. **Riesgo**: degradar performance.
   - Mitigación: límites de candidatos, cachés, tiempos máximos por intento.
4. **Riesgo**: romper endpoints existentes.
   - Mitigación: suite no regresión obligatoria antes de merge.

---

## 10. Definición de Done global

Se considera completado cuando:

1. Motor v2 genera menús diarios coherentes para `omnivoro` y `vegetariano`.
2. Cumple KPIs de calidad nutricional y culinaria definidos.
3. No hay regresión funcional en módulo nutricional existente (review/adjust/undo).
4. QA backend + frontend + batch evaluation en verde.
5. Toda decisión de menú queda trazada en logs/auditoría.

---

## 11. Próximo paso inmediato (ejecución)

1. Iniciar Fase 0 y Fase 1 en paralelo:
   - baseline medible
   - migración semántica + backfill
2. En cuanto Fase 1 cierre, arrancar Fase 2-3.
3. Mantener demos internas al final de cada fase con evidencia de calidad.
