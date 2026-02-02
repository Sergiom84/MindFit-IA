-- Añade gemelo y pliegue abdominal a app.users para sincronía Nutrición ↔ Perfil

ALTER TABLE app.users
  ADD COLUMN IF NOT EXISTS gemelo NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS pliegue_abdominal NUMERIC(6,2);

COMMENT ON COLUMN app.users.gemelo IS 'Perímetro de gemelo en cm';
COMMENT ON COLUMN app.users.pliegue_abdominal IS 'Pliegue abdominal en mm';
