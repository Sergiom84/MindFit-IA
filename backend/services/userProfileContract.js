const stripDiacritics = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "");

const toKey = (value) => stripDiacritics(value)
  .trim()
  .toLowerCase()
  .replace(/\s+/g, "_")
  .replace(/-+/g, "_");

const OBJECTIVE_ALIASES = {
  ganar_peso: "ganar_peso",
  rehabilitacion: "rehabilitacion",
  perder_peso: "perder_peso",
  tonificar: "tonificar",
  ganar_musculo: "ganar_masa_muscular",
  ganar_masa_muscular: "ganar_masa_muscular",
  mejorar_resistencia: "mejorar_resistencia",
  mejorar_flexibilidad: "mejorar_flexibilidad",
  salud_general: "salud_general",
  mantener: "mantenimiento",
  mantener_forma: "mantenimiento",
  mantenimiento: "mantenimiento",
  fuerza: "ganar_fuerza",
  aumentar_fuerza: "ganar_fuerza",
  ganar_fuerza: "ganar_fuerza"
};

const SEX_ALIASES = {
  hombre: "masculino",
  masculino: "masculino",
  male: "masculino",
  mujer: "femenino",
  femenino: "femenino",
  female: "femenino",
  otro: "otro",
  other: "otro",
  no_binario: "otro"
};

const METHODOLOGY_ALIASES = {
  gimnasio: "gimnasio",
  gym: "gimnasio",
  bodybuilding: "gimnasio",
  hipertrofia: "gimnasio",
  hipertrofiav2: "gimnasio",
  funcional: "funcional",
  entrenamiento_funcional: "funcional",
  casa: "casa",
  entrenamiento_casa: "casa",
  calistenia: "calistenia",
  crossfit: "crossfit",
  powerlifting: "powerlifting",
  heavy_duty: "heavy-duty",
  heavyduty: "heavy-duty",
  halterofilia: "halterofilia"
};

// ONB-P2-02: el enfoque de entrenamiento conserva su valor REAL. Antes HIIT→perdida_peso
// y funcional/mixto→general colapsaban la selección del usuario (se veía "Pérdida de Peso"
// en Perfil). Ningún consumidor de nutrición ni del motor ramifica por enfoque_entrenamiento
// (verificado por grep), así que guardar el valor real es seguro. `perdida_peso`/`general`
// se conservan como alias de LECTURA para datos históricos.
const TRAINING_FOCUS_ALIASES = {
  fuerza: "fuerza",
  hipertrofia: "hipertrofia",
  resistencia: "resistencia",
  funcional: "funcional",
  hiit: "hiit",
  mixto: "mixto",
  perdida_peso: "perdida_peso",
  general: "general"
};

// PR-CAL-01 Subfase B (G4): entorno de entrenamiento. Alimenta el contexto/confianza del
// assessment de calistenia (parque con barras ≠ casa). Valor desconocido/ausente → null
// (nunca se inventa un entorno). El filtrado por equipo se difiere a CAL-02A (catálogo sucio).
const TRAINING_ENVIRONMENT_ALIASES = {
  gimnasio: "gimnasio",
  gym: "gimnasio",
  box: "gimnasio",
  casa: "casa",
  hogar: "casa",
  home: "casa",
  indoor: "casa",
  exterior: "exterior",
  aire_libre: "exterior",
  parque: "exterior",
  park: "exterior",
  calle: "exterior",
  street: "exterior",
  outdoor: "exterior"
};

const OBJECTIVE_METHODOLOGY = {
  ganar_fuerza: "powerlifting",
  ganar_masa_muscular: "gimnasio",
  ganar_peso: "gimnasio",
  perder_peso: "funcional",
  tonificar: "gimnasio",
  mejorar_resistencia: "funcional",
  mejorar_flexibilidad: "funcional",
  salud_general: "funcional",
  mantenimiento: "funcional",
  rehabilitacion: "funcional"
};

const OBJECTIVE_LABELS = {
  ganar_fuerza: "Aumentar fuerza",
  ganar_masa_muscular: "Ganar masa muscular",
  ganar_peso: "Ganar peso",
  perder_peso: "Perder peso",
  tonificar: "Tonificar",
  mejorar_resistencia: "Mejorar resistencia",
  mejorar_flexibilidad: "Mejorar flexibilidad",
  salud_general: "Mejorar la salud general",
  mantenimiento: "Mantener la forma física",
  rehabilitacion: "Rehabilitación y recuperación funcional"
};

