-- Ruleset MindFeed para Entrenamiento Funcional (Fase 3)
-- Generaliza el motor de reglas por metodología: añade un scope 'funcional_v1'
-- a app.mindfeed_rulesets con las reglas de descanso, deload por volumen y
-- progresión (reps/carga/variante por patrón de movimiento) de funcional.
-- Es ADITIVO: no modifica el scope de HipertrofiaV2, calistenia_v2 ni crossfit_v1
-- ni datos existentes. Idempotente (no duplica si ya existe).

INSERT INTO app.mindfeed_rulesets (scope, version, rules, is_active, created_at, updated_at)
SELECT
  'funcional_v1',
  'Funcional_v1',
  '{
    "restSecondsDefault": 75,
    "deloadRules": { "deloadEvery": 4, "volumeFactor": 0.6 },
    "progression": {
      "model": "reps_load_variant",
      "byPattern": true,
      "patterns": ["Empuje", "Tracción", "Piernas", "Core", "Movilidad"]
    },
    "meta": { "spec": "Funcional_v1", "methodology": "funcional" }
  }'::jsonb,
  true,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM app.mindfeed_rulesets WHERE scope = 'funcional_v1'
);
