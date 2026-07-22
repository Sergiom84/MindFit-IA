/**
 * Grupos Musculares y Categorías de Movimiento para Halterofilia - v1.0
 * Clasificación basada en levantamientos olímpicos y trabajo auxiliar
 * Refactorizado con patrones arquitecturales consistentes
 *
 * @author Claude Code - Arquitectura Modular Profesional
 * @version 1.0.0 - Halterofilia Implementation
 */

// Configuraciones centralizadas
const MUSCLE_GROUP_CONFIG = {
  DURATIONS: {
    principiante: 50,
    intermedio: 65,
    avanzado: 80
  },
  SPLIT_TYPES: {
    LIFT_FOCUSED: 'lift_focused', // Enfoque en lifts específicos
    STRENGTH_FOCUSED: 'strength_focused', // Enfoque en fuerza base
    TECHNICAL: 'technical' // Enfoque en técnica y posiciones
  },
  FOCUS_TYPES: {
    SNATCH: 'snatch',
    CLEAN_JERK: 'clean_jerk',
    STRENGTH: 'strength',
    TECHNIQUE: 'technique'
  },
  SESSION_THRESHOLD: 3,
  MAX_SESSIONS: 6
};

// Sistema de tema consistente con HalterofíliaLevels.js
const MUSCLE_GROUP_THEMES = {
  snatch: {
    color: 'bg-red-100 border-red-300',
    darkColor: 'bg-red-900/20 border-red-400/30',
    icon: '🎯',
    themeColor: 'red-400'
  },
  clean_jerk: {
    color: 'bg-blue-100 border-blue-300',
    darkColor: 'bg-blue-900/20 border-blue-400/30',
    icon: '⚡',
    themeColor: 'blue-400'
  },
  tecnica: {
    color: 'bg-purple-100 border-purple-300',
    darkColor: 'bg-purple-900/20 border-purple-400/30',
    icon: '🔧',
    themeColor: 'purple-400'
  },
  fuerza_base: {
    color: 'bg-green-100 border-green-300',
    darkColor: 'bg-green-900/20 border-green-400/30',
    icon: '💪',
    themeColor: 'green-400'
  },
  accesorios: {
    color: 'bg-orange-100 border-orange-300',
    darkColor: 'bg-orange-900/20 border-orange-400/30',
    icon: '🔩',
    themeColor: 'orange-400'
  }
};

// ===============================================
// DEFINICIÓN DE GRUPOS MUSCULARES
// ===============================================

