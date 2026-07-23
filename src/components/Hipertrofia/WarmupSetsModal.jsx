import { confirmDialog } from '../ui/dialogService.jsx';
import React, { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle, Timer, TrendingUp } from 'lucide-react';
import { useTrace } from '../../contexts/TraceContext';

/**
 * Modal de Series de Aproximación/Calentamiento
 * Implementación según teoría MindFeed v1.0
 */
const WarmupSetsModal = ({
  isOpen,
  onClose,
  exerciseName,
  targetWeight,
  userLevel = 'Principiante',
  onComplete
}) => {
  const { track } = useTrace();
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [completedSets, setCompletedSets] = useState([]);
  const [isResting, setIsResting] = useState(false);
  const [restTimer, setRestTimer] = useState(0);

  // Trace: apertura del modal
  useEffect(() => {
    if (isOpen) {
      track('warmup_modal_opened', {
        exerciseName,
        targetWeight,
        userLevel,
        component: 'WarmupSetsModal'
      });
    }
  }, [isOpen, exerciseName, targetWeight, userLevel, track]);

  // Configuración de series según nivel (teoría MindFeed)
  const warmupConfig = {
    Principiante: [
      { percentage: 40, reps: 8, rest: 30, description: 'Activación neuromuscular' },
      { percentage: 60, reps: 5, rest: 45, description: 'Preparación articular' }
    ],
    Intermedio: [
      { percentage: 40, reps: 6, rest: 30, description: 'Activación inicial' },
      { percentage: 65, reps: 3, rest: 60, description: 'Aproximación a carga' }
    ],
    Avanzado: [
      { percentage: 50, reps: 4, rest: 45, description: 'Activación rápida' },
      { percentage: 70, reps: 2, rest: 60, description: 'Pre-activación máxima' }
    ]
  };

  const currentWarmupSets = warmupConfig[userLevel] || warmupConfig.Principiante;
  const currentSet = currentWarmupSets[currentSetIndex];

  // Timer para descansos
  useEffect(() => {
    let interval;
    if (isResting && restTimer > 0) {
      interval = setInterval(() => {
        setRestTimer(prev => {
          if (prev <= 1) {
            setIsResting(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isResting, restTimer]);

  const handleSetComplete = () => {
    const completedSet = {
      ...currentSet,
      weight: (targetWeight * currentSet.percentage / 100).toFixed(1),
      completedAt: new Date().toISOString()
    };

    track('warmup_set_completed', {
      exerciseName,
      setIndex: currentSetIndex + 1,
      totalSets: currentWarmupSets.length,
      weight: completedSet.weight,
      percentage: currentSet.percentage,
      reps: currentSet.reps,
      userLevel,
      component: 'WarmupSetsModal'
    });

    setCompletedSets([...completedSets, completedSet]);

    if (currentSetIndex < currentWarmupSets.length - 1) {
      // Iniciar descanso
      track('warmup_rest_started', {
        exerciseName,
        restSeconds: currentSet.rest,
        nextSetIndex: currentSetIndex + 2,
        component: 'WarmupSetsModal'
      });

      setIsResting(true);
      setRestTimer(currentSet.rest);

      // Esperar al final del descanso para avanzar
      setTimeout(() => {
        setCurrentSetIndex(currentSetIndex + 1);
      }, currentSet.rest * 1000);
    } else {
      // Calentamiento completo
      handleWarmupComplete();
    }
  };

  const handleWarmupComplete = () => {
    track('warmup_completed', {
      exerciseName,
      totalSets: currentWarmupSets.length,
      completedSets: completedSets.length,
      userLevel,
      duration: new Date() - new Date(completedSets[0]?.completedAt || new Date()),
      component: 'WarmupSetsModal'
    });

    if (onComplete) {
      onComplete({
        sets: completedSets,
        totalSets: currentWarmupSets.length,
        timestamp: new Date().toISOString()
      });
    }
    onClose();
  };

  const handleSkip = async () => {
    track('warmup_skip_attempted', {
      exerciseName,
      userLevel,
      component: 'WarmupSetsModal'
    });

    if (await confirmDialog({
      title: 'Saltar calentamiento',
      description: '¿Seguro que quieres saltar el calentamiento? Esto aumenta el riesgo de lesión.',
      confirmText: 'Saltar',
      destructive: true
    })) {
      track('warmup_skipped', {
        exerciseName,
        userLevel,
        reason: 'user_confirmed_skip',
        component: 'WarmupSetsModal'
      });
      onClose();
    } else {
      track('warmup_skip_cancelled', {
        exerciseName,
        userLevel,
        reason: 'user_cancelled_skip',
        component: 'WarmupSetsModal'
      });
    }
  };

  if (!isOpen) return null;

  const currentWeight = (targetWeight * currentSet.percentage / 100).toFixed(1);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b sticky top-0 bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Series de Aproximación</h2>
            <button
              onClick={() => {
                track('warmup_modal_closed', {
                  exerciseName,
                  userLevel,
                  completedSets: completedSets.length,
                  currentSetIndex: currentSetIndex + 1,
                  reason: 'user_closed_modal',
                  component: 'WarmupSetsModal'
                });
                onClose();
              }}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Precalentamiento específico para {exerciseName}
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Progress indicator */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Serie {currentSetIndex + 1} de {currentWarmupSets.length}
              </span>
              <span className="text-sm text-gray-500">
                Nivel: {userLevel}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${((currentSetIndex + 1) / currentWarmupSets.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Rest Timer */}
          {isResting && (
            <div className="mb-6 p-4 bg-yellow-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Timer className="h-5 w-5 text-yellow-600" />
                  <span className="font-medium text-yellow-900">Descansando...</span>
                </div>
                <span className="text-2xl font-bold text-yellow-900">
                  {restTimer}s
                </span>
              </div>
              <p className="text-sm text-yellow-700 mt-1">
                Prepárate para la siguiente serie
              </p>
            </div>
          )}

          {/* Current Set Info */}
          {!isResting && (
            <div className="space-y-4">
              {/* Set details card */}
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg text-blue-900">
                      Serie {currentSetIndex + 1}
                    </h3>
                    <p className="text-sm text-blue-700 mt-1">
                      {currentSet.description}
                    </p>
                  </div>
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                </div>
                
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="bg-white rounded p-3 text-center">
                    <div className="text-2xl font-bold text-blue-900">
                      {currentWeight}
                    </div>
                    <div className="text-xs text-gray-600">kg</div>
                  </div>
                  <div className="bg-white rounded p-3 text-center">
                    <div className="text-2xl font-bold text-blue-900">
                      {currentSet.reps}
                    </div>
                    <div className="text-xs text-gray-600">reps</div>
                  </div>
                  <div className="bg-white rounded p-3 text-center">
                    <div className="text-2xl font-bold text-blue-900">
                      {currentSet.percentage}%
                    </div>
                    <div className="text-xs text-gray-600">1RM</div>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-gray-700">
                    <p className="font-medium mb-1">Instrucciones:</p>
                    <ul className="space-y-1">
                      <li>• Realiza el movimiento de forma controlada</li>
                      <li>• No busques fatiga, solo activación</li>
                      <li>• Mantén la técnica perfecta</li>
                      <li>• No cuentan como trabajo efectivo</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={handleSetComplete}
                  className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <CheckCircle className="h-5 w-5" />
                  <span>Serie Completada</span>
                </button>
              </div>
            </div>
          )}

          {/* Completed sets summary */}
          {completedSets.length > 0 && (
            <div className="mt-6 pt-6 border-t">
              <h4 className="text-sm font-medium text-gray-700 mb-3">
                Series completadas
              </h4>
              <div className="space-y-2">
                {completedSets.map((set, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Serie {index + 1}</span>
                    <span className="font-medium">
                      {(targetWeight * set.percentage / 100).toFixed(1)} kg × {set.reps} reps
                    </span>
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50">
          <div className="flex items-center justify-between">
            <button
              onClick={handleSkip}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Saltar calentamiento (no recomendado)
            </button>
            {currentSetIndex === currentWarmupSets.length - 1 && !isResting && (
              <span className="text-sm text-green-600 font-medium">
                Última serie de calentamiento
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WarmupSetsModal;