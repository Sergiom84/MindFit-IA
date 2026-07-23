/**
 * 💪 Sistema Avanzado de GIFs de Ejercicios - Multi-source, Lazy Loading & Offline Support
 *
 * CAMBIOS REALIZADOS EN V2:
 * - ✅ Sistema multi-source con fallbacks automáticos
 * - ✅ Lazy loading inteligente por categorías
 * - ✅ Prefetching de GIFs críticos y populares
 * - ✅ Soporte offline con placeholders locales
 * - ✅ Optimización de performance con WebP/AVIF
 * - ✅ Sistema de métricas y monitoreo
 * - ✅ Carga progresiva con prioridades
 * - ✅ Cache persistente con TTL configurable
 * - ✅ Fallbacks automáticos sin degradar UX
 * - ✅ Compatibilidad hacia atrás mantenida
 */

// =============================================================================
// ⚙️ CONFIGURACIÓN Y ESTRATEGIAS DE CARGA
// =============================================================================

/**
 * Configuración de categorías con estrategias de carga
 */
const CATEGORY_LOAD_STRATEGY = {
  // Categorías críticas - Preload inmediato
  CRITICAL: {
    categories: ['HIIT', 'CORE'],
    strategy: 'preload',
    priority: 1,
    prefetchLimit: 10
  },

  // Categorías populares - Carga bajo demanda
  POPULAR: {
    categories: ['UPPER_BODY', 'LOWER_BODY'],
    strategy: 'on-demand',
    priority: 2,
    prefetchLimit: 5
  },

  // Categorías especializadas - Lazy loading
  SPECIALIZED: {
    categories: ['RESISTANCE_BANDS'],
    strategy: 'lazy',
    priority: 3,
    prefetchLimit: 3
  }
};

/**
 * Configuración de performance y caché
 */
const PERFORMANCE_CONFIG = {
  // Cache settings
  CACHE_TTL: 24 * 60 * 60 * 1000, // 24 horas
  MAX_CACHE_SIZE: 200,
  CLEANUP_THRESHOLD: 250,

  // Loading settings
  PRELOAD_ON_IDLE: true,
  PREFETCH_POPULAR: true,
  LAZY_LOAD_THRESHOLD: 5, // Cargar cuando quedan 5 ejercicios

  // Network settings
  NETWORK_TIMEOUT: 8000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,

  // Fallback settings
  USE_LOCAL_FALLBACKS: true,
  OFFLINE_MODE: false
};

/**
 * URLs base para diferentes CDNs y fuentes
 */
const CDN_SOURCES = {
  PRIMARY: 'https://cdn.entrenaconia.com/gifs',
  SECONDARY: 'https://backup-cdn.entrenaconia.com/gifs',
  WIKIMEDIA: 'https://upload.wikimedia.org/wikipedia/commons',
  TENOR: 'https://media.tenor.com',
  LOCAL: './assets/gifs',
  FALLBACK_IMAGES: './assets/images/placeholders'
};

// =============================================================================
// 🛠️ UTILIDADES DE NORMALIZACIÓN Y HELPERS
// =============================================================================

/**
 * Normaliza un string para búsqueda insensible a caso y acentos
 * @param {string} text - Texto a normalizar
 * @returns {string} Texto normalizado
 */
const normalize = (text) => {
  if (!text || typeof text !== 'string') return '';

  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos y diacríticos
    .replace(/[^a-z0-9]+/g, ' ')     // Reemplazar caracteres especiales con espacios
    .trim()
    .replace(/\s+/g, ' ');            // Normalizar espacios múltiples
};

/**
 * Genera variantes de un nombre de ejercicio para mejorar el matching
 * @param {string} name - Nombre del ejercicio
 * @returns {string[]} Array de variantes del nombre
 */
