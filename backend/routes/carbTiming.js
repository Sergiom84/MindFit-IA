/**
 * CARBOHYDRATE TIMING ROUTES
 * Endpoints para timing de carbohidratos pre/post entreno
 *
 * VALOR PARA EL USUARIO:
 * - Saber EXACTAMENTE qué comer antes y después de entrenar
 * - Optimizar rendimiento y recuperación
 * - Ejemplos concretos de comidas, no solo números
 */

import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { pool } from '../db.js';
import {
  calculatePreWorkoutCarbs,
  calculatePostWorkoutCarbs,
  calculateDailyCarbDistribution
} from '../services/carbTiming.js';

const router = express.Router();

// ============================================================================
// POST /api/carb-timing/pre-workout
// Calcular carbohidratos pre-entreno
// ============================================================================
router.post('/pre-workout', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      methodology,
      session_intensity = 'media',
      session_duration = 60,
      hours_until_workout = 1.5
    } = req.body;

    // Obtener perfil nutricional del usuario
    const profileResult = await pool.query(
      `SELECT peso_kg, daily_target_kcal
       FROM app.nutrition_profiles
       WHERE user_id = $1`,
      [userId]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Perfil nutricional no encontrado. Crea tu perfil primero.'
      });
    }

    const profile = profileResult.rows[0];

    // Obtener distribución de macros actual
    const macrosResult = await pool.query(
      `SELECT carbs_g_base
       FROM app.nutrition_profiles
       WHERE user_id = $1`,
      [userId]
    );

    const dailyCarbTarget = macrosResult.rows[0]?.carbs_g_base || Math.round(profile.daily_target_kcal * 0.45 / 4);

    // Calcular recomendación pre-entreno
    const recommendation = calculatePreWorkoutCarbs({
      bodyWeight: profile.peso_kg,
      methodology: methodology || 'hipertrofia',
      sessionIntensity: session_intensity,
      sessionDuration: session_duration,
      timeUntilWorkout: hours_until_workout,
      dailyCarbTarget
    });

    res.json({
      success: true,
      user_profile: {
        weight_kg: profile.peso_kg,
        daily_carbs_target: dailyCarbTarget
      },
      session_context: {
        methodology,
        intensity: session_intensity,
        duration_min: session_duration,
        hours_until: hours_until_workout
      },
      recommendation
    });

  } catch (error) {
    console.error('Error calculando pre-entreno:', error);
    res.status(500).json({
      success: false,
      error: 'Error al calcular timing pre-entreno'
    });
  }
});

// ============================================================================
// POST /api/carb-timing/post-workout
// Calcular carbohidratos post-entreno
// ============================================================================
router.post('/post-workout', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      methodology,
      session_intensity = 'media',
      session_duration = 60,
      hours_since_workout = 0.5,  // Default: ventana anabólica
      volume_lifted = null
    } = req.body;

    // Obtener perfil
    const profileResult = await pool.query(
      `SELECT peso_kg, daily_target_kcal, carbs_g_base
       FROM app.nutrition_profiles
       WHERE user_id = $1`,
      [userId]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Perfil nutricional no encontrado'
      });
    }

    const profile = profileResult.rows[0];
    const dailyCarbTarget = profile.carbs_g_base || Math.round(profile.daily_target_kcal * 0.45 / 4);

    // Calcular recomendación post-entreno
    const recommendation = calculatePostWorkoutCarbs({
      bodyWeight: profile.peso_kg,
      methodology: methodology || 'hipertrofia',
      sessionIntensity: session_intensity,
      sessionDuration: session_duration,
      volumeLifted: volume_lifted,
      timeSinceWorkout: hours_since_workout,
      dailyCarbTarget
    });

    res.json({
      success: true,
      user_profile: {
        weight_kg: profile.peso_kg,
        daily_carbs_target: dailyCarbTarget
      },
      session_context: {
        methodology,
        intensity: session_intensity,
        duration_min: session_duration,
        hours_since: hours_since_workout,
        in_anabolic_window: hours_since_workout <= 0.5
      },
      recommendation
    });

  } catch (error) {
    console.error('Error calculando post-entreno:', error);
    res.status(500).json({
      success: false,
      error: 'Error al calcular timing post-entreno'
    });
  }
});

