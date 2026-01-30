-- MindFeed Compliance v1 - Fase A
-- Contratos de ruleset y configuración normativa para HypertrofiaV2 (Principiante)

-- 1) Tabla de rulesets versionados
CREATE TABLE IF NOT EXISTS app.mindfeed_rulesets (
  id BIGSERIAL PRIMARY KEY,
  scope VARCHAR(100) NOT NULL,
  version VARCHAR(50) NOT NULL,
  rules JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

-- Solo un ruleset activo por scope
CREATE UNIQUE INDEX IF NOT EXISTS mindfeed_rulesets_one_active_per_scope
  ON app.mindfeed_rulesets(scope)
  WHERE is_active = TRUE;

-- 2) Helper para obtener ruleset activo por scope
CREATE OR REPLACE FUNCTION app.get_active_mindfeed_ruleset(p_scope VARCHAR)
RETURNS JSONB
LANGUAGE plpgsql
AS $function$
DECLARE
  v_rules JSONB;
BEGIN
  SELECT rules
  INTO v_rules
  FROM app.mindfeed_rulesets
  WHERE scope = p_scope AND is_active = TRUE
  ORDER BY id DESC
  LIMIT 1;

  RETURN COALESCE(v_rules, '{}'::jsonb);
END;
$function$;

-- 3) Ruleset normativo MindFeed v1 - Principiante
-- Nota: se desactiva cualquier ruleset previo del mismo scope
UPDATE app.mindfeed_rulesets
SET is_active = FALSE,
    updated_at = NOW()
WHERE scope = 'hipertrofia_v2_principiante'
  AND is_active = TRUE;

INSERT INTO app.mindfeed_rulesets (scope, version, rules, is_active)
VALUES (
  'hipertrofia_v2_principiante',
  'mindfeed_spec_v1',
  $$
  {
    "meta": {
      "spec": "MindFeed_Compliance_Spec_v1",
      "level": "Principiante"
    },
    "intensityByDay": {
      "heavyDaysPercent": 80,
      "lightDaysRange": [70, 75]
    },
    "restSecondsByType": {
      "multiarticular": 90,
      "unilateral": 60,
      "analitico": 50
    },
    "deloadRules": {
      "deloadWeeks": [6],
      "plannedTriggerMicrocycles": 6,
      "reactiveWindowDays": 10,
      "reactiveCriticalFlagsThreshold": 1,
      "loadFactor": 0.7,
      "volumeFactor": 0.5
    },
    "overlapRules": {
      "windowHours": 72,
      "partialAdjustmentFactor": 0.975,
      "highAdjustmentFactor": 0.95
    },
    "priorityRules": {
      "topSet": {
        "weeklyLimit": 1,
        "initialPercent": 82.5,
        "maxPercent": 85,
        "firstWeeksLimit": 4,
        "minWeeksForMaxPercent": 2,
        "minMeanRir": 3
      },
      "priorityProgression": {
        "baseIncrementPct": 2.5,
        "highReadinessIncrementPct": 3.5,
        "lowReadinessDecrementPct": -2.5,
        "lowMeanRirThreshold": 2,
        "highMeanRirThreshold": 3
      },
      "nonPriority": {
        "heavyDayPercent": 76,
        "heavyDayRange": [75, 77.5],
        "lightDayPercent": 70,
        "progressionFrozen": true,
        "reactivationMeanRir": 4,
        "reactivationWeeks": 2
      }
    },
    "volumeProfiles": {
      "Pecho": { "multiarticular": 1, "unilateral": 1, "analitico": 1, "sets": 2 },
      "Espalda": { "multiarticular": 1, "unilateral": 1, "analitico": 1, "sets": 2 },
      "Tríceps": { "multiarticular": 0, "unilateral": 1, "analitico": 1, "sets": 2 },
      "Bíceps": { "multiarticular": 0, "unilateral": 1, "analitico": 1, "sets": 2 },
      "Piernas (cuádriceps)": { "multiarticular": 2, "unilateral": 1, "analitico": 0, "sets": 2 },
      "Piernas (isquios)": { "multiarticular": 1, "unilateral": 1, "analitico": 0, "sets": 2 },
      "Glúteo": { "multiarticular": 0, "unilateral": 1, "analitico": 0, "sets": 2 },
      "Gemelos": { "multiarticular": 0, "unilateral": 0, "analitico": 1, "sets": 2 },
      "Hombro": { "multiarticular": 1, "unilateral": 0, "analitico": 1, "sets": 2 },
      "Hombro (medios)": { "multiarticular": 0, "unilateral": 0, "analitico": 1, "sets": 2 },
      "Hombro (posterior)": { "multiarticular": 0, "unilateral": 0, "analitico": 1, "sets": 2 },
      "Core": { "multiarticular": 0, "unilateral": 0, "analitico": 3, "sets": 2 }
    }
  }
  $$::jsonb,
  TRUE
);

-- 4) Actualizar timestamp en cambios futuros
CREATE OR REPLACE FUNCTION app.update_mindfeed_rulesets_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_update_mindfeed_rulesets_updated_at ON app.mindfeed_rulesets;
CREATE TRIGGER trg_update_mindfeed_rulesets_updated_at
BEFORE UPDATE ON app.mindfeed_rulesets
FOR EACH ROW
EXECUTE FUNCTION app.update_mindfeed_rulesets_updated_at();
