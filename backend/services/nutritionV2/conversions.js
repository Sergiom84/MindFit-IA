// Conversiones de estado de pesado para nutrición V2 (ARCH-002).
// Resuelven el factor de conversión entre estados (crudo/cocido/escurrido/...) a partir
// del mapa de factores. Funciones puras: dependen solo de normalizeEstadoPesado
// (dietNormalizers) y parseNumeric (baseUtils); sin BD ni constantes del engine.

import { normalizeEstadoPesado } from './dietNormalizers.js';
import { parseNumeric } from './baseUtils.js';

export function buildConversionKey(grupoFactor, estadoBase, estadoObjetivo) {
  return `${String(grupoFactor || '').toLowerCase()}|${String(estadoBase || '').toLowerCase()}|${String(estadoObjetivo || '').toLowerCase()}`;
}

export function buildConversionMapFromRows(rows = []) {
  const conversionMap = new Map();
  rows.forEach((row) => {
    const groupFactor = String(row?.grupo_factor || '').toLowerCase();
    const estadoBase = normalizeEstadoPesado(row?.estado_base);
    const estadoObjetivo = normalizeEstadoPesado(row?.estado_objetivo);
    const factor = parseNumeric(row?.factor_base_objetivo);
    if (!groupFactor || !estadoBase || !estadoObjetivo || !(factor > 0)) {
      return;
    }
    conversionMap.set(buildConversionKey(groupFactor, estadoBase, estadoObjetivo), factor);
  });
  return conversionMap;
}

export function resolveShownStateConversion({
  grupoFactor,
  estadoBase,
  estadoMostrado,
  conversionMap
}) {
  const base = normalizeEstadoPesado(estadoBase) || 'tal_cual';
  const shownRequested = normalizeEstadoPesado(estadoMostrado) || base;

  if (shownRequested === base) {
    return {
      estadoMostradoFinal: base,
      factor: 1,
      blockedReason: null
    };
  }

  if (base === 'tal_cual') {
    return {
      estadoMostradoFinal: base,
      factor: 1,
      blockedReason: 'tal_cual_no_convertible'
    };
  }

  const normalizedGroup = String(grupoFactor || '').trim().toLowerCase();
  if (!normalizedGroup) {
    return {
      estadoMostradoFinal: base,
      factor: 1,
      blockedReason: 'missing_group_factor'
    };
  }

  const factor = conversionMap.get(buildConversionKey(normalizedGroup, base, shownRequested));
  if (!(factor > 0)) {
    return {
      estadoMostradoFinal: base,
      factor: 1,
      blockedReason: 'missing_conversion_factor'
    };
  }

  return {
    estadoMostradoFinal: shownRequested,
    factor,
    blockedReason: null
  };
}
