// Helpers de selección de comida para nutrición V2 (ARCH-002).
// Filtros de catálogo/preferencias, resolución de tipo de comida y contexto de fase,
// y evaluación del balance de un candidato de comida. Funciones puras: dependen solo
// de normalizadores ya extraídos y de evaluateMealNutrientBalance; sin BD ni constantes
// del engine. Se extraen del monolito nutritionV2Engine.js.

import { normalizeStringArray } from './dietNormalizers.js';
import { parseNumeric } from './baseUtils.js';
import { parseJsonObject, normalizeFoodName, foodTriggersAllergen, expandAllergenTerms } from '../nutritionUtils.js';
import { evaluateMealNutrientBalance } from '../menuHardRulesEngine.js';

export function buildFoodCatalogFilters({
  search,
  categoria,
  categoriaDetalle,
  diet,
  allergensExclude,
  estadoBase,
  grupoFactor,
  onlyVerified = true
}) {
  const whereClauses = ['1=1'];
  const params = [];

  if (onlyVerified) {
    whereClauses.push('is_verified = TRUE');
  }

  if (search) {
    whereClauses.push(`LOWER(nombre) LIKE LOWER($${params.length + 1})`);
    params.push(`%${search}%`);
  }

  if (categoria) {
    whereClauses.push(`LOWER(categoria) = LOWER($${params.length + 1})`);
    params.push(categoria);
  }

  if (categoriaDetalle) {
    whereClauses.push(`LOWER(categoria_detalle) = LOWER($${params.length + 1})`);
    params.push(categoriaDetalle);
  }

  if (estadoBase) {
    whereClauses.push(`estado_pesado_base = $${params.length + 1}`);
    params.push(estadoBase);
  }

  if (grupoFactor) {
    whereClauses.push(`LOWER(grupo_factor) = LOWER($${params.length + 1})`);
    params.push(grupoFactor);
  }

  if (diet === 'vegetariano') {
    whereClauses.push('COALESCE(is_vegetarian, FALSE) = TRUE');
  } else if (diet === 'vegano') {
    whereClauses.push('COALESCE(is_vegan, FALSE) = TRUE');
  }

  // Excluye por alérgeno de forma semántica: cada alérgeno se expande a sus
  // derivados (soja→natto/tofu/tempeh/miso...) y se veta tanto en el NOMBRE como
  // en los tags. Antes solo se comparaba contra tags, dejando pasar alimentos con
  // etiquetado incompleto (p. ej. "Natto" a un alérgico a la soja). (C-01)
  const allergens = normalizeStringArray(allergensExclude);
  const allergenTerms = new Set();
  for (const allergen of allergens) {
    for (const term of expandAllergenTerms(allergen)) {
      allergenTerms.add(term);
    }
  }
  // Los términos vienen ya sin acentos (normalizeFoodName). Quitamos también los
  // acentos del nombre en BD con translate() porque la extensión `unaccent` no
  // está instalada en producción (p. ej. "Seitán" → "seitan").
  const stripAccents = (col) =>
    `translate(LOWER(${col}), 'áàäâéèëêíìïîóòöôúùüûñ', 'aaaaeeeeiiiioooouuuun')`;
  for (const term of allergenTerms) {
    const nameLike = params.length + 1;
    const nameNeg = params.length + 2;
    const tagsLike = params.length + 3;
    const tagsNeg = params.length + 4;
    // Excluir el alimento solo si el término aparece de forma NO negada. Así un
    // "Arroz sin gluten" o un tag "sin gluten" no se descarta para un alérgico.
    whereClauses.push(
      `NOT (${stripAccents('nombre')} LIKE $${nameLike} AND ${stripAccents('nombre')} NOT LIKE $${nameNeg}) ` +
      `AND NOT (LOWER(COALESCE(tags::text, '')) LIKE $${tagsLike} AND LOWER(COALESCE(tags::text, '')) NOT LIKE $${tagsNeg})`
    );
    params.push(`%${term}%`, `%sin ${term}%`, `%${term}%`, `%sin ${term}%`);
  }

  return {
    whereSql: whereClauses.join(' AND '),
    params,
    normalizedAllergens: [...allergenTerms]
  };
}

export function buildFoodFiltersFromUserPreferences(userPreferences = {}) {
  const preferencias = parseJsonObject(userPreferences.preferencias, {});
  const alergias = normalizeStringArray(userPreferences.alergias);

  const allergensExclude = [...alergias];
  if (preferencias.sin_gluten) {
    allergensExclude.push('gluten');
  }
  if (preferencias.sin_lactosa) {
    allergensExclude.push('lactosa', 'lacteo', 'lacteos', 'lácteo', 'lácteos');
  }

  const diet = preferencias.vegano ? 'vegano' : (preferencias.vegetariano ? 'vegetariano' : 'omnivoro');

  return {
    diet,
    allergensExclude: [...new Set(allergensExclude.map((item) => String(item).trim()).filter(Boolean))],
    preferencias,
    alergias
  };
}

