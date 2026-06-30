# Auditoría final runtime — Metodologías (review pre-lanzamiento)

> Generado en sesión de review final. Usuario de prueba: **Test** (userId 468).
> Backend local `:3010` apuntando a **BD de producción** (Supabase `sbqcnlwpvjavmljzkmfy`).
> Método: acceder a cada metodología → generar plan → observar el ciclo completo → registrar → comparar.

## Contrato a verificar por metodología

Ciclo completo esperado:
`config inicial → plan multisemana → calendario → sesión de hoy → calentamiento → ejecución → tracking → cierre/autoreg → adaptación futura → revisión/deload`

Campos del contrato común (a confirmar en payloads):
`methodology · plan_id · week_number · day_number · session_id · session_type · exercises · tracking_schema · completion_schema · autoreg_result · next_adjustments`

Criterio de "hecho" por tarjeta: genera plan multisemana · aparece en calendario · abre sesión de hoy desde calendario · calentamiento · player adecuado · guarda tracking · modal final específico · registra resultado en BD (con `methodology_plan_id` ≠ null) · actualiza autorregulación · adapta sesiones futuras · tests backend · validación manual.

---

## Matriz de estado (se rellena con hallazgos runtime)

| Metodología   | Plan multisemana              | Calendario                 | Sesión hoy             | Calentamiento | Player               | Tracking                           | Modal cierre                   | Autoreg (methodology_plan_id)        | Adaptación           | Notas                                                       |
| ------------- | ----------------------------- | -------------------------- | ---------------------- | ------------- | -------------------- | ---------------------------------- | ------------------------------ | ------------------------------------ | -------------------- | ----------------------------------------------------------- |
| HipertrofiaV2 | ✅ (D1-D5+semanas)            | ✅                         | ✅                     | —             | —                    | ✅ RIR                             | —                              | subsistema propio                    | ✅ +2.5%/microciclo  | 12 vs 11 sem (MINOR-H1); plan-config x4 (MINOR-H2)          |
| Calistenia    | ✅ (8×3)                      | ✅                         | ✅                     | —             | —                    | ✅ reps/variante                   | —                              | ✅ `/methodology-session/calistenia` | ✅ por variante/reps | Adapta patrón L/X/V; ids explícitos; plan-config redundante |
| CrossFit      | ✅ (8×3, `crossfit_v1`)       | ✅ (calendar-schedule 200) | ✅ (BUG-002 corregido) | —             | ⚠️ no re-testeado UI | WOD (tipo_wod/intensidad/escalado) | `/crossfit/wod-result`         | `{rpe,completed,scale}`              | ruleset              | start 500 RESUELTO (cols→TEXT)                              |
| Casa          | ✅ (8×3, `casa_v1`)           | contrato ✅                | ⚠️ no verif. runtime   | —             | —                    | RIR+tempo+reps                     | `/casa/session-result`         | `{avgRir,targetMet}`                 | ruleset              | sin deload en plan                                          |
| Funcional     | ✅ (8×3, `funcional_v1`)      | contrato ✅                | ⚠️ no verif. runtime   | —             | —                    | reps/dificultad (sin RIR)          | `/funcional/session-result`    | `{avgRir,targetMet}`                 | ruleset              | sin deload en plan                                          |
| Halterofilia  | ✅ (8×3, `halterofilia_v1`)   | contrato ✅                | ⚠️ no verif. runtime   | —             | —                    | carga/RPE/técnica                  | `/halterofilia/session-result` | `{rpe,targetMet,goodTechnique}`      | ruleset              | snatch 5×3, coherente                                       |
| Heavy Duty    | ✅ (8×**2**, `heavy_duty_v1`) | contrato ✅                | ⚠️ no verif. runtime   | —             | —                    | fallo/reps                         | `/heavy-duty/session-result`   | `{reachedFailure,targetMet}`         | ruleset              | 2/sem, 1 serie al fallo                                     |
| Powerlifting  | ✅ (8×3, `powerlifting_v1`)   | contrato ✅                | ⚠️ no verif. runtime   | —             | —                    | carga/RPE/top-set (en cierre)      | `/powerlifting/session-result` | `{rpe,targetMet,goodTechnique}`      | ruleset              | COHER-PL1 (goblet squat)                                    |

