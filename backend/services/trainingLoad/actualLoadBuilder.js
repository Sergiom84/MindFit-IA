/**
 * 🏗️ Constructor de CARGA REAL de sesión (Nutrición Fase 0, doc04 PR5, spec §13.3).
 *
 * Toma los datos que YA existen al cerrar una sesión (duración real, series completadas,
 * estado/completitud, metodología/nivel) y construye el contrato `training-load/v1` con
 * `status:'completed'`, fusionándolo sobre el planificado mediante `mergeActualSessionLoad`
 * del contrato PR2. NO reescribe la dieta ya consumida (§8.6): solo describe lo real.
 *
 * Reglas duras (§13.3):
 *  - NO se suman strings de repeticiones como números. Las repeticiones del catálogo son
 *    strings ("12,10,8", "8-12", "AMRAP"…) → `reps_total` queda `null` SIEMPRE.
 *  - Solo se agregan series completadas si son numéricas; un dato no parseable NO se inventa,
 *    baja la confianza.
 *  - Duración ausente → `null` (no se fabrican 60 min).
 *  - RPE/RIR: en Fase 0 no hay fuente fiable en el cierre → `rpe_actual` queda `null`.
 *  - Si no hay carga planificada (lo normal en Fase 0), se parte de una base conservadora
 *    (D1, baja confianza) con la metodología/nivel reales normalizados por el registro.
 */
import {
  buildConservativeTrainingLoad,
  mergeActualSessionLoad
} from './trainingLoadContract.js';

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Agrega las series REALMENTE completadas sumando solo valores numéricos.
 * @param {Array<object>} exerciseRows filas de methodology_exercise_progress
 * @returns {{ setsTotal: number|null, parseIssue: boolean }}
 */
export function aggregateCompletedSets(exerciseRows = []) {
  if (!Array.isArray(exerciseRows) || exerciseRows.length === 0) {
    return { setsTotal: null, parseIssue: false };
  }
  let sum = 0;
  let any = false;
  let parseIssue = false;
  for (const row of exerciseRows) {
    const raw = row?.series_completed;
    if (raw === null || raw === undefined || raw === '') continue;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(n)) {
      sum += n;
      any = true;
    } else {
      // Dato presente pero no parseable: no se inventa; se anota para bajar confianza.
      parseIssue = true;
    }
  }
  return { setsTotal: any ? sum : null, parseIssue };
}

/**
 * Construye el contrato de carga REAL de una sesión completada.
 *
 * @param {object} params
 * @param {object|null} [params.plannedLoad]     Carga planificada (session_metadata.planned_session_load) o null.
 * @param {string|null} [params.methodologyId]   ID canónico ya normalizado (o valor a normalizar por el fallback).
 * @param {string|null} [params.methodologyLevel]
 * @param {number|null} [params.durationSeconds] Duración real en segundos (total_duration_seconds o NOW-started_at).
 * @param {Array<object>} [params.exerciseRows]  Filas de progreso por ejercicio.
 * @returns {object} contrato training-load/v1 con status:'completed'.
 */
export function buildActualSessionLoad({
  plannedLoad = null,
  methodologyId = null,
  methodologyLevel = null,
  durationSeconds = null,
  exerciseRows = []
} = {}) {
  const actualMin = isFiniteNumber(durationSeconds) && durationSeconds >= 0
    ? Math.round(durationSeconds / 60)
    : null;

  const { setsTotal, parseIssue } = aggregateCompletedSets(exerciseRows);

  // Confianza: alta solo si tenemos duración Y series; degrada si falta o no parsea.
  let confidence = 'high';
  if (actualMin === null || setsTotal === null) confidence = 'medium';
  if (parseIssue || (actualMin === null && setsTotal === null)) confidence = 'low';

  const base = (plannedLoad && typeof plannedLoad === 'object')
    ? plannedLoad
    : buildConservativeTrainingLoad({
      methodology_id: methodologyId,
      methodology_level: methodologyLevel,
      status: 'completed'
    });

  const actual = {
    duration: { actual_min: actualMin },
    effort: { rpe_actual: null },
    // reps_total NO se incluye a propósito: no se suman strings de repeticiones (§13.3).
    work: { sets_total: setsTotal },
    provenance: { confidence, rule_ids: ['LOAD-ACTUAL-V1'] }
  };

  return mergeActualSessionLoad(base, actual);
}

export default { buildActualSessionLoad, aggregateCompletedSets };
