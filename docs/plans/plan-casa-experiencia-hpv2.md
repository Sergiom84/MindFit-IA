# Plan — Llevar la experiencia "Hipertrofia" (ex‑V2) a Entrenamiento en Casa

> Plantilla: la integración de **Calistenia** ya hecha. Casa es series×reps → reutiliza `RoutineSessionModal` + RIR (como Calistenia), MENOS trabajo nuevo que CrossFit.

## Objetivo

Que **Entrenamiento en Casa** (metodología `casa`) tenga el mismo flujo que Hipertrofia/Calistenia: tarjeta → modal "hoy" → calentamiento → reproductor in‑app con RIR → autoevaluación → plan completo + calendario.

## Estado actual de "casa"

- ✅ Genera plan completo: `GymRoutineService.generateGymRoutine` con `methodology:'entrenamiento-casa'`, disciplina `casa`, `FUNCTIONAL_TEMPLATES` (Funcional/Fuerza/Cardio/Movilidad): `GymRoutineService.js:226`.
- ✅ Tarjeta + modal manual: rama `name === 'Entrenamiento en Casa'` → `casaManual` (`MethodologiesScreen.jsx:527`), generación en `:892`.
- ❌ NO está en `SINGLE_DAY_METHODOLOGIES` → sin flujo single‑day in‑app.
- ❌ No hay generador single‑day de casa.
- ⚠️ Existe una pantalla `/home-training` paralela (`src/components/HomeTraining/*`: Section, ExerciseModal, PlanModal, WarmupModal propio, Progress…) — un SEGUNDO sistema "casa" independiente del flujo de metodología, con su propio player (el viejo flujo de equipamiento). Redundancia conocida (similar al caso Hipertrofia legacy).

## La diferencia clave de "casa": equipamiento

Lo que define el entrenamiento en casa es "¿qué material tienes?" (nada / bandas / mancuernas / kettlebell / barra…). El flujo HpV2 single‑day no pregunta equipamiento; la pantalla `/home-training` sí. Por tanto la adaptación específica de casa es un **paso de selección de equipamiento** antes de generar, que filtre el catálogo `disciplina='casa'` por material disponible. El resto del reproductor (series/reps/RIR/descanso) se reutiliza igual.

## Fases

### Fase 1 — Experiencia/flujo single‑day + RIR (entregable visible)

- Backend: `generateCasaSingleDay` calcado de `calisteniaSingleDay.js` (disciplina `casa`), persistiendo vía `persistSingleDaySession`; añadir `casa` al dispatch de `methodologySingleDay.js`. Aceptar `equipment[]` y filtrar la selección por equipamiento.
- Frontend: añadir `'Entrenamiento en Casa'` a `SINGLE_DAY_METHODOLOGIES`; paso de equipamiento antes del calentamiento (reusar selector de `/home-training` si sirve, o modal ligero); reutilizar `WarmupModal` + `RoutineSessionModal` (RIR por defecto); modal "foco" → grupos de casa.
- Verificación: Métodos → Entrenamiento en Casa (finde) → equipamiento → calentamiento → reproductor con ejercicios de casa filtrados por material → RIR → guardar.

### Fase 2 — Plan completo + calendario

- `generateGymRoutine` ya produce el plan de casa; conectar el botón "plan completo" del flujo single‑day y verificar el calendario en Rutinas (formato genérico `plan_data.semanas[].sesiones[].dia`). Pasar `equipment` también a la generación del plan completo para coherencia.

### Fase 3 — Reglas/progresión (ruleset)

- Ruleset `casa_v1` en `app.mindfeed_rulesets` (idempotente, aislado): progresión por reps/tiempo/variante o material superior (banda→mancuerna→más carga), deload por volumen. Carga desde BD (patrón `loadCalisteniaRuleset`).

### Fase 4 — Autorregulación + autoeval

- Migración aditiva aislada: `casa_autoreg_state` + `casa_register_session_result(user, plan, avg_rir, target_met)` (filosofía de Calistenia). Endpoint en `methodology-session`.
- Frontend: reutilizar patrón `CalisteniaEffortModal` → `CasaEffortModal` (RIR + cumplimiento) al completar sesión.

### Fase 5 (opcional, deuda) — Consolidar `/home-training`

- Decidir si la pantalla `/home-training` legacy se absorbe en el flujo de metodología o se retira (como Hipertrofia legacy). FUERA del alcance del MVP; dejar como pendiente para no duplicar dos sistemas "casa".

## Archivos críticos

