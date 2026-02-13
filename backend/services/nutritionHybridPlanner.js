import { getOpenAIClient } from "../lib/openaiClient.js";

const DEFAULT_NUTRITION_HYBRID_MODEL = process.env.NUTRITION_HYBRID_MODEL || "gpt-5.2";
const DEFAULT_MAX_PLANNER_FOODS = 36;
const RELAXED_MAX_PLANNER_FOODS = 72;
const HYBRID_PLANNER_SYSTEM_PROMPT = [
  "Eres un planificador nutricional para un motor híbrido (IA + solver determinista).",
  "Tu objetivo principal es devolver una selección VIABLE para que el solver pueda cuadrar kcal/macros.",
  "Nunca inventes alimentos fuera del catálogo.",
  "Prioriza combinaciones realistas y culinariamente coherentes.",
  "Evita selecciones extremas (múltiples vegetales de bajo aporte sin base proteica/carb cuando no corresponda).",
  "Mantén variedad sin sacrificar viabilidad.",
  "Si no existe combinación mínimamente viable con los candidatos, devuelve status='infeasible' con motivo corto.",
  "Responde SOLO JSON válido, sin markdown y sin texto extra."
].join(" ");

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

function normalizeFoodName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function inferMealType(meal) {
  const mealName = String(meal?.nombre || "").toLowerCase();
  if (mealName.includes("desay")) return "desayuno";
  if (mealName.includes("almuerzo") || mealName.includes("comida")) return "comida";
  if (mealName.includes("cena")) return "cena";
  if (mealName.includes("meri") || mealName.includes("snack")) return "snack";
  return "comida";
}

function inferMealStructure(meal, mealType) {
  const mealMacros = parseJsonObject(meal?.macros, {});
  const targetProtein = parseNumeric(mealMacros.protein_g);
  const targetCarbs = parseNumeric(mealMacros.carbs_g);
  const targetFat = parseNumeric(mealMacros.fat_g);

  const notes = [];
  if (targetProtein >= 25) {
    notes.push("Incluir al menos 1 fuente proteica clara.");
  }
  if (targetCarbs >= 25) {
    notes.push("Incluir al menos 1 fuente principal de carbohidrato.");
  }
  if (targetFat >= 12) {
    notes.push("Incluir 1 fuente de grasa controlada.");
  }
  if (mealType === "desayuno" || mealType === "snack") {
    notes.push("Evitar combinaciones pesadas con demasiados ingredientes fibrosos.");
  }
  if (mealType === "comida" || mealType === "cena") {
    notes.push("Priorizar composición plato principal + acompañamiento.");
  }

  return notes;
}

function getDesiredItemsCount(meal) {
  const kcal = Math.max(0, parseNumeric(meal?.kcal));
  if (kcal <= 320) return 3;
  if (kcal <= 720) return 4;
  return 5;
}

function classifyMacroRole(food) {
  const macros100 = parseJsonObject(food?.macros_100g, {});
  const protein = Math.max(0, parseNumeric(macros100.protein_g));
  const carbs = Math.max(0, parseNumeric(macros100.carbs_g));
  const fat = Math.max(0, parseNumeric(macros100.fat_g));

  if (protein >= 15) return "protein";
  if (carbs >= 20) return "carbs";
  if (fat >= 12) return "fat";
  return "support";
}

function getRequiredMacroRoles(meal) {
  const mealMacros = parseJsonObject(meal?.macros, {});
  const required = new Set();
  if (parseNumeric(mealMacros.protein_g) >= 18) required.add("protein");
  if (parseNumeric(mealMacros.carbs_g) >= 20) required.add("carbs");
  if (parseNumeric(mealMacros.fat_g) >= 10) required.add("fat");
  return required;
}

function evaluateCandidateViability({ candidateFoods, meal }) {
  const required = getRequiredMacroRoles(meal);
  const available = new Set(candidateFoods.map((food) => classifyMacroRole(food)));
  const missing = [...required].filter((role) => !available.has(role));
  return {
    viable: missing.length === 0,
    missing_roles: missing
  };
}

