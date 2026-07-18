// Tarjetas de estimaciones (TMB / TDEE / Calorías objetivo).
// Extraído de NutritionPlanGenerator.jsx (ARCH-002) sin cambios de comportamiento.
export default function NutritionEstimationCards({ estimaciones }) {
  if (!estimaciones) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
        <div className="text-gray-400 text-xs mb-1">TMB</div>
        <div className="text-2xl font-bold text-yellow-400">{estimaciones.bmr}</div>
        <div className="text-gray-500 text-xs">Metabolismo basal</div>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
        <div className="text-gray-400 text-xs mb-1">TDEE</div>
        <div className="text-2xl font-bold text-yellow-400">{estimaciones.tdee}</div>
        <div className="text-gray-500 text-xs">Gasto total diario</div>
      </div>
      <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
        <div className="text-gray-400 text-xs mb-1">Calorias objetivo</div>
        <div className="text-2xl font-bold text-green-400">{estimaciones.kcal_objetivo}</div>
        <div className="text-gray-500 text-xs">Por dia</div>
      </div>
    </div>
  );
}
