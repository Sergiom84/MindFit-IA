/**
 * Rutas de home-training - dominio: plans (extraidas del monolito).
 */

import express from 'express';
import {
  pool
} from '../../db.js';
import authenticateToken from '../../middleware/auth.js';
import {
  getModuleOpenAI
} from '../../lib/openaiClient.js';
import {
  AI_MODULES
} from '../../config/aiConfigs.js';
import {
  getPrompt,
  FeatureKey
} from '../../lib/promptRegistry.js';
import {
  normalizeEquipmentType,
  normalizeTrainingType,
  buildRejectedKeySet,
  splitRejectedExercises,
  getUserProfileForHomeTraining,
  buildUserProfileSummary,
  getUserEquipmentInventory,
  getCombinationHistory,
  getRecentExerciseHistory,
  getUserFeedbackSummary,
  getActiveRejectionsSummary,
  buildEquipmentContext,
  parseAIPlanResponse
} from './_helpers.js';

const router = express.Router();


router.post('/generate', authenticateToken, async (req, res) => {
  const user_id = req.user.userId || req.user.id;
  const { equipment_type, training_type } = req.body || {};

  if (!equipment_type || !training_type) {
    return res.status(400).json({
      success: false,
      error: 'Se requieren equipment_type y training_type'
    });
  }

  const normalizedEquipment = normalizeEquipmentType(equipment_type);
  const normalizedTraining = normalizeTrainingType(training_type);

  console.log(`[HomeTraining] Generando plan IA para usuario ${user_id} (${normalizedEquipment}/${normalizedTraining})`);

  const moduleConfig = AI_MODULES.HOME_TRAINING;
  let client;
  try {
    client = getModuleOpenAI(moduleConfig);
  } catch (clientError) {
    console.error('No se pudo inicializar cliente OpenAI (home training):', clientError);
    return res.status(503).json({
      success: false,
      error: 'Servicio de IA temporalmente no disponible',
      details: process.env.NODE_ENV === 'development' ? clientError.message : undefined
    });
  }

  if (!client) {
    return res.status(503).json({
      success: false,
      error: 'Cliente de IA no disponible'
    });
  }

  let systemPrompt;
  try {
    systemPrompt = await getPrompt(FeatureKey.HOME);
  } catch (promptError) {
    console.error('Error cargando prompt HOME:', promptError);
    return res.status(500).json({
      success: false,
      error: 'No se pudo preparar el prompt de IA'
    });
  }

  try {
    const rawProfile = await getUserProfileForHomeTraining(user_id);
    const profileSummary = buildUserProfileSummary(rawProfile);

    const [equipmentInventory, combinationHistory, recentExercises, rejectionList, feedbackSummary] = await Promise.all([
      getUserEquipmentInventory(user_id),
      getCombinationHistory(user_id, normalizedEquipment, normalizedTraining),
      getRecentExerciseHistory(user_id),
      getActiveRejectionsSummary(user_id, normalizedEquipment, normalizedTraining),
      getUserFeedbackSummary(user_id)
    ]);

    const equipmentContext = buildEquipmentContext(normalizedEquipment, equipmentInventory);

    const aiPayload = {
      timestamp: new Date().toISOString(),
      parametros: {
        equipment_type: normalizedEquipment,
        training_type: normalizedTraining
      },
      usuario: profileSummary,
      equipamiento: equipmentContext,
      historial: {
        combinacion: combinationHistory,
        recientes: recentExercises
      },
      feedback_usuario: feedbackSummary,
      rechazos_activos: rejectionList
    };

    const userMessage = [
      'Genera un plan de entrenamiento en casa completamente personalizado, siguiendo al pie de la letra el prompt del sistema.',
      'Evita repetir ejercicios listados en historial.combinacion.ejercicios_usados salvo que sean imprescindibles.',
      'No incluyas ejercicios presentes en rechazos_activos; es una lista bloqueante.',
      'Responde UNICAMENTE con un objeto JSON valido.',
      JSON.stringify(aiPayload, null, 2)
    ].join('\n\n');

    const completion = await client.chat.completions.create({
      model: moduleConfig.model,
      temperature: moduleConfig.temperature,
      max_tokens: moduleConfig.max_output_tokens,
      top_p: moduleConfig.top_p,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      response_format: { type: 'json_object' }
    });

    const aiContent = completion?.choices?.[0]?.message?.content;
    if (!aiContent) {
      throw new Error('La IA no devolvio contenido');
    }

    const plan = parseAIPlanResponse(aiContent);

    const rejectedKeys = buildRejectedKeySet(rejectionList);
    if (rejectedKeys.size > 0) {
      const { kept, removed } = splitRejectedExercises(plan.plan_entrenamiento?.ejercicios, rejectedKeys);
      if (removed.length > 0) {
        console.warn(
          `[HomeTraining] Eliminados ${removed.length} ejercicio(s) rechazado(s): ${removed.map(item => item.name).join(', ')}`
        );
        plan.plan_entrenamiento.ejercicios = kept;
        if (kept.length === 0) {
          throw new Error('No se pudo generar un plan sin ejercicios rechazados.');
        }
      }
    }

    console.log(`[HomeTraining] Plan IA generado (${plan.plan_entrenamiento?.ejercicios?.length || 0} ejercicios)`);

    return res.json({
      success: true,
      plan,
      metadata: {
        equipment_type: normalizedEquipment,
        training_type: normalizedTraining,
        tokens: completion?.usage || null,
        model: moduleConfig.model,
        generation_id: completion?.id || null
      }
    });
  } catch (error) {
    console.error('Error generando plan de home training:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al generar el plan de entrenamiento',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});


// Crear un nuevo plan de entrenamiento en casa
router.post('/plans', authenticateToken, async (req, res) => {
  try {
    const { plan_data, equipment_type, training_type } = req.body;
    const user_id = req.user.userId || req.user.id;

    const result = await pool.query(
      `INSERT INTO app.home_training_plans (user_id, plan_data, equipment_type, training_type)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [user_id, JSON.stringify(plan_data), equipment_type, training_type]
    );

    res.json({
      success: true,
      plan: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating home training plan:', error);
    res.status(500).json({
      success: false,
      message: 'Error al crear el plan de entrenamiento'
    });
  }
});


// Obtener el plan actual del usuario
router.get('/current-plan', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.userId || req.user.id;

    // Buscar el plan más reciente del usuario
    const planResult = await pool.query(
      `SELECT * FROM app.home_training_plans
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [user_id]
    );

    if (planResult.rows.length === 0) {
      return res.json({
        success: true,
        plan: null,
        session: null
      });
    }

    const plan = planResult.rows[0];

    // Buscar la sesión activa para este plan
    const sessionResult = await pool.query(
      `SELECT * FROM app.home_training_sessions
       WHERE user_id = $1 AND home_training_plan_id = $2 AND status = 'in_progress'
       ORDER BY started_at DESC
       LIMIT 1`,
      [user_id, plan.id]
    );

    const session = sessionResult.rows.length > 0 ? sessionResult.rows[0] : null;

    res.json({
      success: true,
      plan: plan,
      session: session
    });
  } catch (error) {
    console.error('Error getting current plan:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el plan actual'
    });
  }
});

export default router;
