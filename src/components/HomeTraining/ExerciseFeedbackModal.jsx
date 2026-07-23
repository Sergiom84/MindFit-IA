import React, { useState, useEffect, useCallback } from 'react';
import { Star, X, Heart, Frown, AlertOctagon } from 'lucide-react';

const feedbackOptions = [
  { key: 'like', label: 'Me gusta', icon: Heart, color: 'text-pink-400', hoverColor: 'hover:text-pink-300' },
  { key: 'dislike', label: 'No me gusta', icon: Frown, color: 'text-orange-400', hoverColor: 'hover:text-orange-300' },
  { key: 'hard', label: 'Es difícil', icon: AlertOctagon, color: 'text-red-400', hoverColor: 'hover:text-red-300' },
];

const ExerciseFeedbackModal = ({ show, onClose, onSubmit, exerciseName, initialFeedback = null, isNested = false }) => {
  const [selected, setSelected] = useState(initialFeedback?.sentiment || null);
  const [comment, setComment] = useState(initialFeedback?.comment || '');

  // Actualizar estado cuando cambie el feedback inicial
  useEffect(() => {
    setSelected(initialFeedback?.sentiment || null);
    setComment(initialFeedback?.comment || '');
  }, [initialFeedback]);

  // Manejo de tecla Escape
  useEffect(() => {
    if (!show) return;

    const handleEscape = (event) => {
      if (event.key === 'Escape' || event.keyCode === 27) {
        event.preventDefault();
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [show, onClose]);

  // Prevenir scroll del body cuando el modal está abierto
  useEffect(() => {
    if (show) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [show]);


  const handleSubmit = useCallback(() => {
    if (!selected && !comment.trim()) {
      onClose?.();
      return;
    }
    onSubmit?.({ sentiment: selected, comment: comment.trim() });
  }, [selected, comment, onClose, onSubmit]);

  const handleBackdropClick = useCallback((event) => {
    if (event.target === event.currentTarget) {
      onClose?.();
    }
  }, [onClose]);

  // z-60 si es modal anidado, z-50 si es principal
  const zIndex = isNested ? 'z-[60]' : 'z-50';
  if (!show) return null;


  return (
    <div className={`fixed inset-0 ${zIndex} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleBackdropClick} />
      <div className="relative bg-[#0d1522] border border-yellow-400/20 rounded-xl p-6 w-full max-w-md transform transition-all duration-200 scale-100 opacity-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Star className="text-yellow-400" />
            <h3 className="text-white font-semibold">¿Cómo has sentido este ejercicio?</h3>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-gray-400 mb-3">{exerciseName}</p>

        <div className="grid grid-cols-1 gap-2 mb-4">
          {feedbackOptions.map(opt => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSelected(opt.key)}
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-all duration-200 ${
                  selected === opt.key
                    ? `border-yellow-400 bg-yellow-400/10 ${opt.color}`
                    : 'border-gray-700 hover:border-gray-600 hover:bg-gray-800/50 text-gray-400 hover:text-gray-200'
                }`}
              >
                <Icon size={20} className={selected === opt.key ? 'animate-pulse' : ''} />
                <span className="font-medium">{opt.label}</span>
                {selected === opt.key && (
                  <span className="ml-auto text-xs bg-yellow-400/20 px-2 py-1 rounded-full">Seleccionado</span>
                )}
              </button>
            );
          })}
        </div>

        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Comentarios (opcional)"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-white placeholder-gray-500 mb-4 focus:border-yellow-400 focus:outline-none transition-colors resize-none"
          rows={3}
          maxLength={200}
        />
        {comment.length > 0 && (
          <div className="text-right text-xs text-gray-500 -mt-2 mb-2">
            {comment.length}/200 caracteres
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg transition-colors shadow-lg hover:shadow-xl"
          >
            {initialFeedback ? 'Actualizar' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExerciseFeedbackModal;

