/**
 * Configuración de Movimientos y Grupos Musculares para Powerlifting
 * Basado en los 3 levantamientos principales + asistencia
 *
 * @author Claude Code - Arquitectura Modular Profesional
 * @version 1.0.0
 */

// IDs de grupos musculares de Powerlifting
export const MUSCLE_GROUP_IDS = {
  SQUAT: 'sentadilla',
  BENCH: 'press_banca',
  DEADLIFT: 'peso_muerto',
  ASSISTANCE_LOWER: 'asistencia_inferior',
  ASSISTANCE_UPPER: 'asistencia_superior'
};

/**
 * Configuración completa de grupos musculares de Powerlifting
 */
export const POWERLIFTING_MUSCLE_GROUPS = {
  [MUSCLE_GROUP_IDS.SQUAT]: {
    id: MUSCLE_GROUP_IDS.SQUAT,
    name: 'Sentadilla',
    description: 'Levantamiento principal de tren inferior',
    icon: '🏋️',
    color: 'red-500',
    priority: 1,
    mainLift: true,

    variations: [
      'Back Squat (barra alta)',
      'Back Squat (barra baja)',
      'Front Squat',
      'Box Squat',
      'Pause Squat',
      'Tempo Squat',
      'Safety Bar Squat',
      'Wide Stance Squat',
      'Narrow Stance Squat'
    ],

    musclesWorked: ['Cuádriceps', 'Glúteos', 'Isquios', 'Core', 'Espalda baja'],

    technicalFocus: [
      'Profundidad mínima (cadera bajo rodilla)',
      'Posición de barra (alta vs baja)',
      'Ángulo de torso',
      'Estabilidad del core',
      'Drive de cadera en ascenso'
    ],

    commonWeaknesses: [
      'Bottom position (trabajo de pausa)',
      'Sticking point (cadenas/bandas)',
      'Lock-out (quarter squats)',
      'Movilidad (front squats)',
      'Core (squats con pausa)'
    ]
  },

  [MUSCLE_GROUP_IDS.BENCH]: {
    id: MUSCLE_GROUP_IDS.BENCH,
    name: 'Press de Banca',
    description: 'Levantamiento principal de tren superior',
    icon: '💪',
    color: 'orange-500',
    priority: 2,
    mainLift: true,

    variations: [
      'Press de banca plano',
      'Press con pausa',
      'Close Grip Bench',
      'Wide Grip Bench',
      'Tempo Bench',
      'Floor Press',
      'Board Press',
      'Incline Bench',
      'Bench con cadenas/bandas'
    ],

    musclesWorked: ['Pecho', 'Tríceps', 'Hombros anterior', 'Dorsales'],

    technicalFocus: [
      'Retracción escapular',
      'Arco torácico',
      'Leg drive',
      'Trayectoria de barra',
      'Toque al pecho controlado'
    ],

    commonWeaknesses: [
      'Off chest (pause bench)',
      'Mid-range (tempo bench)',
      'Lock-out (close grip, boards)',
      'Estabilidad (spoto press)',
      'Fuerza tríceps (JM press)'
    ]
  },

  [MUSCLE_GROUP_IDS.DEADLIFT]: {
    id: MUSCLE_GROUP_IDS.DEADLIFT,
    name: 'Peso Muerto',
    description: 'Levantamiento principal de cadena posterior',
    icon: '🔥',
    color: 'red-600',
    priority: 3,
    mainLift: true,

    variations: [
      'Conventional Deadlift',
      'Sumo Deadlift',
      'Deficit Deadlift',
      'Block Pulls',
      'Paused Deadlift',
      'Romanian Deadlift',
      'Stiff-Leg Deadlift',
      'Snatch Grip Deadlift',
      'Deadlift con bandas/cadenas'
    ],

    musclesWorked: ['Isquios', 'Glúteos', 'Espalda baja', 'Dorsales', 'Traps', 'Grip'],

    technicalFocus: [
      'Setup (posición de cadera)',
      'Tensión antes del pull',
      'Trayectoria vertical de barra',
      'Lock-out (cadera + rodillas)',
      'Grip (doble overhand vs mixto)'
    ],

    commonWeaknesses: [
      'Off floor (deficits)',
      'Mid-range (pause deadlifts)',
      'Lock-out (rack pulls)',
      'Velocidad (speed pulls)',
      'Grip (farmers walks, holds)'
    ]
  },

  [MUSCLE_GROUP_IDS.ASSISTANCE_LOWER]: {
    id: MUSCLE_GROUP_IDS.ASSISTANCE_LOWER,
    name: 'Asistencia Tren Inferior',
    description: 'Ejercicios accesorios para sentadilla y peso muerto',
    icon: '🦵',
    color: 'blue-500',
    priority: 4,
    mainLift: false,

    variations: [
      'Leg Press',
      'Bulgarian Split Squat',
      'Lunges',
      'Good Mornings',
      'Hip Thrusts',
      'Leg Curls',
      'Leg Extensions',
      'Glute-Ham Raise',
      'Belt Squats',
      'Step-Ups'
    ],

    musclesWorked: ['Cuádriceps', 'Isquios', 'Glúteos', 'Aductores', 'Core'],

    purpose: [
      'Hipertrofia de grupos específicos',
      'Corrección de desbalances',
      'Trabajo unilateral',
      'Volumen adicional sin fatiga del SNC',
      'Rehabilitación preventiva'
    ]
  },

  [MUSCLE_GROUP_IDS.ASSISTANCE_UPPER]: {
    id: MUSCLE_GROUP_IDS.ASSISTANCE_UPPER,
    name: 'Asistencia Tren Superior',
    description: 'Ejercicios accesorios para press de banca',
    icon: '💪',
    color: 'purple-500',
    priority: 5,
    mainLift: false,

    variations: [
      'Dips',
      'Overhead Press',
      'Rows (Barbell/Dumbbell)',
      'Pull-Ups/Chin-Ups',
      'Tricep Extensions',
      'JM Press',
      'Face Pulls',
      'Lateral Raises',
      'Dumbbell Bench',
      'Cable Flyes'
    ],

    musclesWorked: ['Tríceps', 'Hombros', 'Dorsales', 'Pecho', 'Bíceps'],

    purpose: [
      'Fortalecer tríceps para lock-out',
      'Salud de hombros',
      'Desarrollo de dorsales (estabilidad)',
      'Hipertrofia muscular general',
      'Balance antagonista'
    ]
  }
};

