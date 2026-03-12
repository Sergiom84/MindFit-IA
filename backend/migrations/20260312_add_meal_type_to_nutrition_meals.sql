ALTER TABLE app.nutrition_meals
ADD COLUMN IF NOT EXISTS meal_type VARCHAR(20);

UPDATE app.nutrition_meals
SET meal_type = CASE
  WHEN lower(coalesce(nombre, '')) LIKE '%desay%' THEN 'DESAYUNO'
  WHEN lower(coalesce(nombre, '')) LIKE '%cena%' THEN 'CENA'
  WHEN lower(coalesce(nombre, '')) LIKE '%almuerzo%' THEN 'SNACK'
  WHEN lower(coalesce(nombre, '')) LIKE '%merienda%' THEN 'SNACK'
  WHEN lower(coalesce(nombre, '')) LIKE '%snack%' THEN 'SNACK'
  WHEN lower(coalesce(nombre, '')) = 'primera comida' THEN CASE WHEN orden = 1 THEN 'COMIDA' ELSE 'SNACK' END
  WHEN lower(coalesce(nombre, '')) = 'segunda comida' THEN CASE WHEN orden = 2 THEN 'CENA' ELSE 'SNACK' END
  WHEN lower(coalesce(nombre, '')) LIKE '%comida%' THEN 'COMIDA'
  WHEN orden = 1 THEN 'DESAYUNO'
  WHEN orden = 2 THEN 'SNACK'
  WHEN orden = 3 THEN 'COMIDA'
  WHEN orden = 4 THEN 'SNACK'
  WHEN orden = 5 THEN 'CENA'
  ELSE 'SNACK'
END
WHERE meal_type IS NULL;

UPDATE app.nutrition_meals
SET meal_type = upper(meal_type)
WHERE meal_type IS NOT NULL;

WITH day_meal_counts AS (
  SELECT plan_day_id, COUNT(*) AS total_meals
  FROM app.nutrition_meals
  GROUP BY plan_day_id
)
UPDATE app.nutrition_meals m
SET
  nombre = CASE
    WHEN d.total_meals = 1 THEN 'Comida'
    WHEN d.total_meals = 2 AND m.orden = 1 THEN 'Comida'
    WHEN d.total_meals = 2 AND m.orden = 2 THEN 'Cena'
    ELSE m.nombre
  END,
  meal_type = CASE
    WHEN d.total_meals = 1 THEN 'COMIDA'
    WHEN d.total_meals = 2 AND m.orden = 1 THEN 'COMIDA'
    WHEN d.total_meals = 2 AND m.orden = 2 THEN 'CENA'
    ELSE m.meal_type
  END
FROM day_meal_counts d
WHERE d.plan_day_id = m.plan_day_id
  AND d.total_meals IN (1, 2);

ALTER TABLE app.nutrition_meals
ALTER COLUMN meal_type SET DEFAULT 'SNACK';

UPDATE app.nutrition_meals
SET meal_type = 'SNACK'
WHERE meal_type IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'nutrition_meals_meal_type_check'
  ) THEN
    ALTER TABLE app.nutrition_meals
    ADD CONSTRAINT nutrition_meals_meal_type_check
    CHECK (meal_type IN ('DESAYUNO', 'SNACK', 'COMIDA', 'CENA'));
  END IF;
END $$;

ALTER TABLE app.nutrition_meals
ALTER COLUMN meal_type SET NOT NULL;
