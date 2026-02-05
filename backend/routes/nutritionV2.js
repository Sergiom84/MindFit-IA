/**
 * Rutas para el sistema de nutrición V2 (Determinista + Normalizado)
 * Sistema híbrido que coexiste con nutrition.js (JSON-based)
 */

import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  calculateBMR,
  calculateTDEE,
  adjustCaloriesForGoal,
  calculateMacros,
  generateNutritionPlan,
  validateMacros
} from '../services/nutritionCalculator.js';
import { nutritionMenuGeneratorPrompt } from '../prompts/nutrition-menu-generator.js';
import OpenAI from 'openai';
import { ensureWeeklySnapshot, logNutritionChange } from '../services/nutritionAuditLogger.js';

const router = express.Router();

const METABOLIC_ORDER = ['tolerante', 'mixto', 'intolerante'];

function daysBetween(a, b) {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.abs(Math.round((b.getTime() - a.getTime()) / MS_PER_DAY));
}

async function generateMenuForMeal({ userId, meal, dayInfo }) {
  // Obtener perfil del usuario
  const profileResult = await pool.query(
    'SELECT preferencias, alergias FROM app.nutrition_profiles WHERE user_id = $1',
    [userId]
  );

  const userPreferences = profileResult.rows[0] || {
    preferencias: {},
    alergias: []
  };

  // Obtener catálogo de alimentos (filtrado por preferencias)
  const foodsQuery = `
      SELECT id, nombre, categoria, macros_100g, tags
      FROM app.foods
      WHERE is_verified = true
      ORDER BY nombre
      LIMIT 50;
    `;

  const foodsResult = await pool.query(foodsQuery);
  const availableFoods = foodsResult.rows;

  // Generar prompt
  const prompt = nutritionMenuGeneratorPrompt({
    meal,
    dayInfo,
    userPreferences,
    availableFoods
  });

  // Llamar a OpenAI
  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: 'Eres un nutricionista deportivo experto especializado en generar menús precisos que cumplan objetivos de macronutrientes. Respondes SOLO con JSON válido.'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature: 0.7,
    max_tokens: 2000
  });

  const responseText = completion.choices[0].message.content.trim();

  // Extraer JSON de la respuesta (por si viene con markdown)
  let menuData;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      menuData = JSON.parse(jsonMatch[0]);
    } else {
      menuData = JSON.parse(responseText);
    }
  } catch (parseError) {
    console.error('Error parseando respuesta de IA:', responseText);
    throw new Error('La IA no generó un JSON válido');
  }

  const validation = menuData.validacion;
  const maxError = Math.max(
    validation.error_kcal_porcentaje,
    validation.error_protein_porcentaje,
    validation.error_carbs_porcentaje,
    validation.error_fat_porcentaje
  );

  if (maxError > 2) {
    console.warn('⚠️  Menú generado excede margen de error del 2%:', validation);
  }

  return {
    menu: menuData,
    metadata: {
      model: completion.model,
      tokens_used: completion.usage.total_tokens,
      max_error: maxError
    }
  };
}

function evaluateVolume(base, latest) {
  const weightGain = latest.weight - base.weight;
  const waistGain = latest.waist - base.waist;
  if (weightGain <= 0 || !isFinite(weightGain)) {
    return { status: 'observacion', indicator: null, interpretation: 'Sin ganancia de peso en la ventana', action: 'Registrar otra medición y reevaluar', needsConfirmation: true };
  }
  const icg = waistGain / weightGain;
  if (icg >= 1.5) {
    return { status: 'rojo', indicator: icg, interpretation: 'Ganancia de grasa excesiva', action: 'Pasar a normocalórica o definición 2-4 semanas', needsConfirmation: true };
  }
  if (icg >= 1.0) {
    return { status: 'amarillo', indicator: icg, interpretation: 'Volumen descontrolado', action: 'Reducir superávit 150-250 kcal/día', needsConfirmation: true };
  }
  if (icg >= 0.8) {
    return { status: 'verde', indicator: icg, interpretation: 'Volumen correcto', action: 'Mantener estrategia', needsConfirmation: false };
  }
  return { status: 'verde_plus', indicator: icg, interpretation: 'Volumen muy eficiente', action: 'Mantener o subir carga de entreno', needsConfirmation: false };
}

