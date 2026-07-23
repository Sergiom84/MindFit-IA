/**
 * Utilidades para mapeo de sesiones en el calendario
 *
 * PROBLEMA:
 * Las rutinas generadas por IA vienen con días específicos (Lunes, Miércoles, Viernes)
 * pero cuando el usuario genera una rutina en cualquier día (ej: sábado),
 * necesitamos mapear las sesiones desde ese día de inicio.
 */

/**
 * Mapea las sesiones de una semana a los días del calendario
 * @param {Array} sesiones - Array de sesiones de la semana
 * @param {Date} weekStartDate - Fecha de inicio de la semana en el calendario
 * @param {Date} planStartDate - Fecha de inicio del plan completo
 * @param {number} weekIndex - Índice de la semana (0-based)
 * @returns {Array} Array de 7 elementos, uno por cada día de la semana
 */
export function mapSessionsToWeekDays(sesiones, weekStartDate, planStartDate, weekIndex) {
  const weekDays = [];

  // Crear array de 7 días
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const dayDate = new Date(weekStartDate);
    dayDate.setDate(weekStartDate.getDate() + dayIndex);
    dayDate.setHours(0, 0, 0, 0);

    weekDays.push({
      date: dayDate,
      dayIndex,
      session: null
    });
  }

  if (!sesiones || sesiones.length === 0) {
    return weekDays;
  }

  // Detectar formato de las sesiones
  const firstSessionDay = sesiones[0]?.dia?.toLowerCase();
  const usesWeekDayNames = firstSessionDay && isWeekDayName(firstSessionDay);

  // ✅ MODO ACTUAL: Siempre mapear por nombre del día
  // Las sesiones vienen con su día asignado desde la BD (Lun, Mar, Mié, etc.)
  // Este enfoque respeta las semanas de calendario (Lun→Dom) y funciona con
  // la redistribución de días que hace el backend para la primera semana
  if (usesWeekDayNames) {
    mapByDayNames(weekDays, sesiones);
  } else {
    // FALLBACK: Si por alguna razón las sesiones no tienen nombres de día,
    // usar el mapeo por nombres de todas formas (asume que vienen desde BD)
    console.warn('[calendarMapping] Sesiones sin nombres de día detectadas, usando mapByDayNames');
    mapByDayNames(weekDays, sesiones);
  }

  return weekDays;
}

/**
 * Verifica si un string es un nombre de día de la semana
 */
function isWeekDayName(str) {
  const weekDayNames = [
    'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo',
    'lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom', 'mie', 'sab'
  ];
  return weekDayNames.includes(str.toLowerCase());
}

/**
 * Mapea sesiones por nombre del día (modo legacy)
 */
function mapByDayNames(weekDays, sesiones) {
  const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  // Función helper para normalizar nombres de día (completos y abreviados)
  const normalizeDay = (day) => {
    if (!day) return '';
    const dayLower = day.toLowerCase();
    const dayMap = {
      'lunes': 'lun', 'lun': 'lun',
      'martes': 'mar', 'mar': 'mar',
      'miércoles': 'mie', 'miercoles': 'mie', 'mié': 'mie', 'mie': 'mie',
      'jueves': 'jue', 'jue': 'jue',
      'viernes': 'vie', 'vier': 'vie', 'vie': 'vie',
      'sábado': 'sab', 'sabado': 'sab', 'sáb': 'sab', 'sab': 'sab',
      'domingo': 'dom', 'dom': 'dom'
    };
    return dayMap[dayLower] || dayLower.substring(0, 3);
  };

  weekDays.forEach((day, index) => {
    const dayOfWeek = day.date.getDay();
    const dayName = dayNames[dayOfWeek];
    const normalizedDayName = normalizeDay(dayName);

    // Buscar sesión para este día
    // Compatibilidad: Buscar en 'dia' o 'dia_semana' (diferentes formatos de prompt)
    const session = sesiones.find(ses => {
      const sessionDay = ses.dia || ses.dia_semana;
      const normalizedSessionDay = normalizeDay(sessionDay);
      return normalizedSessionDay === normalizedDayName;
    });

    if (session) {
      day.session = session;
    }
  });
}

