/**
 * NUTRITION DASHBOARD
 * Dashboard principal de nutrición que integra todos los módulos
 *
 * VALOR PARA EL USUARIO:
 * - Vista centralizada de todo el sistema nutricional
 * - Acceso rápido a mediciones, ICG/IPG, saltos de dieta, timing
 * - Navegación intuitiva por pestañas
 */

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import BodyMeasurementsForm from './BodyMeasurementsForm';
import ICGIPGDashboard from './ICGIPGDashboard';
import BodyMeasurementsHistory from './BodyMeasurementsHistory';
import CheatMealManager from './CheatMealManager';
import CarbTimingGuide from './CarbTimingGuide';

const TABS = {
  OVERVIEW: 'overview',
  MEASUREMENTS: 'measurements',
  HISTORY: 'history',
  CHEAT_MEALS: 'cheat_meals',
  TIMING: 'timing'
};

export default function NutritionDashboard() {
  const [activeTab, setActiveTab] = useState(TABS.OVERVIEW);
  const cardBase = "bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg";
  const tabInactive = "bg-white/5 border-white/10 text-gray-200/80 hover:bg-white/10 hover:text-white";
  const tabActive = "bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black border-transparent shadow-[0_12px_30px_-18px_rgba(250,204,21,0.75)]";

  const handleMeasurementSuccess = (data) => {
    // Mostrar notificación de éxito
    if (data.progression_analysis?.requires_reevaluation) {
      alert(`⚠️ ${data.progression_analysis.summary}\n\n${data.progression_analysis.recommendations.join('\n')}`);
    } else {
      alert('✅ Medición registrada correctamente');
    }
    // Recargar dashboard
    setActiveTab(TABS.OVERVIEW);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case TABS.OVERVIEW:
        return <ICGIPGDashboard />;

      case TABS.MEASUREMENTS:
        return (
          <BodyMeasurementsForm
            onSuccess={handleMeasurementSuccess}
            onCancel={() => setActiveTab(TABS.OVERVIEW)}
          />
        );

      case TABS.HISTORY:
        return <BodyMeasurementsHistory />;

      case TABS.CHEAT_MEALS:
        return <CheatMealManager />;

      case TABS.TIMING:
        return <CarbTimingGuide />;

      default:
        return <ICGIPGDashboard />;
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-0 sm:px-4 py-4 sm:py-6 text-white space-y-6">
      {/* Header */}
      <div className="mb-2">
        <h1 className="text-3xl font-semibold font-urbanist mb-2">🍽️ Control Nutricional</h1>
        <p className="text-gray-300">
          Sistema inteligente de seguimiento y optimización nutricional
        </p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab(TABS.OVERVIEW)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all duration-200 ${
              activeTab === TABS.OVERVIEW ? tabActive : tabInactive
            }`}
          >
            📊 Estado General
          </button>

          <button
            onClick={() => setActiveTab(TABS.MEASUREMENTS)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all duration-200 ${
              activeTab === TABS.MEASUREMENTS ? tabActive : tabInactive
            }`}
          >
            📏 Nueva Medición
          </button>

          <button
            onClick={() => setActiveTab(TABS.HISTORY)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all duration-200 ${
              activeTab === TABS.HISTORY ? tabActive : tabInactive
            }`}
          >
            📈 Historial
          </button>

          <button
            onClick={() => setActiveTab(TABS.CHEAT_MEALS)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all duration-200 ${
              activeTab === TABS.CHEAT_MEALS ? tabActive : tabInactive
            }`}
          >
            🍕 Saltos de Dieta
          </button>

          <button
            onClick={() => setActiveTab(TABS.TIMING)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all duration-200 ${
              activeTab === TABS.TIMING ? tabActive : tabInactive
            }`}
          >
            ⏰ Timing Carbohidratos
          </button>
      </div>

      {/* Content */}
      <div className="space-y-6">
        {renderTabContent()}
      </div>

      {/* Footer Info */}
      <Card className={`${cardBase} border-l-2 border-l-yellow-400/30`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">💡</span>
            <div className="text-sm text-gray-200">
              <p className="font-semibold mb-1 text-white">Consejos de Uso</p>
              <ul className="list-disc list-inside space-y-1 text-gray-300">
                <li>Registra tus mediciones <strong>semanalmente</strong> en las mismas condiciones</li>
                <li>El sistema detecta <strong>automáticamente</strong> ICG/IPG fuera de rango</li>
                <li>Revisa las <strong>alertas</strong> antes de que los problemas se agraven</li>
                <li>Sigue las <strong>recomendaciones</strong> con cantidades exactas de ajuste</li>
                <li>Usa el timing de carbohidratos para <strong>optimizar rendimiento</strong></li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
