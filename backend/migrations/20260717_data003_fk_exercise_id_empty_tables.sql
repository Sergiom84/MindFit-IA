-- 20260717_data003_fk_exercise_id_empty_tables.sql
-- DATA-003 (fase 5): FKs exercise_id -> app.ejercicios(id) en las 2 tablas integer vacías.
--
-- Completa la fase 4 (que cubrió las columnas ya bigint). Estas dos son de HipertrofiaV2
-- y su exercise_id es integer; como ejercicios.id es bigint, primero se alinea el tipo.
--
-- Verificado en inventario read-only + trazado de código (2026-07-17):
--   · Ambas tablas están VACÍAS (0 filas) → ALTER TYPE bigint es instantáneo y ADD
--     CONSTRAINT valida al momento; sin riesgo sobre datos existentes.
--   · adaptation_technique_flags.exercise_id: NULLABLE. En la práctica el frontend
--     (AdaptationDashboard) llama a handleReportTechnique() SIN argumento, así que hoy
--     entra siempre NULL → el FK (que permite NULL) es inocuo y solo protege si en el
--     futuro se pasa un id real.
--   · warmup_sets_tracking.exercise_id: NOT NULL, pero su endpoint
--     (POST /save-warmup-completion) NO tiene llamador en el frontend actualmente →
--     el FK no rompe nada hoy y deja correcta la integridad para cuando se use.
--   · En HipertrofiaV2 el identificador de ejercicio es siempre app.ejercicios.id (las
--     columnas hermanas hypertrophy_* / methodology_exercise_progress lo referencian con
--     0 huérfanos, ver fase 4).
--
-- ON DELETE NO ACTION: coherente con la fase 4 (referencia a catálogo, no ownership).
-- Idempotente: guardas por tipo (ALTER) y por constraint (ADD).

BEGIN;

-- adaptation_technique_flags.exercise_id (integer -> bigint) + FK (nullable)
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='app' AND table_name='adaptation_technique_flags' AND column_name='exercise_id') = 'integer' THEN
    ALTER TABLE app."adaptation_technique_flags" ALTER COLUMN exercise_id TYPE bigint;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_adaptation_technique_flags_exercise_id' AND conrelid='app."adaptation_technique_flags"'::regclass) THEN
    ALTER TABLE app."adaptation_technique_flags" ADD CONSTRAINT fk_adaptation_technique_flags_exercise_id
      FOREIGN KEY (exercise_id) REFERENCES app.ejercicios(id) ON DELETE NO ACTION;
  END IF;
END $$;

-- warmup_sets_tracking.exercise_id (integer -> bigint) + FK (not null)
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema='app' AND table_name='warmup_sets_tracking' AND column_name='exercise_id') = 'integer' THEN
    ALTER TABLE app."warmup_sets_tracking" ALTER COLUMN exercise_id TYPE bigint;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_warmup_sets_tracking_exercise_id' AND conrelid='app."warmup_sets_tracking"'::regclass) THEN
    ALTER TABLE app."warmup_sets_tracking" ADD CONSTRAINT fk_warmup_sets_tracking_exercise_id
      FOREIGN KEY (exercise_id) REFERENCES app.ejercicios(id) ON DELETE NO ACTION;
  END IF;
END $$;

COMMIT;
