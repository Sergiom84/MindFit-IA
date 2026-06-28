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
  calculatePendingProfileState,
  getProfileDescription
} from '../services/metabolicProfileCalculator.js';
import { getMacroDistributionCatalog } from '../services/macroProfilePhaseResolver.js';
import {
  buildMetabolicEvaluationContextFromRow,
  getMissingMetabolicEvaluationFields
} from '../services/metabolicEvaluationContext.js';

const router = express.Router();

async function loadMetabolicEvaluationContext(client, userId) {
  const result = await client.query(
    `SELECT
      np.user_id,
      np.sexo AS nutrition_sexo,
      np.edad AS nutrition_edad,
      np.altura_cm,
      np.peso_kg,
      np.objetivo AS nutrition_objetivo,
      np.training_days,
      np.kcal_objetivo,
      np.tdee,
      np.level,
      np.metabolic_type,
      np.metabolic_pending_type,
      np.metabolic_pending_count,
      np.metabolic_confidence,
      u.sexo AS user_sexo,
      u.edad AS user_edad,
      u.altura AS user_altura_cm,
      u.peso AS user_peso_kg,
      u.objetivo_principal AS user_objetivo_principal,
      u.frecuencia_semanal AS user_training_days,
      u.nivel_entrenamiento AS user_level
     FROM app.nutrition_profiles np
     LEFT JOIN app.users u ON np.user_id = u.id
     WHERE np.user_id = $1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return buildMetabolicEvaluationContextFromRow(result.rows[0]);
}

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

    const evaluationContext = await loadMetabolicEvaluationContext(client, userId);
    if (!evaluationContext) {
      return res.status(400).json({
        success: false,
        error: 'Debes configurar tu perfil nutricional antes de evaluar tu perfil metabolico'
      });
    }

    const { userProfile } = evaluationContext;
    if (!userProfile.objetivo && objectiveData?.objetivo) {
      userProfile.objetivo = objectiveData.objetivo;
    }

    const missingFields = getMissingMetabolicEvaluationFields(userProfile);
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Faltan datos para evaluar el perfil metabólico: ${missingFields.join(', ')}. Guarda primero tu perfil de nutrición o sincronízalo desde Perfil.`
      });
    }

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
        JSON.stringify(evaluationResult.normalizedAnswers),
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
    const { pendingType, pendingCount } = calculatePendingProfileState(currentEvaluation, evaluationResult);

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
        pendingType,
        pendingCount,
        evaluationResult.appliedProfile
      ]
    );

    const syncProfileResult = await client.query(
      `UPDATE app.nutrition_profiles
       SET
         metabolic_type = $1,
         metabolic_score = $2,
         metabolic_confidence = $3,
         metabolic_pending_type = $4,
         metabolic_pending_count = $5,
         metabolic_last_evaluated_at = NOW(),
         updated_at = NOW()
       WHERE user_id = $6`,
      [
        evaluationResult.appliedProfile,
        evaluationResult.adjustedScore,
        evaluationResult.confidence,
        pendingType,
        pendingCount,
        userId
      ]
    );

    if (syncProfileResult.rowCount === 0) {
      throw new Error('No se pudo sincronizar nutrition_profiles con la evaluación metabólica');
    }

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
        ...evaluationResult,
        pendingType,
        pendingCount
      },
      message: evaluationResult.changeValidation?.reason || 'Perfil metabolico evaluado correctamente'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error procesando evaluacion metabolica:', error);
    res.status(500).json({
      success: false,
      error: 'Error procesando la evaluacion metabolica'
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
    const distributionCatalog = getMacroDistributionCatalog();

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
        ruleset: distributionCatalog.ruleset,
        distributions: distributionCatalog.distributions,
        legacy_ranges: distributionCatalog.legacy_ranges
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
    const catalog = getMacroDistributionCatalog();
    const distributions = {};

    for (const [profile, phaseTable] of Object.entries(catalog.phase_table)) {
      distributions[profile] = {
        ...phaseTable,
        description: getProfileDescription(profile)
      };
    }

    res.json({
      success: true,
      ruleset: catalog.ruleset,
      distributions,
      phase_table: distributions,
      legacy_ranges: Object.entries(catalog.legacy_ranges).reduce((accumulator, [profile, ranges]) => {
        accumulator[profile] = {
          ...ranges,
          description: getProfileDescription(profile)
        };
        return accumulator;
      }, {})
    });

  } catch (error) {
    console.error('Error obteniendo distribuciones:', error);
    res.status(500).json({ success: false, error: 'Error obteniendo distribuciones' });
  }
});

export default router;
