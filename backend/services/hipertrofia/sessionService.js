/**
 * Servicio de sesiones para HipertrofiaV2
 * Maneja la configuración y generación de sesiones D1-D5
 */

import { MUSCLE_TO_CATEGORY_MAP, EXERCISE_TYPE_ORDER } from './constants.js';
import { selectExercisesByTypeForSession, selectExercises, mapExercisesWithTrainingParams } from './exerciseSelector.js';
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
 * Construye una sesión de "Torso" para el split de 4 días tomando `base` como
 * plantilla (reps, RIR, descripción) y una lista EXPLÍCITA de grupos musculares.
 * Se reparte el torso entre dos sesiones para que ninguna quede sobrecargada
 * (un merge ingenuo de empuje+tirón+complementarios daba sesiones de 17+ ejercicios).
 */
function buildTorsoSession(base, { cycleDay, sessionName, isHeavyDay, intensity, groups }) {
  return {
    ...base,
    cycle_day: cycleDay,
    session_name: sessionName,
    muscle_groups: groups,
    is_heavy_day: isHeavyDay,
    intensity_percentage: intensity ?? base.intensity_percentage
  };
}

/**
 * Resuelve las sesiones del ciclo según la frecuencia semanal declarada (A-03).
 * El catálogo define un ciclo PPL de 5 días (D1-D5); aquí lo adaptamos:
 *  - 5+ días → D1-D5 tal cual (PPL frecuencia 2).
 *  - 3 días  → D1/D2/D3 (Empuje/Tirón/Piernas, frecuencia 1).
 *  - 4 días  → Torso/Pierna/Torso/Pierna (frecuencia 2).
 * Devuelve las sesiones con cycle_day reasignado 1..N.
 * @param {Array} sessionsConfig - Filas de app.hipertrofia_v2_session_config (ordenadas por cycle_day)
 * @param {number} frecuencia - Días/semana declarados por el usuario
 * @returns {Array} Sesiones del ciclo a generar
 */
export function resolveCycleSessions(sessionsConfig, frecuencia) {
  const byDay = new Map(sessionsConfig.map((s) => [Number(s.cycle_day), s]));
  const D1 = byDay.get(1); // Empuje pesado
  const D2 = byDay.get(2); // Tirón pesado
  const D3 = byDay.get(3); // Piernas
  const D4 = byDay.get(4); // Empuje ligero (F2)
  const D5 = byDay.get(5); // Tirón ligero (F2)
  const freq = Number(frecuencia);

  // Sin dato fiable (null/0/NaN → Number(null)=0), <3 o 5+ días: ciclo completo
  // original. Solo adaptamos para las frecuencias soportadas 3 y 4.
  if (!Number.isFinite(freq) || freq < 3 || freq >= 5 || !D1 || !D2 || !D3 || !D4 || !D5) {
    return sessionsConfig;
  }

  if (freq === 3) {
    // PPL frecuencia 1.
    return [D1, D2, D3].map((s, idx) => ({ ...s, cycle_day: idx + 1 }));
  }

  // freq === 4 → Torso/Pierna/Torso/Pierna (frecuencia 2 para todo). El torso se
  // reparte en dos sesiones equilibradas: la pesada prioriza pecho/espalda +
  // brazos; la ligera reparte pecho/espalda + hombro/core.
  const torsoPesado = buildTorsoSession(D1, {
    cycleDay: 1,
    sessionName: 'Torso Pesado (Pecho, Espalda, Brazos)',
    isHeavyDay: true,
    intensity: D1.intensity_percentage,
    groups: ['Pecho', 'Espalda', 'Tríceps', 'Bíceps']
  });
  const piernaPesada = { ...D3, cycle_day: 2, is_heavy_day: true };
  const torsoLigero = buildTorsoSession(D4, {
    cycleDay: 3,
    sessionName: 'Torso Ligero (Pecho, Espalda, Hombro, Core)',
    isHeavyDay: false,
    intensity: D4.intensity_percentage,
    groups: ['Pecho', 'Espalda', 'Hombro', 'Core']
  });
  const piernaLigera = {
    ...D3,
    cycle_day: 4,
    session_name: 'Piernas Frecuencia 2 (Ligero)',
    is_heavy_day: false,
    intensity_percentage: D4.intensity_percentage
  };
  return [torsoPesado, piernaPesada, torsoLigero, piernaLigera];
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
  ruleset = null,
  injuryRules = []
) {
  const muscleGroups = parseMuscleGroups(sessionConfig.muscle_groups);
  const cycleDay = sessionConfig.cycle_day;
  const volumeProfiles = ruleset?.volumeProfiles || {};
  const hasInjuryRules = Array.isArray(injuryRules) && injuryRules.length > 0;

  logger.info(`🎯 [SESSION] Generando D${cycleDay}: ${sessionConfig.session_name}`);

  const sessionExercises = [];

  // Por cada grupo muscular, seleccionar ejercicios por tipo
  for (const muscleGroup of muscleGroups) {
    const categoria = MUSCLE_TO_CATEGORY_MAP[muscleGroup] || muscleGroup;
    const profile = volumeProfiles[muscleGroup] || {};
    const setsForMuscle = Number(profile.sets ?? sessionConfig.default_sets);
    const selectedNames = new Set();
    let expectedForGroup = 0;

    const pushExercise = (ex) => {
      selectedNames.add(ex.nombre);
      sessionExercises.push({
        ...ex,
        sets_override: setsForMuscle
      });
    };

    const selectType = async (tipo, count) => {
      const safeCount = Math.max(0, Number(count || 0));
      if (safeCount === 0) return;
      expectedForGroup += safeCount;

      const selected = await selectExercisesByTypeForSession(dbClient, {
        nivel,
        categoria,
        tipo_ejercicio: tipo,
        count: safeCount,
        cycleDay,
        muscleGroup,
        excludeNames: Array.from(selectedNames),
        injuryRules
      });

      for (const ex of selected) {
        pushExercise(ex);
      }
    };

    // Multiarticulares
    await selectType('multiarticular', profile.multiarticular ?? sessionConfig.multiarticular_count);

    // Unilaterales
    await selectType('unilateral', profile.unilateral ?? sessionConfig.unilateral_count);

    // Analíticos
    await selectType('analitico', profile.analitico ?? sessionConfig.analitico_count);

    // 🩹 Relleno seguro: si el filtro de lesiones dejó el grupo corto (algún tipo
    // se vació de opciones seguras), completamos con OTROS ejercicios seguros del
    // mismo grupo (cualquier tipo), sin reintroducir contraindicados.
    if (hasInjuryRules) {
      const missing = expectedForGroup - Array.from(selectedNames).length;
      if (missing > 0) {
        const filler = await selectExercises(dbClient, {
          nivel,
          categoria,
          cantidad: missing,
          excludeNames: Array.from(selectedNames),
          injuryRules
        });
        for (const ex of filler) {
          pushExercise(ex);
        }
        const stillMissing = expectedForGroup - Array.from(selectedNames).length;
        if (stillMissing > 0) {
          logger.warn(`⚠️ [LESIONES] D${cycleDay}/${muscleGroup}: ${stillMissing} hueco(s) sin alternativa segura en el grupo`);
        }
      }
    }
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
    restSecondsByType: ruleset?.restSecondsByType || null,
    rirTarget: ruleset?.rirTarget || null
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
