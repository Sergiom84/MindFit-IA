/**
 * HeavyDutyMuscleGroups.js - Configuración de Grupos Musculares Heavy Duty
 * ===========================================================================
 *
 * Define los grupos musculares y splits de entrenamiento según la metodología Heavy Duty:
 * - Enfoque en ejercicios compuestos
 * - Mínimo volumen, máxima intensidad
 * - Descansos prolongados entre grupos musculares
 *
 * @author Claude Code - Arquitectura Modular Profesional
 * @version 1.0.0
 */

// ============================================================================
// GRUPOS MUSCULARES HEAVY DUTY
// ============================================================================

export const HEAVY_DUTY_MUSCLE_GROUPS = {
  pecho: {
    id: 'pecho',
    name: 'Pecho',
    icon: '💪',
    description: 'Desarrollo completo del pectoral con ejercicios de empuje horizontal',

    // Ejercicios principales por nivel
    exercises: {
      principiante: [
        'Press de pecho en máquina',
        'Pec-deck (aperturas)'
      ],
      intermedio: [
        'Press de banca con barra',
        'Press inclinado con mancuernas'
      ],
      avanzado: [
        'Press de banca con pausa',
        'Fondos lastrados en paralelas'
      ]
    },

    // Parámetros Heavy Duty
    heavyDutyParams: {
      setsPerWorkout: 1,  // 1 serie al fallo absoluto
      repsRange: '6-12',
      intensity: 'Fallo muscular absoluto',
      restBetweenWorkouts: '5-7 días',
      timeUnderTension: '50-90 segundos'
    },

    // Patrones de movimiento
    movementPatterns: [
      'Empuje horizontal',
      'Empuje inclinado (fibras superiores)',
      'Aducción horizontal (aperturas)'
    ],

    // Técnicas de intensificación permitidas
    intensificationTechniques: [
      'Pre-agotamiento (aperturas + press)',
      'Negativas lentas (4-6 segundos)',
      'Rest-pause (15 seg + 2-3 reps adicionales)'
    ],

    // Notas específicas
    notes: 'Heavy Duty prioriza el press compuesto sobre aislamiento. Una serie al fallo en press de banca es suficiente.'
  },

  espalda: {
    id: 'espalda',
    name: 'Espalda',
    icon: '🦾',
    description: 'Desarrollo de espalda ancha y gruesa con tracciones y remos',

    exercises: {
      principiante: [
        'Jalón al pecho en polea',
        'Remo en polea baja'
      ],
      intermedio: [
        'Dominadas lastradas',
        'Remo con barra 45°'
      ],
      avanzado: [
        'Dominadas con pausa',
        'Peso muerto (enfoque espalda baja)'
      ]
    },

    heavyDutyParams: {
      setsPerWorkout: 1,  // Por ejercicio
      repsRange: '6-10',
      intensity: 'Fallo muscular',
      restBetweenWorkouts: '5-7 días',
      timeUnderTension: '60-90 segundos'
    },

    movementPatterns: [
      'Tracción vertical (dorsal)',
      'Tracción horizontal (grosor)',
      'Extensión de cadera (erectores)'
    ],

    intensificationTechniques: [
      'Pre-agotamiento (jalón + dominadas)',
      'Negativas ultra-lentas (6-8 segundos)',
      'Contrast sets (agarre supino/prono)'
    ],

    notes: 'La espalda responde excepcionalmente bien al Heavy Duty. Una serie explosiva de dominadas lastradas puede ser suficiente.'
  },

  piernas: {
    id: 'piernas',
    name: 'Piernas',
    icon: '🦵',
    description: 'Desarrollo completo de piernas con sentadillas y extensiones de cadera',

    exercises: {
      principiante: [
        'Prensa de piernas',
        'Extensiones de cuádriceps',
        'Curl femoral'
      ],
      intermedio: [
        'Sentadilla con barra',
        'Peso muerto rumano',
        'Zancadas con mancuernas'
      ],
      avanzado: [
        'Sentadilla con pausa',
        'Peso muerto con deficit',
        'Sentadilla búlgara'
      ]
    },

    heavyDutyParams: {
      setsPerWorkout: 1,  // Por ejercicio
      repsRange: '8-15',  // Rango más alto para piernas
      intensity: 'Fallo muscular absoluto',
      restBetweenWorkouts: '5-7 días',
      timeUnderTension: '70-120 segundos'
    },

    movementPatterns: [
      'Sentadilla (cuádriceps + glúteos)',
      'Extensión de cadera (femorales + glúteos)',
      'Extensión aislada (cuádriceps)'
    ],

    intensificationTechniques: [
      'Pre-agotamiento (extensiones + sentadilla)',
      'Rest-pause en prensa',
      'Negativas lentas en peso muerto'
    ],

    notes: 'Las piernas requieren volumen ligeramente mayor. Se recomienda 2-3 ejercicios por sesión, 1 serie cada uno.'
  },

  hombros: {
    id: 'hombros',
    name: 'Hombros',
    icon: '🏋️',
    description: 'Desarrollo de hombros con press militar y elevaciones',

    exercises: {
      principiante: [
        'Press de hombros en máquina',
        'Elevaciones laterales con polea'
      ],
      intermedio: [
        'Press militar con barra',
        'Press Arnold'
      ],
      avanzado: [
        'Press militar tras nuca (movilidad permitiendo)',
        'Press con pausa'
      ]
    },

    heavyDutyParams: {
      setsPerWorkout: 1,
      repsRange: '6-10',
      intensity: 'Fallo muscular',
      restBetweenWorkouts: '5-7 días',
      timeUnderTension: '50-80 segundos'
    },

    movementPatterns: [
      'Empuje vertical (deltoides)',
      'Abducción lateral (deltoides medio)',
      'Elevación posterior (deltoides posterior)'
    ],

    intensificationTechniques: [
      'Pre-agotamiento (laterales + press)',
      'Rest-pause en press',
      'Negativas controladas'
    ],

    notes: 'Los hombros se recuperan de press de pecho. Evitar sobreentrenamiento con volumen excesivo.'
  },

  brazos: {
    id: 'brazos',
    name: 'Brazos',
    icon: '💪',
    description: 'Bíceps y tríceps con curls y extensiones',

    exercises: {
      principiante: [
        'Curl con barra',
        'Extensiones de tríceps en polea'
      ],
      intermedio: [
        'Curl con barra Z',
        'Press francés',
        'Fondos en paralelas'
      ],
      avanzado: [
        'Curl 21s al fallo',
        'Press francés con pausa',
        'Fondos lastrados'
      ]
    },

    heavyDutyParams: {
      setsPerWorkout: 1,
      repsRange: '8-12',
      intensity: 'Fallo muscular',
      restBetweenWorkouts: '5-7 días',
      timeUnderTension: '40-70 segundos'
    },

    movementPatterns: [
      'Flexión de codo (bíceps)',
      'Extensión de codo (tríceps)'
    ],

    intensificationTechniques: [
      'Pre-agotamiento (aislamiento + compuesto)',
      'Rest-pause en curl',
      'Negativas ultra-lentas'
    ],

    notes: 'Los brazos reciben estímulo indirecto de pecho y espalda. Una serie directa es suficiente.'
  },

  core: {
    id: 'core',
    name: 'Core',
    icon: '🎯',
    description: 'Desarrollo del core con anti-rotación y flexión',

    exercises: {
      principiante: [
        'Plancha abdominal',
        'Crunch en máquina'
      ],
      intermedio: [
        'Rueda abdominal',
        'Elevaciones de piernas colgado'
      ],
      avanzado: [
        'Plancha con peso',
        'Ab wheel completo'
      ]
    },

    heavyDutyParams: {
      setsPerWorkout: 1,
      repsRange: '12-20',  // Rango más alto para core
      intensity: 'Fallo muscular',
      restBetweenWorkouts: '3-5 días',  // Core se recupera más rápido
      timeUnderTension: '60-90 segundos'
    },

    movementPatterns: [
      'Anti-rotación (estabilidad)',
      'Flexión de tronco'
    ],

    intensificationTechniques: [
      'Time under tension extendido',
      'Pausa isométrica'
    ],

    notes: 'El core se trabaja indirectamente en ejercicios compuestos. Trabajo directo 1-2 veces por semana.'
  }
};