/**
 * Obtener información de un grupo muscular específico
 */
export function getMuscleGroupInfo(groupId) {
  if (!groupId || typeof groupId !== 'string') {
    console.warn('[PowerliftingMuscleGroups] Invalid groupId:', groupId);
    return null;
  }

  const normalizedId = groupId.toLowerCase().trim();
  return POWERLIFTING_MUSCLE_GROUPS[normalizedId] || null;
}

/**
 * Obtener grupos musculares recomendados por nivel
 */
export function getRecommendedGroupsByLevel(level) {
  const normalizedLevel = String(level || '').toLowerCase();

  switch (normalizedLevel) {
    case 'novato':
      // Principiantes: Enfoque en los 3 principales + básica asistencia
      return [
        POWERLIFTING_MUSCLE_GROUPS[MUSCLE_GROUP_IDS.SQUAT],
        POWERLIFTING_MUSCLE_GROUPS[MUSCLE_GROUP_IDS.BENCH],
        POWERLIFTING_MUSCLE_GROUPS[MUSCLE_GROUP_IDS.DEADLIFT],
        POWERLIFTING_MUSCLE_GROUPS[MUSCLE_GROUP_IDS.ASSISTANCE_LOWER]
      ];

    case 'intermedio':
      // Intermedios: Todos los grupos con énfasis en variantes
      return [
        POWERLIFTING_MUSCLE_GROUPS[MUSCLE_GROUP_IDS.SQUAT],
        POWERLIFTING_MUSCLE_GROUPS[MUSCLE_GROUP_IDS.BENCH],
        POWERLIFTING_MUSCLE_GROUPS[MUSCLE_GROUP_IDS.DEADLIFT],
        POWERLIFTING_MUSCLE_GROUPS[MUSCLE_GROUP_IDS.ASSISTANCE_LOWER],
        POWERLIFTING_MUSCLE_GROUPS[MUSCLE_GROUP_IDS.ASSISTANCE_UPPER]
      ];

    case 'avanzado':
    case 'elite':
      // Avanzados/Elite: Todos los grupos + especialización
      return Object.values(POWERLIFTING_MUSCLE_GROUPS);

    default:
      console.warn('[PowerliftingMuscleGroups] Unknown level:', level);
      return Object.values(POWERLIFTING_MUSCLE_GROUPS);
  }
}

