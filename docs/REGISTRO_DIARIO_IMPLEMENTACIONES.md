# Registro diario de implementaciones

## 01.07.2026

- Catálogo Calistenia (`app.ejercicios`, disciplina='calistenia'): saneado de calidad vía `scripts/fix_calistenia_catalog_quality.mjs` (transaccional, con `--dry`). Se rellenan `como_hacerlo`, `consejos` y `errores_comunes` en el 100% de los 65 ejercicios (antes 1/65). Sin depender de RapidAPI (cuota agotada), los GIFs se resuelven de otra forma: se reutilizan **44 GIFs animados** ya subidos al bucket Supabase para movimientos equivalentes (flexión, dominada, fondo, pistol, plancha, hollow, superman, L-sit, HSPU, muscle-up, puente, zancada…), se conservan/asignan **10 estáticos correctos** de free-exercise-db y se anulan **11** skills avanzadas sin asset fiable (planche, front/back lever, human flag, dragon flag, nordic curl, gemelos, crow). `series_reps_objetivo` y `criterio_de_progreso` ya estaban al 100% y no se tocan; taxonomía (3 niveles × 5 categorías, 65 progresiones) validada sin duplicados ni huecos.

- Catálogo CrossFit (`app."Ejercicios_CrossFit"`): auditoría y corrección integral de calidad vía `scripts/fix_crossfit_catalog_quality.mjs` (transaccional, con `--dry`). Se rellena `Cómo_hacerlo` en el 100% (antes 0), se convierten todas las cargas de lbs→kg en el nombre y se estructuran en `rx_carga_sugerida` (20 movimientos con carga + 17 con %1RM), se marcan 21 `is_benchmark` clásicos, se pueblan `wod_types` (formatos compatibles reales) y `duracion_seg` de 7 isometrías. Se remapean 38 `gif_url` erróneos (placeholders `.jpg` de free-exercise-db) al GIF animado correcto del bucket Supabase y se anulan 10 sin asset fiable (correr/remo ergo/shuttle/trineo). Se eliminan 2 duplicados (pistol con peso) y se insertan 2 movimientos estándar que faltaban (Wall Walk, Empuje de trineo). Ajuste de motor en `CrossFitService.repsObjetivoFromWod`: las isometrías muestran objetivo por tiempo (`Mantén la posición Ns`) en vez de reps. Pendiente: al resetear la cuota mensual de RapidAPI, ejecutar `scripts/fetch_crossfit_gifs_exercisedb.mjs` para subir GIFs animados de los estáticos correctos restantes.

## 30.06.2026

- Rutinas/metodologías: se endurece la ejecución de planes completos usando `today-status.summary` como fuente de verdad en la pestaña Hoy, se centraliza la normalización de días en helpers compartidos para `sessions`/`schedule`, se elimina el mapeo local frágil de días en rutas críticas y se añaden tests de contrato para proteger el cierre 7/7, el WOD player de CrossFit y el fallback multimedia sin columnas inexistentes.

## 28.06.2026

- Diagnóstico entrenamiento/calistenia: añadido `scripts/test-calistenia-generation.mjs` para verificar el contrato de generación de calistenia (`plan.semanas[]`) y permitir smoke API con token sin arrancar servidores desde el script.
- Motor de generación de entrenamientos: el orquestador normaliza nombres legacy/de UI y payloads anidados, y el motor determinista cubre Calistenia, CrossFit, Funcional, Casa, Heavy Duty, Powerlifting, Halterofilia, Hipertrofia y Gimnasio con contrato `plan.semanas[]`; añadido test backend de contrato, smoke real transaccional con rollback en BD y verificación con `npm run test:backend` + `npm run lint`.
- Ejercicios/media: añadida migración idempotente para `gif_url`/`video_url`, script `backend/scripts/map-exercise-gifs.mjs` con dry-run CSV contra free-exercise-db, propagación de `gif_url` por repositorio/API/planes/progreso de sesión, prioridad de render BD antes que vídeo de prueba e ignore de artefactos generados.
- Ejercicios/media: aplicado en Supabase el mapeo automático seguro (`--apply`) de free-exercise-db, rellenando `gif_url` en 159 ejercicios con match de confianza alta y dejando `review`/`no_match` sin tocar.

## 06.03.2026

- Auditoría y limpieza de documentación raíz: se reescriben `IMPLEMENTATION_SUMMARY.md`, `roadmap.md`, `MCP_SUPABASE_SETUP.md`, `START_DEBUGGING.md`, `TESTING_ADAPTATION_SYSTEM.md`, `CLAUDE.md`, `WARP.md` y `AGENTS.md` para reflejar el estado real del código; además se eliminan o reducen documentos raíz obsoletos que inducían a error.
- Auditoría y limpieza de `docs/` y `backend/*.md`: se reorganiza la lectura activa (`docs/README.md`, `docs/_active.md`, `docs/sistema-menus-profesional-omni-veg/*`), se sanean las guías operativas de Supabase/Render/backend, se elimina documentación histórica redundante y se retiran referencias a credenciales o estados absolutos desactualizados.
- Nutricion: el flujo principal `NutritionPlanGenerator` integra ya el cuestionario opcional de reparto de macros con modos `Basico`/`Preciso`, carga y persiste `metabolic_*` del perfil, muestra resumen del perfil aplicado (`Mas carbo` / `Equilibrado` / `Mas grasas`) y mantiene el guardado/upsert tambien al generar el plan.
- Perfil/composición corporal: la calculadora de composición ahora persiste `muslos` cuando se usa como dato opcional, la UI pasa a tratar `masa_magra` como campo canónico con compatibilidad hacia `masa_muscular` en backend/BD y se corrige la validación de éxito al guardar desde la tarjeta de composición.
- Perfil/composición corporal y Supabase: migración aplicada para dejar `app.users.masa_magra`, `app.users.muslo` y `app.body_composition_history.masa_magra` como columnas canónicas; el frontend/backend se alinea a `masa_magra`/`muslo` con compatibilidad temporal de entrada para payloads legacy (`masa_muscular`, `muslos`).
- Nutricion/configuracion: se corrige la sincronizacion con Perfil General para que `generate-plan` ya no fuerce `nutrition_overrides_profile = true`, el estado visible pase a `Sincronizado` / `No sincronizado con perfil general` y la accion de volver a sincronizar persista correctamente el flag `false` al guardar.
- Nutricion/objetivo: se canoniza `ganar_masa_muscular` como valor de sincronizacion entre onboarding, perfil y nutricion; `NutritionPlanGenerator` deja de escribir `ganar_musculo`, `users.js` normaliza aliases legacy y `nutritionV2` añade un sanity check con log interno cuando detecta desajuste entre `app.users.objetivo_principal` y `nutrition_profiles.objetivo`.
- Nutricion/TDEE: se añade auditoria del calculo (`formula`, factor base, ajuste por entrenos/pasos y factor de objetivo), se registran esos metadatos en logs al guardar perfil/generar plan, se mejora la guia humana del selector de actividad en `NutritionPlanGenerator` y se avisa en `Calendario V2`/cabecera si el plan activo arrastra kcal alejadas de la estimacion actual del perfil.
- Nutricion/carb cycling: se formaliza la estrategia como `iso-calorica semanal` (carbos arriba en entreno, abajo en descanso y compensacion con grasas), el backend expone `carb_cycling_audit/summary` con `drift_pct` y la UI lo comunica de forma explicita en `Generar Plan`, `Calendario V2` y el detalle de dia.
- Nutricion/generacion de menus: se endurece el motor `deterministic` y `recipe_examples` para bloquear menús con proteína principal insuficiente, carbos/fat mal resueltos o verduras infladas; además se añaden topes más realistas por categoría (verdura de hoja `30-80g`, verdura densa `80-150g`, proteína/carb/grasa con rangos revisados), el scoring deja de usar la verdura para cerrar macros y se cubre con tests del validador de balance por roles.

## 24.02.2026

- Módulo de alimentos: ajuste del motor de menús para acotar gramajes con `porcion_tipica_g` (evitando porciones absurdas en verduras), actualización del importador para respetar categorías del Excel como fuente de verdad y nueva migración de corrección de categorías/datos legacy en `app.foods`.
- Nutrición/metabolismo: se unifica la evaluación metabólica con normalización backend de IDs canónicos/legacy, sincronización automática de `metabolic_*` en `nutrition_profiles` al evaluar cuestionario, endpoint `/api/nutrition-v2/metabolic-evaluate` delegado a la lógica central, envío de `objectiveData.objetivo` desde frontend y trazabilidad del perfil metabólico aplicado al generar plan.
- Menús nutrición: ajuste del motor determinista e híbrido para limitar gramos en `VERDURA` (rangos acotados por `porcion_tipica_g`), rebalanceo de pesos de rol para que verdura no cierre macros principales y penalización de verduras muy carbo/kcal-densas como sustituto de `CARBO`; verificado en prueba E2E (`MAX_VERDURA` 200g).

## 21.02.2026

- Nutrición (acción de generación reubicada): en `src/components/nutrition/MealDetailView.jsx` se mueve `Generar menú` desde el footer al header del modal, alineado a la derecha de `Día X · Entrenamiento/Descanso`, reutilizando `menusEnabled`, `isGeneratingMenus` y `onGenerateDayMenus`; el CTA inferior se mantiene como `Cerrar`.
- Nutrición (afinado visual final modal): en `src/components/nutrition/MealDetailView.jsx` se neutraliza la paleta del modal a negro/gris (eliminando tinte azul en tokens y gradiente principal) y se aplica estilo premium al botón `Generar menú` en cabecera (gradiente dorado, borde/acabado brillante, sombra y microinteracción hover/active).
- Nutrición (ajuste de acabado CTA): en `src/components/nutrition/MealDetailView.jsx` se reduce el halo del botón `Generar menú` bajando intensidad de borde y sombra/brillo interno para un look premium más sobrio.
- Nutrición (paridad visual CTA): en `src/components/nutrition/MealDetailView.jsx` el botón `Generar menú` adopta exactamente el estilo activo de `Calendario V2` (mismas clases de gradiente/sombra/borde/tipografía de `NutritionScreen`) y muestra icono `Calendar` en reposo.
- Nutrición (paridad visual cierre): en `src/components/nutrition/MealDetailView.jsx` el botón `Cerrar` del footer adopta el mismo estilo visual del botón activo `Calendario V2` (mismo gradiente, sombra y acabado) manteniendo dimensiones del CTA inferior.

