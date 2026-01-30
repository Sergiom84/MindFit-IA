import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Zap,
  ShoppingCart,
  Star,
  Clock,
  Target,
  Shield,
  TrendingUp,
  ExternalLink,
  Info,
  Heart,
  Dumbbell
} from 'lucide-react';

// Base de datos de suplementos
const supplementsDatabase = [
  {
    id: 1,
    name: 'Proteína Whey',
    category: 'proteina',
    priority: 'high',
    dosage: '25-30g',
    timing: 'Post-entreno',
    price: 35,
    benefits: ['Recuperación muscular', 'Síntesis proteica', 'Conveniente'],
    description: 'Proteína de suero de alta calidad para optimizar la recuperación',
    methodology: ['bodybuilding', 'powerlifting', 'crossfit', 'hipertrofia'],
    amazonLink: 'https://amzn.to/whey-protein',
    evidenceLevel: 'high',
    sideEffects: ['Posible malestar digestivo en intolerantes a lactosa'],
    alternatives: ['Proteína vegetal', 'Caseína']
  },
  {
    id: 2,
    name: 'Creatina Monohidrato',
    category: 'rendimiento',
    priority: 'high',
    dosage: '3-5g',
    timing: 'Cualquier momento',
    price: 20,
    benefits: ['Fuerza', 'Potencia', 'Volumen muscular', 'Recuperación'],
    description: 'El suplemento con más evidencia científica para fuerza y potencia',
    methodology: ['powerlifting', 'crossfit', 'hipertrofia', 'funcional'],
    amazonLink: 'https://amzn.to/creatine-mono',
    evidenceLevel: 'very-high',
    sideEffects: ['Retención de agua', 'Posible malestar gastrointestinal'],
    alternatives: ['Creatina HCl', 'Creatina tamponada']
  },
  {
    id: 3,
    name: 'Cafeína',
    category: 'rendimiento',
    priority: 'medium',
    dosage: '100-400mg',
    timing: '30-45min pre-entreno',
    price: 15,
    benefits: ['Energía', 'Concentración', 'Quema de grasa', 'Resistencia'],
    description: 'Estimulante natural que mejora el rendimiento físico y mental',
    methodology: ['crossfit', 'funcional', 'oposiciones', 'cardio'],
    amazonLink: 'https://amzn.to/caffeine-pills',
    evidenceLevel: 'high',
    sideEffects: ['Nerviosismo', 'Insomnio', 'Dependencia'],
    alternatives: ['L-Teanina + Cafeína', 'Pre-entreno natural']
  },
  {
    id: 4,
    name: 'Beta-Alanina',
    category: 'rendimiento',
    priority: 'medium',
    dosage: '3-5g',
    timing: 'Pre-entreno',
    price: 25,
    benefits: ['Resistencia muscular', 'Reduce fatiga', 'Mejora rendimiento'],
    description: 'Aminoácido que reduce la fatiga en ejercicios de alta intensidad',
    methodology: ['crossfit', 'hipertrofia', 'funcional'],
    amazonLink: 'https://amzn.to/beta-alanine',
    evidenceLevel: 'medium',
    sideEffects: ['Hormigueo en la piel (inofensivo)'],
    alternatives: ['Pre-entrenos con beta-alanina']
  },
  {
    id: 5,
    name: 'Omega-3',
    category: 'salud',
    priority: 'medium',
    dosage: '1-3g EPA/DHA',
    timing: 'Con comidas',
    price: 30,
    benefits: ['Antiinflamatorio', 'Salud cardiovascular', 'Recuperación', 'Función cerebral'],
    description: 'Ácidos grasos esenciales con múltiples beneficios para la salud',
    methodology: ['todos'],
    amazonLink: 'https://amzn.to/omega3-fish-oil',
    evidenceLevel: 'high',
    sideEffects: ['Posible sabor a pescado', 'Malestar estomacal'],
    alternatives: ['Omega-3 algal (vegano)', 'Krill oil']
  },
  {
    id: 6,
    name: 'Vitamina D3',
    category: 'salud',
    priority: 'high',
    dosage: '1000-4000 UI',
    timing: 'Con comidas',
    price: 12,
    benefits: ['Salud ósea', 'Sistema inmune', 'Niveles de testosterona', 'Estado de ánimo'],
    description: 'Vitamina esencial, especialmente importante en lugares con poco sol',
    methodology: ['todos'],
    amazonLink: 'https://amzn.to/vitamin-d3',
    evidenceLevel: 'very-high',
    sideEffects: ['Exceso puede causar hipercalcemia'],
    alternatives: ['Complejo vitamínico con D3']
  },
  {
    id: 7,
    name: 'Magnesio',
    category: 'salud',
    priority: 'medium',
    dosage: '200-400mg',
    timing: 'Antes de dormir',
    price: 18,
    benefits: ['Calidad del sueño', 'Relajación muscular', 'Reducción de calambres'],
    description: 'Mineral esencial para la función muscular y nerviosa',
    methodology: ['todos'],
    amazonLink: 'https://amzn.to/magnesium',
    evidenceLevel: 'medium',
    sideEffects: ['Efecto laxante en dosis altas'],
    alternatives: ['Magnesio glicinato', 'Citrato de magnesio']
  },
  {
    id: 8,
    name: 'Pre-Entreno',
    category: 'rendimiento',
    priority: 'low',
    dosage: '1 scoop',
    timing: '30min pre-entreno',
    price: 40,
    benefits: ['Energía', 'Pump muscular', 'Concentración', 'Motivación'],
    description: 'Mezcla de ingredientes para maximizar el rendimiento en el gimnasio',
    methodology: ['powerlifting', 'hipertrofia', 'crossfit'],
    amazonLink: 'https://amzn.to/pre-workout',
    evidenceLevel: 'medium',
    sideEffects: ['Estimulación excesiva', 'Crash post-entreno'],
    alternatives: ['Cafeína + L-Citrulina', 'Pre-entreno natural']
  }
];

