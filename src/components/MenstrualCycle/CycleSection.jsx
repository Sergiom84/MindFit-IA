import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, BarChart3, Settings,
  TrendingUp, Droplet, Moon, Zap,
  Info
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import useMenstrualCycle from './hooks/useMenstrualCycle';
import CycleCalendar from './CycleCalendar';
import DailyLogModal from './DailyLogModal';
import CycleDayCard from './CycleDayCard';
import CycleOnboarding from './CycleOnboarding';

/**
 * Sección principal del Ciclo Menstrual
 * Accesible desde la navegación principal (solo para usuarios femeninos)
 */
const CycleSection = () => {
  const { user } = useAuth();
  const [activeView, setActiveView] = useState('today'); // 'today', 'calendar', 'insights', 'settings'
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [calendarLogs, setCalendarLogs] = useState([]);
  const [dailyLogDate, setDailyLogDate] = useState(null);
  const [dailyLogOpen, setDailyLogOpen] = useState(false);
  
  const {
    config,
    todayLog,
    effectiveTodayLog,
    loading,
    cycleInfo,
    periodActive,
    saveConfig,
    logPeriodStart,
    logSymptoms,
    getTrainingAdjustment,
    refresh
  } = useMenstrualCycle(user?.id);

  const loadCalendarLogs = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const year = selectedMonth.getFullYear();
      const month = selectedMonth.getMonth() + 1;
      
      const response = await fetch(
        `/api/menstrual-cycle/logs?year=${year}&month=${month}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (response.ok) {
        const data = await response.json();
        setCalendarLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Error cargando logs del calendario:', err);
    }
  }, [selectedMonth]);

  // Cargar logs del mes para calendario
  useEffect(() => {
    if (activeView === 'calendar') {
      loadCalendarLogs();
    }
  }, [activeView, loadCalendarLogs]);

  // Si no hay config, mostrar onboarding
  useEffect(() => {
    if (!loading && !config) {
      setShowOnboarding(true);
    }
  }, [loading, config]);

  const handleOnboardingComplete = async (data) => {
    const result = await saveConfig(data);
    if (result.success) {
      setShowOnboarding(false);
      refresh();
    }
  };

  const adjustment = getTrainingAdjustment();

  // Tabs de navegación
  const tabs = [
    { id: 'today', label: 'Hoy', icon: Droplet },
    { id: 'calendar', label: 'Calendario', icon: Calendar },
    { id: 'insights', label: 'Insights', icon: BarChart3 },
    { id: 'settings', label: 'Ajustes', icon: Settings }
  ];

  const handleSelectCalendarDate = useCallback(({ date }) => {
    if (!date) return;
    setDailyLogDate(date);
    setDailyLogOpen(true);
  }, []);

  const handleDailyLogSaved = useCallback(async () => {
    await loadCalendarLogs();
    refresh();
  }, [loadCalendarLogs, refresh]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050506] text-white relative overflow-hidden flex items-center justify-center font-body">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[url('/assets/tech-lux/bg-tech-lux-mobile.jpg')] sm:bg-[url('/assets/tech-lux/bg-tech-lux-desktop.jpg')] bg-cover bg-center opacity-80 sm:opacity-70" />
          <div className="absolute inset-0 bg-[url('/assets/tech-lux/texture-tech-lux-tile.jpg')] bg-repeat opacity-20 mix-blend-soft-light" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/80 sm:from-black/40 sm:via-black/60 sm:to-black" />
          <div className="absolute -top-20 right-0 h-56 w-56 bg-pink-400/10 blur-[140px]" />
          <div className="absolute top-1/3 -left-16 h-64 w-64 bg-pink-400/10 blur-[160px]" />
        </div>
        <div className="relative z-10 animate-spin rounded-full h-12 w-12 border-2 border-pink-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050506] text-white relative overflow-hidden pb-24 font-body">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[url('/assets/tech-lux/bg-tech-lux-mobile.jpg')] sm:bg-[url('/assets/tech-lux/bg-tech-lux-desktop.jpg')] bg-cover bg-center opacity-80 sm:opacity-70" />
        <div className="absolute inset-0 bg-[url('/assets/tech-lux/texture-tech-lux-tile.jpg')] bg-repeat opacity-20 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/80 sm:from-black/40 sm:via-black/60 sm:to-black" />
        <div className="absolute -top-20 right-0 h-56 w-56 bg-pink-400/10 blur-[140px]" />
        <div className="absolute top-1/3 -left-16 h-64 w-64 bg-pink-400/10 blur-[160px]" />
      </div>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-neutral-900/70 backdrop-blur-xl border-b border-white/10 ring-1 ring-white/5">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-pink-200/80">Mi Ciclo</p>
              <h1 className="text-2xl font-semibold font-urbanist">Seguimiento Menstrual</h1>
            </div>
            {cycleInfo?.cycleDay && (
              <div className="text-right">
                <p className="text-2xl font-bold text-pink-300">Día {cycleInfo.cycleDay}</p>
                <p className="text-xs text-gray-300/70">{cycleInfo.phaseName}</p>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 bg-white/5 border border-white/10 rounded-2xl p-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  activeView === tab.id
                    ? 'bg-gradient-to-r from-pink-300 via-pink-400 to-rose-500 text-black shadow-[0_10px_26px_-18px_rgba(244,114,182,0.7)]'
                    : 'text-gray-300/80 hover:text-white hover:bg-white/10'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="relative z-10 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
        <AnimatePresence mode="wait">
          {/* Vista HOY */}
          {activeView === 'today' && (
            <motion.div
              key="today"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {showOnboarding ? (
                <CycleOnboarding
                  onComplete={handleOnboardingComplete}
                  onSkip={() => setShowOnboarding(false)}
                />
              ) : (
                <>
                <CycleDayCard
                  cycleInfo={cycleInfo}
                  todayLog={todayLog}
                  effectiveTodayLog={effectiveTodayLog}
                  periodActive={periodActive}
                  adjustment={adjustment}
                  onLogSymptoms={logSymptoms}
                  onLogPeriodStart={logPeriodStart}
                  onOpenSettings={() => setActiveView('settings')}
                />

                  {/* Info educativa */}
                  <div className="bg-neutral-900/70 rounded-xl p-4 border border-white/10 ring-1 ring-white/5 backdrop-blur-lg border-l-2 border-l-pink-400/40">
                    <div className="flex items-start gap-3">
                      <Info className="w-5 h-5 text-pink-300 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-white mb-1">Sobre la {cycleInfo?.phaseName}</h4>
                        <p className="text-sm text-gray-300/70">{cycleInfo?.phaseDescription}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* Vista CALENDARIO */}
          {activeView === 'calendar' && (
            <motion.div
              key="calendar"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <CycleCalendar
                selectedMonth={selectedMonth}
                onChangeMonth={setSelectedMonth}
                calendarLogs={calendarLogs}
                config={config}
                onSelectDate={handleSelectCalendarDate}
              />
            </motion.div>
          )}

          {/* Vista INSIGHTS */}
          {activeView === 'insights' && (
            <motion.div
              key="insights"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="bg-neutral-900/70 rounded-xl p-6 border border-white/10 ring-1 ring-white/5 text-center backdrop-blur-lg">
                <TrendingUp className="w-12 h-12 text-pink-300/60 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Insights en desarrollo</h3>
                <p className="text-sm text-gray-300/70">
                  Después de 2-3 ciclos de registro, podremos mostrarte patrones 
                  de energía, sueño y rendimiento personalizados.
                </p>
              </div>

              {/* Preview de métricas futuras */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <Zap className="w-6 h-6 text-yellow-300/60 mb-2" />
                  <p className="text-xs text-gray-400/70">Próximamente</p>
                  <p className="text-sm text-gray-300/80">Energía por fase</p>
                </div>
                <div className="bg-white/5 rounded-lg p-4 border border-white/10">
                  <Moon className="w-6 h-6 text-sky-300/60 mb-2" />
                  <p className="text-xs text-gray-400/70">Próximamente</p>
                  <p className="text-sm text-gray-300/80">Calidad de sueño</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Vista SETTINGS */}
          {activeView === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              <div className="bg-neutral-900/70 rounded-xl p-4 border border-white/10 ring-1 ring-white/5 backdrop-blur-lg">
                <h3 className="font-medium text-white mb-4">Configuración del ciclo</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-2 border-b border-white/10">
                    <span className="text-gray-300/70">Duración del ciclo</span>
                    <span className="text-white">{config?.cycle_length || 28} días</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-white/10">
                    <span className="text-gray-300/70">Duración del periodo</span>
                    <span className="text-white">{config?.period_length || 5} días</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-white/10">
                    <span className="text-gray-300/70">Ciclo regular</span>
                    <span className="text-white">{config?.is_regular ? 'Sí' : 'No'}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-gray-300/70">Anticonceptivos hormonales</span>
                    <span className="text-white">{config?.uses_hormonal_contraceptives ? 'Sí' : 'No'}</span>
                  </div>
                </div>

                <button
                  onClick={() => setShowOnboarding(true)}
                  className="w-full mt-4 py-3 bg-gradient-to-r from-pink-300 via-pink-400 to-rose-500 text-black rounded-lg hover:from-pink-200 hover:via-pink-300 hover:to-rose-400 transition-colors font-semibold shadow-[0_12px_30px_-18px_rgba(244,114,182,0.7)]"
                >
                  Modificar configuración
                </button>
              </div>

              {/* Notificaciones (futuro) */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10 opacity-50">
                <h3 className="font-medium text-gray-300 mb-2">Notificaciones</h3>
                <p className="text-sm text-gray-400">Próximamente: recordatorios y predicciones</p>
              </div>
            </motion.div>
          )}
      </AnimatePresence>
        </div>
      </div>

      <DailyLogModal
        isOpen={dailyLogOpen}
        date={dailyLogDate}
        onClose={() => setDailyLogOpen(false)}
        onSaved={handleDailyLogSaved}
      />

      {/* Modal de onboarding */}
      <AnimatePresence>
        {showOnboarding && activeView !== 'today' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <CycleOnboarding
              onComplete={handleOnboardingComplete}
              onSkip={() => setShowOnboarding(false)}
              isModal
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CycleSection;
