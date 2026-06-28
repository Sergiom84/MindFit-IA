# Implementación activa: macros-perfil-metabolico-fase

## Resumen

Este paquete abre la implementación de la spec `docs/especificacion_macros_perfil_metabolico_fase.md` para alinear todo el módulo de nutrición a una única tabla oficial de macros por:

- perfil metabólico (`tolerante`, `mixto`, `intolerante`), y
- fase nutricional (`cut`, `mant`, `bulk`).

El foco no es “retocar porcentajes” en puntos sueltos, sino dejar una solución robusta y sostenible con:

- una única fuente de verdad,
- una sola ruta de cálculo reutilizable,
- guardarraíles explícitos y auditables,
- consumers secundarios alineados,
- tests que blinden la matriz `3x3`.

## Objetivo y alcance

### Objetivo

Implementar la tabla cerrada de macros `perfil + fase` descrita en `docs/especificacion_macros_perfil_metabolico_fase.md` de forma consistente en:

- generador principal de planes,
- evaluación metabólica,
- bridge entrenamiento ↔ nutrición,
- overrides de kcal,
- endpoints de referencia,
- UI que muestre macros objetivo.

### Alcance

Incluye:

- backend de dominio para resolver macros por `perfil + fase`;
- refactor de `nutritionCalculator` y `metabolicProfileCalculator`;
- alineación del bridge y rutas auxiliares;
- hardening de auditoría y versionado de ruleset;
- tests unitarios e integración;
- limpieza de documentación activa/obsoleta relacionada.

### No-objetivos

No incluye en esta iteración:

- rediseño visual amplio de la UI de nutrición;
- nuevos semáforos ICG/IPG/IEC fuera de la corrección de los macros;
- rediseño de esquema SQL salvo que una necesidad concreta lo justifique durante la implementación;
- cambios en motor de menús o meal planner más allá de consumir los macros correctos.

## Decisiones tomadas en esta sesión

1. El slug activo de implementación será **`macros-perfil-metabolico-fase`**.
2. La spec fuente principal será `docs/especificacion_macros_perfil_metabolico_fase.md`.
3. La implementación seguirá la estrategia de **fuente de verdad única** en backend.
4. Se abrirá el trabajo con enfoque incremental y compatibilidad controlada.
5. Se usará `docs/PLAN_IMPLEMENTACION_MACROS_PERFIL_METABOLICO_FASE.md` como plan maestro de referencia.

## Decisión de compatibilidad ejecutada

Se ejecuta la **opción B** documentada:

- mantener wrappers compatibles (`calculateMacros`, `calculateMacrosWithMetabolicProfile`);
- delegar toda la lógica real al nuevo resolver canónico;
- alinear bridge/rutas secundarias sin exigir un rediseño de contrato inmediato.

Esto reduce riesgo, evita ruptura innecesaria en consumers existentes y deja una ruta clara para retirar wrappers legacy en una iteración posterior si se desea.

## Arquitectura propuesta

## 1. Capa canónica nueva

Crear un servicio de dominio dedicado, por ejemplo:

- `backend/services/macroProfilePhaseResolver.js`

Responsabilidades:

- normalizar fase;
- normalizar perfil;
- exponer la tabla oficial `3x3`;
- calcular gramos iniciales desde kcal objetivo;
- aplicar guardarraíles;
- devolver resultado final + audit trail + versionado.

## 2. Consumers que deben delegar a esa capa

### Backend principal

- `backend/services/nutritionCalculator.js`
- `backend/services/metabolicProfileCalculator.js`
- `backend/services/bridgeCoordinator.js`
- `backend/routes/trainingNutritionBridge.js`
- `backend/routes/metabolicProfile.js`

### Frontend a revisar

- `src/components/nutrition/NutritionScreen.jsx`
- `src/components/nutrition/NutritionPlanGenerator.jsx`

## 3. Orden lógico del cálculo

