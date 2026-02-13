-- Permite repetir un mismo alimento en una receta si ocupa slots distintos.
ALTER TABLE IF EXISTS app.recipe_items
  DROP CONSTRAINT IF EXISTS recipe_items_recipe_id_food_id_key;
