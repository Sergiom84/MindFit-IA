/**
 * Servicio de Cálculo Determinista de Nutrición
 * Sistema basado en fórmulas científicas (Tinsley, Ten Haaf, Mifflin, Harris)
 * Carb Cycling para optimización
 */

/**
 * Ecuaciones de TMB
 */
const BMR_FORMULAS = {
  mifflin({ sexo, peso_kg, altura_cm, edad }) {
    const base = 10 * peso_kg + 6.25 * altura_cm - 5 * edad;
    return Math.round(base + (sexo === 'hombre' ? 5 : -161));
  },
  harris({ sexo, peso_kg, altura_cm, edad }) {
    if (sexo === 'hombre') {
      return Math.round(66.473 + 13.7516 * peso_kg + 5.0033 * altura_cm - 6.755 * edad);
    }
    return Math.round(655.0955 + 9.5634 * peso_kg + 1.8449 * altura_cm - 4.6756 * edad);
  },
  tinsley({ peso_kg }) {
    return Math.round(24.8 * peso_kg + 10);
  },
  tenHaaf({ sexo, peso_kg, altura_cm, edad }) {
    if (sexo === 'hombre') {
      return Math.round(11.936 * peso_kg + 587.728 * (altura_cm / 100) - 8.129 * edad + 191.027 + 29.279);
    }
    return Math.round(11.936 * peso_kg + 587.728 * (altura_cm / 100) - 8.129 * edad + 29.279);
  }
};

/**
 * Selecciona y calcula la TMB según perfil y reglas del documento
 */
export function calculateBMR(profile) {
  const {
    sexo,
    peso_kg,
    altura_cm,
    edad,
    formula_preferida,
    training_type,
    objetivo,
    level,
    cintura_cm,
    bodyfat_percent
  } = profile;

  if (edad < 14 || edad > 80 || altura_cm < 120 || altura_cm > 220 || peso_kg < 30 || peso_kg > 250) {
    throw new Error('Datos fuera de rango válido para cálculo TMB');
  }

  if (formula_preferida && BMR_FORMULAS[formula_preferida]) {
    return BMR_FORMULAS[formula_preferida](profile);
  }

  const whtr = cintura_cm && altura_cm ? cintura_cm / altura_cm : null;
  const highFat = (bodyfat_percent && bodyfat_percent >= 18) || (whtr && whtr >= 0.55);
  const levelNormalized = level || (training_type === 'hipertrofia' || training_type === 'fuerza' ? 'intermedio' : 'principiante');

  // Regla 1: principiante/sedentario
  if (levelNormalized === 'principiante' || profile.actividad === 'sedentario') {
    return BMR_FORMULAS.harris(profile);
  }

  // Regla 2: edad avanzada o altura extrema
  const alturaExtrema =
    (sexo === 'hombre' && (altura_cm >= 190 || altura_cm <= 160)) ||
    (sexo === 'mujer' && (altura_cm >= 175 || altura_cm <= 150));
  if (edad >= 50 || alturaExtrema) {
    return BMR_FORMULAS.mifflin(profile);
  }

  // Regla 3: intermedio y edad <= 40
  if (levelNormalized === 'intermedio' && edad <= 40) {
    return BMR_FORMULAS.tenHaaf(profile);
  }

  // Regla 4: avanzado varón sin alta grasa y peso >=80
  if (
    levelNormalized === 'avanzado' &&
    sexo === 'hombre' &&
    peso_kg >= 80 &&
    !highFat &&
    (!bodyfat_percent || bodyfat_percent < 18) &&
    (!whtr || whtr < 0.52)
  ) {
    return BMR_FORMULAS.tinsley(profile);
  }

  // Regla 5 fallback
  return BMR_FORMULAS.mifflin(profile);
}

/**
 * Factores de actividad física para TDEE
 */
const ACTIVITY_FACTORS = {
  sedentario: { base: 1.2, byTraining: { 4: 1.3, 5: 1.4, 6: 1.5 } },
  ligeramente_activo: { base: 1.4, byTraining: { 4: 1.5, 5: 1.6, 6: 1.7 } },
  activo: { base: 1.6, byTraining: { 4: 1.7, 5: 1.8, 6: 1.9 } },
  muy_activo: { base: 1.8, byTraining: { 4: 1.9, 5: 2.0, 6: 2.1 } }
};

