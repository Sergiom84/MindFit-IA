import React from 'react';
import { CheckCircle, X, AlertTriangle, Loader } from 'lucide-react';

/**
 * WeeklyReviewModal
 * Muestra los datos de la revisión semanal (adaptación) ya calculados en backend.
 * Recibe el resultado de /api/adaptation/auto-evaluate-week.
 */
export default function WeeklyReviewModal({ show, loading, error, data, onClose }) {
  if (!show) return null;

  const criteria = data?.week?.criteria || {};
  const ready = data?.readyForTransition;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-yellow-400" />
            <h3 className="text-white text-lg font-semibold">
              Revisión semanal (Adaptación)
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-blue-300">
            <Loader className="w-4 h-4 animate-spin" />
            Calculando métricas de la semana...
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 text-red-300 bg-red-900/20 border border-red-800/40 rounded-lg p-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-semibold">No se pudo obtener la revisión semanal</p>
              <p className="text-sm text-red-200">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-3">
            <p className="text-sm text-gray-300">
              Semana #{data.week?.number} · Ventana: {new Date(data.window.start).toLocaleDateString()} – {new Date(data.window.end).toLocaleDateString()}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card
                title="Adherencia"
                value={criteria.adherence?.value != null ? `${criteria.adherence.value.toFixed(1)}% (${criteria.adherence.sessions})` : '—'}
                ok={criteria.adherence?.met}
              />
              <Card
                title="RIR medio"
                value={criteria.rir?.value != null ? criteria.rir.value.toFixed(2) : '—'}
                ok={criteria.rir?.met}
              />
              <Card
                title="Flags técnica"
                value={criteria.technique?.flags != null ? criteria.technique.flags : '—'}
                ok={criteria.technique?.met}
              />
              <Card
                title="Progreso carga"
                value={
                  criteria.progress?.value != null
                    ? `${criteria.progress.value.toFixed(1)}% (${criteria.progress.initialWeight?.toFixed?.(1) || '—'} → ${criteria.progress.currentWeight?.toFixed?.(1) || '—'})`
                    : '—'
                }
                ok={criteria.progress?.met}
              />
            </div>

            <div className={`p-3 rounded-lg border ${ready ? 'border-green-500/50 bg-green-900/10' : 'border-gray-700 bg-gray-800/40'}`}>
              <p className={`text-sm font-semibold ${ready ? 'text-green-300' : 'text-gray-200'}`}>
                {ready ? '✅ Listo para transicionar a D1-D5' : 'Aún faltan criterios para transicionar'}
              </p>
              {!ready && (
                <p className="text-xs text-gray-400 mt-1">
                  Completa los criterios esta semana para avanzar de forma segura.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ title, value, ok }) {
  return (
    <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm text-gray-300">{title}</p>
        {ok != null && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${ok ? 'bg-green-900/60 text-green-200' : 'bg-yellow-900/50 text-yellow-200'}`}>
            {ok ? 'OK' : 'Revisar'}
          </span>
        )}
      </div>
      <p className="text-lg text-white font-semibold">{value}</p>
    </div>
  );
}
