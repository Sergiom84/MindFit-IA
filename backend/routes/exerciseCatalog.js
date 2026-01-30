/**
 * 💪 Exercise Catalog - Catálogo Unificado de Ejercicios
 *
 * CONSOLIDACIÓN DE:
 * - exercises.js (ejercicios base y mock data)
 * - calisteniaExercises.js (ejercicios de calistenia desde BD)
 *
 * ENDPOINTS ORGANIZADOS:
 * - /api/exercise-catalog/search/* - Búsqueda y filtrado
 * - /api/exercise-catalog/categories/* - Categorías y clasificación
 * - /api/exercise-catalog/details/* - Detalles específicos
 * - /api/exercise-catalog/corrections/* - Análisis de técnica
 */

import express from 'express';
import authenticateToken from '../middleware/auth.js';
import { pool } from '../db.js';

const router = express.Router();

// ===============================================
// 🗃️ BASE DE DATOS MOCK PARA EJERCICIOS GENERALES
// ===============================================

const EXERCISES_DB = [
  {
    id: 'squat',
    slug: 'sentadilla',
    name: 'Sentadilla',
    categoria: 'piernas',
    common_errors: [
      'Rodillas hacia adentro (valgo)',
      'Inclinación excesiva del torso',
      'Falta de profundidad',
      'Peso en puntas de pies'
    ],
    key_points: [
      'Rodillas alineadas con pies',
      'Descender hasta ~90° de flexión',
      'Pecho erguido',
      'Peso en talones'
    ],
    musculos_principales: ['cuádriceps', 'glúteos'],
    dificultad: 'intermedio'
  },
  {
    id: 'deadlift',
    slug: 'peso-muerto',
    name: 'Peso Muerto',
    categoria: 'espalda',
    common_errors: [
      'Espalda redondeada',
      'Barra alejada del cuerpo',
      'Hiperextensión lumbar',
      'Rodillas bloqueadas prematuramente'
    ],
    key_points: [
      'Columna neutra',
      'Barra pegada al cuerpo',
      'Activar glúteos en la subida',
      'Extensión simultánea cadera-rodilla'
    ],
    musculos_principales: ['espalda baja', 'glúteos', 'isquiotibiales'],
    dificultad: 'avanzado'
  },
  {
    id: 'pushup',
    slug: 'flexion-brazos',
    name: 'Flexión de Brazos',
    categoria: 'pecho',
    common_errors: [
      'Cadera demasiado alta',
      'Rango de movimiento parcial',
      'Manos demasiado separadas',
      'Cabeza hacia adelante'
    ],
    key_points: [
      'Cuerpo en línea recta',
      'Pecho toca el suelo',
      'Manos a la altura del pecho',
      'Cuello neutro'
    ],
    musculos_principales: ['pectoral', 'tríceps', 'core'],
    dificultad: 'principiante'
  },
  {
    id: 'pullup',
    slug: 'dominada',
    name: 'Dominada',
    categoria: 'espalda',
    common_errors: [
      'Rango parcial de movimiento',
      'Balanceo excesivo',
      'Hombros hacia adelante',
      'Barbilla no pasa la barra'
    ],
    key_points: [
      'Rango completo de movimiento',
      'Hombros atrás y abajo',
      'Barbilla sobre la barra',
      'Descenso controlado'
    ],
    musculos_principales: ['dorsal', 'bíceps', 'romboides'],
    dificultad: 'avanzado'
  },
  {
    id: 'plank',
    slug: 'plancha',
    name: 'Plancha',
    categoria: 'core',
    common_errors: [
      'Cadera demasiado alta',
      'Cadera demasiado baja',
      'Cabeza hacia abajo',
      'Respiración bloqueada'
    ],
    key_points: [
      'Cuerpo en línea recta',
      'Cabeza neutra',
      'Respiración controlada',
      'Activación del core'
    ],
    musculos_principales: ['core', 'hombros', 'glúteos'],
    dificultad: 'principiante'
  }
];

// ===============================================
// 🔍 BÚSQUEDA Y FILTRADO
// ===============================================

