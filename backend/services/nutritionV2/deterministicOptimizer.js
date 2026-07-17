// Optimizador de gramajes del generador determinista de nutrición V2 (ARCH-002).
// A partir de los alimentos seleccionados por slot: estima el gramaje base por rol,
// ajusta los gramos por descenso de coordenadas para acercarse a los macros/kcal
// objetivo de la comida, y construye los items finales aplicando la conversión de
// estado de pesado. Funciones puras: dependen de módulos hermanos ya extraídos; sin BD.

import { getRoleMacroWeights } from './macroMath.js';
import { getRoleGramBounds } from './roleScoring.js';
import { parseNumeric } from './baseUtils.js';
import { normalizeEstadoPesado } from './dietNormalizers.js';
import { resolveShownStateConversion } from './conversions.js';
import { parseJsonObject, clampNumber } from '../nutritionUtils.js';
import { DETERMINISTIC_COORDINATE_ITERATIONS } from './menuGenerationConfig.js';

export function buildDraftItemsForTemplate({ selectedItems, mealMacros, mealKcalTarget }) {
  return selectedItems.map((entry) => {
    const roleWeights = getRoleMacroWeights(entry.role);
    const bounds = getRoleGramBounds(entry.role, entry.food.porcion_tipica_g, entry.food);
    const macros100 = parseJsonObject(entry.food.macros_100g, {});
    const proteinPerG = (parseNumeric(macros100.protein_g) ?? 0) / 100;
    const carbsPerG = (parseNumeric(macros100.carbs_g) ?? 0) / 100;
    const fatPerG = (parseNumeric(macros100.fat_g) ?? 0) / 100;
    const kcalPerG = (parseNumeric(macros100.kcal) ?? ((proteinPerG * 4) + (carbsPerG * 4) + (fatPerG * 9)) * 100) / 100;

    const estimations = [];
    if (proteinPerG > 0 && roleWeights.protein > 0) {
      estimations.push((mealMacros.protein_g * roleWeights.protein) / proteinPerG);
    }
    if (carbsPerG > 0 && roleWeights.carbs > 0) {
      estimations.push((mealMacros.carbs_g * roleWeights.carbs) / carbsPerG);
    }
    if (fatPerG > 0 && roleWeights.fat > 0) {
      estimations.push((mealMacros.fat_g * roleWeights.fat) / fatPerG);
    }

    let gramosBase = null;
    if (estimations.length > 0) {
      const estimationAverage = estimations.reduce((acc, value) => acc + value, 0) / estimations.length;
      gramosBase = clampNumber(estimationAverage, bounds.min, bounds.max);
    } else if (kcalPerG > 0) {
      gramosBase = clampNumber((mealKcalTarget * roleWeights.kcal) / kcalPerG, bounds.min, bounds.max);
    } else {
      gramosBase = clampNumber(30, bounds.min, bounds.max);
    }

    return {
      role: entry.role,
      food: entry.food,
      macros100,
      proteinPerG,
      carbsPerG,
      fatPerG,
      kcalPerG,
      bounds,
      gramosBase
    };
  });
}

