export const CROSSFIT_RUNTIME_LOCAL_VERSION = 'crossfit-runtime-local/v2';
export const CROSSFIT_RUNTIME_EVENT_VERSION = 'crossfit-runtime-event/v2';
export const CROSSFIT_SUBSTITUTION_VERSION = 'crossfit-substitution/v2';

const TIMER_STATES = new Set(['idle', 'running', 'paused', 'reset']);
const SCALE_VALUES = new Set(['base', 'scaled']);

function finiteInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

function randomToken() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid.replaceAll('-', '');
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export function crossfitMovementId(movement, index = 0) {
  return String(movement?.canonical_movement_id ?? movement?.exercise_id ?? movement?.id ?? index);
}

export function crossfitCanonicalSession(session) {
  return session?.crossfit_v2_session
    ?? session?.metadata?.persisted_session_metadata?.crossfit_v2_session
    ?? session?.session_metadata?.crossfit_v2_session
    ?? session?.metadata?.crossfit_v2_session
    ?? null;
}

export function isCrossfitV2Presentation(session) {
  if (session?.schema_version === 'crossfit-session/v2') return true;
  return crossfitCanonicalSession(session)?.schema_version === 'crossfit-session/v2';
}

export function crossfitRuntimeStorageKey(sessionId) {
  return `crossfit:wod-runtime:v2:${String(sessionId)}`;
}

export function createCrossfitRuntimeState({
  sessionId,
  movementIds = [],
  timeCapSeconds,
  nowMs = Date.now(),
  token = randomToken()
}) {
  const normalizedMovementIds = [...new Set(movementIds.map(String))];
  return {
    schema_version: CROSSFIT_RUNTIME_LOCAL_VERSION,
    session_id: String(sessionId),
    stream_id: `cfs_${String(sessionId)}_${String(token).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48)}`,
    next_sequence: 0,
    timer: {
      state: 'idle',
      elapsed_seconds: 0,
      anchor_ms: null,
      time_cap_seconds: finiteInteger(timeCapSeconds)
    },
    scales: Object.fromEntries(normalizedMovementIds.map((id) => [id, 'base'])),
    substitutions: {},
    pending: [],
    sync_error: null,
    updated_at: new Date(nowMs).toISOString()
  };
}

function pendingIsValid(pending, nextSequence) {
  if (!Array.isArray(pending)) return false;
  let previous = -1;
  for (const item of pending) {
    const sequence = Number(item?.body?.client_sequence);
    if (!['event', 'substitution'].includes(item?.kind) || !Number.isInteger(sequence) || sequence <= previous) {
      return false;
    }
    previous = sequence;
  }
  return previous < nextSequence;
}

export function hydrateCrossfitRuntimeState(raw, options) {
  const fresh = createCrossfitRuntimeState(options);
  if (!raw || typeof raw !== 'object') return fresh;
  const expectedMovements = new Set((options.movementIds ?? []).map(String));
  const storedMovements = new Set(Object.keys(raw.scales ?? {}));
  const sameMovements = expectedMovements.size === storedMovements.size
    && [...expectedMovements].every((id) => storedMovements.has(id));
  const nextSequence = finiteInteger(raw.next_sequence, -1);
  if (
    raw.schema_version !== CROSSFIT_RUNTIME_LOCAL_VERSION
    || String(raw.session_id) !== String(options.sessionId)
    || !/^cfs_[A-Za-z0-9_-]{5,96}$/.test(String(raw.stream_id ?? ''))
    || finiteInteger(raw.timer?.time_cap_seconds) !== finiteInteger(options.timeCapSeconds)
    || !TIMER_STATES.has(raw.timer?.state)
    || nextSequence < 0
    || !sameMovements
    || !pendingIsValid(raw.pending, nextSequence)
  ) {
    return fresh;
  }

  const scales = Object.fromEntries([...expectedMovements].map((id) => {
    const value = String(raw.scales[id] ?? 'base');
    return [id, SCALE_VALUES.has(value) || value.startsWith('substitution:') ? value : 'base'];
  }));
  return {
    ...fresh,
    stream_id: raw.stream_id,
    next_sequence: nextSequence,
    timer: {
      state: raw.timer.state,
      elapsed_seconds: Math.min(
        finiteInteger(raw.timer.elapsed_seconds),
        finiteInteger(options.timeCapSeconds)
      ),
      anchor_ms: raw.timer.state === 'running' && Number.isFinite(Number(raw.timer.anchor_ms))
        ? Number(raw.timer.anchor_ms)
        : null,
      time_cap_seconds: finiteInteger(options.timeCapSeconds)
    },
    scales,
    substitutions: raw.substitutions && typeof raw.substitutions === 'object'
      ? raw.substitutions
      : {},
    pending: raw.pending,
    sync_error: raw.sync_error ?? null,
    updated_at: raw.updated_at ?? fresh.updated_at
  };
}

