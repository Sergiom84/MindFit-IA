/**
 * Servicio de Calculo de Perfil Metabolico y Distribucion de Macronutrientes
 * Sistema para clasificar tolerancia a carbohidratos y ajustar macros
 *
 * Basado en el documento: "Modulo de Metabolismo y Distribucion de Macronutrientes"
 */

/**
 * Preguntas del cuestionario metabolico con sus puntuaciones
 * Puntos positivos (+) desplazan hacia INTOLERANTE
 * Puntos negativos (-) desplazan hacia TOLERANTE
 */
export const METABOLIC_QUESTIONS = [
  {
    id: 'somnolencia_carbs',
    text: 'Tras comidas altas en carbohidratos, experimento somnolencia o bajada de energia',
    score: 2,
    category: 'energia'
  },
  {
    id: 'energia_estable_carbs',
    text: 'Mantengo energia estable tras comidas con carbohidratos (sin somnolencia)',
    score: -2,
    category: 'energia'
  },
  {
    id: 'hambre_nocturna',
    text: 'Me despierto por la noche con hambre, especialmente tras cena con carbohidratos simples',
    score: 1,
    category: 'sueno'
  },
  {
    id: 'dormir_mejor_fruta',
    text: 'Duermo mejor si consumo fruta o carbohidratos antes de dormir',
    score: -1,
    category: 'sueno'
  },
  {
    id: 'preferencia_graso_salado',
    text: 'Prefiero alimentos grasos y salados frente a los dulces',
    score: 1,
    category: 'preferencias'
  },
  {
    id: 'preferencia_dulces',
    text: 'Prefiero alimentos dulces frente a salados',
    score: -1,
    category: 'preferencias'
  },
  {
    id: 'acumula_grasa_abdominal',
    text: 'Acumulo grasa abdominal con facilidad (patron central)',
    score: 2,
    category: 'composicion'
  },
  {
    id: 'sin_comer_sin_sintomas',
    text: 'Puedo estar varias horas sin comer sin experimentar sintomas negativos',
    score: -1,
    category: 'metabolismo'
  },
  {
    id: 'cansancio_matutino',
    text: 'Por las mananas me despierto con cansancio o sensacion de sueno prolongado',
    score: 1,
    category: 'energia'
  },
  {
    id: 'responde_bien_hidratos',
    text: 'Respondo bien a los hidratos de carbono (no acumulo grasa con facilidad en fases previas)',
    score: -1,
    category: 'metabolismo'
  }
];

/**
 * Umbrales de clasificacion del perfil metabolico
 */
export const PROFILE_THRESHOLDS = {
  INTOLERANTE_MIN: 4,   // S >= +4 -> Intolerante
  TOLERANTE_MAX: -4,    // S <= -4 -> Tolerante
  // -3 <= S <= +3 -> Mixto/Equilibrado
};

/**
 * Distribucion porcentual de macronutrientes segun perfil
 */
export const MACRO_DISTRIBUTIONS = {
  tolerante: {
    protein_min: 0.20,
    protein_max: 0.25,
    carbs_min: 0.50,
    carbs_max: 0.60,
    fat_min: 0.15,
    fat_max: 0.25,
    // Valores medios para calculo
    protein_mid: 0.225,
    carbs_mid: 0.55,
    fat_mid: 0.20
  },
  mixto: {
    protein_min: 0.25,
    protein_max: 0.30,
    carbs_min: 0.35,
    carbs_max: 0.40,
    fat_min: 0.30,
    fat_max: 0.35,
    // Valores medios para calculo
    protein_mid: 0.275,
    carbs_mid: 0.375,
    fat_mid: 0.325
  },
  intolerante: {
    protein_min: 0.30,
    protein_max: 0.35,
    carbs_min: 0.20,
    carbs_max: 0.30,
    fat_min: 0.35,
    fat_max: 0.45,
    // Valores medios para calculo
    protein_mid: 0.325,
    carbs_mid: 0.25,
    fat_mid: 0.40
  }
};

