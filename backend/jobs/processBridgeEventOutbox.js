/**
 * ⚙️ Worker del outbox entrenamiento→bridge (Nutrición Fase 0, doc04 PR5, spec §13.4/§13.5).
 *
 * Procesa `app.bridge_event_outbox` fuera del request del cierre de sesión, de forma
 * idempotente y desacoplada: una sesión queda completada aunque Nutrición esté caída.
 *
 * Algoritmo (§13.4):
 *  1. Recuperar locks caducados (processing → failed) antes de reclamar.
 *  2. Reclamar lote con FOR UPDATE SKIP LOCKED, marcar processing + attempts++.
 *  3. Validar contrato del evento.
 *  4. Sin perfil nutricional → `skipped` (NO_NUTRITION_PROFILE); nunca deshacer la sesión.
 *  5. Llamar al bridge con `source_event_id` vía `app.log_bridge_decision_v2(...)`.
 *  6. Una decisión por evento (el índice único de PR3 la garantiza).
 *  7. Marcar `completed`.
 *  8. Error temporal → `failed` + backoff exponencial.
 *  9. Tras N intentos → mantener `failed`, alertar; nunca bloquear entrenamiento.
 *
 * §13.5: "recalc_on_session = evaluar al completar", NO "cambiar kcal obligatoriamente".
 * En Fase 0 la consumición mínima es REGISTRAR una decisión idempotente (applied:false);
 * `auto_apply_minor_changes=false` sigue siendo el seguro. NO se amplía el bridge más allá
 * de pasarle el evento con `source_event_id` (encargo PR5, punto 6).
 *
 * GUARDA: el scheduler solo arranca si `BRIDGE_OUTBOX_WORKER_ENABLED=true`. Por defecto OFF,
 * para no activar comportamiento nuevo en prod sin decisión del arquitecto. Con el worker
 * apagado, el evento encolado es puramente aditivo y no cambia nada observable.
 */
import { validateTrainingLoad } from '../services/trainingLoad/trainingLoadContract.js';
import {
  SESSION_COMPLETED_CONTRACT_VERSION,
  claimBatch,
  reclaimStaleProcessing,
  markCompleted,
  markSkipped,
  markFailed
} from '../services/bridgeEventOutboxService.js';

export const HAS_NUTRITION_PROFILE_SQL =
  'SELECT 1 FROM app.nutrition_profiles WHERE user_id = $1 LIMIT 1';

// Llamada idempotente a la función V2 (source_event_id + contract_version) de PR3.
export const LOG_BRIDGE_DECISION_V2_SQL =
  'SELECT app.log_bridge_decision_v2($1,$2,$3,$4::jsonb,$5,$6,$7::jsonb,$8,$9,$10,$11) AS log_id';

const DEFAULTS = Object.freeze({
  batchSize: 20,
  staleSeconds: 300,
  maxAttempts: 5,
  baseBackoffSeconds: 30,
  maxBackoffSeconds: 3600,
  intervalMs: 60000
});

/** ¿Existe perfil nutricional del usuario? (inyectable para tests). */
async function defaultHasNutritionProfile(client, userId) {
  const res = await client.query(HAS_NUTRITION_PROFILE_SQL, [userId]);
  return res.rowCount > 0;
}

/** Registra la decisión del bridge de forma idempotente (inyectable para tests). */
async function defaultLogBridgeDecision(client, { userId, eventKey, trainingInputs, decisionDetails }) {
  const res = await client.query(LOG_BRIDGE_DECISION_V2_SQL, [
    userId,
    'training',                              // p_trigger_source
    'session_completed',                     // p_trigger_event
    JSON.stringify(trainingInputs ?? {}),    // p_training_inputs
    null,                                    // p_nutrition_inputs
    'session_completed',                     // p_decision_type
    JSON.stringify(decisionDetails ?? {}),   // p_decision_details
    null,                                    // p_applied_nutrition (§13.5: no aplica)
    null,                                    // p_applied_training
    eventKey,                                // p_source_event_id (idempotencia)
    SESSION_COMPLETED_CONTRACT_VERSION       // p_contract_version
  ]);
  return res.rows?.[0]?.log_id ?? null;
}

/**
 * Procesa UN evento reclamado. No lanza por reglas de negocio (perfil ausente / contrato
 * inválido → skipped); solo lanza ante error real de infraestructura (para backoff).
 * @returns {{status:'completed'|'skipped', reason?:string, decisionLogId?:number}}
 */
