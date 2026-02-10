# Resumen de Desalineaciones Parciales con el Spec de Nutricion

Fecha: 06.02.2026  
Alcance: resumen solicitado "como antes" sobre puntos no totalmente alineados con `docs/mindfit_nutrition_system_spec_unified.md`.

## 1) Marco de 31 dias como narrativa principal (parcial)

- La implementacion soportaba planes de hasta 31 dias y lo mostraba en UI, mientras el spec prioriza reglas semanales/quincenales (anti-ruido 14 dias) y no exige ese marco mensual fijo.
- Referencias previas: `backend/routes/nutritionV2.js:477`, `src/components/nutrition/NutritionPlanGenerator.jsx:30`, `src/components/nutrition/NutritionPlanGenerator.jsx:1266`.

## 2) "Siempre enlazada al entrenamiento" (parcial)

- Existe sincronizacion con plan activo, pero no era obligatoria: el usuario podia generar plan nutricional manual sin amarre estricto al plan de entrenamiento.
- Referencias: `src/components/nutrition/NutritionPlanGenerator.jsx:1252`, `backend/routes/nutritionV2.js:473`.

## 3) Cadencia de ajuste calorico "quincenal y luego semanal" (parcial)

- La calibracion calorica esta implementada principalmente a 14 dias (configurable), pero no como ajuste semanal por defecto para kcal.
- Referencias: `backend/services/nutritionCalibrator.js:198`, `backend/routes/nutritionCalibration.js:289`.

## 4) Revision mensual completa en trigger principal (parcial)

- El estado/modelo contempla `next_full_review`, pero esa revision mensual no participa en la comprobacion principal de "needs recalculation".
- Referencias: `backend/routes/trainingNutritionBridge.js:730`, `backend/migrations/create_training_nutrition_bridge_system.sql:173`.

## 5) Anti-ruido global uniforme para cambios importantes (parcial)

- El patron de confirmacion 2 ciclos esta bien aplicado en bloques concretos (perfil metabolico e ICG/IPG), pero no de forma homogenea en todos los ajustes caloricos globales.
- Referencias: `backend/services/metabolicProfileCalculator.js:430`, `backend/services/nutritionCalibrator.js:261`.
