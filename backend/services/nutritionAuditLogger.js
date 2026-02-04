/**
 * NUTRITION AUDIT LOGGER
 * Registro de cambios y snapshots semanales
 */

import { pool } from '../db.js';

const CHANGE_TYPES = new Set([
  'kcal_adjust',
  'macro_adjust',
  'phase_change',
  'carb_cycle_adjust',
  'activity_factor_adjust'
]);

const toJsonOrNull = (value) => {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
};

const toDateString = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  return String(value);
};

const daysBetween = (fromDate, toDate) => {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
};

export async function logNutritionChange(params, client = null) {
  const {
    userId,
    changeType,
    delta = null,
    ruleId = null,
    reason = null,
    metrics = null,
    previousValues = null,
    newValues = null,
    source = null,
    changeDate = null
  } = params || {};

  if (!userId || !changeType || !CHANGE_TYPES.has(changeType)) {
    throw new Error('logNutritionChange: datos inválidos');
  }

  const executor = client || pool;

  const query = `
    INSERT INTO app.nutrition_change_log (
      user_id,
      change_date,
      change_type,
      delta,
      rule_id,
      reason,
      metrics,
      previous_values,
      new_values,
      source
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id;
  `;

  const result = await executor.query(query, [
    userId,
    changeDate ? toDateString(changeDate) : null,
    changeType,
    toJsonOrNull(delta),
    ruleId,
    reason,
    toJsonOrNull(metrics),
    toJsonOrNull(previousValues),
    toJsonOrNull(newValues),
    source
  ]);

  return result.rows[0] || null;
}

export async function ensureWeeklySnapshot(userId, options = {}) {
  const snapshotDate = options.snapshotDate || new Date();
  const source = options.source || null;

  const snapshotDateStr = toDateString(snapshotDate);

  const lastResult = await pool.query(
    `SELECT snapshot_date
     FROM app.nutrition_weekly_snapshots
     WHERE user_id = $1
     ORDER BY snapshot_date DESC
     LIMIT 1`,
    [userId]
  );

  if (lastResult.rows.length > 0) {
    const lastDate = lastResult.rows[0].snapshot_date;
    const diff = daysBetween(lastDate, snapshotDateStr);
    if (diff >= 0 && diff < 7) {
      return { skipped: true, reason: 'snapshot_reciente', snapshot_date: lastDate };
    }
  }

  const profileResult = await pool.query(
    'SELECT * FROM app.nutrition_profiles WHERE user_id = $1',
    [userId]
  );
  const profile = profileResult.rows[0] || null;

  const planResult = await pool.query(
    `SELECT kcal_objetivo, macros_objetivo
     FROM app.nutrition_plans_v2
     WHERE user_id = $1 AND tipo = 'activo'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  const plan = planResult.rows[0] || null;

  const metabolicResult = await pool.query(
    'SELECT * FROM app.get_current_metabolic_profile($1)',
    [userId]
  );
  const metabolicProfile = metabolicResult.rows[0] || null;

  const evaluationResult = await pool.query(
    `SELECT indicator_type, indicator_value, status, evaluation_date
     FROM app.nutrition_evaluations
     WHERE user_id = $1
     ORDER BY evaluation_date DESC
     LIMIT 1`,
    [userId]
  );
  const latestEvaluation = evaluationResult.rows[0] || null;

  const bridgeResult = await pool.query(
    'SELECT * FROM app.get_bridge_state($1)',
    [userId]
  );
  const bridgeState = bridgeResult.rows[0] || null;

  let weeklySummary = null;
  try {
    const weekStartResult = await pool.query(
      'SELECT app.get_week_start($1::date) AS week_start',
      [snapshotDateStr]
    );
    const weekStart = weekStartResult.rows[0]?.week_start;
    if (weekStart) {
      const summaryResult = await pool.query(
        'SELECT * FROM app.get_weekly_deviation_summary($1, $2)',
        [userId, weekStart]
      );
      weeklySummary = summaryResult.rows[0] || null;
    }
  } catch (error) {
    console.error('Error obteniendo resumen semanal para snapshot:', error);
  }

  const phase = profile?.current_phase || (profile?.objetivo === 'bulk'
    ? 'volumen'
    : profile?.objetivo === 'cut'
      ? 'definicion'
      : profile?.objetivo
        ? 'normocalorica'
        : null);

  const kcalObjetivo = plan?.kcal_objetivo || profile?.kcal_objetivo || profile?.tdee || null;
  const kcalSemanal = kcalObjetivo ? Math.round(Number(kcalObjetivo) * 7) : null;

  const metabolicPayload = metabolicProfile ? {
    score: metabolicProfile.score,
    confidence: metabolicProfile.confidence_level,
    type: metabolicProfile.metabolic_profile
  } : profile ? {
    score: profile.metabolic_score,
    confidence: profile.metabolic_confidence,
    type: profile.metabolic_type
  } : null;

  const indicatorPayload = latestEvaluation ? {
    type: latestEvaluation.indicator_type,
    value: latestEvaluation.indicator_value,
    status: latestEvaluation.status,
    date: latestEvaluation.evaluation_date
  } : null;

  const snapshotQuery = `
    INSERT INTO app.nutrition_weekly_snapshots (
      user_id,
      snapshot_date,
      phase,
      kcal_objetivo,
      kcal_semanal,
      metabolic_profile,
      macros,
      indicator,
      cls_score,
      flags,
      adherence,
      source
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (user_id, snapshot_date) DO NOTHING
    RETURNING id;
  `;

  const insertResult = await pool.query(snapshotQuery, [
    userId,
    snapshotDateStr,
    phase,
    kcalObjetivo,
    kcalSemanal,
    toJsonOrNull(metabolicPayload),
    toJsonOrNull(plan?.macros_objetivo || null),
    toJsonOrNull(indicatorPayload),
    bridgeState?.weekly_cls || null,
    toJsonOrNull(bridgeState?.active_flags || []),
    toJsonOrNull(weeklySummary || null),
    source
  ]);

  return {
    skipped: insertResult.rows.length === 0,
    snapshot_id: insertResult.rows[0]?.id || null,
    snapshot_date: snapshotDateStr
  };
}