// ============================================================================
// POST /api/carb-timing/daily-distribution
// Calcular distribución completa del día
// ============================================================================
router.post('/daily-distribution', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      methodology,
      session_intensity = 'media',
      session_duration = 60,
      workout_time_of_day = 'afternoon',  // morning, afternoon, evening, night
      hours_until_workout = 2
    } = req.body;

    // Obtener perfil
    const profileResult = await pool.query(
      `SELECT peso_kg, daily_target_kcal, carbs_g_base
       FROM app.nutrition_profiles
       WHERE user_id = $1`,
      [userId]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Perfil nutricional no encontrado'
      });
    }

    const profile = profileResult.rows[0];
    const dailyCarbTarget = profile.carbs_g_base || Math.round(profile.daily_target_kcal * 0.45 / 4);

    // Calcular distribución del día
    const distribution = calculateDailyCarbDistribution({
      dailyCarbTarget,
      workoutTimeOfDay: workout_time_of_day,
      hasPreWorkoutMeal: true,
      hoursUntilWorkout: hours_until_workout,
      sessionParams: {
        bodyWeight: profile.peso_kg,
        methodology: methodology || 'hipertrofia',
        sessionIntensity: session_intensity,
        sessionDuration: session_duration
      }
    });

    res.json({
      success: true,
      user_profile: {
        weight_kg: profile.peso_kg,
        daily_carbs_target: dailyCarbTarget
      },
      workout_context: {
        time_of_day: workout_time_of_day,
        methodology,
        intensity: session_intensity,
        duration_min: session_duration
      },
      distribution
    });

  } catch (error) {
    console.error('Error calculando distribución diaria:', error);
    res.status(500).json({
      success: false,
      error: 'Error al calcular distribución de carbohidratos'
    });
  }
});

// ============================================================================
// GET /api/carb-timing/quick-guide
// Guía rápida de timing según metodología
// ============================================================================
router.get('/quick-guide', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { methodology = 'hipertrofia' } = req.query;

    // Obtener peso del usuario
    const profileResult = await pool.query(
      'SELECT peso_kg FROM app.nutrition_profiles WHERE user_id = $1',
      [userId]
    );

    const weight = profileResult.rows[0]?.peso_kg || 75; // Default 75kg

    // Guías simplificadas por metodología
    const guides = {
      hipertrofia: {
        name: 'Hipertrofia / Gym',
        pre_workout: {
          timing: '1-2 horas antes',
          carbs_g: Math.round(weight * 0.5),
          examples: ['Avena + plátano', 'Arroz basmati + pollo'],
          tip: 'Carbos moderados para energía sostenida'
        },
        post_workout: {
          timing: 'Primeros 30-60 min',
          carbs_g: Math.round(weight * 1.0),
          protein_g: Math.round(weight * 0.3),
          examples: ['Arroz blanco + pollo', 'Batido whey + dextrosa + plátano'],
          tip: '🔥 Ventana anabólica: carbos rápidos + proteína'
        }
      },
      calistenia: {
        name: 'Calistenia',
        pre_workout: {
          timing: '1-2 horas antes',
          carbs_g: Math.round(weight * 0.4),
          examples: ['Boniato + huevos', 'Pan integral + mermelada'],
          tip: 'Carbos moderados, no pesados para skills'
        },
        post_workout: {
          timing: 'Primeros 60 min',
          carbs_g: Math.round(weight * 0.8),
          protein_g: Math.round(weight * 0.3),
          examples: ['Patata + atún', 'Pasta + pavo'],
          tip: 'Reposición moderada-alta según intensidad'
        }
      },
      oposicion: {
        name: 'Oposiciones / CrossFit',
        pre_workout: {
          timing: '2-3 horas antes',
          carbs_g: Math.round(weight * 0.8),
          examples: ['Arroz + pechuga grande', 'Pasta + salmón'],
          tip: 'Alta carga de carbos para trabajo metabólico'
        },
        post_workout: {
          timing: 'Inmediatamente (primeros 30 min)',
          carbs_g: Math.round(weight * 1.2),
          protein_g: Math.round(weight * 0.3),
          examples: ['Batido recuperación + comida completa después', 'Arroz blanco + proteína + fruta'],
          tip: '🔥🔥 Máxima depleción: reposición agresiva necesaria'
        }
      },
      powerlifting: {
        name: 'Powerlifting / Fuerza',
        pre_workout: {
          timing: '2-3 horas antes',
          carbs_g: Math.round(weight * 0.8),
          examples: ['Arroz + carne', 'Boniato + huevos'],
          tip: 'Energía constante para levantamientos pesados'
        },
        post_workout: {
          timing: 'Primera hora',
          carbs_g: Math.round(weight * 0.8),
          protein_g: Math.round(weight * 0.35),
          examples: ['Arroz + bistec', 'Patata + huevos + salmón'],
          tip: 'Reposición moderada, énfasis en proteína'
        }
      }
    };

    const guide = guides[methodology] || guides.hipertrofia;

    res.json({
      success: true,
      methodology: guide.name,
      user_weight_kg: weight,
      pre_workout: guide.pre_workout,
      post_workout: guide.post_workout,
      general_tips: [
        'Los carbos rápidos (arroz blanco, patata, plátano) son IDEALES post-entreno',
        'No temas comer carbos de noche si entrenas tarde - son para recuperación',
        'La ventana anabólica existe: primeros 30-60 min post-entreno son clave',
        'Adapta las cantidades según tu sensación de energía y recuperación'
      ]
    });

  } catch (error) {
    console.error('Error obteniendo guía rápida:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener guía de timing'
    });
  }
});