function evaluateDefinition(base, latest) {
  const weightLoss = base.weight - latest.weight;
  const waistLoss = base.waist - latest.waist;
  if (weightLoss <= 0 || !isFinite(weightLoss)) {
    return { status: 'observacion', indicator: null, interpretation: 'Sin pérdida de peso en la ventana', action: 'Registrar otra medición y reevaluar', needsConfirmation: true };
  }
  const ipg = waistLoss / weightLoss;
  if (ipg < 0.6) {
    return { status: 'rojo', indicator: ipg, interpretation: 'Riesgo de pérdida muscular', action: 'Subir kcal +150-250 o diet break', needsConfirmation: true };
  }
  if (ipg < 0.8) {
    return { status: 'amarillo', indicator: ipg, interpretation: 'Déficit agresivo', action: 'Mantener 7-14 días y reevaluar', needsConfirmation: true };
  }
  if (ipg < 1.2) {
    return { status: 'verde', indicator: ipg, interpretation: 'Definición eficiente', action: 'Mantener', needsConfirmation: false };
  }
  return { status: 'verde_plus', indicator: ipg, interpretation: 'Muy buena pérdida de grasa', action: 'Mantener o microajuste', needsConfirmation: false };
}

function evaluateMaintenance(base, latest) {
  const weightDiff = latest.weight - base.weight;
  const waistDiff = latest.waist - base.waist;
  const absW = Math.abs(weightDiff);
  const absC = Math.abs(waistDiff);

  // IEC según documento
  if (weightDiff >= 1 && waistDiff >= 1) {
    return { status: 'rojo', indicator: weightDiff, interpretation: 'Superávit no deseado', action: 'Reducir kcal 150/día', needsConfirmation: true };
  }
  if (absW <= 0.5) {
    return { status: 'amarillo', indicator: weightDiff, interpretation: 'Oscilación normal', action: 'Mantener y observar (confirmación 2.1)', needsConfirmation: true };
  }
  if (absW <= 0.3 && waistDiff < 0) {
    return { status: 'verde', indicator: weightDiff, interpretation: 'Recomp positiva', action: 'Mantener', needsConfirmation: false };
  }
  if (absW <= 0.2 && waistDiff <= -0.2) {
    return { status: 'verde_plus', indicator: weightDiff, interpretation: 'Recomp ideal', action: 'Mantener o micro superávit', needsConfirmation: false };
  }
  return { status: 'amarillo', indicator: weightDiff, interpretation: 'Variación leve', action: 'Observar y repetir medición', needsConfirmation: true };
}

// Inicializar OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

function normalizeSexo(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();

  if (['hombre', 'masculino', 'male', 'm'].includes(normalized)) return 'hombre';
  if (['mujer', 'femenino', 'female', 'f'].includes(normalized)) return 'mujer';

  return null;
}

function normalizeActividad(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();

  const mapping = {
    sedentario: 'sedentario',
    ligeramente_activo: 'ligeramente_activo',
    'ligeramente activo': 'ligeramente_activo',
    ligero: 'ligero',
    moderado: 'moderado',
    activo: 'activo',
    muy_activo: 'muy_activo',
    alto: 'alto',
    muy_alto: 'muy_alto'
  };

  return mapping[normalized] || null;
}

function normalizeNivelEntrenamiento(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();

  const mapping = {
    beginner: 'principiante',
    intermediate: 'intermedio',
    advanced: 'avanzado',
    principiante: 'principiante',
    intermedio: 'intermedio',
    avanzado: 'avanzado',
    'intermedio+': 'intermedio'
  };

  return mapping[normalized] || normalized;
}

// ================================================
// PERFIL NUTRICIONAL
// ================================================

