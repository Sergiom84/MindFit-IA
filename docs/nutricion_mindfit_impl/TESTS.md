# Tests de Nutrición MindFit

Fecha inicio: 04.02.2026

**Regla:** no avanzar de fase si los tests de la fase fallan.

## Tests por Fase

### Fase 1 — Mediciones Unificadas

1. POST `/api/body-measurements` con peso/cintura válidos.
2. GET `/api/body-measurements/history` devuelve la medición insertada.
3. POST `/api/nutrition/calibration/measurements` devuelve `410 Gone` con mensaje de deprecación.
4. POST `/api/nutrition-v2/measurements` devuelve `410 Gone` con mensaje de deprecación.
5. Verificar que no existe escritura en `app.user_body_measurements`.

### Fase 2 — Calendario/Días Entreno

1. Generar plan con `training_schedule` donde `Dom` es `false`.
2. Verificar que `days` marca descanso en domingo.
3. Verificar que no existe entrenamiento en descanso.

### Fase 3 — Objetivo Calórico y Actividad

1. Perfil con fase `cut` -> kcal objetivo dentro de 0.80–0.90.
2. Perfil con fase `bulk` -> kcal objetivo dentro de 1.05–1.12.
3. Actividad `ligeramente_activo` con 4/5/6 entrenos usa tabla spec.
4. NEAT: <5000 baja 0.05 (min 1.2) y >10000 sube 0.10 (max 2.2).

### Fase 4 — Anti‑Ruido 14 días

1. Dos mediciones con 7 días de diferencia no aplican cambio.
2. Dos mediciones con 14 días y confirmación 2 semanas aplican cambio.
3. `nutritionV2/evaluate` respeta confirmación doble.

### Fase 5 — Saltos de Dieta

1. Desviación semanal <=0 → sin compensación.
2. Desviación >0 → compensación repartida en días restantes.
3. Confianza baja aplica 50% del ajuste.
4. Ajustes de macros por fase (carbos/grasas) correctos.

### Fase 6 — Bridge Deload/Lesión

1. Deload en volumen reduce superávit a la mitad.
2. Lesión: sin recalcular GCT el mismo día.
3. Lesión: aplicar ajuste solo tras 14 días con reducción >=2 sesiones.
4. Déficit: carb cycling limitado a ±10%.

### Fase 7 — Auditoría y Snapshots

1. Registrar cambio con rule ID en `nutrition_change_log`.
2. Generar snapshot semanal con fase/kcal/macros/perfil/CLS.
3. Endpoint de auditoría devuelve últimos cambios y snapshot.

### Fase 8 — UI

1. Dashboard muestra alertas confirmadas y pendientes.
2. Módulo de saltos muestra compensación semanal real.
3. Estado bridge visible y coherente con backend.

## Test Final — Flujo Completo

1. Crear perfil nutricional completo.
2. Evaluar perfil metabólico con score S y confianza media.
3. Generar plan con `training_schedule` real y validar D0/D1/D2.
4. Registrar mediciones semanales durante 2 semanas.
5. Confirmar semáforo (ICG/IPG/IEC) con regla anti‑ruido.
6. Registrar salto de dieta y verificar compensación semanal.
7. Simular resumen de entrenamiento (bridge) con fatiga alta y verificar ajustes.
8. Verificar auditoría: log de cambios + snapshot semanal.

---

## Ejecuciones

### 04.02.2026 — Fase 1 (mediciones)

- SQL: funciones `calculate_weight_average`, `validate_waist_measurement`, `validate_weight_change` existen en Supabase. Vista `v_pending_calibrations` usa `app.body_measurements`. OK.
- HTTP: no ejecutado (requiere backend activo + `AUTH_TOKEN`). Pendiente validar `410 Gone` en rutas legacy.

### 04.02.2026 — Fase 2 (calendario entreno)

- Node local: `generateNutritionPlan` respeta `training_schedule` y no marca descanso como entreno. OK.
- Node local: sin `training_schedule`, patrón por `training_days` genera descanso consistente. OK.

### 04.02.2026 — Fase 3 (kcal/actividad)

- Node local: `adjustCaloriesForGoal` aplica 0.90 en cut avanzado/low fat y 0.80 en cut alta grasa. OK.
- Node local: `bulk` aplica 1.05 en avanzado y 1.10 en principiante. OK.
- Node local: `calculateTDEE` con actividad `ligero` y 4 entrenos usa 1.5. OK.

### 04.02.2026 — Fase 4 (anti‑ruido)

- Pendiente: requiere backend activo + datos reales en `body_measurements` para validar confirmación 14 días.

### 04.02.2026 — Fase 5 (saltos de dieta)

- Pendiente: requiere backend activo + `AUTH_TOKEN` para validar compensación semanal real.

### 04.02.2026 — Fase 6 (bridge)

- Pendiente: requiere backend activo + sesiones reales para validar deload/lesión y límite de carb cycling en déficit.

### 04.02.2026 — Fase 7 (auditoría)

- SQL: migración `20260204_nutrition_audit_log_snapshots` aplicada en Supabase (tablas `nutrition_change_log`, `nutrition_weekly_snapshots`). OK.
- Backend: logging integrado en calibración/bridge/saltos y endpoint `/api/nutrition-v2/audit` agregado. Pendiente validar con backend activo + `AUTH_TOKEN`.

### 04.02.2026 — Fase 8 (UI)

- UI: Dashboard muestra alertas confirmadas/pendientes, compensación semanal y estado del bridge. Pendiente verificación manual en navegador.

### 04.02.2026 — QA parcial

- `npm run lint` ejecutado: sin errores, warnings existentes en el repo (no bloqueante para esta fase).

### 04.02.2026 — QA backend (token test user)

- Endpoints legacy devuelven `410 Gone`: `/api/nutrition/calibration/measurements`, `/api/nutrition-v2/measurements`. OK.
- Perfil nutricional `objetivo=bulk` + `actividad=activo` ahora guarda OK (tras migración de constraint de actividad). Ratio kcal/tdee = 1.08 (dentro de 1.05–1.12). OK.
- `generate-plan` con domingo descanso: `day_index=6` -> `descanso`. OK.
- Mediciones 14 días insertadas y validadas. OK.
- Diet deviation: registro OK y resumen semanal devuelve netDeviation > 0 tras fix de función. OK.
- Bridge: `training-summary` con deload devuelve recomendaciones esperadas. OK.
- Auditoría: `/api/nutrition-v2/audit` devuelve change_log y snapshots. OK.
- `nutrition-v2/evaluate`: OK tras reinicio (needs_confirmation = true por regla 14 días). OK.

### 04.02.2026 — Test Final (flujo completo)

1. Perfil nutricional completo creado. OK.
2. Evaluación metabólica cuantificada. OK.
3. Plan generado con calendario real (domingo descanso). OK.
4. Mediciones 14 días registradas. OK.
5. Reevaluación nutricional (`/api/nutrition-v2/evaluate`) sin error y con anti-ruido. OK.
6. Salto de dieta con compensación semanal. OK.
7. Bridge con deload y recomendaciones. OK.
8. Auditoría devuelve logs + snapshot. OK.
