/**
 * planAutoregService.js
 *
 * Enganche RIR→progresión para el flujo de PLAN multi-semana (todas las
 * metodologías). Hasta ahora la autorregulación (*_register_session_result)
 * calculaba una decisión 'progress'|'hold'|'deload' que solo se mostraba en un
 * modal: nadie la aplicaba a las sesiones siguientes del plan. Este servicio
 * cierra el ciclo como lo haría un entrenador personal:
 *
 *  1. registerSessionAutoreg(): al completar una sesión del plan, calcula las
 *     métricas OBJETIVAS desde las series registradas (hypertrophy_set_logs:
 *     peso/reps/RIR por serie) y alimenta la función SQL de autorregulación de
 *     la metodología. Idempotente por sesión (session_metadata.autoreg).
 *  2. La decisión se ACUMULA en app.plan_progression_offsets (rep_offset,
 *     weight_pct, deload_pending) para que la exigencia sea creciente.
 *  3. adjustPrescriptionsForStart(): al arrancar la siguiente sesión, aplica el
 *     offset a las prescripciones (más reps / nota de más peso con sugerencia
 *     concreta) o la descarga puntual si deload_pending.
 *
 * HipertrofiaV2 queda fuera: ya tiene su propio ciclo D1-D5 con
 * apply_microcycle_progression.
 */

import { getCrossfitFeatureFlags } from '../crossfit/featureFlags.js';
import { registerCrossfitV2Result } from '../crossfit/results/resultService.js';

// Clave normalizada de metodología a partir de methodology_type del plan
// ('Calistenia', 'CrossFit', 'Heavy Duty', 'Entrenamiento en Casa', ...).
export function normalizeMethodologyKey(raw) {
  const m = String(raw || '').toLowerCase().trim();
  if (m.includes('calistenia')) return 'calistenia';
  if (m.includes('crossfit') || m.includes('cross-fit')) return 'crossfit';
  if (m.includes('casa')) return 'casa';
  if (m.includes('funcional') || m.includes('functional')) return 'funcional';
  if (m.includes('halterofilia') || m.includes('weightlifting')) return 'halterofilia';
  if (m.includes('powerlifting') || m.includes('power-lifting')) return 'powerlifting';
  if (m.includes('heavy')) return 'heavy_duty';
  if (m.includes('hipertrofia')) return 'hipertrofia';
  // Oposiciones: el plan guarda el cuerpo concreto como methodology_type
  if (m.includes('oposicion') || m.includes('policia') || m.includes('policía')
    || m.includes('bombero') || m.includes('guardia')) return 'oposiciones';
  return null;
}

// Metodologías con enganche de autorregulación en el flujo de plan.
const SUPPORTED_KEYS = new Set([
  'calistenia', 'casa', 'funcional', 'crossfit',
  'halterofilia', 'powerlifting', 'heavy_duty', 'oposiciones'
]);

// Metodologías cuya progresión primaria es AÑADIR REPS (peso corporal).
const REP_BASED_KEYS = new Set(['calistenia', 'casa', 'funcional', 'oposiciones']);
// Metodologías cuya progresión primaria es AÑADIR CARGA.
const LOAD_BASED_KEYS = new Set(['halterofilia', 'powerlifting', 'heavy_duty']);

const AUTOREG_TABLES = {
  calistenia: 'calistenia_autoreg_state',
  casa: 'casa_autoreg_state',
  funcional: 'funcional_autoreg_state',
  crossfit: 'crossfit_autoreg_state',
  halterofilia: 'halterofilia_autoreg_state',
  powerlifting: 'powerlifting_autoreg_state',
  heavy_duty: 'heavy_duty_autoreg_state',
  oposiciones: 'oposiciones_autoreg_state'
};

// Nombre de metodología que espera app.apply_stall_deload (histórico: heavy-duty con guion).
const STALL_KEYS = { heavy_duty: 'heavy-duty' };

