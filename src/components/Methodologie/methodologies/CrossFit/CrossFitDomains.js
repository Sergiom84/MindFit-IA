/**
 * Configuración de Dominios para CrossFit
 * Basado en los 3 dominios metabólicos de CrossFit:
 * - Gymnastic (G): Movimientos con peso corporal
 * - Weightlifting (W): Levantamientos olímpicos y de fuerza
 * - Monostructural (M): Actividades metabólicas cíclicas
 *
 * @author Claude Code - Arquitectura Modular Profesional
 * @version 1.0.0
 */

// Orden estándar de dominios en CrossFit
const DOMAIN_ORDER = ['gymnastic', 'weightlifting', 'monostructural'];

// Sistema de temas de colores por dominio
const DOMAIN_THEMES = {
  gymnastic: {
    primary: 'blue-500',
    background: 'blue-50',
    border: 'blue-200',
    text: 'blue-800',
    tailwindClass: 'bg-blue-100 border-blue-300 text-blue-800',
    icon: '🤸',
    iconAlt: '🏃'
  },
  weightlifting: {
    primary: 'red-500',
    background: 'red-50',
    border: 'red-200',
    text: 'red-800',
    tailwindClass: 'bg-red-100 border-red-300 text-red-800',
    icon: '🏋️',
    iconAlt: '💪'
  },
  monostructural: {
    primary: 'green-500',
    background: 'green-50',
    border: 'green-200',
    text: 'green-800',
    tailwindClass: 'bg-green-100 border-green-300 text-green-800',
    icon: '🚴',
    iconAlt: '🏃'
  }
};

// Utilidades de validación
const ValidationUtils = {
  isValidDomainId(domainId) {
    return typeof domainId === 'string' && DOMAIN_ORDER.includes(domainId.toLowerCase());
  },

  sanitizeDomainId(domainId) {
    if (typeof domainId !== 'string') return null;
    return domainId.toLowerCase().trim();
  },

  logWarning(message, data = null) {
    if (import.meta.env.DEV) {
      console.warn(`[CrossFitDomains] ${message}`, data);
    }
  },

  logError(message, error = null) {
    console.error(`[CrossFitDomains] ${message}`, error);
  }
};