/**
 * Calcula el Gasto Energético Total Diario (TDEE)
 * @param {number} bmr - Tasa metabólica basal
 * @param {string} actividad - Nivel de actividad
 * @param {number} trainingDays - Entrenos/semana para ajustar el factor
 * @returns {number} TDEE en kcal/día
 */
export function calculateTDEE(bmr, actividad, trainingDays, stepsPerDay) {
  const actividadNormalizada = actividad === 'alto'
    ? 'activo'
    : actividad === 'muy_alto'
      ? 'muy_activo'
      : actividad === 'ligero'
        ? 'ligeramente_activo'
        : actividad === 'moderado'
          ? 'activo'
          : actividad;

  const activityConfig = ACTIVITY_FACTORS[actividadNormalizada] || ACTIVITY_FACTORS.moderado;
  let factor = activityConfig.base;

  const entrenos = trainingDays || 0;
  if (entrenos >= 4) {
    const key = Math.min(entrenos, 6);
    if (activityConfig.byTraining[key]) {
      factor = activityConfig.byTraining[key];
    }
  }

  // Ajuste NEAT por pasos
  if (stepsPerDay) {
    if (stepsPerDay < 5000) {
      factor = Math.max(1.2, factor - 0.05);
    } else if (stepsPerDay >= 7500 && stepsPerDay <= 10000) {
      factor = factor + 0.05;
    } else if (stepsPerDay > 10000) {
      factor = Math.min(2.2, factor + 0.1);
    }
  }

  return Math.round(bmr * factor);
}

/**
 * Ajusta calorías según objetivo
 * @param {number} tdee - Gasto energético total diario
 * @param {string} objetivo - 'cut' | 'mant' | 'bulk'
 * @returns {number} Calorías objetivo ajustadas
 */
function resolveCalorieFactor(objetivo, profile = {}) {
  const level = profile.level || profile.nivel_entrenamiento || 'intermedio';
  const bodyfat = profile.bodyfat_percent;
  const waist = profile.waist_cm || profile.cintura_cm;
  const height = profile.altura_cm;
  const whtr = waist && height ? waist / height : null;
  const highFat = (bodyfat != null && bodyfat >= 20) || (whtr != null && whtr >= 0.55);
  const lowFat = (bodyfat != null && bodyfat <= 18) || (whtr != null && whtr < 0.52);

  if (objetivo === 'cut') {
    if (lowFat || level === 'avanzado') return 0.90;
    if (highFat) return 0.80;
    return 0.85;
  }

  if (objetivo === 'bulk') {
    if (level === 'avanzado') return 1.05;
    if (level === 'principiante') return 1.10;
    return 1.08;
  }

  return 1.0;
}

export function adjustCaloriesForGoal(tdee, objetivo, profile = {}) {
  const factor = resolveCalorieFactor(objetivo, profile);
  return Math.round(tdee * factor);
}

/**
 * Calcula la distribución de macronutrientes
 * @param {number} kcalObjetivo - Calorías objetivo diarias
 * @param {number} peso_kg - Peso del usuario en kg
 * @param {string} trainingType - Tipo de entrenamiento
 * @param {string} objetivo - 'cut' | 'mant' | 'bulk'
 * @param {string} metabolicType - 'tolerante' | 'intolerante' | 'mixto'
 * @returns {Object} Distribución de macros {protein_g, carbs_g, fat_g}
 */
export function calculateMacros(kcalObjetivo, peso_kg, trainingType, objetivo, metabolicType, metabolicConfidence = 'media', level = 'intermedio') {
  const ranges = {
    tolerante: { protein: [0.2, 0.25], carbs: [0.5, 0.6], fat: [0.15, 0.25] },
    intolerante: { protein: [0.3, 0.35], carbs: [0.2, 0.3], fat: [0.35, 0.45] },
    mixto: { protein: [0.25, 0.3], carbs: [0.35, 0.4], fat: [0.3, 0.35] }
  };

  const appliedMetabolicType = metabolicConfidence === 'baja' ? 'mixto' : (metabolicType || 'mixto');
  let pct = ranges[appliedMetabolicType] || ranges.mixto;
  const proteinMin =
    objetivo === 'cut'
      ? 2.0 * peso_kg
      : objetivo === 'mant'
        ? 1.6 * peso_kg
        : (level === 'avanzado' ? 1.8 : 1.6) * peso_kg;
  const fatMin = Math.max(0.6 * peso_kg, (kcalObjetivo * 0.20) / 9);

  // Porcentajes base
  let protein_g = Math.round((kcalObjetivo * ((pct.protein[0] + pct.protein[1]) / 2)) / 4);
  let fat_g = Math.round((kcalObjetivo * ((pct.fat[0] + pct.fat[1]) / 2)) / 9);
  let carbs_g = Math.round((kcalObjetivo * ((pct.carbs[0] + pct.carbs[1]) / 2)) / 4);

  // Normalización con mínimos fisiológicos
  protein_g = Math.max(protein_g, Math.round(proteinMin));
  fat_g = Math.max(fat_g, Math.round(fatMin));

  const proteinKcal = protein_g * 4;
  const fatKcal = fat_g * 9;
  const remainingKcal = Math.max(0, kcalObjetivo - proteinKcal - fatKcal);
  carbs_g = Math.max(0, Math.round(remainingKcal / 4));

  return { protein_g, carbs_g, fat_g };
}

