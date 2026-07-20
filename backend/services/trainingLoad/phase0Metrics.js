/**
 * 📊 Métricas de observabilidad de la Fase 0 (Nutrición doc04 PR6, spec §18.1-18.2).
 *
 * Reúne las señales de salud del rollout entrenamiento↔nutrición SIN datos sensibles
 * (§18.2: nada de email, texto clínico libre, tokens ni documentos completos): solo
 * conteos y porcentajes agregados. Las queries se exportan como CONSTANTES para poder
 * asertarlas en pruebas y reutilizarlas desde el endpoint admin `GET /api/admin/phase0/metrics`.
 *
 * Cada query devuelve UNA fila con columnas nombradas (::int / ::numeric) para que el runner
 * las combine sin ambigüedad. Todas son de SOLO LECTURA.
 *
 * Cobertura §18.1:
 *  - % workout_schedule con day_id (100% en nuevos; históricos tras backfill).
 *  - % días periodizados con contrato de carga válido (source = planned_session_load).
 *  - % fallback D1 baja confianza (debe bajar con las fases específicas).
 *  - Eventos outbox pendientes > 10 min (objetivo 0 sostenido).
 *  - Eventos fallidos tras 5 intentos (objetivo 0; alerta si > 0).
 *  - Decisiones duplicadas por source_event_id (objetivo 0; el índice único lo garantiza).
 *  - Días con drift energético semanal > 1% (objetivo 0; periodización isocalórica).
 */

/** % de workout_schedule con day_id (§18.1, criterio §21.5). */
export const SCHEDULE_DAY_ID_SQL = `
SELECT
  COUNT(*)::int AS schedule_total,
  COUNT(*) FILTER (WHERE day_id IS NOT NULL)::int AS schedule_with_day_id
FROM app.workout_schedule`;

/**
 * Señales de la periodización persistida en nutrition_plan_days.periodization_context:
 *  - total periodizado, % con contrato de carga real (no fallback booleano),
 *  - % de días en fallback D1 baja confianza.
 */
export const PERIODIZATION_CONFIDENCE_SQL = `
SELECT
  COUNT(*)::int AS periodized_total,
  COUNT(*) FILTER (
    WHERE periodization_context->>'source' = 'planned_session_load'
  )::int AS with_valid_contract,
  COUNT(*) FILTER (
    WHERE periodization_context->>'day_type' = 'D1'
      AND periodization_context->>'load_confidence' = 'low'
  )::int AS d1_low_confidence
FROM app.nutrition_plan_days
WHERE periodization_context IS NOT NULL`;

/** Salud de la cola outbox: pendientes antiguos y fallidos terminales. */
export const OUTBOX_HEALTH_SQL = `
SELECT
  COUNT(*) FILTER (
    WHERE status = 'pending' AND created_at < NOW() - INTERVAL '10 minutes'
  )::int AS pending_over_10min,
  COUNT(*) FILTER (WHERE status = 'failed' AND attempts >= 5)::int AS failed_after_max_attempts,
  COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_total,
  COUNT(*) FILTER (WHERE status = 'processing')::int AS processing_total,
  COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_total,
  COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_total,
  COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped_total
FROM app.bridge_event_outbox`;

/**
 * Decisiones duplicadas por (user_id, trigger_source, source_event_id). El índice único
 * `uq_bridge_decision_source_event` (PR3) lo impide, así que el resultado DEBE ser 0.
 */
export const DUPLICATE_DECISIONS_SQL = `
SELECT COALESCE(SUM(dup_count), 0)::int AS duplicate_decisions
FROM (
  SELECT COUNT(*) - 1 AS dup_count
  FROM app.bridge_decision_logs
  WHERE source_event_id IS NOT NULL
  GROUP BY user_id, trigger_source, source_event_id
  HAVING COUNT(*) > 1
) d`;

/**
 * Días con drift energético > 1% entre las kcal base y las resueltas (§18.1). La
 * periodización es isocalórica respecto a la base, así que el objetivo es 0.
 * kcal = proteína*4 + carbohidrato*4 + grasa*9, calculado desde base_macros/resolved_macros.
 */
