import { useState, useEffect } from 'react';
import { Calendar, Dumbbell, Moon, ChevronLeft, ChevronRight, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import MealDetailView from './MealDetailView';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3010';

const DIAS_SEMANA_COMPLETO = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const cardBase = "bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg";

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

  useEffect(() => {
    loadActivePlan();
  }, []);

  const loadActivePlan = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token') || localStorage.getItem('authToken');
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
    } catch (err) {
      setError(err.message);
      console.error('Error cargando plan:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateMenusForDay = async (day) => {
    if (!day?.day_id) return;
    setGeneratingDay(day.day_id);
    setInfoMessage(null);
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('authToken');
      const response = await fetch(`${API_URL}/api/nutrition-v2/generate-full-day-menus`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ dayId: day.day_id })
      });

      if (!response.ok) {
        throw new Error('Error al generar menús del día');
      }

      const data = await response.json();
      setInfoMessage(`Menús generados para ${data.menus_generated}/${data.total_meals} comidas`);
      // Recargar plan para reflejar menús si se persistieran a futuro
      await loadActivePlan();
    } catch (err) {
      setError(err.message);
    } finally {
      setGeneratingDay(null);
    }
  };

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
      <div className="max-w-2xl mx-auto p-6">
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
      <div className="max-w-2xl mx-auto p-6">
        <div className={`${cardBase} rounded-lg p-6 text-center border-l-2 border-l-yellow-400/30`}>
          <Calendar className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400 mb-4">No hay plan nutricional activo</p>
          <p className="text-gray-500 text-sm">Ve a "Generar Plan" para crear uno nuevo</p>
        </div>
      </div>
    );
  }

  // Calcular semanas
  const totalWeeks = Math.ceil(plan.days.length / 7);
  const daysInCurrentWeek = plan.days.slice(currentWeek * 7, (currentWeek + 1) * 7);

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
      <div className="max-w-7xl mx-auto p-6">
      {/* Header del Plan */}
      <div className={`${cardBase} rounded-2xl p-6 mb-6 border-l-2 border-l-yellow-400/30`}>
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
            Días {currentWeek * 7 + 1} - {Math.min((currentWeek + 1) * 7, plan.days.length)}
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
        {daysInCurrentWeek.map((day, index) => {
          const dayNumber = currentWeek * 7 + index;
          const diaSemana = DIAS_SEMANA_COMPLETO[dayNumber % 7];
          const isTraining = day.tipo_dia === 'entreno';

          return (
            <div
              key={day.day_index}
              className={`bg-neutral-900/70 rounded-xl p-4 border border-white/10 ring-1 ring-white/5 transition-all cursor-pointer hover:border-white/20 ${
                isTraining ? 'border-l-2 border-l-emerald-400/60' : 'border-l-2 border-l-sky-400/40'
              }`}
              onClick={() => setSelectedDay(day)}
            >
              {/* Header del Día */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-white font-semibold text-sm">{diaSemana}</span>
                  <span className="text-gray-300/70 text-xs">Día {day.day_index + 1}</span>
                </div>
                <div className="flex items-center gap-2">
                  {isTraining ? (
                    <>
                      <Dumbbell className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-300 text-xs font-medium">Entrenamiento</span>
                    </>
                  ) : (
                    <>
                      <Moon className="w-4 h-4 text-sky-300" />
                      <span className="text-sky-300 text-xs font-medium">Descanso</span>
                    </>
                  )}
                </div>
              </div>

              {/* Macros del Día */}
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

              {/* Comidas del Día */}
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

              {/* Acciones */}
              <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                <span>Click para detalles</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); generateMenusForDay(day); }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-yellow-400/10 border border-yellow-400/40 text-yellow-200 hover:bg-yellow-400/20 disabled:opacity-50"
                  disabled={generatingDay === day.day_id}
                >
                  <Sparkles className="w-4 h-4" />
                  {generatingDay === day.day_id ? 'Generando...' : 'Menú del día'}
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
            training_type: plan.training_type
          }}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}
