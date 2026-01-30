import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Droplet, Calendar, Zap, Moon, TrendingUp, 
  ChevronRight, AlertCircle, Sparkles, Settings
} from 'lucide-react';
import CycleQuickLog from './CycleQuickLog';

/**
 * Tarjeta del día del ciclo - Vista compacta para Home o página Ciclo
 * Muestra: día del ciclo, fase, recomendación, acceso rápido a registro
 */
const CycleDayCard = ({ 
  cycleInfo, 
  todayLog, 
  adjustment,
  onLogSymptoms,
  onLogPeriodStart,
  onOpenSettings,
  compact = false 
}) => {
  const [showQuickLog, setShowQuickLog] = useState(false);

  // Colores por fase
  const phaseColors = {
    menstrual: {
      bg: 'from-red-500/20 via-red-900/10 to-transparent',
      border: 'border-red-500/30',
      text: 'text-red-400',
      icon: '🩸'
    },
    follicular: {
      bg: 'from-green-500/20 via-green-900/10 to-transparent',
      border: 'border-green-500/30',
      text: 'text-green-400',
      icon: '🌱'
    },
    ovulation: {
      bg: 'from-yellow-500/20 via-yellow-900/10 to-transparent',
      border: 'border-yellow-500/30',
      text: 'text-yellow-400',
      icon: '✨'
    },
    luteal: {
      bg: 'from-purple-500/20 via-purple-900/10 to-transparent',
      border: 'border-purple-500/30',
      text: 'text-purple-400',
      icon: '🌙'
    },
    hormonal: {
      bg: 'from-blue-500/20 via-blue-900/10 to-transparent',
      border: 'border-blue-500/30',
      text: 'text-blue-400',
      icon: '💊'
    },
    default: {
      bg: 'from-pink-500/20 via-pink-900/10 to-transparent',
      border: 'border-pink-500/30',
      text: 'text-pink-400',
      icon: '🩷'
    }
  };

  const colors = phaseColors[cycleInfo?.phase] || phaseColors.default;

  // Colores para el ajuste de entrenamiento
  const adjustmentColors = {
    green: 'bg-green-500/20 text-green-300 border-green-500/30',
    yellow: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    red: 'bg-red-500/20 text-red-300 border-red-500/30',
    orange: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    purple: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    blue: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
  };

  const handleLogSave = async (data) => {
    if (data.is_period_day) {
      await onLogPeriodStart?.();
    }
    await onLogSymptoms?.(data);
    setShowQuickLog(false);
  };

  // Si no hay configuración de ciclo
  if (!cycleInfo?.cycleDay) {
    return (
      <div className={`rounded-xl border ${colors.border} bg-gradient-to-br ${colors.bg} p-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center">
              <Droplet className="w-5 h-5 text-pink-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Ciclo menstrual</p>
              <p className="text-white font-medium">Sin configurar</p>
            </div>
          </div>
          <button
            onClick={onOpenSettings}
            className="px-4 py-2 bg-pink-500/20 text-pink-300 rounded-lg hover:bg-pink-500/30 transition-colors text-sm"
          >
            Configurar
          </button>
        </div>
      </div>
    );
  }

  // Modal de registro rápido
  if (showQuickLog) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-xl border border-pink-500/30 bg-gray-900 overflow-hidden"
      >
        <CycleQuickLog
          currentLog={todayLog}
          onSave={handleLogSave}
          onCancel={() => setShowQuickLog(false)}
        />
      </motion.div>
    );
  }

  // Vista compacta (para sidebar o widgets pequeños)
  if (compact) {
    return (
      <div className={`rounded-xl border ${colors.border} bg-gradient-to-br ${colors.bg} p-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{colors.icon}</span>
            <div>
              <p className="text-xs text-gray-400">Día {cycleInfo.cycleDay}</p>
              <p className={`text-sm font-medium ${colors.text}`}>{cycleInfo.phaseName}</p>
            </div>
          </div>
          <button
            onClick={() => setShowQuickLog(true)}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>
    );
  }

  // Vista completa
  return (
    <div className={`rounded-xl border ${colors.border} bg-gradient-to-br ${colors.bg} overflow-hidden`}>
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-black/30 flex items-center justify-center text-2xl">
              {colors.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-white">Día {cycleInfo.cycleDay}</span>
                <span className={`text-sm ${colors.text}`}>· {cycleInfo.phaseName}</span>
              </div>
              {cycleInfo.daysUntilNextPeriod && cycleInfo.daysUntilNextPeriod <= 7 && (
                <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                  <Calendar className="w-3 h-3" />
                  Próximo periodo en ~{cycleInfo.daysUntilNextPeriod} días
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <Settings className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Descripción de fase */}
      <div className="px-4 pb-3">
        <p className="text-sm text-gray-300">{cycleInfo.phaseDescription}</p>
      </div>

      {/* Registro del día (si existe) */}
      {todayLog && (
        <div className="px-4 pb-3">
          <div className="flex gap-3 text-xs">
            <div className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded">
              <Zap className="w-3 h-3 text-yellow-400" />
              <span className="text-gray-300">Energía: {todayLog.energy_level}/5</span>
            </div>
            <div className="flex items-center gap-1 bg-black/20 px-2 py-1 rounded">
              <Moon className="w-3 h-3 text-blue-400" />
              <span className="text-gray-300">Sueño: {todayLog.sleep_quality}/5</span>
            </div>
            {todayLog.pain_level > 2 && (
              <div className="flex items-center gap-1 bg-red-500/20 px-2 py-1 rounded">
                <AlertCircle className="w-3 h-3 text-red-400" />
                <span className="text-red-300">Dolor: {todayLog.pain_level}/5</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recomendación de entrenamiento */}
      {adjustment && (
        <div className={`mx-4 mb-3 p-3 rounded-lg border ${adjustmentColors[adjustment.color] || adjustmentColors.blue}`}>
          <div className="flex items-start gap-2">
            <span className="text-lg">{adjustment.icon}</span>
            <div>
              <p className="font-medium text-sm">{adjustment.title}</p>
              <p className="text-xs opacity-80 mt-0.5">{adjustment.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Botones de acción */}
      <div className="p-4 pt-2 flex gap-2">
        <button
          onClick={onLogPeriodStart}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            todayLog?.is_period_day
              ? 'bg-red-500/30 text-red-300 border border-red-500/40'
              : 'bg-white/5 text-gray-300 hover:bg-white/10'
          }`}
        >
          <Droplet className={`w-4 h-4 ${todayLog?.is_period_day ? 'fill-current' : ''}`} />
          {todayLog?.is_period_day ? 'Periodo activo' : 'Hoy me bajó'}
        </button>
        <button
          onClick={() => setShowQuickLog(true)}
          className="flex-1 py-2.5 bg-pink-500 text-white rounded-lg text-sm font-medium hover:bg-pink-600 transition-colors flex items-center justify-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          {todayLog ? 'Actualizar' : 'Registrar día'}
        </button>
      </div>
    </div>
  );
};

export default CycleDayCard;
