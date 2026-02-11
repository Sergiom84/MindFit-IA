# Registro diario de implementaciones

## 09.02.2026

- Docs/Nutrición: se añade `docs/ANALISIS_REVISION_SEMANAL_QUINCENAL_NUTRICION.md` con el análisis de necesidades (revisión semanal/quincenal, anti-ruido y adherencia) vs estado actual y gaps.

## 10.02.2026

- Docs/Nutrición: se abre el pack de implementación `Docs/nutricion-revision-7d-14d/` y se actualiza `Docs/_active.md` (day_type/noise_flags como columnas, modos SIMPLE/FINO, revisión 7d/14d, autoajustes + deshacer).
- Nutrición (SQL/tests): se añade y aplica la migración `20260210_daily_nutrition_log_day_type_noise_flags.sql` (columnas `day_type` + `noise_flags` + check), script `backend/scripts/run-nutrition-review-migration.js` y test `backend/tests/nutritionReviewMigration.test.js` (OK).
- Nutrición (API/tests): se añaden endpoints v2 de registro diario `GET/POST /api/nutrition-v2/daily` (kcal + day_type + noise_flags + daily_log opcional) con servicio `backend/services/nutritionDailyLogV2.js` y tests `backend/tests/nutritionDailyV2.test.js` (OK).
- Nutrición (Review/tests): se añade servicio `backend/services/nutritionReviewService.js` y endpoint `GET /api/nutrition-v2/review` (modo SIMPLE/FINO, rolling 7d vs 7d previa, adherencia>=80%, pesajes, compliance ±10%, ruido y bloqueo 7d) con tests `backend/tests/nutritionReviewV2.test.js` (OK).
- Nutrición (Adjust/undo infra): se añade migración `20260210_nutrition_adjustment_actions.sql` (tabla `app.nutrition_adjustment_actions`), servicio `backend/services/nutritionAdjustmentService.js` y endpoint `POST /api/nutrition-v2/adjustments/apply` (regenera plan activo, clamp <=10%, auditoría) con test `backend/tests/nutritionAdjustmentsV2.test.js` (OK).
- Nutrición (Undo/tests): se añade endpoint `POST /api/nutrition-v2/adjustments/undo-last` (ventana 24h, restaura plan anterior, archiva el nuevo, registra log revertido) con tests `backend/tests/nutritionUndoV2.test.js` (OK).
- Nutrición (UI/review): se añade panel `NutritionReviewPanel` (bloque fijo de revisión semanal/quincenal + registro rápido kcal/day_type/noise_flags + aplicar ajuste recomendado + deshacer) y se integra en `NutritionDashboard` (overview). El review backend ahora expone `last_adjustment_action` para renderizar “Deshacer” de forma persistente; test añadido en `backend/tests/nutritionReviewV2.test.js` (OK).
- Nutrición (QA/tests): QA UI headless cubriendo SIMPLE->FINO, ruido, recommend_adjustment, apply y undo. Tests añadidos para edge cases: sin pesajes, `day_type=cheat` como ruido y outlier de peso como ruido (`backend/tests/nutritionReviewV2.test.js`) (OK).
- Nutrición (UX coherencia): el copy del objetivo semanal ahora indica dirección (pérdida/ganancia) y el ritmo muestra signo + “subiendo/bajando”; además, el panel de progresión (ICG/IPG) deriva la fase desde el plan nutricional activo si el bridge no la tiene (evita mostrar `unknown`).
- Nutrición (UX): cuando IPG/ICG no se pueden calcular (sin pérdida/ganancia significativa), el badge ahora dice “Sin señal” y el mensaje explica por qué y qué falta, usando el cambio real de peso entre mediciones.
- Docs: se añade `docs/RESUMEN_IMPLEMENTACION_NUTRICION_REVISION_7D_14D.md` con un resumen en lenguaje natural de lo implementado en el módulo de nutrición.
- Nutrición (fix): se corrige `Guardar configuración` en `NutritionPlanGenerator` para no serializar el evento de click (error `Converting circular structure to JSON`); además se añade guardarraíl en `handleSaveProfile` para ignorar payloads tipo evento.

## 06.02.2026

- Nutrición: se elimina el cap de 31 días en generación de plan y sincronización UI; el límite queda en 28 días para alinearlo con la cadencia semanal/quincenal del spec.
- Nutrición (spec punto 2): si hay plan de entrenamiento activo, la generación del plan v2 queda siempre enlazada (backend deriva tipo + calendario desde `workout_schedule`; UI auto-sincroniza y bloquea presets/edición manual).
- Nutrición: `generateNutritionPlan` ahora calcula entrenos/semana de forma correcta cuando recibe un calendario diario (14-28 días) para no sobreestimar el TDEE al sincronizar con el plan activo.
- Docs: se añade `docs/RESUMEN_DESALINEACION_NUTRICION_SPEC.md` con el resumen "como antes" de los puntos parcialmente alineados con el spec de nutrición.
- Docs: se añade `docs/PLAN_ALINEACION_TOTAL_NUTRICION_SPEC.md` con plan integral por fases (backend/UI/SQL/QA) para cerrar brechas y alinear 100% con el spec.

## 05.02.2026

