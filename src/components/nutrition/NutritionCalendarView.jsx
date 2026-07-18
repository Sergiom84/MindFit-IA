import { useState, useEffect } from 'react';
import { Calendar, Dumbbell, Moon, ChevronLeft, ChevronRight, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import MealDetailView from './MealDetailView';
import tokenManager from '../../utils/tokenManager';
import { getApiBaseUrl } from '../../config/api';

// ARCH-001: base URL canónica desde el adapter de config (VITE_API_URL o same-origin).
const API_URL = getApiBaseUrl();

const DIAS_SEMANA_POR_INDICE = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DIAS_SEMANA_LEGACY = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const cardBase = "bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg";
const MENU_GENERATION_MODES = [
  { value: "hybrid_ai", label: "IA híbrida" },
  { value: "recipe_examples", label: "Recetas" },
  { value: "deterministic", label: "Determinista" },
  { value: "ai", label: "IA clásico" }
];

const decorateDayWithGenerationMetadata = (day, dayMetadata = null) => {
  if (!day || !Array.isArray(day.meals) || !dayMetadata) {
    return day;
  }

  let hasDecoratedMeals = false;
  const meals = day.meals.map((meal) => {
    const mealId = meal?.id ? String(meal.id) : null;
    const metadata = mealId ? dayMetadata[mealId] : null;
    if (!metadata) {
      return meal;
    }
    hasDecoratedMeals = true;
    return {
      ...meal,
      generation_metadata: metadata
    };
  });

  if (!hasDecoratedMeals) {
    return day;
  }

  return {
    ...day,
    meals
  };
};

const formatLocalDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getPlanStartDate = (plan) => {
  const raw = plan?.plan_start_date || plan?.start_date || plan?.created_at;
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const getMondayOfWeek = (dateValue) => {
  const date = new Date(dateValue);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
};

const getCurrentWeekFromPlan = (plan) => {
  const startDate = getPlanStartDate(plan);
  if (!startDate) return 0;
  const startWeek = getMondayOfWeek(startDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today.getTime() - startWeek.getTime()) / (1000 * 60 * 60 * 24));
  if (!Number.isFinite(diffDays) || diffDays < 0) return 0;
  return Math.floor(diffDays / 7);
};

/**
 * Vista de calendario nutricional
 * Muestra el plan activo día por día con las comidas
 */
export default function NutritionCalendarView() {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentWeek, setCurrentWeek] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);
  const [generatingDay, setGeneratingDay] = useState(null);
  const [infoMessage, setInfoMessage] = useState(null);
  const [menuGenerationMode, setMenuGenerationMode] = useState("recipe_examples");
  const [generationMetadataByDay, setGenerationMetadataByDay] = useState({});
  const menusEnabled = true;

  useEffect(() => {
    loadActivePlan();
  }, []);

  const loadActivePlan = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const token = tokenManager.getToken() || tokenManager.getToken();
      const response = await fetch(`${API_URL}/api/nutrition-v2/active-plan`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('No tienes un plan activo. Genera uno primero.');
        }
        throw new Error('Error al cargar plan');
      }

      const data = await response.json();
      setPlan(data);
      console.log('✅ Plan cargado:', data);
      return data;
    } catch (err) {
      if (!silent) {
        setError(err.message);
      }
      console.error('Error cargando plan:', err);
      return null;
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const refreshSelectedDayFromPlan = async (dayId) => {
    if (!dayId) return null;
    const refreshedPlan = await loadActivePlan({ silent: true });
    if (!refreshedPlan?.days?.length) {
      return null;
    }

    const dayMetadata = generationMetadataByDay[String(dayId)] || null;
    const updatedDay = refreshedPlan.days.find((entry) => String(entry.day_id) === String(dayId));
    if (!updatedDay) {
      return null;
    }

    const decoratedDay = decorateDayWithGenerationMetadata(updatedDay, dayMetadata);
    setSelectedDay(decoratedDay);
    return decoratedDay;
  };

const generateMenusForDay = async (day) => {
    if (!day?.day_id) return;
    setGeneratingDay(day.day_id);
    setInfoMessage(null);
    try {
      const token = tokenManager.getToken() || tokenManager.getToken();
      const response = await fetch(`${API_URL}/api/nutrition-v2/generate-full-day-menus`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ dayId: day.day_id, mode: menuGenerationMode })
      });

      if (!response.ok) {
        throw new Error('Error al generar menus del dia');
      }

      const data = await response.json();
      const persistedItems = Number(data.items_persisted || 0);
      const fallbackCount = Number(data.fallback_count || 0);
      const modeUsed = data.mode || menuGenerationMode;
      const dayKey = String(day.day_id);
      const metadataByMealId = {};
      (Array.isArray(data.menus) ? data.menus : []).forEach((menuEntry) => {
        const mealId = menuEntry?.meal_id ? String(menuEntry.meal_id) : null;
        if (!mealId || !menuEntry?.metadata) return;
        metadataByMealId[mealId] = menuEntry.metadata;
      });
      const mergedDayMetadata = {
        ...(generationMetadataByDay[dayKey] || {}),
        ...metadataByMealId
      };
      if (Object.keys(metadataByMealId).length > 0) {
        setGenerationMetadataByDay((previous) => ({
          ...previous,
          [dayKey]: mergedDayMetadata
        }));
      }

      setInfoMessage(
        `Menús generados (${modeUsed}) para ${data.menus_generated}/${data.total_meals} comidas` +
        (persistedItems > 0 ? ` · ${persistedItems} items guardados` : '') +
        (fallbackCount > 0 ? ` · ${fallbackCount} fallback(s) a determinista` : '')
      );

      const refreshedPlan = await loadActivePlan();
      if (refreshedPlan?.days?.length) {
        const updatedDay = refreshedPlan.days.find((entry) => entry.day_id === day.day_id);
        if (updatedDay) {
          setSelectedDay(decorateDayWithGenerationMetadata(updatedDay, mergedDayMetadata));
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingDay(null);
    }
  };

  useEffect(() => {
    if (!plan?.days?.length) return;
    const initialWeek = getCurrentWeekFromPlan(plan);
    const startDate = getPlanStartDate(plan);
    const endDate = startDate
      ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + plan.days.length - 1)
      : null;
    const startWeek = startDate ? getMondayOfWeek(startDate) : null;
    const endWeek = endDate ? getMondayOfWeek(endDate) : null;
    const totalWeeks = startWeek && endWeek
      ? Math.floor((endWeek.getTime() - startWeek.getTime()) / (1000 * 60 * 60 * 24 * 7)) + 1
      : Math.ceil(plan.days.length / 7);
    const boundedWeek = Math.max(0, Math.min(initialWeek, totalWeeks - 1));
    setCurrentWeek(boundedWeek);
  }, [plan]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-yellow-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Cargando plan nutricional...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-2xl mx-auto p-4 sm:p-6">
        <div className="bg-red-500/10 border border-red-500 rounded-lg p-6 text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={loadActivePlan}
            className="px-4 py-2 bg-yellow-400 text-gray-900 rounded-lg font-semibold hover:bg-yellow-500 transition-colors inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!plan || !plan.days) {
    return (
      <div className="w-full max-w-2xl mx-auto p-4 sm:p-6">
        <div className={`${cardBase} rounded-lg p-6 text-center border-l-2 border-l-yellow-400/30`}>
          <Calendar className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 mb-4">No hay plan nutricional activo</p>
          <p className="text-gray-500 text-sm">Ve a "Generar Plan" para crear uno nuevo</p>
        </div>
      </div>
    );
  }

  const planStartDate = getPlanStartDate(plan);
  const planEndDate = planStartDate
    ? new Date(planStartDate.getFullYear(), planStartDate.getMonth(), planStartDate.getDate() + plan.days.length - 1)
    : null;
  const planStartWeek = planStartDate ? getMondayOfWeek(planStartDate) : null;
  const planEndWeek = planEndDate ? getMondayOfWeek(planEndDate) : null;
  const totalWeeks = planStartWeek && planEndWeek
    ? Math.floor((planEndWeek.getTime() - planStartWeek.getTime()) / (1000 * 60 * 60 * 24 * 7)) + 1
    : Math.ceil(plan.days.length / 7);
  const currentWeekStart = planStartWeek
    ? new Date(planStartWeek.getFullYear(), planStartWeek.getMonth(), planStartWeek.getDate() + currentWeek * 7)
    : null;
  const activePlanKcal = Number(plan.kcal_objetivo);
  const currentEstimateKcal = Number(plan.current_estimate?.kcal_objetivo);
  const showCurrentEstimateWarning =
    Number.isFinite(activePlanKcal) &&
    Number.isFinite(currentEstimateKcal) &&
    Math.abs(activePlanKcal - currentEstimateKcal) >= 250;

  const dayMap = new Map();
  if (planStartDate) {
    plan.days.forEach((day) => {
      const date = new Date(planStartDate);
      date.setDate(planStartDate.getDate() + day.day_index);
      const key = formatLocalDate(date);
      if (key) {
        dayMap.set(key, day);
      }
    });
  }

  const weekSlots = Array.from({ length: 7 }, (_, index) => {
    if (!currentWeekStart || !planStartDate) {
      const fallbackDay = plan.days[currentWeek * 7 + index] || null;
      return { date: null, day: fallbackDay, inPlan: Boolean(fallbackDay) };
    }
    const date = new Date(currentWeekStart);
    date.setDate(currentWeekStart.getDate() + index);
    const key = formatLocalDate(date);
    const day = key ? dayMap.get(key) : null;
    const inPlan = planStartDate && planEndDate
      ? date >= planStartDate && date <= planEndDate
      : Boolean(day);
    return { date, day, inPlan };
  });

  const handlePreviousWeek = () => {
    if (currentWeek > 0) {
      setCurrentWeek(currentWeek - 1);
    }
  };

  const handleNextWeek = () => {
    if (currentWeek < totalWeeks - 1) {
      setCurrentWeek(currentWeek + 1);
    }
  };

  return (
      <div className="w-full max-w-7xl mx-auto p-0 sm:p-6">
      {/* Header del Plan */}
      <div className={`${cardBase} rounded-2xl p-4 sm:p-6 mb-6 border-l-2 border-l-yellow-400/30`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-8 h-8 text-yellow-400" />
            <div>
              <h2 className="text-2xl font-semibold font-urbanist text-white">Plan Nutricional Activo</h2>
              <p className="text-gray-300/70 text-sm">
                {plan.duracion_dias} días • {plan.comidas_por_dia} comidas/día • {plan.training_type}
              </p>
            </div>
          </div>

          <button
            onClick={loadActivePlan}
            className="p-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
            title="Recargar plan"
          >
            <RefreshCw className="w-5 h-5 text-white" />
          </button>
        </div>

        {infoMessage && (
          <div className="mt-2 text-sm text-emerald-300">{infoMessage}</div>
        )}

        {showCurrentEstimateWarning && (
          <div className="mt-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
            <p className="font-semibold text-yellow-200">Estimacion actual distinta al plan activo</p>
            <p className="text-yellow-100/90">
              El plan activo fue generado con {activePlanKcal} kcal, pero la estimacion actual del perfil es {currentEstimateKcal} kcal.
              Si has cambiado actividad, pasos o vienes de un calculo anterior, regenera el plan para actualizarlo.
            </p>
          </div>
        )}

        <div className="mt-3 mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="text-xs text-gray-300/80">Modo de generación de menús</label>
          <select
            value={menuGenerationMode}
            onChange={(event) => setMenuGenerationMode(event.target.value)}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-yellow-400/30"
          >
            {MENU_GENERATION_MODES.map((modeOption) => (
              <option key={modeOption.value} value={modeOption.value} className="bg-neutral-900 text-white">
                {modeOption.label}
              </option>
            ))}
          </select>
        </div>

        {/* Resumen de Macros */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-lg p-3 border-l-2 border-l-emerald-400/40">
            <div className="text-gray-300/70 text-xs mb-1">Calorías Objetivo</div>
            <div className="text-xl font-bold text-emerald-300">{plan.kcal_objetivo} kcal</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3 border-l-2 border-l-red-400/40">
            <div className="text-gray-300/70 text-xs mb-1">Proteína</div>
            <div className="text-xl font-bold text-red-300">{plan.macros_objetivo.protein_g}g</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3 border-l-2 border-l-yellow-400/40">
            <div className="text-gray-300/70 text-xs mb-1">Carbohidratos</div>
            <div className="text-xl font-bold text-yellow-300">{plan.macros_objetivo.carbs_g}g</div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3 border-l-2 border-l-sky-400/40">
            <div className="text-gray-300/70 text-xs mb-1">Grasas</div>
            <div className="text-xl font-bold text-sky-300">{plan.macros_objetivo.fat_g}g</div>
          </div>
        </div>

        {plan.carb_cycling_summary && (
          <div className="mt-4 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
            <p className="font-semibold text-blue-200">{plan.carb_cycling_summary.label}</p>
            <p className="text-blue-100/90">{plan.carb_cycling_summary.description}</p>
            <p className="mt-2 text-xs text-blue-100/80">
              Promedio semanal estimado: {plan.carb_cycling_summary.avg_weekly_kcal} kcal
              {" "}· objetivo {plan.carb_cycling_summary.kcal_objetivo} kcal
              {" "}· drift {plan.carb_cycling_summary.drift_pct}%
            </p>
          </div>
        )}
      </div>

      {/* Navegación de Semanas */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <button
          onClick={handlePreviousWeek}
          disabled={currentWeek === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-5 h-5" />
          Semana Anterior
        </button>

        <div className="text-center">
          <div className="text-white font-semibold">Semana {currentWeek + 1} de {totalWeeks}</div>
          <div className="text-gray-300/70 text-sm">
            {(() => {
              const indices = weekSlots
                .filter((slot) => slot.day)
                .map((slot) => slot.day.day_index + 1);
              if (indices.length === 0) return 'Días —';
              return `Días ${Math.min(...indices)} - ${Math.max(...indices)}`;
            })()}
          </div>
        </div>

        <button
          onClick={handleNextWeek}
          disabled={currentWeek >= totalWeeks - 1}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Siguiente Semana
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Grid de Días */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
        {weekSlots.map((slot, index) => {
          const { date, day, inPlan } = slot;
          const diaSemana = date
            ? DIAS_SEMANA_POR_INDICE[date.getDay()]
            : DIAS_SEMANA_LEGACY[index];
          const isTraining = day?.tipo_dia === 'entreno';

          return (
            <div
              key={day?.day_index ?? `${currentWeek}-${index}`}
              className={`bg-neutral-900/70 rounded-xl p-4 border border-white/10 ring-1 ring-white/5 transition-all cursor-pointer hover:border-white/20 ${
                isTraining ? 'border-l-2 border-l-emerald-400/60' : 'border-l-2 border-l-sky-400/40'
              }`}
              onClick={() => {
                if (day) {
                  const dayMetadata = generationMetadataByDay[String(day.day_id)] || null;
                  setSelectedDay(decorateDayWithGenerationMetadata(day, dayMetadata));
                }
              }}
            >
              {/* Header del Día */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-semibold text-sm">{diaSemana}</span>
                  <span className="text-gray-300/70 text-xs">
                    {day ? `Día ${day.day_index + 1}` : inPlan ? 'Sin datos' : 'Fuera del plan'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {day ? (
                    isTraining ? (
                      <>
                        <Dumbbell className="w-4 h-4 text-emerald-400" />
                        <span className="text-emerald-300 text-xs font-medium">Entrenamiento</span>
                      </>
                    ) : (
                      <>
                        <Moon className="w-4 h-4 text-sky-300" />
                        <span className="text-sky-300 text-xs font-medium">Descanso</span>
                      </>
                    )
                  ) : (
                    <span className="text-gray-500 text-xs font-medium">Sin plan</span>
                  )}
                </div>
              </div>

              {/* Macros del Día */}
              {day && (
                <div className="space-y-1 mb-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-300/70">Calorías:</span>
                    <span className="text-white font-semibold">{day.kcal} kcal</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-300/70">P:</span>
                    <span className="text-red-300">{day.macros.protein_g}g</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-300/70">C:</span>
                    <span className="text-yellow-300">{day.macros.carbs_g}g</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-300/70">G:</span>
                    <span className="text-sky-300">{day.macros.fat_g}g</span>
                  </div>
                </div>
              )}

              {/* Comidas del Día */}
              {day && (
                <div className="border-t border-white/10 pt-2">
                  <div className="text-gray-300/70 text-xs mb-1">
                    {day.meals?.length || 0} comidas
                  </div>
                  {day.meals?.slice(0, 2).map((meal) => (
                    <div key={meal.orden} className="text-xs text-gray-400 truncate">
                      • {meal.nombre}
                    </div>
                  ))}
                  {day.meals?.length > 2 && (
                    <div className="text-xs text-gray-400">
                      ... +{day.meals.length - 2} más
                    </div>
                  )}
                </div>
              )}

              {/* Acciones */}
              <div className="mt-3 text-xs text-gray-400">
                <span>{day ? 'Click para detalles' : 'Sin detalles'}</span>
              </div>
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (day) {
                      const dayMetadata = generationMetadataByDay[String(day.day_id)] || null;
                      setSelectedDay(decorateDayWithGenerationMetadata(day, dayMetadata));
                    }
                  }}
                  className="inline-flex flex-col items-center justify-center gap-0.5 px-2.5 py-1.5 rounded-full bg-white/5 border border-white/15 text-gray-200/80 text-[10px] sm:text-xs uppercase tracking-wide max-w-full hover:bg-white/10 disabled:opacity-60"
                  disabled={!day}
                >
                  <span>Menú del día</span>
                  <span className="text-[9px] sm:text-[10px] text-gray-400/80">Ver detalles</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de Detalle del Día */}
      {selectedDay && (
        <MealDetailView
          day={selectedDay}
          planInfo={{
            plan_name: plan.plan_name,
            training_type: plan.training_type,
            carb_cycling_summary: plan.carb_cycling_summary || null
          }}
          menuGenerationMode={menuGenerationMode}
          menusEnabled={menusEnabled}
          isGeneratingMenus={generatingDay === selectedDay.day_id}
          onGenerateDayMenus={menusEnabled ? () => generateMenusForDay(selectedDay) : null}
          onRefreshDay={refreshSelectedDayFromPlan}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}