function pickCandidateFoods({
  rankedFoods,
  availableFoods,
  meal,
  maxCandidateFoods
}) {
  const hardCap = Math.min(
    Math.max(8, maxCandidateFoods || DEFAULT_MAX_PLANNER_FOODS),
    Math.max(8, availableFoods.length)
  );

  let sliceSize = Math.min(hardCap, rankedFoods.length);
  let selected = rankedFoods.slice(0, sliceSize);
  let viability = evaluateCandidateViability({ candidateFoods: selected, meal });

  // Expansión automática para evitar falsos "infeasible" por pool demasiado estrecho.
  while (!viability.viable && sliceSize < rankedFoods.length && sliceSize < RELAXED_MAX_PLANNER_FOODS) {
    sliceSize = Math.min(rankedFoods.length, sliceSize + 12, RELAXED_MAX_PLANNER_FOODS);
    selected = rankedFoods.slice(0, sliceSize);
    viability = evaluateCandidateViability({ candidateFoods: selected, meal });
  }

  return {
    selectedCandidateFoods: selected,
    viability
  };
}

function scoreFoodForMealTarget(food, meal) {
  const mealMacros = parseJsonObject(meal?.macros, {});
  const targetProtein = Math.max(0, parseNumeric(mealMacros.protein_g));
  const targetCarbs = Math.max(0, parseNumeric(mealMacros.carbs_g));
  const targetFat = Math.max(0, parseNumeric(mealMacros.fat_g));
  const targetTotal = Math.max(1, targetProtein + targetCarbs + targetFat);

  const targetRatios = {
    protein: targetProtein / targetTotal,
    carbs: targetCarbs / targetTotal,
    fat: targetFat / targetTotal
  };

  const macros100 = parseJsonObject(food?.macros_100g, {});
  const protein = Math.max(0, parseNumeric(macros100.protein_g));
  const carbs = Math.max(0, parseNumeric(macros100.carbs_g));
  const fat = Math.max(0, parseNumeric(macros100.fat_g));
  const total = protein + carbs + fat;

  if (total <= 0) {
    return Number.MAX_SAFE_INTEGER;
  }

  const actualRatios = {
    protein: protein / total,
    carbs: carbs / total,
    fat: fat / total
  };

  const ratioError =
    Math.abs(actualRatios.protein - targetRatios.protein) * 1.4 +
    Math.abs(actualRatios.carbs - targetRatios.carbs) * 1.2 +
    Math.abs(actualRatios.fat - targetRatios.fat) * 1.2;

  return Number(ratioError.toFixed(6));
}

function getRecentVarietyPenalty(foodId, varietyContext) {
  if (!foodId || !varietyContext) return 0;
  const id = String(foodId);
  const sameDayPenalty = varietyContext?.sameDayUsedFoodIds?.has(id) ? 2.5 : 0;
  const recentUses = varietyContext?.recentFoodUsage?.get(id) || 0;
  return sameDayPenalty + (recentUses * 0.25);
}

function rankFoodsForPlanner(availableFoods, meal, varietyContext = null) {
  const ranked = [...availableFoods].map((food) => {
    const compatibilityScore = scoreFoodForMealTarget(food, meal);
    const varietyPenalty = getRecentVarietyPenalty(food?.id, varietyContext);
    return {
      food,
      score: Number((compatibilityScore + varietyPenalty).toFixed(6))
    };
  });

  ranked.sort((left, right) => {
    if (left.score !== right.score) {
      return left.score - right.score;
    }
    return String(left.food?.nombre || "").localeCompare(String(right.food?.nombre || ""), "es");
  });

  return ranked.map((item) => item.food);
}

function buildPlannerFoodSummary(foods) {
  return foods.map((food) => {
    const macros100 = parseJsonObject(food?.macros_100g, {});
    return {
      id: String(food.id),
      slug: String(food.slug || ""),
      name: food.nombre,
      category: food.categoria,
      detail: food.categoria_detalle || null,
      estado_base: food.estado_pesado_base || "tal_cual",
      estado_mostrado_default: food.estado_pesado_mostrado_default || food.estado_pesado_base || "tal_cual",
      macros_100g: {
        protein_g: Number(parseNumeric(macros100.protein_g).toFixed(2)),
        carbs_g: Number(parseNumeric(macros100.carbs_g).toFixed(2)),
        fat_g: Number(parseNumeric(macros100.fat_g).toFixed(2)),
        kcal: Number(parseNumeric(macros100.kcal).toFixed(2))
      }
    };
  });
}

export function parsePlannerJsonResponse(rawContent) {
  const text = String(rawContent || "").trim();
  if (!text) {
    throw new Error("Planner IA devolvió respuesta vacía");
  }

  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Planner IA no devolvió JSON válido");
    }
    return JSON.parse(jsonMatch[0]);
  }
}

function normalizePlannerStatus(value) {
  const status = String(value || "ok").trim().toLowerCase();
  if (status === "infeasible") return "infeasible";
  return "ok";
}

