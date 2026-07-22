/**
 * Modal de Transición de Adaptación
 * Muestra resultado de evaluación y permite transicionar o repetir
 */

import React, { useState } from 'react';
import {
  CheckCircle,
  AlertCircle,
  X,
  TrendingUp,
  Zap,
  Target,
  RotateCw,
  AlertTriangle,
} from 'lucide-react';
import apiClient from '@/lib/apiClient';

export default function AdaptationTransitionModal({
  isOpen,
  onClose,
  evaluation,
  onTransitionSuccess,
  onRepeatBlock,
}) {
  const [loading, setLoading] = useState(false);
  const [transitionError, setTransitionError] = useState(null);

  if (!isOpen || !evaluation) return null;

  const { is_ready: isReady, evaluation: evalDetails } = evaluation;

  const handleTransition = async () => {
    try {
      setLoading(true);
      setTransitionError(null);
      const response = await apiClient.post('/adaptation/transition', {});
      if (response.success) {
        setTimeout(() => { onTransitionSuccess?.(); }, 500);
      } else {
        setTransitionError(response.error || 'Error en transición');
      }
    } catch (error) {
      setTransitionError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const CriterionDisplay = ({ icon: Icon, label, value, met, threshold }) => (
    <div className="flex items-center gap-3 py-2 border-b border-gray-700 last:border-b-0">
      <Icon className={"w-4 h-4 " + (met ? 'text-green-400' : 'text-red-400')} />
      <div className="flex-1">
        <p className="text-sm text-gray-300">{label}</p>
        <p className="text-xs text-gray-500">{value} ({met ? '✓' : '✗'} {threshold})</p>
      </div>
      {met ? <CheckCircle className="w-5 h-5 text-green-400" /> : <AlertTriangle className="w-5 h-5 text-red-400" />}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-lg border-2 overflow-hidden">
        <div className={(isReady ? 'from-green-600 to-emerald-600' : 'from-yellow-600 to-orange-600') + " bg-gradient-to-r p-6 flex items-start justify-between"}>
          <div className="flex items-center gap-3">
            {isReady ? <CheckCircle className="w-8 h-8 text-white" /> : <AlertCircle className="w-8 h-8 text-white" />}
            <div>
              <h2 className="font-bold text-lg text-white">{isReady ? '¡Felicitaciones! 🎉' : 'Evaluación Completada'}</h2>
              <p className="text-sm text-white/80">{isReady ? 'Listo para D1-D5' : 'Criterios pendientes'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white hover:text-gray-300"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {evalDetails && (
            <div className="bg-gray-800/50 rounded-lg p-3 space-y-1">
              <CriterionDisplay icon={Zap} label="Adherencia" value="4/5" met={evalDetails.adherence?.met} threshold="≥80%" />
              <CriterionDisplay icon={Target} label="RIR" value={evalDetails.rir?.value?.toFixed(1)} met={evalDetails.rir?.met} threshold="≤4" />
              <CriterionDisplay icon={AlertCircle} label="Técnica" value={evalDetails.technique?.flags || 0} met={evalDetails.technique?.met} threshold="<1" />
              <CriterionDisplay icon={TrendingUp} label="Progreso" value={evalDetails.progress?.value?.toFixed(1) + "%"} met={evalDetails.progress?.met} threshold="≥8%" />
            </div>
          )}
        </div>
        <div className="p-6 bg-gray-800/50 border-t border-gray-700 space-y-3">
          {isReady ? (
            <>
              <button onClick={handleTransition} disabled={loading} className="w-full py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold">
                {loading ? '⏳ Procesando...' : '✨ Avanzar a D1-D5'}
              </button>
              <button onClick={onClose} className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold">Cerrar</button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-semibold">✓ Continuar Entrenando</button>
              <button onClick={onRepeatBlock} className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold flex items-center justify-center gap-2">
                <RotateCw className="w-4 h-4" /> Repetir Semana
              </button>
            </>
          )}
          {transitionError && <div className="p-3 bg-red-900/30 border border-red-500/50 rounded text-xs text-red-300">{transitionError}</div>}
        </div>
      </div>
    </div>
  );
}
