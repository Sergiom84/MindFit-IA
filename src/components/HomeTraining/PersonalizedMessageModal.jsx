import { memo } from 'react';
import { Target } from 'lucide-react';

// Modal "¡Tu Entrenamiento Está Listo!" (Paso 3).
// Extraído de HomeTrainingSection.jsx (ARCH-002) sin cambios de comportamiento.
const PersonalizedMessageModal = ({ personalizedMessage, onProceed }) => (
  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-neutral-900/90 border border-white/10 ring-1 ring-white/10 rounded-3xl p-8 max-w-2xl w-full shadow-[0_30px_80px_-60px_rgba(0,0,0,0.9)]">
      <div className="text-center">
        <div className="w-16 h-16 bg-yellow-400/15 rounded-full flex items-center justify-center mx-auto mb-4 border border-yellow-400/30">
          <Target size={32} className="text-yellow-300" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-4 font-urbanist">
          ¡Tu Entrenamiento Está Listo!
        </h3>
        <div className="bg-gradient-to-r from-yellow-400/10 to-amber-500/10 border border-yellow-400/30 rounded-2xl p-4 mb-6">
          <p className="text-yellow-100 leading-relaxed">{personalizedMessage}</p>
        </div>
        <button
          onClick={onProceed}
          className="bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 text-black font-semibold py-3 px-8 rounded-xl transition-all duration-200 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
        >
          Ver Mi Plan de Entrenamiento
        </button>
      </div>
    </div>
  </div>
);

export default memo(PersonalizedMessageModal);
