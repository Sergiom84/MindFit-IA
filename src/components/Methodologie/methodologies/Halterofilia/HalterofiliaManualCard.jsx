/**
 * Halterofilia Manual Card - Arquitectura Modular Profesional v1.0
 * Componente principal para evaluación y selección de metodología halterofilia
 * Basado en el patrón de CalisteniaManualCard.jsx
 *
 * @author Claude Code - Arquitectura Modular Avanzada
 * @version 1.0.0 - Halterofilia Implementation
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
  Loader,
  Sparkles,
  Settings,
  TrendingUp,
  Shield
} from 'lucide-react';

// Configuraciones centralizadas
const CARD_CONFIG = {
  API_ENDPOINTS: {
    EVALUATE_PROFILE: '/api/halterofilia-specialist/evaluate-profile'
  },
  VERSION: {
    COMPONENT: '1.0',
    API: '1.0'
  },
  THEME: {
    PRIMARY: 'yellow-400',
    SUCCESS: 'green-400',
    WARNING: 'orange-400',
    ERROR: 'red-400',
    BACKGROUND: 'black/40',
    BORDER: 'yellow-400/20',
    HALTEROFILIA: 'red-500'
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
  selectedMuscleGroups: []
};

// Importar configuraciones modulares
import { HALTEROFILIA_LEVELS, getAllLevels, getLevelConfig } from './HalterofiliaLevels';
import { HALTEROFILIA_MUSCLE_GROUPS, getAllMuscleGroups } from './HalterofiliaMuscleGroups';

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

  async evaluateProfile(source = 'modal_evaluation_v1') {
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
  }
};

export default function HalterofíliaManualCard({ onGenerate, isLoading, error }) {
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
   * Evaluación automática del perfil con IA especializada - v1.0 Halterofilia
   */
  const evaluateUserProfile = async () => {
    dispatch({ type: 'SET_EVALUATION_LOADING', payload: true });

    try {
      console.log(`🏋️ Iniciando evaluación Halterofilia v${CARD_CONFIG.VERSION.COMPONENT}...`);

      const result = await APIUtils.evaluateProfile(`modal_evaluation_v${CARD_CONFIG.VERSION.COMPONENT}`);

      CardValidationUtils.validateEvaluationResult(result);

      console.log('✅ Evaluación Halterofilia completada:', {
        level: result.evaluation.recommended_level,
        confidence: result.evaluation.confidence,
        version: CARD_CONFIG.VERSION.COMPONENT
      });

      dispatch({ type: 'SET_AI_EVALUATION', payload: result.evaluation });

      // Pre-seleccionar grupos musculares por defecto
      dispatch({ type: 'SET_MUSCLE_GROUPS', payload: ['snatch', 'clean_jerk', 'fuerza_base'] });

    } catch (error) {
      console.error('❌ Error en evaluación IA Halterofilia:', error);
      dispatch({ type: 'SET_EVALUATION_ERROR', payload: error.message });
    }
  };

  /**
   * Generar plan directamente con IA especializada
   */
  const generateWithAI = async () => {
    if (!state.aiEvaluation) return;

    try {
      console.log('🚀 Generando plan Halterofilia con IA especializada...');

      const fullProfile = {
        id: userData?.id || user?.id || currentUser?.id
      };

      const halterofíliaData = {
        methodology: 'Halterofilia Specialist',
        source: 'ai_evaluation',
        level: state.aiEvaluation.recommended_level,
        confidence: state.aiEvaluation.confidence,
        goals: CardValidationUtils.sanitizeUserInput(state.userGoals) ||
               'Desarrollar técnica olímpica y fuerza aplicada',
        selectedMuscleGroups: state.selectedMuscleGroups,
        aiEvaluation: state.aiEvaluation,
        userProfile: fullProfile,
        version: CARD_CONFIG.VERSION.COMPONENT
      };

      onGenerate(halterofíliaData);

    } catch (error) {
      console.error('❌ Error generando con IA Halterofilia:', error);
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
    // Pre-seleccionar grupos por defecto
    dispatch({ type: 'SET_MUSCLE_GROUPS', payload: ['snatch', 'clean_jerk', 'fuerza_base'] });
  };

  /**
   * Manejar cambios en objetivos de usuario
   */
  const handleGoalsChange = (value) => {
    dispatch({ type: 'SET_USER_GOALS', payload: CardValidationUtils.sanitizeUserInput(value) });
  };

  /**
   * Toggle de grupo muscular
   */
  const toggleMuscleGroup = (groupId) => {
    const newGroups = state.selectedMuscleGroups.includes(groupId)
      ? state.selectedMuscleGroups.filter(g => g !== groupId)
      : [...state.selectedMuscleGroups, groupId];

    dispatch({ type: 'SET_MUSCLE_GROUPS', payload: newGroups });
  };

  /**
   * Generar con selección manual
   */
  const generateManually = () => {
    if (!state.selectedLevel) return;

    const levelConfig = getLevelConfig(state.selectedLevel);

    const halterofíliaData = {
      methodology: 'Halterofilia Manual',
      source: 'manual_selection',
      level: state.selectedLevel,
      levelConfig: levelConfig,
      goals: CardValidationUtils.sanitizeUserInput(state.userGoals) || 'Desarrollar técnica de snatch y clean & jerk',
      selectedMuscleGroups: state.selectedMuscleGroups.length > 0
        ? state.selectedMuscleGroups
        : ['snatch', 'clean_jerk', 'fuerza_base'],
      version: CARD_CONFIG.VERSION.COMPONENT
    };

    onGenerate(halterofíliaData);
  };

  // Componentes modulares para renderizado
  const EvaluationHeader = () => (
    <div className="text-center mb-8">
      <div className="flex justify-center items-center gap-3 mb-4">
        <div className={`p-3 bg-${CARD_CONFIG.THEME.HALTEROFILIA}/10 rounded-full`}>
          <Target className={`w-8 h-8 text-${CARD_CONFIG.THEME.HALTEROFILIA}`} />
        </div>
        <h2 className="text-3xl font-bold text-white">Evaluación IA Halterofilia</h2>
        <span className={`text-xs px-2 py-1 bg-${CARD_CONFIG.THEME.SUCCESS}/20 text-${CARD_CONFIG.THEME.SUCCESS} rounded-full border border-${CARD_CONFIG.THEME.SUCCESS}/30`}>
          v{CARD_CONFIG.VERSION.COMPONENT}
        </span>
      </div>
      <p className="text-gray-400 max-w-2xl mx-auto">
        Nuestro sistema IA especializado evalúa tu perfil para determinar tu nivel óptimo en Halterofilia Olímpica
      </p>
      <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg max-w-2xl mx-auto">
        <p className="text-red-300 text-sm">
          <strong>🏋️ Halterofilia:</strong> Snatch y Clean & Jerk - Levantamiento técnico olímpico. Requiere movilidad, fuerza explosiva y técnica precisa.
        </p>
      </div>
    </div>
  );

  const LoadingEvaluationState = () => (
    <div className="text-center py-8">
      <div className="relative">
        <Loader className={`w-12 h-12 animate-spin text-${CARD_CONFIG.THEME.HALTEROFILIA} mx-auto mb-4`} />
        <div className={`absolute -top-1 -right-1 w-4 h-4 bg-${CARD_CONFIG.THEME.SUCCESS} rounded-full animate-pulse`}></div>
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">Analizando tu perfil Halterofilia...</h3>
      <p className="text-gray-400 mb-3">
        La IA está evaluando tu técnica, movilidad overhead y experiencia con levantamientos olímpicos
      </p>
      <div className={`inline-flex items-center gap-2 px-3 py-1 bg-${CARD_CONFIG.THEME.HALTEROFILIA}/10 text-${CARD_CONFIG.THEME.HALTEROFILIA} rounded-full text-sm border border-${CARD_CONFIG.THEME.HALTEROFILIA}/30`}>
        <Target className="w-4 h-4" />
        Halterofilia v{CARD_CONFIG.VERSION.API} - Técnica Olímpica
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

    const levelConfig = getLevelConfig(state.aiEvaluation.recommended_level);

    return (
      <div>
        {/* Resultado principal */}
        <div className="flex items-start gap-4 mb-6">
          <div className={`p-3 bg-${CARD_CONFIG.THEME.SUCCESS}/10 rounded-full`}>
            <CheckCircle className={`w-8 h-8 text-${CARD_CONFIG.THEME.SUCCESS}`} />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-white mb-2">
              Nivel Recomendado: <span className={`text-${CARD_CONFIG.THEME.HALTEROFILIA}`}>
                {levelConfig?.name || state.aiEvaluation.recommended_level.charAt(0).toUpperCase() + state.aiEvaluation.recommended_level.slice(1)}
              </span>
            </h3>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 bg-gray-700 rounded-full h-2">
                <div
                  className={`bg-${CARD_CONFIG.THEME.HALTEROFILIA} h-2 rounded-full`}
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
                  <Target className={`w-4 h-4 text-${CARD_CONFIG.THEME.HALTEROFILIA} flex-shrink-0`} />
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
                  className={`px-3 py-1 bg-${CARD_CONFIG.THEME.HALTEROFILIA}/10 text-${CARD_CONFIG.THEME.HALTEROFILIA} border border-${CARD_CONFIG.THEME.HALTEROFILIA}/30 rounded-full text-sm`}
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
                : `bg-${CARD_CONFIG.THEME.HALTEROFILIA} text-white hover:bg-red-600 transform hover:scale-[1.02]`
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Target className="w-5 h-5" />
              {isLoading ? 'Generando...' : 'Generar Plan Halterofilia con IA'}
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
        <h2 className="text-3xl font-bold text-white">Selección Manual Halterofilia</h2>
      </div>
      <p className="text-gray-400 max-w-2xl mx-auto">
        Elige tu nivel basándote en tu experiencia con snatch, clean & jerk y técnica olímpica
      </p>
    </div>
  );

  const LevelSelectionGrid = () => {
    const levels = getAllLevels();

    return (
      <div className="mb-8">
        <h3 className="text-xl font-semibold mb-4 text-white flex items-center gap-2">
          <Target className={`w-5 h-5 text-${CARD_CONFIG.THEME.PRIMARY}`} />
          Selecciona tu nivel Halterofilia
        </h3>
        <div className="grid md:grid-cols-3 gap-4">
          {levels.map((level) => (
            <div
              key={level.id}
              className={`p-5 rounded-xl border-2 cursor-pointer transition-all duration-300 hover:shadow-lg ${
                state.selectedLevel === level.id
                  ? `bg-${CARD_CONFIG.THEME.HALTEROFILIA}/10 border-${CARD_CONFIG.THEME.HALTEROFILIA}/60 shadow-lg scale-105`
                  : `bg-${CARD_CONFIG.THEME.BACKGROUND} border-${CARD_CONFIG.THEME.BORDER} hover:border-${CARD_CONFIG.THEME.HALTEROFILIA}/40`
              }`}
              onClick={() => handleManualLevelSelection(level.id)}
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-lg flex items-center gap-2 text-white">
                  {level.icon} {level.name}
                </h4>
                {state.selectedLevel === level.id && <CheckCircle className={`w-5 h-5 text-${CARD_CONFIG.THEME.SUCCESS}`} />}
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
  };

  const MuscleGroupSelectionSection = () => {
    if (!state.selectedLevel) return null;

    const [expanded, setExpanded] = useState(false);
    const groups = getAllMuscleGroups();

    return (
      <div className="mb-8">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full text-left mb-3"
        >
          <h3 className="text-xl font-semibold text-white">
            Enfoque de Entrenamiento {state.selectedMuscleGroups.length > 0 && `(${state.selectedMuscleGroups.length})`}
          </h3>
          <span className="text-gray-400 text-sm">
            {expanded ? '▲ Ocultar' : '▼ Mostrar'}
          </span>
        </button>

        {expanded && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {groups.map((group) => {
              const isSelected = state.selectedMuscleGroups.includes(group.id);
              return (
                <button
                  key={group.id}
                  onClick={() => toggleMuscleGroup(group.id)}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    isSelected
                      ? `border-${CARD_CONFIG.THEME.HALTEROFILIA} bg-${CARD_CONFIG.THEME.HALTEROFILIA}/10`
                      : 'border-gray-700 bg-gray-800 hover:border-red-400'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{group.icon}</span>
                    <div>
                      <p className="font-bold text-white text-sm">{group.shortName}</p>
                      <p className="text-xs text-gray-400">{group.category}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {!expanded && state.selectedMuscleGroups.length === 0 && (
          <p className="text-sm text-gray-500">Por defecto: Snatch, Clean & Jerk, Fuerza Base</p>
        )}
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
          placeholder="Ej: Mejorar timing de jerk, aumentar overhead squat, trabajar first pull..."
          className={`w-full p-4 bg-${CARD_CONFIG.THEME.BACKGROUND} border border-${CARD_CONFIG.THEME.PRIMARY}/30 text-white placeholder-gray-500 rounded-lg resize-none h-24 focus:ring-2 focus:ring-${CARD_CONFIG.THEME.HALTEROFILIA} focus:border-transparent`}
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
          className={`flex-1 px-8 py-3 rounded-xl text-white font-semibold transition-all ${
            isLoading
              ? 'bg-gray-600 cursor-not-allowed'
              : `bg-${CARD_CONFIG.THEME.HALTEROFILIA} hover:bg-red-600 transform hover:scale-[1.02]`
          }`}
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader className="w-5 h-5 animate-spin" />
              Generando plan Halterofilia...
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <Target className="w-5 h-5" />
              Generar Plan Halterofilia Manual
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
      <MuscleGroupSelectionSection />
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
          <div className="bg-black/90 border border-red-500/30 rounded-lg p-6 text-center shadow-xl">
            <svg className="w-10 h-10 text-red-500 animate-spin mx-auto mb-3" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
            </svg>
            <p className="text-white font-semibold">La IA está generando tu plan Halterofilia</p>
            <p className="text-gray-400 text-sm mt-2">Snatch y Clean & Jerk optimizados...</p>
          </div>
        </div>
      )}

      <GlobalErrorDisplay />
      {state.currentStep === 'evaluation' ? renderEvaluationStep() : renderManualSelection()}
    </div>
  );
}
