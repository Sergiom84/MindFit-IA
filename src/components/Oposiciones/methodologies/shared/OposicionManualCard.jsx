/**
 * OposicionManualCard — card genérica de evaluación y generación de plan para
 * oposiciones (Guardia Civil, Policía Nacional, Policía Local). Parametrizada
 * por `config` (oposicionesData.js). Comparte flujo con BomberosManualCard pero
 * sin datos hardcodeados: el motor backend (OposicionService) hace el trabajo.
 */
import React, { useReducer, useEffect } from 'react';
import { Target, CheckCircle, AlertTriangle, Loader, Shield } from 'lucide-react';
import { OPOSICION_LEVELS, getOposicionLevelConfig } from './OposicionLevels.js';
import { useAuth } from '@/contexts/AuthContext';
import { useUserContext } from '@/contexts/UserContext';
import tokenManager from '../../../../utils/tokenManager';

const initialState = {
  currentStep: 'evaluation',
  loadingEvaluation: false,
  evaluationError: null,
  selectedLevel: null,
  userGoals: '',
  priorityTests: [],
  planDuration: 12
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, currentStep: action.payload };
    case 'SET_EVAL_LOADING':
      return { ...state, loadingEvaluation: action.payload, evaluationError: null };
    case 'SET_EVAL_ERROR':
      return { ...state, loadingEvaluation: false, evaluationError: action.payload };
    case 'SET_LEVEL':
      return { ...state, selectedLevel: action.payload, loadingEvaluation: false };
    case 'SET_GOALS':
      return { ...state, userGoals: action.payload };
    case 'SET_PRIORITY':
      return { ...state, priorityTests: action.payload };
    case 'SET_DURATION':
      return { ...state, planDuration: action.payload };
    default:
      return state;
  }
}

async function apiRequest(endpoint, body) {
  const token = tokenManager.getToken();
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3010';
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: JSON.stringify(body || {})
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || err?.message || `Error ${res.status}`);
  }
  return res.json();
}

