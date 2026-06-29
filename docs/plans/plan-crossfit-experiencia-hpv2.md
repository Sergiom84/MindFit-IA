# Plan — Llevar la experiencia "Hipertrofia" (ex‑V2) a CrossFit

> Plantilla: la integración de **Calistenia** ya hecha (commits `53cbe91`→`b4fe55e`, fixes `93bcc4e`/`01d9b93`/`41dc16e`/`c89e5b6`).
> Arquitectura compartida: endpoint genérico `POST /api/methodology-session/generate-single-day` (`backend/routes/methodologySingleDay.js`), `persistSingleDaySession.js`, generador single‑day propio por disciplina, modales generalizados, ruleset en BD y autorregulación aislada.

## Objetivo

Que **CrossFit** tenga el mismo flujo que Hipertrofia (ex‑V2): tarjeta → modal "entrenar hoy" → calentamiento → sesión in‑app → autoevaluación de esfuerzo → plan completo + calendario. Reusar el esqueleto, generalizar por disciplina, NO duplicar motor.

## La diferencia clave (no ignorar)

CrossFit NO es series×reps×descanso×RIR. Es **WODs**: AMRAP, EMOM, "For Time", Chippers, metcons, con dominios (Weightlifting / Gymnastic / Monostructural / Accesorios), time caps, rounds y escalado (Scaled/RX/RX+). `CrossFitService` ya genera eso (`CrossFitService.js:156-163`).

Consecuencia: el reproductor de HpV2/Calistenia (RIR por serie) NO encaja. Hay que:

- Reusar el FLUJO (card → modal hoy → calentamiento → sesión → effort → plan/calendario).
- Sustituir el componente central por un **`WodSessionModal`**: cronómetro (cuenta atrás AMRAP/EMOM, cuenta arriba "For Time"), lista de movimientos, toggle de escalado, registro post‑WOD (tiempo/rounds + RPE 1‑10 + escala), NO RIR.
- Autorregulación por RPE + escalado + tiempos benchmark, no por RIR.

Arquitectura recomendada: **selección de "player" por disciplina** (hipertrofia/calistenia → `RoutineSessionModal`; crossfit → `WodSessionModal`), compartiendo `WarmupModal` y el patrón de modal de esfuerzo.

## Estado actual de CrossFit

- ✅ `generateCrossFitPlan` (version `crossfit_v1`) con plantillas WOD y niveles (Principiante/Intermedio RX/Avanzado/Elite, 3‑6 días, 8‑12 semanas): `CrossFitService.js:207`.
- ✅ `evaluateCrossFitLevel` (evaluación IA) y `getCrossFitLevels`.
- ✅ Tarjeta CrossFit y rama `methodology.name === 'CrossFit'` en `MethodologiesScreen`.
- ❌ NO está en `SINGLE_DAY_METHODOLOGIES` (`['HipertrofiaV2','Calistenia']`) → sin flujo single‑day in‑app.
- ❌ No hay generador single‑day de CrossFit, ni WOD player, ni ruleset/autoreg de CrossFit.

## Fases

### Fase 0 — Diseño del modelo de WOD (nuevo)

- Contrato de "sesión WOD": `{ formato:'amrap'|'emom'|'for_time'|'chipper', time_cap_min, rounds, movimientos:[{nombre, reps/cal, escala_rx, escala_scaled, dominio}], ... }`.
- Log post‑WOD: `resultado_tipo` (tiempo | rounds+reps), `valor`, `rpe (1‑10)`, `escala_usada (scaled/rx/rx+)`.
- Persistencia: tabla propia ligera (`crossfit_wod_results`) recomendada, o `exercise_session_tracking` con metadata WOD. Preferible tabla propia para no forzar el modelo de series.

### Fase 1 — Experiencia/flujo single‑day + WOD player (entregable visible)

- Backend: `generateCrossFitSingleDay` (disciplina `crossfit`, un WOD del día por nivel) que persiste vía `persistSingleDaySession` con metadata WOD; añadir `crossfit` al dispatch de `methodologySingleDay.js`.
- Frontend: añadir `'CrossFit'` a `SINGLE_DAY_METHODOLOGIES`; generalizar `HipertrofiaWeekendModal`/`HipertrofiaFocusModal` (ya aceptan `methodologyName`/`muscleGroups`; para CrossFit el "foco" = dominio o tipo de WOD); construir `WodSessionModal` (cronómetro + movimientos + escalado + registro) y seleccionar player por disciplina donde hoy se monta `RoutineSessionModal`.
- Verificación: Métodos → CrossFit (finde) → modal hoy → calentamiento → WOD player con un WOD real → registrar resultado.

### Fase 2 — Plan completo + calendario

- `generateCrossFitPlan` ya produce el plan; conectar el botón "plan completo" del flujo single‑day (como Calistenia) y verificar que el calendario de Rutinas pinta los WODs (calendario genérico: `ensureScheduleV3`/`/active-plan` esperan `plan_data.semanas[].sesiones[].dia`). Confirmar que `CrossFitService` emite ese formato; si no, alinearlo.

### Fase 3 — Reglas/progresión (ruleset)

- Ruleset `crossfit_v1` en `app.mindfeed_rulesets` (idempotente, aislado): progresión por densidad/carga/escala (Scaled→RX→RX+), gestión de time domains, deload por volumen/intensidad. Carga desde BD (patrón `loadCalisteniaRuleset`).

### Fase 4 — Autorregulación (RPE/escala) + autoeval

- Migración aditiva aislada: `crossfit_autoreg_state` + `crossfit_register_wod_result(user, plan, rpe, completo/time_cap, escala)` que decide `progress` (RPE bajo + RX completado bajo cap), `hold` o `deload`. Endpoint en `methodology-session`.
- Frontend: `CrossFitEffortModal` (RPE 1‑10 + escala + resultado) al completar el WOD (single‑day y plan).

## Archivos críticos

- Backend: `routes/methodologySingleDay.js` (dispatch crossfit), `services/singleDay/persistSingleDaySession.js` (reuso) + nuevo `crossfitSingleDay.js`, `services/routineGeneration/methodologies/CrossFitService.js`, migraciones `…_crossfit_ruleset.sql` y `…_crossfit_autoreg.sql`.
- Frontend: `MethodologiesScreen.jsx` (SINGLE_DAY_METHODOLOGIES + cableado), modales generalizados (reuso), nuevo `WodSessionModal.jsx`, nuevo `CrossFitEffortModal.jsx`, selección de player por disciplina.

## Riesgos

- El WOD player es trabajo NUEVO real (no reuso del de series). Es la parte más grande; Fase 0 define el contrato primero.
- No romper HpV2/Calistenia: todo aditivo y por disciplina; el selector de player deja intacto `RoutineSessionModal`.
- Migraciones a producción idempotentes, aisladas, con autorización explícita por migración.
- Confirmar pronto que `CrossFitService` emite `semanas[].sesiones[].dia` para el calendario.

## Validación

- `npm run test:backend` (caso crossfit en el test del orquestador/generador).
- Navegador: Métodos → CrossFit → WOD del día → registrar → plan completo → calendario.

## Paralelismo

CrossFit, Casa y Funcional tocan los mismos puntos compartidos (`SINGLE_DAY_METHODOLOGIES`, dispatch de `methodologySingleDay.js`). Conflictos aditivos triviales; mergear secuencial y rebasar. Archivos propios (`crossfitSingleDay.js`, `WodSessionModal.jsx`) no chocan.
