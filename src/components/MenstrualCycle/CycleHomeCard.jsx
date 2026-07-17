import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Droplet, Zap, Moon, Heart, AlertCircle, ChevronRight, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import tokenManager from '../../utils/tokenManager';

/**
 * Tarjeta de ciclo menstrual para el Home
 * Muestra el día actual del ciclo, fase estimada y permite registro rápido
 * Solo visible para usuarios femeninos con tracking_enabled
 */
const CycleHomeCard = ({ userId }) => {
  const navigate = useNavigate();
  const [cycleData, setCycleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [quickLogValues, setQuickLogValues] = useState({
    energy_level: 3,
    pain_level: 1,
    sleep_quality: 3
  });
  const [saving, setSaving] = useState(false);

  // Cargar datos del ciclo
  useEffect(() => {
    const loadCycleData = async () => {
      try {
        const token = tokenManager.getToken();
        const response = await fetch('/api/menstrual-cycle/training-adjustment', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.hasConfig) {
            setCycleData(data);
          }
        }
      } catch (err) {
        console.error('Error cargando datos del ciclo:', err);
      } finally {
        setLoading(false);
      }
    };

    loadCycleData();
  }, [userId]);

  // Guardar registro rápido
  const handleQuickSave = async () => {
    setSaving(true);
    try {
      const token = tokenManager.getToken();
      const today = new Date().toISOString().split('T')[0];

      await fetch('/api/menstrual-cycle/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          log_date: today,
          ...quickLogValues
        })
      });

      // Recargar datos
      const response = await fetch('/api/menstrual-cycle/training-adjustment', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCycleData(data);
      }

      setShowQuickLog(false);
    } catch (err) {
      console.error('Error guardando registro:', err);
    } finally {
      setSaving(false);
    }
  };

  // Marcar inicio de periodo
  const handlePeriodStart = async () => {
    setSaving(true);
    try {
      const token = tokenManager.getToken();
      const today = new Date().toISOString().split('T')[0];

      await fetch('/api/menstrual-cycle/log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          log_date: today,
          is_period_day: true
        })
      });

      // Recargar datos
      const response = await fetch('/api/menstrual-cycle/training-adjustment', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCycleData(data);
      }
    } catch (err) {
      console.error('Error registrando periodo:', err);
    } finally {
      setSaving(false);
    }
  };

  const getPhaseColor = (phase) => {
    const colors = {
      menstrual: 'text-red-400 bg-red-500/20',
      follicular: 'text-green-400 bg-green-500/20',
      ovulation: 'text-yellow-400 bg-yellow-500/20',
      luteal: 'text-purple-400 bg-purple-500/20',
      hormonal: 'text-blue-400 bg-blue-500/20'
    };
    return colors[phase] || 'text-pink-400 bg-pink-500/20';
  };

  const getPhaseName = (phase) => {
    const names = {
      menstrual: 'Fase menstrual',
      follicular: 'Fase folicular',
      ovulation: 'Ovulación',
      luteal: 'Fase lútea',
      hormonal: 'Anticonceptivos'
    };
    return names[phase] || 'Sin datos';
  };

  if (loading) return null;
  if (!cycleData) return null;

  const { cycleDay, phase, todayLog, adjustment, mode } = cycleData;
  const isSymptomsMode = mode === 'symptoms';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-pink-900/30 to-purple-900/30 rounded-xl border border-pink-500/20 overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${getPhaseColor(phase)}`}>
            <Droplet className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-pink-300 uppercase tracking-wider">Mi Ciclo</p>
            <p className="text-white font-semibold">
              {isSymptomsMode ? 'Modo síntomas' : (cycleDay ? `Día ${cycleDay}` : 'Sin datos')}
              {!isSymptomsMode && phase && (
                <span className="text-pink-300 text-sm ml-2">· {getPhaseName(phase)}</span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/cycle')}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <ChevronRight className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      {/* Adjustment message if any */}
      {adjustment && adjustment.type !== 'normal' && (
        <div className="px-4 pb-2">
          <div className="flex items-start gap-2 bg-black/30 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 text-pink-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-300">{adjustment.message}</p>
          </div>
        </div>
      )}

      {/* Quick log section */}
      <div className="px-4 pb-4">
        {!todayLog ? (
          <div className="flex gap-2">
            <button
              onClick={handlePeriodStart}
              disabled={saving}
              className="flex-1 py-2.5 px-3 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Droplet className="w-4 h-4" />
              Hoy me bajó
            </button>
            <button
              onClick={() => setShowQuickLog(true)}
              className="flex-1 py-2.5 px-3 bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4" />
              Registrar día
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <Zap className={`w-4 h-4 ${todayLog.energy_level >= 4 ? 'text-yellow-400' : 'text-gray-500'}`} />
              <span className="text-gray-400">Energía: {todayLog.energy_level || '-'}/5</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Heart className={`w-4 h-4 ${todayLog.pain_level >= 3 ? 'text-red-400' : 'text-gray-500'}`} />
              <span className="text-gray-400">Dolor: {todayLog.pain_level || '-'}/5</span>
            </div>
            <button
              onClick={() => setShowQuickLog(true)}
              className="ml-auto text-pink-400 hover:text-pink-300 text-xs"
            >
              Editar
            </button>
          </div>
        )}
      </div>

      {/* Quick log modal */}
      <AnimatePresence>
        {showQuickLog && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-pink-500/20 bg-black/40"
          >
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-white">Registro rápido de hoy</h4>
                <button
                  onClick={() => setShowQuickLog(false)}
                  className="p-1 hover:bg-white/10 rounded"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* Energy slider */}
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-gray-400">Energía</span>
                  <span className="text-yellow-400">{quickLogValues.energy_level}/5</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={quickLogValues.energy_level}
                  onChange={(e) => setQuickLogValues(prev => ({ ...prev, energy_level: parseInt(e.target.value) }))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-400"
                />
              </div>

              {/* Pain slider */}
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-gray-400">Dolor/Malestar</span>
                  <span className="text-red-400">{quickLogValues.pain_level}/5</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={quickLogValues.pain_level}
                  onChange={(e) => setQuickLogValues(prev => ({ ...prev, pain_level: parseInt(e.target.value) }))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-red-400"
                />
              </div>

              {/* Sleep slider */}
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-gray-400">Calidad del sueño</span>
                  <span className="text-blue-400">{quickLogValues.sleep_quality}/5</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={quickLogValues.sleep_quality}
                  onChange={(e) => setQuickLogValues(prev => ({ ...prev, sleep_quality: parseInt(e.target.value) }))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-400"
                />
              </div>

              <button
                onClick={handleQuickSave}
                disabled={saving}
                className="w-full py-2.5 bg-pink-500 hover:bg-pink-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar registro'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default CycleHomeCard;
