import { BadgeCheck, ChevronRight, Dumbbell, Target } from 'lucide-react';

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
  onClose,
  isLoading = false,
  muscleGroups = DEFAULT_MUSCLE_GROUPS
}) {
  if (!isOpen) return null;

  const MUSCLE_GROUPS = muscleGroups;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center gap-3 border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div className="rounded-xl bg-purple-100 p-3 text-purple-600 dark:bg-purple-900/40 dark:text-purple-200">
            <Target className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              ¿Qué prefieres entrenar hoy?
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Hemos detectado que eres {nivel}. Elige un Full Body avanzado o céntrate en un grupo muscular.
            </p>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <button
            onClick={onFullBody}
            disabled={isLoading}
            className="flex w-full items-center justify-between gap-4 rounded-xl border border-purple-300 bg-purple-50 px-4 py-3 text-left text-purple-800 transition hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-purple-900 dark:bg-purple-900/30 dark:text-purple-200 dark:hover:bg-purple-900/40"
          >
            <div className="flex items-center gap-3">
              <Dumbbell className="h-5 w-5" />
              <div>
                <p className="font-semibold">Full Body</p>
                <p className="text-sm text-purple-700 dark:text-purple-300">
                  Cuerpo completo adaptado a tu nivel. Volumen y descansos optimizados.
                </p>
              </div>
            </div>
            <BadgeCheck className="h-5 w-5" />
          </button>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/50">
            <p className="mb-3 text-sm font-semibold text-gray-800 dark:text-gray-200">
              O elige un grupo muscular concreto:
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {MUSCLE_GROUPS.map((group) => (
                <button
                  key={group.id}
                  disabled={isLoading}
                  onClick={() => onSelectGroup(group.id)}
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 transition hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-blue-400 dark:hover:bg-blue-900/30"
                >
                  <span>{group.label}</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4 dark:border-gray-800">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-300 px-4 py-2 text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
