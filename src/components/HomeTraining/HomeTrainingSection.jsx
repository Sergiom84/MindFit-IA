import { ArrowLeft, Home, Dumbbell, Target, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, memo, useCallback, useMemo, useRef } from 'react';
import HomeTrainingExerciseModal from './HomeTrainingExerciseModal';
import HomeTrainingProgress from './HomeTrainingProgress';
import HomeTrainingPlanModal from './HomeTrainingPlanModal';
import HomeTrainingRejectionModal from './HomeTrainingRejectionModal';
import HomeTrainingPreferencesHistory from './HomeTrainingPreferencesHistory';
import HomeTrainingWarmupModal from './HomeTrainingWarmupModal';
import UserEquipmentSummaryCard from './UserEquipmentSummaryCard';
import logger from '../../utils/logger';
import { useTrace } from '../../contexts/TraceContext';
import useCycleAdjustment from '../../hooks/useCycleAdjustment';
import { CycleAlert } from '../MenstrualCycle';


const HomeTrainingSection = () => {
  const navigate = useNavigate();
  const { track } = useTrace();
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [selectedTrainingType, setSelectedTrainingType] = useState(null);
  
  // Hook para ajustes del ciclo menstrual (solo mujeres)
  const cycleAdjustment = useCycleAdjustment();
  const cycleAlert = cycleAdjustment.getAlert();

  // Leer selección desde UserEquipmentSummaryCard
  useEffect(() => {
    if (sessionStorage.getItem('selectPersonalizedEquipment') === '1') {
      setSelectedEquipment('usar_este_equipamiento');
      sessionStorage.removeItem('selectPersonalizedEquipment');
    }
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

  // Refs para evitar loops infinitos en tracking
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

  const [sendingProgress, setSendingProgress] = useState(false);
  // Modal de rechazo de ejercicios
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [pendingRegenerateAfterRejection, setPendingRegenerateAfterRejection] = useState(false);
  // Vista de historial de preferencias
  const [showPreferencesHistory, setShowPreferencesHistory] = useState(false);

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
      const token = localStorage.getItem('token');
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

  // Cargar datos al inicializar el componente
  useEffect(() => {
    loadCurrentPlan();
    loadUserStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🛡️ PROTECCIÓN: Detección de abandono de sesión
  useEffect(() => {
    if (!currentSession) return;

    const handleBeforeUnload = (event) => {
      // Solo si hay una sesión activa y progreso sin guardar
      if (currentSession && (showExerciseModal || (exercisesProgress && exercisesProgress.length > 0))) {
        logger.info('Usuario abandonando sesión, guardando progreso', null, 'HomeTraining');

        // Usar sendBeacon para envío asíncrono confiable
        const token = localStorage.getItem('token');
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

      const token = localStorage.getItem('token');

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
  }, [currentSession, showExerciseModal, exercisesProgress]);

  // Función para cargar el plan actual del usuario
  const loadCurrentPlan = async () => {
    try {
      const token = localStorage.getItem('token');
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
  };

  // Función para cargar estadísticas del usuario
  const loadUserStats = async () => {
    try {
      const token = localStorage.getItem('token');
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
  };

  // Función para cargar el progreso de la sesión
  const loadSessionProgress = async (sessionId) => {
    try {
      const token = localStorage.getItem('token');
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
  };

  // Función para generar entrenamiento con IA
  const generateTraining = async () => {
    if (!selectedEquipment || !selectedTrainingType) return;

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        alert('Debes iniciar sesión para generar tu entrenamiento');
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
      alert('Error al generar el entrenamiento. Por favor, inténtalo de nuevo.');
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
      const token = localStorage.getItem('token');
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
      const token = localStorage.getItem('token');
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
      const token = localStorage.getItem('token');
      if (!token) {
        alert('Debes iniciar sesión para guardar preferencias');
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
      alert('Error al guardar las preferencias. Por favor, inténtalo de nuevo.');
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
      const token = localStorage.getItem('token');
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
      alert('Error al regenerar el plan. Por favor, inténtalo de nuevo.');
    }
  };

  // Función para generar nuevo plan después del rechazo
  const generateNewPlanAfterRejection = async () => {
    if (!selectedEquipment || !selectedTrainingType) {
      alert('Error: No se encontró la configuración del entrenamiento');
      return;
    }

    setPendingRegenerateAfterRejection(false);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        alert('Debes iniciar sesión para generar tu entrenamiento');
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
      alert('Error al generar el entrenamiento. Por favor, inténtalo de nuevo.');
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
      const token = localStorage.getItem('token');
      if (!token) {
        alert('Debes iniciar sesión para comenzar el entrenamiento');
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
        alert('No se encontró un plan de entrenamiento');
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
      alert('Error al iniciar el entrenamiento');
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
          alert('Error: No se encontró el plan de entrenamiento. Por favor, genera uno nuevo.');
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
        alert('Felicitaciones! Has completado todos los ejercicios de este entrenamiento.');
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
        alert('Error: Datos del ejercicio no válidos. Por favor, genera un nuevo plan.');
        return;
      }

      setShowPersonalizedMessage(false);
      setShowWarmupModal(false);
      setShowExerciseModal(true);
    } catch (error) {
      console.error('Error en continueTraining:', error);
      alert('Error al continuar el entrenamiento. Intenta generar un nuevo plan.');
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
      const token = localStorage.getItem('token');
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
          alert('🎉 ¡Felicitaciones! Has completado todo el entrenamiento. ¡Excelente trabajo!');
        }, 500);
      }
    } catch (error) {
      console.error('Error completing exercise:', error);
      alert('Error al guardar el progreso. Por favor, inténtalo de nuevo.');
    } finally {
      setSending(false);
    }
  };

  // Función para saltar un ejercicio
  const handleExerciseSkip = async () => {
    if (sending) return;
    setSending(true);
    try {
      const token = localStorage.getItem('token');

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
        alert('Entrenamiento finalizado. Algunos ejercicios fueron saltados.');
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
      const token = localStorage.getItem('token');

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
        alert('Entrenamiento finalizado. Algunos ejercicios fueron cancelados.');
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
      const token = localStorage.getItem('token');
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

  const equipmentTypes = [
    {
      id: 'minimo',
      title: 'Equipamiento Mínimo',
      icon: Home,
      equipment: ['Peso corporal', 'Toallas', 'Silla/Sofá', 'Pared'],
      exercises: [], // Ejercicios generados por IA según perfil
      borderColor: 'border-green-500'
    },
    {
      id: 'basico',
      title: 'Equipamiento Básico',
      icon: Target,
      equipment: ['Mancuernas ajustables', 'Bandas elásticas', 'Esterilla', 'Banco/Step'],
      exercises: [], // Ejercicios generados por IA según perfil
      borderColor: 'border-blue-500'
    },
    {
      id: 'avanzado',
      title: 'Equipamiento Avanzado',
      icon: Dumbbell,
      equipment: ['Barra dominadas', 'Kettlebells', 'TRX', 'Discos olímpicos'],
      exercises: [], // Ejercicios generados por IA según perfil
      borderColor: 'border-purple-500'
    }
  ];

  const trainingTypes = [
    { id: 'funcional', title: 'Funcional' },
    { id: 'hiit', title: 'HIIT' },
    { id: 'fuerza', title: 'Fuerza' }
  ];

  const trainingGuides = {
    funcional: {
      title: 'Guías para FUNCIONAL',
      points: [
        'Prioriza patrones: sentadilla, bisagra de cadera, zancada, empuje, tracción, rotación/antirrotación.',
        'Incluye varios planos de movimiento y trabajo unilateral/balance.',
        'Formato circuito/EMOM: 4–6 ejercicios, 30–45 s o 8–12 reps, 30–60 s descanso.',
        'Core integrado en la mayoría de ejercicios.'
      ]
    },
    hiit: {
      title: 'Guías para HIIT',
      points: [
        'Incluye calentamiento 5–10 min y vuelta a la calma 5–10 min.',
        'Intervalos de 15 s a 4 min a alta intensidad (~RPE 8–9).',
        'Relación trabajo/descanso: 1:1 a 1:2 según nivel.',
        'Volumen de alta intensidad total 10–20 min en sesión de 20–35 min.',
        'Varía el tipo de intervalos (Tabata, EMOM, bloques 30/30, 40/20…).'
      ]
    },
    fuerza: {
      title: 'Guías para FUERZA',
      points: [
        'Prioriza multiarticulares; luego accesorios.',
        'Rangos para fuerza: ≤6 reps, 2–6 series; descanso 2–5 min.',
        'Sin 1RM, usa RPE 7–9 o cargas que permitan 3–6 reps exigentes.',
        'Accesorios a 6–12 reps, 60–90 s descanso cuando aplique.'
      ]
    }
  };

  // Si está mostrando el historial de preferencias, renderizar solo ese componente
  if (showPreferencesHistory) {
    return (
      <HomeTrainingPreferencesHistory
        onBack={() => setShowPreferencesHistory(false)}
      />
    );
  }

  return (
    <div className="min-h-screen text-white">
      <div className="container mx-auto px-6 py-8">
        {/* Header con navegación */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate('/')}
            className="flex items-center text-gray-300 hover:text-white transition-colors duration-200"
          >
            <ArrowLeft size={24} className="mr-2" />
            Volver al inicio
          </button>

          {/* Botón de historial de preferencias */}
          <button
            onClick={() => setShowPreferencesHistory(true)}
            className="flex items-center text-yellow-400 hover:text-yellow-300 transition-colors duration-200 bg-yellow-400/10 hover:bg-yellow-400/20 px-4 py-2 rounded-lg border border-yellow-400/30"
          >
            <BarChart3 size={20} className="mr-2" />
            Mis Preferencias
          </button>
        </div>

        {/* Título principal */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-yellow-400">
            Entrenamiento en Casa
          </h1>
          <p className="text-lg text-gray-300 max-w-4xl mx-auto">
            Modalidad multifuncional diseñada para maximizar resultados con el equipamiento
            que tengas disponible, adaptándose a tu espacio y nivel.
          </p>
        </div>

        {/* Alerta de ajuste del ciclo menstrual (solo para mujeres con config) */}
        {cycleAlert && (
          <div className="max-w-4xl mx-auto mb-8">
            <CycleAlert alert={cycleAlert} />
          </div>
        )}

        {/* Tarjetas de equipamiento */}
        <div className="grid md:grid-cols-2 gap-6 max-w-6xl mx-auto mb-8">
          {equipmentTypes.map((equipment) => (
            <div
              key={equipment.id}
              data-trace="equipment-card"
              data-trace-id={equipment.id}
              data-trace-label={equipment.title}
              onClick={() => {
                setSelectedEquipment(equipment.id);
                try {
                  track('CARD_CLICK', { id: equipment.id, title: equipment.title, group: 'equipment' }, { component: 'HomeTrainingSection' });
                } catch {
                  // Ignore tracking errors
                }
              }}
              className={`bg-gray-800/50 backdrop-blur-sm border-2 rounded-2xl p-6 cursor-pointer transition-all duration-200 hover:bg-gray-800/70 ${
                selectedEquipment === equipment.id
                  ? `${equipment.borderColor} bg-gray-800/80`
                  : 'border-gray-700'
              }`}
            >
              <div className="flex items-center mb-4">
                <equipment.icon size={24} className="text-white mr-3" />
                <h3 className="text-lg font-semibold text-white">{equipment.title}</h3>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-300 mb-2">Equipamiento:</p>
                <div className="flex flex-wrap gap-1">
                  {equipment.equipment.map((item, idx) => (
                    <span key={idx} className="text-xs bg-gray-700/50 text-gray-300 px-2 py-1 rounded">
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-300 mb-2">Ejercicios ejemplo:</p>
                <div className="space-y-1">
                  {equipment.exercises.map((exercise, idx) => (
                    <div key={idx} className="flex items-center text-xs text-gray-400">
                      <span className="w-1 h-1 bg-green-400 rounded-full mr-2"></span>
                      {exercise}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <div
              data-trace="equipment-card"
              data-trace-id="personalizado"
              data-trace-label="Usar mi equipamiento"
              onClick={() => {
                setSelectedEquipment('personalizado');
                try {
                  track('CARD_CLICK', { id: 'personalizado', title: 'Usar mi equipamiento', group: 'equipment' }, { component: 'HomeTrainingSection' });
                } catch {
                  // Ignore tracking errors
                }
              }}
              className={`bg-gray-800/50 backdrop-blur-sm border-2 rounded-2xl p-6 cursor-pointer transition-all duration-200 hover:bg-gray-800/70 ${
                selectedEquipment === 'personalizado'
                  ? `border-yellow-500 bg-gray-800/80`
                  : 'border-gray-700'
              }`}
            >
              <div className="flex items-center mb-4">
                <Dumbbell size={24} className="text-white mr-3" />
                <h3 className="text-lg font-semibold text-white">Usar mi equipamiento</h3>
              </div>

              <div className="mb-4 text-center">
                <p className="text-sm text-gray-300 mb-2">Equipamiento:</p>
                <UserEquipmentSummaryCard />
              </div>

            </div>
        </div>

        {/* Fila de tipos de entrenamiento */}
        <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto mb-8">
          {trainingTypes.map((type) => (
            <button
              key={type.id}
              data-trace="training-type"
              data-trace-id={type.id}
              data-trace-label={type.title}
              onClick={() => {
                setSelectedTrainingType(type.id);
                try {
                  track('TAB_CLICK', { id: type.id, title: type.title, group: 'training-type' }, { component: 'HomeTrainingSection' });
                } catch {
                  // Ignore tracking errors
                }
              }}
              className={`py-3 px-6 rounded-lg font-semibold transition-all duration-200 ${
                selectedTrainingType === type.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50'
              }`}
            >
              {type.title}
            </button>
          ))}
        </div>

        {/* Tarjeta informativa */}
        {selectedTrainingType && (
          <div className="max-w-4xl mx-auto mb-8">
            <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-2xl p-6">
              <h3 className="text-xl font-semibold text-white mb-4">
                {trainingGuides[selectedTrainingType].title}
              </h3>
              <ul className="space-y-3">
                {trainingGuides[selectedTrainingType].points.map((point, idx) => (
                  <li key={idx} className="flex items-start text-gray-300">
                    <span className="w-2 h-2 bg-yellow-400 rounded-full mr-3 mt-2 flex-shrink-0"></span>
                    <span className="text-sm leading-relaxed">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Tarjeta de generar entrenamiento */}
        {selectedEquipment && selectedTrainingType && !isGenerating && !generatedPlan && (
          <div className="max-w-4xl mx-auto mb-8">
            <div className="bg-gray-800/70 backdrop-blur-sm border border-gray-600 rounded-2xl p-6 text-center">
              <h3 className="text-xl font-semibold text-white mb-3">
                Generar Entrenamiento Personalizado
              </h3>
              <p className="text-gray-300 mb-6">
                Basado en tu equipamiento: <span className="text-yellow-400 font-semibold">
                  {selectedEquipment === 'personalizado' || selectedEquipment === 'usar_este_equipamiento' ? 'Mi equipamiento' : (equipmentTypes.find(eq => eq.id === selectedEquipment)?.title || '')}
                </span> y tipo de entrenamiento: <span className="text-yellow-400 font-semibold">
                  {trainingTypes.find(type => type.id === selectedTrainingType)?.title}
                </span>
              </p>
              <button
                onClick={generateTraining}
                disabled={isGenerating}
                className="bg-yellow-400 hover:bg-yellow-500 disabled:opacity-60 disabled:cursor-not-allowed text-black font-semibold py-3 px-8 rounded-lg transition-colors duration-200 flex items-center mx-auto"
              >
                {isGenerating ? (
                  <div className="w-4 h-4 border-2 border-black/60 border-t-transparent rounded-full animate-spin mr-2" />
                ) : (
                  <Target size={20} className="mr-2" />
                )}
                Generar Mi Entrenamiento
              </button>
            </div>
          </div>
        )}

        {/* Modal de mensaje personalizado (Paso 3) */}
        {showPersonalizedMessage && !showProgress && !showExerciseModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800 border border-gray-600 rounded-2xl p-8 max-w-2xl mx-4">
              <div className="text-center">
                <div className="w-16 h-16 bg-yellow-400/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Target size={32} className="text-yellow-400" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-4">
                  ¡Tu Entrenamiento Está Listo!
                </h3>
                <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-lg p-4 mb-6">
                  <p className="text-yellow-100 leading-relaxed">{personalizedMessage}</p>
                </div>
                <button
                  onClick={proceedToGenerating}
                  className="bg-yellow-400 hover:bg-yellow-500 text-black font-semibold py-3 px-8 rounded-lg transition-colors duration-200"
                >
                  Ver Mi Plan de Entrenamiento
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de carga (Paso 4) */}
        {isGenerating && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-black/90 border border-yellow-400/30 rounded-lg p-8 text-center shadow-xl">
              <svg className="w-12 h-12 text-yellow-400 animate-spin mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
              </svg>
              <p className="text-white font-semibold text-lg">La IA está generando tu entrenamiento</p>
              <p className="text-gray-400 text-sm mt-2">Analizando tu perfil para crear la rutina idónea…</p>
            </div>
          </div>
        )}

        {/* Mostrar progreso si hay un plan activo */}
        {showProgress && generatedPlan && !showExerciseModal && (
          <HomeTrainingProgress
            currentPlan={{
              ...generatedPlan.plan_entrenamiento,
              equipment_type: selectedEquipment,
              training_type: selectedTrainingType,
              user_profile: generatedPlan.plan_entrenamiento.perfil_usuario,
              estimated_duration: generatedPlan.plan_entrenamiento.duracion_estimada_min,
              exercises: generatedPlan.plan_entrenamiento.ejercicios
            }}
            sessionExercises={exercisesProgress}
            progress={sessionProgress}
            userStats={userStats}
            onContinueTraining={
              currentSession?.status === 'completed' || sessionProgress?.percentage >= 100
                ? startTraining
                : currentSession
                  ? continueTraining
                  : startTraining
            }
            onGenerateNewPlan={regenerateWithRejectionModal}
            onCancelAll={cancelRoutineCompletely}
            onGenerateNewAfterCompleted={resetToInitialState}
          />
        )}

        {/* Modal de resultado */}
        {generatedPlan && !showProgress && (
          <HomeTrainingPlanModal
            plan={generatedPlan.plan_entrenamiento}
            planSource={generatedPlan.plan_source}
            personalizedMessage={generatedPlan.mensaje_personalizado}
            onStart={startTraining}
            onGenerateAnother={regenerateWithRejectionModal}
            onClose={resetToInitialState}
            onCancel={cancelRoutineCompletely}
          />
        )}

        {showWarmupModal && (
          <HomeTrainingWarmupModal
            isOpen={showWarmupModal}
            trainingType={selectedTrainingType || generatedPlan?.plan_entrenamiento?.tipoEntrenamiento || 'funcional'}
            level={userStats?.training_level || userStats?.nivel_entrenamiento || userStats?.level || 'intermedio'}
            onSkip={handleWarmupSkip}
            onComplete={handleWarmupComplete}
            onClose={handleWarmupSkip}
          />
        )}

        {/* Modal de ejercicio individual */}
        {showExerciseModal &&
         generatedPlan &&
         generatedPlan.plan_entrenamiento.ejercicios &&
         generatedPlan.plan_entrenamiento.ejercicios[currentExerciseIndex] && (
          <HomeTrainingExerciseModal
            exercise={generatedPlan.plan_entrenamiento.ejercicios[currentExerciseIndex]}
            exerciseIndex={currentExerciseIndex}
            totalExercises={generatedPlan.plan_entrenamiento.ejercicios.length}
            isLastExercise={currentExerciseIndex >= generatedPlan.plan_entrenamiento.ejercicios.length - 1}
            onComplete={handleExerciseComplete}
            onSkip={handleExerciseSkip}
            onCancel={handleExerciseCancel}
            onClose={() => setShowExerciseModal(false)}
            onUpdateProgress={handleUpdateProgress}
            overrideSeriesTotal={exercisesProgress?.[currentExerciseIndex]?.total_series}
            sessionId={currentSession?.id}
            onFeedbackSubmitted={() => currentSession?.id && loadSessionProgress(currentSession.id)}
          />
        )}

        {/* Modal de rechazo de ejercicios */}
        {showRejectionModal && generatedPlan && generatedPlan.plan_entrenamiento?.ejercicios && (
          <HomeTrainingRejectionModal
            exercises={generatedPlan.plan_entrenamiento.ejercicios}
            equipmentType={selectedEquipment}
            trainingType={selectedTrainingType}
            onReject={handleExerciseRejections}
            onSkip={handleSkipRejection}
            onClose={() => setShowRejectionModal(false)}
          />
        )}
      </div>
    </div>
  );
};

export default memo(HomeTrainingSection);
