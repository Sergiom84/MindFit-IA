/**
 * Rutas API para el Sistema de Perfil Metabolico
 * Endpoints para cuestionario, evaluacion y configuracion
 */

import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  METABOLIC_QUESTIONS,
  processMetabolicEvaluation,
  getProfileDescription,
  MACRO_DISTRIBUTIONS
} from '../services/metabolicProfileCalculator.js';

const router = express.Router();

// ============================================================================
// GET /api/metabolic-profile/questionnaire
// Obtiene la estructura del cuestionario para el frontend
// ============================================================================
router.get('/questionnaire', authenticateToken, (req, res) => {
  try {
    const questionnaire = METABOLIC_QUESTIONS.map(q => ({
      id: q.id,
      text: q.text,
      category: q.category,
      // No enviamos el score al frontend por seguridad
    }));

    res.json({
      success: true,
      questionnaire,
      totalQuestions: questionnaire.length,
      instructions: 'Responde cada pregunta con "si", "no" o "no_se" segun tu experiencia habitual.'
    });
  } catch (error) {
    console.error('Error obteniendo cuestionario:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// ============================================================================
// POST /api/metabolic-profile/evaluate
// Procesa las respuestas del cuestionario y calcula el perfil
// ============================================================================
router.post('/evaluate', authenticateToken, async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.id;
    const { answers, objectiveData } = req.body;

    // Validar que hay respuestas
    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Se requieren respuestas del cuestionario'
      });
    }

    // Obtener perfil nutricional del usuario
    const profileResult = await client.query(
      `SELECT np.*, up.peso, up.objetivo_principal
       FROM app.nutrition_profiles np
       LEFT JOIN app.user_profiles up ON np.user_id = up.user_id
       WHERE np.user_id = $1`,
      [userId]
    );

    if (profileResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Debes configurar tu perfil nutricional antes de evaluar tu perfil metabolico'
      });
    }

    const nutritionProfile = profileResult.rows[0];

    // Construir perfil de usuario para el calculador
    const userProfile = {
      peso_kg: nutritionProfile.peso_kg || nutritionProfile.peso || 70,
      objetivo: nutritionProfile.objetivo || 'mant',
      training_type: nutritionProfile.training_type || 'general',
      kcal_objetivo: nutritionProfile.kcal_objetivo,
      tdee: nutritionProfile.tdee,
      level: nutritionProfile.level || nutritionProfile.nivel_entrenamiento
    };

    // Obtener evaluacion actual si existe
    const currentEvalResult = await client.query(
      `SELECT me.*, mc.consecutive_change_count, mc.pending_profile_change
       FROM app.user_metabolic_evaluations me
       LEFT JOIN app.user_metabolic_config mc ON me.user_id = mc.user_id
       WHERE me.user_id = $1 AND me.is_active = TRUE
       ORDER BY me.created_at DESC
       LIMIT 1`,
      [userId]
    );

    const currentEvaluation = currentEvalResult.rows.length > 0 ? currentEvalResult.rows[0] : null;

    // Procesar la evaluacion
    const evaluationResult = processMetabolicEvaluation(
      answers,
      userProfile,
      currentEvaluation,
      objectiveData
    );

    // Iniciar transaccion
    await client.query('BEGIN');

    // Insertar nueva evaluacion
    const insertResult = await client.query(
      `INSERT INTO app.user_metabolic_evaluations (
        user_id, answers, raw_score, metabolic_profile, confidence_level,
        items_answered, items_no_se, objective_adjustments, adjusted_score,
        calculated_macros, is_active, evaluation_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, CURRENT_DATE)
      RETURNING id`,
      [
        userId,
        JSON.stringify(answers),
        evaluationResult.rawScore,
        evaluationResult.appliedProfile,
        evaluationResult.confidence,
        evaluationResult.itemsAnswered,
        evaluationResult.itemsNoSe,
        evaluationResult.objectiveAdjustments ? JSON.stringify(evaluationResult.objectiveAdjustments) : null,
        evaluationResult.adjustedScore,
        JSON.stringify(evaluationResult.macros)
      ]
    );

    const evaluationId = insertResult.rows[0].id;

    // Actualizar o crear configuracion del usuario
    const pendingChange = evaluationResult.changeValidation?.needsConfirmation
      ? evaluationResult.calculatedProfile
      : null;

    const consecutiveCount = evaluationResult.changeValidation?.needsConfirmation
      ? (currentEvaluation?.consecutive_change_count || 0) + 1
      : 0;

    await client.query(
      `INSERT INTO app.user_metabolic_config (
        user_id, pending_profile_change, consecutive_change_count, last_confirmed_profile
      ) VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id) DO UPDATE SET
        pending_profile_change = EXCLUDED.pending_profile_change,
        consecutive_change_count = EXCLUDED.consecutive_change_count,
        last_confirmed_profile = COALESCE(EXCLUDED.last_confirmed_profile, app.user_metabolic_config.last_confirmed_profile),
        updated_at = NOW()`,
      [
        userId,
        pendingChange,
        consecutiveCount,
        evaluationResult.appliedProfile
      ]
    );

    // Registrar en historial si hubo cambio de perfil
    if (evaluationResult.profileChanged) {
      await client.query(
        `INSERT INTO app.user_metabolic_history (
          user_id, evaluation_id, previous_profile, new_profile, change_reason, change_type
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          evaluationId,
          currentEvaluation?.metabolic_profile || null,
          evaluationResult.appliedProfile,
          evaluationResult.changeValidation?.reason || 'Evaluacion inicial',
          currentEvaluation ? 'confirmed' : 'initial'
        ]
      );
    }

    await client.query('COMMIT');

    // Respuesta exitosa
    res.json({
      success: true,
      evaluation: {
        id: evaluationId,
        ...evaluationResult
      },
      message: evaluationResult.changeValidation?.reason || 'Perfil metabolico evaluado correctamente'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error procesando evaluacion metabolica:', error);
    res.status(500).json({
      success: false,
      error: 'Error procesando la evaluacion'
    });
  } finally {
    client.release();
  }
});

// ============================================================================
// GET /api/metabolic-profile/current
// Obtiene el perfil metabolico actual del usuario
// ============================================================================
router.get('/current', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Obtener evaluacion activa
    const evalResult = await pool.query(
      `SELECT
        me.*,
        mc.frequency_days,
        mc.pending_profile_change,
        mc.consecutive_change_count,
        mc.notification_enabled,
        (CURRENT_DATE - me.evaluation_date) as days_since_evaluation
       FROM app.user_metabolic_evaluations me
       LEFT JOIN app.user_metabolic_config mc ON me.user_id = mc.user_id
       WHERE me.user_id = $1 AND me.is_active = TRUE
       ORDER BY me.created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (evalResult.rows.length === 0) {
      return res.json({
        success: true,
        hasProfile: false,
        message: 'No tienes un perfil metabolico configurado. Completa el cuestionario para obtener tu perfil.',
        distributions: MACRO_DISTRIBUTIONS
      });
    }

    const evaluation = evalResult.rows[0];

    // Obtener descripcion del perfil
    const profileDescription = getProfileDescription(evaluation.metabolic_profile);

    // Calcular si toca reevaluacion
    const frequencyDays = evaluation.frequency_days || 14;
    const daysSinceEval = parseInt(evaluation.days_since_evaluation) || 0;
    const daysUntilDue = Math.max(0, frequencyDays - daysSinceEval);
    const shouldReEvaluate = daysSinceEval >= frequencyDays;

    res.json({
      success: true,
      hasProfile: true,
      profile: {
        id: evaluation.id,
        metabolicProfile: evaluation.metabolic_profile,
        confidence: evaluation.confidence_level,
        rawScore: evaluation.raw_score,
        adjustedScore: evaluation.adjusted_score,
        itemsAnswered: evaluation.items_answered,
        itemsNoSe: evaluation.items_no_se,
        macros: evaluation.calculated_macros,
        evaluationDate: evaluation.evaluation_date,
        daysSinceEvaluation: daysSinceEval
      },
      profileDescription,
      reEvaluation: {
        frequencyDays,
        daysUntilDue,
        shouldReEvaluate,
        pendingChange: evaluation.pending_profile_change,
        consecutiveCount: evaluation.consecutive_change_count
      },
      config: {
        notificationEnabled: evaluation.notification_enabled
      }
    });

  } catch (error) {
    console.error('Error obteniendo perfil metabolico:', error);
    res.status(500).json({ success: false, error: 'Error obteniendo perfil' });
  }
});

