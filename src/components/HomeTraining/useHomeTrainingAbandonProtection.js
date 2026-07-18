import { useEffect } from 'react';
import logger from '../../utils/logger';
import tokenManager from '../../utils/tokenManager';

/**
 * 🛡️ Detección de abandono de sesión de "Entrenamiento en Casa".
 * Guarda el progreso ante beforeunload/visibilitychange y reactiva al volver.
 * Extraído de HomeTrainingSection.jsx (ARCH-002) sin cambios de comportamiento.
 */
export default function useHomeTrainingAbandonProtection({
  currentSession,
  showExerciseModal,
  exercisesProgress,
  loadSessionProgress
}) {
  useEffect(() => {
    if (!currentSession) return;

    const handleBeforeUnload = (event) => {
      // Solo si hay una sesión activa y progreso sin guardar
      if (currentSession && (showExerciseModal || (exercisesProgress && exercisesProgress.length > 0))) {
        logger.info('Usuario abandonando sesión, guardando progreso', null, 'HomeTraining');

        // Usar sendBeacon para envío asíncrono confiable
        const token = tokenManager.getToken();
        const abandonData = {
          currentProgress: exercisesProgress,
          reason: 'beforeunload'
        };

        navigator.sendBeacon(
          `/api/home-training/sessions/${currentSession.id}/handle-abandon`,
          new Blob([JSON.stringify(abandonData)], {
            type: 'application/json'
          })
        );

        // Mostrar warning al usuario (opcional)
        event.preventDefault();
        event.returnValue = '¿Estás seguro de que quieres salir? Tu progreso se guardará automáticamente.';
        return event.returnValue;
      }
    };

    const handleVisibilityChange = async () => {
      if (!currentSession) return;

      const token = tokenManager.getToken();

      if (document.hidden) {
        // Usuario cambió de tab/minimizó - marcar como abandonado temporalmente
        logger.debug('Usuario cambió de tab, marcando sesión como pausada', null, 'HomeTraining');

        if (exercisesProgress && exercisesProgress.length > 0) {
          try {
            await fetch(`/api/home-training/sessions/${currentSession.id}/handle-abandon`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                currentProgress: exercisesProgress,
                reason: 'visibility_hidden'
              })
            });
          } catch (error) {
            logger.error('Error guardando progreso en cambio de visibilidad', error, 'HomeTraining');
          }
        }
      } else {
        // Usuario volvió - reactivar sesión
        logger.debug('Usuario volvió, reactivando sesión', null, 'HomeTraining');
        // Aquí podrías cargar progreso actualizado si fuera necesario
        await loadSessionProgress(currentSession.id);
      }
    };

    // Agregar event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentSession, showExerciseModal, exercisesProgress, loadSessionProgress]);
}
