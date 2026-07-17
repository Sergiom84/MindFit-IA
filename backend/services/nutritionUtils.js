/**
 * Utilidades puras compartidas de nutrición.
 * Consolidadas desde copias idénticas que estaban duplicadas en varios módulos
 * (engine, hybrid solver/planner/validator, adjustment/dailyLog/review).
 */

export function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function parseJsonObject(value, fallback = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function formatLocalDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeFoodName(value) {
  if (!value) return '';
  return String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Mapa de alérgeno → términos que delatan su presencia en el NOMBRE o los tags
 * de un alimento. Existe porque el catálogo etiqueta de forma incompleta (p. ej.
 * "Natto" y "Miso" son soja pero no siempre llevan el tag), y comparar la alergia
 * solo contra los tags dejaba pasar derivados peligrosos.
 *
 * Regla de diseño: en seguridad alimentaria preferimos excluir de más. Las claves
 * están normalizadas (sin acentos, minúsculas) para casar con `normalizeFoodName`.
 */
export const ALLERGEN_SYNONYMS = {
  soja: ['soja', 'soya', 'tofu', 'tempeh', 'natto', 'edamame', 'miso', 'tamari', 'shoyu', 'texturizada', 'texturizado'],
  gluten: ['gluten', 'trigo', 'cebada', 'centeno', 'espelta', 'seitan', 'cuscus', 'bulgur', 'kamut'],
  lactosa: ['lactosa', 'lacteo', 'leche', 'queso', 'yogur', 'nata', 'mantequilla', 'kefir', 'requeson', 'cuajada'],
  lacteo: ['lactosa', 'lacteo', 'leche', 'queso', 'yogur', 'nata', 'mantequilla', 'kefir', 'requeson', 'cuajada'],
  huevo: ['huevo', 'clara', 'yema', 'ovoproducto', 'tortilla'],
  frutos_secos: ['nuez', 'nueces', 'almendra', 'avellana', 'anacardo', 'pistacho', 'cacahuete', 'mani', 'pecana', 'macadamia'],
  cacahuete: ['cacahuete', 'mani', 'crema de cacahuete'],
  marisco: ['marisco', 'gamba', 'langostino', 'mejillon', 'almeja', 'pulpo', 'calamar', 'sepia', 'cangrejo', 'ostra'],
  pescado: ['pescado', 'atun', 'salmon', 'merluza', 'bacalao', 'sardina', 'caballa', 'trucha', 'anchoa']
};

/**
 * Devuelve los términos a vetar para un alérgeno declarado: el propio alérgeno
 * más sus sinónimos/derivados conocidos (todo normalizado y deduplicado).
 */
export function expandAllergenTerms(allergen) {
  const key = normalizeFoodName(allergen).replace(/\s+/g, '_');
  const flat = normalizeFoodName(allergen);
  const synonyms = ALLERGEN_SYNONYMS[key] || ALLERGEN_SYNONYMS[flat] || [];
  const terms = new Set([flat, ...synonyms.map((s) => normalizeFoodName(s))].filter(Boolean));
  return [...terms];
}

/**
 * ¿El texto indica PRESENCIA del término, descartando negaciones? Un tag como
 * "sin gluten" o un nombre "Pan sin gluten" contiene la subcadena "gluten" pero
 * significa lo contrario, así que no debe contar como alérgeno presente.
 */
function textIndicatesAllergen(text, term) {
  if (!text || !text.includes(term)) return false;
  const negations = [`sin ${term}`, `libre de ${term}`, `${term} free`, `0% ${term}`, `no ${term}`];
  let residual = text;
  for (const negation of negations) {
    if (residual.includes(negation)) {
      residual = residual.split(negation).join(' ');
    }
  }
  return residual.includes(term);
}

/**
 * ¿Este alimento dispara la alergia declarada? Revisa el NOMBRE y los TAGS contra
 * los términos expandidos del alérgeno. Sustituye a la comparación anterior que
 * solo miraba tags (y por eso dejaba pasar "Natto" a un alérgico a la soja).
 */
export function foodTriggersAllergen(foodName, foodTags, allergen) {
  const terms = expandAllergenTerms(allergen);
  if (terms.length === 0) return false;

  const name = normalizeFoodName(foodName);
  const tags = (Array.isArray(foodTags) ? foodTags : [])
    .map((tag) => normalizeFoodName(tag))
    .filter(Boolean);

  for (const term of terms) {
    if (textIndicatesAllergen(name, term)) return true;
    for (const tag of tags) {
      if (textIndicatesAllergen(tag, term)) return true;
    }
  }
  return false;
}
