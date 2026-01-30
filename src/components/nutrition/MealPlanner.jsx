import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Utensils,
  Plus,
  Clock,
  Target,
  ChefHat,
  Save,
  Copy,
  Trash2,
  Search
} from 'lucide-react';

export default function MealPlanner({ userMacros, userData, onPlanCreated, initialPlan }) {
  // Templates generados por IA desde el plan (si existe)
  const [mealTemplates, setMealTemplates] = useState([]);

  useEffect(() => {
    if (!initialPlan?.daily_plans) return;
    try {
      const allMeals = [];
      initialPlan.daily_plans.forEach((day) => {
        (day.meals || []).forEach((meal) => {
          const name = meal.name || meal.title || meal.meal_name || 'Comida';
          const nutrition = meal.nutrition || {};
          const template = {
            id: `${name}-${Math.random().toString(36).slice(2, 8)}`,
            name,
            category: (meal.meal_type || 'almuerzo').toLowerCase(),
            calories: Math.round(nutrition.calories || 0),
            protein: Math.round(nutrition.protein || 0),
            carbs: Math.round(nutrition.carbs || 0),
            fat: Math.round(nutrition.fat || 0),
            ingredients: (meal.ingredients || [])
              .map((i) => (typeof i === 'string' ? i : [i?.food, i?.amount].filter(Boolean).join(' ')))
              .filter(Boolean),
            preparation: meal.time_minutes ? `${meal.time_minutes} min` : (meal.preparation || 'Preparación'),
            difficulty: meal.difficulty || 'Media',
          };
          allMeals.push(template);
        });
      });

      const unique = [];
      const seen = new Set();
      for (const m of allMeals) {
        const key = `${m.name}|${m.calories}|${m.protein}|${m.carbs}|${m.fat}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(m);
        }
      }
      setMealTemplates(unique);
    } catch (e) {
      console.error('Error generando templates desde initialPlan', e);
    }
  }, [initialPlan]);

  const [selectedDay, setSelectedDay] = useState('lunes');
  const [dayMeals, setDayMeals] = useState({
    desayuno: null,
    almuerzo: null,
    merienda: null,
    cena: null
  });
  const [customMeal, setCustomMeal] = useState({
    name: '',
    calories: '',
    protein: '',
    carbs: '',
    fat: '',
    ingredients: [],
    newIngredient: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showCustomMeal, setShowCustomMeal] = useState(false);

  const daysOfWeek = [
    'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'
  ];

  const categories = [
    { id: 'all', name: 'Todas' },
    { id: 'desayuno', name: 'Desayuno' },
    { id: 'almuerzo', name: 'Almuerzo' },
    { id: 'snack', name: 'Snacks' },
    { id: 'cena', name: 'Cena' }
  ];

  const filteredTemplates = mealTemplates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         template.ingredients.some(ing => ing.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const addMealToDay = (mealType, meal) => {
    // Asegurar que preparation y difficulty sean strings
    const sanitizedMeal = {
      ...meal,
      preparation: typeof meal.preparation === 'string'
        ? meal.preparation
        : (meal.preparation?.steps ? `${meal.preparation.steps.length} pasos` : 'Preparación'),
      difficulty: typeof meal.difficulty === 'string'
        ? meal.difficulty
        : (meal.difficulty?.level || 'Media')
    };

    setDayMeals(prev => ({
      ...prev,
      [mealType]: sanitizedMeal
    }));
  };

  const removeMealFromDay = (mealType) => {
    setDayMeals(prev => ({
      ...prev,
      [mealType]: null
    }));
  };

  const calculateDayTotals = () => {
    let totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    Object.values(dayMeals).forEach(meal => {
      if (meal) {
        totals.calories += meal.calories;
        totals.protein += meal.protein;
        totals.carbs += meal.carbs;
        totals.fat += meal.fat;
      }
    });
    return totals;
  };

  const handleCustomMealSubmit = () => {
    if (!customMeal.name.trim()) return;

    const newMeal = {
      id: Date.now(),
      name: customMeal.name,
      category: 'custom',
      calories: parseInt(customMeal.calories) || 0,
      protein: parseInt(customMeal.protein) || 0,
      carbs: parseInt(customMeal.carbs) || 0,
      fat: parseInt(customMeal.fat) || 0,
      ingredients: customMeal.ingredients,
      preparation: 'Personalizado',
      difficulty: 'Personalizado'
    };

    // Resetear formulario
    setCustomMeal({
      name: '',
      calories: '',
      protein: '',
      carbs: '',
      fat: '',
      ingredients: [],
      newIngredient: ''
    });
    setShowCustomMeal(false);
    
    // TODO: Agregar a la lista de templates disponibles o usar directamente
  };

  const addIngredient = () => {
    if (customMeal.newIngredient.trim()) {
      setCustomMeal(prev => ({
        ...prev,
        ingredients: [...prev.ingredients, prev.newIngredient.trim()],
        newIngredient: ''
      }));
    }
  };

  const removeIngredient = (index) => {
    setCustomMeal(prev => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== index)
    }));
  };

  const dayTotals = calculateDayTotals();
  const targetCalories = userMacros?.calories || 2000;
  const targetProtein = userMacros?.protein || 150;
  const targetCarbs = userMacros?.carbs || 200;
  const targetFat = userMacros?.fat || 65;

  return (
    <div className="space-y-6">
      {/* Header con selección de día */}
      <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Utensils className="text-yellow-400" size={24} />
            Planificador de Comidas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            {daysOfWeek.map(day => (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  selectedDay === day
                    ? 'bg-yellow-400 text-black'
                    : 'bg-white/5 text-gray-200/80 hover:bg-white/10'
                }`}
              >
                {day.charAt(0).toUpperCase() + day.slice(1)}
              </button>
            ))}
          </div>

          {/* Resumen del día */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-white/5 rounded-lg">
            <div className="text-center">
              <div className="text-lg font-bold text-blue-400">
                {dayTotals.calories} / {targetCalories}
              </div>
              <div className="text-xs text-gray-300">Calorías</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-400">
                {dayTotals.protein} / {targetProtein}
              </div>
              <div className="text-xs text-gray-300">Proteína (g)</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-400">
                {dayTotals.carbs} / {targetCarbs}
              </div>
              <div className="text-xs text-gray-300">Carbohidratos (g)</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-yellow-400">
                {dayTotals.fat} / {targetFat}
              </div>
              <div className="text-xs text-gray-300">Grasas (g)</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Plan del día */}
        <div className="space-y-4">
          <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5">
            <CardHeader>
              <CardTitle className="text-white flex items-center justify-between">
                <span>Plan del {selectedDay.charAt(0).toUpperCase() + selectedDay.slice(1)}</span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/10 text-white hover:bg-white/10"
                  >
                    <Save size={14} className="mr-1" />
                    Guardar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/10 text-white hover:bg-white/10"
                  >
                    <Copy size={14} className="mr-1" />
                    Copiar
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(dayMeals).map(([mealType, meal]) => (
                  <div key={mealType} className="border border-white/10 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-white capitalize">
                        {mealType}
                      </h4>
                      {meal && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => removeMealFromDay(mealType)}
                          className="border-red-600 text-red-400 hover:bg-red-900/20"
                        >
                          <Trash2 size={12} />
                        </Button>
                      )}
                    </div>

                    {meal ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-white">{meal.name}</span>
                          <Badge className="bg-blue-600 text-white">
                            {meal.calories} kcal
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs text-gray-300">
                          <span>P: {meal.protein}g</span>
                          <span>C: {meal.carbs}g</span>
                          <span>G: {meal.fat}g</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <Clock size={12} />
                          {meal.preparation}
                          <ChefHat size={12} />
                          {meal.difficulty}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4 text-gray-400 border-2 border-dashed border-white/10 rounded-lg">
                        <Plus className="mx-auto mb-2" size={20} />
                        <p className="text-sm">Selecciona una comida</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Templates de comidas */}
        <div className="space-y-4">
          <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5">
            <CardHeader>
              <CardTitle className="text-white flex items-center justify-between">
                <span>Templates de Comidas</span>
                <Button
                  size="sm"
                  onClick={() => setShowCustomMeal(!showCustomMeal)}
                  className="bg-yellow-400 hover:bg-yellow-500 text-black"
                >
                  <Plus size={14} className="mr-1" />
                  Crear Custom
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Filtros */}
              <div className="space-y-3 mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-3 text-gray-400" size={16} />
                  <Input
                    placeholder="Buscar comidas..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-white/5 border-white/10 text-white"
                  />
                </div>

                <div className="flex gap-2 flex-wrap">
                  {categories.map(category => (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className={`px-3 py-1 rounded-lg text-sm transition-all ${
                        selectedCategory === category.id
                          ? 'bg-yellow-400 text-black'
                          : 'bg-white/5 text-gray-200/80 hover:bg-white/10'
                      }`}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lista de templates */}
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {filteredTemplates.map(template => (
                  <div
                    key={template.id}
                    className="p-3 border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h5 className="font-medium text-white text-sm">{template.name}</h5>
                        <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                          <Clock size={10} />
                          {template.preparation}
                          <ChefHat size={10} />
                          {template.difficulty}
                        </div>
                      </div>
                      <Badge className="bg-blue-600 text-white text-xs">
                        {template.calories} kcal
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs text-gray-300 mb-3">
                      <span>P: {template.protein}g</span>
                      <span>C: {template.carbs}g</span>
                      <span>G: {template.fat}g</span>
                    </div>

                    <div className="flex gap-2 text-xs">
                      <Button
                        size="sm"
                        onClick={() => addMealToDay('desayuno', template)}
                        className="bg-orange-600 hover:bg-orange-700 text-white text-xs px-2 py-1"
                      >
                        Desayuno
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => addMealToDay('almuerzo', template)}
                        className="bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-1"
                      >
                        Almuerzo
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => addMealToDay('merienda', template)}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1"
                      >
                        Merienda
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => addMealToDay('cena', template)}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-xs px-2 py-1"
                      >
                        Cena
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modal de comida personalizada */}
      {showCustomMeal && (
        <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5">
          <CardHeader>
            <CardTitle className="text-white flex items-center justify-between">
              <span>Crear Comida Personalizada</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowCustomMeal(false)}
                className="border-white/10 text-white hover:bg-white/10"
              >
                Cerrar
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="text-white font-medium mb-2 block">Nombre</label>
                  <Input
                    value={customMeal.name}
                    onChange={(e) => setCustomMeal(prev => ({...prev, name: e.target.value}))}
                    placeholder="Ej: Mi desayuno especial"
                    className="bg-white/5 border-white/10 text-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-white font-medium mb-2 block">Calorías</label>
                    <Input
                      type="number"
                      value={customMeal.calories}
                      onChange={(e) => setCustomMeal(prev => ({...prev, calories: e.target.value}))}
                      className="bg-white/5 border-white/10 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-white font-medium mb-2 block">Proteína (g)</label>
                    <Input
                      type="number"
                      value={customMeal.protein}
                      onChange={(e) => setCustomMeal(prev => ({...prev, protein: e.target.value}))}
                      className="bg-white/5 border-white/10 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-white font-medium mb-2 block">Carbohidratos (g)</label>
                    <Input
                      type="number"
                      value={customMeal.carbs}
                      onChange={(e) => setCustomMeal(prev => ({...prev, carbs: e.target.value}))}
                      className="bg-white/5 border-white/10 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-white font-medium mb-2 block">Grasas (g)</label>
                    <Input
                      type="number"
                      value={customMeal.fat}
                      onChange={(e) => setCustomMeal(prev => ({...prev, fat: e.target.value}))}
                      className="bg-white/5 border-white/10 text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-white font-medium mb-2 block">Ingredientes</label>
                  <div className="flex gap-2 mb-2">
                    <Input
                      value={customMeal.newIngredient}
                      onChange={(e) => setCustomMeal(prev => ({...prev, newIngredient: e.target.value}))}
                      placeholder="Agregar ingrediente"
                      className="bg-white/5 border-white/10 text-white"
                      onKeyPress={(e) => e.key === 'Enter' && addIngredient()}
                    />
                    <Button
                      size="sm"
                      onClick={addIngredient}
                      className="bg-yellow-400 hover:bg-yellow-500 text-black"
                    >
                      <Plus size={14} />
                    </Button>
                  </div>
                  
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {customMeal.ingredients.map((ingredient, index) => (
                      <div key={index} className="flex items-center justify-between bg-white/5 p-2 rounded">
                        <span className="text-white text-sm">{ingredient}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => removeIngredient(index)}
                          className="border-red-600 text-red-400 hover:bg-red-900/20 px-2 py-1"
                        >
                          <Trash2 size={10} />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={handleCustomMealSubmit}
                  className="w-full bg-yellow-400 hover:bg-yellow-500 text-black font-semibold"
                >
                  <Save size={16} className="mr-2" />
                  Crear Comida
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}