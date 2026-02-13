-- Etiquetas de franja para recetas SNACK:
-- - slot:almuerzo
-- - slot:merienda
-- - slot:snack (genérica)

BEGIN;

WITH snack_recipes AS (
  SELECT
    r.id,
    r.recipe_code,
    LOWER(COALESCE(r.name_normalized, r.name)) AS recipe_name
  FROM app.recipes r
  WHERE r.meal_type = 'SNACK'
    AND COALESCE(r.is_active, TRUE) = TRUE
),
classified AS (
  SELECT
    sr.id,
    CASE
      WHEN sr.recipe_name ~ '(yogur|skyr|kefir|k[ée]fir|fruta|pl[aá]tano|fresa|smoothie|batido|avena|granola|reques[oó]n|queso batido|mango|pi[ñn]a)'
        THEN 'slot:merienda'
      WHEN sr.recipe_name ~ '(s[áa]ndwich|sandwich|wrap|tosta|tostada|hummus|at[úu]n|pavo|pollo|huevo|tortilla|pan)'
        THEN 'slot:almuerzo'
      WHEN MOD(ABS(HASHTEXT(sr.recipe_code)), 2) = 0
        THEN 'slot:almuerzo'
      ELSE 'slot:merienda'
    END AS primary_slot
  FROM snack_recipes sr
)
INSERT INTO app.recipe_tags (recipe_id, tag)
SELECT c.id, c.primary_slot
FROM classified c
ON CONFLICT (recipe_id, tag) DO NOTHING;

INSERT INTO app.recipe_tags (recipe_id, tag)
SELECT r.id, 'slot:snack'
FROM app.recipes r
WHERE r.meal_type = 'SNACK'
  AND COALESCE(r.is_active, TRUE) = TRUE
ON CONFLICT (recipe_id, tag) DO NOTHING;

COMMIT;
