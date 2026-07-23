/**
 * Calistenia Manual Card - Arquitectura Modular Profesional v5.0
 * Componente principal para evaluación y selección de metodología calistenia
 * Refactorizado con patrones arquitecturales consistentes y separación de responsabilidades
 *
 * @author Claude Code - Arquitectura Modular Avanzada
 * @version 5.0.0 - Modular Architecture & Professional Standards
 */

import React, { useState, useEffect, useReducer } from 'react';
import {
  Brain,
  User,
  Target,
  Clock,
  Zap,
  CheckCircle,
  AlertTriangle,
  Database,
  Activity,
  Loader,
  Sparkles,
  Settings,
  TrendingUp,
  Shield
} from 'lucide-react';

// Configuraciones centralizadas
const CARD_CONFIG = {
  API_ENDPOINTS: {
    EVALUATE_PROFILE: '/api/calistenia-specialist/evaluate-profile'
  },
  PROGRESSION: {
    REQUIRED_COMPLETION_RATE: 80,
    BASE_WORKOUT_TIME: 45
  },
  VERSION: {
    COMPONENT: '5.0',
    API: '4.0'
  },
  THEME: {
    PRIMARY: 'yellow-400',
    SUCCESS: 'green-400',
    WARNING: 'orange-400',
    ERROR: 'red-400',
    BACKGROUND: 'black/40',
    BORDER: 'yellow-400/20'
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
    case 'SET_MUSCLE_GROUPS':
      return { ...state, selectedMuscleGroups: action.payload };
    case 'SET_ADVANCED_OPTIONS':
      return { ...state, showAdvancedOptions: action.payload };
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
  selectedMuscleGroups: [],
  showAdvancedOptions: false,
  showExercisePreview: false,
  exercisePreview: [],
  loadingPreview: false
};

// Importar configuraciones modulares
import { CALISTENIA_LEVELS, getLevelConfig, getLevelRecommendations } from './CalisteniaLevels.js';
import { getMuscleGroupInfo, getRecommendedGroupsByLevel, generateBalancedSplit } from './CalisteniaMuscleGroups.js';
import { CalisteniaExerciseDatabase, CalisteniaExerciseUtils } from '../../exercises/ExerciseDatabase.js';

// Importar contextos
import { useAuth } from '@/contexts/AuthContext';
import { useUserContext } from '@/contexts/UserContext';
import tokenManager from '../../../../utils/tokenManager';

// Utilidades de API centralizadas
const APIUtils = {
  async makeRequest(endpoint, options = {}) {
    const token = tokenManager.getToken();
    const defaultHeaders = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };

    try {
      const response = await fetch(endpoint, {
        ...options,
        headers: { ...defaultHeaders, ...options.headers }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`❌ API Request failed for ${endpoint}:`, error);
      throw error;
    }
  },

  async evaluateProfile(source = 'modal_evaluation_v5') {
    return this.makeRequest(CARD_CONFIG.API_ENDPOINTS.EVALUATE_PROFILE, {
      method: 'POST',
      body: JSON.stringify({ source })
    });
  }
};

// Utilidades de validación específicas
const CardValidationUtils = {
  validateEvaluationResult(result) {
    if (!result?.success) {
      throw new Error(result?.error || 'Error en evaluación de perfil');
    }

    if (!result.evaluation?.recommended_level) {
      throw new Error('Respuesta de evaluación inválida');
    }

    return true;
  },

  sanitizeUserInput(input) {
    return typeof input === 'string' ? input.trim() : '';
  },

  calculateProgressionMetrics(completedCount, totalCount) {
    if (totalCount === 0) return { rate: 0, canProgress: false };

    const rate = Math.round((completedCount / totalCount) * 100);
    const canProgress = rate >= CARD_CONFIG.PROGRESSION.REQUIRED_COMPLETION_RATE;

    return { rate, canProgress };
  }
};

export default function CalisteniaManualCard({ onGenerate, isLoading, error }) {
  const { currentUser, user } = useAuth();
  const { userData } = useUserContext();

  // Usar reducer para estado complejo
  const [state, dispatch] = useReducer(cardReducer, initialState);

  // Ejecutar evaluación IA al cargar el componente
  useEffect(() => {
    if (!state.aiEvaluation && !state.loadingEvaluation) {
      evaluateUserProfile();
    }
  }, []);

  /**
   * Evaluación automática del perfil con IA especializada - v5.0 Centralizada
   */
  const evaluateUserProfile = async () => {
    dispatch({ type: 'SET_EVALUATION_LOADING', payload: true });

    try {
      console.log(`🤖 Iniciando evaluación automática v${CARD_CONFIG.VERSION.COMPONENT}...`);

      const result = await APIUtils.evaluateProfile(`modal_evaluation_v${CARD_CONFIG.VERSION.COMPONENT}`);

      CardValidationUtils.validateEvaluationResult(result);

      console.log('✅ Evaluación completada:', {
        level: result.evaluation.recommended_level,
        confidence: result.evaluation.confidence,
        version: CARD_CONFIG.VERSION.COMPONENT
      });

      dispatch({ type: 'SET_AI_EVALUATION', payload: result.evaluation });

      // Pre-seleccionar grupos musculares recomendados
      const recommendedGroups = getRecommendedGroupsByLevel(result.evaluation.recommended_level);
      dispatch({ type: 'SET_MUSCLE_GROUPS', payload: recommendedGroups.map(group => group.id) });

    } catch (error) {
      console.error('❌ Error en evaluación IA:', error);
      dispatch({ type: 'SET_EVALUATION_ERROR', payload: error.message });
    }
  };

  /**
   * Generar plan directamente con IA especializada
   */
  const generateWithAI = async () => {
    if (!state.aiEvaluation) return;

    try {
      console.log('🚀 Generando plan con IA especializada...');

      const fullProfile = {
        id: userData?.id || user?.id || currentUser?.id
      };

      const calisteniaData = {
        methodology: 'Calistenia Specialist',
        source: 'ai_evaluation',
        level: state.aiEvaluation.recommended_level,
        confidence: state.aiEvaluation.confidence,
        goals: CardValidationUtils.sanitizeUserInput(state.userGoals) ||
               state.aiEvaluation.suggested_focus_areas?.join(', ') || '',
        selectedMuscleGroups: state.selectedMuscleGroups,
        aiEvaluation: state.aiEvaluation,
        userProfile: fullProfile,
        version: CARD_CONFIG.VERSION.COMPONENT
      };

      onGenerate(calisteniaData);

    } catch (error) {
      console.error('❌ Error generando con IA:', error);
      dispatch({ type: 'SET_EVALUATION_ERROR', payload: error.message });
    }
  };

  /**
   * Navegación entre pasos
   */
  const goToManualSelection = () => {
    dispatch({ type: 'SET_STEP', payload: 'manual_selection' });
  };

  const goToEvaluation = () => {
    dispatch({ type: 'SET_STEP', payload: 'evaluation' });
  };

  /**
   * Manejar selección manual de nivel
   */
  const handleManualLevelSelection = (levelKey) => {
    dispatch({ type: 'SET_SELECTED_LEVEL', payload: levelKey });
    const recommendedGroups = getRecommendedGroupsByLevel(levelKey);
    dispatch({ type: 'SET_MUSCLE_GROUPS', payload: recommendedGroups.map(group => group.id) });
  };

  /**
   * Manejar cambios en objetivos de usuario
   */
  const handleGoalsChange = (value) => {
    dispatch({ type: 'SET_USER_GOALS', payload: CardValidationUtils.sanitizeUserInput(value) });
  };

  /**
   * Generar con selección manual
   */
  const generateManually = () => {
    if (!state.selectedLevel) return;

    const levelConfig = getLevelConfig(state.selectedLevel);
    const recommendations = getLevelRecommendations(state.selectedLevel);
    const muscleGroupSplit = generateBalancedSplit(state.selectedLevel, recommendations.maxTrainingDaysPerWeek);

    const calisteniaData = {
      methodology: 'Calistenia Manual',
      source: 'manual_selection',
      level: state.selectedLevel,
      levelConfig: levelConfig,
      goals: CardValidationUtils.sanitizeUserInput(state.userGoals),
      selectedMuscleGroups: state.selectedMuscleGroups,
      trainingPlan: muscleGroupSplit,
      recommendations: recommendations,
      exercisePreview: state.exercisePreview,
      version: CARD_CONFIG.VERSION.COMPONENT
    };

    onGenerate(calisteniaData);
  };

  // Componentes modulares para renderizado
  const EvaluationHeader = () => (
    <div className="text-center mb-8">
      <div className="flex justify-center items-center gap-3 mb-4">
        <div className={`p-3 bg-${CARD_CONFIG.THEME.PRIMARY}/10 rounded-full`}>
          <Brain className={`w-8 h-8 text-${CARD_CONFIG.THEME.PRIMARY}`} />
        </div>
        <h2 className="text-3xl font-bold text-white">Evaluación IA Calistenia</h2>
        <span className={`text-xs px-2 py-1 bg-${CARD_CONFIG.THEME.SUCCESS}/20 text-${CARD_CONFIG.THEME.SUCCESS} rounded-full border border-${CARD_CONFIG.THEME.SUCCESS}/30`}>
          v{CARD_CONFIG.VERSION.COMPONENT} OPTIMIZADO
        </span>
      </div>
      <p className="text-gray-400 max-w-2xl mx-auto">
        Nuestro sistema IA especializado evalúa tu perfil para recomendarte el nivel óptimo de calistenia
      </p>
    </div>
  );

  const LoadingEvaluationState = () => (
    <div className="text-center py-8">
      <div className="relative">
        <Loader className={`w-12 h-12 animate-spin text-${CARD_CONFIG.THEME.PRIMARY} mx-auto mb-4`} />
        <div className={`absolute -top-1 -right-1 w-4 h-4 bg-${CARD_CONFIG.THEME.SUCCESS} rounded-full animate-pulse`}></div>
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">Analizando tu perfil...</h3>
      <p className="text-gray-400 mb-3">
        La IA está evaluando tu experiencia, objetivos y capacidades actuales
      </p>
      <div className={`inline-flex items-center gap-2 px-3 py-1 bg-${CARD_CONFIG.THEME.PRIMARY}/10 text-${CARD_CONFIG.THEME.PRIMARY} rounded-full text-sm border border-${CARD_CONFIG.THEME.PRIMARY}/30`}>
        <Sparkles className="w-4 h-4" />
        Optimización v{CARD_CONFIG.VERSION.API} - Análisis eficiente
      </div>
    </div>
  );

  const ErrorEvaluationState = () => (
    <div className="text-center py-8">
      <AlertTriangle className={`w-12 h-12 text-${CARD_CONFIG.THEME.ERROR} mx-auto mb-4`} />
      <h3 className={`text-xl font-semibold text-${CARD_CONFIG.THEME.ERROR} mb-2`}>Error en Evaluación</h3>
      <p className="text-gray-400 mb-4">{state.evaluationError}</p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={evaluateUserProfile}
          className={`px-4 py-2 bg-${CARD_CONFIG.THEME.PRIMARY} text-black rounded-lg hover:bg-yellow-300 transition-colors`}
        >
          Reintentar Evaluación
        </button>
        <button
          onClick={goToManualSelection}
          className={`px-4 py-2 bg-${CARD_CONFIG.THEME.BACKGROUND} border border-${CARD_CONFIG.THEME.BORDER} text-${CARD_CONFIG.THEME.PRIMARY} rounded-lg hover:bg-black/60 transition-colors`}
        >
          Elegir Nivel Manualmente
        </button>
      </div>
    </div>
  );

  const EvaluationResultSection = () => {
    if (!state.aiEvaluation) return null;

    return (
      <div>
        {/* Resultado principal */}
        <div className="flex items-start gap-4 mb-6">
          <div className={`p-3 bg-${CARD_CONFIG.THEME.SUCCESS}/10 rounded-full`}>
            <CheckCircle className={`w-8 h-8 text-${CARD_CONFIG.THEME.SUCCESS}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-white mb-2">
              Nivel Recomendado: <span className={`text-${CARD_CONFIG.THEME.PRIMARY}`}>
                {state.aiEvaluation.recommended_level.charAt(0).toUpperCase() + state.aiEvaluation.recommended_level.slice(1)}
              </span>
            </h3>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 bg-gray-700 rounded-full h-2">
                <div
                  className={`bg-${CARD_CONFIG.THEME.PRIMARY} h-2 rounded-full`}
                  style={{ width: `${Math.round(state.aiEvaluation.confidence * 100)}%` }}
                ></div>
              </div>
              <span className="text-sm text-gray-400">{Math.round(state.aiEvaluation.confidence * 100)}% confianza</span>
            </div>
            <p className="text-gray-300 text-sm">{state.aiEvaluation.reasoning}</p>
          </div>
        </div>

        {/* Indicadores clave */}
        {state.aiEvaluation.key_indicators?.length > 0 && (
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <TrendingUp className={`w-5 h-5 text-${CARD_CONFIG.THEME.PRIMARY}`} />
              Factores Clave Detectados
            </h4>
            <div className="grid md:grid-cols-2 gap-2">
              {state.aiEvaluation.key_indicators.map((indicator, index) => (
                <div key={index} className="flex items-center gap-2 text-sm text-gray-300">
                  <CheckCircle className={`w-4 h-4 text-${CARD_CONFIG.THEME.SUCCESS} flex-shrink-0`} />
                  {indicator}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Áreas de enfoque */}
        {state.aiEvaluation.suggested_focus_areas?.length > 0 && (
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <Target className={`w-5 h-5 text-${CARD_CONFIG.THEME.PRIMARY}`} />
              Áreas de Enfoque Recomendadas
            </h4>
            <div className="flex flex-wrap gap-2">
              {state.aiEvaluation.suggested_focus_areas.map((area, index) => (
                <span
                  key={index}
                  className={`px-3 py-1 bg-${CARD_CONFIG.THEME.PRIMARY}/10 text-${CARD_CONFIG.THEME.PRIMARY} border border-${CARD_CONFIG.THEME.PRIMARY}/30 rounded-full text-sm`}
                >
                  {area}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Consideraciones de seguridad */}
        {state.aiEvaluation.safety_considerations?.length > 0 && (
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <Shield className={`w-5 h-5 text-${CARD_CONFIG.THEME.WARNING}`} />
              Consideraciones de Seguridad
            </h4>
            <div className={`bg-${CARD_CONFIG.THEME.WARNING}/10 border border-${CARD_CONFIG.THEME.WARNING}/30 rounded-lg p-3`}>
              {state.aiEvaluation.safety_considerations.map((consideration, index) => (
                <div key={index} className="flex items-start gap-2 text-sm text-orange-300">
                  <AlertTriangle className={`w-4 h-4 text-${CARD_CONFIG.THEME.WARNING} mt-0.5 flex-shrink-0`} />
                  {consideration}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Botones de acción */}
        <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-600">
          <button
            onClick={generateWithAI}
            disabled={isLoading}
            className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all ${
              isLoading
                ? 'bg-gray-600 cursor-not-allowed text-gray-400'
                : `bg-${CARD_CONFIG.THEME.PRIMARY} text-black hover:bg-yellow-300 transform hover:scale-[1.02]`
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="w-5 h-5" />
              {isLoading ? 'Generando...' : 'Generar Plan con IA'}
            </div>
          </button>

          <button
            onClick={goToManualSelection}
            disabled={isLoading}
            className={`flex-1 px-6 py-3 rounded-xl font-semibold bg-${CARD_CONFIG.THEME.BACKGROUND} border border-${CARD_CONFIG.THEME.BORDER} text-${CARD_CONFIG.THEME.PRIMARY} hover:bg-black/60 transition-all`}
          >
            <div className="flex items-center justify-center gap-2">
              <Settings className="w-5 h-5" />
              Elegir Nivel Manualmente
            </div>
          </button>
        </div>
      </div>
    );
  };

  /**
   * Renderizar pantalla de evaluación IA
   */
  const renderEvaluationStep = () => (
    <div className="max-w-4xl mx-auto">
      <EvaluationHeader />

      <div className={`bg-${CARD_CONFIG.THEME.BACKGROUND} border border-${CARD_CONFIG.THEME.BORDER} rounded-xl p-6 mb-6`}>
        {state.loadingEvaluation ? (
          <LoadingEvaluationState />
        ) : state.evaluationError ? (
          <ErrorEvaluationState />
        ) : state.aiEvaluation ? (
          <EvaluationResultSection />
        ) : null}
      </div>
    </div>
  );

  // Componentes modulares para selección manual
  const ManualHeader = () => (
    <div className="text-center mb-8">
      <div className="flex justify-center items-center gap-3 mb-4">
        <div className={`p-3 bg-${CARD_CONFIG.THEME.PRIMARY}/10 rounded-full`}>
          <User className={`w-8 h-8 text-${CARD_CONFIG.THEME.PRIMARY}`} />
        </div>
        <h2 className="text-3xl font-bold text-white">Selección Manual</h2>
      </div>
      <p className="text-gray-400 max-w-2xl mx-auto">
        Elige tu nivel basándote en tu experiencia actual en calistenia
      </p>
    </div>
  );

  const LevelSelectionGrid = () => (
    <div className="mb-8">
      <h3 className="text-xl font-semibold mb-4 text-white flex items-center gap-2">
        <Target className={`w-5 h-5 text-${CARD_CONFIG.THEME.PRIMARY}`} />
        Selecciona tu nivel actual
      </h3>
      <div className="grid md:grid-cols-3 gap-4">
        {Object.entries(CALISTENIA_LEVELS).map(([key, level]) => (
          <div
            key={key}
            className={`p-5 rounded-xl border-2 cursor-pointer transition-all duration-300 hover:shadow-lg ${
              state.selectedLevel === key
                ? `bg-${CARD_CONFIG.THEME.PRIMARY}/10 border-${CARD_CONFIG.THEME.PRIMARY}/60 shadow-lg scale-105`
                : `bg-${CARD_CONFIG.THEME.BACKGROUND} border-${CARD_CONFIG.THEME.BORDER} hover:border-${CARD_CONFIG.THEME.PRIMARY}/40`
            }`}
            onClick={() => handleManualLevelSelection(key)}
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-lg flex items-center gap-2 text-white">
                {level.icon} {level.name}
              </h4>
              {state.selectedLevel === key && <CheckCircle className={`w-5 h-5 text-${CARD_CONFIG.THEME.SUCCESS}`} />}
            </div>
            <p className="text-sm mb-2 text-gray-400">{level.description}</p>
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <Clock className={`w-4 h-4 text-${CARD_CONFIG.THEME.PRIMARY}`} />
              {level.frequency}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const SelectedLevelHitos = () => {
    if (!state.selectedLevel) return null;

    return (
      <div className={`mb-8 p-6 bg-${CARD_CONFIG.THEME.BACKGROUND} border border-${CARD_CONFIG.THEME.BORDER} rounded-xl`}>
        <h3 className="text-xl font-semibold mb-4 text-white flex items-center gap-2">
          <Zap className={`w-5 h-5 text-${CARD_CONFIG.THEME.PRIMARY}`} />
          Hitos para nivel {CALISTENIA_LEVELS[state.selectedLevel].name}
        </h3>
        <div className="grid md:grid-cols-2 gap-3 mb-4">
          {CALISTENIA_LEVELS[state.selectedLevel].hitos.map((hito, index) => (
            <div key={index} className="flex items-start gap-3 p-3 bg-black/60 rounded-lg">
              <CheckCircle className={`w-5 h-5 text-${CARD_CONFIG.THEME.SUCCESS} mt-0.5 flex-shrink-0`} />
              <span className="text-sm text-gray-300">{hito}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const UserGoalsSection = () => {
    if (!state.selectedLevel) return null;

    return (
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4 text-white">
          Objetivos específicos (opcional)
        </h3>
        <textarea
          value={state.userGoals}
          onChange={(e) => handleGoalsChange(e.target.value)}
          placeholder="Ej: Enfocar en dominadas, mejorar handstand, tengo limitaciones en muñecas, busco desarrollar muscle-up..."
          className={`w-full p-4 bg-${CARD_CONFIG.THEME.BACKGROUND} border border-${CARD_CONFIG.THEME.PRIMARY}/30 text-white placeholder-gray-500 rounded-lg resize-none h-24 focus:ring-2 focus:ring-${CARD_CONFIG.THEME.PRIMARY} focus:border-transparent`}
        />
      </div>
    );
  };

  const ManualActionButtons = () => {
    if (!state.selectedLevel) return null;

    return (
      <div className="text-center flex gap-3">
        <button
          onClick={goToEvaluation}
          className={`px-6 py-3 bg-${CARD_CONFIG.THEME.BACKGROUND} border border-${CARD_CONFIG.THEME.BORDER} text-${CARD_CONFIG.THEME.PRIMARY} rounded-xl hover:bg-black/60 transition-colors`}
        >
          ← Volver a Evaluación IA
        </button>
        <button
          onClick={generateManually}
          disabled={isLoading}
          className={`flex-1 px-8 py-3 rounded-xl text-black font-semibold transition-all ${
            isLoading
              ? 'bg-gray-600 cursor-not-allowed'
              : `bg-${CARD_CONFIG.THEME.PRIMARY} hover:bg-yellow-300 transform hover:scale-[1.02]`
          }`}
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader className="w-5 h-5 animate-spin" />
              Generando plan...
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <Zap className="w-5 h-5" />
              Generar Plan Manual
            </div>
          )}
        </button>
      </div>
    );
  };

  /**
   * Renderizar selección manual
   */
  const renderManualSelection = () => (
    <div className="max-w-6xl mx-auto">
      <ManualHeader />
      <LevelSelectionGrid />
      <SelectedLevelHitos />
      <UserGoalsSection />
      <ManualActionButtons />
    </div>
  );

  // Componente de error global
  const GlobalErrorDisplay = () => {
    if (!error) return null;

    return (
      <div className={`mb-6 p-4 bg-${CARD_CONFIG.THEME.ERROR}/20 border border-${CARD_CONFIG.THEME.ERROR}/50 rounded-lg`}>
        <div className="flex items-start gap-3">
          <AlertTriangle className={`w-5 h-5 text-${CARD_CONFIG.THEME.ERROR} mt-0.5 flex-shrink-0`} />
          <div>
            <h3 className={`font-semibold text-${CARD_CONFIG.THEME.ERROR} mb-1`}>Error al generar el plan</h3>
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 bg-black text-white min-h-[80vh]">
      {isLoading && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60]">
          <div className="bg-black/90 border border-yellow-400/30 rounded-lg p-6 text-center shadow-xl">
            <svg className="w-10 h-10 text-yellow-400 animate-spin mx-auto mb-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
            </svg>
            <p className="text-white font-semibold">La IA está generando el entrenamiento</p>
          </div>
        </div>
      )}

      <GlobalErrorDisplay />
      {state.currentStep === 'evaluation' ? renderEvaluationStep() : renderManualSelection()}
    </div>
  );
}