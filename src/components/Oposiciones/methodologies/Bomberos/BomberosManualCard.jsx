/**
 * Bomberos Manual Card - Componente de evaluación y generación de plan
 * Basado en el patrón de HipertrofiaManualCard.jsx
 *
 * @author Claude Code - Sistema de Oposiciones
 * @version 1.0.0
 * @date 2025-10-20
 */

import React, { useState, useEffect, useReducer } from 'react';
import {
  Flame,
  User,
  Target,
  Clock,
  Zap,
  CheckCircle,
  AlertTriangle,
  Loader,
  Sparkles,
  Shield,
  Award,
  TrendingUp,
  Waves,
  Heart,
  Activity,
  Calendar
} from 'lucide-react';

// Configuraciones centralizadas
const CARD_CONFIG = {
  API_ENDPOINTS: {
    EVALUATE_PROFILE: '/api/routine-generation/specialist/bomberos/evaluate',
    GENERATE_PLAN: '/api/routine-generation/specialist/bomberos/generate'
  },
  VERSION: {
    COMPONENT: '1.0',
    API: '1.0'
  },
  THEME: {
    PRIMARY: 'orange-500',
    SUCCESS: 'green-400',
    WARNING: 'orange-400',
    ERROR: 'red-400',
    BACKGROUND: 'black/40',
    BORDER: 'orange-500/20'
  }
};

// Reducer para manejo de estado complejo
const cardReducer = (state, action) => {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, currentStep: action.payload };
    case 'SET_AI_EVALUATION':
      return {
        ...state,
        aiEvaluation: action.payload,
        loadingEvaluation: false,
        evaluationError: null
      };
    case 'SET_EVALUATION_LOADING':
      return {
        ...state,
        loadingEvaluation: action.payload,
        evaluationError: action.payload ? null : state.evaluationError
      };
    case 'SET_EVALUATION_ERROR':
      return {
        ...state,
        evaluationError: action.payload,
        loadingEvaluation: false
      };
    case 'SET_SELECTED_LEVEL':
      return { ...state, selectedLevel: action.payload };
    case 'SET_USER_GOALS':
      return { ...state, userGoals: action.payload };
    case 'SET_PRIORITY_TESTS':
      return { ...state, priorityTests: action.payload };
    case 'SET_DURATION':
      return { ...state, planDuration: action.payload };
    case 'RESET_STATE':
      return action.payload;
    default:
      return state;
  }
};

// Estado inicial
const initialState = {
  currentStep: 'evaluation',
  aiEvaluation: null,
  loadingEvaluation: false,
  evaluationError: null,
  selectedLevel: null,
  userGoals: '',
  priorityTests: [],
  planDuration: 12 // semanas por defecto
};

// Importar configuraciones modulares
import { BOMBEROS_LEVELS, getLevelConfig, getLevelRecommendations } from './BomberosLevels.js';
import { PRUEBAS_OFICIALES, getPruebaInfo, ESTRATEGIAS_EXAMEN, NOTA_BAREMOS } from './BomberosPruebas.js';

// Importar contextos
import { useAuth } from '@/contexts/AuthContext';
import { useUserContext } from '@/contexts/UserContext';