## 20.02.2026

- Nutrición (restauración visual modal): en `src/components/nutrition/MealDetailView.jsx` se recuperan estilos premium perdidos por revert accidental en overlay y safe-areas (`meal-detail-scroll`, `z-[80]`, `pt/pb` móvil+desktop), botón de cierre superior (borde/sombra/hover premium) y CTA inferior amarillo degradado; además se restituye la etiqueta legible del modo en `Generar menús`.
- Nutrición (rediseño modal estilo mock): `src/components/nutrition/MealDetailView.jsx` pasa a layout con tokens visuales (`--bg/--panel/--surface/...`), jerarquía de 3 zonas (header, contenido scrolleable, footer CTA), card única de resumen de macros con barra segmentada fina, cards de comidas colapsables con filas de alimentos más limpias y menú contextual por ítem con una única acción activa (`Reemplazar alimento`) conservando la lógica de swap existente.
- Nutrición (afinado visual gris/negro + ancho): en `src/components/nutrition/MealDetailView.jsx` se ajusta la paleta de tokens para eliminar dominante azul y llevar el modal a tonos carbón/gris oscuro (fondos, superficies y acentos suavizados), se refina el degradado/sombra del contenedor y se amplía el ancho máximo del modal en desktop de `720px` a `860px`.
- Nutrición (CTA final): en `src/components/nutrition/MealDetailView.jsx` el botón sticky inferior queda fijo como `Cerrar` (texto y acción), eliminando el comportamiento de `Generar menú` en ese CTA para mantener coherencia funcional con el flujo actual.
- Nutrición (limpieza desglose comidas): se elimina el botón `Añadir alimento` del bloque de detalle de cada comida en `src/components/nutrition/MealDetailView.jsx`, dejando solo la lista de alimentos y el flujo contextual de `Reemplazar alimento`.
- Nutrición (restauración de títulos): en `src/components/nutrition/MealDetailView.jsx` se recupera el título de sección con contador (`Comidas del día (N)`) y el subtítulo por card (`Alimentos (N)`) dentro del desglose expandido de cada comida.
- Nutrición (generación semanal + compra): backend añade `POST /api/nutrition-v2/generate-week-menus` (respeta días ya generados por defecto, reporta `generated/partial/failed/skipped` y permite reintento por día) y `GET /api/nutrition-v2/shopping-list` (lista semanal normalizada por `day_ids`, agregada por alimento, opción `exclude_pantry`, agrupada por categoría y trazabilidad); frontend en `src/components/nutrition/NutritionCalendarView.jsx` incorpora botones `Generar semana` y `Lista compra semana`, resumen de ejecución semanal, CTA de `Regenerar día` en fallos y modal de compra con recarga/copiado/filtro de despensa.
- Nutrición (optimización compra semanal activa): en `backend/routes/nutritionV2.js` se activa por defecto `NUTRITION_WEEKLY_SHOPPING_OPTIMIZATION=true` (override por request), ajustando el scoring para reutilizar ingredientes dentro de semana (pool implícito por buckets con límites suaves) y reducir dispersión de compra; además la lista semanal normaliza canónicos (`Avena`, `Zanahoria`, etc.), corrige unidades (huevo/clara/aguacate a `ud` con equivalencias en gramos), elimina falsos positivos de `ud` por texto y redondea cantidades a formatos de compra más realistas.
- Nutrición (objetivo semanal 40 ingredientes): en `backend/routes/nutritionV2.js` se endurece la optimización semanal para aproximar la compra a `40` ingredientes (`min 35`, `max 45`, `hard max 50`), aplicando penalización global por introducir nuevos alimentos en `recipe_examples` y `deterministic`, recompensa de reutilización, tracking explícito de únicos semanales (`weeklyUniqueFoodIds`) y métricas en respuesta de `generate-week-menus` (`weekly_unique_foods`, `weekly_unique_targets`, `weekly_unique_status`).
- Nutrición (gates de calidad semanal): `POST /api/nutrition-v2/generate-week-menus` ahora evalúa automáticamente la semana generada y devuelve `summary.weekly_quality` con reglas duras de compra/coherencia (`max_unique_foods=45`, `hard_max=50`, `max_tiny_items<30g=3`, `max_ultra_items<10g=0`, `max_duplicate_meals_consecutive=0`); si no cumple, marca `weekly_quality_status=failed_gates` y sugiere regenerar semana o días seleccionados.
- Nutrición (script QA semanal): nuevo `backend/scripts/validate-week-menu-quality.mjs` para validar una semana Dn–Dn+6 en bucle (`--runs`), con opción `--generate` (requiere `AUTH_TOKEN`) para generar+evaluar por API y reporte JSON en `backend/tests/fixtures/weekly_menu_quality_report.json`; añadido script npm `backend/package.json` como `qa:nutrition-weekly-quality`.
- Nutrición (UX generar semana con detección): `src/components/nutrition/NutritionCalendarView.jsx` ahora detecta si la semana ya tiene días con menú; si no hay menús, genera directo, y si los hay abre modal de decisión con 3 modos (`solo vacíos`, `regenerar todos`, `seleccionar días`) incluyendo checklist por día y confirmación antes de lanzar `generate-week-menus`.

## 13.02.2026

