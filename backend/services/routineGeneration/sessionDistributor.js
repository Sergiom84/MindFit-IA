/**
 * Servicio de distribución de sesiones en el plan
 * @module routineGeneration/sessionDistributor
 */

import { calculateSessionDistribution } from '../sessionDistributionService.js';
import { DEFAULT_VALUES, DISTRIBUTION_OPTIONS } from './constants.js';
import { logger } from './logger.js';

/**
 * Aplica la distribución de sesiones a un plan generado
 * Reorganiza las semanas según la configuración de inicio
 *
 * @param {object} plan - Plan de entrenamiento generado
 * @param {object} startConfig - Configuración de inicio
 * @param {number} startConfig.sessionsFirstWeek - Sesiones en primera semana
 * @param {string} [startConfig.distributionOption='extra_week'] - Opción de distribución
 * @returns {object} Plan con distribución aplicada
 */
export function applySessionDistribution(plan, startConfig) {
  if (!startConfig || !startConfig.sessionsFirstWeek) {
    logger.info('ℹ️ No hay configuración de inicio, plan sin modificar');
    return plan;
  }

  logger.info('📊 Aplicando distribución de sesiones:', startConfig);

  // Calcular distribución
  const totalSessions = plan.semanas.reduce((sum, week) =>
    sum + (week.sesiones?.length || 0), 0
  );

  const distribution = calculateSessionDistribution({
    totalSessions,
    sessionsPerWeek: plan.frecuencia_por_semana || DEFAULT_VALUES.FRECUENCIA_SEMANAL,
    sessionsFirstWeek: startConfig.sessionsFirstWeek,
    distributionOption: startConfig.distributionOption || DISTRIBUTION_OPTIONS.EXTRA_WEEK
  });

  logger.info('📊 Distribución calculada:', distribution);

  // Reorganizar semanas según distribución
  const allSessions = [];
  plan.semanas.forEach(week => {
    if (week.sesiones && Array.isArray(week.sesiones)) {
      allSessions.push(...week.sesiones);
    }
  });

  const newWeeks = [];
  let sessionIndex = 0;

  distribution.forEach((weekDist, idx) => {
    const weekSessions = allSessions.slice(sessionIndex, sessionIndex + weekDist.sessions);

    // Actualizar días de las sesiones según distribución
    weekSessions.forEach((session, sIdx) => {
      if (weekDist.days && weekDist.days[sIdx]) {
        session.dia = weekDist.days[sIdx];
      }
    });

    newWeeks.push({
      numero: idx + 1,
      enfoque: `Semana ${idx + 1}`,
      sesiones: weekSessions
    });

    sessionIndex += weekDist.sessions;
  });

  // Actualizar plan con nueva estructura
  return {
    ...plan,
    duracion_total_semanas: distribution.length,
    semanas: newWeeks,
    metadata: {
      ...plan.metadata,
      session_distribution_applied: true,
      distribution_option: startConfig.distributionOption,
      sessions_first_week: startConfig.sessionsFirstWeek
    }
  };
}