export async function handleSessionCompletedEvent(client, event, deps = {}) {
  const hasProfile = deps.hasNutritionProfile || defaultHasNutritionProfile;
  const logDecision = deps.logBridgeDecision || defaultLogBridgeDecision;

  const payload = event?.payload || {};
  // §13.4.3: validar contrato del evento (estructural). Inválido → skipped, no reintento.
  if (event?.contract_version !== SESSION_COMPLETED_CONTRACT_VERSION
      || payload.session_id === undefined || payload.session_id === null
      || event?.user_id === undefined || event?.user_id === null) {
    return { status: 'skipped', reason: 'INVALID_EVENT_CONTRACT' };
  }

  // La carga real se valida en modo lenient: nunca rompe; un contrato incompleto se degrada.
  const loadCheck = payload.actual_session_load
    ? validateTrainingLoad(payload.actual_session_load, { mode: 'lenient' })
    : null;

  // §13.4.4: sin perfil nutricional → skipped (nunca deshacer la sesión de entrenamiento).
  const profileExists = await hasProfile(client, event.user_id);
  if (!profileExists) {
    return { status: 'skipped', reason: 'NO_NUTRITION_PROFILE' };
  }

  // §13.4.5/§13.5: una decisión idempotente por evento; applied:false (evaluar, no forzar).
  const load = loadCheck?.load || payload.actual_session_load || payload.planned_session_load || {};
  const decisionLogId = await logDecision(client, {
    userId: event.user_id,
    eventKey: event.event_key,
    trainingInputs: {
      session_id: payload.session_id,
      methodology_id: payload.methodology_id,
      methodology_level: payload.methodology_level,
      final_status: payload.final_status,
      completion_rate: payload.completion_rate
    },
    decisionDetails: {
      source_event_id: event.event_key,
      methodology_id: payload.methodology_id ?? null,
      load_contract_version: load?.contract_version ?? null,
      day_type: load?.day_type ?? null,
      load_confidence: load?.provenance?.confidence ?? null,
      degraded: !!loadCheck?.degraded,
      reason_codes: ['SESSION_COMPLETED_INGESTED'],
      applied: false
    }
  });

  return { status: 'completed', decisionLogId };
}

/**
 * Ejecuta UNA pasada del worker sobre un lote. Devuelve un resumen de conteos.
 * @param {object} [opts]
 * @param {{connect:Function}} [opts.poolRef]
 */
export async function processOutboxBatch(opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  // Import perezoso de db.js: evita que importar handleSessionCompletedEvent en los tests
  // dispare la auto-conexión de db.js (testConnection() al cargar el módulo).
  const poolRef = opts.poolRef || (await import('../db.js')).pool;
  const workerId = opts.workerId || `outbox-${process.pid}`;

  const summary = { reclaimed: 0, claimed: 0, completed: 0, skipped: 0, failed: 0, terminal: 0 };
  const client = await poolRef.connect();
  try {
    // §13.4.10: recuperar locks caducados antes de reclamar.
    const reclaimed = await reclaimStaleProcessing(client, { staleSeconds: cfg.staleSeconds });
    summary.reclaimed = reclaimed.length;

    const events = await claimBatch(client, { batchSize: cfg.batchSize, workerId });
    summary.claimed = events.length;

    for (const event of events) {
      try {
        const result = await handleSessionCompletedEvent(client, event, opts.deps || {});
        if (result.status === 'skipped') {
          await markSkipped(client, event.id, result.reason);
          summary.skipped += 1;
        } else {
          await markCompleted(client, event.id);
          summary.completed += 1;
        }
      } catch (err) {
        const { terminal } = await markFailed(client, event.id, {
          error: err,
          attempts: Number(event.attempts) || 1,
          maxAttempts: cfg.maxAttempts,
          baseSeconds: cfg.baseBackoffSeconds,
          maxSeconds: cfg.maxBackoffSeconds
        });
        summary.failed += 1;
        if (terminal) {
          summary.terminal += 1;
          // §13.4.9: alerta tras agotar intentos; NO se bloquea el entrenamiento.
          console.error(`🚨 [bridgeOutbox] Evento ${event.event_key} agotó reintentos (${event.attempts}); queda failed. Último error: ${err?.message || err}`);
        } else {
          console.warn(`⚠️ [bridgeOutbox] Evento ${event.event_key} falló (intento ${event.attempts}); reintento con backoff. ${err?.message || err}`);
        }
      }
    }
    return summary;
  } finally {
    client.release();
  }
}

/**
 * Arranca el scheduler del worker (setInterval + advisory lock). GUARDA por env:
 * solo corre si `BRIDGE_OUTBOX_WORKER_ENABLED=true`. Devuelve { enabled, stop }.
 */
export function startBridgeEventOutboxWorker(options = {}) {
  const enabled = String(process.env.BRIDGE_OUTBOX_WORKER_ENABLED || 'false').toLowerCase() === 'true';
  if (!enabled) {
    console.log('⏸️  [bridgeOutbox] Worker DESACTIVADO (BRIDGE_OUTBOX_WORKER_ENABLED != true).');
    return { enabled: false, stop: () => {} };
  }

  const intervalMs = Number(options.intervalMs) || DEFAULTS.intervalMs;
  console.log(`▶️  [bridgeOutbox] Worker activado; intervalo ${intervalMs}ms.`);

  const tick = async () => {
    try {
      // Import perezoso (advisoryLock importa db.js): mantiene el grafo estático libre de db.js.
      const { withAdvisoryLock, LOCK_KEYS } = await import('../utils/advisoryLock.js');
      // OPS-001: en multi-instancia, solo una réplica procesa el lote.
      await withAdvisoryLock(LOCK_KEYS.bridgeEventOutbox, 'bridgeEventOutbox', () => processOutboxBatch(options));
    } catch (err) {
      console.error('❌ [bridgeOutbox] Error en pasada del worker:', err?.message || err);
    }
  };

  const handle = setInterval(tick, intervalMs);
  if (typeof handle.unref === 'function') handle.unref();

  return {
    enabled: true,
    stop: () => clearInterval(handle)
  };
}

// Ejecución manual desde CLI (una pasada), útil para operaciones puntuales.
if (import.meta.url === `file://${process.argv[1]}`) {
  processOutboxBatch()
    .then((s) => { console.log('bridgeOutbox summary:', s); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}

export default { processOutboxBatch, startBridgeEventOutboxWorker, handleSessionCompletedEvent };
