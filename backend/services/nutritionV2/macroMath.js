// Macro-math de nutrición V2 (ARCH-002).
// Funciones puras de cálculo de macros por rol/alimento. Dependen solo de utils base
// (parseNumeric) y de parseJsonObject; sin BD ni constantes del engine. Se extraen
// del monolito para poder testearlas y reutilizarlas de forma aislada.

import { parseNumeric } from './baseUtils.js';
import { parseJsonObject } from '../nutritionUtils.js';
import { SLOT_ROLE_FALLBACKS } from './roleConstants.js';

export function getRoleMacroWeights(roleValue) {
  const role = String(roleValue || '').toUpperCase();
  if (role.includes('PROTEINA') || role === 'HUEVO' || role === 'CLARAS' || role.includes('LACTEO_PROTEICO') || role.includes('SUPLEMENTO_PROTEINA')) {
    return { protein: 1, carbs: 0.1, fat: 0.12, kcal: 0.42 };
  }
  if (role.includes('CARBO') || role === 'FRUTA' || role === 'LEGUMBRE') {
    return { protein: 0.08, carbs: 1, fat: 0.08, kcal: 0.42 };
  }
  if (role.includes('GRASA') || role.includes('QUESO')) {
    return { protein: 0.03, carbs: 0.03, fat: 1, kcal: 0.2 };
  }
  if (role === 'VERDURA') {
    // VERDURA debe actuar como complemento/fibra, no como base para cuadrar macros.
    return { protein: 0.01, carbs: 0.015, fat: 0.005, kcal: 0.03 };
  }
  if (role === 'BEBIDA') {
    return { protein: 0.05, carbs: 0.2, fat: 0.05, kcal: 0.05 };
  }
  return { protein: 0.25, carbs: 0.25, fat: 0.25, kcal: 0.1 };
}

export function calculateMacroTotals(items) {
  return items.reduce((acc, item) => {
    acc.kcal += parseNumeric(item.kcal) ?? 0;
    acc.protein_g += parseNumeric(item.macros?.protein_g) ?? 0;
    acc.carbs_g += parseNumeric(item.macros?.carbs_g) ?? 0;
    acc.fat_g += parseNumeric(item.macros?.fat_g) ?? 0;
    return acc;
  }, { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
}

export function getPrimaryRoleFromRoles(roles = [], fallbackMacros = null) {
  const normalized = roles
    .map((role) => String(role || '').trim().toUpperCase())
    .filter(Boolean);

  if (normalized.length > 0) {
    const preferredOrder = [
      'PROTEINA_ANIMAL_MAGRA',
      'PROTEINA_ANIMAL_GRASA',
      'PROTEINA_ANIMAL',
      'PROTEINA_VEGETAL',
      'HUEVO',
      'LACTEO_PROTEICO_MAGRO',
      'SUPLEMENTO_PROTEINA',
      'CARBO_BASE',
      'CARBO_COCIDO',
      'CARBO_PAN',
      'CARBO_AVENA',
      'CARBO_RAPIDO',
      'LEGUMBRE',
      'FRUTA',
      'VERDURA',
      'GRASA_BASE',
      'GRASA_ACEITE',
      'GRASA_FRUTOS_SECOS',
      'GRASA_CREMAS',
      'GRASA_SEMILLAS',
      'LACTEO_BASE'
    ];

    for (const wanted of preferredOrder) {
      if (normalized.includes(wanted)) {
        return wanted;
      }
    }

    return normalized[0];
  }

  if (fallbackMacros) {
    const p = parseNumeric(fallbackMacros.protein_g) ?? 0;
    const c = parseNumeric(fallbackMacros.carbs_g) ?? 0;
    const f = parseNumeric(fallbackMacros.fat_g) ?? 0;
    if (p >= c && p >= f) return 'PROTEINA_ANIMAL_MAGRA';
    if (c >= p && c >= f) return 'CARBO_BASE';
    if (f >= p && f >= c) return 'GRASA_BASE';
  }

  return 'CARBO_BASE';
}

// Compatibilidad de conjuntos de roles para swaps: dos conjuntos son compatibles si
// comparten un rol o un fallback (SLOT_ROLE_FALLBACKS) en cualquier dirección.
export function areRoleSetsCompatible(oldRoles = [], newRoles = []) {
  if (!Array.isArray(oldRoles) || oldRoles.length === 0) return true;
  if (!Array.isArray(newRoles) || newRoles.length === 0) return true;

  const oldSet = new Set(oldRoles.map((role) => String(role || '').trim().toUpperCase()).filter(Boolean));
  const newSet = new Set(newRoles.map((role) => String(role || '').trim().toUpperCase()).filter(Boolean));

  for (const role of oldSet) {
    if (newSet.has(role)) return true;
  }

  for (const oldRole of oldSet) {
    const oldFallbacks = SLOT_ROLE_FALLBACKS[oldRole] || [];
    for (const fallbackRole of oldFallbacks) {
      if (newSet.has(fallbackRole)) return true;
    }
  }

  for (const newRole of newSet) {
    const newFallbacks = SLOT_ROLE_FALLBACKS[newRole] || [];
    for (const fallbackRole of newFallbacks) {
      if (oldSet.has(fallbackRole)) return true;
    }
  }

  return false;
}

export function computeMacrosAndKcalFromFood(food, gramsBase) {
  const macros100 = parseJsonObject(food?.macros_100g, {});
  const protein100 = Math.max(0, parseNumeric(macros100.protein_g) ?? 0);
  const carbs100 = Math.max(0, parseNumeric(macros100.carbs_g) ?? 0);
  const fat100 = Math.max(0, parseNumeric(macros100.fat_g) ?? 0);

  const protein = Number(((protein100 * gramsBase) / 100).toFixed(2));
  const carbs = Number(((carbs100 * gramsBase) / 100).toFixed(2));
  const fat = Number(((fat100 * gramsBase) / 100).toFixed(2));
  const kcal = Math.round((protein * 4) + (carbs * 4) + (fat * 9));

  return {
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    kcal
  };
}