export function optimizeDraftItemGrams({ draftItems, mealMacros, mealKcalTarget }) {
  const goals = [];
  if (mealMacros.protein_g > 0) {
    goals.push({ key: 'protein', target: mealMacros.protein_g, weight: 2.3, scale: Math.max(15, mealMacros.protein_g) });
  }
  if (mealMacros.carbs_g > 0) {
    goals.push({ key: 'carbs', target: mealMacros.carbs_g, weight: 1.9, scale: Math.max(20, mealMacros.carbs_g) });
  }
  if (mealMacros.fat_g > 0) {
    goals.push({ key: 'fat', target: mealMacros.fat_g, weight: 1.7, scale: Math.max(8, mealMacros.fat_g) });
  }
  if (mealKcalTarget > 0) {
    goals.push({ key: 'kcal', target: mealKcalTarget, weight: 0.35, scale: Math.max(120, mealKcalTarget) });
  }

  if (goals.length === 0) {
    return draftItems.map((item) => Number(item.gramosBase.toFixed(2)));
  }

  const grams = draftItems.map((item) => clampNumber(item.gramosBase, item.bounds.min, item.bounds.max));
  const totals = { protein: 0, carbs: 0, fat: 0, kcal: 0 };
  draftItems.forEach((item, index) => {
    const value = grams[index];
    totals.protein += item.proteinPerG * value;
    totals.carbs += item.carbsPerG * value;
    totals.fat += item.fatPerG * value;
    totals.kcal += item.kcalPerG * value;
  });

  for (let iteration = 0; iteration < DETERMINISTIC_COORDINATE_ITERATIONS; iteration += 1) {
    let changed = false;

    for (let index = 0; index < draftItems.length; index += 1) {
      const item = draftItems[index];
      const oldValue = grams[index];
      const without = {
        protein: totals.protein - (item.proteinPerG * oldValue),
        carbs: totals.carbs - (item.carbsPerG * oldValue),
        fat: totals.fat - (item.fatPerG * oldValue),
        kcal: totals.kcal - (item.kcalPerG * oldValue)
      };

      let alpha = 0;
      let beta = 0;

      for (const goal of goals) {
        const a = goal.key === 'protein'
          ? item.proteinPerG
          : goal.key === 'carbs'
            ? item.carbsPerG
            : goal.key === 'fat'
              ? item.fatPerG
              : item.kcalPerG;

        if (!Number.isFinite(a) || a === 0) {
          continue;
        }

        const coeff = goal.weight / (goal.scale * goal.scale);
        const delta = without[goal.key] - goal.target;
        alpha += coeff * a * a;
        beta += 2 * coeff * a * delta;
      }

      let optimized = oldValue;
      if (alpha > 0) {
        optimized = -beta / (2 * alpha);
      }

      optimized = clampNumber(optimized, item.bounds.min, item.bounds.max);
      if (!Number.isFinite(optimized)) {
        optimized = oldValue;
      }

      if (Math.abs(optimized - oldValue) > 0.01) {
        changed = true;
      }

      grams[index] = optimized;
      totals.protein = without.protein + (item.proteinPerG * optimized);
      totals.carbs = without.carbs + (item.carbsPerG * optimized);
      totals.fat = without.fat + (item.fatPerG * optimized);
      totals.kcal = without.kcal + (item.kcalPerG * optimized);
    }

    if (!changed) {
      break;
    }
  }

  return grams.map((value, index) => {
    const bounds = draftItems[index].bounds;
    return Number(clampNumber(value, bounds.min, bounds.max).toFixed(2));
  });
}

export function buildDeterministicMenuItems({ draftItems, optimizedGrams, conversionMap }) {
  return draftItems.map((item, index) => {
    const gramosBase = optimizedGrams[index];
    const estadoBase = normalizeEstadoPesado(item.food.estado_pesado_base) || 'tal_cual';
    const estadoMostradoRequested = normalizeEstadoPesado(item.food.estado_pesado_mostrado_default) || estadoBase;
    const grupoFactor = item.food.grupo_factor ? String(item.food.grupo_factor).toLowerCase() : null;
    const conversionState = resolveShownStateConversion({
      grupoFactor,
      estadoBase,
      estadoMostrado: estadoMostradoRequested,
      conversionMap
    });
    const estadoMostrado = conversionState.estadoMostradoFinal;
    const gramosMostrados = gramosBase * conversionState.factor;

    const protein = Number((item.proteinPerG * gramosBase).toFixed(2));
    const carbs = Number((item.carbsPerG * gramosBase).toFixed(2));
    const fat = Number((item.fatPerG * gramosBase).toFixed(2));
    const kcal = Math.round((protein * 4) + (carbs * 4) + (fat * 9));

    return {
      alimento_nombre: item.food.nombre,
      food_slug: item.food.slug,
      role: item.role,
      cantidad_g: Number(gramosMostrados.toFixed(1)),
      cantidad_g_base: Number(gramosBase.toFixed(1)),
      cantidad_g_mostrada: Number(gramosMostrados.toFixed(1)),
      estado_pesado_base: estadoBase,
      estado_pesado_mostrado: estadoMostrado,
      conversion_blocked_reason: conversionState.blockedReason,
      kcal,
      macros: {
        protein_g: protein,
        carbs_g: carbs,
        fat_g: fat
      }
    };
  });
}
