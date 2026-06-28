/**
 * Servicio de selección de ejercicios para HipertrofiaV2
 * Consolida la lógica de selección que estaba duplicada en múltiples endpoints
 */

import { HIPERTROFIA_COLUMNS } from '../exerciseRepository.js';

/**
 * Selecciona ejercicios de la base de datos con filtros opcionales
 * @param {object} dbClient - Cliente de base de datos (pool o transaction)
 * @param {object} filters - Filtros de selección
 * @param {string} filters.nivel - Nivel del usuario (Principiante, Intermedio, Avanzado)
 * @param {string} filters.categoria - Categoría del ejercicio (Pecho, Espalda, etc.)
 * @param {string} [filters.tipo_ejercicio] - Tipo opcional (multiarticular, unilateral, analitico)
 * @param {number} [filters.cantidad=1] - Cantidad de ejercicios a seleccionar
 * @returns {Promise<Array>} Array de ejercicios seleccionados
 */
export async function selectExercises(dbClient, filters) {
  const { nivel, categoria, tipo_ejercicio, cantidad = 1, excludeNames = [] } = filters;

  // Comparación case-insensitive: los datos están capitalizados (Pecho, Principiante)
  // pero los callers/clientes pueden enviar minúsculas (pecho) → LOWER en ambos lados.
  let whereConditions = ['LOWER(nivel) = LOWER($1)', 'LOWER(categoria) = LOWER($2)'];
  let params = [nivel, categoria];
  let paramCount = 2;

  if (tipo_ejercicio) {
    paramCount++;
    whereConditions.push(`LOWER(tipo_ejercicio) = LOWER($${paramCount})`);
    params.push(tipo_ejercicio);
  }

  if (Array.isArray(excludeNames) && excludeNames.length > 0) {
    const placeholders = excludeNames.map((_, idx) => `$${paramCount + idx + 1}`).join(', ');
    whereConditions.push(`nombre NOT IN (${placeholders})`);
    params.push(...excludeNames);
    paramCount += excludeNames.length;
  }

  const query = `
    SELECT ${HIPERTROFIA_COLUMNS}
    FROM app.ejercicios
    WHERE disciplina = 'hipertrofia' AND ${whereConditions.join(' AND ')}
    ORDER BY RANDOM()
    LIMIT $${paramCount + 1}
  `;

  params.push(cantidad);

  const result = await dbClient.query(query, params);
  return result.rows;
}

/**
 * Selecciona ejercicios por tipo para una sesión específica
 * Utilizado en la generación D1-D5
 * @param {object} dbClient - Cliente de base de datos
 * @param {object} config - Configuración de selección
 * @param {string} config.nivel - Nivel del usuario
 * @param {string} config.categoria - Categoría del ejercicio
 * @param {string} config.tipo_ejercicio - Tipo de ejercicio
 * @param {number} config.count - Cantidad a seleccionar
 * @param {number} config.cycleDay - Día del ciclo (para tracking)
 * @param {string} config.muscleGroup - Grupo muscular
 * @returns {Promise<Array>} Ejercicios seleccionados con metadata
 */
export async function selectExercisesByTypeForSession(dbClient, config) {
  const { nivel, categoria, tipo_ejercicio, count, cycleDay, muscleGroup, excludeNames = [] } = config;

  const exercises = await selectExercises(dbClient, {
    nivel,
    categoria,
    tipo_ejercicio,
    cantidad: count,
    excludeNames
  });

  // Agregar metadata específica de la sesión
  return exercises.map(ex => ({
    ...ex,
    cycle_day: cycleDay,
    muscle_group: muscleGroup,
    tipo: tipo_ejercicio
  }));
}

/**
 * Mapea ejercicios seleccionados a formato con parámetros de entrenamiento
 * @param {Array} exercises - Ejercicios a mapear
 * @param {object} sessionConfig - Configuración de la sesión
 * @param {boolean} isFemale - Si el usuario es mujer (ajusta descansos)
 * @param {object} overrides - Overrides normativos (restos/series)
 * @returns {Array} Ejercicios con parámetros completos
 */
export function mapExercisesWithTrainingParams(exercises, sessionConfig, isFemale = false, overrides = {}) {
  const restSecondsByType = overrides?.restSecondsByType || null;

  return exercises.map((ex, idx) => ({
    orden: idx + 1,
    id: ex.exercise_id,
    exercise_id: ex.exercise_id,
    nombre: ex.nombre,
    categoria: ex.categoria,
    tipo_ejercicio: ex.tipo_ejercicio,
    patron_movimiento: ex.patron_movimiento,
    series: Number(ex.sets_override ?? sessionConfig.default_sets),
    reps_objetivo: sessionConfig.default_reps_range,
    rir_target: sessionConfig.default_rir_target,
    descanso_seg: calculateRestTime(ex, isFemale, restSecondsByType),
    notas: ex.notas,
    intensidad_porcentaje: sessionConfig.intensity_percentage,
    ajuste_sexo: isFemale && (ex.tipo_ejercicio === 'unilateral' || ex.tipo_ejercicio === 'analitico')
      ? '-15% descanso (ajuste femenino)'
      : null
  }));
}

/**
 * Calcula tiempo de descanso con ajuste por sexo
 * @param {object} exercise - Ejercicio
 * @param {boolean} isFemale - Si es mujer
 * @param {object|null} restSecondsByType - Reglas de descanso por tipo
 * @returns {number} Tiempo de descanso en segundos
 */
function calculateRestTime(exercise, isFemale, restSecondsByType = null) {
  const normativeRest = restSecondsByType?.[exercise.tipo_ejercicio];
  const baseRest = Number(normativeRest ?? exercise.descanso_seg ?? 90);

  if (isFemale && (exercise.tipo_ejercicio === 'unilateral' || exercise.tipo_ejercicio === 'analitico')) {
    return Math.round(baseRest * 0.85); // -15% para mujeres
  }

  return baseRest;
}
