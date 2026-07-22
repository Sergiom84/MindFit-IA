import {
  buildSessionCompletedEvent,
  enqueueEvent,
  isOutboxEmissionEnabled,
  resolveSessionDurationSeconds
} from "../../bridgeEventOutboxService.js";
import { assertCrossfitContract, validateCrossfitAutoreg } from "../contracts/schemas.js";
import { getCrossfitFeatureFlags } from "../featureFlags.js";
import { crossfitHash, stableCrossfitId } from "../generator/deterministic.js";
import { reduceCrossfitAutoreg } from "../autoreg/stateMachine.js";
import { CROSSFIT_VERSIONS, isCrossfitV2SessionRecord, normalizeCrossfitLevel } from "../versions.js";
import { buildCrossfitResultV2 } from "./resultBuilder.js";

export const LOCK_CROSSFIT_SESSION_SQL = `
SELECT id, user_id, methodology_plan_id, methodology_type, methodology_level,
       day_id, session_type, session_status, completion_rate, total_duration_seconds,
       total_exercises, exercises_completed, exercises_skipped, exercises_cancelled,
       started_at, completed_at, session_metadata
FROM app.methodology_exercise_sessions
WHERE id = $1 AND user_id = $2
FOR UPDATE`;

export const FIND_CROSSFIT_RESULT_SQL = `
SELECT session_id, methodology_plan_id, idempotency_key, payload
FROM app.crossfit_v2_results
WHERE user_id = $1 AND (session_id = $2 OR idempotency_key = $3)
ORDER BY CASE WHEN idempotency_key = $3 THEN 0 ELSE 1 END
LIMIT 1`;

export const LOAD_CROSSFIT_EXERCISE_ROWS_SQL = `
SELECT exercise_name, status, series_completed, series_total, time_spent_seconds
FROM app.methodology_exercise_progress
WHERE methodology_session_id = $1
ORDER BY exercise_order`;

export const LOAD_CROSSFIT_SINGLE_DAY_EXERCISE_ROWS_SQL = `
SELECT exercise_name, status,
       actual_sets AS series_completed,
       planned_sets AS series_total,
       actual_duration_seconds AS time_spent_seconds
FROM app.exercise_session_tracking
WHERE methodology_session_id = $1
ORDER BY exercise_order`;

export const LOAD_CROSSFIT_RESULT_HISTORY_SQL = `
SELECT payload
FROM app.crossfit_v2_results
WHERE user_id = $1 AND methodology_plan_id = $2
  AND recorded_at >= $3::timestamptz - interval '42 days'
ORDER BY recorded_at, result_id`;

export const LOAD_CROSSFIT_RUNTIME_EVENTS_SQL = `
SELECT event_type, payload
FROM app.crossfit_v2_runtime_events
WHERE user_id = $1 AND session_id = $2
ORDER BY event_sequence`;

export const LOAD_CROSSFIT_SNAPSHOT_SQL = `
SELECT payload
FROM app.crossfit_v2_autoreg_snapshots
WHERE user_id = $1 AND methodology_plan_id = $2`;

const RESULT_STATUSES = new Set(["completed", "partial", "abandoned", "cancelled", "capped"]);
const TERMINAL_SESSION_STATUSES = new Set(["completed", "partial", "abandoned", "cancelled"]);
const TERMINATION_REASONS = new Set([
  "objective_completed", "time_cap", "time", "fatigue", "pain", "equipment", "technical", "other"
]);
const RESULT_TO_SESSION_STATUS = Object.freeze({
  completed: "completed",
  capped: "completed",
  partial: "partial",
  abandoned: "abandoned",
  cancelled: "cancelled"
});

