# Comparacion ciclo menstrual: origin/main vs local+Supabase (v3)

Fecha: 2026-02-03
Objetivo: comparar lo que hay en origin/main con la implementacion local + Supabase (v3), identificar puntos en comun, diferencias, complementariedad y viabilidad de merge.

---

## 1) Que hace origin/main (estado actual en remoto)

### 1.1 Base de datos

- Migracion `backend/migrations/menstrual_cycle_tables.sql` crea:
  - `app.user_menstrual_config` con: cycle_length, period_length, is_regular, uses_hormonal_contraceptives, last_period_start, tracking_enabled.
  - `app.menstrual_daily_log` con: is_period_day, energy_level, pain_level, sleep_quality, mood, bloating, notes.
- Indices por usuario/fecha.
- No hay historial de ciclos ni tags de ejercicios.

### 1.2 Backend (API)

- `backend/routes/menstrualCycle.js` expone:
  - GET/POST `/api/menstrual-cycle/config` (config basica).
  - GET `/api/menstrual-cycle/log/:date` y `/logs` (mes) con datos reales.
  - POST `/api/menstrual-cycle/log` (log diario 1-5).
  - GET `/api/menstrual-cycle/training-adjustment` con fase simple y ajustes fijos.
  - GET `/api/menstrual-cycle/check-user` para habilitar UI solo en usuarias femeninas.
- Logica de fase:
  - menstrual / follicular / ovulation / luteal.
  - Si usa anticonceptivos hormonales: fase "hormonal".
- Ajustes por sintomas:
  - pain >=4 => low_impact (-30% vol/int).
  - energia <=2 o sleep <=2 => reduce_volume.
  - energia >=4 y pain <=2 => optimal.
  - Sin log: ajustes por fase menstrual o lutea tardia.

### 1.3 Frontend (UI)

- `src/components/MenstrualCycle/*` con seccion completa:
  - Onboarding (4 pasos): last_period_start, cycle_length, is_regular, uses_hormonal_contraceptives.
  - Quick Log (1-5) energia, dolor, sueno; opcional mood, bloating; marcar is_period_day.
  - Calendario mensual con logs reales.
  - Vista "Hoy" con card, mensajes y CTA de registro.
  - Insights placeholder.
- `useMenstrualCycle` calcula fase y ajuste en frontend (logica simple, similar al backend).
- `useCycleAdjustment` consume `/training-adjustment` para aplicar modificadores en entrenamientos.

---

## 2) Que hace la implementacion local + Supabase (v3)

### 2.1 Base de datos (segun migracion v3 aplicada en Supabase)

- Migracion `backend/migrations/20260202_menstrual_cycle_v3.sql` agrega:
  - Nuevas columnas en `user_menstrual_config`:
    - contraception_type, cycle_confidence, last_bleed_start_date,
      bleed_length_days, cycle_length_days, luteal_length_days, joint_laxity_risk.
  - Nuevas columnas en `menstrual_daily_log`:
    - pain_0_3, fatigue_0_3, sleep_0_3, stress_0_3,
      pain_next_day_0_10, session_quality_0_10.
  - Nueva tabla `app.menstrual_cycle_history`.
  - Nueva tabla `app.exercise_tags` (pattern, equipment, impact/axial/cod/overhead).
  - Backfill conservador 1-5 => 0-3.

### 2.2 Motor de ciclo v3 (backend/services/menstrualCycle/engine.js)

- Motor determinista con:
  - Confianza de ciclo (high/medium/low) segun variacion y logs.
  - Modo "phase" vs "symptoms".
  - Calculo de fase con ventana ovulatoria y lutea tardia.
  - Severidad global por max(pain/fatigue/sleep/stress).
  - Mezcla fase + sintomas con peso w.
  - Clamp [0.80, 1.10] y regla no subir volumen e intensidad a la vez.
  - Descanso extra con regla sleep >=2.
- Tests unitarios `backend/tests/menstrualCycleEngine.test.js`.

### 2.3 Backend (API) v3

- `backend/routes/menstrualCycle.js` actualizado:
  - Acepta campos v3 en config y log.
  - Registra historial de ciclos al detectar nuevo sangrado.
  - Recalcula `cycle_length_days` con EMA y `cycle_confidence`.
  - `/training-adjustment` usa motor v3.
  - Mantiene compatibilidad con campos antiguos (cycleDay, phase, volumeModifier, intensityModifier).

### 2.4 Ajustes en sesiones (HipertrofiaV2)

- `backend/services/hipertrofiaV2/sqlControllers.js`:
  - Aplica multipliers del motor v3 en series/intensidad.
  - Aplica `rest_extra_seconds` si hay campo de descanso.
  - Integra swaps por tags (impacto/axial/COD).

### 2.5 Swaps por tags

- `backend/services/menstrualCycle/swapEngine.js`:
  - Busca alternativas por pattern + equipment + umbrales de riesgo.
  - Fallback seguro si faltan tags o no hay candidato.
- Scripts de seed/export/import para tagging manual de riesgo.

### 2.6 QA y docs

