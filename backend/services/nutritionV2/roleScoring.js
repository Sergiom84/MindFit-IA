// Scoring de alimentos por rol y construcción de slots para el generador determinista
// de nutrición V2 (ARCH-002). Calcula los límites de gramaje por rol, puntúa cuánto
// encaja un alimento en un rol (ajuste de macros + penalización de variedad), ordena
// candidatos de forma determinista y arma las combinaciones de slots por plantilla.
// Funciones puras: dependen solo de módulos hermanos ya extraídos; sin BD.

import { resolveVegetablePortionProfile } from './dietNormalizers.js';
import { parseNumeric, hashString } from './baseUtils.js';
import { getRoleMacroWeights } from './macroMath.js';
import { parseJsonObject } from '../nutritionUtils.js';
import { getFoodVarietyPenalty } from './varietyPalatability.js';
import { SLOT_ROLE_FALLBACKS } from './roleConstants.js';
import {
  DETERMINISTIC_MAX_SLOT_OPTIONS,
  DETERMINISTIC_MAX_SLOT_COMBINATIONS
} from './menuGenerationConfig.js';

export function getRoleGramBounds(roleValue, porcionTipica, food = null) {
  const role = String(roleValue || '').toUpperCase();
  let base;
  if (role.includes('GRASA') || role.includes('ACEITE')) {
    base = { min: 4, max: 35 };
  } else if (role.includes('SUPLEMENTO_PROTEINA')) {
    base = { min: 20, max: 60 };
  } else if (role === 'VERDURA') {
    base = resolveVegetablePortionProfile(food);
  } else if (role === 'FRUTA') {
    base = { min: 80, max: 320 };
  } else if (role.includes('CARBO') || role === 'LEGUMBRE') {
    base = { min: 45, max: 220 };
  } else if (role.includes('PROTEINA') || role === 'HUEVO' || role === 'CLARAS' || role.includes('LACTEO')) {
    base = { min: 70, max: 260 };
  } else {
    base = { min: 25, max: 320 };
  }

  const pt = parseNumeric(porcionTipica);
  if (pt && pt > 0) {
    if (role === 'VERDURA') {
      const minMultiplier = base.type === 'leafy' ? 0.6 : 0.75;
      const maxMultiplier = base.type === 'leafy' ? 1.1 : 1.2;
      const min = Math.max(base.min, Math.round(pt * minMultiplier));
      const max = Math.min(base.max, Math.round(pt * maxMultiplier));
      return { min, max: Math.max(max, min) };
    }

    if (role.includes('PROTEINA') || role === 'HUEVO' || role === 'CLARAS' || role.includes('LACTEO')) {
      const min = Math.max(base.min, Math.round(pt * 0.75));
      const max = Math.min(base.max, Math.max(Math.round(pt * 2.4), min));
      return { min, max: Math.max(max, min) };
    }

    if (role.includes('CARBO') || role === 'LEGUMBRE') {
      const min = Math.max(base.min, Math.round(pt * 0.7));
      const max = Math.min(base.max, Math.max(Math.round(pt * 2.2), min));
      return { min, max: Math.max(max, min) };
    }

    if (role.includes('GRASA') || role.includes('ACEITE')) {
      const min = Math.max(base.min, Math.round(pt * 0.6));
      const max = Math.min(base.max, Math.max(Math.round(pt * 1.8), min));
      return { min, max: Math.max(max, min) };
    }

    return {
      min: Math.max(base.min, Math.round(pt * 0.5)),
      max: Math.min(base.max, Math.round(pt * 1.5))
    };
  }

  return base;
}

