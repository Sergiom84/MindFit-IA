import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Search,
  Apple,
  Beef,
  Wheat,
  Droplets,
  Plus,
  Info,
  Star,
  Filter
} from 'lucide-react';

// Base de datos de alimentos extensa
const foodDatabase = [
  // Proteínas
  {
    id: 1,
    name: 'Pechuga de Pollo',
    category: 'proteina',
    calories: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
    fiber: 0,
    unit: '100g',
    vitamins: ['B6', 'B3', 'B12'],
    minerals: ['Fósforo', 'Selenio'],
    description: 'Excelente fuente de proteína magra',
    preparation: ['Plancha', 'Horno', 'Hervido'],
    benefits: ['Alto en proteína', 'Bajo en grasa', 'Versatil']
  },
  {
    id: 2,
    name: 'Huevo Entero',
    category: 'proteina',
    calories: 155,
    protein: 13,
    carbs: 1.1,
    fat: 11,
    fiber: 0,
    unit: '100g',
    vitamins: ['A', 'D', 'B12', 'Colina'],
    minerals: ['Hierro', 'Selenio'],
    description: 'Proteína completa con todos los aminoácidos esenciales',
    preparation: ['Hervido', 'Frito', 'Revuelto', 'Cocido'],
    benefits: ['Proteína completa', 'Rico en colina', 'Versatil']
  },
  {
    id: 3,
    name: 'Salmón',
    category: 'proteina',
    calories: 208,
    protein: 22,
    carbs: 0,
    fat: 13,
    fiber: 0,
    unit: '100g',
    vitamins: ['D', 'B12', 'B6'],
    minerals: ['Selenio', 'Fósforo'],
    description: 'Rico en omega-3 y proteína de alta calidad',
    preparation: ['Plancha', 'Horno', 'Vapour'],
    benefits: ['Rico en Omega-3', 'Antiinflamatorio', 'Cardioprotector']
  },
  {
    id: 4,
    name: 'Yogur Griego',
    category: 'proteina',
    calories: 59,
    protein: 10,
    carbs: 3.6,
    fat: 0.4,
    fiber: 0,
    unit: '100g',
    vitamins: ['B12', 'Riboflavina'],
    minerals: ['Calcio', 'Fósforo'],
    description: 'Probióticos naturales y alta proteína',
    preparation: ['Natural', 'Con frutas', 'Smoothies'],
    benefits: ['Probióticos', 'Alto en proteína', 'Bajo en grasa']
  },

  // Carbohidratos
  {
    id: 5,
    name: 'Arroz Integral',
    category: 'carbohidrato',
    calories: 111,
    protein: 2.6,
    carbs: 23,
    fat: 0.9,
    fiber: 1.8,
    unit: '100g',
    vitamins: ['B1', 'B3', 'B6'],
    minerals: ['Manganeso', 'Magnesio'],
    description: 'Carbohidrato complejo rico en fibra',
    preparation: ['Hervido', 'Al vapor', 'Pilaf'],
    benefits: ['Fibra', 'Energía sostenida', 'Sin gluten']
  },
  {
    id: 6,
    name: 'Avena',
    category: 'carbohidrato',
    calories: 389,
    protein: 16.9,
    carbs: 66,
    fat: 6.9,
    fiber: 10.6,
    unit: '100g',
    vitamins: ['B1', 'B5'],
    minerals: ['Manganeso', 'Fósforo'],
    description: 'Rica en beta-glucanos y fibra soluble',
    preparation: ['Porridge', 'Overnight oats', 'Batidos'],
    benefits: ['Beta-glucanos', 'Reduce colesterol', 'Saciante']
  },
  {
    id: 7,
    name: 'Boniato',
    category: 'carbohidrato',
    calories: 86,
    protein: 1.6,
    carbs: 20,
    fat: 0.1,
    fiber: 3,
    unit: '100g',
    vitamins: ['A', 'C', 'B6'],
    minerals: ['Potasio', 'Manganeso'],
    description: 'Rico en betacarotenos y fibra',
    preparation: ['Horno', 'Hervido', 'Vapor'],
    benefits: ['Rico en vitamina A', 'Antioxidante', 'Índice glucémico medio']
  },
  {
    id: 8,
    name: 'Quinoa',
    category: 'carbohidrato',
    calories: 368,
    protein: 14,
    carbs: 64,
    fat: 6,
    fiber: 7,
    unit: '100g',
    vitamins: ['B1', 'B2', 'B6'],
    minerals: ['Hierro', 'Magnesio', 'Zinc'],
    description: 'Pseudocereal con proteína completa',
    preparation: ['Hervida', 'Ensaladas', 'Guarnición'],
    benefits: ['Proteína completa', 'Sin gluten', 'Rico en minerales']
  },

  // Grasas
  {
    id: 9,
    name: 'Aguacate',
    category: 'grasa',
    calories: 160,
    protein: 2,
    carbs: 9,
    fat: 15,
    fiber: 7,
    unit: '100g',
    vitamins: ['K', 'C', 'E'],
    minerals: ['Potasio', 'Folato'],
    description: 'Rico en grasas monoinsaturadas y fibra',
    preparation: ['Natural', 'Guacamole', 'Ensaladas'],
    benefits: ['Grasas saludables', 'Rico en fibra', 'Cardioprotector']
  },
  {
    id: 10,
    name: 'Aceite de Oliva Extra Virgen',
    category: 'grasa',
    calories: 884,
    protein: 0,
    carbs: 0,
    fat: 100,
    fiber: 0,
    unit: '100ml',
    vitamins: ['E', 'K'],
    minerals: [],
    description: 'Rico en ácido oleico y antioxidantes',
    preparation: ['Crudo', 'Cocinar a baja temperatura'],
    benefits: ['Antioxidantes', 'Antiinflamatorio', 'Cardioprotector']
  },
  {
    id: 11,
    name: 'Nueces',
    category: 'grasa',
    calories: 654,
    protein: 15,
    carbs: 14,
    fat: 65,
    fiber: 7,
    unit: '100g',
    vitamins: ['E', 'B6'],
    minerals: ['Magnesio', 'Fósforo'],
    description: 'Rica en omega-3 de origen vegetal',
    preparation: ['Natural', 'Tostadas', 'En ensaladas'],
    benefits: ['Omega-3 vegetal', 'Rico en magnesio', 'Saciante']
  },

  // Verduras
  {
    id: 12,
    name: 'Brócoli',
    category: 'verdura',
    calories: 34,
    protein: 2.8,
    carbs: 7,
    fat: 0.4,
    fiber: 2.6,
    unit: '100g',
    vitamins: ['C', 'K', 'Folato'],
    minerals: ['Potasio', 'Hierro'],
    description: 'Crucífera rica en antioxidantes',
    preparation: ['Vapor', 'Salteado', 'Crudo'],
    benefits: ['Antioxidante', 'Antiinflamatorio', 'Detoxificante']
  },
  {
    id: 13,
    name: 'Espinacas',
    category: 'verdura',
    calories: 23,
    protein: 2.9,
    carbs: 3.6,
    fat: 0.4,
    fiber: 2.2,
    unit: '100g',
    vitamins: ['K', 'A', 'C', 'Folato'],
    minerals: ['Hierro', 'Magnesio'],
    description: 'Rica en hierro y ácido fólico',
    preparation: ['Ensalada', 'Salteado', 'Batidos'],
    benefits: ['Rico en hierro', 'Folato', 'Antioxidante']
  },

  // Frutas
  {
    id: 14,
    name: 'Plátano',
    category: 'fruta',
    calories: 89,
    protein: 1.1,
    carbs: 23,
    fat: 0.3,
    fiber: 2.6,
    unit: '100g',
    vitamins: ['B6', 'C'],
    minerals: ['Potasio', 'Magnesio'],
    description: 'Rica en potasio y energía rápida',
    preparation: ['Natural', 'Batidos', 'Horneado'],
    benefits: ['Rico en potasio', 'Energía rápida', 'Pre-entreno']
  },
  {
    id: 15,
    name: 'Arándanos',
    category: 'fruta',
    calories: 57,
    protein: 0.7,
    carbs: 14,
    fat: 0.3,
    fiber: 2.4,
    unit: '100g',
    vitamins: ['C', 'K'],
    minerals: ['Manganeso'],
    description: 'Superfruta rica en antocianinas',
    preparation: ['Natural', 'Batidos', 'Yogur'],
    benefits: ['Antioxidante', 'Antiinflamatorio', 'Neuroprotector']
  }
];

