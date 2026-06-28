# Plan de Implementación — Macros por Perfil Metabólico y Fase

Fecha: 2026-03-19

**Spec fuente:** `docs/especificacion_macros_perfil_metabolico_fase.md`
**Contexto relacionado:**

- `docs/mindfit_nutrition_system_spec_unified.md`
- `docs/PLAN_ALINEACION_TOTAL_NUTRICION_SPEC.md`
- `docs/AUDITORIA_NUTRICION_MINDFIT.md`
- `docs/VERIFICACION_MODULO_METABOLISMO.md`

## 1. Objetivo

Implementar de forma **robusta, escalable y sostenible** la distribución de macronutrientes por:

1. **perfil metabólico** (`tolerante`, `mixto`, `intolerante`), y
2. **fase nutricional** (`definicion`, `normocalorica`, `volumen` / `cut`, `mant`, `bulk`),

usando como **referencia única** la tabla cerrada en `docs/especificacion_macros_perfil_metabolico_fase.md`, eliminando la ambigüedad actual y evitando que distintos módulos calculen macros con reglas diferentes.

---

## 2. Resultado esperado

Al terminar esta implementación:

- el sistema tendrá **una sola fuente de verdad** para porcentajes `perfil + fase`;
- `generateNutritionPlan`, `processMetabolicEvaluation`, el bridge y cualquier recálculo por override usarán exactamente la misma lógica;
- los guardarraíles de proteína y grasa seguirán existiendo, pero aplicados **después** de la tabla oficial;
- las respuestas API, los logs y la persistencia dejarán trazabilidad clara de:
  - perfil aplicado,
  - fase aplicada,
  - plantilla porcentual usada,
  - ajustes por guardarraíl,
  - porcentajes finales reales;
- la UI dejará de depender de cálculos locales inconsistentes cuando muestre macros objetivo.

---

## 3. Principios de diseño

### 3.1 Fuente de verdad única

No puede haber dos implementaciones con heurísticas distintas para la misma regla de negocio.

### 3.2 Determinismo

Dado el mismo `perfil + fase + kcal + peso + nivel`, el resultado debe ser exactamente el mismo en todos los puntos del sistema.

### 3.3 Compatibilidad incremental

La implementación debe poder desplegarse sin romper flujos actuales ni requerir un rediseño de base de datos como prerrequisito.

### 3.4 Trazabilidad

Cada decisión relevante debe poder auditarse: qué plantilla se aplicó, si hubo guardarraíl y cuál fue el resultado final.

### 3.5 Testabilidad

La matriz `3 perfiles x 3 fases` debe quedar protegida por tests automatizados directos.

---

## 4. Estado actual y brechas detectadas

## 4.1 Problema principal

La spec nueva cierra una tabla exacta por `perfil + fase`, pero el repo hoy sigue usando una combinación de:

- rangos legacy por perfil,
- ajustes heurísticos por fase,
- guardarraíles posteriores,
- y varios puntos de entrada con comportamientos distintos.

## 4.2 Brechas concretas

### A. `backend/services/nutritionCalculator.js`

`calculateMacros()` usa rangos medios por perfil y no la tabla exacta de 9 combinaciones.

**Consecuencia:** el plan determinista principal puede usar distribuciones que no coinciden con la spec.

### B. `backend/services/metabolicProfileCalculator.js`

`calculateMacrosWithMetabolicProfile()` sí diferencia `cut/mant/bulk`, pero con una heurística antigua:

- `cut`: proteína máxima del rango + carbos mínimos,
- `bulk`: carbos máximos,
- `mant`: valores medios.

**Consecuencia:** está más cerca de la intención, pero no cumple la tabla cerrada de la spec.

### C. Duplicidad de lógica

Existen al menos dos calculadoras de macros con reglas diferentes:

- `calculateMacros()`
- `calculateMacrosWithMetabolicProfile()`

**Consecuencia:** dos pantallas/endpoints distintos pueden devolver resultados distintos para el mismo usuario.

### D. Bridge con pérdida de contexto metabólico

En `backend/routes/trainingNutritionBridge.js`, el recálculo por `override_kcal` llama a `calculateMacros(...)` sin garantizar que use el `metabolic_type` del usuario.

**Consecuencia:** un override puede recalcular con un perfil equivocado o caer en el fallback `mixto`.

### E. Endpoint de distribuciones desfasado

`GET /api/metabolic-profile/distributions` hoy expone rangos legacy por perfil, no la tabla oficial por fase.

### F. UI con cálculo local paralelo

`src/components/nutrition/NutritionScreen.jsx` mantiene un cálculo local básico de macros por metodología/objetivo.

