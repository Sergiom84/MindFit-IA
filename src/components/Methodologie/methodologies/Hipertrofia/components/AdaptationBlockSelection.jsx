import React, { useState } from 'react';
import { X, Calendar, ChevronDown } from 'lucide-react';

export default function AdaptationBlockSelection({ show, onClose, onConfirm }) {
  const [blockType, setBlockType] = useState('full_body');
  const [duration, setDuration] = useState(2);

  if (!show) return null;

  const handleConfirm = () => {
    onConfirm?.({ blockType, durationWeeks: duration });
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-purple-300" />
            <h3 className="text-white font-semibold text-lg">Bloque de Adaptación</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-300">
          Configura tu fase de adaptación antes de entrar en el ciclo D1–D5. Elige tipo de bloque y duración.
        </p>

        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-400 mb-1">Tipo de bloque</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setBlockType('full_body');
                  if (duration > 3) setDuration(2);
                }}
                className={`py-3 px-3 rounded-lg border ${blockType === 'full_body' ? 'border-purple-500 bg-purple-500/10 text-white' : 'border-gray-700 text-gray-300 hover:border-gray-600'}`}
              >
                Full Body (1–3 semanas)
              </button>
              <button
                onClick={() => {
                  setBlockType('half_body');
                  setDuration(2); // fijo a 2 semanas
                }}
                className={`py-3 px-3 rounded-lg border ${blockType === 'half_body' ? 'border-purple-500 bg-purple-500/10 text-white' : 'border-gray-700 text-gray-300 hover:border-gray-600'}`}
              >
                Half Body A/B (2 semanas)
              </button>
            </div>
          </div>

          <div>
            <p className="text-sm text-gray-400 mb-1">Duración (semanas)</p>
            <div className="relative">
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                disabled={blockType === 'half_body'}
                className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white appearance-none ${blockType === 'half_body' ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {blockType === 'half_body' ? (
                  <option value={2}>2</option>
                ) : (
                  <>
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                  </>
                )}
              </select>
              <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-3 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold"
          >
            Crear bloque
          </button>
        </div>
      </div>
    </div>
  );
}