- Backend: `routes/methodologySingleDay.js` (dispatch casa), `services/singleDay/persistSingleDaySession.js` (reuso) + nuevo `casaSingleDay.js`, `services/routineGeneration/methodologies/GymRoutineService.js` (config casa, ya existe), migraciones `…_casa_ruleset.sql` y `…_casa_autoreg.sql`.
- Frontend: `MethodologiesScreen.jsx` (SINGLE_DAY_METHODOLOGIES + equipamiento + cableado), reuso de `WarmupModal`/`RoutineSessionModal`/modales generalizados, selector de equipamiento (reuso de `HomeTraining/*` si encaja), nuevo `CasaEffortModal.jsx`.

## Riesgos

- Doble sistema "casa" (`/home-training` vs metodología): no consolidar en el MVP; marcar como deuda (Fase 5).
- Equipamiento es la única pieza nueva; mantenerla simple (lista de material → filtro de catálogo). Verificar cobertura del catálogo `disciplina='casa'` por tipo de material.
- Paralelo con CrossFit/Funcional: conflictos mínimos y aditivos en `MethodologiesScreen`/`methodologySingleDay`; mergear secuencial y rebasar.
- No romper HpV2/Calistenia: todo aditivo y por disciplina.

## Validación

- `npm run test:backend` (caso casa en el test del orquestador/generador).
- Navegador: Métodos → Entrenamiento en Casa → equipamiento → reproductor con RIR → plan completo → calendario.

---

## Fase 5 — DECISIÓN (2026-06-30): dejar `/home-training` como DEUDA DOCUMENTADA

Tras completar Fases 1-4 (single-day + plan completo con equipamiento/RIR, ruleset `casa_v1` con deload y autorregulación `casa_autoreg`), se evaluó retirar/absorber la pantalla legacy `/home-training`. **Decisión: NO retirar ni tocar ahora; registrar como deuda técnica.**

### Por qué NO se retira (a diferencia de la Hipertrofia legacy)

`/home-training` **no es** redundante con el flujo de metodología casa: es un sistema maduro con capacidades que las Fases 1-4 **no cubren**:

- **Generación por IA (OpenAI)** del plan de casa: `routes/IAHomeTraining.js` / `routes/homeTraining/plans.js` (`POST /api/ia-home-training/generate`). El flujo de metodología casa es determinista (motor `GymRoutineService`/`planEngine`), no usa OpenAI.
- **Inventario real de equipamiento del usuario**: `app.user_equipment` (13 usuarios lo configuraron), `app.user_custom_equipment`, catálogo `app.equipment_catalog`/`equipment_items`, modo `usar_este_equipamiento`. El flujo de metodología casa usa un selector simple (mínimo/básico/avanzado) → filtro `equipamiento <@ allowed`.
- **Integración con Perfil > Mi equipamiento** (`EquipmentTab.jsx`), `/api/equipment`.
- **Punto de entrada primario** en `HomePage.jsx` (botón "Entrenamiento en Casa" → `/home-training`) y opción `isHomeTraining` en `StartDayConfirmationModal`.
- 12 componentes en `src/components/HomeTraining/*` + tablas `app.home_training_plans`, `home_training_sessions`, `home_exercise_history/progress/rejections`, `user_home_training_stats`.

### Evidencia de uso (BD producción, 2026-06-30)

| Tabla                      | Filas | Último   |
| -------------------------- | ----- | -------- |
| `home_training_plans`      | 10    | feb 2026 |
| `home_training_sessions`   | 1     | ene 2026 |
| `user_equipment`           | 13    | feb 2026 |
| `user_home_training_stats` | 8     | jun 2026 |

Feature mayormente **dormida** pero con datos reales (equipamiento de 13 usuarios). Retirarla sería **destructivo y una regresión**, dejando huérfanas tablas y la pestaña de equipamiento del Perfil.

### Qué requeriría una consolidación real (futuro, fuera de MVP)

1. Portar al flujo de metodología casa la **generación IA opcional** por inventario del usuario (o decidir descartarla).
2. Conectar el **inventario `user_equipment`** al filtro de equipamiento de metodología (sustituir/complementar el selector mínimo/básico/avanzado).
3. Migrar/retirar tablas `home_training_*` y reapuntar `HomePage`/`StartDayConfirmationModal` al flujo unificado.
4. Solo entonces eliminar `src/components/HomeTraining/*` y `routes/homeTraining/*`.

### Estado

Deuda registrada. No se modifica código en esta fase. Reabrir cuando se priorice unificar los dos sistemas "casa".
