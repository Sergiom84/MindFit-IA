-- Migration: Prepare nutrition_meal_items for food references
-- Description: Preparar tabla nutrition_meal_items para referencias a app.foods con estados de pesado
-- Date: 2026-02-06

BEGIN;

-- Verificar si la tabla existe antes de modificarla
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'app'
    AND table_name = 'nutrition_meal_items'
  ) THEN

    -- 1. Añadir columna para referencia al alimento
    IF NOT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_schema = 'app'
      AND table_name = 'nutrition_meal_items'
      AND column_name = 'food_id'
    ) THEN
      ALTER TABLE app.nutrition_meal_items
        ADD COLUMN food_id UUID REFERENCES app.foods(id) ON DELETE SET NULL;
    END IF;

    -- 2. Añadir columnas de estado de pesado
    IF NOT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_schema = 'app'
      AND table_name = 'nutrition_meal_items'
      AND column_name = 'estado_pesado_base'
    ) THEN
      ALTER TABLE app.nutrition_meal_items
        ADD COLUMN estado_pesado_base TEXT;
    END IF;

    IF NOT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_schema = 'app'
      AND table_name = 'nutrition_meal_items'
      AND column_name = 'estado_pesado_mostrado'
    ) THEN
      ALTER TABLE app.nutrition_meal_items
        ADD COLUMN estado_pesado_mostrado TEXT;
    END IF;

    -- 3. Añadir columnas de cantidad
    IF NOT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_schema = 'app'
      AND table_name = 'nutrition_meal_items'
      AND column_name = 'cantidad_g_base'
    ) THEN
      ALTER TABLE app.nutrition_meal_items
        ADD COLUMN cantidad_g_base DECIMAL(10,2);
    END IF;

    IF NOT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_schema = 'app'
      AND table_name = 'nutrition_meal_items'
      AND column_name = 'cantidad_g_mostrada'
    ) THEN
      ALTER TABLE app.nutrition_meal_items
        ADD COLUMN cantidad_g_mostrada DECIMAL(10,2);
    END IF;

    -- 4. Añadir constraints CHECK
    ALTER TABLE app.nutrition_meal_items
      DROP CONSTRAINT IF EXISTS check_meal_item_estado_base;

    ALTER TABLE app.nutrition_meal_items
      ADD CONSTRAINT check_meal_item_estado_base
      CHECK (estado_pesado_base IS NULL OR estado_pesado_base IN ('crudo', 'cocido', 'escurrido', 'seco', 'tal_cual'));

    ALTER TABLE app.nutrition_meal_items
      DROP CONSTRAINT IF EXISTS check_meal_item_estado_mostrado;

    ALTER TABLE app.nutrition_meal_items
      ADD CONSTRAINT check_meal_item_estado_mostrado
      CHECK (estado_pesado_mostrado IS NULL OR estado_pesado_mostrado IN ('crudo', 'cocido', 'escurrido', 'seco', 'tal_cual'));

    -- 5. Crear índice para búsquedas por alimento
    CREATE INDEX IF NOT EXISTS idx_meal_items_food_id
      ON app.nutrition_meal_items(food_id);

    -- 6. Añadir comentarios
    COMMENT ON COLUMN app.nutrition_meal_items.food_id IS 'Referencia al alimento en app.foods';
    COMMENT ON COLUMN app.nutrition_meal_items.estado_pesado_base IS 'Estado en el que están definidos los macros (coincide con food.estado_pesado_base)';
    COMMENT ON COLUMN app.nutrition_meal_items.estado_pesado_mostrado IS 'Estado en el que se muestra al usuario (puede diferir del base)';
    COMMENT ON COLUMN app.nutrition_meal_items.cantidad_g_base IS 'Cantidad en gramos en estado base (canon para cálculo de macros)';
    COMMENT ON COLUMN app.nutrition_meal_items.cantidad_g_mostrada IS 'Cantidad en gramos en estado mostrado (puede diferir si hay conversión)';

    RAISE NOTICE 'Tabla nutrition_meal_items actualizada correctamente';
  ELSE
    RAISE NOTICE 'Tabla nutrition_meal_items no existe aún. Esta migración se aplicará cuando la tabla esté creada.';
  END IF;
END $$;

COMMIT;
