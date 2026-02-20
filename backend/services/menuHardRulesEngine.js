const MEAL_KEY_BY_TYPE = {
  DESAYUNO: "desayuno",
  COMIDA: "comida",
  CENA: "cena",
  SNACK: "snack"
};

const MAIN_MEAL_TYPES = new Set(["COMIDA", "CENA"]);
const PROCESSED_LEVELS = new Set(["procesado", "ultraprocesado"]);
const VALID_PROCESSING_LEVELS = new Set(["minimo", "procesado", "ultraprocesado"]);
const MEAL_CONTEXTS = new Set(["DESAYUNO", "COMIDA", "CENA", "SNACK"]);

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function parseMealSuitability(rawValue) {
  if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
    return rawValue;
  }

  if (typeof rawValue === "string") {
    try {
      const parsed = JSON.parse(rawValue);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function normalizeStringArray(rawValue) {
  if (Array.isArray(rawValue)) {
    return [...new Set(rawValue.map((item) => normalizeText(item)).filter(Boolean))];
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return normalizeStringArray(parsed);
      }
    } catch {
      return trimmed
        .split(",")
        .map((item) => normalizeText(item))
        .filter(Boolean);
    }
  }

  return [];
}

function normalizePairingContexts(rawValue) {
  const contexts = normalizeStringArray(rawValue).map((value) => value.toUpperCase());
  if (contexts.length === 0) {
    return ["DESAYUNO", "COMIDA", "CENA", "SNACK"];
  }
  return contexts.filter((value) => MEAL_CONTEXTS.has(value));
}

function buildRecipeFoodSlugSet(recipeItems = []) {
  return new Set(
    recipeItems
      .map((entry) => normalizeText(entry?.food?.slug))
      .filter(Boolean)
  );
}

function isMainDishRole(roleValue) {
  const role = String(roleValue || "").toUpperCase();
  if (!role) return false;
  if (
    role.includes("GRASA")
    || role === "VERDURA"
    || role === "FRUTA"
    || role === "BEBIDA"
    || role.includes("CONDIMENTO")
    || role.includes("SALSA")
  ) {
    return false;
  }
  return true;
}

function inferCulinaryFamily(food = {}) {
  const explicit = normalizeText(food.culinary_family);
  if (explicit) return explicit;

  const nombre = normalizeText(food.nombre);
  const categoria = normalizeText(food.categoria);
  const detalle = normalizeText(food.categoria_detalle);

  if (nombre.includes("barrita") || nombre.includes("galleta")) return "snack_dulce";
  if (nombre.includes("crema de cacao") || nombre.includes("untable")) return "untable_industrial";
  if (nombre.includes("margarina")) return "untable_industrial";
  if (nombre.includes("bagel") || nombre.includes("pan")) return "pan";
  if (nombre.includes("arroz") || nombre.includes("pasta") || nombre.includes("quinoa")) return "cereal";
  if (nombre.includes("patata") || nombre.includes("boniato") || nombre.includes("yuca")) return "tuberculo";
  if (nombre.includes("aceite")) return "aceite";
  if (nombre.includes("proteina") || nombre.includes("whey") || nombre.includes("gainer")) return "suplemento";

  if (categoria === "vegetal") return "verdura";
  if (categoria === "fruta") return "fruta";
  if (categoria === "grasa") return "grasa";
  if (categoria === "lacteo") return "lacteo";
  if (categoria === "proteina") {
    if (food.is_vegan === true || detalle.includes("vegetal")) return "proteina_vegetal";
    if (detalle.includes("huevo")) return "huevo";
    return "proteina_animal";
  }
  if (detalle.includes("proteina animal")) return "proteina_animal";
  if (detalle.includes("proteina vegetal")) return "proteina_vegetal";
  if (detalle.includes("huevo")) return "huevo";
  if (detalle.includes("legumbre")) return "legumbre";

  return "general";
}

function inferMealSuitability(food = {}) {
  const suitability = {
    desayuno: true,
    comida: true,
    cena: true,
    snack: true
  };

  const family = inferCulinaryFamily(food);
  const isSnackOnly = Boolean(food.is_snack_only);

  if (isSnackOnly || family === "snack_dulce" || family === "suplemento" || family === "untable_industrial") {
    suitability.comida = false;
    suitability.cena = false;
    suitability.snack = true;
  }

  return suitability;
}

