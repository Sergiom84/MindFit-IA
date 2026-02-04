# Checkpoints Nutrición MindFit

Fecha inicio: 04.02.2026

Referencia: `docs/nutricion_mindfit_impl/PLAN_IMPLEMENTACION.md`

## Fase 0 — Preparación

- [ ] Fuentes de verdad confirmadas (mediciones, perfiles, planes, bridge).
- [ ] Endpoints legacy definidos (mantener/deprecar) con criterios.

## Fase 1 — Mediciones Unificadas

- [x] `nutritionV2/measurements` apunta a `app.body_measurements` (deprecado con 410).
- [x] Validación de mediciones centralizada en `app.body_measurements`.
- [x] Duplicidades documentadas o deprecadas.
- [x] Endpoints legacy responden `410 Gone` con ruta de reemplazo.
- [x] Docs/tests sin referencias activas a endpoints legacy ni `app.user_body_measurements`.

## Fase 2 — Calendario/Días Entreno

- [x] `generateNutritionPlan` respeta `training_schedule` real.
- [x] No hay fallback incorrecto que marque entreno en descanso.
- [ ] UI muestra descanso correcto.

## Fase 3 — Objetivo Calórico y Actividad

- [x] Rangos de fase aplicados (cut/bulk).
- [x] Tabla de actividad alineada a spec.
- [x] NEAT con límites aplicados.

## Fase 4 — Anti‑Ruido 14 días

- [x] Confirmación 2 semanas unificada.
- [x] Evaluaciones no aplican cambios sin confirmación.

## Fase 5 — Saltos de Dieta Semanales

- [x] Compensación solo con desviación semanal positiva.
- [x] Ajustes de macros por fase implementados.
- [x] Confianza baja aplica corrección conservadora.

## Fase 6 — Bridge Deload/Lesión

- [x] Reglas de deload por fase aplicadas.
- [x] Lesión con espera 7 días + confirmación 14 días.
- [x] Carb cycling limitado en déficit.

## Fase 7 — Auditoría y Snapshots

- [x] `nutrition_change_log` con rule IDs creado.
- [x] `nutrition_weekly_snapshots` creado.
- [x] Endpoints de auditoría devuelven datos coherentes.

## Fase 8 — Integración UI

- [x] Alertas confirmadas y pendientes visibles.
- [x] Compensación semanal visible.
- [x] Estado bridge visible.

## Fase 9 — QA Final

- [x] Tests unitarios clave pasan.
- [x] Tests de integración críticos pasan.
- [x] Flujo completo validado (ver `TESTS.md`).