/**
 * GET /api/nutrition-v2/profile
 * Obtener perfil nutricional del usuario
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT * FROM app.nutrition_profiles WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil nutricional no encontrado' });
    }

    const profile = result.rows[0];
    // Garantizar campo de sincronización con default false
    profile.nutrition_overrides_profile = profile.nutrition_overrides_profile || false;
    res.json(profile);
  } catch (error) {
    console.error('Error al obtener perfil nutricional:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
});

/**
 * POST /api/nutrition-v2/profile
 * Crear o actualizar perfil nutricional
 */
router.post('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const payload = req.body || {};
    const hasField = (field) => Object.prototype.hasOwnProperty.call(payload, field);

    const existingProfileResult = await pool.query(
      'SELECT * FROM app.nutrition_profiles WHERE user_id = $1',
      [userId]
    );
    const existingProfile = existingProfileResult.rows[0] || null;

    let userFallback = null;
    const getUserFallback = async () => {
      if (userFallback) return userFallback;

      const userResult = await pool.query(
        `
          SELECT
            sexo,
            edad,
            altura,
            peso,
            nivel_actividad,
            comidas_por_dia,
            frecuencia_semanal,
            cintura,
            grasa_corporal,
            nivel_entrenamiento
          FROM app.users
          WHERE id = $1
        `,
        [userId]
      );

      userFallback = userResult.rows[0] || null;
      return userFallback;
    };

    // Base requerido: permite omitirlos si ya existen en nutrition_profiles o en app.users
    let sexo = hasField('sexo') ? normalizeSexo(payload.sexo) : normalizeSexo(existingProfile?.sexo);
    let edad = hasField('edad') ? payload.edad : existingProfile?.edad;
    let altura_cm = hasField('altura_cm') ? payload.altura_cm : existingProfile?.altura_cm;
    let peso_kg = hasField('peso_kg') ? payload.peso_kg : existingProfile?.peso_kg;
    let objetivo = hasField('objetivo') ? payload.objetivo : existingProfile?.objetivo;
    let actividad = hasField('actividad') ? normalizeActividad(payload.actividad) : normalizeActividad(existingProfile?.actividad);

    // Otros campos (preservan valores existentes si no se envían)
    let comidas_dia = hasField('comidas_dia') ? payload.comidas_dia : existingProfile?.comidas_dia;
    let preferencias = hasField('preferencias') ? payload.preferencias : existingProfile?.preferencias;
    let alergias = hasField('alergias') ? payload.alergias : existingProfile?.alergias;

    let metabolic_type = hasField('metabolic_type') ? payload.metabolic_type : existingProfile?.metabolic_type;
    let formula_preferida = hasField('formula_preferida') ? payload.formula_preferida : existingProfile?.formula_preferida;
    let training_days = hasField('training_days') ? payload.training_days : existingProfile?.training_days;
    let waist_cm = hasField('waist_cm') ? payload.waist_cm : existingProfile?.waist_cm;
    let bodyfat_percent = hasField('bodyfat_percent') ? payload.bodyfat_percent : existingProfile?.bodyfat_percent;
    let steps_per_day = hasField('steps_per_day') ? payload.steps_per_day : existingProfile?.steps_per_day;
    let level = hasField('level') ? payload.level : existingProfile?.level;

    let metabolic_score = hasField('metabolic_score') ? payload.metabolic_score : existingProfile?.metabolic_score;
    let metabolic_confidence = hasField('metabolic_confidence') ? payload.metabolic_confidence : existingProfile?.metabolic_confidence;
    let metabolic_pending_type = hasField('metabolic_pending_type') ? payload.metabolic_pending_type : existingProfile?.metabolic_pending_type;
    let metabolic_pending_count = hasField('metabolic_pending_count')
      ? payload.metabolic_pending_count
      : (existingProfile?.metabolic_pending_count ?? 0);

    let nutrition_overrides_profile = hasField('nutrition_overrides_profile')
      ? payload.nutrition_overrides_profile
      : (existingProfile?.nutrition_overrides_profile ?? false);

    if (!sexo || !edad || !altura_cm || !peso_kg || !objetivo || !actividad) {
      const userData = await getUserFallback();
      if (userData) {
        sexo = sexo || normalizeSexo(userData.sexo);
        edad = edad ?? userData.edad;
        altura_cm = altura_cm ?? userData.altura;
        peso_kg = peso_kg ?? userData.peso;
        actividad = actividad || normalizeActividad(userData.nivel_actividad);

        if (comidas_dia == null) comidas_dia = userData.comidas_por_dia;
        if (training_days == null) training_days = userData.frecuencia_semanal;
        if (waist_cm == null) waist_cm = userData.cintura;
        if (bodyfat_percent == null) bodyfat_percent = userData.grasa_corporal;
        if (level == null) level = userData.nivel_entrenamiento;
      }
    }

    // Validar campos requeridos (tras fallbacks)
    if (!sexo || !edad || !altura_cm || !peso_kg || !objetivo || !actividad) {
      return res.status(400).json({
        error: 'Faltan campos requeridos (sexo/edad/altura_cm/peso_kg/objetivo/actividad). Completa tu perfil o envía estos campos.'
      });
    }

    const edadValue = Number.parseInt(edad, 10);
    const alturaValue = Number.parseInt(altura_cm, 10);
    const pesoValue = Number.parseFloat(peso_kg);
    const comidasValue = comidas_dia == null ? 4 : Number.parseInt(comidas_dia, 10);

    const trainingDaysValue = training_days == null ? null : Number.parseInt(training_days, 10);
    const stepsValue = steps_per_day == null ? null : Number.parseInt(steps_per_day, 10);
    const waistValue = waist_cm == null ? null : Number.parseFloat(waist_cm);
    const bodyfatValue = bodyfat_percent == null ? null : Number.parseFloat(bodyfat_percent);

    const levelValue = level == null ? null : normalizeNivelEntrenamiento(level);
    const preferenciasValue = preferencias && typeof preferencias === 'object' ? preferencias : {};
    const alergiasValue = Array.isArray(alergias) ? alergias : [];

    if (!Number.isFinite(edadValue) || !Number.isFinite(alturaValue) || !Number.isFinite(pesoValue)) {
      return res.status(400).json({ error: 'Datos inválidos: edad/altura_cm/peso_kg deben ser numéricos' });
    }

    if (edadValue < 14 || edadValue > 80 || alturaValue < 120 || alturaValue > 220 || pesoValue < 30 || pesoValue > 250) {
      return res.status(400).json({ error: 'Datos fuera de rango: edad 14-80, altura 120-220 cm, peso 30-250 kg' });
    }

    // Insertar o actualizar perfil
    const query = `
      INSERT INTO app.nutrition_profiles (
        user_id, sexo, edad, altura_cm, peso_kg, objetivo, actividad, comidas_dia, preferencias, alergias,
        metabolic_type, formula_preferida, training_days, waist_cm, bodyfat_percent, steps_per_day, level,
        metabolic_score, metabolic_confidence, metabolic_pending_type, metabolic_pending_count, nutrition_overrides_profile
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
      ON CONFLICT (user_id)
      DO UPDATE SET
        sexo = EXCLUDED.sexo,
        edad = EXCLUDED.edad,
        altura_cm = EXCLUDED.altura_cm,
        peso_kg = EXCLUDED.peso_kg,
        objetivo = EXCLUDED.objetivo,
        actividad = EXCLUDED.actividad,
        comidas_dia = EXCLUDED.comidas_dia,
        preferencias = EXCLUDED.preferencias,
        alergias = EXCLUDED.alergias,
        metabolic_type = EXCLUDED.metabolic_type,
        formula_preferida = EXCLUDED.formula_preferida,
        training_days = EXCLUDED.training_days,
        waist_cm = EXCLUDED.waist_cm,
        bodyfat_percent = EXCLUDED.bodyfat_percent,
        steps_per_day = EXCLUDED.steps_per_day,
        level = EXCLUDED.level,
        metabolic_score = EXCLUDED.metabolic_score,
        metabolic_confidence = EXCLUDED.metabolic_confidence,
        metabolic_pending_type = EXCLUDED.metabolic_pending_type,
        metabolic_pending_count = EXCLUDED.metabolic_pending_count,
        nutrition_overrides_profile = EXCLUDED.nutrition_overrides_profile,
        updated_at = NOW()
      RETURNING *;
    `;

    const result = await pool.query(query, [
      userId,
      sexo,
      edadValue,
      alturaValue,
      pesoValue,
      objetivo,
      actividad,
      comidasValue,
      JSON.stringify(preferenciasValue),
      JSON.stringify(alergiasValue),
      metabolic_type,
      formula_preferida,
      trainingDaysValue,
      waistValue,
      bodyfatValue,
      stepsValue,
      levelValue,
      metabolic_score,
      metabolic_confidence,
      metabolic_pending_type,
      metabolic_pending_count,
      nutrition_overrides_profile
    ]);

    // Calcular estimaciones
    const profile = result.rows[0];
    const bmr = calculateBMR(profile);
    const tdee = calculateTDEE(bmr, actividad, training_days || undefined, steps_per_day || undefined);
    const kcalObjetivo = adjustCaloriesForGoal(tdee, objetivo, profile);

    res.json({
      profile: profile,
      estimaciones: {
        bmr,
        tdee,
        kcal_objetivo: kcalObjetivo
      }
    });
  } catch (error) {
    console.error('Error al guardar perfil nutricional:', error);
    res.status(500).json({ error: 'Error al guardar perfil' });
  }
});

