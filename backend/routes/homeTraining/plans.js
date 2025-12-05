/**
 * @fileoverview Endpoints de planes de home training
 * 
 * Endpoints:
 * - POST /generate - Generar plan con IA
 * - POST /plans - Crear plan manualmente
 * - GET /current-plan - Obtener plan activo
 * 
 * @module routes/homeTraining/plans
 */

import express from 'express';
import { pool } from '../../db.js';
import authenticateToken from '../../middleware/auth.js';
import { getModuleOpenAI } from '../../lib/openaiClient.js';
import { AI_MODULES } from '../../config/aiConfigs.js';
import { getPrompt, FeatureKey } from '../../lib/promptRegistry.js';

const router = express.Router();

// Helpers de normalización
const ALLOWED_EQUIPMENT = new Set(['minimo','basico','avanzado','personalizado','usar_este_equipamiento']);
const ALLOWED_TRAINING  = new Set(['funcional','hiit','fuerza']);

function normalizeEquipmentType(val) {
  const v = String(val || '').toLowerCase().trim();
  if (ALLOWED_EQUIPMENT.has(v)) return v;
  if (v === 'ninguno' || v === 'sin_equipo' || v === 'sin_equipamiento') return 'minimo';
  if (v === 'custom' || v === 'personalizado_equipo') return 'personalizado';
  return 'usar_este_equipamiento';
}

function normalizeTrainingType(val) {
  const v = String(val || '').toLowerCase().trim();
  if (ALLOWED_TRAINING.has(v)) return v;
  if (v.includes('hiit')) return 'hiit';
  if (v.includes('fuerza') || v.includes('calistenia') || v.includes('strength')) return 'fuerza';
  return 'funcional';
}

// =============================================================================
// POST /generate - Generar plan con IA
// =============================================================================
router.post('/generate', authenticateToken, async (req, res) => {
  const user_id = req.user.userId || req.user.id;
  const { equipment_type, training_type } = req.body || {};

  if (!equipment_type || !training_type) {
    return res.status(400).json({ success: false, error: 'Se requieren equipment_type y training_type' });
  }

  const normalizedEquipment = normalizeEquipmentType(equipment_type);
  const normalizedTraining = normalizeTrainingType(training_type);

  const moduleConfig = AI_MODULES.HOME_TRAINING;
  let client;
  try {
    client = getModuleOpenAI(moduleConfig);
  } catch (clientError) {
    console.error('No se pudo inicializar cliente OpenAI (home training):', clientError);
    return res.status(503).json({ success: false, error: 'Servicio de IA temporalmente no disponible' });
  }

  if (!client) {
    return res.status(503).json({ success: false, error: 'Cliente de IA no disponible' });
  }

  let systemPrompt;
  try {
    systemPrompt = await getPrompt(FeatureKey.HOME);
  } catch (promptError) {
    console.error('Error cargando prompt HOME:', promptError);
    return res.status(500).json({ success: false, error: 'No se pudo preparar el prompt de IA' });
  }

  try {
    // Importar helpers del archivo legacy (temporalmente)
    const homeTrainingLegacy = await import('../homeTraining.js');
    const { getUserProfileForHomeTraining, buildUserProfileSummary, getUserEquipmentInventory, getCombinationHistory, getRecentExerciseHistory, getActiveRejectionsSummary, getUserFeedbackSummary, buildEquipmentContext, parseAIPlanResponse } = homeTrainingLegacy;

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
      parametros: { equipment_type: normalizedEquipment, training_type: normalizedTraining },
      usuario: profileSummary,
      equipamiento: equipmentContext,
      historial: { combinacion: combinationHistory, recientes: recentExercises },
      feedback_usuario: feedbackSummary,
      rechazos_activos: rejectionList
    };

    const userMessage = [
      'Genera un plan de entrenamiento en casa completamente personalizado, siguiendo al pie de la letra el prompt del sistema.',
      'Evita repetir ejercicios listados en historial.combinacion.ejercicios_usados salvo que sean imprescindibles.',
      'Responde UNICAMENTE con un objeto JSON valido.',
      JSON.stringify(aiPayload, null, 2)
    ].join('\n\n');

    const completion = await client.chat.completions.create({
      model: moduleConfig.model,
      temperature: moduleConfig.temperature,
      max_tokens: moduleConfig.max_output_tokens,
      top_p: moduleConfig.top_p,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
      response_format: { type: 'json_object' }
    });

    const aiContent = completion?.choices?.[0]?.message?.content;
    if (!aiContent) throw new Error('La IA no devolvio contenido');

    const plan = parseAIPlanResponse(aiContent);

    return res.json({
      success: true,
      plan,
      metadata: { equipment_type: normalizedEquipment, training_type: normalizedTraining, tokens: completion?.usage || null, model: moduleConfig.model, generation_id: completion?.id || null }
    });
  } catch (error) {
    console.error('Error generando plan de home training:', error);
    return res.status(500).json({ success: false, error: 'Error al generar el plan de entrenamiento' });
  }
});

// =============================================================================
// POST /plans - Crear plan manualmente
// =============================================================================
router.post('/plans', authenticateToken, async (req, res) => {
  try {
    const { plan_data, equipment_type, training_type } = req.body;
    const user_id = req.user.userId || req.user.id;

    const result = await pool.query(
      `INSERT INTO app.home_training_plans (user_id, plan_data, equipment_type, training_type) VALUES ($1, $2, $3, $4) RETURNING *`,
      [user_id, JSON.stringify(plan_data), equipment_type, training_type]
    );

    res.json({ success: true, plan: result.rows[0] });
  } catch (error) {
    console.error('Error creating home training plan:', error);
    res.status(500).json({ success: false, message: 'Error al crear el plan de entrenamiento' });
  }
});

// =============================================================================
// GET /current-plan - Obtener plan activo
// =============================================================================
router.get('/current-plan', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.userId || req.user.id;

    const planResult = await pool.query(
      `SELECT * FROM app.home_training_plans WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [user_id]
    );

    if (planResult.rows.length === 0) {
      return res.json({ success: true, plan: null, session: null });
    }

    const plan = planResult.rows[0];

    const sessionResult = await pool.query(
      `SELECT * FROM app.home_training_sessions
       WHERE user_id = $1 AND home_training_plan_id = $2 AND status = 'in_progress'
       ORDER BY started_at DESC LIMIT 1`,
      [user_id, plan.id]
    );

    res.json({ success: true, plan, session: sessionResult.rows[0] || null });
  } catch (error) {
    console.error('Error getting current plan:', error);
    res.status(500).json({ success: false, message: 'Error al obtener el plan actual' });
  }
});

export default router;

