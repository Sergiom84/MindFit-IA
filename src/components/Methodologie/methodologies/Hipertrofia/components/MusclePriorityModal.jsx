/**
 * 🎯 MusclePriorityModal - Modal para gestionar prioridad muscular (FASE 2 Módulo 4)
 *
 * FUNCIONALIDAD:
 * - Activar prioridad para 1 grupo muscular
 * - Duración: 2-3 microciclos completados
 * - Beneficios: +20% volumen, +1 top set/semana
 * - Timeout: >6 semanas sin cerrar microciclo → desactivación automática
 *
 * REGLAS:
 * - Solo 1 prioridad activa a la vez
 * - No se puede cambiar sin desactivar primero
 */

import { useState, useEffect } from 'react';
import { X, TrendingUp, Calendar, Target, AlertTriangle, CheckCircle } from 'lucide-react';
import tokenManager from '../../../../../utils/tokenManager';
import { getApiBaseUrl } from '../../../../../config/api';

const API_URL = getApiBaseUrl();

const MUSCLE_GROUPS = [
  { id: 'Pecho', label: 'Pecho', emoji: '💪', description: 'Press banca, aperturas' },
  { id: 'Espalda', label: 'Espalda', emoji: '🔥', description: 'Dominadas, remos' },
  { id: 'Piernas', label: 'Piernas', emoji: '🦵', description: 'Sentadillas, peso muerto' },
  { id: 'Hombros', label: 'Hombros', emoji: '💪', description: 'Press militar, elevaciones' },
  { id: 'Bíceps', label: 'Bíceps', emoji: '💪', description: 'Curls, predicador' },
  { id: 'Tríceps', label: 'Tríceps', emoji: '💪', description: 'Extensiones, fondos' },
  { id: 'Core', label: 'Core', emoji: '🏋️', description: 'Planchas, abdominales' }
];

