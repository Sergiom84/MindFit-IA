-- Alinea los valores que ofrece el onboarding con el contrato canónico de app.users.
-- No transforma filas existentes: únicamente amplía los valores válidos.

BEGIN;

ALTER TABLE app.users
  DROP CONSTRAINT IF EXISTS users_objetivo_principal_check;

ALTER TABLE app.users
  ADD CONSTRAINT users_objetivo_principal_check
  CHECK (objetivo_principal IS NULL OR objetivo_principal IN (
    'ganar_peso',
    'rehabilitacion',
    'perder_peso',
    'tonificar',
    'ganar_masa_muscular',
    'ganar_fuerza',
    'mejorar_resistencia',
    'mejorar_flexibilidad',
    'salud_general',
    'mantenimiento'
  ));

ALTER TABLE app.users
  DROP CONSTRAINT IF EXISTS users_sexo_check;

ALTER TABLE app.users
  ADD CONSTRAINT users_sexo_check
  CHECK (sexo IS NULL OR sexo IN ('masculino', 'femenino', 'otro'));

ALTER TABLE app.nutrition_profiles
  DROP CONSTRAINT IF EXISTS nutrition_profiles_sexo_check;

ALTER TABLE app.nutrition_profiles
  ADD CONSTRAINT nutrition_profiles_sexo_check
  CHECK (sexo IN ('hombre', 'mujer', 'otro'));

COMMIT;