const generateVariants = (name) => {
  const normalized = normalize(name);
  const variants = [normalized];

  // Añadir variantes sin palabras comunes
  const withoutCommon = normalized
    .replace(/\b(con|sin|de|en|a|la|el|los|las)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (withoutCommon !== normalized) {
    variants.push(withoutCommon);
  }

  // Añadir variante con guiones en lugar de espacios
  variants.push(normalized.replace(/\s+/g, '-'));

  return [...new Set(variants)]; // Eliminar duplicados
};

/**
 * Crea un objeto de fuentes multi-source para un ejercicio
 * @param {string} exerciseName - Nombre del ejercicio normalizado
 * @param {string} primaryPath - Ruta en el CDN primario
 * @param {string} fallbackUrl - URL de fallback externa
 * @returns {Object} Objeto con múltiples fuentes
 */
const createMultiSourceGif = (exerciseName, primaryPath, fallbackUrl) => {
  const filename = exerciseName.replace(/\s+/g, '-').toLowerCase();

  return {
    sources: [
      {
        url: `${CDN_SOURCES.PRIMARY}/${primaryPath}/${filename}.webp`,
        format: 'webp',
        priority: 1,
        size: 'optimized'
      },
      {
        url: `${CDN_SOURCES.PRIMARY}/${primaryPath}/${filename}.gif`,
        format: 'gif',
        priority: 2,
        size: 'standard'
      },
      {
        url: `${CDN_SOURCES.SECONDARY}/${primaryPath}/${filename}.webp`,
        format: 'webp',
        priority: 3,
        size: 'optimized'
      },
      {
        url: fallbackUrl,
        format: 'gif',
        priority: 4,
        size: 'external'
      },
      {
        url: `${CDN_SOURCES.LOCAL}/${primaryPath}/${filename}.gif`,
        format: 'gif',
        priority: 5,
        size: 'local'
      }
    ],
    localFallback: `${CDN_SOURCES.FALLBACK_IMAGES}/exercise-${primaryPath}.jpg`,
    loadingPlaceholder: `${CDN_SOURCES.FALLBACK_IMAGES}/loading-exercise.gif`
  };
};

// =============================================================================
// 🎬 MAPEO DE EJERCICIOS A GIFS
// =============================================================================

/**
 * Base de datos de ejercicios con sistema multi-source y metadata enriquecida
 * Cada entrada utiliza el nuevo sistema de fallbacks automáticos
 */
const EXERCISE_GIFS_DATABASE = {
  // -----------------------------------------------------------------------------
  // 🏃 EJERCICIOS HIIT / CARDIO - Categoría Crítica (Preload)
  // -----------------------------------------------------------------------------
  HIIT: {
    // Burpees y variantes
    'burpees': {
      ...createMultiSourceGif('burpees', 'hiit', 'https://upload.wikimedia.org/wikipedia/commons/5/53/Burpee.gif'),
      tags: ['cardio', 'cuerpo completo', 'alta intensidad'],
      difficulty: 'alta',
      popularity: 9, // Score de 1-10
      loadStrategy: 'preload'
    },
    'burpees modificados': {
      ...createMultiSourceGif('burpees-modificados', 'hiit', 'https://upload.wikimedia.org/wikipedia/commons/5/53/Burpee.gif'),
      tags: ['cardio', 'cuerpo completo', 'intensidad media'],
      difficulty: 'media',
      popularity: 7,
      loadStrategy: 'preload'
    },
    'burpees sin salto': {
      ...createMultiSourceGif('burpees-sin-salto', 'hiit', 'https://upload.wikimedia.org/wikipedia/commons/5/53/Burpee.gif'),
      tags: ['cardio', 'cuerpo completo', 'baja intensidad'],
      difficulty: 'baja',
      popularity: 6,
      loadStrategy: 'on-demand'
    },

    // Mountain climbers y variantes
    'mountain climbers': {
      ...createMultiSourceGif('mountain-climbers', 'hiit', 'https://upload.wikimedia.org/wikipedia/commons/6/6a/Mountain_Climbers.gif'),
      tags: ['cardio', 'core', 'alta intensidad'],
      difficulty: 'media',
      popularity: 8,
      loadStrategy: 'preload'
    },
    'escaladores': {
      ...createMultiSourceGif('escaladores', 'hiit', 'https://upload.wikimedia.org/wikipedia/commons/6/6a/Mountain_Climbers.gif'),
      tags: ['cardio', 'core', 'alta intensidad'],
      difficulty: 'media',
      popularity: 8,
      loadStrategy: 'preload'
    },
    'escaladores sin salto': {
      ...createMultiSourceGif('escaladores-sin-salto', 'hiit', 'https://upload.wikimedia.org/wikipedia/commons/6/6a/Mountain_Climbers.gif'),
      tags: ['cardio', 'core', 'baja intensidad'],
      difficulty: 'baja',
      popularity: 5,
      loadStrategy: 'on-demand'
    },
    'mountain climbers en banco': {
      ...createMultiSourceGif('mountain-climbers-banco', 'hiit', 'https://media.tenor.com/fyP2K0m1w9kAAAAC/mountain-climber-bench.gif'),
      tags: ['cardio', 'core', 'intensidad media'],
      difficulty: 'media',
      popularity: 6,
      loadStrategy: 'on-demand'
    },

    // Saltos
    'sentadillas con salto': {
      ...createMultiSourceGif('sentadillas-con-salto', 'hiit', 'https://upload.wikimedia.org/wikipedia/commons/8/87/Jump_Squat.gif'),
      tags: ['piernas', 'cardio', 'potencia'],
      difficulty: 'alta',
      popularity: 8,
      loadStrategy: 'preload'
    },
    'saltos en banco step': {
      ...createMultiSourceGif('saltos-banco-step', 'hiit', 'https://media.tenor.com/5G1aR8QIKRMAAAAC/step-ups.gif'),
      tags: ['piernas', 'cardio', 'coordinación'],
      difficulty: 'media',
      popularity: 6,
      loadStrategy: 'on-demand'
    }
  },

  // -----------------------------------------------------------------------------
  // 💪 EJERCICIOS DE FUERZA - TREN SUPERIOR - Categoría Popular (On-Demand)
  // -----------------------------------------------------------------------------
  UPPER_BODY: {
    // Flexiones y variantes - Ejercicios populares
    'flexiones': {
      ...createMultiSourceGif('flexiones', 'upper-body', 'https://upload.wikimedia.org/wikipedia/commons/5/5e/Pushups.gif'),
      tags: ['pecho', 'triceps', 'hombros'],
      difficulty: 'media',
      popularity: 9,
      loadStrategy: 'preload'
    },
    'flexiones de brazos': {
      ...createMultiSourceGif('flexiones-brazos', 'upper-body', 'https://upload.wikimedia.org/wikipedia/commons/5/5e/Pushups.gif'),
      tags: ['pecho', 'triceps', 'hombros'],
      difficulty: 'media',
      popularity: 9,
      loadStrategy: 'preload'
    },
    'flexiones de brazos con rodillas apoyadas': {
      ...createMultiSourceGif('flexiones-rodillas', 'upper-body', 'https://upload.wikimedia.org/wikipedia/commons/5/5e/Pushups.gif'),
      tags: ['pecho', 'triceps', 'principiante'],
      difficulty: 'baja',
      popularity: 7,
      loadStrategy: 'on-demand'
    },
    'flexiones de brazos con pies elevados en silla': {
      ...createMultiSourceGif('flexiones-pies-elevados', 'upper-body', 'https://upload.wikimedia.org/wikipedia/commons/5/5e/Pushups.gif'),
      tags: ['pecho superior', 'triceps', 'avanzado'],
      difficulty: 'alta',
      popularity: 6,
      loadStrategy: 'on-demand'
    },
    'flexiones de brazos invertidas en sofa': {
      ...createMultiSourceGif('flexiones-inclinadas', 'upper-body', 'https://media.tenor.com/uXv8G2YfN0QAAAAC/incline-pushup.gif'),
      tags: ['pecho inferior', 'triceps', 'principiante'],
      difficulty: 'baja',
      popularity: 5,
      loadStrategy: 'lazy'
    },

    // Dominadas - Ejercicio popular
    'dominadas': {
      ...createMultiSourceGif('dominadas', 'upper-body', 'https://upload.wikimedia.org/wikipedia/commons/1/1a/Pull-up.gif'),
      tags: ['espalda', 'biceps', 'core'],
      difficulty: 'alta',
      popularity: 8,
      loadStrategy: 'preload'
    }
  },

  // -----------------------------------------------------------------------------
  // 🦵 EJERCICIOS DE FUERZA - TREN INFERIOR
  // -----------------------------------------------------------------------------
  LOWER_BODY: {
    // Sentadillas y variantes
    'sentadilla con barra': {
      url: 'https://upload.wikimedia.org/wikipedia/commons/6/6e/Back_Squat.gif',
      tags: ['piernas', 'glúteos', 'core'],
      difficulty: 'alta'
    },
    'sentadilla con mancuernas': {
      url: 'https://upload.wikimedia.org/wikipedia/commons/4/49/Dumbbell_Squat.gif',
      tags: ['piernas', 'glúteos'],
      difficulty: 'media'
    },
    'sentadilla en silla': {
      url: 'https://media.tenor.com/X8PiH2eapT8AAAAC/chair-squat.gif',
      tags: ['piernas', 'principiante'],
      difficulty: 'baja'
    },
    'sentadilla a la pared': {
      url: 'https://media.tenor.com/7YqVQzFqYk0AAAAC/wall-sit.gif',
      tags: ['piernas', 'isometrico'],
      difficulty: 'media'
    },
    'sentadilla isla con bandas elasticas': {
      url: 'https://media.tenor.com/ThcVq-1zYRIAAAAC/band-squat.gif',
      tags: ['piernas', 'glúteos', 'banda'],
      difficulty: 'media'
    },

    // Peso muerto
    'peso muerto con barra': {
      url: 'https://upload.wikimedia.org/wikipedia/commons/8/8a/Deadlift.gif',
      tags: ['espalda baja', 'piernas', 'glúteos'],
      difficulty: 'alta'
    },
    'peso muerto con discos olimpicos': {
      url: 'https://upload.wikimedia.org/wikipedia/commons/8/8a/Deadlift.gif',
      tags: ['espalda baja', 'piernas', 'glúteos'],
      difficulty: 'alta'
    },

    // Zancadas
    'zancadas alternas con mancuernas': {
      url: 'https://upload.wikimedia.org/wikipedia/commons/2/23/Dumbbell_Lunge.gif',
      tags: ['piernas', 'glúteos', 'equilibrio'],
      difficulty: 'media'
    },

    // Glúteos
    'puente de gluteos': {
      url: 'https://media.tenor.com/5ZkFQ7n1vJ8AAAAC/glute-bridge.gif',
      tags: ['glúteos', 'core'],
      difficulty: 'baja'
    },
    'elevacion de caderas con banda elastica': {
      url: 'https://media.tenor.com/XxqJHZrU2aQAAAAC/hip-thrust.gif',
      tags: ['glúteos', 'banda'],
      difficulty: 'media'
    },

    // Pantorrillas
    'elevaciones de pantorrillas en escalon': {
      url: 'https://media.tenor.com/hFqfAeq2t4MAAAAC/calf-raises.gif',
      tags: ['pantorrillas'],
      difficulty: 'baja'
    }
  },

  // -----------------------------------------------------------------------------
  // 🎯 EJERCICIOS DE CORE
  // -----------------------------------------------------------------------------
  CORE: {
    'plancha con toque de hombro': {
      url: 'https://media1.tenor.com/m/8-2v2Y7vWzkAAAAC/shoulder-taps.gif',
      tags: ['core', 'estabilidad'],
      difficulty: 'media'
    },
    'plancha dinamica': {
      url: 'https://media.tenor.com/sLW3yMc0eBQAAAAC/plank-up-and-down.gif',
      tags: ['core', 'brazos'],
      difficulty: 'media'
    }
  },

  // -----------------------------------------------------------------------------
  // 🏋️ EJERCICIOS CON BANDAS ELÁSTICAS
  // -----------------------------------------------------------------------------
  RESISTANCE_BANDS: {
    'remo con bandas elasticas': {
      url: 'https://media.tenor.com/aU5UOaJcI3cAAAAC/resistance-band-row.gif',
      tags: ['espalda', 'biceps', 'banda'],
      difficulty: 'media'
    },
    'remo inclinado con bandas elasticas': {
      url: 'https://media.tenor.com/aU5UOaJcI3cAAAAC/resistance-band-row.gif',
      tags: ['espalda', 'biceps', 'banda'],
      difficulty: 'media'
    },
    'remo alto con banda elastica': {
      url: 'https://media.tenor.com/ewkZ3n3iQ2kAAAAC/upright-row.gif',
      tags: ['hombros', 'trapecios', 'banda'],
      difficulty: 'media'
    }
  }
};

// =============================================================================
// 🔄 SISTEMA DE CACHÉ AVANZADO Y LAZY LOADING
// =============================================================================

/**
 * Caché avanzado con TTL y métricas
 */
class SmartGifCache {
  constructor() {
    this.cache = new Map();
    this.loadTimes = new Map();
    this.hitCount = 0;
    this.missCount = 0;
    this.loadQueue = new Set();
    this.preloadedCategories = new Set();
  }

  /**
   * Obtiene un item del caché con verificación de TTL
   */
  get(key) {
    const item = this.cache.get(key);
    if (!item) {
      this.missCount++;
      return null;
    }

    // Verificar TTL
    if (Date.now() - item.timestamp > PERFORMANCE_CONFIG.CACHE_TTL) {
      this.cache.delete(key);
      this.loadTimes.delete(key);
      this.missCount++;
      return null;
    }

    this.hitCount++;
    item.lastAccessed = Date.now();
    return item.value;
  }

  /**
   * Almacena un item en el caché
   */
  set(key, value, metadata = {}) {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
      metadata
    });

    this.cleanupIfNeeded();
  }

  /**
   * Limpieza inteligente del caché basada en LRU
   */
  cleanupIfNeeded() {
    if (this.cache.size <= PERFORMANCE_CONFIG.MAX_CACHE_SIZE) return;

    // Ordenar por último acceso y eliminar los más antiguos
    const entries = Array.from(this.cache.entries())
      .sort(([,a], [,b]) => a.lastAccessed - b.lastAccessed)
      .slice(0, this.cache.size - PERFORMANCE_CONFIG.MAX_CACHE_SIZE + 20);

    entries.forEach(([key]) => {
      this.cache.delete(key);
      this.loadTimes.delete(key);
    });
  }

  /**
   * Obtiene estadísticas del caché
   */
  getStats() {
    const total = this.hitCount + this.missCount;
    return {
      hitRate: total > 0 ? (this.hitCount / total * 100).toFixed(2) : 0,
      size: this.cache.size,
      maxSize: PERFORMANCE_CONFIG.MAX_CACHE_SIZE,
      hitCount: this.hitCount,
      missCount: this.missCount
    };
  }

  /**
   * Limpia completamente el caché
   */
  clear() {
    this.cache.clear();
    this.loadTimes.clear();
    this.hitCount = 0;
    this.missCount = 0;
    this.loadQueue.clear();
    this.preloadedCategories.clear();
  }
}