// ================================================
// GENERACIÓN DE PLANES DETERMINISTAS
// ================================================

/**
 * POST /api/nutrition-v2/generate-plan
 * Generar plan nutricional usando cálculo determinista
 */
router.post('/generate-plan', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      duracion_dias = 7,
      training_type = 'general',
      training_schedule = [] // Array de booleanos: [true, false, true, ...]
    } = req.body;

    // Validar duración
    if (duracion_dias < 3 || duracion_dias > 31) {
      return res.status(400).json({ error: 'La duración debe estar entre 3 y 31 días' });
    }

    // Obtener perfil del usuario
    const profileResult = await pool.query(
      'SELECT * FROM app.nutrition_profiles WHERE user_id = $1',
      [userId]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Debes crear un perfil nutricional primero',
        hint: 'POST /api/nutrition-v2/profile'
      });
    }

    const profile = profileResult.rows[0];

    // Generar plan usando cálculo determinista
    const planData = generateNutritionPlan(
      {
        ...profile,
        training_type,
        training_days: profile.training_days || (training_schedule.length > 0 ? training_schedule.filter(Boolean).length : undefined),
        metabolic_type: profile.metabolic_type,
        steps_per_day: profile.steps_per_day
      },
      duracion_dias,
      training_schedule
    );

    console.log('✅ Plan determinista generado:', {
      bmr: planData.bmr,
      tdee: planData.tdee,
      kcal_objetivo: planData.kcal_objetivo,
      dias: planData.days.length
    });

    // Guardar plan en la base de datos
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Mantener un único plan activo: archivar planes previos del usuario
      await client.query(
        `
        UPDATE app.nutrition_plans_v2
        SET tipo = 'archivado'
        WHERE user_id = $1 AND tipo = 'activo';
        `,
        [userId]
      );

      // 1. Crear plan maestro
      const planQuery = `
        INSERT INTO app.nutrition_plans_v2 (
          user_id, plan_name, tipo, bmr, tdee, kcal_objetivo, macros_objetivo,
          meta, duracion_dias, training_type, comidas_por_dia, fuente, version_reglas
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id;
      `;

      const planResult = await client.query(planQuery, [
        userId,
        `Plan ${profile.objetivo} - ${duracion_dias} días`,
        'activo',
        planData.bmr,
        planData.tdee,
        planData.kcal_objetivo,
        JSON.stringify(planData.macros_objetivo),
        planData.meta,
        planData.duracion_dias,
        planData.training_type,
        planData.comidas_por_dia,
        planData.fuente,
        planData.version_reglas
      ]);

      const planId = planResult.rows[0].id;

      // 2. Crear días del plan
      for (const day of planData.days) {
        const dayQuery = `
          INSERT INTO app.nutrition_plan_days (
            plan_id, day_index, tipo_dia, kcal, macros
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING id;
        `;

        const dayResult = await client.query(dayQuery, [
          planId,
          day.day_index,
          day.tipo_dia,
          day.kcal,
          JSON.stringify(day.macros)
        ]);

        const dayId = dayResult.rows[0].id;

        // 3. Crear comidas del día
        for (const meal of day.meals) {
          const mealQuery = `
            INSERT INTO app.nutrition_meals (
              plan_day_id, orden, nombre, kcal, macros, timing_note
            ) VALUES ($1, $2, $3, $4, $5, $6);
          `;

          await client.query(mealQuery, [
            dayId,
            meal.orden,
            meal.nombre,
            meal.kcal,
            JSON.stringify(meal.macros),
            meal.timing_note
          ]);
        }
      }

      // Una vez generado el plan, la fuente pasa a ser nutrición -> perfil
      await client.query(
        'UPDATE app.nutrition_profiles SET nutrition_overrides_profile = TRUE, updated_at = NOW() WHERE user_id = $1',
        [userId]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        message: 'Plan nutricional generado exitosamente',
        plan_id: planId,
        plan: {
          bmr: planData.bmr,
          tdee: planData.tdee,
          kcal_objetivo: planData.kcal_objetivo,
          macros_objetivo: planData.macros_objetivo,
          duracion_dias: planData.duracion_dias,
          comidas_por_dia: planData.comidas_por_dia
        }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error al generar plan determinista:', error);
    res.status(500).json({ error: 'Error al generar plan nutricional' });
  }
});

