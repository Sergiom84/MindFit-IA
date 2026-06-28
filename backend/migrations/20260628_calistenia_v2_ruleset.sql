-- Ruleset MindFeed para Calistenia (Fase 3b)
-- Generaliza el motor de reglas por metodología: añade un scope 'calistenia_v2'
-- a app.mindfeed_rulesets con las reglas de descanso, deload y progresión
-- (reps->variante) de calistenia. Es ADITIVO: no modifica el scope de
-- HipertrofiaV2 ni datos existentes. Idempotente (no duplica si ya existe).

INSERT INTO app.mindfeed_rulesets (scope, version, rules, is_active, created_at, updated_at)
SELECT
  'calistenia_v2',
  'Calistenia_v2',
  '{
    "restSecondsDefault": 75,
    "deloadRules": { "deloadEvery": 6, "volumeFactor": 0.5 },
    "progression": { "model": "reps_to_variant" },
    "meta": { "spec": "Calistenia_v2", "methodology": "calistenia" }
  }'::jsonb,
  true,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM app.mindfeed_rulesets WHERE scope = 'calistenia_v2'
);
