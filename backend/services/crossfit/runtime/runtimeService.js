import crypto from "node:crypto";

import { CrossfitCatalogRepository } from "../catalog/catalogRepository.js";
import { stableCrossfitId } from "../generator/deterministic.js";
import {
  crossfitEquipmentAvailable,
  crossfitMovementSkillTier,
  crossfitSkillAllowed
} from "../generator/wodComposer.js";
import { evaluateCrossfitSafety } from "../safety/safetyEvaluator.js";
import { CROSSFIT_VERSIONS } from "../versions.js";

export const LOCK_CROSSFIT_RUNTIME_SESSION_SQL = `
SELECT s.id, s.user_id, s.methodology_plan_id, s.day_id, s.session_status,
       s.session_metadata, p.plan_data
FROM app.methodology_exercise_sessions s
JOIN app.methodology_plans p ON p.id = s.methodology_plan_id AND p.user_id = s.user_id
WHERE s.id = $1 AND s.user_id = $2
FOR UPDATE OF s`;

const PUBLIC_EVENT_TYPES = new Set([
  "timer_started",
  "timer_paused",
  "timer_resumed",
  "timer_reset",
  "scale_selected"
]);
const TIMER_EVENT_TYPES = new Set(["timer_started", "timer_paused", "timer_resumed", "timer_reset"]);
const OPEN_SESSION_STATUSES = new Set(["scheduled", "pending", "in_progress"]);
const SUBSTITUTION_REASONS = new Set(["pain", "equipment", "technique", "preference"]);
const PAIN_LOCATIONS = new Set([
  "shoulder", "hombro", "elbow", "codo", "wrist", "muneca", "lumbar", "back",
  "knee", "rodilla", "hip", "cadera", "ankle", "tobillo", "other", "otra"
]);
const HAZARD_TAGS = ["impact", "grip", "overhead", "hinge", "ghd"];

function serviceError(code, message, status = 422, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rejectUnknownKeys(value, allowed, path) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw serviceError("CROSSFIT_RUNTIME_EVENT_INVALID", `${path} contiene campos no admitidos`, 422, {
      path,
      unknown
    });
  }
}

function requiredString(value, path, minimum = 1, maximum = 200) {
  if (typeof value !== "string" || value.trim().length < minimum || value.trim().length > maximum) {
    throw serviceError("CROSSFIT_RUNTIME_EVENT_INVALID", `${path} es obligatorio`, 422, { path });
  }
  return value.trim();
}

function boundedStringList(value, path, { maximumItems = 8, maximumLength = 120 } = {}) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximumItems) {
    throw serviceError("CROSSFIT_RUNTIME_EVENT_INVALID", `${path} no es una lista valida`, 422, { path });
  }
  return value.map((item) => requiredString(item, path, 1, maximumLength));
}

function finiteNumber(value, path, min, max, { integer = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || integer && !Number.isInteger(number) || number < min || number > max) {
    throw serviceError("CROSSFIT_RUNTIME_EVENT_INVALID", `${path} esta fuera de rango`, 422, {
      path,
      min,
      max
    });
  }
  return number;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function contentHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function isoTimestamp(value, path, now = new Date()) {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) {
    throw serviceError("CROSSFIT_RUNTIME_EVENT_INVALID", `${path} debe ser ISO valido`, 422, { path });
  }
  if (date.getTime() > now.getTime() + 5 * 60 * 1000 || date.getTime() < now.getTime() - 30 * 86400000) {
    throw serviceError("CROSSFIT_RUNTIME_EVENT_INVALID", `${path} queda fuera de la ventana admitida`, 422, { path });
  }
  return date.toISOString();
}

