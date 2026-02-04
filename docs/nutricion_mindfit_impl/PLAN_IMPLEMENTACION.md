# Plan de Implementación Nutrición MindFit

Fecha: 04.02.2026

**Contexto**

- Spec: `docs/mindfit_nutrition_system_spec_unified.md`
- Auditoría: `docs/AUDITORIA_NUTRICION_MINDFIT.md`
- Objetivo: cerrar todo lo “parcial” y “no implementado” sin romper flujos actuales.

## Fase 0 — Preparación y Baseline

Objetivo: asegurar contexto estable y evitar cambios fuera de alcance.

1. Confirmar fuentes de verdad actuales:
   - Mediciones corporales: `app.body_measurements`.
   - Perfil nutricional: `app.nutrition_profiles`.
   - Planes v2: `app.nutrition_plans_v2`.
   - Bridge: `app.bridge_*`.
2. Identificar rutas activas en frontend:
   - `NutritionDashboard` usa `/api/body-measurements` y `/api/diet-deviation`.
   - `NutritionPlanGenerator` usa `/api/nutrition-v2/*`.
3. Acordar con producto si se mantiene compatibilidad con endpoints legacy o si se descontinúan.

Entregables:

- Confirmación de fuentes y endpoints a mantener.
- Lista de endpoints a deprecatear (si aplica).

## Fase 1 — Unificación de Mediciones, Deprecación y Consistencia de Esquema

Objetivo: una sola fuente de mediciones, deprecación explícita y endpoints coherentes.

1. Deprecar endpoints legacy:
   - `/api/nutrition/calibration/measurements*` y `/api/nutrition-v2/measurements`.
   - Responder `410 Gone` con mensaje claro y endpoint correcto (`/api/body-measurements`).
2. Migrar toda la lógica a `app.body_measurements`:
   - `nutritionCalibrator` y SQL de calibración deben leer/escribir `app.body_measurements`.
   - Alinear columnas a `weight_kg`, `waist_cm`, `biceps_cm`, `chest_cm`, `calf_cm`, `skinfold_abdominal_mm`.
3. Reutilizar validación única:
   - Centralizar en `measurementValidator` para evitar reglas duplicadas.
4. Actualizar referencias:
   - Docs y tests que mencionen endpoints legacy.
   - Remover cualquier referencia a `app.user_body_measurements`.

Entregables:

- Endpoints legacy con respuesta 410 y mensaje de deprecación.
- Calibración y validaciones operando sobre `app.body_measurements`.
- Documentación y tests actualizados sin referencias legacy.

## Fase 2 — Corrección del Calendario y Días de Entrenamiento

Objetivo: evitar días de entreno falsos (ej. domingos) y asegurar carb cycling real.

1. `generateNutritionPlan`:
   - Si `training_schedule` existe, usarlo sin fallback.
   - Si no existe, generar calendario desde `training_days` con patrón estable (sin heurística “i%2”).
2. Incluir tipo D0/D1/D2 solo si se reciben inputs del bridge o CLS.
3. Validar que el UI de calendario muestra “Descanso” correctamente.

Entregables:

- Lógica de calendario determinista corregida.
- Evidencia en tests de que domingo no aparece como entreno si está marcado descanso.

## Fase 3 — Objetivo Calórico por Fase y Actividad (Rangos Spec)

Objetivo: adaptar rangos de fase y actividad según spec.

1. `adjustCaloriesForGoal`:
   - `cut`: 0.80–0.90 según %graso/nivel.
   - `bulk`: 1.05–1.12 según nivel.
2. Actividad:
   - Mapear a `sedentario`, `ligeramente_activo`, `activo`, `muy_activo`.
   - Tablas por entrenos_semana conforme spec.
3. NEAT:
   - Mantener ajuste actual, pero asegurar min 1.2 y max 2.2.

Entregables:

- Calorías objetivo con rango dependiente del perfil.
- Documentación en código sobre el rango aplicado.

## Fase 4 — Anti‑Ruido y Confirmación 14 Días Unificados

Objetivo: una sola regla anti‑ruido para cambios de fase/kcal.

1. Unificar confirmación 2 semanas con `register_icg_ipg_state`.
2. Ajustar `nutritionV2/evaluate` para usar ventana 14 días real y confirmación doble.
3. Evitar aplicar recomendaciones si no se confirma el estado.

Entregables:

- Evaluación coherente en todo el sistema.
- Cambios solo con confirmación doble o media móvil.

## Fase 5 — Saltos de Dieta (Compensación Semanal Real)

Objetivo: compensar solo cuando se supera la carga semanal.

1. Usar `weekly_calorie_targets` y `get_weekly_deviation_summary`.
2. Calcular desviación semanal real y aplicar:
   - Si desviación <= 0: sin compensación.
   - Si desviación > 0: repartir en días restantes.
3. Ajustes de macros por fase:
   - Volumen: carbos primero, luego grasas.
   - Definición: recorte solo carbos, manteniendo grasas mínimas.
   - Normo: balanceado o sin compensar.
4. Confianza baja: 50% de corrección.

Entregables:

- Compensación semanal real con macros persistidos.
- Respuesta API con explicación breve y delta.

## Fase 6 — Bridge: Deload, Lesión y Matriz Fatiga/Rendimiento

Objetivo: implementar reglas completas de sinergia y límites en déficit.

1. Deload:
   - Reducir superávit a la mitad en volumen.
   - Mantener kcal en déficit con opción diet break si fatiga alta.
2. Lesión:
   - Esperar 7 días antes de recalcular actividad.
   - Confirmar 14 días si sesiones bajan >=2/semana.
3. En déficit:
   - Limitar carb cycling a ±10%.
4. Añadir confirmación 2 semanas antes de cambios de kcal por flags.

Entregables:

- Ajustes coherentes en bridge y logs con razones.

## Fase 7 — Auditoría y Snapshots

Objetivo: trazabilidad completa.

1. Crear tablas:
   - `nutrition_change_log` con rule IDs (NUTR-\*).
   - `nutrition_weekly_snapshots`.
2. Registrar cambios en:
   - calibración,
   - bridge,
   - reevaluaciones de fase.
3. Endpoint de auditoría resumida para UI/admin.

Entregables:

- Trazabilidad con rule IDs y payload completo.

## Fase 8 — Integración UI y Mensajes Explicativos

Objetivo: cerrar loop nutrición↔entrenamiento para el usuario.

1. Mostrar alertas confirmadas y no confirmadas.
2. Mostrar recomendaciones de compensación semanal.
3. Exponer estado del bridge (carb cycling y flags).

Entregables:

- UI con feedback coherente y consistente con la spec.

## Fase 9 — Hardening y QA Final

Objetivo: validar el sistema completo.

1. Tests unitarios de fórmulas, macros y rangos.
2. Tests de integración de endpoints críticos.
3. Test final de flujo completo (ver `TESTS.md`).

Entregables:

- Evidencia en `docs/nutricion_mindfit_impl/TESTS.md`.
- Checklist completado en `CHECKPOINTS.md`.
