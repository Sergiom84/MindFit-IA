-- Seed v2 de penalties contextuales (desayuno/snack) para reducir combinaciones poco apetecibles
-- detectadas en generación real de menús.

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
    'caballo_carne_de_potro',
    'remolacha_cocida',
    'penalty',
    36,
    ARRAY['DESAYUNO','SNACK']::TEXT[],
    'Plato principal salado poco coherente para desayuno o snack',
    TRUE
  ),
  (
    'carne_picada_vacuno_5',
    'zanahoria_cocida',
    'penalty',
    34,
    ARRAY['DESAYUNO','SNACK']::TEXT[],
    'Combinación de comida principal no prioritaria en desayuno/snack',
    TRUE
  ),
  (
    'conejo',
    'zanahoria_cruda',
    'penalty',
    34,
    ARRAY['DESAYUNO','SNACK']::TEXT[],
    'Combinación de comida principal no prioritaria en desayuno/snack',
    TRUE
  ),
  (
    'natto',
    'remolacha_cocida',
    'penalty',
    24,
    ARRAY['DESAYUNO','SNACK']::TEXT[],
    'Perfil culinario poco habitual para desayuno/snack general',
    TRUE
  ),
  (
    'seitan',
    'zanahoria_cocida',
    'penalty',
    22,
    ARRAY['DESAYUNO','SNACK']::TEXT[],
    'Combinación salada de plato principal penalizada en desayuno/snack',
    TRUE
  ),
  (
    'bagel',
    'zanahoria_cocida',
    'penalty',
    18,
    ARRAY['DESAYUNO','SNACK']::TEXT[],
    'Combinación de pan con verdura cocida poco apetecible en ingesta rápida',
    TRUE
  ),
  (
    'pan_blanco',
    'zanahoria_cruda',
    'penalty',
    18,
    ARRAY['DESAYUNO','SNACK']::TEXT[],
    'Combinación de pan con verdura cruda poco apetecible en ingesta rápida',
    TRUE
  ),
  (
    'arepa',
    'remolacha_cocida',
    'penalty',
    16,
    ARRAY['DESAYUNO','SNACK']::TEXT[],
    'Combinación poco prioritaria frente a opciones más palatables',
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