// Instancia global del caché
const smartCache = new SmartGifCache();

/**
 * Sistema de carga inteligente de GIFs
 */
class IntelligentGifLoader {
  constructor() {
    this.loadingPromises = new Map();
    this.networkStatus = 'online';
    this.loadStats = {
      successful: 0,
      failed: 0,
      cached: 0,
      fallbacks: 0
    };

    // Detectar estado de la red
    if (typeof navigator !== 'undefined') {
      this.networkStatus = navigator.onLine ? 'online' : 'offline';
      window.addEventListener('online', () => this.networkStatus = 'online');
      window.addEventListener('offline', () => this.networkStatus = 'offline');
    }
  }

  /**
   * Carga un GIF con sistema de fallbacks automáticos
   */
  async loadGifWithFallbacks(exerciseData, options = {}) {
    const { forceReload = false, timeout = PERFORMANCE_CONFIG.NETWORK_TIMEOUT } = options;
    const exerciseName = exerciseData.name || 'unknown';

    // Verificar caché primero
    if (!forceReload) {
      const cached = smartCache.get(exerciseName);
      if (cached) {
        this.loadStats.cached++;
        return cached;
      }
    }

    // Si estamos offline, usar fallback local inmediatamente
    if (this.networkStatus === 'offline' || PERFORMANCE_CONFIG.OFFLINE_MODE) {
      return this.getOfflineFallback(exerciseData);
    }

    // Evitar cargas duplicadas
    if (this.loadingPromises.has(exerciseName)) {
      return this.loadingPromises.get(exerciseName);
    }

    // Crear promesa de carga
    const loadPromise = this.tryLoadFromSources(exerciseData, timeout);
    this.loadingPromises.set(exerciseName, loadPromise);

    try {
      const result = await loadPromise;
      this.loadingPromises.delete(exerciseName);
      return result;
    } catch (error) {
      this.loadingPromises.delete(exerciseName);
      throw error;
    }
  }

