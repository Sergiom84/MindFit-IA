import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Clock, HelpCircle, Pill, Check, X, ChevronRight } from 'lucide-react';

/**
 * Onboarding del ciclo menstrual (4 preguntas, ~1 minuto)
 * Se muestra como opción en el registro o después en el perfil
 */
const CycleOnboarding = ({ onComplete, onSkip, isModal = false }) => {
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState({
    last_period_start: '',
    cycle_length: 28,
    is_regular: null,
    uses_hormonal_contraceptives: false
  });
  const [showCycleLengthHelp, setShowCycleLengthHelp] = useState(false);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      // Completar onboarding
      onComplete(formData);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 0: return formData.last_period_start !== '';
      case 1: return formData.cycle_length >= 21 && formData.cycle_length <= 35;
      case 2: return formData.is_regular !== null;
      case 3: return true; // Anticonceptivos es opcional
      default: return false;
    }
  };

  const steps = [
    {
      title: '¿Cuándo comenzó tu último periodo?',
      subtitle: 'Aproximadamente está bien, no necesitas ser exacta',
      icon: Calendar
    },
    {
      title: '¿Cuánto dura tu ciclo normalmente?',
      subtitle: 'Desde el primer día de un periodo hasta el primer día del siguiente',
      icon: Clock
    },
    {
      title: '¿Tu ciclo suele ser regular?',
      subtitle: 'Regular significa que varía menos de 7 días entre ciclos',
      icon: HelpCircle
    },
    {
      title: '¿Usas anticonceptivos hormonales?',
      subtitle: 'Píldora, parche, anillo, DIU hormonal, implante...',
      icon: Pill
    }
  ];

  const CurrentIcon = steps[step].icon;

  const containerClasses = isModal 
    ? "bg-neutral-900/80 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg rounded-2xl p-6 max-w-md mx-auto"
    : "bg-neutral-900/80 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg rounded-2xl p-6";

  return (
    <div className={containerClasses}>
      {/* Header con progreso */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
            <CurrentIcon className="w-5 h-5 text-pink-300" />
          </div>
          <div>
            <p className="text-xs text-gray-400/70">Paso {step + 1} de 4</p>
            <p className="text-sm font-medium text-white font-urbanist">Configuración del ciclo</p>
          </div>
        </div>
        {onSkip && (
          <button
            onClick={onSkip}
            className="text-gray-400/70 hover:text-white text-sm"
          >
            Configurar después
          </button>
        )}
      </div>

      {/* Barra de progreso */}
      <div className="flex gap-1 mb-6">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= step ? 'bg-pink-400' : 'bg-white/10'
            }`}
          />
        ))}
      </div>

      {/* Contenido del paso */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
          className="min-h-[200px]"
        >
          <h3 className="text-lg font-semibold text-white mb-2 font-urbanist">
            {steps[step].title}
          </h3>
          <p className="text-sm text-gray-300/70 mb-6">
            {steps[step].subtitle}
          </p>

          {/* Paso 0: Fecha último periodo */}
          {step === 0 && (
            <div className="space-y-4">
              <input
                type="date"
                value={formData.last_period_start}
                onChange={(e) => handleInputChange('last_period_start', e.target.value)}
                max={new Date().toISOString().split('T')[0]}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-pink-400/60"
              />
              <button
                onClick={() => handleInputChange('last_period_start', new Date().toISOString().split('T')[0])}
                className="w-full py-3 px-4 bg-gradient-to-r from-pink-300 via-pink-400 to-rose-500 text-black rounded-lg hover:from-pink-200 hover:via-pink-300 hover:to-rose-400 transition-colors font-semibold shadow-[0_10px_24px_-16px_rgba(244,114,182,0.7)]"
              >
                Me ha bajado hoy
              </button>
            </div>
          )}

          {/* Paso 1: Duración del ciclo */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => handleInputChange('cycle_length', Math.max(21, formData.cycle_length - 1))}
                  className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 text-xl font-bold"
                >
                  -
                </button>
                <div className="flex-1 text-center">
                  <span className="text-4xl font-bold text-white">{formData.cycle_length}</span>
                  <span className="text-gray-300/70 ml-2">días</span>
                </div>
                <button
                  onClick={() => handleInputChange('cycle_length', Math.min(35, formData.cycle_length + 1))}
                  className="w-12 h-12 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 text-xl font-bold"
                >
                  +
                </button>
              </div>
              
              <button
                onClick={() => setShowCycleLengthHelp(!showCycleLengthHelp)}
                className="flex items-center gap-2 text-sm text-gray-300/70 hover:text-gray-200"
              >
                <HelpCircle className="w-4 h-4" />
                No sé cuánto dura mi ciclo
              </button>
              
              {showCycleLengthHelp && (
                <div className="p-3 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300/80">
                  <p className="mb-2">El ciclo promedio es de 28 días, pero es normal que varíe entre 21 y 35 días.</p>
                  <p>Si no estás segura, déjalo en 28 días. Lo ajustaremos con el tiempo según tus registros.</p>
                </div>
              )}

              {/* Presets rápidos */}
              <div className="flex gap-2">
                {[25, 28, 30, 32].map(days => (
                  <button
                    key={days}
                    onClick={() => handleInputChange('cycle_length', days)}
                    className={`flex-1 py-2 rounded-lg text-sm transition-colors ${
                      formData.cycle_length === days
                        ? 'bg-gradient-to-r from-pink-300 via-pink-400 to-rose-500 text-black'
                        : 'bg-white/5 text-gray-300/80 hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Paso 2: Regularidad */}
          {step === 2 && (
            <div className="space-y-3">
              <button
                onClick={() => handleInputChange('is_regular', true)}
                className={`w-full p-4 rounded-lg border transition-colors flex items-center gap-3 ${
                  formData.is_regular === true
                    ? 'bg-white/5 border-pink-400/60 text-white'
                    : 'bg-white/5 border-white/10 text-gray-300/80 hover:border-white/20'
                }`}
              >
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  formData.is_regular === true ? 'border-pink-400 bg-pink-400' : 'border-gray-500/60'
                }`}>
                  {formData.is_regular === true && <Check className="w-4 h-4 text-white" />}
                </div>
                <div className="text-left">
                  <p className="font-medium">Sí, es bastante regular</p>
                  <p className="text-sm text-gray-300/70">Suele venir más o menos en la misma fecha</p>
                </div>
              </button>

              <button
                onClick={() => handleInputChange('is_regular', false)}
                className={`w-full p-4 rounded-lg border transition-colors flex items-center gap-3 ${
                  formData.is_regular === false
                    ? 'bg-white/5 border-pink-400/60 text-white'
                    : 'bg-white/5 border-white/10 text-gray-300/80 hover:border-white/20'
                }`}
              >
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  formData.is_regular === false ? 'border-pink-400 bg-pink-400' : 'border-gray-500/60'
                }`}>
                  {formData.is_regular === false && <Check className="w-4 h-4 text-white" />}
                </div>
                <div className="text-left">
                  <p className="font-medium">No, es irregular</p>
                  <p className="text-sm text-gray-300/70">La fecha varía bastante cada mes</p>
                </div>
              </button>
            </div>
          )}

          {/* Paso 3: Anticonceptivos */}
          {step === 3 && (
            <div className="space-y-3">
              <button
                onClick={() => handleInputChange('uses_hormonal_contraceptives', false)}
                className={`w-full p-4 rounded-lg border transition-colors flex items-center gap-3 ${
                  formData.uses_hormonal_contraceptives === false
                    ? 'bg-white/5 border-pink-400/60 text-white'
                    : 'bg-white/5 border-white/10 text-gray-300/80 hover:border-white/20'
                }`}
              >
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  formData.uses_hormonal_contraceptives === false ? 'border-pink-400 bg-pink-400' : 'border-gray-500/60'
                }`}>
                  {formData.uses_hormonal_contraceptives === false && <Check className="w-4 h-4 text-white" />}
                </div>
                <div className="text-left">
                  <p className="font-medium">No uso anticonceptivos hormonales</p>
                  <p className="text-sm text-gray-300/70">O uso métodos no hormonales (DIU de cobre, preservativo...)</p>
                </div>
              </button>

              <button
                onClick={() => handleInputChange('uses_hormonal_contraceptives', true)}
                className={`w-full p-4 rounded-lg border transition-colors flex items-center gap-3 ${
                  formData.uses_hormonal_contraceptives === true
                    ? 'bg-white/5 border-pink-400/60 text-white'
                    : 'bg-white/5 border-white/10 text-gray-300/80 hover:border-white/20'
                }`}
              >
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                  formData.uses_hormonal_contraceptives === true ? 'border-pink-400 bg-pink-400' : 'border-gray-500/60'
                }`}>
                  {formData.uses_hormonal_contraceptives === true && <Check className="w-4 h-4 text-white" />}
                </div>
                <div className="text-left">
                  <p className="font-medium">Sí, uso anticonceptivos hormonales</p>
                  <p className="text-sm text-gray-300/70">Píldora, parche, anillo, DIU hormonal, implante</p>
                </div>
              </button>

              {formData.uses_hormonal_contraceptives && (
                <div className="p-3 bg-white/5 border border-white/10 rounded-lg text-sm text-sky-200">
                  <p>💡 Con anticonceptivos hormonales, las fases naturales no aplican igual. Nos basaremos principalmente en cómo te sientes cada día.</p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Botones de navegación */}
      <div className="flex gap-3 mt-6">
        {step > 0 && (
          <button
            onClick={handleBack}
            className="px-6 py-3 bg-white/5 border border-white/10 text-gray-200 rounded-lg hover:bg-white/10 transition-colors"
          >
            Atrás
          </button>
        )}
        <button
          onClick={handleNext}
          disabled={!canProceed()}
          className={`flex-1 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
            canProceed()
              ? 'bg-gradient-to-r from-pink-300 via-pink-400 to-rose-500 text-black hover:from-pink-200 hover:via-pink-300 hover:to-rose-400 shadow-[0_12px_30px_-18px_rgba(244,114,182,0.7)]'
              : 'bg-white/10 text-gray-500 cursor-not-allowed'
          }`}
        >
          {step === 3 ? (
            <>
              <Check className="w-5 h-5" />
              Completar
            </>
          ) : (
            <>
              Siguiente
              <ChevronRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default CycleOnboarding;
