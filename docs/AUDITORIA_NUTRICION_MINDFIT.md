# Auditoría Nutrición MindFit vs Spec Unificada

Fecha: 04.02.2026  
Documento base: `docs/mindfit_nutrition_system_spec_unified.md`

**Alcance**
Revisión de backend, BD y frontend de Nutrición/Bridge frente a la spec unificada. Se contrastan motor determinista, control por fase, gestión de saltos, puente entrenamiento↔nutrición y mecanismos de auditoría.

**Resumen Ejecutivo**

- Implementado: núcleo determinista (TMB/GCT), perfil metabólico, semáforos ICG/IPG/IEC y validación de mediciones en el flujo principal.
- Parcial: objetivo calórico por fase (rangos), anti‑ruido homogéneo, compensación semanal real, deload/lesión y logging/auditoría unificada.
- Pendiente: snapshots semanales y log de cambios con rule IDs, y cadencia automatizada de recalculos.

**Implementado**

- Cálculo de TMB con selección de ecuación y validación de rangos (Harris/Mifflin/Ten Haaf/Tinsley) en `backend/services/nutritionCalculator.js` y validación de perfil en `backend/routes/nutritionV2.js`.
- GCT con factor de actividad y ajuste NEAT por pasos con clamps (min 1.2, max 2.2) en `backend/services/nutritionCalculator.js`.
- Perfil metabólico cuantificado (score S), confianza (alta/media/baja), anti‑ruido con cambio máximo 1 categoría y guardarraíles de macros en `backend/services/metabolicProfileCalculator.js` y `backend/routes/metabolicProfile.js`.
- Semáforos ICG/IPG/IEC + confirmación 2 semanas y alertas al bridge en `backend/services/icgIpgDetector.js` y `backend/migrations/create_icg_ipg_confirmation_system.sql`.
- Validación de mediciones sospechosas (2% peso, 2.5 cm cintura, ±20% pliegue) con confirmación del usuario en `backend/services/measurementValidator.js` y `backend/routes/bodyMeasurements.js`.
- Puente entrenamiento↔nutrición con carb cycling D0/D1/D2 por CLS, logs y estado persistido en `backend/services/bridgeCoordinator.js`, `backend/routes/trainingNutritionBridge.js` y `backend/migrations/create_training_nutrition_bridge_system.sql`.
- Timing de carbohidratos (pre/post) como módulo opcional en `backend/services/carbTiming.js` y `backend/routes/nutritionSupplements.js`.

**Implementado a Medias**

- Objetivo calórico por fase usa factores fijos (cut 0.85, bulk 1.08) y no el rango dinámico de la spec (0.80–0.90 / 1.05–1.12) en `backend/services/nutritionCalculator.js`.
- Factores de actividad no reflejan exactamente las categorías de la spec (ligeramente_activo/activo/muy_activo) y mezclan niveles “ligero/moderado/activo” en `backend/services/nutritionCalculator.js` y `backend/routes/nutritionV2.js`.
- Carb cycling en el plan determinista no usa D0/D1/D2 ni CLS y aplica un fallback alterno que ignora el calendario real en `backend/services/nutritionCalculator.js`.
- Anti‑ruido no está unificado: `nutritionV2/evaluate` usa ventana ~7 días y solo marca `needs_confirmation`, mientras el flujo de `body-measurements` sí aplica confirmación 2 semanas. Lógica duplicada en `backend/routes/nutritionV2.js` y `backend/services/icgIpgDetector.js`.
- Gestión de saltos de dieta compensa siempre el exceso sin comprobar desviación semanal real; existe tabla semanal pero no se usa en el cálculo en `backend/services/dietDeviationManager.js` y `backend/migrations/create_diet_deviation_system.sql`.
- Deload/fatiga/lesión en el bridge generan flags y recomendaciones pero no aplican ajustes de kcal específicos por fase ni la regla de “esperar 7 días y confirmar 14” para lesión en `backend/services/bridgeCoordinator.js`.
- Guardarraíl de proteína en volumen aplica 1.8 g/kg para todos en el flujo metabólico (no respeta 1.6 g/kg para no‑avanzados) en `backend/services/metabolicProfileCalculator.js`.
- Logging/auditoría existe de forma parcial (bridge_decision_logs, nutrition_calibrations) pero no hay log unificado con rule IDs ni snapshots semanales en BD.

**No Implementado**

- Snapshots semanales completos con fase, kcal/macros, perfil metabólico, CLS, flags y adherencia (spec 11.1).
- Log de cambios de nutrición con rule IDs (NUTR-\*) y payload de métricas usadas (spec 11.2 y 12).
- Cadencia automatizada de recalculo (cron/scheduler) para recalibración 14 días y reevaluación metabólica (spec 10.5).
- Regla de lesión: esperar 7 días antes de recalcular factor de actividad y confirmar 14 días con reducción ≥2 sesiones/semana (spec 10.4.4).

**Bugs e Incoherencias Detectadas**

- `generateNutritionPlan` marca días de descanso como entrenamiento al usar `trainingSchedule[i % len] || (i % 2 === 0)`. Esto provoca que domingo aparezca como día de entreno aunque esté marcado como descanso. Archivo: `backend/services/nutritionCalculator.js`.
- `nutritionV2/measurements` usa columnas `weight`/`waist` que no existen en `app.body_measurements` (schema usa `weight_kg`/`waist_cm`). Archivo: `backend/routes/nutritionV2.js`.
- Duplicidad de fuentes de mediciones (`app.body_measurements` vs `app.user_body_measurements`) y endpoints (`/api/body-measurements`, `/api/nutrition/calibration/measurements*`, `/api/nutrition-v2/measurements`), lo que viola “una sola fuente de verdad”.
- Varios módulos importan `pool` como default (`import pool from '../db.js'`) pero `backend/db.js` solo exporta `pool` de forma nombrada. Esto puede romper calibración y suplementos. Archivos: `backend/services/nutritionCalibrator.js`, `backend/services/nutritionControlSupplements.js`, `backend/routes/metabolicProfile.js`, `backend/routes/nutritionCalibration.js`.

**Plan de Implementación Detallado**

1. Unificar mediciones en una sola tabla y ruta principal (`app.body_measurements` + `/api/body-measurements`) y alinear calibración, evaluaciones y dashboard con esa fuente.
2. Corregir el mapeo de días de entrenamiento en `generateNutritionPlan` eliminando el fallback `i % 2 === 0` cuando exista `trainingSchedule`, y generar fallback basado en `training_days` si no hay calendario explícito.
3. Ajustar el objetivo calórico por fase a los rangos de la spec y parametrizarlo por nivel y grasa corporal; alinear categorías de actividad con la tabla de la spec y normalizar inputs.
4. Unificar la regla anti‑ruido de 14 días y confirmación doble en todas las evaluaciones (nutritionV2, body-measurements, calibración), usando `register_icg_ipg_state` como única fuente de confirmación.
5. Rehacer compensación de saltos de dieta usando `weekly_calorie_targets` y `get_weekly_deviation_summary`; compensar solo si hay desviación semanal positiva y persistir macros de compensación por fase.
6. Completar reglas del bridge para deload/lesión y límites de carb cycling en déficit, con confirmación 2 semanas antes de cambios de kcal.
7. Añadir `nutrition_change_log` y `nutrition_weekly_snapshots` con rule IDs (NUTR-\*) y payload de métricas; exponer endpoint de auditoría y usarlo en el dashboard.
8. Corregir imports de `pool` y añadir tests básicos de regresión para plan de nutrición, mediciones y diet deviations.