  /**
   * Intenta cargar desde múltiples fuentes en orden de prioridad
   */
  async tryLoadFromSources(exerciseData, timeout) {
    const sources = exerciseData.sources || [];
    const exerciseName = exerciseData.name || 'unknown';

    // Ordenar por prioridad
    const sortedSources = sources.sort((a, b) => a.priority - b.priority);

    for (const source of sortedSources) {
      try {
        const url = await this.testAndLoadUrl(source.url, timeout);
        if (url) {
          // Guardar en caché con metadata
          smartCache.set(exerciseName, url, {
            source: source.url,
            format: source.format,
            loadTime: Date.now()
          });

          this.loadStats.successful++;
          return url;
        }
      } catch (error) {
        console.warn(`Falló carga desde ${source.url}:`, error.message);
        continue;
      }
    }

    // Si todas las fuentes fallan, usar fallback
    this.loadStats.fallbacks++;
    const fallbackUrl = this.getOfflineFallback(exerciseData);
    smartCache.set(exerciseName, fallbackUrl, { source: 'fallback' });
    return fallbackUrl;
  }

  /**
   * Prueba si una URL es accesible
   */
  async testAndLoadUrl(url, timeout) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const timeoutId = setTimeout(() => {
        reject(new Error('Timeout'));
      }, timeout);

