-- Demostraciones visuales de ejercicios (no destructivo).
-- Compatible con entornos ya unificados y con entornos que conservan tablas Ejercicios_*.

DO $$
DECLARE
  exercise_table text;
BEGIN
  IF to_regclass('app.ejercicios') IS NOT NULL THEN
    ALTER TABLE app.ejercicios
      ADD COLUMN IF NOT EXISTS gif_url text;
  END IF;

  FOREACH exercise_table IN ARRAY ARRAY[
    'Ejercicios_Hipertrofia',
    'Ejercicios_CrossFit',
    'Ejercicios_Powerlifting',
    'Ejercicios_Calistenia',
    'Ejercicios_Casa',
    'Ejercicios_Funcional',
    'Ejercicios_Halterofilia',
    'Ejercicios_Heavy_Duty',
    'Ejercicios_Bomberos',
    'Ejercicios_Guardia_Civil',
    'Ejercicios_Policia_Local'
  ]
  LOOP
    IF to_regclass(format('app.%I', exercise_table)) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE app.%I ADD COLUMN IF NOT EXISTS gif_url text',
        exercise_table
      );
    END IF;
  END LOOP;

  IF to_regclass('app.methodology_exercise_progress') IS NOT NULL THEN
    ALTER TABLE app.methodology_exercise_progress
      ADD COLUMN IF NOT EXISTS gif_url text,
      ADD COLUMN IF NOT EXISTS video_url text;
  END IF;
END $$;
