/**
 * 📤 Outbox de eventos entrenamiento→bridge (Nutrición Fase 0, doc04 PR5, spec §9.5/§13).
 *
 * El entrenamiento debe quedar COMPLETADO aunque Nutrición esté caída: el cierre encola un
 * evento idempotente en `app.bridge_event_outbox` (tabla creada por la migración de PR3, ya
 * en prod) DENTRO de su misma transacción, y un worker lo procesa después, fuera del request.
 *
 * Este módulo es infraestructura pura de cola. No decide dieta ni toca la máquina de estados.
 * Todas las funciones que tocan BD reciben un `client`/`pool` inyectado → testeables con mocks.
 *
 * Idempotencia:
 *  - `event_key` UNIQUE (`training.session_completed:v1:<sessionId>`): dos cierres idénticos
 *    producen UN solo evento (ON CONFLICT DO NOTHING).
 *  - Reclamo con `FOR UPDATE SKIP LOCKED`: dos workers nunca procesan el mismo evento.
 *  - Recuperación de locks caducados: un worker muerto no deja eventos bloqueados para siempre.
 */

export const OUTBOX_EVENT_TYPE_SESSION_COMPLETED = 'training.session_completed';
export const SESSION_COMPLETED_CONTRACT_VERSION = 'training-session-event/v1';

// Namespace de `event_key`. La sesión de metodología usa el formato exacto de la spec §13.2;
// la sesión de Casa se namespacea con `:home:` para que NUNCA colisione con un id de sesión de
// metodología (ambas tablas tienen espacios de id independientes). La idempotencia por doble
// cierre se conserva en ambos casos (misma clave para el mismo cierre). Ver informe PR5.
export function buildSessionCompletedEventKey(sessionId, { namespace = null } = {}) {
  const scope = namespace ? `${namespace}:` : '';
  return `${OUTBOX_EVENT_TYPE_SESSION_COMPLETED}:v1:${scope}${sessionId}`;
}

/**
 * Construye el evento `training.session_completed` (§13.2). Función pura.
 * @returns {{event_key:string, event_type:string, contract_version:string, user_id:number, payload:object}}
 */
export function buildSessionCompletedEvent({
  sessionId,
  userId,
  methodologyPlanId = null,
  methodologyId = null,
  methodologyLevel = null,
  completedAt = null,
  finalStatus = null,
  completionRate = null,
  plannedSessionLoad = null,
  actualSessionLoad = null,
  keyNamespace = null
} = {}) {
  return {
    event_key: buildSessionCompletedEventKey(sessionId, { namespace: keyNamespace }),
    event_type: OUTBOX_EVENT_TYPE_SESSION_COMPLETED,
    contract_version: SESSION_COMPLETED_CONTRACT_VERSION,
    user_id: userId,
    payload: {
      session_id: sessionId,
      methodology_plan_id: methodologyPlanId,
      methodology_id: methodologyId,
      methodology_level: methodologyLevel,
      completed_at: completedAt,
      final_status: finalStatus,
      completion_rate: completionRate,
      planned_session_load: plannedSessionLoad,
      actual_session_load: actualSessionLoad
    }
  };
}

// ── SQL (exportado para pruebas de forma) ────────────────────────────────────────
export const ENQUEUE_SQL = `
INSERT INTO app.bridge_event_outbox
  (event_key, user_id, event_type, contract_version, payload)
VALUES ($1, $2, $3, $4, $5::jsonb)
ON CONFLICT (event_key) DO NOTHING
RETURNING id`;

// Reclamo atómico: bloquea filas disponibles con SKIP LOCKED y las marca `processing`.
export const CLAIM_BATCH_SQL = `
WITH claimable AS (
  SELECT id
    FROM app.bridge_event_outbox
   WHERE status IN ('pending', 'failed')
     AND available_at <= NOW()
   ORDER BY available_at, created_at
   LIMIT $1
   FOR UPDATE SKIP LOCKED
)
UPDATE app.bridge_event_outbox o
   SET status = 'processing',
       locked_at = NOW(),
       worker_id = $2,
       attempts = o.attempts + 1,
       updated_at = NOW()
  FROM claimable c
 WHERE o.id = c.id
 RETURNING o.*`;

// Recupera eventos `processing` cuyo lock caducó (worker muerto) → `failed` reclaimable.
export const RECLAIM_STALE_SQL = `
UPDATE app.bridge_event_outbox
   SET status = 'failed',
       locked_at = NULL,
       last_error = COALESCE(last_error, '') || ' [stale_lock_recovered]',
       updated_at = NOW()
 WHERE status = 'processing'
   AND locked_at IS NOT NULL
   AND locked_at < NOW() - make_interval(secs => $1)
 RETURNING id`;