export default function FoodDatabase() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [filteredFoods, setFilteredFoods] = useState(foodDatabase);
  const [selectedFood, setSelectedFood] = useState(null);

  const categories = [
    { id: 'all', name: 'Todos', icon: Apple, color: 'bg-gray-600' },
    { id: 'proteina', name: 'Proteínas', icon: Beef, color: 'bg-red-600' },
    { id: 'carbohidrato', name: 'Carbohidratos', icon: Wheat, color: 'bg-green-600' },
    { id: 'grasa', name: 'Grasas', icon: Droplets, color: 'bg-yellow-600' },
    { id: 'verdura', name: 'Verduras', icon: Apple, color: 'bg-green-500' },
    { id: 'fruta', name: 'Frutas', icon: Apple, color: 'bg-orange-500' }
  ];

  useEffect(() => {
    let filtered = foodDatabase;

    // Filtrar por categoría
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(food => food.category === selectedCategory);
    }

    // Filtrar por término de búsqueda
    if (searchTerm) {
      filtered = filtered.filter(food => 
        food.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        food.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Ordenar
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'calories':
          return b.calories - a.calories;
        case 'protein':
          return b.protein - a.protein;
        case 'carbs':
          return b.carbs - a.carbs;
        case 'fat':
          return b.fat - a.fat;
        default:
          return a.name.localeCompare(b.name);
      }
    });

    setFilteredFoods(filtered);
  }, [searchTerm, selectedCategory, sortBy]);

  const getCategoryColor = (category) => {
    const categoryData = categories.find(cat => cat.id === category);
    return categoryData?.color || 'bg-gray-600';
  };

  return (
    <div className="space-y-6">
      {/* Header y Controles */}
      <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5 border-l-2 border-l-yellow-400/30">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2 font-urbanist">
            <Apple className="text-yellow-400" size={24} />
            Base de Datos Nutricional
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Búsqueda */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 text-gray-400" size={16} />
                <Input
                  placeholder="Buscar alimentos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-white/5 border-white/10 text-white"
                />
              </div>
            </div>

            {/* Filtro de categoría */}
            <div className="flex gap-2 flex-wrap">
              {categories.map(category => {
                const Icon = category.icon;
                return (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedCategory === category.id
                        ? `${category.color} text-white`
                        : 'bg-white/5 text-gray-300/80 hover:bg-white/10'
                    }`}
                  >
                    <Icon size={16} />
                    <span className="hidden sm:block">{category.name}</span>
                  </button>
                );
              })}
            </div>

            {/* Ordenar por */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-white/5 border-white/10 text-white rounded-lg px-3 py-2 text-sm"
            >
              <option value="name">Nombre</option>
              <option value="calories">Calorías</option>
              <option value="protein">Proteína</option>
              <option value="carbs">Carbohidratos</option>
              <option value="fat">Grasas</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Lista de Alimentos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredFoods.map(food => (
          <Card 
            key={food.id}
            className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5 cursor-pointer transition-all duration-200 hover:bg-white/10"
            onClick={() => setSelectedFood(selectedFood?.id === food.id ? null : food)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white text-sm">{food.name}</h3>
                <Badge className={`${getCategoryColor(food.category)} text-white text-xs`}>
                  {categories.find(cat => cat.id === food.category)?.name}
                </Badge>
              </div>
              <p className="text-gray-400 text-xs">{food.description}</p>
            </CardHeader>

            <CardContent>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-center p-2 bg-white/5 rounded border border-white/10 border-l-2 border-l-sky-400/40">
                  <p className="font-bold text-sky-300">{food.calories}</p>
                  <p className="text-gray-300">kcal</p>
                </div>
                <div className="text-center p-2 bg-white/5 rounded border border-white/10 border-l-2 border-l-red-400/40">
                  <p className="font-bold text-red-300">{food.protein}g</p>
                  <p className="text-gray-300">Prot.</p>
                </div>
                <div className="text-center p-2 bg-white/5 rounded border border-white/10 border-l-2 border-l-emerald-400/40">
                  <p className="font-bold text-emerald-300">{food.carbs}g</p>
                  <p className="text-gray-300">Carb.</p>
                </div>
                <div className="text-center p-2 bg-white/5 rounded border border-white/10 border-l-2 border-l-yellow-400/40">
                  <p className="font-bold text-yellow-300">{food.fat}g</p>
                  <p className="text-gray-300">Gras.</p>
                </div>
              </div>

              <div className="flex justify-between items-center mt-3">
                <span className="text-gray-400 text-xs">por {food.unit}</span>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/10 bg-white/5 text-white hover:bg-white/10 text-xs px-2 py-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      // TODO: Añadir a comida
                    }}
                  >
                    <Plus size={12} />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-white/10 bg-white/5 text-white hover:bg-white/10 text-xs px-2 py-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFood(food);
                    }}
                  >
                    <Info size={12} />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Modal de detalles del alimento */}
      {selectedFood && (
        <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5 border-l-2 border-l-yellow-400/30">
          <CardHeader>
            <CardTitle className="text-white flex items-center justify-between font-urbanist">
              <span>{selectedFood.name}</span>
              <Button
                variant="outline"
                size="sm"
                className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                onClick={() => setSelectedFood(null)}
              >
                Cerrar
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Macronutrientes */}
              <div className="space-y-4">
                <h4 className="text-lg font-semibold text-white font-urbanist">Información Nutricional</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-3 bg-white/5 rounded border border-white/10 border-l-2 border-l-sky-400/40">
                    <p className="text-2xl font-bold text-sky-300">{selectedFood.calories}</p>
                    <p className="text-gray-300 text-sm">Calorías</p>
                  </div>
                  <div className="text-center p-3 bg-white/5 rounded border border-white/10 border-l-2 border-l-red-400/40">
                    <p className="text-2xl font-bold text-red-300">{selectedFood.protein}g</p>
                    <p className="text-gray-300 text-sm">Proteína</p>
                  </div>
                  <div className="text-center p-3 bg-white/5 rounded border border-white/10 border-l-2 border-l-emerald-400/40">
                    <p className="text-2xl font-bold text-emerald-300">{selectedFood.carbs}g</p>
                    <p className="text-gray-300 text-sm">Carbohidratos</p>
                  </div>
                  <div className="text-center p-3 bg-white/5 rounded border border-white/10 border-l-2 border-l-yellow-400/40">
                    <p className="text-2xl font-bold text-yellow-300">{selectedFood.fat}g</p>
                    <p className="text-gray-300 text-sm">Grasas</p>
                  </div>
                </div>
                {selectedFood.fiber > 0 && (
                  <div className="text-center p-2 bg-white/5 rounded border border-white/10 border-l-2 border-l-purple-400/40">
                    <p className="font-bold text-purple-300">{selectedFood.fiber}g Fibra</p>
                  </div>
                )}
              </div>

              {/* Detalles adicionales */}
              <div className="space-y-4">
                <div>
                  <h5 className="font-semibold text-white mb-2">Vitaminas</h5>
                  <div className="flex flex-wrap gap-2">
                    {selectedFood.vitamins.map(vitamin => (
                      <Badge key={vitamin} className="bg-green-600 text-white">
                        {vitamin}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h5 className="font-semibold text-white mb-2">Minerales</h5>
                  <div className="flex flex-wrap gap-2">
                    {selectedFood.minerals.map(mineral => (
                      <Badge key={mineral} className="bg-blue-600 text-white">
                        {mineral}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h5 className="font-semibold text-white mb-2">Formas de Preparación</h5>
                  <div className="flex flex-wrap gap-2">
                    {selectedFood.preparation.map(prep => (
                      <Badge key={prep} variant="outline" className="border-white/10 text-gray-300/80">
                        {prep}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h5 className="font-semibold text-white mb-2">Beneficios</h5>
                  <div className="flex flex-wrap gap-2">
                    {selectedFood.benefits.map(benefit => (
                      <Badge key={benefit} className="bg-yellow-600 text-white">
                        <Star size={10} className="mr-1" />
                        {benefit}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {filteredFoods.length === 0 && (
        <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5">
          <CardContent className="text-center py-12">
            <Apple className="mx-auto text-gray-400 mb-4" size={48} />
            <h3 className="text-xl font-semibold text-white mb-2">No se encontraron alimentos</h3>
            <p className="text-gray-400">
              Intenta cambiar los filtros o el término de búsqueda
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
