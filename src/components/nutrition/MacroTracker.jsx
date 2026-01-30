import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { 
  Activity,
  Plus,
  Minus,
  Target,
  TrendingUp,
  Calendar,
  Award,
  Zap
} from 'lucide-react';

export default function MacroTracker({ targetMacros, userStats }) {
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
  const [dailyLog, setDailyLog] = useState({
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    meals: []
  });
  const [weekStats, setWeekStats] = useState({
    daysCompleted: 0,
    avgCalories: 0,
    consistency: 0
  });

  // Cargar datos del día actual
  useEffect(() => {
    loadDailyData();
    loadWeekStats();
  }, [currentDate]);

  const loadDailyData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/nutrition/daily/${currentDate}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setDailyLog(data.dailyLog || { calories: 0, protein: 0, carbs: 0, fat: 0, meals: [] });
      }
    } catch (error) {
      console.error('Error loading daily data:', error);
    }
  };

  const loadWeekStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/nutrition/week-stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setWeekStats(data.weekStats);
      }
    } catch (error) {
      console.error('Error loading week stats:', error);
    }
  };

  const saveDailyData = async (newLog) => {
    try {
      const token = localStorage.getItem('token');
      await fetch('/api/nutrition/daily', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          date: currentDate,
          dailyLog: newLog
        })
      });
    } catch (error) {
      console.error('Error saving daily data:', error);
    }
  };

  const addQuickMacros = (calories, protein, carbs, fat, name = 'Entrada manual') => {
    const newLog = {
      ...dailyLog,
      calories: dailyLog.calories + calories,
      protein: dailyLog.protein + protein,
      carbs: dailyLog.carbs + carbs,
      fat: dailyLog.fat + fat,
      meals: [...dailyLog.meals, {
        id: Date.now(),
        name,
        calories,
        protein,
        carbs,
        fat,
        time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
      }]
    };
    
    setDailyLog(newLog);
    saveDailyData(newLog);
  };

  const removeMeal = (mealId) => {
    const meal = dailyLog.meals.find(m => m.id === mealId);
    if (!meal) return;

    const newLog = {
      ...dailyLog,
      calories: Math.max(0, dailyLog.calories - meal.calories),
      protein: Math.max(0, dailyLog.protein - meal.protein),
      carbs: Math.max(0, dailyLog.carbs - meal.carbs),
      fat: Math.max(0, dailyLog.fat - meal.fat),
      meals: dailyLog.meals.filter(m => m.id !== mealId)
    };
    
    setDailyLog(newLog);
    saveDailyData(newLog);
  };

  const calculateProgress = (current, target) => {
    return target > 0 ? Math.min(100, (current / target) * 100) : 0;
  };

  const getProgressColor = (percentage) => {
    if (percentage >= 90 && percentage <= 110) return 'bg-green-500';
    if (percentage >= 80 && percentage <= 120) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const quickAddOptions = [
    { name: 'Proteína (30g)', calories: 120, protein: 30, carbs: 0, fat: 0 },
    { name: 'Carbohidrato (50g)', calories: 200, protein: 0, carbs: 50, fat: 0 },
    { name: 'Grasa (20g)', calories: 180, protein: 0, carbs: 0, fat: 20 },
    { name: 'Snack mixto', calories: 150, protein: 8, carbs: 15, fat: 8 },
  ];

  const caloriesProgress = calculateProgress(dailyLog.calories, targetMacros?.calories || 2000);
  const proteinProgress = calculateProgress(dailyLog.protein, targetMacros?.protein || 150);
  const carbsProgress = calculateProgress(dailyLog.carbs, targetMacros?.carbs || 200);
  const fatProgress = calculateProgress(dailyLog.fat, targetMacros?.fat || 65);

  return (
    <div className="space-y-6">
      {/* Header con fecha y estadísticas semanales */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-white font-urbanist flex items-center gap-2">
              <Activity className="text-yellow-400" size={24} />
              Seguimiento Diario
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-center gap-2">
                <Calendar className="text-gray-400" size={16} />
                <Input
                  type="date"
                  value={currentDate}
                  onChange={(e) => setCurrentDate(e.target.value)}
                  className="bg-white/5 border-white/10 text-white w-auto"
                />
              </div>
              <div className="text-sm text-gray-300">
                {new Date(currentDate).toLocaleDateString('es-ES', { 
                  weekday: 'long', 
                  day: 'numeric', 
                  month: 'long' 
                })}
              </div>
            </div>

            {/* Progress bars principales */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Calorías */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-white font-medium">Calorías</span>
                  <span className="text-sm text-gray-300">
                    {dailyLog.calories} / {targetMacros?.calories || 2000}
                  </span>
                </div>
                <Progress 
                  value={caloriesProgress} 
                  className="h-3"
                />
                <div className="text-xs text-center text-gray-400">
                  {caloriesProgress.toFixed(0)}% del objetivo
                </div>
              </div>

              {/* Proteína */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-white font-medium">Proteína</span>
                  <span className="text-sm text-gray-300">
                    {dailyLog.protein}g / {targetMacros?.protein || 150}g
                  </span>
                </div>
                <Progress 
                  value={proteinProgress} 
                  className="h-3 [&>div]:bg-red-500"
                />
                <div className="text-xs text-center text-gray-400">
                  {proteinProgress.toFixed(0)}% del objetivo
                </div>
              </div>

              {/* Carbohidratos */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-white font-medium">Carbohidratos</span>
                  <span className="text-sm text-gray-300">
                    {dailyLog.carbs}g / {targetMacros?.carbs || 200}g
                  </span>
                </div>
                <Progress 
                  value={carbsProgress} 
                  className="h-3 [&>div]:bg-green-500"
                />
                <div className="text-xs text-center text-gray-400">
                  {carbsProgress.toFixed(0)}% del objetivo
                </div>
              </div>

              {/* Grasas */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-white font-medium">Grasas</span>
                  <span className="text-sm text-gray-300">
                    {dailyLog.fat}g / {targetMacros?.fat || 65}g
                  </span>
                </div>
                <Progress 
                  value={fatProgress} 
                  className="h-3 [&>div]:bg-yellow-500"
                />
                <div className="text-xs text-center text-gray-400">
                  {fatProgress.toFixed(0)}% del objetivo
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats semanales */}
        <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5">
          <CardHeader>
            <CardTitle className="text-white font-urbanist flex items-center gap-2">
              <TrendingUp className="text-yellow-400" size={20} />
              Esta Semana
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400">
                {weekStats.daysCompleted}/7
              </div>
              <div className="text-sm text-gray-300">Días completados</div>
            </div>

            <div className="text-center">
              <div className="text-lg font-bold text-blue-400">
                {weekStats.avgCalories}
              </div>
              <div className="text-sm text-gray-300">Promedio kcal/día</div>
            </div>

            <div className="text-center">
              <div className="flex items-center justify-center gap-1">
                <Award className="text-green-400" size={16} />
                <span className="text-lg font-bold text-green-400">
                  {weekStats.consistency}%
                </span>
              </div>
              <div className="text-sm text-gray-300">Consistencia</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Añadir comidas rápido */}
      <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5">
        <CardHeader>
          <CardTitle className="text-white font-urbanist flex items-center gap-2">
            <Plus className="text-yellow-400" size={20} />
            Añadir Rápido
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {quickAddOptions.map((option, index) => (
              <Button
                key={index}
                variant="outline"
                className="border-white/10 bg-white/5 text-white hover:bg-white/10 h-auto p-3"
                onClick={() => addQuickMacros(option.calories, option.protein, option.carbs, option.fat, option.name)}
              >
                <div className="text-center">
                  <div className="font-medium text-sm">{option.name}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {option.calories} kcal
                  </div>
                  <div className="text-xs text-gray-400">
                    P:{option.protein} C:{option.carbs} G:{option.fat}
                  </div>
                </div>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Registro de comidas del día */}
      <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5">
        <CardHeader>
          <CardTitle className="text-white font-urbanist flex items-center gap-2">
            <Target className="text-yellow-400" size={20} />
            Registro del Día
          </CardTitle>
        </CardHeader>
        <CardContent>
          {dailyLog.meals.length === 0 ? (
            <div className="text-center py-8">
              <Zap className="mx-auto text-gray-400 mb-3" size={32} />
              <p className="text-gray-400">No has registrado ninguna comida hoy</p>
              <p className="text-sm text-gray-500">Usa los botones de arriba para añadir comidas rápido</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dailyLog.meals.map(meal => (
                <div 
                  key={meal.id}
                  className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-white">{meal.name}</h4>
                      <span className="text-xs text-gray-400">{meal.time}</span>
                    </div>
                    <div className="text-sm text-gray-300 mt-1">
                      {meal.calories} kcal • P: {meal.protein}g • C: {meal.carbs}g • G: {meal.fat}g
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeMeal(meal.id)}
                    className="border-white/10 text-red-300 hover:bg-red-500/10"
                  >
                    <Minus size={14} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Gráfico circular de macros */}
      <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5">
        <CardHeader>
          <CardTitle className="text-white font-urbanist">Distribución de Macronutrientes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Círculo de progreso simulado */}
            <div className="flex items-center justify-center">
              <div className="relative w-48 h-48">
                <svg className="w-48 h-48 transform -rotate-90" viewBox="0 0 100 100">
                  {/* Fondo */}
                  <circle
                    cx="50" cy="50" r="40"
                    fill="none" stroke="#374151" strokeWidth="8"
                  />
                  
                  {/* Calorías */}
                  <circle
                    cx="50" cy="50" r="40"
                    fill="none" stroke="#3B82F6" strokeWidth="8"
                    strokeDasharray={`${caloriesProgress * 2.51} 251`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white">
                      {caloriesProgress.toFixed(0)}%
                    </div>
                    <div className="text-sm text-gray-400">Calorías</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Leyenda */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 bg-red-500 rounded"></div>
                  <span className="text-white">Proteína</span>
                </div>
                <span className="text-gray-300">{dailyLog.protein}g ({((dailyLog.protein * 4 / Math.max(dailyLog.calories, 1)) * 100).toFixed(0)}%)</span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 bg-green-500 rounded"></div>
                  <span className="text-white">Carbohidratos</span>
                </div>
                <span className="text-gray-300">{dailyLog.carbs}g ({((dailyLog.carbs * 4 / Math.max(dailyLog.calories, 1)) * 100).toFixed(0)}%)</span>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                  <span className="text-white">Grasas</span>
                </div>
                <span className="text-gray-300">{dailyLog.fat}g ({((dailyLog.fat * 9 / Math.max(dailyLog.calories, 1)) * 100).toFixed(0)}%)</span>
              </div>

              <div className="pt-3 border-t border-white/10">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Restantes:</span>
                  <span className="text-white">
                    {Math.max(0, (targetMacros?.calories || 2000) - dailyLog.calories)} kcal
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