function sanitizeTimerPayload(eventType, payload) {
  const allowed = new Set(["elapsed_seconds", "time_cap_seconds"]);
  rejectUnknownKeys(payload, allowed, "runtime_event.payload");
  const normalized = {
    elapsed_seconds: finiteNumber(payload.elapsed_seconds, "payload.elapsed_seconds", 0, 10800, { integer: true }),
    time_cap_seconds: finiteNumber(payload.time_cap_seconds, "payload.time_cap_seconds", 0, 10800, { integer: true })
  };
  if (normalized.elapsed_seconds > normalized.time_cap_seconds && normalized.time_cap_seconds > 0) {
    throw serviceError("CROSSFIT_RUNTIME_EVENT_INVALID", "elapsed_seconds supera el time cap");
  }
  return { ...normalized, timer_state: eventType.replace("timer_", "") };
}

function sanitizeScalePayload(payload) {
  rejectUnknownKeys(payload, new Set(["movement_id", "scale_id"]), "runtime_event.payload");
  const movementId = requiredString(payload.movement_id, "payload.movement_id");
  const scaleId = requiredString(payload.scale_id, "payload.scale_id");
  if (!new Set(["base", "scaled"]).has(scaleId)) {
    throw serviceError(
      "WOD_SCALE_STIMULUS_LOSS",
      "La escala publica solo admite base o scaled; RX+ requiere una variante verificada"
    );
  }
  return { movement_id: movementId, scale_id: scaleId };
}

export function normalizeCrossfitRuntimeEvent(body = {}, { now = new Date() } = {}) {
  if (!isPlainObject(body)) throw serviceError("CROSSFIT_RUNTIME_EVENT_INVALID", "El evento debe ser un objeto");
  rejectUnknownKeys(body, new Set([
    "schema_version", "request_id", "idempotency_key", "stream_id", "client_sequence",
    "event_type", "occurred_at", "payload"
  ]), "runtime_event");
  if (body.schema_version !== CROSSFIT_VERSIONS.runtimeEvent) {
    throw serviceError("CROSSFIT_RUNTIME_EVENT_VERSION_UNSUPPORTED", `schema_version debe ser ${CROSSFIT_VERSIONS.runtimeEvent}`);
  }
  const eventType = requiredString(body.event_type, "event_type");
  if (!PUBLIC_EVENT_TYPES.has(eventType)) {
    throw serviceError(
      "CROSSFIT_RUNTIME_EVENT_INVALID",
      "movement_substituted solo puede crearlo el resolver validado del servidor"
    );
  }
  if (!isPlainObject(body.payload)) throw serviceError("CROSSFIT_RUNTIME_EVENT_INVALID", "payload debe ser un objeto");
  const streamId = requiredString(body.stream_id, "stream_id", 8);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(streamId)) {
    throw serviceError("CROSSFIT_RUNTIME_EVENT_INVALID", "stream_id no es valido");
  }
  return {
    schema_version: CROSSFIT_VERSIONS.runtimeEvent,
    request_id: requiredString(body.request_id, "request_id", 8),
    idempotency_key: requiredString(body.idempotency_key, "idempotency_key", 8),
    stream_id: streamId,
    client_sequence: finiteNumber(body.client_sequence, "client_sequence", 0, 1000000, { integer: true }),
    event_type: eventType,
    occurred_at: isoTimestamp(body.occurred_at, "occurred_at", now),
    payload: eventType === "scale_selected"
      ? sanitizeScalePayload(body.payload)
      : sanitizeTimerPayload(eventType, body.payload)
  };
}

function canonicalSessionFromRow(row) {
  const metadata = isPlainObject(row?.session_metadata) ? row.session_metadata : {};
  const canonical = metadata.crossfit_v2_session ?? metadata.crossfit_v2?.session ?? null;
  if (canonical?.schema_version !== CROSSFIT_VERSIONS.session) {
    throw serviceError("CROSSFIT_SESSION_NOT_FOUND", "La sesion no contiene contrato CrossFit v2", 404);
  }
  if (row.day_id == null || Number(row.methodology_plan_id) <= 0) {
    throw serviceError("CROSSFIT_DAY_ID_REQUIRED", "La sesion CrossFit v2 no tiene identidad day_id", 409);
  }
  if (!OPEN_SESSION_STATUSES.has(String(row.session_status).toLowerCase())) {
    throw serviceError("HISTORY_IMMUTABLE", "Una sesion historica no admite nuevos eventos de ejecucion", 409);
  }
  return canonical;
}

