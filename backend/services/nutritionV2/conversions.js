// Conversiones de estado de pesado para nutrición V2 (ARCH-002).
// Resuelven el factor de conversión entre estados (crudo/cocido/escurrido/...) a partir
// del mapa de factores. Funciones puras: dependen solo de normalizeEstadoPesado
// (dietNormalizers) y parseNumeric (baseUtils); sin BD ni constantes del engine.

import { normalizeEstadoPesado } from './dietNormalizers.js';
import { parseNumeric } from './baseUtils.js';
import { clampNumber, parseJsonObject } from '../nutritionUtils.js';

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

export function computeSwapBaseGrams({
  oldItemMacros,
  oldItemKcal,
  newFood,
  primaryRole
}) {
  const role = String(primaryRole || '').toUpperCase();
  const targetProtein = Math.max(0, parseNumeric(oldItemMacros?.protein_g) ?? 0);
  const targetCarbs = Math.max(0, parseNumeric(oldItemMacros?.carbs_g) ?? 0);
  const targetFat = Math.max(0, parseNumeric(oldItemMacros?.fat_g) ?? 0);
  const targetKcal = Math.max(
    0,
    parseNumeric(oldItemKcal) ?? Math.round((targetProtein * 4) + (targetCarbs * 4) + (targetFat * 9))
  );

  const macros100 = parseJsonObject(newFood?.macros_100g, {});
  const protein100 = Math.max(0, parseNumeric(macros100.protein_g) ?? 0);
  const carbs100 = Math.max(0, parseNumeric(macros100.carbs_g) ?? 0);
  const fat100 = Math.max(0, parseNumeric(macros100.fat_g) ?? 0);
  const kcal100 = Math.max(0, parseNumeric(macros100.kcal) ?? Math.round((protein100 * 4) + (carbs100 * 4) + (fat100 * 9)));

  const byMacro = (target, per100) => {
    if (!(target > 0) || !(per100 > 0)) return null;
    return (target * 100) / per100;
  };
  const byKcal = () => {
    if (!(targetKcal > 0) || !(kcal100 > 0)) return null;
    return (targetKcal * 100) / kcal100;
  };

  let grams = null;
  if (role.includes('PROTEINA') || role === 'HUEVO' || role.includes('LACTEO')) {
    grams = byMacro(targetProtein, protein100);
  } else if (role.includes('CARBO') || role === 'LEGUMBRE' || role === 'FRUTA') {
    grams = byMacro(targetCarbs, carbs100);
  } else if (role.includes('GRASA')) {
    grams = byMacro(targetFat, fat100);
  }

  if (!(grams > 0)) {
    grams = byKcal();
  }

  if (!(grams > 0)) {
    grams = 100;
  }

  return Number(clampNumber(grams, 5, 1200).toFixed(1));
}

export function getConversionBlockedReasonMessage(code) {
  const normalized = String(code || '').trim().toLowerCase();
  if (normalized === 'tal_cual_no_convertible') {
    return 'Este alimento se mide tal como se consume.';
  }
  if (normalized === 'missing_group_factor') {
    return 'Este alimento no tiene regla de conversión configurada.';
  }
  if (normalized === 'missing_conversion_factor') {
    return 'No existe conversión para ese estado de pesado.';
  }
  return 'No se pudo aplicar ese estado de pesado.';
}

export function resolveShownStateWithFallback({
  grupoFactor,
  estadoBase,
  estadoMostrado,
  conversionMap
}) {
  const base = normalizeEstadoPesado(estadoBase) || 'tal_cual';
  const requested = normalizeEstadoPesado(estadoMostrado) || base;
  const conversionState = resolveShownStateConversion({
    grupoFactor,
    estadoBase: base,
    estadoMostrado: requested,
    conversionMap
  });

  if (!conversionState.blockedReason) {
    return {
      estadoBase: base,
      estadoMostradoFinal: conversionState.estadoMostradoFinal,
      factor: conversionState.factor,
      blockedReason: null,
      requestedEstado: requested,
      fallbackApplied: false,
      fallbackMessage: null
    };
  }

  return {
    estadoBase: base,
    estadoMostradoFinal: base,
    factor: 1,
    blockedReason: conversionState.blockedReason,
    requestedEstado: requested,
    fallbackApplied: requested !== base,
    fallbackMessage: getConversionBlockedReasonMessage(conversionState.blockedReason)
  };
}

export function resolveBaseGramsFromMealItem(item, conversionMap) {
  const cantidadBase = parseNumeric(item?.cantidad_g_base);
  if (cantidadBase && cantidadBase > 0) {
    return cantidadBase;
  }

  const cantidadMostrada = parseNumeric(item?.cantidad_g_mostrada ?? item?.cantidad_g);
  if (!(cantidadMostrada > 0)) {
    return null;
  }

  const estadoBase = normalizeEstadoPesado(item?.estado_pesado_base) || 'tal_cual';
  const estadoMostrado = normalizeEstadoPesado(item?.estado_pesado_mostrado) || estadoBase;
  const conversionState = resolveShownStateConversion({
    grupoFactor: item?.grupo_factor,
    estadoBase,
    estadoMostrado,
    conversionMap
  });
  const factor = conversionState.factor > 0 ? conversionState.factor : 1;
  return Number((cantidadMostrada / factor).toFixed(2));
}
