import { AlertCircle } from 'lucide-react';
import { LOW_MEAL_COUNT_WARNING_COPY } from './nutritionPlanConfig';

// Modal de confirmación al elegir 1-2 comidas al día.
// Extraído de NutritionPlanGenerator.jsx (ARCH-002) sin cambios de comportamiento.
export default function MealCountWarningModal({ nextValue, source, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-6 w-6 text-yellow-400" />
          <div className="space-y-3">
            <div>
              <h4 className="text-lg font-semibold text-white">
                {LOW_MEAL_COUNT_WARNING_COPY.title}
              </h4>
              <p className="mt-2 text-sm text-gray-300">
                {LOW_MEAL_COUNT_WARNING_COPY.description}
              </p>
            </div>
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
              Has elegido <strong>{nextValue}</strong> comida{nextValue === 1 ? '' : 's'} al día.
            </div>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-white/5"
              >
                {LOW_MEAL_COUNT_WARNING_COPY.cancel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="rounded-xl bg-yellow-400 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-yellow-300"
              >
                {source === 'generate'
                  ? LOW_MEAL_COUNT_WARNING_COPY.confirmGeneration
                  : LOW_MEAL_COUNT_WARNING_COPY.confirmSelection}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
