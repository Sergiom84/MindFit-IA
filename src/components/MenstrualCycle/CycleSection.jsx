import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Calendar, BarChart3, Settings, ArrowLeft, 
  TrendingUp, Droplet, Moon, Zap, Clock,
  ChevronLeft, ChevronRight, Info
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import useMenstrualCycle from './hooks/useMenstrualCycle';
import CycleDayCard from './CycleDayCard';
import CycleOnboarding from './CycleOnboarding';
import CycleQuickLog from './CycleQuickLog';

/**
 * Sección principal del Ciclo Menstrual
 * Accesible desde la navegación principal (solo para usuarios femeninos)
 */
const CycleSection = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeView, setActiveView] = useState('today'); // 'today', 'calendar', 'insights', 'settings'
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [calendarLogs, setCalendarLogs] = useState([]);
  
  const {
    config,
    todayLog,
    loading,
    cycleInfo,
    saveConfig,
    logPeriodStart,
    logSymptoms,
    getTrainingAdjustment,
    refresh
  } = useMenstrualCycle(user?.id);

  // Cargar logs del mes para calendario
  useEffect(() => {
    const loadCalendarLogs = async () => {
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
    };

    if (activeView === 'calendar') {
      loadCalendarLogs();
    }
  }, [selectedMonth, activeView]);

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

  // Generar días del calendario
  const generateCalendarDays = () => {
    const year = selectedMonth.getFullYear();
    const month = selectedMonth.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    
    const days = [];
    
    // Días vacíos al inicio
    for (let i = 0; i < startingDay; i++) {
      days.push({ day: null, log: null });
    }
    
    // Días del mes
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const log = calendarLogs.find(l => l.log_date?.split('T')[0] === dateStr);
      days.push({ day, log, date: dateStr });
    }
    
    return days;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-pink-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black/90 backdrop-blur-sm border-b border-gray-800">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-pink-400">Mi Ciclo</p>
              <h1 className="text-2xl font-bold">Seguimiento Menstrual</h1>
            </div>
            {cycleInfo?.cycleDay && (
              <div className="text-right">
                <p className="text-2xl font-bold text-pink-400">Día {cycleInfo.cycleDay}</p>
                <p className="text-xs text-gray-400">{cycleInfo.phaseName}</p>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 bg-gray-900 rounded-lg p-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveView(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  activeView === tab.id
                    ? 'bg-pink-500 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
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
      <div className="max-w-4xl mx-auto px-4 py-6">
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
                    adjustment={adjustment}
                    onLogSymptoms={logSymptoms}
                    onLogPeriodStart={logPeriodStart}
                    onOpenSettings={() => setActiveView('settings')}
                  />

                  {/* Info educativa */}
                  <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800">
                    <div className="flex items-start gap-3">
                      <Info className="w-5 h-5 text-pink-400 mt-0.5" />
                      <div>
                        <h4 className="font-medium text-white mb-1">Sobre la {cycleInfo?.phaseName}</h4>
                        <p className="text-sm text-gray-400">{cycleInfo?.phaseDescription}</p>
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
              {/* Navegación del mes */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1))}
                  className="p-2 hover:bg-gray-800 rounded-lg"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <h3 className="text-lg font-semibold">
                  {selectedMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                </h3>
                <button
                  onClick={() => setSelectedMonth(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1))}
                  className="p-2 hover:bg-gray-800 rounded-lg"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              {/* Días de la semana */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
                  <div key={day} className="text-center text-xs text-gray-500 py-2">
                    {day}
                  </div>
                ))}
              </div>

              {/* Grid del calendario */}
              <div className="grid grid-cols-7 gap-1">
                {generateCalendarDays().map((item, idx) => (
                  <div
                    key={idx}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm ${
                      item.day
                        ? item.log?.is_period_day
                          ? 'bg-red-500/30 text-red-300'
                          : item.log
                            ? 'bg-pink-500/20 text-pink-300'
                            : 'bg-gray-900 text-gray-400 hover:bg-gray-800'
                        : ''
                    }`}
                  >
                    {item.day && (
                      <>
                        <span className="font-medium">{item.day}</span>
                        {item.log && (
                          <div className="flex gap-0.5 mt-1">
                            {item.log.is_period_day && <Droplet className="w-2 h-2 fill-current text-red-400" />}
                            {item.log.energy_level && <Zap className="w-2 h-2 text-yellow-400" />}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Leyenda */}
              <div className="flex gap-4 mt-4 text-xs text-gray-400">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-red-500/30" />
                  <span>Periodo</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded bg-pink-500/20" />
                  <span>Día registrado</span>
                </div>
              </div>
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
              <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-800 text-center">
                <TrendingUp className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Insights en desarrollo</h3>
                <p className="text-sm text-gray-400">
                  Después de 2-3 ciclos de registro, podremos mostrarte patrones 
                  de energía, sueño y rendimiento personalizados.
                </p>
              </div>

              {/* Preview de métricas futuras */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-900/30 rounded-lg p-4 border border-gray-800">
                  <Zap className="w-6 h-6 text-yellow-400/50 mb-2" />
                  <p className="text-xs text-gray-500">Próximamente</p>
                  <p className="text-sm text-gray-400">Energía por fase</p>
                </div>
                <div className="bg-gray-900/30 rounded-lg p-4 border border-gray-800">
                  <Moon className="w-6 h-6 text-blue-400/50 mb-2" />
                  <p className="text-xs text-gray-500">Próximamente</p>
                  <p className="text-sm text-gray-400">Calidad de sueño</p>
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
              <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800">
                <h3 className="font-medium text-white mb-4">Configuración del ciclo</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-2 border-b border-gray-800">
                    <span className="text-gray-400">Duración del ciclo</span>
                    <span className="text-white">{config?.cycle_length || 28} días</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-gray-800">
                    <span className="text-gray-400">Duración del periodo</span>
                    <span className="text-white">{config?.period_length || 5} días</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-gray-800">
                    <span className="text-gray-400">Ciclo regular</span>
                    <span className="text-white">{config?.is_regular ? 'Sí' : 'No'}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-gray-400">Anticonceptivos hormonales</span>
                    <span className="text-white">{config?.uses_hormonal_contraceptives ? 'Sí' : 'No'}</span>
                  </div>
                </div>

                <button
                  onClick={() => setShowOnboarding(true)}
                  className="w-full mt-4 py-3 bg-pink-500/20 text-pink-300 rounded-lg hover:bg-pink-500/30 transition-colors"
                >
                  Modificar configuración
                </button>
              </div>

              {/* Notificaciones (futuro) */}
              <div className="bg-gray-900/30 rounded-xl p-4 border border-gray-800 opacity-50">
                <h3 className="font-medium text-gray-400 mb-2">Notificaciones</h3>
                <p className="text-sm text-gray-500">Próximamente: recordatorios y predicciones</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modal de onboarding */}
      <AnimatePresence>
        {showOnboarding && activeView !== 'today' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
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