**Consecuencia:** aunque backend quede bien, la UI todavía podría mostrar valores incoherentes con la lógica real.

### G. Documentación de verificación obsoleta

`docs/VERIFICACION_MODULO_METABOLISMO.md` afirma que el módulo está 100% implementado respecto a una lógica que ya no representa la spec nueva.

### H. Falta de tests de matriz cerrada

No hay una suite focalizada que garantice los 9 casos exactos `perfil + fase`.

---

## 5. Arquitectura objetivo

## 5.1 Nuevo contrato canónico

Crear una única capa de dominio para resolver macros por perfil metabólico y fase.

### Propuesta de archivo nuevo

- `backend/services/macroProfilePhaseResolver.js`

### Responsabilidades de este módulo

1. Normalizar aliases de fase:
   - `cut`, `definicion`, `definición`
   - `mant`, `maint`, `maintenance`, `normo`, `normocalorica`
   - `bulk`, `volumen`, `superavit`, `superávit`

2. Normalizar aliases de perfil:
   - `tolerante`
   - `mixto`, `equilibrado`
   - `intolerante`

3. Exponer la tabla canónica exacta:

| Perfil      | Fase |   P |   C |   G |
| ----------- | ---- | --: | --: | --: |
| tolerante   | cut  |  28 |  47 |  25 |
| tolerante   | mant |  25 |  55 |  20 |
| tolerante   | bulk |  23 |  57 |  20 |
| mixto       | cut  |  28 |  32 |  40 |
| mixto       | mant |  25 |  40 |  35 |
| mixto       | bulk |  23 |  47 |  30 |
| intolerante | cut  |  30 |  22 |  48 |
| intolerante | mant |  27 |  28 |  45 |
| intolerante | bulk |  25 |  35 |  40 |

4. Resolver una plantilla exacta con audit trail.
5. Convertir la plantilla en gramos para un `kcalObjetivo`.
6. Aplicar guardarraíles en un orden único y documentado.
7. Devolver:
   - porcentajes de plantilla,
   - gramos provisionales,
   - ajustes aplicados,
   - porcentajes finales reales,
   - versión de reglas.

---

## 5.2 Algoritmo objetivo

Orden obligatorio:

1. Calcular `BMR/TMB`.
2. Calcular `TDEE/GCT`.
3. Aplicar fase calórica.
4. Resolver perfil metabólico aplicado.
5. Obtener plantilla exacta `perfil + fase`.
6. Convertir porcentajes a kcal y luego a gramos.
7. Aplicar guardarraíles.
8. Persistir/loggear resultado final con trazabilidad.

---

## 5.3 Política de guardarraíles

### Proteína

Implementar un guardarraíl explícito por rango de fase:

- `cut`: 2.0–2.4 g/kg
- `mant`: 1.6–2.2 g/kg
- `bulk`: 1.6–2.0 g/kg

### Grasa

Mantener el guardarraíl ya existente:

- mínimo `0.6 g/kg`, o
- mínimo `20%` del total calórico,
- se aplica el mayor.

### Política de rebalanceo recomendada

Para que la lógica sea sostenible y no dependa de ifs dispersos:

1. Calcular macros provisionales desde la plantilla.
2. Fijar proteína si queda fuera del rango permitido.
3. Fijar grasa si queda por debajo del mínimo.
4. Redistribuir las kcal restantes entre carbohidratos y grasa según el peso relativo de la plantilla base, sin violar los guardarraíles ya fijados.
5. Devolver porcentajes finales reales post-normalización.

### Importante

La plantilla de la spec sigue siendo la fuente de verdad; los guardarraíles solo corrigen casos donde el paso a gramos genera un resultado fisiológicamente pobre para ese peso/calorías.

---

## 5.4 Versionado de reglas

### Recomendación

Introducir una versión explícita de ruleset en toda salida/persistencia relevante.

#### Sugerencia de identificador

- `mindfeed_macro_phase_v2`

### Dónde persistirla

- `nutrition_plans_v2.version_reglas` (reemplazando el genérico `v1` cuando aplique esta lógica)
- payloads de evaluación metabólica
- logs del bridge
- `meta.calculation_audit.macros.ruleset`

### Objetivo

Poder distinguir claramente planes/evaluaciones generados con la lógica anterior frente a la nueva.

---

## 6. Alcance funcional

## 6.1 En alcance

- generación principal de plan nutricional;
- evaluación metabólica;
- recálculos del bridge;
- overrides de kcal;
- endpoint de distribuciones;
- contratos de auditoría y tests;
- saneamiento de cálculos locales en frontend donde puedan mostrar macros incompatibles.

