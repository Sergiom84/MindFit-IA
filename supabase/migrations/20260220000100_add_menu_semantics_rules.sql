-- Migration: Add semantic catalog fields + hard-rule tables for professional menu system
-- Date: 2026-02-20

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE app.foods
  ADD COLUMN IF NOT EXISTS meal_suitability JSONB,
  ADD COLUMN IF NOT EXISTS processing_level TEXT,
  ADD COLUMN IF NOT EXISTS culinary_family TEXT,
  ADD COLUMN IF NOT EXISTS is_snack_only BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_main_dish_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS palatability_score NUMERIC(5,2);

DO $$ BEGIN
  ALTER TABLE app.foods
    DROP CONSTRAINT IF EXISTS chk_foods_processing_level;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE app.foods
  ADD CONSTRAINT chk_foods_processing_level
  CHECK (
    processing_level IS NULL
    OR processing_level IN ('minimo', 'procesado', 'ultraprocesado')
  );

DO $$ BEGIN
  ALTER TABLE app.foods
    DROP CONSTRAINT IF EXISTS chk_foods_palatability_score;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE app.foods
  ADD CONSTRAINT chk_foods_palatability_score
  CHECK (
    palatability_score IS NULL
    OR (palatability_score >= 0 AND palatability_score <= 100)
  );

CREATE INDEX IF NOT EXISTS idx_foods_processing_level
  ON app.foods(processing_level);

CREATE INDEX IF NOT EXISTS idx_foods_snack_main_flags
  ON app.foods(is_snack_only, is_main_dish_allowed);

CREATE INDEX IF NOT EXISTS idx_foods_meal_suitability
  ON app.foods USING GIN (meal_suitability);

CREATE TABLE IF NOT EXISTS app.food_pairing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  food_slug_a TEXT NOT NULL,
  food_slug_b TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('forbidden', 'penalty', 'preferred')),
  penalty NUMERIC(6,2) NOT NULL DEFAULT 0,
  contexts TEXT[] NOT NULL DEFAULT ARRAY['DESAYUNO','COMIDA','CENA','SNACK']::TEXT[],
  reason TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_food_pairing_rule UNIQUE (food_slug_a, food_slug_b, rule_type)
);

CREATE INDEX IF NOT EXISTS idx_food_pairing_rules_active
  ON app.food_pairing_rules(is_active);

CREATE INDEX IF NOT EXISTS idx_food_pairing_rules_contexts
  ON app.food_pairing_rules USING GIN (contexts);

DROP TRIGGER IF EXISTS update_food_pairing_rules_updated_at ON app.food_pairing_rules;
CREATE TRIGGER update_food_pairing_rules_updated_at
  BEFORE UPDATE ON app.food_pairing_rules
  FOR EACH ROW
  EXECUTE FUNCTION app.update_updated_at_column();

CREATE TABLE IF NOT EXISTS app.meal_acceptability_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_type TEXT NOT NULL CHECK (meal_type IN ('DESAYUNO', 'COMIDA', 'CENA', 'SNACK')),
  diet_type TEXT NOT NULL DEFAULT 'AMBOS' CHECK (diet_type IN ('AMBOS', 'VEG')),
  max_processed_items SMALLINT NOT NULL DEFAULT 1 CHECK (max_processed_items >= 0),
  forbidden_families TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  required_families TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_meal_acceptability_rules UNIQUE (meal_type, diet_type)
);

CREATE INDEX IF NOT EXISTS idx_meal_acceptability_rules_active
  ON app.meal_acceptability_rules(meal_type, diet_type, is_active);

DROP TRIGGER IF EXISTS update_meal_acceptability_rules_updated_at ON app.meal_acceptability_rules;
CREATE TRIGGER update_meal_acceptability_rules_updated_at
  BEFORE UPDATE ON app.meal_acceptability_rules
  FOR EACH ROW
  EXECUTE FUNCTION app.update_updated_at_column();

INSERT INTO app.meal_acceptability_rules (
  meal_type,
  diet_type,
  max_processed_items,
  forbidden_families,
  required_families,
  notes,
  is_active
)
VALUES
  ('DESAYUNO', 'AMBOS', 1, ARRAY[]::TEXT[], ARRAY[]::TEXT[], 'Regla base desayuno', TRUE),
  ('COMIDA', 'AMBOS', 1, ARRAY['snack_dulce','untable_industrial'], ARRAY['proteina_animal','proteina_vegetal','huevo','lacteo','cereal','legumbre','tuberculo'], 'Evitar snacks dulces como base en comida principal', TRUE),
  ('CENA', 'AMBOS', 1, ARRAY['snack_dulce','untable_industrial'], ARRAY['proteina_animal','proteina_vegetal','huevo','lacteo','verdura'], 'Evitar snacks dulces como base en cena', TRUE),
  ('SNACK', 'AMBOS', 2, ARRAY[]::TEXT[], ARRAY[]::TEXT[], 'Snacks más permisivos', TRUE),
  ('DESAYUNO', 'VEG', 1, ARRAY[]::TEXT[], ARRAY[]::TEXT[], 'Regla base desayuno veg/vegetariano', TRUE),
  ('COMIDA', 'VEG', 1, ARRAY['snack_dulce','untable_industrial'], ARRAY['proteina_vegetal','lacteo','huevo','cereal','legumbre','tuberculo'], 'Evitar snacks dulces como base en comida principal veg', TRUE),
  ('CENA', 'VEG', 1, ARRAY['snack_dulce','untable_industrial'], ARRAY['proteina_vegetal','lacteo','huevo','verdura'], 'Evitar snacks dulces como base en cena veg', TRUE),
  ('SNACK', 'VEG', 2, ARRAY[]::TEXT[], ARRAY[]::TEXT[], 'Snacks más permisivos veg', TRUE)
ON CONFLICT (meal_type, diet_type) DO UPDATE SET
  max_processed_items = EXCLUDED.max_processed_items,
  forbidden_families = EXCLUDED.forbidden_families,
  required_families = EXCLUDED.required_families,
  notes = EXCLUDED.notes,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

COMMENT ON COLUMN app.foods.meal_suitability IS 'Compatibilidad por comida: {desayuno, comida, cena, snack}';
COMMENT ON COLUMN app.foods.processing_level IS 'Nivel de procesado: minimo/procesado/ultraprocesado';
COMMENT ON COLUMN app.foods.culinary_family IS 'Familia culinaria para reglas de aceptabilidad';
COMMENT ON COLUMN app.foods.is_snack_only IS 'Si solo se permite en snacks/ingestas ligeras';
COMMENT ON COLUMN app.foods.is_main_dish_allowed IS 'Si puede usarse como base principal en comida/cena';
COMMENT ON COLUMN app.foods.palatability_score IS 'Puntuación 0-100 de aceptabilidad esperada';

COMMENT ON TABLE app.food_pairing_rules IS 'Reglas de pairing de alimentos por contexto de comida';
COMMENT ON TABLE app.meal_acceptability_rules IS 'Reglas de aceptabilidad por tipo de comida y dieta';

COMMIT;
