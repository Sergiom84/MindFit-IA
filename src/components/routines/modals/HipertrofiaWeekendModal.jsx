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
  methodologyName = 'Hipertrofia'
}) {
  if (!isOpen) return null;

  const readableDay = dayName || new Date().toLocaleDateString('es-ES', { weekday: 'long' });

  // Paleta fija oscura de la app (sin variantes dark: dependientes del sistema)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-[#0d1522] border border-yellow-400/20 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
          <div className="rounded-xl bg-yellow-400/10 p-3 text-yellow-300">
            <Calendar className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">
              Hoy es {readableDay}
            </h2>
            <p className="text-sm text-gray-400">
              Sabemos que te quieres poner fuerte. Podemos generarte una rutina solo para hoy de {methodologyName}.
            </p>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="rounded-lg bg-green-400/10 p-2 text-green-300">
              <Dumbbell className="h-5 w-5" />
            </div>
            <div className="text-sm text-gray-200">
              <p className="font-semibold text-white">Entrenamiento suelto para hoy</p>
              <p className="mt-1 text-gray-400">
                Analizamos tu nivel, generamos el entrenamiento, incluimos calentamiento y luego podrás completarlo ahora mismo.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={onAccept}
              disabled={isLoading}
              className="flex-1 rounded-xl bg-yellow-400 px-4 py-3 font-semibold text-black transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? 'Generando...' : 'Aceptar entrenamiento para hoy'}
            </button>
            <button
              onClick={onClose}
              className="rounded-xl border border-white/15 px-4 py-3 text-gray-300 transition hover:bg-white/10 hover:text-white"
            >
              Cancelar
            </button>
          </div>

          <button
            onClick={onLater}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-amber-200 transition hover:bg-amber-400/20"
          >
            <XCircle className="h-5 w-5" />
            Prefiero volver el lunes a por un plan completo
          </button>
        </div>
      </div>
    </div>
  );
}