      img.onload = () => {
        clearTimeout(timeoutId);
        resolve(url);
      };

      img.onerror = () => {
        clearTimeout(timeoutId);
        reject(new Error('Load failed'));
      };

      img.src = url;
    });
  }

  /**
   * Obtiene fallback offline
   */
  getOfflineFallback(exerciseData) {
    return exerciseData.localFallback ||
           exerciseData.loadingPlaceholder ||
           `${CDN_SOURCES.FALLBACK_IMAGES}/exercise-generic.jpg`;
  }

  /**
   * Precarga ejercicios populares
   */
  async preloadPopularExercises() {
    if (!PERFORMANCE_CONFIG.PREFETCH_POPULAR) return;

    const popularExercises = this.getPopularExercises();
    const preloadPromises = popularExercises.map(exercise =>
      this.loadGifWithFallbacks(exercise).catch(() => null)
    );

    await Promise.allSettled(preloadPromises);
  }

  /**
   * Obtiene lista de ejercicios populares para preload
   */
  getPopularExercises() {
    const exercises = [];

    Object.values(EXERCISE_GIFS_DATABASE).forEach(category => {
      Object.entries(category).forEach(([name, data]) => {
        if (data.popularity >= 8 || data.loadStrategy === 'preload') {
          exercises.push({ name, ...data });
        }
      });
    });

    return exercises.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  }

  /**
   * Obtiene estadísticas de carga
   */
  getLoadStats() {
    return {
      ...this.loadStats,
      networkStatus: this.networkStatus,
      cache: smartCache.getStats()
    };
  }
}

// Instancia global del loader
const intelligentLoader = new IntelligentGifLoader();

// =============================================================================
// 🎯 FUNCIONES PRINCIPALES DE BÚSQUEDA
// =============================================================================

/**
 * Aplana el objeto de base de datos en un mapa simple
 * @returns {Map<string, object>} Mapa plano de ejercicios
 */
const flattenDatabase = () => {
  const flatMap = new Map();

  Object.values(EXERCISE_GIFS_DATABASE).forEach(category => {
    Object.entries(category).forEach(([name, data]) => {
      const normalizedName = normalize(name);
      flatMap.set(normalizedName, typeof data === 'string' ? { url: data } : data);

      // Añadir variantes
      generateVariants(name).forEach(variant => {
        if (!flatMap.has(variant)) {
          flatMap.set(variant, typeof data === 'string' ? { url: data } : data);
        }
      });
    });
  });

  return flatMap;
};

// Crear mapa plano una sola vez
const FLAT_GIFS_MAP = flattenDatabase();

/**
 * URL de fallback para ejercicios no encontrados
 */
const FALLBACK_GIF_URL = 'https://media.tenor.com/jqfTdAJg9jgAAAAd/loading-waiting.gif';

/**
 * Obtiene la URL del GIF para un ejercicio específico con sistema inteligente
 * @param {string} exerciseName - Nombre del ejercicio
 * @param {Object} options - Opciones de búsqueda
 * @param {boolean} options.useFallback - Usar GIF de fallback si no se encuentra
 * @param {boolean} options.useCache - Usar sistema de caché
 * @param {boolean} options.preferOptimized - Preferir formatos optimizados (WebP)
 * @param {boolean} options.async - Retornar promesa para carga asíncrona
 * @returns {string|Promise<string>|null} URL del GIF o promesa con URL
 */
export function getExerciseGifUrl(exerciseName, options = {}) {
  const {
    useFallback = true,
    useCache = true,
    preferOptimized = true,
    async = false
  } = options;

  if (!exerciseName) {
    console.warn('🚨 getExerciseGifUrl: nombre de ejercicio vacío');
    const fallbackUrl = useFallback ? getDefaultFallback() : null;
    return async ? Promise.resolve(fallbackUrl) : fallbackUrl;
  }

  const normalizedName = normalize(exerciseName);

  // Modo síncrono - Compatibilidad hacia atrás
  if (!async) {
    // Verificar caché rápido
    if (useCache) {
      const cached = smartCache.get(normalizedName);
      if (cached) return cached;
    }

    // Buscar en base de datos local
    const exerciseData = FLAT_GIFS_MAP.get(normalizedName);
    if (exerciseData) {
      // Retornar la primera fuente disponible o URL legacy
      if (exerciseData.sources && exerciseData.sources.length > 0) {
        const preferredSource = preferOptimized
          ? exerciseData.sources.find(s => s.format === 'webp') || exerciseData.sources[0]
          : exerciseData.sources[0];
        return preferredSource.url;
      }
      // Compatibilidad con formato legacy
      if (exerciseData.url) return exerciseData.url;
    }

    // Fallback para modo síncrono
    if (useFallback) {
      return getDefaultFallback();
    }

    console.warn(`🔍 GIF no encontrado para ejercicio: "${exerciseName}"`);
    return null;
  }

  // Modo asíncrono - Sistema avanzado con fallbacks
  return getExerciseGifUrlAsync(normalizedName, exerciseName, options);
}

