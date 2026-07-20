/**
 * CARBOHYDRATE TIMING SERVICE
 *
 * Sistema de timing de carbohidratos pre/post entreno
 *
 * VALOR PARA EL USUARIO:
 * - Maximiza rendimiento en entrenamientos
 * - Optimiza recuperación post-entreno
 * - Mejora composición corporal mediante timing estratégico
 * - Personaliza según metodología, intensidad y momento del día
 *
 * PRINCIPIOS:
 * - Pre-entreno: Energía rápida para rendimiento
 * - Post-entreno: Reposición de glucógeno y recuperación
 * - Timing adaptado a intensidad y duración de sesión
 */

import { pool } from '../db.js';

/**
 * Ventanas de timing según evidencia científica
 */
export const TIMING_WINDOWS = {
  PRE_WORKOUT: {
    EARLY: { hours: 3, label: '3h antes' },        // Comida completa
    MEDIUM: { hours: 1.5, label: '1-2h antes' },   // Comida ligera
    IMMEDIATE: { hours: 0.5, label: '30-60min antes' }  // Snack rápido
  },
  POST_WORKOUT: {
    IMMEDIATE: { hours: 0.5, label: 'Primeros 30min' },   // Reposición temprana
    EARLY: { hours: 2, label: 'Primeras 2h' },            // Ventana óptima
    EXTENDED: { hours: 4, label: 'Hasta 4h' }             // Aceptable
  }
};

/**
 * Tipos de carbohidratos según timing
 */
const CARB_TYPES = {
  FAST: {
    name: 'Rápidos',
    description: 'Alto índice glucémico',
    examples: ['Pan blanco', 'Arroz blanco', 'Patata', 'Dextrosa', 'Plátano maduro'],
    gi_range: [70, 100]
  },
  MEDIUM: {
    name: 'Moderados',
    description: 'Índice glucémico medio',
    examples: ['Avena', 'Arroz basmati', 'Boniato', 'Pasta integral', 'Frutas'],
    gi_range: [50, 69]
  },
  SLOW: {
    name: 'Lentos',
    description: 'Bajo índice glucémico',
    examples: ['Legumbres', 'Quinoa', 'Pan integral', 'Verduras'],
    gi_range: [0, 49]
  }
};

/**
 * Calcula necesidades de carbohidratos pre-entreno según metodología
 *
 * VALOR: Los usuarios optimizan su energía para rendir al máximo
 *
 * @param {Object} params - Parámetros de la sesión
 * @returns {Object} - Recomendación de carbs pre-entreno
 */
export function calculatePreWorkoutCarbs(params) {
  const {
    bodyWeight,          // Peso corporal en kg
    methodology,         // 'calistenia', 'hipertrofia', 'oposicion', etc.
    sessionIntensity,    // 'baja', 'media', 'alta', 'muy_alta'
    sessionDuration,     // Duración en minutos
    timeUntilWorkout,    // Horas hasta entreno
    dailyCarbTarget      // Total de carbos del día
  } = params;

  // 1. Determinar cantidad base según metodología
  let carbsPerKg = 0;

  switch (methodology) {
    case 'hipertrofia':
    case 'gym':
      carbsPerKg = sessionIntensity === 'alta' || sessionIntensity === 'muy_alta'
        ? 0.8  // Entreno pesado: más carbos
        : 0.5;
      break;

    case 'calistenia':
      carbsPerKg = sessionIntensity === 'alta' || sessionIntensity === 'muy_alta'
        ? 0.7  // Skills y fuerza: moderado-alto
        : 0.4;
      break;

    case 'oposicion':
    case 'crossfit':
      carbsPerKg = sessionIntensity === 'muy_alta'
        ? 1.0  // Entreno metabólico intenso: máximos carbos
        : 0.8;
      break;

    case 'powerlifting':
      carbsPerKg = 0.8;  // Fuerza requiere energía constante
      break;

    default:
      carbsPerKg = 0.5;
  }

  // 2. Ajustar por duración de sesión
  if (sessionDuration >= 90) {
    carbsPerKg *= 1.3;  // Sesiones largas necesitan más energía
  } else if (sessionDuration >= 60) {
    carbsPerKg *= 1.1;
  }

  const baseCarbs = Math.round(bodyWeight * carbsPerKg);

  // 3. Determinar timing y tipo de carbos
  let timing, carbType, portionSize;

  if (timeUntilWorkout >= 3) {
    // COMIDA COMPLETA (3+ horas antes)
    timing = TIMING_WINDOWS.PRE_WORKOUT.EARLY;
    carbType = CARB_TYPES.MEDIUM;
    portionSize = baseCarbs;

  } else if (timeUntilWorkout >= 1.5) {
    // COMIDA LIGERA (1-2 horas)
    timing = TIMING_WINDOWS.PRE_WORKOUT.MEDIUM;
    carbType = CARB_TYPES.MEDIUM;
    portionSize = Math.round(baseCarbs * 0.75);

  } else {
    // SNACK RÁPIDO (30-60 min)
    timing = TIMING_WINDOWS.PRE_WORKOUT.IMMEDIATE;
    carbType = CARB_TYPES.FAST;
    portionSize = Math.round(baseCarbs * 0.5);
  }

  // 4. Validar que no exceda el objetivo diario
  const maxPreWorkout = Math.round(dailyCarbTarget * 0.35); // Máximo 35% pre-entreno
  if (portionSize > maxPreWorkout) {
    portionSize = maxPreWorkout;
  }

  // 5. Generar recomendaciones concretas
  const recommendations = generateMealExamples(portionSize, carbType, timing, 'pre');

  return {
    carbs_g: portionSize,
    timing: timing.label,
    carb_type: carbType.name,
    carb_type_description: carbType.description,
    examples: carbType.examples,
    meal_recommendations: recommendations,
    rationale: `Para ${methodology} a intensidad ${sessionIntensity} por ${sessionDuration} min, necesitas ${portionSize}g de carbos ${carbType.name.toLowerCase()} ${timing.label} del entreno para optimizar rendimiento.`
  };
}