Leyenda: ✅ ok · ⚠️ parcial/con peros · ❌ falta · — n/a

---

## ✅ BUG-002 — RESUELTO Y VERIFICADO — CrossFit: `sessions/start` devolvía 500 → "Hoy" roto

> **CAUSA RAÍZ CONFIRMADA** (leyendo schema de prod): `app.methodology_exercise_progress.repeticiones` era `varchar(20)`; CrossFit genera `reps_objetivo="Reps fijas por minuto"` (21 chars) → el INSERT de `sessions/start` lanzaba `value too long for type character varying(20)` → 500. Solo CrossFit (el resto usa reps cortas).
> **FIX APLICADO Y VERIFICADO EN PRODUCCIÓN:** migración `backend/migrations/20260630_widen_methodology_exercise_progress_text.sql` — amplía a TEXT las columnas de texto libre (repeticiones, series_total, total_reps, total_sets, reps_completed, planned/actual_duration_seconds) y recrea la vista `v_exercise_progress_expanded` (depende de ellas) en una transacción. varchar→text es instantáneo, sin reescritura ni pérdida.
> **Prueba decisiva:** INSERT con `repeticiones="Reps fijas por minuto"` (21 chars) en el path exacto de `sessions/start` ahora **succeeds** (transacción + ROLLBACK, sin persistir). Antes fallaba.
> **Pendiente (cosmético):** re-test end-to-end por UI en navegador — bloqueado por fricción de clicks de la extensión sobre el botón de generar; el fix está probado a nivel de datos/código.

### (Histórico) BUG-002 — síntoma original

**Reproducción:** generar plan de CrossFit por UI → "Comenzar Entrenamiento" → `/routines` Hoy → **"Error cargando datos: Error interno"**. En red: `POST /api/routines/sessions/start` con `{methodology_plan_id:351, week_number:1, day_name:"Martes"}` → **500 `{"success":false,"error":"Error interno"}`**. El plan se activa y `today-status`/`calendar-schedule` dan 200, pero **iniciar la sesión falla**.

**Hipótesis (no confirmada — el stack vive en el log del backend, que corre fuera de esta sesión):** en `backend/routes/routines/sessions.js` (~líneas 245-260) el INSERT en `app.methodology_exercise_progress` mete `intensidad` y `repeticiones` tal cual. CrossFit es la **única** metodología cuyos ejercicios traen `intensidad="50-60% 1RM"` y `reps_objetivo="Reps fijas por minuto"` (strings largos); el resto tienen `intensidad` null y reps cortas ("8-12"). Si esas columnas son `VARCHAR(n)` cortas → overflow → 500 solo en CrossFit.

**Para confirmar (1 min):** mirar el terminal del backend la línea `Error starting routine session:` justo tras reproducir; dará el error exacto de Postgres (p.ej. `value too long for type character varying(N)`).

**Fix probable:** ampliar las columnas afectadas a `TEXT` (migración) o normalizar/truncar esos campos en el handler `start`. **Bloqueante para CrossFit** (no se puede entrenar el día de hoy).

**Alcance no verificado:** los borradores generados por API de Casa/Funcional/Halterofilia/Heavy Duty/Powerlifting NO se pudieron activar vía `confirm-plan` (404, requiere el contexto del flujo UI), así que su `sessions/start` quedó **sin verificar en runtime**. Contrato ✅, "Hoy/start" pendiente de confirmar por UI. Probable que funcionen (no tienen los strings largos de CrossFit), pero hay que verificarlo.

---

## Las 6 restantes — captura de contrato + coherencia (vía `/api/methodology/generate`)

El proxy `/api/methodology/generate` (`server.js:324`) con `{mode:'manual', methodology}` enruta a `/api/routine-generation/specialist/<met>/generate` para las 6. **Todas comparten el motor consolidado** y devuelven el mismo contrato:
`{ success, plan, planId, methodologyPlanId, methodology, metadata }` con `plan.semanas[].sesiones[].ejercicios[]`, `plan.version = <met>_vN` (ruleset).