- Se crean las skills globales `impl-pack-open` y `impl-pack-close` en `~/.codex/skills/` para generar y cerrar paquetes de documentación de implementación con puntero activo.
- Se crea la skill global `impl-pack-clear` en `~/.codex/skills/` para limpiar el puntero `Docs/_active.md` tras confirmación explícita de QA manual.
- Se crea la skill global `ui-mobile-scout-web` en `~/.codex/skills/` para investigar referencias UI móvil con Playwright y guardar evidencias en el repo.
- Se actualiza el paquete `Docs/nutricion-ui-coherencia-motor` con la regla de “Plan hasta X fecha” + “Revisión automática cada 14 días” y la fuente de verdad (perfil v2).
- UI Nutrición: banner de discrepancias con detalle y acciones, ayuda contextual de actividad, sincronización de duración con plan activo (cap 31 días), tarjeta kcal/día alineada a perfil v2 con nota de perfil incompleto, botón de menú IA deshabilitado con “Próximamente” y compensación semanal renderizada desde `compensation_plan.days`.
- UI Nutrición: sincronización con perfil general ahora guarda en BD (persistente al recargar) y el backend normaliza fechas del calendario para evitar `Invalid Date`/desfase de timezone.
- Backend: normalización de `scheduled_date` en calendario ahora usa formato local `YYYY-MM-DD` para evitar strings inválidos.
- UI Nutrición: sincronización con plan activo ahora ajusta tipo de entrenamiento y calendario semanal según el plan real.
- Backend: `/api/routines/active-plan` ahora devuelve `planType`/`methodology_type` cuando la fuente es `workout_schedule`.
- UI Nutrición: sincronización con plan activo ahora construye calendario diario real en lugar de repetir patrón semanal.
- UI Nutrición: vista de días de entrenamiento ahora etiqueta los próximos 7 días cuando el calendario es diario.
- UI Nutrición: calendario activo ahora calcula el día de la semana desde la fecha real de inicio del plan y abre en la semana actual.
- UI Nutrición: en cálculo del plan se muestra la semana habitual del plan (no próximos 7 días) y la frecuencia se expresa por semana.
- UI Nutrición: se corrige el orden de hooks en calendario para evitar “Rendered more hooks than during the previous render”.
- UI Nutrición: calendario activo ahora se alinea a semanas reales (Lun–Dom) usando fechas del plan y rellena huecos fuera del plan.
- UI Nutrición: botón “Menú del día” se centra en la parte inferior del card.
- UI Nutrición: la tarjeta kcal/día ahora prioriza el último plan nutricional activo (fallback a perfil si no hay plan).
- Backend Nutrición: al generar un plan v2 se archivan planes activos previos para mantener un único plan activo.
- UI Nutrición: “Menú del día” se renderiza como badge compacto y responsive dentro del card.
- UI Nutrición: badge “Menú del día · Próximamente” simplificado y alineado visualmente.
- UI Nutrición: badge de menú ahora muestra “Menú del día” arriba y “Próximamente” debajo.
- UI Nutrición: botón “Menú del día” activo abre el detalle del día y se muestra como “Ver detalles”.
- UI Nutrición: banner de discrepancias con copy simplificado para usuarios finales.
- UI Nutrición: banner ahora muestra “Diferencias detectadas” con valores de perfil general y nutrición.
- UI Nutrición: rediseño del banner de discrepancias con tarjetas y colores diferenciados (responsive).

## 04.02.2026

- Se documenta la auditoría de Nutrición vs spec MindFit unificada en `docs/AUDITORIA_NUTRICION_MINDFIT.md` (implementado, parcial, pendientes, bugs y plan de implementación).
- Se crea el plan de implementación, checkpoints y tests de Nutrición MindFit en `docs/nutricion_mindfit_impl/` (plan, avance por fases y QA final).
- Se actualiza el plan y QA para deprecación de endpoints legacy de mediciones con respuesta `410 Gone`.
- Fase 1 (parcial): deprecados endpoints legacy de mediciones (`/api/nutrition/calibration/measurements*`, `/api/nutrition-v2/measurements`), migrada calibración a `app.body_measurements` y aplicada migración `20260204_unify_nutrition_measurements` en Supabase.
- Fase 2 (backend): `generateNutritionPlan` ahora respeta `training_schedule` real y genera calendario por defecto sin marcar entreno en descansos.
- Fase 3 (backend): objetivo calórico por fase ahora usa rangos según spec, actividad base alineada a tabla MindFit y guardarraíl de proteína en volumen respeta nivel avanzado.
- Fase 4 (backend): evaluación nutricional v2 ahora usa ventana validada de 14 días, confirmación doble vía `register_icg_ipg_state` y mediciones validadas.
- Fase 5 (backend): saltos de dieta ahora compensan solo si la desviación semanal supera el objetivo, con resumen semanal incluido.
- Fase 6 (backend): bridge aplica reglas de lesión (espera 7 días, ajuste tras 14 y reducción de sesiones), deload reduce superávit en volumen y carb cycling limitado a ±10% en déficit.
- Fase 7 (backend/SQL): creadas tablas `nutrition_change_log` y `nutrition_weekly_snapshots` (migración `20260204_nutrition_audit_log_snapshots` aplicada en Supabase), logging integrado en calibración/bridge/saltos y endpoint `/api/nutrition-v2/audit` añadido.
- Fase 8 (UI): dashboard ahora muestra alertas confirmadas/pendientes, compensación semanal y estado del bridge (carb cycling y flags).
- Fix DB: `nutrition_profiles.actividad` ahora admite valores de la spec (`ligeramente_activo`, `activo`, `muy_activo`) manteniendo compatibilidad legacy; migración aplicada en Supabase.
- Fix DB: `app.get_weekly_deviation_summary` ahora usa `kcal_objetivo/tdee`, corrige casts y status; migraciones aplicadas en Supabase.
- Fix DB: `icg_ipg_state_history.status` ahora admite estados en español (rojo/amarillo/verde/verde_plus).
- Fix backend: IEC en `nutritionV2/evaluate` ahora guarda `indicator` numérico para evitar error al registrar `register_icg_ipg_state` (requiere reinicio del backend para aplicar).
- QA final: flujo completo de nutrición validado con backend activo (perfil, plan, mediciones 14 días, reevaluación, diet deviation, bridge, auditoría). Tests registrados en `docs/nutricion_mindfit_impl/TESTS.md`.

