import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Droplet, Zap, Moon, Frown, Wind, Check, X } from 'lucide-react';

/**
 * Registro rápido diario de síntomas
 * Diseñado para completarse en menos de 30 segundos
 */
const CycleQuickLog = ({ 
  onSave, 
  onCancel, 
  currentLog = null,
  isModal = false 
}) => {
  const [formData, setFormData] = useState({
    is_period_day: currentLog?.is_period_day || false,
    energy_level: currentLog?.energy_level || 3,
    pain_level: currentLog?.pain_level || 1,
    sleep_quality: currentLog?.sleep_quality || 3,
    mood: currentLog?.mood || null,
    bloating: currentLog?.bloating || null
  });
  const [showOptional, setShowOptional] = useState(false);
  const [saving, setSaving] = useState(false);
  const cardBase = 'bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg';
  const iconColors = {
    pink: 'text-pink-300',
    yellow: 'text-yellow-300',
    blue: 'text-sky-300',
    purple: 'text-purple-300',
    red: 'text-rose-300'
  };
  const sliderActiveClasses = {
    pink: 'bg-pink-500/70 hover:bg-pink-500',
    yellow: 'bg-yellow-500/70 hover:bg-yellow-500',
    blue: 'bg-blue-500/70 hover:bg-blue-500',
    purple: 'bg-purple-500/70 hover:bg-purple-500',
    red: 'bg-red-500/70 hover:bg-red-500'
  };

  const handleSave = async () => {
    setSaving(true);
    // Filtrar campos nulos opcionales
    const dataToSave = { ...formData };
    if (dataToSave.mood === null) delete dataToSave.mood;
    if (dataToSave.bloating === null) delete dataToSave.bloating;
    
    await onSave(dataToSave);
    setSaving(false);
  };

  const SliderInput = ({ 
    label, 
    icon: Icon, 
    value, 
    onChange, 
    color = 'pink',
    labels = ['Muy bajo', 'Bajo', 'Normal', 'Alto', 'Muy alto']
  }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${iconColors[color] || 'text-pink-300'}`} />
          <span className="text-sm text-gray-300/80">{label}</span>
        </div>
        <span className="text-xs text-gray-400/70">{labels[value - 1]}</span>
      </div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(level => (
          <button
            key={level}
            onClick={() => onChange(level)}
            className={`flex-1 h-8 rounded transition-all ${
              level <= value 
                ? sliderActiveClasses[color] || sliderActiveClasses.pink
                : 'bg-white/5 border border-white/10 hover:bg-white/10'
            }`}
            style={{
              backgroundColor: level <= value 
                ? color === 'pink' ? 'rgb(236, 72, 153, 0.8)' 
                : color === 'yellow' ? 'rgb(234, 179, 8, 0.8)'
                : color === 'blue' ? 'rgb(59, 130, 246, 0.8)'
                : color === 'purple' ? 'rgb(168, 85, 247, 0.8)'
                : color === 'red' ? 'rgb(239, 68, 68, 0.8)'
                : 'rgb(236, 72, 153, 0.8)'
                : undefined
            }}
          />
        ))}
      </div>
    </div>
  );

  const containerClasses = isModal 
    ? `${cardBase} rounded-xl p-5 max-w-md mx-auto`
    : `${cardBase} rounded-xl p-5 border-l-2 border-l-pink-400/40`;

  return (
    <div className={containerClasses}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold text-white font-urbanist">¿Cómo estás hoy?</h3>
        {onCancel && (
          <button 
            onClick={onCancel}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="space-y-5">
        {/* Botón de periodo */}
        <button
          onClick={() => setFormData(prev => ({ ...prev, is_period_day: !prev.is_period_day }))}
          className={`w-full p-4 rounded-lg border transition-all flex items-center justify-center gap-3 ${
            formData.is_period_day 
              ? 'bg-white/5 border-rose-400/50 text-rose-200'
              : 'bg-white/5 border-white/10 text-gray-300/80 hover:border-white/20'
          }`}
        >
          <Droplet className={`w-5 h-5 ${formData.is_period_day ? 'fill-current' : ''}`} />
          <span className="font-medium">
            {formData.is_period_day ? 'Hoy tengo el periodo' : 'Marcar día de periodo'}
          </span>
          {formData.is_period_day && <Check className="w-5 h-5" />}
        </button>

        {/* Sliders principales (siempre visibles) */}
        <SliderInput
          label="Nivel de energía"
          icon={Zap}
          value={formData.energy_level}
          onChange={(v) => setFormData(prev => ({ ...prev, energy_level: v }))}
          color="yellow"
          labels={['Agotada', 'Baja', 'Normal', 'Buena', 'Excelente']}
        />

        <SliderInput
          label="Dolor/Molestias"
          icon={Frown}
          value={formData.pain_level}
          onChange={(v) => setFormData(prev => ({ ...prev, pain_level: v }))}
          color="red"
          labels={['Ninguno', 'Leve', 'Moderado', 'Fuerte', 'Muy fuerte']}
        />

        <SliderInput
          label="Calidad del sueño"
          icon={Moon}
          value={formData.sleep_quality}
          onChange={(v) => setFormData(prev => ({ ...prev, sleep_quality: v }))}
          color="blue"
          labels={['Muy mal', 'Mal', 'Regular', 'Bien', 'Excelente']}
        />

        {/* Campos opcionales */}
        <button
          onClick={() => setShowOptional(!showOptional)}
          className="text-sm text-gray-400/70 hover:text-gray-200 flex items-center gap-1"
        >
          {showOptional ? '- Ocultar campos opcionales' : '+ Añadir estado de ánimo e hinchazón'}
        </button>

        <AnimatePresence>
          {showOptional && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-5 overflow-hidden"
            >
              <SliderInput
                label="Estado de ánimo"
                icon={Frown}
                value={formData.mood || 3}
                onChange={(v) => setFormData(prev => ({ ...prev, mood: v }))}
                color="purple"
                labels={['Muy bajo', 'Bajo', 'Normal', 'Bueno', 'Excelente']}
              />

              <SliderInput
                label="Hinchazón"
                icon={Wind}
                value={formData.bloating || 1}
                onChange={(v) => setFormData(prev => ({ ...prev, bloating: v }))}
                color="pink"
                labels={['Ninguna', 'Leve', 'Moderada', 'Notable', 'Muy hinchada']}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Botón guardar */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 bg-gradient-to-r from-pink-300 via-pink-400 to-rose-500 text-black rounded-lg font-semibold hover:from-pink-200 hover:via-pink-300 hover:to-rose-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-[0_12px_30px_-18px_rgba(244,114,182,0.7)]"
      >
        {saving ? (
          <>
            <div className="w-5 h-5 border-2 border-black/40 border-t-transparent rounded-full animate-spin" />
            Guardando...
          </>
          ) : (
            <>
              <Check className="w-5 h-5" />
              Guardar registro
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default CycleQuickLog;
