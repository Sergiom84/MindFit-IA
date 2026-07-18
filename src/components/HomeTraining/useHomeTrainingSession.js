import { useState, useEffect, useCallback } from 'react';
import { alertDialog } from '../ui/dialogService.jsx';
import logger from '../../utils/logger';
import { useTrace } from '../../contexts/TraceContext';
import tokenManager from '../../utils/tokenManager';
import useHomeTrainingModalTracking from './useHomeTrainingModalTracking';
import useHomeTrainingAbandonProtection from './useHomeTrainingAbandonProtection';

/**
 * Hook que encapsula todo el estado, efectos y handlers de "Entrenamiento en Casa".
 * Extraído de HomeTrainingSection.jsx (ARCH-002) sin cambios de comportamiento.
 */
export default function useHomeTrainingSession() {
  const { track } = useTrace();
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [selectedTrainingType, setSelectedTrainingType] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Leer selección desde UserEquipmentSummaryCard
  useEffect(() => {
    if (sessionStorage.getItem('selectPersonalizedEquipment') === '1') {
      setSelectedEquipment('usar_este_equipamiento');
      sessionStorage.removeItem('selectPersonalizedEquipment');
    }
  }, []);
  useEffect(() => {
    const handleMouseMove = (event) => {
      setMousePosition({ x: event.clientX, y: event.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPersonalizedMessage, setShowPersonalizedMessage] = useState(false);
  const [personalizedMessage, setPersonalizedMessage] = useState('');
  const [generatedPlan, setGeneratedPlan] = useState(null);
  const [hasShownPersonalizedMessage, setHasShownPersonalizedMessage] = useState(false);

  // Estados para el sistema de entrenamiento
  const [currentSession, setCurrentSession] = useState(null);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [showWarmupModal, setShowWarmupModal] = useState(false);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [sessionProgress, setSessionProgress] = useState({
    currentExercise: 0,
    completedExercises: [],
    percentage: 0
  });
  const [exercisesProgress, setExercisesProgress] = useState([]);
  const [userStats, setUserStats] = useState(null);
  const [showProgress, setShowProgress] = useState(false);
  // Flags para evitar PUT duplicados
  const [sending, setSending] = useState(false);
  const [sendingProgress, setSendingProgress] = useState(false);
  // Modal de rechazo de ejercicios
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [pendingRegenerateAfterRejection, setPendingRegenerateAfterRejection] = useState(false);
  // Vista de historial de preferencias
  const [showPreferencesHistory, setShowPreferencesHistory] = useState(false);

  // Trace apertura/cierre de modales clave
  useHomeTrainingModalTracking({
    showExerciseModal,
    currentExerciseIndex,
    showPersonalizedMessage,
    track
  });

  // Función para resetear todo al estado inicial (optimizada con useCallback)
  const resetToInitialState = useCallback(() => {
    setSelectedEquipment(null);
    setSelectedTrainingType(null);
    setIsGenerating(false);
    setShowPersonalizedMessage(false);
    setPersonalizedMessage('');
    setGeneratedPlan(null);
    setCurrentSession(null);
    setShowExerciseModal(false);
    setShowWarmupModal(false);
    setCurrentExerciseIndex(0);
    setSessionProgress({
      currentExercise: 0,
      completedExercises: [],
      percentage: 0
    });
    setShowProgress(false);
    setShowRejectionModal(false);
    setPendingRegenerateAfterRejection(false);
    setShowPreferencesHistory(false);
  }, []);

  // Función para cancelar completamente la rutina (optimizada con useCallback)
  const cancelRoutineCompletely = useCallback(async () => {
    try {
      const token = tokenManager.getToken();
      if (!token) {
        resetToInitialState();
        return;
      }

      // Cerrar cualquier sesión activa del usuario en el backend
      await fetch('/api/home-training/close-active-sessions', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      logger.info('Sesiones activas cerradas', null, 'HomeTraining');

      // Resetear todo al estado inicial
      resetToInitialState();

    } catch (error) {
      logger.error('Error cancelando rutina', error, 'HomeTraining');
      // Aún así resetear el frontend
      resetToInitialState();
    }
  }, [resetToInitialState]);

  // Función para cargar el progreso de la sesión
  const loadSessionProgress = useCallback(async (sessionId) => {
    try {
      const token = tokenManager.getToken();
      const response = await fetch(`/api/home-training/sessions/${sessionId}/progress`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (data.success) {
        logger.debug('loadSessionProgress - Datos recibidos', {
          progress_percentage: data.progress?.percentage,
          current_exercise: data.progress?.currentExercise,
          total_exercises: data.exercises?.length,
          exercises_status: data.exercises?.map((ex, idx) => `${idx}: ${ex.exercise_name} - ${ex.status}`)
        });

        setSessionProgress(data.progress);

        // Si la sesión está completada al 100%, marcar como completada pero mantener el objeto
        if (data.progress.percentage >= 100 && data.session && currentSession) {
          setCurrentSession({ ...data.session, status: 'completed' });
        }

        // Validar que el currentExercise esté dentro del rango válido
        const currentExerciseFromServer = data.progress.currentExercise || 0;
        if (generatedPlan && generatedPlan.plan_entrenamiento && generatedPlan.plan_entrenamiento.ejercicios) {
          const maxIndex = generatedPlan.plan_entrenamiento.ejercicios.length - 1;
          const validIndex = Math.max(0, Math.min(currentExerciseFromServer, maxIndex));
          setCurrentExerciseIndex(validIndex);

          if (validIndex !== currentExerciseFromServer) {
            logger.warn('Ajustado índice de ejercicio', { from: currentExerciseFromServer, to: validIndex }, 'HomeTraining');
          }
        } else {
          setCurrentExerciseIndex(currentExerciseFromServer);
        }

        logger.debug('Actualizando exercisesProgress', { count: data.exercises?.length }, 'HomeTraining');
        setExercisesProgress(data.exercises || []);

        // Log estado después de actualizar
        setTimeout(() => {
          console.log('📊 Estado UI actualizado - exercisesProgress:',
            data.exercises?.map((ex, idx) => `${idx}: ${ex.exercise_name} (${ex.status})`)
          );
        }, 100);
      }
    } catch (error) {
      logger.error('Error loading session progress', error, 'HomeTraining');
    }
  }, [currentSession, generatedPlan]);

  // Función para cargar el plan actual del usuario
  const loadCurrentPlan = useCallback(async () => {
    try {
      const token = tokenManager.getToken();
      if (!token) return;

      const response = await fetch('/api/home-training/current-plan', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      // Solo auto-restaurar si hay una sesión ACTIVA en progreso
      if (data.success && data.plan && data.session) {
        setGeneratedPlan({
          plan_entrenamiento: data.plan.plan_data.plan_entrenamiento,
          mensaje_personalizado: data.plan.plan_data.mensaje_personalizado,
          plan_source: data.plan.plan_data.plan_source,
          plan_id: data.plan.id
        });
        setSelectedEquipment(data.plan.equipment_type);
        setSelectedTrainingType(data.plan.training_type);
        setShowProgress(true);

        setCurrentSession(data.session);
        await loadSessionProgress(data.session.id);
      } else {
        // Si no hay sesión activa, no mostrar el último plan para partir "de 0"
        setGeneratedPlan(null);
        setCurrentSession(null);
        setShowProgress(false);
      }
    } catch (error) {
      logger.error('Error loading current plan', error, 'HomeTraining');
    }
  }, [loadSessionProgress]);

  // Función para cargar estadísticas del usuario
  const loadUserStats = useCallback(async () => {
    try {
      const token = tokenManager.getToken();
      if (!token) return;

      const response = await fetch('/api/home-training/stats', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();
      if (data.success) {
        setUserStats(data.stats);
      }
    } catch (error) {
      logger.error('Error loading user stats', error, 'HomeTraining');
    }
  }, []);

  // Cargar datos al inicializar el componente
  useEffect(() => {
    loadCurrentPlan();
    loadUserStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🛡️ PROTECCIÓN: Detección de abandono de sesión
  useHomeTrainingAbandonProtection({
    currentSession,
    showExerciseModal,
    exercisesProgress,
    loadSessionProgress
  });

  // Función para generar entrenamiento con IA
  const generateTraining = async () => {
    if (!selectedEquipment || !selectedTrainingType) return;

    try {
      const token = tokenManager.getToken();
      if (!token) {
        alertDialog('Debes iniciar sesión para generar tu entrenamiento');
        return;
      }

      // ① Cerrar sesiones activas antes de generar nuevo plan
      await closeActiveSessions();

      // ② Mostrar loader ANTES de llamar a la IA
      setIsGenerating(true);
      setShowPersonalizedMessage(false);
      // Reset del flag para un nuevo plan
      setHasShownPersonalizedMessage(false);

      // ③ Llamada a la IA
      const resp = await fetch('/api/ia-home-training/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          equipment_type: selectedEquipment,
          training_type: selectedTrainingType
        })
      });

      const data = await resp.json();
      if (!resp.ok || !data.success || !data.plan) {
        throw new Error(data.error || 'Error al generar el entrenamiento');
      }

      // ④ Guardar plan y preparar mensaje
      setGeneratedPlan(data.plan);
      const message = data.plan.mensaje_personalizado || 'Tu entrenamiento personalizado ha sido generado.';
      setPersonalizedMessage(message);

      // ⑤ Ocultar loader y mostrar mensaje personalizado (solo primera vez por plan)
      setIsGenerating(false);
      if (!hasShownPersonalizedMessage) {
        setShowPersonalizedMessage(true);
        setHasShownPersonalizedMessage(true);
      }

      // ⑥ Persistir en BD (opcionalmente puedes hacerlo tras aceptar el plan)
      await savePlanToDatabase(data.plan, selectedEquipment, selectedTrainingType);
    } catch (error) {
      logger.error('Error generating plan', error, 'HomeTraining');
      setIsGenerating(false); // asegurar que se apague si falla
      alertDialog('Error al generar el entrenamiento. Por favor, inténtalo de nuevo.');
    }
  };

  // Función para proceder del mensaje personalizado al plan
  const proceedToGenerating = () => {
    // Antes: encendía el loader 2s (comportamiento invertido)
    setShowPersonalizedMessage(false);
    // El modal del plan aparece porque `generatedPlan` ya está seteado y `showProgress` es false.
  };

  // Función para guardar el plan en la base de datos
  const savePlanToDatabase = async (plan, equipment, trainingType) => {
    try {
      const token = tokenManager.getToken();
      if (!token) return;

      await fetch('/api/home-training/plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          plan_data: plan,
          equipment_type: equipment,
          training_type: trainingType
        })
      });
    } catch (error) {
      logger.error('Error saving plan to database', error, 'HomeTraining');
    }
  };

  // ===============================================
  // FUNCIONES PARA SISTEMA DE RECHAZOS
  // ===============================================

  // Función para cerrar sesiones activas
  const closeActiveSessions = async () => {
    try {
      const token = tokenManager.getToken();
      if (!token) return;

      await fetch('/api/home-training/close-active-sessions', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (error) {
      console.error('Error closing active sessions:', error);
    }
  };

  // Función para manejar el rechazo de ejercicios
  const handleExerciseRejections = async (rejections) => {
    try {
      const token = tokenManager.getToken();
      if (!token) {
        alertDialog('Debes iniciar sesión para guardar preferencias');
        return;
      }

      console.log('🚀 Iniciando proceso de rechazo y regeneración...');

      // 1. Guardar rechazos
      const response = await fetch('/api/home-training/rejections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ rejections })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Error guardando preferencias');
      }

      console.log('✅ Ejercicios rechazados guardados:', data.message);
      setShowRejectionModal(false);

      // 2. Limpiar completamente el estado antes de regenerar
      console.log('🧹 Limpiando estado anterior...');
      console.log('📋 Plan anterior tenía ejercicios:', generatedPlan?.plan_entrenamiento?.ejercicios?.map(e => e.nombre) || 'ninguno');
      setCurrentSession(null);
      setSessionProgress({
        currentExercise: 0,
        completedExercises: [],
        percentage: 0
      });
      setExercisesProgress([]);
      setShowProgress(false);
      setShowExerciseModal(false);
      setShowWarmupModal(false);
      setGeneratedPlan(null); // ← LIMPIAR PLAN ANTERIOR ANTES DE REGENERAR
      setPersonalizedMessage('');
      setShowPersonalizedMessage(false);
      setHasShownPersonalizedMessage(false);
      console.log('✨ Estado limpiado completamente');

      // 3. Cerrar sesiones activas y verificar
      console.log('🔒 Cerrando sesiones activas...');
      const closeResponse = await fetch('/api/home-training/close-active-sessions', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const closeData = await closeResponse.json();
      console.log('✅ Sesiones cerradas:', closeData.message);

      // 4. Regenerar plan
      console.log('🔄 Regenerando plan con ejercicios rechazados...');
      await generateNewPlanAfterRejection();

    } catch (error) {
      console.error('❌ Error en proceso de rechazo:', error);
      alertDialog('Error al guardar las preferencias. Por favor, inténtalo de nuevo.');
    }
  };

  // Función para regenerar plan sin marcar rechazos
  const handleSkipRejection = async () => {
    try {
      console.log('⏭️ Regenerando sin marcar rechazos...');
      setShowRejectionModal(false);

      // Limpiar estado
      console.log('🧹 Limpiando estado anterior...');
      setCurrentSession(null);
      setSessionProgress({
        currentExercise: 0,
        completedExercises: [],
        percentage: 0
      });
      setExercisesProgress([]);
      setShowProgress(false);
      setShowExerciseModal(false);
      setShowWarmupModal(false);

      // Cerrar sesiones activas
      const token = tokenManager.getToken();
      if (token) {
        const closeResponse = await fetch('/api/home-training/close-active-sessions', {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const closeData = await closeResponse.json();
        console.log('✅ Sesiones cerradas:', closeData.message);
      }

      await generateNewPlanAfterRejection();
    } catch (error) {
      console.error('❌ Error regenerando sin rechazos:', error);
      alertDialog('Error al regenerar el plan. Por favor, inténtalo de nuevo.');
    }
  };

  // Función para generar nuevo plan después del rechazo
  const generateNewPlanAfterRejection = async () => {
    if (!selectedEquipment || !selectedTrainingType) {
      alertDialog('Error: No se encontró la configuración del entrenamiento');
      return;
    }

    setPendingRegenerateAfterRejection(false);

    try {
      const token = tokenManager.getToken();
      if (!token) {
        alertDialog('Debes iniciar sesión para generar tu entrenamiento');
        return;
      }

      // ⚠️ NO llamar closeActiveSessions() aquí porque ya se hizo antes

      // Mostrar loader ANTES de llamar a la IA
      setIsGenerating(true);
      setShowPersonalizedMessage(false);
      setHasShownPersonalizedMessage(false);

      // Llamada a la IA
      const resp = await fetch('/api/ia-home-training/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          equipment_type: selectedEquipment,
          training_type: selectedTrainingType
        })
      });

      const data = await resp.json();
      if (!resp.ok || !data.success || !data.plan) {
        throw new Error(data.error || 'Error al generar el entrenamiento');
      }

      // Guardar plan y preparar mensaje
      console.log('💾 Guardando nuevo plan generado:', data.plan.plan_entrenamiento.ejercicios.map(e => e.nombre));
      setGeneratedPlan(data.plan);
      const message = data.plan.mensaje_personalizado || 'Tu entrenamiento personalizado ha sido generado.';
      setPersonalizedMessage(message);

      // Ocultar loader y mostrar mensaje personalizado
      console.log('🎯 Ocultando loader y mostrando mensaje personalizado');
      setIsGenerating(false);
      if (!hasShownPersonalizedMessage) {
        console.log('📢 Mostrando mensaje personalizado del nuevo plan');
        setShowPersonalizedMessage(true);
        setHasShownPersonalizedMessage(true);
      } else {
        console.log('⚠️ Mensaje personalizado ya fue mostrado, saltando');
      }

      // Persistir en BD
      await savePlanToDatabase(data.plan, selectedEquipment, selectedTrainingType);

      console.log('✅ Nuevo plan generado exitosamente');

    } catch (error) {
      console.error('❌ Error generando nuevo plan:', error);
      setIsGenerating(false);
      alertDialog('Error al generar el entrenamiento. Por favor, inténtalo de nuevo.');
    }
  };

  // Nueva función para manejar regeneración con modal de rechazo
  const regenerateWithRejectionModal = () => {
    if (!generatedPlan || !generatedPlan.plan_entrenamiento?.ejercicios) {
      // Si no hay plan, generar directamente
      generateTraining();
      return;
    }

    // Mostrar modal de rechazo
    setShowRejectionModal(true);
  };

  // Función para comenzar el entrenamiento
  const startTraining = async () => {
    try {
      const token = tokenManager.getToken();
      if (!token) {
        alertDialog('Debes iniciar sesión para comenzar el entrenamiento');
        return;
      }

      // Obtener el ID del plan actual
      const planResponse = await fetch('/api/home-training/current-plan', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const planData = await planResponse.json();
      if (!planData.success || !planData.plan) {
        alertDialog('No se encontró un plan de entrenamiento');
        return;
      }

      // Iniciar nueva sesión
      const sessionResponse = await fetch('/api/home-training/sessions/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          home_training_plan_id: planData.plan.id
        })
      });

      const sessionData = await sessionResponse.json();
      if (sessionData.success) {
        setCurrentSession(sessionData.session);
        setCurrentExerciseIndex(0);
        setShowProgress(true);
        setShowPersonalizedMessage(false);
        setShowWarmupModal(true);
        setShowExerciseModal(false);
        // Cargar progreso de la sesión recién creada (para obtener total_series por ejercicio)
        await loadSessionProgress(sessionData.session.id);
      }
    } catch (error) {
      console.error('Error starting training:', error);
      alertDialog('Error al iniciar el entrenamiento');
    }
  };

  // Función para continuar el entrenamiento
  const continueTraining = async () => {
    try {
      // Validar que existen los datos necesarios
      if (!generatedPlan || !generatedPlan.plan_entrenamiento || !generatedPlan.plan_entrenamiento.ejercicios) {
        console.error('No hay plan de entrenamiento cargado');

        // Intentar recargar el plan actual
        await loadCurrentPlan();

        // Verificar nuevamente después de la recarga
        if (!generatedPlan || !generatedPlan.plan_entrenamiento || !generatedPlan.plan_entrenamiento.ejercicios) {
          alertDialog('Error: No se encontró el plan de entrenamiento. Por favor, genera uno nuevo.');
          return;
        }
      }

      // Validar que el índice del ejercicio actual está dentro del rango válido
      const exercises = generatedPlan.plan_entrenamiento.ejercicios;
      if (currentExerciseIndex < 0 || currentExerciseIndex >= exercises.length) {
        console.error('Índice de ejercicio inválido:', currentExerciseIndex, 'Total ejercicios:', exercises.length);

        // Intentar corregir el índice
        const correctedIndex = Math.max(0, Math.min(currentExerciseIndex, exercises.length - 1));
        setCurrentExerciseIndex(correctedIndex);

        if (correctedIndex !== currentExerciseIndex) {
          console.log(`Índice corregido de ${currentExerciseIndex} a ${correctedIndex}`);
        }
      }

      // Verificar si todos los ejercicios están completados
      if (sessionProgress && sessionProgress.allCompleted) {
        alertDialog('Felicitaciones! Has completado todos los ejercicios de este entrenamiento.');
        setShowProgress(false);
        setShowExerciseModal(false);
        setShowWarmupModal(false);
        await loadUserStats();
        return;
      }

      // Validar que el ejercicio actual tiene los datos necesarios
      const currentExercise = exercises[currentExerciseIndex];
      if (!currentExercise || !currentExercise.nombre) {
        console.error('Ejercicio actual no válido:', currentExercise);
        console.error('CurrentExerciseIndex:', currentExerciseIndex, 'Total ejercicios:', exercises.length);
        console.error('Session progress:', sessionProgress);
        alertDialog('Error: Datos del ejercicio no válidos. Por favor, genera un nuevo plan.');
        return;
      }

      setShowPersonalizedMessage(false);
      setShowWarmupModal(false);
      setShowExerciseModal(true);
    } catch (error) {
      console.error('Error en continueTraining:', error);
      alertDialog('Error al continuar el entrenamiento. Intenta generar un nuevo plan.');
    }
  };

  const handleWarmupComplete = useCallback(() => {
    setShowWarmupModal(false);
    setShowExerciseModal(true);
  }, []);

  const handleWarmupSkip = useCallback(() => {
    setShowWarmupModal(false);
    setShowExerciseModal(true);
  }, []);

  const handleExerciseComplete = async (durationSeconds) => {
    if (sending) return;
    setSending(true);
    try {
      const token = tokenManager.getToken();
      const exercise = generatedPlan.plan_entrenamiento.ejercicios[currentExerciseIndex];

      // ⚠️ IMPORTANTE: Solo actualizar duration si el ejercicio ya está completado
      // Si no está completado, usar handleUpdateProgress primero

      console.log(`🏁 Finalizando ejercicio ${currentExerciseIndex + 1}: ${exercise.nombre}`);

      // Recargar progreso actual para tener datos frescos
      await loadSessionProgress(currentSession.id);

      // Verificar estado actual desde la base de datos
      const freshProgressResponse = await fetch(`/api/home-training/sessions/${currentSession.id}/progress`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const freshProgressData = await freshProgressResponse.json();
      const currentExerciseProgress = freshProgressData.exercises?.[currentExerciseIndex];
      const isAlreadyCompleted = currentExerciseProgress?.status === 'completed';

      console.log(`📊 Estado actual del ejercicio ${currentExerciseIndex + 1}:`, {
        status: currentExerciseProgress?.status,
        series: `${currentExerciseProgress?.series_completed}/${currentExerciseProgress?.total_series}`,
        isCompleted: isAlreadyCompleted
      });

      // Validar que el índice esté en rango válido
      const exerciseOrder = currentExerciseIndex;
      const totalExercises = generatedPlan?.plan_entrenamiento?.ejercicios?.length || 0;

      if (exerciseOrder >= totalExercises) {
        console.error(`❌ Error: Intentando actualizar ejercicio ${exerciseOrder} pero solo hay ${totalExercises} ejercicios`);
        console.log(`ℹ️ Ejercicio ya completado, no se requiere actualización adicional`);
        return;
      }

      if (isAlreadyCompleted && durationSeconds) {
        // Solo actualizar duration si ya está completado y hay duración nueva
        console.log(`⏰ Ejercicio ya completado, añadiendo duración: ${durationSeconds}s`);
        await fetch(`/api/home-training/sessions/${currentSession.id}/exercise/${exerciseOrder}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ duration_seconds: durationSeconds })
        });
      } else if (!isAlreadyCompleted) {
        // Completar ejercicio por primera vez
        console.log(`✅ Completando ejercicio por primera vez${durationSeconds ? ` con duración ${durationSeconds}s` : ''}`);
        await fetch(`/api/home-training/sessions/${currentSession.id}/exercise/${exerciseOrder}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            series_completed: exercise.series,
            status: 'completed',
            ...(durationSeconds && { duration_seconds: durationSeconds })
          })
        });
      } else {
        console.log(`ℹ️ Ejercicio ya completado, no se requiere actualización adicional`);
      }

      // Recargar progreso del servidor para mantener UI sincronizada
      console.log('🔄 Recargando progreso después de completar ejercicio...');
      await loadSessionProgress(currentSession.id);
      console.log('✅ Progreso recargado, avanzando al siguiente ejercicio');

      if (currentExerciseIndex < generatedPlan.plan_entrenamiento.ejercicios.length - 1) {
        setCurrentExerciseIndex(currentExerciseIndex + 1);
      } else {
        setShowExerciseModal(false);
        setShowWarmupModal(false);
        setShowPersonalizedMessage(false);
        await loadUserStats();
        setTimeout(() => {
          alertDialog('🎉 ¡Felicitaciones! Has completado todo el entrenamiento. ¡Excelente trabajo!');
        }, 500);
      }
    } catch (error) {
      console.error('Error completing exercise:', error);
      alertDialog('Error al guardar el progreso. Por favor, inténtalo de nuevo.');
    } finally {
      setSending(false);
    }
  };

  // Función para saltar un ejercicio
  const handleExerciseSkip = async () => {
    if (sending) return;
    setSending(true);
    try {
      const token = tokenManager.getToken();

      await fetch(`/api/home-training/sessions/${currentSession.id}/exercise/${currentExerciseIndex}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ series_completed: 0, status: 'skipped' })
      });

      const total = generatedPlan.plan_entrenamiento.ejercicios.length;
      const newPercentage = (sessionProgress.completedExercises.length / total) * 100;

      setSessionProgress({
        ...sessionProgress,
        currentExercise: currentExerciseIndex,
        percentage: newPercentage
      });

      // Refrescar progreso para reflejar estado 'skipped'
      await loadSessionProgress(currentSession.id);

      if (currentExerciseIndex < generatedPlan.plan_entrenamiento.ejercicios.length - 1) {
        setCurrentExerciseIndex(currentExerciseIndex + 1);
      } else {
        setShowExerciseModal(false);
        setShowWarmupModal(false);
        setShowPersonalizedMessage(false);
        alertDialog('Entrenamiento finalizado. Algunos ejercicios fueron saltados.');
      }

      await loadUserStats();
    } catch (error) {
      console.error('Error skipping exercise:', error);
      } finally {
      setSending(false);
    }
  };

  // Función para cancelar un ejercicio
  const handleExerciseCancel = async () => {
    if (sending) return;
    setSending(true);
    try {
      const token = tokenManager.getToken();

      await fetch(`/api/home-training/sessions/${currentSession.id}/exercise/${currentExerciseIndex}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ series_completed: 0, status: 'cancelled' })
      });

      const total = generatedPlan.plan_entrenamiento.ejercicios.length;
      const newPercentage = (sessionProgress.completedExercises.length / total) * 100;

      setSessionProgress({
        ...sessionProgress,
        currentExercise: currentExerciseIndex,
        percentage: newPercentage
      });

      // Refrescar progreso para reflejar estado 'cancelled'
      await loadSessionProgress(currentSession.id);

      if (currentExerciseIndex < generatedPlan.plan_entrenamiento.ejercicios.length - 1) {
        setCurrentExerciseIndex(currentExerciseIndex + 1);
      } else {
        setShowExerciseModal(false);
        setShowWarmupModal(false);
        setShowPersonalizedMessage(false);
        alertDialog('Entrenamiento finalizado. Algunos ejercicios fueron cancelados.');
      }

      await loadUserStats();
    } catch (error) {
      console.error('Error cancelling exercise:', error);
    } finally {
      setSending(false);
    }
  };

  // Función para actualizar progreso durante el ejercicio
  const handleUpdateProgress = async (exerciseIndex, seriesCompleted, totalSeries, durationSeconds) => {
    if (sendingProgress) return;
    setSendingProgress(true);
    try {
      const token = tokenManager.getToken();
      const status = seriesCompleted === totalSeries ? 'completed' : 'in_progress';
      const exerciseName = generatedPlan?.plan_entrenamiento?.ejercicios?.[exerciseIndex]?.nombre || `Ejercicio ${exerciseIndex + 1}`;

      console.log(`📈 Actualizando progreso: ${exerciseName} - ${seriesCompleted}/${totalSeries} series (${status})${durationSeconds ? ` - ${durationSeconds}s` : ''}`);

      await fetch(`/api/home-training/sessions/${currentSession.id}/exercise/${exerciseIndex}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          series_completed: seriesCompleted,
          status,
          ...(durationSeconds && { duration_seconds: durationSeconds })
        })
      });

      // Refrescar stats tras cada ejercicio actualizado
      await loadUserStats();

      if (seriesCompleted === totalSeries && !sessionProgress.completedExercises.includes(exerciseIndex)) {
        const newCompletedExercises = [...sessionProgress.completedExercises, exerciseIndex];
        const total = generatedPlan.plan_entrenamiento.ejercicios.length;
        const newPercentage = (newCompletedExercises.length / total) * 100;

        setSessionProgress({
          ...sessionProgress,
          completedExercises: newCompletedExercises,
          percentage: newPercentage
        });
      }
    } catch (error) {
      console.error('Error updating progress:', error);
    } finally {
      setSendingProgress(false);
    }
  };

  return {
    // trace
    track,
    // estado de selección / UI
    mousePosition,
    selectedEquipment,
    setSelectedEquipment,
    selectedTrainingType,
    setSelectedTrainingType,
    isGenerating,
    showPersonalizedMessage,
    personalizedMessage,
    generatedPlan,
    // estado de sesión
    currentSession,
    showExerciseModal,
    setShowExerciseModal,
    showWarmupModal,
    currentExerciseIndex,
    sessionProgress,
    exercisesProgress,
    userStats,
    showProgress,
    showRejectionModal,
    setShowRejectionModal,
    showPreferencesHistory,
    setShowPreferencesHistory,
    // handlers
    resetToInitialState,
    cancelRoutineCompletely,
    loadSessionProgress,
    generateTraining,
    proceedToGenerating,
    handleExerciseRejections,
    handleSkipRejection,
    regenerateWithRejectionModal,
    startTraining,
    continueTraining,
    handleWarmupComplete,
    handleWarmupSkip,
    handleExerciseComplete,
    handleExerciseSkip,
    handleExerciseCancel,
    handleUpdateProgress
  };
}
