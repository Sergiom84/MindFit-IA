/**
 * 🧬 Identidad canónica de la metodología Hipertrofia (frontend).
 *
 * Espejo EXACTO de `backend/services/hipertrofia/identity.js`. Fuente única en el
 * frontend para reconocer la Hipertrofia actual y su literal persistido histórico.
 * Sustituye a los regex laxos (`/hipertrofia|mindfeed/i`) y a las comparaciones
 * dispersas por igualdad de tag, que producían falsos positivos.
 *
 * DECISIÓN DE PRODUCTO (Pablo): "HipertrofiaV2", "hipertrofiaV2" y
 * "HipertrofiaV2_MindFeed" REPRESENTAN la Hipertrofia actual. gimnasio/gym/bodybuilding
 * son el generador genérico y NO se reconocen aquí.
 *
 * No dupliques el literal persistido: impórtalo desde `HIPERTROFIA_PERSISTED_TYPE`.
 */

/** Literal persistido histórico (contrato de BD vivo). NO se migra en este PR. */
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

/** Compacta: sin acentos, minúsculas y sin separadores (`_`, `-`, espacios). */
function compact(value) {
  return stripDiacritics(value).toLowerCase().replace(/[\s_-]+/g, '');
}

/**
 * Conjunto CERRADO de identidades aceptadas (allowlist). Rechaza explícitamente
 * gimnasio/gym/bodybuilding, "mindfeed" suelto (genérico) y "hipertrofia" parcial.
 */
const ACCEPTED_COMPACT = new Set([
  'hipertrofia',
  'hipertrofiav2',
  'hipertrofiav2mindfeed'
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