/**
 * Minimos fisiologicos de macronutrientes por objetivo
 */
export const MINIMUM_GUARDRAILS = {
  protein: {
    cut: 2.0,      // >= 2.0 g/kg en definicion
    mant: 1.6,     // >= 1.6 g/kg en mantenimiento
    bulk: 1.8      // >= 1.8 g/kg en volumen (1.8 avanzados)
  },
  fat: {
    min_per_kg: 0.6,     // >= 0.6 g/kg
    min_percentage: 0.20  // >= 20% del total calorico
  }
};

/**
 * Calcula la puntuacion metabolica a partir de las respuestas
 * @param {Object} answers - Objeto con respuestas { question_id: 'si' | 'no' | 'no_se' }
 * @returns {Object} { rawScore, itemsAnswered, itemsNoSe, breakdown }
 */
export function calculateMetabolicScore(answers) {
  let rawScore = 0;
  let itemsAnswered = 0;
  let itemsNoSe = 0;
  const breakdown = [];

  for (const question of METABOLIC_QUESTIONS) {
    const answer = answers[question.id];

    if (answer === 'si') {
      rawScore += question.score;
      itemsAnswered++;
      breakdown.push({
        questionId: question.id,
        answer: 'si',
        scoreApplied: question.score
      });
    } else if (answer === 'no') {
      // 'no' no suma puntos
      itemsAnswered++;
      breakdown.push({
        questionId: question.id,
        answer: 'no',
        scoreApplied: 0
      });
    } else if (answer === 'no_se') {
      itemsNoSe++;
      breakdown.push({
        questionId: question.id,
        answer: 'no_se',
        scoreApplied: null
      });
    }
    // Si no hay respuesta, se ignora
  }

  return {
    rawScore,
    itemsAnswered,
    itemsNoSe,
    breakdown
  };
}

/**
 * Clasifica el perfil metabolico basado en la puntuacion
 * @param {number} score - Puntuacion del cuestionario
 * @returns {string} 'tolerante' | 'mixto' | 'intolerante'
 */
export function classifyMetabolicProfile(score) {
  if (score >= PROFILE_THRESHOLDS.INTOLERANTE_MIN) {
    return 'intolerante';
  } else if (score <= PROFILE_THRESHOLDS.TOLERANTE_MAX) {
    return 'tolerante';
  } else {
    return 'mixto';
  }
}

/**
 * Calcula el nivel de confianza basado en la calidad de respuestas
 * @param {number} itemsAnswered - Numero de items respondidos (si/no)
 * @param {number} itemsNoSe - Numero de respuestas "no se"
 * @returns {Object} { level, description, forcesMixto }
 */
export function calculateConfidenceLevel(itemsAnswered, itemsNoSe) {
  const totalResponses = itemsAnswered + itemsNoSe;

  // Alta: >= 8 items respondidos Y <= 2 "no se"
  if (itemsAnswered >= 8 && itemsNoSe <= 2) {
    return {
      level: 'alta',
      description: 'Respuestas suficientes para clasificacion precisa',
      forcesMixto: false
    };
  }

  // Baja: <= 5 items respondidos O >= 5 "no se" -> Fuerza Mixto
  if (itemsAnswered <= 5 || itemsNoSe >= 5) {
    return {
      level: 'baja',
      description: 'Datos insuficientes: se asigna perfil Mixto por seguridad',
      forcesMixto: true
    };
  }

  // Media: 6-7 items respondidos O 3-4 "no se"
  return {
    level: 'media',
    description: 'Clasificacion con confianza moderada',
    forcesMixto: false
  };
}

