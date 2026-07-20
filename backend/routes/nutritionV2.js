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
  calculateMacros,
  generateNutritionPlan,
  summarizeCarbCycling,
  distributeMacrosAcrossMeals
} from '../services/nutritionCalculator.js';
import {
  resolvePeriodizationModeForUser,
  resolveDayNutritionTargets
} from '../services/nutritionPeriodizationService.js';
import { methodologyEmitsTrainingLoad } from '../services/routineGeneration/methodologies/methodologyRegistry.js';
import {
  SCHEDULE_WITH_LOAD_QUERY
} from '../services/trainingLoad/sessionLoadBuilder.js';
import {
  ensureWorkoutScheduleV3
} from '../utils/ensureScheduleV3.js';
import {
  formatLocalDate,
  mapMethodologyToTrainingType,
  normalizeSexo,
  normalizeActividad,
  mapUserObjectiveToNutritionGoal,
  resolveNutritionObjectiveMismatch,
  normalizeNivelEntrenamiento,
  resolveMealType,
  normalizeStringArray
} from '../services/nutritionV2Engine.js';
import foodCatalogRoutes from './nutritionV2/foodCatalog.js';
import dailyTrackingRoutes from './nutritionV2/dailyTracking.js';
import measurementsMetabolicRoutes from './nutritionV2/measurementsMetabolic.js';
import menuGenerationRoutes from './nutritionV2/menuGeneration.js';

const router = express.Router();