function serviceError(code, message, status = 422) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function finiteInRange(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function integerInRange(value, min, max) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function sessionMetadata(session) {
  return session?.session_metadata && typeof session.session_metadata === "object"
    ? session.session_metadata
    : {};
}

export function deriveCrossfitResultScales(session, runtimeEvents = []) {
  const metadata = sessionMetadata(session);
  const canonical = metadata.crossfit_v2_session ?? metadata.crossfit_v2?.session ?? null;
  const movementIds = (canonical?.wod?.movements ?? [])
    .map((movement) => movement.canonical_movement_id)
    .filter(Boolean);
  if (movementIds.length === 0) {
    throw serviceError("CROSSFIT_RUNTIME_TRACE_REQUIRED", "La sesión v2 no contiene movimientos canónicos");
  }
  const scales = new Map(movementIds.map((movementId) => [String(movementId), "base"]));
  for (const row of runtimeEvents) {
    const payload = row?.payload?.payload ?? {};
    if (row.event_type === "scale_selected" && scales.has(String(payload.movement_id))) {
      if (["base", "scaled"].includes(payload.scale_id)) scales.set(String(payload.movement_id), payload.scale_id);
    }
    if (row.event_type === "movement_substituted") {
      const originalId = String(payload.original_movement_id ?? "");
      const replacementId = payload.replacement?.canonical_movement_id;
      if (scales.has(originalId) && replacementId) {
        scales.set(originalId, `substitution:${replacementId}`);
      }
    }
  }
  return [...scales].map(([movement_id, scale_id]) => ({ movement_id, scale_id }));
}

export function isCrossfitV2Session(session) {
  return isCrossfitV2SessionRecord(session);
}

function normalizeResultInput(session, manual = {}, now = new Date()) {
  const metadata = sessionMetadata(session);
  const completionRaw = finiteInRange(session.completion_rate, 0, 100) ?? 0;
  const completion = finiteInRange(manual.completion, 0, 1)
    ?? (completionRaw > 1 ? completionRaw / 100 : completionRaw);
  let status = RESULT_STATUSES.has(manual.status) ? manual.status : null;
  if (!status) {
    if (["partial", "abandoned", "cancelled"].includes(session.session_status)) status = session.session_status;
    else status = manual.completed === false ? "capped" : "completed";
  }
  const terminationReason = String(
    manual.termination_reason
    ?? (status === "completed" ? "objective_completed" : status === "capped" ? "time_cap" : "")
  ).trim().toLowerCase();
  if (!TERMINATION_REASONS.has(terminationReason)) {
    throw serviceError("CROSSFIT_TERMINATION_REASON_REQUIRED", "Motivo de terminación CrossFit no válido");
  }
  if (status === "completed" && completion !== 1) {
    throw serviceError("CROSSFIT_COMPLETION_INVALID", "Un resultado completed requiere completion=1");
  }
  if (["capped", "partial", "abandoned"].includes(status) && !(completion >= 0 && completion < 1)) {
    throw serviceError("CROSSFIT_COMPLETION_INVALID", `${status} requiere completion entre 0 y menos de 1`);
  }
  if (status === "cancelled" && completion !== 0) {
    throw serviceError("CROSSFIT_COMPLETION_INVALID", "Un resultado cancelled requiere completion=0");
  }
  const cancelled = status === "cancelled";
  const rpe = cancelled ? null : finiteInRange(manual.rpe, 1, 10);
  const technique = cancelled ? null : integerInRange(manual.technique, 0, 3);
  const painScore = finiteInRange(manual.pain?.score, 0, 10);
  if (!cancelled && rpe === null) throw serviceError("CROSSFIT_RPE_REQUIRED", "RPE CrossFit entre 1 y 10 requerido");
  if (!cancelled && technique === null) throw serviceError("CROSSFIT_TECHNIQUE_REQUIRED", "Calidad técnica CrossFit entre 0 y 3 requerida");
  if (!cancelled && painScore === null) throw serviceError("CROSSFIT_PAIN_REQUIRED", "Puntuación de dolor entre 0 y 10 requerida");
  if (cancelled && terminationReason === "pain" && painScore === null) {
    throw serviceError("CROSSFIT_PAIN_REQUIRED", "Una cancelación por dolor requiere puntuación de dolor");
  }

  const readiness = Object.fromEntries(["sleep", "fatigue", "recovery", "stress"].map((key) => {
    const value = integerInRange(manual.readiness?.[key], 1, 5);
    if (!cancelled && value === null) {
      throw serviceError("CROSSFIT_READINESS_REQUIRED", `Readiness ${key} entre 1 y 5 requerido`);
    }
    return [key, cancelled ? null : value];
  }));

  const level = normalizeCrossfitLevel(
    metadata.crossfit_v2?.level ?? metadata.crossfit_v2_session?.level ?? session.methodology_level
  );
  if (!level) throw serviceError("CROSSFIT_LEVEL_INVALID", "Nivel CrossFit v2 no resoluble");
  if (session.day_id == null) throw serviceError("CROSSFIT_DAY_ID_REQUIRED", "Sesión CrossFit v2 sin day_id canónico");
  if (!metadata.planned_session_load) {
    throw serviceError("CROSSFIT_PLANNED_LOAD_REQUIRED", "Sesión CrossFit v2 sin training-load planificado");
  }

  const scale = String(manual.scale ?? "scaled").trim().toLowerCase();
  const scales = Array.isArray(manual.scales) && manual.scales.length
    ? manual.scales
    : [{ movement_id: "wod", scale_id: scale }];
  const recordedAt = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(recordedAt.getTime())) {
    throw serviceError("CROSSFIT_RECORDED_AT_INVALID", "Fecha de resultado CrossFit inválida");
  }

  return {
    level,
    status,
    completion,
    rpe,
    technique,
    pain: {
      score: painScore,
      locations: Array.isArray(manual.pain?.locations) ? manual.pain.locations : [],
      quality: manual.pain?.quality ? String(manual.pain.quality) : null,
      delta: cancelled ? null : finiteInRange(manual.pain?.delta, -10, 10) ?? 0,
      red_flag: manual.pain?.red_flag === true,
      acute_injury: manual.pain?.acute_injury === true
    },
    readiness,
    score: manual.score && typeof manual.score === "object" ? manual.score : { type: "none" },
    terminationReason,
    scales,
    plannedLoad: metadata.planned_session_load,
    recordedAt: recordedAt.toISOString(),
    metadata
  };
}

