/**
 * Sub-router de nutrición V2: MEDICIONES/REEVALUACIÓN (14 días) + PERFIL METABÓLICO
 * Extraído de routes/nutritionV2.js para reducir el monolito.
 * Se monta bajo la misma base /api/nutrition-v2.
 */

import express from 'express';
import { pool } from '../../db.js';
import { authenticateToken } from '../../middleware/auth.js';
import { daysBetween } from '../../services/nutritionV2Engine.js';
import {
  evaluateVolume,
  evaluateDefinition,
  evaluateMaintenance
} from '../../services/nutritionEvaluations.js';
import {
  ensureWeeklySnapshot,
  logNutritionChange
} from '../../services/nutritionAuditLogger.js';
import {
  METABOLIC_QUESTIONS,
  calculatePendingProfileState,
  processMetabolicEvaluation
} from '../../services/metabolicProfileCalculator.js';
import {
  buildMetabolicEvaluationContextFromRow,
  getMissingMetabolicEvaluationFields
} from '../../services/metabolicEvaluationContext.js';

const router = express.Router();

// ================================================
// MEDICIONES Y REEVALUACIÓN (14 DÍAS)
// ================================================

router.post('/measurements', authenticateToken, async (req, res) => {
  return res.status(410).json({
    error: 'Ruta deprecada. Usa /api/body-measurements',
    replaced_by: '/api/body-measurements'
  });
});