- UI (bottom tab bar móvil): `src/components/Navigation.jsx` ajustada para que en móvil la barra inferior sea fija y de ancho completo (sin estilo flotante), manteniendo el diseño flotante actual en `sm+`.
- Docs/Nutricion: limpieza del puntero activo `docs/_active.md` tras confirmación manual de QA ("ok limpiar"), dejando estado `No active implementation` y trazabilidad de último slug/path cerrados.
- Docs/Nutricion: apertura de nuevo impl-pack `docs/integracion-alimentos-nutricion/` (archivos `implementation.md`, `checklist.md`, `tests.md`, `status.md`) y actualización de `docs/_active.md` para continuar por fases la integración de `alimentos`.
- Integración `alimentos` (ejecución impl-pack): rama `integracion/alimentos-nutricion` creada; se integra `nutritionV2` con generación determinista + persistencia de `nutrition_meal_items` + `/food-conversion-factors` + `/foods` avanzado + `active-plan` enriquecido; UI de `MealDetailView`/`NutritionCalendarView` actualizada para items y conversiones; migraciones/resources/scripts de `alimentos` añadidos al repo y tests de no regresión 7d/14d en verde (pendiente smoke/E2E con backend local activo).
- Docs/Nutrición: se crea `docs/PROPUESTA_PLANTILLAS_VARIABILIDAD_MENUS_V1.md` con 16 plantillas propuestas (DESAYUNO/CENA/SNACK, AMBOS+VEG) para revisión funcional antes de generar SQL e insertarlas en BD.
- Nutrición (variabilidad menús): se añade y aplica la migración `supabase/migrations/20260213101500_add_menu_variability_templates_v1.sql` con 16 nuevas plantillas (`B17-B18`, `D15-D23`, `S11-S15`) y sus slots; verificación OK en BD (conteos tras cambio: `CENA 23`, `DESAYUNO 18`, `SNACK 15`, `COMIDA 24`) y smoke API `generate-full-day-menus` en verde.
- Nutrición (anti-repetición): el motor determinista ahora aplica contexto de variedad (bloqueo de repetición dentro del mismo día cuando hay alternativas + penalización por uso reciente 7 días en el mismo plan) y `generate-full-day-menus` comparte ese contexto entre comidas; tests backend en verde (28/28) y smoke verificado con 0 alimentos duplicados en 1 día generado.
- Docs/Nutrición IA: se añade `docs/PLAN_IMPLEMENTACION_MOTOR_HIBRIDO_NUTRICION_IA.md` con el plan detallado por fases para implantar motor híbrido de menús (planner IA con `OPENAI_API_KEY_NUTRITION` + solver determinista + validación estricta + fallback + auditoría + UI + QA + despliegue gradual).
- Nutrición IA (ejecución plan híbrido): se implementa modo `hybrid_ai` en `nutritionV2` con fallback automático a determinista, servicios nuevos (`nutritionHybridPlanner`, `nutritionHybridValidator`, `nutritionHybridSolver`, `nutritionHybridOrchestrator`), auditoría en DB (`app.nutrition_menu_generation_logs` + migración `supabase/migrations/20260213231500_create_nutrition_menu_generation_logs.sql`), cliente OpenAI nutrición con key dedicada `OPENAI_API_KEY_NUTRITION` (fallback controlado), y UI con selector de modo + feedback de fallback en calendario/detalle.
- Nutrición IA (QA): se añaden tests unitarios (`backend/tests/openaiClientNutrition.test.js`, `nutritionHybridPlanner.test.js`, `nutritionHybridValidator.test.js`, `nutritionHybridSolver.test.js`); suite backend completa en verde (`37/37`); smoke backend local en `hybrid_ai` para `generate-menu` y `generate-full-day-menus` OK (200, persistencia, fallback visible) y verificación de inserción de auditoría en DB (`log_count=1` en prueba de integración).
- Nutrición IA (ajuste estabilidad): corrección de llamada OpenAI para GPT-5.2 (`max_completion_tokens` en planner híbrido) y ajuste de tolerancia del validador del solver (35%) para evitar fallback sistemático; smoke final en local confirma `metadata.mode=hybrid_ai` y `fallback_count=0` en generación diaria de prueba.
- Nutrición IA (key dedicada obligatoria): `openaiClient` pasa a modo estricto para `nutrition` (sin fallback a `OPENAI_API_KEY` cuando falta `OPENAI_API_KEY_NUTRITION`), `AI_MODULES.NUTRITION` marca `strictEnvKey: true`, y tests actualizados para validar que nutrición no usa fallback; suite backend sigue en verde (`37/37`).
- Nutrición IA (robustez planner): se refuerza el prompt de `hybrid_ai` con reglas explícitas de viabilidad y estructura por comida, soporte `status=infeasible`, y reintento automático con feedback del solver (hasta 2 intentos) antes de caer a determinista; tests backend en verde (`38/38`).
- Nutrición (estados/conversión): se alinea backend con la regla “no inventar conversiones”: determinista e híbrido ya no aplican `factor=1` implícito cuando falta factor (fuerzan estado mostrado=base y marcan `conversion_blocked_reason`), y la persistencia de `nutrition_meal_items` ahora normaliza explícitamente a gramos base y recalcula macros/kcal desde `foods.macros_100g`; tests backend en verde (`40/40`) + smoke real `generate-full-day-menus` en `hybrid_ai` (200, `menus_generated=4`, `fallback_count=0`).
- Planificación profesional de menús: se añade `docs/PLAN_IMPLEMENTACION_SISTEMA_MENUS_PROFESIONAL_OMNI_VEG.md` con plan ultra detallado por fases (arquitectura objetivo, modelo de datos semántico, motor multiobjetivo, QA/KPIs y despliegue), dejando `vegano` explícitamente fuera de alcance en esta iteración.
- Ajuste de alcance del plan profesional: `docs/PLAN_IMPLEMENTACION_SISTEMA_MENUS_PROFESIONAL_OMNI_VEG.md` se actualiza para soportar explícitamente `3 a 6 comidas/día` (manteniendo `4` como recomendación) y añade reparto kcal de entreno por número de comidas.
- Refactor de estrategia del plan profesional: `docs/PLAN_IMPLEMENTACION_SISTEMA_MENUS_PROFESIONAL_OMNI_VEG.md` pasa a arquitectura `recipe-first` (recetario curado como fuente principal + solver de porciones + fallback final a alimentos sueltos), con cambios en modelo de datos (`recipes/recipe_items/recipe_tags`) y fases 2-6.
- Nutrición (propuesta recetas): se crea `docs/PROPUESTA_10_MENUS_DESAYUNO_OMNIVORO.md` con 10 desayunos omnívoros usando alimentos reales de `app.foods`, gramos base por plato y macros/kcal calculados para revisión funcional previa (sin aplicar migraciones).
- Planificación menús fase 1: se crea `docs/MATRIZ_COBERTURA_MENUS_FASE1.md` con matriz objetivo `50 por meal_type` + cobertura por contexto, inventario real del Excel (`Ejemplos`), gaps exactos por comida/contexto y estrategia de migración progresiva para importar ya y probar con curación.
- Plan profesional menús: se actualiza `docs/PLAN_IMPLEMENTACION_SISTEMA_MENUS_PROFESIONAL_OMNI_VEG.md` para dejar explícito en Fase 2 que `Biblioteca_Platos_Plantillas_MindFeed_v2_2_final.xlsx` (hoja `Ejemplos`) será dataset semilla de recetas antes de completar gaps.
- Nutrición (recipe_examples): implementación end-to-end para probar menús desde ejemplos del Excel: migraciones nuevas `backend/migrations/20260213_nutrition_recipe_examples_tables.sql` + `20260213_nutrition_recipe_examples_drop_food_unique.sql`, scripts `backend/scripts/run-nutrition-recipes-migration.js` e `import-recipe-examples-from-excel.js`, importación ejecutada (`192` recetas, `597` items) y nuevo modo `recipe_examples` integrado en `backend/routes/nutritionV2.js` + selector UI en `src/components/nutrition/NutritionCalendarView.jsx`.
- Nutrición (UX recetas): `NutritionCalendarView` conserva metadata de generación por comida en sesión y `MealDetailView` muestra etiqueta de origen (`Receta: ...` o `Plantilla: ...`) en cada comida para evitar menús “sin contexto” al usuario.
- Nutrición (nombres normalizados de recetas): se añade columna `app.recipes.name_normalized` (migración `backend/migrations/20260213_nutrition_recipe_examples_add_name_normalized.sql`), script `backend/scripts/normalize-recipe-names.js` para generar títulos coherentes desde ingredientes/roles y backfill ejecutado en BD (`192/192` recetas de `excel_v2_2_examples`), además `recipe_examples` ya prioriza `COALESCE(name_normalized, name)` en metadata de salida.
- Nutrición (fix metadata receta): `getRecipeExampleCandidates` deja de usar `SELECT *` y ahora devuelve `COALESCE(name_normalized, name) AS name`, corrigiendo que en UI se siguieran mostrando títulos antiguos de Excel pese al backfill de nombres normalizados.
- Nutrición (UX copy receta): en `MealDetailView` se eliminan códigos internos (`EX_B06_2`, `B01`, etc.) del subtítulo y se muestra solo el nombre legible de `Receta`/`Plantilla`.
- Nutrición (curado IA de títulos): nuevo script `backend/scripts/curate-recipe-names.js` que analiza cada receta en lotes con IA (`gpt-4o-mini`, key nutrición) y genera nombres atractivos receta por receta; se ejecuta sobre `excel_v2_2_examples` actualizando `192` títulos en `name_normalized` y forzando salida sin prefijos tipo “Comida de...”.
- Menús Fase 1 (propuesta faltantes): se crea `docs/PROPUESTA_MENUS_FALTANTES_FASE1_V1.md` con `30` menús coherentes y “comibles” para cerrar déficits actuales (`DESAYUNO +2`, `CENA +8`, `SNACK +20`), etiquetados por `meal_type` y `day_context`, listos para revisión y posterior migración SQL.
- Nutrición (tags almuerzo/merienda en snacks): se añade migración `backend/migrations/20260213_nutrition_recipe_snack_slot_tags.sql` para etiquetar recetas `SNACK` con `slot:almuerzo`/`slot:merienda` (+`slot:snack`) y se actualiza `backend/routes/nutritionV2.js` para que `recipe_examples` priorice esas etiquetas según la ingesta (`Almuerzo`/`Merienda` por nombre y orden); aplicado en BD local con reparto inicial `slot:almuerzo=15`, `slot:merienda=15`, `slot:snack=30`.
- Nutrición (migración recetas faltantes Fase 1): se añade `backend/scripts/import-phase1-gap-recipes-v1.js` para importar desde `docs/PROPUESTA_MENUS_FALTANTES_FASE1_V1.md` a `app.recipes`/`app.recipe_items`/`app.recipe_tags` (idempotente por `recipe_code`, con tags de `slot:almuerzo`/`slot:merienda` en snacks) y se ejecuta en BD: `30` recetas nuevas (`source=manual_phase1_gap_v1`), `123` ítems y `160` tags; cobertura activa queda en `DESAYUNO 50`, `COMIDA 72`, `CENA 50`, `SNACK 50` (total `222`).
- Nutrición (fix duplicado almuerzo/comida): en `backend/routes/nutritionV2.js` se corrige `resolveMealType` para mapear `almuerzo -> SNACK` (ya no `COMIDA`), se añade anti-repetición de receta en el mismo día con `varietyContext.sameDayUsedRecipeCodes`, y se hace la semilla de selección de `recipe_examples` específica por ingesta (`orden+nombre`) para evitar que dos comidas del día caigan en el mismo `recipe_code` por colisión de seed.
- Nutrición (switch de alimento con recálculo): nuevo endpoint `POST /api/nutrition-v2/meals/:mealId/items/:itemId/swap-food` en `backend/routes/nutritionV2.js` que sustituye un alimento concreto de una comida (por `replacement_food_id` o `replacement_food_slug`), valida compatibilidad por `food_roles`, recalcula gramos/macros/kcal desde `foods.macros_100g`, respeta conversión de estados (`estado_pesado_base/mostrado` + `food_conversion_factors`) y persiste el ítem actualizado en `nutrition_meal_items`.
- Nutrición (UI switch alimento): `MealDetailView` incorpora flujo inline por ítem para sustituir alimento (buscar en catálogo, seleccionar reemplazo y aplicar), consume `POST /api/nutrition-v2/meals/:mealId/items/:itemId/swap-food`, refresca el día desde plan activo tras aplicar y muestra feedback de éxito/error; `NutritionCalendarView` expone `onRefreshDay` para sincronizar el modal sin recargar la vista completa. Validación técnica: eslint dirigido OK en `MealDetailView`/`NutritionCalendarView` y suite backend en verde (`40/40`).
- Nutrición (UX detalle comida): se simplifica la card de alimento en `MealDetailView` eliminando ruido visual redundante (`Base: ...`, estado repetido junto a gramos y badge permanente `Sin conversion`), se mantiene selector de estado solo cuando existen alternativas reales (p.ej. crudo/cocido) y el flujo de sustitución pasa a modo directo sin buscador (solo desplegable de opciones + aplicar + refresco opcional de lista).
- Nutrición (swap solo compatibles): `GET /api/nutrition-v2/foods` acepta `compatible_with_item_id` y filtra por compatibilidad real de `food_roles` contra el ítem de comida del usuario (excluye el alimento actual y evita candidatos sin rol cuando el ítem origen sí tiene rol). `MealDetailView` ya consume este filtro al abrir sustitución (`page_size=200`) y muestra únicamente opciones compatibles en el desplegable. Validación: eslint UI OK, `node -c` backend OK y tests backend completos en verde (`40/40`).
- Nutrición (mobile UX swap): se ajusta el bloque de sustitución en `MealDetailView` para móvil con controles táctiles (`min-h` 40/44px), tipografía `text-sm`, layout apilado en pantallas pequeñas y botones full-width en móvil (`Sustituir`, `Aplicar`, `Actualizar`), manteniendo versión compacta en desktop. Validación: eslint dirigido OK.
- Frontend (dev móvil): se añade guardarraíl en `src/main.jsx` que, en entorno `DEV` y acceso desde red local (no localhost), reescribe automáticamente requests `fetch` a `http://localhost:3010`/`http://127.0.0.1:3010` hacia `http://<host-actual>:3010`; evita fallos de autenticación al abrir Vite desde móvil sin tener que tocar `VITE_API_URL` cada vez. Validación: eslint dirigido OK.
- Nutrición (modal detalle día móvil): se ajusta el overlay de `MealDetailView` para dejar separación real con barra superior e inferior (safe-area + top/bottom nav), y se hace ajuste fino reduciendo el padding inferior para no “flotar” en exceso; queda balanceado en móvil y se mantiene desktop sin cambios visuales relevantes. Validación: eslint dirigido OK.

