-- 20260717_data003_fk_ambiguous_ids.sql
-- DATA-003 (fase 6): FKs de columnas *_id ambiguas con padre inequívoco y 0 huérfanos.
--
-- Del inventario de 32 columnas *_id sin FK, estas 6 tienen padre claro, tipo compatible
-- y 0 huérfanos (verificado read-only 2026-07-17) → se crean ya VALIDADAS:
--   1. manual_methodology_exercise_feedback.methodology_session_id (int, NOT NULL, 0 filas)
--   2. methodology_exercise_feedback.methodology_session_id       (int, NOT NULL, 1 fila)
--        → app.methodology_exercise_sessions(id). ON DELETE CASCADE, coherente con el
--          session_id de la fase 2 (feedback muere con su sesión).
--   3. nutrition_menu_generation_logs.meal_id (uuid, NULL, 851 filas) → nutrition_meals(id)
--   4. nutrition_menu_generation_logs.day_id  (uuid, NULL, 851 filas) → nutrition_plan_days(id)
--        → ON DELETE SET NULL: es una tabla de AUDITORÍA; preservar el registro histórico
--          aunque se borre la comida/día referenciados.
--   5. exercise_history.plan_id       (int, NULL, 0 filas) → methodology_plans(id)
--   6. user_exercise_feedback.plan_id (int, NULL, 0 filas) → methodology_plans(id)
--        → ON DELETE CASCADE, coherente con methodology_plan_id de la fase 2 (dato de plan).
--
-- DESCARTADAS del inventario (documentado): hypertrophy_set_logs.methodology_plan_id
-- (437 huérfanos, HpV2 usa modelo propio); nutrition_meal_items.alimento_id (22 huérfanos,
-- food_id es la col real); methodology_exercise_sessions.day_id (methodology_plan_days no
-- tiene PK id, day_id es lógico); session_template_id/combination_id (padre inexistente);
-- nutrition_menu_generation_logs.plan_id (int vs uuid, no ref a nutrition_plans);
-- Ejercicios_* (PK propia); alternative/source_exercise_id (text externos); tablas *_backup.
--
-- Idempotente (IF NOT EXISTS por constraint).

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_manual_meth_ex_feedback_session' AND conrelid='app."manual_methodology_exercise_feedback"'::regclass) THEN
    ALTER TABLE app."manual_methodology_exercise_feedback" ADD CONSTRAINT fk_manual_meth_ex_feedback_session
      FOREIGN KEY (methodology_session_id) REFERENCES app.methodology_exercise_sessions(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_meth_ex_feedback_session' AND conrelid='app."methodology_exercise_feedback"'::regclass) THEN
    ALTER TABLE app."methodology_exercise_feedback" ADD CONSTRAINT fk_meth_ex_feedback_session
      FOREIGN KEY (methodology_session_id) REFERENCES app.methodology_exercise_sessions(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_menu_gen_logs_meal' AND conrelid='app."nutrition_menu_generation_logs"'::regclass) THEN
    ALTER TABLE app."nutrition_menu_generation_logs" ADD CONSTRAINT fk_menu_gen_logs_meal
      FOREIGN KEY (meal_id) REFERENCES app.nutrition_meals(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_menu_gen_logs_day' AND conrelid='app."nutrition_menu_generation_logs"'::regclass) THEN
    ALTER TABLE app."nutrition_menu_generation_logs" ADD CONSTRAINT fk_menu_gen_logs_day
      FOREIGN KEY (day_id) REFERENCES app.nutrition_plan_days(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_exercise_history_plan' AND conrelid='app."exercise_history"'::regclass) THEN
    ALTER TABLE app."exercise_history" ADD CONSTRAINT fk_exercise_history_plan
      FOREIGN KEY (plan_id) REFERENCES app.methodology_plans(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_user_exercise_feedback_plan' AND conrelid='app."user_exercise_feedback"'::regclass) THEN
    ALTER TABLE app."user_exercise_feedback" ADD CONSTRAINT fk_user_exercise_feedback_plan
      FOREIGN KEY (plan_id) REFERENCES app.methodology_plans(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
