-- Migration: Create meal template library tables
-- Description: Biblioteca de platos/plantillas para generación determinista de menús
-- Date: 2026-02-06

BEGIN;

CREATE TABLE IF NOT EXISTS app.meal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code TEXT NOT NULL,
  template_name TEXT NOT NULL,
  meal_type TEXT NOT NULL,
  diet_allowed TEXT NOT NULL,
  day_context TEXT NOT NULL DEFAULT 'AMBOS',
  phase_bias TEXT,
  satiety_bias TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NOT NULL DEFAULT 'mindfeed_excel',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app.meal_templates
  DROP CONSTRAINT IF EXISTS uq_meal_templates_code;
ALTER TABLE app.meal_templates
  ADD CONSTRAINT uq_meal_templates_code UNIQUE (template_code);

ALTER TABLE app.meal_templates
  DROP CONSTRAINT IF EXISTS chk_meal_templates_meal_type;
ALTER TABLE app.meal_templates
  ADD CONSTRAINT chk_meal_templates_meal_type
  CHECK (meal_type IN ('DESAYUNO', 'COMIDA', 'CENA', 'SNACK'));

ALTER TABLE app.meal_templates
  DROP CONSTRAINT IF EXISTS chk_meal_templates_diet_allowed;
ALTER TABLE app.meal_templates
  ADD CONSTRAINT chk_meal_templates_diet_allowed
  CHECK (diet_allowed IN ('AMBOS', 'VEG'));

CREATE INDEX IF NOT EXISTS idx_meal_templates_filters
  ON app.meal_templates(meal_type, diet_allowed, day_context, is_active);

DROP TRIGGER IF EXISTS update_meal_templates_updated_at ON app.meal_templates;
CREATE TRIGGER update_meal_templates_updated_at
  BEFORE UPDATE ON app.meal_templates
  FOR EACH ROW
  EXECUTE FUNCTION app.touch_updated_at();

CREATE TABLE IF NOT EXISTS app.meal_template_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES app.meal_templates(id) ON DELETE CASCADE,
  slot_order INTEGER NOT NULL,
  slot_role TEXT NOT NULL,
  slot_note TEXT,
  quantity_hint TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app.meal_template_slots
  DROP CONSTRAINT IF EXISTS uq_meal_template_slots_order;
ALTER TABLE app.meal_template_slots
  ADD CONSTRAINT uq_meal_template_slots_order UNIQUE (template_id, slot_order);

CREATE INDEX IF NOT EXISTS idx_meal_template_slots_role
  ON app.meal_template_slots(slot_role);

CREATE TABLE IF NOT EXISTS app.food_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  food_id UUID NOT NULL REFERENCES app.foods(id) ON DELETE CASCADE,
  food_slug TEXT NOT NULL,
  role TEXT NOT NULL,
  diet_type TEXT,
  category TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'mindfeed_excel',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE app.food_roles
  DROP CONSTRAINT IF EXISTS uq_food_roles_food_role;
ALTER TABLE app.food_roles
  ADD CONSTRAINT uq_food_roles_food_role UNIQUE (food_id, role);

CREATE INDEX IF NOT EXISTS idx_food_roles_role
  ON app.food_roles(role);

CREATE INDEX IF NOT EXISTS idx_food_roles_slug
  ON app.food_roles(food_slug);

DROP TRIGGER IF EXISTS update_food_roles_updated_at ON app.food_roles;
CREATE TRIGGER update_food_roles_updated_at
  BEFORE UPDATE ON app.food_roles
  FOR EACH ROW
  EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE app.meal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.meal_template_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.food_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cualquiera puede leer meal templates" ON app.meal_templates;
CREATE POLICY "Cualquiera puede leer meal templates"
  ON app.meal_templates
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Cualquiera puede leer meal template slots" ON app.meal_template_slots;
CREATE POLICY "Cualquiera puede leer meal template slots"
  ON app.meal_template_slots
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Cualquiera puede leer food roles" ON app.food_roles;
CREATE POLICY "Cualquiera puede leer food roles"
  ON app.food_roles
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE app.meal_templates IS 'Plantillas de comida para generación determinista (MindFeed)';
COMMENT ON TABLE app.meal_template_slots IS 'Slots/roles de cada plantilla de comida';
COMMENT ON TABLE app.food_roles IS 'Asignación de alimentos a roles nutricionales por slug';

COMMIT;