/**
 * Calcula la distribucion de macronutrientes segun perfil metabolico
 * @param {number} kcalObjetivo - Calorias objetivo diarias
 * @param {number} peso_kg - Peso del usuario en kg
 * @param {string} metabolicProfile - 'tolerante' | 'mixto' | 'intolerante'
 * @param {string} objetivo - 'cut' | 'mant' | 'bulk'
 * @param {string} trainingType - Tipo de entrenamiento (para ajustes finos)
 * @returns {Object} { protein_g, carbs_g, fat_g, protein_pct, carbs_pct, fat_pct }
 */
export function calculateMacrosWithMetabolicProfile(
  kcalObjetivo,
  peso_kg,
  metabolicProfile,
  objetivo = 'mant',
  trainingType = 'general'
) {
  const distribution = MACRO_DISTRIBUTIONS[metabolicProfile] || MACRO_DISTRIBUTIONS.mixto;

  // Usar valores medios del rango para cada perfil
  let proteinPct = distribution.protein_mid;
  let carbsPct = distribution.carbs_mid;
  let fatPct = distribution.fat_mid;

  // Ajuste fino por objetivo
  if (objetivo === 'cut') {
    // En definicion, priorizar proteina dentro del rango
    proteinPct = distribution.protein_max;
    // Reducir carbos al minimo del rango
    carbsPct = distribution.carbs_min;
    // Grasas se ajustan para completar
    fatPct = 1 - proteinPct - carbsPct;
  } else if (objetivo === 'bulk') {
    // En volumen, mas carbos para energia
    carbsPct = distribution.carbs_max;
    proteinPct = distribution.protein_mid;
    fatPct = 1 - proteinPct - carbsPct;
  }

  // Normalizar para que sumen 100%
  const total = proteinPct + carbsPct + fatPct;
  proteinPct = proteinPct / total;
  carbsPct = carbsPct / total;
  fatPct = fatPct / total;

  // Calcular gramos
  const proteinKcal = kcalObjetivo * proteinPct;
  const carbsKcal = kcalObjetivo * carbsPct;
  const fatKcal = kcalObjetivo * fatPct;

  const protein_g = Math.round(proteinKcal / 4);
  const carbs_g = Math.round(carbsKcal / 4);
  const fat_g = Math.round(fatKcal / 9);

  return {
    protein_g,
    carbs_g,
    fat_g,
    protein_pct: Math.round(proteinPct * 100),
    carbs_pct: Math.round(carbsPct * 100),
    fat_pct: Math.round(fatPct * 100),
    kcal_calculated: protein_g * 4 + carbs_g * 4 + fat_g * 9
  };
}

/**
 * Aplica los guardarrailes de minimos fisiologicos
 * @param {Object} macros - { protein_g, carbs_g, fat_g }
 * @param {number} peso_kg - Peso del usuario
 * @param {string} objetivo - 'cut' | 'mant' | 'bulk'
 * @param {number} kcalObjetivo - Calorias objetivo (para % minimo de grasa)
 * @returns {Object} Macros ajustados con guardarrailes aplicados
 */