export async function loadCrossfitRuntimeSession(client, userId, sessionId) {
  const result = await client.query(LOCK_CROSSFIT_RUNTIME_SESSION_SQL, [sessionId, userId]);
  if (!result.rowCount) throw serviceError("CROSSFIT_SESSION_NOT_FOUND", "Sesion CrossFit no encontrada", 404);
  const row = result.rows[0];
  return {
    row,
    canonical_session: canonicalSessionFromRow(row),
    plan_data: isPlainObject(row.plan_data) ? row.plan_data : {}
  };
}

function idempotencyError() {
  return serviceError("IDEMPOTENCY_BROKEN", "La idempotency_key ya existe con otro contenido", 409);
}

function replay(existing, hash) {
  if (existing?.content_hash !== hash) throw idempotencyError();
  return {
    event: existing.payload,
    event_sequence: existing.event_sequence,
    idempotent_replay: true
  };
}

export function validateCrossfitRuntimeTransition(normalized, {
  previousEvent = null,
  previousTimerEvent = null
} = {}) {
  const expectedSequence = previousEvent == null
    ? 0
    : Number(previousEvent.client_sequence) + 1;
  if (normalized.client_sequence !== expectedSequence) {
    throw serviceError(
      "CROSSFIT_RUNTIME_SEQUENCE_INVALID",
      `client_sequence debe ser ${expectedSequence}`,
      409,
      {
        expected_client_sequence: expectedSequence,
        retryable: normalized.client_sequence > expectedSequence,
        safe_fallback: "retry_events_in_order"
      }
    );
  }

  if (!TIMER_EVENT_TYPES.has(normalized.event_type)) return normalized;
  const previousType = previousTimerEvent?.event_type ?? null;
  const allowedPrevious = {
    timer_started: new Set([null, "timer_reset"]),
    timer_paused: new Set(["timer_started", "timer_resumed"]),
    timer_resumed: new Set(["timer_paused"]),
    timer_reset: new Set(["timer_started", "timer_paused", "timer_resumed"])
  }[normalized.event_type];
  if (!allowedPrevious.has(previousType)) {
    throw serviceError(
      "CROSSFIT_RUNTIME_TRANSITION_INVALID",
      `Transicion ${previousType ?? "initial"} -> ${normalized.event_type} no permitida`,
      409,
      { retryable: false, safe_fallback: "restore_last_confirmed_timer_state" }
    );
  }

  const elapsed = normalized.payload.elapsed_seconds;
  const previousElapsed = Number(previousTimerEvent?.payload?.payload?.elapsed_seconds
    ?? previousTimerEvent?.payload?.elapsed_seconds
    ?? 0);
  const previousCap = Number(previousTimerEvent?.payload?.payload?.time_cap_seconds
    ?? previousTimerEvent?.payload?.time_cap_seconds
    ?? normalized.payload.time_cap_seconds);
  if (["timer_started", "timer_reset"].includes(normalized.event_type) && elapsed !== 0) {
    throw serviceError("CROSSFIT_RUNTIME_TRANSITION_INVALID", "El inicio o reset debe registrar cero segundos", 409);
  }
  if (!["timer_started", "timer_reset"].includes(normalized.event_type) && elapsed < previousElapsed) {
    throw serviceError("CROSSFIT_RUNTIME_TRANSITION_INVALID", "El tiempo transcurrido no puede retroceder", 409);
  }
  if (previousTimerEvent && normalized.payload.time_cap_seconds !== previousCap) {
    throw serviceError("CROSSFIT_RUNTIME_TRANSITION_INVALID", "El time cap no puede cambiar dentro del stream", 409);
  }
  return normalized;
}

