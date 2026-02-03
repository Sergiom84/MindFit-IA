# Plan de implementacion ciclo menstrual v3 (MindFeed)

Version: 2026-02-02
Fuente: docs/Ciclo_menstrual_especificacion_MindFeed_v3.md
Objetivo: implementar el modulo v3 sin interpretacion creativa, con fases, tests y criterios de salida.

## Principios de ejecucion

- Mantener compatibilidad con el modulo actual mientras se migra (no romper endpoints existentes).
- Separar la logica en un motor determinista y testeable (sin dependencias de HTTP).
- Toda regla debe estar trazada a una seccion del documento v3.
- Modo sintomas por defecto cuando falte data o haya anticoncepcion hormonal.
- Limitar (clamp) multiplicadores a [0.80, 1.10].
- No tocar WorkoutContext.generatePlan().
- Fecha de referencia: mantener UTC (toISOString) mientras no haya timezone explicito en perfil.

## Estructura de fases (orden recomendado)

1. Datos y migraciones (v3).
2. Motor de ciclo (confianza, modo, fase, severidad).
3. Endpoints y ajustes de sesion (incluye descanso).
4. Alineacion UI con backend v3 (sin romper compatibilidad).
5. Tags de ejercicios + swaps.
6. Autoajuste y deload.
7. QA final y documentacion.

---

## Fase 1: Datos y migraciones

### Objetivo

Agregar campos y tablas necesarios para v3 sin romper compatibilidad.

### Tareas (backend/migrations)

1. Crear migracion nueva en backend/migrations/ con:
   - Columnas nuevas en app.user_menstrual_config:
     - contraception_type (text) default 'none'
     - cycle_confidence (text) default 'low'
     - last_bleed_start_date (date)
     - bleed_length_days (int default 5, check 1-10)
     - cycle_length_days (int default 28, check 21-45)
     - luteal_length_days (int default 14, check 9-18)
     - joint_laxity_risk (bool default false)
   - Columnas nuevas en app.menstrual_daily_log:
     - pain_0_3 (int check 0-3)
     - fatigue_0_3 (int check 0-3)
     - sleep_0_3 (int check 0-3)
     - stress_0_3 (int check 0-3)
     - pain_next_day_0_10 (int check 0-10)
     - session_quality_0_10 (int check 0-10)
   - Tabla app.menstrual_cycle_history:
     - id, user_id, bleed_start_date, cycle_length_days, created_at
     - index por (user_id, bleed_start_date)
   - Tabla app.exercise_tags (tags minimos v3):
     - id, exercise_id (bigint), source_table (text), pattern (text)
     - equipment (text[]), impact_level (int 0-3), axial_load_level (int 0-3)
     - cod_level (int 0-3), overhead (bool)
     - created_at, updated_at
     - unique (exercise_id, source_table)

2. Backfill inicial:
   - user_menstrual_config:
     - cycle_length_days = cycle_length
     - bleed_length_days = period_length
     - last_bleed_start_date = last_period_start
     - contraception_type = CASE WHEN uses_hormonal_contraceptives THEN 'other/unknown' ELSE 'none' END
     - cycle_confidence = 'low' (hasta tener >=2 ciclos)
   - menstrual_daily_log:
     - mapear campos 1-5 a escala 0-3 si faltan nuevos (conservador):
       - pain_level: 1->0, 2->1, 3->1, 4->2, 5->3
       - energy_level (fatiga inversa): 1->3, 2->2, 3->1, 4->0, 5->0
       - sleep_quality (sueno inverso): 1->3, 2->2, 3->1, 4->0, 5->0

3. Documentar compatibilidad:
   - Mantener columnas antiguas mientras la UI se actualiza.
   - No eliminar uses_hormonal_contraceptives, cycle_length, period_length, last_period_start por ahora.

### Criterios de salida

- Migracion aplicada sin errores.
- Columnas nuevas visibles y con defaults.
- Backfill ok (sin nulos inesperados).

### Tests (scripts)

- Script DB: `scripts/test-menstrual-cycle-db.mjs`
  - Verifica columnas y constraints.
  - Crea usuario de prueba y valida defaults.

---

## Fase 2: Motor de ciclo (confianza, modo, fase, severidad)

### Objetivo

Crear un motor determinista que implemente secciones 2-7 del v3.

### Tareas (backend/services)