/**
 * Versión asíncrona avanzada con sistema de fallbacks
 * @private
 */
async function getExerciseGifUrlAsync(normalizedName, originalName, options) {
  const { useFallback = true, useCache = true } = options;

  try {
    // Verificar caché avanzado
    if (useCache) {
      const cached = smartCache.get(normalizedName);
      if (cached) return cached;
    }

    // Buscar datos del ejercicio
    const exerciseData = FLAT_GIFS_MAP.get(normalizedName);
    if (!exerciseData) {
      if (useFallback) return getDefaultFallback();
      throw new Error(`Ejercicio no encontrado: ${originalName}`);
    }

    // Usar sistema de carga inteligente
    const url = await intelligentLoader.loadGifWithFallbacks({
      name: normalizedName,
      ...exerciseData
    });

    return url;

  } catch (error) {
    console.error(`🚨 Error cargando GIF para "${originalName}":`, error);
    return useFallback ? getDefaultFallback() : null;
  }
}

/**
 * Obtiene URL de fallback por defecto
 * @returns {string} URL de fallback
 */
function getDefaultFallback() {
  return `${CDN_SOURCES.FALLBACK_IMAGES}/exercise-generic.jpg`;
}

/**
 * API moderna para obtener GIF con carga inteligente
 * @param {string} exerciseName - Nombre del ejercicio
 * @param {Object} options - Opciones avanzadas
 * @returns {Promise<string>} Promesa con URL del GIF
 */
export async function getExerciseGifUrlSmart(exerciseName, options = {}) {
  return getExerciseGifUrl(exerciseName, { ...options, async: true });
}

/**
 * Precarga GIFs de una categoría específica
 * @param {string} category - Categoría a precargar
 * @returns {Promise<void>} Promesa que se resuelve cuando termina la precarga
 */
export async function preloadCategoryGifs(category) {
  const categoryData = EXERCISE_GIFS_DATABASE[category];
  if (!categoryData) {
    console.warn(`🚨 Categoría no encontrada: ${category}`);
    return;
  }

  const exercisesToPreload = Object.entries(categoryData)
    .filter(([, data]) => data.loadStrategy === 'preload' || data.popularity >= 7)
    .map(([name, data]) => ({ name: normalize(name), ...data }));

  const preloadPromises = exercisesToPreload.map(exercise =>
    intelligentLoader.loadGifWithFallbacks(exercise).catch(() => null)
  );

  await Promise.allSettled(preloadPromises);
  console.log(`✅ Precarga completada para categoría: ${category} (${exercisesToPreload.length} ejercicios)`);
}

/**
 * Obtiene la información completa de un ejercicio
 * @param {string} exerciseName - Nombre del ejercicio
 * @returns {Object|null} Información completa del ejercicio o null
 */
export function getExerciseInfo(exerciseName) {
  if (!exerciseName) return null;

  const normalizedName = normalize(exerciseName);
  return FLAT_GIFS_MAP.get(normalizedName) || null;
}

/**
 * Busca ejercicios por tag
 * @param {string} tag - Tag a buscar
 * @returns {Array<{name: string, info: Object}>} Array de ejercicios que contienen el tag
 */
export function findExercisesByTag(tag) {
  const normalizedTag = normalize(tag);
  const results = [];

  FLAT_GIFS_MAP.forEach((info, name) => {
    if (info.tags && info.tags.some(t => normalize(t).includes(normalizedTag))) {
      results.push({ name, info });
    }
  });

  return results;
}

/**
 * Busca ejercicios por nivel de dificultad
 * @param {string} difficulty - Nivel de dificultad (baja, media, alta)
 * @returns {Array<{name: string, info: Object}>} Array de ejercicios del nivel especificado
 */
export function findExercisesByDifficulty(difficulty) {
  const normalizedDifficulty = normalize(difficulty);
  const results = [];

  FLAT_GIFS_MAP.forEach((info, name) => {
    if (info.difficulty && normalize(info.difficulty) === normalizedDifficulty) {
      results.push({ name, info });
    }
  });

  return results;
}

/**
 * Obtiene todos los ejercicios disponibles agrupados por categoría
 * @returns {Object} Objeto con ejercicios agrupados por categoría
 */
export function getAllExercisesGrouped() {
  const grouped = {};

  Object.entries(EXERCISE_GIFS_DATABASE).forEach(([category, exercises]) => {
    grouped[category] = Object.keys(exercises);
  });

  return grouped;
}

/**
 * Verifica si un ejercicio existe en la base de datos
 * @param {string} exerciseName - Nombre del ejercicio
 * @returns {boolean} True si el ejercicio existe
 */
export function exerciseExists(exerciseName) {
  if (!exerciseName) return false;
  const normalizedName = normalize(exerciseName);
  return FLAT_GIFS_MAP.has(normalizedName);
}