function validateCrossfitRuntimeEventForSession(context, normalized) {
  if (normalized.event_type !== "scale_selected") return;
  const movementIds = new Set((context.canonical_session?.wod?.movements ?? [])
    .map((movement) => movement.canonical_movement_id));
  if (!movementIds.has(normalized.payload.movement_id)) {
    throw serviceError("CROSSFIT_MOVEMENT_NOT_FOUND", "El movimiento escalado no pertenece al WOD", 404);
  }
}

export async function recordCrossfitRuntimeEvent(client, context, normalized, { hashPayload = normalized } = {}) {
  const eventId = stableCrossfitId("cfu", [
    context.row.id,
    normalized.stream_id,
    normalized.client_sequence,
    normalized.event_type
  ]);
  const hash = contentHash(hashPayload);
  validateCrossfitRuntimeEventForSession(context, normalized);
  const existing = await client.query(
    `SELECT event_sequence, content_hash, payload
       FROM app.crossfit_v2_runtime_events
      WHERE user_id = $1 AND idempotency_key = $2`,
    [context.row.user_id, normalized.idempotency_key]
  );
  if (existing.rowCount) return replay(existing.rows[0], hash);

  const previous = await client.query(
    `SELECT client_sequence, event_type, payload
       FROM app.crossfit_v2_runtime_events
      WHERE session_id = $1 AND stream_id = $2
      ORDER BY client_sequence DESC
      LIMIT 1`,
    [context.row.id, normalized.stream_id]
  );
  let previousTimerEvent = null;
  if (TIMER_EVENT_TYPES.has(normalized.event_type)) {
    const timer = await client.query(
      `SELECT client_sequence, event_type, payload
         FROM app.crossfit_v2_runtime_events
        WHERE session_id = $1 AND stream_id = $2
          AND event_type IN ('timer_started', 'timer_paused', 'timer_resumed', 'timer_reset')
        ORDER BY client_sequence DESC
        LIMIT 1`,
      [context.row.id, normalized.stream_id]
    );
    previousTimerEvent = timer.rows[0] ?? null;
  }
  validateCrossfitRuntimeTransition(normalized, {
    previousEvent: previous.rows[0] ?? null,
    previousTimerEvent
  });

  const payload = {
    schema_version: CROSSFIT_VERSIONS.runtimeEvent,
    ruleset_version: CROSSFIT_VERSIONS.ruleset,
    catalog_version: CROSSFIT_VERSIONS.catalog,
    request_id: normalized.request_id,
    event_id: eventId,
    event_type: normalized.event_type,
    stream_id: normalized.stream_id,
    client_sequence: normalized.client_sequence,
    session_id: context.row.id,
    plan_id: context.row.methodology_plan_id,
    day_id: context.row.day_id,
    occurred_at: normalized.occurred_at,
    payload: normalized.payload
  };
  let inserted;
  try {
    inserted = await client.query(
      `INSERT INTO app.crossfit_v2_runtime_events (
       event_id, user_id, methodology_plan_id, session_id, day_id,
       schema_version, ruleset_version, catalog_version, stream_id, client_sequence,
       event_type, request_id, idempotency_key, content_hash, payload, occurred_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16)
     ON CONFLICT (user_id, idempotency_key) DO NOTHING
     RETURNING event_id, event_sequence`,
      [
        eventId,
        context.row.user_id,
        context.row.methodology_plan_id,
        context.row.id,
        context.row.day_id,
        CROSSFIT_VERSIONS.runtimeEvent,
        CROSSFIT_VERSIONS.ruleset,
        CROSSFIT_VERSIONS.catalog,
        normalized.stream_id,
        normalized.client_sequence,
        normalized.event_type,
        normalized.request_id,
        normalized.idempotency_key,
        hash,
        JSON.stringify(payload),
        normalized.occurred_at
      ]
    );
  } catch (error) {
    if (error?.code === "23505") throw idempotencyError();
    throw error;
  }
  if (inserted.rowCount) {
    return { event: payload, event_sequence: inserted.rows[0].event_sequence, idempotent_replay: false };
  }
  const concurrent = await client.query(
    `SELECT event_sequence, content_hash, payload
       FROM app.crossfit_v2_runtime_events
      WHERE user_id = $1 AND idempotency_key = $2`,
    [context.row.user_id, normalized.idempotency_key]
  );
  return replay(concurrent.rows[0], hash);
}

