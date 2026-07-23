# Calistenia · Roadmap de implementación (revisión de arquitecto)

**Fecha:** 2026-07-22
**Autor:** arquitecto (Claude, sesión de Sergio)
**Ejecutor previsto:** Opus 4.8 (subagentes, revisión por el arquitecto antes de merge)
**Base verificada:** `origin/main@3e09559` (¡OJO! el roadmap original del compañero se escribió sobre `e7f5711`, dos commits por detrás del rename HipertrofiaV2→Hipertrofia del PR #62)
**Método:** auditoría directa del código con 4 pasadas (generador, rutas de sesión, autorregulación/contratos, frontend). Todas las afirmaciones de este documento tienen evidencia `fichero:línea` verificada hoy.

---

## 0. Cómo usar este documento

Este documento SUSTITUYE el orden y alcance del `06_ROADMAP_IMPLEMENTACION_DETALLADA_CALISTENIA.md` del compañero, y CONSERVA sus límites no negociables (§3 de aquel doc) y sus contratos (docs 02, 04 y 05) salvo donde este documento diga otra cosa explícitamente. Ante contradicción entre ambos roadmaps, manda este.

Reglas para el ejecutor (Opus):

1. Rama nueva desde `origin/main` vigente; registrar SHA en el PR. NUNCA push sin aprobación del arquitecto.
2. Un PR = una responsabilidad. No mezclar fix quirúrgico con refactor ni con migración.
3. Antes de tocar un fichero citado aquí, releerlo: main puede haber avanzado.
4. Cada afirmación "esto falla" de este doc tiene un test rojo asociado en PR-CAL-00; si al implementarlo el test ya está verde, parar y avisar (alguien lo arregló antes).
5. Toda migración nueva: aditiva, con fecha `YYYYMMDD_` en el nombre, REVOKE FROM PUBLIC si crea funciones (gotcha permanente del proyecto), y requiere autorización expresa de Sergio antes de aplicarla a prod.

Límites heredados que siguen vigentes: no tocar Hipertrofia; no crear catálogo/calendario/motor nutricional paralelo; `emits_training_load:false` para calistenia hasta PR-CAL-08; flags de nutrición/outbox en default seguro; no editar migraciones históricas; no E2E contra producción.

**Matiz sobre `WorkoutContext.generatePlan()`:** el roadmap original decía "no modificar". El código real muestra que `generatePlan` NO es agnóstico: tiene un branch específico de calistenia (`src/contexts/WorkoutContext.jsx:196-211`) que descarta datos y mete `selectedLevel:'basico'` como default (L205, un id que ni siquiera existe en `CalisteniaLevels`). Resolución de arquitecto: **se permite modificar el interior del branch de calistenia** (payload que envía) siempre que NO cambien la firma de `generatePlan`, el flujo de las demás metodologías ni el branch de Hipertrofia (L157-190). Cualquier otra edición de ese fichero sigue prohibida.

---

## 1. Estado real verificado (qué existe, qué falla)

### 1.1 Lo que YA existe y funciona (no rehacer)

| Pieza                         | Evidencia                                                                                                                                                                                                          | Estado                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Generador real multi-semana   | `CalisteniaService.js:415+` — pool desde `app.ejercicios` vía `exerciseRepository.getRandomByLevel`, filtro de lesiones, deload, persistencia draft en `app.methodology_plans`                                     | Operativo. Es fachada + política embebida, no stub                                                         |
| Ruleset en BD con fallback    | `loadCalisteniaRuleset` (`CalisteniaService.js:288-309`) lee `app.get_active_mindfeed_ruleset('calistenia_v2')`; fallback 75/6/0.5 con warn                                                                        | Operativo. OJO: la BD contiene los MISMOS valores que el hardcode; `progression.model` de BD no se consume |
| Filtro de lesiones compartido | `injuryContraindications.js` — 6 zonas, capas avoid/caution, consumido por Calistenia multi-semana, CrossFit, Gym, Oposiciones, Hipertrofia                                                                        | Operativo en multi-semana. **NO en single-day** (ver 1.2)                                                  |
| Autorregulación calistenia    | `progression/planAutoregService.js:49` — `REP_BASED_KEYS` incluye calistenia; decisión progress/hold/deload vía `app.calistenia_register_session_result`; offsets en `app.plan_progression_offsets` (PK user+plan) | Operativo pero con 0 tests y estado de rachas por-usuario (ver 1.2)                                        |
| Contrato de carga             | `trainingLoad/trainingLoadContract.js` — valida niveles contra `methodologyRegistry.descriptor.levels`, strict/lenient, alias `basico→principiante`                                                                | Operativo. No valida demand/recovery/reason codes todavía                                                  |
| Registry canónico             | `methodologyRegistry.js:60-73` — descriptor calistenia con 3 niveles, `emits_training_load:false`, desconocido→null                                                                                                | Operativo                                                                                                  |
| Calendario F0                 | `ensureScheduleV3.js` — day_id canónico compartido, único `(plan,user,fecha)` en workout_schedule, SAVEPOINT                                                                                                       | Operativo                                                                                                  |
| Cierre canónico F0            | `trainingSession/complete.js` — post-update RETURNING, actual load construida en servidor (cliente no inyecta), outbox con SAVEPOINT + event_key idempotente                                                       | Operativo (pero hay un segundo cierre que lo esquiva, ver 1.2)                                             |
| Nutrición por capacidad       | `nutritionPeriodizationService.js` — D0/D1/D2 desde el contrato, cero branch nominal por metodología, gate `methodologyEmitsTrainingLoad()`                                                                        | Operativo                                                                                                  |
| planEngine                    | `planEngine.js` — primitivas puras (picker, templates, semanas, persistDraft), sin `if methodology===X`                                                                                                            | Operativo. No necesita "hooks" nuevos: ya es una librería que cada servicio orquesta                       |

### 1.2 Defectos VERIFICADOS con evidencia (esto es lo que hay que arreglar)

**Generación / nivel**

- G1. La IA decide el nivel sin validación: `evaluateCalisteniaLevel` no comprueba que `recommended_level ∈ {principiante,intermedio,avanzado}` (`CalisteniaService.js:139-141`); si la IA devuelve "elite", pasa tal cual; si viene `undefined`, explota.
- G2. Fallback silencioso a principiante en generación: `normalizeCalisteniaLevel` devuelve `'principiante'` para cualquier valor que no contenga "avanz"/"inter", incluida basura (`CalisteniaService.js:223-231`).
- G3. Plantillas por frecuencia, no por nivel: `SESSION_TEMPLATES` se indexa solo por frecuencia 3/4/5 (`CalisteniaService.js:198-217, 492`). Entre niveles solo cambian frecuencia default y `duration_weeks`. Sin RIR en el motor multi-semana.
- G4. Equipo/entorno IGNORADOS: `getRandomByLevel` soporta parámetro `equipment` (`exerciseRepository.js:99-102`) pero la generación de calistenia no lo pasa (`CalisteniaService.js:449-454`). Además **los campos de perfil no existen en BD**: no hay `training_environment`, `available_equipment` ni `equipment_safety_confirmed` en `user_profiles` ni en migraciones (verificado en `userRepository.js:18-46` + grep de esquema). El roadmap original decía "leer campos existentes si están disponibles" — no los hay; esto exige decisión de producto + migración (ver PR-CAL-01).
- G5. Relleno de categorías vacías arbitrario: si una lesión vacía "Empuje", se rellena con cualquier ejercicio de otras categorías (`CalisteniaService.js:510-523`).
- G6. Progresión de variante solo textual: al tope del rango, nota `progresa a "X"` + `variante_sugerida`; el ejercicio nunca cambia (`CalisteniaService.js:368-374`).
- G7. Persistencia incompleta: no guarda `ruleset_version` real de la fila de BD, ni assessment, ni contexto completo (`CalisteniaService.js:577-604`).
- G8. **Single-day SIN filtro de lesiones ni equipo**: `calisteniaSingleDay.js` usa SQL propio inline (`:85-120`), niveles acumulativos duplicados (`:56-59`), sin import de `injuryContraindications`. Un usuario con muñeca lesionada recibe flexiones. Este es el hueco de seguridad deportiva más grave del área.

**Sesión (compartido, afecta a todas las metodologías)**

- S1. Dos familias de inicio: el frontend usa `/routines/sessions/start` (`src/components/routines/api.js:39`), NO `/training-session/start/methodology`. La familia B es la mejorada por Fase 0 pero no está cableada.
- S2. Fallback calistenia cross-metodología CONFIRMADO: si un plan (de cualquier metodología) llega sin ejercicios, el start inyecta 6 aleatorios de disciplina `'calistenia'` hardcodeada (`routines/sessions.js:246-267`).
- S3. Concurrencia rota: no existe UNIQUE de sesión activa por user/plan/día (verificado en baseline del esquema); el guard es un SELECT bajo READ COMMITTED → dos starts simultáneos crean dos sesiones (`sessions.js:124-141`).
- S4. Resolución de día no determinista: `LIMIT 1` sin `ORDER BY` en la resolución por fecha (`sessions.js:83,94`); fallback aritmético `week=ceil(day_id/7), day='lunes'` si el day_id no existe (`sessions.js:116-119`); `methodology_plan_days` sin único `(plan_id, date_local)`.
- S5. Dos cierres divergentes: `/routines/sessions/:id/finish` (`sessions.js:596`) NO encola en el outbox; solo `/training-session/complete/methodology/:id` lo hace. Con flags on, la mitad de los cierres no emitirían evento.
- S6. `/routines/sessions/:id/effort` valida ownership pero NO rangos de RIR/RPE (`sessions.js:796-808`).

**Autorregulación / reevaluación**

- A1. Estado de rachas por USUARIO, no por plan: `app.calistenia_autoreg_state` PK `user_id` (`20260628_calistenia_autoreg.sql:12-13`). Dos planes del mismo usuario se pisan las rachas. En cambio `plan_progression_offsets` SÍ es por (user, plan) — la dirección correcta ya existe.
- A2. Migración de `plan_progression_offsets` fuera del ledger fechado: `backend/migrations/create_plan_progression_offsets.sql` (sin prefijo de fecha).
- A3. **Bug funcional**: el plan guarda semanas con clave `numero` (`CalisteniaService.js:565`), pero la reevaluación busca `w.semana || w.week` (`calisteniaReEvaluator.js:164`; `progressReEvaluation.js:512`). Resultado: la IA reevalúa sin contexto de semana y `/key-exercises` devuelve `[]` siempre (por eso el frontend enseña los pull-ups/push-ups/squats hardcodeados de `CalisteniaReEvalForm.jsx:233-237`).
- A4. IA dentro de transacción: `BEGIN` (`progressReEvaluation.js:62`) → llamada OpenAI (`:139`) → `COMMIT` (`:181`). Conexión del pool retenida durante toda la latencia del modelo (y el pool de Supabase ya se agota con 2 backends — gotcha conocido del proyecto).
- A5. Fallback 'stalled' inventado y PERSISTIDO como análisis real ante cualquier fallo de IA (`calisteniaReEvaluator.js:132-148` + `progressReEvaluation.js:153-177`).
- A6. Tres normalizadores de nivel divergentes: `trainingLoadContract` (alias), `bridgeEventOutboxService` (set), `CalisteniaService` (substring). El registry no expone normalizador reutilizable.

**Frontend**

- F1. `CalisteniaLevels.js` NO es solo presentación: tiene autoridad de promoción con umbral 80% hardcodeado (`:382-412`), duplicado en el Card (`CalisteniaManualCard.jsx:34,168-175`), porcentajes skill/strength por nivel, minutos base 45.
- F2. El Card no recoge ni envía equipo/entorno/lesiones (`CalisteniaManualCard.jsx:236-247, 294-305`); las lesiones solo pueden colarse como texto libre en `goals`.
- F3. `WorkoutContext.generatePlan` con branch calistenia que descarta datos y default `'basico'` inválido (`WorkoutContext.jsx:196-211`).
- F4. `CalisteniaEffortModal` captura RIR + targetMet + feeling con etiquetas que mezclan agrado y dificultad (keys `facil/dificil`, labels "Me gustó/Me costó", `:16-21`). Sin dolor ni técnica.
- F5. Isometrías: el reproductor soporta segundos SOLO si el ejercicio llega con duración y sin reps (`useExerciseTimer.js:22-31`); calendario/resumen renderizan todo como series×reps (`CalendarTab.jsx:722-723`).
- F6. Cero flujo de readiness/dolor en la ruta calistenia (la infraestructura existe en Hipertrofia, no conectada).

**Cobertura**

- T1. NO existe ningún test de calistenia ni de `planAutoregService` (`backend/tests/`: 43 ficheros, ninguno `*calistenia*` ni `*autoreg*`). El roadmap original acertó aquí; el análisis de Sergio ("PR-CAL-00 ya tiene base") es cierto solo para los contratos genéricos — el comportamiento de calistenia tiene cobertura CERO.

### 1.3 Correcciones al análisis de Sergio (donde el código dice otra cosa)

Tu análisis es fiable en su mayoría. Tres matices que cambian decisiones:

1. **"Descanso global de 75s"** — matizado: el descanso real sale del `descanso_seg` de cada fila del catálogo; 75s es solo fallback para nulls y es sobreescribible por ruleset BD (`CalisteniaService.js:346,391`). El problema real no es el 75, es que no hay dosificación por nivel/tipo cuando el catálogo no lo trae, y que single-day hardcodea el 75 sin leer ruleset.
2. **"Selector con relleno seguro"** — el relleno NO es seguro respecto a la intención: pasa el filtro de lesión, pero rompe la categoría (mete tracción donde faltaba empuje) (`CalisteniaService.js:510-523`). Y single-day no tiene NINGÚN filtro de lesión (G8) — esto no estaba en tu análisis y es lo más urgente.
3. **"El frontend agnóstico está bien y la fachada funciona"** — parcial: la redirección sí, pero `generatePlan` tiene branch calistenia con default inválido (F3) y `CalisteniaLevels` ejerce autoridad de nivel en cliente (F1).

Y una corrección al roadmap del compañero: su §6.4 referencia `backend/services/hipertrofiaV2/sessionService.js` — tras el PR #62 los identificadores son `hipertrofia`; el ejecutor debe reauditar rutas antes de citar ficheros de ese árbol.

---

## 2. Orden de implementación revisado

Cambios respecto al roadmap original, con motivo:

1. **CAL-00 se parte en dos y se encoge.** Coincido con Sergio en que la caracterización exhaustiva no desbloquea nada; discrepo en eliminarla: Opus va a refactorizar `CalisteniaService` y las rutas de sesión, y sin red los errores se cuelan. Compromiso: caracterización MÍNIMA dirigida (solo lo que vamos a cambiar) + un PR de fixes quirúrgicos de bugs ya verificados que no requieren diseño.
2. **Los bugs verificados van ANTES que el assessment.** A3 (numero/semana), G8 (single-day sin lesiones), A5 (stalled persistido), S6 (RIR sin clamp) son fixes de raíz acotados con evidencia exacta. Arreglarlos primero da valor inmediato y limpia el terreno.
3. **CAL-02 se parte en 02A (selector/paridad) y 02B (deportivo)**, como propuso Sergio.
4. **CAL-03 se parte**: primero los fixes de seguridad de la ruta actual (S2, S3, S4 — no requieren migrar el frontend), después la unificación de autoridad (S1, S5). Así el riesgo de "tocar rutas con usuarios reales" se paga en dos plazos pequeños en vez de uno grande.
5. **CAL-04/05 en paralelo con 02B** una vez estabilizados los contratos, como propuso Sergio.
6. **CAL-06 sigue gated por CAL-03** (sin autoridad única de inicio/cierre, la carga real no es confiable).

Ruta crítica:

```text
PR-CAL-00a (caracterización mínima, 0.5d)
→ PR-CAL-00b (fixes quirúrgicos verificados, 0.5-1d)
→ PR-CAL-01 (nivel canónico + assessment determinista, 2-3d)   [decisión de producto: equipo/entorno]
→ PR-CAL-02A (selector extraído + seed + paridad single-day, 1.5-2d)
→ PR-CAL-02B (ruleset deportivo por nivel + grafo de progresión, 2-3d)
→ PR-CAL-03a (endurecer ruta de sesión actual, 1-1.5d)
→ PR-CAL-03b (autoridad única inicio/cierre, 1.5-2d)
→ PR-CAL-04 (feedback/readiness/progresión, 2-3d)   ← puede solapar con 02B/03a
→ PR-CAL-05 (reevaluación, 1.5-2d)                  ← puede solapar con 04
→ PR-CAL-06 (training-load + nutrición contenida, 3-4d)
→ PR-CAL-07 (frontend + E2E, 3-4d)
→ PR-CAL-08 (activación, FUERA de este roadmap)
```

Total orientativo: 15-24 días de ingeniería (vs 17-29 del original; la reducción viene de no re-crear lo que ya existe).

---

## 3. PRs en detalle

### PR-CAL-00a · Caracterización mínima + guardas (S)

Crear SOLO tests que congelen lo que los PRs siguientes van a cambiar. Nada de suite exhaustiva.

- `backend/tests/calisteniaCurrentBehavior.test.js`: caracteriza (verde) el shape actual del plan (`version:'calistenia_v2'`, semanas con `numero`), el fallback a principiante (G2), la plantilla por frecuencia (G3), el relleno cross-categoría (G5).
- `backend/tests/calisteniaKnownDefects.test.js`: tests ROJOS (marcados `todo` con referencia al PR que los resuelve) para: G8 single-day con lesión de muñeca prescribe empuje; A3 `/key-exercises` devuelve `[]` para plan v2; S2 plan no-calistenia sin ejercicios recibe calistenia; S6 RIR=99 aceptado; A5 fallo de IA persiste 'stalled'.
- `backend/tests/calisteniaFlowSourceGuards.test.js`: guardas de fuente — flags seguros por defecto, migración F0 intacta, `emits_training_load:false` para calistenia.
- Fixtures sintéticos en `backend/tests/fixtures/calisteniaProfiles.js` (sin datos reales).

Gate: `npm run test:backend` verde (los defectos como `todo`, no como expectativa verde). Rollback: borrar tests, cero efecto funcional.

### PR-CAL-00b · Fixes quirúrgicos verificados (S)

Solo bugs con evidencia exacta y fix acotado, sin rediseño:

1. **A3** — leer `w.numero` (además de `semana`/`week`) en `calisteniaReEvaluator.js:164` y `progressReEvaluation.js:512`. Esto además hace que `/key-exercises` devuelva ejercicios reales y el frontend deje de enseñar los hardcodeados.
2. **G8** — aplicar `extractInjuryText` + `activeInjuryRules` + `isContraindicated` en `calisteniaSingleDay.js` (mismo patrón que `CalisteniaService.js:464-473`). No refactorizar el selector todavía; solo filtrar el pool.
3. **S6** — clamp/validación de `avgRir` (0-5) y `rpe` (0-10) en `routines/sessions.js:796-808`; valores fuera de rango → 422.
4. **A5** — el fallback de `calisteniaReEvaluator` deja de fabricar 'stalled': ante fallo de IA devolver `{decision:'insufficient_data'}` y NO persistir en `ai_adjustment_suggestions` como análisis válido (persistir con marca explícita de fallo o no persistir; decidir en revisión).
5. **A2** — mover `create_plan_progression_offsets.sql` al ledger fechado como migración idempotente nueva (sin editar la histórica), para que `migrate.mjs` la garantice fuera del baseline.

Tests: los rojos de 00b en `calisteniaKnownDefects.test.js` pasan a verdes. Rollback: revert del PR (sin migraciones destructivas; la 5 es CREATE IF NOT EXISTS).

### PR-CAL-01 · Nivel canónico + assessment determinista (L)

**Subfase A — normalizador único de nivel (A6, G1, G2):**

- Exportar `normalizeMethodologyLevel(methodologyId, value)` desde `methodologyRegistry.js`: valida contra `descriptor.levels`, alias explícitos (`basico→principiante`), desconocido→`null`.
- Consumirlo desde `trainingLoadContract.js`, `bridgeEventOutboxService.js` y `CalisteniaService.js` con tests de paridad antes de borrar los normalizadores locales.
- En `CalisteniaService`: nivel desconocido en generación → 422 explícito (no principiante silencioso). `evaluateCalisteniaLevel` valida el `recommended_level` de la IA contra el registry; inválido → error controlado.

**Subfase B — contexto de entorno/equipo (G4). ⚠️ DECISIÓN DE PRODUCTO PREVIA:**
Los campos NO existen en BD. Opciones (decidir Sergio antes de empezar):

- (a) Snapshot solo en `plan_data.context` alimentado por el frontend en el momento de generar (sin migración; no reutilizable entre planes) — **recomendada para esta fase**;
- (b) Migración aditiva a `user_profiles` (`training_environment`, `available_equipment jsonb`, `equipment_safety_confirmed`) — mejor a largo plazo, más alcance.
  Con (a): `userProfileContract.js` gana `normalizeTrainingEnvironment` y `normalizeAvailableEquipment` (puras, sin BD); el Card las envía; `CalisteniaService` pasa `equipment` a `getRandomByLevel` (el filtro `equipamiento <@ $n` YA existe en `exerciseRepository.js:99-102` — es cablearlo, no construirlo). Dato ausente → null + confianza reducida; jamás inventar material.

**Subfase C — `calisteniaAssessment.js` (nuevo, funciones puras):** según contrato §5.2 del roadmap original (gate de seguridad, patrón limitante, confianza, `insufficient_data`/`refer`; años de experiencia nunca elevan solos). La IA pasa a explicar un resultado ya cerrado; si la IA falla, se devuelve el assessment sin prosa. Flag `CALISTHENICS_ASSESSMENT_V1_ENABLED` (default `true` en PR-CAL-01; `false` = rollback explícito a lectura legacy).

**⚠️ EXCEPCIÓN DE PRODUCTO APROBADA (Sergio, 2026-07-23):** el roadmap original (§5.2/§6.2 Subfase C)
describe un assessment por **6 patrones de movimiento** (empuje horizontal/vertical, tracción
horizontal/vertical, pierna, core) con rangos 0-4 por patrón y cadena de progresión versionada.
Para PR-CAL-01, Sergio aprobó explícitamente **no implementar esa granularidad todavía** y cerrar
la Subfase C con un contrato simplificado de **nivel único global**:

- Nivel efectivo = `demonstratedLevel` (evidencia de skill) > `selfReportedLevel` (autoevaluación
  validada); años de experiencia declarados NUNCA elevan el nivel por sí solos.
- Lesión declarada activa (vía `injuryContraindications.js`, zonas hombro/lumbar/rodilla/muñeca/
  tobillo/codo) = patrón limitante + cap a `'intermedio'` (nunca `'avanzado'`) + confianza ≤ media.
- Dolor **agudo** → `decision:'refer'` (derivar a valoración profesional, no prescribir).
- Datos insuficientes → `decision:'insufficient_data'`, `level:null`, confianza `'low'` (honesto:
  "no lo sé", nunca se inventa un nivel).
- La IA pasa a EXPLICAR este resultado ya cerrado (nunca a decidirlo).

Implementado en `backend/services/routineGeneration/methodologies/calisteniaAssessment.js` (función
`assessCalistenia`) y cubierto por `backend/tests/calisteniaAssessment.test.js` (C-01..C-13 +
hardening H1/H2). **Qué se mueve a CAL-02+:** la evaluación por los 6 patrones de movimiento
individuales, sus rangos 0-4 y el `progression_chain_id`/grafo de progresión asociado (ver
PR-CAL-02B, `calisteniaProgressionGraph.js`). **Qué sigue vigente para CAL-01:** el nivel efectivo
por skill/self-report, el cap por lesión, el gate de dolor agudo, y `requires_ai_explanation` como
contrato de que la IA nunca decide. Cualquier auditoría futura que marque "falta evaluar los 6
patrones" como incumplimiento de PR-CAL-01 debe remitirse a esta nota — es una decisión de producto
tomada y documentada, no una desviación no autorizada.

**Subfase D — frontend mínimo:** el Card envía `assessment`+`context` dentro de `calisteniaData`; fix del branch de `WorkoutContext` (F3): dejar de descartar campos necesarios y eliminar el default `'basico'` (usar null → el backend decide/422). NO retirar aún la autoridad de `CalisteniaLevels` (eso es CAL-07); solo dejar de usarla como fuente del payload.

Persistencia: `plan_data.assessment` + `plan_data.context` + `ruleset_version` real (G7). Sin migración.

Gate: mismo input → mismo nivel sin red; gate rojo no genera; alias `basico` válido, inventado → 422. Rollback: flag off.

### PR-CAL-02A · Selector extraído + determinismo + paridad single-day (M)

Como dijo Sergio: **extraer, no crear**.

- Crear `calisteniaExerciseSelector.js` moviendo la lógica de `CalisteniaService.js:449-523` (pool→lesión→categoría→picker→relleno) y la de `calisteniaSingleDay.js:85-120`, unificadas. Single-day y multi-semana consumen el MISMO selector (elimina el SQL inline y el `getAccumulativeLevels` duplicado).
- `exerciseRepository.js`: añadir `excludeExerciseIds` y `seed` (selección estable; sustituir `ORDER BY RANDOM()` por orden determinista con seed inyectada — p.ej. `ORDER BY md5(id::text || $seed)`). Compatibilidad: seed opcional; sin seed, comportamiento actual.
- Relleno seguro (G5): al vaciarse una categoría, sustituir por mismo patrón/categoría de rank inferior; si no hay, omitir con `reason_code: NO_SAFE_SUBSTITUTION` en metadata. Prohibido el relleno cross-categoría arbitrario.
- `injuryContraindications.js`: enriquecer la salida (allowed/blocked/caution + reason_codes) manteniendo `isContraindicated` como wrapper booleano (no romper a los otros 5 consumidores — hay tests de paridad existentes: `injuryContraindicationsUnify.test.js`).
- Auditoría de catálogo (solo lectura): conteos por nivel/categoría/patrón, `progresion_hacia` no resolubles, filas sin descanso. Salida = informe, no UPDATE. Si hace falta corrección de datos → documento de decisión + migración autorizada aparte.

Gate: seed estable (mismo input+seed → mismo plan); single-day con lesión de muñeca = mismo comportamiento que multi-semana; cero regresión en los otros consumidores del filtro.

### PR-CAL-02B · Ruleset deportivo por nivel + grafo de progresión (L)

- Crear `calisteniaRuleset.js` con `LEVEL_DEFAULTS`, arquetipos de sesión POR NIVEL (mata G3), RIR objetivo por nivel, descansos por tipo de ejercicio (mata el resto de G1.3), `DELOAD_RULES` (ventana 4-8 semanas; semana 6 como fallback legacy). Los rangos de la tabla §6.3F del roadmap original valen como punto de partida versionado (`calisthenics-methodology/1.0.0`). El mecanismo `mindfeed_rulesets` de BD se conserva; el módulo es el fallback versionado honesto y el contenido de BD debe dejar de ser un espejo del hardcode.
- Crear `calisteniaProgressionGraph.js`: grafo desde `progresion_hacia` del catálogo; referencia no resoluble → `BROKEN_PROGRESSION_REFERENCE` (registrada, nunca ejecutada). Mata G6 a nivel de datos; la política que lo usa llega en CAL-04.
- `CalisteniaService.js` queda como orquestador: assessment → ruleset → selector → planEngine → persistir draft v3 (shape actual `semanas` + campos v3 aditivos; sin duplicar semanas — la vista legacy es un adapter de respuesta).
- Isometrías: prescripción con `hold_seconds` y SIN reps para que el reproductor las trate como tiempo (F5 se arregla gratis si el dato viene bien).

Flag `CALISTHENICS_GENERATOR_V3_ENABLED` (off → generador actual). Gate: 3 niveles producen estructuras distintas verificables por test; plan v2 sigue legible.

### PR-CAL-03a · Endurecer la ruta de sesión ACTUAL (M) — sin migrar frontend

Fixes sobre `/routines/sessions/*` que no cambian el contrato con la UI:

1. **S2** — eliminar el fallback cross-metodología: sin ejercicios → `SESSION_EXERCISES_UNAVAILABLE` (422), nunca inyectar calistenia. (El test rojo de 00a pasa a verde.)
2. **S3** — unicidad de sesión activa: migración aditiva con índice único parcial `(user_id, methodology_plan_id, day_id) WHERE session_status IN ('pending','in_progress')` o advisory lock transaccional; dos starts → misma sesión (idempotente).
3. **S4** — `ORDER BY day_id` determinista en las resoluciones por fecha; conflicto real de dos días misma fecha → 409 con detalle, no `LIMIT 1` silencioso; eliminar el fallback aritmético `ceil(day_id/7)` para planes v3 (permitido solo para histórico, con métrica).

Riesgo controlado: mismos endpoints, mismos happy paths; solo se cierran los agujeros. Requiere migración (índice) → autorización de Sergio.

### PR-CAL-03b · Autoridad única de inicio/cierre (L)

- Crear `backend/services/methodologySessionService.js` (transaccional: lock plan → resolver día por day_id → verificar no-descanso → sesión existente o crear una → copiar metodología/nivel/carga → progreso idempotente). NO tocar el sessionService de Hipertrofia (árbol renombrado: reauditar rutas reales, ya no es `hipertrofiaV2/`).
- `routines/sessions.js` start y `trainingSession/start.js` delegan ambos en él (S1).
- **S5** — `/routines/sessions/:id/finish` delega en el cierre canónico (o encola outbox con la misma `event_key`); telemetría de qué ruta se usa antes de retirar nada.
- `methodology_type` NOT NULL de facto para sesiones nuevas (la sesión de calibración no puede perderlo).

Gate: las dos rutas producen el mismo resultado semántico; cierre repetido no duplica evento; usuario B no arranca día de A. Rollback: delegación reversible por revert (la autoridad es aditiva).

### PR-CAL-04 · Feedback, readiness y política de progresión (L)

- `CalisteniaEffortModal`: separar de verdad agrado (enjoyment) de dificultad, añadir dolor (enum none/stable/increasing/acute) y técnica (pass/conditional/fail); omitir permitido (baja confianza). Corrige F4/F6. Backend: `/effort` acepta y valida los campos nuevos (ya con clamps de 00b).
- `resolveReadiness(signals)` pura: verde/ámbar/rojo → modificaciones (menos series, +RIR, regresión). Sin score clínico sumado.
- Crear `calisteniaProgressionPolicy.js`: decisiones hold/progress_variant/regress_variant/deload_planned/deload_reactive/refer usando el grafo de 02B; dos exposiciones válidas para progresar; dolor creciente bloquea; deload no cuenta como exposición. `planAutoregService` delega calistenia en la policy manteniendo el enganche compartido (sin tocar las otras metodologías de `REP_BASED_KEYS`).
- **A1** — la autoridad de estado pasa a `plan_progression_offsets` (por plan); `calistenia_autoreg_state` queda como legacy de lectura (no borrar; migración solo si Sergio la autoriza).
- **T1** — suite de `planAutoregService` + policy (hoy cobertura cero).

Flag `CALISTHENICS_PROGRESSION_V2_ENABLED` (off → decisiones en hold). Gate: cada cambio con from/to + reason codes; plan A no modifica plan B.

### PR-CAL-05 · Reevaluación (M)

- **A4** — sacar la IA de la transacción: leer y cerrar tx → IA fuera → persistir propuesta en tx corta versionada.
- Propuesta/aceptación explícita: endpoints propose/accept/reject/history con ownership e idempotencia (contrato §5.6 del roadmap original). Nada se autoaplica.
- `CalisteniaReEvalForm`: eliminar el fallback de ejercicios hardcodeados (con A3 arreglado en 00b ya llegan los reales; si el fetch falla → estado "sin datos", no ficción).
- Criterios de transición por nivel: los del §6.6 del roadmap original valen (4 semanas/8 sesiones/80% para P→I; 8 semanas/24 sesiones/85% para I→A; aceptación explícita).

### PR-CAL-06 · training-load/v1 + nutrición contenida (XL)

Precondición dura: CAL-03b verde y revalidado. Sin cambios sobre el diseño del roadmap original (§6.7), que es correcto y compatible con lo verificado:

- `calisteniaLoadRules.js` suministra el perfil (D0/D1/D2 por demanda, nivel nunca puntúa); `trainingLoadContract` gana validación de demand/recovery/reason codes de forma genérica (hoy no los valida — verificado), sin `if calistenia`.
- Carga planificada en `methodology_plan_days.metadata` (el transporte vía `ensureScheduleV3`/`sessionLoadBuilder` ya existe y hoy viaja null); carga real vía `actualLoadBuilder` (el cierre ya la construye en servidor).
- Todos los flags de emisión/nutrición en default seguro; `emits_training_load` de calistenia sigue false.

### PR-CAL-07 · Frontend + E2E (XL)

- **F1** — `CalisteniaLevels.js` queda SOLO presentacional: fuera `canProgressToNextLevel`, el 80% (y su duplicado en el Card), los porcentajes skill/strength como autoridad. La autoridad es el backend (assessment + policy + reevaluación).
- Preview real del plan (no cálculo local), calendario con `session_type` e isometrías en segundos, doble-submit bloqueado.
- Playwright: los 7 escenarios del roadmap original (§6.8) sobre BD efímera/staging, iniciando sesión por el endpoint QUE USA LA UI (`/routines/sessions/start` ya unificado tras 03b). Nunca producción.
- No-regresión Hipertrofia.

### PR-CAL-08 · Activación — fuera de alcance, sin cambios sobre el original.

---

## 4. Decisiones que necesita tomar Sergio (bloqueantes por PR)

| Decisión                                                                            | Bloquea       | Recomendación                                                      |
| ----------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------ |
| Persistencia de equipo/entorno: snapshot en plan (a) vs migración de perfil (b)     | PR-CAL-01B    | (a) ahora, (b) como decisión aparte si el producto lo pide         |
| Autorizar migración del índice único de sesión activa                               | PR-CAL-03a    | Sí — es el fix de concurrencia real                                |
| Qué hacer con `calistenia_autoreg_state` (legacy congelada vs migrar a PK por plan) | PR-CAL-04     | Congelar como legacy; autoridad nueva = `plan_progression_offsets` |
| Persistir o no los análisis fallidos de IA (A5)                                     | PR-CAL-00b    | No persistir como análisis; guardar solo marca de fallo            |
| Umbrales deportivos (rangos §6.3F, transiciones §6.6)                               | PR-CAL-02B/05 | Validar con criterio deportivo propio antes de versionarlos        |

## 5. Criterios de detención (heredados + añadidos)

Los del roadmap original (§14) siguen vigentes. Añadidos:

- Si un fix de la familia `/routines/sessions/*` cambia el shape de respuesta que consume `useRoutineSessionActions.js` → parar (romperías la app Android en prod, que ya sufrió el bug de fetch relativo).
- Si el ejecutor encuentra que main avanzó sobre un fichero citado aquí → reauditar ese punto antes de implementar, y anotar la divergencia en el PR.
- Si un test rojo de PR-CAL-00a aparece verde antes de su PR → parar y avisar.
