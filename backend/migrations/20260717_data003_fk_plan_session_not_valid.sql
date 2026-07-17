-- 20260717_data003_fk_plan_session_not_valid.sql
-- DATA-003 (fase 2): FKs methodology_plan_id y session_id, NOT VALID.
--
-- Continúa DATA-003 tras la fase 1 (user_id). Añade integridad referencial donde el
-- target es INEQUÍVOCO, con NOT VALID (no escanea/bloquea existentes) y ON DELETE
-- CASCADE. Verificado por tasa de huérfanos en inventario read-only.
--
-- EXCLUIDAS por target equivocado (modelo ambiguo):
--   * hypertrophy_set_logs.methodology_plan_id (437 huérfanos) y .session_id (452):
--     referencian el modelo propio de HipertrofiaV2, no las tablas methodology_*.
--   * auth_logs.session_id: es sesión de autenticación, no de ejercicio.
-- APLAZADO: exercise_id -> ejercicios(id): desajuste de tipo (integer vs bigint) y
--   tablas legacy Ejercicios_* en deprecación; requiere alinear tipos primero.
-- Idempotente (IF NOT EXISTS).

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_calistenia_autoreg_state_methodology_plan_id' AND conrelid='app."calistenia_autoreg_state"'::regclass) THEN
    ALTER TABLE app."calistenia_autoreg_state" ADD CONSTRAINT fk_calistenia_autoreg_state_methodology_plan_id
      FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_casa_autoreg_state_methodology_plan_id' AND conrelid='app."casa_autoreg_state"'::regclass) THEN
    ALTER TABLE app."casa_autoreg_state" ADD CONSTRAINT fk_casa_autoreg_state_methodology_plan_id
      FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_crossfit_autoreg_state_methodology_plan_id' AND conrelid='app."crossfit_autoreg_state"'::regclass) THEN
    ALTER TABLE app."crossfit_autoreg_state" ADD CONSTRAINT fk_crossfit_autoreg_state_methodology_plan_id
      FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_funcional_autoreg_state_methodology_plan_id' AND conrelid='app."funcional_autoreg_state"'::regclass) THEN
    ALTER TABLE app."funcional_autoreg_state" ADD CONSTRAINT fk_funcional_autoreg_state_methodology_plan_id
      FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_halterofilia_autoreg_state_methodology_plan_id' AND conrelid='app."halterofilia_autoreg_state"'::regclass) THEN
    ALTER TABLE app."halterofilia_autoreg_state" ADD CONSTRAINT fk_halterofilia_autoreg_state_methodology_plan_id
      FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_heavy_duty_autoreg_state_methodology_plan_id' AND conrelid='app."heavy_duty_autoreg_state"'::regclass) THEN
    ALTER TABLE app."heavy_duty_autoreg_state" ADD CONSTRAINT fk_heavy_duty_autoreg_state_methodology_plan_id
      FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_hypertrophy_blocks_methodology_plan_id' AND conrelid='app."hypertrophy_blocks"'::regclass) THEN
    ALTER TABLE app."hypertrophy_blocks" ADD CONSTRAINT fk_hypertrophy_blocks_methodology_plan_id
      FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_mindfeed_priority_events_methodology_plan_id' AND conrelid='app."mindfeed_priority_events"'::regclass) THEN
    ALTER TABLE app."mindfeed_priority_events" ADD CONSTRAINT fk_mindfeed_priority_events_methodology_plan_id
      FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_mindfeed_transition_events_methodology_plan_id' AND conrelid='app."mindfeed_transition_events"'::regclass) THEN
    ALTER TABLE app."mindfeed_transition_events" ADD CONSTRAINT fk_mindfeed_transition_events_methodology_plan_id
      FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_oposiciones_autoreg_state_methodology_plan_id' AND conrelid='app."oposiciones_autoreg_state"'::regclass) THEN
    ALTER TABLE app."oposiciones_autoreg_state" ADD CONSTRAINT fk_oposiciones_autoreg_state_methodology_plan_id
      FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_plan_progression_offsets_methodology_plan_id' AND conrelid='app."plan_progression_offsets"'::regclass) THEN
    ALTER TABLE app."plan_progression_offsets" ADD CONSTRAINT fk_plan_progression_offsets_methodology_plan_id
      FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_powerlifting_autoreg_state_methodology_plan_id' AND conrelid='app."powerlifting_autoreg_state"'::regclass) THEN
    ALTER TABLE app."powerlifting_autoreg_state" ADD CONSTRAINT fk_powerlifting_autoreg_state_methodology_plan_id
      FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_technique_corrections_methodology_plan_id' AND conrelid='app."technique_corrections"'::regclass) THEN
    ALTER TABLE app."technique_corrections" ADD CONSTRAINT fk_technique_corrections_methodology_plan_id
      FOREIGN KEY (methodology_plan_id) REFERENCES app.methodology_plans(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_adaptation_technique_flags_session_id' AND conrelid='app."adaptation_technique_flags"'::regclass) THEN
    ALTER TABLE app."adaptation_technique_flags" ADD CONSTRAINT fk_adaptation_technique_flags_session_id
      FOREIGN KEY (session_id) REFERENCES app.methodology_exercise_sessions(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_carb_timing_logs_session_id' AND conrelid='app."carb_timing_logs"'::regclass) THEN
    ALTER TABLE app."carb_timing_logs" ADD CONSTRAINT fk_carb_timing_logs_session_id
      FOREIGN KEY (session_id) REFERENCES app.methodology_exercise_sessions(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_exercise_history_session_id' AND conrelid='app."exercise_history"'::regclass) THEN
    ALTER TABLE app."exercise_history" ADD CONSTRAINT fk_exercise_history_session_id
      FOREIGN KEY (session_id) REFERENCES app.methodology_exercise_sessions(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_technique_corrections_session_id' AND conrelid='app."technique_corrections"'::regclass) THEN
    ALTER TABLE app."technique_corrections" ADD CONSTRAINT fk_technique_corrections_session_id
      FOREIGN KEY (session_id) REFERENCES app.methodology_exercise_sessions(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_warmup_sets_tracking_session_id' AND conrelid='app."warmup_sets_tracking"'::regclass) THEN
    ALTER TABLE app."warmup_sets_tracking" ADD CONSTRAINT fk_warmup_sets_tracking_session_id
      FOREIGN KEY (session_id) REFERENCES app.methodology_exercise_sessions(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

COMMIT;
