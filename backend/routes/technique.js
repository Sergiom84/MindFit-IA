import express from 'express';
import authenticateToken from '../middleware/auth.js';

const router = express.Router();

// Mock data para estadísticas de técnica (en producción vendría de la base de datos)
const MOCK_USER_STATS = {
  'user-1': {
    precision_promedio: '87%',
    sesiones_analizadas: 23,
    reduccion_errores: '34%',
    ejercicios_dominados: 5,
    mejoras: [
      'Mejor alineación en sentadillas',
      'Mayor profundidad en peso muerto',
      'Estabilidad mejorada en flexiones'
    ],
    errores_comunes: [
      'Tendencia a inclinar torso en sentadillas',
      'Activación insuficiente de core'
    ],
    progreso_semanal: [
      { semana: '2024-08-15', puntuacion: 78 },
      { semana: '2024-08-22', puntuacion: 82 },
      { semana: '2024-08-29', puntuacion: 87 }
    ]
  }
};

const DEFAULT_STATS = {
  precision_promedio: '—',
  sesiones_analizadas: 0,
  reduccion_errores: '—',
  ejercicios_dominados: 0,
  mejoras: [],
  errores_comunes: [],
  progreso_semanal: []
};

/**
 * GET /api/technique/stats
 * Obtener estadísticas de técnica del usuario
 */
router.get('/stats', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId; // Usar userId del token JWT
    
    // En un entorno real, aquí validarías el token JWT y obtendrías el userId real
    // Por ahora usamos datos mock
    const userStats = MOCK_USER_STATS[userId] || DEFAULT_STATS;

    // Simular algunos datos dinámicos
    const enhancedStats = {
      ...userStats,
      ultima_actualizacion: new Date().toISOString(),
      tendencia_general: userStats.sesiones_analizadas > 0 ? 'mejorando' : 'sin_datos',
      proxima_recomendacion: userStats.sesiones_analizadas > 0 
        ? 'Enfócate en mantener la activación de core durante todos los ejercicios'
        : 'Completa tu primera sesión de análisis para obtener recomendaciones personalizadas'
    };

    res.json({
      success: true,
      stats: enhancedStats,
      metadata: {
        userId,
        timestamp: new Date().toISOString(),
        data_source: 'mock' // En producción sería 'database'
      }
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas de técnica:', error);
    res.status(500).json({
      error: 'Error interno obteniendo estadísticas',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * POST /api/technique/session
 * Registrar una nueva sesión de análisis de técnica
 */
router.post('/session', authenticateToken, (req, res) => {
  try {
    const { exerciseId, puntuacion, errores_detectados, tiempo_sesion } = req.body;
    const userId = req.user.userId; // Usar userId del token JWT

    if (!exerciseId || puntuacion === undefined) {
      return res.status(400).json({
        error: 'Faltan parámetros requeridos: exerciseId, puntuacion',
        code: 'MISSING_PARAMETERS'
      });
    }

    // En producción, aquí guardarías los datos en la base de datos
    const sessionData = {
      id: `session_${Date.now()}`,
      userId,
      exerciseId,
      puntuacion,
      errores_detectados: errores_detectados || [],
      tiempo_sesion: tiempo_sesion || 0,
      timestamp: new Date().toISOString(),
      procesado: true
    };

    console.log('📊 Nueva sesión de técnica registrada:', sessionData);

    res.json({
      success: true,
      message: 'Sesión registrada correctamente',
      session: sessionData,
      metadata: {
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error registrando sesión de técnica:', error);
    res.status(500).json({
      error: 'Error interno registrando sesión',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/technique/history
 * Obtener historial de sesiones de análisis
 */
router.get('/history', authenticateToken, (req, res) => {
  try {
    const { limit = 10, exerciseId } = req.query;
    const userId = req.user.userId; // Usar userId del token JWT

    // Mock data para el historial
    const mockHistory = [
      {
        id: 'session_1',
        exerciseId: 'squat',
        exercise_name: 'Sentadilla',
        puntuacion: 85,
        errores_detectados: ['Rodillas ligeramente hacia adentro'],
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(), // hace 2 días
        duracion_minutos: 5
      },
      {
        id: 'session_2',
        exerciseId: 'deadlift',
        exercise_name: 'Peso Muerto',
        puntuacion: 78,
        errores_detectados: ['Barra ligeramente alejada', 'Activar más los glúteos'],
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(), // hace 5 días
        duracion_minutos: 8
      },
      {
        id: 'session_3',
        exerciseId: 'pushup',
        exercise_name: 'Flexión de Brazos',
        puntuacion: 92,
        errores_detectados: [],
        timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(), // hace 7 días
        duracion_minutos: 3
      }
    ];

    let history = [...mockHistory];

    // Filtrar por ejercicio si se especifica
    if (exerciseId) {
      history = history.filter(session => session.exerciseId === exerciseId);
    }

    // Aplicar límite
    const limitNum = parseInt(limit);
    if (limitNum > 0) {
      history = history.slice(0, limitNum);
    }

    res.json({
      success: true,
      history,
      metadata: {
        userId,
        total_sessions: history.length,
        filters_applied: {
          exerciseId: exerciseId || null,
          limit: limitNum
        },
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error obteniendo historial de técnica:', error);
    res.status(500).json({
      error: 'Error interno obteniendo historial',
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * GET /api/technique/recommendations
 * Obtener recomendaciones personalizadas de técnica
 */
router.get('/recommendations', authenticateToken, (req, res) => {
  try {
    const userId = req.user.userId; // Usar userId del token JWT

    // Mock recommendations basadas en el "análisis" del usuario
    const recommendations = [
      {
        id: 'rec_1',
        tipo: 'tecnica',
        prioridad: 'alta',
        titulo: 'Mejora la activación del core',
        descripcion: 'Enfócate en mantener el abdomen contraído durante todos los ejercicios, especialmente en sentadillas y peso muerto.',
        ejercicios_relacionados: ['squat', 'deadlift', 'plank'],
        recursos: [
          'Video: Activación correcta del core',
          'Ejercicios de fortalecimiento abdominal'
        ]
      },
      {
        id: 'rec_2',
        tipo: 'postura',
        prioridad: 'media',
        titulo: 'Alineación de rodillas en sentadillas',
        descripcion: 'Trabaja en mantener las rodillas alineadas con los pies durante el descenso.',
        ejercicios_relacionados: ['squat'],
        recursos: [
          'Ejercicios de movilidad de cadera',
          'Fortalecimiento de glúteo medio'
        ]
      },
      {
        id: 'rec_3',
        tipo: 'progresion',
        prioridad: 'baja',
        titulo: 'Aumenta el rango de movimiento',
        descripcion: 'Gradualmente trabaja en lograr mayor profundidad en tus ejercicios.',
        ejercicios_relacionados: ['squat', 'deadlift'],
        recursos: [
          'Rutina de movilidad diaria',
          'Ejercicios de flexibilidad específicos'
        ]
      }
    ];

    res.json({
      success: true,
      recommendations,
      metadata: {
        userId,
        total_recommendations: recommendations.length,
        generated_at: new Date().toISOString(),
        next_update: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // en 7 días
      }
    });

  } catch (error) {
    console.error('Error obteniendo recomendaciones:', error);
    res.status(500).json({
      error: 'Error interno obteniendo recomendaciones',
      code: 'INTERNAL_ERROR'
    });
  }
});

export default router;