export const MARK_COMPLETED_SQL = `
UPDATE app.bridge_event_outbox
   SET status = 'completed',
       processed_at = NOW(),
       locked_at = NULL,
       last_error = NULL,
       updated_at = NOW()
 WHERE id = $1
 RETURNING id`;

export const MARK_SKIPPED_SQL = `
UPDATE app.bridge_event_outbox
   SET status = 'skipped',
       processed_at = NOW(),
       locked_at = NULL,
       last_error = $2,
       updated_at = NOW()
 WHERE id = $1
 RETURNING id`;

// Backoff: `available_at` se empuja al futuro; si se agotan intentos, se aleja "para siempre".
export const MARK_FAILED_SQL = `
UPDATE app.bridge_event_outbox
   SET status = 'failed',
       locked_at = NULL,
       last_error = $2,
       available_at = NOW() + make_interval(secs => $3),
       updated_at = NOW()
 WHERE id = $1
 RETURNING id, attempts, status`;

/**
 * Backoff exponencial acotado. Al agotar `maxAttempts`, devuelve un retraso "terminal"
 * (100 años) para que el evento fallido no se vuelva a reclamar; queda `failed` para alerta.
 * Función pura.
 * @returns {{ delaySeconds:number, terminal:boolean }}
 */
export function computeBackoffSeconds(attempts, {
  baseSeconds = 30,
  maxSeconds = 3600,
  maxAttempts = 5
} = {}) {
  if (attempts >= maxAttempts) {
    return { delaySeconds: 60 * 60 * 24 * 365 * 100, terminal: true };
  }
  const raw = baseSeconds * Math.pow(2, Math.max(0, attempts - 1));
  return { delaySeconds: Math.min(maxSeconds, raw), terminal: false };
}

/**
 * Encola un evento (idempotente). Devuelve { inserted } — inserted:false si ya existía.
 * @param {{query:Function}} client
 * @param {object} event
 */
export async function enqueueEvent(client, event) {
  const res = await client.query(ENQUEUE_SQL, [
    event.event_key,
    event.user_id,
    event.event_type,
    event.contract_version,
    JSON.stringify(event.payload ?? {})
  ]);
  return { inserted: res.rowCount > 0, id: res.rows?.[0]?.id ?? null };
}

/** Reclama un lote marcándolo `processing`. Devuelve las filas reclamadas. */
export async function claimBatch(client, { batchSize = 20, workerId = 'worker' } = {}) {
  const res = await client.query(CLAIM_BATCH_SQL, [batchSize, workerId]);
  return res.rows || [];
}

/** Devuelve a `failed` los eventos `processing` con lock caducado. */
export async function reclaimStaleProcessing(client, { staleSeconds = 300 } = {}) {
  const res = await client.query(RECLAIM_STALE_SQL, [staleSeconds]);
  return res.rows?.map((r) => r.id) || [];
}

export async function markCompleted(client, id) {
  await client.query(MARK_COMPLETED_SQL, [id]);
}

export async function markSkipped(client, id, reason) {
  await client.query(MARK_SKIPPED_SQL, [id, reason || null]);
}

/**
 * Marca `failed` aplicando backoff. `attempts` es el nº de intentos YA consumidos (tras el
 * incremento del reclamo). Devuelve { terminal } para que el worker pueda alertar.
 */
export async function markFailed(client, id, {
  error = null,
  attempts = 1,
  maxAttempts = 5,
  baseSeconds = 30,
  maxSeconds = 3600
} = {}) {
  const { delaySeconds, terminal } = computeBackoffSeconds(attempts, {
    baseSeconds, maxSeconds, maxAttempts
  });
  const message = typeof error === 'string' ? error : (error?.message || String(error || 'error'));
  await client.query(MARK_FAILED_SQL, [id, message.slice(0, 2000), delaySeconds]);
  return { terminal };
}

export default {
  OUTBOX_EVENT_TYPE_SESSION_COMPLETED,
  SESSION_COMPLETED_CONTRACT_VERSION,
  buildSessionCompletedEventKey,
  buildSessionCompletedEvent,
  computeBackoffSeconds,
  enqueueEvent,
  claimBatch,
  reclaimStaleProcessing,
  markCompleted,
  markSkipped,
  markFailed
};