## 12.02.2026

- Docs/Nutricion: se agrega `docs/PLAN_IMPLEMENTACION_INTEGRACION_ALIMENTOS_NUTRICION.md` con plan por fases para integrar `origin/alimentos` en `main` sin romper revision 7d/14d, ajustes y deshacer ya implementados.
- Docs/Nutricion: cierre de pack activo `docs/nutricion-revision-7d-14d` (outcome summary en `implementation.md`, ajuste de `checklist/tests/status` a `Ready for QA` y QA gate pendiente en `docs/_active.md` a la espera de OK manual del usuario).

## 09.02.2026

- Docs/Nutrición: se añade `docs/ANALISIS_REVISION_SEMANAL_QUINCENAL_NUTRICION.md` con el análisis de necesidades (revisión semanal/quincenal, anti-ruido y adherencia) vs estado actual y gaps.

## 10.02.2026

- Docs/Nutrición: se abre el pack de implementación `Docs/nutricion-revision-7d-14d/` y se actualiza `Docs/_active.md` (day_type/noise_flags como columnas, modos SIMPLE/FINO, revisión 7d/14d, autoajustes + deshacer).
- Nutrición (SQL/tests): se añade y aplica la migración `20260210_daily_nutrition_log_day_type_noise_flags.sql` (columnas `day_type` + `noise_flags` + check), script `backend/scripts/run-nutrition-review-migration.js` y test `backend/tests/nutritionReviewMigration.test.js` (OK).
- Nutrición (API/tests): se añaden endpoints v2 de registro diario `GET/POST /api/nutrition-v2/daily` (kcal + day_type + noise_flags + daily_log opcional) con servicio `backend/services/nutritionDailyLogV2.js` y tests `backend/tests/nutritionDailyV2.test.js` (OK).
- Nutrición (Review/tests): se añade servicio `backend/services/nutritionReviewService.js` y endpoint `GET /api/nutrition-v2/review` (modo SIMPLE/FINO, rolling 7d vs 7d previa, adherencia>=80%, pesajes, compliance ±10%, ruido y bloqueo 7d) con tests `backend/tests/nutritionReviewV2.test.js` (OK).
- Nutrición (Adjust/undo infra): se añade migración `20260210_nutrition_adjustment_actions.sql` (tabla `app.nutrition_adjustment_actions`), servicio `backend/services/nutritionAdjustmentService.js` y endpoint `POST /api/nutrition-v2/adjustments/apply` (regenera plan activo, clamp <=10%, auditoría) con test `backend/tests/nutritionAdjustmentsV2.test.js` (OK).
- Nutrición (Undo/tests): se añade endpoint `POST /api/nutrition-v2/adjustments/undo-last` (ventana 24h, restaura plan anterior, archiva el nuevo, registra log revertido) con tests `backend/tests/nutritionUndoV2.test.js` (OK).
- Nutrición (UI/review): se añade panel `NutritionReviewPanel` (bloque fijo de revisión semanal/quincenal + registro rápido kcal/day_type/noise_flags + aplicar ajuste recomendado + deshacer) y se integra en `NutritionDashboard` (overview). El review backend ahora expone `last_adjustment_action` para renderizar “Deshacer” de forma persistente; test añadido en `backend/tests/nutritionReviewV2.test.js` (OK).
- Nutrición (QA/tests): QA UI headless cubriendo SIMPLE->FINO, ruido, recommend_adjustment, apply y undo. Tests añadidos para edge cases: sin pesajes, `day_type=cheat` como ruido y outlier de peso como ruido (`backend/tests/nutritionReviewV2.test.js`) (OK).
- Nutrición (UX coherencia): el copy del objetivo semanal ahora indica dirección (pérdida/ganancia) y el ritmo muestra signo + “subiendo/bajando”; además, el panel de progresión (ICG/IPG) deriva la fase desde el plan nutricional activo si el bridge no la tiene (evita mostrar `unknown`).
- Nutrición (UX): cuando IPG/ICG no se pueden calcular (sin pérdida/ganancia significativa), el badge ahora dice “Sin señal” y el mensaje explica por qué y qué falta, usando el cambio real de peso entre mediciones.
- Docs: se añade `docs/RESUMEN_IMPLEMENTACION_NUTRICION_REVISION_7D_14D.md` con un resumen en lenguaje natural de lo implementado en el módulo de nutrición.
- Nutrición (fix): se corrige `Guardar configuración` en `NutritionPlanGenerator` para no serializar el evento de click (error `Converting circular structure to JSON`); además se añade guardarraíl en `handleSaveProfile` para ignorar payloads tipo evento.

## 06.02.2026

- Nutrición: se elimina el cap de 31 días en generación de plan y sincronización UI; el límite queda en 28 días para alinearlo con la cadencia semanal/quincenal del spec.
- Nutrición (spec punto 2): si hay plan de entrenamiento activo, la generación del plan v2 queda siempre enlazada (backend deriva tipo + calendario desde `workout_schedule`; UI auto-sincroniza y bloquea presets/edición manual).
- Nutrición: `generateNutritionPlan` ahora calcula entrenos/semana de forma correcta cuando recibe un calendario diario (14-28 días) para no sobreestimar el TDEE al sincronizar con el plan activo.
- Docs: se añade `docs/RESUMEN_DESALINEACION_NUTRICION_SPEC.md` con el resumen "como antes" de los puntos parcialmente alineados con el spec de nutrición.
- Docs: se añade `docs/PLAN_ALINEACION_TOTAL_NUTRICION_SPEC.md` con plan integral por fases (backend/UI/SQL/QA) para cerrar brechas y alinear 100% con el spec.

## 05.02.2026

- Se crean las skills globales `impl-pack-open` y `impl-pack-close` en `~/.codex/skills/` para generar y cerrar paquetes de documentación de implementación con puntero activo.
- Se crea la skill global `impl-pack-clear` en `~/.codex/skills/` para limpiar el puntero `Docs/_active.md` tras confirmación explícita de QA manual.
- Se crea la skill global `ui-mobile-scout-web` en `~/.codex/skills/` para investigar referencias UI móvil con Playwright y guardar evidencias en el repo.
- Se actualiza el paquete `Docs/nutricion-ui-coherencia-motor` con la regla de “Plan hasta X fecha” + “Revisión automática cada 14 días” y la fuente de verdad (perfil v2).
- UI Nutrición: banner de discrepancias con detalle y acciones, ayuda contextual de actividad, sincronización de duración con plan activo (cap 31 días), tarjeta kcal/día alineada a perfil v2 con nota de perfil incompleto, botón de menú IA deshabilitado con “Próximamente” y compensación semanal renderizada desde `compensation_plan.days`.
- UI Nutrición: sincronización con perfil general ahora guarda en BD (persistente al recargar) y el backend normaliza fechas del calendario para evitar `Invalid Date`/desfase de timezone.
- Backend: normalización de `scheduled_date` en calendario ahora usa formato local `YYYY-MM-DD` para evitar strings inválidos.
- UI Nutrición: sincronización con plan activo ahora ajusta tipo de entrenamiento y calendario semanal según el plan real.
- Backend: `/api/routines/active-plan` ahora devuelve `planType`/`methodology_type` cuando la fuente es `workout_schedule`.
- UI Nutrición: sincronización con plan activo ahora construye calendario diario real en lugar de repetir patrón semanal.
- UI Nutrición: vista de días de entrenamiento ahora etiqueta los próximos 7 días cuando el calendario es diario.
- UI Nutrición: calendario activo ahora calcula el día de la semana desde la fecha real de inicio del plan y abre en la semana actual.
- UI Nutrición: en cálculo del plan se muestra la semana habitual del plan (no próximos 7 días) y la frecuencia se expresa por semana.
- UI Nutrición: se corrige el orden de hooks en calendario para evitar “Rendered more hooks than during the previous render”.
- UI Nutrición: calendario activo ahora se alinea a semanas reales (Lun–Dom) usando fechas del plan y rellena huecos fuera del plan.
- UI Nutrición: botón “Menú del día” se centra en la parte inferior del card.
- UI Nutrición: la tarjeta kcal/día ahora prioriza el último plan nutricional activo (fallback a perfil si no hay plan).
- Backend Nutrición: al generar un plan v2 se archivan planes activos previos para mantener un único plan activo.
- UI Nutrición: “Menú del día” se renderiza como badge compacto y responsive dentro del card.
- UI Nutrición: badge “Menú del día · Próximamente” simplificado y alineado visualmente.
- UI Nutrición: badge de menú ahora muestra “Menú del día” arriba y “Próximamente” debajo.
- UI Nutrición: botón “Menú del día” activo abre el detalle del día y se muestra como “Ver detalles”.
- UI Nutrición: banner de discrepancias con copy simplificado para usuarios finales.
- UI Nutrición: banner ahora muestra “Diferencias detectadas” con valores de perfil general y nutrición.
- UI Nutrición: rediseño del banner de discrepancias con tarjetas y colores diferenciados (responsive).

## 04.02.2026