/**
 * Aplica carb cycling a los macros base
 * @param {Object} baseMacros - Macros base diarios
 * @param {boolean} isTrainingDay - Si es día de entrenamiento
 * @returns {Object} Macros ajustados con carb cycling
 */
export function applyCarbCycling(baseMacros, isTrainingDay) {
  const { protein_g, carbs_g, fat_g } = baseMacros;

  if (isTrainingDay) {
    // Día de entrenamiento: +10% carbohidratos
    const newCarbs = Math.round(carbs_g * 1.10);
    const carbsDiff = (newCarbs - carbs_g) * 4; // Diferencia en kcal

    return {
      protein_g,
      carbs_g: newCarbs,
      fat_g,
      kcal: protein_g * 4 + newCarbs * 4 + fat_g * 9
    };
  } else {
    // Día de descanso: -15% carbohidratos, +grasas compensar
    const newCarbs = Math.round(carbs_g * 0.85);
    const carbsDiff = (carbs_g - newCarbs) * 4; // kcal reducidas
    const addedFat = Math.round(carbsDiff / 9); // Compensar con grasa

    return {
      protein_g,
      carbs_g: newCarbs,
      fat_g: fat_g + addedFat,
      kcal: protein_g * 4 + newCarbs * 4 + (fat_g + addedFat) * 9
    };
  }
}

/**
 * Distribuye macros entre comidas del día
 * @param {Object} dayMacros - Macros totales del día
 * @param {number} numMeals - Número de comidas (3-6)
 * @param {boolean} isTrainingDay - Si es día de entrenamiento
 * @returns {Array} Array de objetos con macros por comida
 */
export function distributeMacrosAcrossMeals(dayMacros, numMeals = 4, isTrainingDay = false) {
  const { protein_g, carbs_g, fat_g, kcal } = dayMacros;

  // Distribución estándar por comida
  const mealNames = ['Desayuno', 'Almuerzo', 'Comida', 'Merienda', 'Cena', 'Snack nocturno'];
  const meals = [];

  if (numMeals === 3) {
    // 3 comidas: 30% - 40% - 30%
    const distributions = [0.30, 0.40, 0.30];
    for (let i = 0; i < 3; i++) {
      meals.push({
        nombre: ['Desayuno', 'Comida', 'Cena'][i],
        orden: i + 1,
        kcal: Math.round(kcal * distributions[i]),
        macros: {
          protein_g: Math.round(protein_g * distributions[i]),
          carbs_g: Math.round(carbs_g * distributions[i]),
          fat_g: Math.round(fat_g * distributions[i])
        }
      });
    }
  } else if (numMeals === 4) {
    // 4 comidas: 25% - 15% - 35% - 25%
    const distributions = [0.25, 0.15, 0.35, 0.25];
    for (let i = 0; i < 4; i++) {
      meals.push({
        nombre: ['Desayuno', 'Almuerzo', 'Comida', 'Cena'][i],
        orden: i + 1,
        kcal: Math.round(kcal * distributions[i]),
        macros: {
          protein_g: Math.round(protein_g * distributions[i]),
          carbs_g: Math.round(carbs_g * distributions[i]),
          fat_g: Math.round(fat_g * distributions[i])
        },
        timing_note: isTrainingDay && i === 2 ? 'Post-entreno' : null
      });
    }
  } else if (numMeals === 5) {
    // 5 comidas: 20% - 15% - 30% - 15% - 20%
    const distributions = [0.20, 0.15, 0.30, 0.15, 0.20];
    for (let i = 0; i < 5; i++) {
      meals.push({
        nombre: ['Desayuno', 'Almuerzo', 'Comida', 'Merienda', 'Cena'][i],
        orden: i + 1,
        kcal: Math.round(kcal * distributions[i]),
        macros: {
          protein_g: Math.round(protein_g * distributions[i]),
          carbs_g: Math.round(carbs_g * distributions[i]),
          fat_g: Math.round(fat_g * distributions[i])
        },
        timing_note: isTrainingDay && i === 3 ? 'Post-entreno' : null
      });
    }
  } else if (numMeals === 6) {
    // 6 comidas: 20% - 10% - 25% - 15% - 20% - 10%
    const distributions = [0.20, 0.10, 0.25, 0.15, 0.20, 0.10];
    for (let i = 0; i < 6; i++) {
      meals.push({
        nombre: mealNames[i],
        orden: i + 1,
        kcal: Math.round(kcal * distributions[i]),
        macros: {
          protein_g: Math.round(protein_g * distributions[i]),
          carbs_g: Math.round(carbs_g * distributions[i]),
          fat_g: Math.round(fat_g * distributions[i])
        },
        timing_note: isTrainingDay && i === 3 ? 'Post-entreno' : null
      });
    }
  }

  return meals;
}

