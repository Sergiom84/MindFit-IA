# Plan — Llevar la experiencia "Hipertrofia" (ex‑V2) a Powerlifting

> Plantilla: la integración de **Calistenia** ya hecha. Powerlifting es series×reps con barra → **reutiliza `RoutineSessionModal` (peso+reps)**, con matiz de **fuerza máxima** (los 3 básicos, reps bajas, **%1RM/RPE**, periodización con picos). Es el caso **más parecido a Halterofilia**; comparte el ruleset/autoreg "de fuerza/intensidad" con **Halterofilia** y **Heavy Duty**.

## Cómo empezar (LEE ESTO PRIMERO)

Powerlifting debe **seguir exactamente los mismos pasos** que ya se hicieron para Hipertrofia (ex‑V2) → Calistenia → CrossFit/Casa/Funcional/Halterofilia. **No inventes arquitectura nueva: copia el patrón ya probado y cámbiale la disciplina.**

**Atajo clave:** Powerlifting es casi idéntico a **Halterofilia** (ambas son fuerza %1RM/RPE, reps bajas, picos). **Copia lo que hizo Halterofilia** y ajusta parámetros (básicos en vez de lifts olímpicos). Halterofilia ya está implementada y commiteada en `47e8b59`.

**Archivos de referencia a leer ANTES de escribir nada (en este orden):**

1. `backend/services/singleDay/calisteniaSingleDay.js` → plantilla del generador single‑day (estructura, fallback, mapeo de ejercicios).
2. El generador single‑day de **Halterofilia** (su `…SingleDay.js`, en `47e8b59`) → el más parecido a lo que necesitas (disciplina de fuerza).
3. `backend/services/singleDay/persistSingleDaySession.js` → persistencia genérica que se REUSA (no la dupliques).
4. `backend/routes/methodologySingleDay.js` → `normalizeMethodology` + el dispatch por metodología (añade `powerlifting`).
5. `src/components/Methodologie/MethodologiesScreen.jsx` → `SINGLE_DAY_METHODOLOGIES`, los `*_FOCUS_GROUPS`, `methodologyApiKey`, el flujo de finde, y la **selección de player por disciplina** (`discipline === 'crossfit' ? WodSessionModal : RoutineSessionModal`); Powerlifting va por la rama `RoutineSessionModal`.
6. El **EffortModal de Halterofilia** y sus migraciones `…_ruleset.sql` / `…_autoreg.sql` → plantilla para Fases 3‑4.
7. La memoria del proyecto y `docs/plans/plan-halterofilia-experiencia-hpv2.md` (gemela).

**Orden de trabajo (mismas fases que las demás):** Fase 1 (single‑day + flujo) → Fase 2 (plan completo + calendario) → Fase 3 (ruleset) → Fase 4 (autorregulación + EffortModal). Cada fase es un entregable verificable por separado.

**Reglas de oro (no negociables):**

- **Todo aditivo y por disciplina.** No tocar HpV2/Calistenia/CrossFit/etc. Defaults que no alteren lo existente.
- **Migraciones idempotentes y aisladas** (`CREATE … IF NOT EXISTS`, `INSERT … WHERE NOT EXISTS scope='powerlifting_v1'`, `ON CONFLICT`). No modificar otros scopes de `mindfeed_rulesets`. Aplicar a producción **solo con autorización explícita** por migración.
- **Verificar el generador contra la BD real dentro de una transacción con `ROLLBACK`** antes de cualquier prueba que haga COMMIT (no contaminar producción).
- **`npm run test:backend` 72/72 y lint 0 errores** antes de dar por hecha cada fase.
- **No reiniciar frontend ni backend** sin pedirlo (regla del repo).
- Conflictos con otras ramas paralelas son **aditivos triviales** en `MethodologiesScreen`/`methodologySingleDay` (añadir una entrada); mergear secuencial y rebasar.

## Objetivo

Que **Powerlifting** tenga el mismo flujo que Hipertrofia/Calistenia: tarjeta → modal "hoy" → calentamiento → reproductor in‑app → autoevaluación → plan completo + calendario.

## Estado actual de "powerlifting"

- ✅ Genera plan completo: `GymRoutineService.generateGymRoutine` con disciplina `powerlifting`, `POWERLIFTING_TEMPLATES` (Sentadilla/Banca/Peso Muerto + Asistencia inferior/superior): `GymRoutineService.js:257`.
- ✅ Tarjeta + modal manual: rama `name === 'Powerlifting'` → `powerliftingManual` (`MethodologiesScreen.jsx:565`), generación en `:847`.
- ❌ NO está en `SINGLE_DAY_METHODOLOGIES` → sin flujo single‑day in‑app.
- ❌ No hay generador single‑day de powerlifting.

## La diferencia clave de "powerlifting": fuerza máxima (%1RM / RPE)

Powerlifting gira en torno a los **3 básicos** (sentadilla, press banca, peso muerto) + asistencia:

- **El peso es central** (barra) → en el reproductor **NO es opcional** (como Halterofilia/Heavy Duty; al revés que Calistenia/Casa).
- **Reps bajas** (1‑5 en los básicos), **alta intensidad relativa**.
- El modelo de carga es **%1RM / RPE** — y en powerlifting el **RPE es EL estándar** de autorregulación (p. ej. "top single a RPE 8 + series back‑off"). RIR a fallo no es el modelo.
- Progresión por **carga** con **periodización y picos** (lineal/ondulante/bloques) hacia un test de 1RM o competición; **deload/tapering**.

