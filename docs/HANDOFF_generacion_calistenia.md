# HANDOFF — Implementar generación de planes (Calistenia y demás metodologías)

> Documento autónomo para una conversación nueva. Contiene el diagnóstico, el contrato exacto, el sistema de referencia y el plan de implementación.

## 1. Objetivo

Implementar la **generación real de planes de entrenamiento** para Calistenia (y, con el mismo patrón, CrossFit y gimnasio/funcional). Hoy devuelven un placeholder y el frontend muestra "No se recibió un plan válido del servidor".

## 2. Causa raíz (confirmada)

Los generadores del "sistema consolidado" `routineGeneration` son **stubs sin implementar**:

- `backend/services/routineGeneration/methodologies/CalisteniaService.js` → `generateCalisteniaPlan()` (línea ~163) devuelve `{ success:true, message:'Pendiente de implementación completa', planData }` (sin `plan`).
- Igual en `CrossFitService.generateCrossFitPlan()` y `GymRoutineService.generateGymRoutine()`.
- `evaluateCalisteniaLevel()` SÍ funciona (devuelve nivel + confianza con IA). Solo falta la **generación del plan**.

## 3. El sistema que SÍ funciona y hay que imitar: **HipertrofiaV2**

Es el más avanzado y el único que genera planes reales. NO usa el orquestador stub; tiene ruta propia:

- Ruta: `app.use('/api/hipertrofiav2', hipertrofiaV2Routes)` en `backend/server.js:435`.
- Proxy manual: `server.js` ~341 mapea `methodology==='hipertrofiav2'` → `/api/hipertrofiav2/generate`.
- Entry de generación: `backend/services/hipertrofiaV2/planGenerationService.js` → `generateD1D5Plan(dbClient, config)`.
- Selección de ejercicios: `backend/services/hipertrofiaV2/exerciseSelector.js` (consulta `app.ejercicios` con `disciplina='hipertrofia'`).
- Otros: `sqlControllers.js`, `adaptation/fullBodyGenerator.js`, `adaptation/halfBodyGenerator.js`, `menstrualExerciseFilter.js`.

**Estrategia recomendada:** mirar `generateD1D5Plan` y replicar el patrón para calistenia (seleccionar ejercicios de `app.ejercicios` disciplina='calistenia', estructurar semanas/sesiones, opcionalmente refinar con IA usando `backend/prompts/calistenia.md`).

## 4. Cadena de routing actual (Calistenia manual)

```
Frontend MethodologiesScreen → WorkoutContext.generatePlan({mode:'manual', methodology:'calistenia', calisteniaData})
  → POST /api/methodology/generate
  → proxy server.js (~332, "Calistenia manual detectada") → req.url = /api/routine-generation/specialist/calistenia/generate
  → backend/routes/routineGeneration.js:71  router.post('/specialist/:methodology/generate')
  → generateMethodologyPlan(methodology, userId, planData)  [MethodologyOrchestrator.js]
  → switch CALISTENIA → CalisteniaService.generateCalisteniaPlan(userId, planData)  ← STUB a implementar
  → res.json(result)
```

Opción A: implementar `generateCalisteniaPlan` dentro de esta cadena.
Opción B (como HipertrofiaV2): darle ruta propia y cambiar el proxy de `server.js` para calistenia.

## 5. Contrato EXACTO que espera el frontend

`src/contexts/WorkoutContext.jsx` → `generatePlan` (≈línea 558-655). La respuesta del backend DEBE ser:

```json
{
  "success": true,
  "plan": {
    "semanas": [
      { "sesiones": [ { "ejercicios": [ { ... } ] } ] }
    ],
    "methodologyPlanId": <id>
  },
  "planId": <id>,
  "methodology": "calistenia",
  "metadata": { "plan_start_date": "YYYY-MM-DD", "processing_time_seconds": <n> }
}
```

Validación (`src/components/Methodologie/hooks/useMethodologyValidation.js` → `validatePlanData`):

- `result.success === true` y `result.plan` definido (si no → "No se recibió un plan válido del servidor").
- `plan.semanas` array no vacío.
- al menos una `semana.sesiones` con elementos.
- al menos una `sesion.ejercicios` (o `sesion.bloques[].ejercicios`) con elementos.

## 6. Estructura real de `plan_data` (sacada de un plan HipertrofiaV2 en BD)

```
plan_data: { nivel, semanas[], version, sessions, ciclo_type, has_week_0, metodologia,
             total_weeks, fecha_inicio, configuracion, frecuencia_semanal, duracion_total_semanas }
semana:    { tipo, numero, objetivo, sesiones[], descripcion, is_week_zero, no_progression }
sesion:    { id, dia, fecha, orden, nombre, ciclo_dia, coach_tip, ejercicios[], descripcion,
             es_dia_pesado, es_calibracion, grupos_musculares, intensidad_porcentaje }
ejercicio: { id, orden, nombre, series, reps_objetivo, descanso_seg, categoria, notas,
             exercise_id, tipo_ejercicio, patron_movimiento, rir_target, intensidad_porcentaje, ajuste_sexo }
```