export function normalizeUserObjective(value) {
  if (value === "" || value === undefined || value === null) return null;
  return OBJECTIVE_ALIASES[toKey(value)] || null;
}

export function normalizeUserSex(value) {
  if (value === "" || value === undefined || value === null) return null;
  return SEX_ALIASES[toKey(value)] || null;
}

export function normalizePreferredMethodology(value) {
  if (value === "" || value === undefined || value === null) return null;
  return METHODOLOGY_ALIASES[toKey(value)] || null;
}

export function normalizeTrainingFocus(value) {
  if (value === "" || value === undefined || value === null) return null;
  return TRAINING_FOCUS_ALIASES[toKey(value)] || null;
}

export function normalizeTrainingEnvironment(value) {
  if (value === "" || value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  return TRAINING_ENVIRONMENT_ALIASES[toKey(value)] || null;
}

// Confirmación explícita de que el usuario tiene y sabe usar el equipo con seguridad (gate de
// seguridad del assessment, Subfase C). true/false explícitos; ausente o ambiguo → null (dato
// ausente = null: no se asume que el equipo es seguro).
const SAFETY_TRUE = new Set(["true", "1", "si", "yes", "confirmado", "confirmed"]);
const SAFETY_FALSE = new Set(["false", "0", "no", "denegado", "denied"]);
export function normalizeEquipmentSafetyConfirmed(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value !== "string") return null;
  const key = toKey(value);
  if (SAFETY_TRUE.has(key)) return true;
  if (SAFETY_FALSE.has(key)) return false;
  return null;
}

export function validateOnboardingProfile(profile = {}) {
  const normalized = {
    edad: Number(profile.edad),
    sexo: normalizeUserSex(profile.sexo),
    peso: Number(profile.peso),
    altura: Number(profile.altura),
    objetivoPrincipal: normalizeUserObjective(profile.objetivoPrincipal),
    enfoqueEntrenamiento: normalizeTrainingFocus(profile.enfoqueEntrenamiento)
  };

  const invalidFields = [];
  if (!Number.isFinite(normalized.edad) || normalized.edad < 13 || normalized.edad > 100) invalidFields.push("edad");
  if (!normalized.sexo) invalidFields.push("sexo");
  if (!Number.isFinite(normalized.peso) || normalized.peso < 30 || normalized.peso > 300) invalidFields.push("peso");
  if (!Number.isFinite(normalized.altura) || normalized.altura < 120 || normalized.altura > 250) invalidFields.push("altura");
  if (!normalized.objetivoPrincipal) invalidFields.push("objetivoPrincipal");
  if (!normalized.enfoqueEntrenamiento) invalidFields.push("enfoqueEntrenamiento");

  return { normalized, invalidFields };
}

export function recommendMethodologyFromProfile(profile = {}, requestedMethodology = null) {
  const requested = normalizePreferredMethodology(requestedMethodology);
  if (requested) return requested;

  const preferred = normalizePreferredMethodology(profile.metodologia_preferida);
  if (preferred) return preferred;

  const objective = normalizeUserObjective(profile.objetivo_principal);
  return OBJECTIVE_METHODOLOGY[objective] || "gimnasio";
}

export function getProfileTrainingGoal(profile = {}, explicitGoal = null) {
  if (explicitGoal != null && String(explicitGoal).trim()) return String(explicitGoal).trim();
  const objective = normalizeUserObjective(profile.objetivo_principal);
  return OBJECTIVE_LABELS[objective] || "Mejorar la condición física general";
}

export function buildProfileAwarePlanData(planData = {}, profile = {}) {
  const methodology = recommendMethodologyFromProfile(profile, planData.methodology);
  return {
    ...planData,
    methodology,
    selectedLevel: planData.selectedLevel || planData.level || planData.nivel || profile.nivel_entrenamiento || undefined,
    goals: getProfileTrainingGoal(profile, planData.goals),
    frecuencia_semanal: planData.frecuencia_semanal ?? profile.frecuencia_semanal ?? undefined
  };
}

export function resolveTrainingFrequency(value, fallback, allowedValues = [3, 4, 5]) {
  const allowed = [...new Set(allowedValues.map(Number).filter(Number.isFinite))].sort((a, b) => a - b);
  if (allowed.length === 0) return Number(fallback) || 3;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return allowed.includes(Number(fallback)) ? Number(fallback) : allowed[0];
  return allowed.reduce((closest, candidate) => (
    Math.abs(candidate - parsed) < Math.abs(closest - parsed) ? candidate : closest
  ), allowed[0]);
}