/**
 * GET /api/exercise-catalog/search
 * Búsqueda unificada de ejercicios (mock + BD)
 */
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const {
      query,
      categoria,
      nivel,
      dificultad,
      equipamiento,
      musculos,
      source = 'all', // 'all', 'calistenia', 'general'
      limit = 50
    } = req.query;

    let results = [];

    // Buscar en ejercicios generales (mock)
    if (source === 'all' || source === 'general') {
      let mockResults = [...EXERCISES_DB];

      // Filtrar por query
      if (query) {
        const searchTerm = query.toLowerCase();
        mockResults = mockResults.filter(ex =>
          ex.name.toLowerCase().includes(searchTerm) ||
          ex.categoria.toLowerCase().includes(searchTerm) ||
          ex.musculos_principales.some(m => m.toLowerCase().includes(searchTerm))
        );
      }

      // Filtrar por categoría
      if (categoria) {
        mockResults = mockResults.filter(ex =>
          ex.categoria.toLowerCase() === categoria.toLowerCase()
        );
      }

      // Filtrar por dificultad
      if (dificultad) {
        mockResults = mockResults.filter(ex =>
          ex.dificultad.toLowerCase() === dificultad.toLowerCase()
        );
      }

      // Filtrar por músculos
      if (musculos) {
        const musculosArray = musculos.split(',').map(m => m.trim().toLowerCase());
        mockResults = mockResults.filter(ex =>
          musculosArray.some(muscle =>
            ex.musculos_principales.some(mp => mp.toLowerCase().includes(muscle))
          )
        );
      }

      results.push(...mockResults.map(ex => ({ ...ex, source: 'general' })));
    }

    // Buscar en ejercicios de calistenia (BD)
    if (source === 'all' || source === 'calistenia') {
      let calisteniaQuery = `
        SELECT
          exercise_id as id,
          nombre as name,
          categoria,
          nivel,
          equipamiento,
          patron,
          series_reps_objetivo,
          criterio_de_progreso,
          progresion_desde,
          progresion_hacia,
          notas
        FROM app."Ejercicios_Calistenia"
        WHERE 1=1
      `;

      const params = [];
      let paramCount = 0;

      // Filtros para calistenia
      if (query) {
        paramCount++;
        calisteniaQuery += ` AND LOWER(nombre) LIKE $${paramCount}`;
        params.push(`%${query.toLowerCase()}%`);
      }

      if (categoria) {
        paramCount++;
        calisteniaQuery += ` AND LOWER(categoria) = $${paramCount}`;
        params.push(categoria.toLowerCase());
      }

      if (nivel) {
        paramCount++;
        calisteniaQuery += ` AND LOWER(nivel) = $${paramCount}`;
        params.push(nivel.toLowerCase());
      }

      if (equipamiento) {
        paramCount++;
        calisteniaQuery += ` AND LOWER(equipamiento) = $${paramCount}`;
        params.push(equipamiento.toLowerCase());
      }

      calisteniaQuery += ` ORDER BY nombre LIMIT ${parseInt(limit)}`;

      const calisteniaResult = await pool.query(calisteniaQuery, params);

      results.push(...calisteniaResult.rows.map(ex => ({
        ...ex,
        source: 'calistenia',
        dificultad: ex.nivel, // Mapear nivel a dificultad para consistencia
        musculos_principales: ex.patron ? [ex.patron] : []
      })));
    }

    // Limitar resultados totales
    results = results.slice(0, parseInt(limit));

    res.json({
      success: true,
      exercises: results,
      total: results.length,
      filters: {
        query,
        categoria,
        nivel,
        dificultad,
        equipamiento,
        musculos,
        source
      }
    });

  } catch (error) {
    console.error('Error buscando ejercicios:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/exercise-catalog/search/by-name/:name
 * Buscar ejercicio específico por nombre
 */
router.get('/search/by-name/:name', authenticateToken, async (req, res) => {
  try {
    const { name } = req.params;
    const searchName = name.toLowerCase();

    // Buscar en calistenia BD
    const calisteniaResult = await pool.query(
      `SELECT * FROM app."Ejercicios_Calistenia"
       WHERE LOWER(nombre) = $1 OR LOWER(exercise_id::text) = $1
       LIMIT 1`,
      [searchName]
    );

    // Buscar en hipertrofia BD
    const hipertrofiaResult = await pool.query(
      `SELECT * FROM app."Ejercicios_Hipertrofia"
       WHERE LOWER(nombre) = $1 OR LOWER(exercise_id::text) = $1
       LIMIT 1`,
      [searchName]
    );

    // Buscar en mock data (fallback)
    const mockExercise = EXERCISES_DB.find(ex =>
      ex.name.toLowerCase() === searchName ||
      ex.slug === searchName ||
      ex.id === searchName
    );

    const exercise =
      (hipertrofiaResult.rows[0] ? {
        ...hipertrofiaResult.rows[0],
        name: hipertrofiaResult.rows[0].nombre,
        source: 'hipertrofia'
      } : null) ||
      (calisteniaResult.rows[0] ? {
        ...calisteniaResult.rows[0],
        name: calisteniaResult.rows[0].nombre,
        source: 'calistenia'
      } : null) ||
      mockExercise;

    if (!exercise) {
      return res.status(404).json({
        success: false,
        error: 'Ejercicio no encontrado'
      });
    }

    res.json({
      success: true,
      exercise
    });

  } catch (error) {
    console.error('Error buscando ejercicio por nombre:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// ===============================================
// 📋 CATEGORÍAS Y CLASIFICACIÓN
// ===============================================

/**
 * GET /api/exercise-catalog/categories
 * Obtener todas las categorías disponibles
 */
router.get('/categories', authenticateToken, async (req, res) => {
  try {
    // Categorías de mock data
    const mockCategories = [...new Set(EXERCISES_DB.map(ex => ex.categoria))];

    // Categorías de calistenia
    const calisteniaResult = await pool.query(
      'SELECT DISTINCT categoria FROM app."Ejercicios_Calistenia" WHERE categoria IS NOT NULL'
    );
    const calisteniaCategories = calisteniaResult.rows.map(row => row.categoria);

    // Combinar y deduplicar
    const allCategories = [...new Set([...mockCategories, ...calisteniaCategories])];

    res.json({
      success: true,
      categories: allCategories.sort()
    });

  } catch (error) {
    console.error('Error obteniendo categorías:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/exercise-catalog/categories/:category
 * Obtener ejercicios de una categoría específica
 */
router.get('/categories/:category', authenticateToken, async (req, res) => {
  try {
    const { category } = req.params;
    const { limit = 20 } = req.query;

    // Ejercicios mock de la categoría
    const mockExercises = EXERCISES_DB.filter(ex =>
      ex.categoria.toLowerCase() === category.toLowerCase()
    );

    // Ejercicios de calistenia de la categoría
    const calisteniaResult = await pool.query(
      `SELECT * FROM app."Ejercicios_Calistenia"
       WHERE LOWER(categoria) = $1
       ORDER BY nombre
       LIMIT $2`,
      [category.toLowerCase(), parseInt(limit)]
    );

    const results = [
      ...mockExercises.map(ex => ({ ...ex, source: 'general' })),
      ...calisteniaResult.rows.map(ex => ({
        ...ex,
        name: ex.nombre,
        source: 'calistenia'
      }))
    ];

    res.json({
      success: true,
      category,
      exercises: results.slice(0, parseInt(limit)),
      total: results.length
    });

  } catch (error) {
    console.error('Error obteniendo ejercicios por categoría:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// ===============================================
// 📖 DETALLES ESPECÍFICOS
// ===============================================

/**
 * GET /api/exercise-catalog/details/:id
 * Obtener detalles completos de un ejercicio
 */
router.get('/details/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Buscar en mock data
    const mockExercise = EXERCISES_DB.find(ex => ex.id === id || ex.slug === id);

    // Buscar en calistenia BD
    const calisteniaResult = await pool.query(
      'SELECT * FROM app."Ejercicios_Calistenia" WHERE exercise_id = $1 OR id = $2 LIMIT 1',
      [id, id]
    );

    let exercise = null;

    if (mockExercise) {
      exercise = { ...mockExercise, source: 'general' };
    } else if (calisteniaResult.rows[0]) {
      const calistenia = calisteniaResult.rows[0];
      exercise = {
        id: calistenia.exercise_id,
        name: calistenia.nombre,
        categoria: calistenia.categoria,
        nivel: calistenia.nivel,
        equipamiento: calistenia.equipamiento,
        patron: calistenia.patron,
        series_reps_objetivo: calistenia.series_reps_objetivo,
        criterio_de_progreso: calistenia.criterio_de_progreso,
        progresion_desde: calistenia.progresion_desde,
        progresion_hacia: calistenia.progresion_hacia,
        notas: calistenia.notas,
        dificultad: calistenia.nivel,
        source: 'calistenia'
      };
    }

    if (!exercise) {
      return res.status(404).json({
        success: false,
        error: 'Ejercicio no encontrado'
      });
    }

    res.json({
      success: true,
      exercise
    });

  } catch (error) {
    console.error('Error obteniendo detalles del ejercicio:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

/**
 * GET /api/exercise-catalog/details/:id/progressions
 * Obtener progresiones de un ejercicio de calistenia
 */
router.get('/details/:id/progressions', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Buscar progresiones desde este ejercicio
    const progressionsResult = await pool.query(
      `SELECT
         progresion_hacia as next_exercise,
         progresion_desde as previous_exercise,
         nombre,
         nivel,
         criterio_de_progreso
       FROM app."Ejercicios_Calistenia"
       WHERE exercise_id = $1 OR progresion_desde = $1 OR progresion_hacia = $1`,
      [id]
    );

    const currentExercise = progressionsResult.rows.find(row =>
      row.exercise_id === id
    );

    const nextExercises = progressionsResult.rows.filter(row =>
      currentExercise?.progresion_hacia &&
      row.exercise_id === currentExercise.progresion_hacia
    );

    const previousExercises = progressionsResult.rows.filter(row =>
      currentExercise?.progresion_desde &&
      row.exercise_id === currentExercise.progresion_desde
    );

    res.json({
      success: true,
      progression: {
        current: currentExercise,
        next: nextExercises,
        previous: previousExercises,
        progression_criteria: currentExercise?.criterio_de_progreso
      }
    });

  } catch (error) {
    console.error('Error obteniendo progresiones:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// ===============================================
// 🔧 ANÁLISIS DE TÉCNICA Y CORRECCIONES
// ===============================================

/**
 * GET /api/exercise-catalog/corrections/:exerciseId
 * Obtener errores comunes y puntos clave para un ejercicio
 */
router.get('/corrections/:exerciseId', authenticateToken, async (req, res) => {
  try {
    const { exerciseId } = req.params;

    // Buscar en mock data primero
    const mockExercise = EXERCISES_DB.find(ex =>
      ex.id === exerciseId || ex.slug === exerciseId
    );

    if (mockExercise) {
      return res.json({
        success: true,
        exercise: mockExercise.name,
        technique_analysis: {
          common_errors: mockExercise.common_errors,
          key_points: mockExercise.key_points,
          musculos_principales: mockExercise.musculos_principales,
          dificultad: mockExercise.dificultad
        }
      });
    }

    // Si no está en mock data, buscar en calistenia
    const calisteniaResult = await pool.query(
      'SELECT nombre, notas, nivel, patron FROM app."Ejercicios_Calistenia" WHERE exercise_id = $1',
      [exerciseId]
    );

    if (calisteniaResult.rows[0]) {
      const exercise = calisteniaResult.rows[0];
      return res.json({
        success: true,
        exercise: exercise.nombre,
        technique_analysis: {
          notas: exercise.notas,
          patron_movimiento: exercise.patron,
          nivel: exercise.nivel,
          source: 'calistenia'
        }
      });
    }

    res.status(404).json({
      success: false,
      error: 'Análisis de técnica no disponible para este ejercicio'
    });

  } catch (error) {
    console.error('Error obteniendo análisis de técnica:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// ===============================================
// 📊 ESTADÍSTICAS Y MÉTRICAS
// ===============================================

/**
 * GET /api/exercise-catalog/stats
 * Obtener estadísticas del catálogo de ejercicios
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    // Contar ejercicios mock
    const mockStats = {
      total: EXERCISES_DB.length,
      by_category: EXERCISES_DB.reduce((acc, ex) => {
        acc[ex.categoria] = (acc[ex.categoria] || 0) + 1;
        return acc;
      }, {}),
      by_difficulty: EXERCISES_DB.reduce((acc, ex) => {
        acc[ex.dificultad] = (acc[ex.dificultad] || 0) + 1;
        return acc;
      }, {})
    };

    // Contar ejercicios de calistenia
    const calisteniaStatsResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE categoria IS NOT NULL) as with_category,
        COUNT(*) FILTER (WHERE nivel IS NOT NULL) as with_level
      FROM app."Ejercicios_Calistenia"
    `);

    const calisteniaCategoryResult = await pool.query(`
      SELECT categoria, COUNT(*) as count
      FROM app."Ejercicios_Calistenia"
      WHERE categoria IS NOT NULL
      GROUP BY categoria
      ORDER BY count DESC
    `);

    const calisteniaLevelResult = await pool.query(`
      SELECT nivel, COUNT(*) as count
      FROM app."Ejercicios_Calistenia"
      WHERE nivel IS NOT NULL
      GROUP BY nivel
      ORDER BY count DESC
    `);

    const calisteniaStats = calisteniaStatsResult.rows[0];
    const calisteniaCategoryStats = calisteniaCategoryResult.rows.reduce((acc, row) => {
      acc[row.categoria] = parseInt(row.count);
      return acc;
    }, {});
    const calisteniaLevelStats = calisteniaLevelResult.rows.reduce((acc, row) => {
      acc[row.nivel] = parseInt(row.count);
      return acc;
    }, {});

    res.json({
      success: true,
      catalog_stats: {
        general_exercises: mockStats,
        calistenia_exercises: {
          total: parseInt(calisteniaStats.total),
          with_category: parseInt(calisteniaStats.with_category),
          with_level: parseInt(calisteniaStats.with_level),
          by_category: calisteniaCategoryStats,
          by_level: calisteniaLevelStats
        },
        total_catalog: parseInt(calisteniaStats.total) + mockStats.total
      }
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// ===============================================
// 🔗 ALIASES DE COMPATIBILIDAD
// ===============================================

// Mantener compatibilidad con rutas legacy
router.use('/calistenia', (req, res, next) => {
  req.url = '/search?source=calistenia' + (req.url !== '/' ? req.url : '');
  next();
});

router.use('/exercises', (req, res, next) => {
  req.url = '/search' + (req.url !== '/' ? req.url : '');
  next();
});

export default router;