export function applyMinimumGuardrails(macros, peso_kg, objetivo, kcalObjetivo) {
  let { protein_g, carbs_g, fat_g } = macros;

  // 1. Minimo de proteina segun objetivo
  const minProteinPerKg = MINIMUM_GUARDRAILS.protein[objetivo] || MINIMUM_GUARDRAILS.protein.mant;
  const minProtein_g = Math.round(peso_kg * minProteinPerKg);

  // 2. Minimo de grasa: mayor entre g/kg y % del total
  const minFatByKg = Math.round(peso_kg * MINIMUM_GUARDRAILS.fat.min_per_kg);
  const minFatByPct = Math.round((kcalObjetivo * MINIMUM_GUARDRAILS.fat.min_percentage) / 9);
  const minFat_g = Math.max(minFatByKg, minFatByPct);

  let adjustments = [];

  // Aplicar minimo de proteina si es necesario
  if (protein_g < minProtein_g) {
    const diff = minProtein_g - protein_g;
    adjustments.push({
      macro: 'protein',
      original: protein_g,
      adjusted: minProtein_g,
      reason: `Minimo ${minProteinPerKg}g/kg para ${objetivo}`
    });
    protein_g = minProtein_g;

    // Reducir carbos para compensar
    const diffKcal = diff * 4;
    const carbsReduction = Math.round(diffKcal / 4);
    carbs_g = Math.max(0, carbs_g - carbsReduction);
  }

  // Aplicar minimo de grasa si es necesario
  if (fat_g < minFat_g) {
    const diff = minFat_g - fat_g;
    adjustments.push({
      macro: 'fat',
      original: fat_g,
      adjusted: minFat_g,
      reason: `Minimo ${MINIMUM_GUARDRAILS.fat.min_per_kg}g/kg o ${MINIMUM_GUARDRAILS.fat.min_percentage * 100}%`
    });
    fat_g = minFat_g;

    // Reducir carbos para compensar
    const diffKcal = diff * 9;
    const carbsReduction = Math.round(diffKcal / 4);
    carbs_g = Math.max(0, carbs_g - carbsReduction);
  }

  // Recalcular porcentajes finales
  const totalKcal = protein_g * 4 + carbs_g * 4 + fat_g * 9;

  return {
    protein_g,
    carbs_g,
    fat_g,
    protein_pct: Math.round((protein_g * 4 / totalKcal) * 100),
    carbs_pct: Math.round((carbs_g * 4 / totalKcal) * 100),
    fat_pct: Math.round((fat_g * 9 / totalKcal) * 100),
    kcal_calculated: totalKcal,
    adjustments,
    guardrails_applied: adjustments.length > 0
  };
}

/**
 * Valida si un cambio de perfil es permitido segun reglas anti-ruido
 * @param {string} currentProfile - Perfil actual
 * @param {string} newProfile - Nuevo perfil propuesto
 * @param {number} consecutiveCount - Evaluaciones consecutivas hacia el nuevo perfil
 * @param {string} confidence - Nivel de confianza de la nueva evaluacion
 * @returns {Object} { canChange, appliedProfile, reason, needsConfirmation }
 */
export function validateProfileChange(currentProfile, newProfile, consecutiveCount, confidence) {
  // Si no hay perfil actual, aceptar el nuevo
  if (!currentProfile) {
    return {
      canChange: true,
      appliedProfile: newProfile,
      reason: 'Primer perfil establecido',
      needsConfirmation: false
    };
  }

  // Regla 1: Confianza baja bloquea cambio a extremos
  if (confidence === 'baja' && (newProfile === 'tolerante' || newProfile === 'intolerante')) {
    return {
      canChange: true,
      appliedProfile: 'mixto',
      reason: 'Confianza baja: asignado perfil Mixto por seguridad',
      needsConfirmation: false
    };
  }

  // Si es el mismo perfil, no hay cambio
  if (newProfile === currentProfile) {
    return {
      canChange: true,
      appliedProfile: newProfile,
      reason: 'Perfil confirmado (sin cambio)',
      needsConfirmation: false
    };
  }

  // Regla 2: Maximo 1 categoria de cambio por ciclo
  const profileOrder = { tolerante: 0, mixto: 1, intolerante: 2 };
  const distance = Math.abs(profileOrder[newProfile] - profileOrder[currentProfile]);

  if (distance > 1) {
    return {
      canChange: true,
      appliedProfile: 'mixto',
      reason: `Cambio gradual: de ${currentProfile} a mixto (paso intermedio requerido)`,
      needsConfirmation: false
    };
  }

  // Regla 3: Requiere 2 evaluaciones consecutivas
  if (consecutiveCount >= 1) {
    return {
      canChange: true,
      appliedProfile: newProfile,
      reason: `Cambio confirmado: 2 evaluaciones consecutivas hacia ${newProfile}`,
      needsConfirmation: false
    };
  }

  return {
    canChange: false,
    appliedProfile: currentProfile,
    reason: `Cambio pendiente hacia ${newProfile}: requiere segunda evaluacion consecutiva`,
    needsConfirmation: true
  };
}

