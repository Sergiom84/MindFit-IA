-- Migration: Create food_conversion_factors table (idempotente)
-- Description: Tabla para factores de conversión entre estados de pesado
-- Date: 2026-02-06

BEGIN;

-- 1. Crear tabla base
CREATE TABLE IF NOT EXISTS app.food_conversion_factors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_factor TEXT NOT NULL,
  estado_base TEXT NOT NULL,
  estado_objetivo TEXT NOT NULL,
  factor_base_objetivo DECIMAL(10,6) NOT NULL,
  nota TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Constraints de unicidad y validación (recreables)
ALTER TABLE app.food_conversion_factors
  DROP CONSTRAINT IF EXISTS unique_conversion_factor;

ALTER TABLE app.food_conversion_factors
  ADD CONSTRAINT unique_conversion_factor
  UNIQUE (grupo_factor, estado_base, estado_objetivo);

ALTER TABLE app.food_conversion_factors
  DROP CONSTRAINT IF EXISTS check_factor_estados_base;

ALTER TABLE app.food_conversion_factors
  ADD CONSTRAINT check_factor_estados_base
  CHECK (estado_base IN ('crudo', 'cocido', 'escurrido', 'seco', 'tal_cual'));

ALTER TABLE app.food_conversion_factors
  DROP CONSTRAINT IF EXISTS check_factor_estados_objetivo;

ALTER TABLE app.food_conversion_factors
  ADD CONSTRAINT check_factor_estados_objetivo
  CHECK (estado_objetivo IN ('crudo', 'cocido', 'escurrido', 'seco', 'tal_cual'));

ALTER TABLE app.food_conversion_factors
  DROP CONSTRAINT IF EXISTS check_factor_positive;

ALTER TABLE app.food_conversion_factors
  ADD CONSTRAINT check_factor_positive
  CHECK (factor_base_objetivo > 0);

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_conversion_grupo_factor
  ON app.food_conversion_factors(grupo_factor);

CREATE INDEX IF NOT EXISTS idx_conversion_estados
  ON app.food_conversion_factors(grupo_factor, estado_base, estado_objetivo);

-- 4. Trigger updated_at (usar función estándar del schema app)
DROP TRIGGER IF EXISTS update_food_conversion_factors_updated_at ON app.food_conversion_factors;

CREATE TRIGGER update_food_conversion_factors_updated_at
  BEFORE UPDATE ON app.food_conversion_factors
  FOR EACH ROW
  EXECUTE FUNCTION app.touch_updated_at();

-- 5. Comentarios
COMMENT ON TABLE app.food_conversion_factors IS 'Factores de conversión entre estados de pesado (crudo/cocido/escurrido/seco/tal_cual)';
COMMENT ON COLUMN app.food_conversion_factors.grupo_factor IS 'Grupo de alimentos (arroz, pasta, carne, legumbre_seca, etc.)';
COMMENT ON COLUMN app.food_conversion_factors.estado_base IS 'Estado de origen para la conversión';
COMMENT ON COLUMN app.food_conversion_factors.estado_objetivo IS 'Estado de destino para la conversión';
COMMENT ON COLUMN app.food_conversion_factors.factor_base_objetivo IS 'Multiplicador: gramos_base * factor = gramos_objetivo';
COMMENT ON COLUMN app.food_conversion_factors.nota IS 'Notas sobre el factor (ej: "Aprox. absorción de agua")';

-- 6. Seed inicial de factores
INSERT INTO app.food_conversion_factors (grupo_factor, estado_base, estado_objetivo, factor_base_objetivo, nota)
VALUES
  ('arroz', 'crudo', 'cocido', 2.5, 'Aprox. absorción de agua'),
  ('arroz', 'cocido', 'crudo', 0.4, 'Inverso de 2.5 (crudo->cocido)'),
  ('pasta', 'crudo', 'cocido', 2.3, 'Aprox. absorción de agua'),
  ('pasta', 'cocido', 'crudo', 0.434783, 'Inverso de 2.3 (crudo->cocido)'),
  ('legumbre_seca', 'seco', 'cocido', 2.2, 'Aprox. hidratación/cocción'),
  ('legumbre_seca', 'cocido', 'seco', 0.454545, 'Inverso de 2.2 (seco->cocido)'),
  ('carne', 'crudo', 'cocido', 0.75, 'Aprox. merma por cocción'),
  ('carne', 'cocido', 'crudo', 1.333333, 'Inverso de 0.75 (crudo->cocido)')
ON CONFLICT (grupo_factor, estado_base, estado_objetivo) DO NOTHING;

-- 7. RLS + política de lectura
ALTER TABLE app.food_conversion_factors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cualquiera puede leer factores de conversión" ON app.food_conversion_factors;

CREATE POLICY "Cualquiera puede leer factores de conversión"
  ON app.food_conversion_factors
  FOR SELECT
  TO authenticated
  USING (true);

COMMIT;