1. Crear modulo puro: backend/services/menstrualCycle/engine.js
   - computeCycleLengthEMA(history, alpha=0.30)
   - computeCycleVariation(historyLast3)
   - computeCycleConfidence(variation, flags)
   - determineMode({contraception_type, cycle_confidence, last_bleed_start_date, hasRecentLogs})
   - computeCycleDay({last_bleed_start_date, today})
   - computePhase({cycle_day, bleed_length_days, cycle_length_days, luteal_length_days, confidence})
   - computeSeverity({pain_0_3, fatigue_0_3, sleep_0_3, stress_0_3})
   - getPhaseMultipliers(phase)
   - getSymptomMultipliers(severity)
   - combineMultipliers({phase, severity, weight_w})
   - applyClamp(value, min=0.80, max=1.10)
   - enforceNoDoubleIncrease({m_int, m_vol})
   - computeRestExtra({phase, severity, sleep_0_3})
   - computeDominantDomain({pain, fatigue, sleep, stress})

2. Ajustar reglas segun v3:
   - Modo sintomas: w=1.0 y sin fase.
   - Peso w por confidence: high=0.50, medium=0.65, low=0.80.
   - Descanso extra minimo si sleep>=2: +30s adicionales.

3. Documentar el contrato de salida del motor (objeto JSON estable).

### Criterios de salida

- Motor con tests unitarios verdes.
- Todas las reglas 2-7 cubiertas por pruebas.

### Tests (scripts)

- Unit tests: `node --test backend/tests/menstrualCycleEngine.test.js`
  - Casos T1-T8 del doc v3 + clamp + no doble aumento + modo sintomas.

---

## Fase 3: Endpoints y ajustes de sesion

### Objetivo

Actualizar API y la integracion con sesiones para usar el motor v3.

### Tareas (backend/routes)

1. /api/menstrual-cycle/config
   - Aceptar nuevos campos (contraception_type, bleed_length_days, cycle_length_days, luteal_length_days, joint_laxity_risk).
   - Exponer cycle_confidence y modo calculado (read-only).

2. /api/menstrual-cycle/log
   - Aceptar pain_0_3, fatigue_0_3, sleep_0_3, stress_0_3, pain_next_day_0_10, session_quality_0_10.
   - Cuando is_period_day y es inicio de sangrado: insertar en menstrual_cycle_history.
   - Recalcular cycle_length_days con EMA si hay >=2 ciclos.

3. /api/menstrual-cycle/training-adjustment
   - Usar engine.js.
   - Retornar:
     - mode, cycle_confidence, cycle_day, phase (si aplica)
     - severity_global, dominant_domain
     - multipliers (intensity, volume)
     - rest_extra_seconds
     - swap_required (bool) + reglas activas
     - user_message

4. HipertrofiaV2: usar el mismo motor en getMenstrualTrainingAdjustment.
   - Aplicar m_int y m_vol al calculo de series/intensidad.
   - Aplicar descanso extra cuando haya campo descanso_seg (o equivalente).
   - Enviar en respuesta el resumen del ajuste (para UI).

### Criterios de salida

- Endpoint devuelve la misma estructura siempre.
- Sesion ajustada con volumen/intensidad y descanso extra cuando aplica.

### Tests (scripts)

- Integration API: `scripts/test-menstrual-cycle-api.mjs`
  - Crear config/logs y validar salida de training-adjustment.
  - Verificar modo sintomas y modo fase.

---

## Fase 4: Alineacion UI con backend v3

### Objetivo

Mantener la UI actual de main pero alineada al contrato v3 sin duplicar logica en frontend.

### Tareas (frontend)

1. `src/hooks/useCycleAdjustment.js`:
   - Consumir campos v3 cuando existan: `mode`, `phase_v3`, `cycle_confidence`, `multipliers`, `rest_extra_seconds`, `swap_required`.
   - Mantener compatibilidad con `cycleDay`, `phase`, `volumeModifier`, `intensityModifier` para no romper pantallas actuales.
   - Asegurar que el ajuste que se muestra en UI sea el mismo que usa el backend.

2. `src/components/MenstrualCycle/hooks/useMenstrualCycle.js`:
   - Eliminar o desactivar el calculo local de ajustes (`getTrainingAdjustment`) y usar la respuesta del backend.
   - Mantener calculo local de `cycleInfo` solo como fallback visual si el backend no devuelve fase.

3. `src/components/MenstrualCycle/CycleOnboarding.jsx`:
   - Agregar campos v3 necesarios:
     - `contraception_type` (selector con opciones v3).
     - `bleed_length_days` (default 5).
     - `luteal_length_days` (default 14).
     - `joint_laxity_risk` (toggle).
   - Mapear a los campos legacy para compatibilidad (`cycle_length`, `period_length`, `uses_hormonal_contraceptives`).

4. `src/components/MenstrualCycle/CycleQuickLog.jsx`:
   - Mantener sliders 1-5 pero enviar tambien (opcional) los campos 0-3 o dejar que el backend haga el mapeo.
   - Añadir campos opcionales nuevos si se desea: `stress_0_3`, `session_quality_0_10`, `pain_next_day_0_10`.