## 6.2 Fuera de alcance en esta iteración

- rediseño visual profundo de la UI;
- cambio de modelo de datos relacional solo para porcentajes por macro;
- recalibración de ICG/IPG/IEC más allá de usar los macros correctos donde ya apliquen.

---

## 7. Plan detallado por fases

## Fase 0 — Preparación, baseline y congelación de contratos

**Objetivo:** preparar el cambio sin romper consumidores actuales.

### Tareas

1. Confirmar todos los puntos que hoy calculan o muestran macros.
2. Identificar qué endpoints/frontend consumen porcentajes vs gramos.
3. Definir el nuevo ruleset `mindfeed_macro_phase_v2`.
4. Documentar la matriz de verdad en el nuevo servicio compartido.

### Archivos a revisar

- `backend/services/nutritionCalculator.js`
- `backend/services/metabolicProfileCalculator.js`
- `backend/services/bridgeCoordinator.js`
- `backend/routes/trainingNutritionBridge.js`
- `backend/routes/metabolicProfile.js`
- `backend/routes/nutritionV2.js`
- `src/components/nutrition/NutritionScreen.jsx`
- `src/components/nutrition/NutritionPlanGenerator.jsx`

### Criterio de aceptación

- Lista completa de consumidores identificada antes de tocar la lógica.

---

## Fase 1 — Crear la fuente de verdad única

**Objetivo:** centralizar la tabla y la normalización.

### Tareas

1. Crear `backend/services/macroProfilePhaseResolver.js`.
2. Implementar:
   - `normalizeMetabolicProfile()`
   - `normalizeNutritionPhase()`
   - `getMacroTemplateByProfileAndPhase()`
   - `calculateMacroTargetsFromTemplate()`
   - `applyMacroGuardrails()`
   - `resolveMacroTargets()` (entrypoint único)
3. Incluir audit payload con:
   - `requested_profile`
   - `applied_profile`
   - `requested_phase`
   - `applied_phase`
   - `template_pct`
   - `raw_grams`
   - `adjusted_grams`
   - `final_pct`
   - `guardrails_applied`
   - `ruleset`

### Resultado esperado

Un único servicio reusable por todo el backend.

### Criterio de aceptación

- El módulo resuelve correctamente las 9 combinaciones exactas sin depender de otros servicios legacy.

---

## Fase 2 — Refactor del cálculo principal de Nutrición

**Objetivo:** que el plan determinista use la tabla oficial.

### Tareas

1. En `backend/services/nutritionCalculator.js`:
   - sustituir la lógica interna de `calculateMacros()` para que delegue al resolver canónico;
   - o deprecar `calculateMacros()` y mantenerla solo como wrapper hacia la nueva capa.
2. Hacer que `generateNutritionPlan()` use el resolver canónico.
3. Hacer que `generateNutritionPlanWithKcalOverride()` use exactamente la misma ruta.
4. Añadir `calculation_audit.macros` al payload de salida.
5. Versionar `version_reglas` con `mindfeed_macro_phase_v2`.

### Decisión recomendada

**No dejar lógica de negocio dentro de `nutritionCalculator.js`** más allá de BMR/TDEE/goal calories. La distribución de macros debe vivir en el nuevo módulo.

### Criterio de aceptación

- Un plan generado con `cut/mant/bulk` cambia macros según la tabla y no por heurística legacy.

---

## Fase 3 — Refactor del módulo metabólico

**Objetivo:** que la evaluación metabólica y el plan principal hablen el mismo idioma.

### Tareas

1. En `backend/services/metabolicProfileCalculator.js`:
   - hacer que `calculateMacrosWithMetabolicProfile()` delegue al nuevo resolver;
   - o deprecarla si queda redundante.
2. Mantener la lógica de score, confianza y anti-ruido actual.
3. Usar `appliedProfile` como entrada final al resolver canónico.
4. Persistir junto a la evaluación:
   - plantilla aplicada,
   - porcentajes finales,
   - ruleset.

### Criterio de aceptación

- La evaluación metabólica devuelve los mismos macros que devolvería el generador principal para el mismo `perfil + fase + kcal + peso`.

---

## Fase 4 — Bridge, overrides y consumidores secundarios

**Objetivo:** cerrar todos los caminos que hoy pueden recalcular diferente.

### Tareas backend

1. En `backend/services/bridgeCoordinator.js`:
   - sustituir llamadas directas a `calculateMacros()` / `calculateMacrosWithMetabolicProfile()` por el resolver canónico o por un wrapper único.
2. En `backend/routes/trainingNutritionBridge.js`:
   - asegurar que `override_kcal` conserva `metabolic_type`, `metabolic_confidence`, `level` y `phase/objective` correctos.
