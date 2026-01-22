import express from 'express';
import { pool } from '../db.js';
import authenticateToken from '../middleware/auth.js';
import { getOpenAIClient, getModuleOpenAI } from '../lib/openaiClient.js';
import { AI_MODULES } from '../config/aiConfigs.js';
import { getPrompt, FeatureKey } from '../lib/promptRegistry.js';

// TODO: Integrar endpoint IA de generación de plan usando módulo HOME_TRAINING (promptId, temperature 1.0)
// Ejemplo futuro: POST /plans/ai/generate
//   - Usa datos de perfil + objetivos
//   - Llama a responses.create con config HOME_TRAINING
//   - Devuelve plan estructurado para persistir

const router = express.Router();

// Helpers para normalizar combinaciones (evitar 500 por valores inesperados)
const ALLOWED_EQUIPMENT = new Set(['minimo','basico','avanzado','personalizado','usar_este_equipamiento']);
const ALLOWED_TRAINING  = new Set(['funcional','hiit','fuerza']);

function normalizeEquipmentType(val) {
  const v = String(val || '').toLowerCase().trim();
  if (ALLOWED_EQUIPMENT.has(v)) return v;
  // Mapear alias comunes
  if (v === 'ninguno' || v === 'sin_equipo' || v === 'sin_equipamiento') return 'minimo';
  if (v === 'custom' || v === 'personalizado_equipo') return 'personalizado';
  // Por defecto, usar inventario del usuario
  return 'usar_este_equipamiento';
}

function normalizeTrainingType(val) {
  const v = String(val || '').toLowerCase().trim();
  if (ALLOWED_TRAINING.has(v)) return v;
  // Mapear alias/metodologías a categorías home-training
  if (v.includes('hiit')) return 'hiit';
  if (v.includes('fuerza') || v.includes('calistenia') || v.includes('strength')) return 'fuerza';
  // Fallback genérico
  return 'funcional';
}

function toExerciseKey(name) {
  const s = String(name || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
  return s.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'ejercicio';
}

function buildRejectedKeySet(rejectionList = []) {
  const keys = new Set();
  for (const item of rejectionList) {
    const rawKey = item?.exercise_key ? String(item.exercise_key).trim() : '';
    const key = rawKey || toExerciseKey(item?.exercise_name);
    if (key) {
      keys.add(key);
    }
  }
  return keys;
}

function splitRejectedExercises(exercises, rejectedKeys) {
  const kept = [];
  const removed = [];

  for (const exercise of Array.isArray(exercises) ? exercises : []) {
    const name = exercise?.nombre ?? exercise?.exercise_name ?? exercise?.name;
    if (!name) {
      kept.push(exercise);
      continue;
    }

    const key = toExerciseKey(name);
    if (rejectedKeys.has(key)) {
      removed.push({ name, key });
      continue;
    }

    kept.push(exercise);
  }

  return { kept, removed };
}

const EQUIPMENT_PRESETS = {
  minimo: ['Peso corporal', 'Toalla resistente', 'Silla estable', 'Pared o sofa'],
  basico: ['Esterilla', 'Bandas elasticas', 'Mancuernas ajustables', 'Banco o step'],
  avanzado: ['TRX', 'Barra de dominadas', 'Kettlebells', 'Discos y barra']
};

function normalizeArrayField(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean);
      }
    } catch (_) {
      // ignore JSON parse failures
    }
    return value
      .split(/[;,]/)
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [value].filter(Boolean);
}

function computeBMI(weightKg, heightCm) {
  const weight = Number(weightKg);
  const height = Number(heightCm);
  if (!weight || !height) return null;
  const meters = height / 100;
  if (!meters) return null;
  const bmi = weight / (meters * meters);
  return Number.isFinite(bmi) ? Number(bmi.toFixed(1)) : null;
}

async function getUserProfileForHomeTraining(userId) {
  const { rows } = await pool.query(
    `SELECT
        u.id,
        u.nombre,
        u.apellido,
        u.edad,
        u.sexo,
        u.peso,
        u.altura,
        u.anos_entrenando,
        u.nivel_entrenamiento,
        u.nivel_actividad,
        u.objetivo_principal,
        u.frecuencia_semanal,
        u.grasa_corporal,
        u.masa_muscular,
        u.alergias,
        u.medicamentos,
        u.suplementacion,
        p.limitaciones_fisicas,
        p.metodologia_preferida,
        p.objetivo_principal AS perfil_objetivo,
        p.dias_preferidos_entrenamiento,
        p.ejercicios_por_dia_preferido
     FROM app.users u
     LEFT JOIN app.user_profiles p ON u.id = p.user_id
     WHERE u.id = $1`,
    [userId]
  );

  if (rows.length === 0) {
    throw new Error('Usuario no encontrado');
  }

  const profile = rows[0];
  if (!profile.objetivo_principal && profile.perfil_objetivo) {
    profile.objetivo_principal = profile.perfil_objetivo;
  }

  return profile;
}

function buildUserProfileSummary(profile) {
  return {
    id: profile.id,
    nombre: profile.nombre,
    apellido: profile.apellido,
    edad: profile.edad != null ? Number(profile.edad) : null,
    sexo: profile.sexo || null,
    peso_kg: profile.peso != null ? Number(profile.peso) : null,
    altura_cm: profile.altura != null ? Number(profile.altura) : null,
    imc: computeBMI(profile.peso, profile.altura),
    anos_entrenando: profile.anos_entrenando != null ? Number(profile.anos_entrenando) : null,
    nivel_entrenamiento: profile.nivel_entrenamiento || 'intermedio',
    nivel_actividad: profile.nivel_actividad || 'moderado',
    objetivo_principal: profile.objetivo_principal || 'general',
    metodologia_preferida: profile.metodologia_preferida || null,
    frecuencia_semanal: profile.frecuencia_semanal != null ? Number(profile.frecuencia_semanal) : 3,
    dias_preferidos_entrenamiento: profile.dias_preferidos_entrenamiento || ['lunes','martes','miercoles','jueves','viernes'],
    ejercicios_por_dia_preferido: profile.ejercicios_por_dia_preferido != null ? Number(profile.ejercicios_por_dia_preferido) : 8,
    grasa_corporal: profile.grasa_corporal != null ? Number(profile.grasa_corporal) : null,
    masa_muscular: profile.masa_muscular != null ? Number(profile.masa_muscular) : null,
    alergias: normalizeArrayField(profile.alergias),
    medicamentos: normalizeArrayField(profile.medicamentos),
    suplementacion: normalizeArrayField(profile.suplementacion),
    limitaciones_fisicas: normalizeArrayField(profile.limitaciones_fisicas)
  };
}

async function getUserEquipmentInventory(userId) {
  try {
    const [curatedRes, customRes] = await Promise.all([
      pool.query(
        `SELECT
            ue.equipment_type AS key,
            COALESCE(et.equipment_type_es, ue.equipment_type) AS label,
            COALESCE(et.category_es, et.category_en, 'general') AS category
         FROM app.user_equipment ue
         LEFT JOIN app.equipment_translations et ON et.equipment_type_en = ue.equipment_type
         WHERE ue.user_id = $1 AND ue.has_equipment = true
         ORDER BY label`,
        [userId]
      ),
      pool.query(
        `SELECT equipment_name AS name
           FROM app.user_custom_equipment
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 25`,
        [userId]
      )
    ]);

    return {
      curated: curatedRes.rows.map(row => ({
        key: row.key,
        label: row.label,
        category: row.category
      })),
      custom: customRes.rows.map(row => row.name)
    };
  } catch (error) {
    console.warn('No se pudo obtener equipamiento del usuario:', error.message);
    return { curated: [], custom: [] };
  }
}