export const HALTEROFILIA_MUSCLE_GROUPS = {
  snatch: {
    id: 'snatch',
    name: 'Snatch (Arrancada)',
    shortName: 'Snatch',
    category: 'Levantamiento Olímpico',
    theme: MUSCLE_GROUP_THEMES.snatch,
    icon: '🎯',

    description: 'Levantamiento olímpico que lleva la barra del suelo a overhead en un solo movimiento explosivo',

    liftVariations: [
      'Full snatch desde suelo (competición)',
      'Power snatch desde suelo',
      'Hang snatch (knee, mid-thigh, hip)',
      'Hang power snatch',
      'Snatch desde bloques (knee, mid-thigh)',
      'Muscle snatch (técnica)',
      'Snatch balance (recepción)',
      'Drop snatch (velocidad bajo barra)'
    ],

    keyFocusPoints: [
      'Setup y first pull perfecto',
      'Second pull explosivo (triple extensión)',
      'Timing de la transición (scoop)',
      'Velocidad de codos en el turnover',
      'Recepción estable en squat profundo',
      'Trayectoria vertical de la barra',
      'Movilidad overhead completa'
    ],

    technicalCues: [
      'Espalda tensa desde setup',
      'Barra cercana al cuerpo en todo momento',
      'Explosión vertical desde power position',
      'Codos rápidos y altos en turnover',
      'Recibir en squat activo, no colapsar',
      'Mantener overhead position sin layback excesivo'
    ],

    commonIssues: [
      'Barra se aleja del cuerpo (loop)',
      'Brazos doblan temprano (arm bend)',
      'Falta de velocidad bajo la barra',
      'Movilidad overhead limitada',
      'Recepción inestable o con pies anchos',
      'Push de la barra forward en turnover'
    ],

    strengthRequirements: {
      overhead_squat: '80-90% del snatch máximo',
      snatch_pull: '110-120% del snatch máximo',
      back_squat: '140-150% del snatch máximo',
      mobility: 'Overhead squat profundo con barra'
    }
  },

  clean_jerk: {
    id: 'clean_jerk',
    name: 'Clean & Jerk (Dos Tiempos)',
    shortName: 'C&J',
    category: 'Levantamiento Olímpico',
    theme: MUSCLE_GROUP_THEMES.clean_jerk,
    icon: '⚡',

    description: 'Levantamiento olímpico en dos fases: Clean (suelo a hombros) + Jerk (hombros a overhead)',

    liftVariations: [
      'Full clean & jerk (competición)',
      'Power clean + jerk',
      'Hang clean (knee, mid-thigh)',
      'Hang power clean',
      'Clean desde bloques',
      'Push jerk / Power jerk / Split jerk',
      'Jerk desde rack/bloques',
      'Tall clean / Tall jerk (técnica)'
    ],

    keyFocusPoints: [
      'Clean: Setup y pull similar a snatch',
      'Clean: Velocidad de codos en rack position',
      'Clean: Recepción en squat profundo',
      'Jerk: Dip vertical sin forward lean',
      'Jerk: Drive explosivo de piernas',
      'Jerk: Timing piernas-brazos perfecto',
      'Jerk: Split rápido y estable (si split jerk)'
    ],

    technicalCues: [
      'Front rack position cómoda (codos arriba)',
      'Dip del jerk vertical y controlado',
      'Drive agresivo hacia arriba',
      'Split o recepción rápida bajo barra',
      'Lockout firme de brazos overhead',
      'Recuperación del split controlada'
    ],

    commonIssues: [
      'Codos lentos en clean (crash en rack)',
      'Front rack position incómoda',
      'Dip con forward lean en jerk',
      'Timing incorrecto (empujar vs recibir)',
      'Split asimétrico o inestable',
      'Press out (no lockout completo)'
    ],

    strengthRequirements: {
      front_squat: '120% del clean máximo',
      clean_pull: '115-125% del clean máximo',
      back_squat: '150-160% del clean máximo',
      strict_press: '60-70% del jerk máximo'
    }
  },

  tecnica: {
    id: 'tecnica',
    name: 'Trabajo Técnico y Posiciones',
    shortName: 'Técnica',
    category: 'Fundamentos',
    theme: MUSCLE_GROUP_THEMES.tecnica,
    icon: '🔧',

    description: 'Ejercicios para desarrollar posiciones correctas, movilidad y técnica refinada',

    exerciseTypes: [
      'Overhead squat (snatch position)',
      'Front squat (clean position)',
      'Snatch balance / Drop snatch',
      'Muscle snatch / Muscle clean',
      'Tall exercises (sin momentum)',
      'Position work (high hang, low hang)',
      'Complexes técnicos (2-3 movimientos)',
      'Sotts press (movilidad extrema)'
    ],

    purposeAndBenefits: [
      'Desarrollar movilidad específica de lifts',
      'Reforzar posiciones de recepción',
      'Mejorar velocidad bajo la barra',
      'Corregir deficiencias técnicas',
      'Enseñar timing sin carga pesada',
      'Warm-up y activation antes de lifts pesados'
    ],

    whenToProgram: [
      'Inicio de sesión como warm-up específico',
      'Después de lifts principales como refinamiento',
      'Días de técnica (recovery/light days)',
      'Durante deload weeks',
      'Cuando se identifican deficiencias específicas'
    ],

    progressionPath: [
      'PVC/barra vacía → barra olímpica',
      'Posiciones estáticas → dinámicas',
      'Movimientos aislados → complejos',
      'Sin peso → peso ligero (30-50% max)'
    ]
  },

  fuerza_base: {
    id: 'fuerza_base',
    name: 'Fuerza Base y Pulls',
    shortName: 'Fuerza',
    category: 'Desarrollo',
    theme: MUSCLE_GROUP_THEMES.fuerza_base,
    icon: '💪',

    description: 'Ejercicios de fuerza general y específica que soportan los levantamientos olímpicos',

    exerciseCategories: {
      squats: {
        name: 'Sentadillas',
        exercises: [
          'Back squat (high bar)',
          'Front squat',
          'Pause squats (front/back)',
          'Overhead squat',
          'Bulgarian split squat'
        ],
        note: 'Base de fuerza de piernas para lifts y recepción'
      },
      pulls: {
        name: 'Pulls y Deadlifts',
        exercises: [
          'Snatch pull (from floor/blocks)',
          'Clean pull (from floor/blocks)',
          'Snatch grip / Clean grip deadlift',
          'Romanian deadlift',
          'Deficit pulls',
          'High pulls'
        ],
        note: 'Desarrollan potencia de cadera y velocidad de barra'
      },
      presses: {
        name: 'Press y Overhead',
        exercises: [
          'Strict press',
          'Push press',
          'Jerk variations',
          'Snatch grip BTN press',
          'Sotts press'
        ],
        note: 'Fuerza de hombros y estabilidad overhead'
      }
    },

    strengthStandards: {
      principiante: {
        back_squat: '1.5x peso corporal',
        front_squat: '1.2x peso corporal',
        strict_press: '0.75x peso corporal'
      },
      intermedio: {
        back_squat: '2x peso corporal',
        front_squat: '1.6x peso corporal',
        strict_press: '1x peso corporal'
      },
      avanzado: {
        back_squat: '2.5x+ peso corporal',
        front_squat: '2x+ peso corporal',
        strict_press: '1.2x+ peso corporal'
      }
    },

    programmingNotes: [
      'Squats pesados post-lifts (fatiga manageable)',
      'Pulls pueden ir antes o después de lifts',
      'Pulls pesados (100-120%) desarrollan potencia',
      'Pause variations mejoran posiciones débiles',
      'Deficit work fortalece first pull'
    ]
  },

  accesorios: {
    id: 'accesorios',
    name: 'Accesorios y Auxiliares',
    shortName: 'Accesorios',
    category: 'Complementario',
    theme: MUSCLE_GROUP_THEMES.accesorios,
    icon: '🔩',

    description: 'Trabajo auxiliar para corregir debilidades, prevenir lesiones y desarrollar áreas específicas',

    exerciseCategories: {
      back_work: {
        name: 'Trabajo de Espalda',
        exercises: ['Pendlay row', 'Pull-ups', 'Face pulls', 'Band pull-aparts'],
        purpose: 'Postura, salud de hombros, balance muscular'
      },
      core_work: {
        name: 'Core y Estabilidad',
        exercises: ['Hollow holds', 'Planks', 'Russian twists', 'GHD sit-ups'],
        purpose: 'Transferencia de potencia, estabilidad en lifts'
      },
      mobility_work: {
        name: 'Movilidad Activa',
        exercises: ['OHL', 'Cossack squats', 'Hip rotations', 'Shoulder dislocations'],
        purpose: 'Mantener rangos de movimiento óptimos'
      },
      injury_prevention: {
        name: 'Prevención de Lesiones',
        exercises: ['Rotator cuff work', 'Wrist mobility', 'Ankle mobility', 'Glute activation'],
        purpose: 'Salud articular y longevidad'
      }
    },

    whenToProgram: [
      'Final de sesión (10-15 min)',
      'Días de recovery active',
      'Durante warm-up (mobility/activation)',
      'Identificar debilidades personales y atacarlas'
    ],

    volumeGuidelines: {
      principiante: '2-3 ejercicios x 3 series',
      intermedio: '3-4 ejercicios x 3-4 series',
      avanzado: '4-5 ejercicios x 3-4 series'
    }
  }
};