// Sub-routers extraídos del monolito (se montan bajo la misma base /api/nutrition-v2):
// - foodCatalog: /foods, /foods/categories, /food-conversion-factors
// - dailyTracking: /daily, /review, /adjustments/*
// - measurementsMetabolic: /measurements, /evaluate, /diet-breaks*, /metabolic-evaluate
// - menuGeneration: /generate-menu, /meals/.../swap-food, /generate-full-day-menus
router.use(foodCatalogRoutes);
router.use(dailyTrackingRoutes);
router.use(measurementsMetabolicRoutes);
router.use(menuGenerationRoutes);

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
            objetivo_principal,
            alergias,
            alimentos_excluidos
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
        alergias = normalizeStringArray(userData.alergias);
        preferencias = {
          ...(preferencias && typeof preferencias === 'object' ? preferencias : {}),
          alimentos_excluidos: normalizeStringArray(userData.alimentos_excluidos)
        };
      }
    }

    if (!existingProfile) {
      const userData = await getUserFallback();
      if (userData) {
        if (!hasField('alergias')) alergias = normalizeStringArray(userData.alergias);
        if (!hasField('preferencias')) {
          preferencias = {
            ...(preferencias && typeof preferencias === 'object' ? preferencias : {}),
            alimentos_excluidos: normalizeStringArray(userData.alimentos_excluidos)
          };
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

    // ── Periodización nutricional canónica (doc 04 PR4, spec §11-12) ─────────────
    // Por defecto el modo es `legacy`: NO se calcula ni persiste nada nuevo y la respuesta
    // (y el INSERT de nutrition_plan_days) es byte-compatible con el baseline. En `shadow`
    // se calcula el reparto D0/D1/D2 en paralelo y se PERSISTE en periodization_context, pero
    // el usuario sigue recibiendo el resultado legado. En `active` el reparto nuevo es
    // autoritativo (tipo_dia, macros y comidas del día se reconstruyen).
    // §16 PR6: modo POR USUARIO. El global es `legacy` por defecto; los usuarios de la lista
    // QA (NUTRITION_PERIODIZATION_QA_USERS) reciben el modo escalado un peldaño (canary).
    const periodizationMode = resolvePeriodizationModeForUser(userId);
    // §16 PR6 (punto 3): gate por metodología. Si la metodología del plan activo NO emite carga
    // validada, el contrato de los metadatos NO se honra y se cae a la política conservadora.
    const methodologyEmitsLoad = activePlanResult.rowCount > 0
      ? methodologyEmitsTrainingLoad(activePlanResult.rows[0].methodology_type)
      : false;
    let periodizationByDayIndex = null;

    if (periodizationMode !== 'legacy') {
      periodizationByDayIndex = new Map();

      // Cargar la carga planificada del calendario enriquecido (§12.1), solo si hay plan activo.
      const loadByDate = new Map();
      if (activePlanResult.rowCount > 0) {
        const methodologyPlanId = activePlanResult.rows[0].methodology_plan_id;
        const periodStart = new Date();
        periodStart.setHours(0, 0, 0, 0);
        const periodEnd = new Date(periodStart);
        periodEnd.setDate(periodStart.getDate() + (duracion_dias - 1));
        try {
          const enrichedResult = await pool.query(SCHEDULE_WITH_LOAD_QUERY, [
            methodologyPlanId,
            userId,
            formatLocalDate(periodStart),
            formatLocalDate(periodEnd)
          ]);
          let fallbackByDateCount = 0;
          for (const row of enrichedResult.rows) {
            const key = formatLocalDate(row.scheduled_date);
            if (!key) continue;
            loadByDate.set(key, { session_load: row.session_load || null, day_id: row.day_id });
            // Métrica §12.1: fila histórica con carga pero sin day_id (fallback por fecha).
            if (row.session_load && row.day_id == null) fallbackByDateCount += 1;
          }
          if (fallbackByDateCount > 0) {
            console.warn(
              `⚠️ periodización: ${fallbackByDateCount} día(s) con session_load sin day_id (fallback por fecha, §12.1)`
            );
          }
        } catch (enrichErr) {
          console.warn('⚠️ periodización: no se pudo leer el calendario enriquecido:', enrichErr.message);
        }
      }

      const periodStart = new Date();
      periodStart.setHours(0, 0, 0, 0);
      for (const day of planData.days) {
        const dayDate = new Date(periodStart);
        dayDate.setDate(periodStart.getDate() + day.day_index);
        const dateKey = formatLocalDate(dayDate);
        const isTraining = day.tipo_dia === 'entreno';
        const loadEntry = loadByDate.get(dateKey);
        const sessionLoad = loadEntry?.session_load || { is_training: isTraining };
        const source = loadEntry?.session_load ? 'planned_session_load' : 'boolean_fallback';

        const resolved = resolveDayNutritionTargets({
          baseMacros: planData.macros_objetivo,
          kcalTarget: planData.kcal_objetivo,
          weightKg: profile.peso_kg,
          objective: planData.meta,
          metabolicProfile: profile.metabolic_type,
          sessionLoad,
          mode: periodizationMode,
          methodologyEmitsLoad
        });

        periodizationByDayIndex.set(day.day_index, { resolved, source });
      }
    }

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
        // Valores servidos: por defecto (legacy/shadow) el resultado legado; en `active` el
        // reparto nuevo es autoritativo y se reconstruyen tipo_dia, macros y comidas.
        let tipoDia = day.tipo_dia;
        let dayKcal = day.kcal;
        let dayMacros = day.macros;
        let dayMeals = day.meals;
        let periodizationContextJson = null;

        const periodization = periodizationByDayIndex ? periodizationByDayIndex.get(day.day_index) : null;
        if (periodization) {
          const { resolved, source } = periodization;
          periodizationContextJson = JSON.stringify({
            ruleset: resolved.policy_version,
            source,
            day_type: resolved.day_type,
            load_confidence: resolved.audit.source_confidence,
            base_macros: {
              protein_g: planData.macros_objetivo.protein_g,
              carbs_g: planData.macros_objetivo.carbs_g,
              fat_g: planData.macros_objetivo.fat_g
            },
            resolved_macros: {
              protein_g: resolved.macros.protein_g,
              carbs_g: resolved.macros.carbs_g,
              fat_g: resolved.macros.fat_g
            },
            clamps: resolved.audit.clamps,
            reason_codes: resolved.audit.reason_codes,
            mode: periodizationMode
          });

          if (periodizationMode === 'active') {
            // §12.3: tipo_dia con nuevos valores (compatibilidad de lectura para 'entreno').
            tipoDia = resolved.day_type === 'D0'
              ? 'descanso'
              : (resolved.day_type === 'D2' ? 'entreno_alto' : 'entreno_normal');
            dayKcal = resolved.macros.kcal;
            dayMacros = {
              protein_g: resolved.macros.protein_g,
              carbs_g: resolved.macros.carbs_g,
              fat_g: resolved.macros.fat_g
            };
            dayMeals = distributeMacrosAcrossMeals(
              { ...dayMacros, kcal: dayKcal },
              planData.comidas_por_dia,
              resolved.day_type !== 'D0'
            );
          }
        }

        const dayQuery = `
          INSERT INTO app.nutrition_plan_days (
            plan_id, day_index, tipo_dia, kcal, macros, periodization_context
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id;
        `;

        const dayResult = await client.query(dayQuery, [
          planId,
          day.day_index,
          tipoDia,
          dayKcal,
          JSON.stringify(dayMacros),
          periodizationContextJson
        ]);

        const dayId = dayResult.rows[0].id;

        // 3. Crear comidas del día
        for (const meal of dayMeals) {
          const mealQuery = `
            INSERT INTO app.nutrition_meals (
              plan_day_id, orden, nombre, meal_type, kcal, macros, timing_note
            ) VALUES ($1, $2, $3, $4, $5, $6, $7);
          `;

          await client.query(mealQuery, [
            dayId,
            meal.orden,
            meal.nombre,
            meal.meal_type || resolveMealType(meal),
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
                    'meal_type', m.meal_type,
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
    const macrosAudit = calculateMacros(
      kcalAudit.kcal_objetivo,
      profile.peso_kg,
      profile.training_type || 'general',
      profile.objetivo,
      profile.metabolic_type,
      profile.metabolic_confidence,
      profile.level || profile.nivel_entrenamiento || 'intermedio'
    );
    const currentEstimate = {
      bmr: bmrAudit.bmr,
      tdee: tdeeAudit.tdee,
      kcal_objetivo: kcalAudit.kcal_objetivo,
      macros_objetivo: macrosAudit,
      calculation_audit: {
        bmr: bmrAudit,
        tdee: tdeeAudit,
        kcal: kcalAudit,
        macros: macrosAudit
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

export default router;
