import React, { useReducer } from 'react';
import { useAuth } from '../../../../contexts/AuthContext';
import tokenManager from '../../../../utils/tokenManager';
import { useUserContext } from '../../../../contexts/UserContext';
import { CASA_LEVELS, getLevelConfig, getTrainingConstants } from './CasaLevels';
import { CASA_TRAINING_CATEGORIES, generateBalancedSplit } from './CasaMuscleGroups';
import { Loader2, Home, Zap, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

// Estado inicial del componente
const initialState = {
  mode: 'manual', // 'ai' | 'manual' - Inicia directo en modo manual
  selectedLevel: null,
  selectedCategory: null, // Cambio: de array a string único
  customGoals: '',
  equipmentLevel: 'basico', // 'minimo' | 'basico' | 'avanzado'
  spaceAvailable: 'medio', // 'reducido' | 'medio' | 'amplio'
  aiEvaluation: null,
  showAdvancedOptions: false,
  errorMessage: null,
  isEvaluating: false
};

// Reducer para gestión de estado
function casaCardReducer(state, action) {
  switch (action.type) {
    case 'SET_MODE':
      return { ...initialState, mode: action.payload };

    case 'SET_LEVEL':
      return { ...state, selectedLevel: action.payload };

    case 'SET_CATEGORY':
      return { ...state, selectedCategory: action.payload };

    case 'SET_EQUIPMENT_LEVEL':
      return { ...state, equipmentLevel: action.payload };

    case 'SET_SPACE_AVAILABLE':
      return { ...state, spaceAvailable: action.payload };

    case 'SET_CUSTOM_GOALS':
      return { ...state, customGoals: action.payload };

    case 'TOGGLE_ADVANCED_OPTIONS':
      return { ...state, showAdvancedOptions: !state.showAdvancedOptions };

    case 'SET_AI_EVALUATION':
      return { ...state, aiEvaluation: action.payload, isEvaluating: false };

    case 'SET_EVALUATING':
      return { ...state, isEvaluating: action.payload };

    case 'SET_ERROR':
      return { ...state, errorMessage: action.payload, isEvaluating: false };

    case 'CLEAR_ERROR':
      return { ...state, errorMessage: null };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

export default function CasaManualCard({ onGenerate, isLoading, error }) {
  const [state, dispatch] = useReducer(casaCardReducer, initialState);
  const { user } = useAuth();
  const { userData } = useUserContext();

  // Evaluación AI del perfil del usuario
  const evaluateUserProfile = async () => {
    if (!user) {
      dispatch({ type: 'SET_ERROR', payload: 'No hay usuario autenticado' });
      return;
    }

    dispatch({ type: 'SET_EVALUATING', payload: true });
    dispatch({ type: 'CLEAR_ERROR' });

    try {
      const token = tokenManager.getToken();
      const response = await fetch('/api/casa-specialist/evaluate-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          source: 'manual_card',
          context: 'entrenamiento_casa'
        })
      });

      if (!response.ok) {
        throw new Error('Error en la evaluación del perfil');
      }

      const data = await response.json();

      if (data.success && data.evaluation) {
        dispatch({ type: 'SET_AI_EVALUATION', payload: data.evaluation });
      } else {
        throw new Error(data.error || 'No se pudo evaluar el perfil');
      }
    } catch (error) {
      console.error('Error evaluando perfil:', error);
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Error al evaluar perfil' });
    }
  };

  // Generar plan con datos seleccionados
  const handleGeneratePlan = async () => {
    // Validaciones
    if (state.mode === 'manual' && !state.selectedLevel) {
      dispatch({ type: 'SET_ERROR', payload: 'Debes seleccionar un nivel' });
      return;
    }

    if (state.mode === 'manual' && !state.selectedCategory) {
      dispatch({ type: 'SET_ERROR', payload: 'Debes seleccionar una categoría de entrenamiento' });
      return;
    }

    // Construir perfil del usuario (siguiendo patrón de Calistenia)
    const fullProfile = {
      id: userData?.id || user?.id
    };

    // Preparar datos para el backend
    const casaData = {
      mode: state.mode,
      selectedLevel: state.mode === 'ai' ? state.aiEvaluation?.nivel_recomendado : state.selectedLevel,
      selectedCategory: state.selectedCategory, // Cambio: singular
      equipmentLevel: state.equipmentLevel,
      spaceAvailable: state.spaceAvailable,
      customGoals: state.customGoals,
      userProfile: fullProfile, // Añadido: perfil del usuario
      aiEvaluation: state.mode === 'ai' ? state.aiEvaluation : null
    };

    try {
      await onGenerate(casaData);
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error.message || 'Error al generar el plan' });
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-gray-900 rounded-2xl p-6 space-y-6">
      {/* Loading Overlay - Similar a Calistenia */}
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

      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-3">
          <Home className="w-8 h-8 text-yellow-400" />
          <h2 className="text-2xl font-bold text-white">Entrenamiento en Casa</h2>
        </div>
        <p className="text-gray-300 text-sm">
          Maximiza resultados con equipamiento mínimo y espacio disponible
        </p>
      </div>

      {/* Error Display */}
      {(error || state.errorMessage) && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-400 text-sm font-medium">Error</p>
            <p className="text-red-300 text-sm">{error || state.errorMessage}</p>
          </div>
        </div>
      )}

      {/* Manual Selection Section */}
      {state.mode === 'manual' && (
        <div className="space-y-6">
          {/* Level Selection */}
          <div className="space-y-3">
            <label className="text-white font-bold text-sm">Selecciona tu nivel</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {Object.entries(CASA_LEVELS).map(([key, level]) => (
                <button
                  key={key}
                  onClick={() => dispatch({ type: 'SET_LEVEL', payload: key })}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    state.selectedLevel === key
                      ? 'border-yellow-400 bg-yellow-400/10'
                      : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                  }`}
                >
                  <div className="text-2xl mb-2">{level.icon}</div>
                  <h4 className="text-white font-bold text-sm mb-1">{level.name}</h4>
                  <p className="text-gray-400 text-xs">{level.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Category Selection */}
          <div className="space-y-3">
            <label className="text-white font-bold text-sm">Categorías de Entrenamiento</label>
            <p className="text-gray-400 text-xs">Selecciona una categoría</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(CASA_TRAINING_CATEGORIES).map(([key, category]) => {
                const isSelected = state.selectedCategory === key;
                return (
                  <button
                    key={key}
                    onClick={() => dispatch({ type: 'SET_CATEGORY', payload: key })}
                    className={`p-4 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'border-yellow-400 bg-yellow-400/10'
                        : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                    }`}
                  >
                    <div className="text-2xl mb-2">{category.icon}</div>
                    <h4 className="text-white font-bold text-xs mb-1">{category.name}</h4>
                    <p className="text-gray-400 text-xs line-clamp-2">{category.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Equipment Level */}
          <div className="space-y-3">
            <label className="text-white font-bold text-sm">Equipamiento Disponible</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { value: 'minimo', label: 'Mínimo', desc: 'Peso corporal, silla, toalla' },
                { value: 'basico', label: 'Básico', desc: 'Bandas, mancuernas ajustables' },
                { value: 'avanzado', label: 'Avanzado', desc: 'TRX, kettlebells, barra' }
              ].map((eq) => (
                <button
                  key={eq.value}
                  onClick={() => dispatch({ type: 'SET_EQUIPMENT_LEVEL', payload: eq.value })}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    state.equipmentLevel === eq.value
                      ? 'border-yellow-400 bg-yellow-400/10'
                      : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                  }`}
                >
                  <h4 className="text-white font-bold text-sm mb-1">{eq.label}</h4>
                  <p className="text-gray-400 text-xs">{eq.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Space Available */}
          <div className="space-y-3">
            <label className="text-white font-bold text-sm">Espacio Disponible</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { value: 'reducido', label: 'Reducido', desc: '~2x2 metros' },
                { value: 'medio', label: 'Medio', desc: '~3x3 metros' },
                { value: 'amplio', label: 'Amplio', desc: '4+ metros' }
              ].map((sp) => (
                <button
                  key={sp.value}
                  onClick={() => dispatch({ type: 'SET_SPACE_AVAILABLE', payload: sp.value })}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    state.spaceAvailable === sp.value
                      ? 'border-yellow-400 bg-yellow-400/10'
                      : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                  }`}
                >
                  <h4 className="text-white font-bold text-sm mb-1">{sp.label}</h4>
                  <p className="text-gray-400 text-xs">{sp.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Goals */}
          <div className="space-y-3">
            <label className="text-white font-bold text-sm">Objetivos Específicos (Opcional)</label>
            <textarea
              value={state.customGoals}
              onChange={(e) => dispatch({ type: 'SET_CUSTOM_GOALS', payload: e.target.value })}
              placeholder="Ej: Quiero mejorar mi resistencia cardiovascular, necesito ejercicios de bajo impacto por lesión de rodilla, prefiero entrenamientos cortos..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white text-sm resize-none focus:border-yellow-400 focus:outline-none"
              rows={3}
            />
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGeneratePlan}
            disabled={isLoading || !state.selectedLevel || !state.selectedCategory}
            className="w-full bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generando plan...
              </>
            ) : (
              <>
                Generar Plan de Entrenamiento en Casa
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