function sanitizeCheckIn(checkIn = {}, reason) {
  if (!isPlainObject(checkIn)) throw serviceError("CROSSFIT_SUBSTITUTION_INVALID", "check_in debe ser objeto");
  rejectUnknownKeys(checkIn, new Set(["pain", "technique_score", "red_flags", "red_flag", "acute_injury"]), "check_in");
  if (checkIn.pain !== undefined && !isPlainObject(checkIn.pain)) {
    throw serviceError("CROSSFIT_SUBSTITUTION_INVALID", "check_in.pain debe ser objeto");
  }
  const pain = isPlainObject(checkIn.pain) ? checkIn.pain : {};
  rejectUnknownKeys(pain, new Set(["score", "delta", "quality", "locations"]), "check_in.pain");
  const score = finiteNumber(pain.score ?? 0, "check_in.pain.score", 0, 10);
  const locations = boundedStringList(pain.locations, "check_in.pain.locations", {
    maximumItems: 8,
    maximumLength: 30
  }).map((item) => item.toLowerCase());
  if (locations.some((location) => !PAIN_LOCATIONS.has(location))) {
    throw serviceError("CROSSFIT_SUBSTITUTION_INVALID", "Zona de dolor no admitida");
  }
  if (reason === "pain" && (score < 1 || locations.length === 0)) {
    throw serviceError("CROSSFIT_SUBSTITUTION_INVALID", "Dolor requiere puntuacion y zona");
  }
  return {
    pain: {
      score,
      delta: finiteNumber(pain.delta ?? 0, "check_in.pain.delta", -10, 10),
      quality: pain.quality ? requiredString(pain.quality, "check_in.pain.quality", 1, 50).toLowerCase() : null,
      locations
    },
    technique_score: checkIn.technique_score === undefined
      ? undefined
      : finiteNumber(checkIn.technique_score, "check_in.technique_score", 0, 3, { integer: true }),
    red_flags: boundedStringList(checkIn.red_flags, "check_in.red_flags"),
    red_flag: checkIn.red_flag === true,
    acute_injury: checkIn.acute_injury === true
  };
}

