# Roadmap — Integración Base de Alimentos (MindFeed) + Estados de Pesado + Biblioteca de Platos

Rama de trabajo: `alimentos`

Fecha: 06/02/2026

## 0) Objetivo

Integrar la documentación del directorio `Módulo Nutrición/` en la app, con foco en:

- **Catálogo real de alimentos** (en BD) en lugar de listados estáticos.
- **Estados de pesado + conversión de gramos** (crudo/cocido/escurrido/seco/tal_cual) sin alterar macros.
- **Biblioteca de platos/plantillas** (generación determinista por roles + sustituciones por ID).
- Mantener coherencia con el sistema actual **Nutrición V2** (plan determinista por macros + calendario) y con **HipertrofiaV2** (calendario real del plan).

> Nota: este roadmap es **solo planificación**. No implementa cambios funcionales.

## 1) Estado actual (lo que hay en código hoy)

### Backend

- Nutrición V2:
  - Perfil: `backend/routes/nutritionV2.js` (`GET/POST /api/nutrition-v2/profile`).
  - Plan determinista (macros + días + comidas): `POST /api/nutrition-v2/generate-plan` guarda `app.nutrition_plans_v2`, `app.nutrition_plan_days`, `app.nutrition_meals`.
  - Catálogo alimentos: `GET /api/nutrition-v2/foods` lee `app.foods` (sin filtros por preferencias y sin campos de estados de pesado).
  - Menú IA: `POST /api/nutrition-v2/generate-full-day-menus` llama a OpenAI por comida, **pero no persiste** items en BD.
- Motor determinista de macros/carb cycling: `backend/services/nutritionCalculator.js`.
- Calendario de entrenamiento (para sincronizar días de entreno): `backend/routes/routines.js` (`/api/routines/active-plan` y `/api/routines/calendar-schedule/:planId`).

### Frontend

- Pantalla Nutrición usa V2: `src/components/nutrition/NutritionScreen.jsx`.
- Generación de plan + sincronía con calendario real del plan activo: `src/components/nutrition/NutritionPlanGenerator.jsx`.
- Vista calendario del plan (macros por día/comida). Generación de menús IA existe pero está deshabilitada en UI (`menusEnabled = false`): `src/components/nutrition/NutritionCalendarView.jsx`.
- Existe un `FoodDatabase.jsx` con lista estática, pero actualmente **no está integrado** en la UI.

### Base de datos (según `docs/SUPABASE_DATABASE_CONTEXT.md`)

- `app.foods` actual: `id (uuid)`, `nombre`, `categoria` (con CHECK limitado a `proteina|carbohidrato|vegetal|fruta|lacteo|grasa|condimento|otro`), `macros_100g` (jsonb), `tags` (jsonb), `equivalencias` (jsonb), `is_verified`, `source`, timestamps.
- Tablas V2 disponibles para items (`app.nutrition_meal_items`) existen, pero **no hay código** que las use en Nutrición V2 actualmente.

## 2) Documentación en `Módulo Nutrición/` (inventario)

- `Base alimentos.xlsx`:
  - Hoja `Base` con ~241 alimentos, campos: macros por 100g, **fibra**, porción típica, tags/alérgenos, `ID_alimento` (slug), sustituciones, y campos nuevos: `Estado_pesado_base`, `Metodo_preparacion`, `Estado_pesado_mostrado_default`, `Grupo_factor`.
- `actualizado.Base_Alimentos.xlsx`:
  - Hoja `Guía` (explica modelo y reglas).
  - Hoja `Factores_Coccion` con factores (ejemplo: arroz 2.5, pasta 2.3, carne 0.75, legumbre_seca 2.2).
- `Estados_Alimentos_y_Conversion_Página_1.jpg` y `Estados_Alimentos_y_Conversion_Página_2.jpg`:
  - Especificación “no negociable” de estados + fórmulas de conversión + checklist QA.
- `Biblioteca_Platos_Plantillas_.xlsx`:
  - Plantillas por `meal_type`, `diet_allowed`, `day_context`, roles por slot y banco de roles `food_id` (slug) → `role`.
- `Omnivoros.xlsx` y `Vegetariano.xlsx`:
  - Vistas derivadas (útiles como referencia/validación, pero no asumir que están perfectas).
- `Implementación_v1.txt`:
  - Propuesta (DeepResearch) centrada en integrar estados de pesado y base de alimentos.

## 3) Comparación con `Módulo Nutrición/Implementación_v1.txt` (qué cuadra y qué no)

### Alineado / correcto

- Existe Nutrición V2 determinista con macros por día/comida y un prompt de IA que recibe un catálogo acotado (`backend/prompts/nutrition-menu-generator.js` + `backend/routes/nutritionV2.js`).
- La query actual de alimentos para IA **no filtra** por preferencias (solo confía en el prompt) y limita a 50 (`backend/routes/nutritionV2.js`).
- No hay lógica de conversión de estados de pesado implementada.
- `app.foods` existe y expone `macros_100g`, `tags`, `equivalencias`.

