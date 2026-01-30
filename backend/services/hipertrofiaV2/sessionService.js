/**
 * Servicio de sesiones para HipertrofiaV2
 * Maneja la configuración y generación de sesiones D1-D5
 */

import { MUSCLE_TO_CATEGORY_MAP, EXERCISE_TYPE_ORDER } from './constants.js';
import { selectExercisesByTypeForSession, mapExercisesWithTrainingParams } from './exerciseSelector.js';
import { logger } from './logger.js';

/**
 * Carga configuración de sesiones D1-D5 desde la base de datos
 * @param {object} dbClient - Cliente de base de datos
 * @returns {Promise<Array>} Configuraciones de sesiones deduplicadas
 */
export async function loadSessionsConfig(dbClient) {
  const result = await dbClient.query(`
    SELECT * FROM app.hipertrofia_v2_session_config
    ORDER BY cycle_day
  `);

  if (result.rows.length === 0) {
    throw new Error('No se encontró configuración de sesiones D1-D5. Ejecuta el script SQL de migración.');
  }

  // Deduplicar por cycle_day
  const seenDays = new Set();
  const uniqueConfigs = [];

  for (const row of result.rows) {
    if (!seenDays.has(row.cycle_day)) {
      uniqueConfigs.push(row);
      seenDays.add(row.cycle_day);
    }
  }

  if (uniqueConfigs.length !== result.rows.length) {
    logger.warn(`⚠️ [SESSION] Duplicados detectados. Usando únicos: ${uniqueConfigs.length}`);
  }

  logger.info(`📋 [SESSION] Configuraciones cargadas: ${uniqueConfigs.length} sesiones`);
  return uniqueConfigs;
}

/**
 * Parsea grupos musculares desde diferentes formatos
 * @param {*} muscleGroupsRaw - Grupos musculares en cualquier formato
 * @returns {Array} Array de grupos musculares
 */
export function parseMuscleGroups(muscleGroupsRaw) {
  let muscleGroups = [];

  try {
    if (Array.isArray(muscleGroupsRaw)) {
      muscleGroups = muscleGroupsRaw;
    } else if (typeof muscleGroupsRaw === 'string') {
      muscleGroups = JSON.parse(muscleGroupsRaw);
    } else if (muscleGroupsRaw && typeof muscleGroupsRaw === 'object') {
      muscleGroups = Object.values(muscleGroupsRaw);
    }
  } catch {
    logger.warn('⚠️ [SESSION] Formato CSV detectado, aplicando fallback:', muscleGroupsRaw);
    muscleGroups = String(muscleGroupsRaw)
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(muscleGroups) || muscleGroups.length === 0) {
    logger.warn('⚠️ [SESSION] Sin grupos musculares válidos, usando fallback');
    muscleGroups = ['Pecho'];
  }

  return muscleGroups;
}

/**
 * Genera ejercicios para una sesión específica
 * @param {object} dbClient - Cliente de base de datos
 * @param {object} sessionConfig - Configuración de la sesión
 * @param {string} nivel - Nivel del usuario
 * @param {boolean} isFemale - Si el usuario es mujer
 * @param {string} [priorityMuscle] - Músculo prioritario (opcional)
 * @param {object} [ruleset] - Ruleset normativo MindFeed (opcional)
 * @returns {Promise<object>} Sesión con ejercicios
 */
