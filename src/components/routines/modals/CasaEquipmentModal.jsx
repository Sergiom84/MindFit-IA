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

  // Paleta fija oscura de la app (sin variantes dark: dependientes del sistema)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-[#0d1522] border border-yellow-400/20 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
          <div className="rounded-xl bg-emerald-400/10 p-3 text-emerald-300">
            <Home className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">
              ¿Qué material tienes hoy?
            </h2>
            <p className="text-sm text-gray-400">
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
                      ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-200'
                      : 'border-white/10 bg-white/5 text-gray-200 hover:border-emerald-400/40 hover:bg-emerald-400/5'
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

          <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-gray-400">
            Peso corporal y enseres de casa (silla, pared, toalla, esterilla…)
            siempre se incluyen.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onConfirm(selected)}
              disabled={isLoading}
              className="flex-1 rounded-xl bg-yellow-400 px-4 py-3 font-semibold text-black transition hover:bg-yellow-500 disabled:cursor-not-allowed disabled:opacity-60"
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
              className="rounded-xl border border-white/15 px-4 py-3 text-gray-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
