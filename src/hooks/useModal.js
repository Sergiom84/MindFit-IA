/**
 * 🎭 useModal - Hook para gestión de modales
 * 
 * RAZONAMIENTO:
 * - Patrón repetido: showModal state + data state + open/close functions
 * - Centraliza lógica de modales en toda la aplicación
 * - Previene memory leaks y estados inconsistentes
 * - Gestión de múltiples modales
 */

import { useState, useCallback } from 'react';
import logger from '../utils/logger';

/**
 * Hook básico para un modal simple
 */
export const useModal = (initialOpen = false) => {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [data, setData] = useState(null);

  const open = useCallback((modalData = null) => {
    setData(modalData);
    setIsOpen(true);
    logger.debug('Modal abierto', { data: modalData }, 'Modal');
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setData(null);
    logger.debug('Modal cerrado', null, 'Modal');
  }, []);

  const toggle = useCallback(() => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }, [isOpen, close, open]);

  return {
    isOpen,
    data,
    open,
    close,
    toggle
  };
};

/**
 * Hook para gestión de múltiples modales
 */
export const useModalManager = () => {
  const [modals, setModals] = useState({});

  const openModal = useCallback((modalName, data = null) => {
    setModals(prev => ({
      ...prev,
      [modalName]: { isOpen: true, data }
    }));
    logger.debug('Modal abierto', { modalName, data }, 'ModalManager');
  }, []);

  const closeModal = useCallback((modalName) => {
    setModals(prev => ({
      ...prev,
      [modalName]: { isOpen: false, data: null }
    }));
    logger.debug('Modal cerrado', { modalName }, 'ModalManager');
  }, []);

  const closeAllModals = useCallback(() => {
    setModals({});
    logger.debug('Todos los modales cerrados', null, 'ModalManager');
  }, []);

  const isModalOpen = useCallback((modalName) => {
    return modals[modalName]?.isOpen || false;
  }, [modals]);

  const getModalData = useCallback((modalName) => {
    return modals[modalName]?.data || null;
  }, [modals]);

  const toggleModal = useCallback((modalName, data = null) => {
    if (isModalOpen(modalName)) {
      closeModal(modalName);
    } else {
      openModal(modalName, data);
    }
  }, [isModalOpen, closeModal, openModal]);

  return {
    modals,
    openModal,
    closeModal,
    closeAllModals,
    isModalOpen,
    getModalData,
    toggleModal
  };
};

/**
 * Hook especializado para modales de confirmación
 */
export const useConfirmModal = () => {
  const modal = useModal();
  const [pendingAction, setPendingAction] = useState(null);

  const confirm = useCallback(async (options = {}) => {
    const {
      title = '¿Estás seguro?',
      message = 'Esta acción no se puede deshacer.',
      confirmText = 'Confirmar',
      cancelText = 'Cancelar',
      onConfirm = null,
      onCancel = null
    } = options;

    return new Promise((resolve) => {
      setPendingAction({
        resolve,
        onConfirm,
        onCancel
      });

      modal.open({
        title,
        message,
        confirmText,
        cancelText
      });
    });
  }, [modal]);

  const handleConfirm = useCallback(async () => {
    if (pendingAction) {
      try {
        if (pendingAction.onConfirm) {
          await pendingAction.onConfirm();
        }
        pendingAction.resolve(true);
      } catch (error) {
        logger.error('Error en confirmación', error, 'ConfirmModal');
        pendingAction.resolve(false);
      } finally {
        setPendingAction(null);
        modal.close();
      }
    }
  }, [pendingAction, modal]);

  const handleCancel = useCallback(() => {
    if (pendingAction) {
      if (pendingAction.onCancel) {
        pendingAction.onCancel();
      }
      pendingAction.resolve(false);
      setPendingAction(null);
      modal.close();
    }
  }, [pendingAction, modal]);

  return {
    ...modal,
    confirm,
    handleConfirm,
    handleCancel,
    isPending: Boolean(pendingAction)
  };
};

/**
 * Hook para modales con steps/pasos
 */
export const useStepModal = (steps = [], initialStep = 0) => {
  const modal = useModal();
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [stepData, setStepData] = useState({});

  const nextStep = useCallback(() => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  }, [currentStep, steps.length]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const goToStep = useCallback((step) => {
    if (step >= 0 && step < steps.length) {
      setCurrentStep(step);
    }
  }, [steps.length]);

  const updateStepData = useCallback((step, data) => {
    setStepData(prev => ({
      ...prev,
      [step]: { ...prev[step], ...data }
    }));
  }, []);

  const resetSteps = useCallback(() => {
    setCurrentStep(initialStep);
    setStepData({});
  }, [initialStep]);

  const openWithStep = useCallback((step = initialStep, data = null) => {
    setCurrentStep(step);
    modal.open(data);
  }, [initialStep, modal]);

  const closeAndReset = useCallback(() => {
    modal.close();
    resetSteps();
  }, [modal, resetSteps]);

  return {
    ...modal,
    currentStep,
    stepData,
    nextStep,
    prevStep,
    goToStep,
    updateStepData,
    resetSteps,
    openWithStep,
    close: closeAndReset,
    // Helpers
    isFirstStep: currentStep === 0,
    isLastStep: currentStep === steps.length - 1,
    currentStepData: stepData[currentStep] || {},
    allStepsData: stepData,
    progress: (currentStep + 1) / steps.length
  };
};

/**
 * Hook para modales con timeout auto-close
 */
export const useTimedModal = (timeout = 5000) => {
  const modal = useModal();

  const openTimed = useCallback((data = null, customTimeout = timeout) => {
    modal.open(data);
    
    const timeoutId = setTimeout(() => {
      modal.close();
    }, customTimeout);

    return () => clearTimeout(timeoutId);
  }, [modal, timeout]);

  return {
    ...modal,
    openTimed
  };
};

export default useModal;