## 03.02.2026

- Se documenta comparativa completa entre origin/main y la implementacion local+Supabase v3 en `docs/compraracion_ciclo_menstrual.md` (alcance, puntos en comun, complementariedad y merge).
- Se amplian los planes y checklists v3 en `docs/ciclo_menstrual/PLAN_IMPLEMENTACION_V3.md`, `docs/ciclo_menstrual/SEGUIMIENTO_V3.md` y `docs/ciclo_menstrual/QA_TESTS_V3.md`.
- Se agrega placeholder `AUTH_TOKEN` en `.env` y se documenta el uso local en `docs/ciclo_menstrual/QA_TESTS_V3.md`.
- Se genera `docs/ciclo_menstrual/tags_hypertrofia_template.auto.csv` con autotag heuristico (impact/axial/cod/overhead) para revision manual.
- Se alinea la UI del ciclo con backend v3 (useCycleAdjustment, useMenstrualCycle, CycleDayCard, CycleHomeCard) y se amplía el onboarding con campos v3.
- Scripts ejecutados: `test-menstrual-cycle-db.mjs` OK, `test-menstrual-cycle-swaps.mjs` OK (rollback), `test-menstrual-cycle-api.mjs` OK (sin log de hoy por ALLOW_MENSTRUAL_TEST_WRITES=0).
- Se importa el CSV de tags de riesgo en `app.exercise_tags` con `scripts/import-hypertrofia-tags.mjs` (110 filas).
- Se integra autoajuste y deload en HipertrofiaV2 (multipliers combinados + swaps reforzados), se agrega fallback a `exercises_data` en autoajuste y se crea `scripts/test-menstrual-cycle-deload.mjs` (test falla por migracion pendiente).
- Se aplica la migracion `20260203_menstrual_auto_adjust.sql` en Supabase y el test `scripts/test-menstrual-cycle-deload.mjs` pasa (rollback aplicado).
- Se refuerza el aviso de ajuste menstrual en sesiones reanudadas: `RoutineSessionModal` reconoce `methodology_type` y `TodayTrainingTab` inyecta `metodologia` en la sesión efectiva.
- Se normaliza `reps_objetivo` -> `repeticiones` en HipertrofiaV2 al servir la sesión ajustada (test OK con endpoint actual).
- Fase 7 QA ciclo menstrual v3 completada: scripts DB, engine, API, swaps y deload OK; evidencias registradas en SEGUIMIENTO_V3.md.
- Se recupera el calendario y el modal de log diario desde main y se adapta a v3 (modo phase, campos v3 y refresco de ajuste).
- Se corrige el acceso al token en el módulo de ciclo (authToken fallback) para que el calendario cargue logs y el modal guarde registros correctamente.
- Se corrige el endpoint `/api/menstrual-cycle/logs` para calcular el último día del mes y evitar error 500 en febrero.
- Git: merge fast-forward de `merge/menstrual-main` a `main` y push al remoto.
- UI: se añade padding inferior con safe-area al modal de confirmación de plan para que el botón no quede oculto tras la bottom nav en móvil.
- UI: se añade padding inferior con safe-area al modal de Hipertrofia V2 (evaluación/crear plan) para que el CTA no quede tapado por la bottom nav en móvil.
- UI: se ajusta el ancho del modal de Hipertrofia V2 en móvil (`w-[95vw]`) para centrarlo y mejorar la respuesta visual.
- UI: se ajusta el ancho del modal de confirmación de plan en móvil (`w-[95vw]`) para centrarlo y evitar desalineación.
- UI: se evita overflow del nombre de metodología en cards (tamaño responsivo + wrap en móvil).
- UI: se ajusta el texto de metodología en el resumen del plan para que no se desborde en móvil.
- UI: la pestaña de ciclo en la bottom nav ahora usa `authToken || token` para mostrarse en móvil.
- UI: fallback a `user.sexo` en la bottom nav cuando el check del ciclo falla o no hay token.
- UI: bottom nav en móvil ahora permite scroll horizontal y reduce padding para que todos los tabs (incluido Ciclo/Perfil) sean accesibles.
- UI: bottom nav se simplifica a 4 tabs + “Más” con modal (Oposiciones, Ciclo, Perfil) para mejorar la legibilidad en móvil.
- UI: Nutrición en móvil ahora usa ancho completo (se reduce padding doble en Screen/Plan/Calendario/Dashboard).
- UI: grid de días de entrenamiento en Nutrición ajusta tamaños/espaciado para que no se rompa en móvil.
- UI: días de entrenamiento en Nutrición usan 4 columnas en móvil (4+3) para mejor legibilidad.
- UI: botón "Generar plan nutricional" adopta estilo premium (gradiente y sombra).
- UI: pestaña "Generar Plan" de Nutrición se divide en cards separadas (configuración, entrenamiento, resumen y CTA) para mejorar legibilidad.
- Fix: se restaura `loadProfileFromUserData` en Nutrición para evitar el error en móvil.
- UI: "Generar Plan" ya no usa card maestra; cada bloque queda en cards independientes con mismo ancho.
- Reglas: se añade en `CLAUDE_RULES.md` la norma de no hacer commit/push salvo solicitud explícita.

