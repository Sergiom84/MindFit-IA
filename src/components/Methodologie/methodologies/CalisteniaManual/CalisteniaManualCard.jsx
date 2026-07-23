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
    case 'SET_CONTEXT_FIELD':
      return { ...state, [action.payload.field]: action.payload.value };
    case 'SET_EQUIPMENT_LIST':
      return { ...state, userEquipment: action.payload, loadingEquipment: false };
    case 'SET_EQUIPMENT_LOADING':
      return { ...state, loadingEquipment: action.payload };
    case 'SET_AI_EVALUATION':
      return {
        ...state,
        aiEvaluation: action.payload,
        loadingEvaluation: false,
        evaluationError: null,
        referBlock: null
      };
    case 'SET_EVALUATION_LOADING':
      return {
        ...state,
        loadingEvaluation: action.payload,
        evaluationError: action.payload ? null : state.evaluationError,
        referBlock: action.payload ? null : state.referBlock
      };
    case 'SET_EVALUATION_ERROR':
      return {
        ...state,
        evaluationError: action.payload,
        loadingEvaluation: false
      };
    case 'SET_REFER_BLOCK':
      return {
        ...state,
        referBlock: action.payload,
        aiEvaluation: null,
        loadingEvaluation: false,
        evaluationError: null
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

// Enums del assessment determinista (PR-CAL-01) — deben coincidir con lo que acepta
// `assessCalistenia` en el backend (backend/services/routineGeneration/methodologies/calisteniaAssessment.js).
const PAIN_STATUS_OPTIONS = [
  { value: 'none', label: 'Sin dolor' },
  { value: 'stable', label: 'Molestia estable/controlada' },
  { value: 'increasing', label: 'Molestia que va a más' },
  { value: 'acute', label: 'Dolor agudo' }
];
const TRAINING_ENVIRONMENT_OPTIONS = [
  { value: 'gimnasio', label: 'Gimnasio' },
  { value: 'casa', label: 'Casa' },
  { value: 'exterior', label: 'Exterior / parque' }
];

// Estado inicial. `currentStep` arranca en 'context': el paso previo de entorno/equipo/dolor debe
// completarse ANTES de disparar cualquier evaluación (PR-CAL-01, corrección de Sergio — antes se
// evaluaba con IA al montar el componente, sin capturar nada de esto).
const initialState = {
  currentStep: 'context',
  trainingEnvironment: null,
  equipmentSafetyConfirmed: null,
  painStatus: 'none',
  demonstratedLevel: null,
  userEquipment: [],
  loadingEquipment: false,
  aiEvaluation: null,
  loadingEvaluation: false,
  evaluationError: null,
  referBlock: null,
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
  /**
   * Antes descartaba el body del error (`response.text()` sin usar) y lanzaba siempre
   * `Error ${status}: ${statusText}` genérico — cualquier 422 tipado (p.ej.
   * CALISTHENICS_ASSESSMENT_REFER) se perdía antes de llegar al componente (PR-CAL-01,
   * corrección de Sergio). Ahora parsea el JSON del error y adjunta `status`/`code`/`evaluation`
   * al Error lanzado para que el llamador pueda distinguir un 'refer' de un fallo genérico.
   */
  async makeRequest(endpoint, options = {}) {
    const token = tokenManager.getToken();
    const defaultHeaders = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };

    const response = await fetch(endpoint, {
      ...options,
      headers: { ...defaultHeaders, ...options.headers }
    });

    if (!response.ok) {
      let body = null;
      try {
        body = await response.json();
      } catch {
        // Respuesta de error sin JSON (p.ej. proxy/gateway) — se mantiene body=null.
      }
      const error = new Error(body?.error || `Error ${response.status}: ${response.statusText}`);
      error.status = response.status;
      error.code = body?.code || null;
      error.evaluation = body?.evaluation || null;
      console.error(`❌ API Request failed for ${endpoint}:`, error.code || error.status, error.message);
      throw error;
    }

    return await response.json();
  },

  async evaluateProfile(assessmentInput = {}) {
    return this.makeRequest(CARD_CONFIG.API_ENDPOINTS.EVALUATE_PROFILE, {
      method: 'POST',
      body: JSON.stringify({ assessmentInput })
    });
  }
};

