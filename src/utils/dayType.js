/**
 * Normalización canónica del tipo de día nutricional (Fase 0, COR-F0-01) — frontend.
 *
 * Equivalente a `backend/services/trainingLoad/dayType.js`. Única fuente en el cliente
 * para interpretar `tipo_dia`: `entreno`, `entreno_normal` y `entreno_alto` son días de
 * entrenamiento; cualquier otro valor es descanso. Evita que un día `entreno_alto` se
 * pinte como descanso en el calendario o en el detalle.
 */

export const TRAINING_DAY_TYPES = ['entreno', 'entreno_normal', 'entreno_alto'];

/**
 * ¿Es un día de entrenamiento? Tolerante a mayúsculas/espacios; desconocido → false.
 * @param {unknown} tipoDia
 * @returns {boolean}
 */
export function isTrainingDay(tipoDia) {
  const raw = String(tipoDia ?? '').trim().toLowerCase();
  return TRAINING_DAY_TYPES.includes(raw);
}

/**
 * Normaliza cualquier `tipo_dia` a la etiqueta binaria legacy `entreno`/`descanso`.
 * @param {unknown} tipoDia
 * @returns {'entreno'|'descanso'}
 */
export function normalizeDayType(tipoDia) {
  return isTrainingDay(tipoDia) ? 'entreno' : 'descanso';
}
