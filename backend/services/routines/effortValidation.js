/**
 * Validación pura de los rangos del modal de esfuerzo (S6).
 *
 * El endpoint POST /routines/sessions/:sessionId/effort validaba ownership pero NO
 * los rangos de avgRir/rpe: un avgRir=99 o rpe=99 entraba a la autorregulación tal
 * cual. Esta función es pura (sin BD) y la reutiliza el handler para responder 422
 * ante valores fuera de rango, sin tocar el shape del caso de éxito.
 *
 * Rangos: avgRir ∈ [0, 5] (repeticiones en reserva), rpe ∈ [0, 10] (esfuerzo percibido).
 * Ambos son OPCIONALES: ausentes/null/undefined => válido (el feeling subjetivo basta).
 */

const RANGES = Object.freeze({
  avgRir: { min: 0, max: 5, label: 'avgRir' },
  rpe: { min: 0, max: 10, label: 'rpe' }
});

function checkField(value, { min, max, label }) {
  if (value === undefined || value === null || value === '') return null; // opcional
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) {
    return `${label} fuera de rango [${min}, ${max}]`;
  }
  return null;
}

/**
 * @param {{avgRir?: number|string|null, rpe?: number|string|null}} input
 * @returns {{valid: boolean, error?: string}}
 */
export function validateEffortInput({ avgRir, rpe } = {}) {
  const error = checkField(avgRir, RANGES.avgRir) || checkField(rpe, RANGES.rpe);
  return error ? { valid: false, error } : { valid: true };
}