Por tanto: se **reutiliza el reproductor `RoutineSessionModal` tal cual** (peso+reps+RIR); la adaptación vive en el **ruleset** (reps bajas, %1RM, picos, deload) y la **autorregulación** (**RPE**). Recomendable mostrar **RPE** en el SeriesTrackingModal para disciplinas de fuerza (mejora compartida con Halterofilia/Heavy Duty).

## Fases (calco de Calistenia, con ruleset de fuerza)

### Fase 1 — Experiencia/flujo single‑day (entregable visible)

- Backend: `powerliftingSingleDay.js` calcado de `calisteniaSingleDay.js`, con `disciplina='powerlifting'` y las categorías reales (Sentadilla/Press Banca/Peso Muerto/Asistencia inferior/superior). Reps/series según `series_reps_objetivo`. Persistir vía `persistSingleDaySession`. Añadir `powerlifting` a `normalizeMethodology` y al dispatch de `methodologySingleDay.js`.
- Frontend: añadir `'Powerlifting'` a `SINGLE_DAY_METHODOLOGIES`; reutilizar `WarmupModal` + `RoutineSessionModal`; modal "foco" → grupos de powerlifting (Sentadilla/Banca/Peso Muerto). Entrar al single‑day en vez de abrir `powerliftingManual` en finde (como Calistenia). `methodologyApiKey('Powerlifting') → 'powerlifting'`.
- Verificación: Métodos → Powerlifting (finde) → modal hoy → calentamiento → reproductor con básicos (peso+reps, reps bajas) → guardar serie (`save-set` 200, avanza).

### Fase 2 — Plan completo + calendario

- `generateGymRoutine` ya produce el plan de powerlifting; conectar el botón "plan completo" del flujo single‑day y verificar el calendario en Rutinas (formato genérico `plan_data.semanas[].sesiones[].dia`).

### Fase 3 — Reglas/progresión de fuerza (ruleset)

- Ruleset `powerlifting_v1` en `app.mindfeed_rulesets` (idempotente, aislado): **reps bajas**, **%1RM**, **periodización con picos** (lineal/ondulante/bloques), **deload/tapering** antes de tests de 1RM. Distinto del ruleset de hipertrofia (RIR 2‑3 + volumen). Carga desde BD (patrón `loadCalisteniaRuleset`).

### Fase 4 — Autorregulación (RPE/carga) + autoeval

- Migración aditiva aislada: `powerlifting_autoreg_state` + `powerlifting_register_session_result(user, plan, rpe/carga, target_met)` que decide `progress` (RPE bajo + carga objetivo cumplida con buena técnica → sube carga), `hold` o `deload`. Endpoint en `methodology-session`.
- Frontend: reutilizar patrón `CalisteniaEffortModal` → `PowerliftingEffortModal` (RPE + carga + cumplimiento) al completar sesión. Nota: para fuerza, RPE encaja mejor que RIR.

## Archivos críticos

- Backend: `routes/methodologySingleDay.js` (dispatch powerlifting), `services/singleDay/persistSingleDaySession.js` (reuso) + nuevo `powerliftingSingleDay.js`, `services/routineGeneration/methodologies/GymRoutineService.js` (config powerlifting, ya existe), migraciones `…_powerlifting_ruleset.sql` y `…_powerlifting_autoreg.sql`.
- Frontend: `MethodologiesScreen.jsx` (SINGLE_DAY_METHODOLOGIES + cableado), reuso de `WarmupModal`/`RoutineSessionModal`/modales generalizados, nuevo `PowerliftingEffortModal.jsx`. Opcional: `SeriesTrackingModal` con RPE para disciplinas de fuerza.

## Riesgos

- **Seguridad/técnica**: básicos pesados (sentadilla/peso muerto) cerca del máximo requieren técnica y seguridad; el plan debe priorizar técnica y progresión conservadora (`coachTip` + ruleset). No empujar carga si el cumplimiento técnico/RPE es malo.
- **RIR vs RPE**: el modelo es %1RM/RPE, no RIR a fallo; usar RPE en la autorregulación. Reusar el player, adaptar solo ruleset/effort.
- **Cobertura del catálogo** `disciplina='powerlifting'`: verificar suficientes ejercicios por categoría (Sentadilla/Banca/Peso Muerto/Asistencia); reusar el fallback de `calisteniaSingleDay`.
- Paralelo con las demás ramas: conflictos mínimos y aditivos en `MethodologiesScreen`/`methodologySingleDay`; mergear secuencial y rebasar.
- No romper HpV2/Calistenia/etc.: todo aditivo y por disciplina.

## Validación

- `npm run test:backend` (caso powerlifting en el test del orquestador/generador).
- Navegador: Métodos → Powerlifting → reproductor (peso+reps, reps bajas) → plan completo → calendario.

## Nota de reutilización (disciplinas de fuerza/intensidad)

Powerlifting, **Halterofilia** y **Heavy Duty** comparten el modelo "carga/intensidad" (no RIR 2‑3): conviene un **ruleset/autoreg base de fuerza** parametrizado por disciplina (Powerlifting/Halterofilia = %1RM + RPE + picos; Heavy Duty = fallo + bajo volumen). Si Halterofilia ya dejó ese patrón, Powerlifting lo reaprovecha casi idéntico (es el más cercano).
