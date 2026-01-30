import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserContext } from '@/contexts/UserContext';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Calendar,
  Utensils,
  Target,
  Zap,
  ShoppingCart,
  TrendingUp,
  Activity,
  Apple
} from 'lucide-react';

// Importar componentes individuales (Legacy)
import NutritionCalendar from './NutritionCalendar';
import FoodDatabase from './FoodDatabase';
import MacroTracker from './MacroTracker';
import SupplementsSection from './SupplementsSection';
import NutritionAI from './NutritionAI';
import MealPlanner from './MealPlanner';
import ShoppingList from './ShoppingList';

// Importar componentes V2 (Sistema Determinista)

import NutritionPlanGenerator from './NutritionPlanGenerator';
import NutritionCalendarView from './NutritionCalendarView';

export default function NutritionScreen() {
  const { currentUser, user } = useAuth();
  const { userData } = useUserContext();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState('overview');
  const [nutritionPlan, setNutritionPlan] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [weekStats, setWeekStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

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
        setUserStats(data.stats);
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

      // Estadísticas de la semana (consistencia, calorías medias)
      const weekRes = await fetch('/api/nutrition/week-stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (weekRes.ok) {
        const data = await weekRes.json();
        setWeekStats(data.weekStats);
      }

    } catch (error) {
      console.error('Error fetching nutrition data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelPlan = async () => {
    if (!nutritionPlan?.id) return;

    const confirmed = window.confirm(
      '¿Estás seguro de que quieres cancelar tu plan nutricional actual? Esta acción no se puede deshacer.'
    );

    if (!confirmed) return;

    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');

      const response = await fetch(`/api/nutrition/plan/${nutritionPlan.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        console.log('✅ Plan nutricional cancelado exitosamente');
        setNutritionPlan(null);
        await fetchUserNutritionData();
      } else {
        const error = await response.json();
        console.error('❌ Error al cancelar plan:', error);
        alert('Error al cancelar el plan nutricional. Por favor, intenta de nuevo.');
      }
    } catch (error) {
      console.error('❌ Error al cancelar plan:', error);
      alert('Error de conexión. Por favor, intenta de nuevo.');
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

  // Derivados para mostrar g/kg y % ajuste
  const pesoKg = parseFloat(userData?.peso || 0);
  const proteinPerKg = pesoKg && basicMacros ? (basicMacros.protein / pesoKg).toFixed(2) : null;
  const carbsPerKg = pesoKg && basicMacros ? (basicMacros.carbs / pesoKg).toFixed(2) : null;
  const fatPerKg = pesoKg && basicMacros ? (basicMacros.fat / pesoKg).toFixed(2) : null;
  const deficitPct = basicMacros && basicMacros.tdee ? Math.round(((basicMacros.calories - basicMacros.tdee) / basicMacros.tdee) * 100) : null;

  // Resumen de plan (soporta plan de BD y plan recién generado)
  const planSummary = (nutritionPlan?.plan_data?.plan_summary) || (nutritionPlan?.plan_summary) || null;

  // Validación rápida de perfil para avisos
  const missingProfile = [];
  if (!userData?.peso) missingProfile.push('peso');
  if (!userData?.altura) missingProfile.push('altura');
  if (!userData?.edad) missingProfile.push('edad');

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
    // ===== SISTEMA LEGACY (IA COMPLETA) =====
    {
      id: 'overview',
      label: 'Resumen',
      icon: Target,
      description: 'Vista general de tu nutrición'
    },
    {
      id: 'calendar',
      label: 'Calendario Legacy',
      icon: Calendar,
      description: 'Plan semanal de comidas (sistema anterior)'
    },
    {
      id: 'planner',
      label: 'Planificador',
      icon: Utensils,
      description: 'Crear planes de comidas'
    },
    {
      id: 'shopping',
      label: 'Lista Compras',
      icon: ShoppingCart,
      description: 'Lista de compras del plan'
    },
    {
      id: 'tracker',
      label: 'Macros',
      icon: Activity,
      description: 'Seguimiento de macronutrientes'
    },
    {
      id: 'database',
      label: 'Alimentos',
      icon: Apple,
      description: 'Base de datos nutricional'
    },
    {
      id: 'supplements',
      label: 'Suplementos',
      icon: Zap,
      description: 'Recomendaciones y compras'
    },
    {
      id: 'ai',
      label: 'IA Nutricional',
      icon: TrendingUp,
      description: 'Asistente inteligente'
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
          {activeTab === 'overview' && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Macros Overview */}
              {basicMacros ? (
                <Card className={`${cardBase} border-l-2 border-l-yellow-400/30 lg:col-span-2`}>
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2 font-urbanist">
                      <Target className="text-yellow-400" size={24} />
                      Objetivos Nutricionales
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-4 bg-white/5 rounded-lg border border-white/10 border-l-2 border-l-sky-400/40">
                        <p className="text-2xl font-bold text-sky-300">
                          {basicMacros.calories}
                        </p>
                        <p className="text-sm text-gray-300">Calorías</p>
                      </div>
                      <div className="text-center p-4 bg-white/5 rounded-lg border border-white/10 border-l-2 border-l-red-400/40">
                        <p className="text-2xl font-bold text-red-300">
                          {basicMacros.protein}g
                        </p>
                        <p className="text-sm text-gray-300">Proteína</p>
                      </div>
                      <div className="text-center p-4 bg-white/5 rounded-lg border border-white/10 border-l-2 border-l-emerald-400/40">
                        <p className="text-2xl font-bold text-emerald-300">
                          {basicMacros.carbs}g
                        </p>
                        <p className="text-sm text-gray-300">Carbohidratos</p>
                      </div>
                      <div className="text-center p-4 bg-white/5 rounded-lg border border-white/10 border-l-2 border-l-yellow-400/40">
                        <p className="text-2xl font-bold text-yellow-300">
                          {basicMacros.fat}g
                        </p>
                        <p className="text-sm text-gray-300">Grasas</p>
                      </div>
                    </div>
                    {missingProfile.length > 0 && (
                      <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                        <p className="text-sm text-yellow-300">
                          ⚠️ Completa tu perfil ({missingProfile.join(', ')}) para mejorar la precisión de los cálculos.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className={`${cardBase} border-l-2 border-l-yellow-400/30 lg:col-span-2`}>
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2 font-urbanist">
                      <Target className="text-yellow-400" size={24} />
                      Objetivos Nutricionales
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-6 text-center bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                      <p className="text-yellow-300 mb-3">
                        ⚠️ No se pueden calcular los objetivos nutricionales
                      </p>
                      <p className="text-sm text-gray-300 mb-4">
                        Completa tu perfil con peso, altura, edad y sexo para obtener recomendaciones personalizadas.
                      </p>
                      <Button
                        onClick={() => window.location.href = '/profile'}
                        className="bg-yellow-400 hover:bg-yellow-500 text-black"
                      >
                        Completar Perfil
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Quick Actions */}
              <Card className={`${cardBase} border-l-2 border-l-sky-400/30`}>
                <CardHeader>
                  <CardTitle className="text-white font-urbanist">Acciones Rápidas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button
                    onClick={() => setActiveTab('ai')}
                    className="w-full bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]"
                  >
                    <TrendingUp size={16} className="mr-2" />
                    Generar Plan con IA
                  </Button>
                  <Button
                    onClick={() => setActiveTab('planner')}
                    variant="outline"
                    className="w-full border-white/10 bg-white/5 text-white hover:bg-white/10"
                  >
                    <Utensils size={16} className="mr-2" />
                    Planificar Comidas
                  </Button>
                  <Button
                    onClick={() => setActiveTab('supplements')}
                    variant="outline"
                    className="w-full border-white/10 bg-white/5 text-white hover:bg-white/10"
                  >
                    <ShoppingCart size={16} className="mr-2" />
                    Ver Suplementos
                  </Button>
                  {nutritionPlan && (
                    <Button
                      onClick={handleCancelPlan}
                      variant="outline"
                      className="w-full border-red-500/40 text-red-300 hover:bg-red-500/10 hover:text-red-200"
                    >
                      <Activity size={16} className="mr-2" />
                      Cancelar Plan Actual
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>

              {/* Métricas avanzadas: BMR/TDEE, g/kg y semana */}
              {basicMacros && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* BMR/TDEE/Ajuste */}
                  <Card className={`${cardBase} border-l-2 border-l-sky-400/30`}>
                    <CardHeader>
                      <CardTitle className="text-white font-urbanist">Gasto Energético</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-xl font-bold text-sky-300">{basicMacros.bmr}</p>
                          <p className="text-xs text-gray-300">TMB</p>
                        </div>
                        <div>
                          <p className="text-xl font-bold text-emerald-300">{basicMacros.tdee}</p>
                          <p className="text-xs text-gray-300">TDEE</p>
                        </div>
                        <div>
                          <p className={`text-xl font-bold ${deficitPct && deficitPct < 0 ? 'text-red-300' : 'text-yellow-300'}`}>{deficitPct} %</p>
                          <p className="text-xs text-gray-300">Ajuste</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* g/kg */}
                  <Card className={`${cardBase} border-l-2 border-l-emerald-400/30`}>
                    <CardHeader>
                      <CardTitle className="text-white font-urbanist">Objetivos (g/kg)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {pesoKg ? (
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <p className="text-xl font-bold text-red-300">{proteinPerKg}</p>
                            <p className="text-xs text-gray-300">Proteína</p>
                          </div>
                          <div>
                            <p className="text-xl font-bold text-emerald-300">{carbsPerKg}</p>
                            <p className="text-xs text-gray-300">Carbohidratos</p>
                          </div>
                          <div>
                            <p className="text-xl font-bold text-yellow-300">{fatPerKg}</p>
                            <p className="text-xs text-gray-300">Grasas</p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-300">Completa tu peso para ver g/kg</div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Semana */}
                  <Card className={`${cardBase} border-l-2 border-l-yellow-400/30`}>
                    <CardHeader>
                      <CardTitle className="text-white font-urbanist">Semana (últimos 7 días)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {weekStats ? (
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <p className="text-xl font-bold text-sky-300">{weekStats.daysCompleted}</p>
                            <p className="text-xs text-gray-300">Días completados</p>
                          </div>
                          <div>
                            <p className="text-xl font-bold text-emerald-300">{weekStats.avgCalories}</p>
                            <p className="text-xs text-gray-300">kcal medias</p>
                          </div>
                          <div>
                            <p className="text-xl font-bold text-yellow-300">{weekStats.consistency}%</p>
                            <p className="text-xs text-gray-300">Consistencia</p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-300">Sin datos de la semana aún</div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}


              {/* Sin plan activo */}
              {!planSummary && (
                <Card className={`${cardBase} border-l-2 border-l-yellow-400/30`}>
                  <CardHeader>
                    <CardTitle className="text-white font-urbanist">Aún no tienes un plan nutricional activo</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-gray-300 mb-3">Genera un plan personalizado con IA según tu perfil y objetivos.</p>
                    <Button onClick={() => setActiveTab('ai')} className="bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-500 text-black hover:from-yellow-200 hover:via-yellow-300 hover:to-amber-400 shadow-[0_12px_30px_-18px_rgba(250,204,21,0.8)]">
                      Generar Plan con IA
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Plan activo */}
              {planSummary && (
                <Card className={`${cardBase} border-l-2 border-l-yellow-400/30`}>
                  <CardHeader>
                    <CardTitle className="text-white font-urbanist">Plan Nutricional Activo</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                      <div>
                        <p className="text-lg font-bold text-yellow-300">{planSummary.duration_days}</p>
                        <p className="text-xs text-gray-300">Días</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-sky-300">{planSummary.target_calories}</p>
                        <p className="text-xs text-gray-300">kcal/día</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-red-300">{planSummary.target_macros?.protein}g</p>
                        <p className="text-xs text-gray-300">Proteína</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-emerald-300">{planSummary.target_macros?.carbs}g</p>
                        <p className="text-xs text-gray-300">Carbohidratos</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-yellow-300">{planSummary.meals_per_day}</p>
                        <p className="text-xs text-gray-300">Comidas/día</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-4">
                      <Button className="bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white" onClick={() => setActiveTab('calendar')}>
                        Ver en Calendario
                      </Button>
                      <Button variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10" onClick={() => setActiveTab('ai')}>
                        Ajustar con IA
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>

          )}

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

          {/* ===== SISTEMA LEGACY (IA COMPLETA) ===== */}
          {activeTab === 'calendar' && (
            <NutritionCalendar
              nutritionPlan={nutritionPlan}
              userMacros={basicMacros}
              onPlanUpdate={setNutritionPlan}
            />
          )}

          {activeTab === 'planner' && (
            <MealPlanner
              userMacros={basicMacros}
              userData={userData}
              onPlanCreated={setNutritionPlan}
              initialPlan={nutritionPlan?.plan_data ?? nutritionPlan}
            />
          )}

          {activeTab === 'shopping' && (
            <ShoppingList
              nutritionPlan={nutritionPlan}
            />
          )}

          {activeTab === 'tracker' && (
            <MacroTracker
              targetMacros={basicMacros}
              userStats={userStats}
            />
          )}

          {activeTab === 'database' && (
            <FoodDatabase />
          )}

          {activeTab === 'supplements' && (
            <SupplementsSection
              userData={userData}
              userMacros={basicMacros}
            />
          )}

          {activeTab === 'ai' && (
            <NutritionAI
              userData={userData}
              currentRoutine={null} // TODO: Obtener rutina actual
              userMacros={basicMacros}
              onPlanGenerated={setNutritionPlan}
            />
          )}
        </div>
      </div>
    </div>
  );
}