export default function OposicionManualCard({ config, onGenerate, isLoading: externalLoading }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { user } = useAuth();
  const { userData } = useUserContext();

  // Evaluación automática al abrir (nivel recomendado por defecto).
  useEffect(() => {
    let cancelled = false;
    async function evaluate() {
      dispatch({ type: 'SET_EVAL_LOADING', payload: true });
      try {
        const result = await apiRequest(
          `/api/routine-generation/specialist/${config.methodology}/evaluate`,
          { source: `${config.methodology}_evaluation` }
        );
        if (cancelled) return;
        dispatch({ type: 'SET_LEVEL', payload: result?.evaluation?.recommended_level || 'intermedio' });
      } catch {
        if (cancelled) return;
        // No bloqueamos: dejamos elegir nivel manualmente.
        dispatch({ type: 'SET_LEVEL', payload: 'intermedio' });
      }
    }
    if (state.currentStep === 'evaluation' && !state.selectedLevel && !state.loadingEvaluation) {
      evaluate();
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentStep]);

  const handleGenerate = async () => {
    const planData = {
      userProfile: { id: user?.id, ...userData },
      selectedLevel: state.selectedLevel || 'intermedio',
      goals: state.userGoals || `Superar las pruebas físicas de ${config.label}`,
      priorityTests: state.priorityTests,
      versionConfig: { version: '1.0', customWeeks: state.planDuration },
      methodology: config.methodology,
      source: 'manual_selection'
    };
    if (onGenerate) await onGenerate(planData);
  };

  const renderEvaluation = () => {
    if (state.loadingEvaluation) {
      return (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader className="w-12 h-12 text-yellow-400 animate-spin mb-4" />
          <p className="text-white text-lg">Preparando tu evaluación…</p>
        </div>
      );
    }
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-white/5 to-white/10 rounded-lg p-5 border border-white/10">
          <div className="flex items-start gap-3">
            <div className="p-3 bg-white/10 rounded-xl">
              <Shield className="w-7 h-7 text-yellow-300" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Preparación para {config.label}</h3>
              <p className="text-gray-300 text-sm">
                Selecciona tu nivel; el plan entrena de forma concurrente todas las pruebas físicas.
              </p>
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-lg font-semibold text-white mb-3">Elige tu nivel:</h4>
          <div className="grid gap-3">
            {Object.values(OPOSICION_LEVELS).map((level) => (
              <button
                key={level.id}
                onClick={() => dispatch({ type: 'SET_LEVEL', payload: level.id })}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  state.selectedLevel === level.id
                    ? 'border-yellow-400 bg-yellow-500/15'
                    : 'border-gray-600 bg-black/40 hover:border-yellow-500/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{level.icon}</span>
                    <div>
                      <p className="font-semibold text-white">{level.displayName}</p>
                      <p className="text-sm text-gray-400">{level.description}</p>
                    </div>
                  </div>
                  {state.selectedLevel === level.id && <CheckCircle className="w-6 h-6 text-yellow-400" />}
                </div>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => dispatch({ type: 'SET_STEP', payload: 'configuration' })}
          disabled={!state.selectedLevel}
          className="w-full py-3 px-6 bg-yellow-400 hover:bg-yellow-300 disabled:bg-gray-700 disabled:text-gray-500 text-black font-semibold rounded-lg transition-colors"
        >
          Continuar con configuración
        </button>
      </div>
    );
  };

  const renderConfiguration = () => {
    const levelConfig = getOposicionLevelConfig(state.selectedLevel);
    return (
      <div className="space-y-6">
        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{levelConfig.icon}</span>
            <div>
              <p className="font-semibold text-white">{levelConfig.displayName}</p>
              <p className="text-sm text-gray-400">
                {levelConfig.trainingFrequency} • {levelConfig.sessionDuration}
              </p>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">Objetivo principal (opcional):</label>
          <textarea
            value={state.userGoals}
            onChange={(e) => dispatch({ type: 'SET_GOALS', payload: e.target.value })}
            placeholder="Ej: mejorar la carrera de resistencia y la fuerza de tren superior…"
            className="w-full px-4 py-3 bg-black/60 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 resize-none"
            rows="3"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            Pruebas que necesitan más trabajo:
          </label>
          <div className="grid grid-cols-2 gap-2">
            {config.pruebas.map((prueba) => (
              <label
                key={prueba.id}
                className="flex items-center gap-2 p-2 bg-black/40 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={state.priorityTests.includes(prueba.id)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...state.priorityTests, prueba.id]
                      : state.priorityTests.filter((t) => t !== prueba.id);
                    dispatch({ type: 'SET_PRIORITY', payload: next });
                  }}
                  className="w-4 h-4 accent-yellow-400"
                />
                <span className="text-sm text-gray-300">{prueba.nombre}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">Duración del plan:</label>
          <div className="grid grid-cols-3 gap-3">
            {[8, 12, 16].map((weeks) => (
              <button
                key={weeks}
                onClick={() => dispatch({ type: 'SET_DURATION', payload: weeks })}
                className={`py-3 px-4 rounded-lg font-semibold transition-all ${
                  state.planDuration === weeks
                    ? 'bg-yellow-400 text-black'
                    : 'bg-black/40 text-gray-300 hover:bg-white/10'
                }`}
              >
                {weeks} semanas
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => dispatch({ type: 'SET_STEP', payload: 'evaluation' })}
            className="flex-1 py-3 px-6 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
          >
            Volver
          </button>
          <button
            onClick={() => dispatch({ type: 'SET_STEP', payload: 'summary' })}
            className="flex-1 py-3 px-6 bg-yellow-400 hover:bg-yellow-300 text-black font-semibold rounded-lg transition-colors"
          >
            Revisar plan
          </button>
        </div>
      </div>
    );
  };

  const renderSummary = () => {
    const levelConfig = getOposicionLevelConfig(state.selectedLevel);
    return (
      <div className="space-y-6">
        <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
          <p className="text-white font-semibold">{config.label} · {levelConfig.displayName}</p>
          <p className="text-sm text-gray-400">
            {state.planDuration} semanas · {levelConfig.trainingFrequency}
          </p>
          {state.priorityTests.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {state.priorityTests.map((id) => {
                const p = config.pruebas.find((x) => x.id === id);
                return p ? (
                  <span key={id} className="px-3 py-1 bg-yellow-500/20 rounded-full text-xs text-yellow-300">
                    {p.nombre}
                  </span>
                ) : null;
              })}
            </div>
          )}
        </div>

        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <p className="text-sm font-semibold text-white mb-2">Pruebas objetivo y marcas de apto</p>
          <ul className="space-y-1">
            {config.pruebas.map((p) => (
              <li key={p.id} className="text-xs text-gray-300 flex items-start gap-2">
                <Target className="w-3 h-3 text-yellow-400 mt-0.5 flex-shrink-0" />
                <span>
                  <span className="text-gray-200">{p.nombre}</span> — H: {p.baremo_hombres} · M: {p.baremo_mujeres}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-300">{config.notaBaremos}</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => dispatch({ type: 'SET_STEP', payload: 'configuration' })}
            className="flex-1 py-3 px-6 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-colors"
          >
            Volver
          </button>
          <button
            onClick={handleGenerate}
            disabled={externalLoading}
            className="flex-1 py-3 px-6 bg-gradient-to-r from-yellow-300 to-amber-500 hover:from-yellow-200 hover:to-amber-400 disabled:from-gray-600 disabled:to-gray-700 text-black font-bold rounded-lg transition-all"
          >
            {externalLoading ? 'Generando…' : 'Generar plan'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {state.currentStep === 'evaluation' && renderEvaluation()}
      {state.currentStep === 'configuration' && renderConfiguration()}
      {state.currentStep === 'summary' && renderSummary()}
    </div>
  );
}