function normalizeSelectionEntries(parsedPlannerResponse) {
  if (Array.isArray(parsedPlannerResponse?.selection)) {
    return parsedPlannerResponse.selection;
  }

  if (Array.isArray(parsedPlannerResponse?.foods)) {
    return parsedPlannerResponse.foods;
  }

  if (Array.isArray(parsedPlannerResponse?.selected_food_ids)) {
    return parsedPlannerResponse.selected_food_ids;
  }

  return [];
}

export function normalizePlannerSelection({
  parsedPlannerResponse,
  availableFoods,
  rankedFoods,
  desiredItemsCount
}) {
  const byId = new Map();
  const bySlug = new Map();
  const byName = new Map();

  for (const food of availableFoods) {
    const id = String(food.id);
    const slug = String(food.slug || "").trim();
    byId.set(id, food);
    if (slug) bySlug.set(slug, food);
    byName.set(normalizeFoodName(food.nombre), food);
  }

  const normalizedSelection = [];
  const selectedIds = new Set();

  for (const rawEntry of normalizeSelectionEntries(parsedPlannerResponse)) {
    let entry = rawEntry;
    if (typeof rawEntry === "string") {
      entry = { food_id: rawEntry };
    }

    if (!entry || typeof entry !== "object") {
      continue;
    }

    const maybeId = entry.food_id || entry.id || entry.foodId || null;
    const maybeSlug = entry.food_slug || entry.slug || null;
    const maybeName = entry.food_name || entry.name || entry.alimento_nombre || null;

    let matched = null;
    if (maybeId && byId.has(String(maybeId))) {
      matched = byId.get(String(maybeId));
    } else if (maybeSlug && bySlug.has(String(maybeSlug))) {
      matched = bySlug.get(String(maybeSlug));
    } else if (maybeName && byName.has(normalizeFoodName(maybeName))) {
      matched = byName.get(normalizeFoodName(maybeName));
    }

    if (!matched) continue;

    const matchedId = String(matched.id);
    if (selectedIds.has(matchedId)) continue;

    selectedIds.add(matchedId);
    normalizedSelection.push({
      food: matched,
      reason: typeof entry.reason === "string" ? entry.reason.trim() : null
    });

    if (normalizedSelection.length >= desiredItemsCount) {
      break;
    }
  }

  for (const fallbackFood of rankedFoods) {
    const foodId = String(fallbackFood.id);
    if (selectedIds.has(foodId)) continue;

    selectedIds.add(foodId);
    normalizedSelection.push({
      food: fallbackFood,
      reason: "Completado por fallback determinista"
    });

    if (normalizedSelection.length >= desiredItemsCount) {
      break;
    }
  }

  return normalizedSelection;
}

function buildPlannerPrompt({
  meal,
  dayInfo,
  selectedCandidateFoods,
  desiredItemsCount,
  attempt = 1,
  solverFeedback = null,
  plannerMode = "strict"
}) {
  const mealType = inferMealType(meal);
  const mealMacros = parseJsonObject(meal?.macros, {});
  const mealStructure = inferMealStructure(meal, mealType);

  const targetKcal = parseNumeric(meal?.kcal);
  const targetProtein = parseNumeric(mealMacros.protein_g);
  const targetCarbs = parseNumeric(mealMacros.carbs_g);
  const targetFat = parseNumeric(mealMacros.fat_g);

  return [
    "Selecciona alimentos para una comida de un plan deportivo con foco en viabilidad para solver.",
    "Responde SOLO JSON válido.",
    "No inventes alimentos fuera del catálogo.",
    `Intento actual: ${attempt}`,
    `Modo planner: ${plannerMode}`,
    `Tipo de comida: ${mealType}`,
    `Tipo de día: ${dayInfo?.tipo_dia || "descanso"}`,
    `Objetivo kcal comida: ${targetKcal}`,
    `Objetivo macros comida: P ${targetProtein} / C ${targetCarbs} / G ${targetFat}`,
    `Debes seleccionar exactamente ${desiredItemsCount} alimentos del catálogo.`,
    "Reglas de viabilidad:",
    "- Selección equilibrada por rol (proteína/carb/grasa/vegetal según objetivo).",
    "- Evitar alimentos con macros casi nulos como base principal salvo 1 vegetal de soporte.",
    "- Evitar duplicados funcionales innecesarios.",
    "- Evitar combinaciones absurdas de volumen/cantidad implícita.",
    "Estructura recomendada para esta comida:",
    ...mealStructure.map((line) => `- ${line}`),
    solverFeedback ? `Feedback del intento anterior: ${solverFeedback}` : "No hay feedback previo.",
    "Formato JSON:",
    JSON.stringify({
      status: "ok",
      selection: [
        { food_id: "uuid", reason: "motivo corto" }
      ],
      infeasible_reason: null,
      notes: "resumen corto"
    }, null, 2),
    "Si no puedes proponer una selección viable, responde:",
    JSON.stringify({
      status: "infeasible",
      selection: [],
      infeasible_reason: "motivo corto",
      notes: "resumen corto"
    }, null, 2),
    "Catálogo disponible:",
    JSON.stringify(buildPlannerFoodSummary(selectedCandidateFoods), null, 2)
  ].join("\n");
}

