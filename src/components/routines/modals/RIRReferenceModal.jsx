/**
 * Modal de Referencia RIR (Repeticiones en Reserva)
 * Muestra tabla explicativa de qué significa cada valor de RIR
 */

import React from 'react';
import { X, Info, TrendingUp, AlertCircle } from 'lucide-react';

export default function RIRReferenceModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const rirData = [
    {
      rir: 0,
      label: 'Fallo Muscular',
      description: 'No puedes hacer ni una repetición más',
      accent: 'border-l-2 border-l-red-400/40 text-red-200',
      gradient: 'bg-gradient-to-r from-red-500/15 via-red-500/5 to-transparent',
      icon: '🔴',
      uso: 'Evitar en la mayoría de entrenamientos',
      rpe: 10
    },
    {
      rir: 1,
      label: '1 Rep en Reserva',
      description: 'Podrías hacer 1 repetición más',
      accent: 'border-l-2 border-l-orange-400/40 text-orange-200',
      gradient: 'bg-gradient-to-r from-orange-500/15 via-orange-500/5 to-transparent',
      icon: '🟠',
      uso: 'Últimas series de ejercicios principales',
      rpe: 9
    },
    {
      rir: 2,
      label: '2 Reps en Reserva',
      description: 'Podrías hacer 2 repeticiones más',
      accent: 'border-l-2 border-l-emerald-400/40 text-emerald-200',
      gradient: 'bg-gradient-to-r from-emerald-500/15 via-emerald-500/5 to-transparent',
      icon: '🟢',
      uso: 'ZONA ÓPTIMA - Hipertrofia efectiva',
      rpe: 8
    },
    {
      rir: 3,
      label: '3 Reps en Reserva',
      description: 'Podrías hacer 3 repeticiones más',
      accent: 'border-l-2 border-l-emerald-400/40 text-emerald-200',
      gradient: 'bg-gradient-to-r from-emerald-500/15 via-emerald-500/5 to-transparent',
      icon: '🟢',
      uso: 'ZONA ÓPTIMA - Volumen sostenible',
      rpe: 7
    },
    {
      rir: 4,
      label: '4+ Reps en Reserva',
      description: 'Podrías hacer 4 o más repeticiones',
      accent: 'border-l-2 border-l-sky-400/40 text-sky-200',
      gradient: 'bg-gradient-to-r from-sky-500/15 via-sky-500/5 to-transparent',
      icon: '🔵',
      uso: 'Calentamiento o técnica',
      rpe: '≤6'
    }
  ];
  const cardBase = 'bg-neutral-900/80 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] px-4 pt-[calc(6rem+env(safe-area-inset-top))] pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <div className="bg-neutral-900/95 rounded-3xl w-full max-w-3xl max-h-[calc(100vh-14rem)] overflow-hidden border border-white/10 ring-1 ring-white/10 shadow-[0_40px_90px_-60px_rgba(0,0,0,0.9)] flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-neutral-900/95 p-6 border-b border-white/10 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full border border-sky-400/30 bg-sky-500/10 flex items-center justify-center">
              <Info className="w-6 h-6 text-sky-300" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold font-urbanist text-white flex items-center gap-2">
                Tabla de Referencia RIR
              </h2>
              <p className="text-gray-300/70 text-sm mt-1">
                Repeticiones en Reserva · Guía completa
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-200/80 hover:text-white transition-colors bg-white/5 border border-white/10 rounded-full p-2"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 min-h-0">
          {/* Introducción */}
          <div className={`${cardBase} rounded-2xl p-4 border-l-2 border-l-sky-400/40`}>
            <h3 className="font-semibold text-sky-200 flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-sky-300" />
              ¿Qué es RIR?
            </h3>
            <p className="text-gray-200/80 text-sm">
              <strong>RIR (Reps In Reserve)</strong> es el número de repeticiones que podrías hacer antes de llegar al fallo muscular. 
              Es una forma de medir la intensidad del esfuerzo sin necesidad de llegar al límite en cada serie.
            </p>
          </div>

          {/* Tabla de RIR */}
          <div className="space-y-3">
            <h3 className="font-semibold text-white text-lg font-urbanist">Valores de RIR</h3>
            {rirData.map((item) => (
              <div
                key={item.rir}
                className={`${cardBase} ${item.accent} ${item.gradient} rounded-2xl p-4`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{item.icon}</span>
                    <div>
                      <h4 className="font-semibold text-lg text-white">RIR {item.rir}</h4>
                      <p className="text-sm text-gray-200/80">{item.label}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-300/70">RPE</div>
                    <div className="font-semibold text-lg text-white">{item.rpe}</div>
                  </div>
                </div>
                <p className="text-sm text-gray-200/80 mb-2">{item.description}</p>
                <div className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200/80">
                  <strong>Uso recomendado:</strong> {item.uso}
                </div>
              </div>
            ))}
          </div>

          {/* Recomendaciones */}
          <div className={`${cardBase} rounded-2xl p-4 border-l-2 border-l-yellow-400/40`}>
            <h3 className="font-semibold text-yellow-200 flex items-center gap-2 mb-3">
              <AlertCircle className="w-5 h-5 text-yellow-300" />
              Recomendaciones para Hipertrofia
            </h3>
            <ul className="space-y-2 text-sm text-gray-200/80">
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">✓</span>
                <span><strong>RIR 2-3:</strong> Zona óptima para ganar músculo sin fatiga excesiva</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">✓</span>
                <span><strong>Primeras series:</strong> Puedes usar RIR 3-4 para acumular volumen</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400 mt-1">✓</span>
                <span><strong>Últimas series:</strong> RIR 1-2 para maximizar estímulo</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-400 mt-1">✗</span>
                <span><strong>Evitar RIR 0:</strong> Aumenta fatiga sin beneficios adicionales</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