/**
 * Genera un calendario de entreno por defecto (7 días) según sesiones/semana
 * Patrón alineado con presets del frontend para consistencia.
 */
function buildDefaultTrainingSchedule(trainingDays = 4) {
  const days = Math.max(0, Math.min(7, Number(trainingDays) || 0));
  const patterns = {
    0: [false, false, false, false, false, false, false],
    1: [true, false, false, false, false, false, false],
    2: [true, false, false, true, false, false, false],
    3: [true, false, true, false, true, false, false],
    4: [true, true, false, true, true, false, false],
    5: [true, true, true, false, true, true, false],
    6: [true, true, true, true, true, true, false],
    7: [true, true, true, true, true, true, true]
  };

  return patterns[days] || patterns[4];
}

function resolveTrainingDaysPerWeek(trainingSchedule, fallbackTrainingDays = 4) {
  const fallback = Number(fallbackTrainingDays) || 0;
  if (!Array.isArray(trainingSchedule) || trainingSchedule.length === 0) {
    return fallback;
  }

  const totalDays = trainingSchedule.length;
  const trainingCount = trainingSchedule.filter(Boolean).length;

  if (totalDays <= 7) {
    return trainingCount;
  }

  // Si el calendario es diario (p.ej. 14-28 dias), estimar entrenos/semana por promedio.
  const estimatedPerWeek = Math.round((trainingCount / totalDays) * 7);
  return Math.max(0, Math.min(7, estimatedPerWeek));
}

/**
 * Genera un plan nutricional completo para N días
 * @param {Object} profile - Perfil nutricional del usuario
 * @param {number} duracionDias - Duración del plan (3-28 días)
 * @param {Array} trainingSchedule - Días de entrenamiento [true, false, true, ...]
 * @returns {Object} Plan nutricional completo
 */
