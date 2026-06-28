# Checklist: macros-perfil-metabolico-fase

## Fase 0 - Baseline y contrato

- [x] Inventariar todos los puntos que calculan o muestran macros.
- [x] Confirmar contrato canónico de salida (`g`, `%`, audit, ruleset).
- [x] Decidir estrategia de compatibilidad (wrapper temporal vs reemplazo directo).
- [x] Confirmar alias soportados para perfil y fase.

**Tareas**

- Revisar `nutritionCalculator`, `metabolicProfileCalculator`, `bridgeCoordinator`, rutas y UI.
- Documentar consumers primarios/secundarios.
- Cerrar decisión pendiente de compatibilidad.

**Tests**

- [x] No aplica test funcional todavía; baseline documental cerrado.

**Notas / decisiones**

- Decisión ejecutada: mantener wrappers compatibles durante una iteración y delegar toda la lógica al resolver canónico.
- Consumers confirmados: `nutritionCalculator`, `metabolicProfileCalculator`, `bridgeCoordinator`, `trainingNutritionBridge`, `metabolicProfile`, `nutritionV2/current_estimate` y fallback local de `NutritionScreen`.

**Gate: tests de fase pasados**

- [x] Pendiente

## Fase 1 - Servicio canónico `perfil + fase`

- [x] Crear `backend/services/macroProfilePhaseResolver.js`.
- [x] Implementar tabla oficial `3x3`.
- [x] Implementar normalización de perfil.
- [x] Implementar normalización de fase.
- [x] Implementar cálculo base en gramos desde kcal.
- [x] Implementar guardarraíles + rebalanceo.
- [x] Exponer audit payload + ruleset.

**Tareas**

- Crear módulo canónico.
- Definir constants/versionado.
- Documentar la estructura de salida en código.

**Tests**

- [x] Test unitario de 9 combinaciones exactas.
- [x] Test de aliases de perfil.
- [x] Test de aliases de fase.
- [x] Test de guardarraíl mínimo de proteína.
- [x] Test de guardarraíl máximo de proteína.
- [x] Test de guardarraíl mínimo de grasa.

**Notas / decisiones**

- El resolver es la única fuente de verdad nueva.

**Gate: tests de fase pasados**

- [x] Pendiente

## Fase 2 - Generador principal de nutrición

- [x] Delegar `calculateMacros()` al resolver canónico.
- [x] Alinear `generateNutritionPlan()`.
- [x] Alinear `generateNutritionPlanWithKcalOverride()`.
- [x] Añadir `calculation_audit.macros`.
- [x] Actualizar `version_reglas`.

**Tareas**

- Refactor mínimo con compatibilidad controlada.
- Evitar duplicidad de reglas dentro de `nutritionCalculator.js`.

**Tests**

- [x] Test de integración: `cut` vs `mant` vs `bulk` cambian correctamente.
- [x] Test de integración: override mantiene perfil correcto.
- [x] Test de versionado `mindfeed_macro_phase_v2`.

**Notas / decisiones**

- Se mantuvieron BMR/TDEE fuera del nuevo módulo; solo se movió la lógica de macros.

**Gate: tests de fase pasados**

- [x] Pendiente

## Fase 3 - Evaluación metabólica

- [x] Delegar `calculateMacrosWithMetabolicProfile()` al resolver.
- [x] Alinear `processMetabolicEvaluation()`.
- [x] Persistir `template_pct`, `% finales` y `ruleset` si procede.
- [x] Verificar que confianza baja sigue forzando `mixto` correctamente.

**Tareas**

- Reutilizar `appliedProfile` y fase nutricional normalizada.
- Evitar heurística legacy paralela.

**Tests**

- [x] Test de alineación entre evaluación metabólica y generador principal.
- [x] Test de confianza baja → `mixto` con tabla nueva.

**Notas / decisiones**

- La lógica de score/anti-ruido se mantiene; solo cambia la resolución de macros.

**Gate: tests de fase pasados**

- [x] Pendiente

## Fase 4 - Bridge y rutas secundarias

- [x] Alinear `bridgeCoordinator`.
- [x] Corregir `trainingNutritionBridge` en override de kcal.
- [x] Actualizar `GET /api/metabolic-profile/distributions`.
- [x] Revisar rutas secundarias que consuman macros.

**Tareas**

- Garantizar que el bridge preserve `metabolic_type`, `metabolic_confidence`, `level` y fase.
- Mantener compat temporal con `legacy_ranges` + `phase_table` en `/distributions`.

**Tests**

- [x] Test específico de `override_kcal` sin pérdida de perfil.
- [x] Test bridge vs plan principal: coherencia de salida.

**Notas / decisiones**

- `nutritionV2/current_estimate` también publica ya macros auditados con el nuevo ruleset.

**Gate: tests de fase pasados**

- [x] Pendiente

## Fase 5 - Frontend, auditoría y documentación

- [x] Revisar/eliminar cálculo local en `NutritionScreen.jsx`.
- [x] Revisar exposición UI en `NutritionPlanGenerator.jsx`.
- [x] Añadir/normalizar audit payload en salidas críticas.
- [x] Actualizar `VERIFICACION_MODULO_METABOLISMO.md`.
- [x] Actualizar auditorías relacionadas si procede.

**Tareas**

- Verificar que frontend muestre datos backend consistentes.
- Cerrar contradicciones documentales.

**Tests**

- [x] Smoke manual UI: macros mostrados coinciden con backend.
- [x] Validación manual de payloads auditados.

**Notas / decisiones**

- `NutritionPlanGenerator` quedó revisado sin requerir cambio de contrato UI en esta iteración.
- QA visual/UI real completado con Playwright autenticado; evidencia en `test-results/manual-qa-macros-perfil-fase/`.

**Gate: tests de fase pasados**

- [x] Pendiente

## Fase 6 - QA final y cierre

- [x] Ejecutar suite backend relevante.
- [x] Ejecutar QA manual documentado.
- [x] Actualizar `status.md` con cierre real.
- [x] Dejar pack listo para `impl-pack-close` cuando proceda.

**Tareas**

- Consolidar evidencia.
- Revisar definición de hecho completa.

**Tests**

- [x] `npm run test:backend`
- [x] lint dirigido si aplica
- [x] QA manual de plan/evaluacion/bridge/UI

**Notas / decisiones**

- Evidencia automatizada lista: matriz `3x3`, plan principal, evaluación metabólica, override y bridge en verde.
- QA manual final completado con Playwright; el pack queda listo para `impl-pack-close`.

**Gate: tests de fase pasados**

- [x] Pendiente
