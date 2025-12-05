/**
 * @fileoverview Hook para gestión del estado de sesión de entrenamiento
 * 
 * Proporciona:
 * - Carga del estado de sesión de hoy desde el backend
 * - Estado de sesión de fin de semana
 * - Manejo de errores y loading states
 * 
 * @module components/routines/tabs/TodayTrainingTab/hooks/useSessionStatus
 */

import { useState, useCallback, useEffect } from 'react';
import { isWeekend } from '@/utils/training/dateHelpers';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3010';

/**
 * Hook para gestionar el estado de la sesión de entrenamiento
 * 
 * @param {Object} params
 * @param {string} params.methodologyPlanId - ID del plan de metodología
 * @param {boolean} params.hasActivePlan - Si hay un plan activo
 * @returns {Object} Estado y funciones de la sesión
 */
export function useSessionStatus({ methodologyPlanId, hasActivePlan }) {
  const [todayStatus, setTodayStatus] = useState(null);
  const [loadingTodayStatus, setLoadingTodayStatus] = useState(false);
  const [sessionError, setSessionError] = useState(null);

  // Obtener token de autenticación
  const getAuthToken = useCallback(() => {
    return localStorage.getItem('authToken');
  }, []);

  // Fetch estado de sesión de fin de semana
  const fetchWeekendStatus = useCallback(async () => {
    try {
      const token = getAuthToken();
      if (!token) {
        console.log('⚠️ No token para fetchWeekendStatus');
        return null;
      }

      console.log('🌐 Llamando a /api/training-session/weekend-status...');
      const response = await fetch(`${API_URL}/api/training-session/weekend-status`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        console.error('❌ Error obteniendo estado de fin de semana:', response.status);
        return null;
      }

      const data = await response.json();
      console.log('📦 Weekend status data:', data);

      if (data.hasWeekendSession) {
        return data;
      }

      return null;
    } catch (error) {
      console.error('❌ Error cargando estado de fin de semana:', error);
      return null;
    }
  }, [getAuthToken]);

  // Fetch estado de sesión de hoy
  const fetchTodayStatus = useCallback(async () => {
    console.log('🔍 fetchTodayStatus - isWeekend:', isWeekend(), 'day:', new Date().getDay());

    // Si es fin de semana, buscar sesiones de fin de semana
    if (isWeekend()) {
      console.log('📅 Es fin de semana, buscando sesión weekend...');
      const weekendData = await fetchWeekendStatus();
      if (weekendData?.hasWeekendSession) {
        console.log('🎯 Usando datos de sesión de fin de semana');
        setTodayStatus({
          session: weekendData.session,
          exercises: weekendData.exercises,
          summary: weekendData.summary
        });
        return weekendData;
      }
    }

    // Si no hay plan activo o metodología, no continuar
    if (!hasActivePlan || !methodologyPlanId) return null;

    setLoadingTodayStatus(true);
    setSessionError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        console.error('❌ No hay token de autenticación');
        setTodayStatus(null);
        return null;
      }

      const response = await fetch(
        `${API_URL}/api/routines/sessions/today-status?methodology_plan_id=${methodologyPlanId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('📦 Today status data:', data);

      if (data.success) {
        setTodayStatus(data);
        return data;
      }

      return null;
    } catch (error) {
      console.error('❌ Error cargando estado de hoy:', error);
      setSessionError(error.message);
      return null;
    } finally {
      setLoadingTodayStatus(false);
    }
  }, [methodologyPlanId, hasActivePlan, fetchWeekendStatus, getAuthToken]);

  // Cargar estado al montar o cuando cambie el plan
  useEffect(() => {
    if (hasActivePlan && methodologyPlanId) {
      fetchTodayStatus();
    }
  }, [hasActivePlan, methodologyPlanId, fetchTodayStatus]);

  // Limpiar estado de sesión
  const clearSessionStatus = useCallback(() => {
    setTodayStatus(null);
    setSessionError(null);
  }, []);

  return {
    todayStatus,
    loadingTodayStatus,
    sessionError,
    fetchTodayStatus,
    fetchWeekendStatus,
    clearSessionStatus,
    isWeekendDay: isWeekend()
  };
}

export default useSessionStatus;

