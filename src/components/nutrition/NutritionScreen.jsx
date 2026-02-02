import React, { useState, useEffect } from 'react';
import { useUserContext } from '@/contexts/UserContext';

import { Card, CardContent } from '@/components/ui/card';
import { Calendar, Target, TrendingUp } from 'lucide-react';

// Sistema V2 + Dashboard
import NutritionPlanGenerator from './NutritionPlanGenerator';
import NutritionCalendarView from './NutritionCalendarView';
import NutritionDashboard from './NutritionDashboard';

export default function NutritionScreen() {
  const { userData } = useUserContext();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState('generate-plan');
  const [, setNutritionPlan] = useState(null);
  const [, setIsLoading] = useState(false);

  useEffect(() => {
    const handleMouseMove = (event) => {
      setMousePosition({ x: event.clientX, y: event.clientY });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Obtener información del usuario y rutina actual
  useEffect(() => {
    fetchUserNutritionData();
  }, []);

  const fetchUserNutritionData = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');

      // Perfil nutricional (plan activo + stats 30 días)
      const profileRes = await fetch('/api/nutrition/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (profileRes.ok) {
        const data = await profileRes.json();
        setNutritionPlan(data.currentPlan);

        console.log('📊 Plan nutricional cargado desde BD:', {
          hasPlan: !!data.currentPlan,
          planId: data.currentPlan?.id,
          createdAt: data.currentPlan?.created_at,
          isActive: data.currentPlan?.is_active,
          hasPlanData: !!data.currentPlan?.plan_data,
          dailyPlansCount: data.currentPlan?.plan_data?.daily_plans?.length
        });
      }

    } catch (error) {
      console.error('Error fetching nutrition data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Calcular macros básicos basados en el perfil del usuario
  const calculateBasicMacros = () => {
    if (!userData) {
      console.warn('⚠️ userData no disponible en NutritionScreen');
      return null;
    }

    console.log('📊 Calculando macros con userData:', {
      peso: userData.peso,
      altura: userData.altura,
      edad: userData.edad,
      sexo: userData.sexo,
      nivel_actividad: userData.nivel_actividad,
      objetivo_principal: userData.objetivo_principal
    });

    const weight = parseFloat(userData.peso);
    const height = parseFloat(userData.altura);
    const age = parseInt(userData.edad) || 30;
    const activityLevel = userData.nivel_actividad || 'moderado';
    const goal = userData.objetivo_principal || 'mantener';

    // Validar que tenemos los datos mínimos necesarios
    if (!weight || isNaN(weight) || !height || isNaN(height)) {
      console.warn('⚠️ Faltan datos básicos (peso/altura) para calcular macros:', {
        peso: userData.peso,
        altura: userData.altura,
        weight_parsed: weight,
        height_parsed: height
      });
      return null;
    }

    // Cálculo de TMB (Tasa Metabólica Basal) usando fórmula Mifflin-St Jeor
    const isMale = userData.sexo === 'masculino';
    let bmr;

    if (isMale) {
      bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5;
    } else {
      bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161;
    }

    // Factor de actividad
    const activityFactors = {
      'bajo': 1.2,
      'moderado': 1.55,
      'alto': 1.9
    };

    const tdee = bmr * (activityFactors[activityLevel] || 1.55);

    // Ajustar según objetivo
    let calories = tdee;
    if (goal === 'perder_peso') {
      calories = tdee * 0.85; // Déficit del 15%
    } else if (goal === 'ganar_peso') {
      calories = tdee * 1.15; // Superávit del 15%
    }

    // Distribución de macros según metodología
    const methodology = userData.metodologia_preferida || 'hipertrofia';
    let proteinRatio, carbRatio, fatRatio;

    switch (methodology) {
      case 'crossfit':
        proteinRatio = 0.30;
        carbRatio = 0.40;
        fatRatio = 0.30;
        break;
      case 'powerlifting':
        proteinRatio = 0.25;
        carbRatio = 0.45;
        fatRatio = 0.30;
        break;
      case 'bodybuilding':
      case 'hipertrofia':
        proteinRatio = 0.35;
        carbRatio = 0.40;
        fatRatio = 0.25;
        break;
      default:
        proteinRatio = 0.30;
        carbRatio = 0.40;
        fatRatio = 0.30;
    }

    return {
      calories: Math.round(calories),
      protein: Math.round((calories * proteinRatio) / 4), // 4 kcal por gramo
      carbs: Math.round((calories * carbRatio) / 4),
      fat: Math.round((calories * fatRatio) / 9), // 9 kcal por gramo
      bmr: Math.round(bmr),
      tdee: Math.round(tdee)
    };
  };

  const basicMacros = calculateBasicMacros();

  const nutritionTabs = [
    // ===== SISTEMA V2 (DETERMINISTA) =====
    {
      id: 'generate-plan',
      label: 'Generar Plan',
      icon: TrendingUp,
      description: 'Configura y genera tu plan determinista',
      isV2: true
    },
    {
      id: 'calendar-v2',
      label: 'Calendario V2',
      icon: Calendar,
      description: 'Vista semanal del plan determinista',
      isV2: true
    },
    // ===== CONTROL Y PROGRESO (NUEVO DASHBOARD) =====
    {
      id: 'dashboard',
      label: 'Dashboard Nutrición',
      icon: Target,
      description: 'Mediciones, ICG/IPG, saltos y timing'
    }
  ];

  const cardBase = "bg-neutral-900/70 border border-white/10 ring-1 ring-white/5 shadow-[0_25px_60px_-50px_rgba(0,0,0,0.8)] backdrop-blur-lg";

  return (
    <div className="min-h-screen bg-[#050506] text-white relative overflow-hidden font-body">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[url('/assets/tech-lux/bg-tech-lux-mobile.jpg')] sm:bg-[url('/assets/tech-lux/bg-tech-lux-desktop.jpg')] bg-cover bg-center opacity-80 sm:opacity-70" />
        <div className="absolute inset-0 bg-[url('/assets/tech-lux/texture-tech-lux-tile.jpg')] bg-repeat opacity-20 mix-blend-soft-light" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black/80 sm:from-black/40 sm:via-black/60 sm:to-black" />
        <div className="absolute -top-20 right-0 h-56 w-56 bg-yellow-400/10 blur-[140px]" />
        <div className="absolute top-1/3 -left-16 h-64 w-64 bg-yellow-400/10 blur-[160px]" />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            background: `radial-gradient(600px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(250, 204, 21, 0.18), transparent 60%)`
          }}
        />
      </div>
      <div className="relative z-10 container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-yellow-200/80 mb-2">Nutrición</p>
              <h1 className="text-4xl font-semibold font-urbanist text-white mb-2">
                Nutrición Deportiva
              </h1>
              <p className="text-gray-200/80 text-lg">
                Plan nutricional personalizado para tu entrenamiento
              </p>
            </div>
            <div className="flex items-center gap-4">
              {basicMacros && (
                <Card className={`${cardBase} border-l-2 border-l-yellow-400/30`}>
                  <CardContent className="p-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-yellow-300">
                        {basicMacros.calories}
                      </p>
                      <p className="text-sm text-gray-300/80">kcal/día</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Tabs Navigation */}
          <div className="flex flex-wrap gap-2 mb-6">
            {nutritionTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black border-transparent shadow-[0_12px_30px_-18px_rgba(250,204,21,0.75)]'
                      : 'bg-white/5 border-white/10 text-gray-200/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon size={18} />
                  <span className="hidden sm:block">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {/* ===== SISTEMA V2 (DETERMINISTA) ===== */}
          {activeTab === 'generate-plan' && (
            <NutritionPlanGenerator
              onPlanGenerated={(data) => {
                console.log('✅ Plan V2 generado:', data);
                setNutritionPlan(data.plan);
                // Cambiar automáticamente a la vista de calendario
                setActiveTab('calendar-v2');
              }}
            />
          )}

          {activeTab === 'calendar-v2' && (
            <NutritionCalendarView />
          )}

          {/* ===== DASHBOARD DE CONTROL ===== */}
          {activeTab === 'dashboard' && (
            <NutritionDashboard />
          )}
        </div>
      </div>
    </div>
  );
}