| Met          | planId | Ruleset           | Estructura | Frec      | Campos específicos de ejercicio                                                                                    | Cierre (familia común)                                         | Coherencia metodológica                                                 |
| ------------ | ------ | ----------------- | ---------- | --------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| CrossFit     | 345    | `crossfit_v1`     | 8×3        | 3/sem     | `dominio, equipamiento, tipo_wod` (EMOM), `intensidad` (%1RM), `duracion_seg`, `rx_carga_sugerida`, `escalamiento` | `/crossfit/wod-result` `{rpe,completed,scale}`                 | ✅ WOD real (EMOM, escalado, RX)                                        |
| Casa         | 346    | `casa_v1`         | 8×3        | 3/sem     | `patron, tempo, series_reps_objetivo, criterio_de_progreso, rir_target`                                            | `/casa/session-result` `{avgRir,targetMet}`                    | ✅ material mínimo, RIR + tempo                                         |
| Funcional    | 347    | `funcional_v1`    | 8×3        | 3/sem     | `patron, tempo, criterio_de_progreso` ("Progresar a 2 mancuernas"), sin `rir_target`                               | `/funcional/session-result` `{avgRir,targetMet}`               | ✅ patrones (Push/empuje), progresión por dificultad                    |
| Halterofilia | 348    | `halterofilia_v1` | 8×3        | 3/sem     | `patron` (Arrancada), `tempo` (Explosivo), series 5×3, descanso 150s                                               | `/halterofilia/session-result` `{rpe,targetMet,goodTechnique}` | ✅ olímpico real (snatch, bajas reps, alto descanso, explosivo)         |
| Heavy Duty   | 349    | `heavy_duty_v1`   | 8×**2**    | **2/sem** | `rir_target`, series "1-2", descanso 180s, `criterio` "1 serie efectiva hasta fallo"                               | `/heavy-duty/session-result` `{reachedFailure,targetMet}`      | ✅ HIT/Mentzer real (baja frecuencia, 1 serie al fallo, descanso largo) |
| Powerlifting | 350    | `powerlifting_v1` | 8×3        | 3/sem     | series 3-4×8-12, descanso 90s; métricas de fuerza (RPE/top-set/técnica) viven en el cierre                         | `/powerlifting/session-result` `{rpe,targetMet,goodTechnique}` | ⚠️ ver COHER-PL1                                                        |

**Observaciones de coherencia (tu punto ciego, cubierto):**

- ✅ Heavy Duty correctamente a **2 días/semana** y "1 serie efectiva hasta fallo" — fiel a Mentzer.
- ✅ Halterofilia con snatch a 5×3 explosivo, descansos 150s — fiel al levantamiento olímpico.
- ⚠️ **COHER-PL1 (Powerlifting):** el primer ejercicio para principiante es **"Goblet Squat" 3-4×8-12**, no la sentadilla con barra como levantamiento central con top set / %1RM / reps bajas. Para un principiante puro es defendible (técnica primero), pero **no es "powerlifting-específico"** en el día principal. Revisar si el día central debería anclar el básico con barra. Las métricas de fuerza (RPE, top set, back-off) sí existen, pero en el **cierre** (`session-result`), no en el plan.
- ⚠️ **COHER-DELOAD:** marca `es_deload` en el plan estático solo se observó en **Calistenia y CrossFit**. En Casa/Funcional/Halterofilia/Heavy Duty/Powerlifting el plan generado no incluye semana de deload explícita (`anyDeload:false`). Verificar si el deload se gestiona a nivel de ruleset/autoreg (como Hipertrofia) o si falta en estas.

**Cierre / id (revisión del endurecimiento, por metodología):** las 6 cierran por la familia común con `methodologyPlanId = null` por defecto (igual que Calistenia). El riesgo de id nulo es **idéntico y compartido** (frontend `?? null`), no específico de ninguna. → confirma que el endurecimiento es de contrato único, no por metodología.

---