/**
 * GET /api/nutrition-v2/active-plan
 * Obtener plan nutricional activo del usuario
 */
router.get('/active-plan', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const query = `
      SELECT
        p.*,
        (
          SELECT json_agg(
            json_build_object(
              'day_index', d.day_index,
              'tipo_dia', d.tipo_dia,
              'kcal', d.kcal,
              'macros', d.macros,
              'day_id', d.id,
              'meals', (
                SELECT json_agg(
                  json_build_object(
                    'id', m.id,
                    'orden', m.orden,
                    'nombre', m.nombre,
                    'kcal', m.kcal,
                    'macros', m.macros,
                    'timing_note', m.timing_note
                  ) ORDER BY m.orden
                )
                FROM app.nutrition_meals m
                WHERE m.plan_day_id = d.id
              )
            ) ORDER BY d.day_index
          )
          FROM app.nutrition_plan_days d
          WHERE d.plan_id = p.id
        ) as days
      FROM app.nutrition_plans_v2 p
      WHERE p.user_id = $1 AND p.tipo = 'activo'
      ORDER BY p.created_at DESC
      LIMIT 1;
    `;

    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No tienes un plan activo' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error al obtener plan activo:', error);
    res.status(500).json({ error: 'Error al obtener plan' });
  }
});

/**
 * GET /api/nutrition-v2/audit
 * Resumen de auditoría (logs de cambios + snapshots)
 */