/**
 * Calcula necesidades de carbohidratos post-entreno
 *
 * VALOR: Optimiza recuperación y reposición de glucógeno
 *
 * @param {Object} params - Parámetros de la sesión completada
 * @returns {Object} - Recomendación de carbs post-entreno
 */
export function calculatePostWorkoutCarbs(params) {
  const {
    bodyWeight,
    methodology,
    sessionIntensity,
    sessionDuration,
    volumeLifted,        // Total kg levantados (opcional, para hipertrofia)
    timeSinceWorkout,    // Horas desde que terminó
    dailyCarbTarget
  } = params;

  // 1. Determinar cantidad base según depleción de glucógeno
  let carbsPerKg = 0;

  switch (methodology) {
    case 'hipertrofia':
    case 'gym':
      // Hipertrofia depleta mucho glucógeno muscular
      carbsPerKg = sessionIntensity === 'alta' || sessionIntensity === 'muy_alta'
        ? 1.0  // Sesión pesada: máxima reposición
        : 0.7;
      break;

    case 'calistenia':
      carbsPerKg = sessionIntensity === 'alta' || sessionIntensity === 'muy_alta'
        ? 0.8
        : 0.6;
      break;

    case 'oposicion':
    case 'crossfit':
      // Metabólico depleta glucógeno rápidamente
      carbsPerKg = sessionIntensity === 'muy_alta'
        ? 1.2  // CrossFit intenso: reposición agresiva
        : 0.9;
      break;

    case 'powerlifting':
      carbsPerKg = 0.8;  // Moderado, el glucógeno no se depleta tanto
      break;

    default:
      carbsPerKg = 0.7;
  }

  // 2. Ajustar por duración e intensidad
  if (sessionDuration >= 90 && sessionIntensity === 'muy_alta') {
    carbsPerKg *= 1.4;  // Sesión larga e intensa: máxima depleción
  } else if (sessionDuration >= 60) {
    carbsPerKg *= 1.2;
  }

  const baseCarbs = Math.round(bodyWeight * carbsPerKg);

  // 3. Determinar timing y tipo según ventana post-entreno
  let timing, carbType, portionSize, protein;

  if (timeSinceWorkout <= 0.5) {
    // Reposición temprana (primeros 30 min)
    timing = TIMING_WINDOWS.POST_WORKOUT.IMMEDIATE;
    carbType = CARB_TYPES.FAST;
    portionSize = baseCarbs;
    protein = Math.round(bodyWeight * 0.3); // Ratio 3:1 carbs:protein

  } else if (timeSinceWorkout <= 2) {
    // VENTANA ÓPTIMA (hasta 2h)
    timing = TIMING_WINDOWS.POST_WORKOUT.EARLY;
    carbType = CARB_TYPES.FAST;
    portionSize = Math.round(baseCarbs * 0.85);
    protein = Math.round(bodyWeight * 0.35);

  } else {
    // VENTANA EXTENDIDA (2-4h)
    timing = TIMING_WINDOWS.POST_WORKOUT.EXTENDED;
    carbType = CARB_TYPES.MEDIUM;
    portionSize = Math.round(baseCarbs * 0.7);
    protein = Math.round(bodyWeight * 0.35);
  }

  // 4. Validar límite diario
  const maxPostWorkout = Math.round(dailyCarbTarget * 0.4); // Máximo 40% post-entreno
  if (portionSize > maxPostWorkout) {
    portionSize = maxPostWorkout;
  }

  // 5. Generar recomendaciones con proteína
  const recommendations = generateMealExamples(
    portionSize,
    carbType,
    timing,
    'post',
    protein
  );

  return {
    carbs_g: portionSize,
    protein_g: protein,
    timing: timing.label,
    carb_type: carbType.name,
    carb_type_description: carbType.description,
    examples: carbType.examples,
    meal_recommendations: recommendations,
    // §14.3: sin cuenta atrás ni urgencia. Mensaje neutro y de contexto.
    rationale: `Incluye carbohidratos y proteína en tu comida post-entreno (${timing.label}) para reponer glucógeno y favorecer la recuperación.`
  };
}