### Diferencias importantes (a corregir en el plan)

- `Implementación_v1.txt` asume que los items del menú se guardan y se muestran desde `nutrition_meal_items`. En el código actual:
  - El plan determinista **solo** guarda plan/días/comidas (sin items).
  - La generación IA (`generate-full-day-menus`) **no persiste** menús.
  - La UI del calendario **no muestra** items y además el botón de menús IA está deshabilitado.
- La documentación de `Base alimentos.xlsx` trae categorías más ricas (p.ej. “Proteína animal”, “Legumbre”, “Suplemento”), pero `app.foods.categoria` tiene un CHECK de categorías genéricas. Hace falta decidir **mapeo** o **ampliación de esquema**.
- La biblioteca de platos (plantillas/roles) **no está contemplada** en `Implementación_v1.txt` y es clave si queremos una generación determinista por IDs.

## 4) Roadmap por fases (propuesta)

### Fase 0 — Decisiones de diseño (bloqueante)

1. **Fuente de verdad de alimentos**
   - Mantener `app.foods` como tabla principal, ampliándola con campos MindFeed; o crear tablas nuevas (`app.mindfeed_foods`, etc.).
2. **Identificador estable**
   - Opción recomendada: añadir `slug` (texto) único en `app.foods` y poblarlo con `ID_alimento` del Excel.
3. **Categorías**
   - Definir mapeo `Categoría (Excel)` → `categoria (DB)` y, si hace falta, añadir `categoria_detalle`/`mindfeed_categoria` para conservar el detalle.
4. **Representación de tags/alérgenos**
   - Normalizar `tags` a `jsonb` como array de strings (lowercase) o a objeto `{labels:[], allergens:[], diet:...}`.
5. **Dónde vive la conversión**
   - Recomendado: tabla `app.food_conversion_factors` + util `backend/services/foodConversion.js` (misma fórmula en todo el sistema).
6. **Persistencia de menús**
   - Definir cómo se guardan items: activar `app.nutrition_meal_items` (relación `meal_id` + `alimento_id`) y añadir campos de pesado (mínimo: `estado_base`, `estado_mostrado`, `cantidad_g_base`, `cantidad_g_mostrada`).

### Fase 1 — BD: ampliar `app.foods` + factores de conversión

- Migración SQL (Supabase):
  - `ALTER TABLE app.foods` para añadir (nombres a confirmar):
    - `slug` (text unique), `fibra_100g` o `macros_100g.fiber_g` (decidir), `porcion_tipica_g`,
    - `estado_pesado_base`, `estado_pesado_mostrado_default`, `metodo_preparacion`, `grupo_factor`,
    - `diet_type`/`tipo_dieta` (Omnívoro/Ambos) y/o flags `is_vegetarian`, `is_vegan` si se quiere robustez.
  - Crear tabla `app.food_conversion_factors` con unique `(grupo_factor, estado_base, estado_objetivo)`.
- Validaciones:
  - CHECK de `estado_pesado_*` contra enum permitido (crudo/cocido/escurrido/seco/tal_cual).
  - Bloqueo explícito: `tal_cual` no convierte (factor fijo 1, o simplemente no ofrecer conversiones).

### Fase 2 — Ingesta de Excel (ETL) y calidad de datos

- Script de importación (propuesto):
  - Leer `Módulo Nutrición/Base alimentos.xlsx` (hoja `Base`) y upsert en `app.foods` por `slug`.
  - Leer `actualizado.Base_Alimentos.xlsx` (hoja `Factores_Coccion`) y upsert en `app.food_conversion_factors`.
  - Importar equivalencias/sustituciones (si se decide) desde “Sustituible por / Sustituible_por_ID”.
- Normalización:
  - Tags: separar diet (vegetariano/vegano), alérgenos (gluten, lácteos, huevo, soja, frutos secos, marisco, pescado), y “labels” (alto en proteína, bajo en kcal, etc.).
  - Categorías: aplicar mapeo a categorías DB + conservar detalle si procede.
- QA de datos (mínimo):
  - Detección de inconsistencias típicas (p.ej. alimentos “Omnívoro” con tag “vegano”, o frutas marcadas como Omnívoro).
  - Reporte de filas conflictivas (para curación manual).

### Fase 3 — Backend: uso real del catálogo + filtros por perfil

- `GET /api/nutrition-v2/foods`:
  - Añadir filtros: `diet` (omnivoro/vegetariano/vegano), `allergens_exclude`, `estado_base`, `grupo_factor`, paginación real.
  - Exponer los campos MindFeed para frontend.
