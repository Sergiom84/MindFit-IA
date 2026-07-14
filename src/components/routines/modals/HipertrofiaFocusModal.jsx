import { BadgeCheck, ChevronRight, Dumbbell, Flame, Heart, Target } from 'lucide-react';

const DEFAULT_MUSCLE_GROUPS = [
  { id: 'Pecho', label: 'Pecho' },
  { id: 'Espalda', label: 'Espalda' },
  { id: 'Piernas', label: 'Pierna' },
  { id: 'Hombros', label: 'Hombros' },
  { id: 'Bíceps', label: 'Bíceps' },
  { id: 'Tríceps', label: 'Tríceps' },
  { id: 'Core', label: 'Core' },
  { id: 'Glúteos', label: 'Glúteos' }
];

/**
 * Modal para elegir tipo de sesión (Full Body o grupo focal) en intermedio/avanzado
 */
export default function HipertrofiaFocusModal({
  isOpen,
  nivel,
  onFullBody,
  onSelectGroup,
  onSelectPreference = null,
  onClose,
  isLoading = false,
  muscleGroups = DEFAULT_MUSCLE_GROUPS
}) {
  if (!isOpen) return null;

  const MUSCLE_GROUPS = muscleGroups;

  // Paleta fija oscura de la app (la app es siempre dark; sin variantes dark: de
  // Tailwind, que dependen del esquema del sistema y dejaban el modal en blanco).
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-[#0d1522] border border-yellow-400/20 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
          <div className="rounded-xl bg-yellow-400/10 p-3 text-yellow-300">
            <Target className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">
              ¿Qué prefieres entrenar hoy?
            </h2>
            <p className="text-sm text-gray-400">
              Hemos detectado que eres {nivel}. Elige un Full Body avanzado o céntrate en un grupo muscular.
            </p>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <button
            onClick={onFullBody}
            disabled={isLoading}
            className="flex w-full items-center justify-between gap-4 rounded-xl border border-yellow-400/40 bg-yellow-400/10 px-4 py-3 text-left text-yellow-200 transition hover:bg-yellow-400/20 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <div className="flex items-center gap-3">
              <Dumbbell className="h-5 w-5" />
              <div>
                <p className="font-semibold">Full Body</p>
                <p className="text-sm text-yellow-100/70">
                  Cuerpo completo adaptado a tu nivel. Volumen y descansos optimizados.
                </p>
              </div>
            </div>
            <BadgeCheck className="h-5 w-5" />
          </button>

          {onSelectPreference && (
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={isLoading}
                onClick={() => onSelectPreference('liked')}
                className="flex items-center gap-2 rounded-xl border border-pink-400/40 bg-pink-400/10 px-3 py-2.5 text-left text-sm text-pink-200 transition hover:bg-pink-400/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Heart className="h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Tus favoritos</p>
                  <p className="text-xs opacity-80">Los ejercicios que te gustan</p>
                </div>
              </button>
              <button
                disabled={isLoading}
                onClick={() => onSelectPreference('disliked')}
                className="flex items-center gap-2 rounded-xl border border-orange-400/40 bg-orange-400/10 px-3 py-2.5 text-left text-sm text-orange-200 transition hover:bg-orange-400/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Flame className="h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Los que te cuestan</p>
                  <p className="text-xs opacity-80">A dominar lo difícil</p>
                </div>
              </button>
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="mb-3 text-sm font-semibold text-gray-200">
              O elige un grupo muscular concreto:
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MUSCLE_GROUPS.map((group) => (
                <button
                  key={group.id}
                  disabled={isLoading}
                  onClick={() => onSelectGroup(group.id)}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-200 transition hover:border-yellow-400/50 hover:bg-yellow-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>{group.label}</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-white/15 px-4 py-2 text-gray-300 transition hover:bg-white/10 hover:text-white"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