export function scoreFoodForRole(food, role, varietyContext = null) {
  const weights = getRoleMacroWeights(role);
  const desiredTotal = weights.protein + weights.carbs + weights.fat;
  const desired = {
    protein: desiredTotal > 0 ? weights.protein / desiredTotal : 0.33,
    carbs: desiredTotal > 0 ? weights.carbs / desiredTotal : 0.33,
    fat: desiredTotal > 0 ? weights.fat / desiredTotal : 0.33
  };

  const macros = parseJsonObject(food.macros_100g, {});
  const protein = Math.max(0, parseNumeric(macros.protein_g) ?? 0);
  const carbs = Math.max(0, parseNumeric(macros.carbs_g) ?? 0);
  const fat = Math.max(0, parseNumeric(macros.fat_g) ?? 0);
  const total = protein + carbs + fat;

  if (total <= 0) {
    return 999;
  }

  const actual = {
    protein: protein / total,
    carbs: carbs / total,
    fat: fat / total
  };

  let score = (
    Math.abs(actual.protein - desired.protein) * 1.4
    + Math.abs(actual.carbs - desired.carbs) * 1.2
    + Math.abs(actual.fat - desired.fat) * 1.2
  );

  if (desired.protein >= 0.45 && protein < 12) {
    score += (12 - protein) / 8;
  }
  if (desired.carbs >= 0.45 && carbs < 12) {
    score += (12 - carbs) / 8;
  }
  if (desired.fat >= 0.45 && fat < 6) {
    score += (6 - fat) / 6;
  }

  if (String(role || '').toUpperCase() === 'VERDURA') {
    // Penaliza verduras excesivamente densas en carbo/kcal para que no "sustituyan" al rol CARBO.
    const kcal = Math.max(0, parseNumeric(macros.kcal) ?? ((protein * 4) + (carbs * 4) + (fat * 9)));
    if (carbs > 12) {
      score += (carbs - 12) / 6;
    }
    if (kcal > 70) {
      score += (kcal - 70) / 35;
    }
  }

  score += getFoodVarietyPenalty(food, varietyContext);

  return Number(score.toFixed(6));
}

export function orderSlotCandidates({ candidates, role, userId, dayInfo, meal, slotOrder, varietyContext = null }) {
  const seedBase = `${userId}|${dayInfo?.day_index || 0}|${meal?.orden || 0}|${slotOrder}|${role}`;
  return [...candidates].sort((left, right) => {
    const leftScore = scoreFoodForRole(left, role, varietyContext);
    const rightScore = scoreFoodForRole(right, role, varietyContext);
    if (leftScore !== rightScore) {
      return leftScore - rightScore;
    }

    const leftSeed = hashString(`${seedBase}|${left.id}`) % 10000;
    const rightSeed = hashString(`${seedBase}|${right.id}`) % 10000;
    if (leftSeed !== rightSeed) {
      return leftSeed - rightSeed;
    }

    return String(left.nombre || '').localeCompare(String(right.nombre || ''), 'es');
  });
}

export function buildSlotOptionsForTemplate({
  template,
  slots,
  roleFoodsMap,
  userId,
  dayInfo,
  meal,
  varietyContext = null
}) {
  return slots.map((slot) => {
    const role = String(slot.slot_role || '').toUpperCase();
    const roleFallbacks = [role, ...(SLOT_ROLE_FALLBACKS[role] || [])];
    let orderedCandidates = [];

    for (const roleCandidate of roleFallbacks) {
      const roleCandidates = roleFoodsMap.get(roleCandidate) || [];
      if (roleCandidates.length === 0) {
        continue;
      }

      orderedCandidates = orderSlotCandidates({
        candidates: roleCandidates,
        role,
        userId,
        dayInfo,
        meal,
        slotOrder: slot.slot_order,
        varietyContext
      }).slice(0, DETERMINISTIC_MAX_SLOT_OPTIONS);

      if (orderedCandidates.length > 0) {
        break;
      }
    }

    if (varietyContext?.sameDayUsedFoodIds?.size) {
      const nonRepeated = orderedCandidates.filter(
        (candidate) => !varietyContext.sameDayUsedFoodIds.has(String(candidate.id))
      );
      if (nonRepeated.length > 0) {
        orderedCandidates = nonRepeated;
      }
    }

    if (orderedCandidates.length === 0) {
      throw new Error(`No hay alimentos para slot_role=${role} en plantilla ${template.template_code}`);
    }

    return {
      slot,
      role,
      candidates: orderedCandidates
    };
  });
}

export function buildSlotCombinations(slotOptions) {
  const combinations = [];
  const current = [];
  const usedIds = new Set();

  function backtrack(index) {
    if (combinations.length >= DETERMINISTIC_MAX_SLOT_COMBINATIONS) {
      return;
    }

    if (index >= slotOptions.length) {
      combinations.push([...current]);
      return;
    }

    const slotOption = slotOptions[index];
    const preferred = slotOption.candidates.filter((candidate) => !usedIds.has(candidate.id));
    const listToUse = preferred.length > 0 ? preferred : slotOption.candidates;

    for (const candidate of listToUse) {
      const wasUsed = usedIds.has(candidate.id);
      current.push({
        slot: slotOption.slot,
        role: slotOption.role,
        food: candidate
      });

      if (!wasUsed) {
        usedIds.add(candidate.id);
      }

      backtrack(index + 1);

      if (!wasUsed) {
        usedIds.delete(candidate.id);
      }
      current.pop();

      if (combinations.length >= DETERMINISTIC_MAX_SLOT_COMBINATIONS) {
        break;
      }
    }
  }

  backtrack(0);
  return combinations;
}