/**
 * Genera ejemplos concretos de comidas
 *
 * VALOR: Usuario sabe exactamente QUÉ comer, no solo cuántos gramos
 *
 * @param {number} carbsTarget - Gramos objetivo
 * @param {Object} carbType - Tipo de carbohidrato
 * @param {Object} timing - Ventana de timing
 * @param {string} when - 'pre' o 'post'
 * @param {number} protein - Gramos de proteína (opcional, para post)
 * @returns {Array} - Ejemplos de comidas
 */
function generateMealExamples(carbsTarget, carbType, timing, when, protein = 0) {
  const examples = [];

  if (when === 'pre') {
    // Ejemplos PRE-entreno según tipo de carbo
    if (carbType === CARB_TYPES.FAST) {
      examples.push({
        name: 'Snack energético rápido',
        foods: [
          { item: 'Plátano maduro', amount: '1-2 unidades', carbs: 30 },
          { item: 'Pan blanco con mermelada', amount: '2 rebanadas', carbs: 35 }
        ],
        total_carbs: Math.min(65, carbsTarget),
        notes: 'Energía inmediata para el entreno'
      });

      examples.push({
        name: 'Batido pre-entreno',
        foods: [
          { item: 'Dextrosa o maltodextrina', amount: `${Math.round(carbsTarget * 0.6)}g`, carbs: Math.round(carbsTarget * 0.6) },
          { item: 'Plátano', amount: '1 unidad', carbs: 25 }
        ],
        total_carbs: carbsTarget,
        notes: 'Absorción muy rápida, ideal 30-45min antes'
      });

    } else if (carbType === CARB_TYPES.MEDIUM) {
      // §14.5: las cantidades exactas se calcularán desde la composición real del
      // catálogo (macros_100g + factores de conversión), no con divisores mágicos.
      // Hasta entonces se ofrece el tipo de alimento sin gramos inventados.
      examples.push({
        name: 'Comida pre-entreno completa',
        foods: [
          { item: 'Arroz basmati', amount: 'según tu objetivo de carbohidratos', carbs: null },
          { item: 'Boniato al horno', amount: 'ración media', carbs: null },
          { item: 'Pechuga de pollo', amount: 'ración media', carbs: 0, protein: null }
        ],
        total_carbs: carbsTarget,
        notes: 'Energía sostenida, consumir 2-3h antes'
      });

      examples.push({
        name: 'Opción con avena',
        foods: [
          { item: 'Avena', amount: 'según tu objetivo de carbohidratos', carbs: null },
          { item: 'Frutas variadas', amount: 'ración media', carbs: null }
        ],
        total_carbs: carbsTarget,
        notes: 'Liberación gradual de energía'
      });
    }

  } else {
    // Ejemplos POST-entreno
    // §14.5: cantidades exactas desde catálogo real (pendiente PR2); sin divisores.
    examples.push({
      name: 'Comida post-entreno óptima',
      foods: [
        { item: 'Arroz blanco', amount: 'según tu objetivo de carbohidratos', carbs: null },
        { item: 'Pechuga de pollo o pescado', amount: 'según tu objetivo de proteína', carbs: 0, protein: null },
        { item: 'Verduras', amount: 'al gusto', carbs: null }
      ],
      total_carbs: carbsTarget,
      total_protein: protein,
      notes: 'Reposición de glucógeno + síntesis proteica'
    });

    examples.push({
      name: 'Batido post-entreno rápido',
      foods: [
        { item: 'Dextrosa o maltodextrina', amount: 'según tu objetivo de carbohidratos', carbs: null },
        { item: 'Proteína whey', amount: 'según tu objetivo de proteína', carbs: null, protein: null },
        { item: 'Plátano', amount: '1 unidad', carbs: null }
      ],
      total_carbs: carbsTarget,
      total_protein: protein,
      notes: 'Opción de absorción rápida'
    });

    examples.push({
      name: 'Opción con patata',
      foods: [
        { item: 'Patata cocida', amount: 'según tu objetivo de carbohidratos', carbs: null },
        { item: 'Huevos enteros', amount: '3 unidades', carbs: null, protein: null },
        { item: 'Atún o salmón', amount: 'ración media', carbs: 0, protein: null }
      ],
      total_carbs: carbsTarget,
      total_protein: protein,
      notes: 'Comida completa con micronutrientes'
    });
  }

  return examples;
}

