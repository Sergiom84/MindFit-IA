-- Ruleset MindFeed para CrossFit (Fase 3)
-- Generaliza el motor de reglas por metodología: añade un scope 'crossfit_v1'
-- a app.mindfeed_rulesets con las reglas de descanso, deload, progresión por
-- escala (Scaled -> RX -> RX+) y gestión de time domains.
-- Es ADITIVO: no modifica el scope de HipertrofiaV2 ni de calistenia_v2 ni datos
-- existentes. Idempotente (no duplica si ya existe).

INSERT INTO app.mindfeed_rulesets (scope, version, rules, is_active, created_at, updated_at)
SELECT
  'crossfit_v1',
  'CrossFit_v1',
  '{
    "restSecondsDefault": 60,
    "deloadRules": { "deloadEvery": 4, "volumeFactor": 0.6 },
    "progression": {
      "model": "scale_progression",
      "scales": ["scaled", "rx", "rxplus"]
    },
    "timeDomains": {
      "short": { "min": 3, "max": 8 },
      "medium": { "min": 8, "max": 15 },
      "long": { "min": 15, "max": 25 }
    },
    "meta": { "spec": "CrossFit_v1", "methodology": "crossfit" }
  }'::jsonb,
  true,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM app.mindfeed_rulesets WHERE scope = 'crossfit_v1'
);