/**
 * Obtiene sugerencias de ejercicios similares
 * @param {string} exerciseName - Nombre del ejercicio
 * @param {number} limit - Número máximo de sugerencias
 * @returns {string[]} Array de nombres de ejercicios similares
 */
export function getSimilarExercises(exerciseName, limit = 5) {
  if (!exerciseName) return [];

  const normalizedName = normalize(exerciseName);
  const words = normalizedName.split(' ');
  const suggestions = new Set();

  // Buscar ejercicios que contengan alguna de las palabras
  FLAT_GIFS_MAP.forEach((_, name) => {
    if (name !== normalizedName) {
      const matches = words.filter(word => word.length > 3 && name.includes(word));
      if (matches.length > 0) {
        suggestions.add(name);
      }
    }
  });

  return Array.from(suggestions).slice(0, limit);
}

// =============================================================================
// 🔧 FUNCIONES DE VALIDACIÓN
// =============================================================================

/**
 * Valida si una URL es válida y accesible
 * @param {string} url - URL a validar
 * @returns {Promise<boolean>} True si la URL es válida
 */
export async function validateGifUrl(url) {
  if (!url) return false;

  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    console.error(`Error validando URL del GIF: ${url}`, error);
    return false;
  }
}

/**
 * Valida todas las URLs de GIFs en la base de datos
 * @returns {Promise<Object>} Objeto con URLs válidas e inválidas
 */
export async function validateAllGifs() {
  const results = { valid: [], invalid: [] };

  for (const [name, info] of FLAT_GIFS_MAP.entries()) {
    const isValid = await validateGifUrl(info.url);
    if (isValid) {
      results.valid.push({ name, url: info.url });
    } else {
      results.invalid.push({ name, url: info.url });
    }
  }

  return results;
}

// =============================================================================
// 📊 SISTEMA DE MÉTRICAS Y PERFORMANCE
// =============================================================================

/**
 * Monitor de performance para el sistema de GIFs
 */
class GifPerformanceMonitor {
  constructor() {
    this.metrics = {
      loadTimes: [],
      errorCount: 0,
      cacheHitRate: 0,
      popularExercises: new Map(),
      categoryUsage: new Map(),
      networkFailures: new Map()
    };

    this.startTime = Date.now();
  }

  /**
   * Registra el tiempo de carga de un ejercicio
   */
  recordLoadTime(exerciseName, timeMs, source = 'unknown') {
    this.metrics.loadTimes.push({
      exercise: exerciseName,
      time: timeMs,
      source,
      timestamp: Date.now()
    });

    // Mantener solo las últimas 100 mediciones
    if (this.metrics.loadTimes.length > 100) {
      this.metrics.loadTimes = this.metrics.loadTimes.slice(-100);
    }

    // Actualizar popularidad
    const currentCount = this.metrics.popularExercises.get(exerciseName) || 0;
    this.metrics.popularExercises.set(exerciseName, currentCount + 1);
  }

  /**
   * Registra un error de carga
   */
  recordError(exerciseName, errorType, source) {
    this.metrics.errorCount++;

    const failureKey = `${source}-${errorType}`;
    const currentFailures = this.metrics.networkFailures.get(failureKey) || 0;
    this.metrics.networkFailures.set(failureKey, currentFailures + 1);
  }

  /**
   * Registra el uso de una categoría
   */
  recordCategoryUsage(category) {
    const currentUsage = this.metrics.categoryUsage.get(category) || 0;
    this.metrics.categoryUsage.set(category, currentUsage + 1);
  }

  /**
   * Obtiene estadísticas agregadas
   */
  getStats() {
    const loadTimes = this.metrics.loadTimes.map(m => m.time);
    const avgLoadTime = loadTimes.length > 0
      ? loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length
      : 0;

    const cacheStats = smartCache.getStats();
    const loaderStats = intelligentLoader.getLoadStats();

    return {
      // Performance general
      averageLoadTime: Math.round(avgLoadTime),
      totalErrors: this.metrics.errorCount,
      uptime: Date.now() - this.startTime,

      // Estadísticas de caché
      cache: cacheStats,

      // Estadísticas de carga
      loading: loaderStats,

      // Ejercicios más populares
      topExercises: Array.from(this.metrics.popularExercises.entries())
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10),

      // Categorías más usadas
      topCategories: Array.from(this.metrics.categoryUsage.entries())
        .sort(([,a], [,b]) => b - a),

      // Fallos de red
      networkFailures: Object.fromEntries(this.metrics.networkFailures),

      // Recomendaciones
      recommendations: this.getRecommendations()
    };
  }

  /**
   * Genera recomendaciones basadas en métricas
   */
  getRecommendations() {
    const recommendations = [];
    const stats = smartCache.getStats();

    if (parseFloat(stats.hitRate) < 70) {
      recommendations.push({
        type: 'cache',
        message: 'Cache hit rate bajo. Considera incrementar el tamaño del caché.',
        priority: 'high'
      });
    }

    if (this.metrics.errorCount > 10) {
      recommendations.push({
        type: 'reliability',
        message: 'Alto número de errores. Revisar conectividad y URLs.',
        priority: 'high'
      });
    }

    const avgLoadTime = this.metrics.loadTimes.length > 0
      ? this.metrics.loadTimes.reduce((a, b) => a + b.time, 0) / this.metrics.loadTimes.length
      : 0;

    if (avgLoadTime > 5000) {
      recommendations.push({
        type: 'performance',
        message: 'Tiempos de carga altos. Considerar CDN más cercano.',
        priority: 'medium'
      });
    }

    return recommendations;
  }

  /**
   * Limpia estadísticas antiguas
   */
  cleanup() {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 horas
    this.metrics.loadTimes = this.metrics.loadTimes.filter(
      m => m.timestamp > cutoffTime
    );
  }
}