export function normalizeCrossfitSubstitutionRequest(body = {}, { now = new Date() } = {}) {
  if (!isPlainObject(body)) throw serviceError("CROSSFIT_SUBSTITUTION_INVALID", "La sustitucion debe ser objeto");
  rejectUnknownKeys(body, new Set([
    "schema_version", "request_id", "idempotency_key", "stream_id", "client_sequence",
    "occurred_at", "movement_id", "requested_target_id", "reason", "check_in",
    "temporarily_unavailable_equipment"
  ]), "substitution");
  if (body.schema_version !== CROSSFIT_VERSIONS.substitution) {
    throw serviceError("CROSSFIT_SUBSTITUTION_VERSION_UNSUPPORTED", `schema_version debe ser ${CROSSFIT_VERSIONS.substitution}`);
  }
  const reason = requiredString(body.reason, "reason");
  if (!SUBSTITUTION_REASONS.has(reason)) throw serviceError("CROSSFIT_SUBSTITUTION_INVALID", "Motivo de sustitucion no valido");
  const unavailable = boundedStringList(
    body.temporarily_unavailable_equipment,
    "temporarily_unavailable_equipment",
    { maximumItems: 32, maximumLength: 80 }
  );
  const streamId = requiredString(body.stream_id, "stream_id", 8);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(streamId)) {
    throw serviceError("CROSSFIT_SUBSTITUTION_INVALID", "stream_id no es valido");
  }
  if (reason === "technique" && ![0, 1].includes(Number(body.check_in?.technique_score))) {
    throw serviceError("CROSSFIT_SUBSTITUTION_INVALID", "La sustitucion tecnica exige calidad 0 o 1");
  }
  if (reason === "equipment" && unavailable.length === 0) {
    throw serviceError("CROSSFIT_SUBSTITUTION_INVALID", "Indica el material temporalmente no disponible");
  }
  return {
    schema_version: CROSSFIT_VERSIONS.substitution,
    request_id: requiredString(body.request_id, "request_id", 8),
    idempotency_key: requiredString(body.idempotency_key, "idempotency_key", 8),
    stream_id: streamId,
    client_sequence: finiteNumber(body.client_sequence, "client_sequence", 0, 1000000, { integer: true }),
    occurred_at: isoTimestamp(body.occurred_at, "occurred_at", now),
    movement_id: requiredString(body.movement_id, "movement_id", 1, 120),
    requested_target_id: body.requested_target_id == null
      ? null
      : requiredString(body.requested_target_id, "requested_target_id", 1, 120),
    reason,
    check_in: sanitizeCheckIn(body.check_in ?? {}, reason),
    temporarily_unavailable_equipment: [...new Set(unavailable)]
  };
}

function arraysIntersect(left = [], right = []) {
  const values = new Set(left);
  return right.some((item) => values.has(item));
}

function pairingConflict(left, right) {
  return arraysIntersect(left.avoid_pairing ?? [], right.pairing_tags ?? [])
    || arraysIntersect(right.avoid_pairing ?? [], left.pairing_tags ?? []);
}

function introducesHazard(source, target) {
  const sourceTags = source.pairing_tags ?? [];
  const targetTags = target.pairing_tags ?? [];
  return HAZARD_TAGS.some((hazard) =>
    targetTags.some((tag) => String(tag).includes(hazard))
    && !sourceTags.some((tag) => String(tag).includes(hazard)));
}

function estimatedStimulusDelta(source, target, explicitDelta) {
  if (Number.isFinite(Number(explicitDelta))) return Math.abs(Number(explicitDelta));
  const sharedTime = arraysIntersect(source.time_domains ?? [], target.time_domains ?? []);
  const sharedStimulus = arraysIntersect(source.stimulus ?? [], target.stimulus ?? []);
  if (source.domain === target.domain && source.pattern === target.pattern) return 0.02;
  if (source.domain === "monostructural" && target.domain === "monostructural" && sharedTime) return 0.05;
  if (source.domain === target.domain && sharedTime) return 0.08;
  if (sharedStimulus && sharedTime) return 0.1;
  if (sharedTime) return 0.15;
  return 0.2;
}

function secondsPerRep(skillTier) {
  return [2, 2.5, 3, 4, 5, 6][Math.min(5, Math.max(0, skillTier))];
}

function equivalentDose(originalDose = {}, source, target) {
  const sourceTier = crossfitMovementSkillTier(source);
  const targetTier = crossfitMovementSkillTier(target);
  if (originalDose.type === "duration") {
    return {
      dose: { type: "duration", duration_seconds: originalDose.duration_seconds },
      expected_set_seconds: originalDose.duration_seconds
    };
  }
  if (originalDose.type === "reps") {
    const expectedSeconds = Math.max(5, Math.round(Number(originalDose.reps ?? 1) * secondsPerRep(sourceTier)));
    if (target.domain === "monostructural") {
      return {
        dose: { type: "duration", duration_seconds: expectedSeconds },
        expected_set_seconds: expectedSeconds
      };
    }
    const reps = Math.max(1, Math.round(expectedSeconds / secondsPerRep(targetTier)));
    return {
      dose: { type: "reps", reps },
      expected_set_seconds: Math.round(reps * secondsPerRep(targetTier))
    };
  }
  const duration = Number(originalDose.duration_seconds ?? 45);
  return {
    dose: { type: "quality", duration_seconds: duration },
    expected_set_seconds: duration
  };
}