3. En `backend/routes/metabolicProfile.js`:
   - actualizar `GET /distributions` para devolver la tabla por fase;
   - si se quiere compatibilidad temporal, responder ambas estructuras:
     - `legacy_ranges`
     - `phase_table`

### Tareas frontend

4. En `src/components/nutrition/NutritionScreen.jsx`:
   - eliminar o deprecar el cálculo local ad hoc de macros;
   - consumir macros reales del plan activo o de una estimación backend.
5. En `src/components/nutrition/NutritionPlanGenerator.jsx`:
   - mostrar, si procede, la plantilla aplicada (`perfil + fase`) y la versión de ruleset.

### Criterio de aceptación

- No queda ningún flujo funcional que siga calculando macros con reglas viejas.

---

## Fase 5 — Persistencia, auditoría y observabilidad

**Objetivo:** que la implementación sea sostenible y depurable.

### Tareas

1. Persistir en planes y evaluaciones suficiente auditoría para reconstruir la decisión.
2. Añadir a logs backend datos compactos y comparables:
   - profile,
   - phase,
   - template_pct,
   - final_pct,
   - kcal target,
   - ruleset.
3. Si no se requiere migración SQL, guardar esta auditoría en JSON existente.
4. Si se detecta necesidad de consulta analítica posterior, abrir una segunda iteración para columnas/materialización específica.

### Recomendación de mínimo sostenible

No abrir migración nueva si el JSON actual ya basta para rollout y QA; primero estabilizar la lógica.

### Criterio de aceptación

- Se puede inspeccionar desde logs o payloads qué plantilla exacta aplicó el sistema.

---

## Fase 6 — Tests automatizados

**Objetivo:** blindar la matriz y los caminos críticos.

### Nuevos tests mínimos

#### A. Unitarios del resolver

Archivo sugerido:

- `backend/tests/macroProfilePhaseResolver.test.js`

Cobertura:

1. 9 combinaciones exactas `perfil + fase`.
2. Normalización de aliases de fase.
3. Normalización de aliases de perfil.
4. Guardarraíl proteína mínimo.
5. Guardarraíl proteína máximo.
6. Guardarraíl grasa mínima.
7. Rebalanceo final sin desviación calórica relevante.

#### B. Integración de `nutritionCalculator`

Archivo sugerido:

- `backend/tests/nutritionCalculatorMacrosByPhase.test.js`

Cobertura:

1. `generateNutritionPlan()` cambia macros entre `cut`, `mant`, `bulk`.
2. `generateNutritionPlanWithKcalOverride()` mantiene el perfil correcto.
3. `version_reglas` actualizado.

#### C. Integración metabólica

Archivo sugerido:

- `backend/tests/metabolicProfileMacroAlignment.test.js`

Cobertura:

1. `processMetabolicEvaluation()` usa la misma salida que el resolver.
2. Confianza baja sigue forzando `mixto`, pero con tabla nueva.

#### D. Bridge

Archivo sugerido:

- `backend/tests/trainingNutritionBridgeMacroOverride.test.js`

Cobertura:

1. `override_kcal` no pierde `metabolic_type`.
2. Bridge y plan principal dan outputs coherentes.

### Criterio de aceptación

- La matriz de 9 casos queda validada por tests, no solo por inspección manual.

---

## Fase 7 — QA manual y validación funcional

**Objetivo:** validar comportamiento real antes de cerrar.

### Checklist manual

1. Perfil `tolerante` + `cut` → confirmar que el plan no sale con el reparto legacy de mantenimiento.
2. Perfil `mixto` + `bulk` → confirmar aumento claro de carbos y descenso relativo de proteína.
3. Perfil `intolerante` + `mant` → confirmar grasa alta y carbos moderado-bajos.
4. Evaluación metabólica → confirmar que el resumen de macros coincide con el plan.
5. Bridge con `override_kcal` → confirmar que no cae a `mixto` por defecto.
6. UI principal de nutrición → confirmar que no muestra macros calculados localmente con reglas viejas.

### Evidencia esperada

- respuesta API,
- logs relevantes,
- o capturas/payloads de QA.

---

## Fase 8 — Documentación y cierre

**Objetivo:** que el repositorio quede coherente con la realidad.

### Tareas

1. Actualizar `docs/VERIFICACION_MODULO_METABOLISMO.md`.
2. Añadir nota en `docs/AUDITORIA_NUTRICION_MINDFIT.md` si la brecha queda cerrada.
3. Registrar el cambio en `docs/REGISTRO_DIARIO_IMPLEMENTACIONES.md`.
4. Si se implementa por fases, dejar checklist y estado actualizados en la documentación correspondiente.

