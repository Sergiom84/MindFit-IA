function normalizeText(value) {
  return String(value ?? "").trim();
}

function categoryFor(name, explicitCategory = null) {
  const explicit = normalizeText(explicitCategory).toLowerCase();
  const categoryAliases = {
    proteina: "proteinas",
    proteinas: "proteinas",
    carne: "proteinas",
    pescado: "proteinas",
    huevos: "proteinas",
    carbohidrato: "carbohidratos",
    carbohidratos: "carbohidratos",
    cereal: "carbohidratos",
    tuberculo: "carbohidratos",
    verdura: "vegetales",
    verduras: "vegetales",
    vegetal: "vegetales",
    vegetales: "vegetales",
    fruta: "frutas",
    frutas: "frutas",
    lacteo: "lacteos",
    lacteos: "lacteos",
    grasa: "grasas",
    grasas: "grasas",
    aceite: "grasas",
    condimento: "condimentos",
    condimentos: "condimentos"
  };
  if (categoryAliases[explicit]) return categoryAliases[explicit];

  const value = normalizeText(name).toLowerCase();
  if (/pollo|pavo|ternera|cerdo|pescado|atun|atún|salmon|salmón|merluza|huevo|carne/.test(value)) return "proteinas";
  if (/arroz|pasta|pan|avena|cereal|quinoa|patata|batata|maiz|maíz|trigo|harina/.test(value)) return "carbohidratos";
  if (/lechuga|tomate|cebolla|brocoli|brócoli|coliflor|espinaca|zanahoria|pimiento|pepino|calabacin|calabacín/.test(value)) return "vegetales";
  if (/manzana|platano|plátano|naranja|pera|fresa|kiwi|mango|piña|uva|aguacate/.test(value)) return "frutas";
  if (/leche|yogur|queso|requeson|requesón|kefir|kéfir/.test(value)) return "lacteos";
  if (/aceite|nuez|almendra|cacahuete|pistacho|avellana|tahini/.test(value)) return "grasas";
  if (/sal|pimienta|oregano|orégano|tomillo|romero|perejil|cilantro|curry|canela|vinagre/.test(value)) return "condimentos";
  return "otros";
}

function formatAmount(total, state = null) {
  const rounded = Math.round(total * 10) / 10;
  return `${rounded} g${state ? ` (${state})` : ""}`;
}

function addItem(aggregate, {
  key,
  name,
  amount,
  state = null,
  category = null,
  mealLabel
}) {
  if (!name || !Number.isFinite(amount) || amount <= 0) return;
  const existing = aggregate.get(key);
  if (existing) {
    existing.total += amount;
    existing.occurrences += 1;
    existing.meals.add(mealLabel);
    return;
  }
  aggregate.set(key, {
    name,
    total: amount,
    state,
    category: categoryFor(name, category),
    occurrences: 1,
    meals: new Set([mealLabel])
  });
}

function collectV2(plan, aggregate) {
  for (const day of plan.days ?? []) {
    const dayLabel = `Día ${Number(day.day_index) + 1}`;
    for (const meal of day.meals ?? []) {
      const mealLabel = `${dayLabel} - ${meal.nombre ?? meal.meal_type ?? "Comida"}`;
      for (const item of meal.items ?? []) {
        const name = normalizeText(item.food_nombre ?? item.descripcion);
        const state = normalizeText(item.estado_pesado_mostrado) || null;
        const amount = Number(item.cantidad_g_mostrada ?? item.cantidad_g ?? item.cantidad_g_base);
        const identity = normalizeText(item.food_id ?? item.food_slug ?? name.toLowerCase());
        addItem(aggregate, {
          key: `v2:${identity}:${state ?? "base"}`,
          name,
          amount,
          state,
          category: item.food_categoria,
          mealLabel
        });
      }
    }
  }
}

function parseLegacyAmount(value) {
  const match = normalizeText(value).match(/^(\d+(?:[.,]\d+)?)\s*g(?:r)?\.?$/i);
  return match ? Number(match[1].replace(",", ".")) : null;
}

function collectLegacy(plan, aggregate) {
  const dailyPlans = plan?.plan_data?.daily_plans ?? plan?.daily_plans ?? {};
  Object.values(dailyPlans).forEach((day, dayIndex) => {
    const dayLabel = day.day_name ?? `Día ${dayIndex + 1}`;
    for (const meal of day.meals ?? []) {
      const mealLabel = `${dayLabel} - ${meal.meal_type ?? meal.name ?? "Comida"}`;
      for (const ingredient of meal.ingredients ?? []) {
        const name = normalizeText(ingredient.food);
        const amount = parseLegacyAmount(ingredient.amount);
        if (amount === null) continue;
        addItem(aggregate, {
          key: `legacy:${name.toLowerCase()}`,
          name,
          amount,
          mealLabel
        });
      }
    }
  });
}

export function buildShoppingList(nutritionPlan) {
  const aggregate = new Map();
  if (Array.isArray(nutritionPlan?.days)) collectV2(nutritionPlan, aggregate);
  else collectLegacy(nutritionPlan, aggregate);

  const categories = {};
  const entries = [...aggregate.values()].sort((a, b) => (
    a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
  ));
  for (const entry of entries) {
    if (!categories[entry.category]) categories[entry.category] = [];
    categories[entry.category].push({
      name: entry.name,
      totalAmount: formatAmount(entry.total, entry.state),
      meals: [...entry.meals].sort(),
      occurrences: entry.occurrences
    });
  }
  return {
    categories,
    itemCount: entries.length,
    source: Array.isArray(nutritionPlan?.days) ? "nutrition-v2" : "legacy"
  };
}