/**
 * Generar split balanceado de entrenamiento
 */
export function generateBalancedSplit(level, daysPerWeek) {
  const normalizedLevel = String(level || '').toLowerCase();
  const days = Number(daysPerWeek) || 3;

  // Template de splits según días disponibles
  const splits = {
    3: {
      name: 'Full Body 3x',
      days: [
        {
          name: 'Día 1: Sentadilla + Press',
          focus: [MUSCLE_GROUP_IDS.SQUAT, MUSCLE_GROUP_IDS.BENCH, MUSCLE_GROUP_IDS.ASSISTANCE_UPPER],
          mainLifts: ['Sentadilla', 'Press Banca']
        },
        {
          name: 'Día 2: Peso Muerto + Asistencia',
          focus: [MUSCLE_GROUP_IDS.DEADLIFT, MUSCLE_GROUP_IDS.ASSISTANCE_LOWER, MUSCLE_GROUP_IDS.ASSISTANCE_UPPER],
          mainLifts: ['Peso Muerto']
        },
        {
          name: 'Día 3: Sentadilla + Press (Ligero)',
          focus: [MUSCLE_GROUP_IDS.SQUAT, MUSCLE_GROUP_IDS.BENCH, MUSCLE_GROUP_IDS.ASSISTANCE_LOWER],
          mainLifts: ['Sentadilla (variante)', 'Press Banca (variante)']
        }
      ]
    },
    4: {
      name: 'Upper/Lower Split',
      days: [
        {
          name: 'Día 1: Sentadilla + Asistencia Inferior',
          focus: [MUSCLE_GROUP_IDS.SQUAT, MUSCLE_GROUP_IDS.ASSISTANCE_LOWER],
          mainLifts: ['Sentadilla']
        },
        {
          name: 'Día 2: Press Banca + Asistencia Superior',
          focus: [MUSCLE_GROUP_IDS.BENCH, MUSCLE_GROUP_IDS.ASSISTANCE_UPPER],
          mainLifts: ['Press Banca']
        },
        {
          name: 'Día 3: Peso Muerto + Accesorios',
          focus: [MUSCLE_GROUP_IDS.DEADLIFT, MUSCLE_GROUP_IDS.ASSISTANCE_LOWER],
          mainLifts: ['Peso Muerto']
        },
        {
          name: 'Día 4: Press (Variante) + Asistencia',
          focus: [MUSCLE_GROUP_IDS.BENCH, MUSCLE_GROUP_IDS.ASSISTANCE_UPPER],
          mainLifts: ['Press Banca (variante)', 'Overhead Press']
        }
      ]
    },
    5: {
      name: 'Powerlifting 5-Day Split',
      days: [
        {
          name: 'Día 1: Sentadilla (Pesada)',
          focus: [MUSCLE_GROUP_IDS.SQUAT, MUSCLE_GROUP_IDS.ASSISTANCE_LOWER],
          mainLifts: ['Sentadilla']
        },
        {
          name: 'Día 2: Press Banca (Pesado)',
          focus: [MUSCLE_GROUP_IDS.BENCH, MUSCLE_GROUP_IDS.ASSISTANCE_UPPER],
          mainLifts: ['Press Banca']
        },
        {
          name: 'Día 3: Peso Muerto (Pesado)',
          focus: [MUSCLE_GROUP_IDS.DEADLIFT, MUSCLE_GROUP_IDS.ASSISTANCE_LOWER],
          mainLifts: ['Peso Muerto']
        },
        {
          name: 'Día 4: Sentadilla (Ligera) + Asistencia',
          focus: [MUSCLE_GROUP_IDS.SQUAT, MUSCLE_GROUP_IDS.ASSISTANCE_LOWER],
          mainLifts: ['Sentadilla (variante)', 'Front Squat']
        },
        {
          name: 'Día 5: Press (Variante) + Asistencia',
          focus: [MUSCLE_GROUP_IDS.BENCH, MUSCLE_GROUP_IDS.ASSISTANCE_UPPER],
          mainLifts: ['Close Grip Bench', 'Overhead Press']
        }
      ]
    }
  };

  return splits[days] || splits[3];
}

