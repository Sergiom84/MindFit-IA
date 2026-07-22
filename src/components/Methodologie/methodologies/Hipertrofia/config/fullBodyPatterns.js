/**
 * Configuración de Patrones Full Body para Hipertrofia V2
 * Sistema de plantillas con variedad de ejercicios
 */

// CATEGORÍAS DE GRUPOS MUSCULARES (nombres exactos de la BD)
export const MUSCLE_CATEGORIES = {
  PECHO: 'Pecho',
  ESPALDA: 'Espalda',
  PIERNAS_CUADRICEPS: 'Piernas (cuádriceps)', // ← Corregido
  PIERNAS_ISQUIOS: 'Piernas (isquios)',       // ← Agregado
  HOMBRO: 'Hombro',                            // ← Corregido
  HOMBRO_MEDIOS: 'Hombro (medios)',           // ← Agregado
  HOMBRO_POSTERIOR: 'Hombro (posterior)',     // ← Agregado
  BICEPS: 'Bíceps',                            // ← Corregido (con tilde)
  TRICEPS: 'Tríceps',                          // ← Corregido (con tilde)
  CORE: 'Core'
};

// PATRONES DE MOVIMIENTO
export const MOVEMENT_PATTERNS = {
  PUSH_HORIZONTAL: 'push_horizontal',
  PUSH_VERTICAL: 'push_vertical',
  PULL_HORIZONTAL: 'pull_horizontal',
  PULL_VERTICAL: 'pull_vertical',
  SQUAT: 'squat',
  HINGE: 'hinge',
  LUNGE: 'lunge',
  CORE_STABILITY: 'core_stability',
  CORE_ROTATION: 'core_rotation'
};

/**
 * Plantillas Full Body para principiantes
 * Cada sesión entrena TODOS los grupos musculares principales
 */
