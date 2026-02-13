# Implementacion: Integracion rama `alimentos` con motor de nutricion de `main`

## Resumen

Este pack define la implementacion por fases para integrar lo complementario de `origin/alimentos` sin reescribir la capa ya validada en `main` (revision 7d/14d, registro diario, ajustes y deshacer).

## Objetivo y alcance

### Objetivo

Integrar capacidades de catalogo avanzado, conversiones, persistencia de items y generacion determinista de menus, manteniendo estable el motor actual de control nutricional.

### Alcance incluido

- Integracion selectiva de backend en `backend/routes/nutritionV2.js`.
- Integracion de migraciones/datos de alimentos y plantillas.
- Integracion de UI para visualizar items y conversiones:
  - `src/components/nutrition/MealDetailView.jsx`
  - `src/components/nutrition/NutritionCalendarView.jsx`
- QA de no regresion sobre endpoints y flujo 7d/14d ya existentes.

### No objetivos

- No hacer merge directo de `origin/alimentos` sobre `main`.
- No redisenar el motor de revision semanal/quincenal ya implementado.
- No cambiar reglas de entrenamiento ni el puente ya alineado con spec.

## Decisiones tomadas en esta sesion

1. `main` es la base funcional; `alimentos` entra por bloques.
2. Se preservan como intocables los endpoints de control ya implementados:
   - `GET /api/nutrition-v2/daily/:date`
   - `POST /api/nutrition-v2/daily`
   - `GET /api/nutrition-v2/review`
   - `POST /api/nutrition-v2/adjustments/apply`
   - `POST /api/nutrition-v2/adjustments/undo-last`
3. Se prioriza integracion progresiva con tests de no regresion por fase.
4. El esquema de Supabase ya contiene tablas/columnas de `alimentos`, pero el tracking de migraciones no refleja versiones `20260206%`.

### Pendiente de decision

- Cuándo reconciliar el tracking de migraciones (`supabase_migrations.schema_migrations`) respecto a cambios ya aplicados manualmente.
- Recomendacion: reconciliar al cerrar Fase 1, despues de verificar drift real en SQL y sin tocar datos productivos.

## Arquitectura propuesta

### Backend

- Mantener `nutritionV2.js` de `main` como rama principal.
- Integrar de `alimentos` de forma modular:
  - catalogo avanzado (`/foods` filtros),
  - `/food-conversion-factors`,
  - persistencia de `nutrition_meal_items`,
  - `active-plan` enriquecido con `meals.items`,
  - motor determinista de menu (con fallback IA).

### Datos

- Usar `app.foods` ampliada como tabla canon de alimentos.
- Usar `app.food_conversion_factors` para conversiones de estado.
- Usar `app.meal_templates`, `app.meal_template_slots`, `app.food_roles` para motor determinista.

### Frontend

- Mostrar items y estados de pesado en detalle diario.
- Permitir render consistente de conversiones y factores disponibles.
- Mantener bloque de revision semanal/quincenal de `main` sin cambios funcionales.

## Plan por fases

## Fase 0 - Preparacion y baseline

Entregables:

- Rama `integracion/alimentos-nutricion`.
- Baseline de endpoints y comportamiento actual.
- Matriz de compatibilidad `main` vs `origin/alimentos`.

Criterios de aceptacion:

- Alcance cerrado y lista de injertos definida.

## Fase 1 - Capa de datos y migraciones

Entregables:

- Migraciones de `alimentos` integradas en repo.
- Verificacion de esquema en Supabase.
- Plan de reconciliacion del tracking de migraciones.

Criterios de aceptacion:

- Esquema requerido disponible y sin drift critico.

## Fase 2 - Ingesta de alimentos y plantillas

Entregables:

- Scripts de import operativos.
- Datos cargados y validados (conteos y calidad minima).

Criterios de aceptacion:

- Catalogo y biblioteca listos para motor determinista.

## Fase 3 - Backend catalogo/conversion preservando 7d/14d

Entregables:

- `/foods` mejorado.
- `/food-conversion-factors`.
- Endpoints 7d/14d intactos y funcionales.

Criterios de aceptacion:

- Nuevas capacidades activas sin regresiones en revision/ajustes.

## Fase 4 - Generacion y persistencia de menus

Entregables:

- Generacion determinista por plantillas/roles.
- Persistencia de items en `nutrition_meal_items`.
- `active-plan` con items enriquecidos.

Criterios de aceptacion:

- Menus generados/persistidos y recuperables de forma consistente.

## Fase 5 - UI de items y conversiones

Entregables:

- Integracion de `MealDetailView` y `NutritionCalendarView` con items reales.
- Render de estados/factores y fallback "sin conversion".

Criterios de aceptacion:

- UX coherente entre plan, menus e items.

## Fase 6 - QA integral y cierre

Entregables:

- QA backend + frontend + E2E.
- Evidencias y decision de go/no-go.

Criterios de aceptacion:

- Todo el flujo nutricional pasa gates sin romper 7d/14d.

## Riesgos y mitigaciones

- Riesgo: conflicto grande en `nutritionV2.js`.
  - Mitigacion: injertos por bloques y commits pequenos.
- Riesgo: perder endpoints de `main`.
  - Mitigacion: suite de regresion obligatoria por fase.
- Riesgo: datos Excel inconsistentes.
  - Mitigacion: import con validaciones y reporte de calidad.
- Riesgo: drift de migraciones.
  - Mitigacion: reconciliacion controlada tras Fase 1.

## Plan de despliegue / rollout

1. Activar backend por bloques (catalogo -> persistencia -> motor determinista).
2. Activar UI cuando datos y endpoints esten estables.
3. Ejecutar QA completo y liberar.

## Definition of Done

- Funcionalidades de `alimentos` integradas y operativas.
- Motor 7d/14d actual preservado sin regresiones.
- UI muestra items y conversiones de forma confiable.
- Gates de pruebas backend/frontend/E2E en verde.
