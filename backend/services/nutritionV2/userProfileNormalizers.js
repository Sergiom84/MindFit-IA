// Normalizadores de perfil de usuario para nutrición V2 (ARCH-002).
// Extraído de nutritionV2Engine.js: funciones puras (sin BD ni otras deps del engine)
// que normalizan sexo, actividad, nivel y objetivo, y resuelven el desajuste entre el
// objetivo de onboarding/perfil y el de nutrición.

export function normalizeSexo(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();

  if (['hombre', 'masculino', 'male', 'm'].includes(normalized)) return 'hombre';
  if (['mujer', 'femenino', 'female', 'f'].includes(normalized)) return 'mujer';
  if (['otro', 'other', 'no_binario', 'no binario'].includes(normalized)) return 'otro';

  return null;
}

export function normalizeActividad(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();

  const mapping = {
    sedentario: 'sedentario',
    ligeramente_activo: 'ligeramente_activo',
    'ligeramente activo': 'ligeramente_activo',
    ligero: 'ligero',
    moderado: 'moderado',
    activo: 'activo',
    muy_activo: 'muy_activo',
    alto: 'alto',
    muy_alto: 'muy_alto'
  };

  return mapping[normalized] || null;
}

export const USER_OBJECTIVE_TO_NUTRITION_GOAL = {
  perder_peso: 'cut',
  ganar_musculo: 'bulk',
  ganar_masa_muscular: 'bulk',
  ganar_peso: 'bulk',
  tonificar: 'mant',
  mantener_forma: 'mant',
  mantenimiento: 'mant',
  mejorar_resistencia: 'mant',
  fuerza: 'mant',
  ganar_fuerza: 'mant',
  resistencia: 'mant',
  rehabilitacion: 'mant',
  flexibilidad: 'mant'
};

export function mapUserObjectiveToNutritionGoal(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  return USER_OBJECTIVE_TO_NUTRITION_GOAL[normalized] || null;
}

export function resolveNutritionObjectiveMismatch({
  userId,
  userObjectivePrincipal,
  nutritionObjective,
  nutritionOverridesProfile
}) {
  const mappedUserObjective = mapUserObjectiveToNutritionGoal(userObjectivePrincipal);
  if (!mappedUserObjective) {
    return nutritionObjective || null;
  }

  if (!nutritionObjective || nutritionObjective === mappedUserObjective) {
    return nutritionObjective || mappedUserObjective;
  }

  const resolvedObjective = nutritionOverridesProfile ? nutritionObjective : mappedUserObjective;

  console.warn('[NutritionV2] Desajuste detectado entre onboarding/perfil y nutricion', {
    userId,
    userObjectivePrincipal,
    nutritionObjective,
    nutritionOverridesProfile,
    resolvedObjective,
    resolution: nutritionOverridesProfile ? 'nutrition_profile_override' : 'user_profile_sync'
  });

  return resolvedObjective;
}

export function normalizeNivelEntrenamiento(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();

  const mapping = {
    beginner: 'principiante',
    intermediate: 'intermedio',
    advanced: 'avanzado',
    principiante: 'principiante',
    intermedio: 'intermedio',
    avanzado: 'avanzado',
    'intermedio+': 'intermedio'
  };

  return mapping[normalized] || normalized;
}
