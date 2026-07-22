/**
 * 📊 PROGRESS RE-EVALUATION SYSTEM
 * Sistema de re-evaluación periódica del progreso del usuario
 *
 * ENDPOINTS:
 * - POST   /api/progress/re-evaluation        - Guardar re-evaluación y obtener sugerencias de IA
 * - GET    /api/progress/re-evaluation/:id    - Obtener re-evaluación específica
 * - GET    /api/progress/re-evaluation-history - Historial de re-evaluaciones
 * - GET    /api/progress/key-exercises        - Ejercicios clave para re-evaluación
 * - GET    /api/progress/should-trigger       - Verificar si debe mostrar modal
 * - POST   /api/progress/apply-adjustments    - Aplicar ajustes sugeridos al plan
 * - GET    /api/progress/config               - Obtener configuración de re-evaluación del usuario
 * - PUT    /api/progress/config               - Actualizar configuración de re-evaluación
 *
 * @version 1.0.0 - Sistema de Re-evaluación Progresiva
 */

import express from 'express';
import authenticateToken from '../middleware/auth.js';
import { pool } from '../db.js';
import { getReEvaluatorForMethodology } from '../lib/aiReEvaluators/index.js';
import { getUserFullProfile } from '../services/routineGeneration/database/userRepository.js';

const router = express.Router();

// =============================================================================
// 🛡️ MIDDLEWARE: Todos los endpoints requieren autenticación
// =============================================================================

router.use(authenticateToken);

// =============================================================================
// 📥 POST /api/progress/re-evaluation
// Guardar re-evaluación y obtener sugerencias de IA
// =============================================================================

