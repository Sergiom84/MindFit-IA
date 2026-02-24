-- ============================================================
-- Migración: Restaurar categorías del Excel (fuente de verdad)
-- Fecha: 2026-02-24
-- Descripción:
--   1. Actualizar CHECK constraint de categoria con las 12 categorías del Excel
--   2. UPDATE categorías de 129 alimentos normalizados incorrectamente
--   3. Fix tipo_dieta de 2 quesos
--   4. Reasignar meal_items de legacy foods y eliminarlos
-- ============================================================

BEGIN;

-- ============================================================
-- 1. DROP constraint viejo (permite cualquier valor temporalmente)
-- ============================================================
ALTER TABLE app.foods DROP CONSTRAINT IF EXISTS foods_categoria_check;

-- ============================================================
-- 2. UPDATE categorías según Excel (129 alimentos afectados)
-- ============================================================

-- Proteína animal (45 alimentos: carnes + pescados + manteca_de_cerdo)
UPDATE app.foods SET categoria = 'Proteína animal', updated_at = NOW()
WHERE slug IN (
  'manteca_de_cerdo', 'caballo_carne_de_potro', 'carne_picada_vacuno_5', 'cecina',
  'conejo', 'cordero_magro', 'higado_de_pollo', 'higado_de_ternera',
  'jamon_cocido', 'jamon_serrano', 'lomo_de_cerdo', 'lomo_embuchado',
  'muslo_de_pollo_sin_piel', 'pavo_ahumado', 'pavo_molido_5_grasa', 'pavo_pechuga',
  'pechuga_de_pavo_fiambre', 'pechuga_de_pollo', 'solomillo_de_cerdo',
  'ternera_magra_solomillo', 'vaca_10_grasa',
  'almejas', 'anchoas_en_aceite_escurridas', 'arenque', 'atun_en_aceite_escurrido',
  'atun_enlatado_al_natural', 'atun_fresco', 'bacalao_desalado', 'bacalao_fresco',
  'berberechos', 'boquerones', 'caballa', 'calamar', 'dorada', 'gambas',
  'huevas_de_pescado', 'langostinos', 'lubina', 'mejillones', 'merluza',
  'pulpo', 'salmon', 'sardinas', 'sepia', 'trucha'
);

-- Huevo (9 alimentos)
UPDATE app.foods SET categoria = 'Huevo', updated_at = NOW()
WHERE slug IN (
  'clara_de_huevo', 'clara_pasteurizada', 'huevo_a_la_plancha_sin_aceite',
  'huevo_cocido', 'huevo_de_codorniz', 'huevo_de_gallina',
  'huevo_revuelto_sin_aceite', 'sustituto_de_huevo_liquido', 'tortilla_de_claras'
);

-- Proteína vegetal (6 alimentos)
UPDATE app.foods SET categoria = 'Proteína vegetal', updated_at = NOW()
WHERE slug IN (
  'natto', 'seitan', 'soja_texturizada_hidratada',
  'tempeh', 'tofu_firme', 'tofu_sedoso'
);

-- Legumbre (14 alimentos)
UPDATE app.foods SET categoria = 'Legumbre', updated_at = NOW()
WHERE slug IN (
  'altramuz_escurrido', 'alubia_pinta_cocida', 'alubias_blancas_cocidas',
  'alubias_rojas_cocidas', 'edamame_grano', 'falafel_al_horno',
  'garbanzo_en_conserva_escurrido', 'garbanzos_cocidos', 'guisantes_cocidos',
  'habas_cocidas', 'hummus', 'lenteja_roja_cocida', 'lentejas_cocidas',
  'mezcla_vegetal_guisante_arroz'
);

-- Carbohidrato: actualizar casing (los que ya eran carbohidrato -> Carbohidrato)
UPDATE app.foods SET categoria = 'Carbohidrato', updated_at = NOW()
WHERE slug IS NOT NULL AND categoria = 'carbohidrato';

-- Verdura (antes 'vegetal')
UPDATE app.foods SET categoria = 'Verdura', updated_at = NOW()
WHERE slug IN (
  'remolacha_cocida', 'zanahoria_cocida', 'zanahoria_cruda',
  'ajo', 'apio', 'berenjena', 'brocoli', 'calabacin', 'canonigos',
  'cebolla', 'champinones', 'col_kale', 'coles_de_bruselas', 'coliflor',
  'espinacas', 'esparragos_verdes', 'lechuga_romana', 'pepino',
  'pimiento_amarillo', 'pimiento_rojo', 'pimiento_verde', 'rucula', 'tomate'
);

-- Fruta (actualizar casing)
UPDATE app.foods SET categoria = 'Fruta', updated_at = NOW()
WHERE slug IS NOT NULL AND categoria = 'fruta';

-- Lácteo (antes 'lacteo')
UPDATE app.foods SET categoria = 'Lácteo', updated_at = NOW()
WHERE slug IN (
  'kefir', 'leche_de_almendras_sin_azucar', 'leche_de_soja_sin_azucar',
  'leche_desnatada', 'leche_entera', 'leche_semidesnatada',
  'queso_cheddar', 'queso_cottage', 'queso_crema_light',
  'queso_fresco_batido_0', 'queso_fresco_tipo_burgos', 'queso_manchego_curado',
  'queso_mozzarella', 'queso_parmesano', 'requeson', 'requeson_light',
  'skyr_natural', 'yogur_griego_natural', 'yogur_natural', 'yogur_natural_desnatado'
);

