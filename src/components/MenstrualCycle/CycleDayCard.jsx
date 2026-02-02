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
  effectiveTodayLog,
  periodActive,
  adjustment,
  onLogSymptoms,
  onLogPeriodStart,
  onOpenSettings,
  compact = false 
}) => {
  const [showQuickLog, setShowQuickLog] = useState(false);

  // Colores por fase
  const cardBase = 'bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg';
  const phaseColors = {
    menstrual: {
      accent: 'border-l-2 border-l-rose-400/50',
      text: 'text-rose-300',
      icon: '🩸'
    },
    follicular: {
      accent: 'border-l-2 border-l-emerald-400/50',
      text: 'text-emerald-300',
      icon: '🌱'
    },
    ovulation: {
      accent: 'border-l-2 border-l-yellow-400/50',
      text: 'text-yellow-300',
      icon: '✨'
    },
    luteal: {
      accent: 'border-l-2 border-l-purple-400/50',
      text: 'text-purple-300',
      icon: '🌙'
    },
    hormonal: {
      accent: 'border-l-2 border-l-sky-400/50',
      text: 'text-sky-300',
      icon: '💊'
    },
    default: {
      accent: 'border-l-2 border-l-pink-400/50',
      text: 'text-pink-300',
      icon: '🩷'
    }
  };

  const colors = phaseColors[cycleInfo?.phase] || phaseColors.default;

  // Colores para el ajuste de entrenamiento
  const adjustmentColors = {
    green: 'bg-white/5 text-emerald-200 border border-white/10 border-l-2 border-l-emerald-400/50',
    yellow: 'bg-white/5 text-yellow-200 border border-white/10 border-l-2 border-l-yellow-400/50',
    red: 'bg-white/5 text-rose-200 border border-white/10 border-l-2 border-l-rose-400/50',
    orange: 'bg-white/5 text-amber-200 border border-white/10 border-l-2 border-l-amber-400/50',
    purple: 'bg-white/5 text-purple-200 border border-white/10 border-l-2 border-l-purple-400/50',
    blue: 'bg-white/5 text-sky-200 border border-white/10 border-l-2 border-l-sky-400/50'
  };

  const handleLogSave = async (data) => {
    if (data.is_period_day) {
      await onLogPeriodStart?.({ periodActive });
    }
    await onLogSymptoms?.(data);
    setShowQuickLog(false);
  };

  // Si no hay configuración de ciclo
  if (!cycleInfo?.cycleDay) {
    return (
      <div className={`rounded-xl ${cardBase} ${colors.accent} p-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
              <Droplet className="w-5 h-5 text-pink-300" />
            </div>
            <div>
              <p className="text-sm text-gray-300/70">Ciclo menstrual</p>
              <p className="text-white font-medium">Sin configurar</p>
            </div>
          </div>
          <button
            onClick={onOpenSettings}
            className="px-4 py-2 bg-gradient-to-r from-pink-300 via-pink-400 to-rose-500 text-black rounded-lg hover:from-pink-200 hover:via-pink-300 hover:to-rose-400 transition-colors text-sm font-semibold shadow-[0_10px_24px_-16px_rgba(244,114,182,0.7)]"
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
        className="rounded-xl border border-white/10 bg-neutral-900/80 overflow-hidden ring-1 ring-white/5 backdrop-blur-lg"
      >
        <CycleQuickLog
          currentLog={effectiveTodayLog}
          periodActive={periodActive}
          onSave={handleLogSave}
          onCancel={() => setShowQuickLog(false)}
        />
      </motion.div>
    );
  }

  // Vista compacta (para sidebar o widgets pequeños)
  if (compact) {
    return (
      <div className={`rounded-xl ${cardBase} ${colors.accent} p-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{colors.icon}</span>
            <div>
              <p className="text-xs text-gray-300/70">Día {cycleInfo.cycleDay}</p>
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
    <div className={`rounded-xl ${cardBase} ${colors.accent} overflow-hidden`}>
      {/* Header */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-2xl">
              {colors.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-white">Día {cycleInfo.cycleDay}</span>
                <span className={`text-sm ${colors.text}`}>· {cycleInfo.phaseName}</span>
              </div>
              {cycleInfo.daysUntilNextPeriod && cycleInfo.daysUntilNextPeriod <= 7 && (
                <p className="text-xs text-gray-300/70 flex items-center gap-1 mt-1">
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

      {/* Registro del día (si existe) */}
      {todayLog && (
        <div className="px-4 pb-3">
          <div className="flex gap-3 text-xs">
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 px-2 py-1 rounded">
              <Zap className="w-3 h-3 text-yellow-300" />
              <span className="text-gray-300/80">Energía: {todayLog.energy_level}/5</span>
            </div>
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 px-2 py-1 rounded">
              <Moon className="w-3 h-3 text-sky-300" />
              <span className="text-gray-300/80">Sueño: {todayLog.sleep_quality}/5</span>
            </div>
            {todayLog.pain_level > 2 && (
              <div className="flex items-center gap-1 bg-white/5 border border-red-400/30 px-2 py-1 rounded">
                <AlertCircle className="w-3 h-3 text-rose-300" />
                <span className="text-rose-200">Dolor: {todayLog.pain_level}/5</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recomendación de entrenamiento */}
      {adjustment && (
        <div className={`mx-4 mb-3 p-3 rounded-lg ${adjustmentColors[adjustment.color] || adjustmentColors.blue}`}>
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
          onClick={() => onLogPeriodStart?.({ periodActive })}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
            periodActive
              ? 'bg-white/5 text-rose-200 border border-rose-400/40'
              : 'bg-white/5 text-gray-300/80 hover:bg-white/10 border border-white/10'
          }`}
          disabled={periodActive}
        >
          <Droplet className={`w-4 h-4 ${periodActive ? 'fill-current' : ''}`} />
          {periodActive ? 'Periodo activo' : 'Hoy me bajó'}
        </button>
        <button
          onClick={() => setShowQuickLog(true)}
          className="flex-1 py-2.5 bg-gradient-to-r from-pink-300 via-pink-400 to-rose-500 text-black rounded-lg text-sm font-semibold hover:from-pink-200 hover:via-pink-300 hover:to-rose-400 transition-colors flex items-center justify-center gap-2 shadow-[0_10px_24px_-16px_rgba(244,114,182,0.7)]"
        >
          <Sparkles className="w-4 h-4" />
          {todayLog ? 'Actualizar' : 'Registrar día'}
        </button>
      </div>
    </div>
  );
};

export default CycleDayCard;
