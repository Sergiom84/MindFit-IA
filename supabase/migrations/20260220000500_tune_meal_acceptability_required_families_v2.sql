-- Ajuste de required_families para evitar sobre-restricción:
-- COMIDA/CENA deben asegurar fuente proteica, no exigir familias de carb/fibra siempre.

BEGIN;

UPDATE app.meal_acceptability_rules
SET
  required_families = ARRAY['proteina_animal','proteina_vegetal','huevo','lacteo','legumbre']::TEXT[],
  notes = 'Regla v2: requiere al menos una fuente proteica principal',
  updated_at = NOW()
WHERE is_active = TRUE
  AND meal_type IN ('COMIDA', 'CENA');

COMMIT;