## 02.02.2026

- Nutrición/Bridge: actualizado `docs/NUTRICION_ROADMAP.md` con objetivo inmediato, pendientes por incorporar desde GitHub y bloqueantes de integración.
- Git: fast-forward de `feature/nutricion-bridge-metabolico` desde GitHub (calibración automática GCT, confirmación 2 semanas ICG/IPG/IEC, tracking rendimiento, complementos de control y documentación técnica).
- Backend: fix de integración en `backend/services/nutritionControlSupplements.js` (pool desde `backend/db.js`).
- Backend: añadido router `backend/routes/performanceConfirmation.js` para `/api/performance-confirmation` (registro de rendimiento, check 2 semanas, estado confirmado ICG/IPG/IEC).
- SQL: ajustes de compatibilidad para Supabase en migraciones de nutrición (`backend/migrations/create_training_performance_tracking.sql` sin `RECORD[]` y `backend/migrations/create_nutrition_calibration_system.sql` asegurando columnas `kcal_objetivo`/`tdee`).
- Seguridad: se eliminaron tokens `sbp_*` reales de documentación de setup MCP (se reemplazan por placeholders).
- Git: merge de `feature/nutricion-bridge-metabolico` a `main`.
- Se crea la carpeta docs/ciclo_menstrual con plan de implementacion v3, QA/tests y seguimiento para retomar el contexto en reinicios.
- Se ajusta el plan v3 con decisiones robustas (UTC, defaults conservadores, tagging manual de riesgo y comportamiento sin tags).
- Fase 1 v3: migracion aplicada (columnas nuevas, historial de ciclos, exercise_tags y backfill conservador) y verificacion en Supabase OK; script local requiere DATABASE_URL.
- Fase 1 v3: script `test-menstrual-cycle-db.mjs` ejecutado con .env y pasa verificacion de columnas/constraints.
- Fase 2 v3: motor de ciclo determinista implementado con tests unitarios (node --test) OK.
- Fase 3 v3: endpoints de ciclo actualizados con motor v3, compatibilidad UI y ajuste en HipertrofiaV2 (tests unitarios OK, falta test API).
- Test integracion API v3 pendiente por falta de AUTH_TOKEN en .env/backend/.env.
- Test integracion API v3 ejecutado con AUTH_TOKEN en runtime (OK; sin log de hoy porque no se habilito ALLOW_MENSTRUAL_TEST_WRITES).
- Fase 4 v3: seeding de pattern/equipment en exercise_tags, template CSV exportado para tagging manual y swap engine integrado (tags de riesgo pendientes).
- Test de swaps v3 ejecutado con rollback (OK).

## 01.02.2026

