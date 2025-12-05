/**
 * @fileoverview Hook para validación de metodologías y planes
 * 
 * Proporciona:
 * - Validación de datos de plan
 * - Detección de fin de semana
 * - Validación de nivel de usuario
 * 
 * @module components/Methodologie/hooks/useMethodologyValidation
 */

import { useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserContext } from '@/contexts/UserContext';

/**
 * Hook para validaciones de metodología
 * 
 * @returns {Object} Funciones de validación
 */
export function useMethodologyValidation() {
  const { user } = useAuth();
  const { userData } = useUserContext();

  /**
   * Detecta si hoy es fin de semana
   */
  const isWeekend = useCallback(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6;
  }, []);

  /**
   * Detecta si debe mostrar modal de día de inicio
   * Muestra modal si es Jueves, Viernes, Sábado o Domingo
   */
  const shouldShowStartDayModal = useCallback(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    return [0, 4, 5, 6].includes(dayOfWeek);
  }, []);

  /**
   * Detecta si debe mostrar modal de distribución de sesiones
   */
  const shouldShowDistributionModal = useCallback((config) => {
    if (!config) return false;
    const { sessionsFirstWeek, startDayOfWeek } = config;
    const isThursdayStart = startDayOfWeek === 4;
    return isThursdayStart && sessionsFirstWeek && sessionsFirstWeek < 5;
  }, []);

  /**
   * Nivel del usuario normalizado
   */
  const getUserLevel = useCallback(() => {
    const raw =
      userData?.nivel_entrenamiento ||
      userData?.nivel ||
      user?.nivel_entrenamiento ||
      user?.nivel ||
      'Principiante';
    const normalized = String(raw).toLowerCase();
    if (normalized.includes('inter')) return 'Intermedio';
    if (normalized.includes('avanz')) return 'Avanzado';
    return 'Principiante';
  }, [userData, user]);

  /**
   * Valida que un plan tenga datos completos
   */
  const validatePlanData = useCallback((planData) => {
    console.log('🛡️ Validando datos del plan...', planData);

    if (!planData) {
      console.log('❌ Plan es null o undefined');
      return { isValid: false, error: 'Plan no generado' };
    }

    if (typeof planData !== 'object' || Object.keys(planData).length === 0) {
      console.log('❌ Plan está vacío o no es un objeto');
      return { isValid: false, error: 'Plan vacío o corrupto' };
    }

    if (!planData.semanas || !Array.isArray(planData.semanas) || planData.semanas.length === 0) {
      console.log('❌ Plan no tiene semanas válidas');
      return { isValid: false, error: 'Plan sin semanas de entrenamiento' };
    }

    // Verificar que al menos una semana tenga sesiones
    const hasValidSessions = planData.semanas.some(semana =>
      semana.sesiones && Array.isArray(semana.sesiones) && semana.sesiones.length > 0
    );

    if (!hasValidSessions) {
      console.log('❌ Plan no tiene sesiones válidas');
      return { isValid: false, error: 'Plan sin sesiones de entrenamiento' };
    }

    // Verificar que al menos una sesión tenga ejercicios
    const hasValidExercises = planData.semanas.some(semana =>
      semana.sesiones && semana.sesiones.some(sesion => {
        if (sesion.ejercicios && Array.isArray(sesion.ejercicios) && sesion.ejercicios.length > 0) {
          return true;
        }
        if (sesion.bloques && Array.isArray(sesion.bloques)) {
          return sesion.bloques.some(bloque =>
            bloque.ejercicios && Array.isArray(bloque.ejercicios) && bloque.ejercicios.length > 0
          );
        }
        return false;
      })
    );

    if (!hasValidExercises) {
      console.log('❌ Plan no tiene ejercicios válidos');
      return { isValid: false, error: 'Plan sin ejercicios' };
    }

    console.log('✅ Plan válido - puede mostrar modal');
    return { isValid: true };
  }, []);

  // Nivel actual del usuario (memoizado)
  const userLevel = useMemo(() => getUserLevel(), [getUserLevel]);

  return {
    isWeekend,
    shouldShowStartDayModal,
    shouldShowDistributionModal,
    getUserLevel,
    validatePlanData,
    userLevel
  };
}

export default useMethodologyValidation;

