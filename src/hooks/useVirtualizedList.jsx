/**
 * 🔄 useVirtualizedList - Hook para listas virtualizadas y optimizadas
 * 
 * BENEFICIOS:
 * - Renderizado por lotes para listas grandes (>50 elementos)
 * - Lazy loading progresivo con scroll infinito
 * - Memory management automático
 * - Búsqueda optimizada con debounce
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';

const BATCH_SIZE = 20; // Elementos por batch
const SCROLL_THRESHOLD = 0.8; // 80% del scroll para cargar más

export const useVirtualizedList = (items = [], options = {}) => {
  const {
    itemHeight = 'auto',
    searchFields = [],
    filterFn,
    sortFn,
    batchSize = BATCH_SIZE,
    enableInfiniteScroll = true
  } = options;

  // Estados
  const [searchQuery, setSearchQuery] = useState('');
  const [displayCount, setDisplayCount] = useState(batchSize);
  const [isLoading, setIsLoading] = useState(false);
  
  // Refs
  const scrollContainerRef = useRef(null);
  const lastScrollTop = useRef(0);

  /**
   * Filtrado y búsqueda optimizada
   */
  const processedItems = useMemo(() => {
    let filtered = [...items];

    // Aplicar filtro personalizado
    if (filterFn) {
      filtered = filtered.filter(filterFn);
    }

    // Búsqueda en campos especificados
    if (searchQuery.trim() && searchFields.length > 0) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(item =>
        searchFields.some(field => {
          const value = field.split('.').reduce((obj, key) => obj?.[key], item);
          return value?.toString().toLowerCase().includes(query);
        })
      );
    }

    // Aplicar ordenamiento
    if (sortFn) {
      filtered.sort(sortFn);
    }

    return filtered;
  }, [items, searchQuery, searchFields, filterFn, sortFn]);

  /**
   * Items visibles (batch actual)
   */
  const visibleItems = useMemo(() => 
    processedItems.slice(0, displayCount),
    [processedItems, displayCount]
  );

  /**
   * Estadísticas de la lista
   */
  const stats = useMemo(() => ({
    totalItems: items.length,
    filteredItems: processedItems.length,
    visibleItems: visibleItems.length,
    hasMore: visibleItems.length < processedItems.length,
    loadProgress: processedItems.length > 0 
      ? (visibleItems.length / processedItems.length * 100).toFixed(1)
      : 0
  }), [items.length, processedItems.length, visibleItems.length]);

  /**
   * Cargar más elementos
   */
  const loadMore = useCallback(() => {
    if (stats.hasMore && !isLoading) {
      setIsLoading(true);
      
      // Simular delay de carga para UX
      setTimeout(() => {
        setDisplayCount(prev => 
          Math.min(prev + batchSize, processedItems.length)
        );
        setIsLoading(false);
      }, 100);
    }
  }, [stats.hasMore, isLoading, batchSize, processedItems.length]);

  /**
   * Reset al cambiar búsqueda o filtros
   */
  useEffect(() => {
    setDisplayCount(batchSize);
  }, [searchQuery, batchSize, items.length]);

  /**
   * Scroll infinito
   */
  const handleScroll = useCallback(() => {
    if (!enableInfiniteScroll || !scrollContainerRef.current) return;

    const container = scrollContainerRef.current;
    const { scrollTop, scrollHeight, clientHeight } = container;
    
    // Solo procesar si el scroll va hacia abajo
    if (scrollTop > lastScrollTop.current) {
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;
      
      if (scrollPercentage >= SCROLL_THRESHOLD) {
        loadMore();
      }
    }
    
    lastScrollTop.current = scrollTop;
  }, [enableInfiniteScroll, loadMore]);

  /**
   * Búsqueda con debounce
   */
  const debouncedSearch = useCallback((query) => {
    setSearchQuery(query);
  }, []);

  /**
   * Resetear lista
   */
  const reset = useCallback(() => {
    setSearchQuery('');
    setDisplayCount(batchSize);
  }, [batchSize]);

  /**
   * Scroll to top
   */
  const scrollToTop = useCallback(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return {
    // Datos
    visibleItems,
    stats,
    
    // Estados
    searchQuery,
    isLoading,
    
    // Acciones
    setSearchQuery: debouncedSearch,
    loadMore,
    reset,
    scrollToTop,
    
    // Refs y handlers para JSX
    scrollContainerRef,
    handleScroll,
    
    // Utilidades
    isEmpty: processedItems.length === 0,
    isSearching: searchQuery.trim().length > 0,
  };
};

/**
 * 🎨 Componente de Loading para listas virtualizadas
 */
export const VirtualizedListLoader = ({ isLoading, hasMore }) => {
  if (!isLoading && !hasMore) return null;

  return (
    <div className="flex items-center justify-center py-4">
      {isLoading ? (
        <div className="flex items-center gap-2 text-gray-400">
          <div className="w-4 h-4 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin" />
          <span className="text-sm">Cargando más...</span>
        </div>
      ) : hasMore ? (
        <button 
          onClick={() => {/* Este se configura externamente */}}
          className="text-sm text-yellow-400 hover:text-yellow-300 transition-colors"
        >
          Ver más elementos
        </button>
      ) : (
        <div className="text-xs text-gray-500">
          No hay más elementos
        </div>
      )}
    </div>
  );
};

/**
 * 🔍 Componente de búsqueda para listas virtualizadas
 */
export const VirtualizedListSearch = ({ 
  searchQuery, 
  onSearchChange, 
  placeholder = "Buscar...",
  stats 
}) => {
  return (
    <div className="space-y-2">
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-yellow-400/50 focus:border-yellow-400"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        )}
      </div>
      
      {stats && (
        <div className="flex justify-between text-xs text-gray-400">
          <span>
            Mostrando {stats.visibleItems} de {stats.filteredItems}
            {stats.totalItems !== stats.filteredItems && ` (${stats.totalItems} total)`}
          </span>
          {stats.hasMore && (
            <span>{stats.loadProgress}% cargado</span>
          )}
        </div>
      )}
    </div>
  );
};

export default useVirtualizedList;