- Documentación: se creó `docs/NUTRICION_ROADMAP.md` con estado implementado, gaps y mejoras priorizadas para Nutrición/Bridge.
- Ciclo menstrual: calendario con colores por fase (menstrual/folicular/ovulación/lútea) y días clickables con modal de diario (energía, dolor, sueño, notas).
- HipertrofiaV2: el filtrado/reemplazo de ejercicios por restricciones menstruales ahora usa la fase real del ciclo y el ajuste se calcula con fecha local para leer el log del día correctamente.
- Saltos de dieta: la función `app.calculate_compensation` ahora devuelve y guarda ajustes de macros por fase (carbohidratos/grasas) manteniendo proteína objetivo ≥2 g/kg; se añaden columnas de proteínas y ajustes de macros al plan diario.
- Semáforos progreso: se alinearon los umbrales de ICG/IPG con las especificaciones MindFeed (verde+/verde/amarillo/rojo) en `icgIpgDetector.js`.
- Ciclo menstrual: las operaciones de “hoy” (consultar log, registrar síntomas y marcar “Hoy me bajó”) usan fecha local en vez de UTC para evitar desfases en el calendario y en el cálculo del día de ciclo.
- Ciclo menstrual: se fuerza consistencia de periodo activo (botón muestra “Periodo activo” mientras dure el periodo configurado), se evita doble registro, se generan logs sintéticos para pintar el calendario y el onboarding ahora captura la duración del periodo.
- Ciclo menstrual: se elimina el texto duplicado de la descripción de fase debajo del título en la tarjeta del día.
- Nutrición: se ocultaron las pestañas legacy (Calendario Legacy, IA, Planificador, Lista, Macros, Alimentos, Suplementos), se añadió el acceso al nuevo `NutritionDashboard` junto a `Generar Plan` y `Calendario V2`, y se unificó el token de autenticación en `NutritionCalendarView` para evitar errores de carga del plan activo.
- Nutrición: se armonizó el estilo Tech-Lux en todo el Dashboard (ICG/IPG, mediciones, saltos, timing y modal post-entreno) con tarjetas glass, tipografía y botones degradados, y se mantuvo la carga de plan activo del Calendario V2 usando `token/authToken` para evitar el aviso de plan inexistente cuando sí está generado.
- Nutrición: `NutritionPlanGenerator` ahora usa `token || authToken` en todas las llamadas para guardar perfil y generar plan v2, evitando que el plan se genere sin autenticación y que `/api/nutrition-v2/active-plan` devuelva 404 tras la generación.
- Nutrición/Perfil: se añadieron columnas `gemelo` y `pliegue_abdominal` a `app.users` y `app.user_profiles`, el guardado de mediciones ahora hace upsert por día (sin duplicados) y sincroniza gemelo/pliegue cuando Nutrición es la fuente; el formulario precarga esos campos desde el perfil.
- Nutrición v2: `POST /api/nutrition-v2/profile` ahora puede completar campos base desde `app.users` y preserva valores existentes cuando el frontend envía solo objetivo/actividad/comidas/preferencias; `NutritionPlanGenerator` hace upsert del perfil antes de `generate-plan` y el cálculo de TDEE acepta actividad `alto/muy_alto`.
- Nutrición/Dashboard: se eliminó la fila de “acciones rápidas” duplicada, el tab “Nueva Medición” ahora incluye botón Cancelar, se unificó `token || authToken` en mediciones/saltos/timing y el backend sincroniza mediciones hacia `app.users` cuando `nutrition_overrides_profile` está activo.
- Nutrición: `BodyMeasurementsHistory` ahora formatea numéricos como `Number(...)` (Postgres devuelve `numeric` como string) para evitar el crash `toFixed is not a function`; roadmap actualizado en `docs/NUTRICION_ROADMAP.md`.

## 31.01.2026

- Git: cambios de Nutrición se suben a la rama `feature/nutricion-bridge-metabolico` para seguir iterando sin merge a `main`.
- Limpieza: se eliminaron archivos vacíos duplicados creados por error (`0`, `backend/cd`, `backend/duracion`, `backend/entrena-con-ia-backend@1.0.0`, `backend/node`, `backend/nombre`, `backend/npm`) para evitar ruido en el repositorio.
- Nutrición v2: cálculo TMB ahora selecciona fórmula (Tinsley, Ten Haaf, Mifflin, Harris) con reglas MindFeed (nivel, edad, altura extrema, WHtR/grasas altas), factores de actividad actualizados, ajuste NEAT por pasos y objetivos según fase; macros por perfil metabólico; nuevas columnas en `app.nutrition_profiles` (metabolic_type, formula_preferida, training_days, waist_cm, bodyfat_percent, steps_per_day); endpoints de mediciones y reevaluación 14 días (`/api/nutrition-v2/measurements`, `/api/nutrition-v2/evaluate`) ahora detectan mediciones sospechosas, aplican semáforos y sugieren ajustes de ±150-250 kcal según progreso.
- Frontend Nutrición: el formulario de perfil (`NutritionProfileSetup`) ahora captura entrenos/semana, pasos diarios, nivel (principiante/intermedio/avanzado), perfil metabólico (tolerante/mixto/intolerante), cintura, % grasa y envía esos campos al backend al guardar el perfil.
- Calendario Nutricional: se añadió botón "Menú del día" por jornada para llamar a `/api/nutrition-v2/generate-full-day-menus`, mostrando estado de generación y mensaje informativo; backend corrige generación masiva con helper compartido y expone `day_id` en el plan activo para identificar días.
- Control nutricional integral: reevaluación normocalórica usa IEC (peso/cintura en 14 días) con acciones ROJO/AMARILLO/VERDE/VERDE+; se amplían sospechas (peso ±2% en 7 días); se añaden endpoints de saltos de dieta (`POST/GET /api/nutrition-v2/diet-breaks`) con sugerencia de compensación semanal (manteniendo proteína ≥2 g/kg).
- Metabolismo: guardado de `metabolic_score`/`metabolic_confidence` en el perfil; si la confianza es baja, se fuerza perfil mixto; cálculo de macros aplica guardarraíles (proteína mínima por fase/level, grasa mínima 0.6 g/kg o 20% kcal) y reparte carbohidratos con las calorías restantes; se normaliza usando el perfil metabólico y nivel.
- Evaluación metabólica cuantificada: nuevo endpoint `/api/nutrition-v2/metabolic-evaluate` que calcula score S a partir de respuestas y señales objetivas, determina confianza, aplica anti-ruido (2 reevaluaciones para cambiar, máximo 1 categoría por ciclo) y actualiza el perfil; columnas añadidas a `app.nutrition_profiles` para pendientes y última evaluación.
- UI Nutrición: se añade el componente de cuestionario metabólico (score S, señales objetivas y anti-ruido) integrado en `NutritionProfileSetup`; el perfil muestra score, confianza y pendientes, y conserva los campos metabólicos al guardar el perfil para evitar sobrescrituras.
- Puente Entrenamiento↔Nutrición: nuevo endpoint `/api/bridge/training-summary` calcula kcal/macros base (con perfil y objetivo) y aplica carb cycling por tipo de día (D0/D1/D2) redistribuyendo carbohidratos según reglas del puente; responde guía coordinada (deload/fatiga) para entrenamiento. Ruta montada en `server.js`.
- Ajuste carb cycling según CLS: el puente ahora escala deltas de carbohidratos (D2 hasta +20%, D0 hasta -20%) en función del score de carga semanal y agrega recomendaciones cuando cae el rendimiento en normocalórica.