- Se documenta la auditoría de Nutrición vs spec MindFit unificada en `docs/AUDITORIA_NUTRICION_MINDFIT.md` (implementado, parcial, pendientes, bugs y plan de implementación).
- Se crea el plan de implementación, checkpoints y tests de Nutrición MindFit en `docs/nutricion_mindfit_impl/` (plan, avance por fases y QA final).
- Se actualiza el plan y QA para deprecación de endpoints legacy de mediciones con respuesta `410 Gone`.
- Fase 1 (parcial): deprecados endpoints legacy de mediciones (`/api/nutrition/calibration/measurements*`, `/api/nutrition-v2/measurements`), migrada calibración a `app.body_measurements` y aplicada migración `20260204_unify_nutrition_measurements` en Supabase.
- Fase 2 (backend): `generateNutritionPlan` ahora respeta `training_schedule` real y genera calendario por defecto sin marcar entreno en descansos.
- Fase 3 (backend): objetivo calórico por fase ahora usa rangos según spec, actividad base alineada a tabla MindFit y guardarraíl de proteína en volumen respeta nivel avanzado.
- Fase 4 (backend): evaluación nutricional v2 ahora usa ventana validada de 14 días, confirmación doble vía `register_icg_ipg_state` y mediciones validadas.
- Fase 5 (backend): saltos de dieta ahora compensan solo si la desviación semanal supera el objetivo, con resumen semanal incluido.
- Fase 6 (backend): bridge aplica reglas de lesión (espera 7 días, ajuste tras 14 y reducción de sesiones), deload reduce superávit en volumen y carb cycling limitado a ±10% en déficit.
- Fase 7 (backend/SQL): creadas tablas `nutrition_change_log` y `nutrition_weekly_snapshots` (migración `20260204_nutrition_audit_log_snapshots` aplicada en Supabase), logging integrado en calibración/bridge/saltos y endpoint `/api/nutrition-v2/audit` añadido.
- Fase 8 (UI): dashboard ahora muestra alertas confirmadas/pendientes, compensación semanal y estado del bridge (carb cycling y flags).
- Fix DB: `nutrition_profiles.actividad` ahora admite valores de la spec (`ligeramente_activo`, `activo`, `muy_activo`) manteniendo compatibilidad legacy; migración aplicada en Supabase.
- Fix DB: `app.get_weekly_deviation_summary` ahora usa `kcal_objetivo/tdee`, corrige casts y status; migraciones aplicadas en Supabase.
- Fix DB: `icg_ipg_state_history.status` ahora admite estados en español (rojo/amarillo/verde/verde_plus).
- Fix backend: IEC en `nutritionV2/evaluate` ahora guarda `indicator` numérico para evitar error al registrar `register_icg_ipg_state` (requiere reinicio del backend para aplicar).
- QA final: flujo completo de nutrición validado con backend activo (perfil, plan, mediciones 14 días, reevaluación, diet deviation, bridge, auditoría). Tests registrados en `docs/nutricion_mindfit_impl/TESTS.md`.

## 03.02.2026

- Se documenta comparativa completa entre origin/main y la implementacion local+Supabase v3 en `docs/compraracion_ciclo_menstrual.md` (alcance, puntos en comun, complementariedad y merge).
- Se amplian los planes y checklists v3 en `docs/ciclo_menstrual/PLAN_IMPLEMENTACION_V3.md`, `docs/ciclo_menstrual/SEGUIMIENTO_V3.md` y `docs/ciclo_menstrual/QA_TESTS_V3.md`.
- Se agrega placeholder `AUTH_TOKEN` en `.env` y se documenta el uso local en `docs/ciclo_menstrual/QA_TESTS_V3.md`.
- Se genera `docs/ciclo_menstrual/tags_hypertrofia_template.auto.csv` con autotag heuristico (impact/axial/cod/overhead) para revision manual.
- Se alinea la UI del ciclo con backend v3 (useCycleAdjustment, useMenstrualCycle, CycleDayCard, CycleHomeCard) y se amplía el onboarding con campos v3.
- Scripts ejecutados: `test-menstrual-cycle-db.mjs` OK, `test-menstrual-cycle-swaps.mjs` OK (rollback), `test-menstrual-cycle-api.mjs` OK (sin log de hoy por ALLOW_MENSTRUAL_TEST_WRITES=0).
- Se importa el CSV de tags de riesgo en `app.exercise_tags` con `scripts/import-hypertrofia-tags.mjs` (110 filas).
- Se integra autoajuste y deload en HipertrofiaV2 (multipliers combinados + swaps reforzados), se agrega fallback a `exercises_data` en autoajuste y se crea `scripts/test-menstrual-cycle-deload.mjs` (test falla por migracion pendiente).
- Se aplica la migracion `20260203_menstrual_auto_adjust.sql` en Supabase y el test `scripts/test-menstrual-cycle-deload.mjs` pasa (rollback aplicado).
- Se refuerza el aviso de ajuste menstrual en sesiones reanudadas: `RoutineSessionModal` reconoce `methodology_type` y `TodayTrainingTab` inyecta `metodologia` en la sesión efectiva.
- Se normaliza `reps_objetivo` -> `repeticiones` en HipertrofiaV2 al servir la sesión ajustada (test OK con endpoint actual).
- Fase 7 QA ciclo menstrual v3 completada: scripts DB, engine, API, swaps y deload OK; evidencias registradas en SEGUIMIENTO_V3.md.
- Se recupera el calendario y el modal de log diario desde main y se adapta a v3 (modo phase, campos v3 y refresco de ajuste).
- Se corrige el acceso al token en el módulo de ciclo (authToken fallback) para que el calendario cargue logs y el modal guarde registros correctamente.
- Se corrige el endpoint `/api/menstrual-cycle/logs` para calcular el último día del mes y evitar error 500 en febrero.
- Git: merge fast-forward de `merge/menstrual-main` a `main` y push al remoto.
- UI: se añade padding inferior con safe-area al modal de confirmación de plan para que el botón no quede oculto tras la bottom nav en móvil.
- UI: se añade padding inferior con safe-area al modal de Hipertrofia V2 (evaluación/crear plan) para que el CTA no quede tapado por la bottom nav en móvil.
- UI: se ajusta el ancho del modal de Hipertrofia V2 en móvil (`w-[95vw]`) para centrarlo y mejorar la respuesta visual.
- UI: se ajusta el ancho del modal de confirmación de plan en móvil (`w-[95vw]`) para centrarlo y evitar desalineación.
- UI: se evita overflow del nombre de metodología en cards (tamaño responsivo + wrap en móvil).
- UI: se ajusta el texto de metodología en el resumen del plan para que no se desborde en móvil.
- UI: la pestaña de ciclo en la bottom nav ahora usa `authToken || token` para mostrarse en móvil.
- UI: fallback a `user.sexo` en la bottom nav cuando el check del ciclo falla o no hay token.
- UI: bottom nav en móvil ahora permite scroll horizontal y reduce padding para que todos los tabs (incluido Ciclo/Perfil) sean accesibles.
- UI: bottom nav se simplifica a 4 tabs + “Más” con modal (Oposiciones, Ciclo, Perfil) para mejorar la legibilidad en móvil.
- UI: Nutrición en móvil ahora usa ancho completo (se reduce padding doble en Screen/Plan/Calendario/Dashboard).
- UI: grid de días de entrenamiento en Nutrición ajusta tamaños/espaciado para que no se rompa en móvil.
- UI: días de entrenamiento en Nutrición usan 4 columnas en móvil (4+3) para mejor legibilidad.
- UI: botón "Generar plan nutricional" adopta estilo premium (gradiente y sombra).
- UI: pestaña "Generar Plan" de Nutrición se divide en cards separadas (configuración, entrenamiento, resumen y CTA) para mejorar legibilidad.
- Fix: se restaura `loadProfileFromUserData` en Nutrición para evitar el error en móvil.
- UI: "Generar Plan" ya no usa card maestra; cada bloque queda en cards independientes con mismo ancho.
- Reglas: se añade en `CLAUDE_RULES.md` la norma de no hacer commit/push salvo solicitud explícita.

## 02.02.2026

- Nutrición/Bridge: actualizado `docs/NUTRICION_ROADMAP.md` con objetivo inmediato, pendientes por incorporar desde GitHub y bloqueantes de integración.
- Git: fast-forward de `feature/nutricion-bridge-metabolico` desde GitHub (calibración automática GCT, confirmación 2 semanas ICG/IPG/IEC, tracking rendimiento, complementos de control y documentación técnica).
- Backend: fix de integración en `backend/services/nutritionControlSupplements.js` (pool desde `backend/db.js`).
- Backend: añadido router `backend/routes/performanceConfirmation.js` para `/api/performance-confirmation` (registro de rendimiento, check 2 semanas, estado confirmado ICG/IPG/IEC).
- SQL: ajustes de compatibilidad para Supabase en migraciones de nutrición (`backend/migrations/create_training_performance_tracking.sql` sin `RECORD[]` y `backend/migrations/create_nutrition_calibration_system.sql` asegurando columnas `kcal_objetivo`/`tdee`).
- Seguridad: se eliminaron tokens `sbp_*` reales de documentación de setup MCP (se reemplazan por placeholders).
- Git: merge de `feature/nutricion-bridge-metabolico` a `main`.
- Se crea la carpeta docs/ciclo_menstrual con plan de implementacion v3, QA/tests y seguimiento para retomar el contexto en reinicios.
- Se ajusta el plan v3 con decisiones robustas (UTC, defaults conservadores, tagging manual de riesgo y comportamiento sin tags).
- Fase 1 v3: migracion aplicada (columnas nuevas, historial de ciclos, exercise_tags y backfill conservador) y verificacion en Supabase OK; script local requiere DATABASE_URL.
- Fase 1 v3: script `test-menstrual-cycle-db.mjs` ejecutado con .env y pasa verificacion de columnas/constraints.
- Fase 2 v3: motor de ciclo determinista implementado con tests unitarios (node --test) OK.
- Fase 3 v3: endpoints de ciclo actualizados con motor v3, compatibilidad UI y ajuste en HipertrofiaV2 (tests unitarios OK, falta test API).
- Test integracion API v3 pendiente por falta de AUTH_TOKEN en .env/backend/.env.
- Test integracion API v3 ejecutado con AUTH_TOKEN en runtime (OK; sin log de hoy porque no se habilito ALLOW_MENSTRUAL_TEST_WRITES).
- Fase 4 v3: seeding de pattern/equipment en exercise_tags, template CSV exportado para tagging manual y swap engine integrado (tags de riesgo pendientes).
- Test de swaps v3 ejecutado con rollback (OK).

