import React from 'react';
import { X, Flame } from 'lucide-react';

/**
 * Modal de Series de Aproximación (calentamiento específico por ejercicio)
 * No envía nada a BD, solo informa al usuario.
 */
export default function ApproximationSeriesModal({ show, onClose, exerciseName }) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-6 h-6 text-yellow-400" />
            <h3 className="text-white font-semibold text-lg">Series de aproximación</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-gray-300">
          Antes de tus series efectivas en <strong>{exerciseName}</strong>, realiza estas series de aproximación para preparar el sistema nervioso.
        </p>

        <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 space-y-2 text-sm text-gray-100">
          <p className="font-semibold">Principiante (Hipertrofia):</p>
          <ul className="list-disc list-inside space-y-1">
            <li>1) 40% del primer peso efectivo → 8 repeticiones</li>
            <li>2) 60% del primer peso efectivo → 5 repeticiones</li>
          </ul>
          <p className="text-xs text-gray-400 mt-2">
            No cuentan como volumen efectivo. Hazlas sin llegar al fallo, con control técnico.
          </p>
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-gray-900 font-semibold rounded-lg"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
