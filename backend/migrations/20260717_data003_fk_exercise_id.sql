-- 20260717_data003_fk_exercise_id.sql
-- DATA-003 (fase 4): FKs exercise_id -> app.ejercicios(id).
--
-- Añade integridad referencial a las columnas exercise_id que referencian el catálogo
-- unificado app.ejercicios. Verificado en inventario read-only (2026-07-17):
--   · Las 5 columnas afectadas ya son BIGINT (mismo tipo que ejercicios.id, PK bigint),
--     así que NO hay cambio de tipo.
--   · 0 huérfanos contra ejercicios en todas ellas (exercise_tags 110, hypertrophy_
--     progression 120, hypertrophy_set_logs 6208, methodology_exercise_progress 6216;
--     hypertrophy_weekly_templates vacía) → se pueden crear ya VALIDADAS (sin NOT
--     VALID): el escaneo es instantáneo/limpio.
--   · Hoy no existe ningún FK apuntando a app.ejercicios; estos son los primeros.
--
-- EXCLUIDA hypertrophy_user_progress: es una VISTA (relkind v), no admite FK.
-- NOTA: las tablas legacy Ejercicios_* NO se tocan: su exercise_id es su PROPIA PRIMARY
-- KEY (catálogos independientes), no una referencia a ejercicios.
--
-- ON DELETE NO ACTION: exercise_id es una referencia a CATÁLOGO (no ownership). Impide
-- borrar un ejercicio aún referenciado por logs/progreso/tags, protegiendo el historial
-- de usuario; un ejercicio se deprecaría, no se borraría en cascada.
--
-- Idempotente (IF NOT EXISTS por constraint). En un restore limpio desde baseline las
-- tablas están vacías y valida al instante.

BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_exercise_tags_exercise_id' AND conrelid='app."exercise_tags"'::regclass) THEN
    ALTER TABLE app."exercise_tags" ADD CONSTRAINT fk_exercise_tags_exercise_id
      FOREIGN KEY (exercise_id) REFERENCES app.ejercicios(id) ON DELETE NO ACTION;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_hypertrophy_progression_exercise_id' AND conrelid='app."hypertrophy_progression"'::regclass) THEN
    ALTER TABLE app."hypertrophy_progression" ADD CONSTRAINT fk_hypertrophy_progression_exercise_id
      FOREIGN KEY (exercise_id) REFERENCES app.ejercicios(id) ON DELETE NO ACTION;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_hypertrophy_set_logs_exercise_id' AND conrelid='app."hypertrophy_set_logs"'::regclass) THEN
    ALTER TABLE app."hypertrophy_set_logs" ADD CONSTRAINT fk_hypertrophy_set_logs_exercise_id
      FOREIGN KEY (exercise_id) REFERENCES app.ejercicios(id) ON DELETE NO ACTION;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_hypertrophy_weekly_templates_exercise_id' AND conrelid='app."hypertrophy_weekly_templates"'::regclass) THEN
    ALTER TABLE app."hypertrophy_weekly_templates" ADD CONSTRAINT fk_hypertrophy_weekly_templates_exercise_id
      FOREIGN KEY (exercise_id) REFERENCES app.ejercicios(id) ON DELETE NO ACTION;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_methodology_exercise_progress_exercise_id' AND conrelid='app."methodology_exercise_progress"'::regclass) THEN
    ALTER TABLE app."methodology_exercise_progress" ADD CONSTRAINT fk_methodology_exercise_progress_exercise_id
      FOREIGN KEY (exercise_id) REFERENCES app.ejercicios(id) ON DELETE NO ACTION;
  END IF;
END $$;

COMMIT;
