/**
 * 🧬 Identidad canónica de la metodología Hipertrofia (backend).
 *
 * Fuente ÚNICA para reconocer la Hipertrofia actual y su literal persistido histórico.
 * Sustituye a las detecciones dispersas por igualdad de tag y a los regex laxos
 * tipo `/hipertrofia|mindfeed/i`, que producían falsos positivos (p. ej. cualquier
 * texto con "mindfeed" o un "hipertrofia" parcial).
 *
 * DECISIÓN DE PRODUCTO (Pablo): "HipertrofiaV2", "hipertrofiaV2" y
 * "HipertrofiaV2_MindFeed" REPRESENTAN la Hipertrofia actual. El generador genérico de
 * gimnasio (gimnasio/gym/bodybuilding) es OTRA cosa y NO debe reconocerse aquí.
 *
 * Contrato de compatibilidad: el valor que hoy se persiste en
 * `app.methodology_plans.methodology_type` es exactamente `HIPERTROFIA_PERSISTED_TYPE`.
 * No dupliques ese literal por el código: impórtalo desde aquí.
 */

/**
 * Literal persistido histórico (contrato de BD vivo). NO se migra en este PR.
 * Los 99 planes existentes usan este valor en `methodology_type` y `plan_data.metodologia`.
 */
export const HIPERTROFIA_PERSISTED_TYPE = 'HipertrofiaV2_MindFeed';

/** Identidad canónica interna (nombre de dominio, no visible al usuario). */
export const HIPERTROFIA_CANONICAL_ID = 'hipertrofia';

/** Nombre mostrado al usuario. Decisión de producto: SIEMPRE "Hipertrofia". */
export const HIPERTROFIA_DISPLAY_NAME = 'Hipertrofia';

function stripDiacritics(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Compacta un valor: sin acentos, en minúsculas y sin separadores (`_`, `-`, espacios).
 * Así `HipertrofiaV2_MindFeed`, `HipertrofiaV2` y `hipertrofia v2` colapsan a una clave.
 */
function compact(value) {
  return stripDiacritics(value).toLowerCase().replace(/[\s_-]+/g, '');
}

/**
 * Conjunto CERRADO de identidades aceptadas (allowlist). Cualquier otra cosa se rechaza
 * explícitamente, incluidos: gimnasio/gym/bodybuilding, "mindfeed" suelto (genérico) y
 * textos que solo contengan parcialmente "hipertrofia".
 */
const ACCEPTED_COMPACT = new Set([
  'hipertrofia',            // hipertrofia / Hipertrofia
  'hipertrofiav2',          // hipertrofiaV2 / HipertrofiaV2 / hipertrofiav2
  'hipertrofiav2mindfeed'   // HipertrofiaV2_MindFeed (literal persistido)
]);

/**
 * ¿El valor identifica a la metodología Hipertrofia actual (incluidos alias históricos)?
 * @param {unknown} value
 * @returns {boolean}
 */
export function isHipertrofiaMethodology(value) {
  if (value == null) return false;
  return ACCEPTED_COMPACT.has(compact(value));
}

/**
 * Normaliza cualquier alias de Hipertrofia a la identidad canónica interna,
 * o `null` si NO es Hipertrofia (NUNCA cae a gimnasio ni a "general").
 * @param {unknown} value
 * @returns {'hipertrofia'|null}
 */
export function normalizeHipertrofiaIdentity(value) {
  return isHipertrofiaMethodology(value) ? HIPERTROFIA_CANONICAL_ID : null;
}