// ===============================================
// FUNCIONES DE UTILIDAD
// ===============================================

/**
 * Genera un split balanceado de entrenamiento según días disponibles
 * @param {number} sessionsPerWeek - Número de sesiones por semana (3-6)
 * @param {string} level - Nivel del usuario
 * @returns {Object} Split estructurado por día
 */
export function generateBalancedSplit(sessionsPerWeek, level = 'intermedio') {
  const splits = {
    3: {
      day1: { focus: 'snatch', secondary: 'fuerza_base', emphasis: 'Snatch + Squats' },
      day2: { focus: 'clean_jerk', secondary: 'fuerza_base', emphasis: 'Clean & Jerk + Pulls' },
      day3: { focus: 'tecnica', secondary: 'accesorios', emphasis: 'Technical work + Accessories' }
    },
    4: {
      day1: { focus: 'snatch', secondary: 'fuerza_base', emphasis: 'Snatch heavy + Back squat' },
      day2: { focus: 'clean_jerk', secondary: 'fuerza_base', emphasis: 'Clean & Jerk + Pulls' },
      day3: { focus: 'snatch', secondary: 'tecnica', emphasis: 'Snatch variations + Technique' },
      day4: { focus: 'clean_jerk', secondary: 'accesorios', emphasis: 'Jerk practice + Accessories' }
    },
    5: {
      day1: { focus: 'snatch', secondary: 'fuerza_base', emphasis: 'Snatch heavy + Squat heavy' },
      day2: { focus: 'clean_jerk', secondary: 'fuerza_base', emphasis: 'Clean & Jerk + Pull heavy' },
      day3: { focus: 'tecnica', secondary: 'accesorios', emphasis: 'Technique refinement + Recovery' },
      day4: { focus: 'snatch', secondary: 'fuerza_base', emphasis: 'Snatch variants + Front squat' },
      day5: { focus: 'clean_jerk', secondary: 'accesorios', emphasis: 'Jerk work + Accessories' }
    },
    6: {
      day1: { focus: 'snatch', secondary: 'fuerza_base', emphasis: 'Snatch + Back squat' },
      day2: { focus: 'clean_jerk', secondary: 'fuerza_base', emphasis: 'Clean & Jerk + Pulls' },
      day3: { focus: 'snatch', secondary: 'tecnica', emphasis: 'Snatch variants + Technique' },
      day4: { focus: 'clean_jerk', secondary: 'fuerza_base', emphasis: 'Clean variants + Front squat' },
      day5: { focus: 'tecnica', secondary: 'fuerza_base', emphasis: 'Positional work + Squats' },
      day6: { focus: 'accesorios', secondary: 'tecnica', emphasis: 'Recovery + Light technique' }
    }
  };

  const clampedSessions = Math.min(Math.max(sessionsPerWeek, 3), 6);
  return splits[clampedSessions] || splits[4];
}