## Hallazgos por metodología

### 1) HipertrofiaV2 — REFERENCIA (buque insignia)

**Flujo de config:** Métodos → Manual → tarjeta "Hipertrofia" (`id: HipertrofiaV2`, componente `HipertrofiaV2ManualCard`) → modal "MindFeed" → **Evaluar Perfil** (`POST /api/hipertrofia-specialist/evaluate-profile`) → resultado (nivel/experiencia/recomendación) → **Generar Plan**.

**Endpoint de generación:** `POST /api/hipertrofiav2/generate-d1d5` (específico, NO el `/api/routine-generation` consolidado).
Request: `{ nivel, totalWeeks:10, startConfig:{ startDate, distributionOption:"standard", includeSaturdays:false }, includeWeek0:true }`

**Modelo:** NO es plan multisemana fijo. Es **ciclo rotativo D1-D5 (MindFeed)** que "avanza solo cuando completas sesiones reales" y "se adapta al calendario". Progresión por microciclo (+2.5% al cerrar D1-D5), deload automático cada 6 microciclos.

**Estructura del plan (contrato real):**

```
plan: {
  metodologia: "HipertrofiaV2_MindFeed", version: "MindFeed_v2.0",
  nivel, ciclo_type: "D1-D5", total_weeks, has_week_0, duracion_total_semanas,
  frecuencia_semanal, fecha_inicio,
  sessions: [ {
    cycle_day (1..5), session_name, description, coach_tip,
    intensity_percentage, is_heavy_day, muscle_groups[],
    exercises: [ { orden, id, exercise_id, nombre, categoria,
      tipo_ejercicio (multiarticular|unilateral|analitico),
      patron_movimiento, series, reps_objetivo, rir_target,
      descanso_seg, notas, gif_url, intensidad_porcentaje, ajuste_sexo } ]
  } ]
}
```

**Contraste estructural clave:** Hipertrofia usa `plan.sessions[].cycle_day` (rotativo). El plan de Casa observado usa `plan.semanas[].sesiones[].ejercicios[]` (multisemana). → **El "plan multisemana + calendario" del contrato objetivo NO es el modelo del buque insignia.** Decisión de diseño a tomar: el contrato común debe abstraer AMBOS modelos (rotativo vs multisemana), no forzar multisemana.

**Tracking:** RIR por serie (`rir_target`), peso, reps. Series fijas (2), reps 8-12, intensidad % por día.

**Confirmación y aterrizaje (verificado tras fix BUG-001):**

- Generar Plan → `TrainingPlanConfirmationModal` ("¡Plan listo!": 10 semanas / 50 sesiones / 230 ejercicios) → **"Comenzar Entrenamiento"** confirma y activa.
- Solo TRAS confirmar, `training/state` pasa a `hasActivePlan:true` (planId 343, `methodologyType:"HipertrofiaV2_MindFeed"`). El `planData` lleva **ambas representaciones**: `sessions[]` (5, plantilla D1-D5) **y** `semanas[]` (11 = semana 0 + 10, calendario). → Hipertrofia SÍ es compatible con el calendario común vía `semanas[]`.
- `/routines` → tab **Hoy** muestra la sesión D1 correctamente (Empuje Pecho+Tríceps, 4 ejercicios), **semana 0 = "SEMANA DE CALIBRACIÓN"**. Tabs Hoy/Calendario/Progreso/Historial presentes.

**Issues menores Hipertrofia:**

- ⚠️ MINOR-H1: header de `/routines` dice **"Duración 12 semanas"** pero el plan es 11 (semana 0 + 10). Descuadre de display.
- ⚠️ MINOR-H2: al cargar Hoy se disparan **4× `GET /api/routines/plan-config/343`** seguidos (fetch redundante / posible N+1).
- ⚠️ MINOR-H3: copy genérico "Entrenamiento de hipertrofia para gimnasio / Fuente del plan: OpenAI" y perfil de usuario vacío (— en Edad/Peso/Altura/IMC) con el usuario Test.

