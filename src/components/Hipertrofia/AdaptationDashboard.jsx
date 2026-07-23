import React, { useState, useEffect, useCallback } from 'react';
import {
  Target, CheckCircle, XCircle, Clock, TrendingUp,
  Activity, Brain, Weight, Users, AlertCircle,
  ArrowRight, BarChart3, ChevronRight, Dumbbell,
  AlertTriangle, ThumbsUp, ChevronDown, ChevronUp
} from 'lucide-react';
import { useTrace } from '../../contexts/TraceContext';
import tokenManager from '../../utils/tokenManager';

/**
 * Dashboard del Bloque de Adaptación
 * Visualización mejorada de criterios de transición según teoría MindFeed
 *
 * @version 2.1.0 - Añadida sección de ejercicios problemáticos con RIR
 */
const AdaptationDashboard = ({
  userId,
  onTransitionReady,
  onGenerateD1D5
}) => {
  const { track } = useTrace();
  const [adaptationData, setAdaptationData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTransitionModal, setShowTransitionModal] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [weeklyData, setWeeklyData] = useState([]);
  const [problemExercises, setProblemExercises] = useState(null);
  const [showProblems, setShowProblems] = useState(true);

  // Trace: Montaje del dashboard
  useEffect(() => {
    track('adaptation_dashboard_mounted', {
      userId,
      component: 'AdaptationDashboard'
    });
  }, [userId, track]);

  const fetchAdaptationProgress = useCallback(async () => {
    track('adaptation_progress_fetch_start', {
      userId,
      component: 'AdaptationDashboard'
    });

    setLoading(true);
    try {
      const response = await fetch('/api/adaptation/progress', {
        headers: {
          'Authorization': `Bearer ${tokenManager.getToken()}`
        }
      });

      const data = await response.json();

      track('adaptation_progress_fetch_result', {
        userId,
        hasActiveBlock: data.hasActiveBlock,
        readyForTransition: data.block?.readyForTransition,
        currentWeek: data.block?.latestWeek,
        criteriaMet: data.block?.readyForTransition ? 4 : 'checking'
      });

      if (data.success && data.hasActiveBlock) {
        setAdaptationData(data);
        setWeeklyData(data.weeks || []);

        // Auto-mostrar modal si está listo para transición
        if (data.block?.readyForTransition && !showTransitionModal) {
          track('adaptation_auto_show_transition_modal', {
            userId,
            reason: 'ready_for_transition'
          });
          setShowTransitionModal(true);
        }
      } else {
        track('adaptation_no_active_block', {
          userId,
          reason: 'no adaptation block found'
        });
      }
    } catch (error) {
      track('adaptation_progress_fetch_error', {
        userId,
        error: error.message
      });
      console.error('Error obteniendo progreso de adaptación:', error);
    } finally {
      setLoading(false);
    }
  }, [showTransitionModal, userId, track]);

  // Fetch ejercicios problemáticos
  const fetchProblemExercises = useCallback(async () => {
    try {
      const response = await fetch('/api/adaptation/problem-exercises', {
        headers: {
          'Authorization': `Bearer ${tokenManager.getToken()}`
        }
      });

      const data = await response.json();

      if (data.success) {
        setProblemExercises(data);
        track('problem_exercises_loaded', {
          userId,
          criticalCount: data.summary?.criticalCount,
          warningCount: data.summary?.warningCount,
          overallStatus: data.summary?.overallStatus
        });
      }
    } catch (error) {
      console.error('Error obteniendo ejercicios problemáticos:', error);
    }
  }, [userId, track]);

  useEffect(() => {
    if (userId) {
      fetchAdaptationProgress();
      fetchProblemExercises();
    }
  }, [userId, fetchAdaptationProgress, fetchProblemExercises]);

  const handleTransition = async () => {
    track('adaptation_transition_start', {
      userId,
      blockId: adaptationData?.block?.id,
      component: 'AdaptationDashboard'
    });

    setTransitioning(true);
    try {
      const response = await fetch('/api/adaptation/transition', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenManager.getToken()}`
        }
      });

      const data = await response.json();

      track('adaptation_transition_result', {
        userId,
        success: data.success,
        willGenerateD1D5: !!onGenerateD1D5,
        component: 'AdaptationDashboard'
      });

      if (data.success) {
        if (onTransitionReady) {
          track('adaptation_onTransitionReady_called', { userId });
          onTransitionReady();
        }
        // Generar automáticamente plan D1-D5
        if (onGenerateD1D5) {
          track('adaptation_onGenerateD1D5_called', { userId });
          onGenerateD1D5();
        }
      }
    } catch (error) {
      track('adaptation_transition_error', {
        userId,
        error: error.message,
        component: 'AdaptationDashboard'
      });
      console.error('Error en transición:', error);
    } finally {
      setTransitioning(false);
      setShowTransitionModal(false);
    }
  };

  const handleReportTechnique = async (exerciseId) => {
    track('adaptation_report_technique_start', {
      userId,
      exerciseId,
      component: 'AdaptationDashboard'
    });

    // Abrir modal para reportar flag técnico
    const flagType = prompt('Tipo de problema técnico:\n1. ROM incorrecto\n2. Postura inadecuada\n3. Uso de impulso\n4. Movimiento inestable\n5. Patrón compensatorio\n6. Dolor');

    if (flagType) {
      const flagTypes = ['incorrect_rom', 'poor_posture', 'excessive_momentum',
                         'unstable_movement', 'compensation_pattern', 'pain_reported'];
      const selectedFlag = flagTypes[parseInt(flagType) - 1];

      track('adaptation_report_technique_selected', {
        userId,
        exerciseId,
        flagType: selectedFlag,
        flagNumber: parseInt(flagType)
      });

      try {
        await fetch('/api/adaptation/technique-flag', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tokenManager.getToken()}`
          },
          body: JSON.stringify({
            exerciseId,
            flagType: selectedFlag,
            severity: 'moderate'
          })
        });

        track('adaptation_report_technique_success', {
          userId,
          exerciseId,
          flagType: selectedFlag
        });

        fetchAdaptationProgress(); // Refrescar datos
      } catch (error) {
        track('adaptation_report_technique_error', {
          userId,
          exerciseId,
          flagType: selectedFlag,
          error: error.message
        });
        console.error('Error reportando flag:', error);
      }
    } else {
      track('adaptation_report_technique_cancelled', {
        userId,
        exerciseId
      });
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-8 text-center">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-700 rounded w-1/2 mx-auto mb-4"></div>
          <div className="h-4 bg-gray-700 rounded w-3/4 mx-auto"></div>
        </div>
      </div>
    );
  }

  if (!adaptationData?.hasActiveBlock) {
    // Panel para iniciar adaptación
    return (
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-8 border border-blue-800/40">
        <div className="text-center">
          <Activity className="h-16 w-16 text-blue-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">
            Bloque de Adaptación Inicial
          </h2>
          <p className="text-gray-400 mb-6 max-w-lg mx-auto">
            Como eres principiante, es OBLIGATORIO completar 1-3 semanas de adaptación
            antes de comenzar el programa D1-D5 completo.
          </p>
          
          <div className="grid grid-cols-2 gap-4 max-w-lg mx-auto mb-6">
            <div className="bg-gray-800 rounded-lg p-4">
              <Users className="h-8 w-8 text-blue-500 mx-auto mb-2" />
              <h3 className="font-semibold">Full Body</h3>
              <p className="text-sm text-gray-400">4 días/semana</p>
              <p className="text-xs text-gray-400">Circuito completo</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-4">
              <BarChart3 className="h-8 w-8 text-blue-500 mx-auto mb-2" />
              <h3 className="font-semibold">Half Body</h3>
              <p className="text-sm text-gray-400">5 días/semana</p>
              <p className="text-xs text-gray-400">A/B alternado</p>
            </div>
          </div>
          
          <button
            onClick={() => {
              track('adaptation_create_block_button_clicked', {
                userId,
                reason: 'no_active_block',
                component: 'AdaptationDashboard'
              });
              // '/adaptation/create' no existe en el router (pantalla en blanco).
              // El bloque se crea desde la selección de metodología; volvemos allí.
              window.location.href = '/methodologies';
            }}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Iniciar Bloque de Adaptación
          </button>
          
          <div className="mt-6 text-sm text-gray-400">
            <p>✓ Duración: 1-3 semanas según progreso</p>
            <p>✓ RIR objetivo: 3-4 (sin llegar al fallo)</p>
            <p>✓ Transición automática al cumplir criterios</p>
          </div>
        </div>
      </div>
    );
  }

  const { block, latestCriteria } = adaptationData;
  const currentWeek = block.latestWeek || 1;
  const progress = (block.weeksTracked / block.durationWeeks) * 100;

  // Calcular criterios cumplidos
  const criteriaCount = [
    latestCriteria?.adherence?.met,
    latestCriteria?.rir?.met,
    latestCriteria?.technique?.met,
    latestCriteria?.progress?.met
  ].filter(Boolean).length;

  return (
    <>
      <div className="bg-gray-800 rounded-lg shadow-sm">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-gradient-to-r from-gray-800 to-gray-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Activity className="h-6 w-6 text-blue-600" />
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Bloque de Adaptación - {block.blockType.replace('_', ' ').toUpperCase()}
                </h2>
                <p className="text-sm text-gray-400">
                  Semana {currentWeek} de {block.durationWeeks}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                block.readyForTransition 
                  ? 'bg-green-100 text-green-800'
                  : progress >= 66 
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-700 text-gray-100'
              }`}>
                {block.readyForTransition ? 'Listo para D1-D5' : `${Math.round(progress)}% Completado`}
              </span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-6 py-4 border-b">
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-gray-400">Progreso general</span>
            <span className="font-medium">{criteriaCount}/4 criterios cumplidos</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-3">
            <div 
              className={`h-3 rounded-full transition-all duration-500 ${
                criteriaCount === 4 ? 'bg-green-500' :
                criteriaCount >= 2 ? 'bg-yellow-500' : 'bg-blue-500'
              }`}
              style={{ width: `${(criteriaCount / 4) * 100}%` }}
            />
          </div>
        </div>

        {/* Criterios */}
        <div className="p-6">
          <div className="flex items-start gap-2 mb-3 text-sm text-gray-400">
            <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5" />
            <p>
              Completa estos criterios de adaptación para poder transicionar al ciclo completo de Hipertrofia D1-D5.
            </p>
          </div>

          <h3 className="text-lg font-semibold text-white mb-4">
            Criterios de Transición a Hipertrofia D1-D5
          </h3>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Criterio 1: Adherencia */}
            <div className={`rounded-lg p-4 border-2 ${
              latestCriteria?.adherence?.met 
                ? 'bg-green-50 border-green-200' 
                : 'bg-gray-800/60 border-gray-700'
            }`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2">
                  {latestCriteria?.adherence?.met ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-gray-400" />
                  )}
                  <div>
                    <p className="font-medium text-white">Adherencia</p>
                    <p className="text-sm text-gray-400">
                      {Math.round(latestCriteria?.adherence?.value || 0)}% 
                      <span className="text-gray-400"> (objetivo: {latestCriteria?.adherence?.threshold}%)</span>
                    </p>
                  </div>
                </div>
                <Target className="h-4 w-4 text-gray-400" />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Completar 4/5 sesiones semanales
              </p>
            </div>

            {/* Criterio 2: RIR */}
            <div className={`rounded-lg p-4 border-2 ${
              latestCriteria?.rir?.met
                ? 'bg-green-50 border-green-200'
                : 'bg-gray-800/60 border-gray-700'
            }`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2">
                  {latestCriteria?.rir?.met ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-gray-400" />
                  )}
                  <div>
                    <p className="font-medium text-white">Control RIR</p>
                    <p className="text-sm text-gray-400">
                      Media: {latestCriteria?.rir?.value != null ? Number(latestCriteria.rir.value).toFixed(1) : 'N/A'}
                      <span className="text-gray-400"> (objetivo: ≤{latestCriteria?.rir?.threshold})</span>
                    </p>
                  </div>
                </div>
                <Brain className="h-4 w-4 text-gray-400" />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Control del esfuerzo adecuado
              </p>
            </div>

            {/* Criterio 3: Técnica */}
            <div className={`rounded-lg p-4 border-2 ${
              latestCriteria?.technique?.met
                ? 'bg-green-50 border-green-200'
                : 'bg-gray-800/60 border-gray-700'
            }`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2">
                  {latestCriteria?.technique?.met ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-gray-400" />
                  )}
                  <div>
                    <p className="font-medium text-white">Técnica</p>
                    <p className="text-sm text-gray-400">
                      {latestCriteria?.technique?.flags_count || 0} flags
                      <span className="text-gray-400"> (objetivo: &lt;{latestCriteria?.technique?.threshold})</span>
                    </p>
                  </div>
                </div>
                <Activity className="h-4 w-4 text-gray-400" />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Ejecución técnica correcta
              </p>
              <button
                onClick={() => handleReportTechnique()}
                className="text-xs text-blue-600 hover:text-blue-700 mt-1"
              >
                Reportar problema técnico
              </button>
            </div>

            {/* Criterio 4: Progreso */}
            <div className={`rounded-lg p-4 border-2 ${
              latestCriteria?.progress?.met
                ? 'bg-green-50 border-green-200'
                : 'bg-gray-800/60 border-gray-700'
            }`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2">
                  {latestCriteria?.progress?.met ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-gray-400" />
                  )}
                  <div>
                    <p className="font-medium text-white">Progreso Carga</p>
                    <p className="text-sm text-gray-400">
                      +{Math.round(latestCriteria?.progress?.value || 0)}%
                      <span className="text-gray-400"> (objetivo: ≥{latestCriteria?.progress?.threshold}%)</span>
                    </p>
                  </div>
                </div>
                <Weight className="h-4 w-4 text-gray-400" />
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Adaptación neuromuscular
              </p>
            </div>
          </div>

          {/* Histórico semanal */}
          {weeklyData.length > 0 && (
            <div className="mt-6 pt-6 border-t">
              <h4 className="text-sm font-medium text-gray-300 mb-3">
                Histórico semanal
              </h4>
              <div className="space-y-2">
                {weeklyData.map((week) => (
                  <div key={week.week_number} className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Semana {week.week_number}</span>
                    <div className="flex space-x-4">
                      <span className={week.adherence_met ? 'text-green-600' : 'text-gray-400'}>
                        Adherencia {Number(week.adherence_percentage ?? 0).toFixed(0)}%
                      </span>
                      <span className={week.rir_met ? 'text-green-600' : 'text-gray-400'}>
                        RIR {week.mean_rir != null ? Number(week.mean_rir).toFixed(1) : 'N/A'}
                      </span>
                      <span className={week.technique_met ? 'text-green-600' : 'text-gray-400'}>
                        Técnica ✓
                      </span>
                      <span className={week.progress_met ? 'text-green-600' : 'text-gray-400'}>
                        Progreso +{Number(week.weight_progress_percentage ?? 0).toFixed(0)}%
                      </span>
                    </div>
                    {week.all_criteria_met && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 🆕 Sección de Ejercicios Problemáticos */}
          {problemExercises && (problemExercises.exercises?.problems?.length > 0 || problemExercises.exercises?.tooEasy?.length > 0) && (
            <div className="mt-6 pt-6 border-t">
              <button
                onClick={() => setShowProblems(!showProblems)}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`h-5 w-5 ${
                    problemExercises.summary?.criticalCount > 0
                      ? 'text-red-500'
                      : problemExercises.summary?.warningCount > 0
                        ? 'text-yellow-500'
                        : 'text-blue-500'
                  }`} />
                  <h4 className="text-sm font-medium text-gray-300">
                    Ejercicios a mejorar ({problemExercises.exercises?.problems?.length || 0} problemas)
                  </h4>
                </div>
                {showProblems ? (
                  <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
              </button>

              {showProblems && (
                <div className="mt-4 space-y-3">
                  {/* Mensaje general */}
                  <div className={`p-3 rounded-lg text-sm ${
                    problemExercises.summary?.overallStatus === 'needs_attention'
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : problemExercises.summary?.overallStatus === 'minor_issues'
                        ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                        : 'bg-green-50 text-green-700 border border-green-200'
                  }`}>
                    {problemExercises.message}
                  </div>

                  {/* Ejercicios críticos/warning */}
                  {problemExercises.exercises?.problems?.length > 0 && (
                    <div className="space-y-2">
                      <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        🔴 Ejercicios con RIR muy bajo (llegando al fallo)
                      </h5>
                      {problemExercises.exercises.problems.map((ex, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg border-l-4 ${
                            ex.status === 'critical'
                              ? 'bg-red-50 border-red-500'
                              : 'bg-yellow-50 border-yellow-500'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-white">{ex.name}</p>
                              <p className="text-sm text-gray-400">
                                RIR medio: <span className={`font-bold ${
                                  ex.avgRir < 1 ? 'text-red-600' : 'text-yellow-600'
                                }`}>{ex.avgRir}</span>
                                <span className="text-gray-400"> (objetivo: 3-4)</span>
                              </p>
                            </div>
                            <div className="text-right text-xs text-gray-400">
                              <p>{ex.setsCount} series</p>
                              <p>{ex.avgWeight} kg</p>
                            </div>
                          </div>
                          <p className="mt-2 text-sm text-gray-300 bg-gray-800/50 p-2 rounded">
                            💡 {ex.recommendation}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ejercicios demasiado fáciles */}
                  {problemExercises.exercises?.tooEasy?.length > 0 && (
                    <div className="space-y-2 mt-4">
                      <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        🟢 Ejercicios demasiado ligeros
                      </h5>
                      {problemExercises.exercises.tooEasy.map((ex, idx) => (
                        <div key={idx} className="p-3 rounded-lg bg-blue-900/20 border-l-4 border-blue-400">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-white">{ex.name}</p>
                              <p className="text-sm text-gray-400">
                                RIR medio: <span className="font-bold text-blue-600">{ex.avgRir}</span>
                                <span className="text-gray-400"> (demasiado alto)</span>
                              </p>
                            </div>
                            <div className="text-right text-xs text-gray-400">
                              <p>{ex.setsCount} series</p>
                              <p>{ex.avgWeight} kg</p>
                            </div>
                          </div>
                          <p className="mt-2 text-sm text-gray-300 bg-gray-800/50 p-2 rounded">
                            💡 {ex.recommendation}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ejercicios OK */}
                  {problemExercises.exercises?.ok?.length > 0 && (
                    <div className="mt-4">
                      <button
                        onClick={() => track('show_ok_exercises_clicked', { userId })}
                        className="text-xs text-gray-400 hover:text-gray-300 flex items-center gap-1"
                      >
                        <ThumbsUp className="h-3 w-3" />
                        {problemExercises.exercises.ok.length} ejercicios con buen control de RIR
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Mensaje de estado */}
          <div className={`mt-6 p-4 rounded-lg ${
            block.readyForTransition
              ? 'bg-green-50 border border-green-200'
              : criteriaCount >= 2
                ? 'bg-yellow-50 border border-yellow-200'
                : 'bg-blue-900/20 border border-blue-800'
          }`}>
            <div className="flex items-start space-x-2">
              {block.readyForTransition ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-900">
                      ¡Felicitaciones! Estás listo para el programa principal
                    </p>
                    <p className="text-sm text-green-700 mt-1">
                      Has cumplido todos los criterios de adaptación.
                      Puedes transicionar al ciclo D1-D5 de Hipertrofia.
                    </p>
                    <button
                      onClick={() => {
                        track('adaptation_transition_button_clicked', {
                          userId,
                          criteriaMet: criteriaCount,
                          component: 'AdaptationDashboard'
                        });
                        setShowTransitionModal(true);
                      }}
                      className="mt-3 bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center space-x-2"
                    >
                      <span>Iniciar Transición a D1-D5</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <Clock className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-white">
                      Continúa con tu adaptación
                    </p>
                    <p className="text-sm text-gray-400 mt-1">
                      {criteriaCount === 0
                        ? 'Enfócate en completar las sesiones y mejorar tu técnica.'
                        : criteriaCount === 1
                          ? 'Buen progreso. Sigue trabajando en los criterios pendientes.'
                          : criteriaCount === 2
                            ? 'Vas muy bien. Solo faltan algunos criterios más.'
                            : 'Casi listo. Un último esfuerzo para completar todos los criterios.'
                      }
                    </p>
                    {criteriaCount < 2 && (
                      <div className="mt-2 text-xs text-gray-400">
                        Tiempo estimado restante: {block.durationWeeks - currentWeek + 1} semana(s)
                      </div>
                    )}
                    
                    {/* Botón para ir a entrenar */}
                    <button
                      onClick={() => window.location.href = '/routines'}
                      className="mt-3 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2"
                    >
                      <Dumbbell className="h-4 w-4" />
                      <span>Ir a Entrenar</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de transición */}
      {showTransitionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg max-w-md w-full p-6">
            <div className="text-center">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">
                ¡Adaptación Completada!
              </h2>
              <p className="text-gray-400 mb-6">
                Has cumplido todos los criterios necesarios. 
                Ahora estás listo para comenzar el programa completo de Hipertrofia con el ciclo D1-D5.
              </p>
              
              <div className="bg-blue-900/20 rounded-lg p-4 mb-6">
                <h3 className="font-semibold text-blue-900 mb-2">
                  ¿Qué esperar del programa D1-D5?
                </h3>
                <ul className="text-sm text-blue-700 space-y-1 text-left">
                  <li>• 5 días de entrenamiento (Lun-Vie)</li>
                  <li>• {adaptationData.evaluation?.current_level === 'Principiante' ? '10' : '12'} semanas de duración</li>
                  <li>• Progresión automática +2.5% semanal</li>
                  <li>• Deload cada 6 semanas</li>
                  <li>• Tracking completo con RIR</li>
                </ul>
              </div>
              
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowTransitionModal(false)}
                  className="flex-1 py-2 px-4 border border-gray-600 rounded-lg font-medium hover:bg-gray-800/60"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleTransition}
                  disabled={transitioning}
                  className="flex-1 py-2 px-4 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 flex items-center justify-center space-x-2"
                >
                  {transitioning ? (
                    <span>Procesando...</span>
                  ) : (
                    <>
                      <span>Generar Plan D1-D5</span>
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdaptationDashboard;
