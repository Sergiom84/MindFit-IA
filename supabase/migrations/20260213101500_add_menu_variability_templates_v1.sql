-- Añade/actualiza plantillas para mejorar variabilidad de menús (v1)
-- Idempotente: upsert por template_code + recreación de slots para los templates del lote.

BEGIN;

WITH template_data (
  template_code,
  template_name,
  meal_type,
  diet_allowed,
  day_context,
  phase_bias,
  satiety_bias,
  source
) AS (
  VALUES
    ('B17', 'Desayuno veg salado: proteína veg + pan + verdura + aceite', 'DESAYUNO', 'VEG', 'AMBOS', 'Equilibrado', 'Alta saciedad', 'mindfit_variability_v1'),
    ('B18', 'Desayuno veg dulce: proteína veg + avena + fruta + frutos secos', 'DESAYUNO', 'VEG', 'AMBOS', 'Equilibrado', 'Media saciedad', 'mindfit_variability_v1'),

    ('D15', 'Cena volumen clásica: proteína + carb cocido + verdura + aceite', 'CENA', 'AMBOS', 'VOLUMEN', 'Alta densidad', 'Alta saciedad', 'mindfit_variability_v1'),
    ('D16', 'Cena volumen doble carb: proteína magra + carb base + carb cocido + verdura', 'CENA', 'AMBOS', 'VOLUMEN', 'Alta densidad', 'Alta saciedad', 'mindfit_variability_v1'),
    ('D17', 'Cena volumen tipo wrap: proteína + pan + verdura + grasa base', 'CENA', 'AMBOS', 'VOLUMEN', 'Alta densidad', 'Media saciedad', 'mindfit_variability_v1'),
    ('D18', 'Cena equilibrada: proteína magra + pan + verdura + aceite', 'CENA', 'AMBOS', 'AMBOS', 'Equilibrado', 'Media saciedad', 'mindfit_variability_v1'),
    ('D19', 'Cena rápida láctea: lácteo proteico + pan + fruta + frutos secos', 'CENA', 'AMBOS', 'AMBOS', 'Equilibrado', 'Media saciedad', 'mindfit_variability_v1'),

    ('D20', 'Cena veg bowl: proteína veg + carb cocido + verdura + aceite', 'CENA', 'VEG', 'AMBOS', 'Equilibrado', 'Alta saciedad', 'mindfit_variability_v1'),
    ('D21', 'Cena veg legumbre: legumbre + pan + verdura + aceite', 'CENA', 'VEG', 'AMBOS', 'Equilibrado', 'Alta saciedad', 'mindfit_variability_v1'),
    ('D22', 'Cena veg cereal: proteína veg + carb base + verdura + grasa base', 'CENA', 'VEG', 'AMBOS', 'Equilibrado', 'Media saciedad', 'mindfit_variability_v1'),
    ('D23', 'Cena veg alta saciedad: legumbre + carb cocido + verdura + frutos secos', 'CENA', 'VEG', 'AMBOS', 'Equilibrado', 'Muy alta saciedad', 'mindfit_variability_v1'),

    ('S11', 'Snack mixto: proteína magra + pan + fruta', 'SNACK', 'AMBOS', 'AMBOS', 'Equilibrado', 'Media saciedad', 'mindfit_variability_v1'),
    ('S12', 'Snack post ligero: lácteo proteico + carb rápido + frutos secos', 'SNACK', 'AMBOS', 'AMBOS', 'Equilibrado', 'Media saciedad', 'mindfit_variability_v1'),

    ('S13', 'Snack veg simple: proteína veg + fruta + frutos secos', 'SNACK', 'VEG', 'AMBOS', 'Equilibrado', 'Media saciedad', 'mindfit_variability_v1'),
    ('S14', 'Snack veg salado: legumbre + pan + verdura', 'SNACK', 'VEG', 'AMBOS', 'Equilibrado', 'Alta saciedad', 'mindfit_variability_v1'),
    ('S15', 'Snack veg entrenable: suplemento proteína + carb rápido + fruta', 'SNACK', 'VEG', 'AMBOS', 'Equilibrado', 'Media saciedad', 'mindfit_variability_v1')
)
INSERT INTO app.meal_templates (
  template_code,
  template_name,
  meal_type,
  diet_allowed,
  day_context,
  phase_bias,
  satiety_bias,
  is_active,
  source
)
SELECT
  td.template_code,
  td.template_name,
  td.meal_type,
  td.diet_allowed,
  td.day_context,
  td.phase_bias,
  td.satiety_bias,
  TRUE,
  td.source