router.get('/audit', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Number.parseInt(req.query.limit || '20', 10);
    const snapshotLimit = Number.parseInt(req.query.snapshot_limit || '8', 10);

    const [logsResult, snapshotsResult] = await Promise.all([
      pool.query(
        `SELECT * FROM app.nutrition_change_log
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userId, limit]
      ),
      pool.query(
        `SELECT * FROM app.nutrition_weekly_snapshots
         WHERE user_id = $1
         ORDER BY snapshot_date DESC
         LIMIT $2`,
        [userId, snapshotLimit]
      )
    ]);

    res.json({
      success: true,
      change_log: logsResult.rows,
      snapshots: snapshotsResult.rows
    });
  } catch (error) {
    console.error('Error obteniendo auditoría nutricional:', error);
    res.status(500).json({ error: 'Error al obtener auditoría nutricional' });
  }
});

// ================================================
// CATÁLOGO DE ALIMENTOS
// ================================================

/**
 * GET /api/nutrition-v2/foods
 * Buscar alimentos en el catálogo
 */
router.get('/foods', authenticateToken, async (req, res) => {
  try {
    const { search, categoria, limit = 50 } = req.query;

    let query = 'SELECT * FROM app.foods WHERE 1=1';
    const params = [];
    let paramCount = 1;

    if (search) {
      query += ` AND LOWER(nombre) LIKE LOWER($${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }

    if (categoria) {
      query += ` AND categoria = $${paramCount}`;
      params.push(categoria);
      paramCount++;
    }

    query += ` ORDER BY nombre LIMIT $${paramCount}`;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Error al buscar alimentos:', error);
    res.status(500).json({ error: 'Error al buscar alimentos' });
  }
});

/**
 * GET /api/nutrition-v2/foods/categories
 * Obtener categorías de alimentos disponibles
 */
router.get('/foods/categories', authenticateToken, async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT categoria, COUNT(*) as count
      FROM app.foods
      GROUP BY categoria
      ORDER BY categoria;
    `;

    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener categorías:', error);
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
});

// ================================================
// GENERACIÓN DE MENÚS CON IA
// ================================================

/**
 * POST /api/nutrition-v2/generate-menu
 * Generar menú específico para una comida usando IA
 */
router.post('/generate-menu', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { meal, dayInfo } = req.body;

    // Validar datos requeridos
    if (!meal || !dayInfo) {
      return res.status(400).json({ error: 'Faltan datos de comida o día' });
    }

    console.log('🤖 Generando menú con IA para:', meal.nombre);
    const result = await generateMenuForMeal({ userId, meal, dayInfo });

    res.json({
      success: true,
      menu: result.menu,
      metadata: result.metadata
    });
  } catch (error) {
    console.error('Error generando menú con IA:', error);
    res.status(500).json({
      error: 'Error al generar menú',
      details: error.message
    });
  }
});

/**
 * POST /api/nutrition-v2/generate-full-day-menus
 * Generar todos los menús de un día completo
 */
router.post('/generate-full-day-menus', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { dayId } = req.body;

    if (!dayId) {
      return res.status(400).json({ error: 'Falta ID del día' });
    }

    // Obtener día completo con comidas
    const dayQuery = `
      SELECT
        d.*,
        (
          SELECT json_agg(m ORDER BY m.orden)
          FROM app.nutrition_meals m
          WHERE m.plan_day_id = d.id
        ) as meals
      FROM app.nutrition_plan_days d
      JOIN app.nutrition_plans_v2 p ON p.id = d.plan_id
      WHERE d.id = $1 AND p.user_id = $2;
    `;

    const dayResult = await pool.query(dayQuery, [dayId, userId]);

    if (dayResult.rows.length === 0) {
      return res.status(404).json({ error: 'Día no encontrado' });
    }

    const day = dayResult.rows[0];
    const generatedMenus = [];

    for (const meal of day.meals) {
      try {
        const menuResponse = await generateMenuForMeal({
          userId,
          meal,
          dayInfo: {
            tipo_dia: day.tipo_dia,
            day_index: day.day_index
          }
        });

        generatedMenus.push({
          meal_id: meal.id,
          menu: menuResponse.menu,
          metadata: menuResponse.metadata
        });

        await new Promise(resolve => setTimeout(resolve, 600));
      } catch (error) {
        console.error(`Error generando menú para ${meal.nombre}:`, error);
        generatedMenus.push({
          meal_id: meal.id,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      day_id: dayId,
      menus_generated: generatedMenus.filter(m => !m.error).length,
      total_meals: day.meals.length,
      menus: generatedMenus
    });
  } catch (error) {
    console.error('Error generando menús del día:', error);
    res.status(500).json({ error: 'Error al generar menús del día' });
  }
});

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

function clampMetabolicChange(current, target) {
  const idxCurrent = METABOLIC_ORDER.indexOf(current);
  const idxTarget = METABOLIC_ORDER.indexOf(target);
  if (idxCurrent === -1 || idxTarget === -1) return target;
  if (Math.abs(idxTarget - idxCurrent) <= 1) return target;
  return METABOLIC_ORDER[idxTarget > idxCurrent ? idxCurrent + 1 : idxCurrent - 1];
}

function classifyMetabolicScore(score) {
  if (score >= 4) return 'intolerante';
  if (score <= -4) return 'tolerante';
  return 'mixto';
}

function confidenceFromAnswers(answered, unknown) {
  if (answered >= 8 && unknown <= 2) return 'alta';
  if (answered >= 6 && unknown <= 4) return 'media';
  return 'baja';
}

router.post('/metabolic-evaluate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { answers = [], signals = {} } = req.body; // answers: [{value, unknown:boolean}]

    const answered = answers.filter(a => a.value !== null && a.value !== undefined).length;
    const unknown = answers.filter(a => a.value === null || a.value === undefined).length;
    const baseScore = answers.reduce((sum, a) => sum + (Number(a.value) || 0), 0);

    // Ajustes por señales objetivas
    let score = baseScore;
    if (signals.icgFlag === 'high') score += 1; // volumen con ICG amarillo/rojo sin mejoras
    if (signals.performanceLossCut) score += 1; // definición con hambre/rendimiento bajo
    if (signals.stableEnergyWithCarbs && signals.waistStableOrDown) score -= 1;

    const confidence = confidenceFromAnswers(answered, unknown);
    let proposed = classifyMetabolicScore(score);
    if (confidence === 'baja') {
      proposed = 'mixto';
    }

    // Obtener perfil actual
    const profileResult = await pool.query('SELECT metabolic_type, metabolic_pending_type, metabolic_pending_count, metabolic_confidence FROM app.nutrition_profiles WHERE user_id = $1', [userId]);
    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil nutricional no encontrado' });
    }
    const currentProfile = profileResult.rows[0];
    const currentType = currentProfile.metabolic_type || 'mixto';

    // Regla: máximo 1 categoría por ciclo
    proposed = clampMetabolicChange(currentType, proposed);

    let newType = currentType;
    let pendingType = currentProfile.metabolic_pending_type;
    let pendingCount = currentProfile.metabolic_pending_count || 0;

    if (proposed !== currentType) {
      if (pendingType === proposed) {
        pendingCount += 1;
        if (pendingCount >= 2) {
          newType = proposed;
          pendingType = null;
          pendingCount = 0;
        }
      } else {
        pendingType = proposed;
        pendingCount = 1;
      }
    } else {
      // Si coincide, limpiar pendientes
      pendingType = null;
      pendingCount = 0;
    }

    const updateQuery = `
      UPDATE app.nutrition_profiles
      SET metabolic_score = $1,
          metabolic_confidence = $2,
          metabolic_type = $3,
          metabolic_pending_type = $4,
          metabolic_pending_count = $5,
          metabolic_last_evaluated_at = NOW()
      WHERE user_id = $6
      RETURNING *;
    `;

    const updateResult = await pool.query(updateQuery, [
      score,
      confidence,
      newType,
      pendingType,
      pendingCount,
      userId
    ]);

    res.json({
      success: true,
      score,
      confidence,
      applied_type: newType,
      pending_type: pendingType,
      pending_count: pendingCount
    });
  } catch (error) {
    console.error('Error en evaluación metabólica:', error);
    res.status(500).json({ error: 'Error al evaluar perfil metabólico' });
  }
});

export default router;
