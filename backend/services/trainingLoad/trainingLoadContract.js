/**
 * 📐 Contrato puro `training-load/v1` (Nutrición Fase 0, doc 04 PR2, spec §8).
 *
 * Nutrición NO debe inferir la demanda a partir del NOMBRE de la metodología: recibe una
 * descripción de la sesión. Este módulo es INFRAESTRUCTURA (sin consumidores todavía):
 * valida la forma del contrato, construye una carga conservadora cuando faltan datos
 * (con `null`, nunca números inventados) y clasifica el tipo de día por COHERENCIA, no por
 * umbrales clínicos universales (cada motor decide su tipo con reglas versionadas).
 *
 * strict:  un motor nuevo no puede confirmar un plan con contrato inválido → { valid:false }.
 * lenient: un plan histórico inválido se degrada a D1 de baja confianza + auditoría; nunca
 *          se rompe el calendario del usuario → { valid:true, degraded:true }.
 */
import { isKnownMethodology, normalizeMethodologyId } from '../routineGeneration/methodologies/methodologyRegistry.js';

export const TRAINING_LOAD_CONTRACT_VERSION = 'training-load/v1';
const DAY_TYPES = ['D0', 'D1', 'D2'];
const LOAD_TIERS = ['rest', 'low', 'moderate', 'high', 'very_high'];
const STATUSES = ['planned', 'completed'];
const CONFIDENCE = ['low', 'medium', 'high'];

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v) => (isFiniteNumber(v) ? v : (isFiniteNumber(Number(v)) && v !== null && v !== '' ? Number(v) : null));

/** Comprueba un RPE opcional: si está presente debe ser número en [0,10]. */
function rpeError(field, value) {
  if (value === null || value === undefined) return null;
  if (!isFiniteNumber(value) || value < 0 || value > 10) return `${field} fuera de rango 0-10`;
  return null;
}

/** Comprueba una duración opcional: si está presente debe ser número >= 0. */
function durationError(field, value) {
  if (value === null || value === undefined) return null;
  if (!isFiniteNumber(value) || value < 0) return `${field} inválida (negativa o no numérica)`;
  return null;
}

/**
 * Clasifica el tipo de día por COHERENCIA de la carga (no por nombre de metodología).
 *  - `rest` → D0. Test/competición o carga alta/muy alta → D2. Resto → D1.
 * @param {object} load
 * @returns {'D0'|'D1'|'D2'}
 */
export function classifyDayType(load) {
  const tier = load?.load_tier;
  const ctx = load?.context || {};
  if (tier === 'rest') return 'D0';
  if (ctx.test === true || ctx.competition === true) return 'D2';
  if (tier === 'high' || tier === 'very_high') return 'D2';
  return 'D1';
}

/**
 * Valida un contrato de carga.
 * @param {object} input
 * @param {{mode?: 'strict'|'lenient'}} [opts]
 * @returns {{valid:boolean, mode:string, errors:string[], load?:object, degraded?:boolean, audit?:string[]}}
 */
export function validateTrainingLoad(input, { mode = 'strict' } = {}) {
  const errors = [];
  const i = input || {};

  if (i.contract_version !== TRAINING_LOAD_CONTRACT_VERSION) {
    errors.push(`contract_version debe ser ${TRAINING_LOAD_CONTRACT_VERSION}`);
  }
  // §8.3 + §17.1: methodology_id debe existir en el registro (nunca cae a Hipertrofia).
  if (!i.methodology_id || !isKnownMethodology(i.methodology_id)) {
    errors.push('methodology_id desconocido (no está en el registro canónico)');
  }
  if (typeof i.methodology_level !== 'string' || i.methodology_level.trim() === '') {
    errors.push('methodology_level requerido');
  }
  if (typeof i.session_type !== 'string' || i.session_type.trim() === '') {
    errors.push('session_type requerido (string no vacío)');
  }
  if (!STATUSES.includes(i.status)) errors.push('status debe ser planned o completed');
  if (!DAY_TYPES.includes(i.day_type)) errors.push('day_type debe ser D0, D1 o D2');
  if (!LOAD_TIERS.includes(i.load_tier)) errors.push('load_tier inválido');
  if (!i.provenance || typeof i.provenance.source !== 'string' || i.provenance.source.trim() === '') {
    errors.push('provenance.source requerido');
  }
  if (!i.provenance || !CONFIDENCE.includes(i.provenance.confidence)) {
    errors.push('provenance.confidence debe ser low, medium o high');
  }

  // Opcionales: si están presentes deben ser válidos; ausentes → null (no se inventan).
  const rpeT = rpeError('effort.rpe_target', i.effort?.rpe_target);
  const rpeA = rpeError('effort.rpe_actual', i.effort?.rpe_actual);
  if (rpeT) errors.push(rpeT);
  if (rpeA) errors.push(rpeA);
  const durP = durationError('duration.planned_min', i.duration?.planned_min);
  const durA = durationError('duration.actual_min', i.duration?.actual_min);
  if (durP) errors.push(durP);
  if (durA) errors.push(durA);

  // §8.5: coherencia día↔carga. D0 exige descanso; D2 no puede ir con load_tier bajo.
  if (i.day_type === 'D0' && i.load_tier && i.load_tier !== 'rest') {
    errors.push('D0 incoherente: exige load_tier=rest');
  }
  if (i.day_type === 'D2' && (i.load_tier === 'low' || i.load_tier === 'rest')) {
    errors.push('D2 incoherente con load_tier bajo (§8.5): debe rechazarse o degradarse a D1');
  }

  if (errors.length === 0) {
    return { valid: true, mode, errors: [], load: i };
  }

  if (mode === 'lenient') {
    // §8.7/§17.2.6: no se rompe el calendario; se degrada a D1 baja confianza + auditoría.
    const degraded = buildConservativeTrainingLoad(i);
    return { valid: true, degraded: true, mode: 'lenient', errors, audit: errors, load: degraded };
  }

  return { valid: false, mode: 'strict', errors };
}