### Criterio de aceptación

- Ningún doc relevante afirma una lógica distinta a la implementada.

---

## 8. Diseño de contrato recomendado

### 8.1 Respuesta canónica de macros

Se recomienda que la capa de dominio devuelva una estructura de este estilo:

```json
{
  "requested_profile": "equilibrado",
  "applied_profile": "mixto",
  "requested_phase": "volumen",
  "applied_phase": "bulk",
  "template_pct": {
    "protein": 23,
    "carbs": 47,
    "fat": 30
  },
  "raw_grams": {
    "protein_g": 138,
    "carbs_g": 282,
    "fat_g": 80
  },
  "adjusted_grams": {
    "protein_g": 140,
    "carbs_g": 278,
    "fat_g": 80
  },
  "final_pct": {
    "protein": 23,
    "carbs": 46,
    "fat": 31
  },
  "guardrails_applied": [
    {
      "macro": "protein",
      "reason": "min_cut_protein"
    }
  ],
  "ruleset": "mindfeed_macro_phase_v2"
}
```

### Ventaja

Este contrato permite reutilizar el mismo resultado en:

- generación de planes,
- evaluación metabólica,
- auditoría,
- UI,
- tests.

---

### 8.2 Política de compatibilidad

### Endpoints

No romper contratos existentes salvo donde solo se exponga información de referencia.

### Recomendación práctica

- mantener las claves actuales `protein_g`, `carbs_g`, `fat_g`;
- añadir `protein_pct`, `carbs_pct`, `fat_pct` finales donde todavía no existan;
- añadir un bloque `macro_audit` o `calculation_audit.macros`.

---

## 9. Riesgos y mitigaciones

## Riesgo 1 — Corregir solo una de las calculadoras

**Mitigación:** mover toda la lógica a un servicio único y dejar wrappers delgados.

## Riesgo 2 — Romper UI por contratos parciales

**Mitigación:** conservar gramos actuales y añadir auditoría sin eliminar campos existentes.

## Riesgo 3 — Desalineación entre plan, evaluación y bridge

**Mitigación:** todos deben consumir la misma función canónica.

## Riesgo 4 — Reglas nuevas sin visibilidad operativa

**Mitigación:** introducir `ruleset` + audit logs desde la primera entrega.

## Riesgo 5 — Tests insuficientes

**Mitigación:** bloquear cierre sin la matriz `3x3` automatizada.

---

## 10. Entregables finales

1. **Nuevo servicio canónico** de resolución de macros por `perfil + fase`.
2. **Plan determinista alineado** a la spec.
3. **Evaluación metabólica alineada** a la misma lógica.
4. **Bridge y overrides corregidos**.
5. **UI sin cálculos locales inconsistentes** para mostrar macros objetivo.
6. **Tests unitarios e integración** cubriendo la matriz completa.
7. **Documentación actualizada**.
8. **Ruleset versionado** para auditoría y mantenimiento.

---

## 11. Orden recomendado de ejecución real

1. Crear servicio canónico.
2. Cubrir con tests unitarios la matriz `3x3`.
3. Refactorizar `nutritionCalculator.js`.
4. Refactorizar `metabolicProfileCalculator.js`.
5. Corregir bridge y override.
6. Corregir consumidor frontend local (`NutritionScreen.jsx`).
7. Añadir auditoría/ruleset.
8. Ejecutar QA manual.
9. Actualizar documentación de verificación.

---

## 12. Criterio de “hecho”

Esta implementación se considerará cerrada solo si se cumple todo lo siguiente:

- [ ] existe una única fuente de verdad para macros `perfil + fase`;
- [ ] plan principal, evaluación metabólica y bridge devuelven el mismo resultado para el mismo contexto;
- [ ] el override de kcal no pierde perfil metabólico;
- [ ] la UI no muestra cálculos locales incompatibles con backend;
- [ ] la matriz `3x3` está cubierta por tests automatizados;
- [ ] los logs/payloads indican la plantilla exacta y el ruleset usado;
- [ ] la documentación ya no afirma un estado falso de “100% implementado” bajo la lógica antigua.

---

## 13. Recomendación operativa

La vía más segura no es “parchear porcentajes” en las funciones actuales, sino **extraer primero la regla de negocio a un módulo canónico** y luego hacer que el resto del sistema lo consuma.

Ese enfoque minimiza deuda, evita divergencias futuras y deja la implementación preparada para:

- nuevas fases,
- nuevos perfiles,
- experimentos controlados por ruleset,
- snapshots y analítica,
- y mantenimiento sin regresiones silenciosas.