export default function MusclePriorityModal({ show, onClose, currentPriority = null, onActivate, onDeactivate }) {
  const [selectedMuscle, setSelectedMuscle] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showConfirmDeactivate, setShowConfirmDeactivate] = useState(false);

  // Reset al abrir
  useEffect(() => {
    if (show) {
      setSelectedMuscle(null);
      setError(null);
      setShowConfirmDeactivate(false);
    }
  }, [show]);

  if (!show) return null;

  const handleActivate = async () => {
    if (!selectedMuscle) {
      setError('Selecciona un grupo muscular');
      return;
    }

    if (currentPriority) {
      setError('Ya hay una prioridad activa. Desactívala primero.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const token = tokenManager.getToken();
      const response = await fetch(
        `${API_URL}/api/hipertrofia/activate-priority`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ muscleGroup: selectedMuscle })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error activando prioridad');
      }

      console.log('✅ [PRIORITY] Prioridad activada:', result);

      // Llamar callback del padre
      if (onActivate) {
        onActivate(result);
      }

      // Cerrar modal
      onClose?.();
    } catch (err) {
      console.error('❌ [PRIORITY] Error:', err);
      setError(err.message || 'Error activando prioridad');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const token = tokenManager.getToken();
      const response = await fetch(
        `${API_URL}/api/hipertrofia/deactivate-priority`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({})
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error desactivando prioridad');
      }

      console.log('✅ [PRIORITY] Prioridad desactivada:', result);

      // Llamar callback del padre
      if (onDeactivate) {
        onDeactivate(result);
      }

      // Cerrar modal
      onClose?.();
    } catch (err) {
      console.error('❌ [PRIORITY] Error:', err);
      setError(err.message || 'Error desactivando prioridad');
    } finally {
      setIsSubmitting(false);
      setShowConfirmDeactivate(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-700 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Target className="h-6 w-6 text-yellow-400" />
              Prioridad Muscular
            </h3>
            <p className="text-sm text-gray-400 mt-1">
              Enfoca tu entrenamiento en un grupo muscular específico
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Información sobre el sistema */}
          <div className="bg-blue-900/20 border border-blue-700/50 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <TrendingUp className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-200">
                <p className="font-semibold mb-2">¿Cómo funciona la prioridad?</p>
                <ul className="space-y-1 text-blue-300">
                  <li>• <span className="font-semibold">+20% volumen</span> para el músculo prioritario</li>
                  <li>• <span className="font-semibold">+1 top set</span> por semana (series al fallo)</li>
                  <li>• Duración: <span className="font-semibold">2-3 microciclos</span> completados</li>
                  <li>• Solo <span className="font-semibold">1 prioridad</span> activa a la vez</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Estado actual de prioridad */}
          {currentPriority && (
            <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-yellow-200 font-semibold mb-2">
                    Prioridad activa: {currentPriority.priority_muscle}
                  </p>
                  <div className="text-sm text-yellow-300 space-y-1">
                    <p>• Microciclos completados: {currentPriority.priority_microcycles_completed || 0} / 3</p>
                    <p>• Top sets esta semana: {currentPriority.priority_top_sets_this_week || 0} / 1</p>
                    <p>• Iniciado: {new Date(currentPriority.priority_started_at).toLocaleDateString('es-ES')}</p>
                  </div>

                  {!showConfirmDeactivate ? (
                    <button
                      onClick={() => setShowConfirmDeactivate(true)}
                      className="mt-4 w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <X className="h-4 w-4" />
                      Desactivar Prioridad
                    </button>
                  ) : (
                    <div className="mt-4 space-y-2">
                      <p className="text-red-200 text-sm font-medium">
                        ¿Seguro que quieres desactivar la prioridad?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleDeactivate}
                          disabled={isSubmitting}
                          className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                        >
                          {isSubmitting ? 'Desactivando...' : 'Sí, desactivar'}
                        </button>
                        <button
                          onClick={() => setShowConfirmDeactivate(false)}
                          className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Selector de músculo (solo si no hay prioridad activa) */}
          {!currentPriority && (
            <>
              <div>
                <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <Target className="h-5 w-5 text-yellow-400" />
                  Selecciona un grupo muscular
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {MUSCLE_GROUPS.map((muscle) => (
                    <button
                      key={muscle.id}
                      onClick={() => setSelectedMuscle(muscle.id)}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        selectedMuscle === muscle.id
                          ? 'bg-yellow-500/20 border-yellow-400 scale-105'
                          : 'bg-gray-700/30 border-gray-600 hover:border-gray-500 hover:bg-gray-700/50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{muscle.emoji}</span>
                        <div className="text-left">
                          <p className="text-white font-semibold">{muscle.label}</p>
                          <p className="text-xs text-gray-400">{muscle.description}</p>
                        </div>
                        {selectedMuscle === muscle.id && (
                          <CheckCircle className="h-5 w-5 text-yellow-400 ml-auto" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Duración estimada */}
              <div className="bg-gray-700/30 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-gray-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-gray-300">
                    <p className="font-semibold mb-1">Duración estimada</p>
                    <p>
                      Esta prioridad estará activa durante <span className="text-yellow-400 font-semibold">2-3 microciclos</span> (aproximadamente 6-9 semanas).
                    </p>
                    <p className="mt-2 text-gray-400 text-xs">
                      ⚠️ Si pasan más de 6 semanas sin completar un microciclo, se desactivará automáticamente.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Error message */}
          {error && (
            <div className="bg-red-900/20 border border-red-700/50 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-200 text-sm">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer con botones */}
        {!currentPriority && (
          <div className="sticky bottom-0 bg-gray-800 border-t border-gray-700 px-6 py-4 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleActivate}
              disabled={!selectedMuscle || isSubmitting}
              className="flex-1 px-4 py-3 bg-yellow-500 hover:bg-yellow-600 text-gray-900 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin h-5 w-5 border-2 border-gray-900/30 border-t-gray-900 rounded-full" />
                  Activando...
                </>
              ) : (
                <>
                  <Target className="h-5 w-5" />
                  Activar Prioridad
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
