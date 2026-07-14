/**
 * Repositorio central de ejercicios (tabla unificada app.ejercicios).
 *
 * Único punto de acceso a los ejercicios de entreno estándar (familia A:
 * calistenia, casa, funcional, halterofilia, heavy_duty, hipertrofia, powerlifting).
 * Centraliza el SQL que antes estaba duplicado en rutas y servicios.
 *
 * Compatibilidad: `equipamiento` se devuelve como string (igual que las tablas
 * antiguas) vía array_to_string; el id se expone como `id` (= source_exercise_id).
 */

import { pool } from '../db.js';

/**
 * Proyección canónica de un ejercicio con forma compatible con el código legacy.
 */
export const EXERCISE_COLUMNS = `
  source_exercise_id AS id,
  nombre,
  nivel,
  categoria,
  patron,
  array_to_string(equipamiento, ', ') AS equipamiento,
  series_reps_objetivo,
  descanso_seg,
  tempo,
  criterio_de_progreso,
  progresion_desde,
  progresion_hacia,
  notas,
  como_hacerlo,
  consejos,
  errores_comunes,
  gif_url
`;

/**
 * Proyección para hipertrofia: incluye los campos estructurados que usan los
 * servicios de selección y filtro menstrual. `exercise_id` se mantiene como alias
 * (= source_exercise_id) por compatibilidad con el código que lo consume.
 */
export const HIPERTROFIA_COLUMNS = `
  source_exercise_id AS exercise_id,
  nombre,
  nivel,
  categoria,
  tipo_ejercicio,
  patron_movimiento,
  orden_recomendado,
  patron,
  array_to_string(equipamiento, ', ') AS equipamiento,
  series_reps_objetivo,
  descanso_seg,
  notas,
  como_hacerlo,
  consejos,
  errores_comunes,
  gif_url
`;

/**
 * Mapea el nivel del usuario a los niveles permitidos con VENTANA DESLIZANTE:
 * cada nivel incluye el suyo y como mucho UNO por debajo (no arrastra desde
 * principiante hacia arriba). Evita que un plan avanzado reciba ejercicios
 * triviales (p.ej. "Flexiones en pared") manteniendo variedad razonable.
 *   avanzado    → ['Intermedio', 'Avanzado']
 *   intermedio  → ['Principiante', 'Intermedio']
 *   principiante→ ['Principiante']
 * Niveles reales en BD: 'Principiante', 'Intermedio', 'Avanzado'.
 * (Antes el código filtraba por 'Básico', que no existe en los datos → 0 filas.)
 * @param {string} level
 * @returns {string[]}
 */
export function allowedLevels(level) {
  const lvl = String(level || '').toLowerCase();
  if (lvl === 'avanzado') return ['Intermedio', 'Avanzado'];
  if (lvl === 'intermedio') return ['Principiante', 'Intermedio'];
  return ['Principiante'];
}

/**
 * Ejercicios aleatorios de una disciplina filtrando por nivel acumulativo.
 * @param {object} client - pool o cliente de transacción (opcional, por defecto pool)
 * @param {object} opts
 * @param {string} opts.disciplina
 * @param {string} [opts.level='principiante']
 * @param {number} [opts.limit=6]
 * @param {string} [opts.columns] - proyección SQL alternativa
 * @param {string[]} [opts.equipment] - materiales permitidos; si se pasa, solo
 *   devuelve ejercicios cuyo `equipamiento` esté contenido en la lista (filtro
 *   por material disponible, usado por Entrenamiento en Casa).
 * @returns {Promise<Array>}
 */
export async function getRandomByLevel(client, { disciplina, level = 'principiante', limit = 6, columns, equipment } = {}) {
  const db = client || pool;
  const cols = columns || 'nombre, series_reps_objetivo, criterio_de_progreso, notas, gif_url';
  const params = [disciplina, allowedLevels(level)];
  let equipmentFilter = '';
  if (Array.isArray(equipment) && equipment.length > 0) {
    params.push(equipment);
    equipmentFilter = `AND equipamiento <@ $${params.length}::text[]`;
  }
  params.push(limit);
  const { rows } = await db.query(
    `SELECT ${cols}
       FROM app.ejercicios
      WHERE disciplina = $1 AND nivel = ANY($2::text[])
      ${equipmentFilter}
      ORDER BY RANDOM()
      LIMIT $${params.length}`,
    params
  );
  return rows || [];
}

/**
 * Busca un ejercicio por su id de origen dentro de una disciplina.
 * @returns {Promise<object|null>}
 */
export async function findBySourceId(client, disciplina, sourceId) {
  const db = client || pool;
  const { rows } = await db.query(
    `SELECT ${EXERCISE_COLUMNS}
       FROM app.ejercicios
      WHERE disciplina = $1 AND source_exercise_id = $2::text
      LIMIT 1`,
    [disciplina, String(sourceId)]
  );
  return rows[0] || null;
}

/**
 * Busca un ejercicio por id de origen o por slug dentro de una disciplina.
 * @returns {Promise<object|null>}
 */
export async function findByIdOrSlug(client, disciplina, value) {
  const db = client || pool;
  const { rows } = await db.query(
    `SELECT ${EXERCISE_COLUMNS}
       FROM app.ejercicios
      WHERE disciplina = $1 AND (source_exercise_id = $2::text OR slug = $2::text)
      LIMIT 1`,
    [disciplina, String(value)]
  );
  return rows[0] || null;
}

/**
 * Cuenta ejercicios de una disciplina (opcionalmente filtrando por nivel exacto).
 * @returns {Promise<number>}
 */
export async function countByDiscipline(client, disciplina, { nivel } = {}) {
  const db = client || pool;
  const params = [disciplina];
  let where = 'disciplina = $1';
  if (nivel) {
    params.push(String(nivel).toLowerCase());
    where += ` AND LOWER(nivel) = $${params.length}`;
  }
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS total FROM app.ejercicios WHERE ${where}`,
    params
  );
  return rows[0]?.total || 0;
}
