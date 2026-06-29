/**
 * Servicio de filtrado de ejercicios según restricciones menstruales
 * Consolida la lógica de exclusión/modificación de ejercicios durante el ciclo menstrual
 */

import pool from '../../db.js';
import { HIPERTROFIA_COLUMNS } from '../exerciseRepository.js';

/**
 * Filtra ejercicios según restricciones menstruales
 * @param {Array} exercises - Ejercicios de la sesión
 * @param {Object} menstrualAdjustment - Ajuste menstrual actual del usuario
 * @returns {Promise<Array>} Ejercicios filtrados/reemplazados con metadata
 */
export async function filterMenstrualRestrictedExercises(exercises, menstrualAdjustment) {
  // Si no hay ajuste menstrual o no hay ejercicios, retornar sin cambios
  if (!menstrualAdjustment?.adjustment || !exercises || exercises.length === 0) {
    return exercises;
  }

  const type = menstrualAdjustment.adjustment?.type;
  const phase = menstrualAdjustment.phase || menstrualAdjustment.adjustment?.phase;

  // Solo aplicar filtrado en fases específicas donde hay restricciones
  const shouldFilter =
    phase === 'menstrual' ||           // Fase menstrual (día 1-5)
    type === 'late_luteal' ||          // SPM (últimos días del ciclo)
    type === 'low_impact';             // Dolor alto (pain_level >= 4)

  if (!shouldFilter) {
    return exercises;
  }

  console.log(`🔍 [MenstrualFilter] Aplicando filtrado para fase: ${phase}, tipo: ${type}`);

  // Procesar cada ejercicio y verificar restricciones
  const filteredExercises = [];

  for (const ex of exercises) {
    const restriction = await getExerciseRestriction(ex.exercise_id);

    if (restriction.menstrual_restriction === 'avoid') {
      // CASO 1: Ejercicio a EVITAR completamente
      console.log(`⚠️  [MenstrualFilter] Ejercicio a evitar: ${ex.nombre} (ID: ${ex.exercise_id})`);

      const alternative = await findAlternativeExercise(ex, restriction);

      if (alternative) {
        // Se encontró alternativa - reemplazar ejercicio
        console.log(`✅ [MenstrualFilter] Reemplazado por: ${alternative.nombre}`);
        filteredExercises.push({
          ...alternative,
          replaced: true,
          original_exercise: ex.nombre,
          original_exercise_id: ex.exercise_id,
          replacement_reason: restriction.menstrual_restriction_reason
        });
      } else {
        // NO se encontró alternativa - mostrar con advertencia crítica
        console.log(`🚨 [MenstrualFilter] No se encontró alternativa para: ${ex.nombre}`);
        filteredExercises.push({
          ...ex,
          warning_level: 'critical',
          warning_message: `⚠️ EJERCICIO NO RECOMENDADO: ${restriction.menstrual_restriction_reason}`,
          menstrual_notes: restriction.menstrual_notes
        });
      }

    } else if (restriction.menstrual_restriction === 'modify_intensity') {
      // CASO 2: Ejercicio permitido pero con REDUCCIÓN de intensidad
      console.log(`⚡ [MenstrualFilter] Modificando intensidad: ${ex.nombre} (ID: ${ex.exercise_id})`);

      filteredExercises.push({
        ...ex,
        intensidad_porcentaje: Math.round(ex.intensidad_porcentaje * 0.7), // 70% de intensidad
        warning_level: 'moderate',
        warning_message: `⚡ Intensidad reducida al 70%: ${restriction.menstrual_notes}`,
        modified_for_menstrual: true,
        menstrual_modification_reason: restriction.menstrual_restriction_reason
      });

    } else {
      // CASO 3: Sin restricción - pasar ejercicio sin cambios
      filteredExercises.push(ex);
    }
  }

  console.log(`✅ [MenstrualFilter] Filtrado completado: ${filteredExercises.length} ejercicios procesados`);

  return filteredExercises;
}

/**
 * Obtiene la restricción menstrual de un ejercicio específico
 * @param {number} exerciseId - ID del ejercicio a consultar
 * @returns {Promise<Object>} Objeto con información de restricción
 */
async function getExerciseRestriction(exerciseId) {
  const query = `
    SELECT
      menstrual_restriction,
      menstrual_restriction_reason,
      alternative_exercise_id,
      menstrual_notes
    FROM app.ejercicios
    WHERE disciplina = 'hipertrofia' AND source_exercise_id = $1::text
  `;

  try {
    const result = await pool.query(query, [exerciseId]);

    if (result.rows.length === 0) {
      // Si no existe el ejercicio, retornar sin restricción
      return { menstrual_restriction: 'none' };
    }

    return result.rows[0];
  } catch (error) {
    console.error(`❌ [MenstrualFilter] Error obteniendo restricción para ejercicio ${exerciseId}:`, error);
    // En caso de error, retornar sin restricción (fail-safe)
    return { menstrual_restriction: 'none' };
  }
}

/**
 * Busca un ejercicio alternativo seguro para reemplazar uno restringido
 * @param {Object} originalExercise - Ejercicio original a reemplazar
 * @param {Object} restriction - Objeto de restricción con info del ejercicio
 * @returns {Promise<Object|null>} Ejercicio alternativo o null si no se encuentra
 */
