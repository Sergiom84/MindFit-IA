/**
 * 📊 Servicio de Distribución de Sesiones
 * 
 * Calcula cómo distribuir las sesiones de entrenamiento a lo largo de las semanas
 * según el día de inicio y la opción elegida por el usuario.
 */

/**
 * Calcula la distribución de sesiones según configuración
 * 
 * @param {Object} config - Configuración de distribución
 * @param {number} config.totalSessions - Total de sesiones del plan (ej: 30)
 * @param {number} config.sessionsPerWeek - Sesiones por semana (ej: 5)
 * @param {number} config.sessionsFirstWeek - Sesiones en la primera semana (ej: 4 si empieza Martes)
 * @param {string} config.distributionOption - 'saturdays' o 'extra_week'
 * @returns {Array} Array de objetos { weekNumber, sessions, days }
 */
export function calculateSessionDistribution(config) {
  const {
    totalSessions = 30,
    sessionsPerWeek = 5,
    sessionsFirstWeek,
    distributionOption = 'extra_week'
  } = config;

  console.log('📊 Calculando distribución de sesiones:', {
    totalSessions,
    sessionsPerWeek,
    sessionsFirstWeek,
    distributionOption
  });

  if (distributionOption === 'saturdays') {
    return calculateWithSaturdays(totalSessions, sessionsFirstWeek);
  } else {
    return calculateWithExtraWeek(totalSessions, sessionsPerWeek, sessionsFirstWeek);
  }
}

/**
 * Distribución con sábados (6 sesiones/semana)
 * 
 * Ejemplo: 30 sesiones, empieza Martes
 * - Semana 1: Mar-Sáb (5 sesiones)
 * - Semanas 2-5: Lun-Sáb (24 sesiones, 6 por semana)
 * - Semana 6: Lun (1 sesión)
 */
function calculateWithSaturdays(totalSessions, sessionsFirstWeek) {
  const sessionsPerWeek = 6; // Lun-Sáb
  const weeks = [];
  let remaining = totalSessions;
  let weekNum = 1;

  // Primera semana (puede ser incompleta)
  if (sessionsFirstWeek && sessionsFirstWeek < sessionsPerWeek) {
    const firstWeekSessions = Math.min(remaining, sessionsFirstWeek);
    weeks.push({
      weekNumber: weekNum++,
      sessions: firstWeekSessions,
      days: generateDaysForWeek(firstWeekSessions, true) // true = incluye sábado
    });
    remaining -= firstWeekSessions;
  }

  // Semanas completas con sábado
  while (remaining >= sessionsPerWeek) {
    weeks.push({
      weekNumber: weekNum++,
      sessions: sessionsPerWeek,
      days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
    });
    remaining -= sessionsPerWeek;
  }

  // Última semana (si quedan sesiones)
  if (remaining > 0) {
    weeks.push({
      weekNumber: weekNum,
      sessions: remaining,
      days: generateDaysForWeek(remaining, true)
    });
  }

  console.log('✅ Distribución con sábados:', weeks);
  return weeks;
}

/**
 * Distribución con semana extra (5 sesiones/semana)
 * 
 * Ejemplo: 30 sesiones, empieza Martes (4 sesiones primera semana)
 * - Semana 1: Mar-Vie (4 sesiones)
 * - Semanas 2-6: Lun-Vie (25 sesiones, 5 por semana)
 * - Semana 7: Lun (1 sesión)
 */
function calculateWithExtraWeek(totalSessions, sessionsPerWeek, sessionsFirstWeek) {
  const weeks = [];
  let remaining = totalSessions;
  let weekNum = 1;

  // Primera semana (incompleta)
  if (sessionsFirstWeek && sessionsFirstWeek < sessionsPerWeek) {
    weeks.push({
      weekNumber: weekNum++,
      sessions: sessionsFirstWeek,
      days: generateDaysForWeek(sessionsFirstWeek, false) // false = no incluye sábado
    });
    remaining -= sessionsFirstWeek;
  }

  // Semanas completas
  while (remaining >= sessionsPerWeek) {
    weeks.push({
      weekNumber: weekNum++,
      sessions: sessionsPerWeek,
      days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']
    });
    remaining -= sessionsPerWeek;
  }

  // Última semana (si quedan sesiones)
  if (remaining > 0) {
    weeks.push({
      weekNumber: weekNum,
      sessions: remaining,
      days: generateDaysForWeek(remaining, false)
    });
  }

  console.log('✅ Distribución con semana extra:', weeks);
  return weeks;
}

/**
 * Genera array de días según número de sesiones
 * 
 * @param {number} sessions - Número de sesiones
 * @param {boolean} includeSaturday - Si incluye sábado
 * @returns {Array} Array de nombres de días
 */
function generateDaysForWeek(sessions, includeSaturday) {
  const baseDays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  const allDays = includeSaturday ? [...baseDays, 'Sábado'] : baseDays;
  
  return allDays.slice(0, sessions);
}

/**
 * Calcula la fecha de inicio según configuración
 *
 * @param {string} startDate - 'today', 'next_monday', etc.
 * @returns {Date} Fecha de inicio
 */
export function calculateStartDate(startDate) {
  const today = new Date();

  if (startDate === 'today') {
    return today;
  }

  if (startDate === 'next_monday') {
    const daysUntilMonday = (8 - today.getDay()) % 7 || 7;
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    return nextMonday;
  }

  return today;
}

