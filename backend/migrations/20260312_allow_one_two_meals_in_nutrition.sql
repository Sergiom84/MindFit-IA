ALTER TABLE app.nutrition_profiles
  DROP CONSTRAINT IF EXISTS nutrition_profiles_comidas_dia_check;

ALTER TABLE app.nutrition_profiles
  ADD CONSTRAINT nutrition_profiles_comidas_dia_check
  CHECK (comidas_dia >= 1 AND comidas_dia <= 6);

ALTER TABLE app.nutrition_plans_v2
  DROP CONSTRAINT IF EXISTS nutrition_plans_v2_comidas_por_dia_check;

ALTER TABLE app.nutrition_plans_v2
  ADD CONSTRAINT nutrition_plans_v2_comidas_por_dia_check
  CHECK (comidas_por_dia >= 1 AND comidas_por_dia <= 6);
