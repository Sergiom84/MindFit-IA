-- Ruleset MindFeed para Heavy Duty (HIT / Mentzer) — Fase 3
-- Añade un scope 'heavy_duty_v1' a app.mindfeed_rulesets con las reglas de una
-- disciplina de ALTA INTENSIDAD / BAJO VOLUMEN: 1-2 series llevadas al FALLO
-- muscular (RIR≈0), baja frecuencia, descansos largos, progresión por CARGA al
-- alcanzar el tope de reps en el rango objetivo (doble progresión reps→carga) y
-- deload/recuperación generosa.
--
-- Distinto de hipertrofia/calistenia (progresan por reps/variante con RIR 2-3),
-- de crossfit (escala) y de halterofilia/powerlifting (%1RM con técnica). Aquí el
-- lever es el FALLO, no las reps en reserva.
--
-- Es ADITIVO: no modifica otros scopes ni datos existentes. Idempotente (no
-- duplica si ya existe).
--
-- Nota: el cargador (GymRoutineService.loadGymRuleset) lee
--   restSecondsDefault, deloadRules.deloadEvery y deloadRules.volumeFactor.

INSERT INTO app.mindfeed_rulesets (scope, version, rules, is_active, created_at, updated_at)
SELECT
  'heavy_duty_v1',
  'HeavyDuty_v1',
  '{
    "restSecondsDefault": 180,
    "repRange": { "compound": "6-10", "isolation": "8-15" },
    "loadModel": "load_to_failure",
    "volume": { "seriesPerExercise": "1-2", "lowVolume": true },
    "frequency": { "sessionsPerWeek": "2-3", "lowFrequency": true, "restBetweenSessions": "generous" },
    "progression": {
      "model": "double_progression",
      "trigger": "reach_failure_at_top_of_range",
      "incrementPercent": { "compound": 2.5, "isolation": 5 },
      "failureGate": true
    },
    "deloadRules": { "deloadEvery": 4, "volumeFactor": 0.5, "loadFactor": 0.6, "extraRecovery": true },
    "priorities": ["intensidad", "tecnica", "recuperacion"],
    "safety": { "failureWithLoad": "usa maquina o asistencia/seguridad; no llegues al fallo en ejercicios de riesgo sin ayuda" },
    "meta": { "spec": "HeavyDuty_v1", "methodology": "heavy_duty", "author": "Mentzer/HIT", "reusableFor": ["powerlifting"] }
  }'::jsonb,
  true,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM app.mindfeed_rulesets WHERE scope = 'heavy_duty_v1'
);
