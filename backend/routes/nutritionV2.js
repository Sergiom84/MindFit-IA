/**
 * Rutas para el sistema de nutrición V2 (Determinista + Normalizado)
 * Sistema híbrido que coexiste con nutrition.js (JSON-based)
 */


import express from 'express';
import {
  pool
} from '../db.js';
import {
  authenticateToken
} from '../middleware/auth.js';
import {
  calculateBMRAudit,
  calculateTDEEAudit,
  calculateGoalAdjustmentAudit,
  generateNutritionPlan,
  summarizeCarbCycling
} from '../services/nutritionCalculator.js';
import {
  ensureWeeklySnapshot,
  logNutritionChange
} from '../services/nutritionAuditLogger.js';
import {
  ensureWorkoutScheduleV3
} from '../utils/ensureScheduleV3.js';
import {
  getDailyNutritionLogV2,
  isNutritionDayRegistered,
  upsertDailyNutritionLogV2
} from '../services/nutritionDailyLogV2.js';
import {
  getNutritionReview
} from '../services/nutritionReviewService.js';
import {
  applyNutritionKcalAdjustment
} from '../services/nutritionAdjustmentService.js';
import {
  undoLastNutritionKcalAdjustment
} from '../services/nutritionAdjustmentService.js';
import {
  METABOLIC_QUESTIONS,
  calculatePendingProfileState,
  processMetabolicEvaluation
} from '../services/metabolicProfileCalculator.js';
import {
  VALID_ESTADOS_PESADO,
  VALID_DIET_FILTERS,
  VALID_MENU_GENERATION_MODES,
  DETERMINISTIC_RECENT_FOOD_WINDOW_DAYS,
  SWAP_MEAL_RECALC_MAX_ERROR,
  parseJsonObject,
  normalizeStringArray,
  normalizeDietFilter,
  normalizeEstadoPesado,
  normalizePositiveInt,
  buildFoodCatalogFilters,
  parseNumeric,
  buildConversionMapFromRows,
  parseMealMacros,
  clampNumber,
  calculateMacroTotals,
  percentError,
  getPrimaryRoleFromRoles,
  areRoleSetsCompatible,
  computeMacrosAndKcalFromFood,
  computeSwapBaseGrams,
  resolveShownStateWithFallback,
  resolveBaseGramsFromMealItem,
  createVarietyContext,
  loadRecentFoodUsageMap,
  registerMenuFoodsInVarietyContext,
  persistGeneratedMenuItemsForMeal,
  daysBetween,
  formatLocalDate,
  mapMethodologyToTrainingType,
  getRoleGramBounds,
  optimizeDraftItemGrams,
  getUserMenuGenerationContext,
  getMenuConversionFactors,
  generateMenuForMeal,
  isHybridAiEnabled,
  normalizeSexo,
  normalizeActividad,
  mapUserObjectiveToNutritionGoal,
  resolveNutritionObjectiveMismatch,
  normalizeNivelEntrenamiento
} from '../services/nutritionV2Engine.js';
import {
  evaluateVolume,
  evaluateDefinition,
  evaluateMaintenance
} from '../services/nutritionEvaluations.js';