router.post('/re-evaluation', async (req, res) => {
  const {
    methodology,
    methodology_plan_id,
    week,
    sentiment,
    overall_comment,
    exercises = []
  } = req.body;

  const userId = req.user.userId;

  // Validación básica
  if (!methodology || !methodology_plan_id || !week) {
    return res.status(400).json({
      success: false,
      error: 'Faltan parámetros requeridos: methodology, methodology_plan_id, week'
    });
  }

  const client = await pool.connect();

  try {
    console.log(`📊 [RE-EVAL] Nueva re-evaluación: user=${userId}, plan=${methodology_plan_id}, week=${week}`);

    await client.query('BEGIN');

    // 1. Verificar que el plan pertenece al usuario
    const planCheck = await client.query(
      'SELECT id, plan_data FROM app.methodology_plans WHERE id = $1 AND user_id = $2',
      [methodology_plan_id, userId]
    );

    if (planCheck.rows.length === 0) {
      throw new Error('Plan no encontrado o no pertenece al usuario');
    }

    const planData = planCheck.rows[0].plan_data;

    // 2. Insertar re-evaluación principal
    const reEvalResult = await client.query(`
      INSERT INTO app.user_re_evaluations (
        user_id,
        methodology_plan_id,
        week_number,
        sentiment,
        overall_comment,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (methodology_plan_id, week_number)
      DO UPDATE SET
        sentiment = EXCLUDED.sentiment,
        overall_comment = EXCLUDED.overall_comment,
        created_at = NOW()
      RETURNING id
    `, [userId, methodology_plan_id, week, sentiment, overall_comment || null]);

    const reEvaluationId = reEvalResult.rows[0].id;
    console.log(`✅ [RE-EVAL] Re-evaluación guardada con ID: ${reEvaluationId}`);

    // 3. Insertar progreso de ejercicios
    if (exercises.length > 0) {
      // Eliminar ejercicios previos de esta re-evaluación
      await client.query(
        'DELETE FROM app.re_evaluation_exercises WHERE re_evaluation_id = $1',
        [reEvaluationId]
      );

      // Insertar nuevos ejercicios
      for (const ex of exercises) {
        if (ex.exercise_name) {
          await client.query(`
            INSERT INTO app.re_evaluation_exercises (
              re_evaluation_id,
              exercise_name,
              exercise_id,
              series_achieved,
              reps_achieved,
              difficulty_rating,
              notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            reEvaluationId,
            ex.exercise_name,
            ex.exercise_id || null,
            ex.series_achieved || null,
            ex.reps_achieved || null,
            ex.difficulty_rating || null,
            ex.notes || null
          ]);
        }
      }
      console.log(`✅ [RE-EVAL] ${exercises.length} ejercicios guardados`);
    }

    // 4. Obtener perfil del usuario
    const userProfile = await getUserFullProfile(userId);

    // 5. Llamar al re-evaluador de IA
    console.log(`🤖 [RE-EVAL] Llamando a re-evaluador de IA para ${methodology}`);

    const reEvaluator = getReEvaluatorForMethodology(methodology);
    const aiResponse = await reEvaluator.analyze({
      currentPlan: planData,
      userData: userProfile,
      reEvaluationData: {
        week,
        exercises,
        sentiment,
        comment: overall_comment
      }
    });

    console.log('✅ [RE-EVAL] Análisis de IA completado');

    // 6. Guardar sugerencias de IA
    const aiSuggestionsResult = await client.query(`
      INSERT INTO app.ai_adjustment_suggestions (
        re_evaluation_id,
        progress_assessment,
        intensity_change,
        volume_change,
        rest_modifications,
        suggested_progressions,
        ai_reasoning,
        motivational_feedback,
        warnings,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING id
    `, [
      reEvaluationId,
      aiResponse.progress_assessment || null,
      aiResponse.suggested_adjustments?.intensity_change || null,
      aiResponse.suggested_adjustments?.volume_change || null,
      aiResponse.suggested_adjustments?.rest_modifications || null,
      JSON.stringify(aiResponse.suggested_adjustments?.exercise_progressions || []),
      aiResponse.reasoning || null,
      aiResponse.motivational_feedback || null,
      aiResponse.warnings || []
    ]);

    console.log(`✅ [RE-EVAL] Sugerencias de IA guardadas con ID: ${aiSuggestionsResult.rows[0].id}`);

    await client.query('COMMIT');

    // Responder con datos completos
    res.json({
      success: true,
      re_evaluation_id: reEvaluationId,
      adjustments: aiResponse.suggested_adjustments,
      progress_assessment: aiResponse.progress_assessment,
      motivational_feedback: aiResponse.motivational_feedback,
      warnings: aiResponse.warnings,
      reasoning: aiResponse.reasoning
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [RE-EVAL] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error al procesar re-evaluación'
    });
  } finally {
    client.release();
  }
});

// =============================================================================
// 📊 GET /api/progress/key-exercises
// Obtener ejercicios clave del plan para re-evaluación
// =============================================================================

router.get('/key-exercises', async (req, res) => {
  const { methodology_plan_id, week } = req.query;
  const userId = req.user.userId;

  if (!methodology_plan_id) {
    return res.status(400).json({
      success: false,
      error: 'methodology_plan_id es requerido'
    });
  }

  try {
    // Obtener plan
    const planResult = await pool.query(
      'SELECT plan_data FROM app.methodology_plans WHERE id = $1 AND user_id = $2',
      [methodology_plan_id, userId]
    );

    if (planResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Plan no encontrado'
      });
    }

    const planData = planResult.rows[0].plan_data;
    const weekNumber = parseInt(week) || 1;

    // Extraer ejercicios de la semana específica
    const exercises = extractKeyExercisesFromWeek(planData, weekNumber);

    res.json({
      success: true,
      exercises
    });

  } catch (error) {
    console.error('❌ [KEY-EXERCISES] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =============================================================================
// 🔍 GET /api/progress/should-trigger
// Verificar si debe mostrarse el modal de re-evaluación
// =============================================================================

router.get('/should-trigger', async (req, res) => {
  const { methodology_plan_id, current_week } = req.query;
  const userId = req.user.userId;

  if (!methodology_plan_id || !current_week) {
    return res.status(400).json({
      success: false,
      error: 'methodology_plan_id y current_week son requeridos'
    });
  }

  try {
    const result = await pool.query(
      'SELECT app.should_trigger_re_evaluation($1, $2, $3) as should_trigger',
      [userId, methodology_plan_id, parseInt(current_week)]
    );

    const shouldTrigger = result.rows[0]?.should_trigger || false;

    // Obtener última re-evaluación si existe
    let lastReEval = null;
    if (shouldTrigger) {
      const lastResult = await pool.query(
        'SELECT * FROM app.get_last_re_evaluation($1)',
        [methodology_plan_id]
      );
      lastReEval = lastResult.rows[0] || null;
    }

    res.json({
      success: true,
      should_trigger: shouldTrigger,
      current_week: parseInt(current_week),
      last_re_evaluation: lastReEval
    });

  } catch (error) {
    console.error('❌ [SHOULD-TRIGGER] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =============================================================================
// 📜 GET /api/progress/re-evaluation-history
// Obtener historial de re-evaluaciones del usuario
// =============================================================================

router.get('/re-evaluation-history', async (req, res) => {
  const { methodology_plan_id } = req.query;
  const userId = req.user.userId;

  try {
    const query = methodology_plan_id
      ? `SELECT * FROM app.v_re_evaluation_history
         WHERE user_id = $1 AND methodology_plan_id = $2
         ORDER BY evaluation_date DESC`
      : `SELECT * FROM app.v_re_evaluation_history
         WHERE user_id = $1
         ORDER BY evaluation_date DESC`;

    const params = methodology_plan_id ? [userId, methodology_plan_id] : [userId];

    const result = await pool.query(query, params);

    res.json({
      success: true,
      history: result.rows
    });

  } catch (error) {
    console.error('❌ [HISTORY] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =============================================================================
// ⚙️ GET /api/progress/config
// Obtener configuración de re-evaluación del usuario
// =============================================================================

router.get('/config', async (req, res) => {
  const userId = req.user.userId;

  try {
    console.log(`⚙️ [CONFIG] Cargando configuración para user=${userId}`);

    const result = await pool.query(
      `SELECT
        frequency_weeks,
        auto_apply_suggestions,
        notification_enabled,
        reminder_days_before,
        updated_at,
        created_at
      FROM app.user_re_eval_config
      WHERE user_id = $1`,
      [userId]
    );

    // Si no existe configuración, crear una por defecto
    if (result.rows.length === 0) {
      console.log('⚙️ [CONFIG] No existe configuración, creando default');

      const insertResult = await pool.query(
        `INSERT INTO app.user_re_eval_config (
          user_id,
          frequency_weeks,
          auto_apply_suggestions,
          notification_enabled,
          reminder_days_before
        ) VALUES ($1, 3, false, true, 1)
        RETURNING *`,
        [userId]
      );

      return res.json({
        success: true,
        config: insertResult.rows[0]
      });
    }

    res.json({
      success: true,
      config: result.rows[0]
    });

  } catch (error) {
    console.error('❌ [CONFIG] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =============================================================================
// ⚙️ PUT /api/progress/config
// Actualizar configuración de re-evaluación del usuario
// =============================================================================

router.put('/config', async (req, res) => {
  const userId = req.user.userId;
  const {
    frequency_weeks,
    auto_apply_suggestions,
    notification_enabled,
    reminder_days_before
  } = req.body;

  // Validación
  if (frequency_weeks !== undefined) {
    const freq = parseInt(frequency_weeks);
    if (isNaN(freq) || freq < 1 || freq > 12) {
      return res.status(400).json({
        success: false,
        error: 'frequency_weeks debe estar entre 1 y 12'
      });
    }
  }

  try {
    console.log(`⚙️ [CONFIG] Actualizando configuración para user=${userId}`);

    // Construir query dinámicamente solo con campos proporcionados
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (frequency_weeks !== undefined) {
      updates.push(`frequency_weeks = $${paramCount}`);
      values.push(parseInt(frequency_weeks));
      paramCount++;
    }

    if (auto_apply_suggestions !== undefined) {
      updates.push(`auto_apply_suggestions = $${paramCount}`);
      values.push(Boolean(auto_apply_suggestions));
      paramCount++;
    }

    if (notification_enabled !== undefined) {
      updates.push(`notification_enabled = $${paramCount}`);
      values.push(Boolean(notification_enabled));
      paramCount++;
    }

    if (reminder_days_before !== undefined) {
      updates.push(`reminder_days_before = $${paramCount}`);
      values.push(parseInt(reminder_days_before));
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No se proporcionaron campos para actualizar'
      });
    }

    // Agregar updated_at automáticamente (el trigger lo hace, pero por si acaso)
    updates.push(`updated_at = NOW()`);
    values.push(userId);

    const query = `
      INSERT INTO app.user_re_eval_config (
        user_id,
        frequency_weeks,
        auto_apply_suggestions,
        notification_enabled,
        reminder_days_before
      ) VALUES ($${paramCount}, 3, false, true, 1)
      ON CONFLICT (user_id)
      DO UPDATE SET ${updates.join(', ')}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    console.log(`✅ [CONFIG] Configuración actualizada exitosamente`);

    res.json({
      success: true,
      config: result.rows[0],
      message: 'Configuración actualizada correctamente'
    });

  } catch (error) {
    console.error('❌ [CONFIG] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// =============================================================================
// 🔧 HELPER: Extraer ejercicios clave de una semana específica
// =============================================================================

export function extractKeyExercisesFromWeek(planData, weekNumber) {
  try {
    if (!planData || !Array.isArray(planData.semanas)) {
      return [];
    }

    // A3: el plan calistenia_v2 persiste las semanas con la clave `numero`
    // (CalisteniaService.js). Buscar solo por `semana`/`week` devolvía [] siempre y
    // el frontend caía a ejercicios hardcodeados. Aceptamos también `numero`.
    const week = planData.semanas.find(
      w => w.semana === weekNumber || w.week === weekNumber || w.numero === weekNumber
    );

    if (!week || !Array.isArray(week.sesiones)) {
      return [];
    }

    const allExercises = [];
    const exerciseMap = new Map();

    // Recopilar todos los ejercicios únicos de la semana
    week.sesiones.forEach(sesion => {
      if (Array.isArray(sesion.ejercicios)) {
        sesion.ejercicios.forEach(ej => {
          const key = ej.nombre?.toLowerCase() || ej.id;
          if (key && !exerciseMap.has(key)) {
            exerciseMap.set(key, {
              id: ej.id || key,
              nombre: ej.nombre || 'Ejercicio sin nombre',
              descripcion: ej.descripcion || null,
              series: ej.series || null,
              repeticiones: ej.repeticiones || null
            });
          }
        });
      }
    });

    // Convertir a array y limitar a los primeros 8 ejercicios más importantes
    return Array.from(exerciseMap.values()).slice(0, 8);

  } catch (error) {
    console.error('❌ Error extrayendo ejercicios:', error);
    return [];
  }
}

export default router;