function reasonCodeForSubstitution(request, sourceSafety) {
  if (request.reason === "pain") {
    return sourceSafety.reason_codes.includes("SAFETY_PAIN_MODIFY")
      ? "SAFETY_PAIN_MODIFY"
      : "SAFETY_DISCOMFORT_MONITOR";
  }
  if (request.reason === "equipment") return "EQUIPMENT_UNAVAILABLE";
  if (request.reason === "technique") return "SAFETY_TECHNIQUE_STOP";
  return "AUTOREG_HOLD";
}

export function resolveCrossfitSubstitution({
  context,
  request,
  catalog,
  edges,
  profile = {},
  equipment = []
} = {}) {
  const canonicalSession = context?.canonical_session;
  const movements = canonicalSession?.wod?.movements ?? [];
  const originalContract = movements.find((movement) => movement.canonical_movement_id === request.movement_id);
  if (!originalContract) throw serviceError("CROSSFIT_MOVEMENT_NOT_FOUND", "El movimiento no pertenece al WOD", 404);

  const catalogById = new Map(catalog.map((movement) => [movement.canonical_id, movement]));
  const source = catalogById.get(request.movement_id);
  if (!source) throw serviceError("CATALOG_INACTIVE", "El movimiento original no esta activo", 409);
  const availableEquipment = equipment.filter((item) =>
    !request.temporarily_unavailable_equipment.includes(item));
  const safetyProfile = { ...profile, available_equipment: availableEquipment };
  const sourceSafety = evaluateCrossfitSafety({ profile: safetyProfile, movement: source, checkIn: request.check_in });
  if (sourceSafety.blocked) {
    throw serviceError(sourceSafety.reason_codes[0] ?? "SAFETY_RED_FLAG", "La seguridad obliga a detener la sesion", 422, {
      reason_codes: sourceSafety.reason_codes,
      safe_fallback: "stop_session_and_refer"
    });
  }

  const level = canonicalSession.level;
  const permissions = context.plan_data?.crossfit_classification?.skill_permissions ?? {};
  const otherCatalogMovements = movements
    .filter((movement) => movement.canonical_movement_id !== request.movement_id)
    .map((movement) => catalogById.get(movement.canonical_movement_id))
    .filter(Boolean);
  const usedIds = new Set(movements.map((movement) => movement.canonical_movement_id));
  const edgeTargets = new Set(source.substitutions ?? []);
  const candidates = edges
    .filter((edge) => edge.target_kind === "movement" && edgeTargets.has(edge.target_id))
    .map((edge) => ({ edge, movement: catalogById.get(edge.target_id) }))
    .filter(({ movement }) => movement?.active && !usedIds.has(movement.canonical_id))
    .filter(({ movement }) => crossfitSkillAllowed(movement, level, permissions))
    .filter(({ movement }) => crossfitEquipmentAvailable(movement.equipment, availableEquipment))
    .filter(({ movement }) => !introducesHazard(source, movement))
    .filter(({ movement }) => !otherCatalogMovements.some((other) =>
      other.pattern === movement.pattern || pairingConflict(other, movement)))
    .map(({ edge, movement }) => {
      const safety = evaluateCrossfitSafety({ profile: safetyProfile, movement, checkIn: request.check_in });
      const stimulusDelta = estimatedStimulusDelta(source, movement, edge.stimulus_delta);
      return {
        edge,
        movement,
        safety,
        stimulus_delta: stimulusDelta,
        ...equivalentDose(originalContract.dose, source, movement)
      };
    })
    .filter((candidate) => !candidate.safety.blocked && candidate.safety.movement_allowed)
    .filter((candidate) => candidate.stimulus_delta <= 0.15)
    .sort((left, right) =>
      left.stimulus_delta - right.stimulus_delta
      || Number(left.edge.priority ?? 100) - Number(right.edge.priority ?? 100)
      || left.movement.canonical_id.localeCompare(right.movement.canonical_id));

  const selected = request.requested_target_id
    ? candidates.find((candidate) => candidate.movement.canonical_id === request.requested_target_id)
    : candidates[0];
  if (!selected) {
    throw serviceError("WOD_SCALE_STIMULUS_LOSS", "No existe una sustitucion segura que preserve el estimulo", 422, {
      reason_codes: [...new Set([...sourceSafety.reason_codes, "WOD_SCALE_STIMULUS_LOSS"])],
      safe_fallback: "stop_movement_or_session"
    });
  }

  const reasonCode = reasonCodeForSubstitution(request, sourceSafety);
  return {
    schema_version: CROSSFIT_VERSIONS.substitution,
    ruleset_version: CROSSFIT_VERSIONS.ruleset,
    catalog_version: CROSSFIT_VERSIONS.catalog,
    request_id: request.request_id,
    session_id: context.row.id,
    plan_id: context.row.methodology_plan_id,
    day_id: context.row.day_id,
    original_movement_id: source.canonical_id,
    replacement: {
      canonical_movement_id: selected.movement.canonical_id,
      name: selected.movement.name,
      dose: selected.dose,
      expected_set_seconds: selected.expected_set_seconds,
      equipment: [...(selected.movement.equipment ?? [])],
      scale_id: `substitution:${selected.movement.canonical_id}`,
      instruction_text: selected.movement.instruction_text,
      cues: [...(selected.movement.cues ?? [])],
      media: (selected.movement.media ?? []).filter((item) =>
        ["verified_owned", "verified_licensed"].includes(item.status))
    },
    stimulus_delta: selected.stimulus_delta,
    reason: request.reason,
    reason_codes: [reasonCode],
    decision_trace: [{
      rule_id: "CF-RUNTIME-SUBSTITUTION",
      reason_code: reasonCode,
      scope: "movement",
      action: "substitute_same_stimulus",
      details: {
        stimulus_delta: selected.stimulus_delta,
        candidate_count: candidates.length,
        dose_basis: "estimated_set_duration"
      }
    }]
  };
}

