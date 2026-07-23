import { confirmDialog, alertDialog } from '../ui/dialogService.jsx';
import React, { useState, useEffect, useCallback } from 'react';
import { Target, TrendingUp, Clock, AlertCircle, CheckCircle, X, Info } from 'lucide-react';
import { useTrace } from '../../contexts/TraceContext';
import tokenManager from '../../utils/tokenManager';

/**
 * Panel de Priorización Muscular
 * Implementación según metodología MindFeed v2.0
 * - 2-3 semanas de priorización
 * - Top set adicional a 82.5%
 * - Solo 1 músculo a la vez
 */
const MusclePriorityPanel = ({
  userId,
  onPriorityChange,
  userLevel = 'Principiante'
}) => {
  const { track } = useTrace();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMuscle, setSelectedMuscle] = useState(null);
  const [priorityStatus, setPriorityStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(null);

  // Trace: montaje del panel
  useEffect(() => {
    track('muscle_priority_panel_mounted', {
      userId,
      userLevel,
      component: 'MusclePriorityPanel'
    });
  }, [userId, userLevel, track]);

  // Grupos musculares disponibles para priorización
  const muscleGroups = [
    { id: 'pecho', name: 'Pecho', icon: '💪', description: 'Press y aperturas' },
    { id: 'espalda', name: 'Espalda', icon: '🏋️', description: 'Dorsales y romboides' },
    { id: 'piernas', name: 'Piernas', icon: '🦵', description: 'Cuádriceps y femorales' },
    { id: 'hombros', name: 'Hombros', icon: '⚡', description: 'Deltoides completo' },
    { id: 'biceps', name: 'Bíceps', icon: '💨', description: 'Flexores del brazo' },
    { id: 'triceps', name: 'Tríceps', icon: '🎯', description: 'Extensores del brazo' },
    { id: 'gluteos', name: 'Glúteos', icon: '🔥', description: 'Cadena posterior' }
  ];

  const fetchPriorityStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/hipertrofia/priority-status/${userId}`, {
        headers: {
          'Authorization': `Bearer ${tokenManager.getToken()}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setPriorityStatus(data.priority);
      }
    } catch (error) {
      console.error('Error obteniendo estado de prioridad:', error);
    }
  }, [userId]);

  // Cargar estado de prioridad actual
  useEffect(() => {
    if (userId) {
      fetchPriorityStatus();
    }
  }, [userId, fetchPriorityStatus]);

  // Actualizar tiempo restante
  useEffect(() => {
    if (priorityStatus?.priority_started_at) {
      const startDate = new Date(priorityStatus.priority_started_at);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 21); // 3 semanas máximo

      const timer = setInterval(() => {
        const now = new Date();
        const remaining = endDate - now;

        if (remaining > 0) {
          const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
          const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          setTimeRemaining({ days, hours });
        } else {
          setTimeRemaining(null);
          clearInterval(timer);
        }
      }, 60000); // Actualizar cada minuto

      return () => clearInterval(timer);
    }
  }, [priorityStatus]);


  const handleActivatePriority = async () => {
    if (!selectedMuscle) {
      track('muscle_priority_activate_no_selection', {
        userId,
        component: 'MusclePriorityPanel'
      });
      alertDialog('Selecciona un grupo muscular');
      return;
    }

    track('muscle_priority_activate_start', {
      userId,
      selectedMuscle,
      userLevel,
      component: 'MusclePriorityPanel'
    });

    setLoading(true);
    try {
      const response = await fetch('/api/hipertrofia/activate-priority', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenManager.getToken()}`
        },
        body: JSON.stringify({
          muscleGroup: selectedMuscle
        })
      });

      const data = await response.json();
      if (data.success) {
        track('muscle_priority_activate_success', {
          userId,
          selectedMuscle,
          priorityId: data.id,
          component: 'MusclePriorityPanel'
        });

        setPriorityStatus(data);
        setIsModalOpen(false);
        if (onPriorityChange) {
          onPriorityChange(selectedMuscle);
        }
        fetchPriorityStatus(); // Refrescar estado
      } else {
        track('muscle_priority_activate_error', {
          userId,
          selectedMuscle,
          error: data.error,
          component: 'MusclePriorityPanel'
        });
        alertDialog(data.error || 'Error activando prioridad');
      }
    } catch (error) {
      track('muscle_priority_activate_exception', {
        userId,
        selectedMuscle,
        error: error.message,
        component: 'MusclePriorityPanel'
      });
      console.error('Error:', error);
      alertDialog('Error al activar prioridad');
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivatePriority = async () => {
    track('muscle_priority_deactivate_confirm_prompt', {
      userId,
      activeMuscle: priorityStatus?.priority_muscle,
      component: 'MusclePriorityPanel'
    });

    if (!(await confirmDialog({
      title: 'Desactivar priorización',
      description: '¿Seguro que quieres desactivar la priorización actual?',
      confirmText: 'Desactivar'
    }))) {
      track('muscle_priority_deactivate_cancelled', {
        userId,
        activeMuscle: priorityStatus?.priority_muscle,
        component: 'MusclePriorityPanel'
      });
      return;
    }

    track('muscle_priority_deactivate_start', {
      userId,
      activeMuscle: priorityStatus?.priority_muscle,
      microcyclesCompleted: priorityStatus?.priority_microcycles_completed,
      component: 'MusclePriorityPanel'
    });

    setLoading(true);
    try {
      const response = await fetch('/api/hipertrofia/deactivate-priority', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenManager.getToken()}`
        }
      });

      const data = await response.json();
      if (data.success) {
        track('muscle_priority_deactivate_success', {
          userId,
          previouslyActiveMuscle: priorityStatus?.priority_muscle,
          component: 'MusclePriorityPanel'
        });

        setPriorityStatus(null);
        if (onPriorityChange) {
          onPriorityChange(null);
        }
      } else {
        track('muscle_priority_deactivate_error', {
          userId,
          activeMuscle: priorityStatus?.priority_muscle,
          error: data.error,
          component: 'MusclePriorityPanel'
        });
      }
    } catch (error) {
      track('muscle_priority_deactivate_exception', {
        userId,
        activeMuscle: priorityStatus?.priority_muscle,
        error: error.message,
        component: 'MusclePriorityPanel'
      });
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Panel principal cuando hay prioridad activa
  if (priorityStatus?.priority_muscle && !isModalOpen) {
    const activeMuscle = muscleGroups.find(m => m.id === priorityStatus.priority_muscle);

    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Target className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Prioridad Muscular Activa</h3>
          </div>
          <button
            onClick={() => {
              track('muscle_priority_deactivate_button_clicked', {
                userId,
                activeMuscle: priorityStatus?.priority_muscle,
                microcyclesCompleted: priorityStatus?.priority_microcycles_completed,
                component: 'MusclePriorityPanel'
              });
              handleDeactivatePriority();
            }}
            disabled={loading}
            className="text-gray-400 hover:text-red-500 transition-colors"
            title="Desactivar prioridad"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2 mb-1">
              <span className="text-2xl">{activeMuscle?.icon}</span>
              <span className="text-lg font-medium text-gray-900">
                {activeMuscle?.name}
              </span>
            </div>
            <p className="text-sm text-gray-600">
              {activeMuscle?.description}
            </p>
          </div>

          <div className="text-right">
            {priorityStatus.priority_microcycles_completed !== undefined && (
              <div className="mb-1">
                <span className="text-sm text-gray-500">Microciclos:</span>
                <span className="ml-1 font-semibold text-gray-900">
                  {priorityStatus.priority_microcycles_completed}/3
                </span>
              </div>
            )}
            {timeRemaining && (
              <div className="text-sm text-gray-500">
                {timeRemaining.days}d {timeRemaining.hours}h restantes
              </div>
            )}
          </div>
        </div>

        {/* Indicadores de progreso */}
        <div className="mt-4 pt-4 border-t border-blue-200">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-white rounded p-2">
              <div className="text-lg font-bold text-blue-600">82.5%</div>
              <div className="text-xs text-gray-500">Top Set</div>
            </div>
            <div className="bg-white rounded p-2">
              <div className="text-lg font-bold text-green-600">+1</div>
              <div className="text-xs text-gray-500">Serie Extra</div>
            </div>
            <div className="bg-white rounded p-2">
              <div className="text-lg font-bold text-orange-600">
                {priorityStatus.priority_top_sets_this_week || 0}
              </div>
              <div className="text-xs text-gray-500">Esta Semana</div>
            </div>
          </div>
        </div>

        {/* Información adicional */}
        <div className="mt-4 p-3 bg-blue-50 rounded-lg">
          <div className="flex items-start space-x-2">
            <Info className="h-4 w-4 text-blue-500 mt-0.5" />
            <div className="text-xs text-blue-700">
              <p className="font-medium mb-1">Durante la priorización:</p>
              <ul className="space-y-0.5">
                <li>• Realiza 1 top set adicional a 82.5% 1RM</li>
                <li>• Los otros músculos mantienen volumen</li>
                <li>• Duración: 2-3 semanas máximo</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Panel cuando no hay prioridad activa
  return (
    <>
      <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Target className="h-5 w-5 text-gray-400" />
            <h3 className="font-semibold text-gray-900">Priorización Muscular</h3>
          </div>
          <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded-full">
            {userLevel}
          </span>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Selecciona un músculo para darle prioridad temporal con volumen e intensidad adicionales.
        </p>

        <button
          onClick={() => {
            track('muscle_priority_modal_opened', {
              userId,
              userLevel,
              component: 'MusclePriorityPanel'
            });
            setIsModalOpen(true);
          }}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
        >
          <TrendingUp className="h-5 w-5" />
          <span>Activar Priorización</span>
        </button>

        {/* Información sobre priorización */}
        <div className="mt-4 text-xs text-gray-500">
          <p>✓ Solo 1 músculo a la vez</p>
          <p>✓ Duración: 2-3 semanas</p>
          <p>✓ Top set adicional al 82.5%</p>
        </div>
      </div>

      {/* Modal de selección */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full max-h-[80vh] overflow-y-auto">
            <div className="px-6 py-4 border-b sticky top-0 bg-white">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Seleccionar Músculo Prioritario</h2>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="p-6">
              {/* Advertencia */}
              <div className="mb-6 p-4 bg-amber-50 rounded-lg">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium mb-1">Consideraciones importantes:</p>
                    <ul className="space-y-0.5">
                      <li>• Solo para usuarios con buena técnica</li>
                      <li>• Requiere adherencia mínima del 80%</li>
                      <li>• Los demás músculos reducen progresión</li>
                      <li>• Máximo 1 ciclo de prioridad por mes</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Lista de músculos */}
              <div className="space-y-2 mb-6">
                {muscleGroups.map((muscle) => (
                  <button
                    key={muscle.id}
                    onClick={() => {
                      track('muscle_priority_muscle_selected', {
                        userId,
                        muscleId: muscle.id,
                        muscleName: muscle.name,
                        component: 'MusclePriorityPanel'
                      });
                      setSelectedMuscle(muscle.id);
                    }}
                    className={`w-full p-4 rounded-lg border-2 transition-all ${
                      selectedMuscle === muscle.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span className="text-2xl">{muscle.icon}</span>
                        <div className="text-left">
                          <p className="font-medium text-gray-900">{muscle.name}</p>
                          <p className="text-sm text-gray-500">{muscle.description}</p>
                        </div>
                      </div>
                      {selectedMuscle === muscle.id && (
                        <CheckCircle className="h-5 w-5 text-blue-500" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* Botones de acción */}
              <div className="flex space-x-3">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2 px-4 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleActivatePriority}
                  disabled={!selectedMuscle || loading}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                    selectedMuscle && !loading
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {loading ? 'Activando...' : 'Activar Priorización'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MusclePriorityPanel;