/**
 * Ajusta la puntuacion base con senales objetivas (opcional)
 * @param {number} baseScore - Puntuacion del cuestionario
 * @param {Object} objectiveData - Datos objetivos del usuario
 * @returns {Object} { adjustedScore, adjustments }
 */
export function adjustScoreWithObjectiveSignals(baseScore, objectiveData = {}) {
  let adjustedScore = baseScore;
  const adjustments = [];

  const {
    objetivo,
    waistIncreasing,      // Cintura aumenta desproporcionadamente
    performanceLoss,      // Perdida de rendimiento sostenida
    frequentNightHunger,  // Hambre nocturna frecuente
    stableEnergyWithCarbs, // Energia estable con carbohidratos
    waistMaintained       // Cintura se mantiene o reduce
  } = objectiveData;

  // En volumen: cintura aumenta sin mejora clara de perimetros
  if (objetivo === 'bulk' && waistIncreasing) {
    adjustedScore += 1;
    adjustments.push({
      signal: 'waist_increasing_bulk',
      adjustment: +1,
      reason: 'Cintura aumenta desproporcionadamente en volumen'
    });
  }

  // En definicion: perdida de rendimiento + hambre nocturna
  if (objetivo === 'cut' && performanceLoss && frequentNightHunger) {
    adjustedScore += 1;
    adjustments.push({
      signal: 'performance_hunger_cut',
      adjustment: +1,
      reason: 'Perdida de rendimiento y hambre nocturna en definicion'
    });
  }

  // Energia estable con carbohidratos + cintura mantenida
  if (stableEnergyWithCarbs && waistMaintained) {
    adjustedScore -= 1;
    adjustments.push({
      signal: 'good_carb_response',
      adjustment: -1,
      reason: 'Buena respuesta a carbohidratos sin aumento de cintura'
    });
  }

  return {
    adjustedScore,
    adjustments,
    hasAdjustments: adjustments.length > 0
  };
}

/**
 * Obtiene la descripcion completa de un perfil metabolico
 * @param {string} profile - 'tolerante' | 'mixto' | 'intolerante'
 * @returns {Object} Descripcion del perfil
 */
export function getProfileDescription(profile) {
  const descriptions = {
    tolerante: {
      title: 'Tolerante a los Carbohidratos',
      summary: 'Tu metabolismo gestiona bien la glucosa y tienes buena sensibilidad a la insulina.',
      characteristics: [
        'Niveles de grasa bajos y energia estable durante el dia',
        'Mejora el descanso si consume carbohidratos antes de dormir',
        'Prefiere alimentos dulces a los salados',
        'No tiende a acumular grasa facilmente',
        'Responde bien al consumo de hidratos de carbono'
      ],
      recommendation: 'Puedes utilizar los carbohidratos como fuente principal de energia. Distribucion recomendada: 50-60% carbohidratos.'
    },
    mixto: {
      title: 'Perfil Mixto o Equilibrado',
      summary: 'Tienes una tolerancia intermedia a los carbohidratos.',
      characteristics: [
        'No presenta somnolencia tras las comidas ni alteraciones marcadas del apetito',
        'Composicion corporal tiende a mantenerse estable',
        'Puede funcionar bien tanto con dietas altas en carbohidratos como en grasas',
        'Requiere un reparto equilibrado de macronutrientes'
      ],
      recommendation: 'Un reparto equilibrado de macronutrientes es optimo para ti. Distribucion recomendada: 35-40% carbohidratos.'
    },
    intolerante: {
      title: 'Intolerante a los Carbohidratos',
      summary: 'Tu cuerpo tiende a responder mejor utilizando grasas como fuente principal de energia.',
      characteristics: [
        'Suele presentar grasa corporal elevada, especialmente en el abdomen',
        'Tiende a acumular grasa con facilidad',
        'Experimenta somnolencia o bajada de energia tras ingerir carbohidratos',
        'Se despierta con cansancio o sensacion de sueno prolongado',
        'Prefiere alimentos grasos y salados frente a los dulces'
      ],
      recommendation: 'Se recomienda priorizar las grasas como fuente principal de energia. Distribucion recomendada: 20-30% carbohidratos.'
    }
  };

  return descriptions[profile] || descriptions.mixto;
}