const router = express.Router();

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
    const userResult = await pool.query(
      'SELECT objetivo_principal FROM app.users WHERE id = $1',
      [userId]
    );
    // Garantizar campo de sincronización con default false
    profile.nutrition_overrides_profile = profile.nutrition_overrides_profile || false;
    profile.objetivo = resolveNutritionObjectiveMismatch({
      userId,
      userObjectivePrincipal: userResult.rows[0]?.objetivo_principal,
      nutritionObjective: profile.objetivo,
      nutritionOverridesProfile: profile.nutrition_overrides_profile
    }) || profile.objetivo;
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
            nivel_entrenamiento,
            objetivo_principal
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

        // Mapear objetivo_principal de onboarding a objetivo nutricional
        if (!objetivo && userData.objetivo_principal) {
          objetivo = mapUserObjectiveToNutritionGoal(userData.objetivo_principal) || 'mant';
        }
      }
    }

    // Cuando nutrition_overrides_profile es false, sincronizar datos frescos de users
    if (!nutrition_overrides_profile && existingProfile) {
      const userData = await getUserFallback();
      if (userData) {
        sexo = normalizeSexo(userData.sexo) || sexo;
        edad = userData.edad ?? edad;
        altura_cm = userData.altura ?? altura_cm;
        peso_kg = userData.peso ?? peso_kg;
        actividad = normalizeActividad(userData.nivel_actividad) || actividad;
        if (userData.objetivo_principal) {
          const mappedGoal = mapUserObjectiveToNutritionGoal(userData.objetivo_principal);
          if (mappedGoal) objetivo = mappedGoal;
        }
      }
    }

    const resolvedObjective = resolveNutritionObjectiveMismatch({
      userId,
      userObjectivePrincipal: (await getUserFallback())?.objetivo_principal,
      nutritionObjective: objetivo,
      nutritionOverridesProfile: nutrition_overrides_profile
    });
    if (resolvedObjective) {
      objetivo = resolvedObjective;
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
    const bmrAudit = calculateBMRAudit(profile);
    const tdeeAudit = calculateTDEEAudit(
      bmrAudit.bmr,
      actividad,
      training_days || undefined,
      steps_per_day || undefined
    );
    const kcalAudit = calculateGoalAdjustmentAudit(tdeeAudit.tdee, objetivo, profile);
    const bmr = bmrAudit.bmr;
    const tdee = tdeeAudit.tdee;
    const kcalObjetivo = kcalAudit.kcal_objetivo;

    console.info('[NutritionV2] Audit perfil nutricional', {
      userId,
      formula: bmrAudit.formula,
      formula_reason: bmrAudit.reason,
      activity_input: tdeeAudit.actividad_input,
      activity_normalized: tdeeAudit.actividad_normalized,
      base_factor: tdeeAudit.base_factor,
      training_factor: tdeeAudit.training_factor,
      steps_adjustment: tdeeAudit.steps_adjustment,
      applied_factor: tdeeAudit.applied_factor,
      goal_factor: kcalAudit.goal_factor,
      tdee,
      kcal_objetivo: kcalObjetivo
    });

    res.json({
      profile: profile,
      estimaciones: {
        bmr,
        tdee,
        kcal_objetivo: kcalObjetivo,
        audit: {
          bmr: bmrAudit,
          tdee: tdeeAudit,
          kcal: kcalAudit
        }
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
    if (duracion_dias < 3 || duracion_dias > 28) {
      return res.status(400).json({ error: 'La duración debe estar entre 3 y 28 días' });
    }

    const requestedTrainingType = training_type;
    const requestedTrainingSchedule = Array.isArray(training_schedule) ? training_schedule : [];

    let resolvedTrainingType = requestedTrainingType;
    let resolvedTrainingSchedule = requestedTrainingSchedule;

    // Si existe plan de entrenamiento activo, Nutrición debe enlazarse siempre al plan (spec: puente Entrenamiento<->Nutrición).
    const activePlanResult = await pool.query(
      `
        SELECT
          id as methodology_plan_id,
          methodology_type,
          plan_data,
          plan_start_date,
          confirmed_at,
          created_at,
          status
        FROM app.methodology_plans
        WHERE user_id = $1
          AND status IN ('active', 'confirmed')
          AND cancelled_at IS NULL
        ORDER BY is_current DESC NULLS LAST, confirmed_at DESC NULLS LAST, created_at DESC
        LIMIT 1
      `,
      [userId]
    );

    if (activePlanResult.rowCount > 0) {
      const activePlan = activePlanResult.rows[0];
      const methodologyPlanId = activePlan.methodology_plan_id;

      resolvedTrainingType = mapMethodologyToTrainingType(activePlan.methodology_type) || 'general';

      // Asegurar que exista programación real en workout_schedule (on-demand).
      const hasScheduleResult = await pool.query(
        `
          SELECT 1
          FROM app.workout_schedule
          WHERE methodology_plan_id = $1 AND user_id = $2
          LIMIT 1
        `,
        [methodologyPlanId, userId]
      );

      if (hasScheduleResult.rowCount === 0) {
        const startConfigQuery = await pool.query(
          `SELECT * FROM app.plan_start_config WHERE methodology_plan_id = $1`,
          [methodologyPlanId]
        );
        const startConfig = startConfigQuery.rowCount > 0 ? startConfigQuery.rows[0] : null;
        const startDateFromPlan =
          activePlan.plan_start_date || activePlan.confirmed_at || activePlan.created_at || new Date();

        const scheduleClient = await pool.connect();
        try {
          await ensureWorkoutScheduleV3(
            scheduleClient,
            userId,
            methodologyPlanId,
            activePlan.plan_data,
            startDateFromPlan,
            startConfig
          );
        } finally {
          scheduleClient.release();
        }
      }

      // Construir calendario diario para los próximos N días desde hoy (local) usando scheduled_date.
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endDate = new Date(today);
      endDate.setDate(today.getDate() + (duracion_dias - 1));

      const scheduleRangeResult = await pool.query(
        `
          SELECT scheduled_date
          FROM app.workout_schedule
          WHERE methodology_plan_id = $1
            AND user_id = $2
            AND scheduled_date BETWEEN $3 AND $4
          ORDER BY scheduled_date ASC
        `,
        [methodologyPlanId, userId, formatLocalDate(today), formatLocalDate(endDate)]
      );

      const scheduledDates = new Set(
        scheduleRangeResult.rows
          .map((row) => formatLocalDate(row.scheduled_date))
          .filter(Boolean)
      );

      resolvedTrainingSchedule = Array.from({ length: duracion_dias }, (_, index) => {
        const date = new Date(today);
        date.setDate(today.getDate() + index);
        const key = formatLocalDate(date);
        return scheduledDates.has(key);
      });
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
        training_type: resolvedTrainingType,
        training_days: profile.training_days || (resolvedTrainingSchedule.length > 0 ? resolvedTrainingSchedule.filter(Boolean).length : undefined),
        metabolic_type: profile.metabolic_type,
        metabolic_confidence: profile.metabolic_confidence,
        steps_per_day: profile.steps_per_day
      },
      duracion_dias,
      resolvedTrainingSchedule
    );

    console.log('✅ Plan determinista generado:', {
      bmr: planData.bmr,
      tdee: planData.tdee,
      kcal_objetivo: planData.kcal_objetivo,
      formula: planData.calculation_audit?.bmr?.formula || null,
      formula_reason: planData.calculation_audit?.bmr?.reason || null,
      activity_input: planData.calculation_audit?.tdee?.actividad_input || null,
      activity_normalized: planData.calculation_audit?.tdee?.actividad_normalized || null,
      applied_activity_factor: planData.calculation_audit?.tdee?.applied_factor || null,
      goal_factor: planData.calculation_audit?.kcal?.goal_factor || null,
      metabolic_type: profile.metabolic_type || 'mixto',
      metabolic_confidence: profile.metabolic_confidence || 'media',
      macros_objetivo: planData.macros_objetivo,
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
          comidas_por_dia: planData.comidas_por_dia,
          carb_cycling_audit: planData.carb_cycling_audit
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
                    'timing_note', m.timing_note,
                    'items', COALESCE((
                      SELECT json_agg(
                        json_build_object(
                          'id', mi.id,
                          'orden', mi.orden,
                          'food_id', COALESCE(mi.food_id, mi.alimento_id),
                          'food_slug', f.slug,
                          'food_nombre', f.nombre,
                          'food_categoria', f.categoria,
                          'food_grupo_factor', f.grupo_factor,
                          'descripcion', mi.descripcion,
                          'cantidad_g', mi.cantidad_g,
                          'cantidad_g_base', mi.cantidad_g_base,
                          'cantidad_g_mostrada', mi.cantidad_g_mostrada,
                          'estado_pesado_base', mi.estado_pesado_base,
                          'estado_pesado_mostrado', mi.estado_pesado_mostrado,
                          'kcal', mi.kcal,
                          'macros', mi.macros,
                          'tags', mi.tags
                        ) ORDER BY mi.orden
                      )
                      FROM app.nutrition_meal_items mi
                      LEFT JOIN app.foods f ON f.id = COALESCE(mi.food_id, mi.alimento_id)
                      WHERE mi.meal_id = m.id
                    ), '[]'::json)
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

    const activePlan = result.rows[0];
    const profileResult = await pool.query(
      'SELECT * FROM app.nutrition_profiles WHERE user_id = $1 LIMIT 1',
      [userId]
    );

    if (profileResult.rows.length === 0) {
      return res.json(activePlan);
    }

    const profile = profileResult.rows[0];
    const bmrAudit = calculateBMRAudit(profile);
    const tdeeAudit = calculateTDEEAudit(
      bmrAudit.bmr,
      profile.actividad,
      profile.training_days || undefined,
      profile.steps_per_day || undefined
    );
    const kcalAudit = calculateGoalAdjustmentAudit(tdeeAudit.tdee, profile.objetivo, profile);
    const currentEstimate = {
      bmr: bmrAudit.bmr,
      tdee: tdeeAudit.tdee,
      kcal_objetivo: kcalAudit.kcal_objetivo,
      calculation_audit: {
        bmr: bmrAudit,
        tdee: tdeeAudit,
        kcal: kcalAudit
      }
    };
    const carbCyclingSummary = summarizeCarbCycling(activePlan.days, activePlan.kcal_objetivo);

    const activePlanKcal = Number(activePlan.kcal_objetivo);
    const estimateKcal = Number(currentEstimate.kcal_objetivo);
    if (
      Number.isFinite(activePlanKcal) &&
      Number.isFinite(estimateKcal) &&
      Math.abs(activePlanKcal - estimateKcal) >= 250
    ) {
      console.warn('[NutritionV2] Plan activo con kcal alejadas de la estimacion actual', {
        userId,
        active_plan_kcal: activePlanKcal,
        current_estimate_kcal: estimateKcal,
        formula: bmrAudit.formula,
        applied_factor: tdeeAudit.applied_factor,
        goal_factor: kcalAudit.goal_factor
      });
    }

    res.json({
      ...activePlan,
      carb_cycling_summary: carbCyclingSummary,
      current_estimate: currentEstimate
    });
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
    const userId = req.user.id;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : null;
    const categoria = typeof req.query.categoria === 'string' ? req.query.categoria.trim() : null;
    const categoriaDetalle = typeof req.query.categoria_detalle === 'string'
      ? req.query.categoria_detalle.trim()
      : null;
    const compatibleWithItemId = typeof req.query.compatible_with_item_id === 'string'
      ? req.query.compatible_with_item_id.trim()
      : null;
    const grupoFactorRaw = req.query.grupo_factor ?? req.query.group_factor;
    const grupoFactor = typeof grupoFactorRaw === 'string' ? grupoFactorRaw.trim() : null;

    const dietRaw = req.query.diet;
    const diet = normalizeDietFilter(dietRaw);
    if (dietRaw && !diet) {
      return res.status(400).json({
        error: 'Parámetro diet inválido',
        allowed: VALID_DIET_FILTERS
      });
    }

    const estadoBaseRaw = req.query.estado_base ?? req.query.estado_pesado_base;
    const estadoBase = normalizeEstadoPesado(estadoBaseRaw);
    if (estadoBaseRaw && !estadoBase) {
      return res.status(400).json({
        error: 'Parámetro estado_base inválido',
        allowed: VALID_ESTADOS_PESADO
      });
    }

    const allergensExcludeRaw = req.query.allergens_exclude ?? req.query.alergias_exclude;
    const allergensExclude = normalizeStringArray(allergensExcludeRaw);
    const onlyVerified = req.query.only_verified !== 'false';
    let compatibilityContext = null;

    if (compatibleWithItemId) {
      const itemContextResult = await pool.query(
        `
          SELECT COALESCE(mi.food_id, mi.alimento_id) AS current_food_id
          FROM app.nutrition_meal_items mi
          JOIN app.nutrition_meals m ON m.id = mi.meal_id
          JOIN app.nutrition_plan_days d ON d.id = m.plan_day_id
          JOIN app.nutrition_plans_v2 p ON p.id = d.plan_id
          WHERE mi.id::text = $1
            AND p.user_id = $2
          LIMIT 1;
        `,
        [compatibleWithItemId, userId]
      );

      if (itemContextResult.rowCount === 0) {
        return res.status(404).json({ error: 'Ítem de comida no encontrado para filtrar compatibilidad' });
      }

      const currentFoodId = itemContextResult.rows[0]?.current_food_id || null;
      const currentRolesResult = currentFoodId
        ? await pool.query(
          `SELECT role FROM app.food_roles WHERE food_id = $1`,
          [currentFoodId]
        )
        : { rows: [] };

      compatibilityContext = {
        currentFoodId: currentFoodId ? String(currentFoodId) : null,
        currentRoles: currentRolesResult.rows
          .map((row) => String(row.role || '').trim().toUpperCase())
          .filter(Boolean)
      };
    }

    const page = normalizePositiveInt(req.query.page, 1);
    const pageSize = normalizePositiveInt(req.query.page_size ?? req.query.limit, 50, 200);
    const offset = (page - 1) * pageSize;

    const { whereSql, params, normalizedAllergens } = buildFoodCatalogFilters({
      search,
      categoria,
      categoriaDetalle,
      diet,
      allergensExclude,
      estadoBase,
      grupoFactor,
      onlyVerified
    });

    const countQuery = `SELECT COUNT(*)::int AS total FROM app.foods WHERE ${whereSql};`;
    const countResult = await pool.query(countQuery, params);
    const total = countResult.rows[0]?.total || 0;
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

    const dataQuery = `
      SELECT
        id,
        slug,
        nombre,
        categoria,
        categoria_detalle,
        macros_100g,
        fibra_100g,
        porcion_tipica_g,
        estado_pesado_base,
        estado_pesado_mostrado_default,
        metodo_preparacion,
        grupo_factor,
        meal_suitability,
        processing_level,
        culinary_family,
        is_snack_only,
        is_main_dish_allowed,
        palatability_score,
        medida_casera,
        tipo_dieta,
        is_vegetarian,
        is_vegan,
        tags,
        equivalencias,
        is_verified,
        source,
        created_at,
        updated_at
      FROM app.foods
      WHERE ${whereSql}
      ORDER BY nombre
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2};
    `;
    const dataResult = await pool.query(dataQuery, [...params, pageSize, offset]);
    let foods = dataResult.rows;

    if (compatibilityContext) {
      const candidateIds = foods
        .map((food) => String(food.id || '').trim())
        .filter(Boolean);

      let rolesByFoodId = new Map();
      if (candidateIds.length > 0) {
        const rolesResult = await pool.query(
          `
            SELECT food_id, role
            FROM app.food_roles
            WHERE food_id::text = ANY($1::text[]);
          `,
          [candidateIds]
        );

        rolesByFoodId = rolesResult.rows.reduce((map, row) => {
          const key = String(row.food_id || '').trim();
          if (!key) return map;
          if (!map.has(key)) {
            map.set(key, []);
          }
          map.get(key).push(String(row.role || '').trim().toUpperCase());
          return map;
        }, new Map());
      }

      foods = foods.filter((food) => {
        const foodId = String(food.id || '').trim();
        if (!foodId) return false;
        if (compatibilityContext.currentFoodId && foodId === compatibilityContext.currentFoodId) {
          return false;
        }

        const newRoles = rolesByFoodId.get(foodId) || [];
        if (compatibilityContext.currentRoles.length > 0 && newRoles.length === 0) {
          return false;
        }

        return areRoleSetsCompatible(compatibilityContext.currentRoles, newRoles);
      });
    }

    res.json({
      foods,
      pagination: {
        page,
        page_size: pageSize,
        total: compatibilityContext ? foods.length : total,
        total_pages: compatibilityContext ? (foods.length > 0 ? 1 : 0) : totalPages,
        has_next: compatibilityContext ? false : (totalPages > 0 && page < totalPages),
        has_prev: page > 1
      },
      filters: {
        search,
        categoria,
        categoria_detalle: categoriaDetalle,
        diet,
        allergens_exclude: normalizedAllergens,
        estado_base: estadoBase,
        grupo_factor: grupoFactor,
        only_verified: onlyVerified,
        compatible_with_item_id: compatibleWithItemId || null
      }
    });
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

/**
 * GET /api/nutrition-v2/food-conversion-factors
 * Obtener factores de conversión de estados de pesado.
 */
router.get('/food-conversion-factors', authenticateToken, async (req, res) => {
  try {
    const groupFactorRaw = req.query.grupo_factor ?? req.query.group_factor;
    const groupFactor = typeof groupFactorRaw === 'string' ? groupFactorRaw.trim() : null;

    const estadoBaseRaw = req.query.estado_base;
    const estadoBase = normalizeEstadoPesado(estadoBaseRaw);
    if (estadoBaseRaw && !estadoBase) {
      return res.status(400).json({
        error: 'Parámetro estado_base inválido',
        allowed: VALID_ESTADOS_PESADO
      });
    }

    const estadoObjetivoRaw = req.query.estado_objetivo;
    const estadoObjetivo = normalizeEstadoPesado(estadoObjetivoRaw);
    if (estadoObjetivoRaw && !estadoObjetivo) {
      return res.status(400).json({
        error: 'Parámetro estado_objetivo inválido',
        allowed: VALID_ESTADOS_PESADO
      });
    }

    let query = `
      SELECT
        id,
        grupo_factor,
        estado_base,
        estado_objetivo,
        factor_base_objetivo,
        nota
      FROM app.food_conversion_factors
      WHERE 1=1
    `;
    const params = [];

    if (groupFactor) {
      query += ` AND LOWER(grupo_factor) = LOWER($${params.length + 1})`;
      params.push(groupFactor);
    }

    if (estadoBase) {
      query += ` AND estado_base = $${params.length + 1}`;
      params.push(estadoBase);
    }

    if (estadoObjetivo) {
      query += ` AND estado_objetivo = $${params.length + 1}`;
      params.push(estadoObjetivo);
    }

    query += ' ORDER BY grupo_factor, estado_base, estado_objetivo';
    const result = await pool.query(query, params);

    res.json({
      factors: result.rows,
      filters: {
        grupo_factor: groupFactor,
        estado_base: estadoBase,
        estado_objetivo: estadoObjetivo
      }
    });
  } catch (error) {
    console.error('Error al obtener factores de conversión:', error);
    res.status(500).json({ error: 'Error al obtener factores de conversión' });
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
    const { meal, dayInfo, persist = true } = req.body;
    const modeRaw = String(req.body.mode || 'deterministic').toLowerCase();
    if (!VALID_MENU_GENERATION_MODES.includes(modeRaw)) {
      return res.status(400).json({
        error: 'Modo de generación inválido',
        allowed: VALID_MENU_GENERATION_MODES
      });
    }
    if (modeRaw === 'hybrid_ai' && !isHybridAiEnabled()) {
      return res.status(400).json({
        error: 'Modo hybrid_ai deshabilitado',
        hint: 'Activa NUTRITION_HYBRID_ENABLED=true para habilitarlo'
      });
    }

    // Validar datos requeridos
    if (!meal || !dayInfo) {
      return res.status(400).json({ error: 'Faltan datos de comida o día' });
    }

    let varietyContext = null;
    if (modeRaw === 'deterministic' || modeRaw === 'hybrid_ai' || modeRaw === 'recipe_examples') {
      const dayIndex = Number.parseInt(dayInfo?.day_index, 10);
      const planId = dayInfo?.plan_id || dayInfo?.planId || null;
      varietyContext = createVarietyContext();
      varietyContext.recentFoodUsage = await loadRecentFoodUsageMap({
        planId,
        currentDayIndex: dayIndex,
        lookbackDays: DETERMINISTIC_RECENT_FOOD_WINDOW_DAYS
      });
    }

    const generationContext = modeRaw === 'hybrid_ai'
      ? await getUserMenuGenerationContext({ userId, foodsLimit: 120 })
      : null;
    const conversionFactors = modeRaw === 'hybrid_ai'
      ? await getMenuConversionFactors()
      : null;

    console.log(`🧠 Generando menú (${modeRaw}) para:`, meal.nombre);
    const result = await generateMenuForMeal({
      userId,
      meal,
      dayInfo,
      mode: modeRaw,
      varietyContext,
      generationContext,
      conversionFactors
    });
    let persistedItems = null;

    if (persist && meal?.id) {
      persistedItems = await persistGeneratedMenuItemsForMeal({
        mealId: meal.id,
        menuData: result.menu,
        availableFoods: result.availableFoods
      });
    }

    res.json({
      success: true,
      mode: modeRaw,
      menu: result.menu,
      metadata: result.metadata,
      persistence: persistedItems
    });
  } catch (error) {
    console.error('Error generando menú:', error);
    res.status(500).json({
      error: 'Error al generar menú',
      details: error.message
    });
  }
});

/**
 * POST /api/nutrition-v2/meals/:mealId/items/:itemId/swap-food
 * Sustituir un alimento de una comida y recalcular macros/kcal de toda la comida.
 */
router.post('/meals/:mealId/items/:itemId/swap-food', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const { mealId, itemId } = req.params;
    const {
      replacement_food_id: replacementFoodIdRaw,
      replacement_food_slug: replacementFoodSlugRaw,
      estado_pesado_mostrado: estadoPesadoMostradoRaw
    } = req.body || {};

    const replacementFoodId = replacementFoodIdRaw ? String(replacementFoodIdRaw).trim() : null;
    const replacementFoodSlug = replacementFoodSlugRaw ? String(replacementFoodSlugRaw).trim() : null;

    if (!mealId || !itemId) {
      return res.status(400).json({ success: false, error: 'mealId y itemId son requeridos' });
    }
    if (!replacementFoodId && !replacementFoodSlug) {
      return res.status(400).json({
        success: false,
        error: 'Debes enviar replacement_food_id o replacement_food_slug'
      });
    }

    const itemResult = await client.query(
      `
        SELECT
          mi.*,
          m.nombre AS meal_name,
          m.kcal AS meal_kcal,
          m.macros AS meal_macros,
          d.id AS day_id,
          d.plan_id,
          d.day_index,
          d.tipo_dia,
          COALESCE(mi.food_id, mi.alimento_id) AS current_food_id
        FROM app.nutrition_meal_items mi
        JOIN app.nutrition_meals m ON m.id = mi.meal_id
        JOIN app.nutrition_plan_days d ON d.id = m.plan_day_id
        JOIN app.nutrition_plans_v2 p ON p.id = d.plan_id
        WHERE mi.id = $1
          AND mi.meal_id = $2
          AND p.user_id = $3
        LIMIT 1;
      `,
      [itemId, mealId, userId]
    );

    if (itemResult.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Ítem de comida no encontrado' });
    }
    const currentItem = itemResult.rows[0];

    const replacementFoodResult = await client.query(
      `
        SELECT
          id,
          slug,
          nombre,
          categoria,
          categoria_detalle,
          macros_100g,
          tags,
          estado_pesado_base,
          estado_pesado_mostrado_default,
          grupo_factor,
          porcion_tipica_g,
          is_verified
        FROM app.foods
        WHERE is_verified = TRUE
          AND (
            ($1::uuid IS NOT NULL AND id = $1::uuid)
            OR ($2::text IS NOT NULL AND LOWER(slug) = LOWER($2))
          )
        LIMIT 1;
      `,
      [replacementFoodId || null, replacementFoodSlug || null]
    );

    if (replacementFoodResult.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Alimento de reemplazo no encontrado o no verificado' });
    }
    const replacementFood = replacementFoodResult.rows[0];

    const mealItemsResult = await client.query(
      `
        SELECT
          mi.id,
          mi.meal_id,
          mi.orden,
          mi.descripcion,
          mi.kcal AS item_kcal,
          mi.macros AS item_macros,
          mi.tags AS item_tags,
          mi.cantidad_g,
          mi.cantidad_g_base,
          mi.cantidad_g_mostrada,
          mi.estado_pesado_base,
          mi.estado_pesado_mostrado,
          COALESCE(mi.food_id, mi.alimento_id) AS current_food_id,
          f.id AS db_food_id,
          f.slug AS db_food_slug,
          f.nombre AS db_food_nombre,
          f.categoria AS db_food_categoria,
          f.categoria_detalle AS db_food_categoria_detalle,
          f.macros_100g AS db_food_macros_100g,
          f.tags AS db_food_tags,
          f.estado_pesado_base AS db_food_estado_base,
          f.estado_pesado_mostrado_default AS db_food_estado_mostrado_default,
          f.grupo_factor AS db_food_grupo_factor,
          f.porcion_tipica_g AS db_food_porcion_tipica_g,
          f.is_verified AS db_food_verified
        FROM app.nutrition_meal_items mi
        LEFT JOIN app.foods f ON f.id = COALESCE(mi.food_id, mi.alimento_id)
        WHERE mi.meal_id = $1
        ORDER BY mi.orden, mi.id;
      `,
      [mealId]
    );

    if (mealItemsResult.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'No hay items en la comida para recalcular' });
    }

    const targetMealItem = mealItemsResult.rows.find((row) => String(row.id) === String(itemId));
    if (!targetMealItem) {
      return res.status(404).json({ success: false, error: 'Ítem objetivo no encontrado en la comida' });
    }

    const foodIdsForRoleLookup = [
      ...new Set(
        mealItemsResult.rows
          .map((row) => row.current_food_id)
          .concat([replacementFood.id, currentItem.current_food_id])
          .filter(Boolean)
      )
    ];

    let rolesByFoodId = new Map();
    if (foodIdsForRoleLookup.length > 0) {
      const rolesResult = await client.query(
        `
          SELECT food_id, role
          FROM app.food_roles
          WHERE food_id = ANY($1::uuid[]);
        `,
        [foodIdsForRoleLookup]
      );
      rolesByFoodId = rolesResult.rows.reduce((acc, row) => {
        const key = String(row.food_id || '');
        if (!key) return acc;
        if (!acc.has(key)) acc.set(key, []);
        acc.get(key).push(String(row.role || '').toUpperCase());
        return acc;
      }, new Map());
    }

    const currentRoles = rolesByFoodId.get(String(currentItem.current_food_id || '')) || [];
    const replacementRoles = rolesByFoodId.get(String(replacementFood.id || '')) || [];

    if (!areRoleSetsCompatible(currentRoles, replacementRoles)) {
      return res.status(400).json({
        success: false,
        error: 'El alimento de reemplazo no es compatible con el rol del ítem actual',
        current_roles: currentRoles,
        replacement_roles: replacementRoles
      });
    }

    const foodGroupFactors = [
      ...new Set(
        mealItemsResult.rows
          .map((row) => String(
            String(row.id) === String(itemId)
              ? replacementFood.grupo_factor
              : row.db_food_grupo_factor
          ).trim().toLowerCase())
          .filter(Boolean)
      )
    ];
    const conversionRows = foodGroupFactors.length > 0
      ? (
        await client.query(
          `
            SELECT grupo_factor, estado_base, estado_objetivo, factor_base_objetivo
            FROM app.food_conversion_factors
            WHERE LOWER(grupo_factor) = ANY($1);
          `,
          [foodGroupFactors]
        )
      ).rows
      : [];
    const conversionMap = buildConversionMapFromRows(conversionRows);

    let mealMacrosTarget = parseMealMacros({
      macros: currentItem.meal_macros
    });
    let mealKcalTarget = parseNumeric(currentItem.meal_kcal) ?? 0;
    if (!(mealMacrosTarget.protein_g > 0) && !(mealMacrosTarget.carbs_g > 0) && !(mealMacrosTarget.fat_g > 0)) {
      mealMacrosTarget = mealItemsResult.rows.reduce((acc, row) => {
        const macros = parseJsonObject(row.item_macros, {});
        acc.protein_g += parseNumeric(macros.protein_g) ?? 0;
        acc.carbs_g += parseNumeric(macros.carbs_g) ?? 0;
        acc.fat_g += parseNumeric(macros.fat_g) ?? 0;
        return acc;
      }, { protein_g: 0, carbs_g: 0, fat_g: 0 });
    }
    if (!(mealKcalTarget > 0)) {
      mealKcalTarget = Math.round(
        (mealMacrosTarget.protein_g * 4)
        + (mealMacrosTarget.carbs_g * 4)
        + (mealMacrosTarget.fat_g * 9)
      );
    }

    const draftEntries = mealItemsResult.rows.map((row) => {
      const isTarget = String(row.id) === String(itemId);
      const selectedFood = isTarget
        ? replacementFood
        : {
          id: row.db_food_id,
          slug: row.db_food_slug,
          nombre: row.db_food_nombre,
          categoria: row.db_food_categoria,
          categoria_detalle: row.db_food_categoria_detalle,
          macros_100g: row.db_food_macros_100g,
          tags: row.db_food_tags,
          estado_pesado_base: row.db_food_estado_base,
          estado_pesado_mostrado_default: row.db_food_estado_mostrado_default,
          grupo_factor: row.db_food_grupo_factor,
          porcion_tipica_g: row.db_food_porcion_tipica_g
        };

      if (!selectedFood?.id || !selectedFood?.macros_100g) {
        throw new Error(`No se encontraron datos nutricionales válidos para el item ${row.id}`);
      }

      const itemMacros = parseJsonObject(row.item_macros, {});
      const roleSet = isTarget
        ? currentRoles
        : (rolesByFoodId.get(String(selectedFood.id)) || []);
      const role = getPrimaryRoleFromRoles(roleSet, itemMacros);
      const bounds = getRoleGramBounds(role, selectedFood.porcion_tipica_g, selectedFood);
      const macros100 = parseJsonObject(selectedFood.macros_100g, {});
      const proteinPerG = (parseNumeric(macros100.protein_g) ?? 0) / 100;
      const carbsPerG = (parseNumeric(macros100.carbs_g) ?? 0) / 100;
      const fatPerG = (parseNumeric(macros100.fat_g) ?? 0) / 100;
      const kcalPerG = (parseNumeric(macros100.kcal) ?? ((proteinPerG * 4) + (carbsPerG * 4) + (fatPerG * 9)) * 100) / 100;

      if (!(proteinPerG > 0) && !(carbsPerG > 0) && !(fatPerG > 0)) {
        throw new Error(`El alimento ${selectedFood.nombre} no tiene macros válidos`);
      }

      let initialBase = isTarget
        ? computeSwapBaseGrams({
          oldItemMacros: itemMacros,
          oldItemKcal: parseNumeric(row.item_kcal),
          newFood: selectedFood,
          primaryRole: role
        })
        : resolveBaseGramsFromMealItem(
          {
            ...row,
            grupo_factor: selectedFood.grupo_factor
          },
          conversionMap
        );
      if (!(initialBase > 0)) {
        initialBase = computeSwapBaseGrams({
          oldItemMacros: itemMacros,
          oldItemKcal: parseNumeric(row.item_kcal),
          newFood: selectedFood,
          primaryRole: role
        });
      }

      const requestedShownState = isTarget
        ? (
          normalizeEstadoPesado(estadoPesadoMostradoRaw)
          || normalizeEstadoPesado(row.estado_pesado_mostrado)
          || normalizeEstadoPesado(selectedFood.estado_pesado_mostrado_default)
          || normalizeEstadoPesado(selectedFood.estado_pesado_base)
          || 'tal_cual'
        )
        : (
          normalizeEstadoPesado(row.estado_pesado_mostrado)
          || normalizeEstadoPesado(selectedFood.estado_pesado_mostrado_default)
          || normalizeEstadoPesado(selectedFood.estado_pesado_base)
          || 'tal_cual'
        );

      return {
        row,
        isTarget,
        role,
        selectedFood,
        bounds,
        macros100,
        proteinPerG,
        carbsPerG,
        fatPerG,
        kcalPerG,
        requestedShownState,
        initialBase: clampNumber(initialBase, bounds.min, bounds.max)
      };
    });

    const optimizedBaseGrams = optimizeDraftItemGrams({
      draftItems: draftEntries.map((entry) => ({
        role: entry.role,
        food: entry.selectedFood,
        macros100: entry.macros100,
        proteinPerG: entry.proteinPerG,
        carbsPerG: entry.carbsPerG,
        fatPerG: entry.fatPerG,
        kcalPerG: entry.kcalPerG,
        bounds: entry.bounds,
        gramosBase: entry.initialBase
      })),
      mealMacros: mealMacrosTarget,
      mealKcalTarget
    });

    const recalculatedItems = draftEntries.map((entry, index) => {
      const cantidadBase = Number(optimizedBaseGrams[index].toFixed(1));
      const conversionState = resolveShownStateWithFallback({
        grupoFactor: entry.selectedFood.grupo_factor,
        estadoBase: normalizeEstadoPesado(entry.selectedFood.estado_pesado_base) || 'tal_cual',
        estadoMostrado: entry.requestedShownState,
        conversionMap
      });
      const cantidadMostrada = Number((cantidadBase * conversionState.factor).toFixed(1));
      const computed = computeMacrosAndKcalFromFood(entry.selectedFood, cantidadBase);
      const tags = Array.isArray(entry.selectedFood.tags)
        ? entry.selectedFood.tags
        : normalizeStringArray(entry.selectedFood.tags);

      return {
        itemId: entry.row.id,
        orden: entry.row.orden,
        isTarget: entry.isTarget,
        role: entry.role,
        food: entry.selectedFood,
        estado_pesado_base: conversionState.estadoBase,
        estado_pesado_mostrado: conversionState.estadoMostradoFinal,
        estado_fallback_aplicado: conversionState.fallbackApplied,
        estado_fallback_motivo: conversionState.blockedReason,
        estado_fallback_mensaje: conversionState.fallbackMessage,
        cantidad_g_base: cantidadBase,
        cantidad_g_mostrada: cantidadMostrada,
        cantidad_g: cantidadMostrada,
        kcal: computed.kcal,
        macros: {
          protein_g: computed.protein_g,
          carbs_g: computed.carbs_g,
          fat_g: computed.fat_g
        },
        tags
      };
    });

    const totals = calculateMacroTotals(recalculatedItems);
    const mealValidation = {
      kcal_total: Math.round(totals.kcal),
      macros_totales: {
        protein_g: Number(totals.protein_g.toFixed(2)),
        carbs_g: Number(totals.carbs_g.toFixed(2)),
        fat_g: Number(totals.fat_g.toFixed(2))
      },
      error_kcal_porcentaje: percentError(totals.kcal, mealKcalTarget),
      error_protein_porcentaje: percentError(totals.protein_g, mealMacrosTarget.protein_g),
      error_carbs_porcentaje: percentError(totals.carbs_g, mealMacrosTarget.carbs_g),
      error_fat_porcentaje: percentError(totals.fat_g, mealMacrosTarget.fat_g)
    };
    const mealMaxError = Math.max(
      mealValidation.error_kcal_porcentaje,
      mealValidation.error_protein_porcentaje,
      mealValidation.error_carbs_porcentaje,
      mealValidation.error_fat_porcentaje
    );

    if (mealMaxError > SWAP_MEAL_RECALC_MAX_ERROR) {
      return res.status(409).json({
        success: false,
        code: 'swap_not_feasible',
        error: 'No hemos podido ajustar esta comida de forma coherente con ese cambio. Prueba otro alimento.',
        validation: mealValidation,
        max_error: mealMaxError
      });
    }

    await client.query('BEGIN');
    for (const item of recalculatedItems) {
      await client.query(
        `
          UPDATE app.nutrition_meal_items
          SET
            alimento_id = $1,
            food_id = $1,
            descripcion = $2,
            cantidad_g = $3,
            kcal = $4,
            macros = $5::jsonb,
            tags = $6::jsonb,
            estado_pesado_base = $7,
            estado_pesado_mostrado = $8,
            cantidad_g_base = $9,
            cantidad_g_mostrada = $10
          WHERE id = $11
            AND meal_id = $12;
        `,
        [
          item.food.id,
          item.food.nombre,
          item.cantidad_g,
          item.kcal,
          JSON.stringify(item.macros),
          JSON.stringify(item.tags),
          item.estado_pesado_base,
          item.estado_pesado_mostrado,
          item.cantidad_g_base,
          item.cantidad_g_mostrada,
          item.itemId,
          mealId
        ]
      );
    }

    await client.query(
      `
        UPDATE app.nutrition_meals
        SET
          kcal = $1,
          macros = $2::jsonb
        WHERE id = $3;
      `,
      [
        mealValidation.kcal_total,
        JSON.stringify(mealValidation.macros_totales),
        mealId
      ]
    );
    await client.query('COMMIT');

    const updatedTargetItem = recalculatedItems.find((item) => item.isTarget);
    const stateWarnings = recalculatedItems
      .filter((item) => item.estado_fallback_aplicado && item.estado_fallback_mensaje)
      .map((item) => ({
        item_id: item.itemId,
        food_id: item.food.id,
        food_name: item.food.nombre,
        reason_code: item.estado_fallback_motivo,
        message: item.estado_fallback_mensaje
      }));

    res.json({
      success: true,
      meal_id: mealId,
      item_id: itemId,
      previous_item: {
        food_id: currentItem.current_food_id,
        descripcion: currentItem.descripcion,
        cantidad_g_base: currentItem.cantidad_g_base ?? currentItem.cantidad_g ?? null,
        cantidad_g_mostrada: currentItem.cantidad_g_mostrada ?? currentItem.cantidad_g ?? null,
        kcal: currentItem.kcal,
        macros: parseJsonObject(currentItem.macros, {})
      },
      updated_item: {
        food_id: updatedTargetItem.food.id,
        food_slug: updatedTargetItem.food.slug,
        descripcion: updatedTargetItem.food.nombre,
        primary_role: updatedTargetItem.role,
        roles: replacementRoles,
        cantidad_g_base: updatedTargetItem.cantidad_g_base,
        cantidad_g_mostrada: updatedTargetItem.cantidad_g_mostrada,
        estado_pesado_base: updatedTargetItem.estado_pesado_base,
        estado_pesado_mostrado: updatedTargetItem.estado_pesado_mostrado,
        kcal: updatedTargetItem.kcal,
        macros: updatedTargetItem.macros,
        state_adjustment: {
          applied: Boolean(updatedTargetItem.estado_fallback_aplicado),
          reason_code: updatedTargetItem.estado_fallback_motivo,
          message: updatedTargetItem.estado_fallback_mensaje
        }
      },
      meal_summary: {
        items_recalculated: recalculatedItems.length,
        kcal: mealValidation.kcal_total,
        macros: mealValidation.macros_totales,
        validation: mealValidation,
        max_error: mealMaxError
      },
      swap_warnings: stateWarnings
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    console.error('Error en swap de alimento:', error);
    res.status(500).json({ success: false, error: 'Error al sustituir alimento', details: error.message });
  } finally {
    client.release();
  }
});

/**
 * POST /api/nutrition-v2/generate-full-day-menus
 * Generar todos los menús de un día completo
 */
router.post('/generate-full-day-menus', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { dayId, persist = true } = req.body;
    const modeRaw = String(req.body.mode || 'deterministic').toLowerCase();
    if (!VALID_MENU_GENERATION_MODES.includes(modeRaw)) {
      return res.status(400).json({
        error: 'Modo de generación inválido',
        allowed: VALID_MENU_GENERATION_MODES
      });
    }
    if (modeRaw === 'hybrid_ai' && !isHybridAiEnabled()) {
      return res.status(400).json({
        error: 'Modo hybrid_ai deshabilitado',
        hint: 'Activa NUTRITION_HYBRID_ENABLED=true para habilitarlo'
      });
    }

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
    const needsVarietyContext = modeRaw === 'deterministic' || modeRaw === 'hybrid_ai' || modeRaw === 'recipe_examples';
    const varietyContext = needsVarietyContext ? createVarietyContext() : null;
    if (varietyContext) {
      varietyContext.recentFoodUsage = await loadRecentFoodUsageMap({
        planId: day.plan_id,
        currentDayIndex: Number.parseInt(day.day_index, 10),
        lookbackDays: DETERMINISTIC_RECENT_FOOD_WINDOW_DAYS
      });
    }
    const generationContext = modeRaw === 'hybrid_ai'
      ? await getUserMenuGenerationContext({ userId, foodsLimit: 120 })
      : null;
    const conversionFactors = modeRaw === 'hybrid_ai'
      ? await getMenuConversionFactors()
      : null;

    for (const meal of day.meals) {
      try {
        const menuResponse = await generateMenuForMeal({
          userId,
          meal,
          dayInfo: {
            plan_id: day.plan_id,
            day_id: day.id,
            tipo_dia: day.tipo_dia,
            day_index: day.day_index
          },
          mode: modeRaw,
          varietyContext,
          generationContext,
          conversionFactors
        });

        generatedMenus.push({
          meal_id: meal.id,
          menu: menuResponse.menu,
          metadata: menuResponse.metadata
        });

        if (persist) {
          const persistence = await persistGeneratedMenuItemsForMeal({
            mealId: meal.id,
            menuData: menuResponse.menu,
            availableFoods: menuResponse.availableFoods
          });

          generatedMenus[generatedMenus.length - 1].persistence = persistence;
        }

        if (varietyContext) {
          registerMenuFoodsInVarietyContext(varietyContext, menuResponse.menu, menuResponse.availableFoods);
        }

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
      mode: modeRaw,
      day_id: dayId,
      menus_generated: generatedMenus.filter(m => !m.error).length,
      total_meals: day.meals.length,
      items_persisted: generatedMenus.reduce((acc, menu) => acc + (menu.persistence?.inserted_items || 0), 0),
      fallback_count: generatedMenus.reduce(
        (acc, menu) => acc + (menu?.metadata?.fallback_used ? 1 : 0),
        0
      ),
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
        user_id,
        peso_kg,
        objetivo,
        training_type,
        kcal_objetivo,
        tdee,
        level,
        nivel_entrenamiento,
        metabolic_type,
        metabolic_pending_type,
        metabolic_pending_count,
        metabolic_confidence
      FROM app.nutrition_profiles
      WHERE user_id = $1`,
      [userId]
    );
    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil nutricional no encontrado' });
    }
    const profile = profileResult.rows[0];

    const userProfile = {
      peso_kg: profile.peso_kg || 70,
      objetivo: profile.objetivo || 'mant',
      training_type: profile.training_type || 'general',
      kcal_objetivo: profile.kcal_objetivo,
      tdee: profile.tdee,
      level: profile.level || profile.nivel_entrenamiento
    };

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

// ================================================
// REGISTRO DIARIO (V2) — kcal + day_type + noise_flags
// ================================================

router.get('/daily/:date', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.params;

    const result = await getDailyNutritionLogV2(userId, date);

    res.json({
      success: true,
      exists: result.exists,
      daily: result.daily,
      registered: isNutritionDayRegistered(result.daily)
    });
  } catch (error) {
    const msg = error?.message || 'Error al obtener registro diario';
    if (msg.includes('Fecha inválida')) {
      return res.status(400).json({ success: false, error: msg });
    }
    console.error('Error obteniendo registro diario v2:', error);
    res.status(500).json({ success: false, error: 'Error al obtener registro diario' });
  }
});

router.post('/daily', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const saved = await upsertDailyNutritionLogV2(userId, req.body || {});

    res.json({
      success: true,
      daily: saved,
      registered: isNutritionDayRegistered(saved)
    });
  } catch (error) {
    const msg = error?.message || 'Error al guardar registro diario';
    if (
      msg.includes('Fecha inválida') ||
      msg.includes('day_type inválido') ||
      msg.includes('no puede ser negativo')
    ) {
      return res.status(400).json({ success: false, error: msg });
    }
    console.error('Error guardando registro diario v2:', error);
    res.status(500).json({ success: false, error: 'Error al guardar registro diario' });
  }
});

// ================================================
// REVISIÓN (V2) — semanal (feedback) + quincenal (recomendación)
// ================================================

router.get('/review', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = req.query.today || null; // opcional: YYYY-MM-DD (tests)

    const review = await getNutritionReview(userId, today ? { today } : {});
    if (!review.success) {
      return res.status(404).json(review);
    }

    res.json(review);
  } catch (error) {
    const msg = error?.message || 'Error al obtener revisión nutricional';
    if (msg.includes('today inválido')) {
      return res.status(400).json({ success: false, error: msg });
    }
    console.error('Error obteniendo revisión nutricional:', error);
    res.status(500).json({ success: false, error: 'Error al obtener revisión nutricional' });
  }
});

// ================================================
// AJUSTES (V2) — aplicar / deshacer
// ================================================

router.post('/adjustments/apply', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await applyNutritionKcalAdjustment(userId, req.body || {});
    res.json(result);
  } catch (error) {
    const msg = error?.message || 'Error al aplicar ajuste';
    if (
      msg.includes('mode inválido') ||
      msg.includes('source inválido') ||
      msg.includes('delta_kcal inválido') ||
      msg.includes('Perfil nutricional no encontrado')
    ) {
      return res.status(400).json({ success: false, error: msg });
    }
    if (msg.includes('No tienes un plan nutricional activo')) {
      return res.status(404).json({ success: false, error: msg });
    }
    console.error('Error aplicando ajuste nutricional:', error);
    res.status(500).json({ success: false, error: 'Error al aplicar ajuste nutricional' });
  }
});

router.post('/adjustments/undo-last', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await undoLastNutritionKcalAdjustment(userId, {});
    res.json(result);
  } catch (error) {
    const msg = error?.message || 'Error al deshacer ajuste';
    if (
      msg.includes('No hay ajustes recientes') ||
      msg.includes('Ventana de deshacer expirada')
    ) {
      return res.status(400).json({ success: false, error: msg });
    }
    console.error('Error deshaciendo ajuste nutricional:', error);
    res.status(500).json({ success: false, error: 'Error al deshacer ajuste nutricional' });
  }
});

export default router;
