import { Calendar, Dumbbell, XCircle } from 'lucide-react';

/**
 * Modal simple para entreno de un día (fin de semana) en HipertrofiaV2
 */
export default function HipertrofiaWeekendModal({
  isOpen,
  dayName,
  onAccept,
  onLater,
  onClose,
  isLoading = false,
  methodologyName = 'HipertrofiaV2'
}) {
  if (!isOpen) return null;

  const readableDay = dayName || new Date().toLocaleDateString('es-ES', { weekday: 'long' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center gap-3 border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div className="rounded-xl bg-blue-100 p-3 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
            <Calendar className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Hoy es {readableDay}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Sabemos que te quieres poner fuerte. Podemos generarte una rutina solo para hoy de {methodologyName}.
            </p>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/60">
            <div className="rounded-lg bg-green-100 p-2 text-green-600 dark:bg-green-900/40 dark:text-green-300">
              <Dumbbell className="h-5 w-5" />
            </div>
            <div className="text-sm text-gray-700 dark:text-gray-200">
              <p className="font-semibold text-gray-900 dark:text-white">Entrenamiento suelto para hoy</p>
              <p className="mt-1 text-gray-600 dark:text-gray-400">
                Analizamos tu nivel, generamos el entrenamiento, incluimos calentamiento y luego podrás completarlo ahora mismo.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={onAccept}
              disabled={isLoading}
              className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {isLoading ? 'Generando...' : 'Aceptar entrenamiento para hoy'}
            </button>
            <button
              onClick={onClose}
              className="rounded-xl border border-gray-300 px-4 py-3 text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Cancelar
            </button>
          </div>

          <button
            onClick={onLater}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-700 transition hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/40"
          >
            <XCircle className="h-5 w-5" />
            Prefiero volver el lunes a por un plan completo
          </button>
        </div>
      </div>
    </div>
  );
}
