# Plan — Llevar la experiencia "Hipertrofia" (ex‑V2) a Halterofilia

> Plantilla: la integración de **Calistenia** ya hecha. Halterofilia es series×reps con barra → reutiliza `RoutineSessionModal` (peso+reps), pero con matiz de **disciplina de fuerza** (reps bajas, %1RM/RPE, técnica) en vez de RIR a fallo. El mismo matiz aplica a **Powerlifting** y **Heavy Duty**.

## Objetivo

Que **Halterofilia** tenga el mismo flujo que Hipertrofia/Calistenia: tarjeta → modal "hoy" → calentamiento → reproductor in‑app → autoevaluación → plan completo + calendario.

## Estado actual de "halterofilia"

- ✅ Genera plan completo: `GymRoutineService.generateGymRoutine` con disciplina `halterofilia`, plantillas olímpicas (Snatch / Clean & Jerk / Técnica / Fuerza / Accesorios): `GymRoutineService.js:261`.
- ✅ Tarjeta + modal manual: rama `name === 'Halterofilia'` → `halterofiliaManual` (`MethodologiesScreen.jsx:537`), generación en `:854`.
- ❌ NO está en `SINGLE_DAY_METHODOLOGIES` → sin flujo single‑day in‑app.
- ❌ No hay generador single‑day de halterofilia.

## La diferencia clave de "halterofilia": fuerza (no RIR a fallo)

Halterofilia (y Powerlifting/Heavy Duty) son disciplinas de **fuerza/técnica**:

- **El peso es central** (barra) → en el reproductor NO es opcional (al revés que Calistenia/Casa, donde era opcional).
- **Reps bajas** (1‑5 en lifts principales), **alta intensidad relativa**, énfasis en **técnica**.
- El modelo de carga es **%1RM / RPE**, no RIR a fallo (un snatch pesado a 1 rep no se programa por "reps en reserva"). RIR sigue siendo razonable para accesorios.
- La progresión es por **carga** (lineal / ondulante / picos hacia un test de 1RM), no reps→variante.

Por tanto: se **reutiliza el reproductor `RoutineSessionModal` tal cual** (ya captura peso+reps+RIR), y la adaptación vive en el **ruleset** y la **autorregulación** (carga/%1RM/RPE), no en la UI del player. Opcional: mostrar RPE además de/junto a RIR en disciplinas de fuerza (mejora futura del SeriesTrackingModal).

## Fases (calco de Calistenia, con ruleset de fuerza)

### Fase 1 — Experiencia/flujo single‑day (entregable visible)

- Backend: `halterofiliaSingleDay.js` calcado de `calisteniaSingleDay.js`, con `disciplina='halterofilia'` y las categorías olímpicas (Snatch/Clean & Jerk/Técnica/Fuerza/Accesorios). Reps/series bajas según `series_reps_objetivo` del catálogo. Persistir vía `persistSingleDaySession`. Añadir `halterofilia` al dispatch de `methodologySingleDay.js`.
- Frontend: añadir `'Halterofilia'` a `SINGLE_DAY_METHODOLOGIES`; reutilizar `WarmupModal` + `RoutineSessionModal`; modal "foco" → grupos de halterofilia (Snatch/Clean & Jerk/Técnica/Fuerza). Entrar al single‑day en vez de abrir `halterofiliaManual` (como Calistenia).
- Verificación: Métodos → Halterofilia (finde) → modal hoy → calentamiento → reproductor con lifts olímpicos (peso+reps) → guardar serie (`save-set` 200, avanza).

### Fase 2 — Plan completo + calendario

- `generateGymRoutine` ya produce el plan de halterofilia; conectar el botón "plan completo" del flujo single‑day y verificar el calendario en Rutinas (formato genérico `plan_data.semanas[].sesiones[].dia`).

### Fase 3 — Reglas/progresión de fuerza (ruleset)

- Ruleset `halterofilia_v1` en `app.mindfeed_rulesets` (idempotente, aislado): **progresión por carga** (lineal/ondulante con picos), reps bajas, énfasis técnica, **deload/tapering** antes de tests de 1RM. Distinto de los rulesets de hipertrofia/calistenia (que progresan por reps/variante). Carga desde BD (patrón `loadCalisteniaRuleset`).

### Fase 4 — Autorregulación (carga/RPE) + autoeval

- Migración aditiva aislada: `halterofilia_autoreg_state` + `halterofilia_register_session_result(user, plan, rpe/carga, target_met)` que decide `progress` (RPE bajo + carga objetivo cumplida con buena técnica), `hold` o `deload`. Endpoint en `methodology-session`.
- Frontend: reutilizar patrón `CalisteniaEffortModal` → `HalterofiliaEffortModal` (RPE + carga + cumplimiento técnico) al completar sesión. Nota: para fuerza, RPE encaja mejor que RIR.

## Archivos críticos

- Backend: `routes/methodologySingleDay.js` (dispatch halterofilia), `services/singleDay/persistSingleDaySession.js` (reuso) + nuevo `halterofiliaSingleDay.js`, `services/routineGeneration/methodologies/GymRoutineService.js` (config halterofilia, ya existe), migraciones `…_halterofilia_ruleset.sql` y `…_halterofilia_autoreg.sql`.
- Frontend: `MethodologiesScreen.jsx` (SINGLE_DAY_METHODOLOGIES + cableado), reuso de `WarmupModal`/`RoutineSessionModal`/modales generalizados, nuevo `HalterofiliaEffortModal.jsx`. Opcional: `SeriesTrackingModal` con RPE para disciplinas de fuerza.

## Riesgos

- **Seguridad/técnica**: los lifts olímpicos a alta intensidad requieren buena técnica; el plan debe priorizar progresión conservadora y técnica (reflejarlo en `coachTip` y en el ruleset). No empujar carga si el cumplimiento técnico es bajo.
- **RIR vs RPE**: RIR a fallo no encaja en lifts principales; usar RPE/carga en la autorregulación. Mantener el player reusado, adaptar solo el ruleset/effort.
- **Cobertura del catálogo** `disciplina='halterofilia'`: verificar suficientes ejercicios por categoría (Snatch/Clean & Jerk/Técnica/Fuerza/Accesorios) para componer una sesión; reusar el fallback de `calisteniaSingleDay`.
- Paralelo con CrossFit/Casa/Funcional: conflictos mínimos y aditivos en `MethodologiesScreen`/`methodologySingleDay`; mergear secuencial y rebasar.
- No romper HpV2/Calistenia/etc.: todo aditivo y por disciplina.

## Validación

- `npm run test:backend` (caso halterofilia en el test del orquestador/generador).
- Navegador: Métodos → Halterofilia → reproductor (peso+reps) → plan completo → calendario.

## Nota de reutilización (disciplinas de fuerza)

El ruleset/autoreg "de fuerza" (carga/%1RM/RPE, reps bajas, picos, deload técnico) de Halterofilia es **reutilizable para Powerlifting y Heavy Duty** con pequeños ajustes. Conviene diseñarlo pensando en los tres.