export const WEEKLY_DRIFT_SQL = `
WITH pc AS (
  SELECT
    (periodization_context->'base_macros'->>'protein_g')::numeric * 4
      + (periodization_context->'base_macros'->>'carbs_g')::numeric * 4
      + (periodization_context->'base_macros'->>'fat_g')::numeric * 9 AS base_kcal,
    (periodization_context->'resolved_macros'->>'protein_g')::numeric * 4
      + (periodization_context->'resolved_macros'->>'carbs_g')::numeric * 4
      + (periodization_context->'resolved_macros'->>'fat_g')::numeric * 9 AS resolved_kcal
  FROM app.nutrition_plan_days
  WHERE periodization_context IS NOT NULL
    AND periodization_context ? 'base_macros'
    AND periodization_context ? 'resolved_macros'
)
SELECT
  COUNT(*)::int AS days_with_macros,
  COUNT(*) FILTER (
    WHERE base_kcal > 0 AND ABS(resolved_kcal - base_kcal) / base_kcal > 0.01
  )::int AS days_drift_over_1pct
FROM pc`;

/** Porcentaje redondeado a 2 decimales; 0/0 → null (no hay muestra). */
export function pct(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(d) || d <= 0) return null;
  return Math.round((n / d) * 10000) / 100;
}

/**
 * Ejecuta todas las queries de métricas contra un `pool`/`client` con `.query()`.
 * Devuelve un objeto estructurado + `alerts` (booleanos de umbral) para el endpoint admin.
 * SOLO LECTURA. No lanza por métricas vacías (una BD sin datos devuelve ceros/null).
 * @param {{query: Function}} db
 * @returns {Promise<object>}
 */
export async function collectPhase0Metrics(db) {
  const [schedule, periodization, outbox, duplicates, drift] = await Promise.all([
    db.query(SCHEDULE_DAY_ID_SQL),
    db.query(PERIODIZATION_CONFIDENCE_SQL),
    db.query(OUTBOX_HEALTH_SQL),
    db.query(DUPLICATE_DECISIONS_SQL),
    db.query(WEEKLY_DRIFT_SQL)
  ]);

  const s = schedule.rows[0] || {};
  const p = periodization.rows[0] || {};
  const o = outbox.rows[0] || {};
  const dup = duplicates.rows[0] || {};
  const dr = drift.rows[0] || {};

  const pendingOver10 = Number(o.pending_over_10min || 0);
  const failedTerminal = Number(o.failed_after_max_attempts || 0);
  const duplicateDecisions = Number(dup.duplicate_decisions || 0);
  const driftOver1pct = Number(dr.days_drift_over_1pct || 0);

  return {
    generated_at: new Date().toISOString(),
    schedule: {
      total: Number(s.schedule_total || 0),
      with_day_id: Number(s.schedule_with_day_id || 0),
      pct_with_day_id: pct(s.schedule_with_day_id, s.schedule_total)
    },
    periodization: {
      total: Number(p.periodized_total || 0),
      with_valid_contract: Number(p.with_valid_contract || 0),
      pct_with_valid_contract: pct(p.with_valid_contract, p.periodized_total),
      d1_low_confidence: Number(p.d1_low_confidence || 0),
      pct_d1_low_confidence: pct(p.d1_low_confidence, p.periodized_total)
    },
    outbox: {
      pending_total: Number(o.pending_total || 0),
      processing_total: Number(o.processing_total || 0),
      failed_total: Number(o.failed_total || 0),
      completed_total: Number(o.completed_total || 0),
      skipped_total: Number(o.skipped_total || 0),
      pending_over_10min: pendingOver10,
      failed_after_max_attempts: failedTerminal
    },
    decisions: {
      duplicate_decisions: duplicateDecisions
    },
    drift: {
      days_with_macros: Number(dr.days_with_macros || 0),
      days_drift_over_1pct: driftOver1pct
    },
    // Umbrales §18.1: cualquier true exige revisión antes de avanzar el rollout.
    alerts: {
      outbox_pending_backlog: pendingOver10 > 0,
      outbox_failed_terminal: failedTerminal > 0,
      duplicate_decisions: duplicateDecisions > 0,
      weekly_drift: driftOver1pct > 0
    }
  };
}

export default {
  SCHEDULE_DAY_ID_SQL,
  PERIODIZATION_CONFIDENCE_SQL,
  OUTBOX_HEALTH_SQL,
  DUPLICATE_DECISIONS_SQL,
  WEEKLY_DRIFT_SQL,
  pct,
  collectPhase0Metrics
};