export async function planHybridMenuSelection({
  meal,
  dayInfo,
  availableFoods,
  varietyContext = null,
  model = DEFAULT_NUTRITION_HYBRID_MODEL,
  attempt = 1,
  solverFeedback = null,
  maxCandidateFoods = DEFAULT_MAX_PLANNER_FOODS,
  plannerMode = "strict"
}) {
  if (!Array.isArray(availableFoods) || availableFoods.length === 0) {
    throw new Error("No hay alimentos disponibles para planificador híbrido");
  }

  const rankedFoods = rankFoodsForPlanner(availableFoods, meal, varietyContext);
  const desiredItemsCount = getDesiredItemsCount(meal);
  const {
    selectedCandidateFoods,
    viability
  } = pickCandidateFoods({
    rankedFoods,
    availableFoods,
    meal,
    maxCandidateFoods
  });

  if (!viability.viable) {
    return {
      selectedFoods: [],
      planner: {
        status: "infeasible",
        infeasible_reason: `Pool no viable: faltan roles ${viability.missing_roles.join(", ")}`,
        notes: "No hay cobertura suficiente de roles en los candidatos",
        reasons: []
      },
      metadata: {
        model_used: model,
        tokens_used: 0,
        desired_items: desiredItemsCount,
        candidate_foods: selectedCandidateFoods.length,
        missing_roles: viability.missing_roles
      }
    };
  }

  const prompt = buildPlannerPrompt({
    meal,
    dayInfo,
    selectedCandidateFoods,
    desiredItemsCount,
    attempt,
    solverFeedback,
    plannerMode
  });

  const client = getOpenAIClient("nutrition");
  if (!client) {
    throw new Error("No hay cliente OpenAI disponible para nutrición");
  }

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.25,
    max_completion_tokens: 1200,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: HYBRID_PLANNER_SYSTEM_PROMPT
      },
      {
        role: "user",
        content: prompt
      }
    ]
  });

  const content = completion.choices?.[0]?.message?.content || "";
  const parsedPlannerResponse = parsePlannerJsonResponse(content);
  const plannerStatus = normalizePlannerStatus(parsedPlannerResponse?.status);

  if (plannerStatus === "infeasible") {
    return {
      selectedFoods: [],
      planner: {
        status: "infeasible",
        infeasible_reason: typeof parsedPlannerResponse?.infeasible_reason === "string"
          ? parsedPlannerResponse.infeasible_reason.trim()
          : "Sin motivo explícito",
        notes: typeof parsedPlannerResponse?.notes === "string" ? parsedPlannerResponse.notes : null,
        reasons: []
      },
      metadata: {
        model_used: completion.model || model,
        tokens_used: completion.usage?.total_tokens || null,
        desired_items: desiredItemsCount,
        candidate_foods: selectedCandidateFoods.length,
        missing_roles: viability.missing_roles
      }
    };
  }

  const normalizedSelection = normalizePlannerSelection({
    parsedPlannerResponse,
    availableFoods,
    rankedFoods,
    desiredItemsCount
  });

  return {
    selectedFoods: normalizedSelection.map((entry) => entry.food),
    planner: {
      status: "ok",
      notes: typeof parsedPlannerResponse?.notes === "string" ? parsedPlannerResponse.notes : null,
      reasons: normalizedSelection.map((entry) => ({
        food_id: String(entry.food.id),
        food_name: entry.food.nombre,
        reason: entry.reason || null
      }))
    },
    metadata: {
      model_used: completion.model || model,
      tokens_used: completion.usage?.total_tokens || null,
      desired_items: desiredItemsCount,
      candidate_foods: selectedCandidateFoods.length,
      missing_roles: viability.missing_roles
    }
  };
}
