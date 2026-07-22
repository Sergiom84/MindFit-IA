import React, { useState } from 'react';
import { X, AlertCircle, ThumbsDown, HelpCircle, Heart, Clock, Dumbbell, Zap } from 'lucide-react';

/**
 * Modal para capturar feedback de ejercicios saltados o cancelados
 * @param {Object} props
 * @param {Array} props.exercises - Ejercicios no completados
 * @param {string} props.sessionType - 'skip' | 'cancel'
 * @param {Function} props.onSubmit - Callback al enviar feedback
 * @param {Function} props.onClose - Callback al cerrar modal
 */
const SessionFeedbackModal = ({ exercises, sessionType, onSubmit, onClose }) => {
  const [feedback, setFeedback] = useState({});
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);

  const reasonOptions = {
    skip: [
      { code: 'cansancio', label: 'Estoy muy cansado/a', icon: Clock, color: 'text-orange-500' },
      { code: 'tiempo', label: 'No tengo tiempo', icon: Clock, color: 'text-blue-500' },
      { code: 'motivacion', label: 'Falta de motivación', icon: ThumbsDown, color: 'text-gray-500' },
      { code: 'otros', label: 'Otros motivos', icon: HelpCircle, color: 'text-purple-500' }
    ],
    cancel: [
      { code: 'dificil', label: 'Es muy difícil', icon: AlertCircle, color: 'text-red-500', showDifficulty: true },
      { code: 'no_se_ejecutar', label: 'No sé cómo hacerlo', icon: HelpCircle, color: 'text-yellow-500', showVideo: true },
      { code: 'lesion', label: 'Tengo una lesión', icon: Heart, color: 'text-red-600', showBodyPart: true },
      { code: 'equipamiento', label: 'No tengo el equipo', icon: Dumbbell, color: 'text-gray-600' },
      { code: 'otros', label: 'Otros motivos', icon: Zap, color: 'text-purple-500' }
    ]
  };

  const currentExercise = exercises[currentExerciseIndex];
  const currentFeedback = feedback[currentExercise?.order] || {};
  const options = reasonOptions[sessionType];

  const handleReasonSelect = (reasonCode) => {
    setFeedback(prev => ({
      ...prev,
      [currentExercise.order]: {
        ...prev[currentExercise.order],
        reasonCode,
        exercise_name: currentExercise.nombre
      }
    }));
  };

  const handleDifficultyRating = (rating) => {
    setFeedback(prev => ({
      ...prev,
      [currentExercise.order]: {
        ...prev[currentExercise.order],
        difficulty: rating
      }
    }));
  };

  const handleCustomText = (text) => {
    setFeedback(prev => ({
      ...prev,
      [currentExercise.order]: {
        ...prev[currentExercise.order],
        customText: text
      }
    }));
  };

  const handleNext = () => {
    if (currentExerciseIndex < exercises.length - 1) {
      setCurrentExerciseIndex(prev => prev + 1);
    } else {
      handleSubmit();
    }
  };

  const handleSkipExercise = () => {
    if (currentExerciseIndex < exercises.length - 1) {
      setCurrentExerciseIndex(prev => prev + 1);
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const feedbackArray = Object.entries(feedback).map(([order, data]) => ({
      exercise_order: parseInt(order),
      exercise_name: data.exercise_name,
      feedback_type: sessionType === 'skip' ? 'skipped' : 'cancelled',
      reason_code: data.reasonCode,
      reason_text: data.customText || '',
      difficulty_rating: data.difficulty || null,
      would_retry: data.wouldRetry || false
    }));

    onSubmit(feedbackArray);
  };

  const selectedOption = options.find(opt => opt.code === currentFeedback.reasonCode);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {sessionType === 'skip' ? '¿Por qué saltaste estos ejercicios?' : '¿Por qué cancelaste estos ejercicios?'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Ejercicio {currentExerciseIndex + 1} de {exercises.length}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 pt-4">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentExerciseIndex + 1) / exercises.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Exercise Info */}
        <div className="p-6">
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 mb-6">
            <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-2">
              {currentExercise?.nombre}
            </h3>
            <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400">
              <span>{currentExercise?.series} series</span>
              <span>•</span>
              <span>{currentExercise?.repeticiones} reps</span>
            </div>
          </div>

          {/* Reason Options */}
          <div className="space-y-3 mb-6">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Selecciona el motivo:
            </p>
            {options.map((option) => {
              const Icon = option.icon;
              const isSelected = currentFeedback.reasonCode === option.code;
              
              return (
                <button
                  key={option.code}
                  onClick={() => handleReasonSelect(option.code)}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <Icon className={`w-6 h-6 ${isSelected ? 'text-blue-600' : option.color}`} />
                  <span className={`font-medium ${isSelected ? 'text-blue-900 dark:text-blue-100' : 'text-gray-700 dark:text-gray-300'}`}>
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Additional Fields */}
          {selectedOption?.showDifficulty && (
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                ¿Qué tan difícil fue? (1 = Poco difícil, 5 = Imposible)
              </p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(rating => (
                  <button
                    key={rating}
                    onClick={() => handleDifficultyRating(rating)}
                    className={`flex-1 py-3 rounded-lg border-2 font-semibold transition-all ${
                      currentFeedback.difficulty === rating
                        ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                    }`}
                  >
                    {rating}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom Text */}
          {currentFeedback.reasonCode && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                ¿Quieres añadir algo más? (opcional)
              </label>
              <textarea
                value={currentFeedback.customText || ''}
                onChange={(e) => handleCustomText(e.target.value)}
                placeholder="Cuéntanos más detalles..."
                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={3}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-6 flex gap-3">
          <button
            onClick={handleSkipExercise}
            className="flex-1 px-6 py-3 rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Saltar
          </button>
          <button
            onClick={handleNext}
            disabled={!currentFeedback.reasonCode}
            className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-colors ${
              currentFeedback.reasonCode
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
            }`}
          >
            {currentExerciseIndex < exercises.length - 1 ? 'Siguiente' : 'Finalizar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionFeedbackModal;

