import { pool } from "../db.js";
import { isNutritionDayRegistered } from "./nutritionDailyLogV2.js";

const PHASES = new Set(["definicion", "volumen", "normocalorica"]);

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function addDaysIso(isoDate, deltaDays) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function diffDaysIso(fromIso, toIso) {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

function mapMetaToPhase(meta) {
  const normalized = String(meta || "").trim().toLowerCase();
  if (normalized === "cut") return "definicion";
  if (normalized === "bulk") return "volumen";
  if (normalized === "mant") return "normocalorica";
  return null;
}

function clampDelta(delta, maxAbs) {
  if (!Number.isFinite(delta) || !Number.isFinite(maxAbs) || maxAbs <= 0) return delta;
  if (delta > maxAbs) return maxAbs;
  if (delta < -maxAbs) return -maxAbs;
  return delta;
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function computeWeeklyRate(prevAvg, currAvg) {
  if (!Number.isFinite(prevAvg) || !Number.isFinite(currAvg) || prevAvg <= 0) return null;
  return (currAvg - prevAvg) / prevAvg; // ya está "por semana" (ventanas separadas 7 días)
}

function getPhaseTargets(phase) {
  if (phase === "definicion") {
    return {
      type: "loss",
      minRatePerWeek: -0.01, // pérdida 1%/sem (más rápido)
      maxRatePerWeek: -0.003, // pérdida 0.3%/sem (más lento)
      label: "Definición (pérdida 0.3% a 1%/sem)",
    };
  }
  if (phase === "volumen") {
    return {
      type: "gain",
      minRatePerWeek: 0.0015, // +0.15%/sem
      maxRatePerWeek: 0.0035, // +0.35%/sem
      label: "Volumen (ganancia 0.15% a 0.35%/sem)",
    };
  }
  return {
    type: "stable",
    // spec: >0.5% en 14 días => ajustar; aproximación semanal
    minRatePerWeek: -0.0025,
    maxRatePerWeek: 0.0025,
    label: "Normocalórica (estable; ±0.25%/sem aprox)",
  };
}

function classifyWeeklyStatus(phase, ratePerWeek) {
  if (ratePerWeek === null) {
    return { status: "insufficient", label: "Datos insuficientes" };
  }

  const targets = getPhaseTargets(phase);

  if (targets.type === "loss") {
    if (ratePerWeek > targets.maxRatePerWeek) return { status: "slow", label: "Vas lento" };
    if (ratePerWeek < targets.minRatePerWeek) return { status: "fast", label: "Vas rápido" };
    return { status: "ok", label: "Vas bien" };
  }

  if (targets.type === "gain") {
    if (ratePerWeek < targets.minRatePerWeek) return { status: "slow", label: "Vas lento" };
    if (ratePerWeek > targets.maxRatePerWeek) return { status: "fast", label: "Vas rápido" };
    return { status: "ok", label: "Vas bien" };
  }

  // stable
  if (ratePerWeek < targets.minRatePerWeek) return { status: "fast", label: "Vas rápido" }; // baja rápido
  if (ratePerWeek > targets.maxRatePerWeek) return { status: "fast", label: "Vas rápido" }; // sube rápido
  return { status: "ok", label: "Vas bien" };
}

function calcDataAdherence(dailyRows, totalDays) {
  const registered = dailyRows.filter(row => isNutritionDayRegistered(row)).length;
  return {
    total_days: totalDays,
    registered_days: registered,
    percent: totalDays > 0 ? registered / totalDays : 0,
  };
}

function calcCompliance(dailyRows, kcalObjective) {
  const objective = safeNumber(kcalObjective);
  if (!objective || objective <= 0) return { available_days: 0, hit_days: 0, percent: null };

  const withCalories = dailyRows.filter(r => safeNumber(r.calories) !== null && safeNumber(r.calories) > 0);
  if (withCalories.length === 0) return { available_days: 0, hit_days: 0, percent: null };

  const min = objective * 0.9;
  const max = objective * 1.1;
  const hitDays = withCalories.filter(r => {
    const c = safeNumber(r.calories);
    return c !== null && c >= min && c <= max;
  }).length;

  return {
    available_days: withCalories.length,
    hit_days: hitDays,
    percent: hitDays / withCalories.length,
  };
}

function calcNoise(dailyRows, measurements, todayIso) {
  let lastNoiseDate = null;
  const reasons = new Set();

  for (const row of dailyRows) {
    const dayType = row.day_type || "normal";
    const flags = Array.isArray(row.noise_flags) ? row.noise_flags : [];
    if (flags.length > 0) {
      reasons.add("noise_flags");
      lastNoiseDate = !lastNoiseDate || row.log_date > lastNoiseDate ? row.log_date : lastNoiseDate;
    }
    if (dayType === "cheat" || dayType === "diet_break") {
      reasons.add(dayType);
      lastNoiseDate = !lastNoiseDate || row.log_date > lastNoiseDate ? row.log_date : lastNoiseDate;
    }
  }

  // Auto: outlier de peso (>=1.5% en 24-48h)
  const sorted = [...measurements].sort((a, b) => a.measurement_date.localeCompare(b.measurement_date));
  let outlier = null;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    const days = diffDaysIso(a.measurement_date, b.measurement_date);
    if (days <= 0 || days > 2) continue;
    const w1 = safeNumber(a.weight_kg);
    const w2 = safeNumber(b.weight_kg);
    if (!w1 || !w2) continue;
    const pct = Math.abs(w2 - w1) / w1;
    if (pct > 0.015) {
      outlier = { from: a.measurement_date, to: b.measurement_date, pct };
      reasons.add("weight_outlier");
      lastNoiseDate = !lastNoiseDate || b.measurement_date > lastNoiseDate ? b.measurement_date : lastNoiseDate;
    }
  }

  const active = !!lastNoiseDate && diffDaysIso(lastNoiseDate, todayIso) < 7;
  const blockedUntil = lastNoiseDate ? addDaysIso(lastNoiseDate, 7) : null;

  return {
    active,
    last_noise_date: lastNoiseDate,
    blocked_until: active ? blockedUntil : null,
    reasons: [...reasons],
    weight_outlier: outlier,
  };
}

export async function getNutritionReview(userId, options = {}) {
  const todayIso = options.today || new Date().toISOString().slice(0, 10);
  if (!isIsoDate(todayIso)) throw new Error("today inválido");

  const endDate = todayIso;
  const start14 = addDaysIso(endDate, -13);
  const startPrev7 = addDaysIso(endDate, -13);
  const endPrev7 = addDaysIso(endDate, -7);
  const startCurr7 = addDaysIso(endDate, -6);
  const start21 = addDaysIso(endDate, -20);

  const planResult = await pool.query(
    `
      SELECT id, meta, kcal_objetivo, macros_objetivo, tipo, created_at, updated_at
      FROM app.nutrition_plans_v2
      WHERE user_id = $1 AND tipo = 'activo'
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [userId]
  );

  if (planResult.rows.length === 0) {
    return {
      success: false,
      error: "No tienes un plan nutricional activo",
    };
  }

  const plan = planResult.rows[0];
  const kcalObjective = plan.kcal_objetivo;

  const profileResult = await pool.query(
    `SELECT objetivo, current_phase FROM app.nutrition_profiles WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  const profile = profileResult.rows[0] || null;

  const phase =
    mapMetaToPhase(plan.meta) ||
    (profile?.current_phase && PHASES.has(profile.current_phase) ? profile.current_phase : null) ||
    (profile?.objetivo ? mapMetaToPhase(profile.objetivo) : null) ||
    "normocalorica";

  const [dailyResult, measurementsResult, lastAdjustResult, lastUndoableActionResult] = await Promise.all([
    pool.query(
      `
        SELECT
          log_date::text as log_date,
          calories,
          protein,
          carbs,
          fat,
          day_type,
          noise_flags,
          daily_log
        FROM app.daily_nutrition_log
        WHERE user_id = $1
          AND log_date BETWEEN $2 AND $3
        ORDER BY log_date ASC;
      `,
      [userId, start14, endDate]
    ),
    pool.query(
      `
        SELECT
          measurement_date::text as measurement_date,
          weight_kg,
          waist_cm
        FROM app.body_measurements
        WHERE user_id = $1
          AND is_validated = TRUE
          AND measurement_date BETWEEN $2 AND $3
        ORDER BY measurement_date ASC;
      `,
      [userId, start21, endDate]
    ),
    pool.query(
      `
        SELECT change_date::text as change_date
        FROM app.nutrition_change_log
        WHERE user_id = $1 AND change_type = 'kcal_adjust'
        ORDER BY created_at DESC
        LIMIT 1;
      `,
      [userId]
    ),
    pool.query(
      `
        SELECT
          id::text as id,
          mode,
          source,
          delta_kcal,
          previous_kcal,
          new_kcal,
          previous_plan_id::text as previous_plan_id,
          new_plan_id::text as new_plan_id,
          applied_at,
          undo_expires_at,
          reverted_at
        FROM app.nutrition_adjustment_actions
        WHERE user_id = $1
          AND reverted_at IS NULL
        ORDER BY applied_at DESC
        LIMIT 1;
      `,
      [userId]
    ),
  ]);

  const dailyRows = dailyResult.rows || [];
  const measurements = measurementsResult.rows || [];

  // Pesajes por ventanas
  const prevWeek = measurements.filter(
    m => m.measurement_date >= startPrev7 && m.measurement_date <= endPrev7
  );
  const currWeek = measurements.filter(m => m.measurement_date >= startCurr7 && m.measurement_date <= endDate);

  const prevWeekCount = prevWeek.length;
  const currWeekCount = currWeek.length;
  const last14Measurements = measurements.filter(m => m.measurement_date >= start14 && m.measurement_date <= endDate);
  const count14 = last14Measurements.length;

  const avgPrevWeight = prevWeekCount > 0 ? prevWeek.reduce((s, r) => s + Number(r.weight_kg), 0) / prevWeekCount : null;
  const avgCurrWeight = currWeekCount > 0 ? currWeek.reduce((s, r) => s + Number(r.weight_kg), 0) / currWeekCount : null;

  const ratePerWeek = computeWeeklyRate(avgPrevWeight, avgCurrWeight);
  const weeklyClass = classifyWeeklyStatus(phase, ratePerWeek);
  const ratePct = ratePerWeek === null ? null : ratePerWeek * 100;
  const rateSign = ratePct !== null && ratePct > 0 ? "+" : "";
  const rateDirection =
    ratePct === null ? null : ratePct > 0 ? "subiendo" : ratePct < 0 ? "bajando" : "estable";

  const adherence = calcDataAdherence(dailyRows, 14);
  const compliance = calcCompliance(dailyRows, kcalObjective);
  const noise = calcNoise(dailyRows, last14Measurements, todayIso);
  const lastUndoableActionRow = lastUndoableActionResult.rows[0] || null;
  const lastAdjustmentAction = lastUndoableActionRow
    ? {
        action_id: lastUndoableActionRow.id,
        mode: lastUndoableActionRow.mode,
        source: lastUndoableActionRow.source,
        delta_kcal: safeNumber(lastUndoableActionRow.delta_kcal),
        previous_kcal: safeNumber(lastUndoableActionRow.previous_kcal),
        new_kcal: safeNumber(lastUndoableActionRow.new_kcal),
        previous_plan_id: lastUndoableActionRow.previous_plan_id,
        new_plan_id: lastUndoableActionRow.new_plan_id,
        applied_at: lastUndoableActionRow.applied_at,
        undo_expires_at: lastUndoableActionRow.undo_expires_at,
        undo_available:
          !!lastUndoableActionRow.undo_expires_at &&
          new Date() < new Date(lastUndoableActionRow.undo_expires_at),
      }
    : null;

  const hasHighDataAdherence = adherence.percent >= 0.8;
  const hasWeightSufficient =
    count14 >= 6 || (prevWeekCount >= 4 && currWeekCount >= 4);

  const mode = hasHighDataAdherence && hasWeightSufficient ? "fino" : "simple";

  // Elegibilidad quincenal
  const createdAtIso =
    plan.created_at instanceof Date ? plan.created_at.toISOString().slice(0, 10) : null;
  const lastActionDate = lastAdjustResult.rows[0]?.change_date || createdAtIso;
  const nextEligibleAt = lastActionDate ? addDaysIso(lastActionDate, 14) : null;
  const eligibleNow = nextEligibleAt ? diffDaysIso(nextEligibleAt, todayIso) >= 0 : true;

  // Recomendación quincenal (solo en modo fino, sin ruido, y elegible)
  const maxAbsDelta = Math.max(1, Math.round(Number(kcalObjective || 0) * 0.1));
  const baseDelta = phase === "normocalorica" ? 150 : 200;

  let biweekly = {
    status: "pending",
    label: "Revisión quincenal",
    message: "Pendiente",
    eligible_now: eligibleNow,
    next_eligible_at: nextEligibleAt,
    recommended_delta_kcal: null,
    max_abs_delta_kcal: maxAbsDelta,
  };

  if (!eligibleNow) {
    biweekly = {
      ...biweekly,
      status: "pending",
      message: "Aún no toca aplicar ajustes (cadencia 14 días).",
    };
  } else if (mode !== "fino") {
    const missing = [];
    if (!hasHighDataAdherence) missing.push("registro de kcal/comidas (>=80% en 14 días)");
    if (!hasWeightSufficient) missing.push("pesajes suficientes (>=6/14d o >=4 por semana)");
    biweekly = {
      ...biweekly,
      status: "insufficient",
      message: `Datos insuficientes para autoajustar: faltan ${missing.join(" y ")}.`,
    };
  } else if (noise.active) {
    biweekly = {
      ...biweekly,
      status: "blocked_by_noise",
      message: "Semana atípica (ruido). No ajustamos aún; esperamos confirmación.",
      blocked_until: noise.blocked_until,
      noise_reasons: noise.reasons,
    };
  } else if (compliance.percent !== null && compliance.available_days >= 7 && compliance.percent < 0.6) {
    biweekly = {
      ...biweekly,
      status: "compliance_low",
      message:
        "Hay datos suficientes, pero no estás siguiendo el objetivo de kcal de forma consistente. No ajustamos kcal aún.",
      compliance,
    };
  } else if (weeklyClass.status === "ok") {
    biweekly = {
      ...biweekly,
      status: "ok",
      message: "Ritmo dentro del objetivo. No hace falta ajuste.",
    };
  } else if (weeklyClass.status === "insufficient") {
    biweekly = {
      ...biweekly,
      status: "insufficient",
      message: "Faltan pesajes para comparar semana actual vs anterior.",
    };
  } else {
    // slow / fast => recomendación
    let delta = 0;
    if (phase === "definicion") {
      delta = weeklyClass.status === "slow" ? -baseDelta : baseDelta;
    } else if (phase === "volumen") {
      delta = weeklyClass.status === "slow" ? baseDelta : -baseDelta;
    } else {
      // normocalorica: si se mueve, corregir hacia el centro
      delta = ratePerWeek !== null && ratePerWeek > 0 ? -baseDelta : baseDelta;
    }

    delta = clampDelta(delta, maxAbsDelta);

    biweekly = {
      ...biweekly,
      status: "recommend_adjustment",
      message: `Recomendación: ajustar ${delta > 0 ? "+" : ""}${delta} kcal/día (límite ${maxAbsDelta}).`,
      recommended_delta_kcal: delta,
      basis: {
        phase,
        rate_per_week: ratePerWeek,
        targets: getPhaseTargets(phase),
        adherence,
        weigh_ins_14d: count14,
      },
    };
  }

  return {
    success: true,
    date: todayIso,
    mode,
    phase,
    plan: {
      id: plan.id,
      kcal_objetivo: kcalObjective,
      meta: plan.meta,
    },
    last_adjustment_action: lastAdjustmentAction,
    windows: {
      prev7: { start: startPrev7, end: endPrev7, weigh_ins: prevWeekCount, avg_weight: avgPrevWeight },
      curr7: { start: startCurr7, end: endDate, weigh_ins: currWeekCount, avg_weight: avgCurrWeight },
      last14: { start: start14, end: endDate, weigh_ins: count14 },
    },
    metrics: {
      rate_per_week: ratePerWeek,
      adherence,
      compliance,
      noise,
    },
    weekly_review: {
      status: weeklyClass.status,
      label: weeklyClass.label,
      message:
        weeklyClass.status === "insufficient"
          ? "Registra más pesajes para calcular la tendencia semanal."
          : `Ritmo: ${rateSign}${ratePct.toFixed(2)}%/sem (${rateDirection}). Objetivo: ${getPhaseTargets(phase).label}.`,
    },
    biweekly_review: biweekly,
  };
}
