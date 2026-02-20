-- Seed inicial de reglas soft (penalty) para reducir combinaciones poco apetecibles.

BEGIN;

INSERT INTO app.food_pairing_rules (
  food_slug_a,
  food_slug_b,
  rule_type,
  penalty,
  contexts,
  reason,
  is_active
)
VALUES
  (
    'proteina_vegetal_soja',
    'galletas_tipo_maria',
    'penalty',
    30,
    ARRAY['COMIDA','CENA','SNACK']::TEXT[],
    'Combinación poco coherente para comida principal; penalizar selección',
    TRUE
  ),
  (
    'proteina_vegetal_guisante',
    'corn_flakes',
    'penalty',
    24,
    ARRAY['COMIDA','CENA','SNACK']::TEXT[],
    'Perfil de snack rápido; penalizar fuera de contexto de desayuno/snack',
    TRUE
  ),
  (
    'aceite_de_linaza',
    'queso_cottage',
    'penalty',
    12,
    ARRAY['DESAYUNO','SNACK']::TEXT[],
    'Combinación posible pero baja palatabilidad habitual',
    TRUE
  ),
  (
    'margarina',
    'seitan',
    'penalty',
    20,
    ARRAY['COMIDA','CENA']::TEXT[],
    'Combinación generalmente poco apetecible para plato principal',
    TRUE
  )
ON CONFLICT (food_slug_a, food_slug_b, rule_type) DO UPDATE
SET
  penalty = EXCLUDED.penalty,
  contexts = EXCLUDED.contexts,
  reason = EXCLUDED.reason,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

COMMIT;