// Utilidades de API centralizadas
const APIUtils = {
  async makeRequest(endpoint, options = {}) {
    const token = localStorage.getItem('authToken');
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3010';
    const fullUrl = `${baseUrl}${endpoint}`;

    const defaultHeaders = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };

    try {
      const response = await fetch(fullUrl, {
        ...options,
        headers: { ...defaultHeaders, ...options.headers }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || errorData?.message || `Error ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`❌ API Request failed for ${endpoint}:`, error);
      throw error;
    }
  },

  async evaluateProfile(source = 'bomberos_evaluation_v1') {
    return this.makeRequest(CARD_CONFIG.API_ENDPOINTS.EVALUATE_PROFILE, {
      method: 'POST',
      body: JSON.stringify({ source })
    });
  },

  async generatePlan(planData) {
    return this.makeRequest(CARD_CONFIG.API_ENDPOINTS.GENERATE_PLAN, {
      method: 'POST',
      body: JSON.stringify(planData)
    });
  }
};

// Componente Principal
export default function BomberosManualCard({ onGenerate, isLoading: externalLoading, error: externalError }) {
  const [state, dispatch] = useReducer(cardReducer, initialState);
  const { user } = useAuth();
  const { userData } = useUserContext();

  // Efectos
  useEffect(() => {
    if (state.currentStep === 'evaluation' && !state.aiEvaluation && !state.loadingEvaluation) {
      handleEvaluateProfile();
    }
  }, [state.currentStep]);

  // Manejadores
  const handleEvaluateProfile = async () => {
    dispatch({ type: 'SET_EVALUATION_LOADING', payload: true });

    try {
      const result = await APIUtils.evaluateProfile();

      if (result?.success && result?.evaluation) {
        dispatch({ type: 'SET_AI_EVALUATION', payload: result.evaluation });
        dispatch({ type: 'SET_SELECTED_LEVEL', payload: result.evaluation.recommended_level });
      } else {
        throw new Error('Evaluación no válida');
      }
    } catch (error) {
      console.error('❌ Error evaluando perfil:', error);
      dispatch({
        type: 'SET_EVALUATION_ERROR',
        payload: error.message || 'Error evaluando tu perfil'
      });
    }
  };

  const handleLevelConfirm = () => {
    if (!state.selectedLevel) {
      alert('Por favor selecciona un nivel');
      return;
    }
    dispatch({ type: 'SET_STEP', payload: 'configuration' });
  };

  const handleConfigurationConfirm = () => {
    dispatch({ type: 'SET_STEP', payload: 'summary' });
  };

  const handleGeneratePlan = async () => {
    try {
      console.log('🚒 Generando plan de Bomberos con datos:', {
        level: state.selectedLevel,
        goals: state.userGoals,
        duration: state.planDuration,
        priorityTests: state.priorityTests
      });

      // Preparar datos para el backend
      const planData = {
        userProfile: {
          id: user?.id,
          ...userData
        },
        selectedLevel: state.selectedLevel, // CRÍTICO: Incluir selectedLevel
        goals: state.userGoals || 'Superar las pruebas físicas de Bombero',
        priorityTests: state.priorityTests,
        versionConfig: {
          version: '1.0',
          customWeeks: state.planDuration
        },
        methodology: 'Bomberos',
        source: 'manual_selection'
      };

      // Llamar al callback del padre con los datos
      if (onGenerate) {
        await onGenerate(planData);
      }
    } catch (error) {
      console.error('❌ Error generando plan:', error);
    }
  };

  // Funciones de renderizado
  const renderEvaluationStep = () => {
    if (state.loadingEvaluation) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader className="w-12 h-12 text-orange-400 animate-spin mb-4" />
          <p className="text-white text-lg">Evaluando tu perfil físico...</p>
          <p className="text-gray-400 text-sm mt-2">Analizando capacidades para oposiciones</p>
        </div>
      );
    }

    if (state.evaluationError) {
      return (
        <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-1" />
            <div>
              <h4 className="text-red-400 font-semibold">Error en evaluación</h4>
              <p className="text-gray-300 mt-1">{state.evaluationError}</p>
              <button
                onClick={handleEvaluateProfile}
                className="mt-3 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
              >
                Reintentar evaluación
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (!state.aiEvaluation) return null;

    const levelConfig = getLevelConfig(state.selectedLevel);

    return (
      <div className="space-y-6">
        {/* Resultado de evaluación */}
        <div className="bg-gradient-to-r from-orange-500/10 to-yellow-500/10 rounded-lg p-6 border border-orange-500/30">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-orange-500/20 rounded-xl">
              <Shield className="w-8 h-8 text-orange-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-white mb-2">Evaluación Completada</h3>
              <p className="text-gray-300 mb-3">{state.aiEvaluation.reasoning}</p>

              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm text-gray-400">Nivel recomendado:</span>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                  state.selectedLevel === 'principiante' ? 'bg-blue-500/30 text-blue-300' :
                  state.selectedLevel === 'intermedio' ? 'bg-yellow-500/30 text-yellow-300' :
                  'bg-red-500/30 text-red-300'
                }`}>
                  {levelConfig.displayName}
                </span>
                <span className="text-xs text-gray-500">
                  (Confianza: {Math.round((state.aiEvaluation.confidence || 0.75) * 100)}%)
                </span>
              </div>

              {/* Indicadores clave */}
              {state.aiEvaluation.key_indicators?.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-gray-400 mb-2">Factores clave:</p>
                  <div className="flex flex-wrap gap-2">
                    {state.aiEvaluation.key_indicators.map((indicator, idx) => (
                      <span key={idx} className="px-3 py-1 bg-black/40 rounded-full text-xs text-gray-300">
                        {indicator}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Áreas de enfoque */}
              {state.aiEvaluation.suggested_focus_areas?.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-semibold text-gray-400 mb-2">Áreas prioritarias:</p>
                  <ul className="space-y-1">
                    {state.aiEvaluation.suggested_focus_areas.map((area, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm text-gray-300">
                        <Target className="w-3 h-3 text-orange-400" />
                        <span>{area}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Selector de nivel */}
        <div>
          <h4 className="text-lg font-semibold text-white mb-3">Ajustar nivel si es necesario:</h4>
          <div className="grid gap-3">
            {Object.values(BOMBEROS_LEVELS).map((level) => (
              <button
                key={level.id}
                onClick={() => dispatch({ type: 'SET_SELECTED_LEVEL', payload: level.id })}
                className={`p-4 rounded-lg border-2 transition-all ${
                  state.selectedLevel === level.id
                    ? 'border-orange-400 bg-orange-500/20'
                    : 'border-gray-600 bg-black/40 hover:border-orange-500/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{level.icon}</span>
                    <div className="text-left">
                      <p className="font-semibold text-white">{level.displayName}</p>
                      <p className="text-sm text-gray-400">{level.description}</p>
                    </div>
                  </div>
                  {state.selectedLevel === level.id && (
                    <CheckCircle className="w-6 h-6 text-orange-400" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Botón continuar */}
        <button
          onClick={handleLevelConfirm}
          disabled={!state.selectedLevel}
          className="w-full py-3 px-6 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg transition-colors"
        >
          Continuar con configuración
        </button>
      </div>
    );
  };

  const renderConfigurationStep = () => {
    const levelConfig = getLevelConfig(state.selectedLevel);

    return (
      <div className="space-y-6">
        {/* Nivel seleccionado */}
        <div className="bg-orange-500/10 rounded-lg p-4 border border-orange-500/30">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">{levelConfig.icon}</span>
            <div>
              <p className="font-semibold text-white">{levelConfig.displayName}</p>
              <p className="text-sm text-gray-400">{levelConfig.trainingFrequency} • {levelConfig.sessionDuration}</p>
            </div>
          </div>
        </div>

        {/* Objetivos del usuario */}
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            Objetivo principal (opcional):
          </label>
          <textarea
            value={state.userGoals}
            onChange={(e) => dispatch({ type: 'SET_USER_GOALS', payload: e.target.value })}
            placeholder="Ej: Superar todas las pruebas con buena puntuación, mejorar natación y trepa..."
            className="w-full px-4 py-3 bg-black/60 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-400 resize-none"
            rows="3"
          />
        </div>

        {/* Pruebas prioritarias */}
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            Pruebas que necesitan más trabajo:
          </label>
          <div className="grid grid-cols-2 gap-2">
            {Object.values(PRUEBAS_OFICIALES).slice(0, 8).map((prueba) => (
              <label
                key={prueba.id}
                className="flex items-center gap-2 p-2 bg-black/40 rounded-lg hover:bg-orange-500/10 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={state.priorityTests.includes(prueba.id)}
                  onChange={(e) => {
                    const newTests = e.target.checked
                      ? [...state.priorityTests, prueba.id]
                      : state.priorityTests.filter(t => t !== prueba.id);
                    dispatch({ type: 'SET_PRIORITY_TESTS', payload: newTests });
                  }}
                  className="w-4 h-4 text-orange-500 rounded"
                />
                <span className="text-sm text-gray-300">{prueba.nombre}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Duración del plan */}
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            Duración del plan de preparación:
          </label>
          <div className="grid grid-cols-3 gap-3">
            {[8, 12, 16].map((weeks) => (
              <button
                key={weeks}
                onClick={() => dispatch({ type: 'SET_DURATION', payload: weeks })}
                className={`py-3 px-4 rounded-lg font-semibold transition-all ${
                  state.planDuration === weeks
                    ? 'bg-orange-500 text-white'
                    : 'bg-black/40 text-gray-300 hover:bg-orange-500/20'
                }`}
              >
                {weeks} semanas
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Recomendado: {state.selectedLevel === 'principiante' ? '12-16' : state.selectedLevel === 'intermedio' ? '8-12' : '8'} semanas
          </p>
        </div>

        {/* Botones de navegación */}
        <div className="flex gap-3">
          <button
            onClick={() => dispatch({ type: 'SET_STEP', payload: 'evaluation' })}
            className="flex-1 py-3 px-6 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
          >
            Volver
          </button>
          <button
            onClick={handleConfigurationConfirm}
            className="flex-1 py-3 px-6 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition-colors"
          >
            Revisar plan
          </button>
        </div>
      </div>
    );
  };

  const renderSummaryStep = () => {
    const levelConfig = getLevelConfig(state.selectedLevel);
    const recommendations = getLevelRecommendations(state.selectedLevel);

    return (
      <div className="space-y-6">
        {/* Resumen del plan */}
        <div className="bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-lg p-6 border border-orange-500/30">
          <div className="flex items-start gap-4 mb-4">
            <Flame className="w-10 h-10 text-orange-400" />
            <div>
              <h3 className="text-xl font-bold text-white mb-1">Plan de Preparación para Bomberos</h3>
              <p className="text-gray-300">Personalizado según tu evaluación y objetivos</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="bg-black/40 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Nivel</p>
              <p className="font-semibold text-white">{levelConfig.displayName}</p>
            </div>
            <div className="bg-black/40 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Duración</p>
              <p className="font-semibold text-white">{state.planDuration} semanas</p>
            </div>
            <div className="bg-black/40 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Frecuencia</p>
              <p className="font-semibold text-white">{levelConfig.trainingFrequency}</p>
            </div>
            <div className="bg-black/40 rounded-lg p-3">
              <p className="text-xs text-gray-400 mb-1">Sesiones</p>
              <p className="font-semibold text-white">{levelConfig.sessionDuration}</p>
            </div>
          </div>
        </div>

        {/* Estructura semanal */}
        <div>
          <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-orange-400" />
            Estructura semanal tipo
          </h4>
          <div className="space-y-2">
            {Object.entries(levelConfig.weeklyStructure).map(([dia, contenido]) => (
              <div key={dia} className="flex items-center gap-3 p-3 bg-black/40 rounded-lg">
                <span className="text-sm font-semibold text-orange-400 capitalize w-24">{dia}:</span>
                <span className="text-sm text-gray-300">{contenido}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Objetivos y pruebas prioritarias */}
        {(state.userGoals || state.priorityTests.length > 0) && (
          <div className="bg-black/40 rounded-lg p-4">
            {state.userGoals && (
              <div className="mb-3">
                <p className="text-sm font-semibold text-gray-400 mb-1">Tu objetivo:</p>
                <p className="text-gray-300">{state.userGoals}</p>
              </div>
            )}
            {state.priorityTests.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-400 mb-1">Pruebas prioritarias:</p>
                <div className="flex flex-wrap gap-2">
                  {state.priorityTests.map(testId => {
                    const prueba = getPruebaInfo(testId);
                    return prueba ? (
                      <span key={testId} className="px-3 py-1 bg-orange-500/20 rounded-full text-xs text-orange-300">
                        {prueba.nombre}
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Información importante */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-yellow-400 mb-1">Importante</p>
              <ul className="text-xs text-gray-300 space-y-1">
                <li>• El plan incluye las 9 pruebas oficiales de Bombero</li>
                <li>• Progresión adaptada a tu nivel actual</li>
                <li>• Simulacros periódicos para evaluar progreso</li>
                <li>• Ajustes automáticos según tu evolución</li>
                <li>• {NOTA_BAREMOS}</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Botones finales */}
        <div className="flex gap-3">
          <button
            onClick={() => dispatch({ type: 'SET_STEP', payload: 'configuration' })}
            className="flex-1 py-3 px-6 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
          >
            Volver
          </button>
          <button
            onClick={handleGeneratePlan}
            disabled={externalLoading}
            className="flex-1 py-3 px-6 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 disabled:from-gray-600 disabled:to-gray-700 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2"
          >
            {externalLoading ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generar Plan de Bomberos
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  // Renderizado principal
  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-t-lg p-6 border-b border-orange-500/30">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-orange-500/20 rounded-xl">
            <Flame className="w-10 h-10 text-orange-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Preparación Oposiciones Bomberos</h2>
            <p className="text-gray-400 mt-1">Sistema especializado de entrenamiento para pruebas físicas</p>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-2 mt-6">
          {['evaluation', 'configuration', 'summary'].map((step, idx) => (
            <React.Fragment key={step}>
              <div className={`flex items-center gap-2 ${
                state.currentStep === step ? 'text-orange-400' :
                ['evaluation', 'configuration', 'summary'].indexOf(state.currentStep) > idx ? 'text-green-400' : 'text-gray-500'
              }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                  state.currentStep === step ? 'border-orange-400 bg-orange-500/20' :
                  ['evaluation', 'configuration', 'summary'].indexOf(state.currentStep) > idx ? 'border-green-400 bg-green-500/20' : 'border-gray-600 bg-black/40'
                }`}>
                  {['evaluation', 'configuration', 'summary'].indexOf(state.currentStep) > idx ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <span className="text-sm font-semibold">{idx + 1}</span>
                  )}
                </div>
                <span className="text-sm font-medium hidden sm:inline">
                  {step === 'evaluation' ? 'Evaluación' :
                   step === 'configuration' ? 'Configuración' : 'Resumen'}
                </span>
              </div>
              {idx < 2 && (
                <div className={`flex-1 h-0.5 ${
                  ['evaluation', 'configuration', 'summary'].indexOf(state.currentStep) > idx ? 'bg-green-400' : 'bg-gray-600'
                }`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="bg-gray-900 rounded-b-lg p-6">
        {state.currentStep === 'evaluation' && renderEvaluationStep()}
        {state.currentStep === 'configuration' && renderConfigurationStep()}
        {state.currentStep === 'summary' && renderSummaryStep()}

        {/* Error externo */}
        {externalError && (
          <div className="mt-4 bg-red-900/20 border border-red-500/50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-400 font-semibold">Error</p>
                <p className="text-gray-300 text-sm mt-1">{externalError}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}