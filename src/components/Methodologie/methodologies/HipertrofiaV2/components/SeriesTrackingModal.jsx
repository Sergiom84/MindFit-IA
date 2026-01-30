/**
 * Modal de Tracking de Series - Hipertrofia V2
 * Registra peso, repeticiones y RIR por cada serie
 */

import React, { useState, useEffect } from 'react';
import { X, Check, TrendingUp, Info } from 'lucide-react';
import {
  validateSetData,
  calculateEstimated1RM,
  calculateRPE,
  calculateVolumeLoad,
  isEffectiveSet
} from '../config/progressionRules';
import RIRReferenceModal from '../../../../routines/modals/RIRReferenceModal';

export default function SeriesTrackingModal({
  exerciseName,
  exerciseId,
  seriesNumber,
  totalSeries,
  previousPR = null,
  suggestedWeight = null,
  onSave,
  onClose,
  neuralOverlap = null,
  isMandatory = false
}) {
  const [weight, setWeight] = useState(suggestedWeight ? String(suggestedWeight) : '');
  const [reps, setReps] = useState('');
  const [rir, setRir] = useState(2); // Default RIR 2 (óptimo)
  const [errors, setErrors] = useState([]);
  const [showRIRReference, setShowRIRReference] = useState(false);

  // Cálculos en tiempo real
  const [calculations, setCalculations] = useState({
    estimated1RM: 0,
    rpe: 0,
    volumeLoad: 0,
    isEffective: false
  });

  // Actualizar valor sugerido cuando cambia
  useEffect(() => {
    if (suggestedWeight) {
      setWeight(String(suggestedWeight));
    }
  }, [suggestedWeight]);

  // Actualizar cálculos cuando cambian los valores
  useEffect(() => {
    if (weight && reps) {
      const w = parseFloat(weight);
      const r = parseInt(reps);

      setCalculations({
        estimated1RM: calculateEstimated1RM(w, r, rir),
        rpe: calculateRPE(rir),
        volumeLoad: calculateVolumeLoad(w, r),
        isEffective: isEffectiveSet(rir)
      });
    }
  }, [weight, reps, rir]);

  const handleSave = () => {
    // Validar datos
    const validation = validateSetData(
      parseFloat(weight),
      parseInt(reps),
      rir
    );

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    // 🐛 Debug: Verificar exerciseId recibido
    console.log('🔍 DEBUG SeriesTrackingModal - exerciseId recibido:', exerciseId);
    console.log('🔍 DEBUG SeriesTrackingModal - exerciseName:', exerciseName);

    // Preparar datos
    const setData = {
      exercise_id: exerciseId,
      exercise_name: exerciseName,
      set_number: seriesNumber,
      weight_used: parseFloat(weight),
      reps_completed: parseInt(reps),
      rir_reported: rir,
      ...calculations
    };

    console.log('🔍 DEBUG SeriesTrackingModal - setData preparado:', setData);

    onSave(setData);
  };

  const getRIRColor = (rirValue) => {
    if (rirValue <= 1) return 'text-red-400';
    if (rirValue >= 2 && rirValue <= 3) return 'text-green-400';
    return 'text-blue-400';
  };

  const getRIRLabel = (rirValue) => {
    if (rirValue === 0) return 'Fallo muscular';
    if (rirValue === 1) return '1 más posible';
    if (rirValue === 2) return '2 más posibles (Óptimo)';
    if (rirValue === 3) return '3 más posibles (Óptimo)';
    return '4+ más posibles';
  };
  const getRIRAccent = (rirValue) => {
    if (rirValue <= 1) return 'border-orange-400/40 text-orange-200';
    if (rirValue >= 2 && rirValue <= 3) return 'border-emerald-400/40 text-emerald-200';
    return 'border-sky-400/40 text-sky-200';
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
      <div className="bg-neutral-900/95 rounded-2xl w-full max-w-md border border-white/10 ring-1 ring-white/10 shadow-[0_40px_90px_-60px_rgba(0,0,0,0.9)]">
        {/* Header */}
        <div className="bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 p-4 rounded-t-2xl border-b border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold font-urbanist text-gray-900 text-lg">
                Registrar Serie {seriesNumber}/{totalSeries}
              </h3>
              <p className="text-gray-800/80 text-sm">{exerciseName}</p>
            </div>
            {!isMandatory && (
              <button
                onClick={onClose}
                className="text-gray-900/70 hover:text-gray-900 transition-colors bg-black/10 border border-black/10 rounded-full p-2"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Sugerencia de peso si existe */}
        {suggestedWeight && (() => {
          const suggestedWeightNumber = Number(suggestedWeight);
          const displaySuggestedWeight = Number.isFinite(suggestedWeightNumber)
            ? `${suggestedWeightNumber.toFixed(2)} kg`
            : `${suggestedWeight} kg`;

          return (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 flex items-start gap-2">
            <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="text-blue-300 font-semibold">Peso sugerido:</p>
              <p className="text-gray-300">
                {displaySuggestedWeight} (80% de tu PR: {previousPR} kg)
              </p>
              {neuralOverlap?.adjustment && (
                <p className="text-xs text-orange-300 mt-1">
                  🧠 Ajuste por solapamiento neural: {Math.round(neuralOverlap.adjustment * 100)}%
                  {neuralOverlap?.message ? ` · ${neuralOverlap.message}` : ''}
                </p>
              )}
            </div>
          </div>
          );
        })()}

          {/* Input: Peso */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">
              Peso Utilizado (kg)
            </label>
            <input
              type="number"
              step="0.5"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-yellow-400 focus:outline-none text-lg"
              placeholder="75.0"
              autoFocus
            />
          </div>

          {/* Input: Repeticiones */}
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">
              Repeticiones Completadas
            </label>
            <input
              type="number"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-yellow-400 focus:outline-none text-lg"
              placeholder="10"
            />
          </div>

          {/* Selector: RIR */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-gray-300">
                RIR (Repeticiones en Reserva)
              </label>
              <button
                onClick={() => setShowRIRReference(true)}
                className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 text-xs"
              >
                <Info className="w-4 h-4" />
                ¿Qué es RIR?
              </button>
            </div>
            <div className="grid grid-cols-5 gap-2 mb-2">
              {[0, 1, 2, 3, 4].map(value => (
                <button
                  key={value}
                  onClick={() => setRir(value)}
                  className={`py-3 rounded-xl font-bold transition-all border ${
                    rir === value
                      ? 'bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-gray-900 border-transparent shadow-[0_12px_30px_-18px_rgba(250,204,21,0.7)] scale-105'
                      : `bg-white/5 ${getRIRAccent(value)} hover:bg-white/10`
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
            <p className={`text-sm font-medium ${getRIRColor(rir)}`}>
              {getRIRLabel(rir)}
            </p>
          </div>

          {/* Cálculos en tiempo real */}
          {weight && reps && (
            <div className="bg-gray-800/50 rounded-lg p-4 space-y-2 border border-gray-700">
              <p className="text-xs text-gray-400 font-semibold uppercase">Cálculos Automáticos</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-400">1RM Estimado:</p>
                  <p className="text-white font-bold">{calculations.estimated1RM.toFixed(1)} kg</p>
                </div>
                <div>
                  <p className="text-gray-400">RPE:</p>
                  <p className="text-white font-bold">{calculations.rpe}/10</p>
                </div>
                <div>
                  <p className="text-gray-400">Volumen:</p>
                  <p className="text-white font-bold">{calculations.volumeLoad} kg</p>
                </div>
                <div>
                  <p className="text-gray-400">Estado:</p>
                  <p className={calculations.isEffective ? 'text-green-400 font-bold' : 'text-gray-400'}>
                    {calculations.isEffective ? '✓ Efectiva' : '○ Revisar'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Errores */}
          {errors.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              {errors.map((error, index) => (
                <p key={index} className="text-red-400 text-sm">• {error}</p>
              ))}
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-3 pt-2">
            {!isMandatory && (
              <button
                onClick={onClose}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
              >
                Cancelar
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={!weight || !reps}
              className="flex-1 py-3 bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 text-gray-900 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)] flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" />
              Guardar Serie
            </button>
          </div>
        </div>
      </div>

      {/* Modal de Referencia RIR */}
      <RIRReferenceModal
        isOpen={showRIRReference}
        onClose={() => setShowRIRReference(false)}
      />
    </div>
  );
}
