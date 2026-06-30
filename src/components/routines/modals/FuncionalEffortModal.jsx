import { useState } from 'react';
import { Activity, Check, X } from 'lucide-react';

/**
 * Auto-evaluación de esfuerzo al completar una sesión de Entrenamiento Funcional.
 * Captura el RIR medio (repeticiones en reserva) y si se cumplió el objetivo,
 * que alimentan la autorregulación (POST /methodology-session/funcional/session-result).
 * Mismo modelo que Calistenia (series×reps×RIR).
 */
const RIR_OPTIONS = [
  { value: 0, label: '0', hint: 'Al fallo' },
  { value: 1, label: '1', hint: 'Muy duro' },
  { value: 2, label: '2', hint: 'Exigente' },
  { value: 3, label: '3+', hint: 'Con margen' }
];

// Feedback subjetivo OPCIONAL ("aporte"): matiza la autorregulación sin mandar.
const FEELING_OPTIONS = [
  { value: 'facil', label: 'Me gustó', emoji: '😀' },
  { value: 'normal', label: 'Normal', emoji: '😐' },
  { value: 'dificil', label: 'Me costó', emoji: '😣' }
];

const RESULT_COPY = {
  progress: { title: '¡Progreso desbloqueado! 💪', msg: 'Lo bordaste: subiremos la dificultad en tu próximo entrenamiento.' },
  deload: { title: 'Toca recuperar 🧘', msg: 'Has acumulado sesiones duras: la próxima será de descarga para recuperar.' },
  hold: { title: 'Buen trabajo ✅', msg: 'Mantendremos el ritmo en tu próxima sesión.' }
};

export default function FuncionalEffortModal({ isOpen, onSubmit, onSkip, onContinue, result = null, isLoading = false }) {
  const [targetMet, setTargetMet] = useState(null);
  const [avgRir, setAvgRir] = useState(null);
  const [feeling, setFeeling] = useState(null); // opcional

  if (!isOpen) return null;

  const canSubmit = targetMet !== null && avgRir !== null && !isLoading;

  // Pantalla de resultado tras registrar el esfuerzo.
  if (result) {
    const copy = RESULT_COPY[result] || RESULT_COPY.hold;
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 border-l-2 border-l-yellow-400/40 bg-neutral-900/95 p-6 text-center shadow-2xl backdrop-blur-xl">
          <h2 className="text-xl font-semibold text-white font-urbanist">{copy.title}</h2>
          <p className="mt-2 text-sm text-gray-300">{copy.msg}</p>
          <button
            onClick={onContinue}
            className="mt-5 w-full rounded-xl bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 px-5 py-3 text-sm font-semibold text-black transition hover:from-yellow-200"
          >
            Continuar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 border-l-2 border-l-yellow-400/40 bg-neutral-900/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
          <div className="rounded-xl bg-yellow-500/10 p-3 text-yellow-300">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white font-urbanist">¿Cómo fue la sesión?</h2>
            <p className="text-sm text-gray-400">Ajustaremos tu próximo entrenamiento.</p>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-200">¿Completaste las repeticiones objetivo?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setTargetMet(true)}
                className={`flex-1 rounded-xl border px-4 py-3 text-sm transition ${
                  targetMet === true
                    ? 'border-yellow-400/60 bg-yellow-400/15 text-yellow-200'
                    : 'border-white/10 bg-white/5 text-gray-200 hover:border-yellow-400/30'
                }`}
              >
                Sí
              </button>
              <button
                onClick={() => setTargetMet(false)}
                className={`flex-1 rounded-xl border px-4 py-3 text-sm transition ${
                  targetMet === false
                    ? 'border-yellow-400/60 bg-yellow-400/15 text-yellow-200'
                    : 'border-white/10 bg-white/5 text-gray-200 hover:border-yellow-400/30'
                }`}
              >
                No del todo
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-gray-200">¿Cuántas repeticiones más podrías haber hecho? (RIR)</p>
            <div className="grid grid-cols-4 gap-2">
              {RIR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setAvgRir(opt.value)}
                  className={`rounded-xl border px-2 py-3 text-center transition ${
                    avgRir === opt.value
                      ? 'border-yellow-400/60 bg-yellow-400/15 text-yellow-200'
                      : 'border-white/10 bg-white/5 text-gray-200 hover:border-yellow-400/30'
                  }`}
                >
                  <span className="block text-base font-semibold">{opt.label}</span>
                  <span className="block text-[10px] text-gray-400">{opt.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-gray-200">
              ¿Cómo lo sentiste? <span className="text-xs font-normal text-gray-500">(opcional)</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {FEELING_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFeeling(feeling === opt.value ? null : opt.value)}
                  className={`rounded-xl border px-2 py-2.5 text-sm transition ${
                    feeling === opt.value
                      ? 'border-yellow-400/60 bg-yellow-400/15 text-yellow-200'
                      : 'border-white/10 bg-white/5 text-gray-200 hover:border-yellow-400/30'
                  }`}
                >
                  <span className="mr-1">{opt.emoji}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-6 py-4">
          <button
            onClick={onSkip}
            className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm text-gray-400 transition hover:text-gray-200"
          >
            <X className="h-4 w-4" /> Omitir
          </button>
          <button
            onClick={() => canSubmit && onSubmit({ avgRir, targetMet, feeling })}
            disabled={!canSubmit}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 px-5 py-2.5 text-sm font-semibold text-black transition hover:from-yellow-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {isLoading ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
