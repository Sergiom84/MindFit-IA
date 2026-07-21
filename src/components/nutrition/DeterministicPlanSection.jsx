// Seccion presentacional "Calculo determinista del plan".
// Extraida de NutritionPlanGenerator.jsx (ARCH-002) sin cambios de comportamiento.
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Dumbbell,
  Info,
  Loader2,
  TrendingUp
} from 'lucide-react';
import MealCountWarningModal from './MealCountWarningModal';
import {
  DIAS_SEMANA,
  DURATION_PRESETS,
  TRAINING_TYPES
} from './nutritionPlanConfig';

export default function DeterministicPlanSection({
  planError,
  planSuccess,
  planLoading,
  trainingPlanInfo,
  config,
  setConfig,
  isTrainingLinked,
  isDailySchedule,
  previewSchedule,
  trainingDaysCount,
  restDaysCount,
  trainingScheduleTitle,
  scheduleHelperText,
  setPreset,
  toggleTrainingDay,
  handleGeneratePlan,
  mealCountWarning,
  closeMealCountWarning,
  handleMealCountWarningConfirm
}) {
  return (
    <section className="space-y-6">
        <div className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 rounded-xl p-6 space-y-6">
          <header className="flex items-center gap-3">
            <TrendingUp className="w-6 h-6 text-yellow-400" />
            <div>
              <h3 className="text-xl font-semibold text-white">Calculo determinista del plan</h3>
              <p className="text-sm text-gray-400">
                Define duracion, tipo de entrenamiento y distribucion de dias activos y de descanso.
              </p>
            </div>
          </header>

          {planError && (
            <div className="p-3 bg-red-500/10 border border-red-500/40 rounded-lg flex items-start gap-2 text-sm text-red-300">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <span>{planError}</span>
            </div>
          )}

          {planSuccess && (
            <div className="p-3 bg-green-500/10 border border-green-500/40 rounded-lg flex items-start gap-2 text-sm text-green-300">
              <CheckCircle2 className="w-4 h-4 mt-0.5" />
              <span>Plan generado correctamente. Revisa el calendario para ver el detalle dia por dia.</span>
            </div>
          )}

          <div className="space-y-5">
            <div>
              <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-yellow-400" />
                Duracion del plan
              </h4>
              {trainingPlanInfo.loading && (
                <p className="text-xs text-gray-400 mb-2">Buscando plan activo...</p>
              )}
              {trainingPlanInfo.error && (
                <p className="text-xs text-amber-300 mb-2">{trainingPlanInfo.error}</p>
              )}
              {trainingPlanInfo.hasPlan && trainingPlanInfo.endDate && (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-300">
                  <span className="px-2 py-1 rounded-full bg-white/10 border border-white/10">
                    Plan hasta {trainingPlanInfo.endDate.toLocaleDateString('es-ES')}
                  </span>
                  <span className="px-2 py-1 rounded-full bg-white/10 border border-white/10">
                    Revision automatica cada 14 dias
                  </span>
                </div>
              )}
              {trainingPlanInfo.hasPlan && (
                <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-300" />
                    <div className="space-y-1">
                      <p className="font-semibold text-emerald-100">Nutricion enlazada a tu plan de entrenamiento</p>
                      <p className="text-emerald-100/80">
                        La duracion, el tipo de entrenamiento y el calendario se sincronizan automaticamente.
                      </p>
                    </div>
                  </div>
                  {(trainingPlanInfo.capApplied || trainingPlanInfo.minApplied) && (
                    <p className="text-xs text-amber-200/90 mt-2">
                      {trainingPlanInfo.capApplied && 'El calendario muestra hasta 28 dias. Tu plan continua activo.'}
                      {trainingPlanInfo.minApplied && 'Duracion ajustada al minimo de 3 dias.'}
                    </p>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {DURATION_PRESETS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, duracion_dias: days }))}
                    className={`px-4 py-3 rounded-lg font-semibold transition-all ${
                      config.duracion_dias === days
                        ? 'bg-yellow-400 text-gray-900'
                        : 'bg-white/5 text-gray-200/80 hover:bg-white/10'
                    }`}
                    disabled={planLoading || isTrainingLinked}
                  >
                    Vista: {days}d
                  </button>
                ))}
              </div>
              {!isTrainingLinked && (
                <p className="text-xs text-gray-500 mt-2">
                  Recomendamos planes de 7-14 dias para ajustarlos con frecuencia.
                </p>
              )}
              {isTrainingLinked && (
                <p className="text-xs text-gray-500 mt-2">
                  Duracion sincronizada con tu plan de entrenamiento actual.
                </p>
              )}
              {!trainingPlanInfo.hasPlan && !trainingPlanInfo.loading && (
                <p className="text-xs text-gray-500 mt-1">
                  Si inicias un plan de entrenamiento, podras rehacer la dieta para ajustar la duracion.
                </p>
              )}
            </div>

            <div>
              <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                <Dumbbell className="w-4 h-4 text-yellow-400" />
                Tipo de entrenamiento
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {TRAINING_TYPES.map((trainingType) => (
                  <button
                    key={trainingType.value}
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, training_type: trainingType.value }))}
                    className={`p-4 rounded-lg border transition-all text-left ${
                      config.training_type === trainingType.value
                        ? 'border-yellow-400 bg-yellow-500/10 text-white'
                        : 'border-white/10 bg-white/5 text-gray-300/80 hover:border-white/20'
                    }`}
                    disabled={planLoading || isTrainingLinked}
                  >
                    <trainingType.Icon className="w-5 h-5 mb-2 text-yellow-400" />
                    <div className="text-sm font-semibold">{trainingType.label}</div>
                    <div className="text-xs text-gray-400 mt-1">{trainingType.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h4 className="text-white font-semibold">{trainingScheduleTitle}</h4>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Info className="w-4 h-4" />
                  <span>{scheduleHelperText}</span>
                </div>
              </div>

              {!isTrainingLinked && (
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <span className="text-sm text-gray-400">Presets rapidos:</span>
                  {['3dias', '4dias', '5dias', '6dias'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setPreset(preset)}
                      className="px-2.5 py-1 bg-white/5 text-gray-200/80 rounded text-xs hover:bg-white/10 transition-colors disabled:opacity-60"
                      disabled={planLoading}
                    >
                      {preset.replace('dias', ' dias')}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-4 sm:grid-cols-7 gap-1 sm:gap-2">
                {DIAS_SEMANA.map((dia, index) => (
                  <button
                    key={dia}
                    type="button"
                    onClick={() => {
                      if (!isDailySchedule && !isTrainingLinked) {
                        toggleTrainingDay(index);
                      }
                    }}
                    className={`aspect-square rounded-md sm:rounded-lg font-semibold text-[10px] sm:text-sm transition-all ${
                      previewSchedule[index]
                        ? 'bg-green-500 text-white'
                        : 'bg-white/5 text-gray-400 hover:bg-white/10'
                    }`}
                    disabled={planLoading || isDailySchedule || isTrainingLinked}
                  >
                    <div>{dia}</div>
                    <div className="text-[9px] sm:text-[10px] mt-0.5 sm:mt-1">
                      {previewSchedule[index] ? 'Entreno' : 'Descanso'}
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-3 flex gap-4 text-sm flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full" />
                  <span className="text-gray-300">{trainingDaysCount} dias de entreno</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-white/20 rounded-full" />
                  <span className="text-gray-300">{restDaysCount} dias de descanso</span>
                </div>
              </div>

              <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm text-blue-200">
                <strong>Carb cycling (kcal semanales estables):</strong> subimos carbohidratos en entreno (+10%) y los bajamos en descanso (-15%), compensando con grasas para no inflar el promedio semanal.
              </div>
            </div>
          </div>
        </div>

        <div className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 rounded-xl p-4 space-y-3">
          <h4 className="text-white font-semibold mb-2 flex items-center gap-2">
            Resumen de configuracion
          </h4>
          <ul className="text-sm text-gray-300 space-y-1">
            <li>
              <strong className="text-yellow-300">Duracion:</strong> {config.duracion_dias} dias
            </li>
            <li>
              <strong className="text-yellow-300">Tipo:</strong>{' '}
              {TRAINING_TYPES.find((t) => t.value === config.training_type)?.label}
            </li>
            <li>
              <strong className="text-yellow-300">Frecuencia:</strong>{' '}
              {trainingDaysCount} entrenos/semana{isDailySchedule ? ' (semana habitual)' : ''}
            </li>
            <li>
              <strong className="text-yellow-300">Carb cycling:</strong> kcal semanales estables
            </li>
          </ul>
        </div>

        <div className="bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 rounded-xl p-4">
          <button
            type="button"
            onClick={handleGeneratePlan}
            className="w-full bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black py-4 rounded-xl font-semibold text-lg hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)] transition-all disabled:opacity-70 flex items-center justify-center gap-2"
            disabled={planLoading}
          >
            {planLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generando plan determinista...
              </>
            ) : (
              <>
                <TrendingUp className="w-5 h-5" />
                Generar plan nutricional
              </>
            )}
          </button>
        </div>

        {mealCountWarning.open && (
          <MealCountWarningModal
            nextValue={mealCountWarning.nextValue}
            source={mealCountWarning.source}
            onCancel={closeMealCountWarning}
            onConfirm={handleMealCountWarningConfirm}
          />
        )}
      </section>
  );
}
