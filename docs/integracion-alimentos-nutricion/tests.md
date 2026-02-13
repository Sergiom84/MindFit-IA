# Tests: Integracion `alimentos` con nutricion `main`

## Estrategia por fase

- Fase 0: baseline/smoke de comportamiento actual.
- Fase 1: verificacion de esquema y drift de migraciones.
- Fase 2: validacion de imports y calidad de datos.
- Fase 3: pruebas de endpoints nuevos + no regresion 7d/14d.
- Fase 4: pruebas de generacion/persistencia/lectura de items.
- Fase 5: QA UI funcional y visual.
- Fase 6: regression completa + E2E final.

## Casos borde

1. Usuario sin plan activo (`active-plan` 404 controlado).
2. Menus generados sin match completo de slugs (persistencia parcial y aviso).
3. Item con `tal_cual` sin conversion disponible.
4. Falta de factor para conversion solicitada.
5. Preferencias/alergias estrictas con catalogo reducido.
6. Verificar que ajustes 7d/14d no se alteran tras integrar bloques de `alimentos`.

## Datos de prueba

- Usuario QA con plan activo v2.
- Perfil con alergias y restricciones (veg/vegano/sin gluten/sin lactosa).
- Catalogo con factores de conversion y plantillas cargadas.
- Ventanas de pesajes/registros diarias para regression del motor 7d/14d.

## Comandos de pruebas (repo)

- Calidad:
  - `npm run lint`
- Backend tests:
  - `npm run test:backend`
- E2E:
  - `npx playwright test`
- SQL checks manuales (Supabase MCP):
  - `information_schema.columns` y `information_schema.tables`

## Criterio para avanzar de fase

- Fase 0 -> 1: baseline documentado y smoke en verde.
- Fase 1 -> 2: esquema validado y decision de migraciones cerrada.
- Fase 2 -> 3: imports correctos y calidad aceptable.
- Fase 3 -> 4: endpoints nuevos OK sin romper 7d/14d.
- Fase 4 -> 5: persistencia de items y `active-plan` enriquecido OK.
- Fase 5 -> 6: UX funcional estable en desktop/mobile.
- Cierre: regression + E2E en verde y sin riesgos bloqueantes.

## Ejecucion real (2026-02-13)

- Verificacion SQL Supabase (MCP): OK
  - columnas MindFeed en `app.foods`: OK
  - tablas `food_conversion_factors`, `meal_templates`, `meal_template_slots`, `food_roles`: OK
  - drift detectado: esquema existe pero `schema_migrations` no lista versiones `20260206%`
- Conteos de datos en Supabase: OK
  - `foods_mindfeed=241`
  - `food_conversion_factors=8`
  - `meal_templates=64`
  - `meal_template_slots=199`
  - `food_roles=387`
- Tests backend no regresion 7d/14d: OK (15/15)
  - `nutritionDailyV2.test.js`
  - `nutritionReviewV2.test.js`
  - `nutritionAdjustmentsV2.test.js`
  - `nutritionUndoV2.test.js`
- Lint de archivos integrados (`nutritionV2`, prompt, calendar/detail): sin errores (solo warnings existentes).

## Pendientes de testing para cierre de fases 3-6

- Smoke HTTP de endpoints nuevos (`/foods`, `/food-conversion-factors`, `/generate-menu`, `/generate-full-day-menus`, `/active-plan` enriquecido) con backend local accesible.
- QA visual/funcional en UI (desktop + mobile) del flujo generar -> persistir -> mostrar items + conversiones.
- E2E final de integración.