export default function SupplementsSection({ userData, userMacros }) {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSupplement, setSelectedSupplement] = useState(null);
  const [userMethodology, setUserMethodology] = useState('hipertrofia');

  useEffect(() => {
    // Determinar metodología del usuario basada en sus datos
    if (userData) {
      const methodology = userData.metodologia_preferida || 
                          userData.objetivo_principal === 'ganar_peso' ? 'hipertrofia' :
                          userData.objetivo_principal === 'fuerza_maxima' ? 'powerlifting' :
                          'funcional';
      setUserMethodology(methodology);
    }
  }, [userData]);

  const categories = [
    { id: 'all', name: 'Todos', icon: Zap, color: 'bg-gray-600' },
    { id: 'proteina', name: 'Proteína', icon: Dumbbell, color: 'bg-red-600' },
    { id: 'rendimiento', name: 'Rendimiento', icon: TrendingUp, color: 'bg-blue-600' },
    { id: 'salud', name: 'Salud General', icon: Heart, color: 'bg-green-600' }
  ];

  const priorityColors = {
    'high': 'bg-red-600',
    'medium': 'bg-yellow-600',
    'low': 'bg-green-600'
  };

  const evidenceColors = {
    'very-high': 'bg-green-600',
    'high': 'bg-blue-600',
    'medium': 'bg-yellow-600',
    'low': 'bg-gray-600'
  };

  const getFilteredSupplements = () => {
    let filtered = supplementsDatabase;
    
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(supp => supp.category === selectedCategory);
    }
    
    // Ordenar por prioridad y relevancia para la metodología del usuario
    return filtered.sort((a, b) => {
      const aRelevant = a.methodology.includes(userMethodology) || a.methodology.includes('todos');
      const bRelevant = b.methodology.includes(userMethodology) || b.methodology.includes('todos');
      
      if (aRelevant && !bRelevant) return -1;
      if (!aRelevant && bRelevant) return 1;
      
      const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  };

  const getPersonalizedRecommendations = () => {
    const recommendations = [];
    
    // Basado en objetivo
    if (userData?.objetivo_principal === 'ganar_peso') {
      recommendations.push('Considera la creatina y proteína para maximizar las ganancias musculares');
    } else if (userData?.objetivo_principal === 'perder_peso') {
      recommendations.push('La cafeína y omega-3 pueden ayudar con la quema de grasa y recuperación');
    }
    
    // Basado en entrenamiento
    if (userMethodology === 'crossfit') {
      recommendations.push('Beta-alanina y cafeína son especialmente útiles para entrenamientos de alta intensidad');
    } else if (userMethodology === 'powerlifting') {
      recommendations.push('La creatina es esencial para mejorar la fuerza máxima');
    }
    
    // Recomendaciones generales
    recommendations.push('Vitamina D3 y Omega-3 son beneficiosos para casi todos los deportistas');
    
    return recommendations;
  };

  const filteredSupplements = getFilteredSupplements();
  const recommendations = getPersonalizedRecommendations();

  return (
    <div className="space-y-6">
      {/* Header y recomendaciones personalizadas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5 lg:col-span-2">
          <CardHeader>
          <CardTitle className="text-white flex items-center gap-2 font-urbanist">
            <Zap className="text-yellow-400" size={24} />
            Suplementación Deportiva
          </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-4">
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
                    {category.name}
                  </button>
                );
              })}
            </div>
            <div className="text-sm text-gray-300">
              <p className="mb-2">
                <strong>Metodología detectada:</strong> {userMethodology.charAt(0).toUpperCase() + userMethodology.slice(1)}
              </p>
              <p>Los suplementos están priorizados según tu perfil y objetivos de entrenamiento.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5">
          <CardHeader>
          <CardTitle className="text-white flex items-center gap-2 font-urbanist">
            <Target className="text-yellow-400" size={20} />
            Recomendaciones
          </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recommendations.map((rec, index) => (
                <div key={index} className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <p className="text-sm text-blue-300">{rec}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grid de suplementos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSupplements.map(supplement => {
          const isRelevant = supplement.methodology.includes(userMethodology) || supplement.methodology.includes('todos');
          
          return (
            <Card 
              key={supplement.id}
              className={`bg-neutral-900/70 border-white/10 ring-1 ring-white/5 cursor-pointer transition-all duration-200 hover:bg-white/10 ${
                isRelevant ? 'ring-1 ring-yellow-400/30' : ''
              }`}
              onClick={() => setSelectedSupplement(selectedSupplement?.id === supplement.id ? null : supplement)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-white text-sm mb-1">{supplement.name}</h3>
                    <p className="text-gray-400 text-xs">{supplement.description}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Badge className={`${priorityColors[supplement.priority]} text-white text-xs`}>
                      {supplement.priority === 'high' ? 'Alta' : supplement.priority === 'medium' ? 'Media' : 'Baja'}
                    </Badge>
                    {isRelevant && (
                      <Badge className="bg-yellow-600 text-white text-xs">
                        Recomendado
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-300">Dosis:</span>
                    <span className="text-white font-medium">{supplement.dosage}</span>
                  </div>
                  
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-300">Timing:</span>
                    <span className="text-white font-medium">{supplement.timing}</span>
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-300">Precio aprox:</span>
                    <span className="text-green-400 font-medium">${supplement.price}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">Evidencia:</span>
                    <Badge className={`${evidenceColors[supplement.evidenceLevel]} text-white text-xs`}>
                      {supplement.evidenceLevel === 'very-high' ? 'Muy Alta' : 
                       supplement.evidenceLevel === 'high' ? 'Alta' :
                       supplement.evidenceLevel === 'medium' ? 'Media' : 'Baja'}
                    </Badge>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/10 bg-white/5 text-white hover:bg-white/10 flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSupplement(supplement);
                      }}
                    >
                      <Info size={12} className="mr-1" />
                      Info
                    </Button>
                    <Button
                      size="sm"
                      className="bg-yellow-400 hover:bg-yellow-500 text-black flex-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(supplement.amazonLink, '_blank');
                      }}
                    >
                      <ShoppingCart size={12} className="mr-1" />
                      Comprar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Modal de detalles del suplemento */}
      {selectedSupplement && (
        <Card className="bg-neutral-900/70 border-white/10 ring-1 ring-white/5 border-l-2 border-l-yellow-400/30">
          <CardHeader>
            <CardTitle className="text-white flex items-center justify-between font-urbanist">
              <span>{selectedSupplement.name}</span>
              <Button
                variant="outline"
                size="sm"
                className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                onClick={() => setSelectedSupplement(null)}
              >
                Cerrar
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Información principal */}
              <div className="space-y-4">
                <div>
                  <h4 className="text-lg font-semibold text-white mb-2 font-urbanist">Información General</h4>
                  <p className="text-gray-300 mb-4">{selectedSupplement.description}</p>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="p-3 bg-white/5 rounded border border-white/10 border-l-2 border-l-sky-400/40">
                      <p className="font-bold text-sky-300">Dosis</p>
                      <p className="text-white">{selectedSupplement.dosage}</p>
                    </div>
                    <div className="p-3 bg-white/5 rounded border border-white/10 border-l-2 border-l-emerald-400/40">
                      <p className="font-bold text-emerald-300">Timing</p>
                      <p className="text-white">{selectedSupplement.timing}</p>
                    </div>
                    <div className="p-3 bg-white/5 rounded border border-white/10 border-l-2 border-l-yellow-400/40">
                      <p className="font-bold text-yellow-300">Precio</p>
                      <p className="text-white">${selectedSupplement.price}</p>
                    </div>
                    <div className="p-3 bg-white/5 rounded border border-white/10 border-l-2 border-l-purple-400/40">
                      <p className="font-bold text-purple-300">Prioridad</p>
                      <p className="text-white capitalize">{selectedSupplement.priority}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h5 className="font-semibold text-white mb-2">Beneficios</h5>
                  <div className="flex flex-wrap gap-2">
                    {selectedSupplement.benefits.map(benefit => (
                      <Badge key={benefit} className="bg-green-600 text-white">
                        <Star size={10} className="mr-1" />
                        {benefit}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h5 className="font-semibold text-white mb-2">Metodologías Recomendadas</h5>
                  <div className="flex flex-wrap gap-2">
                    {selectedSupplement.methodology.map(method => (
                      <Badge 
                        key={method} 
                        variant={method === userMethodology ? "default" : "outline"}
                        className={method === userMethodology ? "bg-yellow-600 text-white" : "border-white/10 bg-white/5 text-gray-300/80"}
                      >
                        {method === 'todos' ? 'Todas' : method.charAt(0).toUpperCase() + method.slice(1)}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              {/* Detalles adicionales */}
              <div className="space-y-4">
                <div>
                  <h5 className="font-semibold text-white mb-2 flex items-center gap-2">
                    <Shield className="text-yellow-400" size={16} />
                    Nivel de Evidencia
                  </h5>
                  <Badge className={`${evidenceColors[selectedSupplement.evidenceLevel]} text-white`}>
                    {selectedSupplement.evidenceLevel === 'very-high' ? 'Muy Alta - Estudios extensos y consistentes' : 
                     selectedSupplement.evidenceLevel === 'high' ? 'Alta - Múltiples estudios positivos' :
                     selectedSupplement.evidenceLevel === 'medium' ? 'Media - Algunos estudios prometedores' : 
                     'Baja - Evidencia limitada o mixta'}
                  </Badge>
                </div>

                <div>
                  <h5 className="font-semibold text-white mb-2">Posibles Efectos Secundarios</h5>
                  <ul className="space-y-1">
                    {selectedSupplement.sideEffects.map((effect, index) => (
                      <li key={index} className="text-sm text-gray-300 flex items-start gap-2">
                        <div className="w-1 h-1 bg-red-400 rounded-full mt-2 flex-shrink-0"></div>
                        {effect}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h5 className="font-semibold text-white mb-2">Alternativas</h5>
                  <div className="flex flex-wrap gap-2">
                    {selectedSupplement.alternatives.map(alt => (
                      <Badge key={alt} variant="outline" className="border-white/10 text-gray-300/80 text-xs">
                        {alt}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="pt-4">
                  <Button
                    className="w-full bg-yellow-400 hover:bg-yellow-500 text-black font-semibold"
                    onClick={() => window.open(selectedSupplement.amazonLink, '_blank')}
                  >
                    <ShoppingCart size={16} className="mr-2" />
                    Comprar en Amazon
                    <ExternalLink size={14} className="ml-2" />
                  </Button>
                  <p className="text-xs text-gray-400 text-center mt-2">
                    Enlaces de afiliado - Apoyamos el desarrollo de la app
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