// ============================================================================
// SPLITS DE ENTRENAMIENTO HEAVY DUTY
// ============================================================================

/**
 * Genera un split de entrenamiento balanceado según el nivel y frecuencia
 * @param {string} level - 'principiante', 'intermedio', 'avanzado'
 * @param {number} daysPerWeek - Días de entrenamiento por semana (2-3)
 * @returns {Object} Split de entrenamiento
 */
export function generateBalancedSplit(level, daysPerWeek = 2) {
  // Heavy Duty generalmente usa 2 sesiones/semana
  // Split A/B o Full Body dependiendo del nivel

  if (daysPerWeek <= 2) {
    // SPLIT A/B (Recomendado para Heavy Duty)
    return {
      type: 'push_pull',
      name: 'Push/Pull Split',
      description: 'División empuje/tracción con descansos prolongados',
      frequency: 2,
      restDays: 3, // 3 días entre cada sesión

      days: [
        {
          name: 'Día A - Empuje',
          muscleGroups: ['pecho', 'hombros', 'brazos'],  // Tríceps
          primaryFocus: 'Empuje horizontal y vertical',
          exercises: level === 'avanzado' ? 3 : 4,  // Menos ejercicios en avanzado
          estimatedDuration: '45-60 min'
        },
        {
          name: 'Día B - Tracción + Piernas',
          muscleGroups: ['espalda', 'piernas', 'brazos'],  // Bíceps
          primaryFocus: 'Tracción y extensión de cadera',
          exercises: level === 'avanzado' ? 4 : 5,
          estimatedDuration: '60-75 min'
        }
      ],

      weekSchedule: [
        { day: 'Lunes', session: 'Día A - Empuje' },
        { day: 'Martes', session: 'Descanso' },
        { day: 'Miércoles', session: 'Descanso' },
        { day: 'Jueves', session: 'Día B - Tracción + Piernas' },
        { day: 'Viernes', session: 'Descanso' },
        { day: 'Sábado', session: 'Descanso' },
        { day: 'Domingo', session: 'Descanso' }
      ]
    };
  } else {
    // SPLIT PUSH/PULL/LEGS (Para intermedios que toleran 3 días)
    return {
      type: 'push_pull_legs',
      name: 'Push/Pull/Legs Split',
      description: 'División clásica con énfasis en recuperación',
      frequency: 3,
      restDays: 2, // 2 días entre sesiones

      days: [
        {
          name: 'Día 1 - Push (Empuje)',
          muscleGroups: ['pecho', 'hombros'],
          primaryFocus: 'Pecho y hombros',
          exercises: level === 'avanzado' ? 2 : 3,
          estimatedDuration: '45-60 min'
        },
        {
          name: 'Día 2 - Pull (Tracción)',
          muscleGroups: ['espalda'],
          primaryFocus: 'Espalda (dorsal y grosor)',
          exercises: level === 'avanzado' ? 2 : 3,
          estimatedDuration: '45-60 min'
        },
        {
          name: 'Día 3 - Legs (Piernas)',
          muscleGroups: ['piernas', 'core'],
          primaryFocus: 'Piernas completas + core',
          exercises: level === 'avanzado' ? 3 : 4,
          estimatedDuration: '60-75 min'
        }
      ],

      weekSchedule: [
        { day: 'Lunes', session: 'Día 1 - Push' },
        { day: 'Martes', session: 'Descanso' },
        { day: 'Miércoles', session: 'Día 2 - Pull' },
        { day: 'Jueves', session: 'Descanso' },
        { day: 'Viernes', session: 'Día 3 - Legs' },
        { day: 'Sábado', session: 'Descanso' },
        { day: 'Domingo', session: 'Descanso' }
      ]
    };
  }
}