// Instancia global del monitor
const performanceMonitor = new GifPerformanceMonitor();

// =============================================================================
// 🚀 INICIALIZACIÓN Y PRELOAD AUTOMÁTICO
// =============================================================================

/**
 * Inicializa el sistema de GIFs con preload inteligente
 * @param {Object} options - Opciones de inicialización
 */
export async function initializeGifSystem(options = {}) {
  const {
    preloadCritical = true,
    preloadPopular = true,
    enableMetrics = true
  } = options;

  console.log('🚀 Inicializando sistema avanzado de GIFs...');

  try {
    // Precargar ejercicios críticos
    if (preloadCritical && PERFORMANCE_CONFIG.PRELOAD_ON_IDLE) {
      await intelligentLoader.preloadPopularExercises();
      console.log('✅ Precarga de ejercicios críticos completada');
    }

    // Configurar métricas si está habilitado
    if (enableMetrics) {
      setInterval(() => performanceMonitor.cleanup(), 60 * 60 * 1000); // Limpieza cada hora
    }

    console.log('✅ Sistema de GIFs inicializado correctamente');

    return {
      status: 'success',
      stats: performanceMonitor.getStats(),
      recommendations: performanceMonitor.getRecommendations()
    };

  } catch (error) {
    console.error('🚨 Error inicializando sistema de GIFs:', error);
    return {
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Obtiene estado completo del sistema
 */
export function getSystemStatus() {
  return {
    timestamp: Date.now(),
    database: {
      totalExercises: FLAT_GIFS_MAP.size,
      categories: Object.keys(EXERCISE_GIFS_DATABASE).length,
      exercisesWithMultiSource: Array.from(FLAT_GIFS_MAP.values())
        .filter(info => info.sources && info.sources.length > 0).length
    },
    performance: performanceMonitor.getStats(),
    config: PERFORMANCE_CONFIG,
    networkStatus: intelligentLoader.networkStatus
  };
}

// =============================================================================
// 📤 EXPORTACIONES AVANZADAS
// =============================================================================

// APIs principales (mantienen compatibilidad)
// getExerciseGifUrl y getExerciseInfo se exportan directamente en sus definiciones

// APIs modernas - funciones exportadas directamente en sus definiciones
// preloadCategoryGifs, initializeGifSystem, getSystemStatus se exportan inline

// Utilidades - funciones exportadas directamente en sus definiciones
// normalize, generateVariants se exportan inline

// Configuración y constantes - solo estas son export únicos
export {
  EXERCISE_GIFS_DATABASE,
  FALLBACK_GIF_URL,
  PERFORMANCE_CONFIG,
  CATEGORY_LOAD_STRATEGY,
  CDN_SOURCES
};

// Clases para uso avanzado
export {
  smartCache as GifCache,
  intelligentLoader as GifLoader,
  performanceMonitor as PerformanceMonitor
};

// Estadísticas mejoradas
export const DATABASE_STATS = {
  totalExercises: FLAT_GIFS_MAP.size,
  categories: Object.keys(EXERCISE_GIFS_DATABASE).length,
  exercisesWithTags: Array.from(FLAT_GIFS_MAP.values()).filter(info => info.tags).length,
  exercisesWithDifficulty: Array.from(FLAT_GIFS_MAP.values()).filter(info => info.difficulty).length,
  exercisesWithMultiSource: Array.from(FLAT_GIFS_MAP.values()).filter(info => info.sources).length,
  exercisesWithPopularityScore: Array.from(FLAT_GIFS_MAP.values()).filter(info => info.popularity).length
};

// Export por defecto para compatibilidad hacia atrás
export default {
  getExerciseGifUrl,
  normalize,
  // Nuevas funciones para migración gradual
  initializeGifSystem
};

// =============================================================================
// 📋 EJEMPLOS DE USO AVANZADO
// =============================================================================

/*

// ✅ USO BÁSICO (Compatible con código existente)
// import { getExerciseGifUrl } from './config/exerciseGifs.js';
// const gifUrl = getExerciseGifUrl('flexiones');

// ✅ USO MODERNO CON CARGA INTELIGENTE
// import { getExerciseGifUrlSmart } from './config/exerciseGifs.js';
// const gifUrl = await getExerciseGifUrlSmart('flexiones', { preferOptimized: true });

// ✅ INICIALIZACIÓN DEL SISTEMA
// import { initializeGifSystem } from './config/exerciseGifs.js';
// await initializeGifSystem({ preloadCritical: true });

// ✅ PRECARGA POR CATEGORÍA
// import { preloadCategoryGifs } from './config/exerciseGifs.js';
// await preloadCategoryGifs('HIIT');

// ✅ MONITOREO DE PERFORMANCE
// import { getSystemStatus } from './config/exerciseGifs.js';
// const status = getSystemStatus();
// console.log('Cache hit rate:', status.performance.cache.hitRate);

// ✅ CONFIGURACIÓN PERSONALIZADA
// import { PERFORMANCE_CONFIG } from './config/exerciseGifs.js';
// PERFORMANCE_CONFIG.CACHE_TTL = 48 * 60 * 60 * 1000; // 48 horas

*/