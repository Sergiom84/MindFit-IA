/**
 * FirstWeekWarning.jsx
 *
 * Componente para mostrar avisos contextuales sobre la redistribución
 * de días en la primera semana del plan de entrenamiento
 */

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, Info, Zap, Calendar } from 'lucide-react';
import { useEffect, useState } from 'react';
import apiClient from '@/lib/apiClient';

export function FirstWeekWarning({ methodologyPlanId, onClose, config: configProp = null }) {
  // Si el padre ya cargó la config (usePlanConfig), la reutilizamos por prop y
  // evitamos un segundo GET /routines/plan-config/:id (dedupe del fetch redundante).
  const [config, setConfig] = useState(configProp);
  const [warnings, setWarnings] = useState(configProp?.warnings || []);
  const [loading, setLoading] = useState(!configProp);

  useEffect(() => {
    // Config provista por prop: sin fetch propio.
    if (configProp) {
      setConfig(configProp);
      setWarnings(configProp?.warnings || []);
      setLoading(false);
      return;
    }

    if (!methodologyPlanId) {
      setLoading(false);
      return;
    }

    fetchPlanConfig();
  }, [methodologyPlanId, configProp]);

  const fetchPlanConfig = async () => {
    try {
      // 🎯 FIX: Removido /api/ duplicado - apiClient ya tiene /api como base
      const response = await apiClient.get(`/routines/plan-config/${methodologyPlanId}`);
      if (response.data?.success || response.success) {
        const configData = response.data?.config || response.config;
        setConfig(configData);
        setWarnings(configData?.warnings || []);
      }
    } catch (error) {
      console.warn('No se pudo cargar configuración del plan:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !config || warnings.length === 0) {
    return null;
  }

  const getIcon = (warning) => {
    switch (warning.type) {
      case 'warning':
        return <AlertTriangle className="h-5 w-5" />;
      case 'important':
        return <Zap className="h-5 w-5" />;
      case 'info':
      default:
        return <Info className="h-5 w-5" />;
    }
  };

  const getAlertVariant = (warning) => {
    switch (warning.type) {
      case 'warning':
        return 'warning';
      case 'important':
        return 'destructive';
      default:
        return 'default';
    }
  };

  return (
    <div className="space-y-3 mb-4">
      {warnings.map((warning, index) => (
        <Alert key={index} variant={getAlertVariant(warning)} className="bg-gray-800 border-yellow-400/30">
          <div className="flex items-start gap-3">
            <div className="text-yellow-400">
              {warning.icon ? (
                <span className="text-2xl">{warning.icon}</span>
              ) : (
                getIcon(warning)
              )}
            </div>
            <div className="flex-1">
              {warning.title && (
                <AlertTitle className="text-white mb-2">{warning.title}</AlertTitle>
              )}
              <AlertDescription className="text-gray-300">
                {warning.message}
              </AlertDescription>
            </div>
            {onClose && (
              <button
                onClick={() => onClose(index)}
                className="text-gray-500 hover:text-gray-300 transition-colors"
              >
                ×
              </button>
            )}
          </div>
        </Alert>
      ))}

      {/* Información adicional sobre el patrón de días */}
      {config.first_week_pattern && (
        <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="h-4 w-4 text-yellow-400" />
            <span className="text-sm font-medium text-white">Patrón de entrenamiento</span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Esta semana:</span>
              <span className="ml-2 text-white font-medium">
                {config.first_week_pattern.replace(/-/g, ' - ')}
              </span>
            </div>

            {config.regular_pattern && config.first_week_pattern !== config.regular_pattern && (
              <div>
                <span className="text-gray-400">Próximas semanas:</span>
                <span className="ml-2 text-white font-medium">
                  {config.regular_pattern.replace(/-/g, ' - ')}
                </span>
              </div>
            )}
          </div>

          {config.is_consecutive_days && (
            <div className="mt-3 p-2 bg-orange-900/20 rounded border border-orange-400/20">
              <p className="text-xs text-orange-300">
                ⚡ Días consecutivos detectados: El volumen ha sido ajustado automáticamente
              </p>
            </div>
          )}

          {config.is_extended_weeks && (
            <div className="mt-3 p-2 bg-blue-900/20 rounded border border-blue-400/20">
              <p className="text-xs text-blue-300">
                📊 Plan extendido a {config.total_weeks} semanas para completar todas las sesiones
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Hook para obtener la configuración del plan
 */
export function usePlanConfig(methodologyPlanId) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!methodologyPlanId) {
      setLoading(false);
      return;
    }

    const fetchConfig = async () => {
      try {
        // 🎯 FIX: Removido /api/ duplicado - apiClient ya tiene /api como base
        const response = await apiClient.get(`/routines/plan-config/${methodologyPlanId}`);
        if (response.data?.success || response.success) {
          setConfig(response.data?.config || response.config);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [methodologyPlanId]);

  return { config, loading, error };
}

export default FirstWeekWarning;