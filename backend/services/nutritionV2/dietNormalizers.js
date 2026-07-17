// Normalizadores de texto/dieta para nutrición V2 (ARCH-002).
// Extraído de nutritionV2Engine.js: funciones puras (sin BD ni otras deps del engine)
// que normalizan arrays, filtros de dieta, estados de pesado y texto comparable, y
// resuelven el perfil de porción de vegetales. Incluye las tablas de valores válidos
// que solo estas funciones usan.

export const VALID_ESTADOS_PESADO = ['crudo', 'cocido', 'escurrido', 'seco', 'tal_cual'];
export const VALID_DIET_FILTERS = ['omnivoro', 'vegetariano', 'vegano'];

export function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return [...new Set(
      value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )];
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return normalizeStringArray(parsed);
      }
    } catch {
      // fallback a CSV cuando no es JSON.
    }

    return [...new Set(
      trimmed
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )];
  }

  return [];
}

export function normalizeDietFilter(value) {
  if (!value) return null;

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  if (VALID_DIET_FILTERS.includes(normalized)) {
    return normalized;
  }

  return null;
}

export function normalizeEstadoPesado(value) {
  if (!value) return null;

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  const aliases = {
    talcual: 'tal_cual'
  };

  const resolved = aliases[normalized] || normalized;
  return VALID_ESTADOS_PESADO.includes(resolved) ? resolved : null;
}

export function normalizeComparableText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function resolveVegetablePortionProfile(food = {}) {
  const comparable = [
    food?.nombre,
    food?.slug,
    food?.categoria,
    food?.categoria_detalle
  ]
    .map((value) => normalizeComparableText(value))
    .filter(Boolean)
    .join(' ');

  const leafyKeywords = ['rucula', 'lechuga', 'espinaca', 'canonigo', 'berro', 'escarola', 'endibia', 'acelga'];
  const denseKeywords = ['zanahoria', 'remolacha', 'brocoli', 'coliflor', 'calabacin', 'berenjena', 'pimiento', 'cebolla', 'tomate', 'pepino', 'esparrago', 'seta', 'champi', 'judia verde', 'calabaza'];

  if (leafyKeywords.some((keyword) => comparable.includes(keyword))) {
    return { type: 'leafy', min: 30, max: 80 };
  }

  if (denseKeywords.some((keyword) => comparable.includes(keyword))) {
    return { type: 'dense', min: 80, max: 150 };
  }

  return { type: 'generic', min: 50, max: 150 };
}

export function normalizePositiveInt(value, defaultValue, maxValue = null) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return defaultValue;
  }

  if (maxValue && parsed > maxValue) {
    return maxValue;
  }

  return parsed;
}
