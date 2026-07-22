/**
 * 💬 Modal de Feedback de Ejercicios
 *
 * FUNCIONALIDAD:
 * - Aparece cuando el usuario hace clic en "Generar otro"
 * - Permite al usuario dar feedback sobre por qué quiere un nuevo plan
 * - Opciones: "Muy difícil", "No me gusta", "Muy fácil", "Cambiar enfoque"
 * - Incluye campo de comentarios opcional
 * - Envía el feedback para generar un mejor plan
 */

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Textarea } from '@/components/ui/textarea.jsx';
import {
  X,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Heart,
  Target,
  AlertTriangle
} from 'lucide-react';

import { useTrace } from '@/contexts/TraceContext.jsx';

const FEEDBACK_OPTIONS = [
  {
    id: 'too_difficult',
    label: 'Muy difícil',
    icon: TrendingUp,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10 border-red-500/20 hover:bg-red-500/20',
    description: 'Los ejercicios son demasiado avanzados para mi nivel'
  },
  {
    id: 'too_easy',
    label: 'Muy fácil',
    icon: TrendingDown,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20',
    description: 'Necesito más desafío en los ejercicios'
  },
  {
    id: 'dont_like',
    label: 'No me gusta',
    icon: Heart,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20',
    description: 'Prefiero otro tipo de ejercicios'
  },
  {
    id: 'change_focus',
    label: 'Cambiar enfoque',
    icon: Target,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20',
    description: 'Quiero enfocarme en otras áreas del cuerpo'
  }
];

export default function ExerciseFeedbackModal({
  isOpen,
  onClose,
  onSubmitFeedback,
  isSubmitting = false
}) {
  const { track } = useTrace();
  const [selectedFeedback, setSelectedFeedback] = useState([]);
  const [additionalComments, setAdditionalComments] = useState('');

  // Ref para evitar loop infinito en tracking
  const prevIsOpenRef = React.useRef(isOpen);

  // Tracking corregido con useRef
  React.useEffect(() => {
    if (prevIsOpenRef.current !== isOpen) {
      track(isOpen ? 'MODAL_OPEN' : 'MODAL_CLOSE', { name: 'ExerciseFeedbackModal' }, { component: 'ExerciseFeedbackModal' });
      prevIsOpenRef.current = isOpen;
    }
  }, [isOpen, track]);

  const handleFeedbackToggle = (feedbackId) => {
    setSelectedFeedback(prev => {
      const next = prev.includes(feedbackId)
        ? prev.filter(id => id !== feedbackId)
        : [...prev, feedbackId];
      track('FEEDBACK_TOGGLE', { id: feedbackId, selected: !prev.includes(feedbackId) }, { component: 'ExerciseFeedbackModal' });
      return next;
    });
  };

  const handleSubmit = () => {
    if (selectedFeedback.length === 0) {
      return;
    }

    const feedbackData = {
      reasons: selectedFeedback,
      comments: additionalComments.trim() || null,
      timestamp: new Date().toISOString()
    };

    track('BUTTON_CLICK', { id: 'submit_feedback', reasons: selectedFeedback.length }, { component: 'ExerciseFeedbackModal' });
    onSubmitFeedback(feedbackData);
  };

  const handleClose = () => {
    // Reset state when closing
    setSelectedFeedback([]);
    setAdditionalComments('');
    track('BUTTON_CLICK', { id: 'cancel' }, { component: 'ExerciseFeedbackModal' });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg bg-gray-900 border-yellow-500/20">
        <DialogHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-500/10 rounded-full flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <DialogTitle className="text-lg text-white">
                  ¿Por qué generar otro plan?
                </DialogTitle>
                <DialogDescription className="text-gray-300 text-sm">
                  Tu feedback nos ayuda a crear mejores rutinas
                </DialogDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="text-gray-400 hover:text-white"
              disabled={isSubmitting}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Feedback Options */}
          <div>
            <h4 className="text-white font-medium mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              Selecciona los motivos (puedes elegir varios):
            </h4>
            <div className="grid grid-cols-1 gap-2">
              {FEEDBACK_OPTIONS.map((option) => {
                const Icon = option.icon;
                const isSelected = selectedFeedback.includes(option.id);

                return (
                  <button
                    key={option.id}
                    onClick={() => handleFeedbackToggle(option.id)}
                    disabled={isSubmitting}
                    className={`
                      w-full text-left p-3 rounded-lg border transition-all duration-200
                      ${isSelected
                        ? `${option.bgColor} border-current`
                        : 'bg-gray-800/50 border-gray-700 hover:bg-gray-800 hover:border-gray-600'
                      }
                      ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className={`w-5 h-5 mt-0.5 ${isSelected ? option.color : 'text-gray-400'}`} />
                      <div className="flex-1">
                        <div className={`font-medium ${isSelected ? 'text-white' : 'text-gray-200'}`}>
                          {option.label}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {option.description}
                        </div>
                      </div>
                      {isSelected && (
                        <div className="w-2 h-2 bg-yellow-400 rounded-full mt-2"></div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Additional Comments */}
          <div>
            <label className="block text-white font-medium mb-2">
              Comentarios adicionales (opcional)
            </label>
            <Textarea
              value={additionalComments}
              onChange={(e) => setAdditionalComments(e.target.value)}
              placeholder="Cuéntanos más detalles sobre lo que te gustaría cambiar..."
              className="bg-gray-800 border-gray-700 text-white placeholder-gray-400 resize-none"
              rows={3}
              maxLength={500}
              disabled={isSubmitting}
            />
            <div className="text-xs text-gray-500 mt-1">
              {additionalComments.length}/500 caracteres
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              onClick={handleClose}
              variant="outline"
              className="flex-1 border-gray-600 text-gray-300 hover:bg-gray-800"
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black font-medium"
              disabled={selectedFeedback.length === 0 || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin mr-2" />
                  Generando...
                </>
              ) : (
                <>
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Generar nuevo plan
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}