/**
 * Obtener todos los grupos musculares
 */
export function getAllMuscleGroups() {
  return Object.values(POWERLIFTING_MUSCLE_GROUPS);
}

/**
 * Obtener solo los levantamientos principales
 */
export function getMainLifts() {
  return Object.values(POWERLIFTING_MUSCLE_GROUPS).filter(group => group.mainLift);
}

/**
 * Obtener solo ejercicios de asistencia
 */
export function getAssistanceGroups() {
  return Object.values(POWERLIFTING_MUSCLE_GROUPS).filter(group => !group.mainLift);
}

/**
 * Validar si un grupo muscular es válido
 */
export function isValidMuscleGroup(groupId) {
  const normalizedId = String(groupId || '').toLowerCase().trim();
  return Object.keys(POWERLIFTING_MUSCLE_GROUPS).includes(normalizedId);
}

/**
 * Obtener recomendaciones de frecuencia por grupo y nivel
 */
export function getFrequencyRecommendations(level) {
  const normalizedLevel = String(level || '').toLowerCase();

  const recommendations = {
    novato: {
      [MUSCLE_GROUP_IDS.SQUAT]: '2x por semana',
      [MUSCLE_GROUP_IDS.BENCH]: '2x por semana',
      [MUSCLE_GROUP_IDS.DEADLIFT]: '1x por semana',
      [MUSCLE_GROUP_IDS.ASSISTANCE_LOWER]: '2-3x por semana',
      [MUSCLE_GROUP_IDS.ASSISTANCE_UPPER]: '2-3x por semana'
    },
    intermedio: {
      [MUSCLE_GROUP_IDS.SQUAT]: '2-3x por semana',
      [MUSCLE_GROUP_IDS.BENCH]: '2-3x por semana',
      [MUSCLE_GROUP_IDS.DEADLIFT]: '1-2x por semana',
      [MUSCLE_GROUP_IDS.ASSISTANCE_LOWER]: '2-3x por semana',
      [MUSCLE_GROUP_IDS.ASSISTANCE_UPPER]: '3-4x por semana'
    },
    avanzado: {
      [MUSCLE_GROUP_IDS.SQUAT]: '2-3x por semana (variantes)',
      [MUSCLE_GROUP_IDS.BENCH]: '3-4x por semana (variantes)',
      [MUSCLE_GROUP_IDS.DEADLIFT]: '1-2x por semana',
      [MUSCLE_GROUP_IDS.ASSISTANCE_LOWER]: '3-4x por semana',
      [MUSCLE_GROUP_IDS.ASSISTANCE_UPPER]: '4-5x por semana'
    },
    elite: {
      [MUSCLE_GROUP_IDS.SQUAT]: '3-4x por semana (variantes + especialización)',
      [MUSCLE_GROUP_IDS.BENCH]: '4-5x por semana (variantes + especialización)',
      [MUSCLE_GROUP_IDS.DEADLIFT]: '2-3x por semana (variantes)',
      [MUSCLE_GROUP_IDS.ASSISTANCE_LOWER]: '4-5x por semana',
      [MUSCLE_GROUP_IDS.ASSISTANCE_UPPER]: '5-6x por semana'
    }
  };

  return recommendations[normalizedLevel] || recommendations.novato;
}

export default POWERLIFTING_MUSCLE_GROUPS;
