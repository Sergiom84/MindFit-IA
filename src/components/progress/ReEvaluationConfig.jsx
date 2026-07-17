/**
 * ⚙️ ReEvaluationConfig - Configuración de Re-evaluaciones
 *
 * PROPÓSITO: Permitir al usuario personalizar frecuencia de re-evaluaciones
 * UBICACIÓN: Sección de ajustes/perfil del usuario
 *
 * @version 1.0.0 - Fase 2 del Sistema de Re-evaluación Progresiva
 */

import React, { useState, useEffect } from 'react';
import tokenManager from '../../utils/tokenManager';
import {
  Settings,
  Clock,
  Bell,
  CheckCircle,
  AlertCircle,
  Info,
  Save,
  RefreshCw
} from 'lucide-react';

// =============================================================================
// 🎨 OPCIONES DE FRECUENCIA
// =============================================================================

const FREQUENCY_OPTIONS = [
  {
    value: 2,
    label: 'Cada 2 semanas',
    description: 'Evaluaciones más frecuentes, ideal para principiantes',
    icon: '⚡',
    recommended: false
  },
  {
    value: 3,
    label: 'Cada 3 semanas',
    description: 'Balance perfecto entre seguimiento y tiempo de adaptación',
    icon: '⭐',
    recommended: true
  },
  {
    value: 4,
    label: 'Cada 4 semanas',
    description: 'Mensual, permite ciclos completos de entrenamiento',
    icon: '📅',
    recommended: false
  },
  {
    value: 6,
    label: 'Cada 6 semanas',
    description: 'Para usuarios avanzados con progreso más lento',
    icon: '🎯',
    recommended: false
  },
  {
    value: 8,
    label: 'Cada 8 semanas',
    description: 'Evaluaciones espaciadas, enfoque a largo plazo',
    icon: '🏆',
    recommended: false
  }
];

// =============================================================================
// 🏗️ COMPONENTE PRINCIPAL
// =============================================================================