/**
 * @deprecated Esta función está deprecada y ya no se usa.
 *
 * PROBLEMA: Usaba índices fijos (0, 2, 4) que asumían que las semanas empezaban
 * en lunes desde el día de inicio del plan, lo cual causaba problemas cuando
 * el plan empezaba mid-semana (ej: miércoles).
 *
 * SOLUCIÓN ACTUAL: Usar `mapByDayNames` que mapea por nombre de día y respeta
 * las semanas de calendario (Lun→Dom). El backend ya redistribuye los días
 * correctamente para la primera semana.
 *
 * Se mantiene el código como referencia histórica.
 */
function distributeSessionsEvenly(weekDays, sesiones, weekIndex) {
  const sessionsPerWeek = sesiones.length;

  // Calcular distribución óptima
  if (sessionsPerWeek === 1) {
    // Una sesión: en el primer día
    weekDays[0].session = sesiones[0];
  } else if (sessionsPerWeek === 2) {
    // Dos sesiones: días 0 y 3 (ej: lunes y jueves)
    weekDays[0].session = sesiones[0];
    weekDays[3].session = sesiones[1];
  } else if (sessionsPerWeek === 3) {
    // Tres sesiones: días 0, 2 y 4 (ej: lunes, miércoles, viernes)
    weekDays[0].session = sesiones[0];
    weekDays[2].session = sesiones[1];
    weekDays[4].session = sesiones[2];
  } else if (sessionsPerWeek === 4) {
    // Cuatro sesiones: días 0, 2, 4, 6
    weekDays[0].session = sesiones[0];
    weekDays[2].session = sesiones[1];
    weekDays[4].session = sesiones[2];
    weekDays[6].session = sesiones[3];
  } else if (sessionsPerWeek === 5) {
    // Cinco sesiones: días 0, 1, 3, 4, 6
    weekDays[0].session = sesiones[0];
    weekDays[1].session = sesiones[1];
    weekDays[3].session = sesiones[2];
    weekDays[4].session = sesiones[3];
    weekDays[6].session = sesiones[4];
  } else if (sessionsPerWeek === 6) {
    // Seis sesiones: todos los días excepto uno (descanso en domingo)
    for (let i = 0; i < 6; i++) {
      weekDays[i].session = sesiones[i];
    }
  } else if (sessionsPerWeek === 7) {
    // Siete sesiones: todos los días
    for (let i = 0; i < 7; i++) {
      weekDays[i].session = sesiones[i];
    }
  } else {
    // Más de 7 o casos especiales: distribuir proporcionalmente
    const spacing = Math.floor(7 / sessionsPerWeek);
    for (let i = 0; i < Math.min(sessionsPerWeek, 7); i++) {
      const dayIndex = Math.min(i * spacing, 6);
      weekDays[dayIndex].session = sesiones[i];
    }
  }
}

/**
 * Obtiene el patrón de distribución recomendado para N sesiones por semana
 */
export function getRecommendedDistribution(sessionsPerWeek) {
  const patterns = {
    1: [0], // Solo un día
    2: [0, 3], // Lunes y Jueves
    3: [0, 2, 4], // Lunes, Miércoles, Viernes
    4: [0, 2, 4, 6], // Lunes, Miércoles, Viernes, Domingo
    5: [0, 1, 3, 4, 6], // Lunes, Martes, Jueves, Viernes, Domingo
    6: [0, 1, 2, 3, 4, 5], // Todos excepto Domingo
    7: [0, 1, 2, 3, 4, 5, 6] // Todos los días
  };

  return patterns[sessionsPerWeek] || patterns[3]; // Default a 3 días
}

/**
 * Convierte un patrón de días a nombres de días comenzando desde una fecha
 */
export function patternToDayNames(pattern, startDate) {
  const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const result = [];

  for (const dayOffset of pattern) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + dayOffset);
    const dayOfWeek = date.getDay();
    result.push({
      offset: dayOffset,
      name: dayNames[dayOfWeek],
      date: date
    });
  }

  return result;
}