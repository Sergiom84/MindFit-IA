# Checklist: Integracion `alimentos` + motor nutricion `main`

## Fase 0 - Preparacion y baseline

- [x] Crear rama `integracion/alimentos-nutricion`.
- [x] Congelar baseline de endpoints actuales en `nutritionV2`.
- [x] Documentar matriz de injertos (`main` conserva / `alimentos` aporta).

**Tareas**

- [ ] Listar endpoints intocables de `main` (7d/14d).
- [ ] Listar bloques a injertar de `alimentos`.

**Tests**

- [ ] Smoke test backend actual (`review`, `daily`, `adjustments`) antes de tocar codigo. (Intentado 2026-02-13, backend local no accesible en `localhost:3010`)

**Notas/decisiones**

- `main` permanece como fuente de verdad.
- Smoke test intentado (2026-02-13): `NETWORK_ERROR` en `localhost:3010` (backend no accesible en ese momento).

**Gate: tests de fase pasados**

- [ ] OK

## Fase 1 - Capa de datos y migraciones

- [x] Integrar migraciones `20260206*` en el flujo del repo.
- [x] Verificar columnas/tablas esperadas en Supabase.
- [x] Evaluar y definir reconciliacion de tracking de migraciones.

**Tareas**

- [x] Revisar drift local vs `supabase_migrations.schema_migrations`.
- [x] Dejar decision escrita sobre reconciliacion.

**Tests**

- [x] Verificacion SQL de esquema (`foods`, `food_conversion_factors`, `meal_templates`, `food_roles`).

**Notas/decisiones**

- Decisión: no reconciliar automáticamente en esta fase para evitar tocar historial remoto sin ventana de mantenimiento; se deja tarea explícita de reconciliación controlada antes de release.
- Recomendación aplicada: reconciliar con script/plan dedicado y backup lógico previo.

**Gate: tests de fase pasados**

- [x] OK

## Fase 2 - Ingesta de datos

- [x] Validar scripts de import de alimentos.
- [x] Validar scripts de import de plantillas/roles.
- [x] Cargar datos y generar reporte de calidad.

**Tareas**

- [ ] Ejecutar import de alimentos. (Pendiente: entorno sin `pandas`)
- [ ] Ejecutar import de biblioteca de platos. (Pendiente: entorno sin `pandas`)
- [x] Revisar slugs faltantes y roles sin match.

**Tests**

- [x] Conteos de filas esperadas por tabla.
- [x] Spot checks de valores clave (estado base, grupo_factor, flags dieta).

**Notas/decisiones**

- [x] Pendiente de decision cerrada.
- Datos ya cargados en Supabase (`foods_mindfeed=241`, `templates=64`, `slots=199`, `food_roles=387`), por lo que no se fuerza reimport en esta iteración.

**Gate: tests de fase pasados**

- [x] OK (con observación: ejecución de scripts pendiente por dependencia local de Python)

## Fase 3 - Backend catalogo y conversion

- [x] Injertar `/foods` avanzado.
- [x] Injertar `/food-conversion-factors`.
- [x] Preservar endpoints 7d/14d sin cambios funcionales.

**Tareas**

- [x] Integrar bloque de filtros de catalogo.
- [x] Integrar bloque de conversion factors.
- [x] Validar que endpoints legacy v2 siguen intactos.

**Tests**

- [ ] Tests de endpoints nuevos. (Pendiente: backend local no accesible para smoke HTTP)
- [x] Tests de no regresion para `daily/review/adjustments`.

**Notas/decisiones**

- [x] Confirmar modo de fallback cuando falten factores.
- Fallback confirmado: mantener gramos por defecto y marcar “Sin conversion” en UI cuando no existe factor aplicable.

**Gate: tests de fase pasados**

- [ ] OK (pendiente smoke endpoints nuevos)

## Fase 4 - Generacion y persistencia de menus

- [x] Integrar motor determinista por plantillas/roles.
- [x] Mantener fallback IA.
- [x] Persistir items en `nutrition_meal_items`.
- [x] Enriquecer `active-plan` con `meals.items`.

**Tareas**

- [x] Integrar generador determinista en `nutritionV2`.
- [x] Añadir persistencia atomica de items.
- [x] Ajustar query de `active-plan`.

**Tests**

- [ ] Generate menu persiste items. (Pendiente: smoke API con backend local activo)
- [ ] Generate full day menus persiste items. (Pendiente: smoke API con backend local activo)
- [ ] Active plan devuelve items esperados. (Pendiente: smoke API con backend local activo)

**Notas/decisiones**

- [x] Confirmar modo por defecto (`deterministic` vs `ai`).
- Modo por defecto aplicado: `deterministic` (IA queda disponible como modo alternativo).

**Gate: tests de fase pasados**

- [ ] OK

## Fase 5 - UI items y conversiones

- [x] Integrar `MealDetailView` con items reales.
- [x] Integrar `NutritionCalendarView` con generacion de menus del dia.
- [x] Mostrar conversiones y estados bloqueados cuando aplique.

**Tareas**

- [x] Ajustar render de items y estados.
- [x] Ajustar feedback visual de factores/no conversion.
- [x] Mantener panel de revision 7d/14d sin regresion.

**Tests**

- [ ] QA visual desktop/mobile. (Pendiente con backend local activo)
- [ ] QA funcional flujo generar -> persistir -> mostrar. (Pendiente con backend local activo)

**Notas/decisiones**

- [x] Confirmar copy final de estados de conversion.

**Gate: tests de fase pasados**

- [ ] OK

## Fase 6 - QA integral y cierre

- [ ] Ejecutar QA backend completo.
- [ ] Ejecutar QA frontend/E2E.
- [ ] Emitir resultado final go/no-go.

**Tareas**

- [ ] Consolidar evidencias en `tests.md`.
- [ ] Cerrar pendientes de decision.

**Tests**

- [ ] Suite regression 7d/14d.
- [ ] Suite alimentos/conversiones/menus.
- [ ] E2E principal del flujo nutricion.

**Notas/decisiones**

- [ ] Riesgos residuales y plan de mitigacion post-release.

**Gate: tests de fase pasados**

- [ ] OK
