import { useEffect, useRef } from 'react';

/**
 * Traza apertura/cierre de los modales clave de "Entrenamiento en Casa".
 * Extraído de HomeTrainingSection.jsx (ARCH-002) sin cambios de comportamiento.
 * Usa refs para evitar loops infinitos de tracking.
 */
export default function useHomeTrainingModalTracking({
  showExerciseModal,
  currentExerciseIndex,
  showPersonalizedMessage,
  track
}) {
  const prevShowExerciseModalRef = useRef(showExerciseModal);
  const prevShowPersonalizedMessageRef = useRef(showPersonalizedMessage);

  // Trace apertura/cierre de modales clave - CORREGIDO con useRef
  useEffect(() => {
    try {
      if (prevShowExerciseModalRef.current !== showExerciseModal) {
        if (showExerciseModal) {
          track('MODAL_OPEN', { name: 'HomeTrainingExerciseModal', index: currentExerciseIndex }, { component: 'HomeTrainingSection' });
        } else {
          track('MODAL_CLOSE', { name: 'HomeTrainingExerciseModal' }, { component: 'HomeTrainingSection' });
        }
        prevShowExerciseModalRef.current = showExerciseModal;
      }
    } catch (error) {
      // Ignore tracking errors
    }
  }, [showExerciseModal, currentExerciseIndex, track]);

  useEffect(() => {
    try {
      if (prevShowPersonalizedMessageRef.current !== showPersonalizedMessage) {
        if (showPersonalizedMessage) {
          track('MODAL_OPEN', { name: 'HomeTrainingPersonalizedMessage' }, { component: 'HomeTrainingSection' });
        } else {
          track('MODAL_CLOSE', { name: 'HomeTrainingPersonalizedMessage' }, { component: 'HomeTrainingSection' });
        }
        prevShowPersonalizedMessageRef.current = showPersonalizedMessage;
      }
    } catch (error) {
      // Ignore tracking errors
    }
  }, [showPersonalizedMessage, track]);
}