## 01.02.2026

- Documentación: se creó `docs/NUTRICION_ROADMAP.md` con estado implementado, gaps y mejoras priorizadas para Nutrición/Bridge.
- Ciclo menstrual: calendario con colores por fase (menstrual/folicular/ovulación/lútea) y días clickables con modal de diario (energía, dolor, sueño, notas).
- HipertrofiaV2: el filtrado/reemplazo de ejercicios por restricciones menstruales ahora usa la fase real del ciclo y el ajuste se calcula con fecha local para leer el log del día correctamente.
- Saltos de dieta: la función `app.calculate_compensation` ahora devuelve y guarda ajustes de macros por fase (carbohidratos/grasas) manteniendo proteína objetivo ≥2 g/kg; se añaden columnas de proteínas y ajustes de macros al plan diario.
- Semáforos progreso: se alinearon los umbrales de ICG/IPG con las especificaciones MindFeed (verde+/verde/amarillo/rojo) en `icgIpgDetector.js`.
- Ciclo menstrual: las operaciones de “hoy” (consultar log, registrar síntomas y marcar “Hoy me bajó”) usan fecha local en vez de UTC para evitar desfases en el calendario y en el cálculo del día de ciclo.
- Ciclo menstrual: se fuerza consistencia de periodo activo (botón muestra “Periodo activo” mientras dure el periodo configurado), se evita doble registro, se generan logs sintéticos para pintar el calendario y el onboarding ahora captura la duración del periodo.
- Ciclo menstrual: se elimina el texto duplicado de la descripción de fase debajo del título en la tarjeta del día.
- Nutrición: se ocultaron las pestañas legacy (Calendario Legacy, IA, Planificador, Lista, Macros, Alimentos, Suplementos), se añadió el acceso al nuevo `NutritionDashboard` junto a `Generar Plan` y `Calendario V2`, y se unificó el token de autenticación en `NutritionCalendarView` para evitar errores de carga del plan activo.
- Nutrición: se armonizó el estilo Tech-Lux en todo el Dashboard (ICG/IPG, mediciones, saltos, timing y modal post-entreno) con tarjetas glass, tipografía y botones degradados, y se mantuvo la carga de plan activo del Calendario V2 usando `token/authToken` para evitar el aviso de plan inexistente cuando sí está generado.
- Nutrición: `NutritionPlanGenerator` ahora usa `token || authToken` en todas las llamadas para guardar perfil y generar plan v2, evitando que el plan se genere sin autenticación y que `/api/nutrition-v2/active-plan` devuelva 404 tras la generación.
- Nutrición/Perfil: se añadieron columnas `gemelo` y `pliegue_abdominal` a `app.users` y `app.user_profiles`, el guardado de mediciones ahora hace upsert por día (sin duplicados) y sincroniza gemelo/pliegue cuando Nutrición es la fuente; el formulario precarga esos campos desde el perfil.
- Nutrición v2: `POST /api/nutrition-v2/profile` ahora puede completar campos base desde `app.users` y preserva valores existentes cuando el frontend envía solo objetivo/actividad/comidas/preferencias; `NutritionPlanGenerator` hace upsert del perfil antes de `generate-plan` y el cálculo de TDEE acepta actividad `alto/muy_alto`.
- Nutrición/Dashboard: se eliminó la fila de “acciones rápidas” duplicada, el tab “Nueva Medición” ahora incluye botón Cancelar, se unificó `token || authToken` en mediciones/saltos/timing y el backend sincroniza mediciones hacia `app.users` cuando `nutrition_overrides_profile` está activo.
- Nutrición: `BodyMeasurementsHistory` ahora formatea numéricos como `Number(...)` (Postgres devuelve `numeric` como string) para evitar el crash `toFixed is not a function`; roadmap actualizado en `docs/NUTRICION_ROADMAP.md`.

## 31.01.2026

- Git: cambios de Nutrición se suben a la rama `feature/nutricion-bridge-metabolico` para seguir iterando sin merge a `main`.
- Limpieza: se eliminaron archivos vacíos duplicados creados por error (`0`, `backend/cd`, `backend/duracion`, `backend/entrena-con-ia-backend@1.0.0`, `backend/node`, `backend/nombre`, `backend/npm`) para evitar ruido en el repositorio.
- Nutrición v2: cálculo TMB ahora selecciona fórmula (Tinsley, Ten Haaf, Mifflin, Harris) con reglas MindFeed (nivel, edad, altura extrema, WHtR/grasas altas), factores de actividad actualizados, ajuste NEAT por pasos y objetivos según fase; macros por perfil metabólico; nuevas columnas en `app.nutrition_profiles` (metabolic_type, formula_preferida, training_days, waist_cm, bodyfat_percent, steps_per_day); endpoints de mediciones y reevaluación 14 días (`/api/nutrition-v2/measurements`, `/api/nutrition-v2/evaluate`) ahora detectan mediciones sospechosas, aplican semáforos y sugieren ajustes de ±150-250 kcal según progreso.
- Frontend Nutrición: el formulario de perfil (`NutritionProfileSetup`) ahora captura entrenos/semana, pasos diarios, nivel (principiante/intermedio/avanzado), perfil metabólico (tolerante/mixto/intolerante), cintura, % grasa y envía esos campos al backend al guardar el perfil.
- Calendario Nutricional: se añadió botón "Menú del día" por jornada para llamar a `/api/nutrition-v2/generate-full-day-menus`, mostrando estado de generación y mensaje informativo; backend corrige generación masiva con helper compartido y expone `day_id` en el plan activo para identificar días.
- Control nutricional integral: reevaluación normocalórica usa IEC (peso/cintura en 14 días) con acciones ROJO/AMARILLO/VERDE/VERDE+; se amplían sospechas (peso ±2% en 7 días); se añaden endpoints de saltos de dieta (`POST/GET /api/nutrition-v2/diet-breaks`) con sugerencia de compensación semanal (manteniendo proteína ≥2 g/kg).
- Metabolismo: guardado de `metabolic_score`/`metabolic_confidence` en el perfil; si la confianza es baja, se fuerza perfil mixto; cálculo de macros aplica guardarraíles (proteína mínima por fase/level, grasa mínima 0.6 g/kg o 20% kcal) y reparte carbohidratos con las calorías restantes; se normaliza usando el perfil metabólico y nivel.
- Evaluación metabólica cuantificada: nuevo endpoint `/api/nutrition-v2/metabolic-evaluate` que calcula score S a partir de respuestas y señales objetivas, determina confianza, aplica anti-ruido (2 reevaluaciones para cambiar, máximo 1 categoría por ciclo) y actualiza el perfil; columnas añadidas a `app.nutrition_profiles` para pendientes y última evaluación.
- UI Nutrición: se añade el componente de cuestionario metabólico (score S, señales objetivas y anti-ruido) integrado en `NutritionProfileSetup`; el perfil muestra score, confianza y pendientes, y conserva los campos metabólicos al guardar el perfil para evitar sobrescrituras.
- Puente Entrenamiento↔Nutrición: nuevo endpoint `/api/bridge/training-summary` calcula kcal/macros base (con perfil y objetivo) y aplica carb cycling por tipo de día (D0/D1/D2) redistribuyendo carbohidratos según reglas del puente; responde guía coordinada (deload/fatiga) para entrenamiento. Ruta montada en `server.js`.
- Ajuste carb cycling según CLS: el puente ahora escala deltas de carbohidratos (D2 hasta +20%, D0 hasta -20%) en función del score de carga semanal y agrega recomendaciones cuando cae el rendimiento en normocalórica.

## 30.01.2026

