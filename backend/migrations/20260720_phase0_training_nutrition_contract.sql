-- Nutrición Fase 0 (doc04 PR3) · Persistencia y calendario del contrato
-- entrenamiento↔nutrición. Spec §9/§10 de
-- Auditoria ECI/Nutrición/FASE_0_FUNDAMENTOS_COMPARTIDOS_E_INTEGRACION_NUTRICIONAL.md
--
-- Esquema ADITIVO (no destructivo). Verificado READ ONLY contra producción
-- (proyecto sbqcnlwpvjavmljzkmfy) antes de escribir esta migración:
--   - workout_schedule.day_id: existe (integer, nullable) → 6608 filas, 0 con day_id.
--   - methodology_plan_days.day_id (int NOT NULL), date_local (date NOT NULL),
--     metadata (jsonb), is_rest (bool): todas presentes.
--   - nutrition_plan_days: existe (plan_id uuid); periodization_context NO existe aún.
--   - bridge_decision_logs: existe; source_event_id/contract_version NO existen aún.
--   - bridge_event_outbox: NO existe aún.
--   - app.users(id): existe (FK destino). pgcrypto instalado → gen_random_uuid() OK.
--   - Función legacy app.log_bridge_decision(9 args): existe; NO se toca su firma.
--   - §10.1 query de ambigüedad de day_id: 0 filas (backfill seguro de incluir).
--
-- Idempotente: todas las sentencias usan IF NOT EXISTS / OR REPLACE / ON CONFLICT
-- DO NOTHING, de modo que re-ejecutar la migración no falla ni duplica objetos.
--
-- Se aplica con el runner + ledger (node scripts/migrate.mjs up), NO manualmente.
-- Rollback preferido: funcional (feature flag + parar worker); columnas y tabla son
-- aditivas y no afectan a consumidores antiguos (spec §10.2).

BEGIN;

-- §9.4: auditoría estructurada de la periodización diaria por día nutricional.
ALTER TABLE app.nutrition_plan_days
  ADD COLUMN IF NOT EXISTS periodization_context JSONB;

-- §9 + §13.4: trazabilidad e idempotencia de decisiones del bridge por evento origen.
ALTER TABLE app.bridge_decision_logs
  ADD COLUMN IF NOT EXISTS source_event_id TEXT,
  ADD COLUMN IF NOT EXISTS contract_version TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bridge_decision_source_event
  ON app.bridge_decision_logs (user_id, trigger_source, source_event_id)
  WHERE source_event_id IS NOT NULL;

-- §9.5: cola de eventos fiable e idempotente entre entrenamiento y bridge.
CREATE TABLE IF NOT EXISTS app.bridge_event_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES app.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  contract_version TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'skipped', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  worker_id TEXT,
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bridge_event_outbox_pending
  ON app.bridge_event_outbox (available_at, created_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_bridge_event_outbox_stale_processing
  ON app.bridge_event_outbox (locked_at)
  WHERE status = 'processing';

-- §9.2: backfill de day_id en el calendario histórico por (plan_id + fecha).
-- La query de ambigüedad §10.1 devolvió 0 filas (0 fechas con >1 día no-descanso),
-- por lo que la correspondencia (plan_id, date_local) → day_id es unívoca.
UPDATE app.workout_schedule ws
SET day_id = mpd.day_id,
    updated_at = NOW()
FROM app.methodology_plan_days mpd
WHERE ws.day_id IS NULL
  AND mpd.plan_id = ws.methodology_plan_id
  AND mpd.date_local = ws.scheduled_date
  AND mpd.is_rest = FALSE;

COMMENT ON COLUMN app.nutrition_plan_days.periodization_context IS
  'Auditoría versionada de la periodización diaria basada en training-load.';

COMMENT ON TABLE app.bridge_event_outbox IS
  'Eventos fiables e idempotentes entre entrenamiento y bridge nutricional.';

-- Se crea una función V2 en lugar de cambiar la firma de la función legacy.
-- Así, los consumidores actuales de app.log_bridge_decision(...) siguen intactos.
CREATE OR REPLACE FUNCTION app.log_bridge_decision_v2(
  p_user_id INTEGER,
  p_trigger_source VARCHAR(20),
  p_trigger_event VARCHAR(50),
  p_training_inputs JSONB,
  p_nutrition_inputs JSONB,
  p_decision_type VARCHAR(30),
  p_decision_details JSONB,
  p_applied_nutrition JSONB DEFAULT NULL,
  p_applied_training JSONB DEFAULT NULL,
  p_source_event_id TEXT DEFAULT NULL,
  p_contract_version TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_log_id INTEGER;
BEGIN
  INSERT INTO app.bridge_decision_logs (
    user_id, trigger_source, trigger_event,
    training_inputs, nutrition_inputs,
    decision_type, decision_details,
    applied_nutrition, applied_training,
    was_applied, source_event_id, contract_version
  ) VALUES (
    p_user_id, p_trigger_source, p_trigger_event,
    p_training_inputs, p_nutrition_inputs,
    p_decision_type, p_decision_details,
    p_applied_nutrition, p_applied_training,
    p_applied_nutrition IS NOT NULL OR p_applied_training IS NOT NULL,
    p_source_event_id, p_contract_version
  )
  ON CONFLICT (user_id, trigger_source, source_event_id)
    WHERE source_event_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_log_id;

  IF v_log_id IS NULL AND p_source_event_id IS NOT NULL THEN
    SELECT id INTO v_log_id
    FROM app.bridge_decision_logs
    WHERE user_id = p_user_id
      AND trigger_source = p_trigger_source
      AND source_event_id = p_source_event_id;
  END IF;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION app.log_bridge_decision_v2(
  INTEGER, VARCHAR, VARCHAR, JSONB, JSONB, VARCHAR,
  JSONB, JSONB, JSONB, TEXT, TEXT
) TO authenticated;

-- Nota: NO se concede acceso directo de `authenticated` a bridge_event_outbox.
-- La cola es infraestructura interna del backend (spec §10).

COMMIT;