function resolveMealSuitability(food = {}) {
  const inferred = inferMealSuitability(food);
  const explicit = parseMealSuitability(food.meal_suitability);
  if (!explicit) {
    return inferred;
  }

  const merged = { ...inferred };
  ["desayuno", "comida", "cena", "snack"].forEach((key) => {
    if (typeof explicit[key] === "boolean") {
      merged[key] = explicit[key];
    }
  });

  if (food.is_snack_only === true) {
    merged.comida = false;
    merged.cena = false;
  }

  return merged;
}

export function normalizeProcessingLevel(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "minimo";
  if (VALID_PROCESSING_LEVELS.has(normalized)) return normalized;
  return "minimo";
}

export function isProcessedFood(food = {}) {
  const level = normalizeProcessingLevel(food.processing_level);
  return PROCESSED_LEVELS.has(level);
}

function evaluateFoodForMeal({ food, role, mealType }) {
  const reasons = [];
  const mealKey = MEAL_KEY_BY_TYPE[mealType] || "snack";
  const suitability = resolveMealSuitability(food);
  const family = inferCulinaryFamily(food);
  const processingLevel = normalizeProcessingLevel(food.processing_level);
  const snackOnly = Boolean(food.is_snack_only);
  const mainDishAllowed = food.is_main_dish_allowed == null ? true : Boolean(food.is_main_dish_allowed);
  const mainRole = isMainDishRole(role);

  if (suitability[mealKey] === false) {
    reasons.push("meal_suitability_blocked");
  }

  if (MAIN_MEAL_TYPES.has(mealType) && snackOnly) {
    reasons.push("snack_only_in_main_meal");
  }

  if (MAIN_MEAL_TYPES.has(mealType) && mainRole && !mainDishAllowed) {
    reasons.push("main_dish_not_allowed");
  }

  if (MAIN_MEAL_TYPES.has(mealType) && mainRole && processingLevel === "ultraprocesado") {
    reasons.push("ultraprocessed_main_role");
  }

  if (
    MAIN_MEAL_TYPES.has(mealType)
    && mainRole
    && (family === "snack_dulce" || family === "untable_industrial")
  ) {
    reasons.push("snack_family_in_main_meal");
  }

  return {
    reasons,
    family,
    role,
    isMainRole: mainRole
  };
}

