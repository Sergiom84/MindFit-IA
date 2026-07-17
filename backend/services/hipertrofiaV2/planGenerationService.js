/**
 * Servicio principal de generación de planes D1-D5 para HipertrofiaV2
 * Consolida toda la lógica del motor MindFeed
 */

import { CYCLE_LENGTH, DEFAULT_WEEKS_BY_LEVEL, WEEK_0_CONFIG } from './constants.js';
import { buildTrainingCalendar, getDefaultDayMapping } from './calendarService.js';
import { loadSessionsConfig, generateSessionExercises } from './sessionService.js';
import { loadMindfeedRuleset } from './rulesetService.js';
import { resolveUserInjuryRules } from './injuryFilter.js';
import { logger } from './logger.js';

function isDeloadWeek(weekNumber, ruleset) {
  const deloadWeeks = ruleset?.deloadRules?.deloadWeeks || [6];
  return deloadWeeks.includes(weekNumber);
}

function applyDeloadToExercise(exercise, loadFactor, volumeFactor, reasonLabel) {
  const baseSeries = Number(exercise.series || 1);
  const baseIntensity = Number(exercise.intensidad_porcentaje || 0);
  const deloadSeries = Math.max(1, Math.floor(baseSeries * volumeFactor));
  const deloadIntensity = baseIntensity > 0
    ? Math.round(baseIntensity * loadFactor * 10) / 10
    : baseIntensity;

  const extraNote = `[DELOAD ${reasonLabel}] -30% carga, -50% volumen`;

  return {
    ...exercise,
    series: deloadSeries,
    intensidad_porcentaje: deloadIntensity,
    notas: `${exercise.notas || ''} ${extraNote}`.trim()
  };
}

function applyDeloadToSession(session, ruleset, reason = 'planificado') {
  const loadFactor = ruleset?.deloadRules?.loadFactor ?? 0.7;
  const volumeFactor = ruleset?.deloadRules?.volumeFactor ?? 0.5;
  const reasonLabel = reason.toUpperCase();
  const sessionIntensity = Number(session.intensidad_porcentaje || 0);
  const deloadSessionIntensity = sessionIntensity > 0
    ? Math.round(sessionIntensity * loadFactor * 10) / 10
    : sessionIntensity;

  return {
    ...session,
    es_deload: true,
    tipo: 'deload',
    deload_reason: reason,
    intensidad_porcentaje: deloadSessionIntensity,
    coach_tip: `Semana de descarga: reduce la carga y prioriza técnica (${reason}).`,
    ejercicios: (session.ejercicios || []).map(ex =>
      applyDeloadToExercise(ex, loadFactor, volumeFactor, reasonLabel)
    )
  };
}

function applyDeloadToWeekSessions(weekSessions, ruleset, reason = 'planificado') {
  return (weekSessions || []).map(session => applyDeloadToSession(session, ruleset, reason));
}