export function parseMealMacros(meal) {
  const rawMacros = parseJsonObject(meal?.macros, {});
  return {
    protein_g: parseNumeric(rawMacros.protein_g) ?? 0,
    carbs_g: parseNumeric(rawMacros.carbs_g) ?? 0,
    fat_g: parseNumeric(rawMacros.fat_g) ?? 0
  };
}

export function normalizeTemplateContext(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return 'AMBOS';
  if (raw === 'MANTENIMIENTO') return 'NORMO';
  return raw;
}

export function resolvePhaseContext(profile) {
  const phaseRaw = String(profile?.current_phase || profile?.objetivo || '').trim().toLowerCase();
  if (phaseRaw.includes('defin') || phaseRaw === 'cut') return 'DEFINICION';
  if (phaseRaw.includes('volum') || phaseRaw === 'bulk') return 'VOLUMEN';
  if (phaseRaw.includes('normo') || phaseRaw.includes('maint')) return 'NORMO';
  return null;
}

export function resolveMealType(meal) {
  const explicitMealType = String(meal?.meal_type || '').trim().toUpperCase();
  if (['DESAYUNO', 'SNACK', 'COMIDA', 'CENA'].includes(explicitMealType)) {
    return explicitMealType;
  }

  const mealName = String(meal?.nombre || '').trim().toLowerCase();
  if (mealName === 'primera comida') return 'COMIDA';
  if (mealName === 'segunda comida') return 'CENA';
  if (mealName.includes('desay')) return 'DESAYUNO';
  if (mealName.includes('cena')) return 'CENA';
  if (mealName.includes('almuerzo')) return 'SNACK';
  if (mealName.includes('comida')) return 'COMIDA';
  if (mealName.includes('snack') || mealName.includes('merienda')) return 'SNACK';

  switch (Number.parseInt(meal?.orden, 10)) {
    case 1: return 'DESAYUNO';
    case 2: return 'SNACK';
    case 3: return 'COMIDA';
    case 4: return 'SNACK';
    case 5: return 'CENA';
    default: return 'SNACK';
  }
}

export function resolveSnackSlotTag(meal) {
  const mealName = String(meal?.nombre || '').trim().toLowerCase();
  if (mealName.includes('almuerzo')) return 'slot:almuerzo';
  if (mealName.includes('merienda')) return 'slot:merienda';

  const order = Number.parseInt(meal?.orden, 10);
  if (order === 2) return 'slot:almuerzo';
  if (order === 4) return 'slot:merienda';
  if (order >= 5) return 'slot:merienda';
  return null;
}

export function buildMealSelectionSeedSuffix(meal) {
  const mealName = normalizeFoodName(meal?.nombre || '');
  const mealOrder = Number.parseInt(meal?.orden, 10);
  return `${Number.isFinite(mealOrder) ? mealOrder : 0}|${mealName || 'meal'}`;
}

export function extractFoodTagsSet(food) {
  const tags = Array.isArray(food?.tags) ? food.tags : normalizeStringArray(food?.tags);
  return new Set(tags.map((tag) => String(tag || '').trim().toLowerCase()).filter(Boolean));
}

export function matchesFoodFilters(food, userFoodFilters) {
  if (!food) return false;
  const diet = userFoodFilters?.diet || 'omnivoro';
  if (diet === 'vegano' && !food.is_vegan) return false;
  if (diet === 'vegetariano' && !food.is_vegetarian) return false;

  const allergens = normalizeStringArray(userFoodFilters?.allergensExclude);
  if (allergens.length === 0) return true;

  // Detección semántica: revisa NOMBRE y tags contra el alérgeno y sus derivados
  // (soja→natto/tofu/tempeh/miso...), no solo el tag literal. Un tag incompleto
  // en el catálogo ya no deja pasar un alimento peligroso. (C-01)
  const foodTags = Array.isArray(food?.tags) ? food.tags : normalizeStringArray(food?.tags);
  for (const allergen of allergens) {
    if (foodTriggersAllergen(food?.nombre, foodTags, allergen)) {
      return false;
    }
  }

  return true;
}

export function evaluateCandidateMealBalance(items, mealMacros, mealKcalTarget) {
  const balanceEval = evaluateMealNutrientBalance(items, {
    protein_g: mealMacros?.protein_g,
    carbs_g: mealMacros?.carbs_g,
    fat_g: mealMacros?.fat_g,
    kcal: mealKcalTarget
  });

  const blockingCodes = new Set([
    'low_protein_from_protein_roles',
    'low_carbs_from_carbo_roles',
    'low_fat_from_grasa_roles',
    'high_kcal_from_verduras',
    'vegetal_grams_too_high'
  ]);
  const blockingWarnings = balanceEval.warnings.filter((warning) => blockingCodes.has(warning.code));
  const nonBlockingWarnings = balanceEval.warnings.filter((warning) => !blockingCodes.has(warning.code));

  return {
    ...balanceEval,
    blockingWarnings,
    nonBlockingWarnings,
    blocksCandidate: blockingWarnings.length > 0,
    penaltyScore: Number(((blockingWarnings.length * 10) + (nonBlockingWarnings.length * 2.5)).toFixed(4))
  };
}
