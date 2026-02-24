function parseNumeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(",", ".").replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseJsonObject(value, fallback = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function percentError(actual, target) {
  const safeTarget = parseNumeric(target);
  if (safeTarget <= 0) return 0;
  return Number((((Math.abs(actual - safeTarget)) / safeTarget) * 100).toFixed(2));
}

function inferRoleAndBounds(food) {
  const macros100 = parseJsonObject(food?.macros_100g, {});
  const protein = Math.max(0, parseNumeric(macros100.protein_g));
  const carbs = Math.max(0, parseNumeric(macros100.carbs_g));
  const fat = Math.max(0, parseNumeric(macros100.fat_g));
  const porcionTipica = parseNumeric(food?.porcion_tipica_g);

  if (fat >= protein && fat >= carbs && fat >= 12) {
    return { role: "GRASA_BASE", min: 3, max: 40 };
  }
  if (protein >= carbs && protein >= fat && protein >= 12) {
    return { role: "PROTEINA_BASE", min: 40, max: 280 };
  }
  if (carbs >= protein && carbs >= fat && carbs >= 12) {
    return { role: "CARBO_BASE", min: 40, max: 330 };
  }
  const verduraBase = { min: 50, max: 220 };
  if (porcionTipica > 0) {
    const min = Math.max(verduraBase.min, Math.round(porcionTipica * 0.35));
    const max = Math.min(verduraBase.max, Math.round(porcionTipica * 1.0));
    return { role: "VERDURA_BASE", min, max: Math.max(max, min) };
  }
  return { role: "VERDURA_BASE", ...verduraBase };
}

function buildConversionMap(conversionFactors = []) {
  const conversionMap = new Map();
  for (const factor of conversionFactors) {
    const groupFactor = String(factor?.grupo_factor || "").toLowerCase();
    const estadoBase = String(factor?.estado_base || "").toLowerCase();
    const estadoObjetivo = String(factor?.estado_objetivo || "").toLowerCase();
    const key = `${groupFactor}|${estadoBase}|${estadoObjetivo}`;
    const value = parseNumeric(factor?.factor_base_objetivo);
    if (value > 0) {
      conversionMap.set(key, value);
    }
  }
  return conversionMap;
}

function normalizeEstado(value) {
  const normalized = String(value || "tal_cual")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (normalized === "talcual") return "tal_cual";
  return normalized || "tal_cual";
}

function resolveShownStateConversion({
  grupoFactor,
  estadoBase,
  estadoMostrado,
  conversionMap
}) {
  const base = normalizeEstado(estadoBase);
  const shownRequested = normalizeEstado(estadoMostrado || base);

  if (shownRequested === base) {
    return {
      estadoMostradoFinal: base,
      factor: 1,
      blockedReason: null
    };
  }

  if (base === "tal_cual") {
    return {
      estadoMostradoFinal: base,
      factor: 1,
      blockedReason: "tal_cual_no_convertible"
    };
  }

  const normalizedGroup = String(grupoFactor || "").trim().toLowerCase();
  if (!normalizedGroup) {
    return {
      estadoMostradoFinal: base,
      factor: 1,
      blockedReason: "missing_group_factor"
    };
  }

  const key = `${normalizedGroup}|${base}|${shownRequested}`;
  const factor = conversionMap.get(key);
  if (!(factor > 0)) {
    return {
      estadoMostradoFinal: base,
      factor: 1,
      blockedReason: "missing_conversion_factor"
    };
  }

  return {
    estadoMostradoFinal: shownRequested,
    factor,
    blockedReason: null
  };
}

function optimizeGrams({ foodsDraft, goals, iterations = 120 }) {
  const grams = foodsDraft.map((draft) => clampNumber(draft.initial_grams, draft.bounds.min, draft.bounds.max));

  const totals = { protein: 0, carbs: 0, fat: 0, kcal: 0 };
  foodsDraft.forEach((draft, idx) => {
    const g = grams[idx];
    totals.protein += draft.perGram.protein * g;
    totals.carbs += draft.perGram.carbs * g;
    totals.fat += draft.perGram.fat * g;
    totals.kcal += draft.perGram.kcal * g;
  });

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let moved = false;

    for (let index = 0; index < foodsDraft.length; index += 1) {
      const draft = foodsDraft[index];
      const oldValue = grams[index];

      const without = {
        protein: totals.protein - (draft.perGram.protein * oldValue),
        carbs: totals.carbs - (draft.perGram.carbs * oldValue),
        fat: totals.fat - (draft.perGram.fat * oldValue),
        kcal: totals.kcal - (draft.perGram.kcal * oldValue)
      };

      let numerator = 0;
      let denominator = 0;

      for (const goal of goals) {
        const perGram = draft.perGram[goal.key];
        if (!Number.isFinite(perGram) || perGram === 0) continue;

        const c = goal.weight / (goal.scale * goal.scale);
        const b = without[goal.key] - goal.target;
        numerator += c * perGram * b;
        denominator += c * perGram * perGram;
      }

      let nextValue = oldValue;
      if (denominator > 0) {
        nextValue = -numerator / denominator;
      }

      nextValue = clampNumber(nextValue, draft.bounds.min, draft.bounds.max);

      if (Math.abs(nextValue - oldValue) > 0.25) {
        moved = true;
      }

      grams[index] = nextValue;
      totals.protein = without.protein + (draft.perGram.protein * nextValue);
      totals.carbs = without.carbs + (draft.perGram.carbs * nextValue);
      totals.fat = without.fat + (draft.perGram.fat * nextValue);
      totals.kcal = without.kcal + (draft.perGram.kcal * nextValue);
    }

    if (!moved) {
      break;
    }
  }

  return grams.map((value) => Number(value.toFixed(2)));
}

