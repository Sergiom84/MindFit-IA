/**
 * 🏗️ Constructor de carga de sesión (Nutrición Fase 0, doc04 PR3, spec §9/§12/§15.1).
 *
 * INFRAESTRUCTURA pura y sin efectos: extrae la carga planificada (`training-load/v1`)
 * que un motor de metodología pueda adjuntar a una sesión del plan y construye el JSON
 * que persiste `methodology_plan_days.metadata` (§9.1). En Fase 0 ningún motor emite
 * carga todavía (`emits_training_load:false` en el registro), así que lo normal es que
 * `extractPlannedSessionLoad` devuelva `null` y no se escriba metadata: el canal queda
 * cableado para cuando cada metodología cumpla sus pruebas.
 *
 * No inventa datos: si la sesión no trae carga, no se fabrica ninguna (§8.4).
 */
import { validateTrainingLoad } from './trainingLoadContract.js';

/**
 * Devuelve la carga planificada bruta que la sesión del plan pueda transportar, o `null`.
 * Acepta varias ubicaciones por compatibilidad con futuros motores; no infiere nada.
 * @param {object} session - Sesión del plan (semana.sesiones[i]).
 * @returns {object|null}
 */
export function extractPlannedSessionLoad(session) {
  if (!session || typeof session !== 'object') return null;
  const raw = session.session_load
    ?? session.sessionLoad
    ?? (session.metadata && typeof session.metadata === 'object' ? session.metadata.session_load : null)
    ?? null;
  return raw && typeof raw === 'object' ? raw : null;
}

/**
 * Construye el objeto `metadata` para `methodology_plan_days` a partir de una sesión.
 * - Sin carga → `null` (no se persiste metadata; la columna queda NULL).
 * - Con carga → `{ session_load, load_contract_status }` (§9.1). La validación es
 *   `lenient`: un contrato histórico/incompleto se degrada a D1 baja confianza y se marca
 *   `degraded`, pero nunca rompe la materialización del calendario.
 * @param {object} session
 * @returns {{ session_load: object, load_contract_status: 'valid'|'degraded' }|null}
 */
export function buildPlanDayMetadata(session) {
  const raw = extractPlannedSessionLoad(session);
  if (!raw) return null;
  const result = validateTrainingLoad(raw, { mode: 'lenient' });
  return {
    session_load: result.load,
    load_contract_status: result.degraded ? 'degraded' : 'valid'
  };
}

/**
 * Query canónica §12.1 para leer el calendario enriquecido con la carga del día.
 * El join se hace por `day_id` (no por fecha ni por títulos): PR3 puebla ese `day_id`
 * en filas nuevas (ensureScheduleV3) e históricas (backfill de la migración). El
 * consumidor real (nutrition-v2/generate-plan) llega en PR4; aquí se fija su forma para
 * que el canal de datos quede probado antes de cambiar cálculos.
 */
export const SCHEDULE_WITH_LOAD_QUERY = `
SELECT
  ws.scheduled_date,
  ws.day_id,
  ws.session_title,
  mpd.metadata -> 'session_load' AS session_load
FROM app.workout_schedule ws
LEFT JOIN app.methodology_plan_days mpd
  ON mpd.plan_id = ws.methodology_plan_id
 AND mpd.day_id = ws.day_id
WHERE ws.methodology_plan_id = $1
  AND ws.user_id = $2
  AND ws.scheduled_date BETWEEN $3 AND $4
ORDER BY ws.scheduled_date`;