## 30.01.2026

- HipertrofiaV2 ahora aplica ajustes de volumen/intensidad según el ajuste menstrual diario para usuarias femeninas, integrando el endpoint de ciclo en `/api/hipertrofiav2/current-session-with-adjustments`.
- La UI de sesiones de HipertrofiaV2 consume el ajuste menstrual y muestra aviso en el modal de sesión; se fusiona la sesión ajustada desde backend con la local.
- Habilitado el módulo de ciclo menstrual: la API ahora expone `/api/menstrual-cycle` y la app muestra la pestaña solo cuando el backend confirma usuarios femeninos, alineando la ruta de navegación (`/menstrual-cycle`) con el router.
- Ajustado el estado activo en `/api/training/state` para ignorar planes cancelados/draft y la cancelación de rutina ahora desmarca `is_current` para evitar bloqueos al generar planes nuevos.
- Planes con inicio en lunes: el modal final cambia a "Guardar plan" y la pestaña de hoy respeta la fecha de inicio futura para no mostrar sesión el viernes.
- Fix en `TodayTrainingTab`: evitar uso de `plan` antes de inicializar para corregir el error en la pestaña de rutinas.
- Confirmación de plan ahora envía `startConfig` al backend y `/confirm-plan` respeta la fecha de inicio para programar el calendario correctamente.
- Opciones de inicio en jueves/viernes/sábado ahora incluyen sábados cuando corresponde para programar correctamente la primera semana.
- Redistribución en `ensureWorkoutScheduleV3` ahora permite ajustar planes D1-D5 si el usuario elige un inicio distinto a lunes.
- HipertrofiaV2 ahora permite viernes+sábado en calendario, normaliza startDate en generación y elimina el modal duplicado de inicio.
- Cabecera de Rutinas usa calendario real (`workout_schedule`) para duración y frecuencia, evitando fallbacks incorrectos.
- Frecuencia en cabecera de Rutinas se redondea a entero según el promedio real de sesiones/semana.
- Backend: permitido CORS para `http://192.168.1.68:5173` para acceso desde móvil en red local.
- UI: sistema Tech-Lux consolidado (assets, fondos, texturas, halo, tipografías Urbanist/Manrope, cards neutras con glass y acentos sutiles, ancho de layout unificado) aplicado a Dashboard, Metodologías, Oposiciones, Rutinas, Nutrición, Perfil, Corrección IA y Entrenamiento en casa.
- UI: navegación y branding actualizados (barra superior glass con logo/perfil en cápsulas, favicon actualizado, barra inferior tipo dock con safe-area, textos de cabecera más funcionales).
- UI: reproductor flotante de música optimizado (play.webp, tamaño 72x72, sin fondo, drag móvil y bloqueo de scroll durante el arrastre).
- UI: Rutinas/Metodologías y flujo de planes unificados (tabs con gradiente activo, calendario móvil con lista y modal responsive con cierre visible, modales de plan/confirmación/plan activo, calentamientos, RIR, entrenamiento parcial y detalle de día con estilo premium).
- UI: Nutrición/Perfil alineados al sistema (tabs premium, cards e inputs glass, modal de pendientes con mayor contraste, calculadora con CTA degradado).
- UI: Entrenamiento en casa alineado al sistema (pantalla e historial, equipamiento con bordes por acento, modales de plan generado con padding/scroll, rechazo y calentamiento).
- UI: Corrección por IA (imagen y video) adaptada al estilo Tech-Lux con cards premium, bordes sutiles por acento y CTAs coherentes.
- UI: modal de detalle de día del plan ahora es más responsive en móvil (altura adaptable, tipografías y cards compactadas).
- UI: calendario de Rutinas (detalle de día) ajusta centrado y altura en móvil con scroll interno controlado.
- UI: los modales bloquean el scroll del fondo cuando están abiertos para evitar desplazamientos accidentales.
- UI: fondos Tech-Lux aclarados en móvil (más luz en la imagen y overlay menos oscuro).
- UI: padding superior en móvil alineado con Nutrición para Dashboard, Metodologías, Oposiciones, Rutinas, Perfil, Entrenamiento en casa y Corrección IA.
- Fix: cola offline respeta timeout desde `item.metadata`/`item.options` en reintentos para evitar error de variables no definidas.
- UI: login y registro alineados al estilo Tech-Lux (fondos, cards glass, CTAs premium y formularios con inputs coherentes).
- UI: módulo de Ciclo Menstrual alineado al estilo Tech-Lux manteniendo acentos rosados (sección principal, tarjetas y onboarding).

## 28.01.2026

