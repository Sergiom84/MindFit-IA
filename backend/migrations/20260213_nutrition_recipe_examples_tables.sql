-- Tablas para recetas de menú (fuente: ejemplos curados)
-- Permite generación recipe-first sin romper el motor actual.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_code text NOT NULL UNIQUE,
  name text NOT NULL,
  name_normalized text,
  meal_type text NOT NULL CHECK (meal_type IN ('DESAYUNO', 'COMIDA', 'CENA', 'SNACK')),
  diet_allowed text NOT NULL DEFAULT 'AMBOS' CHECK (diet_allowed IN ('AMBOS', 'VEG')),
  day_context text NOT NULL DEFAULT 'AMBOS' CHECK (day_context IN ('AMBOS', 'DEFINICION', 'ENTRENO', 'NORMO', 'VOLUMEN')),
  template_code text,
  source text NOT NULL DEFAULT 'manual',
  is_active boolean NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recipes_lookup
  ON app.recipes (meal_type, day_context, diet_allowed, is_active);

CREATE TABLE IF NOT EXISTS app.recipe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES app.recipes(id) ON DELETE CASCADE,
  food_id uuid NOT NULL REFERENCES app.foods(id),
  slot_order int NOT NULL CHECK (slot_order > 0),
  role text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (recipe_id, slot_order)
);

CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe
  ON app.recipe_items (recipe_id, slot_order);

CREATE INDEX IF NOT EXISTS idx_recipe_items_food
  ON app.recipe_items (food_id);

CREATE TABLE IF NOT EXISTS app.recipe_tags (
  recipe_id uuid NOT NULL REFERENCES app.recipes(id) ON DELETE CASCADE,
  tag text NOT NULL,
  PRIMARY KEY (recipe_id, tag)
);

COMMIT;
