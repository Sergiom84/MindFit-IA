/**
 * 🚀 Demo de Lista Virtualizada
 * 
 * Componente de demostración que muestra las capacidades del sistema de virtualización.
 * Este patrón se puede aplicar a:
 * - Lista de ejercicios del catálogo
 * - Historia de entrenamientos
 * - Base de datos de alimentos
 * - Playlists de música
 */

import { useMemo } from 'react';
import useVirtualizedList, { VirtualizedListSearch, VirtualizedListLoader } from '../../hooks/useVirtualizedList.jsx';
import { Dumbbell, Heart, Clock, Target } from 'lucide-react';

// Datos de ejemplo para demostrar el sistema
const generateMockData = (count = 1000) => {
  const exercises = [
    'Flexiones', 'Sentadillas', 'Burpees', 'Plancha', 'Jumping Jacks', 
    'Mountain Climbers', 'Lunges', 'Pull-ups', 'Push-ups', 'Crunches',
    'Russian Twists', 'High Knees', 'Butt Kickers', 'Wall Sits', 'Bear Crawls',
    'Pike Walks', 'Tricep Dips', 'Glute Bridges', 'Bicycle Crunches', 'Superman'
  ];
  
  const difficulties = ['Principiante', 'Intermedio', 'Avanzado'];
  const categories = ['Cardio', 'Fuerza', 'Flexibilidad', 'Core', 'HIIT'];
  
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `${exercises[index % exercises.length]} ${Math.floor(index / exercises.length) + 1}`,
    difficulty: difficulties[index % difficulties.length],
    category: categories[index % categories.length],
    duration: Math.floor(Math.random() * 60) + 10, // 10-70 minutos
    calories: Math.floor(Math.random() * 500) + 100, // 100-600 calorías
    rating: (Math.random() * 2 + 3).toFixed(1), // 3.0-5.0 rating
    completedTimes: Math.floor(Math.random() * 50),
    tags: ['efectivo', 'popular', 'rápido', 'intenso'].slice(0, Math.floor(Math.random() * 3) + 1)
  }));
};

const VirtualizedListDemo = ({ isVisible = true }) => {
  // Generar datos de ejemplo
  const mockData = useMemo(() => generateMockData(1000), []);
  
  // Configurar lista virtualizada
  const {
    visibleItems,
    stats,
    searchQuery,
    isLoading,
    setSearchQuery,
    loadMore,
    reset,
    scrollContainerRef,
    handleScroll,
    isEmpty,
    isSearching
  } = useVirtualizedList(mockData, {
    batchSize: 25,
    searchFields: ['name', 'category', 'difficulty'],
    enableInfiniteScroll: true,
    sortFn: (a, b) => b.rating - a.rating // Ordenar por rating
  });

  if (!isVisible) return null;

  const getDifficultyColor = (difficulty) => {
    switch(difficulty) {
      case 'Principiante': return 'text-green-400 bg-green-900/20';
      case 'Intermedio': return 'text-yellow-400 bg-yellow-900/20';
      case 'Avanzado': return 'text-red-400 bg-red-900/20';
      default: return 'text-gray-400 bg-gray-900/20';
    }
  };

  const getCategoryIcon = (category) => {
    switch(category) {
      case 'Cardio': return Heart;
      case 'Fuerza': return Dumbbell;
      case 'Core': return Target;
      default: return Clock;
    }
  };

  return (
    <div className="bg-gray-900 min-h-screen p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-2">
            🚀 Sistema de Lista Virtualizada
          </h1>
          <p className="text-gray-400">
            Demo con {stats.totalItems} ejercicios - Optimizado para rendimiento
          </p>
        </div>

        {/* Controles y Búsqueda */}
        <div className="bg-gray-800/50 rounded-xl p-4 space-y-4">
          <VirtualizedListSearch
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            placeholder="Buscar ejercicios por nombre, categoría o dificultad..."
            stats={stats}
          />
          
          <div className="flex justify-between items-center">
            <button
              onClick={reset}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm"
            >
              🔄 Reset
            </button>
            
            <div className="text-xs text-gray-400 space-x-4">
              <span>Batch: 25 elementos</span>
              <span>Scroll infinito: ✅</span>
              <span>Búsqueda: ✅</span>
            </div>
          </div>
        </div>

        {/* Lista Virtualizada */}
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="bg-gray-800/30 rounded-xl h-96 overflow-y-auto"
          style={{ scrollBehavior: 'smooth' }}
        >
          <div className="p-4 space-y-3">
            {isEmpty ? (
              <div className="text-center py-12 text-gray-400">
                {isSearching ? 
                  `No se encontraron ejercicios para "${searchQuery}"` : 
                  'No hay ejercicios disponibles'
                }
              </div>
            ) : (
              <>
                {/* Items Visibles */}
                {visibleItems.map((exercise) => {
                  const CategoryIcon = getCategoryIcon(exercise.category);
                  
                  return (
                    <div 
                      key={exercise.id}
                      className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:border-gray-600 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <CategoryIcon className="w-5 h-5 text-yellow-400" />
                          <h3 className="font-medium text-white">{exercise.name}</h3>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <span className="text-yellow-400 text-sm">⭐ {exercise.rating}</span>
                          <span className={`px-2 py-1 rounded text-xs ${getDifficultyColor(exercise.difficulty)}`}>
                            {exercise.difficulty}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between text-sm text-gray-400">
                        <div className="flex items-center gap-4">
                          <span>📁 {exercise.category}</span>
                          <span>⏱️ {exercise.duration} min</span>
                          <span>🔥 {exercise.calories} cal</span>
                        </div>
                        
                        <div>
                          ✅ {exercise.completedTimes}x completado
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                {/* Loader de virtualización */}
                <VirtualizedListLoader 
                  isLoading={isLoading}
                  hasMore={stats.hasMore}
                />
              </>
            )}
          </div>
        </div>

        {/* Estadísticas de rendimiento */}
        <div className="bg-gray-800/20 rounded-xl p-4">
          <h3 className="text-sm font-medium text-yellow-400 mb-2">
            📊 Estadísticas de Rendimiento
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-gray-400">Total</div>
              <div className="text-white font-mono">{stats.totalItems}</div>
            </div>
            <div>
              <div className="text-gray-400">Filtrados</div>
              <div className="text-white font-mono">{stats.filteredItems}</div>
            </div>
            <div>
              <div className="text-gray-400">Renderizados</div>
              <div className="text-white font-mono">{stats.visibleItems}</div>
            </div>
            <div>
              <div className="text-gray-400">Progreso</div>
              <div className="text-white font-mono">{stats.loadProgress}%</div>
            </div>
          </div>
          
          <div className="mt-3 text-xs text-gray-500">
            💡 Solo se renderizan los elementos visibles, manteniendo ~{Math.round(stats.visibleItems / stats.totalItems * 100) || 0}% menos DOM nodes.
            Esto mejora significativamente el rendimiento con listas grandes.
          </div>
        </div>
      </div>
    </div>
  );
};

export default VirtualizedListDemo;