- Adaptación MindFeed: generadores Full/Half Body alineados a spec (duraciones, días, reps, RIR, descansos), sesiones reales guardadas en `methodology_exercise_sessions` con `exercises_data`, y soporte en `/training-session/start/methodology` para planes `Adaptation`.
- Adaptación: auto‑evaluación y tracking usan `sessions_per_week` del bloque, conteo de sesiones filtrado por `methodology_plan_id`, y nuevo endpoint `/api/adaptation/sessions` para listar sesiones del bloque activo.
- BD: migración `20260128_adaptation_block_metadata.sql` añade `ai_tag` y `sessions_per_week` a `app.adaptation_blocks` para cumplir spec.
- Script `scripts/simulate-hipertrofiaV2.mjs`: ahora crea un usuario novato automáticamente, ejecuta el bloque de adaptación real (generate → sesiones → evaluate → transition) y luego simula el plan HipertrofiaV2 completo con días skip/off‑plan configurables.
- Script `scripts/simulate-hipertrofiaV2.mjs` ahora simula comportamiento de usuario real: días skip/fatiga/top, fatiga objetiva (auto-detect), usa progreso real de sesión y refleja estos estados en los reportes técnico/narrativo.
- Fix en `backend/routes/trainingState.js`: el endpoint `/api/training/cancel-plan` usa tablas con esquema `app.*` para evitar error de relación inexistente.
- Fix en `backend/routes/exerciseCatalog.js`: búsqueda por nombre en calistenia castea `exercise_id` a texto para evitar error de `LOWER(integer)` que rompía `/api/exercise-catalog/search/by-name`.
- Script de simulación: `parseReps` ahora normaliza reps <= 0 a 10 para evitar `reps_completed` nulo en `save-set`.
- Catálogo de ejercicios: `/search/by-name` prioriza tablas de hipertrofia/calistenia antes del mock para devolver `exercise_id` numérico.
- Script de simulación: mapea `exercise_id` desde el plan y normaliza ids no numéricos para evitar insertar slugs en `save-set`.
- Datos BD: asignados `exercise_id` (69–75) a 7 ejercicios con IDs nulos en `app."Ejercicios_Hipertrofia"` para evitar fallos en `save-set`.
- Reportes HipertrofiaV2: añadido log manual de deload planificado (semana 6) con evidencia desde `plan_data`.
- Script de simulación: detecta semanas `deload` en `plan_data` y las registra automáticamente en el reporte.
- BD: asignados `exercise_id` (76–110) a 35 ejercicios con IDs nulos en `app."Ejercicios_Hipertrofia"` y backfill de `exercise_id` en `app.methodology_exercise_progress` por nombre (quedan 46 filas con nombre genérico "Ejercicio").
- Script `scripts/simulate-hipertrofiaV2.mjs`: añade validaciones de intensidad por día, reps objetivo, RIR por set, orden Multi→Uni→Analítico y consistencia de volumen (series) con baseline; ahora quedan reflejadas en el reporte técnico.
- Adaptación: ajuste del insert en `workout_schedule` para usar columnas reales (`day_name`, `day_abbrev`, `session_order`, `week_session_order`) y evitar el error `day_in_week` al generar el bloque.
- Adaptación: transición a D1-D5 ahora castea argumentos a `integer` para evitar la ambigüedad con la función `app.transition_to_hypertrophy(uuid, uuid)`.
- Script de simulación: el bloque de adaptación fuerza una progresión mínima del 10% en la última sesión para garantizar >8% y permitir la transición en el run “sin ruido”.

## 27.01.2026

- Documento de arquitectura rápida para onboarding: Supabase como BD/Storage y backend Express como API principal en `docs/COMO_FUNCIONA_SUPABASE_Y_SERVIDOR_LOCAL.md`.
- Plan detallado por fases para alinear HypertrofiaV2 con la spec MindFeed v1 en `docs/PLAN_IMPLEMENTACION_MINDFEED_COMPLIANCE_V1.md`.
- Bitácora de checkpoints para continuidad de la implementación MindFeed v1 en `docs/CHECKPOINTS_MINDFEED_COMPLIANCE_V1.md` y regla añadida en `AGENTS.md` para revisarla siempre.
- Se introduce el contrato de ruleset MindFeed v1 en BD (`app.mindfeed_rulesets`, `app.get_active_mindfeed_ruleset`) y se carga el ruleset activo para `hipertrofia_v2_principiante`.
- Se alinea la generación D1–D5 y el ajuste de sesiones con la spec: deload semana 6 con -30%/-50%, descansos por tipo (90/60/50), volumen por perfiles y solapamiento usando el factor decidido por backend.
- Se refuerza la lógica SQL de deload, prioridad y transiciones: deload reactivo, freeze/reactivación NP con mean RIR, repetición de bloque de adaptación con penalización/cap, y transición automática a intermedio tras semana 12.
- Limpieza menor: se elimina una variable sin uso (`sessionId`) en `backend/routes/adaptationBlock.js` para reducir warnings.
- `/start/methodology` ahora aplica ajustes MindFeed de forma idempotente (marca `mindfeed_adjusted_week`) y bloquea prioridad/top set durante deload programado por ruleset.
- Nueva migración de seguridad: `20260127_mindfeed_progression_programmed_deload_guard.sql` evita progresión en `apply_microcycle_progression` cuando la semana actual es deload programado.
- Ajuste menor de calidad: `parseExercisesValue` usa `catch {}` para no introducir warnings nuevos de ESLint.
- El script `scripts/simulate-hipertrofiaV2.mjs` ahora simula RIR y adherencia de forma determinista y no perfecta (RIR por set con fatiga y recorte ocasional de series) para testear progresión/deload con más realismo.
- Fix del script de simulación: `rir_reported` en BD es `integer`, así que el script ahora redondea el RIR por set a enteros (0–5) para evitar el error en `/api/hipertrofiav2/save-set`.
- Fix SQL: se evita `numeric field overflow` en `app.evaluate_level_change` acotando `adherence` a 0–100 y eliminando la precisión fija en la variable interna.
- Script de simulación: se añade `FORCE_LEVEL` para forzar el nivel (p. ej. `Principiante`) sin depender del perfil del usuario.
- Backend: `/training-session/start/methodology` ahora acepta `week_number=0` para soportar la semana 0 de calibración.
- SQL: `advance_cycle_day` ignora progresión/conteo de microciclo en semana 0 y `activate_deload` aplica deload planificado en la semana definida por ruleset (no la semana actual).
- Script de simulación: `INCLUDE_WEEK_0` activado por defecto, RIR mínimo 3 en semana 0 y microciclo/deload no se contabiliza en calibración.
- Script de simulación: refuerzo de payload para `start/methodology` con fallback de semana (id Wn) y error explícito si faltan datos.
- Backend: `routes/trainingSession.js` ahora acepta `week_number=0` para permitir la semana 0 desde el endpoint realmente usado por `server.js`.
- Backend: `routes/trainingSession.js` sincroniza `current_week` con el `week_number` recibido para que la semana 0 no cuente como microciclo y el deload planificado caiga en semana 6.

