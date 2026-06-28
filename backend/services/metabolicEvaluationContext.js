const USER_OBJECTIVE_TO_NUTRITION_GOAL = {
  perder_peso: "cut",
  tonificar: "cut",
  mantenimiento: "mant",
  salud_general: "mant",
  mejorar_resistencia: "mant",
  mejorar_flexibilidad: "mant",
  ganar_peso: "bulk",
  ganar_masa_muscular: "bulk"
};

function normalizeObjective(rawObjective) {
  if (!rawObjective) {
    return null;
  }

  const normalized = String(rawObjective).trim().toLowerCase();
  if (["cut", "mant", "bulk"].includes(normalized)) {
    return normalized;
  }

  return USER_OBJECTIVE_TO_NUTRITION_GOAL[normalized] || null;
}

export function buildMetabolicEvaluationContextFromRow(row) {
  if (!row) {
    return null;
  }

  const resolvedObjective = normalizeObjective(row.nutrition_objetivo) || normalizeObjective(row.user_objetivo_principal);

  return {
    nutritionProfile: row,
    userProfile: {
      sexo: row.nutrition_sexo || row.user_sexo || null,
      edad: row.nutrition_edad ?? row.user_edad ?? null,
      altura_cm: row.altura_cm ?? row.user_altura_cm ?? null,
      peso_kg: row.peso_kg ?? row.user_peso_kg ?? null,
      objetivo: resolvedObjective,
      training_type: row.training_type || "general",
      training_days: row.training_days ?? row.user_training_days ?? null,
      kcal_objetivo: row.kcal_objetivo,
      tdee: row.tdee,
      level: row.level || row.user_level || null
    }
  };
}

export function getMissingMetabolicEvaluationFields(userProfile = {}) {
  const missingFields = [];

  if (userProfile.peso_kg == null) missingFields.push("peso");
  if (!userProfile.objetivo) missingFields.push("objetivo");

  return missingFields;
}