-- Grasa (actualizar casing)
UPDATE app.foods SET categoria = 'Grasa', updated_at = NOW()
WHERE slug IS NOT NULL AND categoria = 'grasa';

-- Suplemento (antes 'otro', slugs específicos)
UPDATE app.foods SET categoria = 'Suplemento', updated_at = NOW()
WHERE slug IN (
  'bebida_isotonica_en_polvo', 'caseina_micelar', 'gainer_carbo_prote',
  'proteina_vegetal_guisante', 'proteina_vegetal_soja',
  'proteina_whey_aislada_90', 'proteina_whey_concentrado_80'
);

-- Bebida (antes 'otro', slugs específicos)
UPDATE app.foods SET categoria = 'Bebida', updated_at = NOW()
WHERE slug IN (
  'bebida_de_arroz_sin_azucar', 'bebida_de_avena_sin_azucar', 'bebida_deportiva_lista'
);

-- Otros (resto de 'otro')
UPDATE app.foods SET categoria = 'Otros', updated_at = NOW()
WHERE slug IN (
  'barrita_proteica', 'crema_de_cacao_proteica_sin_azucar'
);

-- ============================================================
-- 3. Fix tipo_dieta de 2 quesos
-- ============================================================
UPDATE app.foods SET tipo_dieta = 'Omnívoro', updated_at = NOW()
WHERE slug IN ('queso_fresco_batido_0', 'queso_fresco_tipo_burgos');

-- ============================================================
-- 4. Reasignar meal_items de legacy foods y eliminar los 14
--    (debe ejecutarse ANTES del nuevo constraint porque los legacy
--     tienen categorías antiguas incompatibles)
-- ============================================================

-- 4a. Reasignar nutrition_meal_items
UPDATE app.nutrition_meal_items
SET food_id = (SELECT id FROM app.foods WHERE slug = 'huevo_de_gallina')
WHERE food_id = '15d96ff6-7b00-4f4a-ac08-48521df7c18f'::uuid;

UPDATE app.nutrition_meal_items
SET food_id = (SELECT id FROM app.foods WHERE slug = 'avena_copos')
WHERE food_id = 'fbe32163-59a6-4234-90ae-19aa3eeb50de'::uuid;

UPDATE app.nutrition_meal_items
SET food_id = NULL
WHERE food_id = 'f795e940-400d-41d2-9249-7d00092bcde6'::uuid;

UPDATE app.nutrition_meal_items
SET food_id = (SELECT id FROM app.foods WHERE slug = 'queso_fresco_tipo_burgos')
WHERE food_id = '60905487-103d-4a42-9116-3e972ae36e74'::uuid;

UPDATE app.nutrition_meal_items
SET food_id = (SELECT id FROM app.foods WHERE slug = 'pavo_pechuga')
WHERE food_id = 'cc694e8d-e188-4c9a-b0dc-fb8283aab3f4'::uuid;

-- 4b. Reasignar recipe_items (mismos legacy foods)
UPDATE app.recipe_items
SET food_id = (SELECT id FROM app.foods WHERE slug = 'huevo_de_gallina')
WHERE food_id = '15d96ff6-7b00-4f4a-ac08-48521df7c18f'::uuid;

UPDATE app.recipe_items
SET food_id = (SELECT id FROM app.foods WHERE slug = 'avena_copos')
WHERE food_id = 'fbe32163-59a6-4234-90ae-19aa3eeb50de'::uuid;

-- Aguacate -> eliminar recipe_items (food_id NOT NULL, no hay equivalente)
DELETE FROM app.recipe_items
WHERE food_id = 'f795e940-400d-41d2-9249-7d00092bcde6'::uuid;

UPDATE app.recipe_items
SET food_id = (SELECT id FROM app.foods WHERE slug = 'queso_fresco_tipo_burgos')
WHERE food_id = '60905487-103d-4a42-9116-3e972ae36e74'::uuid;

UPDATE app.recipe_items
SET food_id = (SELECT id FROM app.foods WHERE slug = 'pavo_pechuga')
WHERE food_id = 'cc694e8d-e188-4c9a-b0dc-fb8283aab3f4'::uuid;

UPDATE app.recipe_items
SET food_id = (SELECT id FROM app.foods WHERE slug = 'zanahoria_cruda')
WHERE food_id = '91d84e9a-5081-4bd4-a98a-f88d56492d93'::uuid;

UPDATE app.recipe_items
SET food_id = (SELECT id FROM app.foods WHERE slug = 'ternera_magra_solomillo')
WHERE food_id = '18c5dc74-5eb6-42c3-8076-51aa174216f3'::uuid;

-- Eliminar los 14 foods legacy sin slug
DELETE FROM app.foods WHERE slug IS NULL;

-- ============================================================
-- 5. Crear nuevo constraint con las 12 categorías del Excel
-- ============================================================
ALTER TABLE app.foods ADD CONSTRAINT foods_categoria_check CHECK (
  categoria IN (
    'Proteína animal', 'Huevo', 'Proteína vegetal', 'Legumbre',
    'Carbohidrato', 'Verdura', 'Fruta', 'Lácteo', 'Grasa',
    'Suplemento', 'Bebida', 'Otros'
  )
);

COMMIT;