async function getCombinationHistory(userId, equipmentType, trainingType) {
  try {
    const { rows } = await pool.query(
      `SELECT plan_data, created_at
         FROM app.home_training_plans
        WHERE user_id = $1 AND equipment_type = $2 AND training_type = $3
        ORDER BY created_at DESC
        LIMIT 10`,
      [userId, equipmentType, trainingType]
    );

    const exercises = new Set();
    const summaries = [];

    for (const row of rows) {
      let planData = row.plan_data;
      if (typeof planData === 'string') {
        try {
          planData = JSON.parse(planData);
        } catch (parseError) {
          console.warn('Plan guardado con JSON invalido para combinacion, se omite:', parseError.message);
          continue;
        }
      }

      const workout = planData?.plan_entrenamiento;
      const exercisesList = Array.isArray(workout?.ejercicios) ? workout.ejercicios : [];

      exercisesList.forEach(exercise => {
        if (exercise?.nombre) {
          exercises.add(exercise.nombre);
        }
      });

      if (summaries.length < 3 && workout) {
        summaries.push({
          titulo: workout.titulo || null,
          fecha: workout.fecha || row.created_at,
          total_ejercicios: exercisesList.length,
          primeros_ejercicios: exercisesList.slice(0, 5).map(ex => ex.nombre)
        });
      }
    }

    return {
      total_planes: rows.length,
      ejercicios_usados: Array.from(exercises).slice(0, 25),
      ultimos_planes: summaries
    };
  } catch (error) {
    console.warn('No se pudo obtener historico de combinacion:', error.message);
    return {
      total_planes: 0,
      ejercicios_usados: [],
      ultimos_planes: []
    };
  }
}

async function getRecentExerciseHistory(userId, limit = 20) {
  try {
    const { rows } = await pool.query(
      `SELECT exercise_name
         FROM app.home_exercise_history
        WHERE user_id = $1
        ORDER BY created_at DESC NULLS LAST
        LIMIT $2`,
      [userId, limit]
    );

    const seen = new Set();
    const ordered = [];

    for (const row of rows) {
      const name = row.exercise_name;
      if (name && !seen.has(name)) {
        seen.add(name);
        ordered.push(name);
      }
    }

    return ordered;
  } catch (error) {
    console.warn('No se pudo obtener historial general de ejercicios:', error.message);
    return [];
  }
}

async function getUserFeedbackSummary(userId) {
  try {
    const { rows } = await pool.query(
      `SELECT exercise_name, sentiment, feedback_type, comment, avoidance_duration_days, expires_at
         FROM app.user_exercise_feedback
        WHERE user_id = $1
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
        LIMIT 40`,
      [userId]
    );

    const liked = new Set();
    const challenging = new Set();
    const disliked = new Set();
    const avoid = [];
    const comments = [];

    for (const row of rows) {
      const name = row.exercise_name;
      const sentiment = (row.sentiment || '').toLowerCase();
      const feedbackType = (row.feedback_type || '').toLowerCase();
      const flag = feedbackType || sentiment;

      if (['like', 'favorite', 'love'].includes(flag)) {
        liked.add(name);
      } else if (['hard', 'challenging', 'difficult', 'too_difficult'].includes(flag)) {
        challenging.add(name);
      } else if (['dislike', 'dont_like', 'no_equipment'].includes(flag)) {
        disliked.add(name);
      }

      if (['too_difficult', 'no_equipment', 'change_focus', 'dont_like'].includes(feedbackType)) {
        avoid.push({
          exercise: name,
          reason: feedbackType,
          comment: row.comment || null,
          expires_at: row.expires_at,
          avoidance_days: row.avoidance_duration_days || null
        });
      } else if (row.comment) {
        comments.push({ exercise: name, comment: row.comment });
      }
    }

    return {
      liked: Array.from(liked).slice(0, 10),
      challenging: Array.from(challenging).slice(0, 10),
      disliked: Array.from(disliked).slice(0, 10),
      avoid: avoid.slice(0, 10),
      comments: comments.slice(0, 10)
    };
  } catch (error) {
    console.warn('No se pudo obtener feedback del usuario:', error.message);
    return {
      liked: [],
      challenging: [],
      disliked: [],
      avoid: [],
      comments: []
    };
  }
}

async function getActiveRejectionsSummary(userId, equipmentType, trainingType) {
  try {
    const { rows } = await pool.query(
      `SELECT exercise_name, rejection_category, rejection_reason, expires_at
         FROM app.get_rejected_exercises_for_combination($1, $2, $3)`,
      [userId, equipmentType, trainingType]
    );

    return rows.slice(0, 15).map(row => ({
      exercise: row.exercise_name,
      category: row.rejection_category,
      reason: row.rejection_reason,
      expires_at: row.expires_at
    }));
  } catch (error) {
    console.warn('No se pudo obtener rechazos activos:', error.message);
    return [];
  }
}

function buildEquipmentContext(equipmentType, inventory) {
  const context = {
    modo: equipmentType,
    curated: inventory.curated,
    custom: inventory.custom
  };

  if (EQUIPMENT_PRESETS[equipmentType]) {
    context.preset_toolkit = EQUIPMENT_PRESETS[equipmentType];
  }

  if ((equipmentType === 'personalizado' || equipmentType === 'usar_este_equipamiento') && context.curated.length === 0 && context.custom.length === 0) {
    context.notice = 'El usuario selecciono equipamiento personalizado pero no tiene elementos registrados.';
  }

  return context;
}

function parseAIPlanResponse(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') {
    throw new Error('Respuesta de IA vacia');
  }

  let content = rawContent.trim();
  const blockMatch = content.match(/```json\s*([\s\S]*?)```/i) || content.match(/```\s*([\s\S]*?)```/i);
  if (blockMatch && blockMatch[1]) {
    content = blockMatch[1].trim();
  }

  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    content = content.slice(firstBrace, lastBrace + 1);
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    console.error('Respuesta de IA no es JSON valido:', error.message);
    console.error('Fragmento recibido:', content.slice(0, 200));
    throw new Error('La IA devolvio un JSON invalido');
  }

  if (!parsed.plan_entrenamiento || !Array.isArray(parsed.plan_entrenamiento.ejercicios)) {
    throw new Error('La IA no devolvio ejercicios validos');
  }

  return parsed;
}

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