- Prompt IA:
  - En `generateMenuForMeal`, filtrar en SQL el catálogo en función de `nutrition_profiles.preferencias` y `alergias` (no solo “instrucciones” en prompt).
  - (Opcional) pasar `estado_pesado_base` y `estado_pesado_mostrado_default` en el catálogo para que la IA genere mejor (sin inventar estados).

### Fase 4 — Menús: persistencia + respuesta al frontend

- Crear endpoints para:
  - Guardar menús generados (IA o determinista) en `app.nutrition_meal_items`.
  - Leer plan activo incluyendo items (join a `app.foods`).
- Modelo de items (recomendación):
  - Persistir **gramos base** (canon) + **estado mostrado** + **gramos mostrados** (derivado).
  - No recalcular macros al convertir: solo cambiar gramos mostrados.

### Fase 5 — Frontend: UX de estado y conversión

- Rehabilitar/añadir UI para:
  - Mostrar items por comida en calendario (cuando existan).
  - Etiqueta visible del estado: `Arroz (cocido)`, `Atún (escurrido)`, `Pan (tal cual)`.
  - Toggle/select de estado cuando haya factor disponible (si falta factor, bloquear y mostrar “Sin conversión”).
- (Opcional) Tab “Catálogo” para explorar alimentos (reemplazar `FoodDatabase.jsx` estático por API).

### Fase 6 — Biblioteca de platos (plantillas) y generación determinista

- Ingesta `Biblioteca_Platos_Plantillas_.xlsx` a BD:
  - Tablas sugeridas: `app.meal_templates`, `app.meal_template_slots`, `app.food_roles`.
  - Todas las referencias por `food_id` (slug).
- Motor de generación:
  - Selección de plantilla por `meal_type + fase + day_context + diet_allowed`.
  - Relleno por roles (IDs), ajuste de gramos para cumplir macros.
  - Sustituciones por ID (recalcular gramos).
- IA como capa opcional:
  - Solo para “texto/receta/instrucciones”, manteniendo selección y gramos deterministas.

## 5) Checklist QA mínimo (extraído de la spec)

- Misma comida calculada en base vs mostrada debe sumar **los mismos macros** (solo cambian gramos mostrados).
- Carne: factor < 1 en crudo→cocido (pesa menos).
- Registro de consumo en “cocido” debe convertirse a base antes de sumar macros.
- `tal_cual`: no ofrece selector de conversión.
- Si falta factor para un par base/objetivo, la app **bloquea** conversión (no inventa).

## 6) Preguntas para cerrar antes de implementar

1. ¿Queremos que el frontend consulte **siempre** al backend (`/api/nutrition-v2/foods`) o también a Supabase directo?
2. ¿Preferimos ampliar `app.foods` o crear tablas MindFeed separadas para evitar tocar constraints existentes?
3. ¿Añadimos `slug` (texto) o generamos UUIDs deterministas a partir del slug (UUIDv5) para mantener estabilidad?
4. ¿Las categorías detalladas (Proteína animal/Legumbre/Suplemento) deben reflejarse en UI tal cual, o se agrupan en categorías genéricas?
5. ¿Priorizamos primero: (a) conversión de estados + persistencia de items, o (b) biblioteca de platos y generación determinista?

Respuestas :

Decisión recomendada para tus 5 puntos (pensando en app instalada en móvil):

Frontend -> backend siempre (no Supabase directo desde móvil)
Diferencia: Supabase directo simplifica al inicio, pero mete lógica y seguridad en la app.
Mejor opción: pasar por tu API (backend/routes/...) para filtrar, validar, versionar y cambiar reglas sin forzar actualización de la app móvil.
Ampliar app.foods (no crear otro catálogo paralelo)
Mejor opción práctica: mantener una sola tabla de alimentos y añadir campos MindFeed.
Excepción: crear tabla aparte solo para factores (food_conversion_factors) y plantillas (meal_templates, etc.), porque son otra entidad.
Mantener id UUID + añadir slug único
Mejor opción: no reemplazar el UUID actual.
Usa slug (ID_alimento del Excel) como clave de negocio estable/humana para imports, equivalencias y plantillas.
Categoría doble: genérica + detallada
Diferencia: genérica mantiene compatibilidad actual; detallada mejora precisión nutricional/plantillas.
Mejor opción: conservar categoria genérica y añadir categoria_detalle (p.ej. “Proteína animal”, “Legumbre”, “Suplemento”).
Prioridad: primero conversión de estados + persistencia de items
Diferencia: esto corrige exactitud y UX ya (crudo/cocido/escurrido/tal_cual).
Plantillas deterministas aportan mucho valor, pero son una fase posterior más amplia.
Sobre tu pregunta: sí, todos los alimentos deberían estar en base de datos.

Ventajas: catálogo único, actualizable sin publicar nueva app, filtros por perfil/alergias en servidor, menor peso en móvil.
En móvil, lo correcto es cachear localmente el catálogo (con versión) para que cargue rápido y soporte mala conexión.
