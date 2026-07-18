import { CheckCircle2 } from 'lucide-react';

// Sección de resumen del plan nutricional generado.
// Extraído de NutritionPlanGenerator.jsx (ARCH-002) sin cambios de comportamiento.
export default function GeneratedPlanSummary({ plan }) {
  if (!plan) return null;

  return (
    <section className="bg-gradient-to-br from-green-500/10 to-blue-500/10 border border-green-500/40 rounded-xl p-6 space-y-4">
      <h4 className="text-green-400 font-bold text-lg flex items-center gap-2">
        <CheckCircle2 className="w-6 h-6" />
        Plan generado exitosamente
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
          <div className="text-gray-400 text-xs mb-1">TMB</div>
          <div className="text-2xl font-bold text-yellow-400">{plan.bmr} kcal</div>
          <div className="text-gray-500 text-xs">Metabolismo basal</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
          <div className="text-gray-400 text-xs mb-1">TDEE</div>
          <div className="text-2xl font-bold text-yellow-400">{plan.tdee} kcal</div>
          <div className="text-gray-500 text-xs">Gasto total diario</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
          <div className="text-gray-400 text-xs mb-1">Calorias objetivo</div>
          <div className="text-2xl font-bold text-green-400">{plan.kcal_objetivo} kcal</div>
          <div className="text-gray-500 text-xs">Por dia</div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
          <div className="text-gray-400 text-xs mb-1">Comidas</div>
          <div className="text-2xl font-bold text-blue-400">{plan.comidas_por_dia}</div>
          <div className="text-gray-500 text-xs">Por dia</div>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-lg p-4">
        {plan.carb_cycling_audit && (
          <div className="mb-3 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200">
            <strong>{plan.carb_cycling_audit.label}:</strong>{" "}
            {plan.carb_cycling_audit.description}
          </div>
        )}
        <div className="text-gray-400 text-sm mb-2">Macronutrientes objetivo (promedio):</div>
        <div className="flex flex-wrap gap-4 text-white text-sm">
          <div>
            <span className="text-red-400 font-bold">
              {plan.macros_objetivo.protein_g} g
            </span>
            <span className="text-gray-400 ml-1">proteina</span>
          </div>
          <div>
            <span className="text-yellow-300 font-bold">
              {plan.macros_objetivo.carbs_g} g
            </span>
            <span className="text-gray-400 ml-1">carbohidratos</span>
          </div>
          <div>
            <span className="text-blue-300 font-bold">
              {plan.macros_objetivo.fat_g} g
            </span>
            <span className="text-gray-400 ml-1">grasas</span>
          </div>
        </div>
        {plan.carb_cycling_audit && (
          <p className="mt-3 text-xs text-gray-400">
            Promedio semanal estimado: {plan.carb_cycling_audit.avg_weekly_kcal} kcal
            {" "}· drift {plan.carb_cycling_audit.drift_pct}%
          </p>
        )}
      </div>

      <p className="text-sm text-gray-400 text-center">
        Ve a la pestaña Calendario para revisar el plan completo dia por dia y generar los menus.
      </p>
    </section>
  );
}
