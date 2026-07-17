// Utils base compartidos de nutrición V2 (ARCH-002).
// Funciones puras de bajo nivel (parseo numérico, hashing determinista, error
// porcentual y días entre fechas) usadas ampliamente por el engine. Extraerlas aquí
// permite que los futuros módulos de dominio (macros, conversiones) las importen sin
// depender del monolito.

export function parseNumeric(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value
      .trim()
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');
    if (!normalized) return null;
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function hashString(input) {
  const value = String(input || '');
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function pickDeterministic(items, seed) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }
  const safeSeed = Number.isFinite(seed) ? Math.abs(seed) : hashString(seed);
  return items[safeSeed % items.length];
}

export function percentError(actual, target) {
  const safeTarget = parseNumeric(target) ?? 0;
  if (safeTarget <= 0) return 0;
  return Number((((Math.abs(actual - safeTarget)) / safeTarget) * 100).toFixed(2));
}

export function daysBetween(a, b) {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.abs(Math.round((b.getTime() - a.getTime()) / MS_PER_DAY));
}