export const BEGINNER_FULL_BODY_PATTERNS = {
  // LUNES - Template A
  templateA: {
    name: 'Full Body A - Énfasis Empuje',
    day: 'lunes',
    description: 'Rutina completa con énfasis en empuje horizontal y piernas',
    patterns: [
      {
        categoria: MUSCLE_CATEGORIES.PECHO,
        patron: MOVEMENT_PATTERNS.PUSH_HORIZONTAL,
        cantidad: 1,
        prioridad: 1,
        ejemplos: ['Press Banca', 'Press con Mancuernas', 'Flexiones']
      },
      {
        categoria: MUSCLE_CATEGORIES.ESPALDA,
        patron: MOVEMENT_PATTERNS.PULL_HORIZONTAL,
        cantidad: 1,
        prioridad: 2,
        ejemplos: ['Remo con Barra', 'Remo con Mancuerna']
      },
      {
        categoria: MUSCLE_CATEGORIES.PIERNAS_CUADRICEPS, // ← Corregido
        patron: MOVEMENT_PATTERNS.SQUAT,
        cantidad: 1,
        prioridad: 3,
        ejemplos: ['Sentadilla en prensa 45°', 'Extensión de cuádriceps']
      },
      {
        categoria: MUSCLE_CATEGORIES.HOMBRO, // ← Corregido
        patron: MOVEMENT_PATTERNS.PUSH_VERTICAL,
        cantidad: 1,
        prioridad: 4,
        ejemplos: ['Press militar en máquina']
      },
      {
        categoria: MUSCLE_CATEGORIES.CORE,
        patron: MOVEMENT_PATTERNS.CORE_STABILITY,
        cantidad: 1,
        prioridad: 5,
        ejemplos: ['Plancha', 'Dead Bug']
      }
    ],
    sets: 3,
    reps: '8-12',
    rir_target: '2-3',
    rest_seconds: 90
  },

  // MIÉRCOLES - Template B
  templateB: {
    name: 'Full Body B - Énfasis Tirón',
    day: 'miercoles',
    description: 'Rutina completa con énfasis en tirón vertical y piernas posteriores',
    patterns: [
      {
        categoria: MUSCLE_CATEGORIES.PECHO,
        patron: MOVEMENT_PATTERNS.PUSH_HORIZONTAL,
        cantidad: 1,
        prioridad: 1,
        ejemplos: ['Press Inclinado', 'Aperturas']
      },
      {
        categoria: MUSCLE_CATEGORIES.ESPALDA,
        patron: MOVEMENT_PATTERNS.PULL_VERTICAL,
        cantidad: 1,
        prioridad: 2,
        ejemplos: ['Jalón al Pecho', 'Dominadas Asistidas']
      },
      {
        categoria: MUSCLE_CATEGORIES.PIERNAS_ISQUIOS, // ← Corregido (isquios para variedad)
        patron: MOVEMENT_PATTERNS.HINGE,
        cantidad: 1,
        prioridad: 3,
        ejemplos: ['Curl femoral tumbado', 'Curl femoral sentado']
      },
      {
        categoria: MUSCLE_CATEGORIES.HOMBRO_MEDIOS, // ← Corregido
        patron: MOVEMENT_PATTERNS.PUSH_VERTICAL,
        cantidad: 1,
        prioridad: 4,
        ejemplos: ['Elevaciones laterales en máquina']
      },
      {
        categoria: MUSCLE_CATEGORIES.CORE,
        patron: MOVEMENT_PATTERNS.CORE_ROTATION,
        cantidad: 1,
        prioridad: 5,
        ejemplos: ['Pallof Press', 'Russian Twist']
      }
    ],
    sets: 3,
    reps: '8-12',
    rir_target: '2-3',
    rest_seconds: 90
  },

  // VIERNES - Template C
  templateC: {
    name: 'Full Body C - Variantes y Estabilidad',
    day: 'viernes',
    description: 'Rutina completa con variantes y énfasis en estabilidad',
    patterns: [
      {
        categoria: MUSCLE_CATEGORIES.PECHO,
        patron: MOVEMENT_PATTERNS.PUSH_HORIZONTAL,
        cantidad: 1,
        prioridad: 1,
        ejemplos: ['Fondos en Paralelas', 'Press con Mancuernas']
      },
      {
        categoria: MUSCLE_CATEGORIES.ESPALDA,
        patron: MOVEMENT_PATTERNS.PULL_HORIZONTAL,
        cantidad: 1,
        prioridad: 2,
        ejemplos: ['Remo en Polea Baja', 'Face Pulls']
      },
      {
        categoria: MUSCLE_CATEGORIES.PIERNAS_CUADRICEPS, // ← Corregido (cuádriceps para viernes)
        patron: MOVEMENT_PATTERNS.LUNGE,
        cantidad: 1,
        prioridad: 3,
        ejemplos: ['Sentadilla en prensa 45°', 'Extensión de cuádriceps']
      },
      {
        categoria: MUSCLE_CATEGORIES.HOMBRO_POSTERIOR, // ← Corregido (posterior para balance)
        patron: MOVEMENT_PATTERNS.PUSH_VERTICAL,
        cantidad: 1,
        prioridad: 4,
        ejemplos: ['Reverse Fly en máquina']
      },
      {
        categoria: MUSCLE_CATEGORIES.CORE,
        patron: MOVEMENT_PATTERNS.CORE_STABILITY,
        cantidad: 1,
        prioridad: 5,
        ejemplos: ['Hollow Hold', 'Rueda Abdominal']
      }
    ],
    sets: 3,
    reps: '8-12',
    rir_target: '2-3',
    rest_seconds: 90
  }
};

/**
 * Obtiene el template correspondiente según el día
 */
export function getTemplateForDay(day) {
  const dayTemplateMap = {
    'lunes': 'templateA',
    'martes': 'templateA', // Si empieza martes, usa A
    'miercoles': 'templateB',
    'jueves': 'templateB',  // Si empieza jueves, usa B
    'viernes': 'templateC'
  };

  return dayTemplateMap[day.toLowerCase()] || 'templateA';
}

/**
 * Calcula el calendario completo de entrenamiento según día de inicio
 */
