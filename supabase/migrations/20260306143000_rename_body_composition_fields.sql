BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'users' AND column_name = 'masa_muscular'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'users' AND column_name = 'masa_magra'
  ) THEN
    ALTER TABLE app.users RENAME COLUMN masa_muscular TO masa_magra;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'users' AND column_name = 'masa_muscular'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'users' AND column_name = 'masa_magra'
  ) THEN
    UPDATE app.users
    SET masa_magra = COALESCE(masa_magra, masa_muscular)
    WHERE masa_muscular IS NOT NULL;

    ALTER TABLE app.users DROP COLUMN masa_muscular;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.save_body_composition()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    -- Solo insertar si hay cambios en composición corporal
    IF (NEW.grasa_corporal IS DISTINCT FROM OLD.grasa_corporal) OR
       (NEW.masa_magra IS DISTINCT FROM OLD.masa_magra) OR
       (NEW.agua_corporal IS DISTINCT FROM OLD.agua_corporal) OR
       (NEW.metabolismo_basal IS DISTINCT FROM OLD.metabolismo_basal) OR
       (NEW.peso IS DISTINCT FROM OLD.peso) OR
       (NEW.cintura IS DISTINCT FROM OLD.cintura) OR
       (NEW.cuello IS DISTINCT FROM OLD.cuello) THEN

        INSERT INTO app.body_composition_history (
            user_id, peso, grasa_corporal, masa_magra,
            agua_corporal, metabolismo_basal, cintura, cuello,
            calculation_method, notes
        ) VALUES (
            NEW.id, NEW.peso, NEW.grasa_corporal, NEW.masa_magra,
            NEW.agua_corporal, NEW.metabolismo_basal, NEW.cintura, NEW.cuello,
            'us_navy', 'Actualización automática desde calculadora'
        );
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_save_body_composition ON app.users;

CREATE TRIGGER trigger_save_body_composition
AFTER UPDATE ON app.users
FOR EACH ROW
WHEN (
  (NEW.grasa_corporal IS DISTINCT FROM OLD.grasa_corporal) OR
  (NEW.masa_magra IS DISTINCT FROM OLD.masa_magra) OR
  (NEW.agua_corporal IS DISTINCT FROM OLD.agua_corporal) OR
  (NEW.metabolismo_basal IS DISTINCT FROM OLD.metabolismo_basal) OR
  (NEW.peso IS DISTINCT FROM OLD.peso)
)
EXECUTE FUNCTION app.save_body_composition();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'body_composition_history' AND column_name = 'masa_muscular'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'body_composition_history' AND column_name = 'masa_magra'
  ) THEN
    ALTER TABLE app.body_composition_history RENAME COLUMN masa_muscular TO masa_magra;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'body_composition_history' AND column_name = 'masa_muscular'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'body_composition_history' AND column_name = 'masa_magra'
  ) THEN
    UPDATE app.body_composition_history
    SET masa_magra = COALESCE(masa_magra, masa_muscular)
    WHERE masa_muscular IS NOT NULL;

    ALTER TABLE app.body_composition_history DROP COLUMN masa_muscular;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'users' AND column_name = 'muslos'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'users' AND column_name = 'muslo'
  ) THEN
    UPDATE app.users
    SET muslo = COALESCE(muslo, muslos)
    WHERE muslos IS NOT NULL;

    ALTER TABLE app.users DROP COLUMN muslos;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'users' AND column_name = 'muslos'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'users' AND column_name = 'muslo'
  ) THEN
    ALTER TABLE app.users RENAME COLUMN muslos TO muslo;
  END IF;
END $$;

COMMENT ON COLUMN app.users.masa_magra IS 'Masa magra del usuario en kg';
COMMENT ON COLUMN app.users.muslo IS 'Perimetro de muslo en cm';
COMMENT ON COLUMN app.body_composition_history.masa_magra IS 'Masa magra registrada en kg';

COMMIT;
