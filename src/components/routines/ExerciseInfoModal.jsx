import React, { useEffect, useState, useCallback } from 'react';
import { X, Info, Dumbbell, AlertTriangle, CheckCircle } from 'lucide-react';
import tokenManager from '../../utils/tokenManager';

export default function ExerciseInfoModal({ show, exercise, onClose, isNested = false }) {
  const [tab, setTab] = useState('ejecucion'); // ejecucion | consejos | errores
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState({ ejecucion: '', consejos: '', errores_evitar: '' });

  useEffect(() => {
    if (!show) return;
    let isCancelled = false;

    const fetchInfo = async () => {
      try {
        setLoading(true);
        setError('');
        const token = tokenManager.getToken();
        const res = await fetch('/api/ia-home-training/exercise-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ exerciseName: exercise?.nombre })
        });
        const json = await res.json();
        if (!isCancelled) {
          if (json?.success && json?.exerciseInfo) {
            setData(json.exerciseInfo);
          } else {
            setError('No se pudo obtener la información en este momento.');
          }
        }
      } catch (e) {
        if (!isCancelled) setError('Error de red al obtener la información.');
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    fetchInfo();
    return () => { isCancelled = true; };
  }, [show, exercise?.nombre]);

  // Manejo de tecla Escape
  useEffect(() => {
    if (!show) return;

    const handleEscape = (event) => {
      if (event.key === 'Escape' || event.keyCode === 27) {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [show, onClose]);

  // Prevenir scroll del body cuando el modal está abierto
  useEffect(() => {
    if (show) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [show]);

  const handleBackdropClick = useCallback((event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }, [onClose]);

  if (!show) return null;
  const ex = exercise || {};

  // z-60 si es modal anidado, z-50 si es principal
  const zIndex = isNested ? 'z-[60]' : 'z-50';

  return (
    <div className={`fixed inset-0 ${zIndex} flex items-center justify-center p-4`}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleBackdropClick} />
      <div className="relative bg-gray-800 border border-gray-700 rounded-2xl max-w-xl w-full max-h-[85vh] overflow-y-auto transform transition-all duration-200 scale-100 opacity-100">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Info className="text-blue-400" size={20} />
            <h3 className="text-white font-semibold">Información del Ejercicio</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <h4 className="text-lg font-bold text-white">{ex?.nombre || 'Ejercicio'}</h4>
            {(ex?.categoria || ex?.grupo_muscular) && (
              <p className="text-sm text-gray-400">{ex?.categoria || ex?.grupo_muscular}</p>
            )}
          </div>


          {/* Pestañas */}
          <div>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setTab('ejecucion')}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold transition-colors ${
                  tab === 'ejecucion' 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                }`}
              >
                <Dumbbell size={16} />
                Cómo ejecutarlo
              </button>
              <button
                onClick={() => setTab('consejos')}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold transition-colors ${
                  tab === 'consejos' 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                }`}
              >
                <CheckCircle size={16} />
                Consejos
              </button>
              <button
                onClick={() => setTab('errores')}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold transition-colors ${
                  tab === 'errores' 
                    ? 'bg-red-600 text-white' 
                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                }`}
              >
                <AlertTriangle size={16} />
                Errores comunes
              </button>
            </div>
            <div className="bg-gray-700/30 rounded-lg p-4 min-h-[120px]">
              {loading && (
                <div className="flex items-center justify-center h-20">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                </div>
              )}
              {!loading && error && (
                <div className="flex items-center gap-2 text-red-300 text-sm">
                  <AlertTriangle size={16} />
                  <span>{error}</span>
                </div>
              )}
              {!loading && !error && (
                <div className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">
                  {tab === 'ejecucion' && (data.ejecucion || 'Sin datos disponibles')}
                  {tab === 'consejos' && (data.consejos || 'Sin datos disponibles')}
                  {tab === 'errores' && (data.errores_evitar || 'Sin datos disponibles')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