router.post('/evaluate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date();

    const profileResult = await pool.query(
      'SELECT * FROM app.nutrition_profiles WHERE user_id = $1',
      [userId]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil nutricional no encontrado' });
    }

    const profile = profileResult.rows[0];
    const phase =
      profile.current_phase ||
      (profile.objetivo === 'bulk' ? 'volumen' : profile.objetivo === 'cut' ? 'definicion' : 'normocalorica');

    const measurementsResult = await pool.query(
      `
        SELECT * FROM app.body_measurements
        WHERE user_id = $1
        AND is_validated = TRUE
        ORDER BY measurement_date ASC
      `,
      [userId]
    );

    if (measurementsResult.rows.length < 2) {
      return res.status(400).json({ error: 'Se requieren al menos dos mediciones para evaluar' });
    }

    const measurements = measurementsResult.rows;
    const latest = measurements[measurements.length - 1];
    let base = measurements[0];
    let has14DayWindow = false;

    for (let i = measurements.length - 2; i >= 0; i--) {
      const candidate = measurements[i];
      const diff = daysBetween(new Date(candidate.measurement_date), new Date(latest.measurement_date));
      if (diff >= 14) {
        base = candidate;
        has14DayWindow = true;
        break;
      }
    }

    const daysDiff = daysBetween(new Date(base.measurement_date), new Date(latest.measurement_date));
    const evalInput = { weight: Number(base.weight_kg), waist: Number(base.waist_cm) };
    const evalLatest = { weight: Number(latest.weight_kg), waist: Number(latest.waist_cm) };

    let evaluation;
    if (phase === 'volumen') {
      evaluation = evaluateVolume(evalInput, evalLatest);
    } else if (phase === 'definicion') {
      evaluation = evaluateDefinition(evalInput, evalLatest);
    } else {
      evaluation = evaluateMaintenance(evalInput, evalLatest);
    }

    const ratePerWeek =
      ((evalLatest.weight - evalInput.weight) / evalInput.weight) / (daysDiff / 7);

    // Ajustes adicionales por fase siguiendo documento MindFeed
    let adjustmentNote = null;
    if (phase === 'definicion') {
      if (ratePerWeek > -0.003) { // pérdida <0.3%/sem
        adjustmentNote = 'Pérdida lenta: bajar 150-250 kcal/día';
      } else if (ratePerWeek < -0.01) { // pérdida >1%/sem
        adjustmentNote = 'Pérdida rápida: subir 150-250 kcal/día o considerar diet break';
      }
    } else if (phase === 'volumen') {
      if (ratePerWeek < 0.0015) { // ganancia <0.15%/sem
        adjustmentNote = 'Ganancia lenta: subir 150-250 kcal/día';
      } else if (ratePerWeek > 0.0035) { // ganancia >0.35%/sem
        adjustmentNote = 'Ganancia rápida: bajar 150-250 kcal/día';
      }
    } else if (phase === 'normocalorica') {
      if (Math.abs(ratePerWeek) > 0.005) {
        adjustmentNote = 'Peso se mueve >0.5%/14d: ajustar ±150 kcal/día';
      }
    }

    const suspicious =
      Math.abs(evalLatest.waist - evalInput.waist) > 2.5 && Math.abs(evalLatest.weight - evalInput.weight) < 0.5;
    const weightRapidChange = daysDiff <= 7
      ? Math.abs(evalLatest.weight - evalInput.weight) / Math.max(evalInput.weight, 1) > 0.02
      : false;

    let confirmationMeta = null;
    if (has14DayWindow) {
      const indicatorType =
        phase === 'volumen' ? 'icg' : phase === 'definicion' ? 'ipg' : 'iec';
      const confirmationResult = await pool.query(
        `SELECT * FROM app.register_icg_ipg_state($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          userId,
          latest.measurement_date,
          indicatorType,
          evalLatest.weight,
          evalLatest.waist,
          evalLatest.weight - evalInput.weight,
          evalLatest.waist - evalInput.waist,
          evaluation.indicator,
          evaluation.status
        ]
      );
      confirmationMeta = confirmationResult.rows[0] || null;
    }

    const needsConfirmation =
      evaluation.needsConfirmation ||
      !has14DayWindow ||
      suspicious ||
      weightRapidChange ||
      (confirmationMeta && !confirmationMeta.should_apply_change);

    const insertEval = `
      INSERT INTO app.nutrition_evaluations
        (user_id, evaluation_date, phase, indicator_type, indicator_value, status, interpretation, action_recommended, alerts, needs_confirmation, measurement_data)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *;
    `;

    const indicatorType =
      phase === 'volumen' ? 'icg' : phase === 'definicion' ? 'ipg' : 'iec';

    const measurementData = {
      base_id: base.id,
      latest_id: latest.id,
      weight_change: evalLatest.weight - evalInput.weight,
      waist_change: evalLatest.waist - evalInput.waist,
      days: daysDiff
    };

    const evalResult = await pool.query(insertEval, [
      userId,
      today.toISOString().slice(0, 10),
      phase,
      indicatorType,
      evaluation.indicator,
      evaluation.status,
      evaluation.interpretation,
      evaluation.action,
      JSON.stringify({ confirmation: confirmationMeta }),
      needsConfirmation,
      JSON.stringify(measurementData)
    ]);

    if (evaluation.status === 'rojo') {
      await pool.query(
        `
          INSERT INTO app.nutrition_phase_history (user_id, phase, reason, evaluation_data)
          VALUES ($1, $2, $3, $4)
        `,
        [
          userId,
          phase,
          'Recomendación por semáforo rojo',
          JSON.stringify({ evaluation_id: evalResult.rows[0].id, indicator: evaluation.indicator })
        ]
      );

      try {
        const ruleId =
          phase === 'volumen'
            ? 'NUTR-CTRL-VOL-010'
            : phase === 'definicion'
              ? 'NUTR-CTRL-DEF-010'
              : 'NUTR-CTRL-NORM-010';

        await logNutritionChange({
          userId,
          changeType: 'phase_change',
          delta: { from: phase, recommendation: evaluation.action },
          ruleId,
          reason: evaluation.interpretation,
          metrics: {
            indicator_type: indicatorType,
            indicator_value: evaluation.indicator,
            status: evaluation.status
          },
          previousValues: { phase },
          newValues: { recommended_action: evaluation.action },
          source: 'evaluation'
        });
      } catch (error) {
        console.error('Error registrando log de cambio de fase:', error);
      }
    }

    try {
      await ensureWeeklySnapshot(userId, { source: 'nutrition_v2_evaluate' });
    } catch (error) {
      console.error('Error guardando snapshot semanal en reevaluación:', error);
    }

    res.json({
      success: true,
      evaluation: evalResult.rows[0],
      needs_confirmation: needsConfirmation,
      recommendation: adjustmentNote || evaluation.action,
      adjustment_hint: adjustmentNote
    });
  } catch (error) {
    console.error('Error en reevaluación:', error);
    res.status(500).json({ error: 'Error al reevaluar' });
  }
});

// Diet breaks (saltos de dieta)
router.post('/diet-breaks', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      break_date,
      slot,
      description,
      estimated_kcal,
      estimated_macros = {},
      confidence = 'medio'
    } = req.body;

    if (!break_date || !slot || !estimated_kcal) {
      return res.status(400).json({ error: 'Faltan campos requeridos (fecha, franja, calorías)' });
    }

    const insertQuery = `
      INSERT INTO app.diet_breaks
        (user_id, break_date, slot, description, estimated_kcal, estimated_macros, confidence)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;

    const result = await pool.query(insertQuery, [
      userId,
      break_date,
      slot,
      description || '',
      estimated_kcal,
      JSON.stringify(estimated_macros),
      confidence
    ]);

    res.json({ success: true, diet_break: result.rows[0] });
  } catch (error) {
    console.error('Error guardando diet break:', error);
    res.status(500).json({ error: 'Error al guardar diet break' });
  }
});