FROM template_data td
ON CONFLICT (template_code)
DO UPDATE SET
  template_name = EXCLUDED.template_name,
  meal_type = EXCLUDED.meal_type,
  diet_allowed = EXCLUDED.diet_allowed,
  day_context = EXCLUDED.day_context,
  phase_bias = EXCLUDED.phase_bias,
  satiety_bias = EXCLUDED.satiety_bias,
  is_active = TRUE,
  source = EXCLUDED.source,
  updated_at = NOW();

WITH slot_data (template_code, slot_order, slot_role) AS (
  VALUES
    ('B17', 1, 'PROTEINA_VEGETAL'),
    ('B17', 2, 'CARBO_PAN'),
    ('B17', 3, 'VERDURA'),
    ('B17', 4, 'GRASA_ACEITE'),
    ('B18', 1, 'PROTEINA_VEGETAL'),
    ('B18', 2, 'CARBO_AVENA'),
    ('B18', 3, 'FRUTA'),
    ('B18', 4, 'GRASA_FRUTOS_SECOS'),

    ('D15', 1, 'PROTEINA_ANIMAL'),
    ('D15', 2, 'CARBO_COCIDO'),
    ('D15', 3, 'VERDURA'),
    ('D15', 4, 'GRASA_ACEITE'),
    ('D16', 1, 'PROTEINA_ANIMAL_MAGRA'),
    ('D16', 2, 'CARBO_BASE'),
    ('D16', 3, 'CARBO_COCIDO'),
    ('D16', 4, 'VERDURA'),
    ('D17', 1, 'PROTEINA_ANIMAL_MAGRA'),
    ('D17', 2, 'CARBO_PAN'),
    ('D17', 3, 'VERDURA'),
    ('D17', 4, 'GRASA_BASE'),
    ('D18', 1, 'PROTEINA_ANIMAL_MAGRA'),
    ('D18', 2, 'CARBO_PAN'),
    ('D18', 3, 'VERDURA'),
    ('D18', 4, 'GRASA_ACEITE'),
    ('D19', 1, 'LACTEO_PROTEICO_MAGRO'),
    ('D19', 2, 'CARBO_PAN'),
    ('D19', 3, 'FRUTA'),
    ('D19', 4, 'GRASA_FRUTOS_SECOS'),
    ('D20', 1, 'PROTEINA_VEGETAL'),
    ('D20', 2, 'CARBO_COCIDO'),
    ('D20', 3, 'VERDURA'),
    ('D20', 4, 'GRASA_ACEITE'),
    ('D21', 1, 'LEGUMBRE'),
    ('D21', 2, 'CARBO_PAN'),
    ('D21', 3, 'VERDURA'),
    ('D21', 4, 'GRASA_ACEITE'),
    ('D22', 1, 'PROTEINA_VEGETAL'),
    ('D22', 2, 'CARBO_BASE'),
    ('D22', 3, 'VERDURA'),
    ('D22', 4, 'GRASA_BASE'),
    ('D23', 1, 'LEGUMBRE'),
    ('D23', 2, 'CARBO_COCIDO'),
    ('D23', 3, 'VERDURA'),
    ('D23', 4, 'GRASA_FRUTOS_SECOS'),

    ('S11', 1, 'PROTEINA_ANIMAL_MAGRA'),
    ('S11', 2, 'CARBO_PAN'),
    ('S11', 3, 'FRUTA'),
    ('S12', 1, 'LACTEO_PROTEICO_MAGRO'),
    ('S12', 2, 'CARBO_RAPIDO'),
    ('S12', 3, 'GRASA_FRUTOS_SECOS'),

    ('S13', 1, 'PROTEINA_VEGETAL'),
    ('S13', 2, 'FRUTA'),
    ('S13', 3, 'GRASA_FRUTOS_SECOS'),
    ('S14', 1, 'LEGUMBRE'),
    ('S14', 2, 'CARBO_PAN'),
    ('S14', 3, 'VERDURA'),
    ('S15', 1, 'SUPLEMENTO_PROTEINA'),
    ('S15', 2, 'CARBO_RAPIDO'),
    ('S15', 3, 'FRUTA')
),
target_templates AS (
  SELECT id, template_code
  FROM app.meal_templates
  WHERE template_code IN (SELECT DISTINCT template_code FROM slot_data)
)
DELETE FROM app.meal_template_slots mts
USING target_templates tt
WHERE mts.template_id = tt.id;

