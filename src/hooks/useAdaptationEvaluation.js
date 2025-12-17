/**
 * 🎯 Hook: useAdaptationEvaluation
 * Auto-evalúa el progreso de adaptación después de completar sesiones
 * Dispara auto-evaluación semanal y muestra modal de transición
 */

import { useState, useCallback } from 'react';
import apiClient from '@/lib/apiClient';

export function useAdaptationEvaluation() {
  const [evaluation, setEvaluation] = useState(null);
  const [showTransitionModal, setShowTransitionModal] = useState(false);
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [evaluationError, setEvaluationError] = useState(null);

  const evaluateAdaptationWeek = useCallback(async () => {
    try {
      setEvaluationLoading(true);
      setEvaluationError(null);

      // 1. Auto-evaluar la semana actual
      console.log('🤖 Iniciando auto-evaluación de adaptación...');
      const autoEvalResponse = await apiClient.post('/adaptation/auto-evaluate-week', {});

      if (!autoEvalResponse.success) {
        console.log('⚠️ No hay bloque de adaptación activo - No es necesario evaluar');
        setEvaluationLoading(false);
        return;
      }

      console.log('✅ Semana auto-evaluada:', autoEvalResponse.week);

      // 2. Obtener evaluación actual (dry-run)
      console.log('🔍 Evaluando criterios de transición...');
      const evalResponse = await apiClient.get('/adaptation/evaluate');

      if (evalResponse.success) {
        console.log('📊 Evaluación completada:', evalResponse);
        setEvaluation(evalResponse);
        setShowTransitionModal(true);
      } else {
        setEvaluationError(evalResponse.error || 'Error evaluando criterios');
      }
    } catch (error) {
      console.error('❌ Error en evaluación de adaptación:', error);
      setEvaluationError(error.message);
      // No mostrar modal si hay error
      setShowTransitionModal(false);
    } finally {
      setEvaluationLoading(false);
    }
  }, []);

  const resetModal = useCallback(() => {
    setShowTransitionModal(false);
    setEvaluation(null);
  }, []);

  return {
    // Estado
    evaluation,
    showTransitionModal,
    evaluationLoading,
    evaluationError,

    // Acciones
    evaluateAdaptationWeek,
    resetModal,
    setShowTransitionModal,
  };
}
