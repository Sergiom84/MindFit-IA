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

function classifyVegetableItem(item = {}) {
  const normalizedName = normalizeText(item?.alimento_nombre || item?.food_name || item?.food_slug || item?.descripcion || "");
  const leafyKeywords = [
    "rucula",
    "lechuga",
    "espinaca",
    "canonigo",
    "canongo",
    "berro",
    "escarola",
    "endibia",
    "acelga",
    "hoja verde"
  ];
  const denseKeywords = [
    "zanahoria",
    "remolacha",
    "brocoli",
    "coliflor",
    "calabacin",
    "berenjena",
    "pimiento",
    "cebolla",
    "tomate",
    "pepino",
    "esparrago",
    "seta",
    "champi",
    "judia verde",
    "calabaza"
  ];

  if (leafyKeywords.some((keyword) => normalizedName.includes(keyword))) {
    return { type: "leafy", minGrams: 30, maxGrams: 80 };
  }

  if (denseKeywords.some((keyword) => normalizedName.includes(keyword))) {
    return { type: "dense", minGrams: 80, maxGrams: 150 };
  }

  return { type: "generic", minGrams: 50, maxGrams: 150 };
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

export function evaluateMealNutrientBalance(items, mealTargets) {
  const warnings = [];
  const targetProtein = Number(mealTargets?.protein_g) || 0;
  const targetCarbs = Number(mealTargets?.carbs_g) || 0;
  const targetFat = Number(mealTargets?.fat_g) || 0;
  const targetKcal = Number(mealTargets?.kcal) || 0;
  const safeItems = items || [];

  // 1) Proteina principal debe aportar 60-80% de proteina objetivo
  if (targetProtein > 0) {
    const proteinFromProteinRoles = safeItems
      .filter((item) => String(item?.role || "").toUpperCase().includes("PROTEINA"))
      .reduce((sum, item) => sum + (Number(item?.macros?.protein_g) || 0), 0);

    if (proteinFromProteinRoles < targetProtein * 0.6) {
      warnings.push({
        code: "low_protein_from_protein_roles",
        actual_g: Number(proteinFromProteinRoles.toFixed(1)),
        target_g: targetProtein,
        threshold_pct: 60
      });
    }

    if (proteinFromProteinRoles > targetProtein * 0.8) {
      warnings.push({
        code: "high_protein_from_protein_roles",
        actual_g: Number(proteinFromProteinRoles.toFixed(1)),
        target_g: targetProtein,
        threshold_pct: 80
      });
    }
  }

  // 2) Hidrato base debe aportar 80-95% de carbs objetivo
  if (targetCarbs > 0) {
    const carbsFromCarboRoles = safeItems
      .filter((item) => {
        const role = String(item?.role || "").toUpperCase();
        return role.includes("CARBO") || role.includes("LEGUMBRE");
      })
      .reduce((sum, item) => sum + (Number(item?.macros?.carbs_g) || 0), 0);

    if (carbsFromCarboRoles < targetCarbs * 0.8) {
      warnings.push({
        code: "low_carbs_from_carbo_roles",
        actual_g: Number(carbsFromCarboRoles.toFixed(1)),
        target_g: targetCarbs,
        threshold_pct: 80
      });
    }

    if (carbsFromCarboRoles > targetCarbs * 0.95) {
      warnings.push({
        code: "high_carbs_from_carbo_roles",
        actual_g: Number(carbsFromCarboRoles.toFixed(1)),
        target_g: targetCarbs,
        threshold_pct: 95
      });
    }
  }

  // 3) Verduras <= 15% kcal comida + topes por gramaje
  if (targetKcal > 0) {
    const kcalFromVerduras = safeItems
      .filter((item) => String(item?.role || "").toUpperCase().includes("VERDURA"))
      .reduce((sum, item) => sum + (Number(item?.kcal) || 0), 0);

    if (kcalFromVerduras > targetKcal * 0.15) {
      warnings.push({
        code: "high_kcal_from_verduras",
        actual_kcal: Number(kcalFromVerduras.toFixed(1)),
        target_kcal: targetKcal,
        threshold_pct: 15
      });
    }
  }

  // Topes gramaje por vegetal individual
  safeItems.forEach((item) => {
    const role = String(item?.role || "").toUpperCase();
    if (!role.includes("VERDURA")) return;
    const grams = Number(item?.cantidad_g) || Number(item?.cantidad_g_base) || 0;
    const vegetableProfile = classifyVegetableItem(item);
    if (grams > vegetableProfile.maxGrams) {
      warnings.push({
        code: "vegetal_grams_too_high",
        food_name: item?.alimento_nombre || "desconocido",
        actual_g: grams,
        max_g: vegetableProfile.maxGrams,
        vegetable_type: vegetableProfile.type
      });
    }
  });

  // 4) Grasa anadida debe aportar 60-90% de fat objetivo
  if (targetFat > 0) {
    const fatFromGrasaRoles = safeItems
      .filter((item) => String(item?.role || "").toUpperCase().includes("GRASA"))
      .reduce((sum, item) => sum + (Number(item?.macros?.fat_g) || 0), 0);

    if (fatFromGrasaRoles < targetFat * 0.6) {
      warnings.push({
        code: "low_fat_from_grasa_roles",
        actual_g: Number(fatFromGrasaRoles.toFixed(1)),
        target_g: targetFat,
        threshold_pct: 60
      });
    }

    if (fatFromGrasaRoles > targetFat * 0.9) {
      warnings.push({
        code: "high_fat_from_grasa_roles",
        actual_g: Number(fatFromGrasaRoles.toFixed(1)),
        target_g: targetFat,
        threshold_pct: 90
      });
    }
  }

  return { warnings, hasWarnings: warnings.length > 0 };
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