export function calculateFullBodySchedule(generationDate) {
  const dayOfWeek = generationDate.getDay();

  const scheduleConfig = {
    week1: [],
    normalWeeks: ['lunes', 'miercoles', 'viernes'],
    recoveryDays: 0,
    totalWeeks: 4
  };

  switch(dayOfWeek) {
    case 1: // Lunes
      scheduleConfig.week1 = ['lunes', 'miercoles', 'viernes'];
      scheduleConfig.recoveryDays = 0;
      break;

    case 2: // Martes
      scheduleConfig.week1 = ['martes', 'jueves', 'viernes'];
      scheduleConfig.recoveryDays = 0;
      break;

    case 3: // Miércoles
      scheduleConfig.week1 = ['miercoles', 'jueves', 'viernes'];
      scheduleConfig.recoveryDays = 0;
      break;

    case 4: // Jueves
      scheduleConfig.week1 = ['jueves', 'viernes'];
      scheduleConfig.recoveryDays = 1; // Recupera 1 día en semana 5
      scheduleConfig.totalWeeks = 5;
      break;

    case 5: // Viernes
      scheduleConfig.week1 = ['viernes'];
      scheduleConfig.recoveryDays = 2; // Recupera 2 días en semana 5
      scheduleConfig.totalWeeks = 5;
      break;

    case 6: // Sábado
    case 0: // Domingo
      scheduleConfig.week1 = []; // No entrena esta semana
      scheduleConfig.recoveryDays = 3; // Recupera los 3 días
      scheduleConfig.totalWeeks = 5;
      break;
  }

  return scheduleConfig;
}

/**
 * Genera el plan completo de semanas con fechas
 */
export function generateWeeksWithDates(startDate, scheduleConfig) {
  const weeks = [];
  const start = new Date(startDate);

  // Semana 1: Días restantes de la semana actual
  if (scheduleConfig.week1.length > 0) {
    const week1Sessions = scheduleConfig.week1.map((day, index) => ({
      dia: day,
      template: getTemplateForDay(day),
      fecha: calculateSessionDate(start, 0, index)
    }));

    weeks.push({
      numero: 1,
      tipo: 'inicial',
      sesiones: week1Sessions
    });
  }

  // Semanas 2-4: Patrón normal L/Mi/V
  const startWeek = scheduleConfig.week1.length > 0 ? 2 : 1;
  const endWeek = scheduleConfig.recoveryDays > 0 ? 4 : 4;

  for (let i = startWeek; i <= endWeek; i++) {
    const weekSessions = [
      { dia: 'lunes', template: 'A' },
      { dia: 'miercoles', template: 'B' },
      { dia: 'viernes', template: 'C' }
    ].map((session, idx) => ({
      ...session,
      fecha: calculateSessionDate(start, i - 1, idx)
    }));

    weeks.push({
      numero: i,
      tipo: 'normal',
      sesiones: weekSessions
    });
  }

  // Semana 5: Recuperación si es necesario
  if (scheduleConfig.recoveryDays > 0) {
    const recoveryDays = ['lunes', 'miercoles', 'viernes']
      .slice(0, scheduleConfig.recoveryDays);

    const recoverySessions = recoveryDays.map((day, idx) => ({
      dia: day,
      template: ['A', 'B', 'C'][idx],
      fecha: calculateSessionDate(start, 4, idx)
    }));

    weeks.push({
      numero: 5,
      tipo: 'recuperacion',
      sesiones: recoverySessions
    });
  }

  return weeks;
}

/**
 * Calcula la fecha de una sesión específica
 */
function calculateSessionDate(startDate, weekOffset, dayIndex) {
  const date = new Date(startDate);
  date.setDate(date.getDate() + (weekOffset * 7) + (dayIndex * 2));
  return date.toISOString().split('T')[0];
}

export default {
  MUSCLE_CATEGORIES,
  MOVEMENT_PATTERNS,
  BEGINNER_FULL_BODY_PATTERNS,
  getTemplateForDay,
  calculateFullBodySchedule,
  generateWeeksWithDates
};
