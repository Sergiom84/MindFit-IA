# Plan — Llevar la experiencia "Hipertrofia" (ex‑V2) a Heavy Duty

> Plantilla: la integración de **Calistenia** ya hecha. Heavy Duty es series×reps con carga → **reutiliza `RoutineSessionModal` (peso+reps)**, pero con matiz de **alta intensidad / HIT** (1‑2 series al **fallo muscular**, RIR≈0, baja frecuencia, mucha recuperación). Comparte el ruleset/autoreg "de fuerza/intensidad" con **Halterofilia** y **Powerlifting**.

## Objetivo

Que **Heavy Duty** tenga el mismo flujo que Hipertrofia/Calistenia: tarjeta → modal "hoy" → calentamiento → reproductor in‑app → autoevaluación → plan completo + calendario.

## Estado actual de "heavy-duty"

- ✅ Genera plan completo: `GymRoutineService.generateGymRoutine` con disciplina `heavy_duty`, `HEAVY_DUTY_TEMPLATES`/`HEAVY_DUTY_LEVELS` (baja frecuencia 2‑3 días, 1‑2 series al fallo vía exerciseOverrides), `coachTip` Mentzer: `GymRoutineService.js:239`.
- ✅ Tarjeta + modal manual: rama `name === 'Heavy Duty'` → `heavyDutyManual` (`MethodologiesScreen.jsx:515`), generación en `:766`.
- ❌ NO está en `SINGLE_DAY_METHODOLOGIES` → sin flujo single‑day in‑app.
- ❌ No hay generador single‑day de heavy_duty.

## La diferencia clave de "heavy-duty": intensidad / fallo (HIT)

Heavy Duty (Mentzer) es entrenamiento de **alta intensidad, bajo volumen**:

- **El peso es central** (gimnasio/barra/máquina) → en el reproductor **NO es opcional** (como Halterofilia; al revés que Calistenia/Casa).
- **1‑2 series llevadas al FALLO muscular absoluto** → el RIR objetivo es **≈0**, lo opuesto al RIR 2‑3 de hipertrofia. La autorregulación no mide "reps en reserva", mide **si se alcanzó el fallo al rango objetivo** y entonces **sube carga** (doble progresión reps→carga).
- **Baja frecuencia** (2‑3 días/sem) y **mucha recuperación** entre sesiones (Mentzer prioriza descanso).
- Técnica impecable; opcional: técnicas de intensidad (rest‑pause, negativas, estáticos) como notas.

Por tanto: se **reutiliza el reproductor `RoutineSessionModal` tal cual** (peso+reps+RIR); la adaptación vive en el **ruleset** (volumen mínimo, frecuencia baja, progresión por carga al fallo, deload generoso) y la **autorregulación** (¿fallo al objetivo? → sube carga). En la UI, conviene que el RIR por defecto/sugerido sea 0‑1 para Heavy Duty (mejora menor del SeriesTrackingModal, opcional).

## Fases (calco de Calistenia, con ruleset de intensidad/fallo)

### Fase 1 — Experiencia/flujo single‑day (entregable visible)

- Backend: `heavyDutySingleDay.js` calcado de `calisteniaSingleDay.js`, con `disciplina='heavy_duty'` y las categorías reales del catálogo (Pecho/Espalda/Piernas/Core). **1‑2 series** por ejercicio (bajo volumen, al fallo), reps objetivo según `series_reps_objetivo`. Persistir vía `persistSingleDaySession`. Añadir `heavy_duty`/`heavy-duty` a `normalizeMethodology` y al dispatch de `methodologySingleDay.js`.
- Frontend: añadir `'Heavy Duty'` a `SINGLE_DAY_METHODOLOGIES`; reutilizar `WarmupModal` + `RoutineSessionModal`; modal "foco" → grupos de heavy_duty (Pecho/Espalda/Piernas/Core). Entrar al single‑day en vez de abrir `heavyDutyManual` en finde (como Calistenia). `methodologyApiKey('Heavy Duty') → 'heavy_duty'`.
- Verificación: Métodos → Heavy Duty (finde) → modal hoy → calentamiento → reproductor con ejercicios al fallo (peso+reps, pocas series) → guardar serie (`save-set` 200, avanza).