const ReEvaluationConfig = ({ userId }) => {
  const [config, setConfig] = useState({
    frequency_weeks: 3,
    notification_enabled: true,
    reminder_days_before: 1,
    auto_apply_suggestions: false
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  // =============================================================================
  // 📥 CARGAR CONFIGURACIÓN
  // =============================================================================

  useEffect(() => {
    loadConfig();
  }, [userId]);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/progress/config', {
        headers: {
          'Authorization': `Bearer ${tokenManager.getToken()}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.config) {
          setConfig(data.config);
        }
      }
    } catch (error) {
      console.error('Error cargando configuración:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // =============================================================================
  // 💾 GUARDAR CONFIGURACIÓN
  // =============================================================================

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setMessage(null);

      const response = await fetch('/api/progress/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenManager.getToken()}`
        },
        body: JSON.stringify(config)
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ type: 'success', text: '✅ Configuración guardada correctamente' });
        setHasChanges(false);
        setTimeout(() => setMessage(null), 3000);
      } else {
        throw new Error(data.error || 'Error al guardar');
      }
    } catch (error) {
      setMessage({ type: 'error', text: `❌ ${error.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  // =============================================================================
  // 🎨 HANDLERS
  // =============================================================================

  const handleFrequencyChange = (newFrequency) => {
    setConfig(prev => ({ ...prev, frequency_weeks: newFrequency }));
    setHasChanges(true);
  };

  const handleToggleNotifications = () => {
    setConfig(prev => ({ ...prev, notification_enabled: !prev.notification_enabled }));
    setHasChanges(true);
  };

  const handleToggleAutoApply = () => {
    setConfig(prev => ({ ...prev, auto_apply_suggestions: !prev.auto_apply_suggestions }));
    setHasChanges(true);
  };

  const handleReset = () => {
    setConfig({
      frequency_weeks: 3,
      notification_enabled: true,
      reminder_days_before: 1,
      auto_apply_suggestions: false
    });
    setHasChanges(true);
  };

  // =============================================================================
  // 🎨 RENDER
  // =============================================================================

  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-700 rounded w-1/3"></div>
          <div className="h-4 bg-gray-700 rounded w-2/3"></div>
          <div className="h-32 bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-yellow-400/10 to-orange-400/10 border-b border-yellow-400/20 p-6">
        <div className="flex items-center gap-3">
          <div className="bg-yellow-400/20 p-3 rounded-lg">
            <Settings className="text-yellow-400" size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">
              Configuración de Re-evaluaciones
            </h3>
            <p className="text-sm text-gray-400 mt-1">
              Personaliza cómo y cuándo quieres evaluar tu progreso
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-6 space-y-6">

        {/* Mensaje de feedback */}
        {message && (
          <div className={`rounded-lg p-4 flex items-start gap-3 ${
            message.type === 'success'
              ? 'bg-green-500/10 border border-green-500/30'
              : 'bg-red-500/10 border border-red-500/30'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle className="text-green-400 flex-shrink-0" size={20} />
            ) : (
              <AlertCircle className="text-red-400 flex-shrink-0" size={20} />
            )}
            <p className={`text-sm font-medium ${
              message.type === 'success' ? 'text-green-300' : 'text-red-300'
            }`}>
              {message.text}
            </p>
          </div>
        )}

        {/* Sección 1: Frecuencia de evaluación */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="text-yellow-400" size={20} />
            <h4 className="text-lg font-semibold text-white">
              Frecuencia de Evaluación
            </h4>
          </div>
          <p className="text-sm text-gray-400 mb-4">
            ¿Con qué frecuencia quieres revisar tu progreso y recibir ajustes personalizados de la IA?
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {FREQUENCY_OPTIONS.map(option => {
              const isSelected = config.frequency_weeks === option.value;

              return (
                <button
                  key={option.value}
                  onClick={() => handleFrequencyChange(option.value)}
                  className={`relative p-4 rounded-lg border transition-all text-left ${
                    isSelected
                      ? 'border-yellow-400 bg-yellow-400/10'
                      : 'border-gray-700 hover:border-gray-600 hover:bg-gray-700/50'
                  }`}
                >
                  {option.recommended && (
                    <div className="absolute top-2 right-2">
                      <span className="bg-yellow-400 text-black text-xs font-bold px-2 py-1 rounded-full">
                        Recomendado
                      </span>
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{option.icon}</span>
                    <div className="flex-1">
                      <p className={`font-semibold mb-1 ${
                        isSelected ? 'text-yellow-400' : 'text-white'
                      }`}>
                        {option.label}
                      </p>
                      <p className="text-xs text-gray-400">
                        {option.description}
                      </p>
                    </div>
                  </div>

                  {isSelected && (
                    <div className="absolute bottom-2 right-2">
                      <CheckCircle className="text-yellow-400" size={18} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Sección 2: Notificaciones */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Bell className="text-yellow-400" size={20} />
            <h4 className="text-lg font-semibold text-white">
              Notificaciones y Recordatorios
            </h4>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleToggleNotifications}
              className={`w-full flex items-center justify-between p-4 rounded-lg border transition-all ${
                config.notification_enabled
                  ? 'border-yellow-400 bg-yellow-400/10'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              <div className="flex items-start gap-3">
                <Bell className={config.notification_enabled ? 'text-yellow-400' : 'text-gray-500'} size={20} />
                <div className="text-left">
                  <p className={`font-semibold ${
                    config.notification_enabled ? 'text-white' : 'text-gray-400'
                  }`}>
                    Notificaciones habilitadas
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Recibe avisos cuando toque evaluar tu progreso
                  </p>
                </div>
              </div>
              <div className={`w-12 h-6 rounded-full transition-colors ${
                config.notification_enabled ? 'bg-yellow-400' : 'bg-gray-600'
              }`}>
                <div className={`w-5 h-5 bg-white rounded-full transition-transform m-0.5 ${
                  config.notification_enabled ? 'translate-x-6' : 'translate-x-0'
                }`}></div>
              </div>
            </button>
          </div>
        </section>

        {/* Sección 3: Aplicación automática */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <RefreshCw className="text-yellow-400" size={20} />
            <h4 className="text-lg font-semibold text-white">
              Ajustes Automáticos
            </h4>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 flex items-start gap-3 mb-3">
            <Info className="text-blue-400 flex-shrink-0 mt-0.5" size={18} />
            <div className="text-sm text-blue-200">
              <p className="font-semibold mb-1">Próximamente disponible</p>
              <p className="text-blue-300">
                Esta función permitirá que la IA ajuste automáticamente tu plan según tus evaluaciones.
                De momento, recibirás sugerencias que podrás aplicar manualmente.
              </p>
            </div>
          </div>

          <button
            disabled
            onClick={handleToggleAutoApply}
            className="w-full flex items-center justify-between p-4 rounded-lg border border-gray-700 bg-gray-700/30 cursor-not-allowed opacity-50"
          >
            <div className="flex items-start gap-3">
              <RefreshCw className="text-gray-500" size={20} />
              <div className="text-left">
                <p className="font-semibold text-gray-400">
                  Aplicar ajustes automáticamente
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  La IA ajustará tu plan sin tu intervención (deshabilitado)
                </p>
              </div>
            </div>
            <div className="w-12 h-6 rounded-full bg-gray-600">
              <div className="w-5 h-5 bg-gray-500 rounded-full m-0.5"></div>
            </div>
          </button>
        </section>

        {/* Info adicional */}
        <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
          <div className="flex items-start gap-3">
            <Info className="text-gray-400 flex-shrink-0" size={18} />
            <div className="text-sm text-gray-300">
              <p className="font-semibold mb-2">¿Cómo funcionan las re-evaluaciones?</p>
              <ul className="space-y-1 text-gray-400">
                <li>• Cada {config.frequency_weeks} semanas recibirás un recordatorio</li>
                <li>• Comparte tu progreso en ejercicios clave y sensaciones</li>
                <li>• La IA analizará tus datos y sugerirá ajustes personalizados</li>
                <li>• Podrás ver tu historial completo en la sección de Progreso</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Footer con botones */}
      <div className="border-t border-gray-700 p-6 bg-gray-800/50 flex items-center justify-between">
        <button
          onClick={handleReset}
          disabled={isSaving}
          className="px-4 py-2 text-gray-300 hover:text-white transition-colors disabled:opacity-50"
        >
          Restablecer valores por defecto
        </button>

        <div className="flex gap-3">
          <button
            onClick={loadConfig}
            disabled={isSaving}
            className="px-4 py-2 text-gray-300 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="px-6 py-2 bg-yellow-400 hover:bg-yellow-500 text-black font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-black border-t-transparent"></div>
                Guardando...
              </>
            ) : (
              <>
                <Save size={18} />
                Guardar cambios
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReEvaluationConfig;
