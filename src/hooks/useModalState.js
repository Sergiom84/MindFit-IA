/**
 * 🎭 useModalState - Hook para gestión consistente de modales
 *
 * PROPÓSITO:
 * - Evitar conflictos de estado en modales
 * - Prevenir aperturas/cierres no deseados
 * - Gestionar estados de confirmación y errores
 * - Mantener historial de acciones del modal
 */

import { useState, useCallback, useRef } from 'react';

/**
 * Hook para gestionar el estado de modales de forma robusta
 * @param {boolean} initialOpen - Estado inicial del modal
 * @param {Object} options - Opciones de configuración
 */
export const useModalState = (initialOpen = false, options = {}) => {
  const {
    onOpen = null,
    onClose = null,
    preventDoubleOpen = true,
    debugMode = false
  } = options;

  // Estados principales
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  // Referencias para prevenir race conditions
  const processingRef = useRef(false);
  const openCountRef = useRef(0);
  const lastActionRef = useRef(null);

  // Función para abrir el modal
  const open = useCallback((modalData = null) => {
    if (preventDoubleOpen && isOpen) {
      if (debugMode) {
        console.log('⚠️ Modal ya está abierto, ignorando apertura');
      }
      return false;
    }

    openCountRef.current += 1;
    lastActionRef.current = { type: 'open', timestamp: Date.now() };

    setIsOpen(true);
    setError(null);

    if (modalData) {
      setData(modalData);
    }

    if (onOpen) {
      onOpen(modalData);
    }

    if (debugMode) {
      console.log('✅ Modal abierto', {
        openCount: openCountRef.current,
        data: modalData
      });
    }

    return true;
  }, [isOpen, onOpen, preventDoubleOpen, debugMode]);

  // Función para cerrar el modal
  const close = useCallback(() => {
    if (!isOpen) {
      if (debugMode) {
        console.log('⚠️ Modal ya está cerrado');
      }
      return false;
    }

    lastActionRef.current = { type: 'close', timestamp: Date.now() };

    setIsOpen(false);
    setError(null);
    setIsProcessing(false);
    processingRef.current = false;

    if (onClose) {
      onClose();
    }

    if (debugMode) {
      console.log('✅ Modal cerrado');
    }

    return true;
  }, [isOpen, onClose, debugMode]);

  // Toggle del modal
  const toggle = useCallback(() => {
    if (isOpen) {
      return close();
    } else {
      return open();
    }
  }, [isOpen, open, close]);

  // Procesar acción con prevención de doble clic
  const processAction = useCallback(async (action, options = {}) => {
    const {
      closeOnSuccess = true,
      closeOnError = false,
      resetErrorOnStart = true
    } = options;

    // Prevenir doble procesamiento
    if (processingRef.current || isProcessing) {
      if (debugMode) {
        console.log('⚠️ Ya hay un proceso en curso, ignorando');
      }
      return { success: false, error: 'Proceso ya en curso' };
    }

    processingRef.current = true;
    setIsProcessing(true);

    if (resetErrorOnStart) {
      setError(null);
    }

    try {
      const result = await action();

      if (closeOnSuccess) {
        close();
      }

      if (debugMode) {
        console.log('✅ Acción procesada exitosamente', result);
      }

      return { success: true, result };

    } catch (err) {
      const errorMessage = err.message || 'Error al procesar acción';
      setError(errorMessage);

      if (closeOnError) {
        close();
      }

      if (debugMode) {
        console.error('❌ Error procesando acción:', err);
      }

      return { success: false, error: errorMessage };

    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  }, [isProcessing, close, debugMode]);

  // Reset completo del estado
  const reset = useCallback(() => {
    setIsOpen(false);
    setIsProcessing(false);
    setError(null);
    setData(null);
    processingRef.current = false;
    openCountRef.current = 0;
    lastActionRef.current = null;

    if (debugMode) {
      console.log('🔄 Estado del modal reseteado');
    }
  }, [debugMode]);

  // Obtener información de depuración
  const getDebugInfo = useCallback(() => {
    return {
      isOpen,
      isProcessing,
      error,
      data,
      openCount: openCountRef.current,
      lastAction: lastActionRef.current,
      processingRef: processingRef.current
    };
  }, [isOpen, isProcessing, error, data]);

  return {
    // Estados
    isOpen,
    isProcessing,
    error,
    data,

    // Acciones
    open,
    close,
    toggle,
    processAction,
    reset,

    // Setters directos (usar con precaución)
    setError,
    setData,

    // Debug
    getDebugInfo
  };
};

/**
 * Hook para modales de confirmación
 */
export const useConfirmationModal = (options = {}) => {
  const modal = useModalState(false, options);
  const [confirmData, setConfirmData] = useState(null);
  const confirmCallbackRef = useRef(null);
  const cancelCallbackRef = useRef(null);

  const showConfirmation = useCallback((data = {}) => {
    const {
      message,
      title,
      onConfirm,
      onCancel,
      confirmText = 'Confirmar',
      cancelText = 'Cancelar',
      ...otherData
    } = data;

    setConfirmData({
      message,
      title,
      confirmText,
      cancelText,
      ...otherData
    });

    confirmCallbackRef.current = onConfirm;
    cancelCallbackRef.current = onCancel;

    modal.open();
  }, [modal]);

  const handleConfirm = useCallback(async () => {
    if (confirmCallbackRef.current) {
      const result = await modal.processAction(
        () => confirmCallbackRef.current(confirmData),
        { closeOnSuccess: true }
      );
      return result;
    }
    modal.close();
  }, [modal, confirmData]);

  const handleCancel = useCallback(() => {
    if (cancelCallbackRef.current) {
      cancelCallbackRef.current();
    }
    modal.close();
  }, [modal]);

  return {
    ...modal,
    confirmData,
    showConfirmation,
    handleConfirm,
    handleCancel
  };
};

/**
 * Hook para modales con formularios
 */
export const useFormModal = (initialValues = {}, options = {}) => {
  const modal = useModalState(false, options);
  const [formValues, setFormValues] = useState(initialValues);
  const [formErrors, setFormErrors] = useState({});
  const [isDirty, setIsDirty] = useState(false);

  const updateField = useCallback((name, value) => {
    setFormValues(prev => ({
      ...prev,
      [name]: value
    }));
    setIsDirty(true);

    // Limpiar error del campo al modificarlo
    if (formErrors[name]) {
      setFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  }, [formErrors]);

  const resetForm = useCallback(() => {
    setFormValues(initialValues);
    setFormErrors({});
    setIsDirty(false);
  }, [initialValues]);

  const openWithData = useCallback((data = {}) => {
    setFormValues({ ...initialValues, ...data });
    setFormErrors({});
    setIsDirty(false);
    modal.open();
  }, [initialValues, modal]);

  const validateAndSubmit = useCallback(async (validator, onSubmit) => {
    // Validar formulario
    const errors = validator ? validator(formValues) : {};

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return { success: false, errors };
    }

    // Procesar envío
    const result = await modal.processAction(
      () => onSubmit(formValues),
      { closeOnSuccess: true }
    );

    if (result.success) {
      resetForm();
    }

    return result;
  }, [formValues, modal, resetForm]);

  return {
    ...modal,
    formValues,
    formErrors,
    isDirty,
    updateField,
    resetForm,
    openWithData,
    validateAndSubmit
  };
};

export default useModalState;