function canonicalMovementCount(session) {
  const metadata = sessionMetadata(session);
  const canonical = metadata.crossfit_v2_session ?? metadata.crossfit_v2?.session ?? null;
  return Array.isArray(canonical?.wod?.movements) ? canonical.wod.movements.length : 0;
}

function resultRequestHash(normalized) {
  return crossfitHash({
    status: normalized.status,
    completion: normalized.completion,
    rpe: normalized.rpe,
    technique: normalized.technique,
    pain: normalized.pain,
    readiness: normalized.readiness,
    score: normalized.score,
    termination_reason: normalized.terminationReason
  });
}

async function finalizeCrossfitV2Session(client, session, normalized) {
  const targetStatus = RESULT_TO_SESSION_STATUS[normalized.status];
  if (!targetStatus) throw serviceError("CROSSFIT_RESULT_STATUS_INVALID", "Estado terminal CrossFit no válido");
  if (TERMINAL_SESSION_STATUSES.has(session.session_status)) {
    if (session.session_status !== targetStatus) {
      throw serviceError("HISTORY_IMMUTABLE", "La sesión ya tiene otro estado terminal", 409);
    }
    return session;
  }
  if (!["pending", "in_progress"].includes(session.session_status)) {
    throw serviceError("HISTORY_IMMUTABLE", "La sesión no admite cierre CrossFit v2", 409);
  }
  if (session.session_status === "pending" && normalized.status !== "cancelled") {
    throw serviceError("CROSSFIT_SESSION_NOT_STARTED", "Solo se puede cancelar una sesión CrossFit no iniciada", 409);
  }

  const completedOutcome = targetStatus === "completed";
  if (session.session_type === "weekend-extra") {
    await client.query(
      completedOutcome
        ? `UPDATE app.exercise_session_tracking
             SET status = 'completed',
                 actual_sets = GREATEST(COALESCE(actual_sets, 0), LEAST(COALESCE(planned_sets, 1), 1)),
                 completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
           WHERE methodology_session_id = $1`
        : `UPDATE app.exercise_session_tracking
             SET status = CASE WHEN status = 'completed' THEN status ELSE 'cancelled' END,
                 updated_at = NOW()
           WHERE methodology_session_id = $1`,
      [session.id]
    );
  } else {
    await client.query(
      completedOutcome
        ? `UPDATE app.methodology_exercise_progress
             SET status = 'completed',
                 series_completed = GREATEST(COALESCE(series_completed, 0), LEAST(COALESCE(series_total, 1), 1)),
                 completed_at = COALESCE(completed_at, NOW())
           WHERE methodology_session_id = $1`
        : `UPDATE app.methodology_exercise_progress
             SET status = CASE WHEN status = 'completed' THEN status ELSE 'cancelled' END
           WHERE methodology_session_id = $1`,
      [session.id]
    );
  }

  const totalExercises = Math.max(Number(session.total_exercises) || 0, canonicalMovementCount(session));
  const completedExercises = completedOutcome
    ? totalExercises
    : Math.min(Number(session.exercises_completed) || 0, totalExercises);
  const cancelledExercises = completedOutcome ? 0 : Math.max(0, totalExercises - completedExercises);
  const closure = {
    schema_version: "crossfit-session-closure/v2",
    result_status: normalized.status,
    session_status: targetStatus,
    completion: normalized.completion,
    termination_reason: normalized.terminationReason,
    recorded_at: normalized.recordedAt
  };
  const updated = await client.query(
    `UPDATE app.methodology_exercise_sessions
        SET session_status = $2,
            exercises_completed = $3,
            exercises_cancelled = $4,
            total_exercises = $5,
            completion_rate = $6,
            completed_at = COALESCE(completed_at, $7::timestamptz),
            cancelled_at = CASE
              WHEN $2 = 'cancelled' THEN COALESCE(cancelled_at, $7::timestamptz)
              ELSE cancelled_at
            END,
            total_duration_seconds = CASE
              WHEN started_at IS NOT NULL THEN GREATEST(
                COALESCE(total_duration_seconds, 0),
                EXTRACT(EPOCH FROM ($7::timestamptz - started_at))::integer
              )
              ELSE COALESCE(total_duration_seconds, 0)
            END,
            session_metadata = COALESCE(session_metadata, '{}'::jsonb)
              || jsonb_build_object('crossfit_v2_closure', $8::jsonb),
            is_current_session = false,
            updated_at = NOW()
      WHERE id = $1 AND user_id = $9
      RETURNING *`,
    [
      session.id, targetStatus, completedExercises, cancelledExercises, totalExercises,
      Math.round(normalized.completion * 100), normalized.recordedAt, JSON.stringify(closure), session.user_id
    ]
  );
  if (updated.rowCount !== 1) {
    throw serviceError("CROSSFIT_SESSION_NOT_FOUND", "La sesión cambió durante el cierre", 409);
  }
  return { ...session, ...updated.rows[0], session_status: targetStatus, completion_rate: normalized.completion * 100 };
}