router.get('/diet-breaks/week', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(today.getDate() - 6);

    const breaksQuery = `
      SELECT * FROM app.diet_breaks
      WHERE user_id = $1 AND break_date BETWEEN $2 AND $3
      ORDER BY break_date;
    `;
    const breaksResult = await pool.query(breaksQuery, [userId, weekAgo.toISOString().slice(0, 10), today.toISOString().slice(0, 10)]);

    // Obtener kcal objetivo semanal
    const profileResult = await pool.query('SELECT * FROM app.nutrition_profiles WHERE user_id = $1', [userId]);
    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil nutricional no encontrado' });
    }
    const profile = profileResult.rows[0];

    // Intentar recuperar plan activo para kcal objetivo
    let weeklyTarget = null;
    const planResult = await pool.query(
      `SELECT kcal_objetivo FROM app.nutrition_plans_v2 WHERE user_id = $1 AND tipo = 'activo' ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (planResult.rows.length > 0) {
      weeklyTarget = planResult.rows[0].kcal_objetivo * 7;
    }

    const totalBreakKcal = breaksResult.rows.reduce((sum, b) => sum + Number(b.estimated_kcal || 0), 0);

    let suggestion = null;
    if (weeklyTarget) {
      const deviation = totalBreakKcal; // asumimos objetivo ya incluye kcal planificadas
      if (deviation > 0) {
        const correctionPerDay = Math.round(deviation / 2); // repartir en 2 días
        suggestion = `Exceso semanal ≈ ${Math.round(deviation)} kcal. Sugiere recortar ~${correctionPerDay} kcal los próximos 2 días, manteniendo proteína ≥2 g/kg.`;
      } else {
        suggestion = 'Sin exceso registrado; mantener ingesta planificada.';
      }
    }

    res.json({
      success: true,
      breaks: breaksResult.rows,
      weekly_target_kcal: weeklyTarget,
      total_break_kcal: totalBreakKcal,
      suggestion
    });
  } catch (error) {
    console.error('Error obteniendo diet breaks:', error);
    res.status(500).json({ error: 'Error al obtener diet breaks' });
  }
});

// ================================================
// PERFIL METABÓLICO (score cuantificado)
// ================================================

function normalizeLegacyMetabolicEvaluateAnswers(rawAnswers = []) {
  if (!Array.isArray(rawAnswers)) {
    return rawAnswers;
  }

  const answerObject = {};

  rawAnswers.forEach((item, index) => {
    const questionByIndex = METABOLIC_QUESTIONS[index];
    const questionId = item?.id || questionByIndex?.id;
    if (!questionId) {
      return;
    }

    if (item?.unknown === true) {
      answerObject[questionId] = 'no_se';
      return;
    }

    const value = item && typeof item === 'object' && 'value' in item
      ? item.value
      : item;

    if (value === null || value === undefined) {
      answerObject[questionId] = 'no_se';
      return;
    }

    if (value === true || String(value).toLowerCase() === 'si') {
      answerObject[questionId] = 'si';
      return;
    }

    if (value === false || String(value).toLowerCase() === 'no') {
      answerObject[questionId] = 'no';
      return;
    }

    const numericValue = Number(value);
    const questionScore = Number(questionByIndex?.score);
    if (Number.isFinite(numericValue) && Number.isFinite(questionScore)) {
      answerObject[questionId] = numericValue === questionScore ? 'si' : 'no';
      return;
    }

    answerObject[questionId] = String(value).toLowerCase() === 'no_se' ? 'no_se' : 'no';
  });

  return answerObject;
}

router.post('/metabolic-evaluate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { answers = [], signals = {} } = req.body;

    const profileResult = await pool.query(
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
    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil nutricional no encontrado' });
    }
    const profile = profileResult.rows[0];
    const { userProfile } = buildMetabolicEvaluationContextFromRow(profile);

    const currentEvaluation = {
      metabolic_profile: profile.metabolic_type || 'mixto',
      pending_profile_change: profile.metabolic_pending_type || null,
      consecutive_change_count: profile.metabolic_pending_count || 0
    };

    const normalizedAnswers = normalizeLegacyMetabolicEvaluateAnswers(answers);
    const objectiveData = {
      objetivo: userProfile.objetivo,
      waistIncreasing: signals.icgFlag === 'high',
      performanceLoss: Boolean(signals.performanceLossCut),
      frequentNightHunger: Boolean(signals.performanceLossCut),
      stableEnergyWithCarbs: Boolean(signals.stableEnergyWithCarbs),
      waistMaintained: Boolean(signals.waistStableOrDown)
    };

    if (!userProfile.objetivo && objectiveData.objetivo) {
      userProfile.objetivo = objectiveData.objetivo;
    }

    const missingFields = getMissingMetabolicEvaluationFields(userProfile);
    if (missingFields.length > 0) {
      return res.status(400).json({
        error: `Faltan datos para evaluar el perfil metabólico: ${missingFields.join(', ')}. Guarda primero tu perfil de nutrición o sincronízalo desde Perfil.`
      });
    }

    const evaluationResult = processMetabolicEvaluation(
      normalizedAnswers,
      userProfile,
      currentEvaluation,
      objectiveData
    );
    const { pendingType, pendingCount } = calculatePendingProfileState(currentEvaluation, evaluationResult);

    const updateQuery = `
      UPDATE app.nutrition_profiles
      SET metabolic_score = $1,
          metabolic_confidence = $2,
          metabolic_type = $3,
          metabolic_pending_type = $4,
          metabolic_pending_count = $5,
          metabolic_last_evaluated_at = NOW(),
          updated_at = NOW()
      WHERE user_id = $6
      RETURNING *;
    `;

    await pool.query(updateQuery, [
      evaluationResult.adjustedScore,
      evaluationResult.confidence,
      evaluationResult.appliedProfile,
      pendingType,
      pendingCount,
      userId
    ]);

    res.json({
      success: true,
      score: evaluationResult.adjustedScore,
      raw_score: evaluationResult.rawScore,
      confidence: evaluationResult.confidence,
      applied_type: evaluationResult.appliedProfile,
      calculated_type: evaluationResult.calculatedProfile,
      pending_type: pendingType,
      pending_count: pendingCount,
      macros: evaluationResult.macros
    });
  } catch (error) {
    console.error('Error en evaluación metabólica:', error);
    res.status(500).json({ error: 'Error al evaluar perfil metabólico' });
  }
});

export default router;