export function isPlanAutoregSupported(methodologyType) {
  return SUPPORTED_KEYS.has(normalizeMethodologyKey(methodologyType));
}

/**
 * Métricas objetivas de la sesión desde las series registradas en el
 * reproductor (save-set → app.hypertrophy_set_logs, todas las metodologías).
 */
export async function computeObjectiveMetrics(client, sessionId, userId) {
  const q = await client.query(
    `SELECT
       COUNT(*)::int AS sets_logged,
       AVG(rir_reported) FILTER (WHERE rir_reported IS NOT NULL) AS avg_rir,
       MIN(rir_reported) AS min_rir,
       AVG(weight_used) FILTER (WHERE weight_used > 0) AS avg_weight
     FROM app.hypertrophy_set_logs
     WHERE session_id = $1 AND user_id = $2 AND is_warmup = false`,
    [Number(sessionId), userId]
  );
  const row = q.rows[0] || {};

  const prog = await client.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
     FROM app.methodology_exercise_progress
     WHERE methodology_session_id = $1`,
    [sessionId]
  );
  const p = prog.rows[0] || {};
  const total = Number(p.total) || 0;
  const completed = Number(p.completed) || 0;

  return {
    setsLogged: Number(row.sets_logged) || 0,
    avgRir: row.avg_rir != null ? Number(row.avg_rir) : null,
    minRir: row.min_rir != null ? Number(row.min_rir) : null,
    avgWeight: row.avg_weight != null ? Number(row.avg_weight) : null,
    targetMet: total > 0 && completed >= total,
    exercisesCompleted: completed,
    exercisesTotal: total
  };
}

// Acumula la decisión en plan_progression_offsets (la "memoria" del entrenador).
async function accumulateDecision(client, userId, planId, methodologyKey, decision) {
  const repInc = decision === 'progress' && REP_BASED_KEYS.has(methodologyKey) ? 1 : 0;
  const weightInc = decision === 'progress' && LOAD_BASED_KEYS.has(methodologyKey) ? 2.5 : 0;
  await client.query(
    `INSERT INTO app.plan_progression_offsets AS o (
       user_id, methodology_plan_id, rep_offset, weight_pct, deload_pending,
       progress_count, deload_count, last_decision
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, methodology_plan_id) DO UPDATE SET
       rep_offset = CASE
         WHEN $8 = 'deload' THEN GREATEST(0, FLOOR(o.rep_offset / 2.0))::int
         ELSE o.rep_offset + $3
       END,
       weight_pct = CASE
         WHEN $8 = 'deload' THEN ROUND(o.weight_pct / 2.0, 2)
         ELSE o.weight_pct + $4
       END,
       deload_pending = ($8 = 'deload'),
       progress_count = o.progress_count + $6,
       deload_count = o.deload_count + $7,
       last_decision = $8,
       updated_at = now()`,
    [
      userId, planId,
      repInc, weightInc,
      decision === 'deload',
      decision === 'progress' ? 1 : 0,
      decision === 'deload' ? 1 : 0,
      decision
    ]
  );
}

/**
 * Registra la sesión del PLAN en la autorregulación de su metodología.
 * Idempotente: si session_metadata.autoreg ya existe, devuelve lo guardado.
 *
 * manual: valores del modal de esfuerzo (fallback si no hay series logueadas)
 *   { avgRir?, rpe?, targetMet?, goodTechnique?, reachedFailure?, completed?, scale? }
 */
export async function registerSessionAutoreg(client, {
  userId, planId, sessionId, methodologyType,
  subjective = null, manual = {}, requestId = null, idempotencyKey = null
}) {
  const key = normalizeMethodologyKey(methodologyType);
  if (!SUPPORTED_KEYS.has(key)) return null;

  // CrossFit v2 no comparte la heurística RIR ni los offsets genéricos. El adaptador
  // comprueba además que la sesión sea realmente crossfit-session/v2; una sesión legacy
  // sigue exactamente por el camino histórico aunque el flag global esté encendido.
  if (key === 'crossfit' && getCrossfitFeatureFlags().results) {
    const v2 = await registerCrossfitV2Result(client, {
      userId,
      planId,
      sessionId,
      manual,
      requestId,
      idempotencyKey,
      allowPendingFeedback: manual.rpe == null
    });
    if (v2) {
      return {
        ...v2,
        registered_at: v2.result?.recorded_at ?? null,
        schema_version: v2.result?.schema_version ?? 'crossfit-result/v2',
        source: v2.pendingFeedback ? 'crossfit_v2_pending_feedback' : 'crossfit_v2_result',
        rpe: v2.result?.rpe ?? null,
        technique: v2.result?.technique ?? null,
        pain_score: v2.result?.pain?.score ?? null
      };
    }
  }

  // Idempotencia por sesión
  const sesQ = await client.query(
    `SELECT session_metadata FROM app.methodology_exercise_sessions
     WHERE id = $1 AND user_id = $2 FOR UPDATE`,
    [sessionId, userId]
  );
  if (sesQ.rowCount === 0) return null;
  const existing = sesQ.rows[0].session_metadata?.autoreg;
  if (existing?.registered_at) {
    return { ...existing, alreadyRegistered: true };
  }

  const metrics = await computeObjectiveMetrics(client, sessionId, userId);

  // Lo objetivo manda; el modal solo rellena huecos.
  const avgRir = metrics.avgRir ?? (manual.avgRir != null ? Number(manual.avgRir) : null);
  const targetMet = typeof manual.targetMet === 'boolean'
    ? (metrics.exercisesTotal > 0 ? metrics.targetMet && manual.targetMet : manual.targetMet)
    : metrics.targetMet;
  // RPE ≈ 10 - RIR cuando no llega del modal
  const rpe = manual.rpe != null
    ? Number(manual.rpe)
    : (avgRir != null ? Math.max(1, Math.min(10, 10 - avgRir)) : null);

  let sql;
  let params;
  switch (key) {
    case 'calistenia':
    case 'casa':
    case 'funcional':
    case 'oposiciones': {
      if (avgRir == null) return null; // sin datos objetivos ni manuales, no registrar
      sql = `SELECT app.${key}_register_session_result($1, $2, $3, $4, $5) AS result`;
      params = [userId, planId, avgRir, targetMet, subjective];
      break;
    }
    case 'halterofilia':
    case 'powerlifting': {
      if (rpe == null) return null;
      const goodTechnique = typeof manual.goodTechnique === 'boolean' ? manual.goodTechnique : true;
      sql = `SELECT app.${key}_register_session_result($1, $2, $3, $4, $5, $6) AS result`;
      params = [userId, planId, rpe, targetMet, goodTechnique, subjective];
      break;
    }
    case 'heavy_duty': {
      const reachedFailure = typeof manual.reachedFailure === 'boolean'
        ? manual.reachedFailure
        : (metrics.minRir != null ? metrics.minRir <= 0 : false);
      sql = `SELECT app.heavy_duty_register_session_result($1, $2, $3, $4, $5) AS result`;
      params = [userId, planId, reachedFailure, targetMet, subjective];
      break;
    }
    case 'crossfit': {
      if (rpe == null) return null;
      const completed = typeof manual.completed === 'boolean' ? manual.completed : targetMet;
      const scale = manual.scale ? String(manual.scale) : 'rx';
      sql = `SELECT app.crossfit_register_wod_result($1, $2, $3, $4, $5, $6) AS result`;
      params = [userId, planId, rpe, completed, scale, subjective];
      break;
    }
    default:
      return null;
  }

  const regQ = await client.query(sql, params);
  const result = regQ.rows[0].result || {};

  // Deload por estancamiento (meseta), común a todas las metodologías
  try {
    const stallQ = await client.query(
      `SELECT app.apply_stall_deload($1, $2, $3) AS s`,
      [userId, STALL_KEYS[key] || key, result.decision || 'hold']
    );
    const s = stallQ.rows[0].s;
    result.decision = s.decision;
    result.stall_streak = s.stall_streak;
    result.plateau_deload = s.plateau_deload;
  } catch { /* la meseta es un extra: no rompe el registro */ }

  const decision = result.decision || 'hold';
  await accumulateDecision(client, userId, planId, key, decision);

  const autoreg = {
    registered_at: new Date().toISOString(),
    decision,
    avg_rir: avgRir,
    rpe,
    target_met: targetMet,
    sets_logged: metrics.setsLogged,
    source: metrics.setsLogged > 0 ? 'set_logs' : 'manual',
    easy_streak: result.easy_streak ?? null,
    hard_streak: result.hard_streak ?? null,
    deload_suggested: result.deload_suggested ?? (decision === 'deload')
  };

  await client.query(
    `UPDATE app.methodology_exercise_sessions
       SET session_metadata = COALESCE(session_metadata, '{}'::jsonb) || jsonb_build_object('autoreg', $2::jsonb),
           updated_at = NOW()
     WHERE id = $1`,
    [sessionId, JSON.stringify(autoreg)]
  );

  return { ...autoreg, ...result, decision };
}

/**
 * Solo matiza lo subjetivo cuando la sesión ya se registró objetivamente
 * (el modal de esfuerzo llegó después del registro automático).
 */
export async function updateSubjective(client, { userId, methodologyType, subjective }) {
  const key = normalizeMethodologyKey(methodologyType);
  const table = AUTOREG_TABLES[key];
  if (!table || subjective == null) return;
  await client.query(
    `UPDATE app.${table} SET last_subjective = $2, updated_at = now() WHERE user_id = $1`,
    [userId, Math.max(-1, Math.min(1, Number(subjective)))]
  );
}

// --- Aplicación de la progresión a las prescripciones -----------------------

// Suma un delta a una prescripción de reps en texto: "10" → "11", "8-12" → "9-13".
// Devuelve null si el formato no es numérico (tiempo, distancia, AMRAP...).
function bumpRepsString(reps, delta) {
  const s = String(reps ?? '').trim();
  if (!s || delta === 0) return null;
  if (/seg|min|''|"|m\b|km|cal|amrap|max|fallo/i.test(s)) return null;
  const range = s.match(/^(\d+)\s*[-–a]\s*(\d+)$/);
  if (range) {
    const lo = Math.max(1, parseInt(range[1], 10) + delta);
    const hi = Math.max(lo, parseInt(range[2], 10) + delta);
    return `${lo}-${hi}`;
  }
  const single = s.match(/^(\d+)$/);
  if (single) return String(Math.max(1, parseInt(single[1], 10) + delta));
  const perSide = s.match(/^(\d+)(\s*(?:por|x|\/)\s*\w+.*)$/i);
  if (perSide) return `${Math.max(1, parseInt(perSide[1], 10) + delta)}${perSide[2]}`;
  return null;
}

// Último peso registrado por ejercicio (para sugerir carga concreta).
async function getLastWeights(client, userId, exerciseNames) {
  if (!exerciseNames.length) return {};
  const q = await client.query(
    `SELECT DISTINCT ON (exercise_name) exercise_name, weight_used
     FROM app.hypertrophy_set_logs
     WHERE user_id = $1 AND is_warmup = false AND weight_used > 0
       AND exercise_name = ANY($2)
     ORDER BY exercise_name, created_at DESC NULLS LAST, id DESC`,
    [userId, exerciseNames]
  );
  const map = {};
  for (const r of q.rows) map[r.exercise_name] = Number(r.weight_used);
  return map;
}

function roundToPlate(kg) {
  return Math.round(kg / 2.5) * 2.5 || Math.round(kg * 10) / 10;
}

/**
 * Aplica la progresión acumulada a los ejercicios de la sesión que va a
 * empezar. Devuelve { ejercicios, meta } (meta=null si no hubo ajuste).
 * Consume deload_pending cuando aplica la descarga.
 */
export async function adjustPrescriptionsForStart(client, {
  userId, planId, sessionId = null, methodologyType, planSchemaVersion = null, ejercicios
}) {
  const key = normalizeMethodologyKey(methodologyType);
  if (!SUPPORTED_KEYS.has(key) || !Array.isArray(ejercicios) || ejercicios.length === 0) {
    return { ejercicios, meta: null };
  }

  if (key === 'crossfit' && planSchemaVersion === 'crossfit-plan/v2') {
    const snapshotQ = await client.query(
      `SELECT snapshot_id, state, payload
         FROM app.crossfit_v2_autoreg_snapshots
        WHERE user_id = $1 AND methodology_plan_id = $2`,
      [userId, planId]
    );
    if (snapshotQ.rowCount === 0) return { ejercicios, meta: null };

    const row = snapshotQ.rows[0];
    const snapshot = row.payload && typeof row.payload === 'object' ? row.payload : {};
    const state = row.state || snapshot.state || 'hold';
    const reasonCodes = Array.isArray(snapshot.reason_codes) ? snapshot.reason_codes : [];
    if (state === 'blocked') {
      const error = new Error('La autorregulación CrossFit bloquea esta sesión hasta resolver el criterio de seguridad');
      error.code = 'CROSSFIT_SESSION_BLOCKED';
      error.reasonCode = reasonCodes[0] || 'SAFETY_CLEARANCE_REQUIRED';
      error.status = 423;
      throw error;
    }

    const actions = snapshot.actions && typeof snapshot.actions === 'object'
      ? snapshot.actions
      : {};
    const adjustment = {
      schema_version: 'crossfit-autoreg/v2',
      snapshot_id: row.snapshot_id || snapshot.snapshot_id || null,
      state,
      reason_codes: reasonCodes,
      actions,
      applied: ['progress_capacity', 'progress_skill', 'regress', 'deload'].includes(state)
    };
    const adjusted = ejercicios.map((exercise) => {
      if (!exercise || !adjustment.applied) return exercise;
      const out = { ...exercise, autoreg_adjustment: actions };
      if (state === 'deload' || state === 'regress') {
        out.intensidad = 'scaled';
        out.escala_recomendada = 'scaled';
        out.notas = appendNote(out.notas, 'Autorregulación v2: reduce volumen o complejidad y preserva el estímulo.');
      } else if (state === 'progress_capacity') {
        const variable = actions.capacity?.variable || 'work';
        const percent = Math.round(Number(actions.capacity?.increment || 0) * 100);
        out.notas = appendNote(out.notas, `Autorregulación v2: progresa solo ${variable}${percent ? ` +${percent}%` : ''}.`);
      } else if (state === 'progress_skill') {
        out.notas = appendNote(out.notas, 'Autorregulación v2: avanza una sola progresión técnica si mantiene los prerrequisitos.');
      }
      return out;
    });

    if (sessionId) {
      await client.query(
        `UPDATE app.methodology_exercise_sessions
            SET session_metadata = COALESCE(session_metadata, '{}'::jsonb)
              || jsonb_build_object('crossfit_v2_start_adjustment', $2::jsonb),
                updated_at = NOW()
          WHERE id = $1 AND user_id = $3`,
        [sessionId, JSON.stringify(adjustment), userId]
      );
    }
    return { ejercicios: adjusted, meta: adjustment };
  }

  const offQ = await client.query(
    `SELECT rep_offset, weight_pct, deload_pending, last_decision
     FROM app.plan_progression_offsets
     WHERE user_id = $1 AND methodology_plan_id = $2`,
    [userId, planId]
  );
  if (offQ.rowCount === 0) return { ejercicios, meta: null };
  const off = offQ.rows[0];
  const repOffset = Number(off.rep_offset) || 0;
  const weightPct = Number(off.weight_pct) || 0;
  const isDeload = Boolean(off.deload_pending);

  const crossfitProgress = key === 'crossfit' && off.last_decision === 'progress';
  if (!isDeload && repOffset === 0 && weightPct === 0 && !crossfitProgress) {
    return { ejercicios, meta: null };
  }

  const names = ejercicios.map(e => e?.nombre).filter(Boolean);
  const lastWeights = LOAD_BASED_KEYS.has(key) || isDeload
    ? await getLastWeights(client, userId, names)
    : {};

  const adjusted = ejercicios.map((ej) => {
    if (!ej || key === 'crossfit') {
      // CrossFit: la progresión vive en escala/carga del WOD, no en reps sueltas.
      if (ej && isDeload) {
        return { ...ej, notas: appendNote(ej.notas, '🔄 Descarga: hoy escala el WOD (scaled) y prioriza técnica.') };
      }
      if (ej && crossfitProgress) {
        return { ...ej, notas: appendNote(ej.notas, '📈 Progresión: hoy intenta el WOD en Rx (o sube la carga). ¡Estás listo!') };
      }
      return ej;
    }

    const out = { ...ej };
    const lastW = lastWeights[ej.nombre];

    if (isDeload) {
      // Descarga puntual: -1 serie (mín. 2) y -10% de carga si la hay.
      const series = parseInt(out.series, 10);
      if (Number.isFinite(series) && series > 2) out.series = series - 1;
      const noteW = lastW ? ` Peso sugerido: ${roundToPlate(lastW * 0.9)} kg (-10%).` : '';
      out.notas = appendNote(out.notas, `🔄 Semana de descarga: reduce la intensidad.${noteW}`);
      return out;
    }

    if (REP_BASED_KEYS.has(key) && repOffset > 0) {
      const bumped = bumpRepsString(out.repeticiones ?? out.reps_objetivo ?? out.reps, repOffset);
      if (bumped != null) {
        out.repeticiones = bumped;
        out.notas = appendNote(out.notas, `📈 Progresión: +${repOffset} rep${repOffset > 1 ? 's' : ''} sobre tu plan base. ¡Tu entrenador sabe que puedes!`);
      } else {
        out.notas = appendNote(out.notas, '📈 Progresión activa: sube la dificultad (más tiempo o variante más difícil).');
      }
    }

    if (LOAD_BASED_KEYS.has(key) && weightPct > 0) {
      const target = lastW ? roundToPlate(lastW * (1 + weightPct / 100)) : null;
      const noteW = target
        ? `Peso objetivo hoy: ${target} kg (+${weightPct}% sobre tu última marca).`
        : `Sube la carga ~${weightPct}% respecto a tu última sesión.`;
      out.notas = appendNote(out.notas, `📈 Progresión: ${noteW}`);
      if (target) out.peso_sugerido = target;
    }

    return out;
  });

  // La descarga se consume: solo afecta a UNA sesión.
  if (isDeload) {
    await client.query(
      `UPDATE app.plan_progression_offsets
         SET deload_pending = false, updated_at = now()
       WHERE user_id = $1 AND methodology_plan_id = $2`,
      [userId, planId]
    );
  }

  return {
    ejercicios: adjusted,
    meta: {
      applied: true,
      mode: isDeload ? 'deload' : 'progress',
      rep_offset: repOffset,
      weight_pct: weightPct,
      last_decision: off.last_decision || null
    }
  };
}

function appendNote(existing, note) {
  const base = existing ? String(existing).trim() : '';
  if (!base) return note;
  if (base.includes(note)) return base;
  return `${base} · ${note}`;
}