// ============================================================================
// GET /api/metabolic-profile/should-evaluate
// Verifica si el usuario debe realizar una (re)evaluacion
// ============================================================================
router.get('/should-evaluate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Verificar si tiene evaluacion
    const evalResult = await pool.query(
      `SELECT evaluation_date, mc.frequency_days
       FROM app.user_metabolic_evaluations me
       LEFT JOIN app.user_metabolic_config mc ON me.user_id = mc.user_id
       WHERE me.user_id = $1 AND me.is_active = TRUE
       ORDER BY me.created_at DESC
       LIMIT 1`,
      [userId]
    );

    // Si no tiene evaluacion, debe evaluar
    if (evalResult.rows.length === 0) {
      return res.json({
        success: true,
        shouldEvaluate: true,
        isFirstEvaluation: true,
        reason: 'No tienes un perfil metabolico configurado'
      });
    }

    const { evaluation_date, frequency_days } = evalResult.rows[0];
    const frequencyDays = frequency_days || 14;

    const lastEvalDate = new Date(evaluation_date);
    const today = new Date();
    const daysSince = Math.floor((today - lastEvalDate) / (1000 * 60 * 60 * 24));
    const daysUntilDue = Math.max(0, frequencyDays - daysSince);

    res.json({
      success: true,
      shouldEvaluate: daysSince >= frequencyDays,
      isFirstEvaluation: false,
      lastEvaluationDate: evaluation_date,
      daysSinceLastEvaluation: daysSince,
      frequencyDays,
      daysUntilDue,
      reason: daysSince >= frequencyDays
        ? `Han pasado ${daysSince} dias desde tu ultima evaluacion`
        : `Proxima evaluacion en ${daysUntilDue} dias`
    });

  } catch (error) {
    console.error('Error verificando evaluacion:', error);
    res.status(500).json({ success: false, error: 'Error verificando estado de evaluacion' });
  }
});

