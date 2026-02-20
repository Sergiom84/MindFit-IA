-- Reclasificación adicional de receta no coherente en meal_type principal.
-- EX_C24_3 se usa como snack/desayuno, no como COMIDA.

BEGIN;

UPDATE app.recipes
SET
  meal_type = 'SNACK',
  updated_at = NOW()
WHERE recipe_code = 'EX_C24_3'
  AND meal_type = 'COMIDA';

COMMIT;