export async function generateSessionExercises(
  dbClient,
  sessionConfig,
  nivel,
  isFemale,
  priorityMuscle = null,
  ruleset = null
) {
  const muscleGroups = parseMuscleGroups(sessionConfig.muscle_groups);
  const cycleDay = sessionConfig.cycle_day;
  const volumeProfiles = ruleset?.volumeProfiles || {};

  logger.info(`🎯 [SESSION] Generando D${cycleDay}: ${sessionConfig.session_name}`);

  const sessionExercises = [];

  // Por cada grupo muscular, seleccionar ejercicios por tipo
  for (const muscleGroup of muscleGroups) {
    const categoria = MUSCLE_TO_CATEGORY_MAP[muscleGroup] || muscleGroup;
    const profile = volumeProfiles[muscleGroup] || {};
    const setsForMuscle = Number(profile.sets ?? sessionConfig.default_sets);
    const selectedNames = new Set();

    const selectType = async (tipo, count) => {
      const safeCount = Math.max(0, Number(count || 0));
      if (safeCount === 0) return;

      const selected = await selectExercisesByTypeForSession(dbClient, {
        nivel,
        categoria,
        tipo_ejercicio: tipo,
        count: safeCount,
        cycleDay,
        muscleGroup,
        excludeNames: Array.from(selectedNames)
      });

      for (const ex of selected) {
        selectedNames.add(ex.nombre);
        sessionExercises.push({
          ...ex,
          sets_override: setsForMuscle
        });
      }
    };

    // Multiarticulares
    await selectType('multiarticular', profile.multiarticular ?? sessionConfig.multiarticular_count);

    // Unilaterales
    await selectType('unilateral', profile.unilateral ?? sessionConfig.unilateral_count);

    // Analíticos
    await selectType('analitico', profile.analitico ?? sessionConfig.analitico_count);
  }

  // Ordenar ejercicios: Multi → Uni → Ana
  sessionExercises.sort((a, b) => {
    const ordenA = EXERCISE_TYPE_ORDER[a.tipo_ejercicio] || 99;
    const ordenB = EXERCISE_TYPE_ORDER[b.tipo_ejercicio] || 99;
    if (ordenA !== ordenB) return ordenA - ordenB;
    return (a.orden_recomendado || 0) - (b.orden_recomendado || 0);
  });

  logger.debug(`  📋 D${cycleDay} - Orden: ${sessionExercises.map(e => e.tipo_ejercicio[0].toUpperCase()).join(' → ')}`);

  // Mapear con parámetros de entrenamiento
  let exercisesWithParams = mapExercisesWithTrainingParams(sessionExercises, sessionConfig, isFemale, {
    restSecondsByType: ruleset?.restSecondsByType || null
  });

  // Aplicar ajustes de priorización si corresponde
  if (priorityMuscle && sessionConfig.is_heavy_day) {
    exercisesWithParams = applyPriorityIntensityAdjustments(exercisesWithParams, priorityMuscle, ruleset);
    logger.info(`  🎯 [PRIORITY] Ajustes aplicados para ${priorityMuscle} en D${cycleDay}`);
  }

  return {
    cycle_day: cycleDay,
    session_name: sessionConfig.session_name,
    description: sessionConfig.description,
    coach_tip: sessionConfig.coach_tip,
    intensity_percentage: sessionConfig.intensity_percentage,
    is_heavy_day: sessionConfig.is_heavy_day,
    muscle_groups: muscleGroups,
    exercises: exercisesWithParams
  };
}

/**
 * Aplica ajustes de intensidad según priorización muscular
 * @param {Array} exercises - Ejercicios
 * @param {string} priorityMuscle - Músculo prioritario
 * @param {object} ruleset - Ruleset normativo
 * @returns {Array} Ejercicios con ajustes aplicados
 */
function applyPriorityIntensityAdjustments(exercises, priorityMuscle, ruleset) {
  const npHeavyPercent = Number(
    ruleset?.priorityRules?.nonPriority?.heavyDayPercent ?? 76
  );

  return exercises.map(exercise => {
    const isPriority = exercise.categoria?.toLowerCase().includes(priorityMuscle.toLowerCase());

    if (isPriority) {
      return {
        ...exercise,
        notas: `${exercise.notas || ''} [PRIORIDAD ACTIVA: aplicar top set semanal solo si procede]`.trim()
      };
    }

    // No prioritarios: reducir intensidad en días pesados
    return {
      ...exercise,
      intensidad_porcentaje: npHeavyPercent,
      notas: `${exercise.notas || ''} [NP: intensidad reducida por priorización]`.trim()
    };
  });
}
