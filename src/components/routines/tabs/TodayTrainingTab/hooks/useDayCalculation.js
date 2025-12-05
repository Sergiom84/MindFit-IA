/**
 * @fileoverview Hook para cálculos de día y búsqueda de sesiones
 * 
 * Proporciona:
 * - Cálculo de day_id desde fecha de inicio del plan
 * - Búsqueda de sesión de hoy en el plan
 * - Cálculo de semana actual
 * 
 * @module components/routines/tabs/TodayTrainingTab/hooks/useDayCalculation
 */

import { useMemo } from 'react';
import { 
  computeDayId, 
  computeWeekNumber, 
  getTodayName, 
  isWeekend 
} from '@/utils/training/dateHelpers';
import { 
  findTodaySession, 
  getCurrentWeekIndex, 
  findWeekInPlan 
} from '@/utils/training/sessionFinders';

/**
 * Hook para cálculos relacionados con el día actual de entrenamiento
 * 
 * @param {Object} params
 * @param {Object} params.routinePlan - Plan de rutina con estructura { semanas: [...] }
 * @param {string} params.planStartDate - Fecha de inicio del plan (ISO string)
 * @param {string} [params.timezone='Europe/Madrid'] - Timezone del usuario
 * @returns {Object} Datos calculados del día actual
 */
export function useDayCalculation({ routinePlan, planStartDate, timezone = 'Europe/Madrid' }) {
  
  // Calcular day_id basado en fecha de inicio del plan
  const dayId = useMemo(() => {
    if (!planStartDate) return 1;
    return computeDayId(planStartDate, timezone);
  }, [planStartDate, timezone]);

  // Nombre del día actual
  const todayName = useMemo(() => getTodayName(), []);
  
  // Verificar si es fin de semana
  const isWeekendDay = useMemo(() => isWeekend(), []);
  
  // Calcular índice de semana actual (0-indexed)
  const currentWeekIndex = useMemo(() => {
    return getCurrentWeekIndex(dayId);
  }, [dayId]);

  // Calcular número de semana actual (1-indexed)
  const currentWeekNumber = useMemo(() => {
    return computeWeekNumber(dayId);
  }, [dayId]);

  // Buscar la sesión de hoy en el plan
  const todaySession = useMemo(() => {
    if (!routinePlan?.semanas) return null;
    return findTodaySession(routinePlan, todayName, currentWeekIndex);
  }, [routinePlan, todayName, currentWeekIndex]);

  // Obtener la semana actual del plan
  const currentWeek = useMemo(() => {
    if (!routinePlan?.semanas) return null;
    return findWeekInPlan(routinePlan.semanas, currentWeekNumber);
  }, [routinePlan, currentWeekNumber]);

  // Verificar si hay sesión programada para hoy
  const hasSessionToday = useMemo(() => {
    return todaySession !== null;
  }, [todaySession]);

  // Obtener días con sesiones en la semana actual
  const weekSessionDays = useMemo(() => {
    if (!currentWeek?.sesiones) return [];
    return currentWeek.sesiones.map(s => s.dia || s.dia_semana);
  }, [currentWeek]);

  // Total de semanas en el plan
  const totalWeeks = useMemo(() => {
    return routinePlan?.semanas?.length || 0;
  }, [routinePlan]);

  // Verificar si es la primera semana
  const isFirstWeek = currentWeekNumber === 1;

  // Verificar si es la última semana
  const isLastWeek = currentWeekNumber >= totalWeeks;

  return {
    // Valores calculados
    dayId,
    todayName,
    isWeekendDay,
    currentWeekIndex,
    currentWeekNumber,
    
    // Datos de sesión
    todaySession,
    hasSessionToday,
    currentWeek,
    weekSessionDays,
    
    // Metadatos del plan
    totalWeeks,
    isFirstWeek,
    isLastWeek
  };
}

export default useDayCalculation;

