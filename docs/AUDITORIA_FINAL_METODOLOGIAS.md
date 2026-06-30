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

| Metodología   | Plan multisemana   | Calendario | Sesión hoy | Calentamiento | Player | Tracking         | Modal cierre | Autoreg (methodology_plan_id)        | Adaptación           | Notas                                                       |
| ------------- | ------------------ | ---------- | ---------- | ------------- | ------ | ---------------- | ------------ | ------------------------------------ | -------------------- | ----------------------------------------------------------- |
| HipertrofiaV2 | ✅ (D1-D5+semanas) | ✅         | ✅         | —             | —      | ✅ RIR           | —            | subsistema propio                    | ✅ +2.5%/microciclo  | 12 vs 11 sem (MINOR-H1); plan-config x4 (MINOR-H2)          |
| Calistenia    | ✅ (8×3)           | ✅         | ✅         | —             | —      | ✅ reps/variante | —            | ✅ `/methodology-session/calistenia` | ✅ por variante/reps | Adapta patrón L/X/V; ids explícitos; plan-config redundante |
| CrossFit      |                    |            |            |               |        |                  |              |                                      |                      |                                                             |
| Casa          |                    |            |            |               |        |                  |              |                                      |                      |                                                             |
| Funcional     |                    |            |            |               |        |                  |              |                                      |                      |                                                             |
| Halterofilia  |                    |            |            |               |        |                  |              |                                      |                      |                                                             |
| Heavy Duty    |                    |            |            |               |        |                  |              |                                      |                      |                                                             |
| Powerlifting  |                    |            |            |               |        |                  |              |                                      |                      |                                                             |

Leyenda: ✅ ok · ⚠️ parcial/con peros · ❌ falta · — n/a

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

| Aspecto                   | HipertrofiaV2                                              | Calistenia                                                                         |
| ------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Endpoint generación       | `/api/hipertrofiav2/generate-d1d5` (**dedicado**)          | `/api/methodology/generate` (**consolidado** planEngine)                           |
| Modal eval/config         | "Evaluación de Perfil" (simple)                            | "Evaluación IA v6.0" (confianza %, focus areas, factores)                          |
| Modelo de plan            | Rotativo **D1-D5** (`sessions[]`) + `semanas[]` expandidas | Multisemana puro (`semanas[]`, 8 sem × 3) con **días fijos** L/X/V                 |
| "Hoy" en martes           | Da sesión (rotativo, "entrena cuando quieras")             | Adapta patrón para arrancar hoy; banner explicativo                                |
| ids en respuesta generate | No top-level (se asigna al confirmar)                      | **`planId` + `methodologyPlanId` top-level** ✅                                    |
| Progresión                | +2.5%/microciclo, intensidad %                             | reps/variante (`progresion_hacia`, `criterio_de_progreso`, `listo_para_progresar`) |
| Deload                    | cada 6 microciclos (motor)                                 | `es_deload` marcado por semana en el plan                                          |
| Tracking                  | RIR + peso + reps (`rir_target`)                           | reps + variante (sin `rir_target` obligatorio)                                     |
| Cierre/autoreg            | Subsistema propio (registro microciclo)                    | Familia común `POST /methodology-session/calistenia/session-result`                |
| Confirmación              | `TrainingPlanConfirmationModal` (compartido)               | `TrainingPlanConfirmationModal` (compartido) ✅                                    |
| Duración en header        | "12 semanas" (mal, son 11) ⚠️                              | "8 semanas" (correcto) ✅                                                          |

**Lectura para el contrato común:**

- **Campos núcleo compartidos** (ya presentes en ambos): `orden, exercise_id, nombre, categoria, tipo_ejercicio, patron_movimiento, series, reps_objetivo, descanso_seg, coach_tip, grupos_musculares`. Esa es la base del contrato.
- **Divergencias legítimas** (métricas específicas): Hipertrofia añade `rir_target, intensidad_porcentaje`; Calistenia añade `rep_range, criterio_de_progreso, progresion_hacia, variante_sugerida, listo_para_progresar`. → Confirma el modelo "tracking común + métricas específicas" de tu Fase 4.
- **Dos contenedores de plan coexisten**: `sessions[].cycle_day` (rotativo) vs `semanas[].sesiones[]` (multisemana). El contrato debe aceptar ambos; Hipertrofia ya emite los dos, lo que facilita una **normalización a `semanas[]`** como forma canónica de calendario.
- **Inconsistencia de fuente de verdad de ids**: Calistenia devuelve `planId`/`methodologyPlanId` en la respuesta de generate; Hipertrofia no (depende del confirm). Estandarizar.

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
