import { useState } from 'react';
import { Flame, Check, X } from 'lucide-react';

/**
 * Auto-evaluación de esfuerzo al completar un WOD de CrossFit.
 * Captura si se completó dentro del time cap, el RPE (1-10) y la escala usada,
 * que alimentan la autorregulación (POST /methodology-session/crossfit/wod-result).
 * Equivalente a CalisteniaEffortModal pero con el modelo RPE+escala del WOD.
 */
const RPE_OPTIONS = [
  { value: 4, label: '4', hint: 'Suave' },
  { value: 6, label: '6', hint: 'Moderado' },
  { value: 8, label: '8', hint: 'Duro' },
  { value: 10, label: '10', hint: 'Al límite' }
];

const SCALE_OPTIONS = [
  { value: 'scaled', label: 'Scaled' },
  { value: 'rx', label: 'RX' },
  { value: 'rxplus', label: 'RX+' }
];

// Feedback subjetivo OPCIONAL ("aporte"): matiza la autorregulación sin mandar
// sobre lo objetivo (RPE/completado/escala).
const FEELING_OPTIONS = [
  { value: 'facil', label: 'Me gustó', emoji: '😀' },
  { value: 'normal', label: 'Normal', emoji: '😐' },
  { value: 'dificil', label: 'Me costó', emoji: '😣' }
];

const RESULT_COPY = {
  progress: { title: '¡A por más! 🔥', msg: 'Lo cerraste con margen: subiremos densidad o escala en tu próximo WOD.' },
  deload: { title: 'Toca recuperar 🧘', msg: 'Has acumulado WODs muy exigentes: el próximo será de descarga.' },
  hold: { title: 'Buen WOD ✅', msg: 'Mantendremos el estímulo en tu próximo entrenamiento.' }
};

export default function CrossFitEffortModal({
  isOpen,
  onSubmit,
  onSkip,
  onContinue,
  result = null,
  defaultScale = 'rx',
  isLoading = false
}) {
  const [completed, setCompleted] = useState(null);
  const [rpe, setRpe] = useState(null);
  const [scale, setScale] = useState(defaultScale);
  const [feeling, setFeeling] = useState(null); // opcional

  if (!isOpen) return null;

  const canSubmit = completed !== null && rpe !== null && !isLoading;

  if (result) {
    const copy = RESULT_COPY[result] || RESULT_COPY.hold;
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 border-l-2 border-l-yellow-400/40 bg-neutral-900/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
          <div className="rounded-xl bg-yellow-500/10 p-3 text-yellow-300">
            <Flame className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white font-urbanist">¿Cómo fue el WOD?</h2>
            <p className="text-sm text-gray-400">Ajustaremos tu próximo entrenamiento.</p>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-200">¿Lo completaste dentro del time cap?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setCompleted(true)}
                className={`flex-1 rounded-xl border px-4 py-3 text-sm transition ${
                  completed === true
                    ? 'border-yellow-400/60 bg-yellow-400/15 text-yellow-200'
                    : 'border-white/10 bg-white/5 text-gray-200 hover:border-yellow-400/30'
                }`}
              >
                Sí
              </button>
              <button
                onClick={() => setCompleted(false)}
                className={`flex-1 rounded-xl border px-4 py-3 text-sm transition ${
                  completed === false
                    ? 'border-yellow-400/60 bg-yellow-400/15 text-yellow-200'
                    : 'border-white/10 bg-white/5 text-gray-200 hover:border-yellow-400/30'
                }`}
              >
                No / cap alcanzado
              </button>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-gray-200">Esfuerzo percibido (RPE)</p>
            <div className="grid grid-cols-4 gap-2">
              {RPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRpe(opt.value)}
                  className={`rounded-xl border px-2 py-3 text-center transition ${
                    rpe === opt.value
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
            <p className="mb-2 text-sm font-semibold text-gray-200">Escala usada</p>
            <div className="grid grid-cols-3 gap-2">
              {SCALE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setScale(opt.value)}
                  className={`rounded-xl border px-2 py-2.5 text-sm transition ${
                    scale === opt.value
                      ? 'border-yellow-400/60 bg-yellow-400/15 text-yellow-200'
                      : 'border-white/10 bg-white/5 text-gray-200 hover:border-yellow-400/30'
                  }`}
                >
                  {opt.label}
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
            onClick={() => canSubmit && onSubmit({ rpe, completed, scale, feeling })}
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