export async function registerCrossfitSubstitution(client, {
  userId,
  sessionId,
  body,
  profileLoader,
  equipmentLoader,
  now = new Date()
} = {}) {
  const request = normalizeCrossfitSubstitutionRequest(body, { now });
  const context = await loadCrossfitRuntimeSession(client, userId, sessionId);
  const repository = new CrossfitCatalogRepository(client);
  const catalogVersion = context.canonical_session.catalog_version;
  const [catalog, edges, profile, equipment] = await Promise.all([
    repository.listForGeneration({ useV2: true, catalogVersion }),
    repository.listSubstitutionEdges(request.movement_id, { catalogVersion }),
    profileLoader(userId),
    equipmentLoader(client, userId, [])
  ]);
  const resolution = resolveCrossfitSubstitution({ context, request, catalog, edges, profile, equipment });
  const runtimeEvent = {
    schema_version: CROSSFIT_VERSIONS.runtimeEvent,
    request_id: request.request_id,
    idempotency_key: request.idempotency_key,
    stream_id: request.stream_id,
    client_sequence: request.client_sequence,
    event_type: "movement_substituted",
    occurred_at: request.occurred_at,
    payload: resolution
  };
  const persisted = await recordCrossfitRuntimeEvent(client, context, runtimeEvent, { hashPayload: request });
  return {
    success: true,
    substitution: persisted.event.payload,
    event_id: persisted.event.event_id,
    event_sequence: persisted.event_sequence,
    idempotent_replay: persisted.idempotent_replay
  };
}