function buildGoals(meal) {
  const mealMacros = parseJsonObject(meal?.macros, {});
  const targetProtein = parseNumeric(mealMacros.protein_g);
  const targetCarbs = parseNumeric(mealMacros.carbs_g);
  const targetFat = parseNumeric(mealMacros.fat_g);
  const targetKcal = parseNumeric(meal?.kcal);

  const goals = [];
  if (targetProtein > 0) {
    goals.push({ key: "protein", target: targetProtein, weight: 2.5, scale: Math.max(15, targetProtein) });
  }
  if (targetCarbs > 0) {
    goals.push({ key: "carbs", target: targetCarbs, weight: 2.0, scale: Math.max(20, targetCarbs) });
  }
  if (targetFat > 0) {
    goals.push({ key: "fat", target: targetFat, weight: 1.8, scale: Math.max(8, targetFat) });
  }
  if (targetKcal > 0) {
    goals.push({ key: "kcal", target: targetKcal, weight: 0.45, scale: Math.max(120, targetKcal) });
  }

  return {
    goals,
    targets: {
      kcal: targetKcal,
      protein: targetProtein,
      carbs: targetCarbs,
      fat: targetFat
    }
  };
}

function buildDraftFoods(selectedFoods, meal) {
  const mealMacros = parseJsonObject(meal?.macros, {});
  const targetProtein = parseNumeric(mealMacros.protein_g);
  const targetCarbs = parseNumeric(mealMacros.carbs_g);
  const targetFat = parseNumeric(mealMacros.fat_g);
  const totalTarget = Math.max(1, targetProtein + targetCarbs + targetFat);

  const ratios = {
    protein: targetProtein / totalTarget,
    carbs: targetCarbs / totalTarget,
    fat: targetFat / totalTarget
  };

  return selectedFoods.map((food) => {
    const macros100 = parseJsonObject(food?.macros_100g, {});
    const proteinPerGram = parseNumeric(macros100.protein_g) / 100;
    const carbsPerGram = parseNumeric(macros100.carbs_g) / 100;
    const fatPerGram = parseNumeric(macros100.fat_g) / 100;

    const kcalPer100 = parseNumeric(macros100.kcal);
    const kcalPerGram = kcalPer100 > 0
      ? (kcalPer100 / 100)
      : ((proteinPerGram * 4) + (carbsPerGram * 4) + (fatPerGram * 9));

    const boundsData = inferRoleAndBounds(food);

    const estimations = [];
    if (proteinPerGram > 0 && ratios.protein > 0) {
      estimations.push((targetProtein * ratios.protein) / proteinPerGram);
    }
    if (carbsPerGram > 0 && ratios.carbs > 0) {
      estimations.push((targetCarbs * ratios.carbs) / carbsPerGram);
    }
    if (fatPerGram > 0 && ratios.fat > 0) {
      estimations.push((targetFat * ratios.fat) / fatPerGram);
    }

    const initial = estimations.length > 0
      ? estimations.reduce((acc, value) => acc + value, 0) / estimations.length
      : (kcalPerGram > 0 ? parseNumeric(meal?.kcal) / (selectedFoods.length * kcalPerGram) : 40);

    return {
      food,
      role: boundsData.role,
      bounds: { min: boundsData.min, max: boundsData.max },
      perGram: {
        protein: proteinPerGram,
        carbs: carbsPerGram,
        fat: fatPerGram,
        kcal: kcalPerGram
      },
      initial_grams: clampNumber(initial, boundsData.min, boundsData.max)
    };
  });
}

