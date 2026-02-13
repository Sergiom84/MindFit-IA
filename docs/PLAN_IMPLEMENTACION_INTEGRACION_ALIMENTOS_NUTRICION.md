# Plan de implementacion por fases: integracion rama `alimentos` con motor de nutricion actual

Fecha: 2026-02-12  
Base: `main` + referencia funcional de `origin/alimentos`  
Objetivo: integrar lo complementario de `alimentos` sin perder ni romper lo ya implementado en `main` (revision semanal/quincenal, daily log, ajustes y deshacer).

## 1) Resultado esperado (fin del proyecto)

- Catalogo de alimentos enriquecido (slug, fibra, estados de pesado, grupo_factor, flags dieta).
- Conversion de gramos por estado (crudo/cocido/escurrido/seco/tal_cual) operativa.
- Menus del dia persistidos en `nutrition_meal_items` y visibles en plan activo.
- Generacion de menu en modo determinista (plantillas/roles) con fallback IA.
- UI mostrando items, estados y conversiones.
- Endpoints de revision y ajustes de `main` intactos y funcionando (`/daily`, `/review`, `/adjustments/*`).

## 2) Principio de integracion (regla clave)

No se hara merge directo de `origin/alimentos` sobre `main`.  
Se integrara por bloques funcionales, conservando como fuente de verdad la version actual de `main` para revision 7d/14d y ajustes.

## 3) Fases de implementacion

## Fase 0 - Preparacion y baseline tecnico

### Objetivo

Reducir riesgo de regresion antes de tocar codigo.

### Tareas

- Crear rama de trabajo: `integracion/alimentos-nutricion`.
- Congelar baseline de endpoints actuales de `nutritionV2`.
- Documentar diferencias criticas entre `main` y `origin/alimentos` en backend/frontend/sql.

### Criterio de salida

- Baseline de API y UI registrado.
- Lista de conflictos logicos cerrada (que se mantiene de `main` y que entra de `alimentos`).

---

## Fase 1 - Capa de datos (migraciones y esquema)

### Objetivo

Tener el esquema necesario para alimentos enriquecidos, conversiones, items y plantillas.

### Tareas

- Integrar migraciones de `origin/alimentos`:
  - `20260206000001_add_mindfeed_fields_to_foods.sql`
  - `20260206000002_create_food_conversion_factors.sql`
  - `20260206000003_prepare_nutrition_meal_items.sql`
  - `20260206000004_create_meal_template_library.sql`
- Verificar constraints, indices y RLS.
- Ejecutar verificacion de migraciones/esquema.

### Criterio de salida

- Migraciones aplicadas sin errores.
- Tablas y columnas nuevas visibles y validadas.

---

## Fase 2 - Ingesta de datos (alimentos y plantillas)

### Objetivo

Cargar datos reales de MindFeed en BD para que el motor pueda operar.

### Tareas

- Integrar/ajustar scripts:
  - `scripts/import_mindfeed_data.py`
  - `scripts/import_meal_templates.py`
- Importar alimentos desde Excel base.
- Importar biblioteca de plantillas y roles.
- Ejecutar validaciones de calidad (slugs faltantes, roles sin match, tags y estados invalidos).

### Criterio de salida

- Catalogo y plantillas cargados con conteos esperados.
- Reporte de calidad de datos con incidencias resueltas o aceptadas.

---

## Fase 3 - Backend de catalogo y conversion (sin tocar ajustes 7d/14d)

### Objetivo

Exponer capacidades nuevas del catalogo sin afectar lo ya alineado con spec.

### Tareas

- Integrar mejoras de `GET /foods` (filtros dieta, alergias, estado base, grupo_factor, paginacion).
- Integrar `GET /food-conversion-factors`.
- Mantener intactos endpoints existentes de `main`:
  - `GET /daily/:date`
  - `POST /daily`
  - `GET /review`
  - `POST /adjustments/apply`
  - `POST /adjustments/undo-last`

### Criterio de salida

- Nuevos endpoints funcionando.
- Endpoints de revision/ajustes siguen pasando pruebas.

---

## Fase 4 - Generacion y persistencia de menus

### Objetivo

Que generar menus produzca items reales guardados y reutilizables.

### Tareas

- Integrar modo determinista de generacion por plantillas/roles.
- Mantener modo IA como fallback o modo alternativo.
- Persistir items generados en `app.nutrition_meal_items`.
- Extender `GET /active-plan` para devolver `meals.items` enriquecidos.

### Criterio de salida

- `generate-menu` y `generate-full-day-menus` guardan items.
- `active-plan` devuelve items consistentes con BD.

---

## Fase 5 - UI: visualizacion y conversion de estados

### Objetivo

Reflejar visualmente la nueva capa de alimentos en UX real.

### Tareas

- Integrar mejoras en:
  - `src/components/nutrition/MealDetailView.jsx`
  - `src/components/nutrition/NutritionCalendarView.jsx`
- Mostrar items de comida, estado base/mostrado y factores de conversion.
- Habilitar flujo de generar menus del dia con recarga consistente.
- Mantener visible y estable el bloque de revision semanal/quincenal ya implementado en dashboard.

### Criterio de salida

- Usuario ve items reales y conversiones en UI.
- No hay incoherencia entre datos de plan y detalle de comidas.

---

## Fase 6 - QA integral y cierre

### Objetivo

Validar que la integracion completa funciona extremo a extremo.

### Tareas

- Pruebas backend:
  - catalogo filtrado
  - conversion factors
  - generacion determinista
  - persistencia de items
  - active-plan con items
  - revision 7d/14d y ajustes (no regresion)
- Pruebas frontend:
  - calendario + detalle de comida
  - render de conversiones
  - estados sin factor ("sin conversion")
- Prueba E2E con usuario real de test.

### Criterio de salida

- Todo el flujo nutricional pasa pruebas funcionales.
- Sin regresiones en el motor de control semanal/quincenal.

## 4) Riesgos y mitigacion

- Riesgo: `nutritionV2.js` tiene divergencia grande entre ramas.
  - Mitigacion: integracion por bloques, no cherry-pick masivo.
- Riesgo: perder endpoints de revision/ajustes de `main`.
  - Mitigacion: tests de no regresion antes y despues de cada fase.
- Riesgo: datos Excel inconsistentes.
  - Mitigacion: import con validaciones + reporte de calidad.
- Riesgo: UI muestre datos incoherentes.
  - Mitigacion: `active-plan` como fuente principal para render de items.

## 5) Orden de ejecucion recomendado

1. Fase 0
2. Fase 1
3. Fase 2
4. Fase 3
5. Fase 4
6. Fase 5
7. Fase 6

## 6) Definicion de "hecho"

Se considera completado cuando:

- funcionalidades de `alimentos` complementarias estan operativas,
- motor actual de revision 7d/14d sigue intacto,
- UI refleja correctamente alimentos + conversiones,
- QA backend/frontend/E2E esta en verde.
