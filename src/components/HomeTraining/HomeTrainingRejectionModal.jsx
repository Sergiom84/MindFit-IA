import { alertDialog } from '../ui/dialogService.jsx';
import { useState } from 'react';
import { X, ThumbsDown, Clock, AlertTriangle, Heart, Zap } from 'lucide-react';

const HomeTrainingRejectionModal = ({ 
  exercises = [], 
  onReject, 
  onSkip, 
  onClose,
  equipmentType,
  trainingType 
}) => {
  const [selectedExercises, setSelectedExercises] = useState(new Set());
  const [rejectionReasons, setRejectionReasons] = useState({});
  const [rejectionCategories, setRejectionCategories] = useState({});
  const [rejectionDurations, setRejectionDurations] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Categorías de rechazo con iconos y colores
  const rejectionCategoryOptions = [
    { 
      id: 'too_hard', 
      label: 'Muy difícil', 
      icon: AlertTriangle, 
      color: 'text-red-400 bg-red-400/10 border-red-400/30',
      description: 'Este ejercicio está por encima de mi nivel actual'
    },
    { 
      id: 'dont_like', 
      label: 'No me gusta', 
      icon: ThumbsDown, 
      color: 'text-gray-400 bg-gray-400/10 border-gray-400/30',
      description: 'Simplemente no disfruto haciendo este ejercicio'
    },
    { 
      id: 'injury', 
      label: 'Lesión/Limitación', 
      icon: Heart, 
      color: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
      description: 'Tengo una lesión o limitación que me impide hacerlo'
    },
    { 
      id: 'equipment', 
      label: 'Sin equipamiento', 
      icon: Zap, 
      color: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
      description: 'No tengo el equipamiento necesario en este momento'
    },
    { 
      id: 'other', 
      label: 'Otro motivo', 
      icon: Clock, 
      color: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
      description: 'Otro motivo específico'
    }
  ];

  // Opciones de duración del rechazo
  const durationOptions = [
    { id: 'permanent', label: 'No mostrar nunca', value: null, description: 'Rechazo permanente' },
    { id: '1week', label: '1 semana', value: 7, description: 'Evitar por 1 semana' },
    { id: '2weeks', label: '2 semanas', value: 14, description: 'Evitar por 2 semanas' },
    { id: '1month', label: '1 mes', value: 30, description: 'Evitar por 1 mes' },
    { id: '3months', label: '3 meses', value: 90, description: 'Evitar por 3 meses' }
  ];

  const handleExerciseToggle = (exerciseIndex) => {
    const newSelected = new Set(selectedExercises);
    if (newSelected.has(exerciseIndex)) {
      newSelected.delete(exerciseIndex);
      // Limpiar datos relacionados
      const newReasons = { ...rejectionReasons };
      const newCategories = { ...rejectionCategories };
      const newDurations = { ...rejectionDurations };
      delete newReasons[exerciseIndex];
      delete newCategories[exerciseIndex];
      delete newDurations[exerciseIndex];
      setRejectionReasons(newReasons);
      setRejectionCategories(newCategories);
      setRejectionDurations(newDurations);
    } else {
      newSelected.add(exerciseIndex);
      // Valores por defecto
      setRejectionCategories(prev => ({ ...prev, [exerciseIndex]: 'dont_like' }));
      setRejectionDurations(prev => ({ ...prev, [exerciseIndex]: 'permanent' }));
    }
    setSelectedExercises(newSelected);
  };

  const handleReasonChange = (exerciseIndex, reason) => {
    setRejectionReasons(prev => ({ ...prev, [exerciseIndex]: reason }));
  };

  const handleCategoryChange = (exerciseIndex, category) => {
    setRejectionCategories(prev => ({ ...prev, [exerciseIndex]: category }));
  };

  const handleDurationChange = (exerciseIndex, duration) => {
    setRejectionDurations(prev => ({ ...prev, [exerciseIndex]: duration }));
  };

  const handleSubmitRejections = async () => {
    if (selectedExercises.size === 0) {
      alertDialog('Selecciona al menos un ejercicio para rechazar');
      return;
    }

    setIsSubmitting(true);

    try {
      const rejections = Array.from(selectedExercises).map(index => {
        const exercise = exercises[index];
        const duration = durationOptions.find(d => d.id === rejectionDurations[index]);
        
        return {
          exercise_name: exercise.nombre,
          exercise_key: exercise.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          equipment_type: equipmentType,
          training_type: trainingType,
          rejection_reason: rejectionReasons[index] || '',
          rejection_category: rejectionCategories[index] || 'other',
          expires_in_days: duration?.value || null
        };
      });

      await onReject(rejections);

      // Si llegamos aquí, el proceso fue exitoso
      console.log('✅ Preferencias guardadas y rutina cancelada exitosamente');

    } catch (error) {
      console.error('Error submitting rejections:', error);

      // Mostrar un mensaje de error más específico
      const errorMessage = error.message || 'Error al procesar tu solicitud';
      const userMessage = `Error: ${errorMessage}\n\nPor favor, inténtalo de nuevo o contacta soporte si el problema persiste.`;
      alertDialog(userMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900/90 border border-white/10 ring-1 ring-white/10 rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-[0_40px_90px_-60px_rgba(0,0,0,0.9)]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-4">
            <div className="h-11 w-11 rounded-full border border-red-400/30 bg-red-500/10 flex items-center justify-center">
              <ThumbsDown className="w-5 h-5 text-red-300" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white mb-1 font-urbanist">
                ¿No te gustan algunos ejercicios?
              </h3>
              <p className="text-gray-200/70 text-sm">
                Márcalos para que no aparezcan en futuros entrenamientos de <span className="text-yellow-300 font-medium">{trainingType}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-white transition-colors bg-white/5 border border-white/10 rounded-full p-2"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-220px)] p-6">
          <div className="grid gap-4">
            {exercises.map((exercise, index) => {
              const isSelected = selectedExercises.has(index);
              const category = rejectionCategoryOptions.find(c => c.id === rejectionCategories[index]);
              
              return (
                <div
                  key={index}
                  className={`border rounded-2xl p-4 transition-all duration-200 ${
                    isSelected
                      ? 'border-red-400/40 bg-red-500/10 ring-1 ring-red-400/20'
                      : 'border-white/10 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  {/* Exercise Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center">
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleExerciseToggle(index)}
                          className="w-5 h-5 accent-red-500 bg-black/40 border border-white/20 rounded focus:ring-red-400/60 focus:ring-2"
                        />
                        <span className="ml-3 text-white font-medium">
                          {exercise.nombre}
                        </span>
                      </label>
                    </div>
                    <div className="text-sm text-gray-300/70">
                      {exercise.series} series × {exercise.repeticiones || exercise.duracion_seg + 's'}
                    </div>
                  </div>

                  {/* Rejection Options (solo si está seleccionado) */}
                  {isSelected && (
                    <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
                      {/* Categoría de rechazo */}
                      <div>
                        <label className="block text-sm font-medium text-gray-200/80 mb-2">
                          ¿Por qué no te gusta?
                        </label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {rejectionCategoryOptions.map((option) => {
                            const Icon = option.icon;
                            const isSelected = rejectionCategories[index] === option.id;
                            
                            return (
                              <button
                                key={option.id}
                                onClick={() => handleCategoryChange(index, option.id)}
                                className={`flex items-center p-3 rounded-lg border transition-all duration-200 ${
                                  isSelected
                                    ? option.color
                                    : 'text-gray-200/70 bg-white/5 border-white/10 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                <Icon size={16} className="mr-2" />
                                <span className="text-sm font-medium">{option.label}</span>
                              </button>
                            );
                          })}
                        </div>
                        {category && (
                          <p className="text-xs text-gray-300/60 mt-1">{category.description}</p>
                        )}
                      </div>

                      {/* Duración del rechazo */}
                      <div>
                        <label className="block text-sm font-medium text-gray-200/80 mb-2">
                          ¿Por cuánto tiempo?
                        </label>
                        <select
                          value={rejectionDurations[index] || 'permanent'}
                          onChange={(e) => handleDurationChange(index, e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-red-400/60 focus:border-red-400/60"
                        >
                          {durationOptions.map(option => (
                            <option key={option.id} value={option.id}>
                              {option.label} - {option.description}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Razón específica (opcional) */}
                      <div>
                        <label className="block text-sm font-medium text-gray-200/80 mb-2">
                          Comentario adicional (opcional)
                        </label>
                        <textarea
                          value={rejectionReasons[index] || ''}
                          onChange={(e) => handleReasonChange(index, e.target.value)}
                          placeholder="Ej: Me lastima la rodilla, es muy intenso para mí, etc."
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:ring-2 focus:ring-red-400/60 focus:border-red-400/60 resize-none"
                          rows={2}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-white/10 bg-black/30">
          <div className="text-sm text-gray-300/70">
            {selectedExercises.size > 0 && (
              <span>{selectedExercises.size} ejercicio{selectedExercises.size !== 1 ? 's' : ''} seleccionado{selectedExercises.size !== 1 ? 's' : ''}</span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onSkip}
              className="px-6 py-2 text-gray-200/80 hover:text-white border border-white/10 hover:border-white/20 rounded-xl transition-colors"
            >
              Generar sin marcar
            </button>
            <button
              onClick={handleSubmitRejections}
              disabled={selectedExercises.size === 0 || isSubmitting}
              className="px-6 py-2 bg-gradient-to-r from-red-500 via-red-500 to-orange-500 hover:from-red-400 hover:to-orange-400 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex items-center shadow-[0_12px_30px_-18px_rgba(248,113,113,0.65)]"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />
                  Guardando...
                </>
              ) : (
                <>
                  <ThumbsDown size={16} className="mr-2" />
                  Guardar y generar nuevo plan
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomeTrainingRejectionModal;