WITH slot_data (template_code, slot_order, slot_role) AS (
  VALUES
    ('B17', 1, 'PROTEINA_VEGETAL'),
    ('B17', 2, 'CARBO_PAN'),
    ('B17', 3, 'VERDURA'),
    ('B17', 4, 'GRASA_ACEITE'),
    ('B18', 1, 'PROTEINA_VEGETAL'),
    ('B18', 2, 'CARBO_AVENA'),
    ('B18', 3, 'FRUTA'),
    ('B18', 4, 'GRASA_FRUTOS_SECOS'),

    ('D15', 1, 'PROTEINA_ANIMAL'),
    ('D15', 2, 'CARBO_COCIDO'),
    ('D15', 3, 'VERDURA'),
    ('D15', 4, 'GRASA_ACEITE'),
    ('D16', 1, 'PROTEINA_ANIMAL_MAGRA'),
    ('D16', 2, 'CARBO_BASE'),
    ('D16', 3, 'CARBO_COCIDO'),
    ('D16', 4, 'VERDURA'),
    ('D17', 1, 'PROTEINA_ANIMAL_MAGRA'),
    ('D17', 2, 'CARBO_PAN'),
    ('D17', 3, 'VERDURA'),
    ('D17', 4, 'GRASA_BASE'),
    ('D18', 1, 'PROTEINA_ANIMAL_MAGRA'),
    ('D18', 2, 'CARBO_PAN'),
    ('D18', 3, 'VERDURA'),
    ('D18', 4, 'GRASA_ACEITE'),
    ('D19', 1, 'LACTEO_PROTEICO_MAGRO'),
    ('D19', 2, 'CARBO_PAN'),
    ('D19', 3, 'FRUTA'),
    ('D19', 4, 'GRASA_FRUTOS_SECOS'),
    ('D20', 1, 'PROTEINA_VEGETAL'),
    ('D20', 2, 'CARBO_COCIDO'),
    ('D20', 3, 'VERDURA'),
    ('D20', 4, 'GRASA_ACEITE'),
    ('D21', 1, 'LEGUMBRE'),
    ('D21', 2, 'CARBO_PAN'),
    ('D21', 3, 'VERDURA'),
    ('D21', 4, 'GRASA_ACEITE'),
    ('D22', 1, 'PROTEINA_VEGETAL'),
    ('D22', 2, 'CARBO_BASE'),
    ('D22', 3, 'VERDURA'),
    ('D22', 4, 'GRASA_BASE'),
    ('D23', 1, 'LEGUMBRE'),
    ('D23', 2, 'CARBO_COCIDO'),
    ('D23', 3, 'VERDURA'),
    ('D23', 4, 'GRASA_FRUTOS_SECOS'),

    ('S11', 1, 'PROTEINA_ANIMAL_MAGRA'),
    ('S11', 2, 'CARBO_PAN'),
    ('S11', 3, 'FRUTA'),
    ('S12', 1, 'LACTEO_PROTEICO_MAGRO'),
    ('S12', 2, 'CARBO_RAPIDO'),
    ('S12', 3, 'GRASA_FRUTOS_SECOS'),

    ('S13', 1, 'PROTEINA_VEGETAL'),
    ('S13', 2, 'FRUTA'),
    ('S13', 3, 'GRASA_FRUTOS_SECOS'),
    ('S14', 1, 'LEGUMBRE'),
    ('S14', 2, 'CARBO_PAN'),
    ('S14', 3, 'VERDURA'),
    ('S15', 1, 'SUPLEMENTO_PROTEINA'),
    ('S15', 2, 'CARBO_RAPIDO'),
    ('S15', 3, 'FRUTA')
)
INSERT INTO app.meal_template_slots (
  template_id,
  slot_order,
  slot_role,
  slot_note,
  quantity_hint
)
SELECT
  mt.id,
  sd.slot_order,
  sd.slot_role,
  'Plantilla variabilidad v1',
  'Ajustar gramos (estado_base) para cuadrar macros. Mostrar estado según preferencia.'
FROM slot_data sd
JOIN app.meal_templates mt ON mt.template_code = sd.template_code;

COMMIT;