Para calistenia, los campos RIR/intensidad pueden omitirse; usar `series_reps_objetivo`, `nombre`, `categoria`, `patron`, `descanso_seg`, `como_hacerlo` de `app.ejercicios`.

## 7. Fuente de datos de ejercicios: `app.ejercicios` (tabla unificada)

- Calistenia tiene **65 ejercicios** (`disciplina='calistenia'`). Niveles reales: `Principiante`, `Intermedio`, `Avanzado`.
- Columnas: `id, disciplina, source_exercise_id, slug, nombre, nivel, categoria, patron, equipamiento (text[]), series_reps_objetivo, descanso_seg, tempo, criterio_de_progreso, progresion_desde, progresion_hacia, notas, como_hacerlo, consejos, errores_comunes, extra (jsonb)` + columnas de hipertrofia (`tipo_ejercicio, patron_movimiento, orden_recomendado, menstrual_*`).
- Repositorio central ya disponible: `backend/services/exerciseRepository.js` → `getRandomByLevel(client,{disciplina,level,limit})`, `findBySourceId`, `findByIdOrSlug`, `countByDiscipline`, `allowedLevels`, `EXERCISE_COLUMNS`. **Úsalo** en vez de SQL nuevo.
- ⚠️ Las 7 tablas antiguas `Ejercicios_*` (familia A) se BORRARON; `app.ejercicios` es la única fuente. Siguen vivas: `Ejercicios_CrossFit`, `Ejercicios_Bomberos`, `Ejercicios_Guardia_Civil`, `Ejercicios_Policia_Local`.

## 8. Plan de implementación sugerido

1. Leer `backend/services/hipertrofiaV2/planGenerationService.js::generateD1D5Plan` y `exerciseSelector.js` como referencia.
2. Implementar `generateCalisteniaPlan(userId, planData)`:
   - Leer perfil del usuario (`getUserFullProfile`) y el nivel del `planData` (viene `selectedLevel` y `aiEvaluation`).
   - Seleccionar ejercicios de calistenia con `exerciseRepository` por nivel/categoría/patrón (frecuencia 4-6 días según `getCalisteniaLevels()` ya definido en CalisteniaService).
   - Construir `semanas[].sesiones[].ejercicios[]` con la forma del punto 6.
   - Persistir en `app.methodology_plans` (plan_data jsonb) y crear `workout_schedule` si aplica (mirar cómo lo hace HipertrofiaV2 / `ensureWorkoutScheduleV3`).
   - Devolver el contrato del punto 5 (`{success, plan, planId, methodology, metadata}`).
3. (Opcional) Refinar selección/orden con IA usando `backend/prompts/calistenia.md` + `getModuleOpenAI`/`parseAIResponse` (ver `aiResponseParser.js`).
4. Repetir patrón para CrossFit (datos en `Ejercicios_CrossFit`) y gimnasio.

## 9. Cómo probarlo (app ya levantada en esta sesión)

- Backend: `cd backend && node server.js` (puerto 3010, lee `backend/.env` → BD nueva). Frontend: `npm run dev` (5173).
- **Usuario de prueba:** `prueba@entrenaconia.test` / `Prueba1234!` (id 468). ⚠️ Perfil casi vacío — quizá conviene completarlo (edad/peso/altura/experiencia) o crear otro con perfil completo para que la generación tenga datos.
- Flujo UI: login → `/methodologies` → radio **Manual** → **Seleccionar** Calistenia → "Empezar MAÑANA" → **Continuar** → Evaluación IA (funciona) → **"Generar Plan con IA"**.
- Log backend a vigilar: `POST /api/methodology/generate` → `🤸 Calistenia manual detectada` → `🏗️ Generando plan de calistenia`. Hoy termina sin devolver `plan`.

## 10. Infra / contexto importante

- **BD producción NUEVA:** Supabase `sbqcnlwpvjavmljzkmfy` (eu-west-1). `backend/.env` ya apunta ahí (`DATABASE_URL`). `search_path = app,public`. ~14 usuarios reales + el de prueba.
- **OpenAI:** key ya configurada en `backend/.env` (`OPENAI_API_KEY`, `OPENAI_API_KEY_NUTRITION`), tomada de `jul-IA/.env.local`. Validada al arranque ("✅ Todas las API keys configuradas correctamente").
- El frontend NO usa cliente Supabase, solo el backend API (`VITE_API_URL=http://localhost:3010`).
- Tablas de ejercicios unificadas en `app.ejercicios` (migraciones `backend/migrations/unify_exercise_tables_phase1*.sql`).
