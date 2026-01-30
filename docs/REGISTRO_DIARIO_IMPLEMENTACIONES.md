# Registro diario de implementaciones

## 30.01.2026

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