5. Ajustes de UI (mensajes):
   - Si `mode = symptoms`, no mostrar fase estimada.
   - Mostrar `cycle_confidence` cuando exista (texto corto en ajustes o info).

### Criterios de salida

- UI sigue funcionando sin cambios de navegacion.
- Ajustes mostrados en UI coinciden con el backend v3.
- Onboarding guarda campos v3.

### Tests (manual + scripts)

- Manual: crear config + log y verificar que la UI muestra el mismo ajuste que `/training-adjustment`.
- Script: `scripts/test-menstrual-cycle-api.mjs` (backend ya validado).

---

## Fase 5: Tags de ejercicios + SWAP

### Objetivo

Implementar sustituciones obligatorias por dolor/sueno siguiendo v3.

### Tareas (backend + DB)

1. Poblar app.exercise_tags (minimo para Ejercicios_Hipertrofia):
   - pattern, impact_level, axial_load_level, cod_level, overhead, equipment.
   - pattern/equipment se pueden importar automaticamente desde el catalogo; el resto se taggea manualmente.
   - Scripts sugeridos: scripts/seed-hypertrofia-tags.mjs + export/import CSV.

2. Crear helper: backend/services/menstrualCycle/swapEngine.js
   - Input: ejercicio, reglas activas, disponibilidad de equipo.
   - Buscar alternativa con mismo pattern y tags <= umbral.
   - Prioridad: mismo equipment > equipment compatible > fallback (sin swap).

3. Integrar en ajustes de sesion (HipertrofiaV2):
   - Si pain>=2 y impact_level>=2 -> swap a impact<=1.
   - Si pain>=2 y axial_load_level>=2 -> swap a axial<=1-2.
   - Si joint_laxity_risk=true y fase ovulatoria o fatiga>=2 -> cod_level<=1.
   - Si faltan tags de riesgo: no forzar swap, solo reducir carga + nota.

### Criterios de salida

- Swaps aplicados y trazados en notas.
- Si no hay alternativa, se deja nota de seguridad y se reduce intensidad.

### Tests (scripts)

- `scripts/test-menstrual-cycle-swaps.mjs`
  - Inyecta tags de prueba y valida swaps por dolor/cod/axial.

---

## Fase 6: Autoajuste y deload

### Objetivo

Aplicar reglas 10.1 y 10.2 del v3.

### Tareas (backend + DB)

1. Tabla app.menstrual_pattern_metrics:
   - user_id, pattern, last_sessions (jsonb), updated_at

2. Hook al completar sesion:
   - Guardar pain_next_day_0_10 y session_quality_0_10 por patron.
   - Actualizar rolling window (ultimas 3 sesiones por patron).

3. Reglas de autoajuste:
   - pain_next_day >=7 en 2/3 sesiones -> bajar volumen patron 5% semana siguiente + reforzar swaps.
   - session_quality <=4 en 2/3 sesiones -> bajar intensidad 2.5-5% + +15s descanso.
   - Ambas -> mini-deload 1 semana (tratar severidad 3).

4. Estado de deload:
   - app.menstrual_deload_state con start_date, end_date, reason.
   - El engine debe leerlo y aplicar ajustes de deload.

### Criterios de salida

- Autoajuste se activa y expira correctamente.
- Deload 1 semana con mensajes claros.

### Tests (scripts)

- `scripts/test-menstrual-cycle-deload.mjs`
  - Simula 3 sesiones con pain_next_day alto y valida estado deload.

---

## Fase 7: QA final + documentacion

### Objetivo

Cerrar con pruebas, docs y seguimiento.

### Tareas

- Ejecutar todos los scripts del QA.
- Completar checklist en docs/ciclo_menstrual/QA_TESTS_V3.md.
- Actualizar docs/ciclo_menstrual/SEGUIMIENTO_V3.md con resultados.
- Actualizar docs/SUPABASE_DATABASE_CONTEXT.md con nuevas tablas/funciones si aplica.

### Criterios de salida

- QA completa con evidencias.
- Docs actualizadas.

---

## Notas de compatibilidad

- Mientras la UI no use campos 0-3, mantener mapping desde 1-5.
- Si falta last_bleed_start_date o hay anticoncepcion hormonal: modo sintomas.
- No exponer fases si modo sintomas.
- Si faltan tags de riesgo (impact/axial/cod): no swap, solo ajuste conservador.

## Entregables finales

- Migraciones aplicadas.
- Motor v3 con tests.
- Endpoints actualizados.
- Swaps funcionales.
- Autoajuste/deload.
- QA y seguimiento al dia.