- Scripts:
  - `scripts/test-menstrual-cycle-db.mjs`
  - `scripts/test-menstrual-cycle-api.mjs`
  - `scripts/test-menstrual-cycle-swaps.mjs`
  - `scripts/seed|export|import-hypertrofia-tags.mjs`
- Documentacion: `docs/ciclo_menstrual/PLAN_IMPLEMENTACION_V3.md`, `QA_TESTS_V3.md`, `SEGUIMIENTO_V3.md`.

---

## 3) Puntos en comun (main vs local v3)

1. Misma base funcional: configuracion + logs + ajuste de entrenamiento.
2. Campos core compartidos:
   - cycle_length, period_length, uses_hormonal_contraceptives, last_period_start, tracking_enabled.
   - logs diarios con energy_level, pain_level, sleep_quality, mood, bloating.
3. Endpoints principales iguales:
   - /config, /log, /logs, /training-adjustment, /check-user.
4. La UI de main puede seguir funcionando si el backend mantiene compatibilidad con los campos antiguos (ya lo hace local v3).

---

## 4) Diferencias clave (punto por punto)

### 4.1 Modelo de datos

- Main: datos basicos 1-5 y sin historial de ciclos.
- Local v3: escala 0-3 (plus), historial de ciclos, tags de ejercicios y confidencia.

### 4.2 Logica de fase

- Main: fase por % del ciclo y reglas simples.
- Local v3: fase solo si hay confianza y datos; si no, modo sintomas.

### 4.3 Ajuste de entrenamiento

- Main: modifiers fijos por sintomas/fase.
- Local v3: mezcla fase+symptoms con peso w, clamp y regla anti doble aumento.

### 4.4 Swaps / restricciones

- Main: sin swaps en backend.
- Local v3: swaps por tags (impacto/axial/COD), mas escalable.

### 4.5 UI

- Main: UI completa (onboarding, quick log, calendario, insights).
- Local v3: no hay UI nueva; usa la existente si se mantiene compatibilidad.

### 4.6 QA/Tests

- Main: no trae suite especifica.
- Local v3: tests y scripts dedicados.

---

## 5) Son complementarios o chocan?

### Complementan bien

- **UI de main** + **backend v3**: es la combinacion mas natural.
- Main aporta UX completa; v3 aporta robustez y escalabilidad.
- La compatibilidad de v3 con campos antiguos permite migracion suave.

### Posibles choques

- **Doble logica de ajuste**: UI (useMenstrualCycle) calcula ajustes simples; backend v3 usa motor avanzado. Si no se alinea, puede mostrar mensajes distintos a la sesion real.
- **Escalas de sintomas**: UI usa 1-5; v3 usa 0-3. Esta resuelto en backend con mapeo, pero UI no muestra 0-3.
- **Campos nuevos sin UI**: contraception_type detallado, cycle_confidence, joint_laxity_risk no se recogen en onboarding actual.

---

## 6) Alcance, escalabilidad y robustez (sin competir)

### Alcance

- Main: cobertura UX y flujo usuario completo.
- Local v3: cobertura tecnica amplia (confianza, historial, swaps, QA).

### Escalabilidad

- Main: limitado a la tabla Ejercicios_Hipertrofia y a reglas simples.
- Local v3: tags desacoplados por catalogo + motor determinista -> mas facil extender a otras metodologias.

### Robustez

- Main: correcto para casos simples, pero sensible a ciclos irregulares.
- Local v3: maneja irregularidad, ausencia de datos y anticoncepcion con modo sintomas.

---

## 7) Merge: factible? y puntos interesantes

### Factible

Si. La ruta mas limpia es **mantener la UI de main** y **migrar el backend a v3** con compatibilidad.

### Puntos donde conviene hacer merge

1. **Backend v3** (engine + rutas + swaps + migracion v3).
2. **UI de main** (onboarding, quick log, calendario).
3. **Ajuste UI**:
   - Decidir si la UI usa la respuesta de `/training-adjustment` v3 en lugar de la logica local.
4. **Onboarding extendido**:
   - agregar contraception_type detallado, bleed_length_days, luteal_length_days, joint_laxity_risk.

### Puntos que requieren decision

- Si se mantiene la logica de ajuste en frontend o se delega al backend v3.
- Como mostrar `cycle_confidence` y modo sintomas en UI.
- Estrategia de tags: completar `exercise_tags` vs usar restricciones hardcodeadas.

---

## 8) Recomendacion pragmatica de merge (resumen)

1. Integrar backend v3 completo (motor + DB + swaps).
2. Mantener UI de main, pero:
   - hacer que `useCycleAdjustment` consuma la salida v3 (ya compatible).
   - alinear `useMenstrualCycle.getTrainingAdjustment()` con la API v3 o eliminar esa logica local.
3. Extender onboarding para nuevos campos v3 y mapear defaults conservadores.
4. Completar tags de riesgo gradualmente con el CSV.

---

## 9) Resultado esperado si se fusionan bien

- UI rica para usuarias (main).
- Motor y datos robustos para decisiones (v3).
- Capacidad real de escalar a otras metodologias sin reescribir reglas.
