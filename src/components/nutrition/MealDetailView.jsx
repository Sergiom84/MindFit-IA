import { X, Utensils, Clock, Dumbbell, Moon, TrendingUp } from 'lucide-react';

const MEAL_ICONS = {
  1: '🌅', // Desayuno
  2: '🥪', // Almuerzo
  3: '🍽️', // Comida
  4: '🍎', // Merienda
  5: '🌙', // Cena
  6: '🥛'  // Snack nocturno
};

/**
 * Modal de detalle de comidas de un día específico
 */
export default function MealDetailView({ day, planInfo, onClose }) {
  if (!day) return null;

  const isTraining = day.tipo_dia === 'entreno';

  // Calcular distribución de macros en porcentaje
  const totalKcal = day.kcal;
  const proteinKcal = day.macros.protein_g * 4;
  const carbsKcal = day.macros.carbs_g * 4;
  const fatKcal = day.macros.fat_g * 9;

  const proteinPercent = ((proteinKcal / totalKcal) * 100).toFixed(0);
  const carbsPercent = ((carbsKcal / totalKcal) * 100).toFixed(0);
  const fatPercent = ((fatKcal / totalKcal) * 100).toFixed(0);

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-neutral-900/80 border border-white/10 ring-1 ring-white/5 backdrop-blur-lg rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-neutral-900/80 border-b border-white/10 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold font-urbanist text-white mb-1">
              Día {day.day_index + 1} - {isTraining ? 'Entrenamiento' : 'Descanso'}
            </h2>
            <p className="text-gray-400 text-sm">
              {planInfo.plan_name} • {planInfo.training_type}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Resumen del Día */}
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3 mb-4">
            {isTraining ? (
              <>
                <Dumbbell className="w-6 h-6 text-green-400" />
                <span className="text-green-400 font-semibold">Día de Entrenamiento</span>
              </>
            ) : (
              <>
                <Moon className="w-6 h-6 text-blue-400" />
                <span className="text-blue-400 font-semibold">Día de Descanso</span>
              </>
            )}
          </div>

          {/* Macros Totales del Día */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center border-l-2 border-l-emerald-400/40">
              <div className="text-gray-400 text-sm mb-1">Calorías</div>
              <div className="text-3xl font-bold text-emerald-300">{day.kcal}</div>
              <div className="text-gray-500 text-xs">kcal</div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center border-l-2 border-l-red-400/40">
              <div className="text-gray-400 text-sm mb-1">Proteína</div>
              <div className="text-3xl font-bold text-red-300">{day.macros.protein_g}</div>
              <div className="text-gray-500 text-xs">g ({proteinPercent}%)</div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center border-l-2 border-l-yellow-400/40">
              <div className="text-gray-400 text-sm mb-1">Carbohidratos</div>
              <div className="text-3xl font-bold text-yellow-300">{day.macros.carbs_g}</div>
              <div className="text-gray-500 text-xs">g ({carbsPercent}%)</div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center border-l-2 border-l-sky-400/40">
              <div className="text-gray-400 text-sm mb-1">Grasas</div>
              <div className="text-3xl font-bold text-sky-300">{day.macros.fat_g}</div>
              <div className="text-gray-500 text-xs">g ({fatPercent}%)</div>
            </div>
          </div>

          {/* Barra de Distribución */}
          <div className="relative h-8 bg-white/10 rounded-full overflow-hidden">
            <div
              className="absolute h-full bg-red-500 flex items-center justify-center text-white text-xs font-semibold"
              style={{ width: `${proteinPercent}%` }}
            >
              {proteinPercent > 15 && `P ${proteinPercent}%`}
            </div>
            <div
              className="absolute h-full bg-yellow-500 flex items-center justify-center text-white text-xs font-semibold"
              style={{
                left: `${proteinPercent}%`,
                width: `${carbsPercent}%`
              }}
            >
              {carbsPercent > 15 && `C ${carbsPercent}%`}
            </div>
            <div
              className="absolute h-full bg-blue-500 flex items-center justify-center text-white text-xs font-semibold"
              style={{
                left: `${Number(proteinPercent) + Number(carbsPercent)}%`,
                width: `${fatPercent}%`
              }}
            >
              {fatPercent > 15 && `G ${fatPercent}%`}
            </div>
          </div>

          {/* Nota de Carb Cycling */}
          {isTraining ? (
            <div className="mt-4 p-3 bg-green-500/10 border border-green-500 rounded-lg">
              <p className="text-green-400 text-sm">
                <TrendingUp className="w-4 h-4 inline mr-1" />
                <strong>Carb Cycling:</strong> +10% carbohidratos por día de entreno
              </p>
            </div>
          ) : (
            <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500 rounded-lg">
              <p className="text-blue-400 text-sm">
                <TrendingUp className="w-4 h-4 inline mr-1" />
                <strong>Carb Cycling:</strong> -15% carbohidratos en día de descanso
              </p>
            </div>
          )}
        </div>

        {/* Comidas del Día */}
        <div className="p-6">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Utensils className="w-5 h-5 text-yellow-400" />
            Comidas del Día ({day.meals?.length || 0})
          </h3>

          {!day.meals || day.meals.length === 0 ? (
            <div className="text-center p-8 bg-white/5 border border-white/10 rounded-lg">
              <p className="text-gray-400">
                Las comidas aún no han sido generadas con IA
              </p>
              <p className="text-gray-500 text-sm mt-2">
                Próximamente: generación automática de menús
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {day.meals.map((meal) => (
                <div
                  key={meal.orden}
                  className="bg-white/5 border border-white/10 rounded-xl p-5 hover:border-white/20 transition-colors"
                >
                  {/* Header de la Comida */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{MEAL_ICONS[meal.orden] || '🍴'}</span>
                      <div>
                        <h4 className="text-lg font-semibold text-white">{meal.nombre}</h4>
                        {meal.hora_sugerida && (
                          <div className="flex items-center gap-1 text-gray-400 text-sm">
                            <Clock className="w-3 h-3" />
                            {meal.hora_sugerida}
                          </div>
                        )}
                      </div>
                    </div>

                    {meal.timing_note && (
                      <span className="px-3 py-1 bg-yellow-400/20 text-yellow-400 rounded-full text-xs font-medium">
                        {meal.timing_note}
                      </span>
                    )}
                  </div>

                  {/* Macros de la Comida */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-400">{meal.kcal}</div>
                      <div className="text-gray-500 text-xs">kcal</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-red-400">{meal.macros.protein_g}g</div>
                      <div className="text-gray-500 text-xs">proteína</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-yellow-400">{meal.macros.carbs_g}g</div>
                      <div className="text-gray-500 text-xs">carbos</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-blue-400">{meal.macros.fat_g}g</div>
                      <div className="text-gray-500 text-xs">grasas</div>
                    </div>
                  </div>

                  {/* Nota sobre generación de menú */}
                  <div className="mt-3 pt-3 border-t border-white/10">
                    <p className="text-gray-500 text-sm italic">
                      📝 Menú específico pendiente de generación con IA
                    </p>
                  </div>

                  {/* Menú generado (si existe) */}
                  {meal.generated_menu?.items?.length > 0 && (
                    <div className="mt-4 bg-white/5 border border-white/10 rounded-lg p-4">
                      <div className="text-sm text-gray-300 font-semibold mb-2">Menú sugerido por IA</div>
                      <div className="space-y-2 text-sm text-gray-200">
                        {meal.generated_menu.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between gap-2 border-b border-white/5 pb-1">
                            <span className="text-gray-200">{item.nombre || item.name}</span>
                            <span className="text-gray-400">{item.porcion || item.porcion_sugerida || item.gramos || ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer con Acción */}
        <div className="sticky bottom-0 bg-neutral-900/80 border-t border-white/10 p-6">
          <button
            onClick={onClose}
            className="w-full bg-yellow-400 text-gray-900 py-3 rounded-lg font-bold hover:bg-yellow-500 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