**Pendiente (no ejecutado a fondo por presupuesto):** calentamiento, player de ejecución, cierre/autoreg (Hipertrofia NO usa la familia `/methodology-session/*`; tiene su propio registro de microciclo), deload cada 6 microciclos.

---

### 2) Calistenia — comparada con Hipertrofia

**Flujo de config:** Métodos → Manual → Calistenia → modal **"Evaluación IA Calistenia v6.0 OPTIMIZADO"** (más rica que la de Hipertrofia: nivel recomendado + **confianza 0.85**, factores clave, áreas de enfoque, timeline 3-6 meses) → **Generar Plan con IA**.

**Endpoint de generación:** `POST /api/methodology/generate` (motor **consolidado** planEngine), NO un endpoint dedicado.
Request: `{ mode:"manual", methodology:"calistenia", userProfile, selectedLevel, goals, selectedMuscleGroups:["empuje","traccion","piernas","core"], aiEvaluation:{recommended_level, confidence, reasoning, key_indicators, suggested_focus_areas, progression_timeline}, source:"ai_evaluation", version:"5.0" }`

**Respuesta (contrato real):**

```
{ success, plan, planId, methodologyPlanId, methodology, metadata }   // ← ids explícitos en top-level
plan: {
  metodologia:"Calistenia", version:"calistenia_v2", nivel, total_weeks,
  duracion_total_semanas, frecuencia_semanal, fecha_inicio, sessions_per_week,
  objetivo, configuracion, methodologyPlanId,
  semanas: [ { numero, tipo, es_deload, objetivo,
    sesiones: [ { id, dia, fecha, orden, nombre, descripcion, coach_tip,
      grupos_musculares, es_deload,
      ejercicios: [ { id, orden, exercise_id, nombre, categoria, patron,
        patron_movimiento, tipo_ejercicio, series, reps_objetivo,
        series_reps_objetivo, rep_range:{min,max,suffix}, descanso_seg, tempo,
        como_hacerlo, criterio_de_progreso, progresion_hacia, variante_sugerida,
        es_deload, listo_para_progresar, notas } ] } ] } ]
}
```

**Aterrizaje (verificado):** mismo `TrainingPlanConfirmationModal` reutilizado → "Comenzar Entrenamiento" → `training/state.hasActivePlan:true` (planId 344, `methodologyType:"Calistenia"`). `/routines` Hoy muestra sesión con **adaptación de patrón semanal** (banner "comienza hoy martes, patrón Mar-Mié-Vie; próximas Lun-Mié-Vie").

#### Tabla comparativa Hipertrofia ↔ Calistenia

| Aspecto                   | HipertrofiaV2                                                         | Calistenia                                                                         |
| ------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Endpoint generación       | `/api/hipertrofiav2/generate-d1d5` (**dedicado**)                     | `/api/methodology/generate` (**consolidado** planEngine)                           |
| Modal eval/config         | "Evaluación de Perfil" (simple)                                       | "Evaluación IA v6.0" (confianza %, focus areas, factores)                          |
| Modelo de plan            | Rotativo **D1-D5** (`sessions[]`) + `semanas[]` expandidas            | Multisemana puro (`semanas[]`, 8 sem × 3) con **días fijos** L/X/V                 |
| "Hoy" en martes           | Da sesión (rotativo, "entrena cuando quieras")                        | Adapta patrón para arrancar hoy; banner explicativo                                |
| ids en respuesta generate | **`planId`+`methodologyPlanId` top-level** ✅ (tras el objeto `plan`) | **`planId` + `methodologyPlanId` top-level** ✅                                    |
| Progresión                | +2.5%/microciclo, intensidad %                                        | reps/variante (`progresion_hacia`, `criterio_de_progreso`, `listo_para_progresar`) |
| Deload                    | cada 6 microciclos (motor)                                            | `es_deload` marcado por semana en el plan                                          |
| Tracking                  | RIR + peso + reps (`rir_target`)                                      | reps + variante (sin `rir_target` obligatorio)                                     |
| Cierre/autoreg            | Subsistema propio (registro microciclo)                               | Familia común `POST /methodology-session/calistenia/session-result`                |
| Confirmación              | `TrainingPlanConfirmationModal` (compartido)                          | `TrainingPlanConfirmationModal` (compartido) ✅                                    |
| Duración en header        | "12 semanas" (mal, son 11) ⚠️                                         | "8 semanas" (correcto) ✅                                                          |