async function findAlternativeExercise(originalExercise, restriction) {
  try {
    // ESTRATEGIA 1: Intentar con alternativa predefinida
    if (restriction.alternative_exercise_id) {
      console.log(`🔍 [MenstrualFilter] Buscando alternativa predefinida ID: ${restriction.alternative_exercise_id}`);

      const query = `
        SELECT ${HIPERTROFIA_COLUMNS}
        FROM app.ejercicios
        WHERE disciplina = 'hipertrofia' AND source_exercise_id = $1::text
      `;

      const result = await pool.query(query, [restriction.alternative_exercise_id]);

      if (result.rows.length > 0) {
        const alt = result.rows[0];
        console.log(`✅ [MenstrualFilter] Alternativa predefinida encontrada: ${alt.nombre}`);

        // Retornar alternativa manteniendo parámetros de entrenamiento del original
        return {
          ...originalExercise,              // Mantener series, reps, intensidad, etc.
          exercise_id: alt.exercise_id,      // Nuevo ID
          nombre: alt.nombre,                // Nuevo nombre
          notas: alt.notas,                  // Nuevas notas
          como_hacerlo: alt.como_hacerlo,    // Nueva descripción
          consejos: alt.consejos,
          errores_comunes: alt.errores_comunes,
          gif_url: alt.gif_url || null
        };
      }
    }

    // ESTRATEGIA 2: Buscar automáticamente ejercicio de misma categoría SIN restricción
    console.log(`🔍 [MenstrualFilter] Buscando alternativa automática para categoría: ${originalExercise.categoria}`);

    const autoQuery = `
      SELECT ${HIPERTROFIA_COLUMNS}
      FROM app.ejercicios
      WHERE disciplina = 'hipertrofia'
        AND categoria = $1
        AND tipo_ejercicio = $2
        AND (menstrual_restriction = 'none' OR menstrual_restriction IS NULL)
        AND source_exercise_id != $3::text
      ORDER BY RANDOM()
      LIMIT 1
    `;

    const autoResult = await pool.query(autoQuery, [
      originalExercise.categoria,
      originalExercise.tipo_ejercicio,
      originalExercise.exercise_id
    ]);

    if (autoResult.rows.length > 0) {
      const alt = autoResult.rows[0];
      console.log(`✅ [MenstrualFilter] Alternativa automática encontrada: ${alt.nombre}`);

      return {
        ...originalExercise,
        exercise_id: alt.exercise_id,
        nombre: alt.nombre,
        notas: alt.notas,
        como_hacerlo: alt.como_hacerlo,
        consejos: alt.consejos,
        errores_comunes: alt.errores_comunes,
        gif_url: alt.gif_url || null,
        auto_replacement: true  // Flag para indicar que fue reemplazo automático
      };
    }

    // ESTRATEGIA 3: Buscar en misma categoría pero sin filtrar por tipo_ejercicio
    console.log(`🔍 [MenstrualFilter] Buscando alternativa flexible (misma categoría, cualquier tipo)`);

    const flexibleQuery = `
      SELECT ${HIPERTROFIA_COLUMNS}
      FROM app.ejercicios
      WHERE disciplina = 'hipertrofia'
        AND categoria = $1
        AND (menstrual_restriction = 'none' OR menstrual_restriction IS NULL)
        AND source_exercise_id != $2::text
      ORDER BY RANDOM()
      LIMIT 1
    `;

    const flexibleResult = await pool.query(flexibleQuery, [
      originalExercise.categoria,
      originalExercise.exercise_id
    ]);

    if (flexibleResult.rows.length > 0) {
      const alt = flexibleResult.rows[0];
      console.log(`✅ [MenstrualFilter] Alternativa flexible encontrada: ${alt.nombre}`);

      return {
        ...originalExercise,
        exercise_id: alt.exercise_id,
        nombre: alt.nombre,
        tipo_ejercicio: alt.tipo_ejercicio, // Actualizar tipo ya que puede ser diferente
        notas: alt.notas,
        como_hacerlo: alt.como_hacerlo,
        consejos: alt.consejos,
        errores_comunes: alt.errores_comunes,
        gif_url: alt.gif_url || null,
        auto_replacement: true,
        flexible_replacement: true  // Flag para indicar que cambió tipo de ejercicio
      };
    }

    // No se encontró ninguna alternativa
    console.log(`❌ [MenstrualFilter] No se encontró alternativa para: ${originalExercise.nombre}`);
    return null;

  } catch (error) {
    console.error(`❌ [MenstrualFilter] Error buscando alternativa:`, error);
    return null;
  }
}

/**
 * Obtiene estadísticas de restricciones aplicadas (útil para debugging)
 * @param {Array} exercises - Ejercicios filtrados
 * @returns {Object} Objeto con estadísticas de restricciones
 */
export function getMenstrualFilterStats(exercises) {
  return {
    total_replaced: exercises.filter(ex => ex.replaced).length,
    total_warnings_critical: exercises.filter(ex => ex.warning_level === 'critical').length,
    total_warnings_moderate: exercises.filter(ex => ex.warning_level === 'moderate').length,
    total_modified: exercises.filter(ex => ex.modified_for_menstrual).length,
    replaced_exercises: exercises
      .filter(ex => ex.replaced)
      .map(ex => ({
        original: ex.original_exercise,
        replacement: ex.nombre,
        auto: ex.auto_replacement || false
      })),
    warned_exercises: exercises
      .filter(ex => ex.warning_level === 'critical')
      .map(ex => ({
        name: ex.nombre,
        reason: ex.warning_message
      })),
    modified_exercises: exercises
      .filter(ex => ex.modified_for_menstrual)
      .map(ex => ({
        name: ex.nombre,
        original_intensity: Math.round(ex.intensidad_porcentaje / 0.7),
        new_intensity: ex.intensidad_porcentaje
      }))
  };
}
