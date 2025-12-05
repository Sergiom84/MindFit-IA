/**
 * @fileoverview Hook para gestión centralizada de modales de metodología
 * 
 * Proporciona:
 * - Estado de todos los modales
 * - Funciones para abrir/cerrar modales
 * - Datos pendientes para cada modal
 * 
 * @module components/Methodologie/hooks/useMethodologyModals
 */

import { useState, useCallback } from 'react';

/**
 * Estado inicial de modales
 */
const INITIAL_MODAL_STATE = {
  // Modales principales
  showMethodologyDetails: false,
  showVersionSelection: false,
  showActiveTrainingWarning: false,
  showPlanConfirmation: false,
  showWarmup: false,
  showRoutineSession: false,
  
  // Modales de configuración de inicio
  showStartDayModal: false,
  showDistributionModal: false,
  showWeekendWarning: false,
  
  // Modales específicos de HipertrofiaV2
  showHpv2WeekendModal: false,
  showHpv2FocusModal: false,
  
  // Datos pendientes
  pendingMethodology: null,
  detailsMethod: {},
  versionSelectionData: null,
  weekendGenerationData: null,
  pendingSessionData: null,
  startConfig: null,
  distributionConfig: null,
  pendingLevel: null,
  pendingFocusGroup: null
};

/**
 * Hook para gestión de modales de metodología
 * 
 * @returns {Object} Estado y funciones de modales
 */
export function useMethodologyModals() {
  const [modalState, setModalState] = useState(INITIAL_MODAL_STATE);

  /**
   * Actualizar estado de modales
   */
  const updateModalState = useCallback((updates) => {
    setModalState(prev => ({ ...prev, ...updates }));
  }, []);

  /**
   * Abrir modal de detalles de metodología
   */
  const openMethodologyDetails = useCallback((methodology) => {
    updateModalState({
      showMethodologyDetails: true,
      detailsMethod: methodology
    });
  }, [updateModalState]);

  /**
   * Cerrar modal de detalles
   */
  const closeMethodologyDetails = useCallback(() => {
    updateModalState({
      showMethodologyDetails: false,
      detailsMethod: {}
    });
  }, [updateModalState]);

  /**
   * Abrir modal de selección de versión
   */
  const openVersionSelection = useCallback((data) => {
    updateModalState({
      showVersionSelection: true,
      versionSelectionData: data
    });
  }, [updateModalState]);

  /**
   * Cerrar modal de selección de versión
   */
  const closeVersionSelection = useCallback(() => {
    updateModalState({
      showVersionSelection: false,
      versionSelectionData: null
    });
  }, [updateModalState]);

  /**
   * Abrir modal de confirmación de plan
   */
  const openPlanConfirmation = useCallback((sessionData) => {
    updateModalState({
      showPlanConfirmation: true,
      pendingSessionData: sessionData
    });
  }, [updateModalState]);

  /**
   * Cerrar modal de confirmación de plan
   */
  const closePlanConfirmation = useCallback(() => {
    updateModalState({
      showPlanConfirmation: false,
      pendingSessionData: null
    });
  }, [updateModalState]);

  /**
   * Abrir modal de calentamiento
   */
  const openWarmupModal = useCallback((sessionData) => {
    updateModalState({
      showWarmup: true,
      pendingSessionData: sessionData
    });
  }, [updateModalState]);

  /**
   * Cerrar modal de calentamiento
   */
  const closeWarmupModal = useCallback(() => {
    updateModalState({
      showWarmup: false
    });
  }, [updateModalState]);

  /**
   * Abrir modal de sesión de rutina
   */
  const openRoutineSessionModal = useCallback(() => {
    updateModalState({
      showRoutineSession: true,
      showWarmup: false
    });
  }, [updateModalState]);

  /**
   * Cerrar modal de sesión de rutina
   */
  const closeRoutineSessionModal = useCallback(() => {
    updateModalState({
      showRoutineSession: false,
      pendingSessionData: null
    });
  }, [updateModalState]);

  /**
   * Resetear todos los modales
   */
  const resetAllModals = useCallback(() => {
    setModalState(INITIAL_MODAL_STATE);
  }, []);

  return {
    // Estado
    ...modalState,
    
    // Funciones de actualización
    updateModalState,
    
    // Funciones específicas
    openMethodologyDetails,
    closeMethodologyDetails,
    openVersionSelection,
    closeVersionSelection,
    openPlanConfirmation,
    closePlanConfirmation,
    openWarmupModal,
    closeWarmupModal,
    openRoutineSessionModal,
    closeRoutineSessionModal,
    resetAllModals
  };
}

export default useMethodologyModals;

