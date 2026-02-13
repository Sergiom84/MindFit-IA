-- Añade columna para nombre normalizado de recetas (display UX)
ALTER TABLE IF EXISTS app.recipes
  ADD COLUMN IF NOT EXISTS name_normalized text;
