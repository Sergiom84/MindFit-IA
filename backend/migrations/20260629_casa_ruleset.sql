-- Ruleset MindFeed para Entrenamiento en Casa (Fase 3)
-- Añade un scope 'casa_v1' a app.mindfeed_rulesets con las reglas de descanso,
-- deload por volumen y progresión propias de casa: por reps/tiempo, variante del
-- ejercicio o material superior (peso corporal → banda → mancuerna → kettlebell →
-- barra), con descarga por volumen.
-- Es ADITIVO: no modifica el scope de HipertrofiaV2, calistenia_v2, crossfit_v1,
-- funcional_v1 ni halterofilia_v1, ni datos existentes. Idempotente (no duplica
-- si ya existe).

INSERT INTO app.mindfeed_rulesets (scope, version, rules, is_active, created_at, updated_at)
SELECT
  'casa_v1',
  'Casa_v1',
  '{
    "restSecondsDefault": 45,
    "deloadRules": { "deloadEvery": 4, "volumeFactor": 0.6 },
    "progression": {
      "model": "reps_time_variant_material",
      "byBucket": true,
      "buckets": ["FUERZA", "FUNCIONAL", "CARDIO", "MOVILIDAD"],
      "materialLadder": ["Peso corporal", "Banda elástica", "Mancuernas", "Kettlebell", "Barra"]
    },
    "meta": { "spec": "Casa_v1", "methodology": "casa" }
  }'::jsonb,
  true,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM app.mindfeed_rulesets WHERE scope = 'casa_v1'
);
