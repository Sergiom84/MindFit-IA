import { useState } from 'react';
import { Dumbbell, Check, Home } from 'lucide-react';

// Material opcional que el usuario puede declarar tener en casa. Las claves
// (id) coinciden con EQUIPMENT_ALIASES del backend (casaSingleDay.js). El peso
// corporal y los enseres domésticos (silla, pared, toalla…) siempre se incluyen.
const EQUIPMENT_OPTIONS = [
  { id: 'mancuernas', label: 'Mancuernas' },
  { id: 'kettlebell', label: 'Kettlebell' },
  { id: 'banda', label: 'Banda elástica' },
  { id: 'barra', label: 'Barra / dominadas' }
];

/**
 * Modal ligero para elegir el material disponible antes de generar el
 * entrenamiento de casa de un día. Devuelve un array de claves seleccionadas.
 */
export default function CasaEquipmentModal({
  isOpen,
  onConfirm,
  onClose,
  isLoading = false
}) {
  const [selected, setSelected] = useState([]);

  if (!isOpen) return null;

  const toggle = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
        <div className="flex items-center gap-3 border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div className="rounded-xl bg-emerald-100 p-3 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
            <Home className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              ¿Qué material tienes hoy?
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Adaptaremos los ejercicios al equipamiento disponible. Si no tienes
              nada, no pasa nada: entrenarás con tu peso corporal.
            </p>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {EQUIPMENT_OPTIONS.map((opt) => {
              const active = selected.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={isLoading}
                  onClick={() => toggle(opt.id)}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    active
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200'
                      : 'border-gray-200 bg-white text-gray-800 hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-emerald-700'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Dumbbell className="h-4 w-4" />
                    {opt.label}
                  </span>
                  {active && <Check className="h-4 w-4" />}
                </button>
              );
            })}
          </div>

          <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
            Peso corporal y enseres de casa (silla, pared, toalla, esterilla…)
            siempre se incluyen.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onConfirm(selected)}
              disabled={isLoading}
              className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              {isLoading
                ? 'Generando...'
                : selected.length === 0
                  ? 'Entrenar con peso corporal'
                  : 'Continuar con este material'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="rounded-xl border border-gray-300 px-4 py-3 text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