## 23.01.2026

- Tracking RIR pasa a popup obligatorio al terminar cada serie en sesiones con tracking habilitado, bloqueando el avance hasta guardar.
- Popup de tracking RIR vuelve a mostrarse cuando la sesión no trae flag de tracking, para no bloquear el registro de series.
- Cola offline deja de reintentar peticiones no reintetables (4xx) para evitar bucles en `sessions/start`.
- Cola offline respeta timeouts personalizados para evitar abortos en `active-plan`.
- Fix en `connectionManager`: timeout usa `metadata`/`options` y evita ReferenceError en requests.
- Timeout extendido para `sessions/start` para evitar abortos al iniciar entrenamiento.
- Cancelación masiva de planes de entrenamiento del usuario 33 para limpiar estado activo.
- Programación de calendario usa fecha local en `ensureWorkoutScheduleV3` para evitar desfases UTC.
- Confirmación de plan ahora cancela planes activos/confirmados previos para mantener un único plan activo.
- Modal de plan activo al generar nuevas rutinas con opción de ir al plan o cancelar y continuar.
- getTrainingStateFromDB ahora desenvuelve la respuesta para detectar planes activos desde `/training/state`.
- Aviso de plan activo se dispara al seleccionar metodología/IA y se renderiza al final para quedar por encima de otros modales.

## 22.01.2026

- Evita que el reproductor se abra al arrastrar el botón flotante mediante un umbral de movimiento para distinguir click de drag.
- Añadidas confirmaciones de “ninguna/ninguno” en listas de perfil (alergias, medicación, lesiones, suplementación y alimentos excluidos) para guardar explícitamente que no aplica.
- Cálculo de progreso del perfil por campo alineado con BD y modal de pendientes con edición inline (incluye preferencias IA y equipamiento con opción “no tengo”).
- Home convertido en dashboard con estado del plan activo, sesión de hoy y accesos rápidos.
- Acceso directo a la calculadora de composición corporal desde el modal de campos pendientes.
- Notas de progreso excluidas del cálculo de completitud del perfil al ser opcionales.
- Parche SQL en `calculate_mean_rir_last_microcycle` para promediar últimas 5 sesiones y evitar error al avanzar microciclo.
- Ajuste SQL en `evaluate_level_change` para calcular `progression_rate` con columnas reales de `hypertrophy_progression`.
- Reporte de auditoria MindFeed (backend/BD) en `docs/AUDITORIA_MINDFEED_COMPLIANCE.md`.

## 21.01.2026

- Ajuste en la deteccion del entrenamiento de hoy para priorizar la sesion real del dia y evitar que se marque descanso cuando hay entrenamiento.
- Envio de la fecha de la sesion desde la pestana de hoy para asegurar que se muestre lo realizado en el dia.
- Bloqueo de ejercicios rechazados en el entrenamiento en casa: se incluye la lista en el prompt, se filtran tras la IA y se guardan con upsert en `home_exercise_rejections`.
- Ayuda contextual en `EditableField` con helpText y etiqueta unificada.
- Aclaracion de etiquetas en perfil (nivel de actividad con ayuda, peso y estatura con unidades).
- Modal de cambios sin guardar al cambiar de pestana en el perfil.
- Se amplio el constraint de estados de sesion para permitir `incomplete` y `abandoned` en la tabla de sesiones de metodologia.
- Script de simulacion HipertrofiaV2 y reportes tecnico/narrativo en `docs/`.
- Mejora de logging en el script de simulacion HipertrofiaV2 para identificar el endpoint que falla.
- Fix en cancelacion de plan activo: UPDATE con ORDER BY/LIMIT reemplazado por CTE.
- Ajuste del script HipertrofiaV2 para enviar RIR entero y normalizar exercise_id.
- Busqueda por nombre en catalogo de ejercicios extendida a hipertrofia + fallback de exercise_id en simulacion.