### Fase 2 — Plan completo + calendario

- `generateGymRoutine` ya produce el plan de heavy_duty; conectar el botón "plan completo" del flujo single‑day y verificar el calendario en Rutinas (formato genérico `plan_data.semanas[].sesiones[].dia`).

### Fase 3 — Reglas/progresión de intensidad (ruleset)

- Ruleset `heavy_duty_v1` en `app.mindfeed_rulesets` (idempotente, aislado): **bajo volumen (1‑2 series)**, **baja frecuencia**, **progresión por carga al alcanzar el fallo en el rango objetivo** (doble progresión reps→carga), **deload/recuperación generosa** (Mentzer). Distinto del ruleset de hipertrofia (RIR 2‑3 + volumen). Carga desde BD (patrón `loadCalisteniaRuleset`).

### Fase 4 — Autorregulación (fallo/carga) + autoeval

- Migración aditiva aislada: `heavy_duty_autoreg_state` + `heavy_duty_register_session_result(user, plan, reached_failure, target_met)` que decide `progress` (alcanzó el fallo cumpliendo el rango → sube carga), `hold` o `deload` (no llega / fatiga acumulada → más recuperación). Endpoint en `methodology-session`.
- Frontend: reutilizar patrón `CalisteniaEffortModal` → `HeavyDutyEffortModal` (¿alcanzaste el fallo? + carga + cumplimiento) al completar sesión.

## Archivos críticos

- Backend: `routes/methodologySingleDay.js` (dispatch heavy_duty), `services/singleDay/persistSingleDaySession.js` (reuso) + nuevo `heavyDutySingleDay.js`, `services/routineGeneration/methodologies/GymRoutineService.js` (config heavy-duty, ya existe), migraciones `…_heavy_duty_ruleset.sql` y `…_heavy_duty_autoreg.sql`.
- Frontend: `MethodologiesScreen.jsx` (SINGLE_DAY_METHODOLOGIES + cableado), reuso de `WarmupModal`/`RoutineSessionModal`/modales generalizados, nuevo `HeavyDutyEffortModal.jsx`. Opcional: `SeriesTrackingModal` con RIR sugerido 0‑1 para disciplinas de intensidad.

## Riesgos

- **Seguridad/fallo**: entrenar al fallo absoluto con carga alta requiere técnica y, idealmente, ayuda/seguridad; el plan debe avisarlo (`coachTip`) y NO recomendar fallo en ejercicios de riesgo sin asistencia.
- **RIR 2‑3 no aplica**: el modelo es fallo (RIR≈0) + progresión por carga. No reutilizar el ruleset de hipertrofia tal cual; usar el de intensidad.
- **Recuperación**: baja frecuencia es intencional (Mentzer); el calendario/ruleset debe respetarla y no meter más sesiones de la cuenta.
- **Cobertura del catálogo** `disciplina='heavy_duty'`: verificar suficientes ejercicios por categoría; reusar el fallback de `calisteniaSingleDay`.
- Paralelo con las demás ramas: conflictos mínimos y aditivos en `MethodologiesScreen`/`methodologySingleDay`; mergear secuencial y rebasar.
- No romper HpV2/Calistenia/etc.: todo aditivo y por disciplina.

## Validación

- `npm run test:backend` (caso heavy_duty en el test del orquestador/generador).
- Navegador: Métodos → Heavy Duty → reproductor (peso+reps, pocas series al fallo) → plan completo → calendario.

## Nota de reutilización (disciplinas de fuerza/intensidad)

Heavy Duty, **Powerlifting** y **Halterofilia** comparten el modelo "carga/intensidad" (no RIR 2‑3): conviene un **ruleset/autoreg base de fuerza** parametrizado por disciplina (Heavy Duty = fallo + bajo volumen; Powerlifting/Halterofilia = %1RM + técnica). Si Halterofilia ya dejó ese patrón, Heavy Duty lo reaprovecha con sus parámetros.
