-- DATA-002 (auditoría ECI) · Fase 2: limpieza de huérfanos + integridad referencial.
--
-- CAUSA RAÍZ: no había FKs entre progress/sessions/plans, y varias vías de borrado
-- no cascadeaban a mano:
--   * DELETE /api/training-session/cancel/methodology/:sessionId
--     (backend/routes/trainingSession/complete.js:346) borraba la sesión pero NO
--     su methodology_exercise_progress -> 5.848 progresos huérfanos (datos reales).
--   * Borrados de methodology_plans (draftCleaner.js, sessionCleanup*, weekend en
--     complete.js:357) no borraban las methodology_exercise_sessions -> 69 sesiones
--     huérfanas. (+ 168 progress y 1 sesión sin usuario.)
--
-- APLICADO EN PRODUCCIÓN el 2026-07-16 mediante script transaccional (no este .sql).
-- Resultado: 69 sesiones + 6.134 progresos huérfanos borrados (6.134 > 5.848 porque
-- borrar las sesiones huérfanas destapó más progreso que las referenciaba).
--   BACKUP REVERSIBLE:
--     app.data002_orphan_sessions_bak_20260716  (69 filas)
--     app.data002_orphan_progress_bak_20260716  (6.134 filas)
--
-- SEGURIDAD DEL DISEÑO: methodology_exercise_history_complete referencia session y
-- plan con ON DELETE SET NULL (NO cascade), así que el HISTORIAL COMPLETADO sobrevive
-- a los borrados de sesión/plan. Solo se añade cascade en la cadena de trabajo
-- progress->session->plan y las referencias a user (borrado de cuenta cascadea).
--
-- Este fichero es la parte reproducible (las FKs). La limpieza de huérfanos previa
-- es prerrequisito (una FK no se puede crear con filas que la violan).

BEGIN;

ALTER TABLE app.methodology_exercise_progress
  ADD CONSTRAINT fk_mep_session FOREIGN KEY (methodology_session_id)
  REFERENCES app.methodology_exercise_sessions(id) ON DELETE CASCADE;

ALTER TABLE app.methodology_exercise_progress
  ADD CONSTRAINT fk_mep_user FOREIGN KEY (user_id)
  REFERENCES app.users(id) ON DELETE CASCADE;

ALTER TABLE app.methodology_exercise_sessions
  ADD CONSTRAINT fk_mes_plan FOREIGN KEY (methodology_plan_id)
  REFERENCES app.methodology_plans(id) ON DELETE CASCADE;

ALTER TABLE app.methodology_exercise_sessions
  ADD CONSTRAINT fk_mes_user FOREIGN KEY (user_id)
  REFERENCES app.users(id) ON DELETE CASCADE;

COMMIT;

-- Índices sobre las columnas FK (aceleran cascades y joins). Aplicados a prod con
-- CREATE INDEX CONCURRENTLY (fuera de transacción):
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mep_session ON app.methodology_exercise_progress (methodology_session_id);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mep_user    ON app.methodology_exercise_progress (user_id);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mes_plan    ON app.methodology_exercise_sessions (methodology_plan_id);
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mes_user    ON app.methodology_exercise_sessions (user_id);

-- NOTA para el código: con fk_mep_session en CASCADE, los DELETE manuales de
-- methodology_exercise_progress previos a borrar una sesión (p. ej.
-- backend/routes/routines/sessions.js:1737) son ahora redundantes pero inocuos.
-- El handler de cancelar (complete.js) ya no necesita el DELETE de progress que le
-- faltaba: la BD lo cascadea. Índices recomendados (si no existen) sobre las FK
-- para acelerar cascades: methodology_exercise_progress(methodology_session_id),
-- methodology_exercise_sessions(methodology_plan_id).