export function evaluateRecipeHardRules({
  mealType,
  recipeCode,
  recipeItems,
  varietyContext = null,
  maxProcessedItemsPerDay = 1,
  mealAcceptabilityRule = null,
  pairingRules = []
}) {
  const blockedRules = [];
  const processedFoodIdsInRecipe = new Set();
  const presentFamilies = new Set();
  const mainRoleFamilies = new Set();
  const recipeFoodSlugs = buildRecipeFoodSlugSet(recipeItems);
  const forbiddenFamilies = new Set(normalizeStringArray(mealAcceptabilityRule?.forbidden_families));
  const requiredFamilies = normalizeStringArray(mealAcceptabilityRule?.required_families);
  const configuredMaxProcessedItems = Number.parseInt(mealAcceptabilityRule?.max_processed_items, 10);
  const processedLimit = Number.isFinite(configuredMaxProcessedItems)
    ? configuredMaxProcessedItems
    : maxProcessedItemsPerDay;

  for (const entry of recipeItems || []) {
    const role = String(entry?.role || "").toUpperCase();
    const food = entry?.food || null;
    if (!food) {
      blockedRules.push({
        code: "missing_food_data",
        recipe_code: recipeCode,
        meal_type: mealType,
        role
      });
      continue;
    }

    const evaluation = evaluateFoodForMeal({ food, role, mealType });
    for (const code of evaluation.reasons) {
      blockedRules.push({
        code,
        recipe_code: recipeCode,
        meal_type: mealType,
        role,
        food_id: food.id,
        food_name: food.nombre
      });
    }

    const family = evaluation.family;
    if (family) {
      presentFamilies.add(family);
      if (evaluation.isMainRole) {
        mainRoleFamilies.add(family);
      }
    }

    if (forbiddenFamilies.size > 0 && family && forbiddenFamilies.has(family)) {
      blockedRules.push({
        code: "forbidden_family_by_rule",
        recipe_code: recipeCode,
        meal_type: mealType,
        role,
        food_id: food.id,
        food_name: food.nombre,
        family
      });
    }

    if (isProcessedFood(food)) {
      processedFoodIdsInRecipe.add(String(food.id || food.slug || food.nombre || ""));
    }
  }

  if (requiredFamilies.length > 0) {
    const hasAnyRequiredFamily = requiredFamilies.some((family) => {
      if (presentFamilies.has(family)) return true;
      return mainRoleFamilies.has(family);
    });

    if (!hasAnyRequiredFamily) {
      blockedRules.push({
        code: "missing_required_family",
        recipe_code: recipeCode,
        meal_type: mealType,
        required_families: requiredFamilies
      });
    }
  }

  if (Array.isArray(pairingRules) && pairingRules.length > 0 && recipeFoodSlugs.size > 1) {
    pairingRules.forEach((rule) => {
      const normalizedType = normalizeText(rule?.rule_type);
      if (normalizedType !== "forbidden") return;

      const contexts = normalizePairingContexts(rule?.contexts);
      if (contexts.length > 0 && !contexts.includes(String(mealType || "").toUpperCase())) {
        return;
      }

      const slugA = normalizeText(rule?.food_slug_a);
      const slugB = normalizeText(rule?.food_slug_b);
      if (!slugA || !slugB) return;

      if (recipeFoodSlugs.has(slugA) && recipeFoodSlugs.has(slugB)) {
        blockedRules.push({
          code: "forbidden_pairing_rule",
          recipe_code: recipeCode,
          meal_type: mealType,
          pairing_rule_id: rule?.id || null,
          food_slug_a: slugA,
          food_slug_b: slugB,
          reason: rule?.reason || null
        });
      }
    });
  }

  if (Number.isFinite(processedLimit) && processedLimit >= 0) {
    const currentProcessedCount = varietyContext?.sameDayProcessedFoodIds?.size || 0;
    const projectedProcessedCount = currentProcessedCount + processedFoodIdsInRecipe.size;
    if (projectedProcessedCount > processedLimit) {
      blockedRules.push({
        code: "daily_processed_limit",
        recipe_code: recipeCode,
        meal_type: mealType,
        current_processed_count: currentProcessedCount,
        recipe_processed_count: processedFoodIdsInRecipe.size,
        max_processed_items_per_day: processedLimit
      });
    }
  }

  return {
    isAllowed: blockedRules.length === 0,
    blockedRules,
    processedItemsInRecipe: processedFoodIdsInRecipe.size
  };
}

export function computePairingPenaltyForRecipe({
  mealType,
  recipeItems,
  pairingRules = []
}) {
  const mealContext = String(mealType || "").toUpperCase();
  const recipeFoodSlugs = buildRecipeFoodSlugSet(recipeItems);
  const appliedPenaltyRules = [];
  let totalPenalty = 0;

  if (recipeFoodSlugs.size < 2 || !Array.isArray(pairingRules) || pairingRules.length === 0) {
    return {
      totalPenalty: 0,
      appliedPenaltyRules
    };
  }

  const seenRules = new Set();

  pairingRules.forEach((rule) => {
    const normalizedType = normalizeText(rule?.rule_type);
    if (normalizedType !== "penalty") return;

    const contexts = normalizePairingContexts(rule?.contexts);
    if (contexts.length > 0 && !contexts.includes(mealContext)) {
      return;
    }

    const slugA = normalizeText(rule?.food_slug_a);
    const slugB = normalizeText(rule?.food_slug_b);
    if (!slugA || !slugB) return;
    if (!recipeFoodSlugs.has(slugA) || !recipeFoodSlugs.has(slugB)) return;

    const dedupeKey = String(rule?.id || `${slugA}|${slugB}|${rule?.reason || ""}`);
    if (seenRules.has(dedupeKey)) return;
    seenRules.add(dedupeKey);

    const rawPenalty = Number.parseFloat(rule?.penalty);
    const penalty = Number.isFinite(rawPenalty) && rawPenalty > 0 ? rawPenalty : 0;
    if (penalty <= 0) return;

    totalPenalty += penalty;
    appliedPenaltyRules.push({
      id: rule?.id || null,
      food_slug_a: slugA,
      food_slug_b: slugB,
      penalty,
      reason: rule?.reason || null
    });
  });

  return {
    totalPenalty: Number(totalPenalty.toFixed(4)),
    appliedPenaltyRules
  };
}
