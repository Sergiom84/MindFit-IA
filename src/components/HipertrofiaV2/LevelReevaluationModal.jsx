import React, { useState, useEffect, useCallback } from 'react';
import { X, TrendingUp, TrendingDown, AlertCircle, CheckCircle, ChevronRight, BarChart3 } from 'lucide-react';
import { useTrace } from '../../contexts/TraceContext';
import tokenManager from '../../utils/tokenManager';

/**
 * Modal de Re-evaluación de Nivel
 * Notifica al usuario cuando el sistema detecta necesidad de cambio de nivel
 */
const LevelReevaluationModal = ({
  userId,
  isOpen,
  onClose,
  onLevelChange
}) => {
  const { track } = useTrace();
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Trace: apertura del modal
  useEffect(() => {
    if (isOpen) {
      track('level_reevaluation_modal_opened', {
        userId,
        component: 'LevelReevaluationModal'
      });
    }
  }, [isOpen, userId, track]);

  const checkReevaluation = useCallback(async () => {
    track('level_reevaluation_check_start', {
      userId,
      component: 'LevelReevaluationModal'
    });

    setLoading(true);
    try {
      const response = await fetch(`/api/hipertrofiav2/check-reevaluation/${userId}`, {
        headers: {
          'Authorization': `Bearer ${tokenManager.getToken()}`
        }
      });

      const data = await response.json();

      track('level_reevaluation_check_result', {
        userId,
        hasEvaluation: !!data.evaluation,
        hasPendingReevaluation: !!data.pendingReevaluation,
        currentLevel: data.evaluation?.current_level,
        suggestedLevel: data.evaluation?.suggested_level,
        confidence: data.evaluation?.confidence,
        component: 'LevelReevaluationModal'
      });

      if (data.success && data.evaluation) {
        setEvaluation(data);
      }
    } catch (error) {
      track('level_reevaluation_check_error', {
        userId,
        error: error.message,
        component: 'LevelReevaluationModal'
      });
      console.error('Error verificando re-evaluación:', error);
    } finally {
      setLoading(false);
    }
  }, [userId, track]);

  useEffect(() => {
    if (isOpen && userId) {
      checkReevaluation();
    }
  }, [isOpen, userId, checkReevaluation]);

  const handleAcceptChange = async (accept) => {
    if (!evaluation?.pendingReevaluation?.id) {
      track('level_reevaluation_accept_no_pending', {
        userId,
        component: 'LevelReevaluationModal'
      });
      return;
    }

    track('level_reevaluation_accept_start', {
      userId,
      reevaluationId: evaluation.pendingReevaluation.id,
      accept,
      currentLevel: evaluation.evaluation?.current_level,
      suggestedLevel: evaluation.evaluation?.suggested_level,
      component: 'LevelReevaluationModal'
    });

    setProcessing(true);
    try {
      const response = await fetch('/api/hipertrofiav2/accept-reevaluation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenManager.getToken()}`
        },
        body: JSON.stringify({
          reevaluationId: evaluation.pendingReevaluation.id,
          accept
        })
      });

      const data = await response.json();

      track('level_reevaluation_accept_result', {
        userId,
        accept,
        success: data.success,
        newLevel: data.newLevel,
        component: 'LevelReevaluationModal'
      });

      if (data.success) {
        if (onLevelChange && accept) {
          track('level_reevaluation_onLevelChange_called', {
            userId,
            newLevel: data.newLevel,
            component: 'LevelReevaluationModal'
          });
          onLevelChange(data.newLevel);
        }
        onClose();
      }
    } catch (error) {
      track('level_reevaluation_accept_error', {
        userId,
        accept,
        error: error.message,
        component: 'LevelReevaluationModal'
      });
      console.error('Error procesando re-evaluación:', error);
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen || loading || !evaluation) return null;

  const { evaluation: evalData, pendingReevaluation } = evaluation;
  const metrics = evalData.metrics;
  const isUpgrade = evalData.suggested_level &&
    ['Intermedio', 'Avanzado'].includes(evalData.suggested_level) &&
    evalData.current_level === 'Principiante';
  
  const isDowngrade = evalData.suggested_level &&
    evalData.suggested_level === 'Principiante' &&
    evalData.current_level !== 'Principiante';

  // Si no hay cambio sugerido, no mostrar modal
  if (evalData.no_change) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {isUpgrade ? (
                <TrendingUp className="h-6 w-6 text-green-600" />
              ) : isDowngrade ? (
                <TrendingDown className="h-6 w-6 text-orange-600" />
              ) : (
                <BarChart3 className="h-6 w-6 text-blue-600" />
              )}
              <h2 className="text-xl font-semibold">Re-evaluación de Nivel</h2>
            </div>
            <button
              onClick={() => {
                track('level_reevaluation_modal_closed', {
                  userId,
                  component: 'LevelReevaluationModal'
                });
                onClose();
              }}
              className="p-2 hover:bg-white/50 rounded-full transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Cambio sugerido */}
          <div className="text-center mb-6">
            <div className="flex items-center justify-center space-x-3 mb-4">
              <div className="px-4 py-2 bg-gray-100 rounded-lg">
                <p className="text-sm text-gray-500">Nivel actual</p>
                <p className="font-semibold text-lg">{evalData.current_level}</p>
              </div>
              <ChevronRight className="h-6 w-6 text-gray-400" />
              <div className={`px-4 py-2 rounded-lg ${
                isUpgrade ? 'bg-green-100' : isDowngrade ? 'bg-orange-100' : 'bg-blue-100'
              }`}>
                <p className="text-sm text-gray-500">Nivel sugerido</p>
                <p className="font-semibold text-lg">{evalData.suggested_level}</p>
              </div>
            </div>
            
            {/* Confidence */}
            <div className="flex items-center justify-center space-x-2">
              <span className="text-sm text-gray-500">Confianza:</span>
              <div className="flex space-x-1">
                {[1, 2, 3, 4, 5].map(i => (
                  <div
                    key={i}
                    className={`h-2 w-8 rounded ${
                      i <= Math.round((evalData.confidence || 0) * 5)
                        ? 'bg-blue-500'
                        : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>
              <span className="text-sm font-medium">
                {Math.round((evalData.confidence || 0) * 100)}%
              </span>
            </div>
          </div>

          {/* Razón del cambio */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm font-medium text-blue-900 mb-1">
              Razón del cambio:
            </p>
            <p className="text-sm text-blue-700">
              {evalData.reason || pendingReevaluation?.reason}
            </p>
          </div>

          {/* Métricas */}
          <div className="mb-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">
              Métricas de evaluación:
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {/* Microciclos completados */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Microciclos</p>
                <p className="font-semibold text-lg">
                  {metrics?.microcycles_completed || 0}
                </p>
              </div>
              
              {/* RIR promedio */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">RIR promedio</p>
                <p className="font-semibold text-lg">
                  {metrics?.avg_rir ? metrics.avg_rir.toFixed(1) : 'N/A'}
                </p>
              </div>
              
              {/* Adherencia */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Adherencia</p>
                <p className="font-semibold text-lg">
                  {metrics?.adherence ? `${Math.round(metrics.adherence)}%` : 'N/A'}
                </p>
              </div>
              
              {/* Fatiga */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Flags fatiga</p>
                <p className="font-semibold text-lg">
                  {metrics?.fatigue_count || 0}
                </p>
              </div>
            </div>
          </div>

          {/* Beneficios del cambio */}
          <div className="mb-6 p-4 bg-green-50 rounded-lg">
            <div className="flex items-start space-x-2">
              <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-green-900 mb-1">
                  Beneficios del cambio:
                </p>
                <ul className="space-y-1 text-green-700">
                  {isUpgrade ? (
                    <>
                      <li>• Mayor volumen de entrenamiento</li>
                      <li>• Ejercicios más complejos</li>
                      <li>• Progresión más rápida</li>
                      <li>• Mejor desarrollo muscular</li>
                    </>
                  ) : isDowngrade ? (
                    <>
                      <li>• Mejor recuperación</li>
                      <li>• Reducción de fatiga acumulada</li>
                      <li>• Mayor adherencia al programa</li>
                      <li>• Prevención de sobreentrenamiento</li>
                    </>
                  ) : (
                    <>
                      <li>• Ajuste óptimo a tu nivel actual</li>
                      <li>• Mejor progresión a largo plazo</li>
                      <li>• Reducción del riesgo de lesión</li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          </div>

          {/* Advertencia si es downgrade */}
          {isDowngrade && (
            <div className="mb-6 p-4 bg-amber-50 rounded-lg">
              <div className="flex items-start space-x-2">
                <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium mb-1">Nota importante:</p>
                  <p>
                    Reducir el nivel no es un retroceso. Es una estrategia inteligente
                    para optimizar tu recuperación y volver más fuerte.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Botones de acción */}
          <div className="flex space-x-3">
            <button
              onClick={() => {
                track('level_reevaluation_keep_current_clicked', {
                  userId,
                  currentLevel: evalData.current_level,
                  suggestedLevel: evalData.suggested_level,
                  component: 'LevelReevaluationModal'
                });
                handleAcceptChange(false);
              }}
              disabled={processing}
              className="flex-1 py-3 px-4 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
            >
              Mantener nivel actual
            </button>
            <button
              onClick={() => {
                track('level_reevaluation_change_level_clicked', {
                  userId,
                  currentLevel: evalData.current_level,
                  suggestedLevel: evalData.suggested_level,
                  isUpgrade,
                  isDowngrade,
                  component: 'LevelReevaluationModal'
                });
                handleAcceptChange(true);
              }}
              disabled={processing}
              className={`flex-1 py-3 px-4 rounded-lg font-medium text-white transition-colors ${
                processing
                  ? 'bg-gray-400 cursor-not-allowed'
                  : isUpgrade
                    ? 'bg-green-600 hover:bg-green-700'
                    : isDowngrade
                      ? 'bg-orange-600 hover:bg-orange-700'
                      : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {processing ? 'Procesando...' : `Cambiar a ${evalData.suggested_level}`}
            </button>
          </div>
          
          {/* Nota adicional */}
          <p className="text-xs text-gray-500 text-center mt-4">
            Esta sugerencia se basa en tu rendimiento de las últimas semanas.
            Puedes cambiar tu nivel en cualquier momento desde configuración.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LevelReevaluationModal;