export function solveHybridMenu({ meal, selectedFoods, conversionFactors = [] }) {
  if (!Array.isArray(selectedFoods) || selectedFoods.length === 0) {
    throw new Error("No hay alimentos seleccionados para solver híbrido");
  }

  const draftFoods = buildDraftFoods(selectedFoods, meal);
  const { goals, targets } = buildGoals(meal);

  const grams = optimizeGrams({
    foodsDraft: draftFoods,
    goals
  });

  const conversionMap = buildConversionMap(conversionFactors);

  const items = draftFoods.map((draft, index) => {
    const gramsBase = grams[index];

    const estadoBase = normalizeEstado(draft.food?.estado_pesado_base || "tal_cual");
    const estadoMostradoRequested = normalizeEstado(
      draft.food?.estado_pesado_mostrado_default
      || draft.food?.estado_pesado_base
      || "tal_cual"
    );
    const conversionState = resolveShownStateConversion({
      grupoFactor: draft.food?.grupo_factor,
      estadoBase,
      estadoMostrado: estadoMostradoRequested,
      conversionMap
    });
    const estadoMostrado = conversionState.estadoMostradoFinal;
    const gramsShown = Number((gramsBase * conversionState.factor).toFixed(1));

    const protein = draft.perGram.protein * gramsBase;
    const carbs = draft.perGram.carbs * gramsBase;
    const fat = draft.perGram.fat * gramsBase;
    const kcal = draft.perGram.kcal * gramsBase;

    return {
      alimento_nombre: draft.food.nombre,
      food_id: draft.food.id,
      food_slug: draft.food.slug,
      role: draft.role,
      estado_pesado_base: estadoBase,
      estado_pesado_mostrado: estadoMostrado,
      conversion_blocked_reason: conversionState.blockedReason,
      cantidad_g_base: Number(gramsBase.toFixed(1)),
      cantidad_g_mostrada: gramsShown,
      cantidad_g: gramsShown,
      kcal: Number(kcal.toFixed(2)),
      macros: {
        protein_g: Number(protein.toFixed(2)),
        carbs_g: Number(carbs.toFixed(2)),
        fat_g: Number(fat.toFixed(2))
      }
    };
  });

  const totals = items.reduce((acc, item) => {
    acc.kcal += item.kcal;
    acc.protein += item.macros.protein_g;
    acc.carbs += item.macros.carbs_g;
    acc.fat += item.macros.fat_g;
    return acc;
  }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });

  const validation = {
    kcal_total: Number(totals.kcal.toFixed(2)),
    macros_totales: {
      protein_g: Number(totals.protein.toFixed(2)),
      carbs_g: Number(totals.carbs.toFixed(2)),
      fat_g: Number(totals.fat.toFixed(2))
    },
    error_kcal_porcentaje: percentError(totals.kcal, targets.kcal),
    error_protein_porcentaje: percentError(totals.protein, targets.protein),
    error_carbs_porcentaje: percentError(totals.carbs, targets.carbs),
    error_fat_porcentaje: percentError(totals.fat, targets.fat)
  };

  return {
    menu: {
      items,
      instrucciones: "Menú generado con IA y ajustado automáticamente por motor determinista.",
      notas: "Se priorizó variedad y coherencia de macros con ajuste fino de gramos.",
      validacion: validation
    },
    metadata: {
      max_error: Math.max(
        validation.error_kcal_porcentaje,
        validation.error_protein_porcentaje,
        validation.error_carbs_porcentaje,
        validation.error_fat_porcentaje
      ),
      items_count: items.length
    }
  };
}
