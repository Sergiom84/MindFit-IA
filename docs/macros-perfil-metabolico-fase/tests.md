# Tests: macros-perfil-metabolico-fase

## Estrategia general

La validación se hará por capas para reducir regresiones:

1. **Unit tests** del resolver canónico.
2. **Integration tests** de los consumidores backend.
3. **QA manual** de los flujos funcionales visibles.
4. **Verificación documental** para asegurar que la documentación no contradiga el código.

## Estrategia por fase

## Fase 0

Objetivo: cerrar baseline de consumidores y contrato técnico.

- No requiere tests funcionales todavía.
- Sí requiere checklist cerrada de puntos de entrada.

## Fase 1

Objetivo: blindar el resolver canónico.

### Tests obligatorios

1. `tolerante + cut` → 28 / 47 / 25
2. `tolerante + mant` → 25 / 55 / 20
3. `tolerante + bulk` → 23 / 57 / 20
4. `mixto + cut` → 28 / 32 / 40
5. `mixto + mant` → 25 / 40 / 35
6. `mixto + bulk` → 23 / 47 / 30
7. `intolerante + cut` → 30 / 22 / 48
8. `intolerante + mant` → 27 / 28 / 45
9. `intolerante + bulk` → 25 / 35 / 40

### Casos borde

- alias `equilibrado` → `mixto`
- alias `normocalorica` → `mant`
- alias `superavit` / `volumen` → `bulk`
- confianza baja + `appliedProfile=mixto`
- kcal bajas donde salta guardarraíl de proteína
- kcal bajas donde salta guardarraíl de grasa
- caso con proteína por encima del máximo del rango de fase

## Fase 2

Objetivo: validar que el generador principal usa el resolver nuevo.

### Tests obligatorios

- `generateNutritionPlan()` cambia de macros entre `cut`, `mant`, `bulk`.
- `generateNutritionPlanWithKcalOverride()` conserva `metabolic_type`.
- `version_reglas` o `ruleset` aparece en la salida.
- `calculation_audit.macros` existe y describe la plantilla aplicada.

## Fase 3

Objetivo: alinear evaluación metabólica con el generador principal.

### Tests obligatorios

- `processMetabolicEvaluation()` devuelve el mismo reparto final que el resolver para el mismo contexto.
- confianza baja sigue forzando `mixto`.
- anti-ruido no se rompe por el cambio de calculadora.

## Fase 4

Objetivo: blindar bridge y rutas secundarias.

### Tests obligatorios

- `override_kcal` no pierde perfil metabólico.
- bridge y generador principal devuelven macros coherentes para el mismo usuario/contexto.
- `/api/metabolic-profile/distributions` expone estructura consistente con la nueva tabla.

## Fase 5

Objetivo: validar consumidores frontend/documentación.

### Validaciones manuales mínimas

- `NutritionScreen` no muestra cálculo local incoherente.
- `NutritionPlanGenerator` refleja macros y fase correctos.
- docs de verificación ya no afirman “100% implementado” con lógica legacy.

## Casos borde globales

- usuario sin `metabolic_type` → fallback seguro documentado;
- usuario con alias legacy de objetivo/fase;
- `kcalObjetivo` muy bajas con guardarraíl alto;
- `bulk` en perfil tolerante sin sobredimensionar proteína;
- `cut` en perfil intolerante manteniendo grasa alta;
- override de kcal en bridge con `metabolic_confidence` baja;
- consumers que solo leen gramos y no porcentajes.

## Datos de prueba recomendados

### Perfil A

- `peso_kg=80`
- `metabolic_type=tolerante`
- `objetivo=cut|mant|bulk`
- `level=intermedio`
- `kcalObjetivo=2400`

### Perfil B

- `peso_kg=80`
- `metabolic_type=mixto`
- `objetivo=cut|mant|bulk`
- `level=intermedio`
- `kcalObjetivo=2400`

### Perfil C

- `peso_kg=80`
- `metabolic_type=intolerante`
- `objetivo=cut|mant|bulk`
- `level=intermedio`
- `kcalObjetivo=2400`

### Perfil D (guardarraíl)

- `peso_kg=95`
- `kcalObjetivo` más ajustadas para provocar rebalanceo
- validar límites proteína/grasa

## Comandos previstos para ejecutar tests

### Backend

1. `npm run test:backend`
2. `node --test backend/tests/macroProfilePhaseResolver.test.js`
3. `node --test backend/tests/nutritionCalculatorMacrosByPhase.test.js`
4. `node --test backend/tests/metabolicProfileMacroAlignment.test.js`
5. `node --test backend/tests/trainingNutritionBridgeMacroOverride.test.js`

### Calidad

6. `npm run lint`
7. Lint dirigido si hiciera falta sobre archivos tocados.

### QA manual

8. Smoke API real con backend levantado:
   - generación de plan
   - evaluación metabólica
   - override de kcal en bridge
9. QA UI manual en pantallas de nutrición afectadas.

## Criterio para avanzar de fase

- **Fase 0 → Fase 1:** contrato cerrado y consumers inventariados.
- **Fase 1 → Fase 2:** matriz `3x3` en verde.
- **Fase 2 → Fase 3:** plan principal alineado + tests de integración mínimos en verde.
- **Fase 3 → Fase 4:** evaluación metabólica alineada sin regressions.
- **Fase 4 → Fase 5:** bridge/override sin pérdida de perfil metabólico.
- **Fase 5 → Fase 6:** UI/documentación coherentes con backend.
- **Cierre:** backend tests + QA manual + docs actualizadas.

## Evidencia ejecutada 2026-03-19

- QA manual/autenticado con Playwright: `test-results/manual-qa-macros-perfil-fase/run-playwright-qa.mjs`
- Reporte consolidado: `test-results/manual-qa-macros-perfil-fase/qa-report.json`
- Capturas: `test-results/manual-qa-macros-perfil-fase/*.png`
- Flujo validado: login → `/nutrition` → guardado de configuración `bulk` → cuestionario metabólico (2 intentos) → generación de plan → vista `Calendario V2` → bridge override `2500 kcal` → vuelta a `Generar Plan`.
- Resultado observado en QA: perfil aplicado `intolerante`, plan activo `bulk`, macros UI/API `P 151 / C 211 / G 107`, bridge override coherente con `intolerante + bulk`.
