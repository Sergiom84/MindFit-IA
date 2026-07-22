/**
 * 🗓️ Normalización canónica del tipo de día nutricional (Fase 0, COR-F0-01).
 *
 * ÚNICA fuente backend para interpretar `tipo_dia`. Antes había comparaciones literales
 * dispersas (`tipo_dia === 'entreno'`) en la ruta, el calculador, el acceso a datos y el
 * prompt; con la periodización `active` aparecieron los valores `entreno_normal` y
 * `entreno_alto`, que esas comparaciones trataban erróneamente como descanso.
 *
 * Regla: `entreno`, `entreno_normal` y `entreno_alto` son DÍAS DE ENTRENAMIENTO.
 * Cualquier otro valor (incluido `descanso`, vacío o desconocido) es DESCANSO.
 *
 * No dispersar más comparaciones literales: todo consumidor debe usar `isTrainingDay`
 * (o `normalizeDayType` para la etiqueta binaria legacy).
 */

/** Valores de `tipo_dia` que representan un día de entrenamiento. */
export const TRAINING_DAY_TYPES = Object.freeze(['entreno', 'entreno_normal', 'entreno_alto']);

/** Etiquetas binarias legacy (salida VISIBLE cuando una metodología no está activada). */
export const LEGACY_TRAINING = 'entreno';
export const LEGACY_REST = 'descanso';

/**
 * ¿Es un día de entrenamiento? Acepta los tres valores de entrenamiento y es tolerante
 * a mayúsculas/espacios. `null`/`undefined`/desconocido → false (descanso).
 * @param {unknown} tipoDia
 * @returns {boolean}
 */
export function isTrainingDay(tipoDia) {
  const raw = String(tipoDia ?? '').trim().toLowerCase();
  return TRAINING_DAY_TYPES.includes(raw);
}

/**
 * Normaliza cualquier `tipo_dia` a la etiqueta binaria legacy `entreno`/`descanso`.
 * Útil para el contexto de plantillas/recetas y para la salida visible de metodologías
 * no activadas, donde no se deben servir los valores nuevos como autoritativos.
 * @param {unknown} tipoDia
 * @returns {'entreno'|'descanso'}
 */
export function normalizeDayType(tipoDia) {
  return isTrainingDay(tipoDia) ? LEGACY_TRAINING : LEGACY_REST;
}

export default { TRAINING_DAY_TYPES, LEGACY_TRAINING, LEGACY_REST, isTrainingDay, normalizeDayType };