/**
 * Construye una carga conservadora: D1, baja confianza, `null` donde no se conoce el dato
 * (§8.4: no inventar 60 min, RPE 7 ni 75 kg). Útil para planes históricos en lenient.
 * @param {object} context
 * @returns {object}
 */
export function buildConservativeTrainingLoad(context = {}) {
  const methodologyId = normalizeMethodologyId(context.methodology_id);
  const loadTier = LOAD_TIERS.includes(context.load_tier) && context.load_tier !== 'rest'
    ? context.load_tier
    : 'moderate';
  return {
    contract_version: TRAINING_LOAD_CONTRACT_VERSION,
    methodology_id: methodologyId,
    methodology_level: typeof context.methodology_level === 'string' && context.methodology_level.trim()
      ? context.methodology_level
      : null,
    session_type: typeof context.session_type === 'string' && context.session_type.trim()
      ? context.session_type
      : 'unknown',
    status: STATUSES.includes(context.status) ? context.status : 'planned',
    day_type: 'D1',
    load_tier: loadTier,
    duration: {
      planned_min: numOrNull(context?.duration?.planned_min),
      actual_min: numOrNull(context?.duration?.actual_min)
    },
    effort: {
      rpe_target: rpeError('x', context?.effort?.rpe_target) ? null : (context?.effort?.rpe_target ?? null),
      rpe_actual: rpeError('x', context?.effort?.rpe_actual) ? null : (context?.effort?.rpe_actual ?? null)
    },
    work: {
      sets_total: null, hard_sets: null, reps_total: null,
      volume_kg: null, work_interval_min: null, distance_m: null
    },
    demand: { glycolytic: null, neuromuscular: null, aerobic: null, skill: null },
    recovery: { hours_to_next_session: null, hours_to_next_hard_session: null, double_session_day: false },
    environment: { heat: false, humidity_high: false, protective_gear: false, altitude: false },
    context: { deload: false, taper: false, test: false, competition: false, injury_modified: false },
    provenance: { source: 'conservative_fallback', confidence: 'low', rule_ids: [] }
  };
}

/**
 * Fusiona los datos reales de la sesión completada sobre el contrato planificado.
 * NO reescribe la dieta ya consumida; solo añade lo real (§8.6).
 * @param {object} planned
 * @param {object} actual
 * @returns {object}
 */
export function mergeActualSessionLoad(planned = {}, actual = {}) {
  return {
    ...planned,
    status: 'completed',
    duration: {
      planned_min: planned?.duration?.planned_min ?? null,
      actual_min: numOrNull(actual?.duration?.actual_min ?? actual?.actual_min)
    },
    effort: {
      rpe_target: planned?.effort?.rpe_target ?? null,
      rpe_actual: (actual?.effort?.rpe_actual ?? actual?.rpe_actual) ?? null
    },
    work: { ...(planned.work || {}), ...(actual.work || {}) },
    provenance: {
      source: 'session_completion',
      confidence: actual?.provenance?.confidence || planned?.provenance?.confidence || 'high',
      rule_ids: [
        ...((planned?.provenance?.rule_ids) || []),
        ...((actual?.provenance?.rule_ids) || [])
      ]
    }
  };
}

/**
 * Resumen legible/explicable de una carga (para observabilidad y explicación al usuario).
 * @param {object} load
 * @returns {object}
 */
export function summarizeTrainingLoad(load = {}) {
  return {
    methodology_id: load.methodology_id ?? null,
    day_type: load.day_type ?? null,
    coherent_day_type: classifyDayType(load),
    load_tier: load.load_tier ?? null,
    status: load.status ?? null,
    confidence: load.provenance?.confidence ?? null,
    planned_min: load.duration?.planned_min ?? null,
    rpe_target: load.effort?.rpe_target ?? null
  };
}
