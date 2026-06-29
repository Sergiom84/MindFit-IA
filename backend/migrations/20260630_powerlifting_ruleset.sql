-- Ruleset MindFeed para Powerlifting (Fase 3)
-- Añade un scope 'powerlifting_v1' a app.mindfeed_rulesets con las reglas de una
-- disciplina de FUERZA MÁXIMA: progresión por CARGA con periodización y picos
-- (lineal/ondulante/bloques) en torno a los 3 básicos (sentadilla/banca/peso
-- muerto), reps BAJAS, descansos largos, %1RM/RPE como modelo de carga y
-- deload/tapering antes de los tests de 1RM o competición. Distinto de
-- hipertrofia/calistenia (que progresan por reps/variante con RIR 2-3) y de
-- crossfit (escala). Hermano del scope 'halterofilia_v1' (ambos fuerza %1RM/RPE).
--
-- Es ADITIVO: no modifica otros scopes ni datos existentes. Idempotente (no
-- duplica si ya existe).

INSERT INTO app.mindfeed_rulesets (scope, version, rules, is_active, created_at, updated_at)
SELECT
  'powerlifting_v1',
  'Powerlifting_v1',
  '{
    "restSecondsDefault": 180,
    "repRange": { "main": "1-5", "strength": "3-6", "accessory": "8-12" },
    "loadModel": "percent_1rm",
    "autoregModel": "rpe",
    "progression": {
      "model": "load_progression",
      "waves": ["linear", "undulating", "block"],
      "incrementPercent": { "main": 2.5, "accessory": 5 },
      "peakingBlock": true,
      "techniqueGate": true
    },
    "deloadRules": { "deloadEvery": 4, "loadFactor": 0.7, "taperBeforeTest": true },
    "priorities": ["tecnica", "carga"],
    "meta": { "spec": "Powerlifting_v1", "methodology": "powerlifting", "basics": ["sentadilla", "press_banca", "peso_muerto"], "relatedTo": ["halterofilia", "heavy_duty"] }
  }'::jsonb,
  true,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM app.mindfeed_rulesets WHERE scope = 'powerlifting_v1'
);
