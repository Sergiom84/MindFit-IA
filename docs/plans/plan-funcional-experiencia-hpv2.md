# Plan — Llevar la experiencia "Hipertrofia" (ex‑V2) a Funcional

> Plantilla: la integración de **Calistenia** ya hecha. Funcional es el caso MÁS directo: prácticamente un calco de Calistenia con otra disciplina. Reutiliza `RoutineSessionModal` + RIR sin cambios.

## Objetivo

Que **Funcional** tenga el mismo flujo que Hipertrofia/Calistenia: tarjeta → modal "hoy" → calentamiento → reproductor in‑app con RIR → autoevaluación → plan completo + calendario.

## Estado actual de "funcional"

- ✅ Genera plan completo: `GymRoutineService.generateGymRoutine` con disciplina `funcional`, `FUNCTIONAL_TEMPLATES`, `functionalBucket` (Empuje/Tracción/Piernas/Core/Movilidad): `GymRoutineService.js:217`.
- ✅ Tarjeta + modal manual: rama `name === 'Funcional'` → `funcionalManual` (`MethodologiesScreen.jsx:515`), generación en `:791`.
- ❌ NO está en `SINGLE_DAY_METHODOLOGIES` → sin flujo single‑day in‑app.
- ❌ No hay generador single‑day de funcional.

## Diferencia clave: casi ninguna

Funcional es series×reps×descanso×RIR igual que Calistenia. Reutiliza `RoutineSessionModal` + RIR + `WarmupModal` SIN cambios. Lo único propio: la disciplina `funcional` y sus categorías de patrón (Empuje, Tracción, Piernas, Core, Movilidad). Opcional: si el catálogo funcional usa algo de material (kettlebell/banda), se puede añadir filtro de equipamiento, pero NO es el eje (a diferencia de Casa). MVP sin equipamiento.

## Fases (calco de Calistenia)

### Fase 1 — Experiencia/flujo single‑day + RIR (entregable visible)

- Backend: `funcionalSingleDay.js` calcado de `calisteniaSingleDay.js`, cambiando `disciplina='funcional'` y las categorías del Full Body a Empuje/Tracción/Piernas/Core (+ Movilidad). Persistir vía `persistSingleDaySession`. Añadir `funcional` al dispatch de `methodologySingleDay.js`.
- Frontend: añadir `'Funcional'` a `SINGLE_DAY_METHODOLOGIES`; reutilizar `WarmupModal` + `RoutineSessionModal` (RIR por defecto); modal "foco" → grupos de funcional. Quitar la rama que abre `funcionalManual` en el flujo "hoy" y entrar al single‑day (como Calistenia).
- Verificación: Métodos → Funcional (finde) → modal hoy → calentamiento → reproductor con ejercicios funcionales + RIR → guardar serie (`save-set` 200, avanza).

### Fase 2 — Plan completo + calendario

- `generateGymRoutine` ya produce el plan funcional; conectar el botón "plan completo" del flujo single‑day y verificar el calendario en Rutinas (formato genérico `plan_data.semanas[].sesiones[].dia`).

### Fase 3 — Reglas/progresión (ruleset)

- Ruleset `funcional_v1` en `app.mindfeed_rulesets` (idempotente, aislado): progresión por reps/carga/variante y trabajo de patrón, deload por volumen. Carga desde BD (patrón `loadCalisteniaRuleset`).

### Fase 4 — Autorregulación + autoeval

- Migración aditiva aislada: `funcional_autoreg_state` + `funcional_register_session_result(user, plan, avg_rir, target_met)` (filosofía de Calistenia). Endpoint en `methodology-session`.
- Frontend: reutilizar patrón `CalisteniaEffortModal` → `FuncionalEffortModal` (RIR + cumplimiento) al completar sesión.

## Archivos críticos

- Backend: `routes/methodologySingleDay.js` (dispatch funcional), `services/singleDay/persistSingleDaySession.js` (reuso) + nuevo `funcionalSingleDay.js`, `services/routineGeneration/methodologies/GymRoutineService.js` (config funcional, ya existe), migraciones `…_funcional_ruleset.sql` y `…_funcional_autoreg.sql`.
- Frontend: `MethodologiesScreen.jsx` (SINGLE_DAY_METHODOLOGIES + cableado), reuso de `WarmupModal`/`RoutineSessionModal`/modales generalizados, nuevo `FuncionalEffortModal.jsx`.

## Riesgos

- Cobertura del catálogo `disciplina='funcional'`: verificar suficientes ejercicios por categoría (Empuje/Tracción/Piernas/Core/Movilidad) para componer un Full Body; reusar el fallback de `calisteniaSingleDay`.
- Paralelo (3 ramas): conflictos mínimos y aditivos en `MethodologiesScreen`/`methodologySingleDay`; mergear secuencial y rebasar.
- No romper HpV2/Calistenia/CrossFit/Casa: todo aditivo y por disciplina.

## Validación

- `npm run test:backend` (caso funcional en el test del orquestador/generador).
- Navegador: Métodos → Funcional → reproductor con RIR → plan completo → calendario.