1. BMR/TMB.
2. TDEE/GCT.
3. Ajuste calórico por fase.
4. Resolución del perfil metabólico aplicado.
5. Resolución de plantilla `perfil + fase`.
6. Conversión a gramos.
7. Guardarraíles y rebalanceo.
8. Persistencia/log/auditoría.

## 4. Contrato de salida recomendado

Toda capa que consuma macros debería poder apoyarse en una respuesta que incluya al menos:

- `protein_g`, `carbs_g`, `fat_g`
- `protein_pct`, `carbs_pct`, `fat_pct`
- `template_pct`
- `guardrails_applied`
- `ruleset`
- `requested_profile` / `applied_profile`
- `requested_phase` / `applied_phase`

## Plan por fases

## Fase 0 — Baseline y decisión de compatibilidad

### Objetivo

Cerrar el inventario de consumers y fijar el contrato canónico.

### Entregables

- inventario de puntos de uso;
- decisión de compatibilidad wrapper/direct replace;
- shape final del payload canónico;
- versión de ruleset acordada.

### Criterio de aceptación

- existe una lista cerrada de consumers y un contrato técnico definido.

## Fase 1 — Servicio canónico de macros `perfil + fase`

### Objetivo

Crear la fuente de verdad única.

### Entregables

- nuevo servicio `macroProfilePhaseResolver`;
- tabla oficial `3x3` implementada;
- normalización de aliases;
- guardarraíles integrados;
- audit trail base;
- tests unitarios del resolver.

### Criterio de aceptación

- las 9 combinaciones exactas pasan en tests automatizados.

## Fase 2 — Refactor del generador principal de nutrición

### Objetivo

Alinear `nutritionCalculator` y el generador de planes a la nueva capa.

### Entregables

- `calculateMacros()` convertido en wrapper o delegado;
- `generateNutritionPlan()` alineado;
- `generateNutritionPlanWithKcalOverride()` alineado;
- `version_reglas` actualizado;
- `calculation_audit.macros` presente.

### Criterio de aceptación

- el plan principal cambia macros por fase de forma correcta y trazable.

## Fase 3 — Refactor del módulo metabólico

### Objetivo

Alinear evaluación metabólica con la misma lógica que usa el plan principal.

### Entregables

- `calculateMacrosWithMetabolicProfile()` delegado a la nueva capa;
- `processMetabolicEvaluation()` devolviendo salida consistente;
- persistencia de plantilla + porcentajes finales + ruleset.

### Criterio de aceptación

- evaluación metabólica y plan principal coinciden para el mismo contexto.

## Fase 4 — Bridge y caminos secundarios

### Objetivo

Cerrar rutas de recálculo divergentes.

### Entregables

- bridge alineado;
- `override_kcal` sin pérdida de `metabolic_type`;
- endpoint `/distributions` actualizado;
- consumers secundarios revisados.

### Criterio de aceptación

- ningún flujo funcional recalcula con la lógica legacy.

## Fase 5 — Frontend, auditoría y documentación

### Objetivo

Cerrar el loop de exposición al usuario y dejar trazabilidad/documentación coherente.

### Entregables

- revisión de `NutritionScreen.jsx` para eliminar cálculo local incoherente;
- `NutritionPlanGenerator.jsx` mostrando datos consistentes si aplica;
- docs de verificación y auditoría actualizadas;
- registro diario y docs activas al día.

### Criterio de aceptación

- UI y documentación ya no contradicen la lógica real.

## Fase 6 — QA y cierre

### Objetivo

Validar end-to-end y cerrar con evidencia.

### Entregables

- tests backend en verde;
- QA manual documentado;
- checklist cerrada;
- status final actualizado.

### Criterio de aceptación

- matriz `3x3`, bridge, override y UI validados.

## Riesgos y mitigaciones

### Riesgo 1 — Corregir solo una ruta de cálculo

**Mitigación:** mover la lógica a una sola capa canónica y dejar wrappers finos.

