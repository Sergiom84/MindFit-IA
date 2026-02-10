# Plan de Implementacion - Alineacion Total Nutricion vs Spec

Fecha: 06.02.2026  
Spec de referencia: `docs/mindfit_nutrition_system_spec_unified.md`

## 1. Objetivo

Cerrar las brechas para que el modulo de nutricion quede alineado 100% con el spec en:

- contrato Entrenamiento <-> Nutricion
- cadencia de recalculo (sesion/semanal/quincenal)
- anti-ruido global
- compensacion semanal de saltos
- fuente unica de verdad
- trazabilidad y QA 1:1 con reglas del documento

## 2. Definicion de "100% alineado"

Se considera completado cuando:

1. El backend aplica todas las reglas criticas del spec en runtime.
2. La UI no permite flujos que contradigan el contrato del spec.
3. Existe auditoria de cambios con rule IDs y evidencia semanal.
4. Hay suite de pruebas que cubre reglas clave del spec.

## 3. Fases de implementacion

## Fase 0 - Criterios y decisiones de producto (P0)

Objetivo:

- Congelar reglas de negocio para evitar retrabajo.

Decisiones obligatorias:

1. Cuando no hay plan de entrenamiento activo:
   - bloquear generacion de plan nutricional, o
   - permitir modo baseline (sin puente) con aviso explicito.
2. Nivel de rigidez del acople UI:
   - modo estricto (sin edicion manual de calendario/tipo) o
   - modo asistido (editable solo con confirmacion).

Entregable:

- Decision documentada en este plan y en copy UI.

## Fase 1 - Contrato obligatorio Entrenamiento -> Nutricion (Backend) (P0)

Objetivo:

- Hacer obligatorio el flujo del puente para la generacion del plan nutricional.

Cambios:

1. `POST /api/nutrition-v2/generate-plan` obtiene metodologia/calendario desde plan activo.
2. Ignorar o rechazar `training_schedule` manual cuando haya plan activo.
3. Persistir en auditoria el origen de inputs (`source: training_contract`).
4. Definir comportamiento para usuario sin plan activo segun decision de Fase 0.

Archivos objetivo:

- `backend/routes/nutritionV2.js`
- `backend/services/nutritionCalculator.js`
- `backend/services/bridgeCoordinator.js`

Criterio de cierre:

- No se puede generar un plan "desacoplado" si la politica definida es acople estricto.

## Fase 2 - Cadencia unificada + anti-ruido global (Backend) (P0)

Objetivo:

- Unificar el motor de recalculo con la cadencia del spec.

Cambios:

1. Ejecutar por sesion: solo redistribucion (carb cycling), sin cambio agresivo de kcal.
2. Ejecutar semanal: resumen CLS/sesiones/adherencia.
3. Ejecutar quincenal (14 dias): recalibracion kcal + reevaluacion metabolica.
4. Incluir `next_full_review` mensual en `needs_recalculation`.
5. Aplicar regla anti-ruido global:
   - media movil 14 dias y/o confirmacion 2 semanas consecutivas
   - para todo cambio importante de kcal/fase.

Archivos objetivo:

- `backend/services/bridgeCoordinator.js`
- `backend/services/nutritionCalibrator.js`
- `backend/migrations/create_training_nutrition_bridge_system.sql` (si aplica ajuste de funcion SQL)

Criterio de cierre:

- Las decisiones importantes no se aplican por una sola semana.

## Fase 3 - Saltos de dieta sobre carga semanal real (Backend + SQL) (P0)

Objetivo:

- Hacer que la compensacion siga exactamente la logica semanal del spec.

Cambios:

1. Calcular compensacion con:
   - `objetivo_semana = kcal_objetivo_diario * 7`
   - `acumulado_semana real` (no solo neto de eventos)
2. No compensar si no se supera objetivo semanal.
3. Mantener proteina ancla y reparto por fase.
4. Regla de confianza baja: correccion conservadora (50%) y reevaluacion al cierre semanal.

Archivos objetivo:

- `backend/services/dietDeviationManager.js`
- funciones SQL de resumen semanal usadas por desviaciones

Criterio de cierre:

- El resultado semanal coincide con reglas de seccion 9 del spec.

## Fase 4 - Fuente unica de verdad (Backend + rutas) (P1)

Objetivo:

- Evitar duplicidad funcional que rompa coherencia de reglas.

Cambios:

1. Dejar `nutrition-v2` como flujo oficial para decisiones nutricionales.
2. Deprecar rutas legacy que compitan con el motor determinista.
3. Consolidar evaluacion metabolica/evaluacion nutricional en un flujo unico.

Archivos objetivo:

- `backend/server.js`
- rutas legacy de nutricion/metabolismo

Criterio de cierre:

- Un solo camino operativo para decisiones kcal/macros/fase.

## Fase 5 - Reflejo visual en UI (P0 para coherencia usuario)

Objetivo:

- Que la interfaz muestre y haga cumplir el contrato del spec.

Cambios:

1. En generador nutricional:
   - bloquear o ocultar controles manuales que contradigan el contrato.
   - mostrar estado "sincronizado con plan activo".
2. Mostrar cadencia real:
   - revision semanal
   - recalibracion quincenal
   - motivo del ultimo ajuste (regla aplicada).
3. Mostrar bloqueos anti-ruido:
   - "pendiente de confirmacion 14 dias".
4. Alinear copy web/app para evitar sobrepromesa.

Archivos objetivo:

- `src/components/nutrition/NutritionPlanGenerator.jsx`
- `src/components/nutrition/NutritionDashboard.jsx`
- componentes de estado/auditoria nutricional

Criterio de cierre:

- La UI no induce a flujos fuera del spec.

## Fase 6 - Auditoria y pruebas 1:1 con spec (Backend + UI) (P0)

Objetivo:

- Validar cumplimiento con evidencia tecnica.

Cambios:

1. Matriz de pruebas por regla del spec (minimo secciones 8, 9, 10, 11).
2. Casos de regresion:
   - no cambio por 1 semana
   - cambio tras confirmacion 14 dias
   - no compensacion sin exceso semanal real
   - bridge por sesion sin sobreajuste de kcal
3. Endpoint/auditoria con reason + rule_id + metricas de decision.

Entregables:

- test report
- checklist de cumplimiento cerrada

Criterio de cierre:

- Todas las reglas criticas marcadas como "pass" con evidencia.

## 4. Orden recomendado (ejecucion)

1. Fase 0
2. Fase 1
3. Fase 2
4. Fase 3
5. Fase 5 (en paralelo parcial con Fase 2/3)
6. Fase 4
7. Fase 6

## 5. Riesgos y mitigacion

Riesgo 1:

- Cambios de contrato rompen flujo actual de usuarios sin plan activo.
  Mitigacion:
- feature flag temporal + fallback explicito definido en Fase 0.

Riesgo 2:

- Regresiones por logica duplicada en rutas legacy.
  Mitigacion:
- deprecacion gradual + tests de no-regresion.

Riesgo 3:

- Desalineacion entre backend y copy UI.
  Mitigacion:
- checklist de copy como criterio de release.

## 6. Checklist de cierre final

- [ ] Contrato obligatorio entrenamiento->nutricion aplicado
- [ ] Cadencia semanal/quincenal operativa
- [ ] Anti-ruido global en cambios importantes
- [ ] Saltos de dieta sobre carga semanal real
- [ ] Fuente unica de verdad activa
- [ ] UI alineada al contrato (sin flujos contradictorios)
- [ ] Auditoria completa con rule IDs
- [ ] Tests de cumplimiento spec en verde