export const CROSSFIT_DOMAINS = {
  'gymnastic': {
    id: 'gymnastic',
    name: 'Gymnastic',
    abbreviation: 'G',
    description: 'Movimientos con peso corporal que desarrollan control, coordinación y agilidad',

    categories: [
      'Pull (Jalones)',
      'Push (Empuje)',
      'Core (Núcleo)',
      'Handstands (Paradas de manos)',
      'Bar Skills (Habilidades en barra)',
      'Ring Skills (Habilidades en anillas)'
    ],

    movementsExamples: {
      scaled: [
        'Ring Rows',
        'Box Push-Ups',
        'Air Squats',
        'Box Step-Ups',
        'Wall Walks (scaled)',
        'Plank Hold'
      ],
      rx: [
        'Pull-Ups (kipping)',
        'Push-Ups',
        'Toes-to-Bar',
        'Box Jumps',
        'Burpees',
        'Sit-Ups'
      ],
      rx_plus: [
        'Chest-to-Bar Pull-Ups',
        'Handstand Push-Ups',
        'Bar Muscle-Ups',
        'Pistol Squats',
        'Rope Climbs',
        'L-Sits'
      ],
      elite: [
        'Strict Muscle-Ups',
        'Ring Muscle-Ups',
        'Deficit HSPU',
        'Freestanding HSPU',
        'Legless Rope Climbs',
        'Front Lever'
      ]
    },

    benefits: [
      'Mejora coordinación y agilidad',
      'Desarrolla fuerza relativa',
      'Aumenta control corporal',
      'Mejora balance y precisión',
      'Bajo riesgo de lesión con buena técnica'
    ],

    commonWods: [
      'Cindy (AMRAP: 5 pull-ups, 10 push-ups, 15 air squats)',
      'Murph (1mi run, 100 pull-ups, 200 push-ups, 300 squats, 1mi run)',
      'Angie (100 pull-ups, 100 push-ups, 100 sit-ups, 100 squats)',
      'Barbara (5 rounds: 20 pull-ups, 30 push-ups, 40 sit-ups, 50 squats)'
    ],

    theme: DOMAIN_THEMES.gymnastic,
    color: DOMAIN_THEMES.gymnastic.tailwindClass,
    icon: DOMAIN_THEMES.gymnastic.icon,
    priority: 'Essential - Forma la base de control y técnica'
  },

  'weightlifting': {
    id: 'weightlifting',
    name: 'Weightlifting',
    abbreviation: 'W',
    description: 'Levantamientos olímpicos y de fuerza que desarrollan potencia y explosividad',

    categories: [
      'Olympic Lifts (Olímpicos)',
      'Squats (Sentadillas)',
      'Presses (Prensa)',
      'Deadlifts (Peso muerto)',
      'Accessory Lifts (Accesorios)'
    ],

    movementsExamples: {
      scaled: [
        'Front Squat (barra vacía)',
        'Overhead Squat (PVC)',
        'Goblet Squat',
        'Dumbbell Press',
        'Kettlebell Swings',
        'Romanian Deadlift'
      ],
      rx: [
        'Clean & Jerk (95/65 lbs)',
        'Snatch (75/55 lbs)',
        'Thrusters (95/65 lbs)',
        'Back Squat (135/95 lbs)',
        'Deadlift (225/155 lbs)',
        'Overhead Press'
      ],
      rx_plus: [
        'Power Clean (135/95 lbs+)',
        'Hang Snatch (115/75 lbs+)',
        'Squat Cleans (155/105 lbs+)',
        'Front Squat (185/125 lbs+)',
        'Push Jerk (155/105 lbs+)',
        'Sumo Deadlift High Pull'
      ],
      elite: [
        'Snatch (175/125 lbs+)',
        'Clean & Jerk (225/155 lbs+)',
        'Back Squat (315/225 lbs+)',
        'Overhead Squat (185/135 lbs+)',
        'Deadlift (405/275 lbs+)',
        'Muscle Snatch'
      ]
    },

    benefits: [
      'Desarrolla potencia explosiva',
      'Aumenta fuerza máxima',
      'Mejora coordinación neuromuscular',
      'Construye masa muscular',
      'Fortalece tendones y ligamentos'
    ],

    commonWods: [
      'Fran (21-15-9: Thrusters 95/65 + Pull-ups)',
      'Grace (30 Clean & Jerk 135/95 for time)',
      'Isabel (30 Snatch 135/95 for time)',
      'Randy (75 Snatches 75/55 for time)'
    ],

    theme: DOMAIN_THEMES.weightlifting,
    color: DOMAIN_THEMES.weightlifting.tailwindClass,
    icon: DOMAIN_THEMES.weightlifting.icon,
    priority: 'Essential - Desarrolla potencia y fuerza aplicable'
  },

  'monostructural': {
    id: 'monostructural',
    name: 'Monostructural',
    abbreviation: 'M',
    description: 'Actividades metabólicas cíclicas que desarrollan capacidad cardiovascular',

    categories: [
      'Running (Carrera)',
      'Rowing (Remo)',
      'Biking (Ciclismo)',
      'Swimming (Natación)',
      'Jump Rope (Salto de cuerda)',
      'Ski Erg (Ski ergómetro)'
    ],

    movementsExamples: {
      scaled: [
        'Walking (Caminar)',
        '400m Run (pace moderado)',
        'Rowing 500m (pace sostenible)',
        'Assault Bike (bajo RPM)',
        'Single-Unders',
        'Step-Ups (bajo box)'
      ],
      rx: [
        '400m Run',
        'Rowing 500m',
        'Assault Bike 15 cal',
        'Double-Unders',
        '200m Run',
        'Ski Erg 500m'
      ],
      rx_plus: [
        '800m Run (sub-3:30)',
        'Rowing 1000m (sub-3:45)',
        'Assault Bike 30 cal',
        'Triple-Unders',
        '1 mile Run (sub-7:00)',
        'Swimming 400m'
      ],
      elite: [
        '1 mile Run (sub-6:00)',
        'Rowing 2000m (sub-7:00)',
        'Assault Bike 50 cal (sub-3:00)',
        '5k Run (sub-20:00)',
        'Swimming 800m',
        '100 Double-Unders unbroken'
      ]
    },

    benefits: [
      'Desarrolla capacidad aeróbica',
      'Mejora resistencia cardiovascular',
      'Aumenta eficiencia metabólica',
      'Facilita recovery activo',
      'Mejora composición corporal'
    ],

    commonWods: [
      'Helen (3 rounds: 400m run, 21 kb swings 53/35, 12 pull-ups)',
      'Filthy Fifty (incluye 50 double-unders)',
      'Fight Gone Bad (incluye row for calories)',
      'Jackie (1000m row, 50 thrusters, 30 pull-ups)'
    ],

    theme: DOMAIN_THEMES.monostructural,
    color: DOMAIN_THEMES.monostructural.tailwindClass,
    icon: DOMAIN_THEMES.monostructural.icon,
    priority: 'Essential - Desarrolla motor metabólico'
  }
};

