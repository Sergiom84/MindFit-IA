/**
 * FatigueReportModal - Modal para reportar estado de fatiga
 *
 * Permite al usuario reportar subjetivamente:
 * - Calidad de sueño (1-10)
 * - Nivel de energía (1-10)
 * - DOMS / Dolor muscular (0-10)
 * - Dolor articular (0-10)
 * - Nivel de concentración (1-10)
 * - Nivel de motivación (1-10)
 *
 * El backend determina automáticamente si genera un flag (leve/crítico/cognitivo)
 *
 * @version 1.0.0 - FASE 2 Módulo 1
 */

import { alertDialog } from '../../../../ui/dialogService.jsx';
import React, { useState } from 'react';
import { X, AlertTriangle, CheckCircle, Activity } from 'lucide-react';
import tokenManager from '../../../../../utils/tokenManager';
import { getApiBaseUrl } from '../../../../../config/api';

const API_URL = getApiBaseUrl();

export default function FatigueReportModal({ show, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    sleep_quality: 7,
    energy_level: 7,
    doms_level: 3,
    joint_pain_level: 0,
    focus_level: 7,
    motivation_level: 7,
    notes: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!show) return null;

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: parseInt(value) }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      const token = tokenManager.getToken();
      const response = await fetch(
        `${API_URL}/api/hipertrofiav2/submit-fatigue-report`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(formData)
        }
      );

      if (!response.ok) {
        throw new Error('Error al enviar reporte de fatiga');
      }

      const result = await response.json();

      console.log('✅ [FATIGUE] Reporte enviado:', result);

      // Llamar callback con resultado
      if (onSubmit) {
        onSubmit(result);
      }

      // Cerrar modal
      onClose();

    } catch (error) {
      console.error('❌ [FATIGUE] Error enviando reporte:', error);
      alertDialog('Error al enviar reporte. Por favor, intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Función para obtener color según valor
  const getColorClass = (value, inverse = false) => {
    if (inverse) {
      // Para DOMS y dolor articular (menor es mejor)
      if (value <= 3) return 'text-green-400';
      if (value <= 6) return 'text-yellow-400';
      return 'text-red-400';
    } else {
      // Para sueño, energía, concentración (mayor es mejor)
      if (value >= 7) return 'text-green-400';
      if (value >= 4) return 'text-yellow-400';
      return 'text-red-400';
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 p-4 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-white" />
            <div>
              <h3 className="text-lg font-bold text-white">Reporte de Recuperación</h3>
              <p className="text-sm text-blue-100">¿Cómo te sientes hoy?</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-300 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Info Box */}
          <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
            <p className="text-sm text-blue-200">
              Este reporte nos ayuda a ajustar automáticamente tu entrenamiento si detectamos señales de fatiga acumulada.
            </p>
          </div>

          {/* Sueño */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold text-white">
                😴 Calidad de Sueño
              </label>
              <span className={`text-lg font-bold ${getColorClass(formData.sleep_quality)}`}>
                {formData.sleep_quality}/10
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={formData.sleep_quality}
              onChange={(e) => handleChange('sleep_quality', e.target.value)}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Muy mal</span>
              <span>Excelente</span>
            </div>
          </div>

          {/* Energía */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold text-white">
                ⚡ Nivel de Energía
              </label>
              <span className={`text-lg font-bold ${getColorClass(formData.energy_level)}`}>
                {formData.energy_level}/10
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={formData.energy_level}
              onChange={(e) => handleChange('energy_level', e.target.value)}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Agotado</span>
              <span>Muy energético</span>
            </div>
          </div>

          {/* DOMS (Dolor Muscular) */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold text-white">
                💪 Dolor Muscular (DOMS)
              </label>
              <span className={`text-lg font-bold ${getColorClass(formData.doms_level, true)}`}>
                {formData.doms_level}/10
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="10"
              value={formData.doms_level}
              onChange={(e) => handleChange('doms_level', e.target.value)}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Sin dolor</span>
              <span>Muy dolorido</span>
            </div>
          </div>

          {/* Dolor Articular */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold text-white">
                🦴 Dolor Articular
              </label>
              <span className={`text-lg font-bold ${getColorClass(formData.joint_pain_level, true)}`}>
                {formData.joint_pain_level}/10
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="10"
              value={formData.joint_pain_level}
              onChange={(e) => handleChange('joint_pain_level', e.target.value)}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-500"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Sin dolor</span>
              <span>Dolor intenso</span>
            </div>
          </div>

          {/* Concentración */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold text-white">
                🧠 Nivel de Concentración
              </label>
              <span className={`text-lg font-bold ${getColorClass(formData.focus_level)}`}>
                {formData.focus_level}/10
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={formData.focus_level}
              onChange={(e) => handleChange('focus_level', e.target.value)}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Muy distraído</span>
              <span>Muy concentrado</span>
            </div>
          </div>

          {/* Motivación */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-semibold text-white">
                🔥 Nivel de Motivación
              </label>
              <span className={`text-lg font-bold ${getColorClass(formData.motivation_level)}`}>
                {formData.motivation_level}/10
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={formData.motivation_level}
              onChange={(e) => handleChange('motivation_level', e.target.value)}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Sin ganas</span>
              <span>Muy motivado</span>
            </div>
          </div>

          {/* Notas opcionales */}
          <div>
            <label className="text-sm font-semibold text-white mb-2 block">
              📝 Notas (opcional)
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="¿Algo más que quieras comentar? (estrés, enfermedad, etc.)"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows="3"
            />
          </div>

          {/* Warning si valores críticos */}
          {(formData.joint_pain_level >= 6 || formData.sleep_quality <= 3 || formData.energy_level <= 3) && (
            <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-300 mb-1">
                  Señal de Fatiga Crítica Detectada
                </p>
                <p className="text-xs text-red-200">
                  Tus valores indican alta fatiga. Considera descansar o reducir la intensidad del próximo entrenamiento.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-800 border-t border-gray-700 p-4 rounded-b-2xl flex gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <CheckCircle className="w-5 h-5" />
                Enviar Reporte
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