// ============================================================================
// GET /api/metabolic-profile/history
// Obtiene el historial de evaluaciones del usuario
// ============================================================================
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 10;

    // Obtener historial de evaluaciones
    const evalHistory = await pool.query(
      `SELECT
        id, metabolic_profile, confidence_level, raw_score, adjusted_score,
        items_answered, items_no_se, calculated_macros, evaluation_date, created_at
       FROM app.user_metabolic_evaluations
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    // Obtener historial de cambios de perfil
    const changeHistory = await pool.query(
      `SELECT
        previous_profile, new_profile, change_reason, change_type, created_at
       FROM app.user_metabolic_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    res.json({
      success: true,
      evaluations: evalHistory.rows,
      profileChanges: changeHistory.rows,
      totalEvaluations: evalHistory.rows.length
    });

  } catch (error) {
    console.error('Error obteniendo historial:', error);
    res.status(500).json({ success: false, error: 'Error obteniendo historial' });
  }
});

// ============================================================================
// PUT /api/metabolic-profile/config
// Actualiza la configuracion del usuario
// ============================================================================
router.put('/config', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { frequency_days, notification_enabled, auto_apply_profile } = req.body;

    // Validar frequency_days
    if (frequency_days !== undefined && (frequency_days < 7 || frequency_days > 60)) {
      return res.status(400).json({
        success: false,
        error: 'La frecuencia debe estar entre 7 y 60 dias'
      });
    }

    // Construir actualizacion dinamica
    const updates = [];
    const values = [userId];
    let paramIndex = 2;

    if (frequency_days !== undefined) {
      updates.push(`frequency_days = $${paramIndex++}`);
      values.push(frequency_days);
    }

    if (notification_enabled !== undefined) {
      updates.push(`notification_enabled = $${paramIndex++}`);
      values.push(notification_enabled);
    }

    if (auto_apply_profile !== undefined) {
      updates.push(`auto_apply_profile = $${paramIndex++}`);
      values.push(auto_apply_profile);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No se proporcionaron campos para actualizar'
      });
    }

    updates.push('updated_at = NOW()');

    // Upsert configuracion
    await pool.query(
      `INSERT INTO app.user_metabolic_config (user_id, frequency_days, notification_enabled, auto_apply_profile)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET ${updates.join(', ')}`,
      [
        userId,
        frequency_days || 14,
        notification_enabled !== undefined ? notification_enabled : true,
        auto_apply_profile !== undefined ? auto_apply_profile : false
      ]
    );

    res.json({
      success: true,
      message: 'Configuracion actualizada correctamente'
    });

  } catch (error) {
    console.error('Error actualizando configuracion:', error);
    res.status(500).json({ success: false, error: 'Error actualizando configuracion' });
  }
});

// ============================================================================
// GET /api/metabolic-profile/distributions
// Obtiene las distribuciones de macros disponibles (para referencia)
// ============================================================================
router.get('/distributions', authenticateToken, (req, res) => {
  try {
    const distributions = {};

    for (const [profile, dist] of Object.entries(MACRO_DISTRIBUTIONS)) {
      distributions[profile] = {
        protein: {
          min: Math.round(dist.protein_min * 100),
          max: Math.round(dist.protein_max * 100),
          mid: Math.round(dist.protein_mid * 100)
        },
        carbs: {
          min: Math.round(dist.carbs_min * 100),
          max: Math.round(dist.carbs_max * 100),
          mid: Math.round(dist.carbs_mid * 100)
        },
        fat: {
          min: Math.round(dist.fat_min * 100),
          max: Math.round(dist.fat_max * 100),
          mid: Math.round(dist.fat_mid * 100)
        },
        description: getProfileDescription(profile)
      };
    }

    res.json({
      success: true,
      distributions
    });

  } catch (error) {
    console.error('Error obteniendo distribuciones:', error);
    res.status(500).json({ success: false, error: 'Error obteniendo distribuciones' });
  }
});

export default router;