/**
 * Obtiene la configuración de un grupo muscular
 * @param {string} groupId - ID del grupo muscular
 * @returns {Object|null} Configuración del grupo o null
 */
export function getMuscleGroupConfig(groupId) {
  return HALTEROFILIA_MUSCLE_GROUPS[groupId] || null;
}

/**
 * Obtiene todos los grupos musculares
 * @returns {Array} Array de configuraciones de grupos
 */
export function getAllMuscleGroups() {
  return Object.values(HALTEROFILIA_MUSCLE_GROUPS);
}

/**
 * Valida que un grupo muscular sea válido
 * @param {string} groupId - ID a validar
 * @returns {boolean} true si es válido
 */
export function isValidMuscleGroup(groupId) {
  return groupId in HALTEROFILIA_MUSCLE_GROUPS;
}

/**
 * Obtiene grupos recomendados por nivel
 * @param {string} level - Nivel del usuario
 * @returns {Array} IDs de grupos recomendados
 */
export function getRecommendedGroupsByLevel(level) {
  const recommendations = {
    principiante: ['tecnica', 'fuerza_base', 'accesorios'],
    intermedio: ['snatch', 'clean_jerk', 'tecnica', 'fuerza_base'],
    avanzado: ['snatch', 'clean_jerk', 'fuerza_base', 'tecnica', 'accesorios']
  };

  return recommendations[level] || recommendations.intermedio;
}

// ===============================================
// EXPORTS
// ===============================================

export {
  MUSCLE_GROUP_CONFIG,
  MUSCLE_GROUP_THEMES
};

export default HALTEROFILIA_MUSCLE_GROUPS;
