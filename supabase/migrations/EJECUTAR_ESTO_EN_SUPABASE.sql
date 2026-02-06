-- =====================================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================================
-- Copia y pega TODO este contenido en el SQL Editor de Supabase
-- Este script es IDEMPOTENTE (puedes ejecutarlo múltiples veces)
-- =====================================================================

-- 1. Crear tabla de factores de conversión (si no existe)
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

-- 2. Añadir constraint único (eliminar primero si existe)
DO $$ BEGIN
  ALTER TABLE app.food_conversion_factors DROP CONSTRAINT IF EXISTS unique_conversion_factor;
  ALTER TABLE app.food_conversion_factors ADD CONSTRAINT unique_conversion_factor UNIQUE (grupo_factor, estado_base, estado_objetivo);
END $$;

-- 3. Añadir constraints CHECK (eliminar primero si existen)
DO $$ BEGIN
  ALTER TABLE app.food_conversion_factors DROP CONSTRAINT IF EXISTS check_factor_estados_base;
  ALTER TABLE app.food_conversion_factors ADD CONSTRAINT check_factor_estados_base CHECK (estado_base IN ('crudo', 'cocido', 'escurrido', 'seco', 'tal_cual'));
END $$;

DO $$ BEGIN
  ALTER TABLE app.food_conversion_factors DROP CONSTRAINT IF EXISTS check_factor_estados_objetivo;
  ALTER TABLE app.food_conversion_factors ADD CONSTRAINT check_factor_estados_objetivo CHECK (estado_objetivo IN ('crudo', 'cocido', 'escurrido', 'seco', 'tal_cual'));
END $$;

DO $$ BEGIN
  ALTER TABLE app.food_conversion_factors DROP CONSTRAINT IF EXISTS check_factor_positive;
  ALTER TABLE app.food_conversion_factors ADD CONSTRAINT check_factor_positive CHECK (factor_base_objetivo > 0);
END $$;

-- 4. Crear índices
CREATE INDEX IF NOT EXISTS idx_conversion_grupo_factor ON app.food_conversion_factors(grupo_factor);
CREATE INDEX IF NOT EXISTS idx_conversion_estados ON app.food_conversion_factors(grupo_factor, estado_base, estado_objetivo);

-- 5. Función y trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_food_conversion_factors_updated_at ON app.food_conversion_factors;

CREATE TRIGGER update_food_conversion_factors_updated_at
  BEFORE UPDATE ON app.food_conversion_factors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 6. Comentarios
COMMENT ON TABLE app.food_conversion_factors IS 'Factores de conversión entre estados de pesado';
COMMENT ON COLUMN app.food_conversion_factors.grupo_factor IS 'Grupo de alimentos (arroz, pasta, carne, legumbre_seca, etc.)';
COMMENT ON COLUMN app.food_conversion_factors.estado_base IS 'Estado de origen';
COMMENT ON COLUMN app.food_conversion_factors.estado_objetivo IS 'Estado de destino';
COMMENT ON COLUMN app.food_conversion_factors.factor_base_objetivo IS 'Multiplicador: gramos_base * factor = gramos_objetivo';

-- 7. Insertar datos (ON CONFLICT DO NOTHING = no falla si ya existen)
INSERT INTO app.food_conversion_factors (grupo_factor, estado_base, estado_objetivo, factor_base_objetivo, nota)
VALUES
  ('arroz', 'crudo', 'cocido', 2.5, 'Aprox. absorción de agua'),
  ('arroz', 'cocido', 'crudo', 0.4, 'Inverso de 2.5'),
  ('pasta', 'crudo', 'cocido', 2.3, 'Aprox. absorción de agua'),
  ('pasta', 'cocido', 'crudo', 0.434783, 'Inverso de 2.3'),
  ('legumbre_seca', 'seco', 'cocido', 2.2, 'Aprox. hidratación/cocción'),
  ('legumbre_seca', 'cocido', 'seco', 0.454545, 'Inverso de 2.2'),
  ('carne', 'crudo', 'cocido', 0.75, 'Aprox. merma por cocción'),
  ('carne', 'cocido', 'crudo', 1.333333, 'Inverso de 0.75')
ON CONFLICT (grupo_factor, estado_base, estado_objetivo) DO NOTHING;

-- 8. Habilitar Row Level Security
ALTER TABLE app.food_conversion_factors ENABLE ROW LEVEL SECURITY;

-- 9. Política de lectura (eliminar primero si existe)
DROP POLICY IF EXISTS "Cualquiera puede leer factores de conversión" ON app.food_conversion_factors;

CREATE POLICY "Cualquiera puede leer factores de conversión"
  ON app.food_conversion_factors
  FOR SELECT
  TO authenticated
  USING (true);

-- =====================================================================
-- ¡LISTO! Ahora verifica que todo funcionó:
-- =====================================================================
-- SELECT * FROM app.food_conversion_factors ORDER BY grupo_factor, estado_base;
-- =====================================================================