- HipertrofiaV2 ahora aplica ajustes de volumen/intensidad según el ajuste menstrual diario para usuarias femeninas, integrando el endpoint de ciclo en `/api/hipertrofiav2/current-session-with-adjustments`.
- La UI de sesiones de HipertrofiaV2 consume el ajuste menstrual y muestra aviso en el modal de sesión; se fusiona la sesión ajustada desde backend con la local.
- Habilitado el módulo de ciclo menstrual: la API ahora expone `/api/menstrual-cycle` y la app muestra la pestaña solo cuando el backend confirma usuarios femeninos, alineando la ruta de navegación (`/menstrual-cycle`) con el router.
- Ajustado el estado activo en `/api/training/state` para ignorar planes cancelados/draft y la cancelación de rutina ahora desmarca `is_current` para evitar bloqueos al generar planes nuevos.
- Planes con inicio en lunes: el modal final cambia a "Guardar plan" y la pestaña de hoy respeta la fecha de inicio futura para no mostrar sesión el viernes.
- Fix en `TodayTrainingTab`: evitar uso de `plan` antes de inicializar para corregir el error en la pestaña de rutinas.
- Confirmación de plan ahora envía `startConfig` al backend y `/confirm-plan` respeta la fecha de inicio para programar el calendario correctamente.
- Opciones de inicio en jueves/viernes/sábado ahora incluyen sábados cuando corresponde para programar correctamente la primera semana.
- Redistribución en `ensureWorkoutScheduleV3` ahora permite ajustar planes D1-D5 si el usuario elige un inicio distinto a lunes.
- HipertrofiaV2 ahora permite viernes+sábado en calendario, normaliza startDate en generación y elimina el modal duplicado de inicio.
- Cabecera de Rutinas usa calendario real (`workout_schedule`) para duración y frecuencia, evitando fallbacks incorrectos.
- Frecuencia en cabecera de Rutinas se redondea a entero según el promedio real de sesiones/semana.
- Backend: permitido CORS para `http://192.168.1.68:5173` para acceso desde móvil en red local.
- UI: sistema Tech-Lux consolidado (assets, fondos, texturas, halo, tipografías Urbanist/Manrope, cards neutras con glass y acentos sutiles, ancho de layout unificado) aplicado a Dashboard, Metodologías, Oposiciones, Rutinas, Nutrición, Perfil, Corrección IA y Entrenamiento en casa.
- UI: navegación y branding actualizados (barra superior glass con logo/perfil en cápsulas, favicon actualizado, barra inferior tipo dock con safe-area, textos de cabecera más funcionales).
- UI: reproductor flotante de música optimizado (play.webp, tamaño 72x72, sin fondo, drag móvil y bloqueo de scroll durante el arrastre).
- UI: Rutinas/Metodologías y flujo de planes unificados (tabs con gradiente activo, calendario móvil con lista y modal responsive con cierre visible, modales de plan/confirmación/plan activo, calentamientos, RIR, entrenamiento parcial y detalle de día con estilo premium).
- UI: Nutrición/Perfil alineados al sistema (tabs premium, cards e inputs glass, modal de pendientes con mayor contraste, calculadora con CTA degradado).
- UI: Entrenamiento en casa alineado al sistema (pantalla e historial, equipamiento con bordes por acento, modales de plan generado con padding/scroll, rechazo y calentamiento).
- UI: Corrección por IA (imagen y video) adaptada al estilo Tech-Lux con cards premium, bordes sutiles por acento y CTAs coherentes.
- UI: modal de detalle de día del plan ahora es más responsive en móvil (altura adaptable, tipografías y cards compactadas).
- UI: calendario de Rutinas (detalle de día) ajusta centrado y altura en móvil con scroll interno controlado.
- UI: los modales bloquean el scroll del fondo cuando están abiertos para evitar desplazamientos accidentales.
- UI: fondos Tech-Lux aclarados en móvil (más luz en la imagen y overlay menos oscuro).
- UI: padding superior en móvil alineado con Nutrición para Dashboard, Metodologías, Oposiciones, Rutinas, Perfil, Entrenamiento en casa y Corrección IA.
- Fix: cola offline respeta timeout desde `item.metadata`/`item.options` en reintentos para evitar error de variables no definidas.
- UI: login y registro alineados al estilo Tech-Lux (fondos, cards glass, CTAs premium y formularios con inputs coherentes).
- UI: módulo de Ciclo Menstrual alineado al estilo Tech-Lux manteniendo acentos rosados (sección principal, tarjetas y onboarding).

## 28.01.2026

- Adaptación MindFeed: generadores Full/Half Body alineados a spec (duraciones, días, reps, RIR, descansos), sesiones reales guardadas en `methodology_exercise_sessions` con `exercises_data`, y soporte en `/training-session/start/methodology` para planes `Adaptation`.
- Adaptación: auto‑evaluación y tracking usan `sessions_per_week` del bloque, conteo de sesiones filtrado por `methodology_plan_id`, y nuevo endpoint `/api/adaptation/sessions` para listar sesiones del bloque activo.
- BD: migración `20260128_adaptation_block_metadata.sql` añade `ai_tag` y `sessions_per_week` a `app.adaptation_blocks` para cumplir spec.
- Script `scripts/simulate-hipertrofiaV2.mjs`: ahora crea un usuario novato automáticamente, ejecuta el bloque de adaptación real (generate → sesiones → evaluate → transition) y luego simula el plan HipertrofiaV2 completo con días skip/off‑plan configurables.
- Script `scripts/simulate-hipertrofiaV2.mjs` ahora simula comportamiento de usuario real: días skip/fatiga/top, fatiga objetiva (auto-detect), usa progreso real de sesión y refleja estos estados en los reportes técnico/narrativo.
- Fix en `backend/routes/trainingState.js`: el endpoint `/api/training/cancel-plan` usa tablas con esquema `app.*` para evitar error de relación inexistente.
- Fix en `backend/routes/exerciseCatalog.js`: búsqueda por nombre en calistenia castea `exercise_id` a texto para evitar error de `LOWER(integer)` que rompía `/api/exercise-catalog/search/by-name`.
- Script de simulación: `parseReps` ahora normaliza reps <= 0 a 10 para evitar `reps_completed` nulo en `save-set`.
- Catálogo de ejercicios: `/search/by-name` prioriza tablas de hipertrofia/calistenia antes del mock para devolver `exercise_id` numérico.
- Script de simulación: mapea `exercise_id` desde el plan y normaliza ids no numéricos para evitar insertar slugs en `save-set`.
- Datos BD: asignados `exercise_id` (69–75) a 7 ejercicios con IDs nulos en `app."Ejercicios_Hipertrofia"` para evitar fallos en `save-set`.
- Reportes HipertrofiaV2: añadido log manual de deload planificado (semana 6) con evidencia desde `plan_data`.
- Script de simulación: detecta semanas `deload` en `plan_data` y las registra automáticamente en el reporte.
- BD: asignados `exercise_id` (76–110) a 35 ejercicios con IDs nulos en `app."Ejercicios_Hipertrofia"` y backfill de `exercise_id` en `app.methodology_exercise_progress` por nombre (quedan 46 filas con nombre genérico "Ejercicio").
- Script `scripts/simulate-hipertrofiaV2.mjs`: añade validaciones de intensidad por día, reps objetivo, RIR por set, orden Multi→Uni→Analítico y consistencia de volumen (series) con baseline; ahora quedan reflejadas en el reporte técnico.
- Adaptación: ajuste del insert en `workout_schedule` para usar columnas reales (`day_name`, `day_abbrev`, `session_order`, `week_session_order`) y evitar el error `day_in_week` al generar el bloque.
- Adaptación: transición a D1-D5 ahora castea argumentos a `integer` para evitar la ambigüedad con la función `app.transition_to_hypertrophy(uuid, uuid)`.
- Script de simulación: el bloque de adaptación fuerza una progresión mínima del 10% en la última sesión para garantizar >8% y permitir la transición en el run “sin ruido”.

## 27.01.2026

- Documento de arquitectura rápida para onboarding: Supabase como BD/Storage y backend Express como API principal en `docs/COMO_FUNCIONA_SUPABASE_Y_SERVIDOR_LOCAL.md`.
- Plan detallado por fases para alinear HypertrofiaV2 con la spec MindFeed v1 en `docs/PLAN_IMPLEMENTACION_MINDFEED_COMPLIANCE_V1.md`.
- Bitácora de checkpoints para continuidad de la implementación MindFeed v1 en `docs/CHECKPOINTS_MINDFEED_COMPLIANCE_V1.md` y regla añadida en `AGENTS.md` para revisarla siempre.
- Se introduce el contrato de ruleset MindFeed v1 en BD (`app.mindfeed_rulesets`, `app.get_active_mindfeed_ruleset`) y se carga el ruleset activo para `hipertrofia_v2_principiante`.
- Se alinea la generación D1–D5 y el ajuste de sesiones con la spec: deload semana 6 con -30%/-50%, descansos por tipo (90/60/50), volumen por perfiles y solapamiento usando el factor decidido por backend.
- Se refuerza la lógica SQL de deload, prioridad y transiciones: deload reactivo, freeze/reactivación NP con mean RIR, repetición de bloque de adaptación con penalización/cap, y transición automática a intermedio tras semana 12.
- Limpieza menor: se elimina una variable sin uso (`sessionId`) en `backend/routes/adaptationBlock.js` para reducir warnings.
- `/start/methodology` ahora aplica ajustes MindFeed de forma idempotente (marca `mindfeed_adjusted_week`) y bloquea prioridad/top set durante deload programado por ruleset.
- Nueva migración de seguridad: `20260127_mindfeed_progression_programmed_deload_guard.sql` evita progresión en `apply_microcycle_progression` cuando la semana actual es deload programado.
- Ajuste menor de calidad: `parseExercisesValue` usa `catch {}` para no introducir warnings nuevos de ESLint.
- El script `scripts/simulate-hipertrofiaV2.mjs` ahora simula RIR y adherencia de forma determinista y no perfecta (RIR por set con fatiga y recorte ocasional de series) para testear progresión/deload con más realismo.
- Fix del script de simulación: `rir_reported` en BD es `integer`, así que el script ahora redondea el RIR por set a enteros (0–5) para evitar el error en `/api/hipertrofiav2/save-set`.
- Fix SQL: se evita `numeric field overflow` en `app.evaluate_level_change` acotando `adherence` a 0–100 y eliminando la precisión fija en la variable interna.
- Script de simulación: se añade `FORCE_LEVEL` para forzar el nivel (p. ej. `Principiante`) sin depender del perfil del usuario.
- Backend: `/training-session/start/methodology` ahora acepta `week_number=0` para soportar la semana 0 de calibración.
- SQL: `advance_cycle_day` ignora progresión/conteo de microciclo en semana 0 y `activate_deload` aplica deload planificado en la semana definida por ruleset (no la semana actual).
- Script de simulación: `INCLUDE_WEEK_0` activado por defecto, RIR mínimo 3 en semana 0 y microciclo/deload no se contabiliza en calibración.
- Script de simulación: refuerzo de payload para `start/methodology` con fallback de semana (id Wn) y error explícito si faltan datos.
- Backend: `routes/trainingSession.js` ahora acepta `week_number=0` para permitir la semana 0 desde el endpoint realmente usado por `server.js`.
- Backend: `routes/trainingSession.js` sincroniza `current_week` con el `week_number` recibido para que la semana 0 no cuente como microciclo y el deload planificado caiga en semana 6.

## 23.01.2026