function resolveStartDateValue(rawStartDate) {
  if (!rawStartDate) return null;
  if (rawStartDate instanceof Date) return rawStartDate;

  if (rawStartDate === 'today') {
    return new Date();
  }

  if (rawStartDate === 'next_monday') {
    const d = new Date();
    const dayOfWeek = d.getDay();
    const daysUntilMonday = (1 + 7 - dayOfWeek) % 7 || 7;
    d.setDate(d.getDate() + daysUntilMonday);
    return d;
  }

  const parsed = new Date(rawStartDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

/**
 * Genera plan completo D1-D5 con motor MindFeed
 * @param {object} dbClient - Cliente de base de datos (transaction)
 * @param {object} config - Configuración del plan
 * @returns {Promise<object>} Plan generado con ID
 */
export async function buildD1D5Plan(readClient, config) {
  const {
    userId,
    nivel = 'Principiante',
    totalWeeks,
    startConfig,
    includeWeek0 = true
  } = config;

  const defaultWeeks = DEFAULT_WEEKS_BY_LEVEL[nivel] || 10;
  // Cota anti-DoS: totalWeeks llega del cliente; sin límite un plan gigante
  // dispara memoria/JSON/DB. ~1 año es más que suficiente para cualquier nivel.
  const MAX_TOTAL_WEEKS = 52;
  const requestedWeeks = Number(totalWeeks ?? defaultWeeks);
  const actualTotalWeeks = Number.isFinite(requestedWeeks) && requestedWeeks > 0
    ? Math.min(Math.trunc(requestedWeeks), MAX_TOTAL_WEEKS)
    : defaultWeeks;

  logger.info('🏋️ [MINDFEED] Generando plan D1-D5');
  logger.info(`📅 Nivel: ${nivel}, Semanas: ${actualTotalWeeks}, Week 0: ${includeWeek0}`);

  // Obtener información del usuario
  const userResult = await readClient.query(
    `SELECT sexo FROM app.users WHERE id = $1`,
    [userId]
  );
  const userSex = userResult.rows[0]?.sexo || 'male';
  const isFemale = ['female', 'f', 'mujer', 'femenino'].includes(userSex.toLowerCase());

  logger.debug('👤 Sexo:', userSex, 'Ajuste femenino:', isFemale);

  // Cargar ruleset normativo MindFeed v1
  const ruleset = await loadMindfeedRuleset(readClient, nivel);

  // 🩹 Resolver reglas de lesión del usuario (filtro compartido). Si hay lesión,
  // la selección excluirá movimientos contraindicados por zona.
  const { rules: injuryRules, zonas: injuryZones, injuryText } = await resolveUserInjuryRules(userId);
  if (injuryRules.length > 0) {
    logger.info(`🩹 [MINDFEED] Filtro de lesiones ACTIVO → zonas: ${injuryZones.join(', ')}`);
  }

  // Obtener prioridad muscular activa
  const priorityResult = await readClient.query(
    `SELECT priority_muscle FROM app.hipertrofia_v2_state WHERE user_id = $1`,
    [userId]
  );
  const priorityMuscle = priorityResult.rows[0]?.priority_muscle || null;

  if (priorityMuscle) {
    logger.info(`🎯 [PRIORIDAD] Músculo prioritario: ${priorityMuscle}`);
  }

  // Calcular calendario cíclico
  let trainingDays = null;
  let dynamicDayMapping = {};

  const resolvedStartDate = startConfig?.startDate
    ? resolveStartDateValue(startConfig.startDate)
    : null;

  if (resolvedStartDate) {
    const calendar = buildTrainingCalendar({
      startDate: resolvedStartDate,
      includeSaturday: startConfig.distributionOption === 'saturdays' || startConfig.includeSaturdays,
      totalWeeks: actualTotalWeeks,
      cycleLength: CYCLE_LENGTH
    });

    trainingDays = calendar.trainingDays;
    dynamicDayMapping = calendar.dynamicDayMapping;

    logger.info(`📅 Calendario generado: ${trainingDays.length} sesiones`);
  } else {
    dynamicDayMapping = getDefaultDayMapping(CYCLE_LENGTH);
    if (startConfig?.startDate) {
      logger.warn('⚠️ startDate inválida, usando mapeo por defecto');
    } else {
      logger.warn('⚠️ Sin fecha de inicio, usando mapeo por defecto');
    }
  }

  // Cargar configuración de sesiones D1-D5
  const sessionsConfig = await loadSessionsConfig(readClient);

  // Generar ejercicios para cada sesión del ciclo
  const sessionsWithExercises = [];

  for (const sessionConfig of sessionsConfig) {
    const session = await generateSessionExercises(
      readClient,
      sessionConfig,
      nivel,
      isFemale,
      priorityMuscle,
      ruleset,
      injuryRules
    );

    sessionsWithExercises.push(session);
    logger.debug(`  ✅ D${session.cycle_day}: ${session.exercises.length} ejercicios`);
  }

  // Crear plantilla de sesiones
  const templateByCycleDay = new Map(
    sessionsWithExercises
      .sort((a, b) => a.cycle_day - b.cycle_day)
      .map(session => [
        session.cycle_day,
        {
          nombre: session.session_name,
          ciclo_dia: session.cycle_day,
          descripcion: session.description,
          coach_tip: session.coach_tip,
          intensidad_porcentaje: session.intensity_percentage,
          es_dia_pesado: session.is_heavy_day,
          grupos_musculares: session.muscle_groups,
          ejercicios: session.exercises.map(ex => ({ ...ex }))
        }
      ])
  );

  // Generar semanas
  const semanas = [];

  // Semana 0 de calibración
  if (includeWeek0) {
    const semana0Sessions = Array.from({ length: CYCLE_LENGTH }, (_, idx) => {
      const cycleDay = idx + 1;
      const template = templateByCycleDay.get(cycleDay);
      const actualDayName = trainingDays?.[idx]?.dayName || dynamicDayMapping[`D${cycleDay}`] || `D${cycleDay}`;

      return {
        ...JSON.parse(JSON.stringify(template)),
        dia: actualDayName,
        fecha: trainingDays?.[idx]?.date ? trainingDays[idx].date.toISOString().split('T')[0] : null,
        orden: idx + 1,
        id: `W0-D${cycleDay}`,
        intensidad_porcentaje: WEEK_0_CONFIG.intensity,
        es_calibracion: true,
        coach_tip: 'Semana de calibración: Enfócate en la técnica correcta y el control del movimiento.',
        ejercicios: template.ejercicios.map(ex => ({
          ...ex,
          intensidad_porcentaje: WEEK_0_CONFIG.intensity,
          rir_target: WEEK_0_CONFIG.rir_target,
          notas: `${ex.notas || ''} - ${WEEK_0_CONFIG.note}`
        }))
      };
    });

    semanas.push({
      numero: 0,
      tipo: 'calibracion',
      descripcion: 'Semana de calibración técnica y ajuste de cargas',
      sesiones: semana0Sessions,
      is_week_zero: true,
      no_progression: true,
      objetivo: 'Establecer técnica base y calibrar cargas iniciales (70% 1RM)'
    });

    logger.info('✅ [WEEK 0] Semana de calibración añadida');
  }

  // Semanas regulares
  for (let weekIndex = 0; weekIndex < actualTotalWeeks; weekIndex++) {
    const weekNumber = weekIndex + 1;
    let weekSessions = Array.from({ length: CYCLE_LENGTH }, (_, idx) => {
      const sessionNumber = weekIndex * CYCLE_LENGTH + idx;
      const cycleDay = (sessionNumber % CYCLE_LENGTH) + 1;
      const template = templateByCycleDay.get(cycleDay);
      const calendarDay = startConfig?.startDate && trainingDays
        ? trainingDays[sessionNumber]
        : null;

      const actualDayName = calendarDay?.dayName || dynamicDayMapping[`D${cycleDay}`] || `D${cycleDay}`;

      return {
        ...JSON.parse(JSON.stringify(template)),
        dia: actualDayName,
        fecha: calendarDay?.date ? calendarDay.date.toISOString().split('T')[0] : null,
        orden: idx + 1,
        id: `W${weekIndex + 1}-D${cycleDay}`
      };
    });

    const deloadThisWeek = isDeloadWeek(weekNumber, ruleset);
    if (deloadThisWeek) {
      weekSessions = applyDeloadToWeekSessions(weekSessions, ruleset, 'planificado');
      logger.info(`🧘 [DELOAD] Semana ${weekNumber} marcada como descarga planificada`);
    }

    semanas.push({
      numero: weekNumber,
      tipo: deloadThisWeek ? 'deload' : 'entrenamiento',
      es_deload: deloadThisWeek,
      sesiones: weekSessions
    });
  }

  // Crear estructura del plan
  const planData = {
    metodologia: 'HipertrofiaV2_MindFeed',
    version: 'MindFeed_v2.0',
    nivel,
    ciclo_type: 'D1-D5',
    total_weeks: actualTotalWeeks,
    has_week_0: includeWeek0,
    duracion_total_semanas: includeWeek0 ? actualTotalWeeks + 1 : actualTotalWeeks,
    frecuencia_semanal: CYCLE_LENGTH,
    fecha_inicio: new Date().toISOString(),
    sessions: sessionsWithExercises,
    semanas,
    configuracion: {
      progression_type: 'microcycle',
      progression_increment: 2.5,
      deload_trigger: 6,
      rir_target: '2-3',
      tracking_enabled: true,
      week_0_intensity: WEEK_0_CONFIG.intensity,
      duration_weeks: actualTotalWeeks,
      sex_adjusted: isFemale,
      rest_adjustment_factor: isFemale ? 0.85 : 1.0,
      ruleset_scope: ruleset?.meta?.level ? 'hipertrofia_v2_principiante' : 'hipertrofia_v2_principiante',
      ruleset_version: ruleset?.meta?.spec || 'MindFeed_Compliance_Spec_v1',
      deload_weeks: ruleset?.deloadRules?.deloadWeeks || [6],
      rest_seconds_by_type: ruleset?.restSecondsByType || null
    },
    // 🩹 Trazabilidad de restricciones aplicadas por lesión (para UI/QA/auditoría).
    restricciones_lesion: {
      activo: injuryRules.length > 0,
      zonas: injuryZones,
      fuente: injuryText || null,
      filtro: 'injuryContraindications (compartido)'
    }
  };

  // A1: build NO escribe. Devuelve todo lo necesario para persistir en una
  // transacción corta (ver persistD1D5Plan). Así la generación pesada (lecturas
  // + montaje de JSON) NO retiene una conexión de transacción del pooler.
  return { userId, planData, trainingDays, startConfig };
}

/**
 * Persiste un plan D1-D5 ya construido dentro de una transacción corta.
 * @param {object} writeClient - Cliente de base de datos EN transacción
 * @param {object} built - Resultado de buildD1D5Plan
 * @returns {Promise<object>} Plan persistido con ID
 */
export async function persistD1D5Plan(writeClient, built) {
  const { userId, planData, trainingDays, startConfig } = built;

  // Guardar plan en DB
  const planResult = await writeClient.query(`
    INSERT INTO app.methodology_plans (
      user_id, methodology_type, plan_data, generation_mode, status, created_at
    )
    VALUES ($1, $2, $3, $4, $5, NOW())
    RETURNING id
  `, [userId, 'HipertrofiaV2_MindFeed', JSON.stringify(planData), 'manual', 'draft']);

  const methodologyPlanId = planResult.rows[0].id;

  // Crear estado inicial
  await writeClient.query(`
    INSERT INTO app.hipertrofia_v2_state (
      user_id,
      methodology_plan_id,
      cycle_day,
      microcycles_completed,
      created_at
    ) VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
      methodology_plan_id = EXCLUDED.methodology_plan_id,
      cycle_day = 1,
      microcycles_completed = 0,
      deload_active = false,
      updated_at = NOW()
  `, [userId, methodologyPlanId, 1, 0]);

  // Guardar configuración de inicio
  if (startConfig) {
    await savePlanStartConfig(writeClient, methodologyPlanId, userId, startConfig, trainingDays, CYCLE_LENGTH);
  }

  logger.info(`✅ [MINDFEED] Plan generado con ID: ${methodologyPlanId}`);

  return {
    methodologyPlanId,
    planId: methodologyPlanId,
    plan: planData
  };
}

/**
 * Genera y persiste un plan D1-D5 en el mismo cliente (compatibilidad).
 * Prefiere buildD1D5Plan(pool) + persistD1D5Plan(tx) para acortar la
 * transacción; este wrapper mantiene la firma previa para callers existentes.
 * @param {object} dbClient - Cliente de base de datos
 * @param {object} config - Configuración del plan
 * @returns {Promise<object>} Plan generado con ID
 */
export async function generateD1D5Plan(dbClient, config) {
  const built = await buildD1D5Plan(dbClient, config);
  return persistD1D5Plan(dbClient, built);
}

/**
 * Guarda configuración de inicio del plan
 */
async function savePlanStartConfig(dbClient, methodologyPlanId, userId, startConfig, trainingDays, cycleLength) {
  logger.debug('💾 Guardando configuración de inicio...');

  const startDate = startConfig.startDate === 'today'
    ? new Date()
    : startConfig.startDate === 'next_monday'
    ? (() => {
        const d = new Date();
        d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
        return d;
      })()
    : new Date(startConfig.startDate);

  const includeSaturdays = startConfig.includeSaturdays || false;
  const firstWeekPattern = (trainingDays && trainingDays.length >= cycleLength)
    ? trainingDays.slice(0, cycleLength).map(d => d.dayName).join('-')
    : 'Lun-Mar-Mie-Jue-Vie';

  await dbClient.query(`
    INSERT INTO app.plan_start_config (
      methodology_plan_id,
      user_id,
      start_day_of_week,
      start_date,
      first_week_pattern,
      include_saturdays,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (methodology_plan_id) DO UPDATE SET
      start_day_of_week = EXCLUDED.start_day_of_week,
      start_date = EXCLUDED.start_date,
      first_week_pattern = EXCLUDED.first_week_pattern,
      include_saturdays = EXCLUDED.include_saturdays,
      updated_at = NOW()
  `, [
    methodologyPlanId,
    userId,
    startDate.getDay(),
    startDate.toISOString().split('T')[0],
    firstWeekPattern,
    includeSaturdays
  ]);

  logger.info('✅ Configuración de inicio guardada');
}