export function generateNutritionPlan(profile, duracionDias, trainingSchedule = []) {
  const {
    sexo,
    edad,
    altura_cm,
    peso_kg,
    objetivo,
    actividad,
    comidas_dia,
    training_type = 'general',
    metabolic_type,
    metabolic_confidence = 'media',
    level = 'intermedio',
    steps_per_day
  } = profile;

  const trainingDays = resolveTrainingDaysPerWeek(trainingSchedule, profile.training_days || 4);
  const effectiveSchedule = (Array.isArray(trainingSchedule) && trainingSchedule.length > 0)
    ? trainingSchedule
    : buildDefaultTrainingSchedule(trainingDays);

  // 1. Calcular BMR y TDEE
  const bmr = calculateBMR({ ...profile, sexo, peso_kg, altura_cm, edad });
  const tdee = calculateTDEE(bmr, actividad, trainingDays, steps_per_day);

  // 2. Ajustar calorías por objetivo
  const kcalObjetivo = adjustCaloriesForGoal(tdee, objetivo, profile);

  // 3. Calcular macros base
  const baseMacros = calculateMacros(kcalObjetivo, peso_kg, training_type, objetivo, metabolic_type, metabolic_confidence, level);

  // 4. Generar días del plan con carb cycling
  const days = [];
  for (let i = 0; i < duracionDias; i++) {
    const isTrainingDay = effectiveSchedule[i % effectiveSchedule.length] || false;
    const dayMacros = applyCarbCycling(baseMacros, isTrainingDay);
    const meals = distributeMacrosAcrossMeals(dayMacros, comidas_dia, isTrainingDay);

    days.push({
      day_index: i,
      tipo_dia: isTrainingDay ? 'entreno' : 'descanso',
      kcal: dayMacros.kcal,
      macros: {
        protein_g: dayMacros.protein_g,
        carbs_g: dayMacros.carbs_g,
        fat_g: dayMacros.fat_g
      },
      meals
    });
  }

  return {
    bmr,
    tdee,
    kcal_objetivo: kcalObjetivo,
    macros_objetivo: baseMacros,
    meta: objetivo,
    duracion_dias: duracionDias,
    training_type,
    comidas_por_dia: comidas_dia,
    fuente: 'determinista',
    version_reglas: 'v1',
    days
  };
}

/**
 * Variante para regeneración de plan cuando se aplica un ajuste (kcal override).
 * Mantiene la misma lógica del motor determinista, pero fuerza `kcal_objetivo`.
 */
export function generateNutritionPlanWithKcalOverride(
  profile,
  duracionDias,
  trainingSchedule = [],
  kcalObjetivoOverride = null
) {
  const {
    sexo,
    edad,
    altura_cm,
    peso_kg,
    objetivo,
    actividad,
    comidas_dia,
    training_type = 'general',
    metabolic_type,
    metabolic_confidence = 'media',
    level = 'intermedio',
    steps_per_day
  } = profile;

  const trainingDays = resolveTrainingDaysPerWeek(trainingSchedule, profile.training_days || 4);
  const effectiveSchedule = (Array.isArray(trainingSchedule) && trainingSchedule.length > 0)
    ? trainingSchedule
    : buildDefaultTrainingSchedule(trainingDays);

  const bmr = calculateBMR({ ...profile, sexo, peso_kg, altura_cm, edad });
  const tdee = calculateTDEE(bmr, actividad, trainingDays, steps_per_day);

  const kcalObjetivo = Number.isFinite(Number(kcalObjetivoOverride))
    ? Math.round(Number(kcalObjetivoOverride))
    : adjustCaloriesForGoal(tdee, objetivo, profile);

  const baseMacros = calculateMacros(
    kcalObjetivo,
    peso_kg,
    training_type,
    objetivo,
    metabolic_type,
    metabolic_confidence,
    level
  );

  const days = [];
  for (let i = 0; i < duracionDias; i++) {
    const isTrainingDay = effectiveSchedule[i % effectiveSchedule.length] || false;
    const dayMacros = applyCarbCycling(baseMacros, isTrainingDay);
    const meals = distributeMacrosAcrossMeals(dayMacros, comidas_dia, isTrainingDay);

    days.push({
      day_index: i,
      tipo_dia: isTrainingDay ? 'entreno' : 'descanso',
      kcal: dayMacros.kcal,
      macros: {
        protein_g: dayMacros.protein_g,
        carbs_g: dayMacros.carbs_g,
        fat_g: dayMacros.fat_g
      },
      meals
    });
  }

  return {
    bmr,
    tdee,
    kcal_objetivo: kcalObjetivo,
    macros_objetivo: baseMacros,
    meta: objetivo,
    duracion_dias: duracionDias,
    training_type,
    comidas_por_dia: comidas_dia,
    fuente: 'determinista',
    version_reglas: 'v1',
    days
  };
}

/**
 * Valida los macros calculados
 * @param {Object} macros - Macros a validar
 * @param {number} kcalTarget - Calorías objetivo
 * @param {number} tolerance - Tolerancia en % (default 2%)
 * @returns {boolean} true si los macros son válidos
 */
export function validateMacros(macros, kcalTarget, tolerance = 0.02) {
  const { protein_g, carbs_g, fat_g } = macros;
  const calculatedKcal = protein_g * 4 + carbs_g * 4 + fat_g * 9;

  const diff = Math.abs(calculatedKcal - kcalTarget);
  const diffPercent = diff / kcalTarget;

  return diffPercent <= tolerance;
}