/**
 * Obtener configuración de dominio por ID
 */
export function getDomainConfig(domainId) {
  const sanitizedId = ValidationUtils.sanitizeDomainId(domainId);

  if (!sanitizedId) {
    ValidationUtils.logWarning('getDomainConfig called with invalid domainId', { domainId });
    return null;
  }

  return CROSSFIT_DOMAINS[sanitizedId] || null;
}

/**
 * Obtener todos los dominios disponibles
 */
export function getAllDomains() {
  return DOMAIN_ORDER.map(domainId => CROSSFIT_DOMAINS[domainId]);
}

/**
 * Validar si un dominio es válido
 */
export function isValidDomain(domain) {
  return ValidationUtils.isValidDomainId(domain);
}

/**
 * Obtener información de tema/colores para un dominio
 */
export function getDomainTheme(domain) {
  const config = getDomainConfig(domain);

  if (!config) {
    ValidationUtils.logWarning('getDomainTheme called with invalid domain', { domain });
    return null;
  }

  return config.theme;
}

/**
 * Obtener movimientos por nivel para un dominio específico
 */
export function getMovementsByLevel(domain, level) {
  const config = getDomainConfig(domain);

  if (!config) {
    ValidationUtils.logWarning('getMovementsByLevel called with invalid domain', { domain });
    return [];
  }

  // Normalizar el nombre del nivel
  const levelKey = level === 'principiante' ? 'scaled' :
                   level === 'intermedio' ? 'rx' :
                   level === 'avanzado' ? 'rx_plus' : 'elite';

  return config.movementsExamples[levelKey] || [];
}

/**
 * Obtener balance recomendado de dominios por nivel
 */
export function getRecommendedDomainBalance(level) {
  const balances = {
    principiante: {
      gymnastic: 40,  // 40% del volumen
      weightlifting: 35,
      monostructural: 25
    },
    intermedio: {
      gymnastic: 35,
      weightlifting: 40,
      monostructural: 25
    },
    avanzado: {
      gymnastic: 35,
      weightlifting: 40,
      monostructural: 25
    },
    elite: {
      gymnastic: 33,
      weightlifting: 34,
      monostructural: 33
    }
  };

  return balances[level] || balances.intermedio;
}

/**
 * Validar si una selección de dominios es válida (al menos uno seleccionado)
 */
export function validateDomainSelection(selectedDomains) {
  if (!Array.isArray(selectedDomains) || selectedDomains.length === 0) {
    return {
      isValid: false,
      error: 'Debes seleccionar al menos un dominio'
    };
  }

  const invalidDomains = selectedDomains.filter(d => !isValidDomain(d));

  if (invalidDomains.length > 0) {
    return {
      isValid: false,
      error: `Dominios inválidos: ${invalidDomains.join(', ')}`
    };
  }

  return {
    isValid: true,
    selectedCount: selectedDomains.length
  };
}

export default CROSSFIT_DOMAINS;
