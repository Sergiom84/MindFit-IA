function objectValue(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function rangeLabel(range, unit) {
  if (!Array.isArray(range) || range.length !== 2) return null;
  const [min, max] = range.map(Number);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return `${min}-${max} ${unit}`;
}

export function buildCrossfitNutritionGuidance(day) {
  const context = objectValue(day?.periodization_context);
  const contract = objectValue(context?.crossfit_nutrition);
  if (context?.authoritative !== true || contract?.mode !== "active") return null;
  if (contract.schema_version !== "crossfit-nutrition/2.0.0") return null;
  if (!["D0", "D1", "D2"].includes(contract.day_type)) return null;

  const pre = contract.timing?.pre ?? {};
  const intra = contract.timing?.intra ?? {};
  const post = contract.timing?.post ?? {};
  const hydration = contract.hydration ?? {};
  const preParts = [
    rangeLabel(pre.window_hours, "h antes"),
    rangeLabel(pre.carbs_gkg, "g/kg HC"),
    rangeLabel(pre.protein_gkg, "g/kg proteína")
  ].filter(Boolean);
  const intraCarbs = rangeLabel(intra.carbs_g_per_hour, "g HC/h");
  const postProtein = rangeLabel(post.protein_gkg, "g/kg proteína");
  const hydrationDaily = rangeLabel(hydration.daily_ml_range, "ml/día");
  const sodium = rangeLabel(hydration.sodium_mg_per_hour, "mg sodio/h");

  return {
    dayType: contract.day_type,
    loadLabel: contract.day_type === "D2"
      ? "Carga alta D2"
      : contract.day_type === "D1" ? "Carga normal D1" : "Recuperación D0",
    carbohydrateRange: rangeLabel(contract.targets?.ranges_gkg?.carbohydrate, "g/kg"),
    proteinRange: rangeLabel(contract.targets?.ranges_gkg?.protein, "g/kg"),
    pre: pre.rule === "normal_meal" ? "Comida habitual según tolerancia" : preParts.join(" · "),
    intra: intra.rule === "water_to_thirst"
      ? "Agua según sed; sin carbohidrato rutinario"
      : intra.rule === "professional_review"
        ? `${intraCarbs ?? "Carbohidrato individualizado"}; revisar con profesional`
        : `${intraCarbs ?? "Carbohidrato opcional"}; solo si se tolera`,
    post: postProtein ? `${postProtein}; completar la ingesta diaria` : "Completar la ingesta diaria",
    hydration: hydrationDaily,
    sodium: sodium ?? (hydration.dosing_status === "blocked_professional_review"
      ? "Electrolitos: individualizar con profesional"
      : null)
  };
}