function pauseDays(history, recordedAt) {
  const previous = history.at(-1);
  if (!previous?.recorded_at) return 0;
  const days = (Date.parse(recordedAt) - Date.parse(previous.recorded_at)) / 86400000;
  return Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
}

async function enqueueCrossfitLoad(client, { session, result, flags, env }) {
  if (!flags.emitsTrainingLoad) {
    return { enqueued: false, skipped: true, reason: "CROSSFIT_EMITS_TRAINING_LOAD_DISABLED" };
  }
  if (!isOutboxEmissionEnabled(env)) {
    return { enqueued: false, skipped: true, reason: "OUTBOX_EMIT_DISABLED" };
  }

  const event = buildSessionCompletedEvent({
    sessionId: session.id,
    userId: session.user_id,
    methodologyPlanId: session.methodology_plan_id,
    dayId: session.day_id,
    methodologyId: "crossfit",
    methodologyLevel: result.actual_training_load.methodology_level,
    completedAt: result.recorded_at,
    finalStatus: result.status,
    completionRate: Math.round(result.completion * 100),
    plannedSessionLoad: sessionMetadata(session).planned_session_load,
    actualSessionLoad: result.actual_training_load
  });

  await client.query("SAVEPOINT crossfit_v2_outbox");
  try {
    const persisted = await enqueueEvent(client, event);
    await client.query("RELEASE SAVEPOINT crossfit_v2_outbox");
    return { enqueued: true, ...persisted };
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT crossfit_v2_outbox");
    return { enqueued: false, error: error?.message ?? String(error) };
  }
}

