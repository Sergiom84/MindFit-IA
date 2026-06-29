-- Ruleset MindFeed para Halterofilia (Fase 3)
-- Añade un scope 'halterofilia_v1' a app.mindfeed_rulesets con las reglas de una
-- disciplina de FUERZA/TÉCNICA: progresión por CARGA (lineal/ondulante con picos),
-- reps bajas, descansos largos, énfasis en técnica y deload/tapering antes de
-- los tests de 1RM. Distinto de hipertrofia/calistenia (que progresan por
-- reps/variante) y de crossfit (escala).
--
-- Es ADITIVO: no modifica otros scopes ni datos existentes. Idempotente (no
-- duplica si ya existe). Diseñado para reutilizarse en Powerlifting y Heavy Duty
-- (disciplinas de fuerza) con pequeños ajustes.

INSERT INTO app.mindfeed_rulesets (scope, version, rules, is_active, created_at, updated_at)
SELECT
  'halterofilia_v1',
  'Halterofilia_v1',
  '{
    "restSecondsDefault": 150,
    "repRange": { "main": "1-3", "strength": "3-5", "accessory": "6-10" },
    "loadModel": "percent_1rm",
    "progression": {
      "model": "load_progression",
      "waves": ["linear", "undulating", "peak"],
      "incrementPercent": { "main": 2.5, "strength": 5 },
      "techniqueGate": true
    },
    "deloadRules": { "deloadEvery": 4, "loadFactor": 0.7, "taperBeforeTest": true },
    "priorities": ["tecnica", "carga"],
    "meta": { "spec": "Halterofilia_v1", "methodology": "halterofilia", "reusableFor": ["powerlifting", "heavy_duty"] }
  }'::jsonb,
  true,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM app.mindfeed_rulesets WHERE scope = 'halterofilia_v1'
);
