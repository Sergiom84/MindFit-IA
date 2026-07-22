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

import { normalizeMethodologyId } from './routineGeneration/methodologies/methodologyRegistry.js';

export const OUTBOX_EVENT_TYPE_SESSION_COMPLETED = 'training.session_completed';
export const SESSION_COMPLETED_CONTRACT_VERSION = 'training-session-event/v1';

// ── COR-F0-06: emisión controlada por flag INDEPENDIENTE del worker ───────────────
// El worker (BRIDGE_OUTBOX_WORKER_ENABLED) sigue apagado por defecto. Emitir SIEMPRE con el
// consumidor apagado produciría backlog indefinido sin control (contradicción señalada por la
// auditoría). Por eso la EMISIÓN tiene su propio flag, por defecto en estado SEGURO (off): con
// ambos apagados no se encola nada y el comportamiento observable es el baseline. Para el E2E o
// el arranque de la integración se enciende primero la emisión (el backlog con worker pausado es
// ENTONCES esperado y acotado) y después el worker, que drena. Ver docs/NUTRICION-FASE0-ACTIVACION.md.
export const OUTBOX_EMIT_ENABLED_ENV = 'BRIDGE_OUTBOX_EMIT_ENABLED';

/** ¿Está habilitada la EMISIÓN de eventos de cierre al outbox? Por defecto NO (fail-closed). */
export function isOutboxEmissionEnabled(env = process.env) {
  return String(env?.[OUTBOX_EMIT_ENABLED_ENV] ?? 'false').toLowerCase() === 'true';
}

// ── COR-F0-02: resolución de metodología, nivel y duración de la sesión ────────────
function stripDiacritics(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Niveles canónicos soportados por el registro (§7). Un valor desconocido NO pasa como válido.
const CANONICAL_LEVELS = new Set(['principiante', 'intermedio', 'avanzado', 'elite']);
// Alias históricos explícitos. El default de columna es 'básico' → 'principiante' (nivel de entrada).
const LEVEL_ALIASES = Object.freeze({
  basico: 'principiante',
  basica: 'principiante',
  beginner: 'principiante',
  principiante: 'principiante',
  intermedio: 'intermedio',
  intermediate: 'intermedio',
  avanzado: 'avanzado',
  advanced: 'avanzado',
  elite: 'elite'
});

/**
 * Normaliza un nivel histórico a su forma canónica en minúsculas y sin acentos.
 * `básico`/`basico` → `principiante` (alias documentado). Desconocido/arbitrario → null
 * (COR-F0-02 §6: no se hace pasar un valor arbitrario como nivel real).
 * @param {*} value
 * @returns {string|null}
 */
export function normalizeMethodologyLevel(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const key = stripDiacritics(value).toLowerCase().trim();
  if (!key) return null;
  if (LEVEL_ALIASES[key]) return LEVEL_ALIASES[key];
  if (CANONICAL_LEVELS.has(key)) return key;
  return null;
}

/**
 * Resuelve el nivel de la sesión en orden (COR-F0-02 §5): carga planificada válida →
 * `session.methodology_level` → metadata legacy normalizada → null (solo si de verdad no hay).
 * @returns {string|null}
 */
export function resolveMethodologyLevel({ plannedLevel = null, sessionLevel = null, metadataLevel = null } = {}) {
  for (const candidate of [plannedLevel, sessionLevel, metadataLevel]) {
    const norm = normalizeMethodologyLevel(candidate);
    if (norm) return norm;
  }
  return null;
}

/**
 * Resuelve el ID canónico de la metodología del evento. `home` (Casa) mapea a `casa`
 * (namespace legacy). Cualquier otra desconocida → null.
 * @returns {string|null}
 */
export function resolveEventMethodologyId(methodologyType, { keyNamespace = null } = {}) {
  return normalizeMethodologyId(methodologyType) || (keyNamespace === 'home' ? 'casa' : null);
}

/**
 * COR-F0-02 §4/§7: Hipertrofia e Hipertrofia V2 (y cualquier metodología no registrada ni
 * mapeada como namespace legacy) NO deben emitir un contrato con `methodology_id=null`. Solo se
 * encola cuando hay un ID canónico resuelto.
 * @param {string|null} methodologyId
 * @returns {boolean}
 */
export function shouldEmitSessionCompleted(methodologyId) {
  return typeof methodologyId === 'string' && methodologyId.length > 0;
}

/**
 * Duración real de la sesión desde una fuente inequívoca (COR-F0-02 §2/§4):
 *  - valor medido `total_duration_seconds` SOLO si es > 0 (el 0 inicial NO es una medición real);
 *  - si no, `completed_at - started_at` (o `now - started_at` si aún no hay `completed_at`);
 *  - si no hay ninguna fuente fiable → null (nunca se inventan minutos).
 * @returns {number|null} segundos, o null.
 */
export function resolveSessionDurationSeconds({
  totalDurationSeconds = null,
  startedAt = null,
  completedAt = null,
  now = Date.now()
} = {}) {
  const measured = Number(totalDurationSeconds);
  if (Number.isFinite(measured) && measured > 0) return Math.round(measured);

  const startMs = startedAt ? new Date(startedAt).getTime() : NaN;
  if (Number.isFinite(startMs)) {
    const endMs = completedAt ? new Date(completedAt).getTime() : now;
    if (Number.isFinite(endMs) && endMs >= startMs) return Math.round((endMs - startMs) / 1000);
  }
  return null;
}

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
  OUTBOX_EMIT_ENABLED_ENV,
  isOutboxEmissionEnabled,
  normalizeMethodologyLevel,
  resolveMethodologyLevel,
  resolveEventMethodologyId,
  shouldEmitSessionCompleted,
  resolveSessionDurationSeconds,
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