// Iniciar una nueva sesión de entrenamiento
router.post('/sessions/start', authenticateToken, async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { home_training_plan_id } = req.body;
      const user_id = req.user.userId || req.user.id;

      // Verificar que el plan pertenece al usuario
      const planResult = await client.query(
        'SELECT * FROM app.home_training_plans WHERE id = $1 AND user_id = $2',
        [home_training_plan_id, user_id]
      );

      if (planResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Plan de entrenamiento no encontrado' });
      }

      const plan = planResult.rows[0];
      const exercises = plan.plan_data.plan_entrenamiento?.ejercicios || [];

      // Crear nueva sesión
      const sessionResult = await client.query(
        `INSERT INTO app.home_training_sessions
         (user_id, home_training_plan_id, total_exercises, session_data)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [user_id, home_training_plan_id, exercises.length, JSON.stringify({ exercises })]
      );
      const session = sessionResult.rows[0];
      const sessionId = session.id;

      // Crear registros de progreso para cada ejercicio (robusto)
      for (let i = 0; i < exercises.length; i++) {
        const ex = exercises[i] || {};
        // Series por defecto (si la IA no especifica): 4
        const totalSeries = Number(ex.series ?? ex.total_series ?? ex.totalSeries) || 4;
        await client.query(
          `INSERT INTO app.home_exercise_progress
           (home_training_session_id, exercise_order, exercise_name, total_series, series_completed, status, duration_seconds, started_at, exercise_data)
           VALUES ($1, $2, $3, $4, 0, 'pending', NULL, NOW(), $5)`,
          [sessionId, i, ex.nombre, totalSeries, JSON.stringify(ex)]
        );
      }

      await client.query('COMMIT');

      res.json({ success: true, session });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error starting training session:', error);
    res.status(500).json({
      success: false,
      message: 'Error al iniciar la sesión de entrenamiento'
    });
  }
});

// Actualizar progreso de ejercicio (MEJORADO)
router.put('/sessions/:sessionId/exercise/:exerciseOrder', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { sessionId, exerciseOrder } = req.params;
    const { series_completed, duration_seconds, status } = req.body;
    const user_id = req.user.userId || req.user.id;

    console.log(`🔍 PUT /sessions/${sessionId}/exercise/${exerciseOrder} - Usuario: ${user_id}`);
    console.log(`📦 Body:`, { series_completed, duration_seconds, status });

    // Verificar que la sesión pertenece al usuario
    const sessionResult = await client.query(
      'SELECT * FROM app.home_training_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, user_id]
    );

    if (sessionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Sesión no encontrada' });
    }

    // Determinar si es una actualización de solo duración
    const isDurationOnlyUpdate = !series_completed && !status && duration_seconds;
    
    let updateSql, updateParams;
    
    if (isDurationOnlyUpdate) {
      // Solo actualizar duración sin cambiar status ni series
      console.log(`⏰ Actualizando solo duración para ejercicio ${exerciseOrder}: ${duration_seconds}s`);
      updateSql = `
        UPDATE app.home_exercise_progress
        SET duration_seconds = $1
        WHERE home_training_session_id = $2
          AND exercise_order = $3
        RETURNING *;
      `;
      updateParams = [duration_seconds, sessionId, exerciseOrder];
    } else {
      // Actualización completa (series, status y duración)
      console.log(`📊 Actualizando progreso completo para ejercicio ${exerciseOrder}: ${series_completed} series, ${status}`);
      updateSql = `
        UPDATE app.home_exercise_progress
        SET
          series_completed  = COALESCE($1, series_completed),
          status            = COALESCE($2::text, status),
          duration_seconds  = COALESCE($3, duration_seconds),
          completed_at      = CASE WHEN COALESCE($2::text, status) = 'completed' THEN now() ELSE completed_at END
        WHERE home_training_session_id = $4
          AND exercise_order = $5
        RETURNING *;
      `;
      updateParams = [
        series_completed !== undefined ? series_completed : null,
        status !== undefined ? status : null,
        duration_seconds !== undefined ? duration_seconds : null,
        sessionId,
        exerciseOrder
      ];
    }
    
    const updateResult = await client.query(updateSql, updateParams);


    if (updateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Ejercicio no encontrado' });
    }

    // Calcular progreso total de la sesión
    const progressResult = await client.query(
      `SELECT
         COUNT(*)::int as total_exercises,
         COUNT(CASE WHEN status = 'completed' THEN 1 END)::int as completed_exercises,
         SUM(CASE WHEN status = 'completed' THEN COALESCE(duration_seconds, 0) ELSE 0 END)::int as total_duration
       FROM app.home_exercise_progress
       WHERE home_training_session_id = $1`,
      [sessionId]
    );

    const progress = progressResult.rows[0];
    const progressPercentage = progress.total_exercises > 0
      ? Math.round((progress.completed_exercises / progress.total_exercises) * 100)
      : 0;

    // Actualizar la sesión
    await client.query(`
      UPDATE app.home_training_sessions
      SET
        exercises_completed    = (SELECT COUNT(*) FROM app.home_exercise_progress
                                  WHERE home_training_session_id = $1 AND status = 'completed'),
        progress_percentage    = ROUND(100.0 * (SELECT COUNT(*) FROM app.home_exercise_progress
                                  WHERE home_training_session_id = $1 AND status = 'completed')
                                  / NULLIF(total_exercises,0), 1),
        completed_at           = CASE
                                  WHEN (SELECT COUNT(*) FROM app.home_exercise_progress
                                        WHERE home_training_session_id = $1 AND status <> 'completed') = 0
                                  THEN COALESCE(completed_at, NOW())
                                  ELSE NULL
                                END,
        status                 = CASE
                                  WHEN (SELECT COUNT(*) FROM app.home_exercise_progress
                                        WHERE home_training_session_id = $1 AND status <> 'completed') = 0
                                  THEN 'completed'
                                  ELSE 'in_progress'
                                END
      WHERE id = $1
    `, [sessionId]);

    // Si el ejercicio se completó, actualizar estadísticas e historial
    if (status === 'completed') {
      if (progressPercentage >= 100) {
        await client.query(
          `UPDATE app.user_home_training_stats
           SET total_sessions = total_sessions + 1,
               last_training_date = CURRENT_DATE,
               updated_at = NOW()
           WHERE user_id = $1`,
          [user_id]
        );
      }

      const exRow = updateResult.rows[0];
      const sessRow = sessionResult.rows[0];
      const planId = sessRow.home_training_plan_id;

      const exName = exRow.exercise_name || (exRow.exercise_data && exRow.exercise_data.nombre) || 'Ejercicio';
      const exKey = (exName || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');

      await client.query(
        `INSERT INTO app.home_exercise_history
           (user_id, exercise_name, exercise_key, reps, series, duration_seconds, session_id, plan_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id, exercise_name, session_id) DO NOTHING`,
        [user_id, exName, exKey, null, series_completed, (duration_seconds ?? null), sessionId, planId]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      exercise: updateResult.rows[0],
      session_progress: {
        completed_exercises: progress.completed_exercises,
        total_exercises: progress.total_exercises,
        percentage: progressPercentage,
        total_duration: progress.total_duration
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating exercise progress:', error);
    res.status(500).json({ success: false, message: 'Error al actualizar el progreso del ejercicio' });
  } finally {
    client.release();
  }
});

// Obtener estadísticas del usuario (extendido con ejercicios y tiempo activo)
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.userId || req.user.id;

    const statsResult = await pool.query(
      'SELECT * FROM app.user_home_training_stats WHERE user_id = $1',
      [user_id]
    );

    let stats = statsResult.rows[0];

    if (!stats) {
      // Crear estadísticas iniciales si no existen
      const createResult = await pool.query(
        `INSERT INTO app.user_home_training_stats (user_id)
         VALUES ($1)
         RETURNING *`,
        [user_id]
      );
      stats = createResult.rows[0];
    }

    // Agregar métricas basadas en ejercicios completados (SOLO entrenamiento en casa)
    const exAgg = await pool.query(
      `SELECT COUNT(*)::int AS total_exercises_completed,
              COALESCE(SUM(duration_seconds), 0)::int AS total_exercise_duration_seconds
         FROM app.home_exercise_history
        WHERE user_id = $1`,
      [user_id]
    );
    const ex = exAgg.rows[0] || { total_exercises_completed: 0, total_exercise_duration_seconds: 0 };

    res.json({
      success: true,
      stats: {
        ...stats,
        total_exercises_completed: ex.total_exercises_completed,
        total_exercise_duration_seconds: ex.total_exercise_duration_seconds,
      }
    });
  } catch (error) {
    console.error('Error getting user stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las estadísticas'
    });
  }
});

// Obtener progreso de sesión actual
router.get('/sessions/:sessionId/progress', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const user_id = req.user.userId || req.user.id;

    // Verificar que la sesión pertenece al usuario
    const sessionResult = await pool.query(
      'SELECT * FROM app.home_training_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, user_id]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Sesión no encontrada'
      });
    }

    // Obtener progreso de todos los ejercicios + último feedback por ejercicio
    const progressResult = await pool.query(
      `SELECT p.*, fb.sentiment AS feedback_sentiment, fb.comment AS feedback_comment
         FROM app.home_exercise_progress p
         LEFT JOIN LATERAL (
           SELECT sentiment, comment
             FROM app.user_exercise_feedback uf
            WHERE uf.user_id = $2
              AND uf.session_id = $1
              AND uf.exercise_order = p.exercise_order
            ORDER BY created_at DESC
            LIMIT 1
         ) fb ON true
        WHERE p.home_training_session_id = $1
        ORDER BY p.exercise_order`,
      [sessionId, user_id]
    );

    const session = sessionResult.rows[0];
    const exercises = progressResult.rows;

    // Calcular siguiente ejercicio a realizar
    // Debe ser el primer ejercicio NO completado (incluye pending, in_progress, skipped, cancelled)
    const nextExerciseIndex = exercises.findIndex(ex => ex.status !== 'completed');
    const completedExercises = exercises
      .filter(ex => ex.status === 'completed')
      .map(ex => ex.exercise_order);

    // Si hay alguno sin completar, retomamos desde ese índice; si no, usar último índice válido
    let safeCurrentExercise;
    if (nextExerciseIndex >= 0) {
      safeCurrentExercise = nextExerciseIndex;
    } else if (exercises.length > 0) {
      safeCurrentExercise = Math.max(0, exercises.length - 1);
    } else {
      safeCurrentExercise = 0;
    }

    // allCompleted solo es true si absolutamente todos están marcados como 'completed'
    const allCompleted = exercises.length > 0 && exercises.every(ex => ex.status === 'completed');

    res.json({
      success: true,
      session: session,
      exercises: exercises,
      progress: {
        currentExercise: safeCurrentExercise,
        completedExercises: completedExercises,
        percentage: session.progress_percentage || 0,
        allCompleted
      }
    });
  } catch (error) {
    console.error('Error getting session progress:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el progreso de la sesión'
    });
  }
});


// Obtener feedback de una sesión
router.get('/sessions/:sessionId/feedback', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const user_id = req.user.userId || req.user.id;

    const result = await pool.query(
      `SELECT exercise_order, exercise_name, sentiment, comment
       FROM app.user_exercise_feedback
       WHERE user_id = $1 AND session_id = $2
       ORDER BY exercise_order`,
      [user_id, sessionId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo feedback de sesión:', error);
    res.status(500).json({ success: false, message: 'Error obteniendo feedback' });
  }
});

// Crear feedback de ejercicio
router.post('/sessions/:sessionId/exercise/:exerciseOrder/feedback', authenticateToken, async (req, res) => {
  try {
    const { sessionId, exerciseOrder } = req.params;
    const { sentiment, comment, exercise_name } = req.body || {};
    const user_id = req.user.userId || req.user.id;

    // Validar sentiment solo si está presente - Estados unificados post-merge
    if (sentiment !== null && sentiment !== undefined && !['like','dislike','hard'].includes(String(sentiment))) {
      return res.status(400).json({ success: false, message: 'sentiment inválido' });
    }

    // Buscar nombre/clave del ejercicio si no llega por body
    let exName = exercise_name;
    let exKey = null;
    if (!exName) {
      const q = await pool.query(
        `SELECT exercise_name, exercise_data
           FROM app.home_exercise_progress
          WHERE home_training_session_id = $1 AND exercise_order = $2
          LIMIT 1`,
        [sessionId, exerciseOrder]
      );
      if (q.rows.length) {
        exName = q.rows[0].exercise_name || q.rows[0].exercise_data?.nombre || 'Ejercicio';
      } else {
        exName = 'Ejercicio';
      }
    }
    exKey = (exName || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');

    const methodologyType = 'home_training';
    const feedbackType = 'exercise_rating';
    const normalizedComment = comment && String(comment).trim() !== '' ? String(comment).trim() : null;

    await pool.query(
      `INSERT INTO app.user_exercise_feedback
         (user_id, session_id, exercise_order, exercise_name, exercise_key, sentiment, comment, methodology_type, feedback_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (user_id, session_id, exercise_order) DO UPDATE
         SET sentiment = EXCLUDED.sentiment,
             comment = EXCLUDED.comment,
             methodology_type = EXCLUDED.methodology_type,
             feedback_type = EXCLUDED.feedback_type,
             updated_at = NOW()`
      ,
      [user_id, sessionId, exerciseOrder, exName, exKey, sentiment || null, normalizedComment, methodologyType, feedbackType]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error creating feedback:', error);
    res.status(500).json({ success: false, message: 'Error creando feedback' });
  }
});

// ===============================================
// ENDPOINTS PARA SISTEMA DE RECHAZOS
// ===============================================

// Guardar ejercicios rechazados - SISTEMA UNIFICADO DE FEEDBACK
router.post('/rejections', authenticateToken, async (req, res) => {
  try {
    const { rejections } = req.body || {};
    const user_id = req.user.userId || req.user.id;

    if (!Array.isArray(rejections) || rejections.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Se requiere un array de ejercicios rechazados'
      });
    }

    console.log('🔄 USANDO SISTEMA UNIFICADO DE FEEDBACK');
    console.log(`📊 Procesando ${rejections.length} rechazo(s) de ejercicios`);

    // Mapeo de categorías del modal a feedback_type
    const REJECTION_CATEGORY_MAPPING = {
      'too_hard': 'too_difficult',
      'dont_like': 'dont_like',
      'injury': 'physical_limitation',
      'equipment': 'no_equipment',
      'other': 'change_focus'
    };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const insertedFeedback = [];

      for (const raw of rejections) {
        // Normalizar datos del modal
        const exercise_name = String(raw?.exercise_name || '').trim().slice(0, 255) || 'Ejercicio';
        const raw_key = raw?.exercise_key ? String(raw.exercise_key).trim() : '';
        const exercise_key = exercise_name ? toExerciseKey(exercise_name) : (raw_key || 'ejercicio');
        const training_type = normalizeTrainingType(raw?.training_type);
        const equipment_type = normalizeEquipmentType(raw?.equipment_type);
        const rejection_category = raw?.rejection_category || 'other';
        const rejection_reason = raw?.rejection_reason ? String(raw.rejection_reason).slice(0, 1000) : null;
        const expires_in_days = Number(raw?.expires_in_days) || null;

        // Mapear categoría del modal a feedback_type del sistema unificado
        const feedback_type = REJECTION_CATEGORY_MAPPING[rejection_category] || 'dont_like';

        // Calcular fecha de expiración
        let expiresAt = null;
        if (expires_in_days && expires_in_days > 0) {
          expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + expires_in_days);
        }

        // Determinar methodology_type basado en training_type
        let methodology_type = 'home_training'; // Por defecto
        if (training_type?.toLowerCase().includes('calistenia')) {
          methodology_type = 'calistenia';
        } else if (training_type?.toLowerCase().includes('hipertrofia')) {
          methodology_type = 'hipertrofia';
        }

        console.log(`📝 Guardando feedback: ${exercise_name} - ${feedback_type} (${methodology_type})`);

        await client.query(
          `INSERT INTO app.home_exercise_rejections
           (user_id, exercise_name, exercise_key, equipment_type, training_type, rejection_reason, rejection_category, expires_at, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
           ON CONFLICT (user_id, exercise_key, equipment_type, training_type, is_active)
           DO UPDATE SET rejection_reason = EXCLUDED.rejection_reason,
                         rejection_category = EXCLUDED.rejection_category,
                         expires_at = EXCLUDED.expires_at,
                         rejected_at = NOW(),
                         updated_at = NOW()`,
          [user_id, exercise_name, exercise_key, equipment_type, training_type, rejection_reason, rejection_category, expiresAt]
        );

        // Verificar si ya existe feedback para este ejercicio
        const existingResult = await client.query(
          `SELECT id FROM app.user_exercise_feedback
           WHERE user_id = $1 AND exercise_name = $2
           AND methodology_type = $3
           AND (expires_at IS NULL OR expires_at > NOW())`,
          [user_id, exercise_name, methodology_type]
        );

        if (existingResult.rows.length > 0) {
          // Actualizar feedback existente
          const updateResult = await client.query(
            `UPDATE app.user_exercise_feedback
             SET feedback_type = $1,
                 comment = $2,
                 avoidance_duration_days = $3,
                 expires_at = $4,
                 updated_at = NOW()
             WHERE id = $5
             RETURNING *`,
            [feedback_type, rejection_reason, expires_in_days, expiresAt, existingResult.rows[0].id]
          );
          insertedFeedback.push(updateResult.rows[0]);
          console.log(`✏️  Feedback actualizado para: ${exercise_name}`);
        } else {
          // Crear nuevo feedback usando el sistema unificado
          const insertResult = await client.query(
            `INSERT INTO app.user_exercise_feedback
             (user_id, exercise_name, exercise_key, methodology_type, feedback_type,
              comment, avoidance_duration_days, expires_at, ai_weight, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1.0, NOW())
             RETURNING *`,
            [user_id, exercise_name, exercise_key, methodology_type, feedback_type,
             rejection_reason, expires_in_days, expiresAt]
          );
          insertedFeedback.push(insertResult.rows[0]);
          console.log(`✅ Nuevo feedback creado para: ${exercise_name}`);
        }
      }

      await client.query('COMMIT');

      console.log(`🎉 Procesamiento completo: ${insertedFeedback.length} registros`);

      res.json({
        success: true,
        message: `${insertedFeedback.length} ejercicio${insertedFeedback.length !== 1 ? 's' : ''} marcado${insertedFeedback.length !== 1 ? 's' : ''} como rechazado${insertedFeedback.length !== 1 ? 's' : ''}`,
        feedback: insertedFeedback,
        system: 'unified_feedback' // Identificador del nuevo sistema
      });

    } catch (err) {
      await client.query('ROLLBACK');
      console.error('❌ Error dentro de transacción /rejections (unified):', err);
      return res.status(500).json({
        success: false,
        message: 'Error al guardar las preferencias de ejercicios',
        details: err.message,
        system: 'unified_feedback'
      });
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error saving exercise feedback (unified system):', error);
    res.status(500).json({
      success: false,
      message: 'Error al guardar las preferencias de ejercicios'
    });
  }
});

// Obtener ejercicios rechazados para una combinación
router.get('/rejections/:equipmentType/:trainingType', authenticateToken, async (req, res) => {
  try {
    const { equipmentType, trainingType } = req.params;
    const user_id = req.user.userId || req.user.id;

    const result = await pool.query(
      `SELECT * FROM app.get_rejected_exercises_for_combination($1, $2, $3)`,
      [user_id, equipmentType, trainingType]
    );

    res.json({
      success: true,
      rejections: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Error getting exercise rejections:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener ejercicios rechazados'
    });
  }
});

// Eliminar/desactivar un rechazo específico
router.delete('/rejections/:rejectionId', authenticateToken, async (req, res) => {
  try {
    const { rejectionId } = req.params;
    const user_id = req.user.userId || req.user.id;

    const result = await pool.query(
      `UPDATE app.home_exercise_rejections
       SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING exercise_name`,
      [rejectionId, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rechazo no encontrado'
      });
    }

    res.json({
      success: true,
      message: `"${result.rows[0].exercise_name}" ya no será rechazado`
    });

  } catch (error) {
    console.error('Error removing exercise rejection:', error);
    res.status(500).json({
      success: false,
      message: 'Error al eliminar el rechazo'
    });
  }
});

// Obtener historial completo de preferencias del usuario
router.get('/preferences-history', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.userId || req.user.id;

    // 1. Ejercicios favoritos (completados con feedback 'like')
    const favorites = await pool.query(`
      SELECT DISTINCT
        eh.exercise_name,
        COUNT(*) as times_completed,
        MAX(eh.created_at) as last_completed
      FROM app.home_exercise_history eh
      LEFT JOIN app.user_exercise_feedback uef ON (
        uef.user_id = eh.user_id 
        AND uef.exercise_name = eh.exercise_name 
        AND uef.sentiment = 'like'
      )
      WHERE eh.user_id = $1 
        AND uef.sentiment = 'like'
      GROUP BY eh.exercise_name
      ORDER BY times_completed DESC, last_completed DESC
      LIMIT 20
    `, [user_id]);

    // 2. Ejercicios desafiantes (completados con feedback 'hard')
    const challenging = await pool.query(`
      SELECT DISTINCT
        eh.exercise_name,
        COUNT(*) as times_completed,
        MAX(eh.created_at) as last_completed
      FROM app.home_exercise_history eh
      LEFT JOIN app.user_exercise_feedback uef ON (
        uef.user_id = eh.user_id 
        AND uef.exercise_name = eh.exercise_name 
        AND uef.sentiment = 'hard'
      )
      WHERE eh.user_id = $1 
        AND uef.sentiment = 'hard'
      GROUP BY eh.exercise_name
      ORDER BY times_completed DESC, last_completed DESC
      LIMIT 20
    `, [user_id]);

    // 3. Ejercicios rechazados activos
    const rejected = await pool.query(`
      SELECT 
        id,
        exercise_name,
        rejection_reason,
        rejection_category,
        rejected_at,
        expires_at,
        CASE 
          WHEN expires_at IS NULL THEN NULL
          ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (expires_at - NOW())) / 86400))
        END as days_until_expires
      FROM app.home_exercise_rejections 
      WHERE user_id = $1 
        AND is_active = true
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY rejected_at DESC
    `, [user_id]);

    // 4. Analytics generales
    const analytics = await pool.query(`
      SELECT 
        COUNT(*) as total_completed,
        COUNT(DISTINCT exercise_name) as unique_exercises,
        AVG(series) as avg_series,
        SUM(duration_seconds) as total_duration_seconds
      FROM app.home_exercise_history 
      WHERE user_id = $1
    `, [user_id]);

    // 5. Patrones de rechazo (para insights)
    const rejectionPatterns = await pool.query(`
      SELECT 
        rejection_category,
        COUNT(*) as count
      FROM app.home_exercise_rejections 
      WHERE user_id = $1 AND is_active = true
      GROUP BY rejection_category
      ORDER BY count DESC
    `, [user_id]);

    // 6. Ejercicios más populares (sin feedback específico)
    const popular = await pool.query(`
      SELECT 
        exercise_name,
        COUNT(*) as times_completed,
        MAX(created_at) as last_completed
      FROM app.home_exercise_history 
      WHERE user_id = $1
      GROUP BY exercise_name
      ORDER BY times_completed DESC
      LIMIT 10
    `, [user_id]);

    const preferences = {
      favorites: favorites.rows,
      challenging: challenging.rows,
      rejected: rejected.rows,
      analytics: {
        ...analytics.rows[0],
        rejection_patterns: rejectionPatterns.rows,
        popular_exercises: popular.rows
      }
    };

    res.json({
      success: true,
      preferences: preferences
    });

  } catch (error) {
    console.error('Error getting preferences history:', error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el historial de preferencias'
    });
  }
});

// Manejar abandono de sesión (beforeunload, visibility change, etc.)
router.post('/sessions/:sessionId/handle-abandon', authenticateToken, async (req, res) => {
  const { sessionId } = req.params;
  const { currentProgress, reason } = req.body; // reason: 'beforeunload', 'visibility', 'logout'
  const user_id = req.user.userId || req.user.id;

  console.log(`🚪 Usuario ${user_id} abandonando sesión ${sessionId}, motivo: ${reason}`);

  try {
    // 1. Verificar que la sesión pertenece al usuario
    const sessionCheck = await pool.query(
      'SELECT * FROM app.home_training_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, user_id]
    );

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Sesión no encontrada' });
    }

    // 2. Guardar progreso actual si se proporciona
    if (currentProgress) {
      console.log(`💾 Guardando progreso antes de abandono:`, currentProgress);
      
      for (const [exerciseIndex, progress] of Object.entries(currentProgress)) {
        if (progress.series_completed > 0) {
          await pool.query(`
            UPDATE app.home_exercise_progress
            SET 
              series_completed = $1,
              status = $2,
              duration_seconds = COALESCE($3, duration_seconds)
            WHERE home_training_session_id = $4 
              AND exercise_order = $5
          `, [
            progress.series_completed,
            progress.status || 'in_progress',
            progress.duration_seconds,
            sessionId,
            parseInt(exerciseIndex)
          ]);
        }
      }
    }

    // 3. Verificar progreso para determinar el status final
    const progressCheck = await pool.query(`
      SELECT
        COUNT(*) as total_exercises,
        COUNT(*) FILTER (WHERE status IN ('completed', 'skipped')) as finished_exercises,
        COUNT(*) FILTER (WHERE series_completed > 0 OR status IN ('completed', 'skipped', 'in_progress')) as exercises_with_progress
      FROM app.home_exercise_progress
      WHERE home_training_session_id = $1
    `, [sessionId]);

    const { total_exercises, finished_exercises, exercises_with_progress } = progressCheck.rows[0];
    const allFinished = parseInt(finished_exercises) === parseInt(total_exercises) && parseInt(total_exercises) > 0;
    const hasProgress = parseInt(exercises_with_progress) > 0;

    // 4. Determinar status final:
    // - Todos finalizados → 'completed'
    // - Hay progreso pero no todos finalizados → 'in_progress' (permitir reanudar)
    // - Sin progreso → 'cancelled'
    let finalStatus;
    if (allFinished) {
      finalStatus = 'completed';
    } else if (hasProgress) {
      finalStatus = 'in_progress';
    } else {
      finalStatus = 'cancelled';
    }

    // 5. Marcar abandono y actualizar status
    await pool.query(`
      UPDATE app.home_training_sessions
      SET
        abandoned_at = NOW(),
        abandon_reason = $2,
        status = $3,
        completed_at = CASE
          WHEN $3 = 'completed' THEN NOW()
          ELSE completed_at
        END
      WHERE id = $1
    `, [sessionId, reason, finalStatus]);

    console.log(`✅ Sesión ${sessionId} marcada como abandonada (${reason})`);
    console.log(`   Status final: ${finalStatus} (${finished_exercises}/${total_exercises} ejercicios finalizados)`);

    res.json({
      success: true,
      message: 'Progreso guardado antes de abandono',
      finalStatus: finalStatus,
      progress: {
        total: parseInt(total_exercises),
        finished: parseInt(finished_exercises),
        canResume: finalStatus === 'in_progress'
      }
    });
    
  } catch (error) {
    console.error('❌ Error manejando abandono:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Cerrar sesiones activas (para el problema principal)
router.put('/close-active-sessions', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.userId || req.user.id;

    const result = await pool.query(
      `UPDATE app.home_training_sessions
       SET status = 'cancelled', 
           completed_at = NOW(),
           updated_at = NOW()
       WHERE user_id = $1 AND status = 'in_progress'
       RETURNING id`,
      [user_id]
    );

    res.json({
      success: true,
      message: `${result.rows.length} sesión${result.rows.length !== 1 ? 'es' : ''} cerrada${result.rows.length !== 1 ? 's' : ''}`,
      closedSessions: result.rows.length
    });

  } catch (error) {
    console.error('Error closing active sessions:', error);
    res.status(500).json({
      success: false,
      message: 'Error al cerrar sesiones activas'
    });
  }
});

// ===============================================
// FUNCIONES HELPER PARA CACHÉ DE EJERCICIOS
// ===============================================

/**
 * Lista de todas las tablas de ejercicios en la BD
 */
const EXERCISE_TABLES = [
  'Ejercicios_Bomberos',
  'Ejercicios_Calistenia',
  'Ejercicios_Casa',
  'Ejercicios_CrossFit',
  'Ejercicios_Funcional',
  'Ejercicios_Guardia_Civil',
  'Ejercicios_Halterofilia',
  'Ejercicios_Heavy_duty',
  'Ejercicios_Hipertrofia',
  'Ejercicios_Policia_Local',
  'Ejercicios_Powerlifting'
];

/**
 * Busca un ejercicio en todas las tablas de metodologías
 * Retorna: { found: boolean, table: string|null, hasCache: boolean, cacheData: object|null }
 */
async function findExerciseInTables(exerciseName) {
  const normalizedName = exerciseName.toLowerCase().trim();

  for (const table of EXERCISE_TABLES) {
    try {
      // Tablas actualizadas con nuevos nombres de columnas
      const updatedTables = ['Ejercicios_Calistenia', 'Ejercicios_Halterofilia', 'Ejercicios_Heavy_duty',
                             'Ejercicios_Powerlifting', 'Ejercicios_CrossFit', 'Ejercicios_Hipertrofia'];

      const selectQuery = updatedTables.includes(table)
        ? `SELECT nombre, "Cómo_hacerlo" as ejecucion, "Consejos" as consejos, "Errores_comunes" as errores_evitar`
        : `SELECT nombre, ejecucion, consejos, errores_evitar`;

      const result = await pool.query(
        `${selectQuery}
         FROM app."${table}"
         WHERE LOWER(TRIM(nombre)) = $1
         LIMIT 1`,
        [normalizedName]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        const hasCache = row.ejecucion && row.consejos && row.errores_evitar;

        return {
          found: true,
          table: table,
          hasCache: hasCache,
          cacheData: hasCache ? {
            ejecucion: row.ejecucion,
            consejos: row.consejos,
            errores_evitar: row.errores_evitar
          } : null
        };
      }
    } catch (error) {
      console.warn(`Error buscando en ${table}:`, error.message);
      continue;
    }
  }

  return { found: false, table: null, hasCache: false, cacheData: null };
}

/**
 * Guarda la información de IA en la tabla específica de ejercicios
 */
async function saveExerciseInfoToTable(tableName, exerciseName, exerciseInfo) {
  try {
    // Tablas actualizadas con nuevos nombres de columnas
    const updatedTables = ['Ejercicios_Calistenia', 'Ejercicios_Halterofilia', 'Ejercicios_Heavy_duty',
                           'Ejercicios_Powerlifting', 'Ejercicios_CrossFit', 'Ejercicios_Hipertrofia'];

    const updateQuery = updatedTables.includes(tableName)
      ? `UPDATE app."${tableName}"
         SET "Cómo_hacerlo" = $1,
             "Consejos" = $2,
             "Errores_comunes" = $3,
             updated_at = NOW()
         WHERE LOWER(TRIM(nombre)) = $4`
      : `UPDATE app."${tableName}"
         SET ejecucion = $1,
             consejos = $2,
             errores_evitar = $3,
             updated_at = NOW()
         WHERE LOWER(TRIM(nombre)) = $4`;

    await pool.query(updateQuery, [
      exerciseInfo.ejecucion,
      exerciseInfo.consejos,
      exerciseInfo.errores_evitar,
      exerciseName.toLowerCase().trim()
    ]);

    console.log(`💾 Información guardada en ${tableName} para: ${exerciseName}`);
    return true;
  } catch (error) {
    console.error(`❌ Error guardando en ${tableName}:`, error.message);
    return false;
  }
}

// ===============================================
// 🤖 ENDPOINT DE INFORMACIÓN DE EJERCICIOS CON IA
// ===============================================

/**
 * POST /api/ia-home-training/exercise-info
 * Obtiene información detallada de un ejercicio usando IA con cache en BD
 * NUEVO: Busca primero en tablas de metodologías específicas
 */
router.post('/exercise-info', authenticateToken, async (req, res) => {
  try {
    const { exerciseName } = req.body;
    const user_id = req.user.userId || req.user.id;

    if (!exerciseName) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere el nombre del ejercicio'
      });
    }

    // Normalizar nombre del ejercicio para búsqueda
    const normalizedName = exerciseName.toLowerCase().trim();

    console.log(`🔍 Buscando información para ejercicio: ${exerciseName}`);

    // 1. BUSCAR PRIMERO EN TABLAS DE METODOLOGÍAS ESPECÍFICAS
    const exerciseLocation = await findExerciseInTables(exerciseName);

    if (exerciseLocation.found && exerciseLocation.hasCache) {
      // ✅ ENCONTRADO EN TABLA ESPECÍFICA CON CACHE
      console.log(`💾 Cache HIT en ${exerciseLocation.table} para: ${exerciseName}`);

      return res.json({
        success: true,
        exerciseInfo: exerciseLocation.cacheData,
        source: 'specific_table',
        table_name: exerciseLocation.table,
        cached: true
      });
    }

    // 2. SI EXISTE EN TABLA ESPECÍFICA PERO SIN CACHE → Generar y guardar ahí
    // 3. SI NO EXISTE EN NINGUNA TABLA → Buscar en exercise_ai_info (fallback)

    if (!exerciseLocation.found) {
      // Buscar en tabla genérica (exercise_ai_info) como fallback
      const cacheResult = await pool.query(
        `SELECT ejecucion, consejos, errores_evitar, request_count, ai_model_used, created_at
         FROM app.exercise_ai_info
         WHERE exercise_name_normalized = $1 OR exercise_name = $2
         LIMIT 1`,
        [normalizedName, exerciseName]
      );

      if (cacheResult.rows.length > 0) {
        const cachedInfo = cacheResult.rows[0];

        await pool.query(
          `UPDATE app.exercise_ai_info
           SET request_count = request_count + 1,
               last_updated = NOW()
           WHERE exercise_name_normalized = $1 OR exercise_name = $2`,
          [normalizedName, exerciseName]
        );

        console.log(`💾 Cache HIT en exercise_ai_info (genérica) para ${exerciseName}`);

        return res.json({
          success: true,
          exerciseInfo: {
            ejecucion: cachedInfo.ejecucion,
            consejos: cachedInfo.consejos,
            errores_evitar: cachedInfo.errores_evitar
          },
          source: 'generic_cache',
          cached_at: cachedInfo.created_at,
          model_used: cachedInfo.ai_model_used
        });
      }
    }

    // 4. NO ENCONTRADO EN NINGÚN CACHE - GENERAR CON IA
    const cacheTarget = exerciseLocation.found ? exerciseLocation.table : 'exercise_ai_info';
    console.log(`🤖 Cache MISS - Generando información para: ${exerciseName} → guardará en ${cacheTarget}`);

    // Prompt específico para información de ejercicios
    const exerciseInfoPrompt = `Eres un experto entrenador personal y biomecánico. Te voy a dar el nombre de un ejercicio y necesito que me proporciones información detallada sobre él.

Ejercicio: "${exerciseName}"

Proporciona una respuesta en formato JSON con la siguiente estructura exacta:
{
  "ejecucion": "Explicación paso a paso de cómo ejecutar correctamente el ejercicio",
  "consejos": "Consejos específicos para mejorar la técnica y maximizar los beneficios",
  "errores_evitar": "Errores comunes que deben evitarse al realizar este ejercicio"
}

Instrucciones importantes:
- Sé específico y técnico en las explicaciones
- Cada sección debe tener entre 100-200 palabras
- Usa un lenguaje claro y profesional
- Si el ejercicio no existe o no lo conoces, indica alternativas similares
- Responde ÚNICAMENTE con el JSON, sin texto adicional`;

    try {
      // Obtener cliente OpenAI para home training
      const openai = getOpenAIClient('home');
      const model = "gpt-4o-mini";

      const startTime = Date.now();
      const completion = await openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: "system",
            content: exerciseInfoPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      });

      const aiResponse = completion.choices[0]?.message?.content;
      const tokensUsed = completion.usage?.total_tokens || 0;
      const responseTime = Date.now() - startTime;

      if (!aiResponse) {
        throw new Error('No se recibió respuesta de OpenAI');
      }

      // Limpiar respuesta de IA (puede venir con ```json...``` markdown)
      let cleanedResponse = aiResponse.trim();

      // Eliminar bloques de código markdown si existen
      const blockMatch = cleanedResponse.match(/```json\s*([\s\S]*?)```/i) || cleanedResponse.match(/```\s*([\s\S]*?)```/i);
      if (blockMatch && blockMatch[1]) {
        cleanedResponse = blockMatch[1].trim();
      }

      // Extraer solo el objeto JSON (buscar primera { y última })
      const firstBrace = cleanedResponse.indexOf('{');
      const lastBrace = cleanedResponse.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleanedResponse = cleanedResponse.slice(firstBrace, lastBrace + 1);
      }

      // Intentar parsear la respuesta JSON limpia
      let exerciseInfo;
      try {
        exerciseInfo = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error('Error parseando respuesta de IA:', parseError);
        console.error('Respuesta recibida:', cleanedResponse.slice(0, 500));
        throw new Error('Respuesta de IA no válida');
      }

      // Validar que la respuesta tenga la estructura esperada
      if (!exerciseInfo.ejecucion || !exerciseInfo.consejos || !exerciseInfo.errores_evitar) {
        throw new Error('Respuesta de IA incompleta');
      }

      // 3. GUARDAR EN CACHE (tabla específica o genérica según corresponda)
      const estimatedCost = (tokensUsed / 1000) * 0.0015; // Estimación para gpt-4o-mini

      try {
        if (exerciseLocation.found) {
          // ✅ GUARDAR EN TABLA ESPECÍFICA (el ejercicio existe en una metodología)
          const saved = await saveExerciseInfoToTable(
            exerciseLocation.table,
            exerciseName,
            exerciseInfo
          );

          if (saved) {
            console.log(`💾 Información guardada en ${exerciseLocation.table} para: ${exerciseName} (${tokensUsed} tokens, ~$${estimatedCost.toFixed(4)})`);
          } else {
            console.warn(`⚠️ No se pudo guardar en ${exerciseLocation.table}, intentando con cache genérica...`);
            // Fallback: intentar guardar en tabla genérica si falla el guardado específico
            await pool.query(
              `INSERT INTO app.exercise_ai_info
               (exercise_name, exercise_name_normalized, ejecucion, consejos, errores_evitar,
                first_requested_by, ai_model_used, tokens_used, generation_cost, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
               ON CONFLICT (exercise_name) DO UPDATE SET
                 request_count = app.exercise_ai_info.request_count + 1,
                 last_updated = NOW()`,
              [exerciseName, normalizedName, exerciseInfo.ejecucion, exerciseInfo.consejos,
               exerciseInfo.errores_evitar, user_id, model, tokensUsed, estimatedCost]
            );
            console.log(`💾 Información guardada en cache genérica (fallback) para: ${exerciseName}`);
          }
        } else {
          // ❌ NO EXISTE EN NINGUNA TABLA → GUARDAR EN CACHE GENÉRICA (exercise_ai_info)
          await pool.query(
            `INSERT INTO app.exercise_ai_info
             (exercise_name, exercise_name_normalized, ejecucion, consejos, errores_evitar,
              first_requested_by, ai_model_used, tokens_used, generation_cost, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
             ON CONFLICT (exercise_name) DO UPDATE SET
               request_count = app.exercise_ai_info.request_count + 1,
               last_updated = NOW()`,
            [
              exerciseName,
              normalizedName,
              exerciseInfo.ejecucion,
              exerciseInfo.consejos,
              exerciseInfo.errores_evitar,
              user_id,
              model,
              tokensUsed,
              estimatedCost
            ]
          );

          console.log(`💾 Información guardada en cache genérica para: ${exerciseName} (${tokensUsed} tokens, ~$${estimatedCost.toFixed(4)})`);
        }
      } catch (cacheError) {
        console.warn('⚠️ Error guardando en cache (no crítico):', cacheError.message);
      }

      console.log(`✅ Información generada exitosamente para: ${exerciseName} (${responseTime}ms)`);

      res.json({
        success: true,
        exerciseInfo: {
          ejecucion: exerciseInfo.ejecucion,
          consejos: exerciseInfo.consejos,
          errores_evitar: exerciseInfo.errores_evitar
        },
        source: 'ai_generated',
        tokens_used: tokensUsed,
        model_used: model,
        response_time_ms: responseTime
      });

    } catch (aiError) {
      console.error('Error llamando a OpenAI:', aiError);

      // Respuesta de fallback en caso de error de IA
      res.json({
        success: true,
        exerciseInfo: {
          ejecucion: `Para realizar ${exerciseName} correctamente, asegúrate de mantener una postura adecuada y realizar el movimiento de forma controlada. Consulta con un entrenador para obtener instrucciones específicas.`,
          consejos: `Concéntrate en la técnica antes que en la intensidad. Realiza el ejercicio lentamente al principio para dominar la forma correcta.`,
          errores_evitar: `Evita realizar movimientos bruscos, no mantener la postura correcta, y no calentar adecuadamente antes del ejercicio.`
        },
        source: 'fallback'
      });
    }

  } catch (error) {
    console.error('Error en endpoint exercise-info:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor al obtener información del ejercicio'
    });
  }
});

// ===============================================
// 📊 ENDPOINT DE ESTADÍSTICAS Y ADMINISTRACIÓN DE CACHE
// ===============================================

/**
 * GET /api/ia-home-training/exercise-info/stats
 * Obtiene estadísticas del cache de información de ejercicios
 */
router.get('/exercise-info/stats', authenticateToken, async (req, res) => {
  try {
    console.log('📊 Obteniendo estadísticas del cache de ejercicios...');

    // Estadísticas generales
    const generalStats = await pool.query(`
      SELECT
        COUNT(*) as total_exercises,
        SUM(request_count) as total_requests,
        SUM(tokens_used) as total_tokens,
        SUM(generation_cost) as total_cost,
        COUNT(*) FILTER (WHERE is_verified = true) as verified_count,
        MAX(request_count) as max_requests,
        MIN(created_at) as first_exercise_date,
        MAX(last_updated) as last_request_date
      FROM app.exercise_ai_info
    `);

    // Top ejercicios más solicitados
    const topRequested = await pool.query(`
      SELECT
        exercise_name,
        request_count,
        ai_model_used,
        created_at,
        last_updated
      FROM app.exercise_ai_info
      ORDER BY request_count DESC, last_updated DESC
      LIMIT 10
    `);

    // Ejercicios recientes
    const recentExercises = await pool.query(`
      SELECT
        exercise_name,
        request_count,
        ai_model_used,
        created_at
      FROM app.exercise_ai_info
      ORDER BY created_at DESC
      LIMIT 5
    `);

    // Distribución por modelo de IA
    const modelDistribution = await pool.query(`
      SELECT
        ai_model_used,
        COUNT(*) as exercise_count,
        SUM(tokens_used) as total_tokens,
        SUM(generation_cost) as total_cost
      FROM app.exercise_ai_info
      GROUP BY ai_model_used
      ORDER BY exercise_count DESC
    `);

    const stats = generalStats.rows[0];

    res.json({
      success: true,
      stats: {
        general: {
          total_exercises: parseInt(stats.total_exercises),
          total_requests: parseInt(stats.total_requests || 0),
          total_tokens: parseInt(stats.total_tokens || 0),
          total_cost: parseFloat(stats.total_cost || 0),
          verified_count: parseInt(stats.verified_count || 0),
          max_requests: parseInt(stats.max_requests || 0),
          first_exercise_date: stats.first_exercise_date,
          last_request_date: stats.last_request_date,
          cache_efficiency: stats.total_requests > stats.total_exercises
            ? ((stats.total_requests - stats.total_exercises) / stats.total_requests * 100).toFixed(1) + '%'
            : '0%'
        },
        top_requested: topRequested.rows,
        recent_exercises: recentExercises.rows,
        model_distribution: modelDistribution.rows
      }
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener estadísticas del cache de ejercicios'
    });
  }
});

/**
 * PUT /api/ia-home-training/exercise-info/:exerciseId/verify
 * Marcar información de ejercicio como verificada
 */
router.put('/exercise-info/:exerciseId/verify', authenticateToken, async (req, res) => {
  try {
    const { exerciseId } = req.params;
    const { verified = true } = req.body;

    const result = await pool.query(
      `UPDATE app.exercise_ai_info
       SET is_verified = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING exercise_name, is_verified`,
      [verified, exerciseId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Ejercicio no encontrado'
      });
    }

    const exercise = result.rows[0];

    res.json({
      success: true,
      message: `Ejercicio "${exercise.exercise_name}" ${exercise.is_verified ? 'verificado' : 'marcado como no verificado'}`,
      exercise: exercise
    });

  } catch (error) {
    console.error('Error verificando ejercicio:', error);
    res.status(500).json({
      success: false,
      error: 'Error al verificar información del ejercicio'
    });
  }
});

export default router;