export function currentCrossfitElapsed(state, nowMs = Date.now()) {
  const base = finiteInteger(state?.timer?.elapsed_seconds);
  if (state?.timer?.state !== 'running' || !Number.isFinite(Number(state.timer.anchor_ms))) return base;
  const delta = Math.max(0, Math.floor((nowMs - Number(state.timer.anchor_ms)) / 1000));
  return Math.min(base + delta, finiteInteger(state.timer.time_cap_seconds));
}

function eventIdentity(state, sequence) {
  return {
    request_id: `runtime_req_${state.stream_id}_${sequence}`,
    idempotency_key: `runtime_idem_${state.stream_id}_${sequence}`,
    stream_id: state.stream_id,
    client_sequence: sequence
  };
}

function withPending(state, kind, body, nowMs) {
  return {
    ...state,
    next_sequence: state.next_sequence + 1,
    pending: [...state.pending, { kind, body }],
    sync_error: null,
    updated_at: new Date(nowMs).toISOString()
  };
}

export function queueCrossfitTimerAction(state, action, nowMs = Date.now()) {
  const elapsed = currentCrossfitElapsed(state, nowMs);
  const actionMap = {
    start: state.timer.state === 'paused' ? 'timer_resumed' : 'timer_started',
    pause: 'timer_paused',
    reset: 'timer_reset'
  };
  const eventType = actionMap[action];
  if (!eventType) throw new TypeError(`Acción de timer no válida: ${action}`);
  if (action === 'start' && state.timer.state === 'running') return state;
  if (action === 'pause' && state.timer.state !== 'running') return state;

  const nextElapsed = action === 'reset' || eventType === 'timer_started' ? 0 : elapsed;
  const nextTimerState = action === 'reset' ? 'reset' : action === 'pause' ? 'paused' : 'running';
  const sequence = state.next_sequence;
  const body = {
    schema_version: CROSSFIT_RUNTIME_EVENT_VERSION,
    ...eventIdentity(state, sequence),
    event_type: eventType,
    occurred_at: new Date(nowMs).toISOString(),
    payload: {
      elapsed_seconds: nextElapsed,
      time_cap_seconds: state.timer.time_cap_seconds
    }
  };
  return withPending({
    ...state,
    timer: {
      ...state.timer,
      state: nextTimerState,
      elapsed_seconds: nextElapsed,
      anchor_ms: nextTimerState === 'running' ? nowMs : null
    }
  }, 'event', body, nowMs);
}

export function queueCrossfitSubstitution(state, {
  movementId,
  reason,
  checkIn = {},
  temporarilyUnavailableEquipment = [],
  requestedTargetId = null,
  nowMs = Date.now()
}) {
  const sequence = state.next_sequence;
  const body = {
    schema_version: CROSSFIT_SUBSTITUTION_VERSION,
    ...eventIdentity(state, sequence),
    occurred_at: new Date(nowMs).toISOString(),
    movement_id: String(movementId),
    requested_target_id: requestedTargetId,
    reason,
    check_in: checkIn,
    temporarily_unavailable_equipment: temporarilyUnavailableEquipment
  };
  return withPending(state, 'substitution', body, nowMs);
}

export function acknowledgeCrossfitRuntimeItem(state, idempotencyKey, response, nowMs = Date.now()) {
  const pending = state.pending.filter((item) => item.body.idempotency_key !== idempotencyKey);
  const substitution = response?.substitution;
  if (!substitution?.original_movement_id || !substitution?.replacement?.canonical_movement_id) {
    return { ...state, pending, sync_error: null, updated_at: new Date(nowMs).toISOString() };
  }
  const movementId = String(substitution.original_movement_id);
  return {
    ...state,
    pending,
    substitutions: { ...state.substitutions, [movementId]: substitution },
    scales: {
      ...state.scales,
      [movementId]: `substitution:${substitution.replacement.canonical_movement_id}`
    },
    sync_error: null,
    updated_at: new Date(nowMs).toISOString()
  };
}

export function discardRejectedCrossfitSubstitution(state, idempotencyKey, nowMs = Date.now()) {
  const rejected = state.pending.find((item) => item.body.idempotency_key === idempotencyKey);
  if (rejected?.kind !== 'substitution') return state;
  const startSequence = rejected.body.client_sequence;
  const remaining = state.pending
    .filter((item) => item.body.idempotency_key !== idempotencyKey)
    .map((item, index) => {
      const sequence = startSequence + index;
      return {
        ...item,
        body: {
          ...item.body,
          ...eventIdentity(state, sequence),
          client_sequence: sequence
        }
      };
    });
  return {
    ...state,
    next_sequence: startSequence + remaining.length,
    pending: remaining,
    updated_at: new Date(nowMs).toISOString()
  };
}

export function withCrossfitRuntimeSyncError(state, error, nowMs = Date.now()) {
  return {
    ...state,
    sync_error: {
      code: error?.code ?? 'CROSSFIT_RUNTIME_SYNC_PENDING',
      message: error?.message ?? 'Sincronización pendiente',
      retryable: error?.retryable !== false,
      safe_fallback: error?.safeFallback ?? null
    },
    updated_at: new Date(nowMs).toISOString()
  };
}