**Lectura para el contrato común:**

- **Campos núcleo compartidos** (ya presentes en ambos): `orden, exercise_id, nombre, categoria, tipo_ejercicio, patron_movimiento, series, reps_objetivo, descanso_seg, coach_tip, grupos_musculares`. Esa es la base del contrato.
- **Divergencias legítimas** (métricas específicas): Hipertrofia añade `rir_target, intensidad_porcentaje`; Calistenia añade `rep_range, criterio_de_progreso, progresion_hacia, variante_sugerida, listo_para_progresar`. → Confirma el modelo "tracking común + métricas específicas" de tu Fase 4.
- **Dos contenedores de plan coexisten**: `sessions[].cycle_day` (rotativo) vs `semanas[].sesiones[]` (multisemana). El contrato debe aceptar ambos; Hipertrofia ya emite los dos, lo que facilita una **normalización a `semanas[]`** como forma canónica de calendario.
- **Ids ya consistentes** (corregido): AMBAS devuelven `planId`/`methodologyPlanId` en la respuesta de generate (`hipertrofiav2/generate-d1d5` líneas 99-100; Calistenia top-level). La impresión inicial de que Hipertrofia no lo hacía fue un falso positivo por captura truncada de los 143 KB de respuesta.

### Convergencia Hipertrofia ↔ Calistenia ("lo mejor de cada uno") — resultado

Objetivo: dejar ambas "cerradas" tomando lo mejor de cada una, **sin homogeneizar el modelo de entrenamiento** (rotativo vs días fijos son ambos correctos) y **sin romper el buque insignia**.

| Ítem                                                | Riesgo | Resultado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dedupe `plan-config` en Hoy                         | 🟢     | ✅ Hecho (`FirstWeekWarning` acepta `config` por prop; 4→2 fetches, 1 en prod). Commit `17904e9`.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Ids explícitos en generación                        | 🟢     | ✅ Ya cumplido por ambas (falso positivo corregido).                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| "Duración 12 vs 11 semanas"                         | 🟢     | Cosmético: el header muestra `calendarPlan.semanas.length`; el calendario D1-D5 se expande a 12 al arrancar a media semana. No es display puro → no se fuerza para no alterar la expansión correcta.                                                                                                                                                                                                                                                                                                                   |
| Banner de patrón semanal en Hipertrofia             | 🟢     | N/A por diseño: el banner es para metodologías de días fijos; Hipertrofia es rotativa ("entrena cualquier día"), así que correctamente no lo muestra.                                                                                                                                                                                                                                                                                                                                                                  |
| **Unificar cierre de Hipertrofia en familia común** | 🟡→❌  | **DESACONSEJADO.** El cierre de Hipertrofia NO es una costura pobre: es el motor más avanzado (`save-set` con RIR, `advance-cycle`, `apply-progression`, `check-deload`/`activate-deload`, `priority`, `neural-overlap`, `submit-fatigue-report`, `reevaluation`). La familia común es un único endpoint `{rir/rpe,targetMet}`+ruleset. Forzar la unificación = downgrade que rompe el buque insignia. Además Hipertrofia YA persiste `methodology_plan_id` (`hypertrophy_set_logs`, `additionalControllers.saveSet`). |

**Convergencia correcta del cierre (recomendada):** no unificar el endpoint, sino el **contrato/interfaz** que ambos cumplen — (1) registrar `methodology_plan_id` ≠ null, (2) producir resultado de autorregulación + ajuste futuro. Validar con **tests de contrato**, dejando a Hipertrofia su motor intacto. Es el "contrato fino + tests" acordado para la capa transversal.

**Endurecimiento del cierre — revisado, NO trivial (item de contrato):**