/**
 * Calcula distribución óptima de carbohidratos en día de entreno
 *
 * VALOR: Usuario optimiza TODO el día, no solo pre/post
 *
 * @param {Object} params - Parámetros del día
 * @returns {Object} - Distribución completa del día
 */
export function calculateDailyCarbDistribution(params) {
  const {
    dailyCarbTarget,      // Total de carbos del día
    workoutTimeOfDay,     // 'morning', 'afternoon', 'evening', 'night'
    hasPreWorkoutMeal,    // Boolean
    hoursUntilWorkout,
    sessionParams         // Params para calcular pre/post
  } = params;

  // Calcular pre y post
  const preWorkout = calculatePreWorkoutCarbs({
    ...sessionParams,
    timeUntilWorkout: hoursUntilWorkout,
    dailyCarbTarget
  });

  const postWorkout = calculatePostWorkoutCarbs({
    ...sessionParams,
    timeSinceWorkout: 0.5, // Asumir reposición temprana
    dailyCarbTarget
  });

  const periWorkoutCarbs = preWorkout.carbs_g + postWorkout.carbs_g;
  const remainingCarbs = dailyCarbTarget - periWorkoutCarbs;

  // Distribuir el resto según momento del día
  let distribution = {};

  if (workoutTimeOfDay === 'morning') {
    // Entreno por la mañana
    distribution = {
      pre_workout: preWorkout.carbs_g,
      post_workout: postWorkout.carbs_g,
      afternoon_meal: Math.round(remainingCarbs * 0.4),
      evening_meal: Math.round(remainingCarbs * 0.35),
      snacks: Math.round(remainingCarbs * 0.25)
    };

  } else if (workoutTimeOfDay === 'afternoon') {
    // Entreno tarde
    distribution = {
      breakfast: Math.round(remainingCarbs * 0.3),
      pre_workout: preWorkout.carbs_g,
      post_workout: postWorkout.carbs_g,
      evening_meal: Math.round(remainingCarbs * 0.5),
      snacks: Math.round(remainingCarbs * 0.2)
    };

  } else if (workoutTimeOfDay === 'evening') {
    // Entreno noche
    distribution = {
      breakfast: Math.round(remainingCarbs * 0.25),
      lunch: Math.round(remainingCarbs * 0.35),
      pre_workout: preWorkout.carbs_g,
      post_workout: postWorkout.carbs_g,
      snacks: Math.round(remainingCarbs * 0.4)
    };

  } else {
    // Entreno noche tardía
    distribution = {
      breakfast: Math.round(remainingCarbs * 0.3),
      lunch: Math.round(remainingCarbs * 0.35),
      pre_workout: preWorkout.carbs_g,
      post_workout: postWorkout.carbs_g,
      late_snack: Math.round(remainingCarbs * 0.35)
    };
  }

  return {
    total_daily_carbs: dailyCarbTarget,
    peri_workout_carbs: periWorkoutCarbs,
    peri_workout_percentage: Math.round((periWorkoutCarbs / dailyCarbTarget) * 100),
    distribution,
    pre_workout_details: preWorkout,
    post_workout_details: postWorkout,
    recommendations: [
      `Concentra el ${Math.round((periWorkoutCarbs / dailyCarbTarget) * 100)}% de tus carbos alrededor del entreno`,
      'Prioriza carbos rápidos post-entreno para recuperación',
      'Distribuye el resto en comidas según preferencia',
      workoutTimeOfDay === 'evening' || workoutTimeOfDay === 'night'
        ? 'Los carbos post-entreno nocturnos NO engordan - son para recuperación'
        : 'Aprovecha la sensibilidad a insulina post-entreno'
    ]
  };
}

export default {
  calculatePreWorkoutCarbs,
  calculatePostWorkoutCarbs,
  calculateDailyCarbDistribution,
  TIMING_WINDOWS,
  CARB_TYPES
};