/**
 * Obtiene información de un grupo muscular específico
 * @param {string} groupId - ID del grupo muscular
 * @returns {Object|null} Información del grupo o null
 */
export function getMuscleGroupInfo(groupId) {
  return HEAVY_DUTY_MUSCLE_GROUPS[groupId] || null;
}

/**
 * Obtiene grupos musculares recomendados según el nivel
 * @param {string} level - Nivel del usuario
 * @returns {Array} Lista de objetos de grupos musculares
 */
export function getRecommendedGroupsByLevel(level) {
  // Heavy Duty trabaja todos los grupos, pero con énfasis diferente

  const allGroups = Object.values(HEAVY_DUTY_MUSCLE_GROUPS);

  if (level === 'principiante') {
    // Principiantes: Enfoque en grupos grandes + máquinas
    return allGroups.filter(g =>
      ['pecho', 'espalda', 'piernas', 'hombros'].includes(g.id)
    );
  }

  if (level === 'intermedio') {
    // Intermedios: Todos los grupos con énfasis en compuestos
    return allGroups;
  }

  if (level === 'avanzado') {
    // Avanzados: Enfoque absoluto en compuestos pesados
    return allGroups.filter(g =>
      ['pecho', 'espalda', 'piernas'].includes(g.id)
    );
  }

  return allGroups;
}

/**
 * Sugiere ejercicios para un grupo muscular según el nivel
 * @param {string} groupId - ID del grupo muscular
 * @param {string} level - Nivel del usuario
 * @returns {Array} Lista de ejercicios sugeridos
 */
export function suggestExercises(groupId, level = 'principiante') {
  const group = getMuscleGroupInfo(groupId);
  if (!group) return [];

  const levelKey = level.toLowerCase();
  return group.exercises[levelKey] || group.exercises.principiante || [];
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default {
  HEAVY_DUTY_MUSCLE_GROUPS,
  generateBalancedSplit,
  getMuscleGroupInfo,
  getRecommendedGroupsByLevel,
  suggestExercises
};
