-- Migration: Add MindFeed fields to app.foods
-- Description: Ampliar tabla app.foods con campos necesarios para el sistema MindFeed
-- Date: 2026-02-06

BEGIN;

-- 1. Añadir campos de identificación y medición
ALTER TABLE app.foods
  ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS porcion_tipica_g INTEGER,
  ADD COLUMN IF NOT EXISTS fibra_100g DECIMAL(5,2);

-- 2. Añadir campos de estado de pesado y conversión
ALTER TABLE app.foods
  ADD COLUMN IF NOT EXISTS estado_pesado_base TEXT,
  ADD COLUMN IF NOT EXISTS estado_pesado_mostrado_default TEXT,
  ADD COLUMN IF NOT EXISTS metodo_preparacion TEXT,
  ADD COLUMN IF NOT EXISTS grupo_factor TEXT;

-- 3. Añadir categoría detallada (mantener categoria genérica existente)
ALTER TABLE app.foods
  ADD COLUMN IF NOT EXISTS categoria_detalle TEXT;

-- 4. Añadir flags de dieta
ALTER TABLE app.foods
  ADD COLUMN IF NOT EXISTS is_vegetarian BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_vegan BOOLEAN DEFAULT false;

-- 5. Añadir medida casera y tipo de dieta
ALTER TABLE app.foods
  ADD COLUMN IF NOT EXISTS medida_casera TEXT,
  ADD COLUMN IF NOT EXISTS tipo_dieta TEXT;

-- 6. Crear ENUM para estados de pesado (constraint)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'estado_pesado_enum') THEN
    CREATE TYPE estado_pesado_enum AS ENUM (
      'crudo',
      'cocido',
      'escurrido',
      'seco',
      'tal_cual'
    );
  END IF;
END $$;

-- 7. Añadir constraint CHECK para estado_pesado_base
ALTER TABLE app.foods
  DROP CONSTRAINT IF EXISTS check_estado_pesado_base;

ALTER TABLE app.foods
  ADD CONSTRAINT check_estado_pesado_base
  CHECK (estado_pesado_base IS NULL OR estado_pesado_base IN ('crudo', 'cocido', 'escurrido', 'seco', 'tal_cual'));

-- 8. Añadir constraint CHECK para estado_pesado_mostrado_default
ALTER TABLE app.foods
  DROP CONSTRAINT IF EXISTS check_estado_mostrado;

ALTER TABLE app.foods
  ADD CONSTRAINT check_estado_mostrado
  CHECK (estado_pesado_mostrado_default IS NULL OR estado_pesado_mostrado_default IN ('crudo', 'cocido', 'escurrido', 'seco', 'tal_cual'));

-- 9. Añadir constraint CHECK para tipo_dieta
ALTER TABLE app.foods
  DROP CONSTRAINT IF EXISTS check_tipo_dieta;

ALTER TABLE app.foods
  ADD CONSTRAINT check_tipo_dieta
  CHECK (tipo_dieta IS NULL OR tipo_dieta IN ('Omnívoro', 'Ambos', 'Vegetariano', 'Vegano'));

-- 10. Crear índices para mejorar rendimiento de búsquedas
CREATE INDEX IF NOT EXISTS idx_foods_slug ON app.foods(slug);
CREATE INDEX IF NOT EXISTS idx_foods_categoria_detalle ON app.foods(categoria_detalle);
CREATE INDEX IF NOT EXISTS idx_foods_grupo_factor ON app.foods(grupo_factor);
CREATE INDEX IF NOT EXISTS idx_foods_estado_base ON app.foods(estado_pesado_base);
CREATE INDEX IF NOT EXISTS idx_foods_is_vegetarian ON app.foods(is_vegetarian) WHERE is_vegetarian = true;
CREATE INDEX IF NOT EXISTS idx_foods_is_vegan ON app.foods(is_vegan) WHERE is_vegan = true;

-- 11. Añadir comentarios a las columnas para documentación
COMMENT ON COLUMN app.foods.slug IS 'Identificador único estable para imports y referencias (ID_alimento del Excel)';
COMMENT ON COLUMN app.foods.fibra_100g IS 'Fibra dietética en gramos por 100g';
COMMENT ON COLUMN app.foods.porcion_tipica_g IS 'Porción típica en gramos (referencia visual)';
COMMENT ON COLUMN app.foods.estado_pesado_base IS 'Estado en el que están definidos los macros de referencia';
COMMENT ON COLUMN app.foods.estado_pesado_mostrado_default IS 'Estado por defecto para mostrar al usuario';
COMMENT ON COLUMN app.foods.grupo_factor IS 'Grupo de factor de conversión (arroz, pasta, carne, etc.)';
COMMENT ON COLUMN app.foods.categoria_detalle IS 'Categoría específica MindFeed (Proteína animal, Legumbre, etc.)';
COMMENT ON COLUMN app.foods.is_vegetarian IS 'Apto para dieta vegetariana (ovo-lacto)';
COMMENT ON COLUMN app.foods.is_vegan IS 'Apto para dieta vegana';
COMMENT ON COLUMN app.foods.medida_casera IS 'Equivalencia en medida casera (1 cda, 1 taza, etc.)';
COMMENT ON COLUMN app.foods.tipo_dieta IS 'Clasificación de dieta del alimento';

COMMIT;