// ============================================================================
// POST /api/carb-timing/session-completed
// Registrar sesión completada y calcular post-entreno automático
// ============================================================================
router.post('/session-completed', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      session_id,
      methodology,
      intensity,
      duration_min,
      volume_lifted
    } = req.body;

    // Obtener perfil
    const profileResult = await pool.query(
      `SELECT peso_kg, carbs_g_base, daily_target_kcal
       FROM app.nutrition_profiles
       WHERE user_id = $1`,
      [userId]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Perfil no encontrado'
      });
    }

    const profile = profileResult.rows[0];
    const dailyCarbTarget = profile.carbs_g_base || Math.round(profile.daily_target_kcal * 0.45 / 4);

    // Calcular post-entreno inmediatamente (ventana anabólica)
    const postWorkout = calculatePostWorkoutCarbs({
      bodyWeight: profile.peso_kg,
      methodology,
      sessionIntensity: intensity,
      sessionDuration: duration_min,
      volumeLifted: volume_lifted,
      timeSinceWorkout: 0.5,  // Asumimos recién terminado
      dailyCarbTarget
    });

    // Registrar en historial
    await pool.query(
      `INSERT INTO app.carb_timing_logs (
        user_id, session_id, methodology, intensity, duration_min,
        carbs_recommended, protein_recommended, timing_window, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        userId,
        session_id,
        methodology,
        intensity,
        duration_min,
        postWorkout.carbs_g,
        postWorkout.protein_g,
        'post_workout'
      ]
    ).catch(err => {
      // Tabla puede no existir, solo log
      console.log('Info: Tabla carb_timing_logs no existe (opcional)');
    });

    res.json({
      success: true,
      session_completed: true,
      post_workout_recommendation: postWorkout,
      message: postWorkout.urgency === 'high'
        ? '🔥 Ventana anabólica activa! Come AHORA para máxima recuperación'
        : 'Sesión completada. Consume tus carbos post-entreno en las próximas 2 horas.',
      urgency: postWorkout.urgency
    });

  } catch (error) {
    console.error('Error procesando sesión completada:', error);
    res.status(500).json({
      success: false,
      error: 'Error al procesar sesión'
    });
  }
});

export default router;