- Tracking RIR pasa a popup obligatorio al terminar cada serie en sesiones con tracking habilitado, bloqueando el avance hasta guardar.
- Popup de tracking RIR vuelve a mostrarse cuando la sesión no trae flag de tracking, para no bloquear el registro de series.
- Cola offline deja de reintentar peticiones no reintetables (4xx) para evitar bucles en `sessions/start`.
- Cola offline respeta timeouts personalizados para evitar abortos en `active-plan`.
- Fix en `connectionManager`: timeout usa `metadata`/`options` y evita ReferenceError en requests.
- Timeout extendido para `sessions/start` para evitar abortos al iniciar entrenamiento.
- Cancelación masiva de planes de entrenamiento del usuario 33 para limpiar estado activo.
- Programación de calendario usa fecha local en `ensureWorkoutScheduleV3` para evitar desfases UTC.
- Confirmación de plan ahora cancela planes activos/confirmados previos para mantener un único plan activo.
- Modal de plan activo al generar nuevas rutinas con opción de ir al plan o cancelar y continuar.
- getTrainingStateFromDB ahora desenvuelve la respuesta para detectar planes activos desde `/training/state`.
- Aviso de plan activo se dispara al seleccionar metodología/IA y se renderiza al final para quedar por encima de otros modales.

## 22.01.2026

- Evita que el reproductor se abra al arrastrar el botón flotante mediante un umbral de movimiento para distinguir click de drag.
- Añadidas confirmaciones de “ninguna/ninguno” en listas de perfil (alergias, medicación, lesiones, suplementación y alimentos excluidos) para guardar explícitamente que no aplica.
- Cálculo de progreso del perfil por campo alineado con BD y modal de pendientes con edición inline (incluye preferencias IA y equipamiento con opción “no tengo”).
- Home convertido en dashboard con estado del plan activo, sesión de hoy y accesos rápidos.
- Acceso directo a la calculadora de composición corporal desde el modal de campos pendientes.
- Notas de progreso excluidas del cálculo de completitud del perfil al ser opcionales.
- Parche SQL en `calculate_mean_rir_last_microcycle` para promediar últimas 5 sesiones y evitar error al avanzar microciclo.
- Ajuste SQL en `evaluate_level_change` para calcular `progression_rate` con columnas reales de `hypertrophy_progression`.
- Reporte de auditoria MindFeed (backend/BD) en `docs/AUDITORIA_MINDFEED_COMPLIANCE.md`.

## 21.01.2026

- Ajuste en la deteccion del entrenamiento de hoy para priorizar la sesion real del dia y evitar que se marque descanso cuando hay entrenamiento.
- Envio de la fecha de la sesion desde la pestana de hoy para asegurar que se muestre lo realizado en el dia.
- Bloqueo de ejercicios rechazados en el entrenamiento en casa: se incluye la lista en el prompt, se filtran tras la IA y se guardan con upsert en `home_exercise_rejections`.
- Ayuda contextual en `EditableField` con helpText y etiqueta unificada.
- Aclaracion de etiquetas en perfil (nivel de actividad con ayuda, peso y estatura con unidades).
- Modal de cambios sin guardar al cambiar de pestana en el perfil.
- Se amplio el constraint de estados de sesion para permitir `incomplete` y `abandoned` en la tabla de sesiones de metodologia.
- Script de simulacion HipertrofiaV2 y reportes tecnico/narrativo en `docs/`.
- Mejora de logging en el script de simulacion HipertrofiaV2 para identificar el endpoint que falla.
- Fix en cancelacion de plan activo: UPDATE con ORDER BY/LIMIT reemplazado por CTE.
- Ajuste del script HipertrofiaV2 para enviar RIR entero y normalizar exercise_id.
- Busqueda por nombre en catalogo de ejercicios extendida a hipertrofia + fallback de exercise_id en simulacion.

## 2026-03-10

- Nutrición/perfil: corregido en `NutritionPlanGenerator` el mapeo de comidas para leer `comidas_por_dia` (con fallback legacy `comidas_diarias`) y persistir sincronización con `comidas_por_dia`, tras detectar que el botón de resync tomaba un valor erróneo por nombre de campo inconsistente.
- Reformateado `docs/MindFeed_Incidencias_Nutricion_v2.md` para dejarlo estructurado en secciones, tablas y criterios de aceptación legibles.
- Convertido `MindFeed_Incidencias_Nutricion_v2.pdf` a Markdown y guardado en `docs/MindFeed_Incidencias_Nutricion_v2.md`.
- Nutrición (sincronización perfil↔nutrición): corregido mapeo de comidas en `NutritionPlanGenerator` para usar `comidas_por_dia` (fallback legacy `comidas_diarias`) tanto al leer `userData` como al persistir sincronización (`syncUpdates.comidas_por_dia`), y ampliado mapeo de objetivos generales (`salud_general`, `mejorar_flexibilidad`) hacia fase nutricional `mant`.
- Perfil/Objetivos (progreso real): restaurado cálculo backend de `goal_progress_pct` con baseline (`peso_inicio_objetivo`, `objetivo_activo_desde`), actualización automática del baseline al definir/cambiar dirección de `meta_peso`, endpoint `POST /api/users/:id/objective/reset` y consumo en frontend para mostrar barra de progreso real (sin valor fijo) + botón “Reiniciar progreso”.
- Perfil/Objetivos (barra en 0): reforzado `useProfileState` para leer sesión desde claves auth reales (`user`, `userProfile`, `userData`), refrescar estado con la respuesta real del backend tras guardar perfil, y exponer `resetGoalProgress` para que el botón de reinicio aplique el baseline y actualice la barra al momento.
- Rollback solicitado en nutrición: revertidos en `NutritionPlanGenerator` los cambios recientes de mapeo de `salud_general/mejorar_flexibilidad` y la migración de `comidas_por_dia`↔`comidas_diarias`, volviendo al comportamiento previo.

## 2026-03-12

- Render/credenciales: se eliminan claves hardcodeadas de los scripts de Render, se centraliza la lectura del token y workspace desde el `.env` local del proyecto (`RENDER_MCP_BEARER_TOKEN`/`RENDER_API_KEY`, `RENDER_WORKSPACE_ID`/`RENDER_WORKSPACE_NAME`), y los comandos de Render pasan a usar una config local en `.render/cli.yaml` sin depender de `~/.bashrc`, WSL o configuración compartida con otros proyectos.
- Nutrición/perfil: `NutritionPlanGenerator` ahora fuerza `refreshProfile()` al entrar y usa un snapshot fresco del perfil general para sincronizar objetivo, actividad y comidas, evitando que el selector cargue valores obsoletos del `UserContext` cacheado.
- Nutrición/comidas bajas: se amplía el selector a 1-6 comidas en `NutritionPlanGenerator`, con modal de confirmación para 1-2 comidas al seleccionar o al generar el plan si ese valor aún no se ha confirmado en la sesión; además, backend y constraints pasan a permitir 1-2 comidas y se añaden tests de distribución para 1 y 2 comidas diarias.
- Cuestionario metabólico: corregido `POST /api/metabolic-profile/evaluate` para hidratar contexto desde `app.nutrition_profiles` con fallback a `app.users` (sin depender de `app.user_profiles.peso`, que no existe), mapear objetivo general a `cut/mant/bulk`, validar campos mínimos antes de evaluar y propagar al frontend el mensaje real del backend; añadidos tests del contexto metabólico y QA manual/Playwright del flujo.
- Nutrición/menús del día: se añade `meal_type` persistido en `app.nutrition_meals`, se renombran automáticamente planes de 1 comida (`Comida`) y 2 comidas (`Comida`/`Cena`), `resolveMealType` pasa a priorizar ese tipo explícito y el fallback determinista ya no deja comidas vacías cuando todas las candidatas quedan bloqueadas por balance: devuelve la mejor opción de rescate con metadata de emergencia. QA real con 2 y 5 comidas en varios días: `menus_generated = total_meals` y sin comidas vacías.

## 2026-03-19

- QA manual Playwright/autenticado del rollout `macros-perfil-metabolico-fase`: login real, guardado de configuración `bulk`, cuestionario metabólico en 2 intentos (`intolerante`), generación de plan, verificación visual `Calendario V2`, paridad UI/API (`P 151 / C 211 / G 107`) y prueba de `bridge override` a `2500 kcal`; evidencia en `test-results/manual-qa-macros-perfil-fase/qa-report.json` y capturas asociadas.

- Docs/Impl-pack: se abre `docs/macros-perfil-metabolico-fase/` con `implementation.md`, `checklist.md`, `tests.md`, `status.md` y se actualiza `docs/_active.md` para ejecutar por fases la alineación robusta de macros por perfil metabólico + fase.
- Docs/Nutrición: se añade `docs/PLAN_IMPLEMENTACION_MACROS_PERFIL_METABOLICO_FASE.md` con un plan detallado para implementar de forma robusta, escalable y sostenible la tabla oficial de macros por perfil metabólico + fase, unificar calculadoras, endurecer guardarraíles/auditoría y cerrar el rollout con tests y actualización de documentación.
- Nutrición/macros perfil+fase: implementado `backend/services/macroProfilePhaseResolver.js` como fuente única de verdad (`mindfeed_macro_phase_v2`), alineados `nutritionCalculator`, `metabolicProfileCalculator`, bridge, `trainingNutritionBridge`, `/api/metabolic-profile/distributions` y `nutritionV2/current_estimate`; se elimina el cálculo local incoherente de macros en `NutritionScreen`, se añaden 4 suites nuevas (`macroProfilePhaseResolver`, `nutritionCalculatorMacrosByPhase`, `metabolicProfileMacroAlignment`, `trainingNutritionBridgeMacroOverride`) y `npm run test:backend` queda en verde (69/69).
- Docs/Impl-pack: cierre documental de `macros-perfil-metabolico-fase` tras QA manual OK y limpieza de `docs/_active.md`; quedan el outcome summary, resultados de tests y evidencia final alineados con el rollout.