/**
 * Funcion principal que procesa una evaluacion completa
 * @param {Object} answers - Respuestas del cuestionario
 * @param {Object} userProfile - Perfil del usuario (peso_kg, objetivo, etc.)
 * @param {Object} currentEvaluation - Evaluacion actual (si existe)
 * @param {Object} objectiveData - Datos objetivos opcionales
 * @returns {Object} Resultado completo de la evaluacion
 */
export function processMetabolicEvaluation(answers, userProfile, currentEvaluation = null, objectiveData = null) {
  // 1. Calcular puntuacion
  const { rawScore, itemsAnswered, itemsNoSe, breakdown } = calculateMetabolicScore(answers);

  // 2. Ajustar con senales objetivas si estan disponibles
  let finalScore = rawScore;
  let objectiveAdjustments = null;

  if (objectiveData) {
    const { adjustedScore, adjustments, hasAdjustments } = adjustScoreWithObjectiveSignals(rawScore, objectiveData);
    if (hasAdjustments) {
      finalScore = adjustedScore;
      objectiveAdjustments = adjustments;
    }
  }

  // 3. Calcular nivel de confianza
  const confidence = calculateConfidenceLevel(itemsAnswered, itemsNoSe);

  // 4. Clasificar perfil
  let metabolicProfile = classifyMetabolicProfile(finalScore);

  // 5. Aplicar regla de confianza baja
  if (confidence.forcesMixto) {
    metabolicProfile = 'mixto';
  }

  // 6. Validar cambio de perfil si hay evaluacion previa
  let changeValidation = null;
  let appliedProfile = metabolicProfile;

  if (currentEvaluation) {
    changeValidation = validateProfileChange(
      currentEvaluation.metabolic_profile,
      metabolicProfile,
      currentEvaluation.consecutive_change_count || 0,
      confidence.level
    );
    appliedProfile = changeValidation.appliedProfile;
  }

  // 7. Calcular macros para el perfil aplicado
  const { peso_kg, objetivo, training_type } = userProfile;
  const kcalObjetivo = userProfile.kcal_objetivo || userProfile.tdee || 2000;

  const rawMacros = calculateMacrosWithMetabolicProfile(
    kcalObjetivo,
    peso_kg,
    appliedProfile,
    objetivo,
    training_type
  );

  // 8. Aplicar guardarrailes de minimos
  const finalMacros = applyMinimumGuardrails(rawMacros, peso_kg, objetivo, kcalObjetivo);

  // 9. Obtener descripcion del perfil
  const profileDescription = getProfileDescription(appliedProfile);

  return {
    // Datos de la evaluacion
    rawScore,
    adjustedScore: finalScore,
    itemsAnswered,
    itemsNoSe,
    breakdown,
    objectiveAdjustments,

    // Clasificacion
    calculatedProfile: metabolicProfile,
    appliedProfile,
    confidence: confidence.level,
    confidenceDescription: confidence.description,

    // Validacion de cambio
    changeValidation,
    profileChanged: currentEvaluation ? appliedProfile !== currentEvaluation.metabolic_profile : true,

    // Macros calculados
    macros: finalMacros,

    // Descripcion
    profileDescription,

    // Metadata
    evaluationDate: new Date().toISOString(),
    version: '1.0'
  };
}