// Utilidades de validación específicas
const CardValidationUtils = {
  /**
   * El envelope estable (PR-CAL-01) tiene 3 decisiones válidas: 'ok' (recommended_level no nulo),
   * 'insufficient_data' (recommended_level: null — NO es un error) y 'refer' (llega como excepción
   * 422, no como respuesta success:true; ver APIUtils.makeRequest). Antes se exigía
   * `recommended_level` truthy siempre, lo que rompía con 'insufficient_data'.
   */
  validateEvaluationResult(result) {
    if (!result?.success) {
      throw new Error(result?.error || 'Error en evaluación de perfil');
    }
    const decision = result.evaluation?.decision;
    if (decision !== 'ok' && decision !== 'insufficient_data') {
      throw new Error('Respuesta de evaluación inválida');
    }
    if (decision === 'ok' && !result.evaluation?.recommended_level) {
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

  // Lectura (solo lectura, PR-CAL-01 corrección de Sergio) del equipo ya guardado en la fuente
  // canónica app.user_equipment vía las rutas ya existentes de backend/routes/equipment.js — no se
  // introduce un `context.available_equipment` paralelo. Editar equipo se hace en /profile.
  useEffect(() => {
    let cancelled = false;
    dispatch({ type: 'SET_EQUIPMENT_LOADING', payload: true });
    APIUtils.makeRequest('/api/equipment/user')
      .then((result) => {
        if (cancelled) return;
        const curated = (result?.curated || []).filter((item) => item.key !== 'no_equipment');
        dispatch({ type: 'SET_EQUIPMENT_LIST', payload: curated });
      })
      .catch((err) => {
        console.error('❌ No se pudo leer el equipo del usuario:', err);
        if (!cancelled) dispatch({ type: 'SET_EQUIPMENT_LIST', payload: [] });
      });
    return () => { cancelled = true; };
  }, []);

  /**
   * `assessmentInput` compartido entre /evaluate y la generación (AI o manual): mismos
   * painStatus/context/demonstratedLevel para que el assessment determinista reproduzca la MISMA
   * decisión en ambas llamadas (PR-CAL-01). `selfReportedLevel` solo se fija explícitamente en el
   * flujo manual (el usuario ya eligió nivel); en el flujo IA se omite y el backend cae al perfil.
   */
  const buildAssessmentInput = (explicitSelfReportedLevel = null) => ({
    ...(explicitSelfReportedLevel ? { selfReportedLevel: explicitSelfReportedLevel } : {}),
    demonstratedLevel: state.demonstratedLevel || null,
    painStatus: state.painStatus || 'none',
    context: {
      training_environment: state.trainingEnvironment,
      equipment_safety_confirmed: state.equipmentSafetyConfirmed
    }
  });

  /**
   * Evaluación del perfil: el assessment determinista decide (backend), la IA solo explica.
   * Se dispara al confirmar el paso de contexto (nunca automáticamente al montar).
   */
  const evaluateUserProfile = async () => {
    dispatch({ type: 'SET_EVALUATION_LOADING', payload: true });

    try {
      const result = await APIUtils.evaluateProfile(buildAssessmentInput());
      CardValidationUtils.validateEvaluationResult(result);

      console.log('✅ Evaluación completada:', {
        decision: result.evaluation.decision,
        level: result.evaluation.recommended_level,
        confidence: result.evaluation.confidence
      });

      dispatch({ type: 'SET_AI_EVALUATION', payload: result.evaluation });

      if (result.evaluation.decision === 'ok') {
        const recommendedGroups = getRecommendedGroupsByLevel(result.evaluation.recommended_level);
        dispatch({ type: 'SET_MUSCLE_GROUPS', payload: recommendedGroups.map(group => group.id) });
      }
    } catch (err) {
      if (err.code === 'CALISTHENICS_ASSESSMENT_REFER') {
        dispatch({
          type: 'SET_REFER_BLOCK',
          payload: {
            message: err.message,
            reasons: err.evaluation?.reasons || [],
            limiting_patterns: err.evaluation?.limiting_patterns || []
          }
        });
        return;
      }
      console.error('❌ Error en evaluación:', err);
      dispatch({ type: 'SET_EVALUATION_ERROR', payload: err.message });
    }
  };

  /**
   * Generar plan directamente con IA especializada. Solo disponible con decision==='ok'
   * (insufficient_data exige elegir nivel manualmente; refer bloquea la generación).
   */
  const generateWithAI = async () => {
    if (!state.aiEvaluation || state.aiEvaluation.decision !== 'ok') return;

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
      // PR-CAL-01: mismo assessmentInput que /evaluate, para que la generación reproduzca la
      // misma decisión determinista (antes ninguno de estos campos llegaba al backend).
      assessmentInput: buildAssessmentInput(),
      version: CARD_CONFIG.VERSION.COMPONENT
    };

    onGenerate(calisteniaData);
  };

  /**
   * Navegación entre pasos
   */
  const goToContext = () => {
    dispatch({ type: 'SET_STEP', payload: 'context' });
  };

  const goToManualSelection = () => {
    dispatch({ type: 'SET_STEP', payload: 'manual_selection' });
  };

  const goToEvaluation = () => {
    dispatch({ type: 'SET_STEP', payload: 'evaluation' });
    if (!state.aiEvaluation && !state.loadingEvaluation) {
      evaluateUserProfile();
    }
  };

  /**
   * Confirmar el paso de contexto y pasar a la evaluación (dispara /evaluate por primera vez).
   */
  const confirmContextAndEvaluate = () => {
    dispatch({ type: 'SET_STEP', payload: 'evaluation' });
    evaluateUserProfile();
  };

  const handleContextFieldChange = (field, value) => {
    dispatch({ type: 'SET_CONTEXT_FIELD', payload: { field, value } });
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
      // PR-CAL-01: nivel elegido explícitamente por el usuario → `selfReportedLevel` en el
      // assessmentInput, satisface la política de "explicit selection" ante insufficient_data.
      assessmentInput: buildAssessmentInput(state.selectedLevel),
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

  // Gate de seguridad duro (dolor agudo u otra contraindicación seria): NO se prescribe, se
  // deriva a valoración profesional. No hay forma de continuar generando desde aquí.
  const ReferBlockState = () => (
    <div className="text-center py-8">
      <Shield className={`w-12 h-12 text-${CARD_CONFIG.THEME.ERROR} mx-auto mb-4`} />
      <h3 className={`text-xl font-semibold text-${CARD_CONFIG.THEME.ERROR} mb-2`}>Necesitas una valoración profesional</h3>
      <p className="text-gray-400 mb-4 max-w-xl mx-auto">{state.referBlock?.message}</p>
      {state.referBlock?.limiting_patterns?.length > 0 && (
        <p className="text-sm text-orange-300 mb-4">
          Zonas señaladas: {state.referBlock.limiting_patterns.join(', ')}
        </p>
      )}
      <button
        onClick={goToContext}
        className={`px-4 py-2 bg-${CARD_CONFIG.THEME.BACKGROUND} border border-${CARD_CONFIG.THEME.BORDER} text-${CARD_CONFIG.THEME.PRIMARY} rounded-lg hover:bg-black/60 transition-colors`}
      >
        ← Revisar respuestas
      </button>
    </div>
  );

  const CONFIDENCE_LABEL = { low: 'Baja', medium: 'Media', high: 'Alta' };
  const CONFIDENCE_WIDTH = { low: 33, medium: 66, high: 100 };

  const EvaluationResultSection = () => {
    if (!state.aiEvaluation) return null;
    const evaluation = state.aiEvaluation;
    const isInsufficientData = evaluation.decision === 'insufficient_data';

    return (
      <div>
        {/* Resultado principal: SIEMPRE del assessment determinista, nunca de la IA */}
        <div className="flex items-start gap-4 mb-6">
          <div className={`p-3 bg-${isInsufficientData ? CARD_CONFIG.THEME.WARNING : CARD_CONFIG.THEME.SUCCESS}/10 rounded-full`}>
            {isInsufficientData
              ? <AlertTriangle className={`w-8 h-8 text-${CARD_CONFIG.THEME.WARNING}`} />
              : <CheckCircle className={`w-8 h-8 text-${CARD_CONFIG.THEME.SUCCESS}`} />}
          </div>
          <div className="flex-1">
            {isInsufficientData ? (
              <h3 className="text-xl font-semibold text-white mb-2">
                Nivel no determinado todavía
              </h3>
            ) : (
              <h3 className="text-xl font-semibold text-white mb-2">
                Nivel Recomendado: <span className={`text-${CARD_CONFIG.THEME.PRIMARY}`}>
                  {evaluation.recommended_level.charAt(0).toUpperCase() + evaluation.recommended_level.slice(1)}
                </span>
              </h3>
            )}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 bg-gray-700 rounded-full h-2">
                <div
                  className={`bg-${CARD_CONFIG.THEME.PRIMARY} h-2 rounded-full`}
                  style={{ width: `${CONFIDENCE_WIDTH[evaluation.confidence] ?? 0}%` }}
                ></div>
              </div>
              <span className="text-sm text-gray-400">Confianza: {CONFIDENCE_LABEL[evaluation.confidence] || evaluation.confidence}</span>
            </div>
            {isInsufficientData ? (
              <p className="text-gray-300 text-sm">
                No hay datos suficientes (autoevaluación o evidencia de skill) para determinar un nivel de forma
                fiable. Elige tu nivel manualmente para continuar.
              </p>
            ) : (
              <>
                {evaluation.reasons?.length > 0 && (
                  <ul className="text-gray-300 text-sm list-disc list-inside mb-2">
                    {evaluation.reasons.map((reason, index) => <li key={index}>{reason}</li>)}
                  </ul>
                )}
                {evaluation.reasoning && <p className="text-gray-400 text-sm italic">{evaluation.reasoning}</p>}
              </>
            )}
          </div>
        </div>

        {/* Patrones limitantes por lesión declarada */}
        {evaluation.limiting_patterns?.length > 0 && (
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <Shield className={`w-5 h-5 text-${CARD_CONFIG.THEME.WARNING}`} />
              Zonas limitadas por lesión declarada
            </h4>
            <div className={`bg-${CARD_CONFIG.THEME.WARNING}/10 border border-${CARD_CONFIG.THEME.WARNING}/30 rounded-lg p-3 flex flex-wrap gap-2`}>
              {evaluation.limiting_patterns.map((zone, index) => (
                <span key={index} className="px-3 py-1 bg-black/40 text-orange-300 rounded-full text-sm">{zone}</span>
              ))}
            </div>
          </div>
        )}

        {/* Indicadores clave (explicación de la IA, nunca decide el nivel) */}
        {evaluation.key_indicators?.length > 0 && (
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <TrendingUp className={`w-5 h-5 text-${CARD_CONFIG.THEME.PRIMARY}`} />
              Factores Clave Detectados
            </h4>
            <div className="grid md:grid-cols-2 gap-2">
              {evaluation.key_indicators.map((indicator, index) => (
                <div key={index} className="flex items-center gap-2 text-sm text-gray-300">
                  <CheckCircle className={`w-4 h-4 text-${CARD_CONFIG.THEME.SUCCESS} flex-shrink-0`} />
                  {indicator}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Áreas de enfoque */}
        {evaluation.suggested_focus_areas?.length > 0 && (
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <Target className={`w-5 h-5 text-${CARD_CONFIG.THEME.PRIMARY}`} />
              Áreas de Enfoque Recomendadas
            </h4>
            <div className="flex flex-wrap gap-2">
              {evaluation.suggested_focus_areas.map((area, index) => (
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

        {/* Consideraciones de seguridad (texto de la IA) */}
        {evaluation.safety_considerations?.length > 0 && (
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <Shield className={`w-5 h-5 text-${CARD_CONFIG.THEME.WARNING}`} />
              Consideraciones de Seguridad
            </h4>
            <div className={`bg-${CARD_CONFIG.THEME.WARNING}/10 border border-${CARD_CONFIG.THEME.WARNING}/30 rounded-lg p-3`}>
              {evaluation.safety_considerations.map((consideration, index) => (
                <div key={index} className="flex items-start gap-2 text-sm text-orange-300">
                  <AlertTriangle className={`w-4 h-4 text-${CARD_CONFIG.THEME.WARNING} mt-0.5 flex-shrink-0`} />
                  {consideration}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Botones de acción: sin decision==='ok' no se ofrece "Generar con IA" */}
        <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-600">
          {!isInsufficientData && (
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
          )}

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
   * Renderizar pantalla de evaluación
   */
  const renderEvaluationStep = () => (
    <div className="max-w-4xl mx-auto">
      <EvaluationHeader />

      <div className={`bg-${CARD_CONFIG.THEME.BACKGROUND} border border-${CARD_CONFIG.THEME.BORDER} rounded-xl p-6 mb-6`}>
        {state.referBlock ? (
          <ReferBlockState />
        ) : state.loadingEvaluation ? (
          <LoadingEvaluationState />
        ) : state.evaluationError ? (
          <ErrorEvaluationState />
        ) : state.aiEvaluation ? (
          <EvaluationResultSection />
        ) : null}
      </div>
    </div>
  );

  /**
   * Paso de contexto (PR-CAL-01): entorno, equipo (solo lectura + enlace a /profile), gate de dolor
   * y nivel demostrado opcional. Se captura ANTES de disparar cualquier evaluación.
   */
  const renderContextStep = () => (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <div className="flex justify-center items-center gap-3 mb-4">
          <div className={`p-3 bg-${CARD_CONFIG.THEME.PRIMARY}/10 rounded-full`}>
            <Shield className={`w-8 h-8 text-${CARD_CONFIG.THEME.PRIMARY}`} />
          </div>
          <h2 className="text-3xl font-bold text-white">Antes de empezar</h2>
        </div>
        <p className="text-gray-400 max-w-2xl mx-auto">
          Esta información determina tu nivel de forma segura y determinista — no la decide la IA.
        </p>
      </div>

      <div className={`bg-${CARD_CONFIG.THEME.BACKGROUND} border border-${CARD_CONFIG.THEME.BORDER} rounded-xl p-6 mb-6 space-y-6`}>
        <div>
          <h3 className="text-lg font-semibold text-white mb-3">¿Dónde vas a entrenar?</h3>
          <div className="grid grid-cols-3 gap-3">
            {TRAINING_ENVIRONMENT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleContextFieldChange('trainingEnvironment', opt.value)}
                className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                  state.trainingEnvironment === opt.value
                    ? `bg-${CARD_CONFIG.THEME.PRIMARY}/10 border-${CARD_CONFIG.THEME.PRIMARY}/60 text-${CARD_CONFIG.THEME.PRIMARY}`
                    : `bg-black/40 border-${CARD_CONFIG.THEME.BORDER} text-gray-300`
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-white mb-3">Tu equipo disponible</h3>
          {state.loadingEquipment ? (
            <p className="text-sm text-gray-400">Cargando equipo guardado en tu perfil…</p>
          ) : state.userEquipment.length > 0 ? (
            <div className="flex flex-wrap gap-2 mb-3">
              {state.userEquipment.map((item) => (
                <span key={item.key} className="px-3 py-1 bg-black/40 text-gray-300 rounded-full text-sm">{item.label}</span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 mb-3">No tienes equipo guardado en tu perfil todavía.</p>
          )}
          <a href="/profile" className={`text-sm text-${CARD_CONFIG.THEME.PRIMARY} underline`}>
            Gestionar mi equipo en el perfil →
          </a>
          <label className="flex items-center gap-2 mt-3 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={state.equipmentSafetyConfirmed === true}
              onChange={(e) => handleContextFieldChange('equipmentSafetyConfirmed', e.target.checked)}
              className="rounded"
            />
            Confirmo que el equipo indicado arriba está en buen estado y es seguro de usar
          </label>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-white mb-3">¿Tienes alguna molestia o dolor ahora mismo?</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PAIN_STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleContextFieldChange('painStatus', opt.value)}
                className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                  state.painStatus === opt.value
                    ? `bg-${CARD_CONFIG.THEME.PRIMARY}/10 border-${CARD_CONFIG.THEME.PRIMARY}/60 text-${CARD_CONFIG.THEME.PRIMARY}`
                    : `bg-black/40 border-${CARD_CONFIG.THEME.BORDER} text-gray-300`
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-white mb-3">
            ¿Puedes demostrar alguna habilidad avanzada? <span className="text-gray-500 text-sm">(opcional)</span>
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {Object.keys(CALISTENIA_LEVELS).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleContextFieldChange('demonstratedLevel', state.demonstratedLevel === key ? null : key)}
                className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                  state.demonstratedLevel === key
                    ? `bg-${CARD_CONFIG.THEME.PRIMARY}/10 border-${CARD_CONFIG.THEME.PRIMARY}/60 text-${CARD_CONFIG.THEME.PRIMARY}`
                    : `bg-black/40 border-${CARD_CONFIG.THEME.BORDER} text-gray-300`
                }`}
              >
                {CALISTENIA_LEVELS[key].name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="text-center">
        <button
          onClick={confirmContextAndEvaluate}
          className={`px-8 py-3 rounded-xl font-semibold bg-${CARD_CONFIG.THEME.PRIMARY} text-black hover:bg-yellow-300 transition-all`}
        >
          Continuar
        </button>
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
      {state.currentStep === 'context'
        ? renderContextStep()
        : state.currentStep === 'evaluation'
          ? renderEvaluationStep()
          : renderManualSelection()}
    </div>
  );
}