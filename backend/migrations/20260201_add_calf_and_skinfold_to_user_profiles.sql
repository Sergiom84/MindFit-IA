-- Añade gemelo y pliegue abdominal a app.user_profiles para sincronía Nutrición ↔ Perfil

ALTER TABLE app.user_profiles
  ADD COLUMN IF NOT EXISTS gemelo NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS pliegue_abdominal NUMERIC(6,2);

COMMENT ON COLUMN app.user_profiles.gemelo IS 'Perímetro de gemelo en cm (perfil visible)';
COMMENT ON COLUMN app.user_profiles.pliegue_abdominal IS 'Pliegue abdominal en mm (perfil visible)';