export async function registerCrossfitV2Result(client, {
  userId,
  planId,
  sessionId,
  manual = {},
  requestId = null,
  idempotencyKey = null,
  now = new Date(),
  env = process.env,
  clearanceResolved = false,
  allowPendingFeedback = false
} = {}) {
  const flags = getCrossfitFeatureFlags(env);
  if (!flags.results) return null;

  const sessionQuery = await client.query(LOCK_CROSSFIT_SESSION_SQL, [sessionId, userId]);
  if (sessionQuery.rowCount === 0) throw serviceError("CROSSFIT_SESSION_NOT_FOUND", "Sesión CrossFit no encontrada", 404);
  let session = sessionQuery.rows[0];
  if (Number(session.methodology_plan_id) !== Number(planId)) {
    throw serviceError("CROSSFIT_PLAN_SESSION_MISMATCH", "La sesión no pertenece al plan CrossFit indicado", 409);
  }
  if (!/cross\s*-?\s*fit/i.test(String(session.methodology_type ?? "")) || !isCrossfitV2Session(session)) {
    return null;
  }

  if (allowPendingFeedback && manual.rpe == null) {
    return {
      registered: false,
      pendingFeedback: true,
      decision: "hold",
      reason: "CROSSFIT_V2_FEEDBACK_REQUIRED"
    };
  }

  const stableIdempotencyKey = idempotencyKey || `crossfit-result-v2:${sessionId}`;
  const normalized = normalizeResultInput(session, manual, now);
  const requestHash = resultRequestHash(normalized);
  const existing = await client.query(FIND_CROSSFIT_RESULT_SQL, [userId, sessionId, stableIdempotencyKey]);
  if (existing.rowCount > 0) {
    const existingRow = existing.rows[0];
    if (
      Number(existingRow.session_id) !== Number(sessionId)
      || Number(existingRow.methodology_plan_id) !== Number(planId)
    ) {
      throw serviceError("IDEMPOTENCY_BROKEN", "La clave de idempotencia pertenece a otra sesión", 409);
    }
    const existingResult = existingRow.payload;
    const storedRequestHash = existingResult?.provenance?.request_hash;
    if (storedRequestHash && storedRequestHash !== requestHash) {
      throw serviceError("IDEMPOTENCY_BROKEN", "El resultado ya existe con otro contenido", 409);
    }
    const snapshotQuery = await client.query(LOAD_CROSSFIT_SNAPSHOT_SQL, [userId, planId]);
    const snapshot = snapshotQuery.rows[0]?.payload ?? null;
    return {
      registered: true,
      alreadyRegistered: true,
      decision: snapshot?.state ?? "hold",
      result: existingResult,
      autoreg: snapshot,
      outbox: { enqueued: false, skipped: true, reason: "IDEMPOTENT_REPLAY" }
    };
  }

  const runtimeEvents = await client.query(LOAD_CROSSFIT_RUNTIME_EVENTS_SQL, [userId, sessionId]);
  normalized.scales = deriveCrossfitResultScales(session, runtimeEvents.rows);
  session = await finalizeCrossfitV2Session(client, session, normalized);
  const exerciseSql = session.session_type === "weekend-extra"
    ? LOAD_CROSSFIT_SINGLE_DAY_EXERCISE_ROWS_SQL
    : LOAD_CROSSFIT_EXERCISE_ROWS_SQL;
  const exerciseQuery = await client.query(exerciseSql, [sessionId]);
  const durationSeconds = resolveSessionDurationSeconds({
    totalDurationSeconds: session.total_duration_seconds,
    startedAt: session.started_at,
    completedAt: session.completed_at,
    now: Date.parse(normalized.recordedAt)
  });
  const resolvedRequestId = requestId || stableCrossfitId("req", [userId, sessionId, stableIdempotencyKey]);
  const sessionProvenance = normalized.metadata.crossfit_v2?.provenance
    ?? normalized.metadata.crossfit_v2_session?.provenance
    ?? {};
  const startAdjustment = normalized.metadata.crossfit_v2_start_adjustment ?? {};
  const result = buildCrossfitResultV2({
    request_id: resolvedRequestId,
    session_id: session.id,
    plan_id: session.methodology_plan_id,
    day_id: session.day_id,
    user_id: session.user_id,
    status: normalized.status,
    completion: normalized.completion,
    score: normalized.score,
    scales: normalized.scales,
    rpe: normalized.rpe,
    technique: normalized.technique,
    pain: normalized.pain,
    readiness: normalized.readiness,
    recorded_at: normalized.recordedAt,
    idempotency_key: stableIdempotencyKey,
    planned_training_load: normalized.plannedLoad,
    duration_seconds: durationSeconds,
    exercise_rows: exerciseQuery.rows,
    level: normalized.level,
    provenance: {
      adherence_rate: normalized.completion,
      domain: sessionProvenance.domain ?? "mixed",
      performance_delta: sessionProvenance.performance_delta ?? null,
      skill_candidate: sessionProvenance.skill_candidate === true,
      skill_prerequisites_met: sessionProvenance.skill_prerequisites_met === true,
      skill_id: sessionProvenance.skill_id ?? null,
      dangerous_misses: sessionProvenance.dangerous_misses === true,
      capacity_progressed_microcycle: sessionProvenance.capacity_progressed_microcycle === true
        || startAdjustment.state === 'progress_capacity',
      skill_progressed_microcycle: sessionProvenance.skill_progressed_microcycle === true
        || startAdjustment.state === 'progress_skill',
      equipment_signature_changed: sessionProvenance.equipment_signature_changed === true,
      readiness_cut: sessionProvenance.readiness_cut === true,
      srpe_ratio_7_28: sessionProvenance.srpe_ratio_7_28 ?? null,
      is_test: sessionProvenance.is_test === true,
      termination_reason: normalized.terminationReason,
      request_hash: requestHash
    }
  });

  const [historyQuery, snapshotQuery] = await Promise.all([
    client.query(LOAD_CROSSFIT_RESULT_HISTORY_SQL, [userId, planId, normalized.recordedAt]),
    client.query(LOAD_CROSSFIT_SNAPSHOT_SQL, [userId, planId])
  ]);
  const history = historyQuery.rows.map((row) => row.payload);
  const previousSnapshot = snapshotQuery.rows[0]?.payload ?? null;
  const autoreg = assertCrossfitContract(validateCrossfitAutoreg, reduceCrossfitAutoreg({
    previous_snapshot: previousSnapshot,
    events: [...history, result],
    user_id: session.user_id,
    plan_id: session.methodology_plan_id,
    source_event_id: result.result_id,
    request_id: resolvedRequestId,
    processed_at: normalized.recordedAt,
    pause_days: pauseDays(history, normalized.recordedAt),
    clearance_resolved: clearanceResolved
  }));
  const eventId = stableCrossfitId("cfe", [result.result_id, autoreg.snapshot_id]);

  await client.query(
    `INSERT INTO app.crossfit_v2_results (
       result_id, user_id, methodology_plan_id, session_id, day_id,
       schema_version, ruleset_version, catalog_version, request_id,
       idempotency_key, status, completion, payload, actual_training_load, recorded_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15)`,
    [
      result.result_id, session.user_id, session.methodology_plan_id, session.id, session.day_id,
      result.schema_version, result.ruleset_version, result.catalog_version, result.request_id,
      result.idempotency_key, result.status, result.completion, JSON.stringify(result),
      JSON.stringify(result.actual_training_load), result.recorded_at
    ]
  );
  await client.query(
    `INSERT INTO app.crossfit_v2_autoreg_events (
       event_id, source_event_id, user_id, methodology_plan_id,
       schema_version, ruleset_version, catalog_version, previous_state,
       state, reason_codes, payload, processed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)`,
    [
      eventId, result.result_id, session.user_id, session.methodology_plan_id,
      autoreg.schema_version, autoreg.ruleset_version, autoreg.catalog_version,
      autoreg.previous_state, autoreg.state, autoreg.reason_codes,
      JSON.stringify(autoreg), autoreg.processed_at
    ]
  );
  await client.query(
    `INSERT INTO app.crossfit_v2_autoreg_snapshots (
       user_id, methodology_plan_id, snapshot_id, source_event_id,
       schema_version, ruleset_version, catalog_version, state, payload, processed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
     ON CONFLICT (user_id, methodology_plan_id) DO UPDATE SET
       snapshot_id = EXCLUDED.snapshot_id,
       source_event_id = EXCLUDED.source_event_id,
       schema_version = EXCLUDED.schema_version,
       ruleset_version = EXCLUDED.ruleset_version,
       catalog_version = EXCLUDED.catalog_version,
       state = EXCLUDED.state,
       payload = EXCLUDED.payload,
       processed_at = EXCLUDED.processed_at,
       updated_at = NOW()`,
    [
      session.user_id, session.methodology_plan_id, autoreg.snapshot_id, result.result_id,
      autoreg.schema_version, autoreg.ruleset_version, autoreg.catalog_version,
      autoreg.state, JSON.stringify(autoreg), autoreg.processed_at
    ]
  );
  const summary = {
    registered_at: normalized.recordedAt,
    schema_version: CROSSFIT_VERSIONS.autoreg,
    decision: autoreg.state,
    result_id: result.result_id,
    snapshot_id: autoreg.snapshot_id,
    rpe: result.rpe,
    technique: result.technique,
    pain_score: result.pain.score,
    source: "crossfit_v2_result"
  };
  await client.query(
    `UPDATE app.methodology_exercise_sessions
       SET session_metadata = COALESCE(session_metadata, '{}'::jsonb)
         || jsonb_build_object('autoreg', $2::jsonb, 'crossfit_v2_result_id', $3::text),
           effort_rating = $4,
           updated_at = NOW()
     WHERE id = $1 AND user_id = $5`,
    [session.id, JSON.stringify(summary), result.result_id, result.rpe, session.user_id]
  );

  const outbox = await enqueueCrossfitLoad(client, { session, result, flags, env });
  return {
    registered: true,
    alreadyRegistered: false,
    decision: autoreg.state,
    result,
    autoreg,
    outbox
  };
}