### Riesgo 2 — Romper contratos del frontend

**Mitigación:** mantener campos existentes y añadir auditoría incremental.

### Riesgo 3 — Override de kcal con perfil incorrecto

**Mitigación:** bloquear cierre sin test específico de `override_kcal`.

### Riesgo 4 — Docs desfasadas tras implementación

**Mitigación:** incluir fase explícita de actualización documental antes del cierre.

## Plan de despliegue / rollout

1. Implementar servicio canónico + tests unitarios.
2. Reenrutar cálculo principal.
3. Reenrutar evaluación metabólica.
4. Reenrutar bridge y override.
5. Revisar frontend y docs.
6. Ejecutar QA final.

### Estrategia recomendada

- sin migración SQL inicial si no es imprescindible;
- con versionado explícito de ruleset;
- con wrappers compatibles durante la transición;
- con QA comparativo antes de considerar cierre.

## Definition of Done

Se considerará terminado cuando:

- exista una única fuente de verdad para macros `perfil + fase`;
- plan principal, evaluación metabólica y bridge usen la misma lógica;
- `override_kcal` respete el perfil metabólico;
- la UI no muestre cálculos locales incompatibles;
- la matriz `3x3` esté cubierta por tests;
- exista evidencia de QA manual;
- `docs/_active.md`, `status.md`, `checklist.md`, `tests.md` y `REGISTRO_DIARIO_IMPLEMENTACIONES.md` estén alineados.

## Outcome summary

### Qué se implementó

- Se creó `backend/services/macroProfilePhaseResolver.js` como fuente única de verdad para la tabla oficial `perfil + fase`, con ruleset `mindfeed_macro_phase_v2`, aliases controlados y salida auditable.
- Se alinearon `backend/services/nutritionCalculator.js`, `backend/services/metabolicProfileCalculator.js`, `backend/services/bridgeCoordinator.js`, `backend/routes/trainingNutritionBridge.js`, `backend/routes/metabolicProfile.js` y `backend/routes/nutritionV2.js` para que consuman el mismo resolver.
- Se corrigió el flujo de `override_kcal` para no perder `metabolic_type` y se expuso `calculation_audit.macros` como rastro operativo del reparto aplicado.
- Se eliminó del frontend el cálculo local incoherente en `src/components/nutrition/NutritionScreen.jsx`, manteniendo compatibilidad de consumo con los datos reales del backend.
- Se añadieron suites backend específicas para matriz `3x3`, alineación entre calculadoras y bridge override, y se completó QA manual/autenticado con Playwright sobre el flujo visible.

### Qué se cambió vs plan original

- El rollout se cerró manteniendo wrappers compatibles en lugar de hacer un corte agresivo de contratos legacy, para reducir riesgo en rutas secundarias.
- El QA manual se automatizó con un script Playwright autenticado (`test-results/manual-qa-macros-perfil-fase/run-playwright-qa.mjs`) y un reporte JSON reutilizable, en vez de dejar solo pasos manuales narrativos.
- La verificación funcional final se apoyó también en la auditoría observable del plan activo (`macros_objetivo` / respuesta API) para validar paridad UI/API sin depender de inspección visual únicamente.

### Pendientes

- No quedan pendientes críticos dentro del alcance de este impl-pack.
- Como mejora futura opcional, se puede homogeneizar aún más la exposición de `calculation_audit` en consumers secundarios si se quisiera extender trazabilidad en otras vistas.

### Riesgos conocidos post-release

- Persisten documentos históricos que pueden mencionar lógica legacy; si se reutilizan fuera del pack activo conviene revisarlos antes de tomarlos como referencia operativa.
- La build/lint global del repo mantiene warnings legacy fuera de alcance, por lo que futuras tareas deben seguir separando deuda histórica del contrato implementado aquí.
- El QA manual cubre el flujo autenticado principal y los casos críticos del rollout, pero no sustituye una matriz E2E completa para todas las combinaciones de perfil/fase.
