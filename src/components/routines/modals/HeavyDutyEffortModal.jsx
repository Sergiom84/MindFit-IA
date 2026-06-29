import { useState } from 'react';
import { Flame, Check, X } from 'lucide-react';

/**
 * Auto-evaluación de esfuerzo al completar una sesión de Heavy Duty (HIT/Mentzer).
 * Disciplina de INTENSIDAD/FALLO: en vez de RIR o %1RM, captura si la serie se
 * llevó al FALLO muscular y si se alcanzó el TOPE del rango de repeticiones, que
 * alimentan la autorregulación de carga por doble progresión reps→carga
 * (POST /methodology-session/heavy-duty/session-result).
 */
const RESULT_COPY = {
  progress: { title: 'A subir carga 💪', msg: 'Llegaste al fallo en el tope del rango: subiremos el peso en tu próxima sesión.' },
  deload: { title: 'Toca recuperar 🧘', msg: 'No alcanzaste el fallo en varias sesiones: la próxima será de descarga para recuperar (la recuperación es parte del método).' },
  hold: { title: 'Buena sesión 🔥', msg: 'Mantendremos la carga; busca más repeticiones la próxima vez hasta llegar al tope del rango.' }
};

export default function HeavyDutyEffortModal({
  isOpen,
  onSubmit,
  onSkip,
  onContinue,
  result = null,
  isLoading = false
}) {
  const [reachedFailure, setReachedFailure] = useState(null);
  const [targetMet, setTargetMet] = useState(null);

  if (!isOpen) return null;

  const canSubmit = reachedFailure !== null && targetMet !== null && !isLoading;

  if (result) {
    const copy = RESULT_COPY[result] || RESULT_COPY.hold;
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 border-l-2 border-l-red-500/40 bg-neutral-900/95 p-6 text-center shadow-2xl backdrop-blur-xl">
          <h2 className="text-xl font-semibold text-white font-urbanist">{copy.title}</h2>
          <p className="mt-2 text-sm text-gray-300">{copy.msg}</p>
          <button
            onClick={onContinue}
            className="mt-5 w-full rounded-xl bg-gradient-to-r from-red-500 via-orange-500 to-amber-500 px-5 py-3 text-sm font-semibold text-black transition hover:from-red-400"
          >
            Continuar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 border-l-2 border-l-red-500/40 bg-neutral-900/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
          <div className="rounded-xl bg-red-500/10 p-3 text-red-400">
            <Flame className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white font-urbanist">¿Cómo fue la sesión?</h2>
            <p className="text-sm text-gray-400">Ajustaremos la carga de tu próximo entrenamiento.</p>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-200">¿Llevaste la última serie al fallo muscular?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setReachedFailure(true)}
                className={`flex-1 rounded-xl border px-4 py-3 text-sm transition ${
                  reachedFailure === true
                    ? 'border-red-500/60 bg-red-500/15 text-red-200'
                    : 'border-white/10 bg-white/5 text-gray-200 hover:border-red-500/30'
                }`}
              >
                Sí, al fallo
              </button>
              <button
                onClick={() => setReachedFailure(false)}
                className={`flex-1 rounded-xl border px-4 py-3 text-sm transition ${
                  reachedFailure === false
                    ? 'border-red-500/60 bg-red-500/15 text-red-200'
                    : 'border-white/10 bg-white/5 text-gray-200 hover:border-red-500/30'
                }`}
              >
                No, me quedé corto
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-gray-200">¿Alcanzaste el tope de repeticiones del rango?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setTargetMet(true)}
                className={`flex-1 rounded-xl border px-4 py-3 text-sm transition ${
                  targetMet === true
                    ? 'border-red-500/60 bg-red-500/15 text-red-200'
                    : 'border-white/10 bg-white/5 text-gray-200 hover:border-red-500/30'
                }`}
              >
                Sí, el tope
              </button>
              <button
                onClick={() => setTargetMet(false)}
                className={`flex-1 rounded-xl border px-4 py-3 text-sm transition ${
                  targetMet === false
                    ? 'border-red-500/60 bg-red-500/15 text-red-200'
                    : 'border-white/10 bg-white/5 text-gray-200 hover:border-red-500/30'
                }`}
              >
                No, dentro del rango
              </button>
            </div>
            <p className="mt-2 text-[11px] text-gray-500">
              Doble progresión: subimos carga solo cuando llegas al fallo en el tope del rango con buena técnica.
            </p>
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
            onClick={() => canSubmit && onSubmit({ reachedFailure, targetMet })}
            disabled={!canSubmit}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-500 via-orange-500 to-amber-500 px-5 py-2.5 text-sm font-semibold text-black transition hover:from-red-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {isLoading ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
