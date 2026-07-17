-- 20260717_data003_fk_user_id_not_valid.sql
-- DATA-003 (fase 1): FKs user_id -> app.users(id) donde faltaban.
--
-- Añade integridad referencial a 33 tablas base cuyo user_id (integer)
-- no tenía FK. Se usa NOT VALID: NO escanea ni bloquea las filas existentes (evita
-- locks largos y no falla por huérfanos de usuarios ya borrados); solo garantiza que
-- las ESCRITURAS NUEVAS referencien un usuario válido. ON DELETE CASCADE mantiene
-- operativo el borrado de usuario limpiando sus datos hijos.
--
-- Excluidas: tablas *_backup/*_dupbackup y las que ya tenían FK.
-- Idempotente (DO/IF NOT EXISTS). Verificado en inventario read-only: user_id integer
-- en las 33 tablas; huérfanos preexistentes en autoreg_stall,
-- calistenia_autoreg_state, hypertrophy_progression, hypertrophy_set_logs,
-- plan_progression_offsets, user_sessions (no bloquean NOT VALID; validar tras limpiar).

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_autoreg_stall_user_id' AND conrelid='app."autoreg_stall"'::regclass) THEN
    ALTER TABLE app."autoreg_stall" ADD CONSTRAINT fk_autoreg_stall_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_calistenia_autoreg_state_user_id' AND conrelid='app."calistenia_autoreg_state"'::regclass) THEN
    ALTER TABLE app."calistenia_autoreg_state" ADD CONSTRAINT fk_calistenia_autoreg_state_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_casa_autoreg_state_user_id' AND conrelid='app."casa_autoreg_state"'::regclass) THEN
    ALTER TABLE app."casa_autoreg_state" ADD CONSTRAINT fk_casa_autoreg_state_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_crossfit_autoreg_state_user_id' AND conrelid='app."crossfit_autoreg_state"'::regclass) THEN
    ALTER TABLE app."crossfit_autoreg_state" ADD CONSTRAINT fk_crossfit_autoreg_state_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_daily_nutrition_log_user_id' AND conrelid='app."daily_nutrition_log"'::regclass) THEN
    ALTER TABLE app."daily_nutrition_log" ADD CONSTRAINT fk_daily_nutrition_log_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_exercise_history_user_id' AND conrelid='app."exercise_history"'::regclass) THEN
    ALTER TABLE app."exercise_history" ADD CONSTRAINT fk_exercise_history_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_funcional_autoreg_state_user_id' AND conrelid='app."funcional_autoreg_state"'::regclass) THEN
    ALTER TABLE app."funcional_autoreg_state" ADD CONSTRAINT fk_funcional_autoreg_state_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_halterofilia_autoreg_state_user_id' AND conrelid='app."halterofilia_autoreg_state"'::regclass) THEN
    ALTER TABLE app."halterofilia_autoreg_state" ADD CONSTRAINT fk_halterofilia_autoreg_state_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_heavy_duty_autoreg_state_user_id' AND conrelid='app."heavy_duty_autoreg_state"'::regclass) THEN
    ALTER TABLE app."heavy_duty_autoreg_state" ADD CONSTRAINT fk_heavy_duty_autoreg_state_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_historico_ejercicios_user_id' AND conrelid='app."historico_ejercicios"'::regclass) THEN
    ALTER TABLE app."historico_ejercicios" ADD CONSTRAINT fk_historico_ejercicios_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_home_combination_exercise_history_user_id' AND conrelid='app."home_combination_exercise_history"'::regclass) THEN
    ALTER TABLE app."home_combination_exercise_history" ADD CONSTRAINT fk_home_combination_exercise_history_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_home_exercise_rejections_user_id' AND conrelid='app."home_exercise_rejections"'::regclass) THEN
    ALTER TABLE app."home_exercise_rejections" ADD CONSTRAINT fk_home_exercise_rejections_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_hypertrophy_blocks_user_id' AND conrelid='app."hypertrophy_blocks"'::regclass) THEN
    ALTER TABLE app."hypertrophy_blocks" ADD CONSTRAINT fk_hypertrophy_blocks_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_hypertrophy_progression_user_id' AND conrelid='app."hypertrophy_progression"'::regclass) THEN
    ALTER TABLE app."hypertrophy_progression" ADD CONSTRAINT fk_hypertrophy_progression_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_hypertrophy_set_logs_user_id' AND conrelid='app."hypertrophy_set_logs"'::regclass) THEN
    ALTER TABLE app."hypertrophy_set_logs" ADD CONSTRAINT fk_hypertrophy_set_logs_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_manual_methodology_exercise_feedback_user_id' AND conrelid='app."manual_methodology_exercise_feedback"'::regclass) THEN
    ALTER TABLE app."manual_methodology_exercise_feedback" ADD CONSTRAINT fk_manual_methodology_exercise_feedback_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_methodology_exercise_feedback_user_id' AND conrelid='app."methodology_exercise_feedback"'::regclass) THEN
    ALTER TABLE app."methodology_exercise_feedback" ADD CONSTRAINT fk_methodology_exercise_feedback_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_methodology_plans_user_id' AND conrelid='app."methodology_plans"'::regclass) THEN
    ALTER TABLE app."methodology_plans" ADD CONSTRAINT fk_methodology_plans_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_mindfeed_priority_events_user_id' AND conrelid='app."mindfeed_priority_events"'::regclass) THEN
    ALTER TABLE app."mindfeed_priority_events" ADD CONSTRAINT fk_mindfeed_priority_events_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_mindfeed_transition_events_user_id' AND conrelid='app."mindfeed_transition_events"'::regclass) THEN
    ALTER TABLE app."mindfeed_transition_events" ADD CONSTRAINT fk_mindfeed_transition_events_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_nutrition_plans_user_id' AND conrelid='app."nutrition_plans"'::regclass) THEN
    ALTER TABLE app."nutrition_plans" ADD CONSTRAINT fk_nutrition_plans_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_nutrition_plans_v2_user_id' AND conrelid='app."nutrition_plans_v2"'::regclass) THEN
    ALTER TABLE app."nutrition_plans_v2" ADD CONSTRAINT fk_nutrition_plans_v2_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_oposiciones_autoreg_state_user_id' AND conrelid='app."oposiciones_autoreg_state"'::regclass) THEN
    ALTER TABLE app."oposiciones_autoreg_state" ADD CONSTRAINT fk_oposiciones_autoreg_state_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_plan_progression_offsets_user_id' AND conrelid='app."plan_progression_offsets"'::regclass) THEN
    ALTER TABLE app."plan_progression_offsets" ADD CONSTRAINT fk_plan_progression_offsets_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_powerlifting_autoreg_state_user_id' AND conrelid='app."powerlifting_autoreg_state"'::regclass) THEN
    ALTER TABLE app."powerlifting_autoreg_state" ADD CONSTRAINT fk_powerlifting_autoreg_state_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_progreso_usuario_user_id' AND conrelid='app."progreso_usuario"'::regclass) THEN
    ALTER TABLE app."progreso_usuario" ADD CONSTRAINT fk_progreso_usuario_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_technique_corrections_user_id' AND conrelid='app."technique_corrections"'::regclass) THEN
    ALTER TABLE app."technique_corrections" ADD CONSTRAINT fk_technique_corrections_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_user_custom_equipment_user_id' AND conrelid='app."user_custom_equipment"'::regclass) THEN
    ALTER TABLE app."user_custom_equipment" ADD CONSTRAINT fk_user_custom_equipment_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_user_equipment_user_id' AND conrelid='app."user_equipment"'::regclass) THEN
    ALTER TABLE app."user_equipment" ADD CONSTRAINT fk_user_equipment_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_user_exercise_feedback_user_id' AND conrelid='app."user_exercise_feedback"'::regclass) THEN
    ALTER TABLE app."user_exercise_feedback" ADD CONSTRAINT fk_user_exercise_feedback_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_user_home_training_stats_user_id' AND conrelid='app."user_home_training_stats"'::regclass) THEN
    ALTER TABLE app."user_home_training_stats" ADD CONSTRAINT fk_user_home_training_stats_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_user_sessions_user_id' AND conrelid='app."user_sessions"'::regclass) THEN
    ALTER TABLE app."user_sessions" ADD CONSTRAINT fk_user_sessions_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_workout_schedule_user_id' AND conrelid='app."workout_schedule"'::regclass) THEN
    ALTER TABLE app."workout_schedule" ADD CONSTRAINT fk_workout_schedule_user_id
      FOREIGN KEY (user_id) REFERENCES app.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

COMMIT;
