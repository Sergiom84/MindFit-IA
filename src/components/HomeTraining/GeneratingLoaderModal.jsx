import { memo } from 'react';

// Modal de carga mientras la IA genera el entrenamiento (Paso 4).
// Extraído de HomeTrainingSection.jsx (ARCH-002) sin cambios de comportamiento.
const GeneratingLoaderModal = () => (
  <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
    <div className="bg-neutral-900/90 border border-white/10 ring-1 ring-white/10 rounded-3xl p-8 text-center shadow-[0_30px_80px_-60px_rgba(0,0,0,0.9)]">
      <svg className="w-12 h-12 text-yellow-300 animate-spin mx-auto mb-4" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
      </svg>
      <p className="text-white font-semibold text-lg font-urbanist">Estamos generando tu entrenamiento</p>
      <p className="text-gray-300/80 text-sm mt-2">Analizando tu perfil para crear la rutina idónea…</p>
    </div>
  </div>
);

export default memo(GeneratingLoaderModal);