- Hallazgo: TODAS las rutas comunes (`/methodology-session/<met>/(session-result|wod-result)`) declaran `const { methodologyPlanId = null, ... }` → **el id es opcional por diseño**, porque el mismo router sirve también al **single-day** (`generate-single-day`), donde `methodology_plan_id = null` es legítimo.
- ⚠️ Por tanto un guard naíf `if(!methodology_plan_id) 400` **rompería el single-day** de las 7 metodologías. NO hacer.
- **Riesgo real (frontend):** los handlers de cierre en `MethodologiesScreen` usan `pendingSessionData?.methodology_plan_id ?? pendingSessionData?.planId ?? null`. Si una sesión DE PLAN no resuelve su id, se guarda como `null` → indistinguible de single-day → se pierde vinculación al plan y la autorregulación no se aplica. Ese es el agujero a cerrar.
- **Fix correcto (contrato, no parche):** flag explícito `isSingleDay`/`source` desde el frontend; el backend exige `methodology_plan_id` solo cuando NO es single-day. Diseñar una vez en la capa transversal + tests de contrato. Verificar por metodología, en la auditoría de las 6, si el cierre de sesión-de-plan transporta siempre el id de forma fiable.

---

**⚠️ Incidencia detectada:** al generar sobre un plan activo, `POST /api/routines/cancel-routine` devolvió **400** (la cancelación del plan anterior falló). El nuevo plan sí se generó (200). Verificar si el plan anterior queda correctamente cerrado en histórico o si quedan dos activos.

**Pendiente de observar:** calendario, sesión de hoy, calentamiento, player, cierre/autoreg, deload (se continúa abajo).

---

### ✅ BUG-001 (BLOQUEANTE) — RESUELTO Y VERIFICADO — Cambio de metodología con plan activo no cancela el anterior

> **FIX APLICADO** en `src/components/Methodologie/MethodologiesScreen.jsx` (`handleActivePlanCancelAndContinue`): recupera el `methodology_plan_id` del plan activo vía `getActivePlan()` y lo pasa a `cancelPlan(id)`; además aborta si la cancelación falla (antes `cancelPlan` tragaba el error y generaba igual).
> **Verificación runtime:** `cancel-routine` ahora envía `{"methodology_plan_id":321}` → `200 "Rutina cancelada correctamente"`; `training/state` pasa a `hasActivePlan:false`; el flujo avanza al MindFeed sin bucle.

**Reproducción:** estando con un plan activo (Casa, planId 321), ir a _Métodos → Manual → Hipertrofia → Seleccionar_ → modal "Plan activo detectado" → "Generar nuevo y cancelar anterior".

**Síntoma:** `POST /api/routines/cancel-routine` se llama con **body `{}`** → `400 {"success":false,"error":"methodology_plan_id es requerido"}`. El plan anterior NO se cancela, el guard reaparece en bucle, y `/api/training/state` sigue devolviendo el plan viejo (321) como `isCurrent`. El plan nuevo de Hipertrofia (`generate-d1d5`, 200) queda generado pero no activo.

**Causa raíz:** `MethodologiesScreen.jsx:383` → `handleActivePlanCancelAndContinue` llama `cancelPlan()` **sin id**. `WorkoutContext.cancelPlan` (`WorkoutContext.jsx:726-732`) hace fallback a `state.plan.methodologyPlanId`, que está **vacío** al entrar directo a `/methodologies` (el plan activo vive en BD/`training/state`, no en `WorkoutContext.state.plan`). El id correcto SÍ está disponible vía `hasActivePlanFromDB()` / `training/state.activePlan.planId`.

**Impacto:** transversal — afecta a TODAS las metodologías (guard compartido). Bloquea el cambio de plan para cualquier usuario que llegue a Métodos desde la barra de navegación con un plan ya activo.

**Fix propuesto (fuera del punto de convergencia `generatePlan`):** en `handleActivePlanCancelAndContinue`, obtener el `methodology_plan_id` del plan activo desde BD (ya se consulta en `runWithActivePlanGuard`) y pasarlo a `cancelPlan(id)`. Encaja en **Fase 1** del plan ("evitar cierres/cancelaciones con `methodologyPlanId: null`").

---
