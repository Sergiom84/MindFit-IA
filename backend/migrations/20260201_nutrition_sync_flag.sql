-- Sincronización perfil ↔ mediciones nutrición
-- False (default): el perfil es la fuente y precarga en nutrición
-- True: las mediciones de nutrición actualizan el perfil

ALTER TABLE app.nutrition_profiles
  ADD COLUMN IF NOT EXISTS nutrition_overrides_profile BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN app.nutrition_profiles.nutrition_overrides_profile IS 'True: mediciones nutricionales actualizan user_profiles; False: user_profiles precargan mediciones';
